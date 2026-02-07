/**
 * @description Core remediation engine for MeshCentral-ScriptTask
 * @author Enhanced by Copilot
 * @license Apache-2.0
 */

"use strict";

const WorkflowBuilder = require('./workflow-builder');
const ConditionEvaluator = require('./conditions');
const EscalationManager = require('./escalation');
const ActionHandler = require('./actions');

class RemediationEngine {
    constructor(meshServer, db, config) {
        this.meshServer = meshServer;
        this.db = db;
        this.config = config || {};
        
        this.actionHandler = new ActionHandler(meshServer, db);
        this.conditionEvaluator = new ConditionEvaluator();
        this.escalationManager = new EscalationManager(db, this.actionHandler);
        
        this.activeExecutions = new Map(); // executionId -> execution data
        this.stepTimers = new Map(); // executionId -> { stepId -> timer }
    }
    
    /**
     * Initialize the remediation engine
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            console.log('ScriptTask RemediationEngine: Initializing engine');
            
            // Load quarantined nodes from database
            const quarantined = await this.db.scriptFile.find({
                type: 'node_quarantine',
                active: true
            }).toArray();
            
            for (const record of quarantined) {
                this.actionHandler.quarantinedNodes.add(record.nodeId);
            }
            
            console.log(`ScriptTask RemediationEngine: Loaded ${quarantined.length} quarantined nodes`);
            
            // Resume any in-progress executions
            const inProgress = await this.db.scriptFile.find({
                type: 'remediation_execution',
                status: 'running'
            }).toArray();
            
            console.log(`ScriptTask RemediationEngine: Found ${inProgress.length} in-progress executions`);
            
            for (const execution of inProgress) {
                // Mark as failed if they were interrupted
                await this.completeExecution(execution, 'failed', 'Engine restart - execution interrupted');
            }
            
            console.log('ScriptTask RemediationEngine: Initialization complete');
        } catch (e) {
            console.error('ScriptTask RemediationEngine: Error during initialization', e);
            throw e;
        }
    }
    
    /**
     * Trigger workflow execution
     * @param {String} workflowId - Workflow ID to execute
     * @param {String} nodeId - Target node ID
     * @param {String} triggeredBy - User/system that triggered workflow
     * @param {Object} context - Additional context data
     * @returns {Promise<Object>} - Execution record
     */
    async triggerWorkflow(workflowId, nodeId, triggeredBy, context = {}) {
        try {
            console.log(`ScriptTask RemediationEngine: Triggering workflow ${workflowId} for node ${nodeId}`);
            
            // Load workflow definition
            const workflow = await this.db.scriptFile.findOne({
                _id: this.db.formatId(workflowId),
                type: 'remediation_workflow'
            });
            
            if (!workflow) {
                throw new Error(`Workflow ${workflowId} not found`);
            }
            
            if (!workflow.enabled) {
                throw new Error(`Workflow ${workflowId} is disabled`);
            }
            
            // Check if node is already being remediated
            const existing = await this.db.scriptFile.findOne({
                type: 'remediation_execution',
                workflowId: workflowId,
                nodeId: nodeId,
                status: 'running'
            });
            
            if (existing) {
                console.log(`ScriptTask RemediationEngine: Workflow already running for node ${nodeId}`);
                return existing;
            }
            
            // Validate workflow
            const builder = new WorkflowBuilder(workflow);
            const validation = builder.validateWorkflow();
            
            if (!validation.valid) {
                throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
            }
            
            // Create execution record
            const execution = {
                type: 'remediation_execution',
                workflowId: workflowId,
                workflowName: workflow.name,
                nodeId: nodeId,
                status: 'running',
                currentStep: workflow.startStep,
                triggeredBy: triggeredBy,
                triggerType: context.triggerType || 'manual',
                startTime: Date.now(),
                endTime: null,
                stepResults: [],
                context: context,
                alerts: []
            };
            
            const result = await this.db.scriptFile.insertOne(execution);
            execution._id = result.insertedId;
            
            console.log(`ScriptTask RemediationEngine: Created execution ${execution._id}`);
            
            // Store in active executions
            this.activeExecutions.set(execution._id.toString(), execution);
            
            // Start workflow execution asynchronously
            this.executeWorkflow(execution, workflow).catch(e => {
                console.error('ScriptTask RemediationEngine: Unhandled error in workflow execution', e);
                this.completeExecution(execution, 'failed', e.message);
            });
            
            return execution;
        } catch (e) {
            console.error('ScriptTask RemediationEngine: Error triggering workflow', e);
            throw e;
        }
    }
    
    /**
     * Execute workflow steps
     * @param {Object} execution - Execution record
     * @param {Object} workflow - Workflow definition
     * @returns {Promise<void>}
     */
    async executeWorkflow(execution, workflow) {
        try {
            console.log(`ScriptTask RemediationEngine: Starting workflow execution ${execution._id}`);
            
            let currentStepId = execution.currentStep;
            
            while (currentStepId) {
                // Check if execution was cancelled
                const currentExecution = await this.db.scriptFile.findOne({
                    _id: execution._id,
                    type: 'remediation_execution'
                });
                
                if (!currentExecution || currentExecution.status === 'cancelled') {
                    console.log(`ScriptTask RemediationEngine: Execution ${execution._id} was cancelled`);
                    return;
                }
                
                // Find step definition
                const step = workflow.steps.find(s => s.id === currentStepId);
                
                if (!step) {
                    throw new Error(`Step ${currentStepId} not found in workflow`);
                }
                
                console.log(`ScriptTask RemediationEngine: Executing step ${step.id} (${step.type})`);
                
                // Execute step
                const stepResult = await this.executeStep(execution, workflow, step);
                
                // Handle step result
                const nextStepId = await this.handleStepResult(execution, workflow, step, stepResult);
                
                // Update current step
                currentStepId = nextStepId;
                
                // Update execution in database
                await this.db.scriptFile.updateOne(
                    { _id: execution._id },
                    { 
                        $set: { 
                            currentStep: currentStepId,
                            stepResults: execution.stepResults
                        } 
                    }
                );
            }
            
            // Workflow completed successfully
            console.log(`ScriptTask RemediationEngine: Workflow completed successfully for execution ${execution._id}`);
            await this.completeExecution(execution, 'success');
        } catch (e) {
            console.error(`ScriptTask RemediationEngine: Error executing workflow ${execution._id}`, e);
            await this.completeExecution(execution, 'failed', e.message);
        }
    }
    
    /**
     * Execute a single workflow step
     * @param {Object} execution - Execution record
     * @param {Object} workflow - Workflow definition
     * @param {Object} step - Step definition
     * @returns {Promise<Object>} - Step result
     */
    async executeStep(execution, workflow, step) {
        const startTime = Date.now();
        
        try {
            // Set timeout for step
            const timeout = step.timeout || 300;
            const timeoutPromise = new Promise((_, reject) => {
                const timer = setTimeout(() => {
                    reject(new Error(`Step ${step.id} timed out after ${timeout}s`));
                }, timeout * 1000);
                
                // Store timer for cleanup
                if (!this.stepTimers.has(execution._id.toString())) {
                    this.stepTimers.set(execution._id.toString(), new Map());
                }
                this.stepTimers.get(execution._id.toString()).set(step.id, timer);
            });
            
            // Execute step based on type
            let executionPromise;
            
            switch (step.type) {
                case 'script':
                    executionPromise = this.executeScriptStep(execution, workflow, step);
                    break;
                
                case 'webhook':
                    executionPromise = this.executeWebhookStep(execution, workflow, step);
                    break;
                
                case 'email':
                    executionPromise = this.executeEmailStep(execution, workflow, step);
                    break;
                
                case 'delay':
                    executionPromise = this.executeDelayStep(execution, workflow, step);
                    break;
                
                case 'condition':
                    executionPromise = this.executeConditionStep(execution, workflow, step);
                    break;
                
                default:
                    throw new Error(`Unknown step type: ${step.type}`);
            }
            
            // Race between execution and timeout
            const result = await Promise.race([executionPromise, timeoutPromise]);
            
            // Clear timeout
            this.clearStepTimer(execution._id.toString(), step.id);
            
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;
            
            console.log(`ScriptTask RemediationEngine: Step ${step.id} completed in ${duration}s`);
            
            return {
                ...result,
                startTime: startTime,
                endTime: endTime,
                duration: duration
            };
        } catch (e) {
            // Clear timeout on error
            this.clearStepTimer(execution._id.toString(), step.id);
            
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;
            
            console.error(`ScriptTask RemediationEngine: Step ${step.id} failed`, e);
            
            return await this.handleStepFailure(execution, workflow, step, {
                status: 'failed',
                error: e.message,
                startTime: startTime,
                endTime: endTime,
                duration: duration
            });
        }
    }
    
    /**
     * Execute script step
     * @param {Object} execution
     * @param {Object} workflow
     * @param {Object} step
     * @returns {Promise<Object>}
     */
    async executeScriptStep(execution, workflow, step) {
        try {
            const scriptId = step.scriptId;
            
            if (!scriptId) {
                throw new Error('Script step missing scriptId');
            }
            
            // Create job in database
            const nowTime = Math.floor(Date.now() / 1000);
            const jobData = {
                type: 'job',
                scriptId: scriptId,
                node: execution.nodeId,
                state: 'pending',
                queueTime: nowTime,
                priority: step.priority || 'normal',
                remediationExecutionId: execution._id.toString(),
                remediationStepId: step.id,
                tags: ['remediation'],
                metadata: {
                    workflowId: workflow._id.toString(),
                    workflowName: workflow.name,
                    stepName: step.name || step.id
                }
            };
            
            const result = await this.db.scriptFile.insertOne(jobData);
            const jobId = result.insertedId;
            
            console.log(`ScriptTask RemediationEngine: Created job ${jobId} for script step ${step.id}`);
            
            // Wait for job completion
            const jobResult = await this.waitForJobCompletion(jobId, step.timeout || 300);
            
            return {
                status: jobResult.state === 'complete' ? 'success' : 'failed',
                jobId: jobId.toString(),
                exitCode: jobResult.exitCode,
                output: jobResult.result,
                stdout: jobResult.stdout,
                stderr: jobResult.stderr
            };
        } catch (e) {
            console.error('ScriptTask RemediationEngine: Error executing script step', e);
            throw e;
        }
    }
    
    /**
     * Wait for job completion
     * @param {String} jobId
     * @param {Number} timeout - Timeout in seconds
     * @returns {Promise<Object>}
     */
    async waitForJobCompletion(jobId, timeout) {
        const startTime = Date.now();
        const timeoutMs = timeout * 1000;
        
        while (true) {
            const job = await this.db.scriptFile.findOne({
                _id: jobId,
                type: 'job'
            });
            
            if (!job) {
                throw new Error(`Job ${jobId} not found`);
            }
            
            if (job.state === 'complete' || job.state === 'error') {
                return job;
            }
            
            // Check timeout
            if (Date.now() - startTime > timeoutMs) {
                throw new Error(`Job ${jobId} timed out`);
            }
            
            // Wait before checking again
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    /**
     * Execute webhook step
     * @param {Object} execution
     * @param {Object} workflow
     * @param {Object} step
     * @returns {Promise<Object>}
     */
    async executeWebhookStep(execution, workflow, step) {
        try {
            const config = {
                url: step.url,
                method: step.method,
                headers: step.headers,
                type: step.webhookType
            };
            
            const result = await this.actionHandler.sendWebhook(config, execution, workflow);
            
            return {
                status: result.success ? 'success' : 'failed',
                webhookStatus: result.status,
                error: result.error
            };
        } catch (e) {
            console.error('ScriptTask RemediationEngine: Error executing webhook step', e);
            throw e;
        }
    }
    
    /**
     * Execute email step
     * @param {Object} execution
     * @param {Object} workflow
     * @param {Object} step
     * @returns {Promise<Object>}
     */
    async executeEmailStep(execution, workflow, step) {
        try {
            const config = {
                to: step.to,
                subject: step.subject,
                body: step.body
            };
            
            const result = await this.actionHandler.sendEmail(config, execution, workflow);
            
            return {
                status: result.success ? 'success' : 'failed',
                messageId: result.messageId,
                error: result.error
            };
        } catch (e) {
            console.error('ScriptTask RemediationEngine: Error executing email step', e);
            throw e;
        }
    }
    
    /**
     * Execute delay step
     * @param {Object} execution
     * @param {Object} workflow
     * @param {Object} step
     * @returns {Promise<Object>}
     */
    async executeDelayStep(execution, workflow, step) {
        try {
            const delaySeconds = step.duration || 60;
            
            console.log(`ScriptTask RemediationEngine: Delaying for ${delaySeconds}s`);
            
            await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
            
            return {
                status: 'success',
                delaySeconds: delaySeconds
            };
        } catch (e) {
            console.error('ScriptTask RemediationEngine: Error executing delay step', e);
            throw e;
        }
    }
    
    /**
     * Execute condition step
     * @param {Object} execution
     * @param {Object} workflow
     * @param {Object} step
     * @returns {Promise<Object>}
     */
    async executeConditionStep(execution, workflow, step) {
        try {
            // Get previous step result for evaluation
            const previousStepResult = execution.stepResults.length > 0 
                ? execution.stepResults[execution.stepResults.length - 1]
                : null;
            
            if (!previousStepResult) {
                console.log('ScriptTask RemediationEngine: No previous step result for condition evaluation');
                return {
                    status: 'success',
                    conditionResult: false
                };
            }
            
            // Evaluate condition
            const conditionResult = this.conditionEvaluator.evaluate(
                step.condition,
                previousStepResult
            );
            
            console.log(`ScriptTask RemediationEngine: Condition evaluated to ${conditionResult}`);
            
            return {
                status: 'success',
                conditionResult: conditionResult
            };
        } catch (e) {
            console.error('ScriptTask RemediationEngine: Error executing condition step', e);
            throw e;
        }
    }
    
    /**
     * Handle step result and determine next step
     * @param {Object} execution
     * @param {Object} workflow
     * @param {Object} step
     * @param {Object} result
     * @returns {Promise<String|null>} - Next step ID or null if workflow complete
     */
    async handleStepResult(execution, workflow, step, result) {
        try {
            // Record step result
            const stepResult = {
                stepId: step.id,
                stepName: step.name || step.id,
                stepType: step.type,
                status: result.status,
                startTime: result.startTime,
                endTime: result.endTime,
                duration: result.duration,
                output: result.output,
                error: result.error,
                retryCount: result.retryCount || 0
            };
            
            execution.stepResults.push(stepResult);
            
            // Determine next step based on result
            let nextStepId = null;
            
            if (step.type === 'condition') {
                // For condition steps, use onTrue/onFalse
                nextStepId = result.conditionResult ? step.onTrue : step.onFalse;
            } else {
                // For other steps, use onSuccess/onFailure
                if (result.status === 'success') {
                    nextStepId = step.onSuccess || null;
                } else {
                    nextStepId = step.onFailure || null;
                    
                    // If no explicit failure path and escalation enabled, trigger escalation
                    if (!nextStepId && workflow.escalationEnabled) {
                        console.log('ScriptTask RemediationEngine: Triggering escalation due to step failure');
                        await this.escalationManager.escalate(execution, workflow);
                    }
                }
            }
            
            console.log(`ScriptTask RemediationEngine: Next step: ${nextStepId || 'none (end of workflow)'}`);
            
            return nextStepId;
        } catch (e) {
            console.error('ScriptTask RemediationEngine: Error handling step result', e);
            throw e;
        }
    }
    
    /**
     * Handle step failure with retry logic
     * @param {Object} execution
     * @param {Object} workflow
     * @param {Object} step
     * @param {Object} error
     * @returns {Promise<Object>}
     */
    async handleStepFailure(execution, workflow, step, error) {
        try {
            console.log(`ScriptTask RemediationEngine: Handling failure for step ${step.id}`);
            
            // Check if retry is possible
            const retryDecision = await this.escalationManager.handleStepFailure(
                execution,
                step,
                error
            );
            
            if (retryDecision.shouldRetry) {
                // Schedule retry
                console.log(`ScriptTask RemediationEngine: Scheduling retry in ${retryDecision.delay}s`);
                
                await new Promise(resolve => setTimeout(resolve, retryDecision.delay * 1000));
                
                // Update retry count
                const stepResult = execution.stepResults.find(r => r.stepId === step.id);
                const retryCount = stepResult ? (stepResult.retryCount || 0) + 1 : 1;
                
                // Retry step execution
                return await this.executeStep(execution, workflow, step);
            }
            
            // No retry, return failure
            return {
                ...error,
                status: 'failed',
                retryCount: error.retryCount || 0
            };
        } catch (e) {
            console.error('ScriptTask RemediationEngine: Error handling step failure', e);
            return {
                ...error,
                status: 'failed',
                additionalError: e.message
            };
        }
    }
    
    /**
     * Complete execution
     * @param {Object} execution - Execution record
     * @param {String} status - Final status (success, failed, cancelled)
     * @param {String} reason - Reason for status
     * @returns {Promise<void>}
     */
    async completeExecution(execution, status, reason = null) {
        try {
            const endTime = Date.now();
            const duration = (endTime - execution.startTime) / 1000;
            
            console.log(`ScriptTask RemediationEngine: Completing execution ${execution._id} with status: ${status}`);
            
            // Update execution in database
            await this.db.scriptFile.updateOne(
                { _id: execution._id },
                {
                    $set: {
                        status: status,
                        endTime: endTime,
                        duration: duration,
                        completionReason: reason
                    }
                }
            );
            
            // Remove from active executions
            this.activeExecutions.delete(execution._id.toString());
            
            // Clear any remaining timers
            if (this.stepTimers.has(execution._id.toString())) {
                const timers = this.stepTimers.get(execution._id.toString());
                for (const [stepId, timer] of timers.entries()) {
                    clearTimeout(timer);
                }
                this.stepTimers.delete(execution._id.toString());
            }
            
            // If workflow failed and rollback is enabled, perform rollback
            if (status === 'failed') {
                const workflow = await this.db.scriptFile.findOne({
                    _id: this.db.formatId(execution.workflowId),
                    type: 'remediation_workflow'
                });
                
                if (workflow && workflow.rollbackEnabled) {
                    console.log('ScriptTask RemediationEngine: Performing rollback due to workflow failure');
                    await this.actionHandler.performRollback(execution._id.toString());
                }
            }
            
            console.log(`ScriptTask RemediationEngine: Execution ${execution._id} completed in ${duration}s`);
        } catch (e) {
            console.error('ScriptTask RemediationEngine: Error completing execution', e);
        }
    }
    
    /**
     * Cancel execution
     * @param {String} executionId - Execution ID to cancel
     * @returns {Promise<Object>}
     */
    async cancelExecution(executionId) {
        try {
            console.log(`ScriptTask RemediationEngine: Cancelling execution ${executionId}`);
            
            const execution = await this.db.scriptFile.findOne({
                _id: this.db.formatId(executionId),
                type: 'remediation_execution'
            });
            
            if (!execution) {
                return { success: false, reason: 'Execution not found' };
            }
            
            if (execution.status !== 'running') {
                return { success: false, reason: `Execution is ${execution.status}, cannot cancel` };
            }
            
            // Update status to cancelled
            await this.completeExecution(execution, 'cancelled', 'Cancelled by user');
            
            // Cancel any pending jobs for this execution
            await this.db.scriptFile.updateMany(
                { 
                    type: 'job',
                    remediationExecutionId: executionId,
                    state: 'pending'
                },
                {
                    $set: {
                        state: 'cancelled',
                        cancelledReason: 'Remediation execution cancelled'
                    }
                }
            );
            
            console.log(`ScriptTask RemediationEngine: Execution ${executionId} cancelled successfully`);
            
            return { success: true, message: 'Execution cancelled' };
        } catch (e) {
            console.error('ScriptTask RemediationEngine: Error cancelling execution', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Get execution details
     * @param {String} executionId - Execution ID
     * @returns {Promise<Object|null>}
     */
    async getExecution(executionId) {
        try {
            const execution = await this.db.scriptFile.findOne({
                _id: this.db.formatId(executionId),
                type: 'remediation_execution'
            });
            
            return execution;
        } catch (e) {
            console.error('ScriptTask RemediationEngine: Error getting execution', e);
            return null;
        }
    }
    
    /**
     * List executions with filters
     * @param {Object} filters - Query filters
     * @returns {Promise<Array>}
     */
    async listExecutions(filters = {}) {
        try {
            const query = { type: 'remediation_execution' };
            
            // Apply filters
            if (filters.workflowId) {
                query.workflowId = filters.workflowId;
            }
            
            if (filters.nodeId) {
                query.nodeId = filters.nodeId;
            }
            
            if (filters.status) {
                query.status = filters.status;
            }
            
            if (filters.triggeredBy) {
                query.triggeredBy = filters.triggeredBy;
            }
            
            if (filters.startTime) {
                query.startTime = { $gte: filters.startTime };
            }
            
            // Build sort
            const sort = {};
            if (filters.sortBy) {
                sort[filters.sortBy] = filters.sortOrder === 'asc' ? 1 : -1;
            } else {
                sort.startTime = -1; // Default sort by most recent
            }
            
            // Apply pagination
            const limit = filters.limit || 50;
            const skip = filters.skip || 0;
            
            const executions = await this.db.scriptFile
                .find(query)
                .sort(sort)
                .limit(limit)
                .skip(skip)
                .toArray();
            
            return executions;
        } catch (e) {
            console.error('ScriptTask RemediationEngine: Error listing executions', e);
            return [];
        }
    }
    
    /**
     * Clear step timer
     * @param {String} executionId
     * @param {String} stepId
     */
    clearStepTimer(executionId, stepId) {
        if (this.stepTimers.has(executionId)) {
            const timers = this.stepTimers.get(executionId);
            if (timers.has(stepId)) {
                clearTimeout(timers.get(stepId));
                timers.delete(stepId);
            }
        }
    }
}

module.exports = RemediationEngine;

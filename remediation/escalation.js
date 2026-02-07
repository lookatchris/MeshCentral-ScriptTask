/**
 * @description Escalation policies and retry logic for MeshCentral-ScriptTask
 * @author Enhanced by Copilot
 * @license Apache-2.0
 */

"use strict";

class EscalationManager {
    constructor(db, actionHandler) {
        this.db = db;
        this.actionHandler = actionHandler;
        this.retryTimers = new Map(); // executionId -> timer
    }
    
    /**
     * Handle step failure with retry logic
     * @param {Object} execution - Remediation execution
     * @param {Object} step - Workflow step
     * @param {Object} error - Error details
     * @returns {Promise<Object>} - { shouldRetry: boolean, delay: number }
     */
    async handleStepFailure(execution, step, error) {
        try {
            const retryPolicy = step.retryPolicy || {};
            const maxAttempts = retryPolicy.maxAttempts || 3;
            const backoffType = retryPolicy.backoffType || 'exponential';
            const baseDelay = retryPolicy.delaySeconds || 60;
            
            // Get current step result
            const stepResult = execution.stepResults.find(r => r.stepId === step.id);
            const retryCount = stepResult ? stepResult.retryCount || 0 : 0;
            
            if (retryCount >= maxAttempts) {
                console.log(`ScriptTask Escalation: Max retry attempts (${maxAttempts}) reached for step ${step.id}`);
                return { shouldRetry: false, delay: 0 };
            }
            
            // Calculate delay based on backoff type
            let delay = baseDelay;
            if (backoffType === 'exponential') {
                delay = baseDelay * Math.pow(2, retryCount);
            } else if (backoffType === 'linear') {
                delay = baseDelay * (retryCount + 1);
            }
            
            // Cap maximum delay at 1 hour
            delay = Math.min(delay, 3600);
            
            console.log(`ScriptTask Escalation: Scheduling retry for step ${step.id} in ${delay}s (attempt ${retryCount + 1}/${maxAttempts})`);
            
            return { shouldRetry: true, delay: delay };
        } catch (e) {
            console.error('ScriptTask Escalation: Error handling step failure', e);
            return { shouldRetry: false, delay: 0 };
        }
    }
    
    /**
     * Escalate to next tier
     * @param {Object} execution - Remediation execution
     * @param {Object} workflow - Workflow definition
     * @returns {Promise<Object>}
     */
    async escalate(execution, workflow) {
        try {
            console.log(`ScriptTask Escalation: Escalating execution ${execution._id}`);
            
            // Get escalation policy
            const policy = await this.getEscalationPolicy(workflow.escalationPolicyId);
            
            if (!policy) {
                console.log('ScriptTask Escalation: No escalation policy defined');
                await this.sendAdminAlert(execution, workflow, 'No escalation policy');
                return { success: false, reason: 'No escalation policy' };
            }
            
            // Execute escalation tiers
            for (let i = 0; i < policy.tiers.length; i++) {
                const tier = policy.tiers[i];
                console.log(`ScriptTask Escalation: Executing tier ${i + 1}: ${tier.type}`);
                
                const result = await this.executeTier(tier, execution, workflow);
                
                if (result.success) {
                    console.log(`ScriptTask Escalation: Tier ${i + 1} succeeded`);
                    
                    // Update execution with escalation info
                    await this.db.scriptFile.updateOne(
                        { _id: execution._id, type: 'remediation_execution' },
                        {
                            $push: {
                                alerts: {
                                    type: 'escalation',
                                    message: `Escalated to tier ${i + 1}: ${tier.type}`,
                                    timestamp: Date.now(),
                                    tier: i + 1
                                }
                            }
                        }
                    );
                    
                    return { success: true, tier: i + 1 };
                }
                
                console.log(`ScriptTask Escalation: Tier ${i + 1} failed, trying next tier`);
            }
            
            // All tiers failed, send admin alert
            console.log('ScriptTask Escalation: All escalation tiers failed');
            await this.sendAdminAlert(execution, workflow, 'All escalation tiers failed');
            
            return { success: false, reason: 'All tiers failed' };
        } catch (e) {
            console.error('ScriptTask Escalation: Error during escalation', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Get escalation policy
     * @param {String} policyId
     * @returns {Promise<Object>}
     */
    async getEscalationPolicy(policyId) {
        if (!policyId) return null;
        
        try {
            const policy = await this.db.scriptFile.findOne({
                _id: this.db.formatId(policyId),
                type: 'escalation_policy'
            });
            
            return policy;
        } catch (e) {
            console.error('ScriptTask Escalation: Error fetching policy', e);
            return null;
        }
    }
    
    /**
     * Execute escalation tier
     * @param {Object} tier
     * @param {Object} execution
     * @param {Object} workflow
     * @returns {Promise<Object>}
     */
    async executeTier(tier, execution, workflow) {
        try {
            switch (tier.type) {
                case 'runScript':
                    return await this.runAlternativeScript(tier, execution);
                
                case 'webhook':
                    return await this.actionHandler.sendWebhook(tier.config, execution, workflow);
                
                case 'email':
                    return await this.actionHandler.sendEmail(tier.config, execution, workflow);
                
                case 'quarantine':
                    return await this.actionHandler.quarantineNode(execution.nodeId);
                
                case 'customAction':
                    return await this.executeCustomAction(tier.config, execution);
                
                default:
                    console.error(`ScriptTask Escalation: Unknown tier type: ${tier.type}`);
                    return { success: false, reason: 'Unknown tier type' };
            }
        } catch (e) {
            console.error('ScriptTask Escalation: Error executing tier', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Run alternative script as escalation
     * @param {Object} tier
     * @param {Object} execution
     * @returns {Promise<Object>}
     */
    async runAlternativeScript(tier, execution) {
        try {
            const scriptId = tier.scriptId;
            if (!scriptId) {
                return { success: false, reason: 'No script ID specified' };
            }
            
            // Create a new job for the alternative script
            const nowTime = Math.floor(Date.now() / 1000);
            const jobData = {
                type: 'job',
                scriptId: scriptId,
                node: execution.nodeId,
                state: 'pending',
                queueTime: nowTime,
                priority: 'high',
                remediationExecutionId: execution._id.toString(),
                tags: ['escalation', 'remediation'],
                metadata: {
                    reason: 'Escalation from failed remediation',
                    originalWorkflowId: execution.workflowId
                }
            };
            
            const result = await this.db.scriptFile.insertOne(jobData);
            
            return { 
                success: true, 
                jobId: result.insertedId.toString(),
                message: 'Alternative script queued for execution'
            };
        } catch (e) {
            console.error('ScriptTask Escalation: Error running alternative script', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Execute custom action
     * @param {Object} config
     * @param {Object} execution
     * @returns {Promise<Object>}
     */
    async executeCustomAction(config, execution) {
        // Placeholder for custom action execution
        // This could be extended to support custom JavaScript functions
        console.log('ScriptTask Escalation: Custom action execution not yet implemented');
        return { success: false, reason: 'Custom actions not implemented' };
    }
    
    /**
     * Send alert to administrators
     * @param {Object} execution
     * @param {Object} workflow
     * @param {String} reason
     * @returns {Promise<void>}
     */
    async sendAdminAlert(execution, workflow, reason) {
        try {
            const alert = {
                type: 'admin_alert',
                severity: 'critical',
                title: `Remediation Workflow Failed: ${workflow.name}`,
                message: `Workflow '${workflow.name}' failed for node ${execution.nodeId}. Reason: ${reason}`,
                executionId: execution._id.toString(),
                workflowId: workflow._id.toString(),
                nodeId: execution.nodeId,
                timestamp: Date.now()
            };
            
            // Store alert in database
            await this.db.scriptFile.insertOne({
                type: 'alert',
                ...alert
            });
            
            // Update execution with alert
            await this.db.scriptFile.updateOne(
                { _id: execution._id, type: 'remediation_execution' },
                {
                    $push: {
                        alerts: {
                            type: 'admin_alert',
                            message: alert.message,
                            timestamp: alert.timestamp
                        }
                    }
                }
            );
            
            // Send notification via action handler if available
            if (this.actionHandler) {
                await this.actionHandler.sendAdminNotification(alert);
            }
            
            console.log('ScriptTask Escalation: Admin alert sent');
        } catch (e) {
            console.error('ScriptTask Escalation: Error sending admin alert', e);
        }
    }
    
    /**
     * Create escalation policy
     * @param {Object} policyData
     * @returns {Promise<Object>}
     */
    async createEscalationPolicy(policyData) {
        try {
            const policy = {
                type: 'escalation_policy',
                name: policyData.name,
                description: policyData.description || '',
                tiers: policyData.tiers || [],
                createdBy: policyData.createdBy || 'system',
                createdAt: Date.now()
            };
            
            const result = await this.db.scriptFile.insertOne(policy);
            return { success: true, id: result.insertedId.toString() };
        } catch (e) {
            console.error('ScriptTask Escalation: Error creating policy', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Schedule retry for a step
     * @param {String} executionId
     * @param {String} stepId
     * @param {Number} delaySeconds
     * @param {Function} retryCallback
     */
    scheduleRetry(executionId, stepId, delaySeconds, retryCallback) {
        const key = `${executionId}_${stepId}`;
        
        // Clear existing timer if any
        if (this.retryTimers.has(key)) {
            clearTimeout(this.retryTimers.get(key));
        }
        
        // Schedule new retry
        const timer = setTimeout(() => {
            this.retryTimers.delete(key);
            retryCallback();
        }, delaySeconds * 1000);
        
        this.retryTimers.set(key, timer);
    }
    
    /**
     * Cancel scheduled retries for an execution
     * @param {String} executionId
     */
    cancelRetries(executionId) {
        for (const [key, timer] of this.retryTimers.entries()) {
            if (key.startsWith(executionId)) {
                clearTimeout(timer);
                this.retryTimers.delete(key);
            }
        }
    }
    
    /**
     * Cleanup
     */
    cleanup() {
        // Clear all retry timers
        for (const timer of this.retryTimers.values()) {
            clearTimeout(timer);
        }
        this.retryTimers.clear();
    }
}

module.exports = EscalationManager;

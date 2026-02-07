/**
 * @description Action handlers for MeshCentral-ScriptTask remediation
 * @author Enhanced by Copilot
 * @license Apache-2.0
 */

"use strict";

const axios = require('axios');

class ActionHandler {
    constructor(meshServer, db) {
        this.meshServer = meshServer;
        this.db = db;
        this.quarantinedNodes = new Set();
    }
    
    /**
     * Send webhook notification
     * @param {Object} config - Webhook configuration
     * @param {Object} execution - Remediation execution
     * @param {Object} workflow - Workflow definition
     * @returns {Promise<Object>}
     */
    async sendWebhook(config, execution, workflow) {
        try {
            const url = config.url;
            const method = config.method || 'POST';
            const headers = config.headers || { 'Content-Type': 'application/json' };
            
            // Build payload
            const payload = this.buildWebhookPayload(config, execution, workflow);
            
            console.log(`ScriptTask Actions: Sending webhook to ${url}`);
            
            const response = await axios({
                method: method,
                url: url,
                headers: headers,
                data: payload,
                timeout: 10000
            });
            
            if (response.status >= 200 && response.status < 300) {
                console.log(`ScriptTask Actions: Webhook sent successfully (${response.status})`);
                return { success: true, status: response.status };
            } else {
                console.error(`ScriptTask Actions: Webhook failed with status ${response.status}`);
                return { success: false, status: response.status };
            }
        } catch (e) {
            console.error('ScriptTask Actions: Error sending webhook', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Build webhook payload based on type
     * @param {Object} config
     * @param {Object} execution
     * @param {Object} workflow
     * @returns {Object}
     */
    buildWebhookPayload(config, execution, workflow) {
        const type = config.type || 'generic';
        const baseInfo = {
            workflowName: workflow.name,
            nodeId: execution.nodeId,
            status: execution.status,
            timestamp: Date.now()
        };
        
        switch (type) {
            case 'slack':
                return this.buildSlackPayload(config, execution, workflow, baseInfo);
            
            case 'teams':
                return this.buildTeamsPayload(config, execution, workflow, baseInfo);
            
            case 'discord':
                return this.buildDiscordPayload(config, execution, workflow, baseInfo);
            
            case 'generic':
            default:
                return {
                    ...baseInfo,
                    executionId: execution._id.toString(),
                    workflowId: workflow._id.toString(),
                    stepResults: execution.stepResults
                };
        }
    }
    
    /**
     * Build Slack message payload
     */
    buildSlackPayload(config, execution, workflow, baseInfo) {
        const color = execution.status === 'success' ? 'good' : 'danger';
        
        return {
            text: `Remediation Workflow: ${workflow.name}`,
            attachments: [{
                color: color,
                fields: [
                    { title: 'Status', value: execution.status, short: true },
                    { title: 'Node ID', value: execution.nodeId, short: true },
                    { title: 'Workflow', value: workflow.name, short: false },
                    { title: 'Started', value: new Date(execution.startedAt).toISOString(), short: true },
                    { title: 'Completed', value: execution.completedAt ? new Date(execution.completedAt).toISOString() : 'In Progress', short: true }
                ]
            }]
        };
    }
    
    /**
     * Build Microsoft Teams message payload
     */
    buildTeamsPayload(config, execution, workflow, baseInfo) {
        const color = execution.status === 'success' ? '00ff00' : 'ff0000';
        
        return {
            '@type': 'MessageCard',
            '@context': 'https://schema.org/extensions',
            summary: `Remediation: ${workflow.name}`,
            themeColor: color,
            title: `Remediation Workflow: ${workflow.name}`,
            sections: [{
                facts: [
                    { name: 'Status', value: execution.status },
                    { name: 'Node ID', value: execution.nodeId },
                    { name: 'Started', value: new Date(execution.startedAt).toISOString() },
                    { name: 'Completed', value: execution.completedAt ? new Date(execution.completedAt).toISOString() : 'In Progress' }
                ]
            }]
        };
    }
    
    /**
     * Build Discord message payload
     */
    buildDiscordPayload(config, execution, workflow, baseInfo) {
        const color = execution.status === 'success' ? 0x00ff00 : 0xff0000;
        
        return {
            embeds: [{
                title: `Remediation Workflow: ${workflow.name}`,
                color: color,
                fields: [
                    { name: 'Status', value: execution.status, inline: true },
                    { name: 'Node ID', value: execution.nodeId, inline: true },
                    { name: 'Started', value: new Date(execution.startedAt).toISOString(), inline: true },
                    { name: 'Completed', value: execution.completedAt ? new Date(execution.completedAt).toISOString() : 'In Progress', inline: true }
                ],
                timestamp: new Date().toISOString()
            }]
        };
    }
    
    /**
     * Send email notification
     * @param {Object} config - Email configuration
     * @param {Object} execution - Remediation execution
     * @param {Object} workflow - Workflow definition
     * @returns {Promise<Object>}
     */
    async sendEmail(config, execution, workflow) {
        try {
            console.log('ScriptTask Actions: Email notifications not yet implemented');
            
            // Placeholder - would need SMTP configuration
            // In a real implementation, this would use nodemailer or similar
            
            return { success: false, reason: 'Email not implemented' };
        } catch (e) {
            console.error('ScriptTask Actions: Error sending email', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Quarantine a node (prevent it from running jobs)
     * @param {String} nodeId
     * @returns {Promise<Object>}
     */
    async quarantineNode(nodeId) {
        try {
            console.log(`ScriptTask Actions: Quarantining node ${nodeId}`);
            
            this.quarantinedNodes.add(nodeId);
            
            // Store quarantine status in database
            await this.db.scriptFile.insertOne({
                type: 'node_quarantine',
                nodeId: nodeId,
                quarantinedAt: Date.now(),
                reason: 'Remediation failure',
                active: true
            });
            
            // Cancel any pending jobs for this node
            await this.db.scriptFile.updateMany(
                { type: 'job', node: nodeId, state: 'pending' },
                { $set: { state: 'cancelled', cancelledReason: 'Node quarantined' } }
            );
            
            console.log(`ScriptTask Actions: Node ${nodeId} quarantined successfully`);
            return { success: true, message: 'Node quarantined' };
        } catch (e) {
            console.error('ScriptTask Actions: Error quarantining node', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Remove node from quarantine
     * @param {String} nodeId
     * @returns {Promise<Object>}
     */
    async unquarantineNode(nodeId) {
        try {
            console.log(`ScriptTask Actions: Removing quarantine from node ${nodeId}`);
            
            this.quarantinedNodes.delete(nodeId);
            
            // Update quarantine status in database
            await this.db.scriptFile.updateMany(
                { type: 'node_quarantine', nodeId: nodeId, active: true },
                { $set: { active: false, unquarantinedAt: Date.now() } }
            );
            
            console.log(`ScriptTask Actions: Node ${nodeId} unquarantined successfully`);
            return { success: true, message: 'Node unquarantined' };
        } catch (e) {
            console.error('ScriptTask Actions: Error unquarantining node', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Check if node is quarantined
     * @param {String} nodeId
     * @returns {Boolean}
     */
    isNodeQuarantined(nodeId) {
        return this.quarantinedNodes.has(nodeId);
    }
    
    /**
     * Perform automatic rollback
     * @param {String} executionId
     * @returns {Promise<Object>}
     */
    async performRollback(executionId) {
        try {
            console.log(`ScriptTask Actions: Performing rollback for execution ${executionId}`);
            
            const execution = await this.db.scriptFile.findOne({
                _id: this.db.formatId(executionId),
                type: 'remediation_execution'
            });
            
            if (!execution) {
                return { success: false, reason: 'Execution not found' };
            }
            
            const workflow = await this.db.scriptFile.findOne({
                _id: this.db.formatId(execution.workflowId),
                type: 'remediation_workflow'
            });
            
            if (!workflow || !workflow.rollbackEnabled) {
                return { success: false, reason: 'Rollback not enabled for this workflow' };
            }
            
            // Execute rollback steps (in reverse order)
            const rollbackSteps = [];
            for (let i = execution.stepResults.length - 1; i >= 0; i--) {
                const stepResult = execution.stepResults[i];
                if (stepResult.status === 'success') {
                    const step = workflow.steps.find(s => s.id === stepResult.stepId);
                    if (step && step.rollbackScriptId) {
                        rollbackSteps.push({
                            stepId: step.id,
                            scriptId: step.rollbackScriptId
                        });
                    }
                }
            }
            
            // Queue rollback jobs
            for (const rollbackStep of rollbackSteps) {
                const nowTime = Math.floor(Date.now() / 1000);
                const jobData = {
                    type: 'job',
                    scriptId: rollbackStep.scriptId,
                    node: execution.nodeId,
                    state: 'pending',
                    queueTime: nowTime,
                    priority: 'high',
                    remediationExecutionId: execution._id.toString(),
                    tags: ['rollback', 'remediation'],
                    metadata: {
                        reason: 'Rollback from failed remediation',
                        originalStepId: rollbackStep.stepId
                    }
                };
                
                await this.db.scriptFile.insertOne(jobData);
            }
            
            // Update execution status
            await this.db.scriptFile.updateOne(
                { _id: execution._id },
                { $set: { status: 'rolled_back', completedAt: Date.now() } }
            );
            
            console.log(`ScriptTask Actions: Rollback initiated for execution ${executionId}`);
            return { success: true, rollbackSteps: rollbackSteps.length };
        } catch (e) {
            console.error('ScriptTask Actions: Error performing rollback', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Validate health check
     * @param {Object} healthCheck - Health check configuration
     * @param {String} nodeId
     * @returns {Promise<Object>}
     */
    async validateHealthCheck(healthCheck, nodeId) {
        try {
            console.log(`ScriptTask Actions: Validating health check for node ${nodeId}`);
            
            if (healthCheck.type === 'script') {
                // Queue health check script
                const nowTime = Math.floor(Date.now() / 1000);
                const jobData = {
                    type: 'job',
                    scriptId: healthCheck.scriptId,
                    node: nodeId,
                    state: 'pending',
                    queueTime: nowTime,
                    priority: 'high',
                    tags: ['health-check'],
                    metadata: {
                        reason: 'Health check validation'
                    }
                };
                
                const result = await this.db.scriptFile.insertOne(jobData);
                return { success: true, jobId: result.insertedId.toString() };
            }
            
            return { success: false, reason: 'Unsupported health check type' };
        } catch (e) {
            console.error('ScriptTask Actions: Error validating health check', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Send admin notification
     * @param {Object} alert
     * @returns {Promise<void>}
     */
    async sendAdminNotification(alert) {
        try {
            // Notify via MeshCentral's event system
            if (this.meshServer && this.meshServer.DispatchEvent) {
                const targets = ['*', 'server-admins'];
                this.meshServer.DispatchEvent(targets, this, {
                    action: 'plugin',
                    plugin: 'scripttask',
                    pluginaction: 'adminAlert',
                    alert: alert
                });
            }
            
            console.log('ScriptTask Actions: Admin notification sent');
        } catch (e) {
            console.error('ScriptTask Actions: Error sending admin notification', e);
        }
    }
    
    /**
     * Load quarantined nodes from database on startup
     */
    async loadQuarantinedNodes() {
        try {
            const quarantined = await this.db.scriptFile.find({
                type: 'node_quarantine',
                active: true
            }).toArray();
            
            quarantined.forEach(q => {
                this.quarantinedNodes.add(q.nodeId);
            });
            
            console.log(`ScriptTask Actions: Loaded ${quarantined.length} quarantined nodes`);
        } catch (e) {
            console.error('ScriptTask Actions: Error loading quarantined nodes', e);
        }
    }
}

module.exports = ActionHandler;

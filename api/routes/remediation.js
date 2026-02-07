/**
 * @description Remediation routes for MeshCentral-ScriptTask API
 * @author Enhanced by Copilot
 * @license Apache-2.0
 */

"use strict";

const express = require('express');
const router = express.Router();

module.exports = function(remediationEngine, db, meshServer) {
    
    // POST /api/remediation/workflows - Create workflow
    router.post('/workflows', async (req, res) => {
        try {
            const workflowData = {
                name: req.body.name,
                description: req.body.description || '',
                trigger: req.body.trigger,
                conditions: req.body.conditions || [],
                actions: req.body.actions || [],
                rollback: req.body.rollback || [],
                enabled: req.body.enabled !== false,
                priority: req.body.priority || 'normal',
                timeout: req.body.timeout || 300000,
                createdBy: req.user.username
            };
            
            // Validate required fields
            if (!workflowData.name || !workflowData.trigger || !workflowData.actions.length) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Missing required fields: name, trigger, actions' 
                });
            }
            
            const result = await remediationEngine.createWorkflow(workflowData);
            
            if (result.success) {
                res.status(201).json({ success: true, id: result.id });
            } else {
                res.status(400).json({ success: false, error: result.error });
            }
        } catch (e) {
            console.error('ScriptTask API: Error creating workflow', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // GET /api/remediation/workflows - List workflows
    router.get('/workflows', async (req, res) => {
        try {
            const workflows = await db.scriptFile.find({
                type: 'remediation_workflow'
            }).sort({ name: 1 }).toArray();
            
            res.json({ success: true, workflows });
        } catch (e) {
            console.error('ScriptTask API: Error listing workflows', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // GET /api/remediation/workflows/:id - Get workflow
    router.get('/workflows/:id', async (req, res) => {
        try {
            const workflow = await db.scriptFile.findOne({
                _id: db.formatId(req.params.id),
                type: 'remediation_workflow'
            });
            
            if (!workflow) {
                return res.status(404).json({ success: false, error: 'Workflow not found' });
            }
            
            res.json({ success: true, workflow });
        } catch (e) {
            console.error('ScriptTask API: Error getting workflow', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // PUT /api/remediation/workflows/:id - Update workflow
    router.put('/workflows/:id', async (req, res) => {
        try {
            const workflowData = {
                _id: req.params.id,
                ...req.body,
                updatedBy: req.user.username
            };
            
            const result = await remediationEngine.updateWorkflow(workflowData);
            
            if (result.success) {
                res.json({ success: true, id: result.id });
            } else {
                res.status(404).json({ success: false, error: result.error });
            }
        } catch (e) {
            console.error('ScriptTask API: Error updating workflow', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // DELETE /api/remediation/workflows/:id - Delete workflow
    router.delete('/workflows/:id', async (req, res) => {
        try {
            const result = await remediationEngine.deleteWorkflow(req.params.id);
            
            if (result.success) {
                res.json({ success: true });
            } else {
                res.status(404).json({ success: false, error: 'Workflow not found' });
            }
        } catch (e) {
            console.error('ScriptTask API: Error deleting workflow', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // POST /api/remediation/workflows/:id/test - Test workflow (dry-run)
    router.post('/workflows/:id/test', async (req, res) => {
        try {
            const workflow = await db.scriptFile.findOne({
                _id: db.formatId(req.params.id),
                type: 'remediation_workflow'
            });
            
            if (!workflow) {
                return res.status(404).json({ success: false, error: 'Workflow not found' });
            }
            
            const testData = req.body.testData || {};
            const result = await remediationEngine.testWorkflow(workflow, testData);
            
            res.json({ success: true, result });
        } catch (e) {
            console.error('ScriptTask API: Error testing workflow', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // GET /api/remediation/executions - List executions with filters
    router.get('/executions', async (req, res) => {
        try {
            const query = { type: 'remediation_execution' };
            
            if (req.query.status) {
                query.status = req.query.status;
            }
            if (req.query.workflowId) {
                query.workflowId = req.query.workflowId;
            }
            if (req.query.nodeId) {
                query.nodeId = req.query.nodeId;
            }
            
            const executions = await db.scriptFile.find(query)
                .sort({ createdAt: -1 })
                .toArray();
            
            res.json({ success: true, executions });
        } catch (e) {
            console.error('ScriptTask API: Error listing executions', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // GET /api/remediation/executions/:id - Execution details
    router.get('/executions/:id', async (req, res) => {
        try {
            const execution = await db.scriptFile.findOne({
                _id: db.formatId(req.params.id),
                type: 'remediation_execution'
            });
            
            if (!execution) {
                return res.status(404).json({ success: false, error: 'Execution not found' });
            }
            
            res.json({ success: true, execution });
        } catch (e) {
            console.error('ScriptTask API: Error getting execution', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // POST /api/remediation/rollback/:id - Rollback execution
    router.post('/rollback/:id', async (req, res) => {
        try {
            const execution = await db.scriptFile.findOne({
                _id: db.formatId(req.params.id),
                type: 'remediation_execution'
            });
            
            if (!execution) {
                return res.status(404).json({ success: false, error: 'Execution not found' });
            }
            
            const result = await remediationEngine.rollbackExecution(execution, req.user.username);
            
            if (result.success) {
                res.json({ success: true, rollbackId: result.rollbackId });
            } else {
                res.status(400).json({ success: false, error: result.error });
            }
        } catch (e) {
            console.error('ScriptTask API: Error rolling back execution', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    return router;
};

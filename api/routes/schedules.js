/**
 * @description Schedule routes for MeshCentral-ScriptTask API
 * @author Enhanced by Copilot
 * @license Apache-2.0
 */

"use strict";

const express = require('express');
const router = express.Router();

module.exports = function(scheduler, db) {
    
    // GET /api/schedules - List all schedules
    router.get('/', async (req, res) => {
        try {
            const schedules = await db.scriptFile.find({
                type: 'schedule_v2'
            }).sort({ name: 1 }).toArray();
            
            res.json({ success: true, schedules });
        } catch (e) {
            console.error('ScriptTask API: Error listing schedules', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // GET /api/schedules/:id - Get schedule details
    router.get('/:id', async (req, res) => {
        try {
            const schedule = await db.scriptFile.findOne({
                _id: db.formatId(req.params.id),
                type: 'schedule_v2'
            });
            
            if (!schedule) {
                return res.status(404).json({ success: false, error: 'Schedule not found' });
            }
            
            res.json({ success: true, schedule });
        } catch (e) {
            console.error('ScriptTask API: Error getting schedule', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // POST /api/schedules - Create schedule
    router.post('/', async (req, res) => {
        try {
            const scheduleData = {
                name: req.body.name,
                description: req.body.description || '',
                scriptId: req.body.scriptId,
                cronExpression: req.body.cronExpression,
                timezone: req.body.timezone || 'UTC',
                nodes: req.body.nodes || [],
                meshes: req.body.meshes || [],
                priority: req.body.priority || 'normal',
                concurrency: req.body.concurrency || {
                    maxPerNode: 1,
                    maxPerMesh: 10,
                    maxGlobal: 50
                },
                maintenanceWindowIds: req.body.maintenanceWindowIds || [],
                dependsOn: req.body.dependsOn || [],
                jitter: req.body.jitter || 0,
                missedJobPolicy: req.body.missedJobPolicy || 'skip',
                enabled: req.body.enabled !== false,
                createdBy: req.user.username
            };
            
            // Validate required fields
            if (!scheduleData.name || !scheduleData.scriptId || !scheduleData.cronExpression) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Missing required fields: name, scriptId, cronExpression' 
                });
            }
            
            const result = await scheduler.addOrUpdateSchedule(scheduleData);
            
            if (result.success) {
                res.status(201).json({ success: true, id: result.id });
            } else {
                res.status(400).json({ success: false, error: result.error });
            }
        } catch (e) {
            console.error('ScriptTask API: Error creating schedule', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // PUT /api/schedules/:id - Update schedule
    router.put('/:id', async (req, res) => {
        try {
            const scheduleData = {
                _id: req.params.id,
                ...req.body,
                updatedBy: req.user.username
            };
            
            const result = await scheduler.addOrUpdateSchedule(scheduleData);
            
            if (result.success) {
                res.json({ success: true, id: result.id });
            } else {
                res.status(400).json({ success: false, error: result.error });
            }
        } catch (e) {
            console.error('ScriptTask API: Error updating schedule', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // DELETE /api/schedules/:id - Delete schedule
    router.delete('/:id', async (req, res) => {
        try {
            const result = await scheduler.deleteSchedule(req.params.id);
            
            if (result.success) {
                res.json({ success: true });
            } else {
                res.status(404).json({ success: false, error: 'Schedule not found' });
            }
        } catch (e) {
            console.error('ScriptTask API: Error deleting schedule', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // POST /api/schedules/:id/pause - Pause schedule
    router.post('/:id/pause', async (req, res) => {
        try {
            const result = await scheduler.pauseSchedule(req.params.id);
            
            if (result.success) {
                res.json({ success: true });
            } else {
                res.status(400).json({ success: false, error: result.error });
            }
        } catch (e) {
            console.error('ScriptTask API: Error pausing schedule', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // POST /api/schedules/:id/resume - Resume schedule
    router.post('/:id/resume', async (req, res) => {
        try {
            const result = await scheduler.resumeSchedule(req.params.id);
            
            if (result.success) {
                res.json({ success: true });
            } else {
                res.status(400).json({ success: false, error: result.error });
            }
        } catch (e) {
            console.error('ScriptTask API: Error resuming schedule', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // GET /api/schedules/:id/next-runs - Preview next runs
    router.get('/:id/next-runs', async (req, res) => {
        try {
            const count = parseInt(req.query.count) || 10;
            const nextRuns = await scheduler.getNextRuns(req.params.id, count);
            
            res.json({ success: true, nextRuns });
        } catch (e) {
            console.error('ScriptTask API: Error getting next runs', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // POST /api/schedules/:id/run-now - Trigger immediate run
    router.post('/:id/run-now', async (req, res) => {
        try {
            const schedule = await db.scriptFile.findOne({
                _id: db.formatId(req.params.id),
                type: 'schedule_v2'
            });
            
            if (!schedule) {
                return res.status(404).json({ success: false, error: 'Schedule not found' });
            }
            
            // Trigger schedule immediately
            await scheduler.handleScheduleTrigger(schedule);
            
            res.json({ success: true, message: 'Schedule triggered' });
        } catch (e) {
            console.error('ScriptTask API: Error triggering schedule', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    return router;
};

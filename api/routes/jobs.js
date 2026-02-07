/**
 * @description Job routes for MeshCentral-ScriptTask API
 * @author Enhanced by Copilot
 * @license Apache-2.0
 */

"use strict";

const express = require('express');
const router = express.Router();

module.exports = function(scheduler, db) {
    
    // GET /api/jobs - List jobs with filters
    router.get('/', async (req, res) => {
        try {
            const query = {};
            
            if (req.query.status) {
                query.status = req.query.status;
            }
            if (req.query.priority) {
                query.priority = req.query.priority;
            }
            if (req.query.node) {
                query['target.nodeId'] = req.query.node;
            }
            if (req.query.scriptId) {
                query.scriptId = req.query.scriptId;
            }
            if (req.query.tags) {
                const tags = Array.isArray(req.query.tags) ? req.query.tags : [req.query.tags];
                query.tags = { $in: tags };
            }
            
            const jobs = await db.taskResults.find(query)
                .sort({ createdAt: -1 })
                .toArray();
            
            res.json({ success: true, jobs });
        } catch (e) {
            console.error('ScriptTask API: Error listing jobs', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // GET /api/jobs/:id - Job details
    router.get('/:id', async (req, res) => {
        try {
            const job = await db.taskResults.findOne({
                _id: db.formatId(req.params.id)
            });
            
            if (!job) {
                return res.status(404).json({ success: false, error: 'Job not found' });
            }
            
            res.json({ success: true, job });
        } catch (e) {
            console.error('ScriptTask API: Error getting job', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // POST /api/jobs/:id/cancel - Cancel running job
    router.post('/:id/cancel', async (req, res) => {
        try {
            const job = await db.taskResults.findOne({
                _id: db.formatId(req.params.id)
            });
            
            if (!job) {
                return res.status(404).json({ success: false, error: 'Job not found' });
            }
            
            if (job.status !== 'running' && job.status !== 'pending') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Job is not running or pending' 
                });
            }
            
            const result = await scheduler.cancelJob(req.params.id, req.user.username);
            
            if (result.success) {
                res.json({ success: true });
            } else {
                res.status(400).json({ success: false, error: result.error });
            }
        } catch (e) {
            console.error('ScriptTask API: Error cancelling job', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // POST /api/jobs/:id/retry - Retry failed job
    router.post('/:id/retry', async (req, res) => {
        try {
            const job = await db.taskResults.findOne({
                _id: db.formatId(req.params.id)
            });
            
            if (!job) {
                return res.status(404).json({ success: false, error: 'Job not found' });
            }
            
            if (job.status !== 'failed' && job.status !== 'cancelled') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Job is not failed or cancelled' 
                });
            }
            
            const result = await scheduler.retryJob(req.params.id, req.user.username);
            
            if (result.success) {
                res.json({ success: true, newJobId: result.newJobId });
            } else {
                res.status(400).json({ success: false, error: result.error });
            }
        } catch (e) {
            console.error('ScriptTask API: Error retrying job', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // GET /api/jobs/stats - Job statistics
    router.get('/stats', async (req, res) => {
        try {
            const stats = {
                total: await db.taskResults.countDocuments(),
                pending: await db.taskResults.countDocuments({ status: 'pending' }),
                running: await db.taskResults.countDocuments({ status: 'running' }),
                completed: await db.taskResults.countDocuments({ status: 'completed' }),
                failed: await db.taskResults.countDocuments({ status: 'failed' })
            };
            
            res.json({ success: true, stats });
        } catch (e) {
            console.error('ScriptTask API: Error getting job stats', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    return router;
};

/**
 * @description Script routes for MeshCentral-ScriptTask API
 * @author Enhanced by Copilot
 * @license Apache-2.0
 */

"use strict";

const express = require('express');
const router = express.Router();

module.exports = function(scheduler, db, meshServer) {
    
    // GET /api/scripts - List scripts
    router.get('/', async (req, res) => {
        try {
            const scripts = await db.scriptFile.find({
                type: 'script'
            }).sort({ name: 1 }).toArray();
            
            res.json({ success: true, scripts });
        } catch (e) {
            console.error('ScriptTask API: Error listing scripts', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // POST /api/scripts - Create/upload script
    router.post('/', async (req, res) => {
        try {
            const scriptData = {
                name: req.body.name,
                description: req.body.description || '',
                content: req.body.content,
                scriptType: req.body.scriptType || 'powershell',
                tags: req.body.tags || [],
                timeout: req.body.timeout || 300000,
                type: 'script',
                createdBy: req.user.username,
                createdAt: new Date()
            };
            
            // Validate required fields
            if (!scriptData.name || !scriptData.content) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Missing required fields: name, content' 
                });
            }
            
            const result = await db.scriptFile.insertOne(scriptData);
            
            res.status(201).json({ success: true, id: result.insertedId });
        } catch (e) {
            console.error('ScriptTask API: Error creating script', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // GET /api/scripts/:id - Get script content
    router.get('/:id', async (req, res) => {
        try {
            const script = await db.scriptFile.findOne({
                _id: db.formatId(req.params.id),
                type: 'script'
            });
            
            if (!script) {
                return res.status(404).json({ success: false, error: 'Script not found' });
            }
            
            res.json({ success: true, script });
        } catch (e) {
            console.error('ScriptTask API: Error getting script', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // PUT /api/scripts/:id - Update script
    router.put('/:id', async (req, res) => {
        try {
            const script = await db.scriptFile.findOne({
                _id: db.formatId(req.params.id),
                type: 'script'
            });
            
            if (!script) {
                return res.status(404).json({ success: false, error: 'Script not found' });
            }
            
            const updateData = {
                ...req.body,
                updatedBy: req.user.username,
                updatedAt: new Date()
            };
            
            delete updateData._id;
            delete updateData.type;
            
            await db.scriptFile.updateOne(
                { _id: db.formatId(req.params.id) },
                { $set: updateData }
            );
            
            res.json({ success: true, id: req.params.id });
        } catch (e) {
            console.error('ScriptTask API: Error updating script', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // DELETE /api/scripts/:id - Delete script
    router.delete('/:id', async (req, res) => {
        try {
            const result = await db.scriptFile.deleteOne({
                _id: db.formatId(req.params.id),
                type: 'script'
            });
            
            if (result.deletedCount === 0) {
                return res.status(404).json({ success: false, error: 'Script not found' });
            }
            
            res.json({ success: true });
        } catch (e) {
            console.error('ScriptTask API: Error deleting script', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // POST /api/scripts/:id/run - Run script immediately on nodes
    router.post('/:id/run', async (req, res) => {
        try {
            const script = await db.scriptFile.findOne({
                _id: db.formatId(req.params.id),
                type: 'script'
            });
            
            if (!script) {
                return res.status(404).json({ success: false, error: 'Script not found' });
            }
            
            const nodes = req.body.nodes || [];
            const meshes = req.body.meshes || [];
            
            if (nodes.length === 0 && meshes.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'At least one node or mesh must be specified' 
                });
            }
            
            const jobData = {
                scriptId: req.params.id,
                nodes: nodes,
                meshes: meshes,
                priority: req.body.priority || 'normal',
                runNow: true,
                triggeredBy: req.user.username
            };
            
            const result = await scheduler.runScriptNow(jobData);
            
            if (result.success) {
                res.json({ success: true, jobIds: result.jobIds });
            } else {
                res.status(400).json({ success: false, error: result.error });
            }
        } catch (e) {
            console.error('ScriptTask API: Error running script', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    return router;
};

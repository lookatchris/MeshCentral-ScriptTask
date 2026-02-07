/**
 * @description Node routes for MeshCentral-ScriptTask API
 * @author Enhanced by Copilot
 * @license Apache-2.0
 */

"use strict";

const express = require('express');
const router = express.Router();

module.exports = function(scheduler, db, meshServer) {
    
    // GET /api/nodes - List nodes/agents
    router.get('/', async (req, res) => {
        try {
            const agents = [];
            
            if (meshServer && meshServer.webserver && meshServer.webserver.wsagents) {
                for (const [nodeId, agent] of Object.entries(meshServer.webserver.wsagents)) {
                    agents.push({
                        nodeId: nodeId,
                        name: agent.name || 'Unknown',
                        meshId: agent.meshid || 'Unknown',
                        state: agent.authenticated ? 'online' : 'offline',
                        platform: agent.agentInfo ? agent.agentInfo.platform : 'unknown',
                        lastSeen: agent.connectTime || new Date()
                    });
                }
            }
            
            res.json({ success: true, nodes: agents });
        } catch (e) {
            console.error('ScriptTask API: Error listing nodes', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // GET /api/nodes/:id - Node details
    router.get('/:id', async (req, res) => {
        try {
            if (!meshServer || !meshServer.webserver || !meshServer.webserver.wsagents) {
                return res.status(503).json({ success: false, error: 'MeshServer not available' });
            }
            
            const agent = meshServer.webserver.wsagents[req.params.id];
            
            if (!agent) {
                return res.status(404).json({ success: false, error: 'Node not found' });
            }
            
            const nodeDetails = {
                nodeId: req.params.id,
                name: agent.name || 'Unknown',
                meshId: agent.meshid || 'Unknown',
                state: agent.authenticated ? 'online' : 'offline',
                platform: agent.agentInfo ? agent.agentInfo.platform : 'unknown',
                agentInfo: agent.agentInfo || {},
                lastSeen: agent.connectTime || new Date()
            };
            
            res.json({ success: true, node: nodeDetails });
        } catch (e) {
            console.error('ScriptTask API: Error getting node', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // GET /api/nodes/:id/jobs - Jobs for specific node
    router.get('/:id/jobs', async (req, res) => {
        try {
            const jobs = await db.taskResults.find({
                'target.nodeId': req.params.id
            }).sort({ createdAt: -1 }).toArray();
            
            res.json({ success: true, jobs });
        } catch (e) {
            console.error('ScriptTask API: Error getting node jobs', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // GET /api/nodes/:id/health - Health status
    router.get('/:id/health', async (req, res) => {
        try {
            if (!meshServer || !meshServer.webserver || !meshServer.webserver.wsagents) {
                return res.status(503).json({ success: false, error: 'MeshServer not available' });
            }
            
            const agent = meshServer.webserver.wsagents[req.params.id];
            
            if (!agent) {
                return res.status(404).json({ success: false, error: 'Node not found' });
            }
            
            const recentJobs = await db.taskResults.find({
                'target.nodeId': req.params.id,
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            }).toArray();
            
            const failedJobs = recentJobs.filter(j => j.status === 'failed').length;
            const totalJobs = recentJobs.length;
            
            const health = {
                nodeId: req.params.id,
                online: agent.authenticated || false,
                lastSeen: agent.connectTime || new Date(),
                jobStats: {
                    last24h: totalJobs,
                    failed: failedJobs,
                    successRate: totalJobs > 0 ? ((totalJobs - failedJobs) / totalJobs * 100).toFixed(2) : 100
                },
                status: agent.authenticated ? 'healthy' : 'offline'
            };
            
            res.json({ success: true, health });
        } catch (e) {
            console.error('ScriptTask API: Error getting node health', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // POST /api/nodes/:id/quarantine - Quarantine node
    router.post('/:id/quarantine', async (req, res) => {
        try {
            const reason = req.body.reason || 'Manual quarantine';
            
            const quarantineData = {
                type: 'node_quarantine',
                nodeId: req.params.id,
                reason: reason,
                quarantinedBy: req.user.username,
                quarantinedAt: new Date(),
                active: true
            };
            
            await db.scriptFile.insertOne(quarantineData);
            
            res.json({ success: true, message: 'Node quarantined' });
        } catch (e) {
            console.error('ScriptTask API: Error quarantining node', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    // POST /api/nodes/:id/unquarantine - Remove quarantine
    router.post('/:id/unquarantine', async (req, res) => {
        try {
            await db.scriptFile.updateMany(
                { 
                    type: 'node_quarantine',
                    nodeId: req.params.id,
                    active: true
                },
                { 
                    $set: { 
                        active: false,
                        releasedBy: req.user.username,
                        releasedAt: new Date()
                    }
                }
            );
            
            res.json({ success: true, message: 'Node quarantine removed' });
        } catch (e) {
            console.error('ScriptTask API: Error removing quarantine', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
    
    return router;
};

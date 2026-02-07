/**
 * @description Advanced scheduler for MeshCentral-ScriptTask with cron support
 * @author Enhanced by Copilot
 * @license Apache-2.0
 */

"use strict";

const { Cron } = require('croner');
const TimezoneHandler = require('./timezone-handler');
const MaintenanceWindows = require('./maintenance-windows');

class AdvancedScheduler {
    constructor(meshServer, db, config = {}) {
        this.meshServer = meshServer;
        this.db = db;
        this.config = config;
        this.tzHandler = new TimezoneHandler();
        this.maintenanceWindows = new MaintenanceWindows(db);
        this.cronJobs = new Map(); // scheduleId -> Cron instance
        this.jobQueue = []; // Priority queue for jobs
        this.runningJobs = new Map(); // jobId -> job data
        this.checkInterval = null;
    }
    
    /**
     * Initialize the scheduler
     */
    async initialize() {
        console.log('ScriptTask: Initializing advanced scheduler...');
        
        // Load all enabled schedules
        await this.loadSchedules();
        
        // Start the check interval (for job queue processing)
        const intervalSeconds = this.config.checkIntervalSeconds || 30;
        this.checkInterval = setInterval(() => this.processJobQueue(), intervalSeconds * 1000);
        
        console.log(`ScriptTask: Advanced scheduler initialized (check interval: ${intervalSeconds}s)`);
    }
    
    /**
     * Load all schedules from database and setup cron jobs
     */
    async loadSchedules() {
        try {
            const schedules = await this.db.scriptFile.find({
                type: 'schedule_v2',
                enabled: true
            }).toArray();
            
            console.log(`ScriptTask: Loading ${schedules.length} v2 schedules`);
            
            for (const schedule of schedules) {
                await this.setupCronJob(schedule);
            }
        } catch (e) {
            console.error('ScriptTask Scheduler: Error loading schedules', e);
        }
    }
    
    /**
     * Setup a cron job for a schedule
     * @param {Object} schedule
     */
    async setupCronJob(schedule) {
        try {
            const scheduleId = schedule._id.toString();
            
            // Remove existing cron job if it exists
            if (this.cronJobs.has(scheduleId)) {
                this.cronJobs.get(scheduleId).stop();
                this.cronJobs.delete(scheduleId);
            }
            
            // Create new cron job
            const cronOptions = {
                timezone: schedule.timezone || 'UTC',
                paused: !schedule.enabled
            };
            
            const cronJob = new Cron(schedule.cronExpression, cronOptions, async () => {
                await this.handleScheduleTrigger(schedule);
            });
            
            this.cronJobs.set(scheduleId, cronJob);
            
            // Update next run time
            const nextRun = cronJob.next();
            if (nextRun) {
                await this.db.scriptFile.updateOne(
                    { _id: schedule._id },
                    { $set: { nextRun: nextRun.getTime() } }
                );
            }
            
            console.log(`ScriptTask: Setup cron job for schedule '${schedule.name}' (${schedule.cronExpression})`);
        } catch (e) {
            console.error(`ScriptTask Scheduler: Error setting up cron job for schedule ${schedule.name}`, e);
        }
    }
    
    /**
     * Handle schedule trigger
     * @param {Object} schedule
     */
    async handleScheduleTrigger(schedule) {
        try {
            console.log(`ScriptTask: Schedule triggered: ${schedule.name}`);
            
            const timestamp = Date.now();
            
            // Check maintenance windows
            const maintenanceCheck = await this.maintenanceWindows.canJobRun(schedule, timestamp);
            if (!maintenanceCheck.allowed) {
                console.log(`ScriptTask: Schedule ${schedule.name} blocked: ${maintenanceCheck.reason}`);
                
                // Handle missed job policy
                if (schedule.missedJobPolicy === 'queue') {
                    // Queue for later
                    await this.queueScheduleForLater(schedule);
                }
                return;
            }
            
            // Check dependencies
            if (schedule.dependsOn && schedule.dependsOn.length > 0) {
                const depsReady = await this.checkDependencies(schedule);
                if (!depsReady) {
                    console.log(`ScriptTask: Schedule ${schedule.name} dependencies not ready`);
                    return;
                }
            }
            
            // Apply jitter if configured
            let executionDelay = 0;
            if (schedule.jitter && schedule.jitter > 0) {
                executionDelay = Math.floor(Math.random() * schedule.jitter * 1000);
            }
            
            // Get target nodes
            const nodes = await this.getTargetNodes(schedule);
            
            // Create jobs for each node
            for (const nodeId of nodes) {
                setTimeout(async () => {
                    await this.createJobForSchedule(schedule, nodeId);
                }, executionDelay);
            }
            
            // Update schedule stats
            await this.db.scriptFile.updateOne(
                { _id: schedule._id },
                { 
                    $set: { lastRun: timestamp },
                    $inc: { runCount: 1 }
                }
            );
            
            // Update next run time
            const cronJob = this.cronJobs.get(schedule._id.toString());
            if (cronJob) {
                const nextRun = cronJob.next();
                if (nextRun) {
                    await this.db.scriptFile.updateOne(
                        { _id: schedule._id },
                        { $set: { nextRun: nextRun.getTime() } }
                    );
                }
            }
        } catch (e) {
            console.error(`ScriptTask Scheduler: Error handling schedule trigger`, e);
        }
    }
    
    /**
     * Queue schedule for later execution
     */
    async queueScheduleForLater(schedule) {
        // Add to job queue with lower priority
        this.jobQueue.push({
            scheduleId: schedule._id,
            priority: this.getPriorityValue(schedule.priority) + 1, // Lower priority
            queuedAt: Date.now()
        });
        
        this.jobQueue.sort((a, b) => a.priority - b.priority);
    }
    
    /**
     * Check if schedule dependencies are met
     * @param {Object} schedule
     * @returns {Promise<Boolean>}
     */
    async checkDependencies(schedule) {
        try {
            // Check if dependent schedules have run successfully
            for (const depId of schedule.dependsOn) {
                const depSchedule = await this.db.scriptFile.findOne({
                    _id: this.db.formatId(depId),
                    type: 'schedule_v2'
                });
                
                if (!depSchedule || !depSchedule.lastRun) {
                    return false;
                }
                
                // Check if dependent schedule ran after this schedule's last run
                if (schedule.lastRun && depSchedule.lastRun < schedule.lastRun) {
                    return false;
                }
            }
            
            return true;
        } catch (e) {
            console.error('ScriptTask Scheduler: Error checking dependencies', e);
            return false;
        }
    }
    
    /**
     * Get target nodes for a schedule
     * @param {Object} schedule
     * @returns {Promise<Array<String>>}
     */
    async getTargetNodes(schedule) {
        const nodes = [];
        const onlineAgents = Object.keys(this.meshServer.webserver.wsagents);
        
        // Add specific nodes
        if (schedule.nodes && schedule.nodes.length > 0) {
            nodes.push(...schedule.nodes.filter(n => onlineAgents.includes(n)));
        }
        
        // Add nodes from meshes
        if (schedule.meshes && schedule.meshes.length > 0) {
            for (const nodeId of onlineAgents) {
                const agent = this.meshServer.webserver.wsagents[nodeId];
                if (agent && schedule.meshes.includes(agent.dbMeshKey)) {
                    if (!nodes.includes(nodeId)) {
                        nodes.push(nodeId);
                    }
                }
            }
        }
        
        return nodes;
    }
    
    /**
     * Create a job for a schedule
     * @param {Object} schedule
     * @param {String} nodeId
     */
    async createJobForSchedule(schedule, nodeId) {
        try {
            // Check concurrency limits
            const canRun = await this.checkConcurrencyLimits(schedule, nodeId);
            if (!canRun) {
                console.log(`ScriptTask: Concurrency limit reached for schedule ${schedule.name}`);
                return;
            }
            
            // Create job
            const nowTime = Math.floor(Date.now() / 1000);
            const jobData = {
                type: 'job',
                scriptId: schedule.scriptId,
                node: nodeId,
                state: 'pending',
                queueTime: nowTime,
                priority: schedule.priority || 'normal',
                scheduleId: schedule._id.toString(),
                retryCount: 0,
                maxRetries: 3,
                tags: ['scheduled'],
                metadata: {
                    scheduleName: schedule.name,
                    cronExpression: schedule.cronExpression,
                    timezone: schedule.timezone
                }
            };
            
            const result = await this.db.scriptFile.insertOne(jobData);
            console.log(`ScriptTask: Created job ${result.insertedId} for schedule ${schedule.name} on node ${nodeId}`);
        } catch (e) {
            console.error('ScriptTask Scheduler: Error creating job', e);
        }
    }
    
    /**
     * Check concurrency limits
     * @param {Object} schedule
     * @param {String} nodeId
     * @returns {Promise<Boolean>}
     */
    async checkConcurrencyLimits(schedule, nodeId) {
        try {
            const runningJobs = await this.db.scriptFile.find({
                type: 'job',
                state: { $in: ['pending', 'running'] }
            }).toArray();
            
            // Check per-node limit
            if (schedule.concurrency && schedule.concurrency.maxPerNode) {
                const nodeJobs = runningJobs.filter(j => j.node === nodeId);
                if (nodeJobs.length >= schedule.concurrency.maxPerNode) {
                    return false;
                }
            }
            
            // Check per-mesh limit
            if (schedule.concurrency && schedule.concurrency.maxPerMesh) {
                const agent = this.meshServer.webserver.wsagents[nodeId];
                if (agent) {
                    const meshJobs = runningJobs.filter(j => {
                        const jobAgent = this.meshServer.webserver.wsagents[j.node];
                        return jobAgent && jobAgent.dbMeshKey === agent.dbMeshKey;
                    });
                    if (meshJobs.length >= schedule.concurrency.maxPerMesh) {
                        return false;
                    }
                }
            }
            
            // Check global limit
            if (schedule.concurrency && schedule.concurrency.maxGlobal) {
                if (runningJobs.length >= schedule.concurrency.maxGlobal) {
                    return false;
                }
            }
            
            // Check system-wide limit
            const maxConcurrent = this.config.maxConcurrentJobs || 50;
            if (runningJobs.length >= maxConcurrent) {
                return false;
            }
            
            return true;
        } catch (e) {
            console.error('ScriptTask Scheduler: Error checking concurrency', e);
            return true; // Allow on error
        }
    }
    
    /**
     * Process the job queue
     */
    async processJobQueue() {
        // Process queued jobs that were delayed by maintenance windows
        if (this.jobQueue.length > 0) {
            const job = this.jobQueue.shift();
            const schedule = await this.db.scriptFile.findOne({
                _id: this.db.formatId(job.scheduleId),
                type: 'schedule_v2'
            });
            
            if (schedule) {
                await this.handleScheduleTrigger(schedule);
            }
        }
    }
    
    /**
     * Get priority numeric value
     * @param {String} priority
     * @returns {Number}
     */
    getPriorityValue(priority) {
        const priorities = {
            'critical': 0,
            'high': 1,
            'normal': 2,
            'low': 3
        };
        return priorities[priority] || 2;
    }
    
    /**
     * Add or update a schedule
     * @param {Object} scheduleData
     * @returns {Promise<Object>}
     */
    async addOrUpdateSchedule(scheduleData) {
        try {
            if (scheduleData._id) {
                // Update existing
                const id = this.db.formatId(scheduleData._id);
                delete scheduleData._id;
                scheduleData.updatedAt = Date.now();
                
                await this.db.scriptFile.updateOne(
                    { _id: id, type: 'schedule_v2' },
                    { $set: scheduleData }
                );
                
                // Reload the schedule
                const updated = await this.db.scriptFile.findOne({ _id: id });
                if (updated) {
                    await this.setupCronJob(updated);
                }
                
                return { success: true, id: id.toString() };
            } else {
                // Create new
                scheduleData.type = 'schedule_v2';
                scheduleData.createdAt = Date.now();
                scheduleData.updatedAt = Date.now();
                scheduleData.runCount = 0;
                scheduleData.failCount = 0;
                
                const result = await this.db.scriptFile.insertOne(scheduleData);
                
                // Setup cron job
                const created = await this.db.scriptFile.findOne({ _id: result.insertedId });
                if (created) {
                    await this.setupCronJob(created);
                }
                
                return { success: true, id: result.insertedId.toString() };
            }
        } catch (e) {
            console.error('ScriptTask Scheduler: Error adding/updating schedule', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Delete a schedule
     * @param {String} scheduleId
     * @returns {Promise<Object>}
     */
    async deleteSchedule(scheduleId) {
        try {
            // Stop cron job
            if (this.cronJobs.has(scheduleId)) {
                this.cronJobs.get(scheduleId).stop();
                this.cronJobs.delete(scheduleId);
            }
            
            // Delete from database
            const result = await this.db.scriptFile.deleteOne({
                _id: this.db.formatId(scheduleId),
                type: 'schedule_v2'
            });
            
            return { success: result.deletedCount > 0 };
        } catch (e) {
            console.error('ScriptTask Scheduler: Error deleting schedule', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Pause a schedule
     * @param {String} scheduleId
     * @returns {Promise<Object>}
     */
    async pauseSchedule(scheduleId) {
        try {
            await this.db.scriptFile.updateOne(
                { _id: this.db.formatId(scheduleId), type: 'schedule_v2' },
                { $set: { enabled: false } }
            );
            
            if (this.cronJobs.has(scheduleId)) {
                this.cronJobs.get(scheduleId).pause();
            }
            
            return { success: true };
        } catch (e) {
            console.error('ScriptTask Scheduler: Error pausing schedule', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Resume a schedule
     * @param {String} scheduleId
     * @returns {Promise<Object>}
     */
    async resumeSchedule(scheduleId) {
        try {
            await this.db.scriptFile.updateOne(
                { _id: this.db.formatId(scheduleId), type: 'schedule_v2' },
                { $set: { enabled: true } }
            );
            
            if (this.cronJobs.has(scheduleId)) {
                this.cronJobs.get(scheduleId).resume();
            }
            
            return { success: true };
        } catch (e) {
            console.error('ScriptTask Scheduler: Error resuming schedule', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Get next N run times for a schedule
     * @param {String} scheduleId
     * @param {Number} count
     * @returns {Promise<Array>}
     */
    async getNextRuns(scheduleId, count = 10) {
        try {
            const schedule = await this.db.scriptFile.findOne({
                _id: this.db.formatId(scheduleId),
                type: 'schedule_v2'
            });
            
            if (!schedule) return [];
            
            const cron = new Cron(schedule.cronExpression, {
                timezone: schedule.timezone || 'UTC'
            });
            
            const nextRuns = [];
            for (let i = 0; i < count; i++) {
                const next = cron.next();
                if (next) {
                    nextRuns.push({
                        timestamp: next.getTime(),
                        formatted: this.tzHandler.format(next.getTime(), schedule.timezone || 'UTC')
                    });
                }
            }
            
            return nextRuns;
        } catch (e) {
            console.error('ScriptTask Scheduler: Error getting next runs', e);
            return [];
        }
    }
    
    /**
     * Shutdown the scheduler
     */
    async shutdown() {
        console.log('ScriptTask: Shutting down advanced scheduler...');
        
        // Stop all cron jobs
        for (const [scheduleId, cronJob] of this.cronJobs) {
            cronJob.stop();
        }
        this.cronJobs.clear();
        
        // Clear check interval
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        
        console.log('ScriptTask: Advanced scheduler shut down');
    }
}

module.exports = AdvancedScheduler;

/**
 * @description Maintenance windows for MeshCentral-ScriptTask
 * @author Enhanced by Copilot
 * @license Apache-2.0
 */

"use strict";

const { Cron } = require('croner');
const TimezoneHandler = require('./timezone-handler');

class MaintenanceWindows {
    constructor(db) {
        this.db = db;
        this.tzHandler = new TimezoneHandler();
        this.activeWindows = new Map(); // windowId -> { start, end }
    }
    
    /**
     * Check if a job should run based on maintenance windows
     * @param {Object} schedule - Schedule object with priority
     * @param {Number} timestamp - When the job wants to run
     * @returns {Promise<Object>} - { allowed: boolean, reason: string }
     */
    async canJobRun(schedule, timestamp = Date.now()) {
        try {
            if (!schedule.maintenanceWindowIds || schedule.maintenanceWindowIds.length === 0) {
                return { allowed: true, reason: 'No maintenance windows defined' };
            }
            
            // Get all maintenance windows
            const windows = await this.getMaintenanceWindows(schedule.maintenanceWindowIds);
            
            for (const window of windows) {
                if (!window.enabled) continue;
                
                const inWindow = await this.isInMaintenanceWindow(window, timestamp);
                
                if (inWindow) {
                    // Check if this priority is allowed during maintenance
                    if (window.allowedPriorities && window.allowedPriorities.includes(schedule.priority)) {
                        return { 
                            allowed: true, 
                            reason: `Priority '${schedule.priority}' is allowed during maintenance window '${window.name}'` 
                        };
                    }
                    
                    return { 
                        allowed: false, 
                        reason: `Blocked by maintenance window '${window.name}'` 
                    };
                }
            }
            
            return { allowed: true, reason: 'Not in any maintenance window' };
        } catch (e) {
            console.error('ScriptTask MaintenanceWindows: Error checking windows', e);
            // On error, allow the job to run (fail-open)
            return { allowed: true, reason: 'Error checking maintenance windows' };
        }
    }
    
    /**
     * Get maintenance windows by IDs
     * @param {Array<String>} windowIds
     * @returns {Promise<Array>}
     */
    async getMaintenanceWindows(windowIds) {
        try {
            const windows = await this.db.scriptFile.find({
                type: 'maintenance_window',
                _id: { $in: windowIds.map(id => this.db.formatId(id)) }
            }).toArray();
            
            return windows;
        } catch (e) {
            console.error('ScriptTask MaintenanceWindows: Error fetching windows', e);
            return [];
        }
    }
    
    /**
     * Check if timestamp is within a maintenance window
     * @param {Object} window - Maintenance window object
     * @param {Number} timestamp
     * @returns {Promise<Boolean>}
     */
    async isInMaintenanceWindow(window, timestamp) {
        try {
            // Get the current time in the window's timezone
            const nowInTz = this.tzHandler.now(window.timezone || 'UTC');
            const checkTime = timestamp || nowInTz.timestamp;
            
            // Parse cron expression to check if we're in a scheduled maintenance
            const cron = new Cron(window.cronExpression, {
                timezone: window.timezone || 'UTC'
            });
            
            // Get the previous run time from cron
            const prevRun = cron.previous();
            if (!prevRun) return false;
            
            const prevRunTime = prevRun.getTime();
            const windowEnd = prevRunTime + (window.duration * 1000);
            
            // Check if current time is within the window
            return checkTime >= prevRunTime && checkTime <= windowEnd;
        } catch (e) {
            console.error('ScriptTask MaintenanceWindows: Error checking window', e);
            return false;
        }
    }
    
    /**
     * Create a new maintenance window
     * @param {Object} windowData
     * @returns {Promise<Object>}
     */
    async createMaintenanceWindow(windowData) {
        const window = {
            type: 'maintenance_window',
            name: windowData.name,
            description: windowData.description || '',
            cronExpression: windowData.cronExpression,
            timezone: windowData.timezone || 'UTC',
            duration: windowData.duration || 3600, // Default 1 hour
            allowedPriorities: windowData.allowedPriorities || ['critical'],
            enabled: windowData.enabled !== false,
            createdBy: windowData.createdBy || 'system',
            createdAt: Date.now()
        };
        
        try {
            const result = await this.db.scriptFile.insertOne(window);
            return { success: true, id: result.insertedId };
        } catch (e) {
            console.error('ScriptTask MaintenanceWindows: Error creating window', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Update a maintenance window
     * @param {String} windowId
     * @param {Object} updates
     * @returns {Promise<Object>}
     */
    async updateMaintenanceWindow(windowId, updates) {
        try {
            const result = await this.db.scriptFile.updateOne(
                { _id: this.db.formatId(windowId), type: 'maintenance_window' },
                { $set: updates }
            );
            
            return { success: result.modifiedCount > 0 };
        } catch (e) {
            console.error('ScriptTask MaintenanceWindows: Error updating window', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Delete a maintenance window
     * @param {String} windowId
     * @returns {Promise<Object>}
     */
    async deleteMaintenanceWindow(windowId) {
        try {
            const result = await this.db.scriptFile.deleteOne({
                _id: this.db.formatId(windowId),
                type: 'maintenance_window'
            });
            
            return { success: result.deletedCount > 0 };
        } catch (e) {
            console.error('ScriptTask MaintenanceWindows: Error deleting window', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Get all maintenance windows
     * @returns {Promise<Array>}
     */
    async getAllMaintenanceWindows() {
        try {
            return await this.db.scriptFile.find({
                type: 'maintenance_window'
            }).sort({ name: 1 }).toArray();
        } catch (e) {
            console.error('ScriptTask MaintenanceWindows: Error fetching all windows', e);
            return [];
        }
    }
}

module.exports = MaintenanceWindows;

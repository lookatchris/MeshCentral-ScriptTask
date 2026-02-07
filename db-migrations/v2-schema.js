/**
 * @description Database schema v2 for MeshCentral-ScriptTask enhanced features
 * @author Enhanced by Copilot
 * @license Apache-2.0
 */

"use strict";

module.exports.applyMigrations = async function(db, formatId) {
    console.log('ScriptTask: Applying v2 database schema migrations...');
    
    // Add indexes for new document types
    try {
        // Index for schedule_v2
        await db.scriptFile.createIndex({ type: 1, enabled: 1, nextRun: 1 });
        await db.scriptFile.createIndex({ type: 1, cronExpression: 1 });
        
        // Index for remediation_workflow
        await db.scriptFile.createIndex({ type: 1, 'trigger.type': 1 });
        
        // Index for remediation_execution
        await db.scriptFile.createIndex({ type: 1, workflowId: 1, status: 1 });
        await db.scriptFile.createIndex({ type: 1, nodeId: 1, startedAt: -1 });
        
        // Index for maintenance_window
        await db.scriptFile.createIndex({ type: 1, enabled: 1, cronExpression: 1 });
        
        // Index for job_v2
        await db.scriptFile.createIndex({ type: 1, priority: 1, queueTime: 1 });
        
        console.log('ScriptTask: v2 schema indexes created successfully');
    } catch (e) {
        console.log('ScriptTask: Warning - some indexes may already exist:', e.message);
    }
};

/**
 * Migrate v1 schedules to v2 format
 */
module.exports.migrateSchedulesToV2 = async function(db, formatId) {
    console.log('ScriptTask: Starting migration of v1 schedules to v2...');
    
    try {
        // Find all old schedule types
        const oldSchedules = await db.scriptFile.find({ type: 'jobSchedule' }).toArray();
        
        console.log(`ScriptTask: Found ${oldSchedules.length} v1 schedules to migrate`);
        
        for (const oldSchedule of oldSchedules) {
            // Convert old interval-based schedule to cron expression
            let cronExpression = '*/1 * * * *'; // Default: every minute
            
            if (oldSchedule.interval) {
                switch (oldSchedule.interval) {
                    case 'minute':
                        cronExpression = '*/1 * * * *';
                        break;
                    case 'hourly':
                        cronExpression = '0 * * * *';
                        break;
                    case 'daily':
                        cronExpression = '0 0 * * *';
                        break;
                    case 'weekly':
                        cronExpression = '0 0 * * 0';
                        break;
                    default:
                        cronExpression = '*/1 * * * *';
                }
            }
            
            // Create new v2 schedule
            const newSchedule = {
                type: 'schedule_v2',
                name: oldSchedule.name || `Migrated Schedule`,
                description: `Migrated from v1 schedule`,
                scriptId: oldSchedule.scriptId,
                cronExpression: cronExpression,
                timezone: 'UTC',
                nodes: oldSchedule.node ? [oldSchedule.node] : [],
                meshes: oldSchedule.meshId ? [oldSchedule.meshId] : [],
                priority: 'normal',
                concurrency: {
                    maxPerNode: 1,
                    maxPerMesh: 10,
                    maxGlobal: 50
                },
                maintenanceWindowIds: [],
                dependsOn: [],
                jitter: 0,
                missedJobPolicy: 'skip',
                enabled: true,
                createdBy: 'system',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                nextRun: oldSchedule.nextRunTime || Date.now(),
                lastRun: oldSchedule.lastRunTime || null,
                runCount: 0,
                failCount: 0,
                _v1ScheduleId: oldSchedule._id // Keep reference to old schedule
            };
            
            await db.scriptFile.insertOne(newSchedule);
            
            // Mark old schedule as migrated (don't delete for safety)
            await db.scriptFile.updateOne(
                { _id: oldSchedule._id },
                { $set: { migrated: true, migratedToV2: true, migratedAt: Date.now() } }
            );
        }
        
        console.log(`ScriptTask: Successfully migrated ${oldSchedules.length} schedules to v2`);
        return { success: true, count: oldSchedules.length };
    } catch (e) {
        console.error('ScriptTask: Error during migration:', e);
        return { success: false, error: e.message };
    }
};

/**
 * Rollback migration (restore v1 schedules)
 */
module.exports.rollbackMigration = async function(db, formatId) {
    console.log('ScriptTask: Rolling back v2 migration...');
    
    try {
        // Remove migrated flag from v1 schedules
        await db.scriptFile.updateMany(
            { type: 'jobSchedule', migrated: true },
            { $unset: { migrated: '', migratedToV2: '', migratedAt: '' } }
        );
        
        // Delete v2 schedules that were created from migration
        const result = await db.scriptFile.deleteMany({
            type: 'schedule_v2',
            _v1ScheduleId: { $exists: true }
        });
        
        console.log(`ScriptTask: Rollback complete. Removed ${result.deletedCount} v2 schedules`);
        return { success: true, count: result.deletedCount };
    } catch (e) {
        console.error('ScriptTask: Error during rollback:', e);
        return { success: false, error: e.message };
    }
};

/**
 * Document type definitions for reference
 */
module.exports.schema = {
    schedule_v2: {
        type: "schedule_v2",
        name: "String",
        description: "String",
        scriptId: "String",
        cronExpression: "String",
        timezone: "String",
        nodes: "Array<String>",
        meshes: "Array<String>",
        priority: "String", // critical, high, normal, low
        concurrency: {
            maxPerNode: "Number",
            maxPerMesh: "Number",
            maxGlobal: "Number"
        },
        maintenanceWindowIds: "Array<String>",
        dependsOn: "Array<String>",
        jitter: "Number",
        missedJobPolicy: "String", // skip, immediate, queue
        enabled: "Boolean",
        createdBy: "String",
        createdAt: "Number",
        updatedAt: "Number",
        nextRun: "Number",
        lastRun: "Number",
        runCount: "Number",
        failCount: "Number"
    },
    
    remediation_workflow: {
        type: "remediation_workflow",
        name: "String",
        description: "String",
        trigger: {
            type: "String", // script_result, threshold, manual, schedule
            condition: "Object"
        },
        steps: "Array<Object>",
        escalationPolicyId: "String",
        rollbackEnabled: "Boolean",
        enabled: "Boolean",
        createdBy: "String",
        createdAt: "Number",
        updatedAt: "Number"
    },
    
    remediation_execution: {
        type: "remediation_execution",
        workflowId: "String",
        nodeId: "String",
        status: "String", // running, success, failed, rolled_back
        currentStepId: "String",
        stepResults: "Array<Object>",
        alerts: "Array<Object>",
        startedAt: "Number",
        completedAt: "Number",
        triggeredBy: "String"
    },
    
    maintenance_window: {
        type: "maintenance_window",
        name: "String",
        description: "String",
        cronExpression: "String",
        timezone: "String",
        duration: "Number",
        allowedPriorities: "Array<String>",
        enabled: "Boolean",
        createdBy: "String",
        createdAt: "Number"
    },
    
    job_v2: {
        type: "job",
        priority: "String",
        retryCount: "Number",
        maxRetries: "Number",
        dependsOn: "Array<String>",
        remediationExecutionId: "String",
        tags: "Array<String>",
        metadata: "Object"
    }
};

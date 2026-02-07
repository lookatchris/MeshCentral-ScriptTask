/**
 * @description Workflow builder for MeshCentral-ScriptTask remediation
 * @author Enhanced by Copilot
 * @license Apache-2.0
 */

"use strict";

class WorkflowBuilder {
    constructor(workflowDefinition) {
        this.workflow = workflowDefinition || {};
        this.errors = [];
        this.stateMachine = null;
        this.stepTypes = ['script', 'webhook', 'email', 'delay', 'condition'];
    }
    
    /**
     * Validate complete workflow structure
     * @returns {Object} { valid: Boolean, errors: Array }
     */
    validateWorkflow() {
        this.errors = [];
        
        // Check workflow has steps
        if (!this.workflow.steps || !Array.isArray(this.workflow.steps)) {
            this.errors.push('Workflow must have a steps array');
            return { valid: false, errors: this.errors };
        }
        
        if (this.workflow.steps.length === 0) {
            this.errors.push('Workflow must have at least one step');
            return { valid: false, errors: this.errors };
        }
        
        // Validate all step IDs are unique
        const stepIds = this.workflow.steps.map(s => s.id);
        const uniqueIds = new Set(stepIds);
        if (stepIds.length !== uniqueIds.size) {
            this.errors.push('All step IDs must be unique');
        }
        
        // Validate each step
        for (const step of this.workflow.steps) {
            this.validateStep(step);
        }
        
        // Check all referenced step IDs exist
        for (const step of this.workflow.steps) {
            if (step.onSuccess && !stepIds.includes(step.onSuccess)) {
                this.errors.push(`Step ${step.id}: onSuccess references non-existent step ${step.onSuccess}`);
            }
            if (step.onFailure && !stepIds.includes(step.onFailure)) {
                this.errors.push(`Step ${step.id}: onFailure references non-existent step ${step.onFailure}`);
            }
        }
        
        // Check for start step
        if (!this.workflow.startStep) {
            this.errors.push('Workflow must have a startStep defined');
        } else if (!stepIds.includes(this.workflow.startStep)) {
            this.errors.push(`startStep ${this.workflow.startStep} does not exist in steps`);
        }
        
        // Check for at least one end step
        const hasEndStep = this.workflow.steps.some(step => 
            !step.onSuccess && !step.onFailure
        );
        if (!hasEndStep) {
            console.log('ScriptTask WorkflowBuilder: Warning - No explicit end step found (all steps have next steps)');
        }
        
        // Check for circular dependencies
        const circularCheck = this.checkCircularDependencies();
        if (!circularCheck.valid) {
            this.errors.push(...circularCheck.errors);
        }
        
        const valid = this.errors.length === 0;
        if (valid) {
            console.log('ScriptTask WorkflowBuilder: Workflow validation passed');
        } else {
            console.error('ScriptTask WorkflowBuilder: Workflow validation failed:', this.errors);
        }
        
        return { valid, errors: this.errors };
    }
    
    /**
     * Validate individual step
     * @param {Object} step - Step definition
     */
    validateStep(step) {
        // Check required fields
        if (!step.id) {
            this.errors.push('Step must have an id');
            return;
        }
        
        if (!step.type) {
            this.errors.push(`Step ${step.id}: must have a type`);
            return;
        }
        
        if (!this.stepTypes.includes(step.type)) {
            this.errors.push(`Step ${step.id}: invalid type "${step.type}". Must be one of: ${this.stepTypes.join(', ')}`);
        }
        
        // Validate timeout
        if (step.timeout !== undefined) {
            if (typeof step.timeout !== 'number' || step.timeout <= 0) {
                this.errors.push(`Step ${step.id}: timeout must be a positive number`);
            }
        }
        
        // Type-specific validation
        switch (step.type) {
            case 'script':
                this.validateScriptStep(step);
                break;
            case 'webhook':
                this.validateWebhookStep(step);
                break;
            case 'email':
                this.validateEmailStep(step);
                break;
            case 'delay':
                this.validateDelayStep(step);
                break;
            case 'condition':
                this.validateConditionStep(step);
                break;
        }
    }
    
    /**
     * Validate script step
     * @param {Object} step - Script step definition
     */
    validateScriptStep(step) {
        if (!step.scriptId && !step.script) {
            this.errors.push(`Step ${step.id}: script step must have scriptId or script defined`);
        }
    }
    
    /**
     * Validate webhook step
     * @param {Object} step - Webhook step definition
     */
    validateWebhookStep(step) {
        if (!step.url) {
            this.errors.push(`Step ${step.id}: webhook step must have url defined`);
        } else {
            // Basic URL validation
            try {
                new URL(step.url);
            } catch (err) {
                this.errors.push(`Step ${step.id}: invalid webhook URL "${step.url}"`);
            }
        }
        
        if (step.method && !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(step.method)) {
            this.errors.push(`Step ${step.id}: invalid HTTP method "${step.method}"`);
        }
    }
    
    /**
     * Validate email step
     * @param {Object} step - Email step definition
     */
    validateEmailStep(step) {
        if (!step.to) {
            this.errors.push(`Step ${step.id}: email step must have to field defined`);
        }
        
        if (!step.subject) {
            this.errors.push(`Step ${step.id}: email step must have subject defined`);
        }
        
        if (!step.body && !step.template) {
            this.errors.push(`Step ${step.id}: email step must have body or template defined`);
        }
    }
    
    /**
     * Validate delay step
     * @param {Object} step - Delay step definition
     */
    validateDelayStep(step) {
        if (!step.duration) {
            this.errors.push(`Step ${step.id}: delay step must have duration defined`);
        } else if (typeof step.duration !== 'number' || step.duration <= 0) {
            this.errors.push(`Step ${step.id}: delay duration must be a positive number`);
        }
    }
    
    /**
     * Validate condition step
     * @param {Object} step - Condition step definition
     */
    validateConditionStep(step) {
        if (!step.condition) {
            this.errors.push(`Step ${step.id}: condition step must have condition defined`);
        }
        
        if (!step.onTrue && !step.onFalse) {
            this.errors.push(`Step ${step.id}: condition step must have at least onTrue or onFalse defined`);
        }
    }
    
    /**
     * Check for circular dependencies in workflow
     * @returns {Object} { valid: Boolean, errors: Array }
     */
    checkCircularDependencies() {
        const errors = [];
        const visited = new Set();
        const recursionStack = new Set();
        
        const stepMap = new Map();
        for (const step of this.workflow.steps) {
            stepMap.set(step.id, step);
        }
        
        const detectCycle = (stepId, path = []) => {
            if (!stepId) return false;
            
            if (recursionStack.has(stepId)) {
                const cycle = [...path, stepId].join(' -> ');
                errors.push(`Circular dependency detected: ${cycle}`);
                return true;
            }
            
            if (visited.has(stepId)) {
                return false;
            }
            
            visited.add(stepId);
            recursionStack.add(stepId);
            
            const step = stepMap.get(stepId);
            if (step) {
                const newPath = [...path, stepId];
                
                if (step.onSuccess) {
                    detectCycle(step.onSuccess, newPath);
                }
                
                if (step.onFailure) {
                    detectCycle(step.onFailure, newPath);
                }
                
                if (step.type === 'condition') {
                    if (step.onTrue) {
                        detectCycle(step.onTrue, newPath);
                    }
                    if (step.onFalse) {
                        detectCycle(step.onFalse, newPath);
                    }
                }
            }
            
            recursionStack.delete(stepId);
            return false;
        };
        
        // Check from start step
        if (this.workflow.startStep) {
            detectCycle(this.workflow.startStep);
        }
        
        // Also check any unvisited steps (disconnected components)
        for (const step of this.workflow.steps) {
            if (!visited.has(step.id)) {
                detectCycle(step.id);
            }
        }
        
        return { valid: errors.length === 0, errors };
    }
    
    /**
     * Build state machine from workflow definition
     * @returns {Object} State machine representation
     */
    buildStateMachine() {
        const validation = this.validateWorkflow();
        if (!validation.valid) {
            console.error('ScriptTask WorkflowBuilder: Cannot build state machine - validation failed');
            throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
        }
        
        const stepMap = new Map();
        for (const step of this.workflow.steps) {
            stepMap.set(step.id, {
                id: step.id,
                type: step.type,
                config: this.extractStepConfig(step),
                timeout: step.timeout || 300,
                transitions: this.buildTransitions(step)
            });
        }
        
        this.stateMachine = {
            name: this.workflow.name || 'Unnamed Workflow',
            description: this.workflow.description || '',
            startStep: this.workflow.startStep,
            steps: stepMap,
            metadata: {
                version: this.workflow.version || '1.0',
                createdAt: this.workflow.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        };
        
        console.log(`ScriptTask WorkflowBuilder: State machine built with ${stepMap.size} steps`);
        return this.stateMachine;
    }
    
    /**
     * Extract step configuration
     * @param {Object} step - Step definition
     * @returns {Object} Step configuration
     */
    extractStepConfig(step) {
        const config = { ...step };
        delete config.id;
        delete config.type;
        delete config.timeout;
        delete config.onSuccess;
        delete config.onFailure;
        delete config.onTrue;
        delete config.onFalse;
        return config;
    }
    
    /**
     * Build transitions for a step
     * @param {Object} step - Step definition
     * @returns {Object} Transitions object
     */
    buildTransitions(step) {
        const transitions = {};
        
        if (step.type === 'condition') {
            if (step.onTrue) transitions.onTrue = step.onTrue;
            if (step.onFalse) transitions.onFalse = step.onFalse;
        } else {
            if (step.onSuccess) transitions.onSuccess = step.onSuccess;
            if (step.onFailure) transitions.onFailure = step.onFailure;
        }
        
        return transitions;
    }
    
    /**
     * Get next step based on current step and result
     * @param {String} currentStepId - Current step ID
     * @param {Object} result - Step execution result
     * @returns {String|null} Next step ID or null if end
     */
    getNextStep(currentStepId, result) {
        if (!this.stateMachine) {
            console.error('ScriptTask WorkflowBuilder: State machine not built');
            return null;
        }
        
        const step = this.stateMachine.steps.get(currentStepId);
        if (!step) {
            console.error(`ScriptTask WorkflowBuilder: Step ${currentStepId} not found`);
            return null;
        }
        
        const transitions = step.transitions;
        
        // Handle condition step
        if (step.type === 'condition') {
            if (result.conditionResult === true && transitions.onTrue) {
                console.log(`ScriptTask WorkflowBuilder: Condition true, moving to ${transitions.onTrue}`);
                return transitions.onTrue;
            }
            if (result.conditionResult === false && transitions.onFalse) {
                console.log(`ScriptTask WorkflowBuilder: Condition false, moving to ${transitions.onFalse}`);
                return transitions.onFalse;
            }
            return null;
        }
        
        // Handle success/failure transitions
        if (result.success && transitions.onSuccess) {
            console.log(`ScriptTask WorkflowBuilder: Step succeeded, moving to ${transitions.onSuccess}`);
            return transitions.onSuccess;
        }
        
        if (!result.success && transitions.onFailure) {
            console.log(`ScriptTask WorkflowBuilder: Step failed, moving to ${transitions.onFailure}`);
            return transitions.onFailure;
        }
        
        console.log(`ScriptTask WorkflowBuilder: No next step defined, workflow ending`);
        return null;
    }
    
    /**
     * Export workflow to JSON
     * @returns {String} JSON representation
     */
    exportWorkflow() {
        try {
            const exported = {
                name: this.workflow.name,
                description: this.workflow.description,
                version: this.workflow.version || '1.0',
                startStep: this.workflow.startStep,
                steps: this.workflow.steps,
                metadata: {
                    exportedAt: new Date().toISOString(),
                    builderVersion: '1.0'
                }
            };
            
            const json = JSON.stringify(exported, null, 2);
            console.log('ScriptTask WorkflowBuilder: Workflow exported successfully');
            return json;
        } catch (err) {
            console.error('ScriptTask WorkflowBuilder: Export failed:', err.message);
            throw new Error(`Failed to export workflow: ${err.message}`);
        }
    }
    
    /**
     * Import workflow from JSON
     * @param {String} json - JSON workflow definition
     * @returns {Object} Imported workflow
     */
    importWorkflow(json) {
        try {
            const imported = JSON.parse(json);
            
            if (!imported.steps || !imported.startStep) {
                throw new Error('Invalid workflow JSON: missing steps or startStep');
            }
            
            this.workflow = {
                name: imported.name || 'Imported Workflow',
                description: imported.description || '',
                version: imported.version || '1.0',
                startStep: imported.startStep,
                steps: imported.steps,
                createdAt: imported.metadata?.exportedAt || new Date().toISOString()
            };
            
            console.log(`ScriptTask WorkflowBuilder: Workflow imported: ${this.workflow.name}`);
            
            // Validate imported workflow
            const validation = this.validateWorkflow();
            if (!validation.valid) {
                console.error('ScriptTask WorkflowBuilder: Imported workflow validation failed');
                throw new Error(`Imported workflow is invalid: ${validation.errors.join(', ')}`);
            }
            
            return this.workflow;
        } catch (err) {
            console.error('ScriptTask WorkflowBuilder: Import failed:', err.message);
            throw new Error(`Failed to import workflow: ${err.message}`);
        }
    }
    
    /**
     * Get workflow summary
     * @returns {Object} Workflow summary
     */
    getSummary() {
        return {
            name: this.workflow.name || 'Unnamed Workflow',
            stepCount: this.workflow.steps?.length || 0,
            startStep: this.workflow.startStep,
            stepTypes: this.getStepTypesSummary(),
            hasCircularDependencies: !this.checkCircularDependencies().valid,
            isValid: this.validateWorkflow().valid
        };
    }
    
    /**
     * Get summary of step types in workflow
     * @returns {Object} Step types count
     */
    getStepTypesSummary() {
        const summary = {};
        if (this.workflow.steps) {
            for (const step of this.workflow.steps) {
                summary[step.type] = (summary[step.type] || 0) + 1;
            }
        }
        return summary;
    }
    
    /**
     * Get step by ID
     * @param {String} stepId - Step ID
     * @returns {Object|null} Step definition
     */
    getStep(stepId) {
        if (!this.workflow.steps) return null;
        return this.workflow.steps.find(s => s.id === stepId) || null;
    }
    
    /**
     * Get all steps
     * @returns {Array} All steps
     */
    getSteps() {
        return this.workflow.steps || [];
    }
    
    /**
     * Get workflow name
     * @returns {String} Workflow name
     */
    getName() {
        return this.workflow.name || 'Unnamed Workflow';
    }
    
    /**
     * Get start step
     * @returns {Object|null} Start step definition
     */
    getStartStep() {
        if (!this.workflow.startStep) return null;
        return this.getStep(this.workflow.startStep);
    }
}

module.exports = WorkflowBuilder;

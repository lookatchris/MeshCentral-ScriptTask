/**
 * @description Condition evaluators for MeshCentral-ScriptTask remediation
 * @author Enhanced by Copilot
 * @license Apache-2.0
 */

"use strict";

class ConditionEvaluator {
    constructor() {
        this.operators = {
            'eq': (a, b) => a === b,
            'ne': (a, b) => a !== b,
            'gt': (a, b) => a > b,
            'gte': (a, b) => a >= b,
            'lt': (a, b) => a < b,
            'lte': (a, b) => a <= b,
            'contains': (a, b) => String(a).includes(String(b)),
            'notContains': (a, b) => !String(a).includes(String(b)),
            'regex': (a, b) => new RegExp(b).test(String(a)),
            'in': (a, b) => Array.isArray(b) && b.includes(a),
            'notIn': (a, b) => Array.isArray(b) && !b.includes(a)
        };
    }
    
    /**
     * Evaluate a condition against job result
     * @param {Object} condition - Condition definition
     * @param {Object} jobResult - Job execution result
     * @returns {Boolean}
     */
    evaluate(condition, jobResult) {
        try {
            if (!condition || !condition.type) {
                return false;
            }
            
            switch (condition.type) {
                case 'exitCode':
                    return this.evaluateExitCode(condition, jobResult);
                
                case 'outputPattern':
                    return this.evaluateOutputPattern(condition, jobResult);
                
                case 'threshold':
                    return this.evaluateThreshold(condition, jobResult);
                
                case 'jsonPath':
                    return this.evaluateJsonPath(condition, jobResult);
                
                case 'composite':
                    return this.evaluateComposite(condition, jobResult);
                
                default:
                    console.error(`ScriptTask Conditions: Unknown condition type: ${condition.type}`);
                    return false;
            }
        } catch (e) {
            console.error('ScriptTask Conditions: Error evaluating condition', e);
            return false;
        }
    }
    
    /**
     * Evaluate exit code condition
     * @param {Object} condition - { exitCode: number, operator: string }
     * @param {Object} jobResult
     * @returns {Boolean}
     */
    evaluateExitCode(condition, jobResult) {
        const exitCode = jobResult.exitCode !== undefined ? jobResult.exitCode : null;
        const expected = condition.exitCode;
        const operator = condition.operator || 'eq';
        
        if (exitCode === null) return false;
        
        const opFunc = this.operators[operator];
        if (!opFunc) return false;
        
        return opFunc(exitCode, expected);
    }
    
    /**
     * Evaluate output pattern condition
     * @param {Object} condition - { pattern: string, matchType: 'contains'|'regex', caseSensitive: boolean }
     * @param {Object} jobResult
     * @returns {Boolean}
     */
    evaluateOutputPattern(condition, jobResult) {
        const output = jobResult.output || jobResult.stdout || '';
        const pattern = condition.pattern;
        const matchType = condition.matchType || 'contains';
        const caseSensitive = condition.caseSensitive !== false;
        
        let searchText = output;
        let searchPattern = pattern;
        
        if (!caseSensitive) {
            searchText = searchText.toLowerCase();
            searchPattern = searchPattern.toLowerCase();
        }
        
        switch (matchType) {
            case 'contains':
                return searchText.includes(searchPattern);
            
            case 'notContains':
                return !searchText.includes(searchPattern);
            
            case 'regex':
                try {
                    const flags = caseSensitive ? '' : 'i';
                    const regex = new RegExp(searchPattern, flags);
                    return regex.test(output);
                } catch (e) {
                    console.error('ScriptTask Conditions: Invalid regex', e);
                    return false;
                }
            
            case 'startsWith':
                return searchText.startsWith(searchPattern);
            
            case 'endsWith':
                return searchText.endsWith(searchPattern);
            
            default:
                return false;
        }
    }
    
    /**
     * Evaluate threshold condition (for numeric values)
     * @param {Object} condition - { field: string, operator: string, value: number }
     * @param {Object} jobResult
     * @returns {Boolean}
     */
    evaluateThreshold(condition, jobResult) {
        const field = condition.field;
        const operator = condition.operator || 'gt';
        const threshold = condition.value;
        
        // Extract value from job result
        let actualValue = this.extractField(jobResult, field);
        
        // Try to parse as number
        if (typeof actualValue === 'string') {
            actualValue = parseFloat(actualValue);
        }
        
        if (isNaN(actualValue)) return false;
        
        const opFunc = this.operators[operator];
        if (!opFunc) return false;
        
        return opFunc(actualValue, threshold);
    }
    
    /**
     * Evaluate JSON path condition
     * @param {Object} condition - { path: string, operator: string, value: any }
     * @param {Object} jobResult
     * @returns {Boolean}
     */
    evaluateJsonPath(condition, jobResult) {
        const path = condition.path;
        const operator = condition.operator || 'eq';
        const expected = condition.value;
        
        // Try to parse output as JSON
        let data = jobResult;
        if (typeof jobResult.output === 'string') {
            try {
                data = JSON.parse(jobResult.output);
            } catch (e) {
                // Not JSON, treat as regular output
                data = { output: jobResult.output };
            }
        }
        
        // Extract value using path
        const actualValue = this.extractField(data, path);
        
        const opFunc = this.operators[operator];
        if (!opFunc) return false;
        
        return opFunc(actualValue, expected);
    }
    
    /**
     * Evaluate composite condition (AND, OR, NOT)
     * @param {Object} condition - { logic: 'and'|'or'|'not', conditions: [] }
     * @param {Object} jobResult
     * @returns {Boolean}
     */
    evaluateComposite(condition, jobResult) {
        const logic = condition.logic || 'and';
        const conditions = condition.conditions || [];
        
        switch (logic) {
            case 'and':
                return conditions.every(c => this.evaluate(c, jobResult));
            
            case 'or':
                return conditions.some(c => this.evaluate(c, jobResult));
            
            case 'not':
                return !this.evaluate(conditions[0], jobResult);
            
            default:
                return false;
        }
    }
    
    /**
     * Extract field value using dot notation
     * @param {Object} obj
     * @param {String} path
     * @returns {any}
     */
    extractField(obj, path) {
        if (!path) return obj;
        
        const parts = path.split('.');
        let current = obj;
        
        for (const part of parts) {
            if (current == null) return null;
            
            // Handle array access
            if (part.includes('[')) {
                const arrayMatch = part.match(/(\w+)\[(\d+)\]/);
                if (arrayMatch) {
                    const arrayName = arrayMatch[1];
                    const index = parseInt(arrayMatch[2]);
                    current = current[arrayName];
                    if (Array.isArray(current)) {
                        current = current[index];
                    }
                } else {
                    current = current[part];
                }
            } else {
                current = current[part];
            }
        }
        
        return current;
    }
    
    /**
     * Validate condition definition
     * @param {Object} condition
     * @returns {Object} - { valid: boolean, errors: [] }
     */
    validateCondition(condition) {
        const errors = [];
        
        if (!condition) {
            errors.push('Condition is required');
            return { valid: false, errors };
        }
        
        if (!condition.type) {
            errors.push('Condition type is required');
        }
        
        switch (condition.type) {
            case 'exitCode':
                if (condition.exitCode === undefined) {
                    errors.push('Exit code value is required');
                }
                break;
            
            case 'outputPattern':
                if (!condition.pattern) {
                    errors.push('Pattern is required');
                }
                break;
            
            case 'threshold':
                if (!condition.field) {
                    errors.push('Field is required');
                }
                if (condition.value === undefined) {
                    errors.push('Threshold value is required');
                }
                break;
            
            case 'jsonPath':
                if (!condition.path) {
                    errors.push('JSON path is required');
                }
                break;
            
            case 'composite':
                if (!condition.logic) {
                    errors.push('Logic operator is required');
                }
                if (!Array.isArray(condition.conditions) || condition.conditions.length === 0) {
                    errors.push('Conditions array is required and must not be empty');
                }
                break;
        }
        
        return { valid: errors.length === 0, errors };
    }
}

module.exports = ConditionEvaluator;

/**
 * @description Timezone handler for MeshCentral-ScriptTask
 * @author Enhanced by Copilot
 * @license Apache-2.0
 */

"use strict";

const { DateTime } = require('luxon');

class TimezoneHandler {
    constructor() {
        this.validTimezones = this._getValidTimezones();
    }
    
    /**
     * Get list of valid IANA timezone identifiers
     */
    _getValidTimezones() {
        // Common timezones - in production, you might want to use a more comprehensive list
        return [
            'UTC',
            'America/New_York',
            'America/Chicago',
            'America/Denver',
            'America/Los_Angeles',
            'America/Phoenix',
            'America/Anchorage',
            'America/Honolulu',
            'Europe/London',
            'Europe/Paris',
            'Europe/Berlin',
            'Europe/Madrid',
            'Europe/Rome',
            'Europe/Amsterdam',
            'Asia/Tokyo',
            'Asia/Shanghai',
            'Asia/Hong_Kong',
            'Asia/Singapore',
            'Asia/Dubai',
            'Asia/Kolkata',
            'Australia/Sydney',
            'Australia/Melbourne',
            'Pacific/Auckland'
        ];
    }
    
    /**
     * Validate timezone string
     * @param {String} timezone - IANA timezone identifier
     * @returns {Boolean}
     */
    validateTimezone(timezone) {
        if (!timezone) return false;
        
        try {
            // Try to create a DateTime with this timezone
            DateTime.now().setZone(timezone);
            return DateTime.now().setZone(timezone).isValid;
        } catch (e) {
            return false;
        }
    }
    
    /**
     * Convert time from one timezone to another
     * @param {Number} timestamp - Unix timestamp in milliseconds
     * @param {String} fromTz - Source timezone
     * @param {String} toTz - Target timezone
     * @returns {Object} - { timestamp, formatted, timezone }
     */
    convertTimezone(timestamp, fromTz, toTz) {
        try {
            const dt = DateTime.fromMillis(timestamp, { zone: fromTz });
            const converted = dt.setZone(toTz);
            
            return {
                timestamp: converted.toMillis(),
                formatted: converted.toISO(),
                timezone: toTz,
                offset: converted.offset,
                offsetFormatted: converted.offsetNameShort
            };
        } catch (e) {
            console.error('ScriptTask Timezone: Conversion error', e);
            return null;
        }
    }
    
    /**
     * Get current time in specified timezone
     * @param {String} timezone - IANA timezone identifier
     * @returns {Object}
     */
    now(timezone = 'UTC') {
        try {
            const dt = DateTime.now().setZone(timezone);
            return {
                timestamp: dt.toMillis(),
                formatted: dt.toISO(),
                timezone: timezone,
                offset: dt.offset,
                offsetFormatted: dt.offsetNameShort,
                year: dt.year,
                month: dt.month,
                day: dt.day,
                hour: dt.hour,
                minute: dt.minute,
                second: dt.second
            };
        } catch (e) {
            console.error('ScriptTask Timezone: Error getting current time', e);
            return null;
        }
    }
    
    /**
     * Check if timestamp is during DST transition
     * @param {Number} timestamp
     * @param {String} timezone
     * @returns {Boolean}
     */
    isDSTTransition(timestamp, timezone) {
        try {
            const dt = DateTime.fromMillis(timestamp, { zone: timezone });
            return dt.isInDST;
        } catch (e) {
            return false;
        }
    }
    
    /**
     * Format timestamp for display
     * @param {Number} timestamp
     * @param {String} timezone
     * @param {String} format - luxon format string
     * @returns {String}
     */
    format(timestamp, timezone, format = 'yyyy-MM-dd HH:mm:ss ZZZZ') {
        try {
            const dt = DateTime.fromMillis(timestamp, { zone: timezone });
            return dt.toFormat(format);
        } catch (e) {
            return 'Invalid Date';
        }
    }
    
    /**
     * Get timezone offset in minutes
     * @param {String} timezone
     * @returns {Number}
     */
    getOffset(timezone) {
        try {
            const dt = DateTime.now().setZone(timezone);
            return dt.offset;
        } catch (e) {
            return 0;
        }
    }
    
    /**
     * Get all available timezones
     * @returns {Array}
     */
    getAvailableTimezones() {
        return this.validTimezones;
    }
}

module.exports = TimezoneHandler;

/**
 * @description Authentication middleware for MeshCentral-ScriptTask API
 * @author Enhanced by Copilot
 * @license Apache-2.0
 */

"use strict";

const jwt = require('jsonwebtoken');

class AuthMiddleware {
    constructor(meshServer, config) {
        this.meshServer = meshServer;
        this.config = config;
        // Generate JWT secret or use configured one
        this.jwtSecret = config.jwtSecret || this.generateSecret();
        this.apiKeys = new Map(); // apiKey -> { userId, permissions }
    }
    
    /**
     * Generate a random JWT secret
     */
    generateSecret() {
        return require('crypto').randomBytes(64).toString('hex');
    }
    
    /**
     * JWT Authentication middleware
     */
    authenticate() {
        return async (req, res, next) => {
            try {
                // Check for JWT token in Authorization header
                const authHeader = req.headers.authorization;
                
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    const token = authHeader.substring(7);
                    return this.verifyJWT(token, req, res, next);
                }
                
                // Check for API key in header
                const apiKey = req.headers['x-api-key'];
                if (apiKey) {
                    return this.verifyAPIKey(apiKey, req, res, next);
                }
                
                // Check for MeshCentral session cookie
                const sessionAuth = await this.verifyMeshCentralSession(req);
                if (sessionAuth) {
                    req.user = sessionAuth;
                    return next();
                }
                
                // No valid authentication
                return res.status(401).json({ error: 'Authentication required' });
            } catch (e) {
                console.error('ScriptTask Auth: Authentication error', e);
                return res.status(500).json({ error: 'Authentication error' });
            }
        };
    }
    
    /**
     * Verify JWT token
     */
    verifyJWT(token, req, res, next) {
        try {
            const decoded = jwt.verify(token, this.jwtSecret);
            req.user = {
                userId: decoded.userId,
                username: decoded.username,
                siteAdmin: decoded.siteAdmin || false,
                permissions: decoded.permissions || []
            };
            next();
        } catch (e) {
            console.error('ScriptTask Auth: Invalid JWT token', e.message);
            return res.status(401).json({ error: 'Invalid token' });
        }
    }
    
    /**
     * Verify API key
     */
    verifyAPIKey(apiKey, req, res, next) {
        const keyData = this.apiKeys.get(apiKey);
        
        if (!keyData) {
            return res.status(401).json({ error: 'Invalid API key' });
        }
        
        req.user = {
            userId: keyData.userId,
            username: keyData.username,
            siteAdmin: keyData.siteAdmin || false,
            permissions: keyData.permissions || [],
            apiKey: true
        };
        
        next();
    }
    
    /**
     * Verify MeshCentral session
     */
    async verifyMeshCentralSession(req) {
        try {
            // Extract session cookie
            if (!req.cookies || !req.cookies.connect_sid) {
                return null;
            }
            
            // This is a simplified version - in production, you'd need to
            // integrate with MeshCentral's session store
            // For now, we'll return null and require JWT/API key auth
            
            return null;
        } catch (e) {
            console.error('ScriptTask Auth: Error verifying MeshCentral session', e);
            return null;
        }
    }
    
    /**
     * Check if user has admin permissions
     */
    requireAdmin() {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            
            // Check siteAdmin property (normalize to lowercase for consistency)
            const isAdmin = req.user.siteAdmin || req.user.siteadmin;
            
            // For MeshCentral users, also check the bitwise flag
            if (!isAdmin && !(req.user.siteadmin & 0xFFFFFFFF)) {
                return res.status(403).json({ error: 'Admin permissions required' });
            }
            
            next();
        };
    }
    
    /**
     * Check if user has specific permission
     */
    requirePermission(permission) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            
            // Check if user is admin (normalize property name)
            const isAdmin = req.user.siteAdmin || req.user.siteadmin;
            
            // Admins have all permissions
            if (isAdmin || (req.user.siteadmin & 0xFFFFFFFF)) {
                return next();
            }
            
            // Check specific permission
            if (!req.user.permissions || !req.user.permissions.includes(permission)) {
                return res.status(403).json({ error: `Permission '${permission}' required` });
            }
            
            next();
        };
    }
    
    /**
     * Generate JWT token for user
     * @param {Object} user - User object with userId, username, siteAdmin
     * @param {String} expiresIn - Token expiration (e.g., '24h', '7d')
     * @returns {String} JWT token
     */
    generateToken(user, expiresIn = '24h') {
        const payload = {
            userId: user.userId || user._id,
            username: user.username || user.name,
            siteAdmin: user.siteAdmin || false,
            permissions: user.permissions || []
        };
        
        return jwt.sign(payload, this.jwtSecret, { expiresIn });
    }
    
    /**
     * Create API key for user
     * @param {String} userId
     * @param {String} username
     * @param {Object} options
     * @returns {String} API key
     */
    createAPIKey(userId, username, options = {}) {
        const apiKey = 'stask_' + require('crypto').randomBytes(32).toString('hex');
        
        this.apiKeys.set(apiKey, {
            userId: userId,
            username: username,
            siteAdmin: options.siteAdmin || false,
            permissions: options.permissions || [],
            createdAt: Date.now()
        });
        
        return apiKey;
    }
    
    /**
     * Revoke API key
     * @param {String} apiKey
     * @returns {Boolean}
     */
    revokeAPIKey(apiKey) {
        return this.apiKeys.delete(apiKey);
    }
    
    /**
     * List all API keys for a user
     * @param {String} userId
     * @returns {Array}
     */
    listAPIKeys(userId) {
        const keys = [];
        for (const [key, data] of this.apiKeys.entries()) {
            if (data.userId === userId) {
                keys.push({
                    key: key.substring(0, 20) + '...',  // Masked
                    createdAt: data.createdAt,
                    permissions: data.permissions
                });
            }
        }
        return keys;
    }
}

module.exports = AuthMiddleware;

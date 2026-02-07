const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const winston = require('winston');
const AuthMiddleware = require('./middleware/auth');

class APIServer {
    constructor(meshServer, db, scheduler, remediationEngine, config) {
        this.meshServer = meshServer;
        this.db = db;
        this.scheduler = scheduler;
        this.remediationEngine = remediationEngine;
        this.config = config;
        this.app = express();
        this.httpServer = null;
        this.io = null;
        this.auth = null;
        this.logger = this.createLogger();
        
        this.setupMiddleware();
    }

    createLogger() {
        return winston.createLogger({
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.printf(({ timestamp, level, message }) => {
                    return `${timestamp} [${level.toUpperCase()}] ScriptTask API: ${message}`;
                })
            ),
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ 
                    filename: path.join(this.config.logsPath || './logs', 'api.log')
                })
            ]
        });
    }

    setupMiddleware() {
        this.app.use(helmet());
        
        const allowedOrigins = this.config.api?.cors?.origins || ['http://localhost:3000'];
        this.app.use(cors({
            origin: allowedOrigins,
            credentials: true
        }));

        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        const rateLimitConfig = this.config.api?.rateLimit || {
            windowMs: 15 * 60 * 1000,
            max: 100
        };
        const limiter = rateLimit(rateLimitConfig);
        this.app.use('/api/', limiter);

        this.app.use((req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                this.logger.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
            });
            next();
        });
    }

    async initialize() {
        this.logger.info('Initializing API server...');
        
        this.httpServer = createServer(this.app);
        
        const allowedOrigins = this.config.api?.cors?.origins || ['http://localhost:3000'];
        this.io = new Server(this.httpServer, {
            cors: {
                origin: allowedOrigins,
                credentials: true
            }
        });

        this.auth = new AuthMiddleware(this.db, this.config);
        
        this.setupRoutes();
        this.setupWebSocket();
        
        this.logger.info('API server initialized');
    }

    setupRoutes() {
        this.logger.info('Setting up routes...');

        const schedules = require('./routes/schedules');
        const remediation = require('./routes/remediation');
        const jobs = require('./routes/jobs');
        const scripts = require('./routes/scripts');
        const nodes = require('./routes/nodes');

        this.app.get('/api/health', (req, res) => {
            res.json({ 
                status: 'healthy', 
                timestamp: new Date().toISOString(),
                version: require('../package.json').version
            });
        });

        this.app.post('/api/auth/login', async (req, res, next) => {
            try {
                const { username, password } = req.body;
                const result = await this.auth.login(username, password);
                res.json(result);
            } catch (error) {
                next(error);
            }
        });

        this.app.post('/api/auth/token', async (req, res, next) => {
            try {
                const { token } = req.body;
                const result = await this.auth.verifyToken(token);
                res.json(result);
            } catch (error) {
                next(error);
            }
        });

        this.app.use('/api/schedules', this.auth.authenticate(), schedules(this.scheduler, this.db));
        this.app.use('/api/remediation', this.auth.authenticate(), remediation(this.remediationEngine, this.db));
        this.app.use('/api/jobs', this.auth.authenticate(), jobs(this.scheduler, this.db));
        this.app.use('/api/scripts', this.auth.authenticate(), scripts(this.db));
        this.app.use('/api/nodes', this.auth.authenticate(), nodes(this.meshServer, this.db));

        const webappDistPath = path.join(__dirname, '../webapp/dist');
        const fs = require('fs');
        if (fs.existsSync(webappDistPath)) {
            this.app.use(express.static(webappDistPath));
            this.app.get('*', (req, res) => {
                if (!req.path.startsWith('/api')) {
                    res.sendFile(path.join(webappDistPath, 'index.html'));
                }
            });
        }

        this.app.use((req, res) => {
            res.status(404).json({ error: 'Not found' });
        });

        this.app.use((error, req, res, next) => {
            this.logger.error(`Error handling ${req.method} ${req.path}: ${error.message}`);
            this.logger.error(error.stack);
            
            const statusCode = error.statusCode || 500;
            res.status(statusCode).json({
                error: error.message || 'Internal server error',
                ...(this.config.api?.debug && { stack: error.stack })
            });
        });

        this.logger.info('Routes configured');
    }

    setupWebSocket() {
        this.logger.info('Setting up WebSocket...');

        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
                if (!token) {
                    return next(new Error('Authentication required'));
                }
                
                const user = await this.auth.verifyToken(token);
                socket.user = user;
                next();
            } catch (error) {
                next(new Error('Authentication failed'));
            }
        });

        this.io.on('connection', (socket) => {
            this.logger.info(`WebSocket client connected: ${socket.id} (user: ${socket.user?.username || 'unknown'})`);

            socket.on('disconnect', () => {
                this.logger.info(`WebSocket client disconnected: ${socket.id}`);
            });

            socket.on('error', (error) => {
                this.logger.error(`WebSocket error for ${socket.id}: ${error.message}`);
            });
        });

        this.logger.info('WebSocket configured');
    }

    broadcastUpdate(event, data) {
        if (this.io) {
            this.io.emit(event, data);
            this.logger.debug(`Broadcast event: ${event}`);
        }
    }

    async start() {
        const port = this.config.api?.port || 3000;
        const host = this.config.api?.host || '0.0.0.0';

        return new Promise((resolve, reject) => {
            this.httpServer.listen(port, host, (error) => {
                if (error) {
                    this.logger.error(`Failed to start API server: ${error.message}`);
                    reject(error);
                } else {
                    this.logger.info(`API server listening on ${host}:${port}`);
                    resolve();
                }
            });
        });
    }

    async stop() {
        this.logger.info('Stopping API server...');

        return new Promise((resolve) => {
            if (this.io) {
                this.io.close(() => {
                    this.logger.info('WebSocket server closed');
                });
            }

            if (this.httpServer) {
                this.httpServer.close(() => {
                    this.logger.info('HTTP server closed');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = APIServer;

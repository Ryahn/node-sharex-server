/**
 * @author ravi0lii and contributors
 * @author Ryahn
 * @version 2.0.0
 * @description A simple file uploader for ShareX using Node.js and Express.
 * @license MIT
 */

// Optimize V8 memory usage for large file uploads
require('v8').setFlagsFromString('--max_old_space_size=4096');

const config = require("./config.json");
const version = require("./package.json").version;
const PORT = config.port || 3000;
const logger = require("silly-logger");
const path = require("path");
const fs = require("fs");
const exphbs = require("express-handlebars");
const bodyParser = require("body-parser");
const express = require("express");
const colors = require("colors");
const WebSocket = require('ws');

// Import routes and middleware
const routes = require("./routes/index");
const fileIndex = require("./routes/fileIndex");
const middleware = require("./libs/middleware");

// Initialize Express app
const app = express();

// Security and performance middleware
app.disable('x-powered-by');
app.set('trust proxy', 1); // Trust first proxy for rate limiting

// Apply security headers globally
app.use(middleware.securityHeaders);

// Body parser configuration with security limits
app.use(bodyParser.json({ 
    limit: '10mb',
    strict: true,
    type: 'application/json'
}));

app.use(bodyParser.urlencoded({
    extended: true,
    limit: '10mb',
    parameterLimit: 100 // Limit number of parameters
}));

// Request timeout middleware
app.use((req, res, next) => {
    // Set timeout for requests (30 minutes for large uploads)
    req.setTimeout(30 * 60 * 1000, () => {
        logger.warn(`Request timeout for ${req.method} ${req.url}`);
        if (!res.headersSent) {
            res.status(408).json({
                success: false,
                error: { message: "Request timeout" }
            });
        }
    });
    next();
});

/**
 * Create upload directory if it doesn't exist
 */
function ensureUploadDirectory() {
    try {
        if (config.useLocalStaticServe && !fs.existsSync(config.uploadDirectory)) {
            fs.mkdirSync(config.uploadDirectory, { recursive: true });
            logger.info("Created upload directory");
        }
    } catch (error) {
        logger.error(`Failed to create upload directory: ${error.message}`);
        process.exit(1);
    }
}

/**
 * Validate configuration
 */
function validateConfig() {
    const requiredFields = ['port', 'name', 'keys', 'uploadDirectory'];
    const missingFields = requiredFields.filter(field => !config[field]);
    
    if (missingFields.length > 0) {
        logger.error(`Missing required configuration fields: ${missingFields.join(', ')}`);
        process.exit(1);
    }
    
    // Validate keys
    if (typeof config.keys !== 'object' || Object.keys(config.keys).length === 0) {
        logger.error('No API keys configured');
        process.exit(1);
    }
    
    // Validate file size limits
    if (config.fileSizeLimit && config.fileSizeLimit <= 0) {
        logger.error('Invalid file size limit');
        process.exit(1);
    }
    
    logger.info('Configuration validated successfully');
}

// Validate configuration on startup
validateConfig();
ensureUploadDirectory();

/**
 * Handlebars configuration with security enhancements
 */
app.engine('hbs', exphbs.engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views/layouts'),
    partialsDir: path.join(__dirname, 'views/partials'),
    helpers: {
        eq: function(a, b) {
            return a === b;
        },
        add: function(a, b) {
            return parseInt(a) + parseInt(b);
        },
        subtract: function(a, b) {
            return parseInt(a) - parseInt(b);
        },
        formatFileSize: function(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        },
        formatDate: function(date) {
            return new Date(date).toLocaleDateString();
        }
    },
    // Security: prevent prototype pollution
    runtimeOptions: {
        allowProtoPropertiesByDefault: false,
        allowProtoMethodsByDefault: false
    }
}));

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files with caching and security headers
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d', // Cache static files for 1 day
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
        // Additional security headers for static files
        res.setHeader('X-Content-Type-Options', 'nosniff');
        
        // Set appropriate cache headers based on file type
        if (path.endsWith('.css') || path.endsWith('.js')) {
            res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
        } else if (path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg')) {
            res.setHeader('Cache-Control', 'public, max-age=604800'); // 1 week
        }
    }
}));

// Apply rate limiting to upload routes
app.use('/upload', middleware.rateLimit(50, 15 * 60 * 1000)); // 50 requests per 15 minutes
app.use('/delete', middleware.rateLimit(100, 15 * 60 * 1000)); // 100 requests per 15 minutes

// Mount routes
app.use("/", routes);

if (config.useFileIndex) {
    app.use("/files", fileIndex);
}

// Global error handler
app.use((err, req, res, next) => {
    const shortKey = req.locals?.shortKey || 'unknown';
    logger.error(`Unhandled error: ${err.message} (${shortKey})`);
    
    if (!res.headersSent) {
        res.status(500).json({
            success: false,
            error: { message: "Internal server error" }
        });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: { message: "Not found" }
    });
});

// Create HTTP/HTTPS server based on configuration
let server;
if (!config.ssl?.useSSL) {
    const http = require("http");
    server = http.createServer(app);
    logger.info('HTTP server configured');
} else {
    const https = require("https");
    
    try {
        const sslOptions = {
            key: fs.readFileSync(config.ssl.privateKeyPath, "utf8"),
            cert: fs.readFileSync(config.ssl.certificatePath, "utf8"),
        };
        
        server = https.createServer(sslOptions, app);
        logger.info('HTTPS server configured');
    } catch (error) {
        logger.error(`Failed to load SSL certificates: ${error.message}`);
        process.exit(1);
    }
}

// WebSocket server for real-time upload progress
const wss = new WebSocket.Server({ 
    server,
    clientTracking: true,
    maxPayload: 1024 // Limit WebSocket message size
});

// Store active uploads with progress information
const activeUploads = new Map();

// WebSocket connection handler with enhanced security
wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    logger.info(`WebSocket connection from ${clientIp}`);
    
    // Set connection timeout
    const connectionTimeout = setTimeout(() => {
        ws.terminate();
    }, 5 * 60 * 1000); // 5 minutes
    
    ws.on('message', (message) => {
        try {
            // Clear timeout on activity
            clearTimeout(connectionTimeout);
            
            // Limit message size
            if (message.length > 1024) {
                ws.close(1009, 'Message too large');
                return;
            }
            
            const data = JSON.parse(message);
            
            // Client requesting to track a specific upload
            if (data.type === 'track' && data.uploadId && typeof data.uploadId === 'string') {
                ws.uploadId = data.uploadId;
                
                // Send initial progress if available
                if (activeUploads.has(data.uploadId)) {
                    ws.send(JSON.stringify(activeUploads.get(data.uploadId)));
                }
            }
        } catch (error) {
            logger.error(`WebSocket message error from ${clientIp}: ${error.message}`);
            ws.close(1003, 'Invalid message format');
        }
    });
    
    ws.on('close', () => {
        clearTimeout(connectionTimeout);
        logger.debug(`WebSocket connection closed from ${clientIp}`);
    });
    
    ws.on('error', (error) => {
        logger.error(`WebSocket error from ${clientIp}: ${error.message}`);
        clearTimeout(connectionTimeout);
    });
});

// Cleanup old upload progress data periodically
setInterval(() => {
    const now = Date.now();
    for (const [uploadId, data] of activeUploads.entries()) {
        // Remove uploads older than 1 hour
        if (now - data.timestamp > 60 * 60 * 1000) {
            activeUploads.delete(uploadId);
        }
    }
}, 10 * 60 * 1000); // Run every 10 minutes

// Server configuration
server.timeout = 3600000; // 1 hour timeout for large uploads
server.keepAliveTimeout = 65000; // Keep alive timeout
server.headersTimeout = 66000; // Headers timeout

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
    logger.info(`${signal} signal received: closing HTTP server`);
    
    server.close((err) => {
        if (err) {
            logger.error(`Error during server shutdown: ${err.message}`);
            process.exit(1);
        }
        
        logger.info('HTTP server closed');
        
        // Close WebSocket connections
        wss.clients.forEach((ws) => {
            ws.terminate();
        });
        
        logger.info('WebSocket server closed');
        process.exit(0);
    });
    
    // Force close after 30 seconds
    setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
    process.exit(1);
});

// Start server
server.listen(PORT, () => {
    console.log(colors.cyan(`ShareX Upload Server v${version}`));
    console.log(colors.green(`Server listening on port ${PORT}`));
    console.log(colors.yellow(`Upload directory: ${config.uploadDirectory}`));
    console.log(colors.yellow(`Max file size: ${config.fileSizeLimit ? (config.fileSizeLimit / (1024 * 1024)).toFixed(2) + 'MB' : 'unlimited'}`));
    console.log(colors.yellow(`SSL enabled: ${config.ssl?.useSSL ? 'Yes' : 'No'}`));
    console.log(colors.blue(`Server URL: ${config.serverUrl}`));
});

// Export for testing
module.exports = { app, server, wss };

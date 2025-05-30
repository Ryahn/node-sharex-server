const response = require('./response.js');
const logger = require('silly-logger');
const config = require('../config.json');

// Create a lookup table for faster key validation
const keyToUsername = new Map();

// Initialize the key-to-username mapping
for (const username in config.keys) {
    const key = config.keys[username];
    if (key && typeof key === 'string') {
        keyToUsername.set(key, username);
        logger.debug(`Initialized key mapping for user: ${username} (key: ${key.substr(0, 3)}...)`);
    } else {
        logger.warn(`Invalid key for user ${username}: ${typeof key}`);
    }
}

logger.info(`Initialized ${keyToUsername.size} API key mappings`);

/**
 * Validates API key from various sources
 * @param {Object} req - Express request object
 * @returns {string|null} - API key if found, null otherwise
 */
function extractApiKey(req) {
    // 1. Try to get from query parameters (for GET requests or URL params)
    if (req.query?.key) {
        logger.debug(`extractApiKey: Found key in query params`);
        return req.query.key;
    }
    
    // 2. Try to get from body (for parsed form data)
    if (req.body?.key) {
        logger.debug(`extractApiKey: Found key in body`);
        return req.body.key;
    }
    
    // 3. Try to get from headers (some clients might send it there)
    if (req.headers['x-api-key']) {
        logger.debug(`extractApiKey: Found key in x-api-key header`);
        return req.headers['x-api-key'];
    }
    
    // 4. Try Authorization header (Bearer token format)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        logger.debug(`extractApiKey: Found key in Authorization header`);
        return authHeader.substring(7);
    }
    
    logger.debug(`extractApiKey: No key found in any location`);
    return null;
}

/**
 * Validates if the provided key is registered
 * @param {string} key - API key to validate
 * @returns {string|null} - Username if valid, null otherwise
 */
function validateApiKey(key) {
    if (!key || typeof key !== 'string') {
        logger.debug(`validateApiKey: Invalid key type or empty key`);
        return null;
    }
    
    const username = keyToUsername.get(key);
    logger.debug(`validateApiKey: Key lookup result: ${username || 'not found'} (map size: ${keyToUsername.size})`);
    
    // Debug: Show first few characters of all keys for comparison
    if (!username) {
        const allKeys = Array.from(keyToUsername.keys()).map(k => k.substr(0, 10) + '...');
        logger.debug(`validateApiKey: Available keys: ${allKeys.join(', ')}`);
        logger.debug(`validateApiKey: Looking for key: ${key.substr(0, 10)}...`);
    }
    
    return username || null;
}

/**
 * Middleware to require valid API key authentication
 */
module.exports.keyRequired = function (req, res, next) {
    try {
        // Initialize req.locals
        req.locals = req.locals || {};

        // Extract API key from request
        const key = extractApiKey(req);
        logger.debug(`keyRequired middleware: Extracted key: ${key ? key.substr(0, 3) + '...' : 'none'} for ${req.method} ${req.path}`);
        
        // Handle multipart forms that haven't been parsed yet
        if (!key && req.headers['content-type']?.includes('multipart/form-data')) {
            // The key should be in the form data, which will be parsed by multer later
            // Let it pass through for now, the upload handler will check again
            logger.info('Multipart form detected, key will be validated after parsing');
            return next();
        }

        // If no key was found through any method
        if (!key) {
            logger.info('No API key provided in request');
            return response.emptyKey(res);
        }

        // Validate key length (basic security check)
        if (key.length < 10) {
            logger.info(`API key too short: ${key.substr(0, 3)}...`);
            return response.invalidKey(res);
        }

        // Check if key is registered
        const username = validateApiKey(key);
        logger.debug(`keyRequired middleware: Key validation result: ${username || 'failed'}`);
        
        if (!username) {
            logger.info(`Failed authentication with key ${key.substr(0, 3)}...`);
            return response.invalidKey(res);
        }

        // Add key info to request locals
        req.locals.shortKey = key.substr(0, 3) + '...';
        req.locals.username = username;
        req.locals.fullKey = key; // Store full key for later use if needed
        
        logger.info(`Successful authentication with key ${req.locals.shortKey} (${username})`);
        next();
        
    } catch (error) {
        logger.error(`Authentication middleware error: ${error.message}`);
        logger.error(`Stack trace: ${error.stack}`);
        return response.invalidKey(res);
    }
};

/**
 * Optional middleware for routes that can work with or without authentication
 */
module.exports.keyOptional = function (req, res, next) {
    try {
        // Initialize req.locals
        req.locals = req.locals || {};

        // Extract API key from request
        const key = extractApiKey(req);
        
        if (key) {
            // Validate key if provided
            const username = validateApiKey(key);
            if (username) {
                req.locals.shortKey = key.substr(0, 3) + '...';
                req.locals.username = username;
                req.locals.fullKey = key;
                logger.info(`Optional authentication successful with key ${req.locals.shortKey} (${username})`);
            } else {
                logger.info(`Optional authentication failed with key ${key.substr(0, 3)}...`);
            }
        }
        
        next();
        
    } catch (error) {
        logger.error(`Optional authentication middleware error: ${error.message}`);
        // Don't fail the request for optional auth
        next();
    }
};

/**
 * Rate limiting middleware (basic implementation)
 * @param {number} maxRequests - Maximum requests per window
 * @param {number} windowMs - Time window in milliseconds
 */
module.exports.rateLimit = function(maxRequests = 100, windowMs = 15 * 60 * 1000) {
    const requests = new Map();
    
    return function(req, res, next) {
        const clientId = req.locals?.username || req.ip;
        const now = Date.now();
        
        // Clean up old entries
        for (const [id, data] of requests.entries()) {
            if (now - data.resetTime > windowMs) {
                requests.delete(id);
            }
        }
        
        // Get or create client data
        let clientData = requests.get(clientId);
        if (!clientData || now - clientData.resetTime > windowMs) {
            clientData = {
                count: 0,
                resetTime: now
            };
            requests.set(clientId, clientData);
        }
        
        // Check rate limit
        if (clientData.count >= maxRequests) {
            logger.warn(`Rate limit exceeded for ${clientId}`);
            return res.status(429).json({
                success: false,
                error: {
                    message: "Too many requests",
                    fix: "Please wait before making more requests"
                }
            });
        }
        
        // Increment counter
        clientData.count++;
        
        // Add rate limit headers
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - clientData.count));
        res.setHeader('X-RateLimit-Reset', new Date(clientData.resetTime + windowMs).toISOString());
        
        next();
    };
};

/**
 * Security headers middleware
 */
module.exports.securityHeaders = function(req, res, next) {
    // Basic security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Remove server information
    res.removeHeader('X-Powered-By');
    
    next();
};

// Export the key-to-username mapping for backward compatibility
module.exports.keyToUsername = Object.fromEntries(keyToUsername);

// Export utility functions
module.exports.extractApiKey = extractApiKey;
module.exports.validateApiKey = validateApiKey;
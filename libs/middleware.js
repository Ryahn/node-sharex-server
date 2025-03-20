const response = require('./response.js');
const logger = require('silly-logger');
const config = require('../config.json');

// Create a lookup table for faster key validation
const keyToUsername = {};

// Initialize the key-to-username mapping
for (const username in config.keys) {
    const key = config.keys[username];
    keyToUsername[key] = username;
}

module.exports.keyRequired = function (req, res, next) {
    // Initialize req.locals
    req.locals = req.locals || {};

    // Try to get the key from multiple possible sources
    let key = null;
    
    // 1. Try to get from query parameters (for GET requests or URL params)
    if (req.query && req.query.key) {
        key = req.query.key;
    }
    
    // 2. Try to get from body (for parsed form data)
    else if (req.body && req.body.key) {
        key = req.body.key;
    }
    
    // 3. Try to get from headers (some clients might send it there)
    else if (req.headers && req.headers['x-api-key']) {
        key = req.headers['x-api-key'];
    }
    
    // 4. For multipart forms that haven't been parsed yet
    else if (req.headers && req.headers['content-type'] && 
             req.headers['content-type'].includes('multipart/form-data')) {
        // The key should be in the form data, which will be parsed by multer later
        // Let it pass through for now, the upload handler will check again
        logger.info('Multipart form detected, key will be validated after parsing');
        next();
        return;
    }

    // If no key was found through any method
    if (!key) {
        logger.auth('No key provided in request');
        response.emptyKey(res);
        return;
    }

    // Check if key is registered
    const username = keyToUsername[key];
    if (!username) {
        logger.auth(`Failed authentication with key ${key.substr(0, 3)}...`);
        response.invalidKey(res);
        return;
    }

    // Add key info to request locals
    req.locals.shortKey = key.substr(0, 3) + '...';
    req.locals.username = username;
    
    logger.auth(`Successful authentication with key ${req.locals.shortKey} (${username})`);
    next();
};

module.exports.keyToUsername = keyToUsername;
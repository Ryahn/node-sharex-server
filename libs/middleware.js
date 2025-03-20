const response = require('./response.js');
const logger = require('silly-logger');
const config = require('../config.json');

const keyToUsername = {};
Object.entries(config.keys).forEach(([user, apiKey]) => {
    keyToUsername[apiKey] = user;
});

module.exports.keyRequired = function (req, res, next) {
    // Initialize req.locals
    req.locals = req.locals || {};
    
    // Get key from request body or query parameters
    const key = req.body.key || req.query.key;
    if (!key) {
        response.emptyKey(res);
        return;
    }

    // Check if key is registered using direct lookup
    const username = keyToUsername[key];
    if (!username) {
        logger.auth(`Failed authentication with key ${key.substr(0, 3)}...`);
        response.invalidKey(res);
        return;
    }

    // Add short key and username to request locals
    req.locals.shortKey = key.substr(0, 3) + '...';
    req.locals.username = username;

    logger.auth(`Authentication with key ${req.locals.shortKey} (user: ${username}) succeeded`);
    next();
};
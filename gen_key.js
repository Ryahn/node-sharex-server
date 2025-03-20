const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// Generate a secure random key
function generateKey(length = 40) {
    // Characters to use in the key (alphanumeric + some special characters)
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+';
    let key = '';
    
    // Generate cryptographically secure random bytes
    const randomBytes = crypto.randomBytes(length);
    
    // Convert random bytes to characters from our charset
    for (let i = 0; i < length; i++) {
        const randomIndex = randomBytes[i] % chars.length;
        key += chars[randomIndex];
    }
    
    return key;
}

// Read the config file
const configPath = path.join(__dirname, 'config.json');
let config;

try {
    const configData = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(configData);
    
    // Generate a new key
    const newKey = generateKey();
    
    // Prompt for a key name
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    readline.question('Enter a name for this key: ', (keyName) => {
        // Initialize keys object if it doesn't exist
        if (!config.keys) {
            config.keys = {};
        }
        
        // Add the new key with the provided name
        config.keys[keyName] = newKey;
        
        // Write the updated config back to the file
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf8');
        
        console.log(`New key generated for "${keyName}" and added to config.json:`);
        console.log(newKey);
        
        readline.close();
    });
    
} catch (error) {
    console.error('Error updating config file:', error.message);
    process.exit(1);
}

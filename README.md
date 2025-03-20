## Personal Image Hosting

This is based off of [node-sharex-server](https://github.com/ravi0lii/node-sharex-server)

- [What is this](#what-is-this)
- [Installation](#installation)
- [Configuration](#configuration)
- [ShareX client configuration](#sharex-client-configuration)
- [License](#license)  

# What is this
node-sharex-server is a [ShareX](https://getsharex.com) upload server which is easy to setup and to use. Currently node-sharex-server provides the following features:
* File-sharing:
    * Uploading files (also images)
    * Allowing only configured file extensions (for more safety)

# Installation
**NOTE:** You must have node installed. I personally like using [nvm](https://github.com/nvm-sh/nvm) to install node.

### Step 1:
Clone repository
```bash
git clone https://github.com/Ryahn/node-sharex-server.git
```

### Step 2:
Install dependencies
```bash
npm install
```

### Step 3:
Generate key
```bash
node gen_key.js
```

### Step 4:
Run server
```bash
node app.js
```

## Step 5 (Optional)
If you want to use SSL, you can generate a self-signed certificate and private key.
```bash
openssl genrsa -out private-key.pem 2048
openssl req -new -key private-key.pem -out csr.pem
```

Update config.json with the following:
```json
"ssl": {
    "useSSL": true,
    "privateKeyPath": "private-key.pem",
    "certificatePath": "csr.pem"
}
```

## Step 6 (Optional)
If you want to use PM2 to run the server, you can use the following command:
```bash
pm2 start --name "image_host" app.js
```

# Configuration
**NOTE:** To make changes effective, you have to restart the server!  
You can configure the server in the `config.json` file. Options:
* `port`: The port the server should listen on.
* `name`: The name of the server.
* `keys`: You can add keys (authentication tokens) here. Use gen_key.js to generate a key.
* `useFileIndex`: Enable the file index page.
* `pagination`: Pagination options
    * `itemsPerPage`: The number of items per page.
* `fileSizeLimit`: You can set the file size limit (in bytes) here. Example: You want to set the limit to 100 mb. That means we have to change the value to 100 (MB) \* 1024 (kB) \* 1024 (B) = 104857600 (B).
* `largeFileSizeLimit`: The size limit for large files (in bytes).
* `fileNameLength`: The length of the generated file names.
* `useLocalStaticServe`: Use the express.static middleware to serve the uploaded files.
* `staticFileServerUrl`: The url that should be sent to the ShareX client.
* `serverUrl`: The url where you can reach the server without the finalizing slash (/).
* `uploadDirectory`: The directory that should be used for saving the files.
* `ssl`: SSL-related options
    * `useSSL`:
    * `privateKeyPath`: The path to the ssl private key.
    * `certificatePath`: The path to the ssl certificate.
* `fileExtensionCheck`: Check the extension of uploaded files
    * `enabled`: Is this feature enabled?
    * `extensionsAllowed`: The extensions which are whitelisted (if the feature is enabled).

# Large File Uploads
You must have nginx configured to handle large file uploads.
You you will need possibly 4GB or more of RAM to handle large file uploads.

# ShareX Configuration
Got to http(s)://<server_url>/config to get the ShareX configuration.

## Nginx Configuration
See [Nginx Config](/nginx.conf)

# License
[MIT](/LICENSE)









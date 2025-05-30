# ShareX Upload Server - Optimized Edition

A high-performance, secure file upload server designed for ShareX with enhanced features and optimizations.

## 🚀 Key Optimizations & Features

### Performance Improvements
- **Async/Await Consistency**: All file operations use modern async/await patterns
- **Memory Optimization**: V8 memory flags optimized for large file uploads
- **Stream Processing**: Efficient streaming for large file uploads with progress tracking
- **Caching**: Static file caching with appropriate cache headers
- **Connection Management**: Optimized timeouts and keep-alive settings

### Security Enhancements
- **Path Traversal Protection**: Comprehensive filename validation and sanitization
- **Rate Limiting**: Built-in rate limiting for upload and delete endpoints
- **Security Headers**: Comprehensive security headers (XSS, CSRF, etc.)
- **Input Validation**: Enhanced validation for all user inputs
- **API Key Security**: Improved key validation with length checks

### Code Quality
- **Error Handling**: Comprehensive error handling with proper cleanup
- **Type Safety**: Better parameter validation and type checking
- **Code Organization**: Modular structure with utility functions
- **Documentation**: Extensive JSDoc documentation
- **Constants**: Extracted constants for better maintainability

### New Features
- **WebSocket Support**: Real-time upload progress tracking
- **Enhanced Logging**: Detailed logging with performance metrics
- **Graceful Shutdown**: Proper cleanup on server shutdown
- **File Metadata**: Extended file information in responses
- **Health Monitoring**: Better error tracking and monitoring

## 📋 Requirements

- Node.js 14.x or higher
- npm or yarn package manager

## 🛠️ Installation

1. Clone the repository:
```bash
git clone https://github.com/Ryahn/node-sharex-server.git
cd node-sharex-server
```

2. Install dependencies:
```bash
npm install
```

3. Copy and configure the config file:
```bash
cp config-example.json config.json
```

4. Edit `config.json` with your settings:
```json
{
    "port": 3854,
    "name": "YourServerName",
    "keys": {
        "username": "your-secure-api-key-here"
    },
    "fileSizeLimit": 59999999,
    "largeFileSizeLimit": 5368709120,
    "fileNameLength": 8,
    "useLocalStaticServe": true,
    "useFileIndex": true,
    "staticFileServerUrl": "https://your-domain.com/f/",
    "serverUrl": "https://your-domain.com",
    "uploadDirectory": "uploads/",
    "ssl": {
        "useSSL": false,
        "privateKeyPath": "",
        "certificatePath": ""
    },
    "fileExtensionCheck": {
        "enabled": true,
        "extensionsAllowed": [
            ".png", ".jpg", ".jpeg", ".gif", ".mkv", 
            ".mp4", ".m4v", ".webm", ".avif", ".webp"
        ]
    }
}
```

## 🚀 Usage

### Starting the Server

```bash
npm start
```

The server will start and display:
- Server version and port
- Upload directory location
- Maximum file size
- SSL status
- Server URL

### API Endpoints

#### Upload File
```
POST /upload
Content-Type: multipart/form-data

Parameters:
- file: The file to upload
- key: Your API key
```

#### Download File
```
GET /f/:filename
```

#### Delete File
```
GET /delete?filename=:filename&key=:key
```

#### Get ShareX Config
```
GET /config?key=:key
```

### ShareX Configuration

1. Visit `/config?key=your-api-key` in your browser
2. Download the `.sxcu` configuration file
3. Import it into ShareX

## 🔧 Configuration Options

### File Upload Settings
- `fileSizeLimit`: Maximum file size for regular uploads (bytes)
- `largeFileSizeLimit`: Maximum file size for streaming uploads (bytes)
- `fileNameLength`: Length of random string in generated filenames
- `uploadDirectory`: Directory to store uploaded files

### Security Settings
- `fileExtensionCheck.enabled`: Enable/disable file extension validation
- `fileExtensionCheck.extensionsAllowed`: Array of allowed file extensions
- `keys`: Object mapping usernames to API keys

### Server Settings
- `port`: Server port
- `name`: Server name (used in ShareX config)
- `serverUrl`: Public server URL
- `staticFileServerUrl`: URL for serving uploaded files
- `useLocalStaticServe`: Serve files locally vs external CDN
- `useFileIndex`: Enable file listing interface

### SSL Settings
- `ssl.useSSL`: Enable HTTPS
- `ssl.privateKeyPath`: Path to SSL private key
- `ssl.certificatePath`: Path to SSL certificate

## 🔒 Security Features

### Rate Limiting
- Upload endpoint: 50 requests per 15 minutes
- Delete endpoint: 100 requests per 15 minutes
- Configurable per-user limits

### File Validation
- Extension whitelist/blacklist
- MIME type validation
- File size limits
- Path traversal prevention

### Security Headers
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin

## 📊 Performance Features

### Large File Support
- Streaming uploads for files > regular limit
- Progress tracking via WebSocket
- Memory-efficient processing
- Automatic cleanup on errors

### Caching
- Static file caching (1 day for CSS/JS, 1 week for images)
- ETag support
- Last-Modified headers
- Cache-Control headers

### Connection Management
- 1-hour timeout for large uploads
- Keep-alive optimization
- Graceful shutdown handling
- Connection pooling

## 🐳 Docker Support

Build and run with Docker:

```bash
docker build -t sharex-server .
docker run -p 3854:3854 -v $(pwd)/uploads:/app/uploads sharex-server
```

Or use Docker Compose:

```bash
docker-compose up -d
```

## 📝 API Response Format

All API responses follow a consistent format:

### Success Response
```json
{
    "success": true,
    "message": "File uploaded successfully",
    "data": {
        "file": {
            "url": "https://your-domain.com/f/filename.ext",
            "delete_url": "https://your-domain.com/delete?filename=filename.ext&key=your-key"
        }
    },
    "timestamp": "2023-01-01T00:00:00.000Z"
}
```

### Error Response
```json
{
    "success": false,
    "error": {
        "message": "Invalid file extension",
        "code": "INVALID_EXTENSION",
        "fix": "Upload a file with an allowed extension",
        "timestamp": "2023-01-01T00:00:00.000Z"
    }
}
```

## 🔧 Development

### Project Structure
```
├── app.js                 # Main application file
├── config.json           # Configuration file
├── package.json          # Dependencies and scripts
├── routes/
│   ├── index.js          # Main routes (upload, delete, config)
│   └── fileIndex.js      # File listing routes
├── libs/
│   ├── middleware.js     # Authentication and security middleware
│   ├── response.js       # Response utilities
│   ├── handleLargeFile.js # Large file upload handler
│   └── utils.js          # Common utility functions
├── views/                # Handlebars templates
├── public/               # Static assets
└── uploads/              # Upload directory
```

### Adding New Features

1. Create utility functions in `libs/utils.js`
2. Add middleware in `libs/middleware.js`
3. Create routes in `routes/`
4. Use consistent error handling with `libs/response.js`

## 🚨 Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| EMPTY_KEY | API key is required | 400 |
| INVALID_KEY | Invalid API key | 401 |
| NO_FILE | No file was uploaded | 400 |
| INVALID_EXTENSION | Invalid file extension | 400 |
| FILE_TOO_LARGE | File exceeds size limit | 413 |
| FILE_NOT_FOUND | File not found | 404 |
| RATE_LIMITED | Too many requests | 429 |
| SERVER_ERROR | Internal server error | 500 |

## 📈 Monitoring

The server provides detailed logging for:
- Authentication attempts
- File uploads/downloads
- Error conditions
- Performance metrics
- Security events

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Original ShareX upload server by ravi0lii
- Enhanced and optimized by Ryahn
- Community contributions and feedback

## 📞 Support

- GitHub Issues: [Report bugs or request features](https://github.com/Ryahn/node-sharex-server/issues)
- Documentation: Check this README and inline code documentation
- Community: Join discussions in GitHub Discussions









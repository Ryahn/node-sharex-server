/**
 * @author ravi0lii and contributors
 * @author Ryahn
 * @version 2.0.0
 * @description A simple file uploader for ShareX using Node.js and Express.
 * @license MIT
 */

const config = require("./config.json");
const version = require("./package.json").version;
const PORT = config.port;
const logger = require("silly-logger");
const path = require("path");
const fs = require("fs");
const exphbs = require("express-handlebars");
const bodyParser = require("body-parser");
const express = require("express");
const app = express();
const routes = require("./routes/index");
const colors = require("colors");

app.disable('x-powered-by');
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

/**
 * Create upload directory if it doesn't exist
 */
if (config.useLocalStaticServe && !fs.existsSync(config.uploadDirectory)) {
  fs.mkdirSync(config.uploadDirectory);
  logger.info("Created upload directory");
}

/**
 * Handlebars configuration
 */
app.engine('hbs', exphbs.engine({
  extname: '.hbs',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: path.join(__dirname, 'views/partials')
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files before defining the server
app.use(express.static(path.join(__dirname, 'public')));

app.use("/", routes);

// Add graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
  });
});

// based on whether or not SSL is enabled, run http or https web server
let server;
if (!config.ssl.useSSL) {
  const http = require("http");
  server = http.createServer(app);
} else {
  const https = require("https");
  server = https.createServer(
    {
      key: fs.readFileSync(config.ssl.privateKeyPath, "utf8"),
      cert: fs.readFileSync(config.ssl.certificatePath, "utf8"),
    },
    app
  );
}

server.listen(PORT, () => {
  console.log(colors.cyan("Running on version " + version));
  console.log(colors.green("Now listening on port " + PORT));
});

# Install Docker and Docker Compose

## Step 1: Configure the config.json file
```bash
cp config-example.json config.json
```

## Step 2: Adjust config.json

## Step 3: Configure nginx
See [Nginx Config](/nginx.conf)

## Step 4: Build the Docker image
```bash
docker-compose build
```

## Step 5: Run the Docker container
```bash
docker-compose up -d
```

## Step 6: Generate a key
```bash
docker-compose exec sharex-server node gen_key.js
```

## Step 7: Configure ShareX
Got to http(s)://<server_url>/config to get the ShareX configuration.


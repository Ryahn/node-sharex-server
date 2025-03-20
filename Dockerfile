# Use Node.js LTS as the base image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install dependencies first (for better caching)
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Expose the port the app runs on (from config)
EXPOSE 3854

# Set environment variables
ENV NODE_ENV=production

# Command to run the application
CMD ["node", "app.js"]

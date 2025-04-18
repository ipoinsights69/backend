#!/bin/bash

# Ensure logs directory exists
mkdir -p logs

# Ensure config directory exists
mkdir -p config

# Install dependencies if needed
npm install

# Stop any existing process
pm2 delete ipo-server 2>/dev/null || true

# Start the server with PM2 (includes cron system)
pm2 start index.js --name "ipo-server" \
  --time \
  --log ./logs/pm2-combined.log \
  --env-production \
  -- server  # This passes 'server' as the command argument to index.js

# Display status
echo "Server started with PM2. Checking status..."
pm2 status

# Show cron status
echo "Checking cron status..."
npm run cron:status

echo ""
echo "===================== SERVER STARTED ====================="
echo "• To view logs: pm2 logs ipo-server"
echo "• To restart: pm2 restart ipo-server"
echo "• To stop: pm2 stop ipo-server"
echo "• To run cron job now: npm run cron:run-now"
echo "==========================================================" 
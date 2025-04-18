#!/bin/bash

# IPO Scraper Deployment Script

# Ensure logs directory exists
mkdir -p logs

# Ensure config directory exists
mkdir -p config

# Install dependencies if needed
npm install

# Start/restart the application using PM2
if pm2 list | grep -q "ipo-server"; then
  echo "Restarting ipo-server..."
  pm2 restart ipo-server
else
  echo "Starting ipo-server for the first time..."
  pm2 start ecosystem.config.js
fi

# Wait for application to start
sleep 5

# Check if the application is running
if pm2 list | grep -q "ipo-server"; then
  echo "✅ ipo-server is now running"
  
  # Print cron status
  echo "Checking cron status..."
  npm run cron:status
  
  echo ""
  echo "==================== DEPLOYMENT SUCCESSFUL ===================="
  echo "To view logs: pm2 logs ipo-server"
  echo "To check cron status: npm run cron:status"
  echo "To run cron job immediately: npm run cron:run-now"
  echo "To monitor application: pm2 monit"
  echo "=============================================================="
else
  echo "❌ Failed to start ipo-server"
  exit 1
fi 
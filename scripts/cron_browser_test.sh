#!/bin/bash

# Script for running browser tests in cron environment

# Change to project directory
cd "$(dirname "$0")/.."

# Install dependencies if needed
echo "Checking dependencies..."
if ! command -v xvfb-run &> /dev/null; then
    echo "Installing Xvfb..."
    apt-get update
    apt-get install -y xvfb
fi

# Set up log directory
LOG_DIR="./cron-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/cron-$(date +%Y%m%d-%H%M%S).log"

echo "Starting browser test at $(date)" | tee -a "$LOG_FILE"

# Run with Xvfb to support non-headless mode
export DISPLAY=:99
Xvfb "$DISPLAY" -screen 0 1920x1080x24 > /dev/null 2>&1 &
XVFB_PID=$!

# Set environment variables for captcha if needed
# export CAPTCHA_API_KEY="your-2captcha-key"

# Run the test
echo "Running browser test..." | tee -a "$LOG_FILE"
node tests/testCronMode.js 2>&1 | tee -a "$LOG_FILE"
TEST_EXIT_CODE=${PIPESTATUS[0]}

# Kill Xvfb
kill $XVFB_PID

echo "Test completed with exit code: $TEST_EXIT_CODE" | tee -a "$LOG_FILE"
echo "Logs saved to $LOG_FILE"

# Exit with the test's exit code
exit $TEST_EXIT_CODE 
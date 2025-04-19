#!/usr/bin/env node

/**
 * Production cron runner script
 * This script kills any existing Chrome processes,
 * scrapes the current year's IPO data, and uploads it to MongoDB
 */

const { execSync } = require('child_process');
const path = require('path');
const logger = require('../utils/logger');

// Configure environment for production
process.env.NODE_ENV = 'production';

async function runProductionCron() {
  try {
    logger.info('Starting production cron job');
    
    // Kill any existing Chrome processes to prevent memory issues
    logger.info('Killing existing Chrome processes');
    try {
      // Use the specialized killChrome.js script instead of platform-specific commands
      const killChromeScript = path.join(__dirname, 'killChrome.js');
      execSync(`node ${killChromeScript}`, { stdio: 'inherit' });
      logger.info('Chrome processes killed successfully');
    } catch (error) {
      // It's okay if there were no Chrome processes to kill
      logger.info('Error killing Chrome processes:', error.message);
    }
    
    // Run the scraper for the current year
    logger.info('Running IPO scraper for current year');
    const currentYear = new Date().getFullYear();
    
    // Execute the scraper script with the current year
    const scrapeScript = path.join(__dirname, 'scrapeIpos.js');
    execSync(`node ${scrapeScript} --year=${currentYear}`, { 
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' }
    });
    
    logger.info('Production cron job completed successfully');
  } catch (error) {
    logger.error('Error in production cron job:', error);
    process.exit(1);
  }
}

// Execute the function
runProductionCron().catch(error => {
  logger.error('Uncaught error in production cron job:', error);
  process.exit(1);
}); 
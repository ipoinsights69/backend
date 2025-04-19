#!/usr/bin/env node

/**
 * Setup Startup Cron Job
 * 
 * This script runs on application startup, removes any existing cron jobs,
 * and sets up a fresh daily job for the current year at 2:00 AM.
 * 
 * The job will scrape the current year's IPO data and upload only modified
 * data to MongoDB, with the browser running in headless mode.
 */

const { addCronJob, toggleCronJob, listCronJobs, startCronJobs, stopCronJobs } = require('./cronManager');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Set browser to headless mode in .env
async function setBrowserHeadless() {
  try {
    let envPath = path.join(process.cwd(), '.env');
    let envContent = '';
    
    try {
      envContent = await fs.readFile(envPath, 'utf8');
    } catch (error) {
      // File doesn't exist, create it
      console.log('Creating new .env file...');
    }
    
    // Set BROWSER_HEADLESS to true
    if (!envContent.includes('BROWSER_HEADLESS=')) {
      envContent += '\nBROWSER_HEADLESS=true\n';
    } else {
      envContent = envContent.replace(/BROWSER_HEADLESS=.*\n/g, 'BROWSER_HEADLESS=true\n');
    }
    
    // Set PUPPETEER_HEADLESS to new
    if (!envContent.includes('PUPPETEER_HEADLESS=')) {
      envContent += '\nPUPPETEER_HEADLESS=new\n';
    } else {
      envContent = envContent.replace(/PUPPETEER_HEADLESS=.*\n/g, 'PUPPETEER_HEADLESS=new\n');
    }
    
    await fs.writeFile(envPath, envContent);
    console.log('✅ Browser set to headless mode in .env');
    
    // Update environment variables in current process
    process.env.BROWSER_HEADLESS = 'true';
    process.env.PUPPETEER_HEADLESS = 'new';
  } catch (error) {
    console.error('❌ Error setting browser to headless mode:', error.message);
  }
}

// Remove all existing cron jobs
async function removeAllCronJobs() {
  try {
    // First stop any running jobs
    await stopCronJobs();
    console.log('✅ Stopped all running cron jobs');
    
    // Get list of all jobs
    const jobs = await listCronJobs();
    
    // Load configuration file
    const configPath = path.join(process.cwd(), 'config', 'cron-config.json');
    try {
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);
      
      // Clear all jobs
      config.jobs = [];
      
      // Save updated config
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      console.log(`✅ Removed ${jobs.length} cron jobs from configuration`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('No existing cron configuration found. Creating new one.');
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('❌ Error removing cron jobs:', error.message);
  }
}

// Set up a fresh daily cron job
async function setupFreshCron() {
  try {
    const currentYear = new Date().getFullYear();
    const jobId = `daily-ipo-${currentYear}`;
    
    // Define the cron job to run at 2:00 AM daily
    const cronJob = {
      id: jobId,
      schedule: '0 2 * * *', // 2:00 AM daily
      task: 'scrape-and-upload',
      enabled: true,
      options: {
        year: currentYear,
        concurrency: 2,
        saveToMongo: true,
        overwrite: false, // Only update modified data
        headless: true
      }
    };
    
    // Add the cron job
    await addCronJob(cronJob);
    console.log(`✅ Added cron job: ${jobId}`);
    
    // Enable the job
    await toggleCronJob(jobId, true);
    console.log(`✅ Enabled cron job: ${jobId}`);
    
    // Start the cron system
    const startResult = await startCronJobs();
    console.log(`✅ Started ${startResult.count} cron job(s)`);
    console.log('Active jobs:', startResult.activeJobs.join(', ') || 'None');
    
    return {
      jobId,
      year: currentYear,
      schedule: '0 2 * * *',
      nextRun: new Date(new Date().setHours(2, 0, 0, 0) + (new Date().getHours() >= 2 ? 86400000 : 0)).toLocaleString()
    };
  } catch (error) {
    console.error('❌ Error setting up fresh cron job:', error.message);
    throw error;
  }
}

// Main function
async function setup() {
  console.log('\n🚀 Setting up startup cron job...');
  
  try {
    // Set browser to headless mode
    await setBrowserHeadless();
    
    // Remove all existing cron jobs
    await removeAllCronJobs();
    
    // Set up a fresh daily cron job
    const job = await setupFreshCron();
    
    console.log('\n✅ Startup cron setup complete!');
    console.log('📅 Daily IPO scraping job set up with the following details:');
    console.log(`   Job ID: ${job.jobId}`);
    console.log(`   Year: ${job.year}`);
    console.log(`   Schedule: ${job.schedule} (daily at 2:00 AM)`);
    console.log(`   Next run: ${job.nextRun}`);
    console.log('\n📌 To check cron job status:');
    console.log('npm run cron:status');
    
  } catch (error) {
    console.error('\n❌ Error during startup cron setup:', error.message);
  }
}

// Run the script if executed directly
if (require.main === module) {
  setup();
}

// Export for use in express-server.js
module.exports = setup; 
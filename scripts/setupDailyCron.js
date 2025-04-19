#!/usr/bin/env node

/**
 * Setup Daily Cron Job
 * 
 * This script sets up a daily cron job to scrape the current year's IPO data
 * and upload it to MongoDB.
 * 
 * Usage:
 * node setupDailyCron.js [time] [--force] [--no-mongo] [--mongo] [--year=YYYY]
 * 
 * time: Optional - Cron schedule time in format "HH:MM" (24-hour format)
 *       Default is "02:00" (2:00 AM)
 * 
 * --force: Optional - Force overwrite if the job already exists
 * --no-mongo: Optional - Don't save data to MongoDB (JSON files only)
 * --mongo: Optional - Save data to MongoDB (default)
 * --year=YYYY: Optional - Set a specific year instead of the current year
 */

const { addCronJob, toggleCronJob, listCronJobs, testCronJob, startCronJobs } = require('./cronManager');
require('dotenv').config();

// Convert HH:MM time format to cron expression (run daily at specified time)
function timeToCronExpression(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(n => parseInt(n, 10));
  
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time format: ${timeStr}. Please use HH:MM format (24-hour).`);
  }
  
  return `${minutes} ${hours} * * *`;
}

// Main function
async function setupDailyCron() {
  try {
    console.log('📅 Setting up daily IPO scraper cron job');
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const forceOverwrite = args.includes('--force');
    const noMongo = args.includes('--no-mongo');
    const saveToMongo = args.includes('--mongo') || !noMongo; // Default to true unless --no-mongo is specified
    
    // Get the year if specified
    let year = new Date().getFullYear(); // Default to current year
    for (const arg of args) {
      const yearMatch = arg.match(/^--year=(\d{4})$/);
      if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
        break;
      }
    }
    
    // Get the time argument if provided (default: 02:00)
    let timeStr = '02:00'; // Default time is 2:00 AM
    for (const arg of args) {
      if (arg.match(/^\d{1,2}:\d{2}$/)) {
        timeStr = arg;
        break;
      }
    }
    
    // Convert to cron expression
    const cronSchedule = timeToCronExpression(timeStr);
    
    // Create job ID
    const jobId = `daily-ipo-${year}`;
    
    // Define the cron job
    const cronJob = {
      id: jobId,
      schedule: cronSchedule,
      task: 'scrape-and-upload',
      enabled: true,
      options: {
        year: year,
        concurrency: 2,
        saveToMongo: saveToMongo,
        overwrite: false // Use smart updates
      }
    };
    
    // Check if job already exists
    const existingJobs = await listCronJobs();
    const jobExists = existingJobs.some(job => job.id === jobId);
    
    if (jobExists && !forceOverwrite) {
      console.log(`⚠️ A job with ID "${jobId}" already exists.`);
      console.log('Use --force to overwrite the existing job.');
      process.exit(1);
    }
    
    // Add or update the cron job
    console.log(`Adding cron job: ${jobId}`);
    console.log(`Schedule: ${cronSchedule} (runs daily at ${timeStr})`);
    console.log(`Year: ${year}`);
    console.log(`Save to MongoDB: ${saveToMongo ? 'Yes' : 'No'}`);
    await addCronJob(cronJob);
    
    // Enable the job
    await toggleCronJob(jobId, true);
    console.log(`✅ Cron job ${jobId} has been created and enabled`);
    
    // Test the cron job
    const testResult = await testCronJob(jobId);
    if (testResult.success) {
      const nextRunDate = new Date(testResult.nextExecution);
      console.log(`Next execution: ${nextRunDate.toLocaleString()}`);
    } else {
      console.error(`❌ Cron job test failed: ${testResult.error}`);
    }
    
    // Start cron system if not already running
    console.log('Starting cron system...');
    const startResult = await startCronJobs();
    console.log(`Started ${startResult.count} cron job(s)`);
    console.log('Active jobs:', startResult.activeJobs.join(', ') || 'None');
    
    console.log('\n📌 To check cron job status:');
    console.log('npm run cron:status');
    
    console.log('\n📌 To run the job manually:');
    console.log(`npm run cron -- run-now ${jobId}`);
    
    // Show command equivalent
    console.log('\n📌 Equivalent manual command:');
    console.log(`node scripts/scrapeIpos.js ${year} ${saveToMongo} false`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up cron job:', error.message);
    process.exit(1);
  }
}

// Run the script
setupDailyCron(); 
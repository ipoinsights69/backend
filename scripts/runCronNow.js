#!/usr/bin/env node

/**
 * Run Cron Now
 * 
 * This script immediately runs the IPO scraper for the current year
 * without waiting for the scheduled cron job.
 * 
 * Usage:
 * node runCronNow.js [--year=YYYY] [--no-mongo]
 * 
 * Options:
 * --year=YYYY: Scrape a specific year (default: current year)
 * --no-mongo: Don't save data to MongoDB (JSON files only)
 */

const { scrapeAndUploadForYear } = require('./cronManager');
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

async function runCronNow() {
  try {
    console.log('\n🚀 Running IPO scraper immediately...');
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const noMongo = args.includes('--no-mongo');
    const saveToMongo = !noMongo;
    
    // Get the year if specified
    let year = new Date().getFullYear(); // Default to current year
    for (const arg of args) {
      const yearMatch = arg.match(/^--year=(\d{4})$/);
      if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
        break;
      }
    }
    
    // Set headless mode
    await setBrowserHeadless();
    
    // Friendly info about what's happening
    console.log(`📅 Scraping IPO data for year: ${year}`);
    console.log(`💾 Saving to MongoDB: ${saveToMongo ? 'Yes' : 'No'}`);
    console.log(`🔍 Running in headless mode: Yes`);
    
    // Generate a unique job ID for tracking
    const jobId = `manual-run-${Date.now()}`;
    
    console.log('\n⏳ Starting scrape and upload process...');
    
    // Use the scrapeAndUploadForYear function from cronManager
    await scrapeAndUploadForYear(year, {
      concurrency: 2,
      saveToMongo: saveToMongo,
      overwrite: false, // Only update modified data
      headless: true,
      jobId: jobId
    });
    
    console.log('\n✅ Manual scrape and upload completed!');
    
  } catch (error) {
    console.error('\n❌ Error during manual scrape:', error.message);
    process.exit(1);
  }
}

// Run the script
runCronNow(); 
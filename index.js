/**
 * IPO Scraper
 * Main entry point
 */

// Load environment variables
require('dotenv').config();

// Check command-line arguments
const args = process.argv.slice(2);
const command = args[0] || 'scrape-current';

// Filter out processed arguments
const remainingArgs = args.filter(arg => arg !== command);

// Setup utility to start the cron system
async function ensureCronSystem() {
  try {
    // Only import if needed
    const { startCronJobs } = require('./scripts/cronManager');
    console.log('Starting cron system...');
    await startCronJobs();
    console.log('Cron system started successfully');
  } catch (error) {
    console.error('Failed to start cron system:', error);
  }
}

// Process command
switch (command) {
  case 'scrape-current':
    // Scrape current year IPO data
    const currentYear = new Date().getFullYear();
    console.log(`Starting optimized scraper for current year (${currentYear})`);
    
    // Execute scraper directly for current year
    const { scrapeNewIpos } = require('./scripts/scrapeIpos');
    
    scrapeNewIpos(currentYear)
      .then((success) => {
        console.log('Scraping process completed.');
        process.exit(success ? 0 : 1);
      })
      .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
      });
    break;
    
  case 'scrape':
    // Run scraper with arguments
    // Remove command from remainingArgs to correctly access positional arguments
    const scrapeArgs = remainingArgs.filter(arg => arg !== 'scrape');
    
    // Parse start and end years, ensuring they are valid numbers
    const startYear = parseInt(scrapeArgs[0], 10);
    const endYear = parseInt(scrapeArgs[1] || scrapeArgs[0], 10); 
    
    // Validate year inputs
    if (isNaN(startYear)) {
      console.error('Error: Invalid start year. Please provide a valid year as a number.');
      process.exit(1);
    }
    
    console.log(`Starting optimized scraper for years ${startYear}-${endYear}`);
    
    // Execute scraper directly with specific arguments
    const { scrapeIposByYearRange } = require('./scripts/scrapeIpos');
    
    scrapeIposByYearRange(startYear, endYear)
      .then((success) => {
        console.log('Scraping process completed.');
        process.exit(success ? 0 : 1);
      })
      .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
      });
    break;
    
  case 'cron-start':
    // Just start the cron system
    ensureCronSystem()
      .then(() => {
        console.log('Cron system initialized and running...');
        // Keep process alive
        console.log('Press Ctrl+C to exit');
        setInterval(() => {}, 1000);
      })
      .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
      });
    break;
    
  case 'setup-daily-cron':
    // Setup daily cron job for scraping current year
    const { addCronJob, toggleCronJob } = require('./scripts/cronManager');
    
    // Create a daily job at midnight
    const dailyJob = {
      id: 'daily-ipo-update',
      schedule: '0 0 * * *', // Run at midnight (00:00) every day
      task: 'scrape-current-year',
      enabled: true,
      options: {
        year: new Date().getFullYear() // Current year
      }
    };
    
    addCronJob(dailyJob)
      .then(() => toggleCronJob(dailyJob.id, true))
      .then(() => {
        console.log('Daily cron job set up successfully to run at midnight.');
        console.log('Start the cron system with: node index.js cron-start');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Failed to set up daily cron job:', error);
        process.exit(1);
      });
    break;
    
  default:
    console.error(`Unknown command: ${command}`);
    console.log('Available commands:');
    console.log('  - scrape-current: Scrape IPOs for current year');
    console.log('  - scrape [startYear] [endYear]: Scrape IPOs for specific year range');
    console.log('  - cron-start: Start the cron system');
    console.log('  - setup-daily-cron: Setup a daily midnight cron job for the current year');
    process.exit(1);
} 
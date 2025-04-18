/**
 * IPO Scraper and API Server
 * Main entry point
 */

// Load environment variables
require('dotenv').config();

// Check command-line arguments
const args = process.argv.slice(2);
const command = args[0] || 'server';

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
  case 'server':
    // Start API server
    require('./server');
    break;
    
  case 'scrape':
    // Run scraper with arguments
    const startYear = parseInt(args[1] || new Date().getFullYear(), 10);
    const endYear = parseInt(args[2] || startYear, 10);
    const saveToMongo = args[3] === 'true' || args[3] === '--mongo';
    
    console.log(`Starting scraper for years ${startYear}-${endYear} with MongoDB: ${saveToMongo}`);
    
    // Execute scraper directly with specific arguments
    const { scrapeIposByYearRange } = require('./scripts/scrapeIpos');
    
    scrapeIposByYearRange(startYear, endYear, saveToMongo)
      .then(() => {
        console.log('Scraping process completed.');
        process.exit(0);
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
    
  default:
    console.error(`Unknown command: ${command}`);
    console.log('Available commands:');
    console.log('  - server: Start the API server');
    console.log('  - scrape [startYear] [endYear] [saveMongo]: Run the scraper');
    console.log('  - cron-start: Start only the cron system');
    process.exit(1);
} 
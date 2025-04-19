#!/usr/bin/env node

/**
 * Manual Scrape Script
 * This script serves as an entry point for the manual_scrape command
 * It passes arguments to the scrapeIpos.js script
 */

const { execSync } = require('child_process');
const path = require('path');
require('dotenv').config();

// Process command line arguments
const args = process.argv.slice(2);

// Display help if requested
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: npm run scrape -- [year] [saveToDb] [options]

Arguments:
  year       Year to scrape IPO data for (default: current year)
  saveToDb   Whether to save data to MongoDB (true/false, default: true)

Options:
  --force    Force scrape even if year is in the future
  --help, -h Show this help message

Examples:
  npm run scrape            # Scrape current year and save to DB
  npm run scrape -- 2023    # Scrape 2023 and save to DB
  npm run scrape -- 2025 true --force  # Scrape 2025 and save to DB
  npm run scrape -- 2024 false  # Scrape 2024 but don't save to DB
  `);
  process.exit(0);
}

// Extract command line arguments
let year, saveToDb, force;

// Check for options first
force = args.includes('--force');
// Remove options from args array
const filteredArgs = args.filter(arg => !arg.startsWith('--'));

// Parse remaining arguments
year = filteredArgs[0] ? parseInt(filteredArgs[0], 10) : new Date().getFullYear();
saveToDb = filteredArgs[1] === 'true' || filteredArgs[1] === undefined;

// Validate year
const currentYear = new Date().getFullYear();
if (year > currentYear && !force) {
  console.error(`Error: Year ${year} is in the future. Use --force to override this check.`);
  process.exit(1);
}

console.log(`Starting manual scrape for year ${year}`);
console.log(`Save to DB: ${saveToDb}`);
if (force) console.log('Force mode enabled');

try {
  // Path to the scrapeIpos.js script
  const scraperPath = path.join(__dirname, 'scrapeIpos.js');
  
  // Build command with arguments
  const forceArg = force ? '--force' : '';
  
  // Execute the scrapeIpos.js script with the provided arguments
  execSync(`node ${scraperPath} ${year} ${saveToDb} ${forceArg}`, { 
    stdio: 'inherit' 
  });
  
  console.log(`Manual scrape completed successfully for year ${year}`);
  process.exit(0);
} catch (error) {
  console.error(`Manual scrape failed: ${error.message}`);
  process.exit(1);
} 
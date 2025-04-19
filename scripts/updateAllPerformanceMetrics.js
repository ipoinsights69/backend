#!/usr/bin/env node

/**
 * One-Time Comprehensive Performance Update
 * 
 * This script updates both best and worst listing gains for all IPOs in the database.
 * It should be run once after adding the worst_listing_gains fields to ensure 
 * all existing data is properly populated.
 */
require('dotenv').config();
const { updateListingPerformance } = require('./updateListingGains');

console.log('===== Starting Comprehensive Performance Update =====');
console.log('This script will update both best and worst listing gains for all IPOs.');
console.log('Please wait while the database is being updated...');

updateListingPerformance(true)
  .then(stats => {
    console.log('\n===== Performance Update Summary =====');
    console.log(`Total IPOs processed: ${stats.total}`);
    console.log(`Successfully updated: ${stats.updated}`);
    console.log(`Skipped (no data): ${stats.skipped}`);
    console.log(`Errors encountered: ${stats.errors}`);
    console.log('\nUpdate completed successfully!');
    console.log('You can now use both best and worst listing gains in the application.');
    console.log('===== Update Complete =====');
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed to update performance metrics:', error);
    process.exit(1);
  }); 
#!/usr/bin/env node

/**
 * IPO Listing Gain Calculator Demo
 * 
 * This script demonstrates how to calculate IPO listing gains
 * with the same formula used in the application.
 */
const { calculateGainPercentage, extractPrice } = require('./updateListingGains');

// Sample data in the exact format from the database
const sampleData = {
  "final_issue_price": {
    "bse_sme": "46.00"
  },
  "open": {
    "bse_sme": "87.40"
  },
  "low": {
    "bse_sme": "83.03"
  },
  "high": {
    "bse_sme": "91.77"
  },
  "last_trade": {
    "bse_sme": "91.77"
  }
};

// Extract the prices from the data
const issuePrice = extractPrice(sampleData.final_issue_price);
const openPrice = extractPrice(sampleData.open);
const lowPrice = extractPrice(sampleData.low);
const highPrice = extractPrice(sampleData.high);
const closePrice = extractPrice(sampleData.last_trade);

// Calculate the listing gains
const listingGain = calculateGainPercentage(closePrice, issuePrice);
const worstListingGain = calculateGainPercentage(lowPrice, issuePrice);

// Print the results
console.log('===== IPO Listing Gain Calculator Demo =====');
console.log(`Issue Price: ₹${issuePrice}`);
console.log(`Opening Price: ₹${openPrice}`);
console.log(`Lowest Price: ₹${lowPrice}`);
console.log(`Highest Price: ₹${highPrice}`);
console.log(`Closing Price: ₹${closePrice}`);
console.log('\n===== Performance Metrics =====');
console.log(`Listing Gain: ${listingGain}%`);
console.log(`Worst Listing Gain: ${worstListingGain}%`);

// Show the exact calculation formula
console.log('\n===== Calculation Method =====');
console.log('Listing Gain (%) = ((Closing Price - Issue Price) / Issue Price) × 100');
console.log(`Listing Gain (%) = ((${closePrice} - ${issuePrice}) / ${issuePrice}) × 100`);
console.log(`Listing Gain (%) = (${closePrice - issuePrice} / ${issuePrice}) × 100`);
console.log(`Listing Gain (%) = ${((closePrice - issuePrice) / issuePrice).toFixed(4)} × 100`);
console.log(`Listing Gain (%) = ${listingGain}%`);

// Exit with success code
process.exit(0); 
/**
 * Auto Listing Performance Calculator
 * This script automatically calculates and updates both best and worst listing gains
 * for all IPOs with trading data. Used both for batch updates and integrated with
 * the scraper workflow.
 */
require('dotenv').config();
const db = require('../config/database');
const IpoModel = require('../models/IpoModel');

/**
 * Extract numeric price value from any exchange data
 * @param {Object} exchangeData - Data object with exchange keys
 * @returns {number} - Extracted numeric price or 0
 */
function extractPrice(exchangeData) {
  if (!exchangeData) return 0;

  // Try each exchange in priority order
  const exchanges = ['nse', 'bse', 'nse_sme', 'bse_sme'];
  
  for (const exchange of exchanges) {
    if (exchangeData[exchange] && !isNaN(parseFloat(exchangeData[exchange]))) {
      return parseFloat(exchangeData[exchange]);
    }
  }

  // If no matches in priority list, try any available exchange
  const anyExchange = Object.keys(exchangeData)[0];
  if (anyExchange && !isNaN(parseFloat(exchangeData[anyExchange]))) {
    return parseFloat(exchangeData[anyExchange]);
  }

  return 0;
}

/**
 * Calculate listing gain percentage using the formula:
 * Listing Gain (%) = ((Closing Price - Issue Price) / Issue Price) × 100
 * 
 * @param {number} closingPrice - Closing/last trade price
 * @param {number} issuePrice - Issue price
 * @returns {number|null} - Calculated gain percentage or null
 */
function calculateGainPercentage(closingPrice, issuePrice) {
  if (!issuePrice || issuePrice <= 0 || !closingPrice || closingPrice <= 0) {
    return null;
  }
  
  const gainPercentage = ((closingPrice - issuePrice) / issuePrice) * 100;
  return parseFloat(gainPercentage.toFixed(2));
}

/**
 * Update both best and worst listing performance metrics for all IPOs
 * @param {boolean} verbose - Whether to log detailed messages
 * @returns {Object} - Statistics about the update operation
 */
async function updateListingPerformance(verbose = true) {
  try {
    if (verbose) console.log('Connecting to MongoDB...');
    await db.connectToDatabase();
    
    // Get all listed IPOs from database
    const ipos = await IpoModel.find({ status: 'listed' }).lean();
    if (verbose) console.log(`Found ${ipos.length} listed IPOs in database`);
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    // Process each IPO
    for (const ipo of ipos) {
      try {
        // Skip IPOs without listingDayTrading data
        if (!ipo.listingDayTrading || !ipo.listingDayTrading.data) {
          if (verbose) console.log(`No trading data for IPO: ${ipo.ipo_id}, skipping`);
          skipped++;
          continue;
        }
        
        const data = ipo.listingDayTrading.data;
        
        // Extract prices from trading data using the specified format
        let issuePrice = extractPrice(data.final_issue_price);
        
        // If issue price not found in trading data, try from IPO record
        if (issuePrice <= 0 && ipo.issue_price_numeric) {
          issuePrice = ipo.issue_price_numeric;
        } else if (issuePrice <= 0 && ipo.issue_price) {
          const match = ipo.issue_price.match(/\d+(\.\d+)?/);
          if (match) {
            issuePrice = parseFloat(match[0]);
          }
        }
        
        const lastTradePrice = extractPrice(data.last_trade);
        const lowestPrice = extractPrice(data.low) || extractPrice(data.day_low);
        
        // Calculate both listing gains metrics
        if (issuePrice > 0) {
          let update = { last_performance_update: new Date() };
          let performanceCalculated = false;
          
          // Calculate best listing gain (based on closing price)
          const listingGain = calculateGainPercentage(lastTradePrice, issuePrice);
          if (listingGain !== null) {
            update.listing_gains = `${listingGain}%`;
            update.listing_gains_numeric = listingGain;
            performanceCalculated = true;
            
            if (verbose) {
              console.log(`IPO: ${ipo.ipo_id} Best Listing Gain: ${listingGain}%`);
            }
          }
          
          // Calculate worst listing gain (based on day's lowest price)
          const worstListingGain = calculateGainPercentage(lowestPrice || lastTradePrice, issuePrice);
          if (worstListingGain !== null) {
            update.worst_listing_gains = `${worstListingGain}%`;
            update.worst_listing_gains_numeric = worstListingGain;
            performanceCalculated = true;
            
            if (verbose) {
              console.log(`IPO: ${ipo.ipo_id} Worst Listing Gain: ${worstListingGain}%`);
            }
          }
          
          // Only update if we calculated at least one metric
          if (performanceCalculated) {
            // Update the IPO with the new performance metrics
            await IpoModel.findOneAndUpdate(
              { ipo_id: ipo.ipo_id },
              { $set: update }
            );
            
            if (verbose) {
              console.log(`Updated IPO: ${ipo.ipo_id} performance metrics`);
            }
            updated++;
          } else {
            if (verbose) console.log(`No valid prices found for IPO: ${ipo.ipo_id}, skipping`);
            skipped++;
          }
        } else {
          if (verbose) console.log(`Missing issue price for IPO: ${ipo.ipo_id}, skipping`);
          skipped++;
        }
      } catch (error) {
        console.error(`Error processing IPO ${ipo.ipo_id}:`, error.message);
        errors++;
      }
    }
    
    const stats = {
      total: ipos.length,
      updated,
      skipped,
      errors
    };
    
    if (verbose) {
      console.log('\nUpdate complete!');
      console.log(`Total IPOs: ${stats.total}`);
      console.log(`Updated: ${stats.updated}`);
      console.log(`Skipped: ${stats.skipped}`);
      console.log(`Errors: ${stats.errors}`);
    }
    
    return stats;
  } catch (error) {
    console.error('Error during update process:', error);
    return { error: error.message };
  } finally {
    if (process.env.AUTO_DISCONNECT !== 'false') {
      await db.disconnectFromDatabase();
    }
  }
}

// If run directly, execute the update
if (require.main === module) {
  updateListingPerformance().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('Failed to update listing performance:', err);
    process.exit(1);
  });
}

module.exports = { updateListingPerformance, calculateGainPercentage, extractPrice }; 
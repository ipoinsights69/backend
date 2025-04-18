require('dotenv').config();
const db = require('../config/database');
const IpoModel = require('../models/IpoModel');

/**
 * Update listing gains for all IPOs with listingDayTrading data
 */
async function updateListingGains() {
  try {
    console.log('Connecting to MongoDB...');
    await db.connectToDatabase();
    
    // Get all listed IPOs from database
    const ipos = await IpoModel.find({ status: 'listed' }).lean();
    console.log(`Found ${ipos.length} listed IPOs in database`);
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    // Process each IPO
    for (const ipo of ipos) {
      try {
        // Skip IPOs without listingDayTrading data
        if (!ipo.listingDayTrading || !ipo.listingDayTrading.data) {
          console.log(`No trading data for IPO: ${ipo.ipo_id}, skipping`);
          skipped++;
          continue;
        }
        
        const data = ipo.listingDayTrading.data;
        // Find first available exchange data
        const exchange = Object.keys(data.final_issue_price || {})[0] || 
                        Object.keys(data.last_trade || {})[0];
        
        if (!exchange) {
          console.log(`No exchange data for IPO: ${ipo.ipo_id}, skipping`);
          skipped++;
          continue;
        }
        
        let issuePrice = 0;
        let lastTradePrice = 0;
        
        // Get issue price
        if (data.final_issue_price && data.final_issue_price[exchange]) {
          issuePrice = parseFloat(data.final_issue_price[exchange]);
        } else if (ipo.issue_price_numeric) {
          issuePrice = ipo.issue_price_numeric;
        } else if (ipo.issue_price) {
          const match = ipo.issue_price.match(/\d+(\.\d+)?/);
          if (match) {
            issuePrice = parseFloat(match[0]);
          }
        }
        
        // Get last trade price
        if (data.last_trade && data.last_trade[exchange]) {
          lastTradePrice = parseFloat(data.last_trade[exchange]);
        }
        
        // Calculate listing gains
        if (issuePrice > 0 && lastTradePrice > 0) {
          const listingGain = ((lastTradePrice - issuePrice) / issuePrice) * 100;
          const listingGainsString = `${listingGain.toFixed(2)}%`;
          const listingGainsNumeric = parseFloat(listingGain.toFixed(2));
          
          // Update the IPO with the new listing gains
          await IpoModel.findOneAndUpdate(
            { ipo_id: ipo.ipo_id },
            { 
              $set: { 
                listing_gains: listingGainsString,
                listing_gains_numeric: listingGainsNumeric
              }
            }
          );
          
          console.log(`Updated IPO: ${ipo.ipo_id} with listing gains: ${listingGainsString}`);
          updated++;
        } else {
          console.log(`Missing price data for IPO: ${ipo.ipo_id}, skipping`);
          skipped++;
        }
      } catch (error) {
        console.error(`Error processing IPO ${ipo.ipo_id}:`, error.message);
        errors++;
      }
    }
    
    console.log('\nUpdate complete!');
    console.log(`Total IPOs: ${ipos.length}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
  } catch (error) {
    console.error('Error during update process:', error);
  } finally {
    await db.disconnectFromDatabase();
    process.exit(0);
  }
}

// Run the update
updateListingGains(); 
/**
 * Test script to verify subscription history data extraction
 */
const { fetchSubscriptionHistory } = require('./scraper/ipoDetailScraper');

// Ajax Engineering IPO ID
const ipoId = 1983;

async function testSubscriptionHistory() {
  console.log(`Testing subscription history fetch for IPO ID: ${ipoId}`);
  
  try {
    const result = await fetchSubscriptionHistory(ipoId);
    
    console.log(`\n===== SUBSCRIPTION HISTORY RESULTS =====\n`);
    
    // Print overall subscription data
    console.log(`\n--- OVERALL SUBSCRIPTION ---`);
    for (const [category, data] of Object.entries(result.overall_subscription)) {
      console.log(`${category}: ${data.subscription_times} times`);
      if (data.shares_offered) console.log(`  Shares offered: ${data.shares_offered}`);
      if (data.shares_bid_for) console.log(`  Shares bid for: ${data.shares_bid_for}`);
      if (data.total_amount) console.log(`  Total amount: ${data.total_amount}`);
    }
    
    // Print day-wise subscription data
    console.log(`\n--- DAY-WISE SUBSCRIPTION ---`);
    result.day_wise_subscription.forEach((day, index) => {
      console.log(`\nDay ${day.day_number || index + 1} (${day.date || 'Unknown date'}):`);
      
      if (day.qib) console.log(`  QIB: ${day.qib}`);
      if (day.nii) console.log(`  NII: ${day.nii}`);
      if (day.bnii) console.log(`  bNII: ${day.bnii}`);
      if (day.snii) console.log(`  sNII: ${day.snii}`);
      if (day.retail) console.log(`  Retail: ${day.retail}`);
      if (day.employee) console.log(`  Employee: ${day.employee}`);
      if (day.total) console.log(`  Total: ${day.total}`);
    });
    
    // Print total applications
    if (result.total_applications) {
      console.log(`\n--- TOTAL APPLICATIONS ---`);
      console.log(`Total Applications: ${result.total_applications}`);
    }
    
    // Print subscription notes
    if (result.subscription_notes && result.subscription_notes.length > 0) {
      console.log(`\n--- SUBSCRIPTION NOTES ---`);
      result.subscription_notes.forEach((note, index) => {
        console.log(`${index + 1}. ${note}`);
      });
    }
    
    console.log(`\n===== END OF RESULTS =====\n`);
    
  } catch (error) {
    console.error(`Error in test: ${error.message}`);
    console.error(error.stack);
  }
}

testSubscriptionHistory(); 
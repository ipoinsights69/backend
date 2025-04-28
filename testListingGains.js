/**
 * Test script for listing gain calculation
 */
const { calculateListingGains } = require('./api/utils/ipoUtils');

// Test data from the user query
const testIPO = {
  listingDayTrading: {
    data: {
      final_issue_price: {
        bse: "708.00",
        nse: "708.00"
      },
      open: {
        bse: "731.00",
        nse: "745.50"
      },
      low: {
        bse: "724.40",
        nse: "708.00"
      },
      high: {
        bse: "787.80",
        nse: "788.00"
      },
      last_trade: {
        bse: "763.85",
        nse: "762.55"
      }
    }
  }
};

// Sample data from attachment
const smeTestIPO = {
  listingDayTrading: {
    data: {
      final_issue_price: {
        nse_sme: "50.00"
      },
      open: {
        nse_sme: "70.00"
      },
      low: {
        nse_sme: "66.50"
      },
      high: {
        nse_sme: "71.00"
      },
      last_trade: {
        nse_sme: "66.50"
      }
    }
  }
};

// Run the test
console.log("--- Testing Listing Gain Calculation ---");

// Test with the main test case
const result = calculateListingGains(testIPO);
console.log("Test Case 1 (BSE/NSE):");
console.log(JSON.stringify(result, null, 2));

// Calculate manually for verification
const bseIssuePrice = parseFloat(testIPO.listingDayTrading.data.final_issue_price.bse);
const bseClosePrice = parseFloat(testIPO.listingDayTrading.data.last_trade.bse);
const bseGainManual = ((bseClosePrice - bseIssuePrice) / bseIssuePrice) * 100;
console.log(`\nManual BSE calculation: ${bseGainManual.toFixed(2)}%`);

const nseIssuePrice = parseFloat(testIPO.listingDayTrading.data.final_issue_price.nse);
const nseClosePrice = parseFloat(testIPO.listingDayTrading.data.last_trade.nse);
const nseGainManual = ((nseClosePrice - nseIssuePrice) / nseIssuePrice) * 100;
console.log(`Manual NSE calculation: ${nseGainManual.toFixed(2)}%`);

// Test with the SME test case
const smeResult = calculateListingGains(smeTestIPO);
console.log("\nTest Case 2 (NSE SME):");
console.log(JSON.stringify(smeResult, null, 2));

// Calculate manually for verification
const smeIssuePrice = parseFloat(smeTestIPO.listingDayTrading.data.final_issue_price.nse_sme);
const smeClosePrice = parseFloat(smeTestIPO.listingDayTrading.data.last_trade.nse_sme);
const smeGainManual = ((smeClosePrice - smeIssuePrice) / smeIssuePrice) * 100;
console.log(`\nManual NSE SME calculation: ${smeGainManual.toFixed(2)}%`);

// Test when some data is missing
const incompleteIPO = {
  listingDayTrading: {
    data: {
      open: {
        bse: "731.00"
      },
      high: {
        bse: "787.80"
      }
    }
  }
};

const incompleteResult = calculateListingGains(incompleteIPO);
console.log("\nTest Case 3 (Incomplete Data):");
console.log(JSON.stringify(incompleteResult, null, 2)); 
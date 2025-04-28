/**
 * Test script for IPO subscription status parsing
 */
const cheerio = require('cheerio');
const { cleanText, sanitizeKey } = require('./scraper/utils');

// Mock HTML with new subscription status table structure
const mockHtml = `
<!DOCTYPE html>
<html>
<body>
  <div>
    <h2>Subscription Status (Bidding Detail)</h2>
    <p>The IPO was subscribed 2.79 times overall.</p>
    
    <div class="table-responsive">
      <table class="table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Times</th>
            <th>Shares Offered</th>
            <th>Shares Bid For</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>QIB</td>
            <td>9.55</td>
            <td>2,44,63,278</td>
            <td>23,36,61,582</td>
          </tr>
          <tr>
            <td>NII</td>
            <td>0.21</td>
            <td>1,83,47,458</td>
            <td>39,48,924</td>
          </tr>
          <tr>
            <td>NII (bids above ₹10L)</td>
            <td>0.24</td>
            <td>1,22,31,638</td>
            <td>29,58,816</td>
          </tr>
          <tr>
            <td>NII (bids below ₹10L)</td>
            <td>0.16</td>
            <td>61,15,819</td>
            <td>9,90,108</td>
          </tr>
          <tr>
            <td>Retail</td>
            <td>0.11</td>
            <td>4,28,10,734</td>
            <td>47,64,102</td>
          </tr>
          <tr>
            <td>Employee</td>
            <td>0.33</td>
            <td>14,04,056</td>
            <td>4,70,358</td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <p>Total Application: 1,60,193</p>
  </div>
</body>
</html>
`;

// Function to parse subscription status
function parseSubscriptionStatus(html) {
  const $ = cheerio.load(html);
  const result = {
    subscriptionStatus: {
      summary: '',
      overall: {},
      total_applications: null
    }
  };
  const processedTables = new Set();
  let sectionsAvailable = { subscriptionStatus: false };
  
  // Find all tables that might be subscription status tables
  $('table.table').each(function() {
    // Skip if we've already processed this table
    if (processedTables.has(this)) return;
    
    // Check if this table has category column and subscription times column
    const hasCategory = $(this).find('th:contains("Category")').length > 0;
    const hasSubscription = $(this).find('th:contains("Subscription")').length > 0 || 
                          $(this).find('th:contains("Times")').length > 0;
    
    if (hasCategory && hasSubscription) {
      console.log("Found potential subscription status table by content");
      const table = $(this);
      processedTables.add(this);
      
      try {
        // Try to find the parent div or section containing this table
        let parentContainer = table.closest('div');
        let summaryText = '';
        
        // Look for a heading near this table
        let heading = parentContainer.find('h2:contains("Subscription Status")');
        if (heading.length === 0) {
            heading = table.closest('div').prevAll('h2:contains("Subscription Status")').first();
        }
        
        // If we found a heading, try to get the summary paragraph
        if (heading.length > 0) {
            const summaryPara = heading.next('p');
            if (summaryPara.length > 0) {
                summaryText = cleanText(summaryPara.text());
            }
        }
        
        result.subscriptionStatus.summary = summaryText;
        
        // Process table headers
        const headers = [];
        table.find('thead th').each(function() {
            let headerText = cleanText($(this).text());
            // Standardize header names
            if (headerText.toLowerCase().includes('category')) headerText = 'category';
            if (headerText.toLowerCase().includes('subscription') || headerText.toLowerCase().includes('times')) headerText = 'subscription_times';
            if (headerText.toLowerCase().includes('shares offered')) headerText = 'shares_offered';
            if (headerText.toLowerCase().includes('shares bid')) headerText = 'shares_bid_for';
            headers.push(sanitizeKey(headerText));
        });
        
        // Process table rows
        table.find('tbody tr').each(function() {
            const rowData = {};
            $(this).find('td').each(function(index) {
                const header = headers[index] || `col_${index}`;
                rowData[header] = cleanText($(this).text());
            });
            
            // Get the category from the first column
            const category = rowData.category?.trim();
            
            // Skip empty rows
            if (!category) return;
            
            // Handle special subcategories of NII
            if (category.toLowerCase().includes('bnii') || 
                (category.toLowerCase().includes('nii') && category.toLowerCase().includes('above'))) {
                // Big Non-Institutional Investors
                result.subscriptionStatus.overall.nii = result.subscriptionStatus.overall.nii || {};
                result.subscriptionStatus.overall.nii.subcategories = result.subscriptionStatus.overall.nii.subcategories || {};
                result.subscriptionStatus.overall.nii.subcategories.bnii = rowData;
            } else if (category.toLowerCase().includes('snii') || 
                      (category.toLowerCase().includes('nii') && category.toLowerCase().includes('below'))) {
                // Small Non-Institutional Investors
                result.subscriptionStatus.overall.nii = result.subscriptionStatus.overall.nii || {};
                result.subscriptionStatus.overall.nii.subcategories = result.subscriptionStatus.overall.nii.subcategories || {};
                result.subscriptionStatus.overall.nii.subcategories.snii = rowData;
            } else if (category.toLowerCase().includes('employee')) {
                // Employee category
                result.subscriptionStatus.overall.employee = rowData;
            } else {
                // Regular categories (QIB, NII, Retail, Total)
                const key = sanitizeKey(category);
                if (key && key !== 'unknown') {
                    result.subscriptionStatus.overall[key] = rowData;
                }
            }
            
            // Mark subscription status as available
            sectionsAvailable.subscriptionStatus = true;
        });
        
        // Total Application count handling
        const totalAppRegex = /Total Application[s]?\s*:?\s*([\d,]+)/i;
        
        // Look in a paragraph with "Total Application"
        const totalAppElement = $('p:contains("Total Application")');
        if (totalAppElement.length > 0) {
            const totalAppText = totalAppElement.text();
            const match = totalAppText.match(totalAppRegex);
            if (match && match[1]) {
                result.subscriptionStatus.total_applications = match[1].trim();
            } else {
                result.subscriptionStatus.total_applications = cleanText(totalAppText.replace(/.*:/, ''));
            }
        }
      } catch (error) {
        console.error("Error processing direct subscription table:", error);
      }
    }
  });

  return result;
}

// Run the test
const parsedData = parseSubscriptionStatus(mockHtml);

// Format and display results
console.log("Subscription Status Test Results for IPO - February 14, 2025");
console.log("----------------------------------------");
console.log("Summary:", parsedData.subscriptionStatus.summary);

// Display overall subscription
console.log("\nOverall Subscription:");
if (parsedData.subscriptionStatus.overall.qib) {
  console.log(`- QIB: ${parsedData.subscriptionStatus.overall.qib.subscription_times} times (${parsedData.subscriptionStatus.overall.qib.shares_offered} shares offered, ${parsedData.subscriptionStatus.overall.qib.shares_bid_for} shares bid for)`);
}

if (parsedData.subscriptionStatus.overall.nii) {
  console.log(`- NII: ${parsedData.subscriptionStatus.overall.nii.subscription_times} times (${parsedData.subscriptionStatus.overall.nii.shares_offered} shares offered, ${parsedData.subscriptionStatus.overall.nii.shares_bid_for} shares bid for)`);
  
  // Display NII subcategories if available
  if (parsedData.subscriptionStatus.overall.nii.subcategories) {
    if (parsedData.subscriptionStatus.overall.nii.subcategories.bnii) {
      console.log(`  - bNII (bids above ₹10L): ${parsedData.subscriptionStatus.overall.nii.subcategories.bnii.subscription_times} times (${parsedData.subscriptionStatus.overall.nii.subcategories.bnii.shares_offered} shares offered, ${parsedData.subscriptionStatus.overall.nii.subcategories.bnii.shares_bid_for} shares bid for)`);
    }
    
    if (parsedData.subscriptionStatus.overall.nii.subcategories.snii) {
      console.log(`  - sNII (bids below ₹10L): ${parsedData.subscriptionStatus.overall.nii.subcategories.snii.subscription_times} times (${parsedData.subscriptionStatus.overall.nii.subcategories.snii.shares_offered} shares offered, ${parsedData.subscriptionStatus.overall.nii.subcategories.snii.shares_bid_for} shares bid for)`);
    }
  }
}

if (parsedData.subscriptionStatus.overall.retail) {
  console.log(`- Retail: ${parsedData.subscriptionStatus.overall.retail.subscription_times} times (${parsedData.subscriptionStatus.overall.retail.shares_offered} shares offered, ${parsedData.subscriptionStatus.overall.retail.shares_bid_for} shares bid for)`);
}

if (parsedData.subscriptionStatus.overall.employee) {
  console.log(`- Employee: ${parsedData.subscriptionStatus.overall.employee.subscription_times} times (${parsedData.subscriptionStatus.overall.employee.shares_offered} shares offered, ${parsedData.subscriptionStatus.overall.employee.shares_bid_for} shares bid for)`);
}

// Display total applications
console.log(`\nTotal Applications: ${parsedData.subscriptionStatus.total_applications}`); 
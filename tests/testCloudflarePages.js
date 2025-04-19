/**
 * Test Script for Cloudflare-Protected Pages
 * Tests browser automation against specific challenging pages with Cloudflare protection
 */

const { launchBrowser } = require('../utils/browserHelper');
const fs = require('fs');
const path = require('path');

// URLs to test - these are challenging sites with Cloudflare protection
const TEST_URLS = [
  {
    name: 'IPO API Page',
    url: 'https://webnodejs.chittorgarh.com/cloud/report/data-read/82/1/3/2025/2024-25/0/0',
    description: 'Cloudflare-protected API endpoint for IPO data'
  },
  {
    name: 'IPO Detail Page',
    url: 'https://www.chittorgarh.com/ipo/tankup-engineers-ipo/2398/',
    description: 'Cloudflare-protected IPO detail page'
  }
];

// Configure headless/non-headless modes to test
const MODES_TO_TEST = [
  { name: 'Headless', headless: 'new' },
  { name: 'Non-Headless', headless: false }
];

// Configure proxy testing
const TEST_WITH_PROXY = true;

// Configure 2Captcha - uncomment and add key to enable captcha solving
// process.env.CAPTCHA_API_KEY = 'your-2captcha-api-key';

// Test results tracking
const results = {
  success: [],
  failed: []
};

// Create a results directory
const RESULTS_DIR = path.join(__dirname, '../cloudflare-test-results');
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

/**
 * Test a single URL with specific options
 * @param {Object} urlConfig - URL configuration
 * @param {Object} options - Browser options
 * @returns {Promise<boolean>} - Success flag
 */
async function testUrl(urlConfig, options) {
  const { name, url, description } = urlConfig;
  const { headless, useProxy } = options;
  
  const testName = `${name} (${headless ? 'Headless' : 'Non-Headless'}${useProxy ? ' + Proxy' : ''})`;
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${testName}`);
  console.log(`URL: ${url}`);
  console.log(`Description: ${description}`);
  console.log(`${'='.repeat(80)}`);
  
  let browser, page;
  let success = false;
  
  try {
    const startTime = Date.now();
    
    // Launch browser with our enhanced helper
    console.log('Launching browser with progressive fallback strategy...');
    
    const result = await launchBrowser(url, {
      headless: headless,
      useProxy: useProxy,
      timeout: 120000, // 2 minutes timeout for challenging pages
      tryCloudflareBypass: true,
      solveCaptchas: true
    });
    
    browser = result.browser;
    page = result.page;
    const method = result.browserMethod;
    const usingProxy = result.usingProxy || false;
    
    // The page should already be loaded by launchBrowser
    // Check if we got the expected content
    const title = await page.title();
    const content = await page.content();
    
    // Take a screenshot as evidence
    const screenshotPath = path.join(RESULTS_DIR, `${name.toLowerCase().replace(/\s+/g, '-')}-${headless ? 'headless' : 'non-headless'}${useProxy ? '-proxy' : ''}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to ${screenshotPath}`);
    
    // Save HTML content for analysis
    const htmlPath = path.join(RESULTS_DIR, `${name.toLowerCase().replace(/\s+/g, '-')}-${headless ? 'headless' : 'non-headless'}${useProxy ? '-proxy' : ''}.html`);
    fs.writeFileSync(htmlPath, content);
    console.log(`HTML content saved to ${htmlPath}`);
    
    // Determine if we bypassed Cloudflare successfully
    const blocked = 
      title.includes('Just a moment') || 
      title.includes('Checking your browser') || 
      title.includes('Attention Required') ||
      content.includes('cf-challenge') ||
      content.includes('challenge-running');
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    if (!blocked) {
      console.log(`✅ Success! Page loaded in ${duration.toFixed(2)}s`);
      console.log(`Method used: ${method}`);
      console.log(`Title: ${title}`);
      
      // Verify we have the expected content
      const hasExpectedContent = await page.evaluate(() => {
        // For the API page, check for JSON data
        if (window.location.href.includes('webnodejs.chittorgarh.com')) {
          return document.body.textContent.includes('reportTableData');
        }
        
        // For the IPO detail page, check for IPO content
        if (window.location.href.includes('tankup-engineers-ipo')) {
          return document.querySelector('.ipo-title') !== null;
        }
        
        return false;
      });
      
      if (hasExpectedContent) {
        console.log('✅ Page contains expected content');
        success = true;
        
        results.success.push({
          url: name,
          headless: headless ? 'Headless' : 'Non-Headless',
          proxy: useProxy,
          method: method,
          duration: `${duration.toFixed(2)}s`,
          title: title
        });
      } else {
        console.warn('⚠️ Page loaded but doesn\'t contain expected content');
        results.failed.push({
          url: name,
          headless: headless ? 'Headless' : 'Non-Headless',
          proxy: useProxy,
          method: method,
          reason: 'Missing expected content'
        });
      }
    } else {
      console.error('❌ Failed to bypass Cloudflare protection');
      results.failed.push({
        url: name,
        headless: headless ? 'Headless' : 'Non-Headless',
        proxy: useProxy,
        reason: 'Blocked by Cloudflare'
      });
    }
    
    return success;
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    results.failed.push({
      url: name,
      headless: headless ? 'Headless' : 'Non-Headless',
      proxy: useProxy,
      reason: error.message
    });
    return false;
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed');
    }
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log('Starting Cloudflare protected page tests');
  console.log(`Testing ${TEST_URLS.length} URLs with various browser configurations`);
  
  for (const urlConfig of TEST_URLS) {
    // Try each headless/non-headless mode
    for (const mode of MODES_TO_TEST) {
      // First try without proxy
      await testUrl(urlConfig, { 
        headless: mode.headless,
        useProxy: false
      });
      
      // Then try with proxy if enabled
      if (TEST_WITH_PROXY) {
        await testUrl(urlConfig, { 
          headless: mode.headless,
          useProxy: true
        });
      }
    }
  }
  
  // Print summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('TEST RESULTS SUMMARY');
  console.log(`${'='.repeat(80)}`);
  
  console.log('\nSuccessful tests:');
  if (results.success.length === 0) {
    console.log('None');
  } else {
    results.success.forEach((result, index) => {
      console.log(`${index + 1}. ${result.url} (${result.headless}${result.proxy ? ' + Proxy' : ''}) - ${result.duration}`);
      console.log(`   Method: ${result.method}`);
      console.log(`   Title: ${result.title}`);
    });
  }
  
  console.log('\nFailed tests:');
  if (results.failed.length === 0) {
    console.log('None');
  } else {
    results.failed.forEach((result, index) => {
      console.log(`${index + 1}. ${result.url} (${result.headless}${result.proxy ? ' + Proxy' : ''}) - ${result.reason}`);
    });
  }
  
  // Save results to a JSON file
  const resultsPath = path.join(RESULTS_DIR, 'cloudflare-test-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${resultsPath}`);
  
  // Return a success flag for the entire test run
  return results.success.length > 0;
}

// Run the tests
if (require.main === module) {
  console.log('Starting Cloudflare page tests...');
  runTests()
    .then(success => {
      if (success) {
        console.log('✅ At least one test passed successfully!');
        process.exit(0);
      } else {
        console.error('❌ All tests failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
} 
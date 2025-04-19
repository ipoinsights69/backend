/**
 * Test Script for Browser Methods
 * Tests each browser launch method in sequence and reports results
 */

const { 
  launchBrowser, 
  launchRegularPuppeteer, 
  launchRealBrowser, 
  launchStealthBrowser 
} = require('../utils/browserHelper');

// Configuration
const TEST_URL = 'https://www.chittorgarh.com/ipo/mainboard-ipo-in-india/';
const TIMEOUT = 60000; // 60 seconds timeout
const METHODS = [
  { name: 'Regular Puppeteer (Headless)', headless: 'new', fn: launchRegularPuppeteer },
  { name: 'Real Browser Mode (Headless)', headless: 'new', fn: launchRealBrowser },
  { name: 'Stealth Mode (Headless)', headless: 'new', fn: launchStealthBrowser },
  { name: 'Regular Puppeteer (Non-Headless)', headless: false, fn: launchRegularPuppeteer },
  { name: 'Real Browser Mode (Non-Headless)', headless: false, fn: launchRealBrowser },
  { name: 'Stealth Mode (Non-Headless)', headless: false, fn: launchStealthBrowser }
];

// Test results tracking
const results = {
  success: [],
  failed: []
};

/**
 * Test a single browser method
 * @param {Object} method - Method configuration
 * @param {boolean} useProxy - Whether to use proxy
 * @returns {Promise<boolean>} Success flag
 */
async function testMethod(method, useProxy = false) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Testing: ${method.name}${useProxy ? ' with proxy' : ''}`);
  console.log(`${'='.repeat(50)}`);
  
  let browser, page;
  
  try {
    const startTime = Date.now();
    
    const options = {
      headless: method.headless, 
      timeout: TIMEOUT,
      args: []
    };
    
    // Add proxy if specified
    if (useProxy) {
      options.proxy = {
        server: 'geo.iproyal.com:12321',
        username: 'T3SdWfWt2L3ZbveZ',
        password: 'O3FRVz4QjAAvBgYw'
      };
    }
    
    // Launch browser with the specified method
    const result = await method.fn(options);
    browser = result.browser;
    page = result.page;
    
    // Navigate to the test URL
    console.log(`Navigating to ${TEST_URL}...`);
    await page.goto(TEST_URL, { 
      waitUntil: 'networkidle2', 
      timeout: TIMEOUT 
    });
    
    // Check if page was loaded successfully
    const title = await page.title();
    const content = await page.content();
    
    // Check for Cloudflare or other protection
    let blocked = false;
    if (
      title.includes('Just a moment') || 
      title.includes('Checking your browser') || 
      title.includes('Attention Required') ||
      content.includes('cf-challenge') ||
      content.includes('captcha')
    ) {
      blocked = true;
      console.log(`❌ Blocked by protection`);
    }
    
    if (!blocked) {
      // Take a screenshot as evidence
      const screenshotPath = `./test-${method.name.replace(/\s+/g, '-').toLowerCase()}${useProxy ? '-proxy' : ''}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`✓ Screenshot saved to ${screenshotPath}`);
      
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      results.success.push({
        method: method.name,
        proxy: useProxy,
        title,
        duration: `${duration.toFixed(2)}s`
      });
      
      console.log(`✅ Success! Page loaded in ${duration.toFixed(2)}s`);
      console.log(`Title: ${title}`);
      return true;
    } else {
      results.failed.push({
        method: method.name,
        proxy: useProxy,
        reason: 'Blocked by protection'
      });
      return false;
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    results.failed.push({
      method: method.name,
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
 * Test the integrated launchBrowser method
 */
async function testIntegratedMethod() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Testing Integrated Launch Browser Method`);
  console.log(`${'='.repeat(50)}`);
  
  let browser, page;
  
  try {
    const startTime = Date.now();
    
    // Use the integrated method that tries all approaches
    const result = await launchBrowser(TEST_URL, {
      timeout: TIMEOUT
    });
    
    browser = result.browser;
    page = result.page;
    const method = result.browserMethod;
    const usingProxy = result.usingProxy || false;
    
    // We don't need to navigate again as launchBrowser already did it
    const title = await page.title();
    
    // Take a screenshot
    const screenshotPath = `./test-integrated-method.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log(`✅ Integrated method succeeded using: ${method}`);
    console.log(`Title: ${title}`);
    console.log(`Duration: ${duration.toFixed(2)}s`);
    console.log(`Using proxy: ${usingProxy}`);
    console.log(`✓ Screenshot saved to ${screenshotPath}`);
    
    results.success.push({
      method: 'Integrated - ' + method,
      duration: `${duration.toFixed(2)}s`,
      title
    });
    
    return true;
  } catch (error) {
    console.error(`❌ Integrated method failed: ${error.message}`);
    results.failed.push({
      method: 'Integrated method',
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
  console.log(`Starting browser method tests for URL: ${TEST_URL}`);
  
  // First test each method without proxy
  for (const method of METHODS) {
    await testMethod(method, false);
  }
  
  // Then test each method with proxy
  console.log(`\nRetrying failed methods with proxy...`);
  for (const method of METHODS) {
    // Only test with proxy if the method failed without it
    if (results.failed.some(r => r.method === method.name && !r.proxy)) {
      await testMethod(method, true);
    }
  }
  
  // Finally test the integrated method
  await testIntegratedMethod();
  
  // Print summary
  console.log(`\n${'='.repeat(50)}`);
  console.log('TEST RESULTS SUMMARY');
  console.log(`${'='.repeat(50)}`);
  
  console.log('\nSuccessful methods:');
  if (results.success.length === 0) {
    console.log('None');
  } else {
    results.success.forEach((result, index) => {
      console.log(`${index + 1}. ${result.method}${result.proxy ? ' (with proxy)' : ''} - ${result.duration}`);
      console.log(`   Title: ${result.title}`);
    });
  }
  
  console.log('\nFailed methods:');
  if (results.failed.length === 0) {
    console.log('None');
  } else {
    results.failed.forEach((result, index) => {
      console.log(`${index + 1}. ${result.method}${result.proxy ? ' (with proxy)' : ''} - ${result.reason}`);
    });
  }
  
  // Save results to a JSON file
  const fs = require('fs');
  fs.writeFileSync('./browser-test-results.json', JSON.stringify(results, null, 2));
  console.log('\nResults saved to browser-test-results.json');
}

// Run the tests
runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
}); 
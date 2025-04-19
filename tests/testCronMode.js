/**
 * Test Script for Cron Mode
 * Tests specifically for the cron job execution environment
 */

const { launchBrowser } = require('../utils/browserHelper');
const fs = require('fs');
const path = require('path');

// Ensure Xvfb is installed for non-headless mode on servers
// sudo apt-get install -y xvfb

// Define test URLs
const URLS_TO_TEST = [
  {
    name: 'IPO Listing API',
    url: 'https://webnodejs.chittorgarh.com/cloud/report/data-read/82/1/3/2025/2024-25/0/0',
    expectedContent: 'reportTableData'
  },
  {
    name: 'IPO Detail Page',
    url: 'https://www.chittorgarh.com/ipo/tankup-engineers-ipo/2398/',
    expectedContent: 'Tankup Engineers' // Part of the IPO title
  }
];

// Create logs directory
const LOGS_DIR = path.join(__dirname, '../cron-test-logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Set up logging
const logFile = path.join(LOGS_DIR, `cron-test-${new Date().toISOString().replace(/:/g, '-')}.log`);
const logger = fs.createWriteStream(logFile, { flags: 'a' });

// Custom log function to write to both console and file
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  logger.write(logMessage + '\n');
}

/**
 * Test a URL with specific browser options
 */
async function testUrl(urlConfig, options = {}) {
  const { name, url, expectedContent } = urlConfig;
  const startTime = Date.now();
  
  log(`\n${'='.repeat(80)}`);
  log(`Testing ${name} (${url})`);
  log(`Using options: ${JSON.stringify(options)}`);
  log(`${'='.repeat(80)}`);
  
  let browser, page;
  
  try {
    log('Launching browser...');
    
    // Default options for cron environment
    const browserOptions = {
      headless: options.headless || 'new',
      useProxy: options.useProxy || false,
      timeout: options.timeout || 120000,
      tryCloudflareBypass: true,
      solveCaptchas: true,
      ...options
    };
    
    log(`Browser options: ${JSON.stringify(browserOptions)}`);
    
    // Launch browser
    const result = await launchBrowser(url, browserOptions);
    
    browser = result.browser;
    page = result.page;
    
    log(`Browser launched with method: ${result.browserMethod}`);
    
    // Get page info
    const title = await page.title();
    log(`Page title: ${title}`);
    
    // Check for expected content
    const hasExpectedContent = await page.evaluate((expected) => {
      return document.body.textContent.includes(expected);
    }, expectedContent);
    
    // Take a screenshot for verification
    const screenshotPath = path.join(LOGS_DIR, `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`Screenshot saved: ${screenshotPath}`);
    
    // Save HTML for debugging
    const htmlPath = path.join(LOGS_DIR, `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.html`);
    const html = await page.content();
    fs.writeFileSync(htmlPath, html);
    log(`HTML saved: ${htmlPath}`);
    
    // Log result
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (hasExpectedContent) {
      log(`✅ SUCCESS: Found expected content "${expectedContent}" (${duration}s)`);
      return true;
    } else {
      log(`❌ FAILED: Expected content "${expectedContent}" not found (${duration}s)`);
      return false;
    }
  } catch (error) {
    log(`❌ ERROR: ${error.message}`);
    return false;
  } finally {
    if (browser) {
      try {
        await browser.close();
        log('Browser closed');
      } catch (e) {
        log(`Error closing browser: ${e.message}`);
      }
    }
  }
}

/**
 * Main test function
 */
async function runTests() {
  log('Starting cron mode tests');
  
  // Determine if we're running in a headless environment (server/cron)
  const isHeadlessEnv = !process.env.DISPLAY;
  log(`Detected environment: ${isHeadlessEnv ? 'Headless (server/cron)' : 'GUI (with display)'}`);
  
  // Define testing strategies based on environment
  const testStrategies = [
    // First try with default headless
    { headless: 'new', useProxy: false },
    
    // Then try with non-headless (requires Xvfb in cron)
    { headless: false, useProxy: false },
    
    // Then try with proxy
    { headless: 'new', useProxy: true },
    { headless: false, useProxy: true }
  ];
  
  // Results tracking
  const results = {
    success: [],
    failed: []
  };
  
  // Try each URL with multiple strategies
  for (const urlConfig of URLS_TO_TEST) {
    let success = false;
    
    for (const strategy of testStrategies) {
      if (success) break;
      
      try {
        log(`Testing ${urlConfig.name} with strategy: ${JSON.stringify(strategy)}`);
        success = await testUrl(urlConfig, strategy);
        
        if (success) {
          results.success.push({
            url: urlConfig.name,
            strategy: strategy
          });
          log(`✅ Successfully accessed ${urlConfig.name} with ${JSON.stringify(strategy)}`);
        } else {
          results.failed.push({
            url: urlConfig.name,
            strategy: strategy,
            reason: 'Expected content not found'
          });
        }
      } catch (error) {
        log(`Error testing ${urlConfig.name} with ${JSON.stringify(strategy)}: ${error.message}`);
        results.failed.push({
          url: urlConfig.name,
          strategy: strategy,
          reason: error.message
        });
      }
    }
  }
  
  // Final summary
  log('\n' + '='.repeat(80));
  log('TEST RESULTS SUMMARY');
  log('='.repeat(80));
  
  log(`\nSuccessful tests (${results.success.length}):`);
  results.success.forEach((result, index) => {
    log(`${index + 1}. ${result.url} using ${JSON.stringify(result.strategy)}`);
  });
  
  log(`\nFailed tests (${results.failed.length}):`);
  results.failed.forEach((result, index) => {
    log(`${index + 1}. ${result.url} using ${JSON.stringify(result.strategy)} - ${result.reason}`);
  });
  
  // Save results
  const resultsPath = path.join(LOGS_DIR, `cron-test-results-${Date.now()}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  log(`\nResults saved to ${resultsPath}`);
  
  return results.success.length > 0;
}

// Run tests
log('Starting cron test script');
runTests()
  .then(success => {
    if (success) {
      log('✅ At least one test succeeded');
      process.exit(0);
    } else {
      log('❌ All tests failed');
      process.exit(1);
    }
  })
  .catch(error => {
    log(`Fatal error: ${error.message}`);
    process.exit(1);
  })
  .finally(() => {
    logger.end();
  }); 
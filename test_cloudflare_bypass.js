// test_cloudflare_bypass.js
const path = require('path');
// Adjust the path based on where you place this test script relative to utils/
const { launchBrowser } = require(path.resolve(__dirname, './utils/browserHelper')); 

const testUrls = [
    'https://2captcha.com/demo/cloudflare-turnstile',
    'https://nowsecure.nl/', // A common site used for testing bot detection
    'https://2captcha.com/demo/cloudflare-turnstile-challenge' // This specific URL doesn't seem to exist directly, the challenge is usually triggered dynamically.
    // We'll use the base demo page and another known test site.
];

/**
 * Runs the bypass test for a single URL.
 * @param {string} url The URL to test.
 * @returns {Promise<boolean>} True if bypass seems successful, false otherwise.
 */
async function runTest(url) {
    console.log(`\n--- Testing URL: ${url} ---`);
    let browser;
    let success = false;
    try {
        // Use launchBrowser which tries Stealth then real-browser
        const { browser: launchedBrowser, page } = await launchBrowser(url, { timeout: 60000 });
        browser = launchedBrowser;

        console.log(`Navigation potentially complete for ${url}. Checking final page state...`);

        // Give the page a moment to settle, especially after potential interactions by real-browser
        await new Promise(resolve => setTimeout(resolve, 2000)); 

        // Check for signs of failure (Cloudflare block page)
        const title = await page.title();
        const content = await page.content(); 

        console.log(`Final Page Title: ${title}`);

        const isBlocked = title.includes('Just a moment...') ||
                          title.includes('Checking your browser') ||
                          title.includes('Access denied') || // Another common block title
                          content.includes('cf-challenge-running') ||
                          content.includes('cf-spinner') ||
                          content.includes('Verifying you are human');

        if (isBlocked) {
            console.error(`[FAIL] Cloudflare block page detected for ${url}`);
            success = false;
        } else {
            // Basic success check: page didn't get stuck on challenge
            console.log(`[PASS] Successfully navigated past potential Cloudflare challenge for ${url}`);
            success = true;
            
            // Optional: Add more specific checks for expected content on the target pages
            // if (url.includes('2captcha.com') && !content.includes('Cloudflare Turnstile demo')) {
            //    console.warn('Warning: Expected demo content not found on 2captcha page.');
            // }
             // if (url.includes('nowsecure.nl') && !content.includes('Are you human?')) { // Example check for nowsecure
             //    console.warn('Warning: Expected content not found on nowsecure.nl.');
             // }
        }

    } catch (error) {
        console.error(`[FAIL] Error testing ${url}: ${error.message}`);
        console.error(error.stack);
        success = false;
    } finally {
        if (browser) {
            try {
                await browser.close();
                console.log(`Browser closed for ${url}`);
            } catch (closeError) {
                console.error(`Error closing browser for ${url}: ${closeError.message}`);
            }
        }
        console.log(`--- Result for ${url}: ${success ? 'PASSED' : 'FAILED'} ---`);
    }
    return success;
}

/**
 * Runs all defined tests sequentially.
 */
async function runAllTests() {
    console.log('Starting Cloudflare bypass tests...');
    let overallSuccess = true;
    for (const url of testUrls) {
        const result = await runTest(url);
        if (!result) {
            overallSuccess = false;
        }
    }

    console.log(`\n--- Test Summary ---`);
    if (overallSuccess) {
        console.log('✅ All Cloudflare bypass tests passed!');
    } else {
        console.error('❌ Some Cloudflare bypass tests failed.');
        process.exitCode = 1; // Indicate failure in CI environments
    }
}

// Execute the tests
runAllTests(); 
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { connect: connectRealBrowser } = require('puppeteer-real-browser');

// Apply the stealth plugin
puppeteer.use(StealthPlugin());

const DEFAULT_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--window-size=1920,1080',
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36';

/**
 * Checks if the current page is blocked by Cloudflare.
 * @param {import('puppeteer').Page} page - The Puppeteer page instance.
 * @returns {Promise<boolean>} - True if Cloudflare block is detected, false otherwise.
 */
async function isCloudflareBlocked(page) {
  try {
    const title = await page.title();
    const content = await page.content();

    // Common Cloudflare challenge titles
    if (title.includes('Just a moment...') || title.includes('Checking your browser')) {
      console.warn('Cloudflare challenge page detected by title.');
      return true;
    }

    // Cloudflare specific selectors/text
    if (content.includes('cf-challenge-running') || content.includes('cf-spinner') || content.includes('Verifying you are human')) {
       console.warn('Cloudflare challenge page detected by content.');
       return true;
    }

    // Check for common Cloudflare response status codes (after potential redirects)
    const response = page.mainFrame().url() && await page.goto(page.mainFrame().url()); // Re-check response status
     if (response && [403, 503, 429].includes(response.status())) {
        console.warn(`Cloudflare block detected by status code: ${response.status()}`);
        return true;
     }

  } catch (error) {
    // Ignore errors during detection (e.g., page closed)
    console.error('Error during Cloudflare detection:', error.message);
  }
  return false;
}

/**
 * Launches or connects to a browser instance, attempting stealth first,
 * then falling back to puppeteer-real-browser if Cloudflare is detected.
 * @param {string} initialUrl - The URL to navigate to initially for checking.
 * @param {object} [options] - Options object.
 * @param {boolean} [options.headless='new'] - Headless mode for puppeteer-extra.
 * @param {Array<string>} [options.args=[]] - Additional browser args.
 * @param {number} [options.timeout=60000] - Navigation timeout.
 * @returns {Promise<{browser: import('puppeteer').Browser, page: import('puppeteer').Page}>}
 * @throws {Error} If both methods fail to launch a working browser page.
 */
async function launchBrowser(initialUrl, options = {}) {
  const { headless = false, args = [], timeout = 90000 } = options;
  let browser;
  let page;

  // --- Attempt 1: Puppeteer-Extra with Stealth ---
  console.log('Attempting browser launch with puppeteer-extra (Stealth)...');
  try {
    browser = await puppeteer.launch({
      headless: headless,
      args: [...DEFAULT_ARGS, ...args],
      ignoreHTTPSErrors: true, // Might help with some SSL issues
    });
    page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1920, height: 1080 });

    console.log(`Navigating to initial URL for check: ${initialUrl}`);
    await page.goto(initialUrl, { waitUntil: 'networkidle0', timeout: timeout });

    if (await isCloudflareBlocked(page)) {
      console.warn('Cloudflare detected with Stealth. Closing and trying puppeteer-real-browser...');
      await browser.close();
      browser = null; // Reset browser variable
      page = null; // Reset page variable
      // Proceed to Attempt 2
    } else {
      console.log('Browser launched successfully with Stealth.');
      // Add request interception *after* successful launch and navigation
      await setupRequestInterception(page);
      return { browser, page };
    }
  } catch (error) {
    console.error('Error launching browser with Stealth:', error.message);
    if (browser) {
      await browser.close();
      browser = null;
      page = null;
    }
    // Proceed to Attempt 2 if Stealth fails for any reason (timeout, crash, etc.)
  }

  // --- Attempt 2: Puppeteer-Real-Browser ---
  console.log('Attempting browser launch with puppeteer-real-browser...');
  try {
    const result = await connectRealBrowser({
      headless: false, // 'false' is recommended for stability by the library docs
      turnstile: true, // Automatically handle Cloudflare Turnstile
      args: [...DEFAULT_ARGS, ...args],
      connectOption: {
        defaultViewport: { width: 1920, height: 1080 },
      },
      // If running on Linux without a display, xvfb needs to be installed (`sudo apt-get install xvfb`)
      // disableXvfb: false, // Default is false, keep it unless you have a specific need
    });
    browser = result.browser;
    page = result.page;

    // No need to set user agent or viewport, real-browser handles this

    console.log(`Navigating to initial URL for check (real-browser): ${initialUrl}`);
    // Real-browser connection might already handle initial challenge, but navigate again to be sure
    await page.goto(initialUrl, { waitUntil: 'networkidle0', timeout: timeout });

    if (await isCloudflareBlocked(page)) {
       console.error('Cloudflare still detected even with puppeteer-real-browser.');
       throw new Error('Failed to bypass Cloudflare with puppeteer-real-browser.');
    }

    console.log('Browser launched successfully with puppeteer-real-browser.');
    // Add request interception *after* successful launch and navigation
    await setupRequestInterception(page);
    return { browser, page };

  } catch (error) {
    console.error('Error launching browser with puppeteer-real-browser:', error.message);
    if (browser) {
      await browser.close();
    }
    throw new Error(`Failed to launch browser with both methods. Last error: ${error.message}`);
  }
}

/**
 * Sets up basic request interception to modify headers.
 * Adapt this as needed for specific scraper requirements.
 * @param {import('puppeteer').Page} page
 */
async function setupRequestInterception(page) {
    console.log('Setting up request interception...');
    try {
        await page.setRequestInterception(true);
        page.on('request', request => {
            const headers = {
                ...request.headers(),
                'User-Agent': USER_AGENT, // Ensure consistent user agent
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': request.url(), // Dynamically set referer
                'DNT': '1', // Do Not Track
                // Add other headers that might help mimic a real browser
            };
            request.continue({ headers });
        });
         console.log('Request interception enabled.');
    } catch (error) {
        console.error('Failed to set up request interception:', error.message);
        // Decide if this is critical - maybe just log and continue?
    }
}


module.exports = { launchBrowser }; 
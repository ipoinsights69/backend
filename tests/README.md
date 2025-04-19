# Browser Test Utilities

This directory contains test utilities for the IPO scraper's browser automation capabilities.

## Browser Method Tests

The `testBrowserMethods.js` script tests different browser launch methods to determine which ones can successfully access target websites without being blocked by anti-bot protections.

### Features

- Tests 6 different browser configurations:
  1. Regular Puppeteer (Headless)
  2. Real Browser Mode (Headless)
  3. Stealth Mode (Headless)
  4. Regular Puppeteer (Non-Headless)
  5. Real Browser Mode (Non-Headless)
  6. Stealth Mode (Non-Headless)
- Automatically retries failed methods with proxy
- Tests the integrated browser launcher that combines all methods
- Creates screenshots as evidence of successful/failed attempts
- Generates a detailed JSON report of results
- Now includes Cloudflare challenge bypass and captcha solving capabilities

### Prerequisites

Make sure all dependencies are installed:

```bash
npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth puppeteer-core puppeteer-real-browser 2captcha-ts
```

For non-headless mode on headless servers, install Xvfb:

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y xvfb

# CentOS/RHEL
sudo yum install -y xvfb
```

### Setting Up 2Captcha for Captcha Solving

To solve captchas automatically, you need a 2Captcha API key:

1. Sign up at [2captcha.com](https://2captcha.com/) and deposit funds
2. Get your API key from the dashboard
3. Configure the key in your environment:

```bash
# Linux/macOS
export CAPTCHA_API_KEY=your_2captcha_api_key

# Windows
set CAPTCHA_API_KEY=your_2captcha_api_key
```

Alternatively, edit the constants in the `browserHelper.js` file:

```javascript
const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || 'your_2captcha_api_key';
```

### Running the Tests

Basic usage:

```bash
node tests/testBrowserMethods.js
```

With Xvfb for headless environments:

```bash
xvfb-run -a node tests/testBrowserMethods.js
```

### Testing Cloudflare Protected Pages

To specifically test against Cloudflare and captcha protected pages:

```bash
node tests/testCloudflarePages.js
```

This test targets specific URLs known to have Cloudflare protection:
- API endpoint: `https://webnodejs.chittorgarh.com/cloud/report/data-read/82/1/3/2025/2024-25/0/0`
- IPO detail page: `https://www.chittorgarh.com/ipo/tankup-engineers-ipo/2398/`

The test will:
1. Try both headless and non-headless modes
2. Test with and without proxy
3. Attempt to bypass Cloudflare protection
4. Solve any captchas encountered
5. Save screenshots and HTML content for analysis
6. Generate a comprehensive report

### Configuring Test Parameters

You can modify these values in the script:

- `TEST_URL`: The URL to test access (default: IPO listing page)
- `TIMEOUT`: Maximum time to wait for page load (default: 60 seconds)
- `TEST_WITH_PROXY`: Whether to try with a proxy (default: true)

### Understanding Results

After running the tests:

1. Check the console output for a summary of successful and failed methods
2. View the screenshots created in the project root directory
3. Examine the detailed `browser-test-results.json` file

For Cloudflare tests, additional results are saved to the `cloudflare-test-results` directory.

### Example Output

```
================================
TEST RESULTS SUMMARY
================================

Successful methods:
1. Stealth Mode (Non-Headless) - 5.42s
   Title: Mainboard IPO List in India, IPO in 2023, 2022, 2021, 2020, 2019
2. Integrated - Stealth Mode (Non-Headless) - 6.13s
   Title: Mainboard IPO List in India, IPO in 2023, 2022, 2021, 2020, 2019

Failed methods:
1. Regular Puppeteer (Headless) - Blocked by protection
2. Real Browser Mode (Headless) - Blocked by protection
3. Stealth Mode (Headless) - Blocked by protection
4. Regular Puppeteer (Non-Headless) - Blocked by protection
5. Real Browser Mode (Non-Headless) - Blocked by protection
6. Regular Puppeteer (Headless) (with proxy) - Blocked by protection
7. Real Browser Mode (Headless) (with proxy) - Blocked by protection
8. Stealth Mode (Headless) (with proxy) - Blocked by protection
9. Regular Puppeteer (Non-Headless) (with proxy) - Blocked by protection
10. Real Browser Mode (Non-Headless) (with proxy) - Blocked by protection

Results saved to browser-test-results.json
```

## Troubleshooting

If you encounter issues:

1. **Chrome executable not found**: Update the path in `launchRealBrowser` function in `browserHelper.js`
2. **Permission errors**: Ensure you're running with appropriate permissions
3. **Proxy connection errors**: Verify proxy credentials and connectivity
4. **Xvfb errors**: Make sure Xvfb is installed correctly
5. **Captcha solving errors**: Verify your 2Captcha API key and ensure sufficient balance

## Additional Notes

- The browser helper is designed to progressively try different methods until one succeeds
- Non-headless mode requires a display, either physical or virtual (Xvfb)
- The proxy is only used as a last resort if other methods fail
- Captcha solving requires a paid 2Captcha account
- Cloudflare bypass techniques may need updating as Cloudflare evolves 
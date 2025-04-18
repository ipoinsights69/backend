const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

async function scrapeQualityPowerIPO() {
  // Launch a headless browser
  const browser = await puppeteer.launch({
    headless: 'new', // Use the new headless mode
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to the target URL
    const url = 'https://www.chittorgarh.com/ipo/quality-power-ipo/1569/';
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    // Get the page content
    const content = await page.content();
    const $ = cheerio.load(content);
    
    // Initialize result object
    const ipoDetails = {};

    // Helper function to clean text
    const cleanText = (text) => text?.replace(/\n|\t|\r/g, '').trim() || '';

    // 1. IPO Details
    ipoDetails.ipoDetails = {};
    const ipoTable = $('table.table-bordered').first();
    ipoTable.find('tr').each((i, row) => {
      const key = cleanText($(row).find('td').eq(0).text());
      const value = cleanText($(row).find('td').eq(1).text());
      if (key && value) {
        ipoDetails.ipoDetails[key] = value;
      }
    });

    // 2. Timeline
    ipoDetails.timeline = {};
    const timelineSection = $('h2:contains("IPO Timetable")').next('table');
    timelineSection.find('tr').each((i, row) => {
      const key = cleanText($(row).find('td').eq(0).text());
      const value = cleanText($(row).find('td').eq(1).text());
      if (key && value) {
        ipoDetails.timeline[key] = value;
      }
    });

    // 3. Lot Size
    ipoDetails.lotSize = {};
    const lotSizeTable = $('h2:contains("Lot Size")').next('table');
    lotSizeTable.find('tr').each((i, row) => {
      const category = cleanText($(row).find('th').eq(0).text());
      const shares = cleanText($(row).find('td').eq(0).text());
      const amount = cleanText($(row).find('td').eq(1).text());
      if (category && shares && amount) {
        ipoDetails.lotSize[category] = { shares, amount };
      }
    });

    // 4. Reservation
    ipoDetails.reservation = {};
    const reservationText = $('p:contains("QIB")').text();
    ipoDetails.reservation.summary = cleanText(reservationText.match(/Quality Power IPO offers.*?\./)?.[0] || '');

    // 5. Promoter Holdings
    ipoDetails.promoterHoldings = [];
    const promoterSection = $('h2:contains("Promoters")').next('ul');
    promoterSection.find('li').each((i, item) => {
      ipoDetails.promoterHoldings.push(cleanText($(item).text()));
    });

    // 6. Anchor Investors
    ipoDetails.anchorInvestors = {};
    ipoDetails.anchorInvestors.bidDate = cleanText($('p:contains("Anchor bid date")').text().match(/February \d{2}, 2025/)?.[0] || '');
    ipoDetails.anchorInvestors.amountRaised = cleanText($('p:contains("raises")').text().match(/Rs \d+\.\d{2} crore/)?.[0] || '');

    // 7. About
    ipoDetails.about = cleanText($('h2:contains("About")').next('p').text());

    // 8. Company Financials
    ipoDetails.financials = [];
    const financialTable = $('h2:contains("Financial Performance")').next('table');
    financialTable.find('tr').each((i, row) => {
      const period = cleanText($(row).find('td').eq(0).text());
      const revenue = cleanText($(row).find('td').eq(1).text());
      const netProfit = cleanText($(row).find('td').eq(2).text());
      if (period && revenue && netProfit) {
        ipoDetails.financials.push({ period, revenue, netProfit });
      }
    });

    // 9. Key Performance Indicators (KPIs)
    ipoDetails.kpis = {};
    const kpiSection = $('h2:contains("KPI")').next('table');
    kpiSection.find('tr').each((i, row) => {
      const key = cleanText($(row).find('td').eq(0).text());
      const value = cleanText($(row).find('td').eq(1).text());
      if (key && value) {
        ipoDetails.kpis[key] = value;
      }
    });

    // 10. Objects of the Issue
    ipoDetails.objectsOfIssue = [];
    const objectsSection = $('h2:contains("Objects of the Issue")').next('ul');
    objectsSection.find('li').each((i, item) => {
      ipoDetails.objectsOfIssue.push(cleanText($(item).text()));
    });

    // 11. IPO Review
    ipoDetails.review = cleanText($('h2:contains("IPO Review")').next('p').text());

    // 12. Subscription Status
    ipoDetails.subscriptionStatus = {};
    const subscriptionSection = $('h2:contains("Subscription Status")').next('table');
    subscriptionSection.find('tr').each((i, row) => {
      const category = cleanText($(row).find('td').eq(0).text());
      const timesSubscribed = cleanText($(row).find('td').eq(1).text());
      if (category && timesSubscribed) {
        ipoDetails.subscriptionStatus[category] = timesSubscribed;
      }
    });

    // 13. Prospectus
    ipoDetails.prospectus = $('a:contains("RHP")').attr('href') || '';

    // 14. Listing Details
    ipoDetails.listingDetails = {};
    ipoDetails.listingDetails.date = cleanText($('p:contains("listing date")').text().match(/February \d{2}, 2025/)?.[0] || '');
    ipoDetails.listingDetails.exchanges = cleanText($('p:contains("BSE, NSE")').text().match(/BSE, NSE/)?.[0] || '');

    // 15. Listing Day Trading Information
    ipoDetails.listingDayTrading = cleanText($('h2:contains("Listing Day Trading Information")').next('p').text());

    // 16. Contact Details
    ipoDetails.contactDetails = {};
    const contactSection = $('h2:contains("Contact Details")').next('p');
    ipoDetails.contactDetails.address = cleanText(contactSection.find('br').eq(0).prev().text());
    ipoDetails.contactDetails.phone = cleanText(contactSection.find('br').eq(1).prev().text().match(/\+91.*$/)?.[0] || '');
    ipoDetails.contactDetails.email = cleanText(contactSection.find('a[href*="mailto"]').text());
    ipoDetails.contactDetails.website = contactSection.find('a[href*="http"]').attr('href') || '';

    // 17. Registrar
    ipoDetails.registrar = {};
    const registrarSection = $('h2:contains("Registrar")').next('p');
    ipoDetails.registrar.name = cleanText(registrarSection.find('strong').text());
    ipoDetails.registrar.phone = cleanText(registrarSection.find('br').eq(1).prev().text().match(/\+91.*$/)?.[0] || '');
    ipoDetails.registrar.email = cleanText(registrarSection.find('a[href*="mailto"]').text());
    ipoDetails.registrar.website = registrarSection.find('a[href*="http"]').attr('href') || '';

    // 18. Lead Manager(s)
    ipoDetails.leadManagers = [];
    const leadManagerSection = $('h2:contains("Lead Manager")').next('p');
    leadManagerSection.find('strong').each((i, item) => {
      ipoDetails.leadManagers.push(cleanText($(item).text()));
    });

    return ipoDetails;

  } catch (error) {
    console.error('Error scraping Quality Power IPO:', error.message);
    return { error: 'Failed to scrape data', details: error.message };
  } finally {
    // Always close the browser to prevent memory leaks
    await browser.close();
  }
}

// Execute the scraper and output JSON
scrapeQualityPowerIPO().then(data => {
  console.log(JSON.stringify(data, null, 2));
}).catch(err => {
  console.error('Script execution failed:', err);
});
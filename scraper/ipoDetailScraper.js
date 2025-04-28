const cheerio = require('cheerio'); // Add cheerio for easier HTML parsing
const { launchBrowser } = require('../utils/browserHelper');

/**
 * Cleans text by removing excessive whitespace and optionally HTML tags.
 * @param {string} text - The input text.
 * @param {boolean} [removeTags=true] - Whether to remove HTML tags.
 * @returns {string} - Cleaned text.
 */
const cleanText = (text, removeTags = true) => {
  if (!text) return '';
  let cleaned = text;
  
  // Remove HTML comments first
  cleaned = cleaned.replace(/<!--.*?-->/gs, '');

  // Optionally remove tags
  if (removeTags) {
    // Preserve link text before removing general tags
    cleaned = cleaned.replace(/<a[^>]*>(.*?)<\/a>/gi, '$1'); // Keep link text
    // Preserve strong/b tags text
    cleaned = cleaned.replace(/<(strong|b)>(.*?)<\/(strong|b)>/gi, '$2');
    cleaned = cleaned.replace(/<br\s*\/?>/gi, ' \n '); // Replace <br> with space-newline-space for potential splitting
    cleaned = cleaned.replace(/<[^>]*>/g, ' '); // Remove other tags
  }
  
  // Remove currency symbols and commas (usually for numeric conversion later)
  cleaned = cleaned.replace(/[₹,]/g, '');
  cleaned = cleaned.replace(/&nbsp;/g, ' '); // Replace non-breaking spaces
  cleaned = cleaned.replace(/\s+/g, ' ').replace(/\r\n|\n|\r/gm, ' ').trim(); // Consolidate whitespace
  return cleaned;
};

/**
 * Sanitizes a string to be used as a JSON key.
 * @param {string} key - The raw key string.
 * @param {string} [ipoName=''] - The IPO name for context.
 * @returns {string} - Sanitized key.
 */
const sanitizeKey = (key, ipoName = '') => {
  if (!key) return 'unknown';
  let sanKey = key.toLowerCase();

  // Remove the base IPO name from the key if present
  if (ipoName) {
      const sanIpoName = ipoName.toLowerCase()
                        .replace(/ limited| ltd| private| pvt/g, '')
                        .trim()
                        .replace(/\s+/g, '_');
      sanKey = sanKey.replace(new RegExp(`^${sanIpoName}_?`), '');
      sanKey = sanKey.replace(new RegExp(`_?${sanIpoName}$`), '');
  }
  
  // Remove common IPO related terms
  sanKey = sanKey.replace(/_?ipo_?/g, '_');
  sanKey = sanKey.replace(/_?details_?/g, '_');
  sanKey = sanKey.replace(/_?information_?/g, '_');
  sanKey = sanKey.replace(/_?tentative_schedule_?/g, '_schedule_');
  sanKey = sanKey.replace(/_?objects_of_the_issue_?/g, '');
  sanKey = sanKey.replace(/_?company_?/g, '');
  sanKey = sanKey.replace(/_?limited_?/g, '');
  sanKey = sanKey.replace(/_?ltd_?/g, '');

  // General cleanup
  sanKey = sanKey
    .replace(/\(.*\)/g, '') // Remove content in parentheses
    .replace(/[^a-z0-9_\s-]+/gi, '') // Allow letters, numbers, underscore, hyphen, space
    .trim()
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Consolidate multiple underscores
    .replace(/^_+|_+$/g, ''); // Trim leading/trailing underscores

  // Specific overrides
  const overrides = {
      'date': 'ipo_date', // Specific for basic details
      'timeline_schedule': 'timeline',
      'promoter_holding': 'promoter_holding',
      'financials': 'financials',
      'financial': 'financials',
      'key_performance_indicator': 'kpi',
      'key_performance_indicators': 'kpi',
      'anchor_investors': 'anchor_investors',
      'anchor_investor': 'anchor_investors',
      'about': 'about',
      'objective': 'objectives',
      'contact': 'contact_details',
      'registrar': 'registrar',
      'lead_manager': 'lead_managers',
      'lead_managers': 'lead_managers',
      'prospectus': 'prospectus_links',
      'reservation': 'reservation',
      'lot_size': 'lot_size',
      'listing_day_trading': 'listing_day_trading',
      'listing': 'listing_details',
      'subscription_status' : 'subscription_status',
      'buy_or_not' : 'recommendation_summary',
      'message_board': 'message_board',
      'faqs' : 'faqs',
      'market_maker_portion': 'market_maker_portion', // Added based on example
      'employee_discount': 'employee_discount'     // Added based on example
  };

  // Apply overrides based on exact match or inclusion
  for (const pattern in overrides) {
      if (sanKey === pattern || sanKey.includes(pattern)) {
          return overrides[pattern];
      }
  }

  return sanKey || 'unknown';
};

/**
 * Fetches and structures data from an IPO detail page.
 * @param {string} url - The URL of the IPO page.
 * @returns {Promise<object>} - Structured IPO data or an error object.
 */
async function fetchStructuredData(url) {
  let browser;
  let page;
  console.log(`Fetching structured data from: ${url}`);
  const processedTables = new Set(); // Track tables processed by specific logic
  
  // Track which sections are available in the scraped data
  const sectionsAvailable = {
    basicDetails: false,
    tentativeSchedule: false,
    lotSize: false,
    timeline: false,
    kpi: false,
    financials: false,
    promoterHolding: false,
    objectives: false,
    about: false,
    subscriptionStatus: false,
    contactDetails: false,
    registrarDetails: false,
    leadManagers: false,
    listingDetails: false,
    listingDayTrading: false,
    faqs: false,
    recommendationSummary: false,
    prospectusLinks: false,
    reservation: false,
    anchorInvestors: false
  };

  try {
    // Use the browser helper - ensuring we use a proxy
    const browserLaunchResult = await launchBrowser(url, {
        timeout: 90000, // Pass existing timeout
        args: [
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-site-isolation-trials',
        ]
    });
    browser = browserLaunchResult.browser;
    page = browserLaunchResult.page;
    
    // Add browser-like headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Origin': 'https://www.chittorgarh.com',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'DNT': '1'
    });
    
    // Setup cookies for the domain
    await page.setCookie({
      name: 'visited',
      value: 'true',
      domain: 'chittorgarh.com',
      path: '/',
    }, {
      name: 'sessionvisit',
      value: Date.now().toString(),
      domain: 'chittorgarh.com',
      path: '/',
    });

    // Log the IP we're using (via the proxy) to ensure proxy connection
    const proxyIP = browserLaunchResult.proxyIP;
    console.log(`Connected via proxy IP: ${proxyIP} for scraping detail page`);

    // Extract IPO name and logo directly - will be used in multiple places
    const ipoName = await page.$eval('h1.ipo-title', el => el.textContent.trim()).catch(() => null);
    const logoUrl = await page.$eval('.div-logo img', el => el.getAttribute('src')).catch(() => null);
    
    // Extract specific basic IPO details
    const basicDetails = await page.evaluate(() => {
      // Define the fields we want to extract
      const targetFields = {
        faceValue: "Face Value",
        issuePrice: "Issue Price",
        lotSize: "Lot Size",
        issueSize: "Total Issue Size",
        freshIssue: "Fresh Issue",
        offerForSale: "Offer for Sale",
        listingAt: "Listing At",
        ipoDate: "IPO Date",
        issuePriceBand: "Issue Price Band",
        // Remove duplicate keys to avoid overwriting
        marketMakerPortion: "Market Maker Portion",
        ipoOpenDate: "IPO Open Date",
        ipoCloseDate: "IPO Close Date",
        ipoListingDate: "Listing Date",
        initiationOfRefunds: "Initiation of Refunds",
        creditOfSharesToDemat: "Credit of Shares to Demat", 
        tentativeListingDate: "Tentative Listing Date",
        issueType: "Issue Type"
        // Removed shareHoldingPreIssue and shareHoldingPostIssue as we'll handle them separately
      };
      
      const results = {};
      
      // Special fields that might appear multiple times - we'll store all occurrences
      const multiFields = {
        "shareHoldingPreIssue": "Share Holding Pre Issue",
        "shareHoldingPostIssue": "Share Holding Post Issue"
      };
      
      // Store multiple occurrences of specific fields
      const multiFieldValues = {
        shareHoldingPreIssue: [],
        shareHoldingPostIssue: []
      };
      
      // Find all rows in the basic details table - search all tables to be thorough
      const rows = document.querySelectorAll('table.table-bordered tr, table.table-striped tr');
      
      // First pass - general fields from targetFields
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const label = cells[0].textContent.trim();
          
          // Check if this row contains one of our target fields
          for (const [key, fieldLabel] of Object.entries(targetFields)) {
            if (label.includes(fieldLabel)) {
              // Handle market maker portion special case with links
              if (key === 'marketMakerPortion' && cells[1].querySelector('a')) {
                const makerLink = cells[1].querySelector('a');
                let textNode = '';
                Array.from(cells[1].childNodes).forEach(node => {
                  if (node.nodeType === Node.TEXT_NODE) {
                    textNode += node.textContent;
                  }
                });
                results[key] = {
                  text: textNode.trim(),
                  maker_name: makerLink?.textContent?.trim() || '',
                  maker_url: makerLink?.href || ''
                };
              } else {
                // Normal case - just get the text
                results[key] = cells[cells.length - 1].textContent.trim();
              }
              break;
            }
          }
          
          // Check for multi-occurrence fields
          for (const [key, fieldLabel] of Object.entries(multiFields)) {
            if (label.toLowerCase().includes(fieldLabel.toLowerCase())) {
              const value = cells[cells.length - 1].textContent.trim();
              if (value) {
                multiFieldValues[key].push({
                  label: label,
                  value: value
                });
              }
            }
          }
        }
      });
      
      // Add the first occurrence of each multi-field to the main results for backward compatibility
      for (const [key, values] of Object.entries(multiFieldValues)) {
        if (values.length > 0) {
          results[key] = values[0].value;
          
          // Always add an array with all occurrences, even if there's only one
          results[`${key}All`] = values.map(v => ({ label: v.label, value: v.value }));
        }
      }
      
      return results;
    });
    
    console.log("Basic details extraction completed");
    // Mark basic details as available if we found data
    if (Object.keys(basicDetails).length > 0) {
      sectionsAvailable.basicDetails = true;
    }
    
    // Get the page HTML and load it into Cheerio for the rest of the scraping
    const content = await page.content();
    const $ = cheerio.load(content);
    
    // Initialize result structure with metadata including basic details
    const result = {
      pageTitle: $('title').text().trim(),
      ipoName: ipoName || '',
      logo: logoUrl || '',
      pageHeading: '',
      ipoSummaryParagraphs: [],
      basicDetails: basicDetails, // Include the specific details we extracted
      tentativeDetails: {}, // Added section for specific IPO dates
      timeline: { summary: '', schedule: {} },
      lotSize: { summary: '', applications: {}, calculator_link: null },
      kpi: { summary: '', indicators: {}, calculation_notes: [], peer_comparison_link: null },
      financials: { heading: '', summary: '', data: [], unit: '' },
      promoterHolding: { promoters: '', holdings: {}, note: '' },
      objectives: { summary: '', points: [], note: '' },
      about: { summary: '', details: '' }, // Added summary for consistency
      subscriptionStatus: { summary: '', overall: {}, total_applications: '', notes: '' },
      subscriptionDetails: [], // Day-wise
      contactDetails: {},
      registrarDetails: {},
      leadManagers: [],
      leadManagerReports: [],
      listingDetails: { pre_open_links: [] },
      listingDayTrading: { data: {}, performance_link: null },
      faqs: [],
      recommendationSummary: { recommendations: {}, links: [] },
      prospectusLinks: [],
      reservation: { summary: '', allocation: [] },
      anchorInvestors: { summary: '', list_link: null, details: {} },
      additionalTables: [] // Add new field for generically scraped tables
    };
    
    // Extract H1 heading if it wasn't already extracted above
    if (!result.ipoName) {
      const h1Element = $('h1').first();
      if (h1Element.length) {
          result.pageHeading = h1Element.text().trim();
          result.ipoName = result.pageHeading.replace(/ IPO.*| Limited IPO.*| Ltd IPO.*/i, '').trim();
      }
    } else {
      result.pageHeading = result.ipoName;
    }

    // Extract introductory paragraphs after H1 before the first major section/table
    const h1Element = $('h1').first();
    if (h1Element.length) {
      let currentElement = h1Element.parent().next(); // Start after H1's container
      while(currentElement.length && !currentElement.find('h2').length && !currentElement.is('table') && !currentElement.is('.row') && !currentElement.find('table').length) {
        if(currentElement.is('p') || currentElement.find('p').length) {
          const paraText = cleanText(currentElement.text());
          if(paraText && !paraText.toLowerCase().includes("refer to")) { // Avoid the 'Refer to RHP' para
             result.ipoSummaryParagraphs.push(paraText);
          }
        }
        currentElement = currentElement.next();
      }
    } else {
      console.warn("Could not find H1 element for extracting summary paragraphs.");
    }

    const mainContentArea = $('#main');
    if (!mainContentArea.length) {
        console.error("Could not find main content area (#main).");
    }

    // Iterate through main columns (e.g., col-lg-6)
    mainContentArea.find('div[class*="col-lg-6"], div[class*="col-md-6"]').each(function() {
        const columnDiv = $(this);

        // Find potential section containers within this column (often divs with itemscope or specific classes)
        columnDiv.find('div:has(> h2.border-bottom), div[itemscope], div:has(h2[itemprop="about"])').each(function() {
            const sectionContainer = $(this);
            const h2Element = sectionContainer.find('h2').first(); // Find the h2 within this container
            if (!h2Element.length) return; // Skip if no h2 found in this container

            let headingText = h2Element.text().trim();
            const sectionKey = sanitizeKey(headingText, result.ipoName);

            // Find the table associated with this h2 (common pattern)
            // Look for table directly within the container, or inside a .table-responsive within the container
            const table = sectionContainer.find('> table').first(); // Direct table child
            const tableResponsiveDiv = sectionContainer.find('> .table-responsive').first(); // Direct responsive div child
            const responsiveTable = tableResponsiveDiv.find('table').first(); // Table inside responsive div
            // Prioritize responsive table if available, then direct table
            const targetTable = responsiveTable.length ? responsiveTable : (table.length ? table : null);

            // Find paragraphs directly within the container, usually after the h2
            const paragraphs = h2Element.nextAll('p');
            let summaryText = '';
            paragraphs.each(function() {
                summaryText += cleanText($(this).text()) + ' ';
            });
            summaryText = summaryText.trim();

            if (targetTable) {
                // Mark this table as processed by specific logic
                processedTables.add(targetTable.get(0));

                switch (sectionKey) {
                    case 'details':
                        targetTable.find('tbody tr').each(function() {
                            const cells = $(this).find('td');
                            if (cells.length >= 2) {
                                const rawKey = cleanText($(cells[0]).text()); // Use existing cleanText
                                let sanKey = sanitizeKey(rawKey); // Use existing sanitizeKey

                                // Retain special handling for Market Maker Portion
                                if (sanKey === 'market_maker_portion') {
                                    const makerLink = $(cells[1]).find('a');
                                    let textNode = '';
                                    $(cells[1]).contents().each(function() {
                                        if (this.nodeType === 3) { // Text node
                                            textNode += $(this).text();
                                        } else if (this.nodeName.toLowerCase() === 'br') {
                                            return false; // Stop at the first <br>
                                        }
                                    });
                                    result.basicDetails[sanKey] = {
                                        text: cleanText(textNode),
                                        maker_name: makerLink?.text()?.trim() || '',
                                        maker_url: makerLink?.attr('href') || ''
                                    };
                                } else {
                                     // Use cleaned HTML content for the value, preserving line breaks as pipes
                                     const valueHtml = $(cells[1]).html();
                                     const valueText = cleanText(valueHtml?.replace(/<br\s*\/?>/gi, ' | '), false);
                                     if (sanKey && sanKey !== 'unknown') {
                                         result.basicDetails[sanKey] = valueText;
                                     }
                                }
                            }
                        });
                        break;
                    case 'timeline':
                        result.timeline.summary = summaryText;
                        targetTable.find('tbody tr').each(function() {
                            const cells = $(this).find('td');
                            if (cells.length >= 2) {
                                const key = sanitizeKey(cleanText($(cells[0]).text()));
                                const value = cleanText($(cells[1]).text());
                                if (key && key !== 'unknown') {
                                    result.timeline.schedule[key] = value;
                                    // Mark timeline as available
                                    sectionsAvailable.timeline = true;
                                }
                            }
                        });
                        break;
                    case 'lot_size':
                        result.lotSize.summary = summaryText;
                        const lotHeaders = [];
                        targetTable.find('thead th').each(function() {
                           lotHeaders.push(sanitizeKey(cleanText($(this).text())));
                        });
                        
                        console.log("Extracting lot size details...");
                        
                        targetTable.find('tbody tr').each(function() {
                            const rowData = {};
                            $(this).find('td').each(function(index) {
                               const headerKey = lotHeaders[index] || `col_${index}`;
                               rowData[headerKey] = cleanText($(this).text());
                            });
                            
                            // Get the application type properly
                            const applicationType = rowData.application || '';
                            
                            if (applicationType) {
                                console.log(`Found lot size row: ${applicationType}`);
                                
                                // Determine the correct key based on application type
                                let key;
                                if (applicationType.toLowerCase().includes('retail') && applicationType.toLowerCase().includes('min')) {
                                    key = 'retail_min';
                                } else if (applicationType.toLowerCase().includes('retail') && applicationType.toLowerCase().includes('max')) {
                                    key = 'retail_max';
                                } else if (applicationType.toLowerCase().includes('b-hni') && applicationType.toLowerCase().includes('min')) {
                                    key = 'bhni_min';
                                } else if (applicationType.toLowerCase().includes('b-hni') && applicationType.toLowerCase().includes('max')) {
                                    key = 'bhni_max';
                                } else if (applicationType.toLowerCase().includes('s-hni') && applicationType.toLowerCase().includes('min')) {
                                    key = 'shni_min';
                                } else if (applicationType.toLowerCase().includes('s-hni') && applicationType.toLowerCase().includes('max')) {
                                    key = 'shni_max';
                                } else if (applicationType.toLowerCase().includes('hni') && applicationType.toLowerCase().includes('min')) {
                                    // Generic HNI handling
                                    key = 'hni_min';
                                } else if (applicationType.toLowerCase().includes('hni') && applicationType.toLowerCase().includes('max')) {
                                    // Generic HNI handling
                                    key = 'hni_max';
                                } else {
                                    // Fallback to sanitized key
                                    key = sanitizeKey(applicationType);
                                }
                                
                                if (key && key !== 'unknown') {
                                    result.lotSize.applications[key] = rowData;
                                    // Mark lot size as available
                                    sectionsAvailable.lotSize = true;
                                }
                            }
                        });
                        
                        let calculatorLink = targetTable.nextAll('span').find('a');
                        if (calculatorLink.length === 0) {
                             calculatorLink = h2Element.parent().find('a:contains("Lot Size Calculator")');
                        }
                        if(calculatorLink.length > 0) {
                             result.lotSize.calculator_link = {
                                text: calculatorLink.text().trim(),
                                url: calculatorLink.attr('href')
                             };
                        }
                        break;
                     case 'kpi':
                         result.kpi.summary = summaryText;
                         // Handle two tables for KPI under the same h2 parent div
                         const kpiTables = h2Element.parent().find('table');
                         kpiTables.each(function(){
                             const currentTable = $(this);
                             processedTables.add(currentTable.get(0)); // Mark KPI tables
                             if(currentTable.find('th:contains("Values")').length > 0) {
                                 currentTable.find('tbody tr').each(function() {
                                     const cells = $(this).find('td');
                                     if(cells.length >= 2) {
                                         const key = sanitizeKey(cleanText($(cells[0]).text()));
                                         const value = cleanText($(cells[1]).text());
                                         result.kpi.indicators[key] = value;
                                         // Mark KPI as available
                                         sectionsAvailable.kpi = true;
                                     }
                                 });
                             } else if (currentTable.find('th:contains("Pre IPO")').length > 0) {
                                 const kpiHeaders = [];
                                 currentTable.find('thead th').each(function() {
                                     kpiHeaders.push(sanitizeKey(cleanText($(this).text())));
                                 });
                                 currentTable.find('tbody tr').each(function() {
                                     const rowKey = sanitizeKey(cleanText($(this).find('td').first().text()).replace(/\(rs\)|\(x\)/g, ''));
                                     $(this).find('td').each(function(cellIndex) {
                                         if (cellIndex > 0) {
                                             const header = kpiHeaders[cellIndex];
                                             result.kpi.indicators[`${rowKey}_${header}`] = cleanText($(this).text());
                                             // Mark KPI as available
                                             sectionsAvailable.kpi = true;
                                         }
                                     });
                                 });
                                 const noteList = currentTable.nextAll('.mb-2').find('ul li');
                                 noteList.each(function() {
                                     result.kpi.calculation_notes.push(cleanText($(this).text()));
                                 });
                             }
                         });
                        const peerLink = sectionContainer.find('a:contains("Peer Comparison")');
                        if (peerLink.length > 0) {
                            result.kpi.peer_comparison_link = {
                                text: peerLink.text().trim(),
                                url: peerLink.attr('href')
                            };
                        }
                        break;
                    case 'promoter_holding':
                        result.promoterHolding.promoters = cleanText(h2Element.next('.mb-2').text());
                        targetTable.find('tbody tr').each(function() {
                            const cells = $(this).find('td');
                            if (cells.length >= 2) {
                                const key = sanitizeKey(cleanText($(cells[0]).text()));
                                const value = cleanText($(cells[1]).text());
                                if (key && key !== 'unknown') {
                                    result.promoterHolding.holdings[key] = value;
                                    // Mark promoter holding as available
                                    sectionsAvailable.promoterHolding = true;
                                }
                            }
                        });
                         const holdingNote = targetTable.next('p');
                         if (holdingNote.length > 0 && holdingNote.text().includes('Note')) {
                             result.promoterHolding.note = cleanText(holdingNote.text().replace('Note : ', ''));
                         }
                        break;
                     case 'objectives':
                        result.objectives.summary = summaryText;
                        const objectivesList = h2Element.nextAll('ol, ul').first();
                        objectivesList.find('li').each(function() {
                             result.objectives.points.push(cleanText($(this).text()));
                             // Mark objectives as available
                             sectionsAvailable.objectives = true;
                        });
                        const objectivesEndNote = objectivesList.next('p');
                         if (objectivesEndNote.length > 0) {
                            result.objectives.note = cleanText(objectivesEndNote.text());
                         }
                        break;
                    case 'financials':
                        result.financials.heading = cleanText(targetTable.closest('.row').find('h2').last().text());
                        result.financials.summary = summaryText;
                        const financialHeaders = [];
                        targetTable.find('tbody tr:first-child td').each(function() {
                            financialHeaders.push(cleanText($(this).text())); // Keep original date format here
                        });
                        result.financials.periods = financialHeaders.slice(1); // Store periods

                        targetTable.find('tbody tr').each(function(rowIndex) {
                            if (rowIndex === 0) return; // Skip header row
                            const rowData = { metric: '', values: [] };
                            $(this).find('td').each(function(cellIndex) {
                                if (cellIndex === 0) {
                                    rowData.metric = cleanText($(this).text());
                                } else {
                                    rowData.values.push(cleanText($(this).text()));
                                }
                            });
                            if (rowData.metric) {
                                result.financials.data.push(rowData);
                                // Mark financials as available
                                sectionsAvailable.financials = true;
                            }
                        });
                        const footerNote = targetTable.find('tfoot td small');
                        if (footerNote.length > 0) {
                            result.financials.unit = cleanText(footerNote.text());
                        }
                        break;
                    case 'reservation':
                         result.reservation.summary = summaryText;
                         const reservationHeaders = [];
                         targetTable.find('thead th').each(function(){
                             let headerText = cleanText($(this).text());
                             if(headerText.toLowerCase().includes('maximum allottees')) headerText = 'Maximum Allottees';
                             reservationHeaders.push(sanitizeKey(headerText));
                          });
                         targetTable.find('tbody tr').each(function(){
                             const rowData = {};
                             $(this).find('td').each(function(index){
                                 const header = reservationHeaders[index] || `col_${index}`;
                                 // Clean &nbsp; which might be used for indentation
                                 const cellText = cleanText($(this).text().replace(/&nbsp;/g, ' '));
                                 rowData[header] = cellText;
                             });
                             if (rowData.investor_category) {
                                 result.reservation.allocation.push(rowData);
                                 // Mark reservation as available
                                 sectionsAvailable.reservation = true;
                             }
                         });
                        break;
                     case 'anchor_investors':
                         result.anchorInvestors.summary = summaryText;
                         // Find anchor link within summary paragraphs
                         paragraphs.find('a').each(function() {
                             const linkText = $(this).text().toLowerCase();
                             if(linkText.includes('anchor investors list')) {
                                 result.anchorInvestors.list_link = {
                                     text: $(this).text().trim(),
                                     url: $(this).attr('href')
                                 };
                                 // Mark anchor investors as available
                                 sectionsAvailable.anchorInvestors = true;
                             }
                         });

                         // The table might not be directly under the h2 in this case
                         const anchorTable = sectionContainer.find('table').first(); // More robust find
                         if (anchorTable.length > 0) {
                            processedTables.add(anchorTable.get(0)); // Mark anchor table
                         }
                         anchorTable.find('tbody tr').each(function(){
                             const cells = $(this).find('td');
                             if(cells.length >= 2) {
                                 const key = sanitizeKey(cleanText(cells.first().text()));
                                 const value = cleanText(cells.last().text());
                                 if (key && key !== 'unknown') {
                                     result.anchorInvestors.details[key] = value;
                                     // Mark anchor investors as available
                                     sectionsAvailable.anchorInvestors = true;
                                 }
                             }
                         });
                        break;
                }
            }
        });

        // Card-based sections extraction
        columnDiv.find('.card').each(function() {
            const card = $(this);
            const cardHeader = card.find('.card-header h2');
            if (!cardHeader.length) return;

            const headingText = cardHeader.text().trim();
            const sectionKey = sanitizeKey(headingText, result.ipoName);
            const cardBody = card.find('.card-body');

            switch (sectionKey) {
                case 'contact_details':
                    const addressElement = cardBody.find('address');
                    if (addressElement.length > 0) {
                        const addressHtml = addressElement.find('p').html(); // Get inner HTML of the paragraph
                        const addressParts = addressHtml?.split(/<br\s*\/?>/i); // Split by <br>
                        const addressLines = [];
                        if (addressParts) {
                            addressParts.forEach(part => {
                                const cleanPart = cleanText(part); // Clean each part
                                if (!cleanPart) return;

                                if (cleanPart.toLowerCase().startsWith('phone:')) {
                                    result.contactDetails.phone = cleanPart.replace(/phone:/i, '').trim();
                                } else if (cleanPart.toLowerCase().startsWith('email:')) {
                                    result.contactDetails.email = cleanPart.replace(/email:/i, '').trim();
                                } else if (cleanPart.toLowerCase().startsWith('website:')) {
                                    // Website link extracted separately below
                                } else if (cleanPart !== result.contactDetails.company_name) {
                                    // Add as address line if not empty and not the company name
                                    addressLines.push(cleanPart);
                                }
                            });
                        }
                        result.contactDetails.full_address = addressLines.join(', ').trim();
                        result.contactDetails.website = cardBody.find('a[href^="http"]')?.attr('href') || '';
                        
                        // Mark contact details as available
                        sectionsAvailable.contactDetails = true;
                    }
                     break;
                case 'registrar':
                     const registrarNameElement = cardBody.find('a strong, strong').first();
                     result.registrarDetails.name = registrarNameElement?.text()?.trim();
                     const registrarBodyHtml = cardBody.html(); // Get inner HTML
                     const registrarParts = registrarBodyHtml?.split(/<br\s*\/?>/i); // Split by <br>
                     if (registrarParts) {
                         registrarParts.forEach(part => {
                             const cleanPart = cleanText(part);
                             if (!cleanPart) return;

                             if (cleanPart.toLowerCase().startsWith('phone:')) {
                                 result.registrarDetails.phone = cleanPart.replace(/phone:/i, '').trim();
                             } else if (cleanPart.toLowerCase().startsWith('email:')) {
                                 result.registrarDetails.email = cleanPart.replace(/email:/i, '').trim();
                             } else if (cleanPart.toLowerCase().startsWith('website:')) {
                                 // Website link extracted separately below
                             }
                         });
                     }
                     result.registrarDetails.website = cardBody.find('a[href^="http"]')?.attr('href') || '';
                     
                     // Mark registrar details as available
                     if (result.registrarDetails.name) {
                         sectionsAvailable.registrarDetails = true;
                     }
                     break;
                case 'lead_managers':
                    cardBody.find('ol li, ul li').each(function() {
                         // Check if this is a manager item or a report item
                         const isReportItem = $(this).find('a').text().toLowerCase().includes('summary') || $(this).find('a').text().toLowerCase().includes('tracker');
                         if (!isReportItem) {
                            const managerName = cleanText($(this).find('a').first().text().split('(')[0]);
                            const managerLink = $(this).find('a').first().attr('href');
                            const performanceLink = $(this).find('a:contains("Past IPO Performance")').attr('href');
                            if (managerName) {
                                result.leadManagers.push({
                                    name: managerName,
                                    url: managerLink || '',
                                    performance_link: performanceLink || ''
                                });
                                // Mark lead managers as available
                                sectionsAvailable.leadManagers = true;
                            }
                         }
                    });
                    // Extract report links explicitly
                    cardBody.find('p:contains("Lead Manager Reports") + ul li').each(function() {
                        const link = $(this).find('a');
                        result.leadManagerReports.push({
                            text: link.text().trim(),
                            url: link.attr('href')
                        });
                    });
                    break;
                 case 'prospectus_links':
                     cardBody.find('ul li').each(function() {
                        const link = $(this).find('a');
                        const linkText = cleanText(link.text());
                        const linkUrl = link.attr('href');
                         if (linkText && linkUrl) {
                             result.prospectusLinks.push({
                                 text: linkText,
                                 url: linkUrl
                             });
                             // Mark prospectus links as available
                             sectionsAvailable.prospectusLinks = true;
                         }
                     });
                    break;
                 case 'listing_details':
                     const listingDetailTable = cardBody.find('table').first();
                     if (listingDetailTable.length) processedTables.add(listingDetailTable.get(0));
                     listingDetailTable.find('tbody tr').each(function() {
                         const cells = $(this).find('td');
                         if(cells.length >= 2) {
                             const key = sanitizeKey(cleanText(cells.first().text()));
                             const value = cleanText(cells.last().text());
                             if(key && key !== 'unknown') {
                                 result.listingDetails[key] = value;
                                 // Mark listing details as available
                                 sectionsAvailable.listingDetails = true;
                             }
                         }
                     });
                     cardBody.find('p a').each(function() {
                         result.listingDetails.pre_open_links.push({
                             text: $(this).text().trim(),
                             url: $(this).attr('href')
                         });
                     });
                     break;
                 case 'listing_day_trading':
                    const tradeTable = cardBody.find('.table-responsive table, table').first();
                    if (tradeTable.length) processedTables.add(tradeTable.get(0));
                    const tradeHeaders = [];
                    tradeTable.find('thead th').each(function() {
                       tradeHeaders.push(sanitizeKey(cleanText($(this).text())));
                    });
                    tradeTable.find('tbody tr').each(function() {
                         const rowData = {};
                         const metric = sanitizeKey(cleanText($(this).find('td').first().text()));
                         $(this).find('td').each(function(index) {
                             if(index > 0) {
                                 const headerKey = tradeHeaders[index] || `col_${index}`;
                                 rowData[headerKey] = cleanText($(this).text());
                             }
                         });
                         if (metric && metric !== 'unknown') {
                             result.listingDayTrading.data[metric] = rowData;
                             // Mark listing day trading as available
                             sectionsAvailable.listingDayTrading = true;
                         }
                     });
                    const perfLink = cardBody.find('p a:contains("Check IPO Performance")');
                    if(perfLink.length > 0) {
                         result.listingDayTrading.performance_link = {
                            text: perfLink.text().trim(),
                            url: perfLink.attr('href')
                         };
                    }
                    break;
                case 'recommendation_summary':
                    const recTable = cardBody.find('table').first();
                    if (recTable.length) processedTables.add(recTable.get(0));
                    const recHeaders = [];
                    recTable.find('tbody tr:first-child th, thead th').each(function(index) { // Headers might be in thead or tbody
                        if(index > 0) recHeaders.push(sanitizeKey(cleanText($(this).text())));
                    });
                     recTable.find('tbody tr').each(function(rowIndex) {
                         // Skip header row if it was in tbody
                         if(rowIndex === 0 && $(this).find('th').length > 0) return;

                         const rowData = {};
                         const source = cleanText($(this).find('td:first-child a, td:first-child').text()); // Get source name
                         $(this).find('td').each(function(cellIndex) {
                             if(cellIndex > 0) {
                                 const headerKey = recHeaders[cellIndex-1];
                                 if(headerKey) rowData[headerKey] = cleanText($(this).text());
                             }
                         });
                         if(source) {
                             result.recommendationSummary.recommendations[sanitizeKey(source)] = rowData;
                             // Mark recommendation summary as available
                             sectionsAvailable.recommendationSummary = true;
                         }
                    });
                     cardBody.find('p a').each(function() {
                         result.recommendationSummary.links.push({
                             text: $(this).text().trim(),
                             url: $(this).attr('href') || '#'
                         });
                     });
                     break;
            }
        });
    });

    // --- Separate Logic to find the Tentative Dates Table ---
    console.log("Searching for the specific IPO Dates table...");
    $('table.table-bordered.table-striped').each(function() {
        const table = $(this);
        const firstCellText = table.find('tbody tr:first-child td:first-child').text().trim();

        if (firstCellText === 'IPO Open Date') {
            console.log("Found the IPO Dates table. Extracting details...");
            processedTables.add(table.get(0)); // Mark this specific table
            table.find('tbody tr').each(function() {
                const cells = $(this).find('td');
                if (cells.length >= 2) {
                    const key = sanitizeKey(cleanText($(cells[0]).text()));
                    const value = cleanText($(cells[1]).text());
                    if (key && key !== 'unknown' && key !== 'ipo_date') { // Avoid duplicating 'ipo_date' if already in basic details
                        result.tentativeDetails[key] = value;
                        // Mark tentative schedule as available
                        sectionsAvailable.tentativeSchedule = true;
                    } else if (key === 'ipo_date') {
                        // Handle potential duplication or decide where ipo_open_date should live
                        // For now, let's put it in tentativeDetails if not already in basicDetails
                        if (!result.basicDetails.ipo_open_date) {
                            result.tentativeDetails[key] = value; // Or map to a specific key like 'open_date'
                            // Mark tentative schedule as available
                            sectionsAvailable.tentativeSchedule = true;
                        }
                    }
                }
            });
            // Stop searching after finding the table
            return false;
        }
    });
    // --- End of Separate Logic ---

    // Extract About section (often needs a specific selector)
    const aboutSection = $('#ipoSummary');
    if (aboutSection.length > 0) {
        let aboutHtml = aboutSection.html();
        aboutHtml = aboutHtml.replace(/<!--.*?-->/gs, '');
        result.about.details = aboutHtml.trim();
        // Mark about section as available
        sectionsAvailable.about = true;
    } else {
        $('h2:contains("About")').first().each(function() {
            let aboutContent = '';
            let current = $(this).next();
            while(current.length && !current.is('h2')) {
                if (current.is('p, ul, ol')) {
                    aboutContent += $.html(current);
                }
                current = current.next();
            }
            result.about.details = aboutContent.trim();
            // Mark about section as available if content found
            if (aboutContent.trim()) {
                sectionsAvailable.about = true;
            }
        });
    }
     // Attempt to find summary text for About section
     $('h2:contains("About")').first().prev('p').each(function() {
         result.about.summary = cleanText($(this).text());
     });

    // Extract Subscription Status (Bidding Detail)
    // First approach: Look for the table directly based on its contents
    console.log("Attempting to find subscription status table using direct approach...");
    let subscriptionFound = false;
    
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
                    
                    console.log(`Processing row with category: ${category}`);
                    
                    // Process different categories
                    let categoryKey = '';
                    
                    if (category.toLowerCase().includes('anchor')) {
                      categoryKey = 'anchor_investors';
                    } else if (category.toLowerCase().includes('qualified') || category.toLowerCase().includes('qib')) {
                      categoryKey = 'qib';
                    } else if (category.includes('bNII') || 
                              (category.toLowerCase().includes('nii') && category.toLowerCase().includes('above'))) {
                      categoryKey = 'bnii';
                    } else if (category.includes('sNII') || 
                              (category.toLowerCase().includes('nii') && category.toLowerCase().includes('below'))) {
                      categoryKey = 'snii';
                    } else if (category.toLowerCase().includes('non-institutional') || category.toLowerCase().includes('nii')) {
                      categoryKey = 'nii';
                    } else if (category.toLowerCase().includes('retail')) {
                      categoryKey = 'retail';
                    } else if (category.toLowerCase().includes('employee')) {
                      categoryKey = 'employee';
                    } else if (category.toLowerCase().includes('total')) {
                      categoryKey = 'total';
                    } else {
                      // Fallback case
                      categoryKey = sanitizeKey(category);
                    }
                    
                    if (categoryKey) {
                      result.overall_subscription[categoryKey] = rowData;
                      console.log(`Added data for category ${categoryKey}`);
                    }
                  });
            } catch (error) {
                console.error("Error processing direct subscription table:", error);
            }
        }
    });
    
    // Only proceed with previous methods if we didn't find anything with the direct approach
    if (!subscriptionFound) {
        // Extract Subscription Status (Bidding Detail) specifically after span#subscriptionDiv
        const subscriptionSpan = $('span#subscriptionDiv');
        if (subscriptionSpan.length > 0) {
            const subscriptionContainer = subscriptionSpan.next(); // Get the immediate next sibling
            if (subscriptionContainer.length > 0 && subscriptionContainer.find('h2:contains("Subscription Status")').length > 0) {
                console.log("Processing Subscription Status (Bidding Detail) section...");
                // Mark the subscription table if found
                const subTableOverall = subscriptionContainer.find('.table-responsive').first().find('table');
                if (subTableOverall?.length) {
                    processedTables.add(subTableOverall.get(0));
                }
                try {
                    const subH2 = subscriptionContainer.find('h2:contains("Subscription Status")').first();
                    result.subscriptionStatus.summary = cleanText(subH2?.next('p')?.text()); // Get first paragraph after h2

                    if (subTableOverall?.length) {
                        const subHeadersOverall = [];
                        subTableOverall.find('thead th').each(function(){
                            let headerText = cleanText($(this)?.text());
                            // Standardize slightly
                            if (headerText.toLowerCase().includes('category')) headerText = 'category';
                            if (headerText.toLowerCase().includes('subscription') || headerText.toLowerCase().includes('times')) headerText = 'subscription_times';
                            if (headerText.toLowerCase().includes('shares offered')) headerText = 'shares_offered';
                            if (headerText.toLowerCase().includes('shares bid for')) headerText = 'shares_bid_for';
                            if (headerText.toLowerCase().includes('total application')) headerText = 'total_application';
                            subHeadersOverall.push(sanitizeKey(headerText));
                         });

                        subTableOverall.find('tbody tr').each(function(){
                            const rowData = {};
                            $(this).find('td').each(function(index){
                                const header = subHeadersOverall[index] || `col_${index}`;
                                let cellText = cleanText($(this)?.text());
                                // Handle the NII* case - store note separately if needed, or just clean text
                                if(header === 'category' && cellText.includes('NII')) {
                                    // For now, just clean it, note is captured below table
                                    cellText = cleanText(cellText.replace('*',''));
                                }
                                rowData[header] = cellText;
                            });
                            const category = rowData.category?.trim();
                            // Store under a key that correctly represents the category
                            let key = sanitizeKey(category);
                            
                            // Special handling for NII subcategories (bNII and sNII)
                            if (category && (category.toLowerCase().includes('bnii') || 
                                (category.toLowerCase().includes('nii') && category.toLowerCase().includes('above')))) {
                                key = 'bnii'; // Big Non-Institutional Investors
                                result.subscriptionStatus.overall.nii = result.subscriptionStatus.overall.nii || {};
                                result.subscriptionStatus.overall.nii.subcategories = result.subscriptionStatus.overall.nii.subcategories || {};
                                result.subscriptionStatus.overall.nii.subcategories.bnii = rowData;
                            } else if (category && (category.toLowerCase().includes('snii') || 
                                      (category.toLowerCase().includes('nii') && category.toLowerCase().includes('below')))) {
                                key = 'snii'; // Small Non-Institutional Investors
                                result.subscriptionStatus.overall.nii = result.subscriptionStatus.overall.nii || {};
                                result.subscriptionStatus.overall.nii.subcategories = result.subscriptionStatus.overall.nii.subcategories || {};
                                result.subscriptionStatus.overall.nii.subcategories.snii = rowData;
                            } else if (category && category.toLowerCase().includes('employee')) {
                                key = 'employee'; // Employee category
                                result.subscriptionStatus.overall.employee = rowData;
                            } else if (key && key !== 'unknown') {
                                result.subscriptionStatus.overall[key] = rowData;
                            }
                            
                            // Always mark subscription status as available if we found any valid category
                            if (key && key !== 'unknown') {
                                sectionsAvailable.subscriptionStatus = true;
                            }
                        });
                    }

                    // Total Application count (more flexible pattern matching)
                    const totalAppRegex = /Total Application[s]?\s*:?\s*([\d,]+)/i;
                    
                    // First try normal structure
                    const totalAppElement = subscriptionContainer.find('p:contains("Total Application")');
                    const totalAppText = totalAppElement?.text();
                    if (totalAppText) {
                        // Extract just the number from "Total Application : 1,20,178"
                        const match = totalAppText.match(totalAppRegex);
                        if (match && match[1]) {
                            result.subscriptionStatus.total_applications = match[1].trim();
                        } else {
                            result.subscriptionStatus.total_applications = cleanText(totalAppText?.replace(/.*:/, ''));
                        }
                        // Mark subscription status as available
                        sectionsAvailable.subscriptionStatus = true;
                    } else {
                        // Try more broadly in the document
                        const anyTotalApp = $('p:contains("Total Application")').text();
                        if (anyTotalApp) {
                            const match = anyTotalApp.match(totalAppRegex);
                            if (match && match[1]) {
                                result.subscriptionStatus.total_applications = match[1].trim();
                            }
                        }
                    }

                    // Additional notes paragraph
                    const notesElement = totalAppElement?.next('p'); // Get the paragraph immediately after Total Application
                    if (notesElement?.length > 0) {
                        result.subscriptionStatus.notes = cleanText(notesElement.text());
                    }
                } catch (subError) {
                    console.error("Error processing subscription section:", subError);
                }
            } else {
                console.log("Subscription Status (Bidding Detail) section not found or doesn't match expected structure after span#subscriptionDiv.");
            }
        }
        
        // Handle alternative Subscription Status table structure (direct div with itemscope)
        if (!sectionsAvailable.subscriptionStatus) {
            // Try to find the alternate subscription table structure - more flexible selectors
            const subscriptionDiv = $('div[itemscope][itemtype="http://schema.org/Table"]');
            console.log("Checking for alternative subscription table structure...");
            
            if (subscriptionDiv.length > 0) {
                console.log("Found alternative table structure, checking for Subscription Status heading...");
                
                // Check if any of these divs contain the subscription status header text
                let targetDiv = null;
                subscriptionDiv.each(function() {
                    const heading = $(this).find('h2').text();
                    if (heading && heading.toLowerCase().includes("subscription status")) {
                        targetDiv = $(this);
                        return false; // Break the each loop
                    }
                });
                
                if (targetDiv) {
                    console.log("Processing alternative Subscription Status table structure...");
                    try {
                        // Get the heading and summary paragraph
                        const subH2 = targetDiv.find('h2').first();
                        const summaryParagraph = subH2.next('p');
                        result.subscriptionStatus.summary = cleanText(summaryParagraph.text());
                        
                        // Find the table inside the div
                        const subTable = targetDiv.find('.table-responsive table');
                        
                        if (subTable.length > 0) {
                            // Mark this table as processed
                            processedTables.add(subTable.get(0));
                            
                            // Extract table headers
                            const headers = [];
                            subTable.find('thead th').each(function() {
                                let headerText = cleanText($(this).text());
                                // Standardize header names
                                if (headerText.toLowerCase().includes('category')) headerText = 'category';
                                if (headerText.toLowerCase().includes('subscription') || headerText.toLowerCase().includes('times')) headerText = 'subscription_times';
                                if (headerText.toLowerCase().includes('shares offered')) headerText = 'shares_offered';
                                if (headerText.toLowerCase().includes('shares bid')) headerText = 'shares_bid_for';
                                headers.push(sanitizeKey(headerText));
                            });
                            
                            // Process each row in the table
                            subTable.find('tbody tr').each(function() {
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
                                    // Big Non-Institutional Investors (bids above ₹10L)
                                    result.subscriptionStatus.overall.nii = result.subscriptionStatus.overall.nii || {};
                                    result.subscriptionStatus.overall.nii.subcategories = result.subscriptionStatus.overall.nii.subcategories || {};
                                    result.subscriptionStatus.overall.nii.subcategories.bnii = rowData;
                                } else if (category.toLowerCase().includes('snii') || 
                                          (category.toLowerCase().includes('nii') && category.toLowerCase().includes('below'))) {
                                    // Small Non-Institutional Investors (bids below ₹10L)
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
                            });
                            
                            // Extract total applications count using regex
                            const totalAppRegex = /Total Application[s]?\s*:?\s*([\d,]+)/i;
                            
                            // First try in the parent div
                            const totalAppText = targetDiv.find('p:contains("Total Application")').text();
                            if (totalAppText) {
                                const match = totalAppText.match(totalAppRegex);
                                if (match && match[1]) {
                                    result.subscriptionStatus.total_applications = match[1].trim();
                                } else {
                                    result.subscriptionStatus.total_applications = cleanText(totalAppText.replace(/.*:/, ''));
                                }
                            } else {
                                // Try more broadly in the document
                                const anyTotalApp = $('p:contains("Total Application")').text();
                                if (anyTotalApp) {
                                    const match = anyTotalApp.match(totalAppRegex);
                                    if (match && match[1]) {
                                        result.subscriptionStatus.total_applications = match[1].trim();
                                    }
                                }
                            }
                            
                            // Mark subscription status as available
                            sectionsAvailable.subscriptionStatus = true;
                        }
                    } catch (error) {
                        console.error("Error processing alternative subscription table:", error);
                    }
                } else {
                    console.log("Found itemscope tables but none with Subscription Status heading");
                }
            } else {
                console.log("No alternative subscription status tables found with itemscope");
            }
        }
    }

    // First fallback - specifically look for "Subscription (times)" header
    if (!sectionsAvailable.subscriptionStatus) {
        console.log("Using first fallback method - looking for 'Subscription (times)' header...");
        
        $('table').each(function() {
            // Skip if already processed
            if (processedTables.has(this)) return;
            
            const table = $(this);
            
            // Specifically check for "Subscription (times)" header
            const hasSubscriptionTimesHeader = table.find('th:contains("Subscription (times)")').length > 0;
            
            if (hasSubscriptionTimesHeader) {
                console.log("Found subscription table with 'Subscription (times)' header");
                processedTables.add(this);
                
                try {
                    // Find the parent container for summary and total applications
                    const parentContainer = table.closest('div');
                    
                    // Get summary from nearby heading
                    let summaryText = "";
                    const nearbyHeading = parentContainer.find('h2:contains("Subscription")').first();
                    if (nearbyHeading.length > 0) {
                        const summaryPara = nearbyHeading.next('p');
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
                        if (headerText.toLowerCase().includes('subscription')) headerText = 'subscription_times';
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
                    
                    // Look for total applications
                    const totalAppRegex = /Total Application[s]?\s*:?\s*([\d,]+)/i;
                    const totalAppElement = parentContainer.find('p:contains("Total Application")');
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
                    console.error("Error processing subscription table with 'Subscription (times)' header:", error);
                }
            }
        });
    }
    
    // Second fallback - look for tables with both "Category" and "Times" headers
    if (!sectionsAvailable.subscriptionStatus) {
        console.log("Using second fallback method - checking for tables with both Category and Times columns...");
        
        $('table').each(function() {
            // Skip if already processed
            if (processedTables.has(this)) return;
            
            const table = $(this);
            let hasCategory = false;
            let hasTimes = false;
            
            // Check headers
            table.find('th').each(function() {
                const headerText = $(this).text().toLowerCase();
                if (headerText.includes('category')) hasCategory = true;
                if (headerText.includes('times')) hasTimes = true;
            });
            
            // If it has category and times columns, process it
            if (hasCategory && hasTimes) {
                console.log("Found table with Category and Times headers");
                processedTables.add(this);
                
                try {
                    // Process table headers
                    const headers = [];
                    table.find('thead th, tr:first-child th').each(function() {
                        let headerText = cleanText($(this).text());
                        // Standardize header names
                        if (headerText.toLowerCase().includes('category')) headerText = 'category';
                        if (headerText.toLowerCase().includes('times')) headerText = 'subscription_times';
                        if (headerText.toLowerCase().includes('shares offered')) headerText = 'shares_offered';
                        if (headerText.toLowerCase().includes('shares bid')) headerText = 'shares_bid_for';
                        headers.push(sanitizeKey(headerText));
                    });
                    
                    // If no headers found in thead or first row th, use first row td as headers
                    if (headers.length === 0) {
                        table.find('tr:first-child td').each(function() {
                            let headerText = cleanText($(this).text());
                            if (headerText.toLowerCase().includes('category')) headerText = 'category';
                            if (headerText.toLowerCase().includes('times')) headerText = 'subscription_times';
                            if (headerText.toLowerCase().includes('shares offered')) headerText = 'shares_offered';
                            if (headerText.toLowerCase().includes('shares bid')) headerText = 'shares_bid_for';
                            headers.push(sanitizeKey(headerText));
                        });
                    }
                    
                    // Process table rows (skip first row if it was used for headers)
                    const startRowIndex = (table.find('thead').length > 0) ? 0 : 1;
                    
                    table.find('tbody tr, tr').slice(startRowIndex).each(function() {
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
                } catch (error) {
                    console.error("Error processing Category/Times table:", error);
                }
            }
        });
    }
    
    // Third fallback - look for tables with QIB, NII and Retail in content
    if (!sectionsAvailable.subscriptionStatus) {
        console.log("Using third fallback method - scanning tables for QIB/NII/Retail content...");
        
        $('table').each(function() {
            // Skip if already processed
            if (processedTables.has(this)) return;
            
            const table = $(this);
            let hasQibRow = false;
            let hasNiiRow = false;
            let hasRetailRow = false;
            
            // Scan table content for QIB, NII and Retail rows
            table.find('tr').each(function() {
                const rowText = $(this).text().toLowerCase();
                if (rowText.includes('qib')) hasQibRow = true;
                if (rowText.includes('nii')) hasNiiRow = true;
                if (rowText.includes('retail')) hasRetailRow = true;
            });
            
            // If table has at least 2 of these categories, it's likely a subscription table
            if ((hasQibRow && hasNiiRow) || (hasQibRow && hasRetailRow) || (hasNiiRow && hasRetailRow)) {
                console.log("Found potential subscription table by QIB/NII/Retail content");
                processedTables.add(this);
                
                try {
                    const rows = [];
                    const categoryIndices = [];
                    
                    // First, identify which column contains categories
                    table.find('tr').each(function() {
                        $(this).find('td').each(function(colIndex) {
                            const cellText = $(this).text().toLowerCase();
                            if (cellText === 'qib' || cellText === 'nii' || cellText === 'retail') {
                                categoryIndices.push(colIndex);
                            }
                        });
                    });
                    
                    // Get the most common column index for categories
                    let categoryColumnIndex = 0; // default to first column
                    if (categoryIndices.length > 0) {
                        // Use the mode (most common value)
                        const counts = {};
                        let maxCount = 0;
                        let mostFrequent = categoryIndices[0];
                        
                        for (const num of categoryIndices) {
                            counts[num] = (counts[num] || 0) + 1;
                            if (counts[num] > maxCount) {
                                maxCount = counts[num];
                                mostFrequent = num;
                            }
                        }
                        
                        categoryColumnIndex = mostFrequent;
                    }
                    
                    // Now extract data assuming categoryColumnIndex contains categories
                    table.find('tr').each(function() {
                        const cells = $(this).find('td');
                        if (cells.length <= categoryColumnIndex) return; // Skip rows that don't have enough columns
                        
                        const category = cleanText(cells.eq(categoryColumnIndex).text());
                        if (!category) return; // Skip rows without a category
                        
                        // Try to identify which columns might contain subscription times and shares
                        const rowData = {
                            category: category
                        };
                        
                        // Assume the column after category might be subscription times
                        if (cells.length > categoryColumnIndex + 1) {
                            const timesText = cleanText(cells.eq(categoryColumnIndex + 1).text());
                            if (/^\d+(\.\d+)?x?$/.test(timesText.replace(/,/g, ''))) {
                                rowData.subscription_times = timesText;
                            }
                        }
                        
                        // Assume subsequent columns might be shares offered and shares bid
                        if (cells.length > categoryColumnIndex + 2) {
                            rowData.shares_offered = cleanText(cells.eq(categoryColumnIndex + 2).text());
                        }
                        
                        if (cells.length > categoryColumnIndex + 3) {
                            rowData.shares_bid_for = cleanText(cells.eq(categoryColumnIndex + 3).text());
                        }
                        
                        // Only process rows that have category and at least one other piece of data
                        if (Object.keys(rowData).length > 1) {
                            rows.push(rowData);
                        }
                    });
                    
                    // Process the extracted rows
                    for (const rowData of rows) {
                        const category = rowData.category.toLowerCase();
                        
                        // Handle special subcategories of NII
                        if (category.includes('bnii') || (category.includes('nii') && category.includes('above'))) {
                            // Big Non-Institutional Investors
                            result.subscriptionStatus.overall.nii = result.subscriptionStatus.overall.nii || {};
                            result.subscriptionStatus.overall.nii.subcategories = result.subscriptionStatus.overall.nii.subcategories || {};
                            result.subscriptionStatus.overall.nii.subcategories.bnii = rowData;
                        } else if (category.includes('snii') || (category.includes('nii') && category.includes('below'))) {
                            // Small Non-Institutional Investors
                            result.subscriptionStatus.overall.nii = result.subscriptionStatus.overall.nii || {};
                            result.subscriptionStatus.overall.nii.subcategories = result.subscriptionStatus.overall.nii.subcategories || {};
                            result.subscriptionStatus.overall.nii.subcategories.snii = rowData;
                        } else if (category.includes('employee')) {
                            // Employee category
                            result.subscriptionStatus.overall.employee = rowData;
                        } else if (category.includes('qib')) {
                            result.subscriptionStatus.overall.qib = rowData;
                        } else if (category.includes('nii')) {
                            result.subscriptionStatus.overall.nii = rowData;
                        } else if (category.includes('retail')) {
                            result.subscriptionStatus.overall.retail = rowData;
                        } else if (category.includes('total')) {
                            result.subscriptionStatus.overall.total = rowData;
                        }
                        
                        // Mark subscription status as available
                        if (Object.keys(result.subscriptionStatus.overall).length > 0) {
                            sectionsAvailable.subscriptionStatus = true;
                        }
                    }
                    
                    // Look for total applications
                    if (sectionsAvailable.subscriptionStatus) {
                        const containerDiv = table.closest('div');
                        const totalAppPara = containerDiv.find('p:contains("Total Application")');
                        if (totalAppPara.length > 0) {
                            const totalAppText = totalAppPara.text();
                            const match = totalAppText.match(/Total Application[s]?\s*:?\s*([\d,]+)/i);
                            if (match && match[1]) {
                                result.subscriptionStatus.total_applications = match[1].trim();
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error in third fallback subscription table processing:", error);
                }
            }
        });
    }
    
    // Final fallback for total applications if still not found
    if (sectionsAvailable.subscriptionStatus && !result.subscriptionStatus.total_applications) {
        console.log("Looking for Total Application text anywhere in the document...");
        const totalAppRegex = /Total Application[s]?\s*:?\s*([\d,]+)/i;
        
        // Try a broader search for "Total Application" text anywhere in the document
        $('p').each(function() {
            const paraText = $(this).text();
            if (paraText.toLowerCase().includes('total application')) {
                const match = paraText.match(totalAppRegex);
                if (match && match[1]) {
                    result.subscriptionStatus.total_applications = match[1].trim();
                    return false; // Break the loop once found
                }
            }
        });
    }

    // Extract FAQs (often in an accordion structure)
    result.faqs = []; // Reset FAQs before scraping
    try {
        $('.accordion-item').each(function() {
          const questionElement = $(this).find('.accordion-header button'); // Find the button inside the header
          const question = questionElement?.text()?.trim();
          // Find the answer body, then look for a nested .text div, or use the whole body
          const answerDiv = $(this).find('.accordion-body');
          const answerHtml = answerDiv.find('.text')?.html() || answerDiv?.html(); // Find .text div or use whole body html
          const answerText = answerDiv?.text()?.trim();

          if (question && (answerHtml || answerText)) {
            result.faqs.push({
              question: cleanText(question, false),
              answer: answerHtml ? answerHtml.trim() : cleanText(answerText, false)
            });
            // Mark FAQs as available
            sectionsAvailable.faqs = true;
          }
        });
    } catch (faqError) {
        console.error("Error processing FAQs:", faqError);
    }

    // --- Generic Table Scraper ---
    console.log("Searching for any remaining unprocessed tables...");
    $('#main table').each(function() {
        const tableElement = $(this);
        if (processedTables.has(tableElement.get(0))) {
            // console.log("Skipping already processed table.");
            // Add a more informative log when skipping
            let headingAttempt = tableElement.closest('.card').find('.card-header h2').text().trim() || tableElement.prevAll('h2').first().text().trim() || 'Unknown Table';
            // console.log(`Skipping table (already processed): ${headingAttempt}`);
            return; // Skip already processed table
        }

        // Try to find a heading for context
        let heading = tableElement.closest('.card').find('.card-header h2').text().trim();
        if (!heading) {
            heading = tableElement.prevAll('h2').first().text().trim(); // Check preceding h2
        }
        if (!heading) {
             // Look inside a potential parent container that might have a heading nearby
            const parentContainer = tableElement.closest('div:has(> h2)');
            if (parentContainer.length) {
                 heading = parentContainer.find('h2').first().text().trim();
            }
        }
        heading = heading || 'Unknown Table'; // Default heading

        const headers = [];
        // Prefer thead for headers, fallback to first row th/td
        const theadCells = tableElement.find('thead th');
        if (theadCells.length > 0) {
            theadCells.each(function() {
                headers.push(cleanText($(this).text()));
            });
        } else {
            // Fallback: Check first row of tbody for th or td
            tableElement.find('tbody tr').first().find('th, td').each(function() {
                headers.push(cleanText($(this).text()));
            });
        }

        const rows = [];
        let dataRowStartIndex = 0;
        // If headers were found in thead, start rows from index 0 of tbody
        // If headers were taken from first tbody row, start from index 1
        if (theadCells.length === 0 && tableElement.find('tbody tr').first().find('th, td').length > 0) {
            dataRowStartIndex = 1;
        }

        tableElement.find('tbody tr').slice(dataRowStartIndex).each(function() {
            const rowData = [];
            $(this).find('td').each(function() {
                // Capture HTML content within cells if needed, otherwise just text
                // For simplicity now, just using cleaned text
                rowData.push(cleanText($(this).text()));
            });
            // Avoid pushing completely empty rows
            if (rowData.some(cell => cell !== '')) {
                 rows.push(rowData);
            }
        });

        // Only add if the table actually contained data rows and headers
        if (rows.length > 0 && headers.length > 0) {
             console.log(`Found unprocessed table with heading: "${heading}"`);
             result.additionalTables.push({
                 heading: heading,
                 sanitizedHeading: sanitizeKey(heading, result.ipoName),
                 headers: headers,
                 rows: rows
             });
             processedTables.add(tableElement.get(0)); // Mark as processed now
        } else {
            // console.log("Skipping table with no rows or headers:", heading);
        }
    });
    // --- End of Generic Table Scraper ---

    // Final cleanup of potentially empty nested objects/arrays
    const cleanup = (obj) => {
        Object.keys(obj).forEach(key => {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                cleanup(obj[key]);
                if (Array.isArray(obj[key]) && obj[key].length === 0) {
                    delete obj[key];
                } else if (!Array.isArray(obj[key]) && typeof obj[key] === 'object' && Object.keys(obj[key]).length === 0) {
                    delete obj[key];
                }
            } else if (obj[key] === '' || obj[key] === null) {
                 delete obj[key];
            }
        });
    };
    cleanup(result); // Clean empty objects/arrays potentially created

    // Check additionalTables for financials and KPI data that might have been captured generically
    if (result.additionalTables && result.additionalTables.length > 0) {
        result.additionalTables.forEach(table => {
            // Check for financials table
            if (table.heading && (
                table.heading.toLowerCase().includes('financial information') || 
                table.heading.toLowerCase().includes('financial details') ||
                table.sanitizedHeading === 'financials'
            )) {
                sectionsAvailable.financials = true;
            }
            
            // Check for KPI table
            if (table.headers && table.headers.includes('KPI') ||
                table.heading && table.heading.toLowerCase().includes('stock quote') ||
                table.sanitizedHeading && table.sanitizedHeading.includes('stock_quote')
            ) {
                sectionsAvailable.kpi = true;
            }
        });
    }

    // Remove additionalTables if it ended up empty
    if (result.additionalTables && result.additionalTables.length === 0) {
       delete result.additionalTables;
    }

    // Add metadata about what sections are available
    result._metadata = {
      sectionsAvailable: sectionsAvailable,
      scrapedAt: new Date().toISOString(),
      sourceUrl: url
    };

    console.log("Scraping finished successfully.");
    
    return result;

  } catch (error) {
    console.error(`Error fetching structured data from ${url}: ${error.message}`);
    console.error(error.stack); // Log stack trace for detailed debugging
    return { _error: true, message: error.message, url }; // Return error object
  } finally {
    if (browser) {
      try {
          await browser.close();
          console.log(`Browser closed for ${url}`);
      } catch (closeError) {
          console.error(`Error closing browser for ${url}: ${closeError.message}`);
      }
    }
  }
}

/**
 * Fetches the basic details of an IPO from the page.
 * @param {puppeteer.Page} page - Puppeteer page instance
 * @returns {Promise<Object>} - Object containing basic IPO details
 */
async function fetchBasicDetails(page) {
  console.log("Fetching basic IPO details...");
  
  try {
    // Extract IPO name and logo
    const ipoName = await page.$eval('h1.ipo-title', el => el.textContent.trim()).catch(() => null);
    const logoSrc = await page.$eval('.div-logo img', el => el.getAttribute('src')).catch(() => null);
    
    // Result object
    const result = {
      ipoName,
      logo: logoSrc,
      details: {}
    };
    
    // Check if the basic details table exists
    const tableExists = await page.$('table.table-bordered.table-striped.table-hover');
    if (!tableExists) {
      console.log("Basic details table not found");
      return result;
    }
    
    // Extract data from the basic details table
    const detailFields = [
      {key: 'faceValue', selector: "tr:contains('Face Value') td:last-child"},
      {key: 'issuePrice', selector: "tr:contains('Issue Price') td:last-child"},
      {key: 'lotSize', selector: "tr:contains('Lot Size') td:last-child"},
      {key: 'issueSize', selector: "tr:contains('Issue Size') td:last-child"},
      {key: 'freshIssue', selector: "tr:contains('Fresh Issue') td:last-child"},
      {key: 'offerForSale', selector: "tr:contains('Offer for Sale') td:last-child"},
      {key: 'listingAt', selector: "tr:contains('Listing At') td:last-child"},
      {key: 'marketLot', selector: "tr:contains('Market Lot') td:last-child"},
      {key: 'minAmount', selector: "tr:contains('Min Amount') td:last-child"},
      {key: 'retailPortion', selector: "tr:contains('Retail Portion') td:last-child"},
      {key: 'qibPortion', selector: "tr:contains('QIB Portion') td:last-child"},
      {key: 'niiPortion', selector: "tr:contains('NII Portion') td:last-child"},
      {key: 'employeeDiscount', selector: "tr:contains('Employee Discount') td:last-child"},
      {key: 'listingDate', selector: "tr:contains('Listing Date') td:last-child"},
      {key: 'brlm', selector: "tr:contains('BRLM') td:last-child"},
      {key: 'registrar', selector: "tr:contains('Registrar') td:last-child"},
      {key: 'marketMakerPortion', selector: "tr:contains('Market Maker Portion') td:last-child"}
    ];
    
    // Use evaluate to run in browser context for JQuery-style selectors
    const details = await page.evaluate((fields) => {
      const results = {};
      
      fields.forEach(({key, selector}) => {
        // Parse the selector to find the correct row
        const label = selector.match(/tr:contains\('(.+?)'\)/)[1];
        const row = Array.from(document.querySelectorAll('table.table-bordered tr')).find(
          row => row.textContent.includes(label)
        );
        
        if (row) {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            results[key] = cells[cells.length - 1].textContent.trim();
          }
        }
      });
      
      return results;
    }, detailFields);
    
    result.details = details;
    
    // Extract all rows as additional backup
    const allRows = await page.evaluate(() => {
      const rows = {};
      document.querySelectorAll('table.table-bordered tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const key = cells[0].textContent.trim()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
          rows[key] = cells[cells.length - 1].textContent.trim();
        }
      });
      return rows;
    });
    
    // Merge the two approaches for maximum coverage
    result.allDetails = allRows;
    
    console.log("Basic IPO details fetched successfully");
    return result;
    
  } catch (error) {
    console.error("Error fetching basic IPO details:", error);
    return {
      error: true,
      message: error.message
    };
  }
}

/**
 * Fetches only specific IPO details from the page.
 * @param {puppeteer.Page} page - Puppeteer page instance
 * @returns {Promise<Object>} - Object containing only the specified IPO details
 */
async function fetchSpecificIpoDetails(page) {
  console.log("Fetching specific IPO details...");
  
  try {
    // Extract specific IPO details directly
    const specificDetails = await page.evaluate(() => {
      // Define the specific fields we want
      const targetFields = {
        faceValue: "Face Value",
        issuePrice: "Issue Price",
        lotSize: "Lot Size",
        issueSize: "Total Issue Size",
        freshIssue: "Fresh Issue",
        offerForSale: "Offer for Sale",
        listingAt: "Listing At",
        ipoDate: "IPO Date",
        issuePriceBand: "Issue Price Band",
        shareHoldingPreIssue: "Share Holding Pre Issue",
        shareHoldingPostIssue: "Share Holding Post Issue",
        marketMakerPortion: "Market Maker Portion"
      };
      
      const results = {};
      
      // Find all rows in table
      const rows = document.querySelectorAll('table.table-bordered tr');
      
      // Extract only our target fields
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const label = cells[0].textContent.trim();
          
          // Check if this row contains one of our target fields
          for (const [key, fieldLabel] of Object.entries(targetFields)) {
            if (label.includes(fieldLabel)) {
              results[key] = cells[cells.length - 1].textContent.trim();
              break;
            }
          }
        }
      });
      
      return results;
    });
    
    // Also extract the IPO name
    const ipoName = await page.$eval('h1.ipo-title', el => el.textContent.trim())
      .catch(() => null);
    
    return {
      ipoName,
      ...specificDetails
    };
  } catch (error) {
    console.error("Error fetching specific IPO details:", error);
    return {
      error: true,
      message: error.message
    };
  }
}

/**
 * Fetches subscription history data from the detailed subscription page
 * @param {string} ipoId - The ID of the IPO from the URL path
 * @returns {Promise<object>} - Structured subscription history data
 */
async function fetchSubscriptionHistory(ipoId) {
  let browser;
  let page;
  console.log(`Fetching subscription history for IPO ID: ${ipoId}`);
  
  try {
    // Form the subscription page URL
    const subscriptionUrl = `https://www.chittorgarh.com/ipo_subscription/${ipoId}/${ipoId}/`;
    console.log(`🚀 Creating enhanced browser session for ${subscriptionUrl}`);
    
    // Use the browser helper with more reliable settings
    const browserLaunchResult = await launchBrowser(subscriptionUrl, {
      timeout: 120000,
      args: [
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],
      waitUntil: 'networkidle2'
    });
    
    browser = browserLaunchResult.browser;
    page = browserLaunchResult.page;
    
    // Add browser-like headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Cache-Control': 'max-age=0',
      'Upgrade-Insecure-Requests': '1',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'DNT': '1'
    });
    
    // Setup cookies for the domain
    await page.setCookie({
      name: 'visited',
      value: 'true',
      domain: '.chittorgarh.com',
      path: '/',
    }, {
      name: 'sessionvisit',
      value: Date.now().toString(),
      domain: '.chittorgarh.com',
      path: '/',
    });
    
    // Wait for the page to load fully
    try {
      await page.waitForSelector('span#subscriptionDiv, div.accordion-body', { timeout: 60000 });
      console.log("✅ Successfully accessed " + subscriptionUrl);
      
      // Force a small additional wait to ensure JavaScript runs
      await page.waitForTimeout(2000);
    } catch (timeoutError) {
      console.log("⚠️ Timeout waiting for subscription elements. Will try to extract content anyway.");
    }
    
    // Get the data directly from the page using browser JavaScript
    const result = await page.evaluate(() => {
      // Helper function to clean text
      const cleanText = (text) => {
        if (!text) return '';
        return text.toString().trim()
          .replace(/\s+/g, ' ')
          .replace(/\u00A0/g, ' ')
          .trim();
      };
      
      // Initialize the result
      const data = {
        overall_subscription: {},
        day_wise_subscription: [],
        total_applications: '',
        subscription_notes: []
      };
      
      // Attempt to find total applications
      let totalAppText = '';
      document.querySelectorAll('p, div').forEach(el => {
        if (el.textContent && el.textContent.includes('Total Application')) {
          totalAppText = el.textContent;
        }
      });
      
      if (totalAppText) {
        const match = totalAppText.match(/Total Application[s]?\s*:?\s*([\d,]+)/i);
        if (match && match[1]) {
          data.total_applications = match[1].trim();
          console.log(`Found total applications: ${data.total_applications}`);
        }
      }
      
      // Find all tables in the document
      const tables = document.querySelectorAll('table');
      console.log(`Found ${tables.length} tables on page`);
      
      // Process each table to find subscription data
      tables.forEach((table, tableIndex) => {
        const tableText = table.textContent.toLowerCase();
        
        // Check if this is likely the overall subscription table
        if (tableText.includes('category') && tableText.includes('subscription') && tableText.includes('times')) {
          console.log(`Table ${tableIndex+1} appears to be a subscription table`);
          
          // Get the headers
          const headers = [];
          table.querySelectorAll('thead th').forEach(th => {
            let headerText = cleanText(th.textContent.toLowerCase());
            headers.push(headerText);
          });
          
          // Process rows
          table.querySelectorAll('tbody tr').forEach(tr => {
            const rowData = {};
            const cells = tr.querySelectorAll('td');
            
            // Get category name from first cell
            let category = '';
            if (cells[0]) {
              category = cleanText(cells[0].textContent);
              rowData.category = category;
            }
            
            // Skip empty rows
            if (!category) return;
            
            // Get other cell values
            cells.forEach((cell, cellIndex) => {
              if (cellIndex === 0) return; // Skip category name which we already got
              
              const header = headers[cellIndex];
              if (!header) return;
              
              const value = cleanText(cell.textContent);
              
              if (header.includes('subscription') || header.includes('times')) {
                rowData.subscription_times = value;
              } else if (header.includes('shares') && header.includes('offered')) {
                rowData.shares_offered = value;
              } else if (header.includes('shares') && header.includes('bid')) {
                rowData.shares_bid_for = value;
              } else if (header.includes('amount')) {
                rowData.total_amount = value;
              }
            });
            
            // Determine category key
            let categoryKey = '';
            
            if (category.toLowerCase().includes('anchor')) {
              categoryKey = 'anchor_investors';
            } else if (category.toLowerCase().includes('qualified') || category.toLowerCase().includes('qib')) {
              categoryKey = 'qib';
            } else if (category.toLowerCase().includes('bnii') || 
                      (category.toLowerCase().includes('nii') && category.toLowerCase().includes('above'))) {
              categoryKey = 'bnii';
            } else if (category.toLowerCase().includes('snii') || 
                      (category.toLowerCase().includes('nii') && category.toLowerCase().includes('below'))) {
              categoryKey = 'snii';
            } else if (category.toLowerCase().includes('non-institutional') || category.toLowerCase().includes('nii')) {
              categoryKey = 'nii';
            } else if (category.toLowerCase().includes('retail')) {
              categoryKey = 'retail';
            } else if (category.toLowerCase().includes('employee')) {
              categoryKey = 'employee';
            } else if (category.toLowerCase().includes('total')) {
              categoryKey = 'total';
            } else {
              // Fallback: convert category to key
              categoryKey = category.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .replace(/\s+/g, '_');
            }
            
            if (categoryKey) {
              data.overall_subscription[categoryKey] = rowData;
              console.log(`Added data for ${categoryKey}`);
            }
          });
        }
        
        // Check if this is the day-wise table
        else if (tableText.includes('day') && (tableText.includes('date') || tableText.includes('qib') || tableText.includes('retail'))) {
          console.log(`Table ${tableIndex+1} appears to be the day-wise table`);
          
          // Get headers
          const headers = [];
          table.querySelectorAll('thead th').forEach(th => {
            let headerText = cleanText(th.textContent.toLowerCase());
            headers.push(headerText);
          });
          
          // Process rows
          table.querySelectorAll('tbody tr').forEach(tr => {
            const dayData = {};
            tr.querySelectorAll('td').forEach((td, tdIndex) => {
              const header = headers[tdIndex];
              if (!header) return;
              
              const value = cleanText(td.textContent);
              
              // Process based on header
              if (header.includes('date')) {
                // Try to extract day number
                const dayMatch = value.match(/day\s*(\d+)/i);
                if (dayMatch && dayMatch[1]) {
                  dayData.day_number = dayMatch[1];
                }
                
                // Try to extract date
                const dateMatch = value.match(/(\w+\s+\d+,\s+\d+)/i);
                if (dateMatch && dateMatch[1]) {
                  dayData.date = dateMatch[1];
                } else {
                  // Check for date in small tag
                  const smallText = td.querySelector('small')?.textContent || '';
                  if (smallText) {
                    dayData.date = cleanText(smallText);
                  }
                }
              } 
              else if (header.includes('qib')) {
                dayData.qib = value;
              }
              else if (header.includes('nii') && !header.includes('>') && !header.includes('<')) {
                dayData.nii = value;
              }
              else if ((header.includes('nii') && header.includes('>')) || header.includes('bnii')) {
                dayData.bnii = value;
              }
              else if ((header.includes('nii') && header.includes('<')) || header.includes('snii')) {
                dayData.snii = value;
              }
              else if (header.includes('retail')) {
                dayData.retail = value;
              }
              else if (header.includes('emp')) {
                dayData.employee = value;
              }
              else if (header.includes('total')) {
                dayData.total = value;
              }
            });
            
            // Add day data if it has meaningful content
            if (Object.keys(dayData).length > 2) {
              data.day_wise_subscription.push(dayData);
            }
          });
        }
      });
      
      // Try to find subscription notes
      const noteElements = document.querySelectorAll('ul li');
      noteElements.forEach(li => {
        const text = li.textContent;
        if (text && (text.includes('Note') || text.includes('Shares Offered') || text.includes('Total Amount'))) {
          data.subscription_notes.push(cleanText(text));
        }
      });
      
      return data;
    });
    
    // Log the result summary
    console.log(`Subscription history data summary:`);
    console.log(`- Overall subscription categories: ${Object.keys(result.overall_subscription).length}`);
    console.log(`- Day-wise entries: ${result.day_wise_subscription.length}`);
    console.log(`- Total applications: ${result.total_applications || 'Not found'}`);
    console.log(`- Subscription notes: ${result.subscription_notes.length}`);
    
    return result;
    
  } catch (error) {
    console.error(`Error fetching subscription history: ${error.message}`);
    console.error(error.stack);
    return { error: true, message: error.message };
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log(`🧹 Removing temporary user data directory: ${browser._process?.spawnargs.find(arg => arg.includes('--user-data-dir='))?.replace('--user-data-dir=', '')}`);
      } catch (closeError) {
        console.error(`Error closing browser: ${closeError.message}`);
      }
    }
  }
}

/**
 * Main function to fetch complete IPO data including subscription history
 * @param {string} url - The URL of the IPO detail page
 * @returns {Promise<object>} - Complete IPO data
 */
async function fetchCompleteIpoData(url) {
  // Extract IPO ID from the URL
  const ipoIdMatch = url.match(/\/ipo\/.*?\/(\d+)\/$/);
  let ipoId = null;
  if (ipoIdMatch && ipoIdMatch[1]) {
    ipoId = ipoIdMatch[1];
    console.log(`Extracted IPO ID: ${ipoId}`);
  } else {
    console.log("Could not extract IPO ID from URL");
  }
  
  // Fetch structured data from the main IPO page
  const mainData = await fetchStructuredData(url);
  
  // Fetch subscription history if we have an IPO ID
  if (ipoId) {
    try {
      const subscriptionHistory = await fetchSubscriptionHistory(ipoId);
      
      // Merge the subscription history into the main data
      if (!mainData.error && !subscriptionHistory.error) {
        mainData.subscriptionHistory = subscriptionHistory;
      }
    } catch (error) {
      console.error(`Error fetching subscription history: ${error.message}`);
      // Continue with main data even if subscription history fails
    }
  }
  
  return mainData;
}

module.exports = {
  fetchStructuredData,
  cleanText,
  sanitizeKey,
  fetchBasicDetails,
  fetchSpecificIpoDetails,
  fetchSubscriptionHistory,
  fetchCompleteIpoData
}; 
# IPO Scraper

A streamlined utility for scraping IPO (Initial Public Offering) data with automated scheduling, JSON file storage, and multi-threaded processing.

## Features

- Scrape IPO listings and detailed information for a specific year or range of years
- Automatically save data to JSON files organized by year
- Option to upload scraped data to MongoDB for efficient querying and application integration
- Use multi-threaded processing for significantly faster data collection
- Set up and manage scheduled scraping jobs using cron
- Configure daily scraping at midnight to keep data current
- REST API for accessing IPO data directly from JSON files (no database required)

## Setup

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/ipo-scraper.git
   cd ipo-scraper
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with the following settings:
   ```
   # Base directory for data storage (optional, defaults to ./data)
   DATA_DIR=./data

   # Scraper throttling settings
   DELAY_BETWEEN_REQUESTS=1000
   MAX_CONCURRENT_REQUESTS=3

   # Threading settings
   USE_THREADS=true
   THREAD_COUNT=4

   # Cron related settings
   CRON_LOG_DIR=./logs
   CONFIG_DIR=./config
   
   # MongoDB settings (optional, only needed if UPLOAD_TO_MONGODB=true)
   MONGODB_URI=mongodb://localhost:27017
   MONGODB_DB_NAME=ipo_data
   UPLOAD_TO_MONGODB=false
   
   # API settings
   API_PORT=5000
   ```

## Usage

### One-time Scraping

To scrape IPO data for the current year (saving to JSON files only):
```
npm start
```
or
```
npm run scrape:current
```

To scrape IPO data with multi-threading:
```
npm run scrape:current:threaded
```

To scrape IPO data and upload to MongoDB:
```
npm run scrape:current:with-mongo
```

To scrape IPO data with both threading and MongoDB upload:
```
npm run scrape:current:threaded:with-mongo
```

To scrape IPO data for a specific year or year range:
```
npm run scrape -- 2023
```
or
```
npm run scrape -- --start-year 2020 --end-year 2023
```

To scrape with custom thread count:
```
npm run scrape -- --start-year 2020 --end-year 2023 --use-threads --thread-count 8
```

### Scheduled Scraping

To set up a daily cron job that scrapes the current year's IPO data at midnight:
```
npm run setup:daily-cron
```

To set up a daily cron job with threading:
```
npm run setup:daily-cron:threaded
```

To set up a daily cron job with MongoDB upload:
```
npm run setup:daily-cron:with-mongo
```

To set up a daily cron job with both threading and MongoDB upload:
```
npm run setup:daily-cron:threaded:with-mongo
```

To start the cron system (keeps the process running):
```
npm run cron:start
```

### Cron Management

List all configured cron jobs:
```
npm run cron:list
```

Check cron system status:
```
npm run cron:status
```

Run a job immediately:
```
npm run cron:run-now
```

Test a cron job configuration:
```
npm run cron:test
```

## Data Storage

### File Storage
Scraped IPO data is stored in JSON files organized by year in the configured `DATA_DIR` (defaults to `./data`). For each year, a summary file `_listings.json` contains basic information about all IPOs, and individual JSON files are created for each IPO with detailed information.

### MongoDB Storage (Optional)
When MongoDB upload is enabled (`UPLOAD_TO_MONGODB=true`), data is stored in two collections:
- `ipo_listings`: Contains summary information for all IPOs
- `ipo_details`: Contains detailed information for each IPO

### Database Schema

#### IPO Listings Collection Schema

```
ipo_listings {
  _id: ObjectId,
  ipo_id: String,          // Unique identifier for the IPO
  ipo_name: String,        // IPO name (usually company name + "IPO")
  company_name: String,    // Company name
  year: Number,            // Year the IPO was issued
  status: String,          // Status (upcoming, open, closed, listed)
  opening_date: String,    // Opening date as a string
  closing_date: String,    // Closing date as a string
  listing_date: String,    // Listing date as a string
  issue_price: String,     // Issue price string (e.g., "₹500.00")
  issue_price_numeric: Number, // Numeric value of issue price
  listing_gains: String,       // Formatted listing gain percentage (e.g., "+7.70%")
  listing_gains_numeric: Number, // Numeric value of listing gain
  listing_gains_by_exchange: {  // Detailed listing gains by exchange
    bse: {
      issuePrice: Number,
      lastTradePrice: Number,
      gain: Number,
      gainFormatted: String
    },
    nse: {
      issuePrice: Number,
      lastTradePrice: Number,
      gain: Number,
      gainFormatted: String
    }
  },
  logo_url: String,        // URL to the company logo
  year: Number,            // Year of the IPO
  created_at: Date,        // Document creation timestamp
  updated_at: Date         // Document last update timestamp
}
```

#### IPO Details Collection Schema

```javascript
{
  _id: ObjectId, // Auto-generated MongoDB ID
  ipo_id: Number, // Unique ID for this IPO
  company_name: String, // Company name
  mainline_listing: { // Stock listing information
    symbol: String, // Stock symbol
    listing_date: Date, // When the stock was listed
    listing_price: Number, // Price at listing
    ipo_price: Number, // Initial IPO price
    listing_gain: Number, // Gain % at listing
  },
  sme_listing: { // SME listing information (if applicable)
    symbol: String,
    listing_date: Date,
    listing_price: Number,
    ipo_price: Number,
    listing_gain: Number,
  },
  issue_size: Number, // Size of the IPO in crores
  issue_price: { // Price range for the IPO
    min: Number,
    max: Number
  },
  lot_size: Number, // Minimum lot size for bidding
  subscription_dates: { // Date range for subscription
    start: Date,
    end: Date
  },
  subscription_status: { // How many times subscribed by different categories
    overall: Number,
    qib: Number, // Qualified Institutional Buyers
    nii: Number, // Non-Institutional Investors
    bnii: Number, // Big Non-Institutional Investors (bids above ₹10 lakh)
    snii: Number, // Small Non-Institutional Investors (bids below ₹10 lakh)
    retail: Number, // Retail Individual Investors
    employee: Number, // Employee quota
    shareholder: Number, // Shareholder quota
    others: Number, // Other categories
    // Detailed data for each category
    qib_data: {
      subscription_times: String,
      shares_offered: String,
      shares_bid_for: String
    },
    nii_data: {
      subscription_times: String,
      shares_offered: String,
      shares_bid_for: String
    },
    bnii_data: {
      subscription_times: String,
      shares_offered: String,
      shares_bid_for: String
    },
    snii_data: {
      subscription_times: String,
      shares_offered: String,
      shares_bid_for: String
    },
    retail_data: {
      subscription_times: String,
      shares_offered: String,
      shares_bid_for: String
    },
    employee_data: {
      subscription_times: String,
      shares_offered: String,
      shares_bid_for: String
    },
    shareholder_data: {
      subscription_times: String,
      shares_offered: String,
      shares_bid_for: String
    },
    others_data: {
      subscription_times: String,
      shares_offered: String,
      shares_bid_for: String
    }
  },
  subscriptionHistory: { // Comprehensive subscription history data
    overall_subscription: {
      anchor_investors: {
        category: String,
        subscription_times: String,
        shares_offered: String,
        shares_bid_for: String,
        total_amount: String
      },
      qib: {
        category: String,
        subscription_times: String,
        shares_offered: String,
        shares_bid_for: String,
        total_amount: String
      },
      nii: {
        category: String,
        subscription_times: String,
        shares_offered: String,
        shares_bid_for: String,
        total_amount: String
      },
      bnii: {
        category: String,
        subscription_times: String,
        shares_offered: String,
        shares_bid_for: String,
        total_amount: String
      },
      snii: {
        category: String,
        subscription_times: String,
        shares_offered: String,
        shares_bid_for: String,
        total_amount: String
      },
      retail: {
        category: String,
        subscription_times: String,
        shares_offered: String,
        shares_bid_for: String,
        total_amount: String
      },
      employee: {
        category: String,
        subscription_times: String,
        shares_offered: String,
        shares_bid_for: String,
        total_amount: String
      },
      total: {
        category: String,
        subscription_times: String,
        shares_offered: String,
        shares_bid_for: String,
        total_amount: String
      }
    },
    day_wise_subscription: [
      {
        day_number: String,
        date: String,
        qib: String,
        nii: String,
        bnii: String,
        snii: String,
        retail: String,
        employee: String,
        total: String
      }
    ],
    total_applications: String,
    subscription_notes: [String]
  },
  listing_gains: { // Listing gains on different exchanges
    nse: {
      listing_gain: Number,
      listing_price: Number,
      ipo_price: Number,
      listing_date: Date
    },
    bse: {
      listing_gain: Number,
      listing_price: Number,
      ipo_price: Number,
      listing_date: Date
    }
  },
  allotment_date: Date, // Date of share allotment
  listing_date: Date, // Date of listing
  listing_gain: Number, // Overall listing gain percentage
  min_investment: Number, // Minimum investment amount
  min_application_value: Number, // Minimum application value
  application_details: { // Details about application methods
    asba: Boolean, // ASBA enabled
    upi: Boolean, // UPI enabled
    isin: String // ISIN code
  },
  company_details: {
    industry: String, // Industry sector
    founded: String, // Year founded
    promoters: [String], // List of promoters
    website: String, // Company website
    about: String // Company description
  },
  financials: [
    {
      period: String, // Financial period
      revenue: Number, // Revenue for the period
      profit: Number, // Profit for the period
      assets: Number, // Assets value
      equity: Number, // Equity value
      eps: Number, // Earnings per share
      roce: Number, // Return on capital employed
      roe: Number // Return on equity
    }
  ],
  peer_comparison: [
    {
      company: String, // Peer company name
      market_cap: Number, // Market capitalization
      pe_ratio: Number, // Price to earnings ratio
      roce: Number, // Return on capital employed
      roe: Number // Return on equity
    }
  ],
  kpi_summary: [String], // Key performance indicators
  promoter_holding: {
    pre_issue: Number, // Percentage holding before IPO
    post_issue: Number // Percentage holding after IPO
  },
  issue_objectives: [String], // Objectives of the issue
  lead_managers: [String], // Lead managers for the IPO
  registrar: String, // Registrar for the IPO
  listing_exchanges: [String], // Exchanges where the stock will be listed
  allotment_method: String, // Method of allotment
  face_value: Number // Face value of the shares
}
```

## Data Structure

### JSON Data Format

The scraped IPO data includes various sections such as basic details, subscription status, listing information, etc. Below are the key data structures:

#### Subscription Status

The system captures detailed subscription information including subcategories for NII (Non-Institutional Investors):

```json
"subscriptionStatus": {
  "summary": "The Quality Power IPO is subscribed 1.29 times on February 18, 2025 5:55:49 PM (Day 3)...",
  "overall": {
    "qib": {
      "category": "QIB",
      "subscription_times": "1.03",
      "shares_offered": "60,61,380",
      "shares_bid_for": "62,34,956"
    },
    "nii": {
      "category": "NII",
      "subscription_times": "1.45",
      "shares_offered": "30,30,690",
      "shares_bid_for": "43,94,260",
      "subcategories": {
        "bnii": {
          "category": "bNII (bids above ₹10L)",
          "subscription_times": "1.78",
          "shares_offered": "20,20,460",
          "shares_bid_for": "35,98,608"
        },
        "snii": {
          "category": "sNII (bids below ₹10L)",
          "subscription_times": "0.79",
          "shares_offered": "10,10,230",
          "shares_bid_for": "7,95,652"
        }
      }
    },
    "retail": {
      "category": "Retail",
      "subscription_times": "1.82",
      "shares_offered": "20,20,460",
      "shares_bid_for": "36,74,762"
    },
    "employee": {
      "category": "Employee",
      "subscription_times": "0.33",
      "shares_offered": "14,04,056",
      "shares_bid_for": "4,70,358"
    },
    "total": {
      "category": "Total",
      "subscription_times": "1.29",
      "shares_offered": "1,11,12,530",
      "shares_bid_for": "1,43,03,978"
    }
  },
  "total_applications": "1,20,178"
}
```

NII subcategories include:
- `bnii`: Big NII (bids above ₹10 lakhs)
- `snii`: Small NII (bids below ₹10 lakhs)

#### Listing Day Trading

The system supports both single-exchange and multi-exchange trading data:

```json
"listingDayTrading": {
  "data": {
    "final_issue_price": {
      "bse": "708.00",
      "nse": "708.00"
    },
    "open": {
      "bse": "731.00",
      "nse": "745.50"
    },
    "low": {
      "bse": "724.40",
      "nse": "708.00"
    },
    "high": {
      "bse": "787.80",
      "nse": "788.00"
    },
    "last_trade": {
      "bse": "763.85",
      "nse": "762.55"
    }
  }
}
```

#### Listing Gain Calculation

The system calculates listing gains for each exchange based on the formula:
```
Listing Gain (%) = ((Last Trade Price - Issue Price) / Issue Price) * 100
```

This is returned in the API as:

```json
"listing_gains": "+7.70%",
"listing_gains_numeric": 7.7,
"listing_gains_by_exchange": {
  "bse": {
    "issuePrice": 708,
    "lastTradePrice": 763.85,
    "gain": 7.89,
    "gainFormatted": "+7.89%"
  },
  "nse": {
    "issuePrice": 708,
    "lastTradePrice": 762.55,
    "gain": 7.7,
    "gainFormatted": "+7.70%"
  }
}
```

The system prioritizes the NSE exchange over BSE for the main listing gain value when both are available.

#### Subscription History

The system now fetches comprehensive subscription history data from the dedicated subscription page, including day-wise subscription details:

```json
"subscriptionHistory": {
  "overall_subscription": {
    "anchor_investors": {
      "category": "Anchor Investors",
      "subscription_times": "1",
      "shares_offered": "60,30,449",
      "shares_bid_for": "60,30,449",
      "total_amount": "379.315"
    },
    "qib": {
      "category": "Qualified Institutions",
      "subscription_times": "13.04",
      "shares_offered": "40,20,300",
      "shares_bid_for": "5,24,30,915",
      "total_amount": "3,297.905"
    },
    "nii": {
      "category": "Non-Institutional Buyers",
      "subscription_times": "6.46",
      "shares_offered": "30,15,225",
      "shares_bid_for": "1,94,82,058",
      "total_amount": "1,225.421"
    },
    "bnii": {
      "category": "bNII (bids above ₹10L)",
      "subscription_times": "7.67",
      "shares_offered": "20,10,150",
      "shares_bid_for": "1,54,26,123",
      "total_amount": "970.303"
    },
    "snii": {
      "category": "sNII (bids below ₹10L)",
      "subscription_times": "3.58",
      "shares_offered": "10,05,075",
      "shares_bid_for": "35,99,155",
      "total_amount": "226.387"
    },
    "retail": {
      "category": "Retail Investors",
      "subscription_times": "1.94",
      "shares_offered": "70,35,525",
      "shares_bid_for": "1,36,42,588",
      "total_amount": "858.119"
    },
    "employee": {
      "category": "Employees",
      "subscription_times": "2.62",
      "shares_offered": "78,947",
      "shares_bid_for": "2,06,816",
      "total_amount": "13.009"
    },
    "total": {
      "category": "Total",
      "subscription_times": "6.06",
      "shares_offered": "1,41,49,997",
      "shares_bid_for": "8,57,62,377",
      "total_amount": "5,394.454"
    }
  },
  "day_wise_subscription": [
    {
      "day_number": "1",
      "date": "Feb 10, 2025",
      "qib": "0.26",
      "nii": "0.28",
      "bnii": "0.24",
      "snii": "0.35",
      "retail": "0.29",
      "employee": "0.54",
      "total": "0.28"
    },
    {
      "day_number": "2",
      "date": "Feb 11, 2025",
      "qib": "0.33",
      "nii": "0.61",
      "bnii": "0.51",
      "snii": "0.77",
      "retail": "0.52",
      "employee": "1.19",
      "total": "0.49"
    },
    {
      "day_number": "3",
      "date": "Feb 12, 2025",
      "qib": "13.04",
      "nii": "6.46",
      "bnii": "7.67",
      "snii": "3.58",
      "retail": "1.94",
      "employee": "2.62",
      "total": "6.06"
    }
  ],
  "total_applications": "3,10,879",
  "subscription_notes": [
    "\"Shares Offered\" and \"Total Amount\" are calculated based on the upper price of the issue price range.",
    "The portion of anchor investors (or market makers) is not included in the total number of shares offered."
  ]
}
```

This comprehensive subscription data includes:
1. Overall subscription details with category-specific data
2. Day-by-day subscription progress across all investor categories
3. NII subcategories (bNII and sNII) tracking subscription for different investment sizes
4. Total application count and subscription notes

## Threading

The scraper uses Node.js Worker Threads to achieve parallel processing of IPO data. This provides several benefits:

1. **Performance**: Scraping multiple IPOs in parallel significantly reduces the total time required
2. **Resource utilization**: Takes advantage of multiple CPU cores for better performance
3. **Resilience**: Workers operate independently, so failures in one worker don't affect others

Thread count can be configured:
- Via the `.env` file with `THREAD_COUNT=4` (default is 4)
- Via command line with `--thread-count 8`

For optimal performance, set thread count to match or be slightly less than your CPU core count.

## API

The project includes a RESTful API to access the IPO data stored in JSON files. The API provides various endpoints for querying IPO data with filtering, sorting, and pagination options.

### Starting the API Server

To start the API server:
```
npm run api
```

For development with automatic restart:
```
npm run api:dev
```

To run both the API server and the cron system:
```
npm run dev
```

The API server runs on port 5000 by default (configurable via `API_PORT` environment variable).

### API Documentation

API documentation is available at `http://localhost:5000/api-docs` when the server is running.

### API Endpoints

#### IPO Listings

```
GET /api/ipos
```

Get paginated list of IPOs with filtering and sorting options.

Query Parameters:
- `page` (integer): Page number (default: 1)
- `limit` (integer): Results per page (default: 10, max: 100)
- `sort` (string): Sort field with direction (default: -opening_date)
  - Options: opening_date, -opening_date, year, -year, issue_price_numeric, -issue_price_numeric, performance_score, -performance_score
- `year` (integer): Filter by year
- `status` (string): Filter by status (upcoming, open, closed, listed)
- `minPrice` (number): Minimum issue price
- `maxPrice` (number): Maximum issue price

#### Search

```
GET /api/ipos/search
```

Search IPOs by keyword.

Query Parameters:
- `q` (string, required): Search query (min 2 characters)
- `page` (integer): Page number (default: 1)
- `limit` (integer): Results per page (default: 10, max: 100)

#### Performance Rankings

```
GET /api/ipos/performance
```

Get IPOs sorted by performance metrics.

Query Parameters:
- `type` (string): Performance type (best or worst, default: best)
- `limit` (integer): Number of results (default: 10, max: 100)
- `year` (integer): Filter by year

#### Categories

```
GET /api/ipos/categories
```

Get IPOs categorized by sector.

Query Parameters:
- `category` (string): Category name (if omitted, returns list of categories)
- `year` (integer): Filter by year

#### Statistics

```
GET /api/ipos/stats
```

Get IPO statistics.

Query Parameters:
- `year` (integer): Filter by year (if omitted, returns statistics for all years)

## Recent Updates

### JSON-based API Implementation

The API now fetches data directly from JSON files instead of MongoDB. This change provides several benefits:

1. **No database requirement**: The application works out of the box with just the scraped JSON files.
2. **Simplified deployment**: No need to set up and maintain a MongoDB instance.
3. **Streamlined data flow**: Data is scraped to JSON files and served directly from those files.

The JSON data service implements the same interface as the previous MongoDB-based service, ensuring backward compatibility with existing API clients.

## License

[MIT](LICENSE) 
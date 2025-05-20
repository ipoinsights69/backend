# IPO Scraper

A streamlined utility for scraping IPO (Initial Public Offering) data with automated scheduling and JSON file storage.

## Features

- Scrape IPO listings and detailed information for a specific year or range of years
- Intelligent scraping that only fetches new or missing IPOs
- Always keeps the latest 7 IPOs up-to-date
- Automatically save data to JSON files organized by year
- Set up and manage scheduled scraping jobs using cron
- Configure daily scraping at midnight to keep data current
- REST API for accessing IPO data directly from JSON files

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

   # Cron related settings
   CRON_LOG_DIR=./logs
   CONFIG_DIR=./config
   
   # API settings
   API_PORT=5000
   ```

## Usage

### Optimized Scraping

The scraper now uses an optimized approach:
- Only scrapes IPOs that haven't been scraped yet
- Always scrapes the latest 7 IPOs to keep the most recent data fresh
- Sequential processing to minimize load on the target website

To scrape IPO data for the current year with this optimized approach:
```
npm start
```
or
```
npm run scrape:current
```

To scrape IPO data for a specific year or year range:
```
npm run scrape -- 2023
```
or
```
npm run scrape -- 2020 2023
```

### Scheduled Scraping

To set up a daily cron job that scrapes the current year's IPO data at midnight:
```
npm run setup:daily-cron
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

## API Usage

The API provides access to the scraped IPO data directly from the JSON files. Start the API:

```
npm run api
```

### API Endpoints

- `GET /api/ipos/homepage` - Get comprehensive data for homepage display
- `GET /api/ipos` - Get paginated list of IPOs with filtering and sorting
- `GET /api/ipos/search?q=keyword` - Search IPOs by keyword
- `GET /api/ipos/status/:status` - Get IPOs by status (upcoming/open/closed/listed)
- `GET /api/ipos/:id` - Get basic IPO information by ID
- `GET /api/ipos/:id/detail` - Get detailed IPO information
- `GET /api/ipos/top-performers` - Get top-performing IPOs
- `GET /api/ipos/worst-performers` - Get worst-performing IPOs
- `GET /api/ipos/stats` - Get IPO statistics

## Development

Run the API in development mode with auto-reload:
```
npm run api:dev
```

Run both the API and cron system in development mode:
```
npm run dev
``` 
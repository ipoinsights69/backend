# IPO Scraper

A streamlined utility for scraping IPO (Initial Public Offering) data with automated scheduling.

## Features

- Scrape IPO listings and detailed information for a specific year or range of years
- Automatically save data to JSON files organized by year
- Set up and manage scheduled scraping jobs using cron
- Configure daily scraping at midnight to keep data current

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
   ```

## Usage

### One-time Scraping

To scrape IPO data for the current year:
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
npm run scrape -- --start-year 2020 --end-year 2023
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

Scraped IPO data is stored in JSON files organized by year in the configured `DATA_DIR` (defaults to `./data`). For each year, a summary file `_listings.json` contains basic information about all IPOs, and individual JSON files are created for each IPO with detailed information.

## License

[MIT](LICENSE) 
module.exports = {
  apps: [
    {
      name: 'ipo-api',
      script: 'api/server.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
        API_PORT: 8000
      }
    },
    {
      name: 'ipo-scraper',
      script: 'index.js',
      args: 'scrape-current',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        DATA_DIR: './data',
        DELAY_BETWEEN_REQUESTS: '1000',
        MAX_CONCURRENT_REQUESTS: '3',
        CRON_LOG_DIR: './logs',
        CONFIG_DIR: './config',
        API_PORT: '5000'
      }
    }
  ]
}; 
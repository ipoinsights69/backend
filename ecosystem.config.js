module.exports = {
  apps: [
    {
      name: 'ipo-api',
      script: 'api/server.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
        API_PORT: 5000
      }
    },
    {
      name: 'ipo-scraper',
      script: 'index.js',
      args: 'scrape-current --use-threads --thread-count 10',
      cron_restart: '0 0 * * *', // Restart at midnight every day
      env: {
        NODE_ENV: 'production',
        USE_THREADS: 'true',
        THREAD_COUNT: '10',
        UPLOAD_TO_MONGODB: 'false'
      }
    }
  ]
}; 
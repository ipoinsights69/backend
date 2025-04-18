module.exports = {
  apps: [
    {
      name: 'ipo-server',
      script: 'index.js',
      args: 'server',  // Start in server mode
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Enable cron system by default
        ENABLE_CRON: 'true',
        // Set timezone for accurate cron scheduling
        TZ: 'Asia/Kolkata', // IST timezone
        // Set the cron timezone
        CRON_TIMEZONE: 'Asia/Kolkata',
        // Configure log directory
        CRON_LOG_DIR: './logs',
        // Store cron configuration in a predictable location
        CONFIG_DIR: './config'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      // Configure log files for PM2
      output: './logs/pm2-output.log',
      error: './logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // Add hooks to log when process starts/restarts
      post_update: [
        "echo 'App has been updated and reloaded'"
      ],
      // Run cron status check after startup
      restart_delay: 3000,
      env_production: {
        NODE_ENV: 'production',
      }
    }
  ]
}; 
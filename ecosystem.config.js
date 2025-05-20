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
      name: 'ipo-scraper-initial',
      script: 'index.js',
      args: 'scrape-current',
      instances: 1,
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production',
        DATA_DIR: './data',
        DELAY_BETWEEN_REQUESTS: '3000',
        MAX_CONCURRENT_REQUESTS: '1'
      },
      oneshot: true
    },
    {
      name: 'ipo-cron',
      script: 'scripts/cronManager.js',
      args: 'start',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        DATA_DIR: './data',
        DELAY_BETWEEN_REQUESTS: '3000',
        MAX_CONCURRENT_REQUESTS: '1',
        CRON_LOG_DIR: './logs',
        CONFIG_DIR: './config'
      },
      setup: "node -e \"const fs=require('fs'); const configDir='./config'; const cronConfigPath=configDir+'/cron-config.json'; if(!fs.existsSync(configDir)) fs.mkdirSync(configDir, {recursive:true}); const cronConfig={jobs:[{id:'quarterly-update',schedule:'0 0,6,12,18 * * *',task:'scrape-current-year',enabled:true,options:{year:new Date().getFullYear(),concurrency:1}}]}; fs.writeFileSync(cronConfigPath, JSON.stringify(cronConfig, null, 2));\""
    }
  ]
}; 
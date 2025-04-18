module.exports = {
  apps: [
    {
      name: 'ipo-server',
      script: 'index.js',
      args: 'server',  // Start in server mode
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    }
  ]
}; 
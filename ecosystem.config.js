module.exports = {
  apps: [
    {
      name: 'find-hub',
      script: './backend/src/index.js',
      cwd: '/app',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        FETCH_INTERVAL: 10,
        DATABASE_URL: './backend/data/devices.db',
        SESSION_FILE: './backend/data/storageState.json',
        NOMINATIM_URL: 'https://nominatim.openstreetmap.org',
        HEADLESS: 'true',
      },
      log_file: './logs/combined.log',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      time: true,
    }
  ]
}

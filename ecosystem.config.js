module.exports = {
  apps: [{
    name: 'teamlens-backend',
    script: './build/index.js',
    watch: false,
    env_file: '.env',
    env: {
      NODE_ENV: 'production',
      FRONTEND_URL: 'http://teamlens.gti-ia.dsic.upv.es'
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log'
  }]
}

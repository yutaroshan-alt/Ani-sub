// PM2 entrypoint. Always starts index.js (the supervisor), never Aliya.js directly.
module.exports = {
  apps: [{
    name: "bot1",
    script: "index.js",
    cwd: __dirname,
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    watch: false,
    max_memory_restart: "700M",
    env: {
      NODE_ENV: "production",
      PORT: process.env.PORT || 8080
    },
    error_file: "logs/pm2-error.log",
    out_file: "logs/pm2-out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss Z"
  }]
};

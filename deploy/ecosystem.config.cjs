// Trading Wolf AI — PM2 ecosystem for the production VPS.
module.exports = {
  // PM2 does not automatically load the repository .env file. Keep both
  // processes on the same explicit working directory and load the root env
  // before importing server modules.
  cwd: require("path").resolve(__dirname, ".."),
  apps: [
    {
      name: "wolf-api",
      script: "server/dist/api.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      watch: false,
      env: { NODE_ENV: "production", ROLE: "api" },
      time: true,
      max_memory_restart: "512M",
      out_file: "/var/log/wolf/api-out.log",
      error_file: "/var/log/wolf/api-error.log",
      merge_logs: true,
    },
    {
      name: "wolf-worker",
      script: "server/dist/worker.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 30,
      restart_delay: 5000,
      watch: false,
      env: { NODE_ENV: "production", ROLE: "worker" },
      time: true,
      max_memory_restart: "512M",
      out_file: "/var/log/wolf/worker-out.log",
      error_file: "/var/log/wolf/worker-error.log",
      merge_logs: true,
    },
  ],
};

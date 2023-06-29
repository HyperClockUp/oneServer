module.exports = {
  apps: [
    {
      name: "oneServer",
      script: "pnpm",
      args: "dev",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};

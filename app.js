module.exports = {
  apps: [
    {
      name: "your_app_name",
      script: "pnpm",
      args: "dev",
      interpreter: "/usr/local/bin/pnpm", // 根据你的pnpmbin路径进行修改
      watch: true,
      ignore_watch: ["node_modules"],
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
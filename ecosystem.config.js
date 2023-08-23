module.exports = {
  apps: [{
    name: "one-server",
    script: 'yarn',
    args: 'dev',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env_production: {
      NODE_ENV: "production"
    },
    env_development: {
      NODE_ENV: "development"
    }
  }]
}

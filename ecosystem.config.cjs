// pm2 process definition for the always-on backend.
// Runs `pnpm start` (tsx src/index.ts) so the vendored TypeScript #shared module
// is resolved at runtime without a separate build step.
module.exports = {
  apps: [
    {
      name: "slp-backend",
      script: "pnpm",
      args: "start",
      interpreter: "none",
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

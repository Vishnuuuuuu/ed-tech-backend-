// pm2 process definition for the always-on backend.
//
// IMPORTANT: pm2 supervises `node` DIRECTLY (with tsx as an ESM loader) rather
// than going through `pnpm`/`npm`. Running a package-manager wrapper under pm2
// makes pm2 watch the wrapper while the real server runs in a forked child —
// pm2 then mistakes the cycle for an exit and restart-loops even though the app
// is healthy. `node --import tsx src/index.ts` is a single supervised process.
module.exports = {
  apps: [
    {
      name: "slp-backend",
      script: "src/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

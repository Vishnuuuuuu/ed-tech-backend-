# Deploying slp-backend (VPS)

Always-on Node + Express API that runs the async PDF → Haiku-extract → Sonnet-relate
job pipeline. Must run as a long-lived process (jobs take 10–90s), so it lives on your
VPS — not a serverless platform.

## 1. Prerequisites
- Node 20.9+ (22 recommended), `pnpm`, and `pm2` (`npm i -g pnpm pm2`).
- A MongoDB connection string (Atlas or a `mongod` on the VPS).
- An Anthropic API key.

## 2. Clone & install
```bash
git clone https://github.com/Vishnuuuuuu/ed-tech-backend-.git
cd ed-tech-backend-
pnpm install
```

## 3. Environment (`.env` — never commit it)
```
PORT=4000
MONGODB_URI=mongodb+srv://...        # set this → data persists across restarts
ANTHROPIC_API_KEY=sk-ant-...
CORS_ORIGIN=https://<your-frontend>.vercel.app   # the deployed frontend origin
AUTH_SECRET=                          # unused for now (auth is a later phase)
```
Without `MONGODB_URI` the server runs an in-memory store (fine for a smoke test, but
data is lost on restart).

## 4. Run (pm2 via deploy.sh)
A `deploy.sh` script pulls, installs, and (re)starts the app under pm2 using
`ecosystem.config.cjs`. The process runs via `tsx` (the vendored TypeScript `#shared`
module is resolved at runtime — no separate build step needed):
```bash
chmod +x deploy.sh      # first time only
./deploy.sh             # pull → pnpm install → pm2 startOrReload → health-check
pm2 startup             # first time only: follow the printed command so it survives reboots
```
Re-run `./deploy.sh` any time to ship an update (zero-downtime reload).

**Endpoints to verify:**
- `curl http://localhost:4000/health` → `{"ok":true}`
- `curl http://localhost:4000/status` → `{ ok, store: "mongo"|"memory", uptimeSeconds, ... }`
  (use `/status` for uptime monitoring — `store` confirms Mongo is connected).

## 5. HTTPS (required — the browser blocks https-page → http-API calls)
Put the backend behind nginx on a subdomain (e.g. `api.yourdomain.com`) with a
Let's Encrypt cert:
```nginx
server {
  server_name api.yourdomain.com;
  client_max_body_size 30M;            # PDFs up to 25 MB
  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_read_timeout 120s;           # LLM jobs can take a while
  }
}
```
Then `sudo certbot --nginx -d api.yourdomain.com`.

## 6. Connect the frontend
In the Vercel project set `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`, and make sure
`CORS_ORIGIN` here matches the frontend's deployed origin. Restart pm2 after env changes
(`pm2 restart slp-backend --update-env`).

## Notes
- All data is scoped to a single placeholder `userId` — auth is a later phase.
- `prompts/` holds the verified extraction/simulation prompts (loaded at runtime).

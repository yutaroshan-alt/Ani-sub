# Bot1 — Aliya.js, single account

Credit: `Made by 0xMr_King x ┃ Tanin Islam`

## Flow (same on every platform)
1. `npm start` → `index.js` opens the public `PORT` health endpoint immediately.
2. The supervisor spawns `Aliya.js` on a private port and proxies the dashboard.
3. `Aliya.js` reads `account.txt`, `config.json`, `configCommands.json`, `utils.js`, `textEngine.js`.
4. On cloud hosts `ACCOUNT_TXT` writes `account.txt` before login; locally the file is already present.
5. `bot/login/login.js` logs in via `fb-chat-api`, loads all commands, starts the MQTT listener.

Never run `node Aliya.js` directly — pm2/start script must always target `index.js`.

## Quick start (all platforms)
```bash
npm install --no-audit --no-fund
npm run validate     # unique command names, 0 errors
npm start            # public /health on $PORT (default 8080)
```

## Platform matrix

| Platform | Command | Config | Health |
|---|---|---|---|
| Render | Blueprint deploy, `npm start` | `render.yaml` + secret `ACCOUNT_TXT` | `/health` |
| Railway | `npm start` | `railway.json` + secret `ACCOUNT_TXT` | `/health` |
| Termux | `pm2 start index.js --name bot1` | `account.txt` local | `http://127.0.0.1:8080/health` |
| Linux / VPS | `pm2 start ecosystem.config.js` or Docker | `.env` / `ACCOUNT_TXT` | `/health` |
| VSCode | Run/Debug “Bot1: Aliya.js” | `.vscode/launch.json`, `.env.example` | `/health` |
| Vercel | `vercel.json` + `api/status.js` | status page only | `/health` → `/api/status` |

### Render (primary)
- `render.yaml`: Node 20, `npm install --no-audit --no-fund`, `npm start`, `healthCheckPath: /health`.
- Set secret `ACCOUNT_TXT` to the fresh AppState JSON array. No cookie file is uploaded.

### Railway
- `railway.json` uses NIXPACKS and `npm start` with `/health` healthcheck.
- Set the same `ACCOUNT_TXT` secret in the Railway dashboard.

### Termux / Linux / VPS
- Termux pm2 shebang is often broken; run:
  `node "$(node -e "console.log(require.resolve('pm2/bin/pm2'))")" start index.js --name bot1`
- On Linux/VPS either `npm run pm2` (uses `ecosystem.config.js`) or:
  `docker build -t bot1 . && docker run -d --restart unless-stopped -p 8080:8080 -e ACCOUNT_TXT="$ACCOUNT_TXT" bot1`
- `npm run pm2` must never point at `Aliya.js`.

### VSCode
- Open the folder, `npm install`, then F5 → “Bot1: Aliya.js”.
- `.vscode/tasks.json` includes install / validate / start.
- Copy `.env.example` → `.env` for local settings; never put cookies in tracked files.

### Vercel
- Vercel serverless functions cannot keep a Messenger MQTT connection alive.
- `api/status.js` + `vercel.json` provide only a public status/health response.
- Run the actual bot on Render, Railway, Termux, Linux/VPS; point `ALIYA_SELF_URL` at that host.

## Account
- Single account only: `account.txt` is the only login source.
- No account manager, pool, switcher, or `ACCOUNT2_TXT`–`ACCOUNT5_TXT`.
- Replace the cookie and restart to change accounts.

## Notes
- JSON database fallback is used when the SQLite native binding is unavailable; harmless.
- `scripts/cmds/fonts/NotoColorEmoji.ttf` + `textEngine.js` keep text styling correct.
- `fb-chat-api` is kept byte-identical to the SakuraBot_V2 reference.

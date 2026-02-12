# endfield-auto

Automated Endfield attendance service with scheduled check-ins, startup catch-up, token refresh, Discord/Telegram integration, and redeem-code watch.

## Features
- Daily cron attendance runs (configurable).
- Startup catch-up per profile when today's attendance is missing (Asia/Shanghai day boundary).
- Signed skport attendance/status requests.
- Automatic `signToken` refresh on startup and on schedule.
- Optional code watch with source throttling, conditional fetch, and lease-based active/passive mode.
- Discord slash commands: `/checkin`, `/status` (plus `/codes` with optional source filter, and `/codescheck` when code watch is enabled).
- Telegram bot commands: `/checkin`, `/status` (plus `/codes` with optional source filter, and `/codescheck` when code watch is enabled).
- Discord notifications via bot channel or webhook.
- Telegram notifications via bot API chat delivery.
- JSON-backed profile/state storage for Docker volume persistence.
- Structured summary/detail logging with configurable log level and paths.

## Architecture
- `src/app`: bootstrap and dependency wiring.
- `src/config`: env parsing and defaults.
- `src/core/auth`: token refresh orchestration.
- `src/core/attendance`: run orchestration and state updates.
- `src/core/codes`: code-watch orchestration, dedupe, notification gating, and persistence.
- `src/core/scheduler`: cron + startup catch-up.
- `src/core/profiles`: profile schema/load/save.
- `src/core/state`: persisted last-success map.
- `src/integrations/codes`: source adapters (currently `game8`, `destructoid`, `pocket_tactics`).
- `src/integrations/endfield`: signed API client + auth refresh client.
- `src/integrations/discord`: command registration, bot client, embeds, webhook sender.
- `src/integrations/telegram`: bot polling loop, command handling, payload formatter, and sender.

## Requirements
- Node.js 22+
- npm
- Docker (optional)

## Configuration

Copy `.env.example` to `.env` and edit values:

- `PROFILE_PATH` (optional; default `.data/profiles.json`)
- `DATA_PATH` (optional; default `.data`)
- `CRON_SCHEDULE` (default `0 2 * * *`)
- `TOKEN_REFRESH_CRON` (default `0 */6 * * *`)
- `CODE_WATCH_ENABLED` (`true|false`, default `false`)
- `CODE_WATCH_MODE` (`active|passive`, default `active`)
- `CODE_WATCH_CRON` (default `*/45 * * * *`)
- `CODE_WATCH_STARTUP_SCAN` (`true|false`, default `true`)
- `CODE_WATCH_SOURCES` (comma list, default `game8,destructoid,pocket_tactics`)
- `CODE_WATCH_HTTP_TIMEOUT_MS` (default `10000`)
- `CODE_WATCH_LEASE_SECONDS` (default `120`)
- `CODE_WATCH_MAX_REQUESTS_PER_HOUR` (default `12`)
- `LOG_LEVEL` (`debug|info|warn|error`, default `info`)
- `LOG_SUMMARY_PATH` (default `.data/logs/summary.log`)
- `LOG_DETAIL_PATH` (default `.data/logs/detail.log`)
- `DISCORD_BOT_TOKEN` (optional; required for slash commands)
- `DISCORD_APP_ID` (optional; required for slash command registration)
- `DISCORD_GUILD_ID` (optional; required for slash command registration)
- `DISCORD_CHANNEL_ID` (optional; required for bot channel notifications)
- `DISCORD_WEBHOOK_URL` (optional; notifications only)
- `TELEGRAM_BOT_TOKEN` (optional; required for Telegram commands/notifications)
- `TELEGRAM_CHAT_ID` (optional; required for Telegram notifications)
- `TELEGRAM_ALLOWED_CHAT_IDS` (optional comma list; command allowlist; defaults to `TELEGRAM_CHAT_ID`)
- `TELEGRAM_THREAD_ID` (optional; Telegram forum topic thread id for notifications)
- `TELEGRAM_POLLING_ENABLED` (`true|false`, default `true`)
- `TELEGRAM_DISABLE_NOTIFICATION` (`true|false`, default `false`)
- `TZ` (optional schedule timezone override; default `Asia/Shanghai`)

Discord modes:
- Webhook-only notifications: set `DISCORD_WEBHOOK_URL`.
- Bot + slash commands: set `DISCORD_BOT_TOKEN`, `DISCORD_APP_ID`, `DISCORD_GUILD_ID`, `DISCORD_CHANNEL_ID`.
- If both are set, notifications go to webhook while slash commands still run through the bot.

Telegram modes:
- Commands + notifications: set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
- Commands-only: set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_IDS`, and `TELEGRAM_DISABLE_NOTIFICATION=true`.
- Notifications-only: set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `TELEGRAM_POLLING_ENABLED=false`.

Code watch mode:
- `active`: polls external sources, updates `.data/codes.json`, and sends code notifications.
- `passive`: does not poll external sources; only reads tracked code data and serves command output.
- In multi-instance setups, run one active instance and keep others passive.

Default code sources (`CODE_WATCH_SOURCES`):
- `game8`: Game8 curated Endfield code page.
- `destructoid`: Destructoid Endfield codes page.
- `pocket_tactics`: Pocket Tactics Endfield codes page.

## Profile file

Create `.data/profiles.json` (or custom `PROFILE_PATH`):

```json
{
  "profiles": [
    {
      "id": "main",
      "accountName": "MyAccount",
      "cred": "<SK_OAUTH_CRED_KEY cookie value>",
      "skGameRole": "<sk-game-role header value>",
      "platform": "3",
      "vName": "1.0.0",
      "signToken": "<optional SK_TOKEN_CACHE_KEY>",
      "signSecret": "<optional signing secret override>",
      "deviceId": "<optional device id>"
    }
  ]
}
```

How to capture values:
1. Log in on the Endfield web page.
2. In DevTools Network, inspect a request to `https://zonai.skport.com/web/v1/game/endfield/attendance`.
3. Copy request headers:
- `cred` -> `cred`
- `sk-game-role` -> `skGameRole`
- `platform` -> `platform`
- `vName` -> `vName`
4. In DevTools Storage (for `game.skport.com`), copy:
- `SK_TOKEN_CACHE_KEY` -> `signToken` (optional but recommended)
- `#eventLogDeviceId` / `#deviceIDS` -> `deviceId` (optional)

Notes:
- The app computes runtime `timestamp` and `sign` automatically.
- Signing key priority is `signSecret || signToken`.
- If `signToken` is missing, startup refresh attempts to fetch one via `/web/v1/auth/refresh`.
- No passwords are stored.

## Run locally

```bash
npm install
npm run dev
```

Production-style local run:

```bash
npm run build
npm start
```

## Docker

```bash
docker build -t endfield-auto .
docker run --name endfield-auto --restart unless-stopped \
  --env-file .env \
  -v $(pwd)/.data:/app/.data \
  endfield-auto
```

## Docker Compose

```bash
docker compose up -d --build
```

## Runtime behavior
- Startup sequence: load config/profiles/state, refresh sign tokens, run catch-up for profiles that have not succeeded today (Asia/Shanghai), optional startup code scan (active mode), then start attendance/token-refresh/code-watch crons.
- Scheduled attendance runs send per-profile Discord/Telegram notifications (if configured).
- Manual `/checkin` (Discord slash command or Telegram bot command) returns command response embeds/messages and does not double-send scheduled notifications.
- Scheduled code-watch runs scan configured sources with source-level interval limits, conditional requests (`If-None-Match` / `If-Modified-Since`), and backoff.
- Code notifications are sent only once per code when confidence is sufficient (official/curated source, or cross-source confirmation).
- Telegram output is optimized for plain chat readability (compact sections and localized time formatting) and may not mirror Discord embed layout exactly.

## Data and logs
- `.data/profiles.json`: profile credentials/headers.
- `.data/state.json`: last successful day by profile.
- `.data/codes.json`: tracked redeem codes and per-source polling metadata.
- `.data/code-watch.lock`: lease file used to coordinate active polling instances.
- `.data/logs/summary.log`: concise operational log.
- `.data/logs/detail.log`: full structured detail log.

## Troubleshooting
- `Auth refresh HTTP ...` or `Auth refresh error ...`: credentials (`cred/platform/vName`) likely expired or invalid.
- Attendance HTTP failure/non-zero code: verify `cred`, `sk-game-role`, signing inputs, and timezone assumptions.
- Slash commands not visible: ensure `DISCORD_APP_ID` + `DISCORD_GUILD_ID` are set and bot has guild permissions.
- No notifications in bot mode: ensure `DISCORD_CHANNEL_ID` points to a text channel the bot can send to.
- Telegram commands not responding: ensure `TELEGRAM_POLLING_ENABLED=true`, the bot is started, and the chat ID is in `TELEGRAM_ALLOWED_CHAT_IDS` (or `TELEGRAM_CHAT_ID` fallback).
- Telegram send failures/rate limits: confirm bot can post to the target chat/topic and reduce notification burst frequency if Telegram returns `retry_after`.
- Code watch idle in multi-instance deployment: confirm exactly one instance runs `CODE_WATCH_MODE=active`.
- Code watch sees no updates: verify source accessibility from your environment and tune `CODE_WATCH_SOURCES` / `CODE_WATCH_CRON`.

## Security
- Never commit `.env`, `.data/profiles.json`, or logs with secrets.
- Rotate compromised credentials/tokens immediately.

## Credits
Thanks to [cptmacp](https://gist.github.com/cptmacp/70f66f2a4fb9d5fa708d33fbcc8e265a) for core reverse-engineering and [torikushiii](https://github.com/torikushiii/hoyolab-auto) for project inspiration.

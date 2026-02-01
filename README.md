# endfield-auto

Automates Endfield daily attendance with a scheduled job and Discord notifications/commands.

## Quick start

1. Copy `.env.example` to `.env` and fill in Discord settings if you want notifications or commands.
2. Create a profiles file at `.data/profiles.json` (or set `PROFILE_PATH`).
3. Build and run with Docker, Docker Compose, or Node.

## Configuration

### Environment (.env)

Copy `.env.example` to `.env`. Values are read from `.env` or container env.

- `PROFILE_PATH` (optional; defaults to `.data/profiles.json`)
- `DATA_PATH` (optional; defaults to `.data`)
- `CRON_SCHEDULE` (default `0 2 * * *`, Asia/Shanghai)
- `TZ` (optional timezone override for the cron schedule; default `Asia/Shanghai`)

Discord options:
- **Webhook only (notifications only):** set `DISCORD_WEBHOOK_URL` and skip the bot fields.
- **Bot + slash commands:** set all of `DISCORD_BOT_TOKEN`, `DISCORD_APP_ID`, `DISCORD_GUILD_ID`, `DISCORD_CHANNEL_ID`.
- If both webhook and bot are configured, notifications are sent via the webhook; the bot still handles slash commands.

## Profiles file

Create `.data/profiles.json` with one or more profiles:

```json
{
  "profiles": [
    {
      "id": "main",
      "accountName": "YourLabel",
      "cred": "<SK_OAUTH_CRED_KEY cookie value>",
      "skGameRole": "<sk-game-role header>",
      "platform": "3",
      "vName": "1.0.0",
      "signToken": "<optional SK_TOKEN_CACHE_KEY localStorage value>",
      "signSecret": "<optional sign secret value>",
      "deviceId": "<optional device id localStorage value>"
    }
  ]
}
```

This project does **not** store passwords. The values are captured from the Endfield sign-in page (network request + storage).

### How to capture profile values

1. Open the Endfield sign-in page and log in.
2. Open DevTools -> Network.
3. Find a request to `https://zonai.skport.com/web/v1/game/endfield/attendance` (GET or POST).
4. In **Request Headers**, copy:
   - `cred` -> `cred`
   - `sk-game-role` -> `skGameRole`
   - `platform` -> `platform`
   - `vname` -> `vName`
5. In DevTools -> Application/Storage -> Local Storage for `game.skport.com`, copy:
   - `SK_TOKEN_CACHE_KEY` -> `signToken` (used to compute `sign`)
   - `#eventLogDeviceId` or `#deviceIDS` -> `deviceId` (optional)
6. If you don't see `cred` in headers, use the cookie:
   - Cookie `SK_OAUTH_CRED_KEY` -> `cred`

Notes:
- You do **not** need to save `timestamp` or `sign`. The service computes them.
- `signSecret` is optional; if present it takes precedence over `signToken`.
- The `sk-game-role` value is easiest to copy directly from the attendance request headers.

## Project structure (src)

- `src/app/`: entrypoint and app wiring (`main.ts`, `App.ts`)
- `src/core/`: services (attendance, scheduler, state, profiles)
- `src/integrations/`: Endfield and Discord clients/formatters
- `src/utils/`, `src/types/`: shared helpers and types

## Docker

```bash
docker build -t endfield-auto .
```

```bash
docker run --name endfield-auto --restart unless-stopped \
  --env-file .env \
  -v $(pwd)/.data:/app/.data \
  endfield-auto
```

## Docker Compose

```bash
docker compose up -d --build
```

## Development

```bash
npm install
npm run dev
```

## Notes
- Cron uses Asia/Shanghai by default (or `TZ` if provided); date comparisons for "today" always use Asia/Shanghai.
- On startup, if the last successful check-in is before today (Asia/Shanghai), it runs immediately.
- If credentials expire, check-ins will fail; Discord embeds (when enabled) are generic, so check logs for the specific error and refresh the cookie values.
- If `DISCORD_WEBHOOK_URL` is set, notifications are sent through the webhook.

## Credits
Big thanks to [cptmacp](https://gist.github.com/cptmacp/70f66f2a4fb9d5fa708d33fbcc8e265a) for the logic, and to [torikushiii](https://github.com/torikushiii/hoyolab-auto) for the inspiration.

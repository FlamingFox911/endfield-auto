# endfield-auto

Automates Endfield daily attendance with a scheduled job and Discord notifications/commands.

## Quick start

1. Copy `.env.example` to `.env` and fill in Discord settings.
2. Create a profiles file at `.data/profiles.json` (or set `PROFILE_PATH`).
3. Build and run with Docker, Docker Compose, or Node.

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
      "signToken": "<optional sign token header>",
      "signSecret": "<optional sign secret header>",
      "deviceId": "<optional device id header>"
    }
  ]
}
```

The values above are captured from the Endfield sign-in page network request (attendance). This project does **not** store passwords. If you provide `signToken` or `signSecret`, the service will generate the `sign` header automatically.

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
- Cron uses Asia/Shanghai by default.
- On startup, if the last successful check-in is before today (Asia/Shanghai), it runs immediately.
- If credentials expire, the bot will notify you to refresh the cookie.

## Credits
Big thanks to [cptmacp](https://gist.github.com/cptmacp/70f66f2a4fb9d5fa708d33fbcc8e265a) for the logic, and to [torikushiii](https://github.com/torikushiii/hoyolab-auto) for the inspiration.
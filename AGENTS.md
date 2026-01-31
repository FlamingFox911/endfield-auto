# Agent Instructions (endfield-auto)

## Project Goal
Build a Docker-deployable, statically-typed Endfield attendance automation service with:
- Reliable credential acquisition/refresh (first-time manual setup allowed, then hands-off).
- Daily cron schedule with catch-up on startup if missed.
- Discord notifications + a command to trigger manual check-in.

## Tech Stack
- Language: TypeScript (Node.js 22+).
- Runtime: Node.js, Docker.
- Scheduler: cron (node-cron or similar) + missed-run logic.
- Discord: discord.js or a webhook + slash command (prefer slash command).
- HTTP: undici or node-fetch.
- Storage: local file (JSON) with optional env-based override; persist in Docker volume.

## Required Behavior
1. Credentials
   - Use the Endfield web flow to obtain required tokens/headers.
   - Store credentials securely (local file or env).
   - Refresh or re-auth automatically when possible; detect expiry and re-login.
   - Always consult current sources for the exact headers/flows.

2. Scheduling
   - Default daily cron (configurable).
   - On startup, if the last successful check-in is before today (Asia/Shanghai), run immediately.

3. Discord Integration
   - Send success/failure messages to a Discord channel.
   - Support a command (slash or message command) to trigger a check-in on demand.

4. Docker
   - Provide Dockerfile + docker-compose.yml with a persistent volume.
   - Container should start the scheduler automatically.


## Configuration
Use .env (or environment variables) for:
- Do NOT store passwords. Avoid any config that requires a password.
- PROFILE_PATH (optional; defaults to .data/profiles.json)
- DATA_PATH (optional; defaults to .data)
- CRON_SCHEDULE (default daily; Asia/Shanghai timezone)
- DISCORD_BOT_TOKEN, DISCORD_APP_ID, DISCORD_GUILD_ID, DISCORD_CHANNEL_ID
- DISCORD_WEBHOOK_URL (optional; notifications only)
- TZ (optional timezone override; default Asia/Shanghai)

## Engineering Notes
- Prefer small, testable modules: auth, attendance, scheduler, discord, storage.
- Add robust logging and error handling; never silently fail.
- Avoid hard-coded constants; centralize in config.
- Never commit sensitive user data. Data regarding general calls is acceptible.
- Keep front-facing integrations (Discord/webhook messages) in-universe; keep backend terminal logs descriptive for administrators.

## When Unsure
- If API endpoints or headers are unclear, verify via current sources before coding.
- If you can’t confirm a flow, ask the user before implementing guesses.




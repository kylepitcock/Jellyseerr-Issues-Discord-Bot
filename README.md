# Jellyseerr Issue Discord Bot

Discord slash command `/issue` that sends issues to your Jellyseerr instance via API.

## Prerequisites
- Discord application and bot token with slash commands enabled
- Jellyseerr base URL reachable from the bot container
- Jellyseerr API key
- Node 18+ (or Docker)

## Configuration
Copy [/.env.example](.env.example) to `.env` and fill in:

- `DISCORD_TOKEN` – bot token
- `DISCORD_APP_ID` – Discord application (client) ID
- `DISCORD_GUILD_ID` – optional; set to a test guild to register commands instantly. Leave unset for global registration (may take up to an hour to propagate).
- `JELLYSEERR_API_URL` – base URL, e.g. `https://jellyseerr.example.com`
- `JELLYSEERR_API_KEY` – API key from Jellyseerr

## Local run
```sh
npm install
npm start
```

## Docker
Build and run:
```sh
docker build -t jellyseerr-issue-bot .
docker run \
  -e DISCORD_TOKEN=... \
  -e DISCORD_APP_ID=... \
  -e DISCORD_GUILD_ID=... \
  -e JELLYSEERR_API_URL=... \
  -e JELLYSEERR_API_KEY=... \
  jellyseerr-issue-bot
```

## Docker Compose
1) Create `.env` with your values (or reuse the one from the Configuration section):
```
DISCORD_TOKEN=...
DISCORD_APP_ID=...
DISCORD_GUILD_ID=...
JELLYSEERR_API_URL=...
JELLYSEERR_API_KEY=...
```

2) Create `docker-compose.yml`:
```yaml
services:
  jellyseerr-issue-bot:
    build: .
    env_file: .env
    restart: unless-stopped
```

3) Start and view logs:
```sh
docker compose up -d
docker compose logs -f
```

## Slash command
`/issue` accepts:
- `title` (required)
- `description` (required)

The bot posts to Jellyseerr at `POST /api/v1/issues` with payload `{ issueType: "GENERAL", title, message }`. If your Jellyseerr version uses a different endpoint or payload, adjust the `createJellyseerrIssue` function in [src/index.js](src/index.js).

## Notes
- For faster testing, set `DISCORD_GUILD_ID` so commands are registered per-guild instead of globally.
- The bot replies ephemerally to the user to avoid channel noise.
- Logs are printed to stdout; pair with your container logging solution if you need persistence.

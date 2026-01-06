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

## Prebuilt Images
Once CI publishes, you can pull the image without cloning:

- GHCR: `ghcr.io/kylepitcock/jellyseerr-issue-bot:latest`
- Docker Hub (optional if configured): `docker.io/<your-dockerhub-user>/jellyseerr-issue-bot:latest`

Run directly:
```sh
docker run \
  -e DISCORD_TOKEN=... \
  -e DISCORD_APP_ID=... \
  -e DISCORD_GUILD_ID=... \
  -e JELLYSEERR_API_URL=... \
  -e JELLYSEERR_API_KEY=... \
  ghcr.io/kylepitcock/jellyseerr-issue-bot:latest
```

## Docker Compose (no .env file)
1) Create `docker-compose.yml` with environment values inline:
```yaml
services:
  jellyseerr-issue-bot:
    # Use the prebuilt image from GHCR
    image: ghcr.io/kylepitcock/jellyseerr-issue-bot:latest
    environment:
      DISCORD_TOKEN: your-token
      DISCORD_APP_ID: your-app-id
      DISCORD_GUILD_ID: optional-guild-id
      JELLYSEERR_API_URL: https://jellyseerr.example.com
      JELLYSEERR_API_KEY: your-api-key
    restart: unless-stopped
```

2) Start and view logs:
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

### CI: Publishing to Registries
This repo includes a GitHub Actions workflow at `.github/workflows/docker-publish.yml` that:
- Builds multi-arch (amd64 + arm64) images from the Dockerfile
- Publishes to GHCR at `ghcr.io/<owner>/jellyseerr-issue-bot`
- Optionally publishes to Docker Hub when you add repo secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`

After enabling Actions on your GitHub repository, pushes to `main` will update the image.

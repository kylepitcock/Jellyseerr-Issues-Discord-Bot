# Jellyseerr Issue Discord Bot

Discord slash command `/issue` that sends issues to your Jellyseerr instance via API.

## Prerequisites
- DiscordOutput notes:
- When Jellyseerr returns progress fields (percent/progress) and time remaining (ETA/seconds left), the bot will render a text progress bar (monospace) similar to a download status UI.
- If those fields aren't available for the item, the bot will fall back to showing the best available status/availability info.

Examples:
```text
/status                                      # Show currently downloading item
/status title:"The Matrix" mediatype:movie   # Look up specific movie
/status title:"The Office" mediatype:tv      # Look up specific TV show
```

## Slash Command: `/queue`
Displays the current download queue, showing the top items being downloaded from Radarr and/or Sonarr.

Options:
- `limit` (optional) – number of items to show (1-25, default: 10)

Behavior:
- The bot replies publicly (visible to everyone in the channel).
- It queries both Radarr and Sonarr (if configured) and combines the results, sorted by download progress.
- Each item shows a progress bar, percentage complete, current state (e.g., "Downloading"), and estimated time remaining.
- Requires at least one of `RADARR_URL`/`RADARR_API_KEY` or `SONARR_URL`/`SONARR_API_KEY` to be configured.

Example output:
```
Download Queue (5 items)

1. The Matrix Resurrections
   ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  67%
   Downloading • ETA: 5m 32s

2. The Office S09E23
   ▓▓▓▓▓▓▓░░░░░░░░░░░  42%
   Downloading • ETA: 12m 8s
```

Examples:
```text
/queue
/queue limit:5
/queue limit:25
```

### Keyword Tags (used when `REMEDIARR_SUPPORT=true`)n and bot token with slash commands enabled
- Jellyseerr base URL reachable from the bot container
- Jellyseerr API key
- Node 18+ (or Docker)

## Configuration
Set the following environment variables (via Docker or your shell):

- `DISCORD_TOKEN` – bot token
- `DISCORD_APP_ID` – Discord application (client) ID
- `DISCORD_GUILD_ID` – optional; set to a test guild to register commands instantly. Leave unset for global registration (can take up to an hour to propagate)
- `JELLYSEERR_API_URL` – base URL, e.g. `https://jellyseerr.example.com`
- `JELLYSEERR_API_KEY` – API key from Jellyseerr
- `REMEDIARR_SUPPORT` – optional; set to `true` to require descriptions to include keyword tags (see Keyword Tags below). Default: `false`.

Optional `/status` integrations (for more accurate download progress):
- `STATUS_SOURCE` – where `/status` pulls progress from. Values: `auto` (default), `jellyseerr`, `radarr`, `sonarr`.
- `STATUS_DEBUG` – set to `true` to log a small Jellyseerr/Radarr/Sonarr payload snippet to stdout for troubleshooting.

Radarr (movie queue progress):
- `RADARR_URL` – e.g. `http://radarr:7878`
- `RADARR_API_KEY`

Sonarr (TV queue progress):
- `SONARR_URL` – e.g. `http://sonarr:8989`
- `SONARR_API_KEY`

NZBGet (not yet used, reserved for future):
- `NZBGET_URL`
- `NZBGET_USER`
- `NZBGET_PASS`

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
  -e REMEDIARR_SUPPORT=false \
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
      REMEDIARR_SUPPORT: "false"  # set to "true" to require keyword tags in descriptions

      # Optional: /status configuration
      STATUS_SOURCE: auto      # auto|jellyseerr|radarr|sonarr
      STATUS_DEBUG: "false"    # set to "true" to log payload snippets for troubleshooting

      # Optional: Radarr (movie download progress)
      RADARR_URL: http://radarr:7878
      RADARR_API_KEY: your-radarr-api-key

      # Optional: Sonarr (tv download progress)
      SONARR_URL: http://sonarr:8989
      SONARR_API_KEY: your-sonarr-api-key

      # Optional: NZBGet (reserved for future)
      # NZBGET_URL: http://nzbget:6789
      # NZBGET_USER: nzbget
      # NZBGET_PASS: secret
    restart: unless-stopped
```

2) Start and view logs:
```sh
docker compose up -d
docker compose logs -f
```

## Slash Command: `/issue`
Options:
- `title` (required) – search query used to resolve media unless `mediaid` is provided
- `mediatype` (required) – `movie` or `tv`
- `reason` (required) – `video`, `audio`, `subtitle`, or `other`
- `issuetitle` (required) – short issue title
- `issuedescription` (required) – describe the problem; must include at least one keyword tag (see Keyword Tags below)
- `season` (optional) – season number; required when `mediatype=tv`
- `episode` (optional) – episode number; required when `mediatype=tv`
- `mediaid` (optional) – Jellyseerr media ID (numeric) to skip search and use this item directly

Behavior:
- For TV, both `season` and `episode` are required; the bot will fail fast if missing.
- The bot responds ephemerally (visible only to the requester).
- Keyword requirement: only enforced when `REMEDIARR_SUPPORT=true`. If enabled and the description lacks required tags, the bot fails fast and lists allowed tags for the chosen `mediatype` and `reason`.

API call:
- Creates issues via `POST /api/v1/issue` with `issueType` mapped to Jellyseerr/Overseerr enums. Adjust the endpoint/payload in `createJellyseerrIssue` in [src/index.js](src/index.js) if your server differs.

## Slash Command: `/status`
Shows the download / availability status of a specified movie or TV show. If no parameters are provided, shows the currently downloading item.

Options:
- `title` (optional) – search query used to resolve media unless `mediaid` is provided. Omit to show currently downloading item.
- `mediatype` (optional) – `movie` or `tv`. Omit to show currently downloading item.
- `mediaid` (optional) – Jellyseerr media ID (numeric) to skip search and use this item directly

Behavior:
- The bot replies publicly (visible to everyone).
- **Quick status check**: Use `/status` with no parameters to see what's currently downloading (first item in the queue).
- **Specific lookup**: Provide both `title` and `mediatype` to look up a specific movie or TV show.
- It will try to fetch detailed media info from Jellyseerr and present a status “card” (in a code block) including a progress bar and ETA when available.
- Jellyseerr API implementations vary by version; if a detailed endpoint isn’t available, the bot falls back to search-based info.

More accurate progress (recommended):
- If Radarr/Sonarr are configured, `/status` will also query their download queues to display real-time progress/ETA/state (this is typically what you see in download UIs).
- This helps when Jellyseerr doesn’t expose downloader progress directly.

Output notes:
- When Jellyseerr returns progress fields (percent/progress) and time remaining (ETA/seconds left), the bot will render a text progress bar (monospace) similar to a download status UI.
- If those fields aren’t available for the item, the bot will fall back to showing the best available status/availability info.

Examples:
```text
/status
/status title:"The Matrix" mediatype:movie
/status title:"The Office" mediatype:tv
```

### Keyword Tags (used when `REMEDIARR_SUPPORT=true`)
Your description must include at least one of the keywords that match the selected `mediatype` and `reason` when keyword enforcement is enabled:

TV:
- Audio: `no audio`, `no sound`, `missing audio`, `audio issue`, `wrong language`
- Video: `no video`, `video glitch`, `black screen`, `stutter`, `pixelation`
- Subtitle: `missing subs`, `no subtitles`, `bad subtitles`, `wrong subs`
- Other: `buffering`, `playback error`, `corrupt file`

Movie:
- Audio: `no audio`, `no sound`, `audio issue`, `wrong language`
- Video: `no video`, `video missing`, `bad video`, `black screen`
- Subtitle: `missing subs`, `no subtitles`, `bad subtitles`
- Other: `buffering`, `playback error`, `corrupt file`

## Notes
- For faster testing, set `DISCORD_GUILD_ID` so commands are registered per-guild instead of globally.
- The bot replies ephemerally to the user to avoid channel noise.
- Logs are printed to stdout; pair with your container logging solution if you need persistence.

### CI: Publishing to Registries
This repo includes a GitHub Actions workflow at `.github/workflows/docker-publish.yml` that:
- Builds multi-arch (amd64 + arm64) images from the Dockerfile
- Publishes to GHCR at `ghcr.io/<owner>/jellyseerr-issue-bot`
- You can extend it to publish to Docker Hub if desired

After enabling Actions on your GitHub repository, pushes to `main` will update the image.

### GHCR Access Troubleshooting
If you see `denied` when pulling from GHCR (e.g., `Head "https://ghcr.io/.../manifests/latest": denied`), do one of the following:
- Make the package public: open `https://github.com/users/<your-username>/packages/container/jellyseerr-issue-bot` and set visibility to Public.
- Or authenticate to GHCR on the remote host using a GitHub Personal Access Token (classic) with `read:packages` scope:
  ```sh
  docker login ghcr.io -u <your-username> -p <your-PAT>
  docker pull ghcr.io/<your-username>/jellyseerr-issue-bot:latest
  ```
If you prefer anonymous pulls without auth, set the package to Public after the first push.

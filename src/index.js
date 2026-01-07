const axios = require('axios');
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
} = require('discord.js');
const dotenv = require('dotenv');

dotenv.config();

const requiredEnv = [
  'DISCORD_TOKEN',
  'DISCORD_APP_ID',
  'JELLYSEERR_API_URL',
  'JELLYSEERR_API_KEY',
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const {
  DISCORD_TOKEN,
  DISCORD_APP_ID,
  DISCORD_GUILD_ID,
  JELLYSEERR_API_URL,
  JELLYSEERR_API_KEY,
  REMEDIARR_SUPPORT,
} = process.env;

const REMEDIARR_ENABLED = String(REMEDIARR_SUPPORT || '').toLowerCase() === 'true';

const commands = [
  new SlashCommandBuilder()
    .setName('issue')
    .setDescription('Create a Jellyseerr issue')
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Movie or TV name to search')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('mediatype')
        .setDescription('Is this a movie or TV show?')
        .setRequired(true)
        .addChoices(
          { name: 'Movie', value: 'movie' },
          { name: 'TV', value: 'tv' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('What kind of issue?')
        .setRequired(true)
        .addChoices(
          { name: 'Video', value: 'video' },
          { name: 'Audio', value: 'audio' },
          { name: 'Subtitle', value: 'subtitle' },
          { name: 'Other', value: 'other' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('issuetitle')
        .setDescription('Short title for the issue')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('issuedescription')
        .setDescription('What do you need or what is broken?')
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('season')
        .setDescription('Season number (required for TV)')
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName('episode')
        .setDescription('Episode number (required for TV)')
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName('mediaid')
        .setDescription('Jellyseerr media ID (numeric). Overrides search if provided')
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show download / availability status for a movie or TV show')
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Movie or TV name to search')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('mediatype')
        .setDescription('Is this a movie or TV show?')
        .setRequired(true)
        .addChoices(
          { name: 'Movie', value: 'movie' },
          { name: 'TV', value: 'tv' },
        ),
    )
    .addIntegerOption((option) =>
      option
        .setName('mediaid')
        .setDescription('Jellyseerr media ID (numeric). Overrides search if provided')
        .setRequired(false),
    ),
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

async function registerCommands() {
  const globalRoute = Routes.applicationCommands(DISCORD_APP_ID);
  if (DISCORD_GUILD_ID) {
    const guildRoute = Routes.applicationGuildCommands(DISCORD_APP_ID, DISCORD_GUILD_ID);
    console.log(`Registering slash commands for guild ${DISCORD_GUILD_ID}...`);
    await rest.put(guildRoute, { body: commands });
    console.log('Guild commands registered');

    // Clear global commands to avoid duplicates showing in the client
    console.log('Clearing global commands to prevent duplicates...');
    await rest.put(globalRoute, { body: [] });
    console.log('Global commands cleared');
  } else {
    console.log('Registering slash commands globally...');
    await rest.put(globalRoute, { body: commands });
    console.log('Global commands registered');
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

function getKeywordHint(mediaType, reason) {
  const mediaKey = mediaType === 'tv' ? 'tv' : 'movie';
  const keywords = KEYWORDS[mediaKey]?.[reason];
  if (!keywords) return null;
  return `Keyword ideas (${mediaKey.toUpperCase()} ${reason.toUpperCase()}): ${keywords}`;
}

function getKeywordsArray(mediaType, reason) {
  const mediaKey = mediaType === 'tv' ? 'tv' : 'movie';
  const keywordsStr = KEYWORDS[mediaKey]?.[reason];
  if (!keywordsStr) return [];
  return keywordsStr.split(',').map((s) => s.trim()).filter(Boolean);
}

function descriptionHasRequiredKeyword(description, mediaType, reason) {
  const list = getKeywordsArray(mediaType, reason);
  if (!list.length) return true; // if no configured keywords, don't block
  const d = (description || '').toLowerCase();
  return list.some((k) => d.includes(k.toLowerCase()));
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  // Handle /issue and /status in the same listener
  if (interaction.commandName === 'issue') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const query = interaction.options.getString('title', true);
    const mediaId = interaction.options.getInteger('mediaid');
    const mediaType = interaction.options.getString('mediatype', true);
    const reason = interaction.options.getString('reason', true);
    const issueTitle = interaction.options.getString('issuetitle', true);
    const issueDescription = interaction.options.getString('issuedescription', true);
    const seasonNumber = interaction.options.getInteger('season');
    const episodeNumber = interaction.options.getInteger('episode');

    const keywordHint = getKeywordHint(mediaType, reason);
    if (keywordHint) {
      await interaction.followUp({ content: keywordHint, flags: MessageFlags.Ephemeral });
    }

    // Enforce keyword presence only when enabled
    if (REMEDIARR_ENABLED) {
      const hasTag = descriptionHasRequiredKeyword(issueDescription, mediaType, reason);
      if (!hasTag) {
        const available = getKeywordsArray(mediaType, reason).join(', ');
        await interaction.editReply(
          `Issue not sent: your description must include at least one of these tags for ${mediaType.toUpperCase()} ${reason.toUpperCase()}: ${available}`,
        );
        return;
      }
    }

    if (mediaType === 'tv' && (!seasonNumber || !episodeNumber)) {
      await interaction.editReply(
        'Issue not sent: for TV requests you must include both season and episode numbers.',
      );
      return;
    }

    try {
      const resolvedMediaId = mediaId ?? (await resolveMediaId(query, mediaType));

      if (!resolvedMediaId) {
        throw new Error('No media found. Provide mediaid or a clearer query.');
      }

      const result = await createJellyseerrIssue(
        {
          mediaId: resolvedMediaId,
          mediaType,
          reason,
          title: issueTitle,
          description: issueDescription,
          seasonNumber,
          episodeNumber,
        },
        interaction.user,
      );
      await interaction.editReply(
        `Issue created in Jellyseerr (id: ${result.id ?? 'unknown'}). Thanks!`,
      );
    } catch (err) {
      console.error('Failed to create issue', err);
      await interaction.editReply(
        'Sorry, I could not create the issue. Please try again or contact an admin.',
      );
    }
    return;
  }

  if (interaction.commandName === 'status') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const query = interaction.options.getString('title', true);
    const mediaId = interaction.options.getInteger('mediaid');
    const mediaType = interaction.options.getString('mediatype', true);

    try {
      const resolvedMediaId = mediaId ?? (await resolveMediaId(query, mediaType));
      if (!resolvedMediaId) {
        await interaction.editReply('No media found. Provide a clearer title or a `mediaid`.');
        return;
      }

      const status = await fetchMediaStatus(resolvedMediaId, mediaType);
      await interaction.editReply(status);
    } catch (err) {
      console.error('Failed to fetch status', err);
      await interaction.editReply('Sorry, I could not retrieve status. Please try again later.');
    }
    return;
  }
});

// Fetch a concise status for given media id and type from Jellyseerr
async function fetchMediaStatus(mediaId, mediaType) {
  const base = JELLYSEERR_API_URL.replace(/\/$/, '');
  const headers = { 'X-Api-Key': JELLYSEERR_API_KEY, 'Content-Type': 'application/json' };

  // Try media details endpoint if available
  try {
    // Some Jellyseerr/Overseerr variants expose /api/v1/media/:type/:id
    const url = `${base}/api/v1/media/${mediaType}/${mediaId}`;
    const res = await axios.get(url, { headers });
    const data = res.data;

    return formatMediaStatusCard(data, { mediaId, mediaType });
  } catch (err) {
    // If not found, fallback to search results and try to surface availability
    try {
      const searchUrl = `${base}/api/v1/search?query=${encodeURIComponent(String(mediaId))}`;
      const searchRes = await axios.get(searchUrl, { headers });
      const results = Array.isArray(searchRes.data?.results) ? searchRes.data.results : [];
      const match = results.find((r) => (r.mediaInfo?.id ?? r.id) === mediaId) || results[0];
      if (!match) return `No detailed status available for id ${mediaId}`;

      return formatMediaStatusCard(match, { mediaId, mediaType });
    } catch (err2) {
      // give up and return a generic message
      return 'Could not retrieve status from Jellyseerr API.';
    }
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function makeProgressBar(percent, width = 22) {
  if (!Number.isFinite(percent)) return null;
  const p = clamp(percent, 0, 100);
  const filled = Math.round((p / 100) * width);
  const empty = width - filled;
  // Use simple characters that render consistently in Discord monospace
  return `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
}

// Attempt to extract download/progress status from a variety of possible Jellyseerr payload shapes.
function extractDownloadStatus(data) {
  const candidates = [
    data,
    data?.mediaInfo,
    data?.media,
    data?.media?.mediaInfo,
    data?.download,
    data?.mediaInfo?.download,
    data?.downloadStatus,
    data?.mediaInfo?.downloadStatus,
    data?.queue,
    data?.mediaInfo?.queue,
  ].filter(Boolean);

  // Direct percent fields we’ve seen in various integrations
  const percentFields = ['progress', 'progressPercent', 'percent', 'percentage', 'downloadPercent', 'completion'];
  const stateFields = ['state', 'status', 'downloadState', 'downloadStatus'];
  const etaFields = ['timeLeft', 'eta', 'etaSeconds', 'secondsLeft', 'timeRemaining', 'timeleft'];
  const titleFields = ['title', 'name', 'originalTitle'];

  let percent;
  let state;
  let etaSeconds;
  let resolution;

  for (const obj of candidates) {
    if (percent === undefined) {
      for (const f of percentFields) {
        const v = obj?.[f];
        if (typeof v === 'number' && Number.isFinite(v)) {
          percent = v <= 1 ? v * 100 : v;
          break;
        }
      }
    }

    if (!state) {
      for (const f of stateFields) {
        const v = obj?.[f];
        if (typeof v === 'string' && v.trim()) {
          state = v.trim();
          break;
        }
      }
    }

    if (etaSeconds === undefined) {
      for (const f of etaFields) {
        const v = obj?.[f];
        if (typeof v === 'number' && Number.isFinite(v)) {
          // heuristic: if it's super large it might be ms
          etaSeconds = v > 100000 ? Math.round(v / 1000) : v;
          break;
        }
        if (typeof v === 'string' && v.trim()) {
          // If it’s already a user-friendly string (e.g. "9 seconds") store as-is by using NaN sentinel
          // We’ll return it in `etaHuman` below.
          etaSeconds = NaN;
          break;
        }
      }
    }

    if (!resolution) {
      const v = obj?.quality || obj?.resolution;
      if (typeof v === 'string' && v.trim()) resolution = v.trim();
    }
  }

  // Sometimes percent is an int but 0..1 or 0..100; handled above.
  if (typeof percent === 'number' && Number.isFinite(percent)) {
    percent = clamp(percent, 0, 100);
  } else {
    percent = null;
  }

  // Try to find an ETA human string in common places
  let etaHuman = null;
  if (etaSeconds === NaN) {
    for (const obj of candidates) {
      const v = obj?.eta || obj?.timeLeft || obj?.timeRemaining || obj?.timeleft;
      if (typeof v === 'string' && v.trim()) {
        etaHuman = v.trim();
        break;
      }
    }
  } else {
    etaHuman = formatEta(etaSeconds);
  }

  return {
    percent,
    state: state || null,
    etaHuman,
    resolution: resolution || null,
  };
}

function getDisplayTitle(data) {
  return data?.title || data?.name || data?.mediaInfo?.title || data?.mediaInfo?.name || 'Unknown title';
}

function normalizeAvailable(data) {
  const v = data?.available ?? data?.mediaInfo?.available;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v > 0;
  return null;
}

function formatMediaStatusCard(data, { mediaId, mediaType }) {
  const title = getDisplayTitle(data);
  const available = normalizeAvailable(data);
  const download = extractDownloadStatus(data);

  // Prefer a friendly overall status if present
  const rawStatus = data?.status ?? data?.mediaInfo?.status ?? null;
  const stateLabel = download.state || rawStatus || (available === true ? 'Available' : available === false ? 'Not available' : 'Unknown');

  const lines = [];
  lines.push(title);

  if (download.percent !== null) {
    const bar = makeProgressBar(download.percent);
    lines.push(`${bar}  ${Math.round(download.percent)}%`);
  }

  // Second line: state and ETA like the screenshot
  const left = stateLabel;
  const right = download.etaHuman ? `Estimated in ${download.etaHuman}` : null;
  if (right) {
    // Keep spacing readable; monospace block makes alignment decent
    lines.push(`${left}    ${right}`);
  } else {
    lines.push(left);
  }

  // Extra metadata lines when present
  const meta = [];
  if (available !== null) meta.push(`Available: ${available ? 'Yes' : 'No'}`);
  if (download.resolution) meta.push(`Quality: ${download.resolution}`);
  meta.push(`ID: ${mediaType}/${mediaId}`);
  lines.push(meta.join(' • '));

  return `\`\`\`\n${lines.join('\n')}\n\`\`\``;
}

// Jellyseerr expects numeric issueType values (aligned with Overseerr enums)
// VIDEO=1, AUDIO=2, SUBTITLE=3, OTHER=4
const ISSUE_TYPE_MAP = {
  video: 1,
  audio: 2,
  subtitle: 3,
  other: 4,
};

// Keyword hints to guide users when describing issues
const KEYWORDS = {
  tv: {
    audio: 'no audio, no sound, missing audio, audio issue, wrong language',
    video: 'no video, video glitch, black screen, stutter, pixelation',
    subtitle: 'missing subs, no subtitles, bad subtitles, wrong subs',
    other: 'buffering, playback error, corrupt file',
  },
  movie: {
    audio: 'no audio, no sound, audio issue, wrong language',
    video: 'no video, video missing, bad video, black screen',
    subtitle: 'missing subs, no subtitles, bad subtitles',
    other: 'buffering, playback error, corrupt file',
    wrong: 'wrong movie, incorrect movie, not the right movie',
  },
};

async function resolveMediaId(query, mediaType) {
  if (!query) return null;

  const searchUrl = `${JELLYSEERR_API_URL.replace(/\/$/, '')}/api/v1/search?query=${encodeURIComponent(query)}`;

  const headers = {
    'X-Api-Key': JELLYSEERR_API_KEY,
    'Content-Type': 'application/json',
  };

  const response = await axios.get(searchUrl, { headers });
  const results = Array.isArray(response.data?.results) ? response.data.results : [];

  const match = results.find((item) => item.mediaType === mediaType) || results[0];
  if (!match) return null;

  // Jellyseerr exposes mediaInfo.id for existing items; fall back to id if not present.
  return match.mediaInfo?.id ?? match.id ?? null;
}

async function createJellyseerrIssue(issue, user) {
  // Adjust endpoint/payload if your Jellyseerr version differs.
  // Jellyseerr (like Overseerr) expects singular /issue for creation.
  const url = `${JELLYSEERR_API_URL.replace(/\/$/, '')}/api/v1/issue`;

  const payload = {
    mediaId: issue.mediaId,
    mediaType: issue.mediaType,
    issueType: ISSUE_TYPE_MAP[issue.reason] ?? 'OTHER',
    title: issue.title,
    message: `${issue.description}\n\nRequested by: ${user.tag} (${user.id})`,
  };

  if (issue.mediaType === 'tv' && issue.seasonNumber && issue.episodeNumber) {
    payload.seasonNumber = issue.seasonNumber;
    payload.episodeNumber = issue.episodeNumber;
  }

  const headers = {
    'X-Api-Key': JELLYSEERR_API_KEY,
    'Content-Type': 'application/json',
  };

  const response = await axios.post(url, payload, { headers });
  return response.data;
}

async function main() {
  await registerCommands();
  await client.login(DISCORD_TOKEN);
}

main().catch((err) => {
  console.error('Fatal error starting bot', err);
  process.exit(1);
});

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
  if (interaction.commandName !== 'issue') return;

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
});

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

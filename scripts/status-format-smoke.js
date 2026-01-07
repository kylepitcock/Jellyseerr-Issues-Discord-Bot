/* eslint-disable no-console */

// Smoke test for the /status progress-bar formatter.
// This script intentionally doesn't hit any real APIs.

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
  return `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
}

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

  const percentFields = ['progress', 'progressPercent', 'percent', 'percentage', 'downloadPercent', 'completion'];
  const stateFields = ['state', 'status', 'downloadState', 'downloadStatus'];
  const etaFields = ['timeLeft', 'eta', 'etaSeconds', 'secondsLeft', 'timeRemaining', 'timeleft'];

  let percent;
  let state;
  let etaSeconds;

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
          etaSeconds = v > 100000 ? Math.round(v / 1000) : v;
          break;
        }
      }
    }
  }

  if (typeof percent === 'number' && Number.isFinite(percent)) {
    percent = clamp(percent, 0, 100);
  } else {
    percent = null;
  }

  return {
    percent,
    state: state || null,
    etaHuman: formatEta(etaSeconds),
  };
}

function formatCard(sample, id = 'movie/123') {
  const title = sample?.title || sample?.name || sample?.mediaInfo?.title || 'Unknown title';
  const dl = extractDownloadStatus(sample);
  const stateLabel = dl.state || sample?.status || 'Unknown';

  const lines = [];
  lines.push(title);
  if (dl.percent !== null) {
    lines.push(`${makeProgressBar(dl.percent)}  ${Math.round(dl.percent)}%`);
  }
  if (dl.etaHuman) lines.push(`${stateLabel}    Estimated in ${dl.etaHuman}`);
  else lines.push(stateLabel);
  lines.push(`ID: ${id}`);
  return `\n\n---\n\n${lines.join('\n')}`;
}

const samples = [
  {
    // shape 1
    title: 'Example Movie',
    download: { progress: 28, state: 'Downloading', etaSeconds: 9 },
  },
  {
    // shape 2 (nested)
    name: 'Example TV',
    mediaInfo: { status: 'Downloading', progressPercent: 0.73, secondsLeft: 120 },
  },
  {
    // shape 4 (Arr-like): progress may be absent; compute from size/sizeleft
    title: 'Arr Movie',
    download: { state: 'Downloading' },
    queue: {
      status: 'downloading',
      size: 1000,
      sizeleft: 250,
      estimatedCompletionTime: new Date(Date.now() + 45_000).toISOString(),
    },
  },
  {
    // shape 3 (no progress)
    title: 'Already Available',
    available: true,
    status: 'Available',
  },
];

for (const s of samples) {
  console.log(formatCard(s));
}

const PHASES = [
  {
    name: 'ФАЗА 1',
    startsAt: 0,
    params: {
      scrollMultiplier: 1,
      pieceWeights: { pawn: 5, knight: 3, bishop: 1, rook: 1, queen: 0 },
      lightCell: '#eeeed2',
      darkCell: '#769656',
    },
  },
  {
    name: 'ФАЗА 2',
    startsAt: 60,
    params: {
      scrollMultiplier: 1.5,
      pieceWeights: { pawn: 2, knight: 2, bishop: 3, rook: 3, queen: 1 },
      lightCell: '#f3d6d6',
      darkCell: '#a8343a',
    },
  },
];

const gameClock = (() => {
  const MAX_FRAME_DT = 0.1;
  const BANNER_MS = 1500;
  const SHOW_DEBUG = true;

  let time = 0;
  let paused = false;
  let over = false;
  let phaseIndex = 0;
  let startedAt = performance.now();
  let bannerTimer = null;

  function overlay(id, css) {
    let el = document.getElementById(id);
    if (!el && document.body) {
      el = document.createElement('div');
      el.id = id;
      el.style.cssText = css;
      document.body.appendChild(el);
    }
    return el;
  }

  function showBanner(text) {
    const el = overlay(
      'phase-banner',
      'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
        'font:900 56px sans-serif;color:#fff;background:rgba(150,20,30,.55);' +
        'pointer-events:none;z-index:1000',
    );
    if (!el) return;
    el.textContent = text;
    el.style.display = 'flex';
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(hideBanner, BANNER_MS);
  }

  function hideBanner() {
    clearTimeout(bannerTimer);
    const el = document.getElementById('phase-banner');
    if (el) el.style.display = 'none';
  }

  function updateDebug() {
    if (!SHOW_DEBUG) return;
    const el = overlay(
      'clock-debug',
      'position:fixed;left:8px;top:8px;font:12px monospace;color:#fff;' +
        'background:rgba(0,0,0,.6);padding:4px 6px;z-index:1001;pointer-events:none',
    );
    if (!el) return;
    const browser = (performance.now() - startedAt) / 1000;
    el.textContent =
      `игра ${time.toFixed(1)} с · браузер ${browser.toFixed(1)} с · ${PHASES[phaseIndex].name}` +
      (paused ? ' · ПАУЗА' : '') +
      (over ? ' · КОНЕЦ' : '');
  }

  function start() {
    time = 0;
    paused = false;
    over = false;
    phaseIndex = 0;
    startedAt = performance.now();
    hideBanner();
    updateDebug();
  }

  function end() {
    over = true;
    updateDebug();
  }

  function setPaused(value) {
    if (!over) paused = value;
    updateDebug();
  }

  function togglePause() {
    setPaused(!paused);
  }

  function tick(browserDt) {
    if (paused || over) {
      updateDebug();
      return 0;
    }
    const dt = Math.min(Math.max(browserDt, 0), MAX_FRAME_DT);
    time += dt;
    while (PHASES[phaseIndex + 1] && time >= PHASES[phaseIndex + 1].startsAt) {
      phaseIndex += 1;
      showBanner(PHASES[phaseIndex].name);
    }
    updateDebug();
    return dt;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPaused(true);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'з' || e.key === 'Escape') togglePause();
  });

  return {
    start,
    end,
    setPaused,
    togglePause,
    tick,
    get time() {
      return time;
    },
    get paused() {
      return paused;
    },
    get over() {
      return over;
    },
    get phase() {
      return PHASES[phaseIndex];
    },
    get params() {
      return PHASES[phaseIndex].params;
    },
  };
})();

function pickWeighted(weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [type, w] of entries) {
    r -= w;
    if (r < 0) return type;
  }
  return entries[entries.length - 1][0];
}
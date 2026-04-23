// highScores.js - UPDATED 4/23/26 @ 3:00PM

// AUTO-DETECTS ENVIRONMENT:
//   TAURI DESKTOP  → LOCALSTORAGE (PERSISTENT, PRIVATE)
//   BROWSER        → VERCEL API → NEON POSTGRESQL (GLOBAL LEADERBOARD)

// ── CONFIG ────────────────────────────────────────────────────────────────────
const API_BASE     = 'https://mkb0020.vercel.app'; 
const LOCAL_KEY    = 'wormhole_high_scores';
const MAX_LOCAL    = 10;   // HOW MANY LOCAL SCORES TO KEEP
const IS_TAURI     = typeof window !== 'undefined' && !!window.__TAURI__;

// ── HELPERS ───────────────────────────────────────────────────────────────────
function _sanitizeName(raw) {
  return String(raw ?? '')
    .trim()
    .slice(0, 20)
    .replace(/[^a-zA-Z0-9 _\-]/g, '') || 'PILOT';
}

// ── LOCAL STORAGE (TAURI DESKTOP) ─────────────────────────────────────────────
const Local = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    } catch {
      return [];
    }
  },

  /** @returns {Array} FULL SORTED LIST AFTER INSERT */
  save(name, score, waveReached, mode = 'gameplay') {
    const scores = this.get();
    scores.push({
      name:  _sanitizeName(name),
      score: Math.floor(score),
      wave:  waveReached ?? null,
      mode,
      date:  new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
    });
    scores.sort((a, b) => b.score - a.score);
    scores.splice(MAX_LOCAL); // KEEP ONLY TOP N
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(scores));
    } catch (e) {
      console.warn('[HighScores] localStorage write failed:', e);
    }
    return scores;
  },

/** RETURNS THE PLAYER'S RANK (1-BASED) FOR A GIVEN SCORE IN A GIVEN MODE */
  getRank(score, mode = 'gameplay') {
    const scores = this.get().filter(s => s.mode === mode);
    return scores.filter(s => s.score > score).length + 1;
  },

  getForMode(mode = 'gameplay') {
    return this.get().filter(s => s.mode === mode);
  },

  isHighScore(score, mode = 'gameplay') {
    const scores = this.getForMode(mode);
    return scores.length < MAX_LOCAL || score > (scores[scores.length - 1]?.score ?? 0);
  },
};

// ── REMOTE API (BROWSER / ITCH.IO) ────────────────────────────────────────────
const Remote = {
  async getLeaderboard(mode = 'gameplay', limit = 10) {
    try {
      const r = await fetch(`${API_BASE}/api/leaderboard?mode=${mode}&limit=${limit}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      return data.scores ?? [];
    } catch (e) {
      console.warn('[HighScores] Leaderboard fetch failed:', e);
      return null; // NULL = SHOW "OFFLINE" STATE IN UI
    }
  },

  /**
   * @returns {{ ok, rank, error } | null}
   *   RANK = GLOBAL RANK OF THIS SCORE (1 = TOP)
   */
  async submit(name, score, waveReached, mode = 'gameplay') {
    try {
      const r = await fetch(`${API_BASE}/api/scores`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        _sanitizeName(name),
          score:       Math.floor(score),
          waveReached: waveReached ?? null,
          mode,
        }),
      });
      return await r.json();
    } catch (e) {
      console.warn('[HighScores] Score submit failed:', e);
      return { ok: false, error: 'Network error' };
    }
  },
};

// ── PUBLIC API ────────────────────────────────────────────────────────────────
export const HighScores = {
  isDesktop: IS_TAURI,

  /**
   * TRUE IF THIS SCORE QUALIFIES AS A PERSONAL (DESKTOP) OR WOULD-ENTER REMOTE LEADERBOARD.
   * CALL THIS IMMEDIATELY AFTER GAME OVER TO DECIDE WHETHER TO SHOW NAME-ENTRY UI.
   */
  isHighScore(score, mode = 'gameplay') {
    if (IS_TAURI) return Local.isHighScore(score, mode);
    return true; // FOR BROWSER, ALWAYS ASK — LET SERVER DECIDE RANK
  },

  /**
   * SAVE + RETURN RANK.
   * DESKTOP: SYNCHRONOUS, RETURNS RANK IMMEDIATELY.
   * BROWSER: ASYNC FETCH, RETURNS PROMISE<{ RANK, OK }>.
   */
  async save(name, score, waveReached, mode = 'gameplay') {
    if (IS_TAURI) {
      Local.save(name, score, waveReached, mode);
      return { ok: true, rank: Local.getRank(score, mode) };
    }
    return Remote.submit(name, score, waveReached, mode);
  },

  /**
   * GET SCORES FOR DISPLAY.
   * DESKTOP: RETURNS LOCAL ARRAY SYNCHRONOUSLY (WRAPPED IN PROMISE FOR UNIFORM API).
   * BROWSER: FETCHES FROM NEON, RETURNS NULL ON NETWORK FAILURE.
   */
  async getLeaderboard(mode = 'gameplay', limit = 10) {
    if (IS_TAURI) {
      return Local.getForMode(mode).slice(0, limit);
    }
    return Remote.getLeaderboard(mode, limit);
  },

  /** DESKTOP ONLY — CLEAR ALL LOCAL SCORES (FOR TESTING / RESET) */
  clearLocal() {
    localStorage.removeItem(LOCAL_KEY);
  },
};
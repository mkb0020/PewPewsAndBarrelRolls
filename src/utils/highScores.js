// highScores.js - UPDATED 4/23/26 @ 3:00AM

// AUTO-DETECTS ENVIRONMENT:
//   Tauri desktop  → localStorage (persistent, private)
//   Browser        → Vercel API → Neon PostgreSQL (global leaderboard)

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

  /** @returns {Array} full sorted list after insert */
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

  /** Returns the player's rank (1-based) for a given score in a given mode */
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
   *   rank = global rank of this score (1 = top)
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
   * Desktop: synchronous, returns rank immediately.
   * Browser: async fetch, returns Promise<{ rank, ok }>.
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
   * Desktop: returns local array synchronously (wrapped in Promise for uniform API).
   * Browser: fetches from Neon, returns null on network failure.
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
// highScoreUI.js - UPDATED 4/23/26 @ 3:30PM
import { HighScores } from './highScores.js';

function _fmt(n) {
  return String(Math.floor(n)).padStart(6, '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export class HighScoreUI {
  constructor() {
    this._entryEl    = document.getElementById('score-entry-overlay');
    this._valueEl    = document.getElementById('score-entry-value');
    this._inputEl    = document.getElementById('score-entry-input');
    this._submitBtn  = document.getElementById('score-entry-submit');
    this._lbEl       = document.getElementById('leaderboard-overlay');
    this._lbBodyEl   = document.getElementById('leaderboard-body');
    this._lbTitleEl  = document.getElementById('leaderboard-title');
    this._closeBtn   = document.getElementById('leaderboard-close');

    this._currentMode    = 'gameplay';
    this._currentScore   = 0;
    this._currentWave    = null;
    this._onEntryDone    = null;   // CALLBACK AFTER NAME SUBMITTED
    this._highlightName  = null;   // NAME TO GOLD-HIGHLIGHT IN LEADERBOARD

    this._wireListeners();
    console.log('✔ HighScoreUI initialized');
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────────
  /**
   * SHOW NAME-ENTRY PROMPT.
   * CALL FROM MAIN.JS AFTER GAME OVER / BOSS DEFEAT.

   * @param {number}   score
   * @param {number}   waveReached  0-BASED WAVE INDEX, OR NULL FOR BOSS/SURVIVAL
   * @param {string}   mode         'gameplay' | 'survival' | 'bossBattle'
   * @param {Function} [onDone]     CALLED AFTER SUBMIT (NO ARGS)

   */
  showEntry(score, waveReached, mode = 'gameplay', onDone = null) {
    if (!this._entryEl) return;
    this._currentScore = score;
    this._currentWave  = waveReached;
    this._currentMode  = mode;
    this._onEntryDone  = onDone;

    if (this._valueEl) this._valueEl.textContent = _fmt(score);
    if (this._inputEl) { this._inputEl.value = ''; }

    this._entryEl.classList.add('active');
    setTimeout(() => this._inputEl?.focus(), 80);
  }

  hideEntry() {
    this._entryEl?.classList.remove('active');
    this._inputEl?.blur();
  }

  /** SHOW LEADERBOARD PANEL */
  async showLeaderboard(mode = 'gameplay', highlightName = null) {
    console.log('showLeaderboard activated');
    if (!this._lbEl) return;
    this._highlightName = highlightName;
    this._currentMode   = mode;
    this._lbEl.classList.add('active');

    this._lbEl.querySelectorAll('.lb-tab').forEach(tab => { // SYNC TAB UI
      tab.classList.toggle('active', tab.dataset.mode === mode);
    });

    await this._loadAndRender(mode);
  }

  hideLeaderboard() {
    this._lbEl?.classList.remove('active');
  }

  // ── PRIVATE ────────────────────────────────────────────────────────────────
  _wireListeners() {
    this._submitBtn?.addEventListener('click', () => this._handleSubmit()); // SUBMIT BUTTON

    this._inputEl?.addEventListener('keydown', (e) => { // ENTER KEY IN INPUT
      if (e.key === 'Enter') { e.preventDefault(); this._handleSubmit(); }
    });

    this._closeBtn?.addEventListener('click', () => this.hideLeaderboard()); // CLOSE LEADERBOARD
    this._lbEl?.addEventListener('click', (e) => {
      if (e.target === this._lbEl) this.hideLeaderboard();
    });

    this._lbEl?.querySelectorAll('.lb-tab').forEach(tab => { // MODE TABS
      tab.addEventListener('click', () => {
        this._lbEl.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._loadAndRender(tab.dataset.mode);
      });
    });
  }

  async _handleSubmit() {
    const name = (this._inputEl?.value || '').trim() || 'PILOT';
    this.hideEntry();

    const result = await HighScores.save(
      name,
      this._currentScore,
      this._currentWave,
      this._currentMode
    );

    const rank = result?.rank ?? null;
    this._highlightName = name.toUpperCase().replace(/[^A-Z0-9 _\-]/g, '');

    await this.showLeaderboard(this._currentMode, this._highlightName); // SHOW LEADERBOARD WITH THIS NAME HIGHLIGHTED

    this._onEntryDone?.();
  }

  async _loadAndRender(mode) {
    if (!this._lbBodyEl) return;
    this._lbBodyEl.innerHTML = '<div class="lb-loading">LOADING…</div>';

    const scores = await HighScores.getLeaderboard(mode, 10);

    if (!scores) {
      this._lbBodyEl.innerHTML = '<div class="lb-empty">COULD NOT REACH LEADERBOARD.<br>CHECK YOUR CONNECTION.</div>';
      return;
    }
    if (scores.length === 0) {
      this._lbBodyEl.innerHTML = '<div class="lb-empty">NO SCORES YET.<br>BE THE FIRST!</div>';
      return;
    }

    const rankClasses = ['lb-gold', 'lb-silver', 'lb-bronze'];
    const highlight   = this._highlightName?.toUpperCase();

    this._lbBodyEl.innerHTML = scores.map((s, i) => {
      const rankCls  = rankClasses[i] ?? '';
      const nameCls  = (s.name?.toUpperCase() === highlight) ? 'lb-highlight' : '';
      const dateStr  = s.date ?? s.created_at?.slice(0, 10) ?? '';
      return `
        <div class="lb-row ${nameCls}">
          <span class="lb-rank ${rankCls}">${i + 1}</span>
          <span class="lb-name">${_escHtml(s.name ?? 'PILOT')}</span>
          <span class="lb-score">${_fmt(s.score ?? 0)}</span>
          <span class="lb-date">${_escHtml(dateStr)}</span>
        </div>`;
    }).join('');
  }
}

function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
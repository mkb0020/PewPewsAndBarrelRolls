// menu.js
const DEV_MODE = true; 

export class Menu {
  constructor() {
    this._overlay = document.getElementById('menu-overlay');
    this._resolve = null;
    this._tunnel  = null;
    this._rafId   = null;
    this._onKey   = null;

    if (DEV_MODE) this._overlay?.classList.add('dev-mode');
  }

  /**
   * SHOW MENU AND TUNNEL BEHIND IT
   * @param {Tunnel} tunnel 
   * @returns {Promise<{ mode: string, enemyCount: number }>}
   */
  show(tunnel) {
    this._tunnel = tunnel;

    if (!this._overlay) {
      console.error('[Menu] #menu-overlay not found in DOM');
      return Promise.resolve({ mode: 'bossBattle', enemyCount: 5 });
    }
    if (DEV_MODE) {
      const slider = this._overlay.querySelector('#dev-enemy-count');
      const label  = this._overlay.querySelector('#dev-enemy-value');
      slider?.addEventListener('input', () => {
        if (label) label.textContent = slider.value;
      });
    }

    this._overlay.querySelectorAll('.menu-btn[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => this._select(btn.dataset.mode));
    });

    this._onKey = (e) => {
      if (e.code === 'Digit1') this._select('gameplay');
      if (e.code === 'Digit2') this._select('bossBattle');
    };
    window.addEventListener('keydown', this._onKey);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => this._overlay.classList.add('visible'));
    });

    this._animateTunnel();

    return new Promise(resolve => { this._resolve = resolve; });
  }


  _animateTunnel() {
    const tick = () => {
      this._rafId = requestAnimationFrame(tick);
      if (this._tunnel) {
        this._tunnel.update(0.016 * 0.35); 
        this._tunnel.render();
      }
    };
    this._rafId = requestAnimationFrame(tick);
  }

  _select(mode) {
    const slider     = this._overlay?.querySelector('#dev-enemy-count');
    const enemyCount = DEV_MODE ? parseInt(slider?.value ?? '5', 10) : 5;

    this._overlay?.classList.remove('visible');
    window.removeEventListener('keydown', this._onKey);
    cancelAnimationFrame(this._rafId);

    setTimeout(() => {
      this._overlay?.classList.add('hidden'); 
      this._resolve({ mode, enemyCount });
    }, 650); 
  }

  hide() {
    this._select('gameplay'); 
  }
}
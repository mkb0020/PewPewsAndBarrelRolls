// ui.js
const ICON_SIZE    = 44;  
const ICON_MARGIN  = 14;   
const ICON_PADDING = 8;   
const ICON_FRAMES  = 4;

export class GameUI {
  constructor() {
    this.sprite      = new Image();
    this.spriteLoaded = false;
    this.frameWidth  = 0;

    this._buttons = {
      sound: { x: 0, y: 0, w: ICON_SIZE, h: ICON_SIZE },
      pause: { x: 0, y: 0, w: ICON_SIZE, h: ICON_SIZE },
    };

    this._layout();
    this._loadSprite();

    console.log('✔ GameUI initialized');
  }

  _loadSprite() {
    this.sprite.src = 'assets/images/icons.png';
    this.sprite.onload = () => {
      this.spriteLoaded = true;
      this.frameWidth = this.sprite.width / ICON_FRAMES;
      console.log('✔ UI icon sprite loaded');
    };
    this.sprite.onerror = () => console.warn('⚠ UI icon sprite not found');
  }

  _layout() {
    const right = window.innerWidth  - ICON_MARGIN;
    const top   = ICON_MARGIN;

    this._buttons.pause.x = right - ICON_SIZE;
    this._buttons.pause.y = top;

    this._buttons.sound.x = right - ICON_SIZE * 2 - ICON_MARGIN;
    this._buttons.sound.y = top;
  }

  handleResize() {
    this._layout();
  }


  hitTest(clientX, clientY) {
    for (const [name, btn] of Object.entries(this._buttons)) {
      if (
        clientX >= btn.x - ICON_PADDING &&
        clientX <= btn.x + btn.w + ICON_PADDING &&
        clientY >= btn.y - ICON_PADDING &&
        clientY <= btn.y + btn.h + ICON_PADDING
      ) {
        return name;
      }
    }
    return null;
  }

  //  DRAW
  draw(ctx, isMuted, isPaused) {
    if (!this.spriteLoaded) return;

    const soundFrame = isMuted  ? 1 : 0;   
    const pauseFrame = isPaused ? 3 : 2;  

    this._drawIcon(ctx, soundFrame, this._buttons.sound, isMuted  ? 0.5 : 0.75);
    this._drawIcon(ctx, pauseFrame, this._buttons.pause, isPaused ? 0.9 : 0.75);

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000';
    const allX = this._buttons.sound.x - ICON_PADDING;
    const allY = this._buttons.sound.y - ICON_PADDING;
    const allW = (ICON_SIZE * 2 + ICON_MARGIN) + ICON_PADDING * 2;
    const allH = ICON_SIZE + ICON_PADDING * 2;
    const r    = (allH / 2);
    this._roundRect(ctx, allX, allY, allW, allH, r);
    ctx.fill();
    ctx.restore();

    this._drawIcon(ctx, soundFrame, this._buttons.sound, isMuted  ? 0.5 : 0.82);
    this._drawIcon(ctx, pauseFrame, this._buttons.pause, isPaused ? 0.95 : 0.82);

    // PAUSED OVERLAY
    if (isPaused) {
      this._drawPauseOverlay(ctx);
    }
  }

  _drawIcon(ctx, frame, btn, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(
      this.sprite,
      frame * this.frameWidth, 0,
      this.frameWidth, this.sprite.height,
      btn.x, btn.y, btn.w, btn.h
    );
    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _drawPauseOverlay(ctx) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = 'bold 52px system-ui, sans-serif';
    ctx.letterSpacing = '0.15em';

    ctx.globalAlpha = 0.35;
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur  = 40;
    ctx.fillStyle   = '#00ffff';
    ctx.fillText('PAUSED', cx, cy);

    ctx.globalAlpha = 0.92;
    ctx.shadowBlur  = 12;
    ctx.fillText('PAUSED', cx, cy);

    ctx.font        = '16px system-ui, sans-serif';
    ctx.globalAlpha = 0.5;
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#aaeeff';
    ctx.fillText('press  P  to resume', cx, cy + 48);

    ctx.restore();
  }
}
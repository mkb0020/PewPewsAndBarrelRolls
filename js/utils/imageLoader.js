// Updated 3/12/26 @ 11:30AM
// imageLoader.js

const BASE_PATH = './images/';
const MANIFEST = {

  ship:         { path: 'spaceship.png' },
  worm:         { path: 'worm.png' }, // NOW 14 FRAMES
  babyWorm:     { path: 'babyWorm.png' },
  glork:        { path: 'glork.png' },       // 5 FRAMES
  glipGlop:     { path: 'glipGlop.png' },    // 5 FRAMES

  // ── QUADROPUS — COMBINED SHEET FOR ALL 3 OCTOPUS-TYPE ENEMIES ──
  // FRAME LAYOUT: 0=Phil body  1=ZipZap body  2=FlimFlam body
  //               3=Phil seg   4=ZipZap seg   5=FlimFlam seg
  quadropus:    { path: 'quadropus.png' },

  boom:         { path: 'boom.png' },        // 6 FRAMES
  zap:          { path: 'zap.png',     lazy: true },   // 6 FRAMES
  bam:          { path: 'bam.png' },         // 8 FRAMES
  spiral:       { path: 'spiral.png',  lazy: true },   // 13 FRAMES
  slime:            { path: 'slime.png',            lazy: true },
  slimeProjectiles: { path: 'slimeProjectiles.png', lazy: true }, // 4 FRAMES
  slimeDrip:        { path: 'slimeDrip.png',        lazy: true }, // 10 FRAMES (5R + 5L) — GLORK WING DRIP
  screenSlimeDrip:  { path: 'screenSlimeDrip.png',  lazy: true }, // 9 FRAMES — FULL-SCREEN SLIME OVERLAY

  prismEye:     { path: 'prismEye.png',     lazy: true },  // 3 FRAMES: BASE / PUPIL / EYELID
  prePrismEyes: { path: 'prePrismEyes.png', lazy: true },  // 8 FRAMES: telegraph blink animation

  waveWorms:    { path: 'waveWorms.png', lazy: true },  // 10 FRAMES
  gooSizzle:    { path: 'gooSizzle.png', lazy: true },  // 9 FRAMES

  kabam:      { path: 'kabam.png'      },               // 5 FRAMES — SHIP EXPLOSION
  shipPieces: { path: 'shipPieces.png' },               // 3 FRAMES — L WING / BODY / R WING
  smoke:      { path: 'smoke.png'      },               // 9 FRAMES — SMOKE BLOBS
};


export const ENEMY_SPRITE = {
  BASIC:    'glipGlop',
  FAST:     'quadropus',   // ZIP ZAP — OCTOPUS (BODY FRAME 1, SEG FRAME 4)
  TANK:     'glork',
  ZIGZAG:   'quadropus',   // PHIL    — OCTOPUS (BODY FRAME 0, SEG FRAME 3)
  FLIMFLAM: 'quadropus',   // FLIM FLAM — OCTOPUS (BODY FRAME 2, SEG FRAME 5)
};

// ======================= INTERNAL REGISTRY =======================
const _registry = {}; 
const _pending  = {}; 

function _loadOne(key) {
  if (_registry[key]) return Promise.resolve(_registry[key]);
  if (_pending[key])  return _pending[key];

  const entry = MANIFEST[key];
  if (!entry) {
    console.error(`[ImageLoader] Unknown sprite key: "${key}"`);
    return Promise.reject(new Error(`Unknown sprite: ${key}`));
  }

  _pending[key] = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      _registry[key] = img;
      delete _pending[key];
      resolve(img);
    };
    img.onerror = () => {
      delete _pending[key];
      console.warn(`[ImageLoader] Failed to load sprite: ${entry.path}`);
      reject(new Error(`Failed to load: ${entry.path}`));
    };
    img.src = BASE_PATH + entry.path;
  });

  return _pending[key];
}

// ======================= PUBLIC API =======================
const ImageLoader = {
  preloadCritical() {
    const criticalKeys = Object.entries(MANIFEST)
      .filter(([, entry]) => !entry.lazy)
      .map(([key]) => key);

    const loads = criticalKeys.map(key =>
      _loadOne(key).catch(err => {
        console.warn(`[ImageLoader] Critical sprite failed (will use fallback): ${err.message}`);
        return null; 
      })
    );

    return Promise.all(loads).then(() => {
      console.log(`[ImageLoader] Critical sprites ready (${criticalKeys.length} loaded)`);
    });
  },

  /**
   * LAZY LOAD
   * @param {string} key
   * @returns {Promise<HTMLImageElement>}
   */
  load(key) {
    return _loadOne(key);
  },

  /**
      SYNCHRONOUSLY GET A LOADED IMAGE
   * @param {string} key
   * @returns {HTMLImageElement|null}
   */
  get(key) {
    const img = _registry[key];
    if (!img) {
      console.warn(`[ImageLoader] .get("${key}") called before sprite was loaded — returning null`);
      return null;
    }
    return img;
  },

  /**
   * CHECK IF SPRITE IS LOADED
   * @param {string} key
   * @returns {boolean}
   */
  isLoaded(key) {
    return !!_registry[key];
  },

};

export { ImageLoader };
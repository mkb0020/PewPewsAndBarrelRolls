// imageLoader.js

const BASE_PATH = './images/';
const MANIFEST = {

  ship:         { path: 'spaceship.png' },
  worm:         { path: 'worm.png' },
  babyWorm:     { path: 'babyWorm.png' },
  glork:        { path: 'glork.png' },       // 5 FRAMES
  glipGlop:     { path: 'glipGlop.png' },    // 5 FRAMES
  zipZap:       { path: 'zipZap.png' },      // 6 FRAMES
  glitch:       { path: 'glitch.png' },      // 5 FRAMES  (unused)
  phil:         { path: 'phil.png' },        // 8 FRAMES
  flimFlam:     { path: 'flimFlam.png' },   // 7 FRAMES: 0-2 wings, 3-6 body
  boom:         { path: 'boom.png' },        // 6 FRAMES 
  zap:          { path: 'zap.png',     lazy: true },   // 8 FRAMES
  bam:          { path: 'bam.png' },         // 8 FRAMES
  spiral:       { path: 'spiral.png',  lazy: true },   // 5 FRAMES
  slime:            { path: 'slime.png',            lazy: true },
  slimeProjectiles: { path: 'slimeProjectiles.png', lazy: true }, // 4 FRAMES
  slimeDrip:        { path: 'slimeDrip.png',        lazy: true }, // 10 FRAMES (5R + 5L)

  monster:      { path: 'monster.png', lazy: true },   // NO LONGER IN USE
};


export const ENEMY_SPRITE = {
  BASIC:   'glipGlop',
  FAST:    'zipZap',
  TANK:    'glork',
  ZIGZAG:  'phil',
  FLIMFLAM:'flimFlam',
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
   * CHECK IF SPRIE IS LOADED
   * @param {string} key
   * @returns {boolean}
   */
  isLoaded(key) {
    return !!_registry[key];
  },

};

export { ImageLoader };
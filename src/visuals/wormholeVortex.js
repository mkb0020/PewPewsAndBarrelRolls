// Updated 3/29/26 @ 2am
// wormholeVortex.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import * as THREE from 'three';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const VORTEX = {
  DURATION:         12,   // TOTAL SECONDS
  FADE_IN:          1,    // SECONDS TO FULL OPACITY
  FADE_OUT_START:   7,    // WHEN FADE-TO-BLACK BEGINS

  TUBE_RADIUS:      3.4,  // INNER RADIUS OF ESOPHAGUS
  TUBE_PATH_SEGS:   180,  // SMOOTHNESS OF TUBE PATH (BUMPED — SHADER DEFORMS VERTS)
  TUBE_RADIAL_SEGS: 48,   // CROSS-SECTION POLYGON COUNT (HIGHER FOR SHADER DETAIL)
  TUBE_LENGTH:      130,  // Z-DEPTH OF TUBE

  CAM_BASE_SPEED:   9,    // INITIAL CAMERA FLIGHT SPEED (Z-UNITS/S)
  CAM_ACCEL:        22,   // EXTRA SPEED ADDED BY END (ACCELERATES INTO THE DARK)
  WOBBLE_X:         0.55, // CAMERA SIDE WOBBLE AMPLITUDE
  WOBBLE_Y:         0.38,

  TUBE_SPIN_SPEED:  0.28, // RAD/S — SLOW ROTATION OF TUBE AROUND Z ADDS DISORIENTATION

  FLESH_PROGRESS_DURATION: 4.0, // SECONDS FOR FLESH SHADER TO FULLY MATERIALIZE

  // SHADER TUNING
  THROB_SPEED:      2.8,
  PERI_STRENGTH:    1.0,
  RIPPLE:           0.6,
};

// ===================== SHADER SOURCES =====================

const _vertexShader = /* glsl */`
  uniform float time;
  uniform float progress;
  uniform float throbSpeed;
  uniform float periStrength;
  uniform float ripple;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPos;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    vUv    = uv;
    vNormal = normal;
    vPos   = position;

    vec3 pos = position;

    // PERISTALSIS — RHYTHMIC RADIAL SQUEEZE WAVES
    float wave = sin(time * 2.8 + vUv.x * 14.0) * 0.12 * periStrength * progress;
    pos += normal * wave;

    // VEIN / TISSUE DISPLACEMENT
    float veinNoise = noise(vUv * vec2(18.0, 35.0) + time * throbSpeed * 0.8);
    float veins = sin(vUv.x * 42.0) * sin(vUv.y * 28.0 + time * throbSpeed) * 0.18 * progress;
    veins += veinNoise * 0.09 * progress;
    pos += normal * veins;

    // HIGH-FREQ RIPPLE DETAIL
    float ripplePulse = sin(time * 7.0 + vUv.x * 60.0) * ripple * progress * 0.07;
    pos += normal * ripplePulse;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const _fragmentShader = /* glsl */`
  uniform float time;
  uniform float progress;
  uniform float opacity;
  varying vec2 vUv;
  varying vec3 vNormal;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    // DEEP PURPLISH-BLACK → DARK BURGUNDY AS PROGRESS RAMPS
    vec3 startColor = vec3(0.05, 0.008, 0.09);
    vec3 endColor   = vec3(0.12, 0.025, 0.012);
    vec3 base = mix(startColor, endColor, progress);

    // ORGANIC TISSUE NOISE
    float tissue = noise(vUv * 28.0) * 0.35 + noise(vUv * 9.0) * 0.18;
    base = base * (0.72 + tissue * 0.22);

    // VEIN PATTERN
    float veinPattern = sin(vUv.x * 38.0) * sin(vUv.y * 31.0 + time * 2.2);
    veinPattern = pow(abs(veinPattern), 2.8) * progress;
    vec3 veinColor = vec3(0.28, 0.02, 0.04);
    vec3 color = mix(base, veinColor, veinPattern * 0.6);

    // MICRO-DETAIL SPARK
    float micro = noise(vUv * 85.0 + time * 1.5) * progress;
    color = mix(color, vec3(0.55, 0.16, 0.11), micro * 0.12);

    // SPECULAR HIGHLIGHT
    vec3 lightDir = normalize(vec3(0.5, 0.5, 0.4));
    float specular = pow(max(0.0, dot(vNormal, lightDir)), 28.0);
    color += vec3(0.35, 0.20, 0.18) * specular * 0.8 * progress;

    // FRESNEL RIM GLOW
    float fresnel = 1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0));
    color += vec3(0.45, 0.09, 0.14) * fresnel * 0.28 * progress;

    color = clamp(color, 0.0, 0.85);
    gl_FragColor = vec4(color, opacity);
  }
`;

// ===================== CLASS =====================

export class WormholeVortex {
  constructor() {
    this._canvas     = null;
    this._renderer   = null;
    this._scene      = null;
    this._camera     = null;
    this._tubeMesh   = null;
    this._glowTube   = null;
    this._pulseLight = null;
    this._uniforms   = null;

    this._active  = false;
    this._time    = 0;
    this._alpha   = 0;

    this.onComplete = null;
  }

  start() {
    if (this._active) return;
    this._active = true;
    this._time   = 0;
    this._alpha  = 0;

    this._buildDOM();
    this._setupRenderer();
    this._buildScene();
  }

  /** CALL EVERY FRAME FROM THE GAME LOOP WHILE ACTIVE */
  update(dt) {
    if (!this._active) return;
    this._time += dt;

    this._updateAlpha();
    this._updateCamera(dt);
    this._updateShaderUniforms();

    if (this._tubeMesh) this._tubeMesh.rotation.z += VORTEX.TUBE_SPIN_SPEED * dt;

    this._renderer?.render(this._scene, this._camera);

    if (this._time >= VORTEX.DURATION) {
      this._cleanup();
      this.onComplete?.();
    }
  }

  get isActive() { return this._active; }

  // ===================== PRIVATE — FRAME UPDATE =====================

  _updateAlpha() {
    const t   = this._time;
    const dur = VORTEX.DURATION;

    if (t < VORTEX.FADE_IN) {
      this._alpha = t / VORTEX.FADE_IN;
    } else if (t > VORTEX.FADE_OUT_START) {
      this._alpha = 1 - (t - VORTEX.FADE_OUT_START) / (dur - VORTEX.FADE_OUT_START);
    } else {
      this._alpha = 1.0;
    }
    this._alpha = Math.max(0, Math.min(1, this._alpha));
    if (this._canvas) this._canvas.style.opacity = this._alpha;
  }

  _updateCamera(dt) {
    const speedT = Math.min(1, this._time / VORTEX.DURATION);
    const speed  = VORTEX.CAM_BASE_SPEED + speedT * speedT * VORTEX.CAM_ACCEL;
    this._camera.position.z -= speed * dt;

    // ORGANIC SWAY — TWO OVERLAPPING FREQUENCIES FOR NON-REPEATING FEEL
    this._camera.position.x = Math.sin(this._time * 1.8)  * VORTEX.WOBBLE_X
                             + Math.sin(this._time * 0.6)  * VORTEX.WOBBLE_X * 0.4;
    this._camera.position.y = Math.cos(this._time * 1.35) * VORTEX.WOBBLE_Y
                             + Math.cos(this._time * 0.5)  * VORTEX.WOBBLE_Y * 0.35;

    // LOOK SLIGHTLY AHEAD SO CAMERA CURVES WITH THE TUBE
    this._camera.lookAt(
      this._camera.position.x * 0.25,
      this._camera.position.y * 0.25,
      this._camera.position.z - 18
    );
  }

  _updateShaderUniforms() {
    if (!this._uniforms) return;

    // PROGRESS 0→1 OVER FLESH_PROGRESS_DURATION — FLESH TEXTURE MATERIALIZES AS YOU FLY IN
    const progress = Math.min(1, this._time / VORTEX.FLESH_PROGRESS_DURATION);

    this._uniforms.time.value     = this._time;
    this._uniforms.progress.value = progress;
    this._uniforms.opacity.value  = this._alpha;

    // PULSE LIGHT FOLLOWS CAMERA
    if (this._pulseLight) {
      this._pulseLight.position.z = this._camera.position.z - 4;
      this._pulseLight.intensity  =
        3.5 + Math.sin(this._time * VORTEX.PERI_STRENGTH ?? 8) * 2.8 * progress;
    }

    // GLOW TUBE BREATHES SUBTLY
    if (this._glowTube) {
      this._glowTube.material.opacity =
        this._alpha * (0.06 + Math.sin(this._time * 6) * 0.03 * (1 - progress * 0.8));
    }

    // BACKGROUND COLOR LERPS FROM BLACK → DARK WARM VOID AS FLESH MATERIALIZES
    if (this._scene) {
      const startDark = new THREE.Color(0x0b0012);
      const endDark   = new THREE.Color(0x120002);
      const bgColor   = new THREE.Color().copy(startDark).lerp(endDark, progress);
      this._scene.background.copy(bgColor);
      this._scene.fog.color.copy(bgColor);
    }
  }

  // ===================== PRIVATE — SETUP =====================

  _buildDOM() {
    this._canvas = document.createElement('canvas');
    Object.assign(this._canvas.style, {
      position:      'fixed',
      top:           '0',
      left:          '0',
      width:         '100%',
      height:        '100%',
      zIndex:        '9990',
      pointerEvents: 'none',
      opacity:       '0',
    });
    document.body.appendChild(this._canvas);
  }

  _setupRenderer() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this._renderer = new THREE.WebGLRenderer({ canvas: this._canvas, antialias: false });
    this._renderer.setSize(w, h);
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this._renderer.setClearColor(0x000000);

    this._scene  = new THREE.Scene();
    this._scene.background = new THREE.Color(0x000000);
    this._camera = new THREE.PerspectiveCamera(88, w / h, 0.1, 500);
    this._camera.position.set(0, 0, 0);

    this._scene.fog = new THREE.FogExp2(0x000000, 0.045);
  }

  _buildScene() {
    // ═══ TUBE PATH — GENTLE S-CURVE ═══
    const points = [];
    for (let i = 0; i <= 50; i++) {
      const t     = i / 50;
      const swayX = Math.sin(t * Math.PI * 2.5) * t * 2.2;
      const swayY = Math.cos(t * Math.PI * 1.8) * t * 1.4;
      points.push(new THREE.Vector3(swayX, swayY, -t * VORTEX.TUBE_LENGTH));
    }
    const curve = new THREE.CatmullRomCurve3(points);

    const tubeGeo = new THREE.TubeGeometry(
      curve,
      VORTEX.TUBE_PATH_SEGS,
      VORTEX.TUBE_RADIUS,
      VORTEX.TUBE_RADIAL_SEGS,
      false
    );

    // ═══ FLESH SHADER — STARTS AS DARK VOID, MATERIALIZES INTO ORGANIC TISSUE ═══
    this._uniforms = {
      time:         { value: 0 },
      progress:     { value: 0 },
      opacity:      { value: 0 },
      throbSpeed:   { value: VORTEX.THROB_SPEED },
      periStrength: { value: VORTEX.PERI_STRENGTH },
      ripple:       { value: VORTEX.RIPPLE },
    };

    const tubeMat = new THREE.ShaderMaterial({
      uniforms:       this._uniforms,
      vertexShader:   _vertexShader,
      fragmentShader: _fragmentShader,
      side:           THREE.BackSide,
      transparent:    true,
    });

    this._tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    this._scene.add(this._tubeMesh);

    // ═══ GLOW LAYER — ADDITIVE BLENDING FOR INNER LUMINOSITY ═══
    const glowMat = new THREE.MeshBasicMaterial({
      color:       0x1a0006,
      transparent: true,
      opacity:     0,
      blending:    THREE.AdditiveBlending,
      side:        THREE.BackSide,
    });
    this._glowTube = new THREE.Mesh(tubeGeo, glowMat); // SHARED GEOMETRY — NO EXTRA MEMORY
    this._glowTube.scale.set(1.22, 1.0, 1.22);
    this._scene.add(this._glowTube);

    // ═══ LIGHTS ═══
    this._scene.add(new THREE.AmbientLight(0x180008, 0.4));

    this._pulseLight = new THREE.PointLight(0x7a0a00, 3.5, 40);
    this._pulseLight.position.set(0, 0, -4);
    this._scene.add(this._pulseLight);

    const deepLight = new THREE.PointLight(0x701e00, 4, 55);
    deepLight.position.set(0, 0, -VORTEX.TUBE_LENGTH * 0.6);
    this._scene.add(deepLight);
  }

  // ===================== PRIVATE — TEARDOWN =====================

  _cleanup() {
    this._active = false;

    if (this._scene) {
      this._scene.traverse(obj => {
        obj.geometry?.dispose();
        if (obj.material) {
          Array.isArray(obj.material)
            ? obj.material.forEach(m => m.dispose())
            : obj.material.dispose();
        }
      });
    }

    if (this._renderer) { this._renderer.dispose(); this._renderer = null; }
    if (this._canvas)   { this._canvas.remove();    this._canvas   = null; }

    this._scene      = null;
    this._camera     = null;
    this._tubeMesh   = null;
    this._glowTube   = null;
    this._pulseLight = null;
    this._uniforms   = null;
  }
}
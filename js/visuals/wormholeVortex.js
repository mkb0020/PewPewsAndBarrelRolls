// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import * as THREE from 'three';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const VORTEX = {
  DURATION:         12,   // TOTAL SECONDS
  FADE_IN:          1,  // SECONDS TO FULL OPACITY
  FADE_OUT_START:   7,   // WHEN FADE-TO-BLACK BEGINS
  TEXT_FADE_IN:     6,   // WHEN "WORMHOLES ALL THE WAY DOWN" TEXT APPEARS

  TUBE_RADIUS:      3.4,   // INNER RADIUS OF ESOPHAGUS
  TUBE_PATH_SEGS:   110,   // SMOOTHNESS OF TUBE PATH
  TUBE_RADIAL_SEGS: 14,    // CROSS-SECTION POLYGON COUNT (KEEP LOW FOR PERF)
  TUBE_LENGTH:      130,   // Z-DEPTH OF TUBE

  RIB_COUNT:        32,    // NUMBER OF TORUS RINGS (ESOPHAGUS RIBS)
  RIB_THICKNESS:    0.19,

  CAM_BASE_SPEED:   9,     // INITIAL CAMERA FLIGHT SPEED (Z-UNITS/S)
  CAM_ACCEL:        22,    // EXTRA SPEED ADDED BY END (ACCELERATES INTO THE DARK)
  WOBBLE_X:         0.55,  // CAMERA SIDE WOBBLE AMPLITUDE
  WOBBLE_Y:         0.38,

  TUBE_SPIN_SPEED:  0.28,  // RAD/S — SLOW ROTATION OF TUBE AROUND Z ADDS DISORIENTATION

  PULSE_BASE:       3.5,   // BASE POINT LIGHT INTENSITY
  PULSE_RANGE:      2.8,   // FLICKER AMPLITUDE
  PULSE_FREQ:       8,     // HZ
};

export class WormholeVortex {
  constructor() {
    this._canvas     = null;
    this._renderer   = null;
    this._scene      = null;
    this._camera     = null;
    this._tubeMesh   = null;
    this._pulseLight = null;
    this._ribs       = [];

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
    this._updateLights();
    this._updateRibPulse();

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
    const t = this._time;
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

    // LOOK SLIGHTLY AHEAD OF POSITION SO CAMERA CURVES WITH THE TUBE
    this._camera.lookAt(
      this._camera.position.x * 0.25,
      this._camera.position.y * 0.25,
      this._camera.position.z - 18
    );
  }

  _updateLights() {
    if (!this._pulseLight) return;
    this._pulseLight.position.z = this._camera.position.z - 4;
    this._pulseLight.intensity  =
      VORTEX.PULSE_BASE + Math.sin(this._time * VORTEX.PULSE_FREQ) * VORTEX.PULSE_RANGE;
  }

  _updateRibPulse() {
    for (const rib of this._ribs) {
      // EACH RIB HAS ITS OWN PHASE SO THEY RIPPLE RATHER THAN ALL FLASH TOGETHER
      rib.material.emissiveIntensity =
        0.25 + Math.abs(Math.sin(this._time * 5 + rib.userData.phase)) * 0.65;
    }
  }

  // ===================== PRIVATE — SETUP =====================

  _buildDOM() {
    // THREE.JS CANVAS — SITS OVER EVERYTHING
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
    this._renderer.setClearColor(0x060000); // DEEP NEAR-BLACK RED — LAST FRAME IS DARK

    this._scene  = new THREE.Scene();
    this._camera = new THREE.PerspectiveCamera(88, w / h, 0.1, 500);
    this._camera.position.set(0, 0, 0);

    // EXPONENTIAL FOG — OBJECTS AHEAD DISSOLVE INTO DARKNESS, PULLS EYE FORWARD
    this._scene.fog = new THREE.FogExp2(0x060000, 0.055);
  }

  _buildScene() {
    // ═══ TUBE PATH — GENTLE S-CURVE SO IT DOESN'T LOOK PERFECTLY STRAIGHT ═══
    const points = [];
    for (let i = 0; i <= 50; i++) {
      const t     = i / 50;
      const swayX = Math.sin(t * Math.PI * 2.5) * t * 2.2;
      const swayY = Math.cos(t * Math.PI * 1.8) * t * 1.4;
      points.push(new THREE.Vector3(swayX, swayY, -t * VORTEX.TUBE_LENGTH));
    }
    const curve = new THREE.CatmullRomCurve3(points);

    // ═══ TUBE MESH — BackSide SO WE SEE THE INSIDE WALLS ═══
    const tubeGeo = new THREE.TubeGeometry(
      curve,
      VORTEX.TUBE_PATH_SEGS,
      VORTEX.TUBE_RADIUS,
      VORTEX.TUBE_RADIAL_SEGS,
      false
    );
    const tubeMat = new THREE.MeshPhongMaterial({
      color:             0x600000,
      emissive:          0x280000,
      emissiveIntensity: 0.45,
      specular:          0x2a0000,
      shininess:         25,
      side:              THREE.BackSide,
    });
    this._tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    this._scene.add(this._tubeMesh);

    // ═══ RIBS — TORUS RINGS PERPENDICULAR TO TUBE PATH ═══
    for (let i = 0; i < VORTEX.RIB_COUNT; i++) {
      const t   = (i + 0.5) / VORTEX.RIB_COUNT;
      const pt  = curve.getPoint(t);
      const tan = curve.getTangent(t);

      const ribGeo = new THREE.TorusGeometry(
        VORTEX.TUBE_RADIUS * 1.03,
        VORTEX.RIB_THICKNESS,
        8,
        22
      );
      const ribMat = new THREE.MeshPhongMaterial({
        color:             0x380000,
        emissive:          0x1a0000,
        emissiveIntensity: 0.4,
        shininess:         8,
      });
      const rib = new THREE.Mesh(ribGeo, ribMat);
      rib.position.copy(pt);
      rib.lookAt(pt.clone().add(tan)); // ORIENT PERPENDICULAR TO TUBE DIRECTION
      rib.userData.phase = (i / VORTEX.RIB_COUNT) * Math.PI * 6; // STAGGERED PULSE PHASE
      this._scene.add(rib);
      this._ribs.push(rib);
    }

    // ═══ LIGHTS ═══
    // AMBIENT — DARK RED BASE SO NOTHING IS PITCH BLACK
    this._scene.add(new THREE.AmbientLight(0x300000, 2.2));

    // PULSE LIGHT — TRAVELS WITH CAMERA, ILLUMINATES NEARBY WALLS
    this._pulseLight = new THREE.PointLight(0x7a0a00, VORTEX.PULSE_BASE, 22);
    this._pulseLight.position.set(0, 0, -3);
    this._scene.add(this._pulseLight);

    // DEEP LIGHT — GLOWS FROM FAR AHEAD, LURES CAMERA FORWARD
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
    this._pulseLight = null;
    this._ribs       = [];
  }
}
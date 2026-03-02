// tunnel.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import * as THREE from 'three';
import { CONFIG } from '../utils/config.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
export class Tunnel {
  constructor() {
    this.time = 0;
    this.shipOffset = { x: 0, y: 0 };
    this._suctionIntensity = 0;
    this._suctionTarget    = 0;

    // CONSUMED SEQUENCE — DRIVES ITS OWN SEPARATE SET OF LERPS
    this._consumedIntensity = 0;  // 0 = NORMAL, 1 = FULL HELLSCAPE
    this._consumedTarget    = 0;
    this._consumedSpeedMult = 1;  // CACHED SPEED MULTIPLIER FOR update()

    // SLIME ATTACK — SLOWS TUNNEL + SHIFTS HUE TO GREEN
    this._slimeIntensity    = 0;
    this._slimeTarget       = 0;

    // WAVE CLEAR PULSE — TRIPPY PINK/ORANGE DISTORTION STING BETWEEN WAVES
    this._wavePulseIntensity = 0;
    this._wavePulseTarget    = 0;

    // BOSS TRANSITION — THREE PHASES: SURGE → FLASH → EMERGENCE
    this._bossTransitionSurge       = 0;  // PHASE 1: SPEED x7, CRIMSON BLEED, ROLL RAMP
    this._bossTransitionSurgeTarget = 0;
    this._bossFlash                 = 0;  // PHASE 2: BLAZING RED FLASH
    this._bossFlashTarget           = 0;
    this._bossEmergenceFog          = 0;  // PHASE 3: THICK FOG + NEAR-BLACKOUT, WORM EMERGES
    this._bossEmergenceFogTarget    = 0;
    
    this.initScene();
    this.initTunnel();
    
    console.log('Ã¢Å“â€œ Tunnel initialized');
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.SCENE.BACKGROUND_COLOR);
    this.scene.fog = new THREE.FogExp2(CONFIG.SCENE.BACKGROUND_COLOR, CONFIG.SCENE.FOG_DENSITY);

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.SCENE.CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      CONFIG.SCENE.CAMERA_NEAR,
      CONFIG.SCENE.CAMERA_FAR
    );
    this.camera.position.set(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      preserveDrawingBuffer: true, // NEEDED FOR OCULAR PRISM captureFrame
      powerPreference: "high-performance" 
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.MAX_PIXEL_RATIO));
    this.renderer.domElement.id = 'three-canvas';
    document.body.appendChild(this.renderer.domElement);
  }

  initTunnel() { // CIRCULAR TUNNEL PATH
    const points = [];
    for (let i = 0; i <= CONFIG.TUNNEL.SEGMENTS; i++) {
      const angle = (i / CONFIG.TUNNEL.SEGMENTS) * Math.PI * 2;
      points.push(new THREE.Vector3(
        Math.cos(angle) * CONFIG.TUNNEL.RADIUS,
        0,
        Math.sin(angle) * CONFIG.TUNNEL.RADIUS
      ));
    }

    this.curve = new THREE.CatmullRomCurve3(points, true);

    // PRE-BAKE TWO GEOMETRIES — NORMAL + CONSTRICTED (FATTER WALLS = TIGHTER FEELING TUBE) /  GENERATED ONCE AT INIT, ZERO PER-FRAME COST — CROSSFADE VIA OPACITY
    const normalGeom = new THREE.TubeGeometry(
      this.curve,
      CONFIG.TUNNEL.TUBE_SEGMENTS,
      CONFIG.TUNNEL.TUBE_RADIUS,
      CONFIG.TUNNEL.TUBE_RADIAL_SEGMENTS,
      true
    );
    const constrictedGeom = new THREE.TubeGeometry(
      this.curve,
      CONFIG.TUNNEL.TUBE_SEGMENTS,
      CONFIG.TUNNEL.TUBE_RADIUS * 0.7,  // FATTER CROSS-SECTION = WALLS CLOSE IN AROUND CAMERA
      CONFIG.TUNNEL.TUBE_RADIAL_SEGMENTS,
      true
    );

    // =============== NORMAL TUBE ===============
    this.material = new THREE.MeshBasicMaterial({
      color: 0xA55AFF,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    this.tube = new THREE.Mesh(normalGeom, this.material);
    this.scene.add(this.tube);

    this.glowMat = new THREE.MeshBasicMaterial({
      color: 0xA55AFF,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
    });
    this.glowTube = new THREE.Mesh(normalGeom, this.glowMat);
    this.glowTube.scale.set(1.25, 1.0, 1.25);
    this.scene.add(this.glowTube);

    // ── CONSTRICTED TUBE (STARTS INVISIBLE) ──────────────────────
    this.constrictedMat = new THREE.MeshBasicMaterial({
      color: 0xA55AFF,
      wireframe: true,
      transparent: true,
      opacity: 0,
    });
    this.constrictedTube = new THREE.Mesh(constrictedGeom, this.constrictedMat);
    this.scene.add(this.constrictedTube);

    this.constrictedGlowMat = new THREE.MeshBasicMaterial({
      color: 0xA55AFF,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    this.constrictedGlowTube = new THREE.Mesh(constrictedGeom, this.constrictedGlowMat);
    this.constrictedGlowTube.scale.set(1.25, 1.0, 1.25);
    this.scene.add(this.constrictedGlowTube);
  }


  updateShipOffset(offsetX, offsetY) {
    this.shipOffset.x = offsetX;
    this.shipOffset.y = offsetY;
  }

  // CALL FROM MAIN.JS — t: 0=NORMAL, 1=FULL SUCTION
  setSuctionIntensity(t) {
    this._suctionTarget = Math.max(0, Math.min(1, t));
  }

  // CALL FROM MAIN.JS — t: 0=NORMAL, 1=FULL GREEN SLIME CRAWL
  setSlimeIntensity(t) {
    this._slimeTarget = Math.max(0, Math.min(1, t));
  }

  // CALL FROM MAIN.JS — t: 0=NORMAL TUNNEL, 1=FULL BLACK-RED VORTEX
  setConsumedIntensity(t) {
    this._consumedTarget = Math.max(0, Math.min(1, t));
  }

  // ── BOSS TRANSITION SETTERS ────────────────────────────────────────────────
  setBossTransitionSurge(t) { this._bossTransitionSurgeTarget = Math.max(0, Math.min(1, t)); }
  setBossFlash(t)           { this._bossFlashTarget           = Math.max(0, Math.min(1, t)); }
  setBossEmergenceFog(t)    { this._bossEmergenceFogTarget    = Math.max(0, Math.min(1, t)); }

  // ── WAVE CLEAR PULSE SETTER ────────────────────────────────────────────────
  setWavePulse(t) { this._wavePulseTarget = Math.max(0, Math.min(1, t)); }

  resetBossTransition() {
    this._bossTransitionSurge = 0; this._bossTransitionSurgeTarget = 0;
    this._bossFlash           = 0; this._bossFlashTarget           = 0;
    this._bossEmergenceFog    = 0; this._bossEmergenceFogTarget    = 0;
    this._wavePulseIntensity  = 0; this._wavePulseTarget           = 0;
  }

  update(dt) {
    // FIXED TIMESTAMP FOR SMOOTH TUNNEL
    this.time += 0.016;

    // ── SUCTION LERP ──────────────────────────────────────────────────────────
    const sLerp = this._suctionTarget > this._suctionIntensity ? 0.03 : 0.015;
    this._suctionIntensity += (this._suctionTarget - this._suctionIntensity) * sLerp;
    const si = this._suctionIntensity;

    // ── CONSUMED LERP — SNAPPY IN, INSTANT RESET ──────────────────────────────
    const cLerp = this._consumedTarget > this._consumedIntensity ? 0.08 : 0.12;
    this._consumedIntensity += (this._consumedTarget - this._consumedIntensity) * cLerp;
    const ci = this._consumedIntensity;

    // ── SLIME LERP — SLUGGISH IN, SLOW FADE OUT ───────────────────────────────
    const slLerp = this._slimeTarget > this._slimeIntensity ? 0.04 : 0.018;
    this._slimeIntensity += (this._slimeTarget - this._slimeIntensity) * slLerp;
    const sli = this._slimeIntensity;

    // ── BOSS TRANSITION LERPS ─────────────────────────────────────────────────
    this._bossTransitionSurge += (this._bossTransitionSurgeTarget - this._bossTransitionSurge) * 0.04;
    const bts = this._bossTransitionSurge;                         // SURGE: 0→1

    const bfLerp = this._bossFlashTarget > this._bossFlash ? 0.20 : 0.13;
    this._bossFlash += (this._bossFlashTarget - this._bossFlash) * bfLerp;
    const bf = this._bossFlash;                                    // FLASH: 0→1

    const befLerp = this._bossEmergenceFogTarget > this._bossEmergenceFog ? 0.06 : 0.008;
    this._bossEmergenceFog += (this._bossEmergenceFogTarget - this._bossEmergenceFog) * befLerp;
    const bef = this._bossEmergenceFog;                            // EMERGENCE FOG: 0→1

    // ── WAVE PULSE LERP — SNAPPY IN, GRADUAL FADE ────────────────────────────
    const wpLerp = this._wavePulseTarget > this._wavePulseIntensity ? 0.18 : 0.025;
    this._wavePulseIntensity += (this._wavePulseTarget - this._wavePulseIntensity) * wpLerp;
    const wpi = this._wavePulseIntensity;                          // WAVE PULSE: 0→1

    // ── SPEED — CONSUMED CRANKS IT UP, SUCTION ADDS MILD RAMP, SLIME CRAWLS, BOSS SURGE ROCKETS, WAVE PULSE JOLTS ──
    const speedMult = (1 - sli * (1 - CONFIG.SLIME_ATTACK.TUNNEL_SPEED_MULT))
                    * (1 + si * 0.4 + ci * 3.5)
                    * (1 + bts * 6.5)
                    * (1 + wpi * 1.6);   // ← WAVE PULSE: 1x → 2.6x jolt
    this._consumedSpeedMult = speedMult;

    // PROGRESS ALONG CURVE
    const progress = (this.time * CONFIG.TUNNEL.SPEED * speedMult) % 1;
    const pos      = this.curve.getPointAt(progress);
    const tangent  = this.curve.getTangentAt(progress);

    // ── CAMERA POSITION ───────────────────────────────────────────────────────
    this.camera.position.copy(pos);
    const lookTarget = pos.clone().add(tangent);
    this.camera.lookAt(lookTarget);

    // ROLL — CONSUMED SPINS HARD, SURGE RAMPS UP THE CHAOS, WAVE PULSE ADDS A WOBBLE
    const rollAmt = CONFIG.TUNNEL.ROLL_AMOUNT + ci * 2.2 + bts * 1.8 + wpi * 0.9;
    this.camera.up.set(0, 1, 0).applyAxisAngle(tangent, -Math.PI * rollAmt);

    // ── BACKGROUND COLOR — DEEP PURPLE → PURE BLACK → SLIME GREEN ────────────
    const bgColor = new THREE.Color();
    bgColor.lerpColors(
      new THREE.Color(CONFIG.SCENE.BACKGROUND_COLOR),  
      new THREE.Color(0x000000),
      ci
    );
    if (sli > 0.01) {
      const slimeBg = new THREE.Color(0x010e03); 
      bgColor.lerp(slimeBg, sli * 0.75);
    }
    // FLASH BLEEDS DEEP RED, EMERGENCE CUTS TO NEAR-BLACK
    if (bf  > 0.01) bgColor.lerp(new THREE.Color(0x1a0000), bf  * 0.75);
    if (bef > 0.01) bgColor.lerp(new THREE.Color(0x000000), bef * 0.94);
    this.scene.background.copy(bgColor);
    this.scene.fog.color.copy(bgColor);

    // ── FOG DENSITY — THICKENS SO TUNNEL WALLS DISSOLVE INTO DARKNESS ─────────
    this.scene.fog.density = CONFIG.SCENE.FOG_DENSITY + ci * 0.018 + bts * 0.003 + bef * 0.048;

    // ── WIREFRAME COLOR ───────────────────────────────────────────────────────
    // SUCTION LERPS PURPLE → RED (existing behaviour)
    // CONSUMED THEN LERPS RED → DEEP BLOOD CRIMSON AND DIMS
    // SLIME LERPS WHOLE THING → SICKLY GREEN
    const pulse   = Math.sin(this.time * 1.8) * 0.5 + 0.5;
    const baseHue = CONFIG.TUNNEL.COLOR_BASE_HUE * (1 - si) * (1 - ci * 0.85);
    const lightness = (0.55 + si * 0.15) * (1 - ci * 0.45);
    const col = this.material.color;
    col.setHSL(baseHue + pulse * CONFIG.TUNNEL.COLOR_PULSE_RANGE * (1 - ci * 0.8), 1, lightness);

    if (sli > 0.01) {
      const slimePulse = Math.sin(this.time * 2.2) * 0.5 + 0.5;
      const greenHue   = 0.33 + slimePulse * 0.04;   
      const slimeLight = 0.42 + slimePulse * 0.12;
      const slimeColor = new THREE.Color().setHSL(greenHue, 1, slimeLight);
      col.lerp(slimeColor, sli);
    }

    // SURGE — BLEED HUE FROM PURPLE TO DEEP CRIMSON
    if (bts > 0.01) {
      const surgeColor = new THREE.Color().setHSL(0.0, 1.0, 0.48 + bts * 0.08);
      col.lerp(surgeColor, bts * 0.92);
    }
    // FLASH — SPIKE TO HOT BRIGHT RED
    if (bf > 0.01) {
      const flashColor = new THREE.Color().setHSL(0.0, 1.0, 0.44 + bf * 0.52);
      col.lerp(flashColor, bf);
    }

    // WAVE PULSE — SHIMMER BETWEEN HOT PINK (#c71585) AND ORANGE (#ff8800)
    if (wpi > 0.01) {
      const shimmer     = Math.sin(this.time * Math.PI * 7) * 0.5 + 0.5; // ~3.5Hz oscillation
      const pink        = new THREE.Color(0xc71585);
      const orange      = new THREE.Color(0xff8800);
      const pulseColor  = new THREE.Color().lerpColors(pink, orange, shimmer);
      // BRIGHTNESS RIDES THE SHIMMER SO IT FEELS ELECTRIC
      pulseColor.multiplyScalar(0.85 + shimmer * 0.4);
      col.lerp(pulseColor, wpi * 0.95);
    }

    // PUSH COLOR TO ALL FOUR MATERIALS
    this.glowMat.color.copy(col);
    this.constrictedMat.color.copy(col);
    this.constrictedGlowMat.color.copy(col);

    // ── OPACITY — SURGE PUMPS GLOW, FLASH SPIKES BOTH LAYERS, EMERGENCE BLACKS OUT, WAVE PULSE PUMPS GLOW ──
    const consumedPulse = 0.5 + 0.5 * Math.sin(this.time * 12 * (1 + ci * 3)); // FAST STROBE AS CI RISES
    const wavePulseGlow = wpi * 0.3 * (0.5 + 0.5 * Math.sin(this.time * Math.PI * 7)); // GLOW THROBS WITH SHIMMER
    const dimEmergence  = 1 - bef * 0.88;   // EMERGENCE FADES TUNNEL TO ~12% OPACITY
    this.material.opacity           = ((0.4  * (1 - si)) * (1 - ci * 0.6) + bf * 0.55 + wpi * 0.25) * dimEmergence;
    this.glowMat.opacity            = ((0.15 * (1 - si)) * (1 - ci * 0.7) + ci * 0.08 * consumedPulse + bts * 0.22 + bf * 0.85 + wavePulseGlow) * dimEmergence;
    this.constrictedMat.opacity     = ((0.4  * si)       + ci * 0.55 * consumedPulse) * dimEmergence;
    this.constrictedGlowMat.opacity =  (ci * 0.22 * consumedPulse) * dimEmergence;

    // ── VERTICAL WAVE ─────────────────────────────────────────────────────────
    const waveAmp = CONFIG.TUNNEL.VERTICAL_WAVE_AMPLITUDE + si * 55 + bts * 28 + wpi * 38;  // WAVE PULSE ADDS JUDDER
    this.camera.position.y += Math.sin(this.time * CONFIG.TUNNEL.VERTICAL_WAVE_SPEED) * waveAmp;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  handleResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  getTime() {
    return this.time;
  }

  // PROJECTS A POINT SLIGHTLY AHEAD ALONG THE TUNNEL CURVE INTO 2D SCREEN SPACE - RETURNS THE PIXEL COORDINATE WHERE THE TUNNEL VISUALLY CONVERGES â€” THE TRUE VANISHING POINT FOR THIS FRAME, WHICH SHIFTS AS THE CAMERA ROLLS AND CURVES - USED BY THE CROSSHAIR SO AIM-GRAVITY TRACKS THE TUNNEL MOUTH, NOT SCREEN CENTER.
  getVanishingPoint() { // SAMPLE A POINT A SHORT LOOK-AHEAD DISTANCE ALONG THE CURVE
    const progress = (this.time * CONFIG.TUNNEL.SPEED) % 1;
    const lookProgress = (progress + 0.018) % 1;
    const lookPos = this.curve.getPointAt(lookProgress);

    const ndc = lookPos.clone().project(this.camera); // PROJECT WORLD-SPACE POINT â†’ NDC â†’ PIXEL
    const projX = ( ndc.x + 1) / 2 * window.innerWidth;
    const projY = (-ndc.y + 1) / 2 * window.innerHeight;

    const scx = window.innerWidth  / 2; // THE PROJECTED SPINE POINT ENDS UP MIRRORED FROM THE VISUAL TUNNEL MOUTH - SO REFLECT THE OFFSET RELATIVE TO SCREEN CENTER TO CORRECT DIRECTION.
    const scy = window.innerHeight / 2;
    const strength = 0.25; // 0=SCREEN CENTER, 1=FULL REFLECTION 
    return {
      x: scx - (projX - scx) * strength,
      y: scy - (projY - scy) * strength,
    };
  
  }
}
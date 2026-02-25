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

    // ── SPEED — CONSUMED CRANKS IT UP, SUCTION ADDS MILD RAMP, SLIME CRAWLS ──
    const speedMult = (1 - sli * (1 - CONFIG.SLIME_ATTACK.TUNNEL_SPEED_MULT))
                    * (1 + si * 0.4 + ci * 3.5);
    this._consumedSpeedMult = speedMult;

    // PROGRESS ALONG CURVE
    const progress = (this.time * CONFIG.TUNNEL.SPEED * speedMult) % 1;
    const pos      = this.curve.getPointAt(progress);
    const tangent  = this.curve.getTangentAt(progress);

    // ── CAMERA POSITION ───────────────────────────────────────────────────────
    this.camera.position.copy(pos);
    const lookTarget = pos.clone().add(tangent);
    this.camera.lookAt(lookTarget);

    // ROLL — CONSUMED SPINS HARD, MATCHING THE SHIP'S CCW SPIRAL
    const rollAmt = CONFIG.TUNNEL.ROLL_AMOUNT + ci * 2.2;
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
    this.scene.background.copy(bgColor);
    this.scene.fog.color.copy(bgColor);

    // ── FOG DENSITY — THICKENS SO TUNNEL WALLS DISSOLVE INTO DARKNESS ─────────
    this.scene.fog.density = CONFIG.SCENE.FOG_DENSITY + ci * 0.018;

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

    // PUSH COLOR TO ALL FOUR MATERIALS
    this.glowMat.color.copy(col);
    this.constrictedMat.color.copy(col);
    this.constrictedGlowMat.color.copy(col);

    // ── OPACITY — CONSUMED DIMS NORMAL TUBE, PULSES CONSTRICTED FOR VORTEX FEEL
    const consumedPulse = 0.5 + 0.5 * Math.sin(this.time * 12 * (1 + ci * 3)); // FAST STROBE AS CI RISES
    this.material.opacity           = (0.4  * (1 - si)) * (1 - ci * 0.6);
    this.glowMat.opacity            = (0.15 * (1 - si)) * (1 - ci * 0.7) + ci * 0.08 * consumedPulse;
    this.constrictedMat.opacity     = (0.4  * si)       + ci * 0.55 * consumedPulse;
    this.constrictedGlowMat.opacity =                      ci * 0.22 * consumedPulse;

    // ── VERTICAL WAVE ─────────────────────────────────────────────────────────
    const waveAmp = CONFIG.TUNNEL.VERTICAL_WAVE_AMPLITUDE + si * 55;
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
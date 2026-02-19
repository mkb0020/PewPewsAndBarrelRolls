// tunnel.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~

import * as THREE from 'three';
import { CONFIG } from './config.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export class Tunnel {
  constructor() {
    this.time = 0;
    this.shipOffset = { x: 0, y: 0 };
    this._suctionIntensity = 0;
    this._suctionTarget    = 0;
    
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

  update(dt) {
    // FIXED TIMESTAMP FOR SMOOTH TUNNEL
    this.time += 0.016;

    // LERP SUCTION INTENSITY — SNAPPY IN, SLOW RELEASE
    const lerpSpeed = this._suctionTarget > this._suctionIntensity ? 0.03 : 0.015;
    this._suctionIntensity += (this._suctionTarget - this._suctionIntensity) * lerpSpeed;
    const si = this._suctionIntensity; // SHORTHAND

    // PROGRESS ALONG CURVE
    const progress = (this.time * CONFIG.TUNNEL.SPEED) % 1;
    const pos = this.curve.getPointAt(progress);
    const tangent = this.curve.getTangentAt(progress);

    // UPDATE CAMERA POS
    this.camera.position.copy(pos);
    const lookTarget = pos.clone().add(tangent);
    this.camera.lookAt(lookTarget);
    this.camera.up.set(0, 1, 0).applyAxisAngle(tangent, -Math.PI * CONFIG.TUNNEL.ROLL_AMOUNT);

    // COLOR PULSE — LERP BASE HUE TOWARD RED (0.0) DURING SUCTION
    const pulse   = Math.sin(this.time * 1.8) * 0.5 + 0.5;
    const baseHue = CONFIG.TUNNEL.COLOR_BASE_HUE * (1 - si); // PURPLE → RED
    const col = this.material.color;
    col.setHSL(baseHue + pulse * CONFIG.TUNNEL.COLOR_PULSE_RANGE, 1, 0.55 + si * 0.15);

    // PUSH COLOR TO ALL FOUR MATERIALS
    this.glowMat.color.copy(col);
    this.constrictedMat.color.copy(col);
    this.constrictedGlowMat.color.copy(col);

    // CROSSFADE NORMAL ↔ CONSTRICTED — OPACITY IS THE ONLY THING CHANGING PER FRAME
    this.material.opacity          = 0.4  * (1 - si);
    this.glowMat.opacity           = 0.15 * (1 - si);
    this.constrictedMat.opacity    = 0.4  * si;
    this.constrictedGlowMat.opacity = 0 * si;

    // VERTICAL WAVE — BUMP AMPLITUDE DURING SUCTION
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
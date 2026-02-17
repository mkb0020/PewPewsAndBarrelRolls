// tunnel.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~

import * as THREE from 'three';
import { CONFIG } from './config.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export class Tunnel {
  constructor() {
    this.time = 0;
    this.shipOffset = { x: 0, y: 0 };
    
    this.initScene();
    this.initTunnel();
    
    console.log('✓ Tunnel initialized');
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

    const geometry = new THREE.TubeGeometry( // TUBE
      this.curve,
      CONFIG.TUNNEL.TUBE_SEGMENTS,
      CONFIG.TUNNEL.TUBE_RADIUS,
      CONFIG.TUNNEL.TUBE_RADIAL_SEGMENTS,
      true
    );

    this.material = new THREE.MeshBasicMaterial({ // MAIN WIREFRAME
      color: 0x00ffff,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });

    this.tube = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.tube);

    const glowMat = new THREE.MeshBasicMaterial({  // GLOW LAYER
      color: 0x00ffff,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
    });
    
    this.glowTube = new THREE.Mesh(geometry, glowMat);
    this.glowTube.scale.set(1.12, 1.12, 1.12);
    this.scene.add(this.glowTube);
    this.glowMat = glowMat;
  }

  updateShipOffset(offsetX, offsetY) {
    this.shipOffset.x = offsetX;
    this.shipOffset.y = offsetY;
  }

  update(dt) {
    // FIXED TIMESTAMP FOR SMOOTH TUNNEL
    this.time += 0.016;

    // PROGRESS ALONG CURVE
    const progress = (this.time * CONFIG.TUNNEL.SPEED) % 1;
    const pos = this.curve.getPointAt(progress);
    const tangent = this.curve.getTangentAt(progress);

    // UPDATE CAMERA POS
    this.camera.position.copy(pos);
    const lookTarget = pos.clone().add(tangent);
    this.camera.lookAt(lookTarget);
    this.camera.up.set(0, 1, 0).applyAxisAngle(tangent, -Math.PI * CONFIG.TUNNEL.ROLL_AMOUNT);

    // COLOR PULSE
    const pulse = Math.sin(this.time * 1.8) * 0.5 + 0.5;
    this.material.color.setHSL(
      CONFIG.TUNNEL.COLOR_BASE_HUE + pulse * CONFIG.TUNNEL.COLOR_PULSE_RANGE,
      1,
      0.65
    );
    this.glowMat.color.copy(this.material.color);

    // VERTICAL WAVE MOTION
    this.camera.position.y += Math.sin(this.time * CONFIG.TUNNEL.VERTICAL_WAVE_SPEED) * 
                               CONFIG.TUNNEL.VERTICAL_WAVE_AMPLITUDE;
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
}
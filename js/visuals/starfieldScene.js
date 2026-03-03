// visuals/starfieldScene.js
import * as THREE from 'three';

const STAR_SPREAD = 1000;
const DEFAULT_STAR_COUNT = 1500;

export class StarfieldScene {

  /**
   * @param {THREE.WebGLRenderer} renderer  
   */
  constructor(renderer) {
    this._renderer = renderer;
    this._active   = false;

    // SPEED / FADE
    this.speed   = 4;       
    this.opacity = 0;      

    // THREE.JS SCENE
    this._scene  = new THREE.Scene();
    this._camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    this._camera.position.z = 5;

    // GRADIENT BACKGROUND
    this._baseHue      = 260;
    this._hueShiftSpeed = 0.015; 

    // STARS
    this._starCount    = DEFAULT_STAR_COUNT;
    this._starGeometry = new THREE.BufferGeometry();
    this._starMaterial = new THREE.PointsMaterial({
      color:       0xffffff,
      size:        2.5,
      transparent: true,
      opacity:     0,
      depthWrite:  false,
    });
    this._stars = null;
    this._initStars(DEFAULT_STAR_COUNT);

    // RESIZE
    this._onResize = () => {
      this._camera.aspect = window.innerWidth / window.innerHeight;
      this._camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', this._onResize);

    console.log('✔ StarfieldScene initialized');
  }

  // ======================== PUBLIC API ========================
  /** START RENDERING STARFIELD THROUGH SHARED RENDERER*/
  start() {
    this._active = true;
    console.log('★ StarfieldScene started');
  }

  /** STOP RENDERING - RENDERER RETURNS TO WHOEVER CALLS IT NEXT */
  stop() {
    this._active = false;
    console.log('★ StarfieldScene stopped');
  }

  isActive() { return this._active; }

  /**
   * CALL ONCE PER FRAME FROM THE SCENE THAT OWNS THIS 
   * @param {number} dt  DELTA TIME IN SECONDS
   */
  update(dt) {
    if (!this._active) return;

    this._starMaterial.opacity = this.opacity; // SYNC MATERIAL OPACITY WITH MASTER FADE

    this._baseHue += this._hueShiftSpeed; 

    this._scene.background = this._makeGradientTexture(this._baseHue);

    const positions = this._starGeometry.attributes.position.array;
    const camZ      = this._camera.position.z;
    const frameSpeed = this.speed * (dt / 0.016); 

    for (let i = 0; i < this._starCount; i++) {
      const b = i * 3;
      let x = positions[b];
      let y = positions[b + 1];
      let z = positions[b + 2];

      z += frameSpeed;

      // CONE SPREAD — STARS FLARE OUTWARD AS THEY APPROACH
      const depthProgress = 1 - (Math.abs(z) / STAR_SPREAD);
      const coneStrength  = 2.5;
      x += x * depthProgress * 0.02 * coneStrength;
      y += y * depthProgress * 0.02 * coneStrength;

      if (z > camZ) {
        x = (Math.random() - 0.5) * STAR_SPREAD;
        y = (Math.random() - 0.5) * STAR_SPREAD;
        z = -STAR_SPREAD;
      }

      positions[b]     = x;
      positions[b + 1] = y;
      positions[b + 2] = z;
    }

    this._starGeometry.attributes.position.needsUpdate = true;
  }

  /** Render starfield using the shared renderer */
  render() {
    if (!this._active) return;
    this._renderer.render(this._scene, this._camera);
  }

  /** Dispose Three.js objects when permanently done */
  destroy() {
    window.removeEventListener('resize', this._onResize);
    this._starGeometry.dispose();
    this._starMaterial.dispose();
    if (this._stars) this._scene.remove(this._stars);
  }

  // ======================== PRIVATE ========================
  _initStars(count) {
    if (this._stars) this._scene.remove(this._stars);
    this._starGeometry.dispose?.();
    this._starGeometry = new THREE.BufferGeometry();

    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * STAR_SPREAD;
      positions[i * 3 + 1] = (Math.random() - 0.5) * STAR_SPREAD;
      positions[i * 3 + 2] = Math.random() * -STAR_SPREAD;
    }

    this._starGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );

    this._starCount = count;
    this._stars     = new THREE.Points(this._starGeometry, this._starMaterial);
    this._scene.add(this._stars);
  }

  _makeGradientTexture(hue) {
    const canvas = document.createElement('canvas');
    canvas.width  = 1;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const g   = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0,   `hsl(${hue},     100%, 0%)`);
    g.addColorStop(0.5, `hsl(${hue + 3}, 100%, 0.7%)`);
    g.addColorStop(1,   `hsl(${hue + 5}, 100%, 1.5%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1, 512);
    return new THREE.CanvasTexture(canvas);
  }
}
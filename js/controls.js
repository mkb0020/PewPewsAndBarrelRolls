// controls.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from './config.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                        ('ontouchstart' in window);

export const keys = {};
export const virtualKeys = {
  w: false,
  s: false,
  a: false,
  d: false,
  arrowup: false,
  arrowdown: false,
  arrowleft: false,
  arrowright: false
};

export function initKeyboard() {
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
  });
  
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });
  
  console.log('✓ Keyboard controls initialized');
}

let joystickActive = false;
let joystickCenter = { x: 0, y: 0 };

export function initMobileControls(onBarrelRoll) {
  const mobileControls = document.getElementById('mobile-controls');
  const joystick = document.querySelector('.joystick');
  const joystickKnob = document.querySelector('.joystick-knob');
  const actionBtn = document.querySelector('.action-btn');
  
  if (!mobileControls || !joystick || !actionBtn) {
    console.warn('Mobile controls elements not found');
    return;
  }
  
  if (isMobile) {
    mobileControls.style.display = 'flex';
  }
  
  joystick.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joystickActive = true;
    joystick.classList.add('active');
    updateJoystick(e.touches[0], joystick, joystickKnob);
  });
  
  joystick.addEventListener('touchmove', (e) => {
    e.preventDefault();
    updateJoystick(e.touches[0], joystick, joystickKnob);
  });
  
  joystick.addEventListener('touchend', (e) => {
    e.preventDefault();
    resetJoystick(joystick, joystickKnob);
  });
  
  joystick.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    resetJoystick(joystick, joystickKnob);
  });
  
  actionBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    actionBtn.style.transform = 'scale(0.9)';
    const direction = (virtualKeys['a'] || virtualKeys['arrowleft']) ? -1 : 1;
    if (onBarrelRoll) onBarrelRoll(direction);
  });
  
  actionBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    actionBtn.style.transform = 'scale(1)';
  });
  
  actionBtn.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    actionBtn.style.transform = 'scale(1)';
  });
  
  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      if (mobileControls.style.display === 'flex') {
        mobileControls.style.display = 'none';
      } else {
        mobileControls.style.display = 'flex';
      }
    }
  });
  
  console.log('✓ Mobile controls initialized');
}

function updateJoystick(touch, joystick, joystickKnob) {
  if (!joystickActive) return;
  
  const rect = joystick.getBoundingClientRect();
  joystickCenter.x = rect.left + rect.width / 2;
  joystickCenter.y = rect.top + rect.height / 2;
  
  const deltaX = touch.clientX - joystickCenter.x;
  const deltaY = touch.clientY - joystickCenter.y;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  
  const clampedDistance = Math.min(distance, CONFIG.MOBILE.JOYSTICK_RADIUS);
  const angle = Math.atan2(deltaY, deltaX);
  
  const knobX = Math.cos(angle) * clampedDistance;
  const knobY = Math.sin(angle) * clampedDistance;
  
  joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
  
  const deadZone = CONFIG.MOBILE.DEAD_ZONE;
  
  if (Math.abs(deltaX) > deadZone) {
    virtualKeys['a'] = deltaX < 0;
    virtualKeys['arrowleft'] = deltaX < 0;
    virtualKeys['d'] = deltaX > 0;
    virtualKeys['arrowright'] = deltaX > 0;
  } else {
    virtualKeys['a'] = false;
    virtualKeys['arrowleft'] = false;
    virtualKeys['d'] = false;
    virtualKeys['arrowright'] = false;
  }
  
  if (Math.abs(deltaY) > deadZone) {
    virtualKeys['w'] = deltaY < 0;
    virtualKeys['arrowup'] = deltaY < 0;
    virtualKeys['s'] = deltaY > 0;
    virtualKeys['arrowdown'] = deltaY > 0;
  } else {
    virtualKeys['w'] = false;
    virtualKeys['arrowup'] = false;
    virtualKeys['s'] = false;
    virtualKeys['arrowdown'] = false;
  }
}

function resetJoystick(joystick, joystickKnob) {
  joystickActive = false;
  joystick.classList.remove('active');
  joystickKnob.style.transform = 'translate(-50%, -50%)';
  
  Object.keys(virtualKeys).forEach(key => {
    virtualKeys[key] = false;
  });
}

export function isKeyPressed(key) {
  return keys[key] || virtualKeys[key] || false;
}
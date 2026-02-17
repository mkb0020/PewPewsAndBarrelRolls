// collisions.js
/**
 * CIRCLE-TO-CIRCLE COLLISION DETECTION
 * @param {Object} a - FIRST CIRCLE {X, Y, RADIUS}
 * @param {Object} b - SECOND CIRCLE {X, Y, RADIUS}
 * @returns {boolean} - TRUE IF COLLIDING
 */
export function circleCollision(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < (a.radius + b.radius);
}

/**
 * POINT-TO-CIRCLE COLLISION DETECTION
 * @param {Object} point - POINT {X, Y}
 * @param {Object} circle - CIRCLE {X, Y, RADIUS}
 * @returns {boolean} - TRUE IF POINT IS INSIDE CIRCLE
 */
export function pointInCircle(point, circle) {
  const dx = point.x - circle.x;
  const dy = point.y - circle.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < circle.radius;
}

/**
 * RECTANGLE-TO-CIRCLE COLLISION DETECTION
 * @param {Object} rect - RECTANGLE {X, Y, WIDTH, HEIGHT}
 * @param {Object} circle - CIRCLE {X, Y, RADIUS}
 * @returns {boolean} - TRUE IF COLLIDING
 */
export function rectCircleCollision(rect, circle) {
  // FIND THE CLOSEST POINT ON THE RECTANGLE TO THE CIRCLE
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
  
  // CALCULATE DISTANCE FROM CLOSEST POINT TO CIRCLE CENTER
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  return distance < circle.radius;
}
/**
 * LINE SEGMENT TO CIRCLE COLLISION - FIXES FAST PROJECTILES TUNNELING THROUGH ENEMIES
 * @param {Object} seg - SEGMENT {x1, y1, x2, y2}
 * @param {Object} circle - CIRCLE {x, y, radius}
 * @returns {boolean}
 */
export function segmentCircleCollision(seg, circle) {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const fx = seg.x1 - circle.x;
  const fy = seg.y1 - circle.y;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - circle.radius * circle.radius;

  let discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return false;

  discriminant = Math.sqrt(discriminant);
  const t1 = (-b - discriminant) / (2 * a);
  const t2 = (-b + discriminant) / (2 * a);

  // HIT - IF INTERSECTION IS ANYWHERE ALONG THE SEGMENT (t BETWEEN 0 AND 1)
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}
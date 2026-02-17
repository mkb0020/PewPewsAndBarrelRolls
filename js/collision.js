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
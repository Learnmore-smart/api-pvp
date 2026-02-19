const { ARENA_WIDTH, ARENA_HEIGHT, OBSTACLE_WALL, OBSTACLE_CRATE } = require('./constants');

class Arena {
  constructor() {
    this.width = ARENA_WIDTH;
    this.height = ARENA_HEIGHT;
    this.obstacles = [];
    this._generateObstacles();
  }

  _generateObstacles() {
    // Border walls (thin inner border at 0 and max)
    // Represented as rectangles { x, y, w, h, type }

    // Some interior obstacles – crates and walls
    const layouts = [
      // Center cross
      { x: 18, y: 13, w: 4, h: 1, type: OBSTACLE_WALL },
      { x: 19, y: 11, w: 1, h: 5, type: OBSTACLE_WALL },

      // Corner blocks
      { x: 5,  y: 5,  w: 2, h: 2, type: OBSTACLE_CRATE },
      { x: 33, y: 5,  w: 2, h: 2, type: OBSTACLE_CRATE },
      { x: 5,  y: 23, w: 2, h: 2, type: OBSTACLE_CRATE },
      { x: 33, y: 23, w: 2, h: 2, type: OBSTACLE_CRATE },

      // Side walls
      { x: 12, y: 8,  w: 1, h: 4, type: OBSTACLE_WALL },
      { x: 27, y: 8,  w: 1, h: 4, type: OBSTACLE_WALL },
      { x: 12, y: 18, w: 1, h: 4, type: OBSTACLE_WALL },
      { x: 27, y: 18, w: 1, h: 4, type: OBSTACLE_WALL },

      // Horizontal barriers
      { x: 8,  y: 15, w: 3, h: 1, type: OBSTACLE_CRATE },
      { x: 29, y: 15, w: 3, h: 1, type: OBSTACLE_CRATE },
    ];

    this.obstacles = layouts;
  }

  isBlocked(x, y, size = 0) {
    // Arena bounds
    if (x - size < 0 || x + size > this.width) return true;
    if (y - size < 0 || y + size > this.height) return true;

    // Obstacle collision (AABB vs circle)
    for (const obs of this.obstacles) {
      if (this._circleRectCollision(x, y, size, obs.x, obs.y, obs.w, obs.h)) {
        return true;
      }
    }
    return false;
  }

  _circleRectCollision(cx, cy, cr, rx, ry, rw, rh) {
    const nearestX = Math.max(rx, Math.min(cx, rx + rw));
    const nearestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    return (dx * dx + dy * dy) <= (cr * cr);
  }

  getSpawnPoint(existingPositions = []) {
    const margin = 2;
    for (let attempt = 0; attempt < 200; attempt++) {
      const x = margin + Math.random() * (this.width - margin * 2);
      const y = margin + Math.random() * (this.height - margin * 2);

      if (this.isBlocked(x, y, 0.5)) continue;

      // Check distance from other players
      const tooClose = existingPositions.some(
        p => Math.hypot(p.x - x, p.y - y) < 4
      );
      if (tooClose) continue;

      return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    }
    // Fallback
    return { x: margin, y: margin };
  }

  toJSON() {
    return {
      width: this.width,
      height: this.height,
      obstacles: this.obstacles,
    };
  }
}

module.exports = Arena;

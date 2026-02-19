const { MAX_ACTIONS_PER_SECOND } = require('../game/constants');

// Per-player rate limiting using a sliding window
const playerActionTimestamps = new Map(); // playerId → [timestamps]

function rateLimiter(req, res, next) {
  const playerId = req.body && req.body.player_id;
  if (!playerId) return next(); // no player_id, skip rate limiting

  const now = Date.now();
  const windowMs = 1000;

  if (!playerActionTimestamps.has(playerId)) {
    playerActionTimestamps.set(playerId, []);
  }

  const timestamps = playerActionTimestamps.get(playerId);

  // Remove timestamps outside the window
  while (timestamps.length > 0 && timestamps[0] < now - windowMs) {
    timestamps.shift();
  }

  if (timestamps.length >= MAX_ACTIONS_PER_SECOND) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `Max ${MAX_ACTIONS_PER_SECOND} actions per second`,
    });
  }

  timestamps.push(now);
  next();
}

function clearPlayerRateLimit(playerId) {
  playerActionTimestamps.delete(playerId);
}

module.exports = { rateLimiter, clearPlayerRateLimit };

const GameEngine = require('./GameEngine');

/**
 * Manages one private GameEngine per registered player.
 * Each sandbox is completely isolated — players cannot see each other's
 * positions, bullets, or strategies until the battle starts.
 */
class SandboxManager {
  constructor() {
    this.sandboxes = new Map(); // playerId → GameEngine
  }

  /**
   * Create a sandbox for a new player. Returns the player object (with id)
   * or an error if the username is taken in the global registry.
   */
  createForPlayer(username) {
    const engine = new GameEngine();
    engine.isSandbox = true;
    const result = engine.registerPlayer(username);
    if (result.error) return { error: result.error };

    const { player } = result;
    this.sandboxes.set(player.id, engine);
    return { playerId: player.id, player, engine };
  }

  get(playerId) {
    return this.sandboxes.get(playerId) || null;
  }

  has(playerId) {
    return this.sandboxes.has(playerId);
  }

  remove(playerId) {
    const engine = this.sandboxes.get(playerId);
    if (engine) engine._stopTickLoop();
    this.sandboxes.delete(playerId);
  }
}

module.exports = SandboxManager;

const { v4: uuidv4 } = require('uuid');
const Arena = require('./Arena');
const Player = require('./Player');
const Projectile = require('./Projectile');
const C = require('./constants');

class GameEngine {
  constructor() {
    this.arena = new Arena();
    this.players = new Map();       // id → Player
    this.projectiles = new Map();   // id → Projectile
    this.mode = C.MODE_TEST;        // test | lobby | battle | finished
    this.tickCount = 0;
    this.tickInterval = null;
    this.onStateUpdate = null;      // callback(state)
    this.battleLog = [];
    this.winner = null;
  }

  // ── Player Management ─────────────────────────

  registerPlayer(username, forceId = null, forceColor = null) {
    // Prevent duplicate usernames
    for (const p of this.players.values()) {
      if (p.username === username) {
        return { error: 'Username already taken', player: p };
      }
    }

    const id = forceId || ('p_' + uuidv4().slice(0, 8));
    const existingPositions = [...this.players.values()].map(p => ({ x: p.x, y: p.y }));
    const spawn = this.arena.getSpawnPoint(existingPositions);
    const player = new Player(id, username, spawn.x, spawn.y, forceColor);
    this.players.set(id, player);
    return { player };
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    // Remove their projectiles
    for (const [pid, proj] of this.projectiles) {
      if (proj.ownerId === playerId) this.projectiles.delete(pid);
    }
  }

  getPlayer(playerId) {
    return this.players.get(playerId);
  }

  // ── Action Handling ────────────────────────────

  submitAction(playerId, action, direction, angle = null) {
    const player = this.players.get(playerId);
    if (!player || !player.alive) return { error: 'Invalid player or player is dead' };

    // Validate action
    const validActions = ['move', 'shoot', 'reload', 'shield', 'dash'];
    if (!validActions.includes(action)) {
      return { error: `Invalid action: ${action}` };
    }

    // Validate direction for directional actions — accept named direction OR numeric angle
    if (['move', 'shoot', 'dash'].includes(action)) {
      const hasAngle     = typeof angle === 'number' && isFinite(angle);
      const hasDirection = direction && C.DIRECTIONS[direction];
      if (!hasAngle && !hasDirection) {
        return { error: `Provide direction (up/down/left/right) or angle in degrees (0–360) for '${action}'` };
      }
    }

    // Normalise angle to [0, 360)
    if (typeof angle === 'number') angle = ((angle % 360) + 360) % 360;

    // Queue action — tick loop processes it (both battle and sandbox run a tick loop)
    player.pendingAction = { action, direction, angle };

    return { success: true };
  }

  // ── Ready / Start ──────────────────────────────

  setReady(playerId) {
    const player = this.players.get(playerId);
    if (!player) return { error: 'Player not found' };
    player.ready = true;
    return { success: true, readyCount: this._readyCount(), totalPlayers: this.players.size };
  }

  startBattle() {
    if (this.players.size < 1) {
      return { error: 'Need at least 1 player to start' };
    }

    this.mode = C.MODE_BATTLE;
    this.tickCount = 0;
    this.winner = null;
    this.battleLog = [];

    // Reset all players
    const positions = [];
    for (const player of this.players.values()) {
      const spawn = this.arena.getSpawnPoint(positions);
      player.reset(spawn.x, spawn.y);
      positions.push({ x: spawn.x, y: spawn.y });
    }

    // Clear projectiles
    this.projectiles.clear();

    // Start tick loop
    this._startTickLoop();

    return { success: true, message: 'Battle started!' };
  }

  startSandbox() {
    this.mode = C.MODE_TEST;
    this._startTickLoop();
  }

  stopBattle() {
    this._stopTickLoop();
    this.mode = C.MODE_FINISHED;
  }

  // ── Tick Loop ──────────────────────────────────

  _startTickLoop() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = setInterval(() => this._tick(), C.TICK_INTERVAL_MS);
  }

  _stopTickLoop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  _tick() {
    this.tickCount++;

    // 1. Process all player actions simultaneously
    this._processActions();

    // 2. Move projectiles
    this._moveProjectiles();

    // 3. Check projectile ↔ player collisions
    this._checkProjectileCollisions();

    // 4. Check projectile ↔ wall/obstacle collisions
    this._checkProjectileWallCollisions();

    // 5. Tick cooldowns
    this._tickCooldowns();

    // 6. Energy regen
    if (this.tickCount % C.ENERGY_REGEN_INTERVAL === 0) {
      this._regenEnergy();
    }

    // 7. Clean up dead projectiles
    this._cleanupProjectiles();

    // 8. Check win condition (battle mode)
    if (this.mode === C.MODE_BATTLE) {
      this._checkWinCondition();
    }

    // 9. Broadcast state
    if (this.onStateUpdate) {
      this.onStateUpdate(this.getFullState());
    }
  }

  _processActions() {
    for (const player of this.players.values()) {
      if (!player.alive || !player.pendingAction) continue;

      const { action, direction, angle } = player.pendingAction;
      player.pendingAction = null;

      switch (action) {
        case 'move':   this._handleMove(player, direction, angle);   break;
        case 'shoot':  this._handleShoot(player, direction, angle);  break;
        case 'reload': this._handleReload(player);                   break;
        case 'shield': this._handleShield(player);                   break;
        case 'dash':   this._handleDash(player, direction, angle);   break;
      }
    }
  }

  _handleMove(player, direction, angle = null) {
    let dx, dy;
    if (typeof angle === 'number') {
      const rad = (angle * Math.PI) / 180;
      dx = Math.cos(rad);
      dy = Math.sin(rad);
    } else {
      const dir = C.DIRECTIONS[direction];
      if (!dir) return;
      dx = dir.x;
      dy = dir.y;
    }

    const newX = player.x + dx * C.PLAYER_SPEED;
    const newY = player.y + dy * C.PLAYER_SPEED;

    if (!this.arena.isBlocked(newX, newY, player.size)) {
      let blocked = false;
      for (const other of this.players.values()) {
        if (other.id === player.id || !other.alive) continue;
        if (Math.hypot(newX - other.x, newY - other.y) < player.size + other.size) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        player.x = newX;
        player.y = newY;
      }
    }
  }

  _handleShoot(player, direction, angle = null) {
    if (player.ammo <= 0) return;
    if (player.isReloading) return;

    let bulletCount = 0;
    for (const p of this.projectiles.values()) {
      if (p.ownerId === player.id && p.alive) bulletCount++;
    }
    if (bulletCount >= C.MAX_BULLETS_PER_PLAYER) return;

    let dx, dy;
    if (typeof angle === 'number') {
      const rad = (angle * Math.PI) / 180;
      dx = Math.cos(rad);
      dy = Math.sin(rad);
    } else {
      const dir = C.DIRECTIONS[direction];
      if (!dir) return;
      dx = dir.x;
      dy = dir.y;
    }

    // Normalise to unit vector
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;

    player.ammo--;

    const id = 'b_' + uuidv4().slice(0, 8);
    const spawnX = player.x + dx * (player.size + 0.2);
    const spawnY = player.y + dy * (player.size + 0.2);
    const projectile = new Projectile(id, player.id, spawnX, spawnY, dx, dy);
    this.projectiles.set(id, projectile);
  }

  _handleReload(player) {
    if (player.ammo >= player.maxAmmo) return;
    if (player.isReloading) return;
    player.ammo = Math.min(player.maxAmmo, player.ammo + C.RELOAD_AMOUNT);
    player.reloadCooldown = C.RELOAD_COOLDOWN_TICKS;
  }

  _handleShield(player) {
    if (player.energy < C.SHIELD_ENERGY_COST) return;
    player.energy -= C.SHIELD_ENERGY_COST;
    player.shieldTicks = C.SHIELD_DURATION_TICKS;
  }

  _handleDash(player, direction, angle = null) {
    if (player.energy < C.DASH_ENERGY_COST) return;

    let dx, dy;
    if (typeof angle === 'number') {
      const rad = (angle * Math.PI) / 180;
      const len = Math.hypot(Math.cos(rad), Math.sin(rad));
      dx = Math.cos(rad) / len;
      dy = Math.sin(rad) / len;
    } else {
      const dir = C.DIRECTIONS[direction];
      if (!dir) return;
      dx = dir.x;
      dy = dir.y;
    }

    player.energy -= C.DASH_ENERGY_COST;

    for (let step = 1; step <= C.DASH_DISTANCE; step++) {
      const newX = player.x + dx;
      const newY = player.y + dy;
      if (this.arena.isBlocked(newX, newY, player.size)) break;

      let blocked = false;
      for (const other of this.players.values()) {
        if (other.id === player.id || !other.alive) continue;
        if (Math.hypot(newX - other.x, newY - other.y) < player.size + other.size) {
          blocked = true;
          break;
        }
      }
      if (blocked) break;

      player.x = newX;
      player.y = newY;
    }
  }

  _moveProjectiles() {
    for (const proj of this.projectiles.values()) {
      if (proj.alive) proj.tick();
    }
  }

  _checkProjectileCollisions() {
    for (const proj of this.projectiles.values()) {
      if (!proj.alive) continue;

      for (const player of this.players.values()) {
        if (!player.alive) continue;
        if (player.id === proj.ownerId) continue; // no self-hit

        const dist = Math.hypot(proj.x - player.x, proj.y - player.y);
        if (dist < proj.size + player.size) {
          // Hit!
          const dmg = player.takeDamage(proj.damage);
          proj.destroy();

          // Track stats
          const shooter = this.players.get(proj.ownerId);
          if (shooter) {
            shooter.damageDealt += dmg;
            if (!player.alive) {
              shooter.kills++;
              this.battleLog.push({
                tick: this.tickCount,
                event: 'kill',
                killer: shooter.username,
                victim: player.username,
              });
            }
          }

          this.battleLog.push({
            tick: this.tickCount,
            event: 'hit',
            shooter: proj.ownerId,
            target: player.id,
            damage: dmg,
            shielded: player.isShielded,
          });

          break; // projectile can only hit one target
        }
      }
    }
  }

  _checkProjectileWallCollisions() {
    for (const proj of this.projectiles.values()) {
      if (!proj.alive) continue;
      if (this.arena.isBlocked(proj.x, proj.y, proj.size)) {
        proj.destroy();
      }
    }
  }

  _tickCooldowns() {
    for (const player of this.players.values()) {
      player.tickCooldowns();
    }
  }

  _regenEnergy() {
    for (const player of this.players.values()) {
      if (player.alive) player.regenEnergy();
    }
  }

  _cleanupProjectiles() {
    for (const [id, proj] of this.projectiles) {
      if (!proj.alive) this.projectiles.delete(id);
    }
  }

  _checkWinCondition() {
    // Time limit
    if (this.tickCount >= C.MAX_BATTLE_DURATION_TICKS) {
      this._endBattle();
      return;
    }

    const alivePlayers = [...this.players.values()].filter(p => p.alive);
    if (alivePlayers.length <= 1 && this.players.size > 1) {
      this._endBattle();
    }
  }

  _endBattle() {
    this._stopTickLoop();
    this.mode = C.MODE_FINISHED;

    // Determine winner
    const alivePlayers = [...this.players.values()].filter(p => p.alive);
    if (alivePlayers.length === 1) {
      this.winner = alivePlayers[0];
    } else {
      // Highest HP wins
      const sorted = [...this.players.values()].sort((a, b) => b.hp - a.hp);
      this.winner = sorted[0];
    }

    this.battleLog.push({
      tick: this.tickCount,
      event: 'game_over',
      winner: this.winner ? this.winner.username : 'none',
    });

    // Broadcast final state
    if (this.onStateUpdate) {
      this.onStateUpdate(this.getFullState());
    }
  }

  _readyCount() {
    let count = 0;
    for (const p of this.players.values()) {
      if (p.ready) count++;
    }
    return count;
  }

  // ── State Getters ──────────────────────────────

  getFullState() {
    return {
      mode: this.mode,
      tick: this.tickCount,
      arena: this.arena.toJSON(),
      players: [...this.players.values()].map(p => p.toJSON()),
      projectiles: [...this.projectiles.values()].filter(p => p.alive).map(p => p.toJSON()),
      winner: this.winner ? this.winner.toJSON() : null,
    };
  }

  getPlayerState(playerId) {
    const player = this.players.get(playerId);
    if (!player) return null;

    // Get nearby projectiles (within viewport)
    const viewRange = 12;
    const nearbyProjectiles = [...this.projectiles.values()]
      .filter(p => p.alive && Math.hypot(p.x - player.x, p.y - player.y) < viewRange)
      .map(p => p.toJSON());

    const nearbyPlayers = [...this.players.values()]
      .filter(p => p.id !== playerId && Math.hypot(p.x - player.x, p.y - player.y) < viewRange)
      .map(p => p.toJSON());

    return {
      mode: this.mode,
      tick: this.tickCount,
      self: player.toJSON(),
      nearbyPlayers,
      nearbyProjectiles,
      arena: this.arena.toJSON(),
    };
  }

  getDebugState() {
    return {
      mode: this.mode,
      tick: this.tickCount,
      arena: this.arena.toJSON(),
      players: [...this.players.values()].map(p => ({
        ...p.toJSON(),
        energy: p.energy,
        ammo: p.ammo,
        pendingAction: p.pendingAction,
        shieldTicks: p.shieldTicks,
        reloadCooldown: p.reloadCooldown,
        damageDealt: p.damageDealt,
      })),
      projectiles: [...this.projectiles.values()].map(p => ({
        ...p.toJSON(),
        ticksLived: p.ticksLived,
        maxLifetime: p.maxLifetime,
      })),
      battleLog: this.battleLog.slice(-50),
      winner: this.winner ? this.winner.toJSON() : null,
    };
  }

  // ── Reset for new game ─────────────────────────

  resetToLobby() {
    this._stopTickLoop();
    this.mode = C.MODE_TEST;
    this.tickCount = 0;
    this.projectiles.clear();
    this.battleLog = [];
    this.winner = null;

    const positions = [];
    for (const player of this.players.values()) {
      const spawn = this.arena.getSpawnPoint(positions);
      player.reset(spawn.x, spawn.y);
      positions.push({ x: spawn.x, y: spawn.y });
    }
  }
}

module.exports = GameEngine;

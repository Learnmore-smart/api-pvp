const {
  PLAYER_HP, PLAYER_AMMO,
  PLAYER_MAX_AMMO, PLAYER_SIZE,
  RELOAD_COOLDOWN_TICKS,
} = require('./constants');

class Player {
  constructor(id, username, x, y, color = null) {
    this.id = id;
    this.username = username;
    this.x = x;
    this.y = y;
    this.size = PLAYER_SIZE;

    // Stats
    this.hp = PLAYER_HP;
    this.ammo = PLAYER_AMMO;
    this.maxAmmo = PLAYER_MAX_AMMO;
    this.alive = true;

    // State flags
    this.reloadCooldown = 0;      // remaining reload cooldown ticks
    this.ready = false;

    // Action queue (processed once per tick)
    this.pendingAction = null;

    // Tracking
    this.kills = 0;
    this.damageDealt = 0;

    // Color for rendering — injected so it stays consistent across sandbox and battle
    this.color = color || Player.randomColor();
  }

  static randomColor() {
    const colors = [
      '#e74c3c', '#3498db', '#2ecc71', '#f1c40f',
      '#9b59b6', '#e67e22', '#1abc9c', '#e84393',
      '#00cec9', '#fdcb6e', '#6c5ce7', '#ff7675',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  get isReloading() {
    return this.reloadCooldown > 0;
  }

  takeDamage(amount) {
    if (!this.alive) return 0;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.alive = false;
    }
    return amount;
  }

  tickCooldowns() {
    if (this.reloadCooldown > 0) this.reloadCooldown--;
  }

  reset(x, y) {
    this.hp = PLAYER_HP;
    this.ammo = PLAYER_AMMO;
    this.alive = true;
    this.reloadCooldown = 0;
    this.pendingAction = null;
    this.kills = 0;
    this.damageDealt = 0;
    this.ready = false;
    this.x = x;
    this.y = y;
  }

  toJSON() {
    return {
      id: this.id,
      username: this.username,
      x: Math.round(this.x * 100) / 100,
      y: Math.round(this.y * 100) / 100,
      hp: this.hp,
      ammo: this.ammo,
      alive: this.alive,
      reloading: this.isReloading,
      reloadCooldown: this.reloadCooldown,
      kills: this.kills,
      color: this.color,
    };
  }
}

module.exports = Player;

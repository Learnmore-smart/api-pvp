const express = require('express');
const router = express.Router();

// GameEngine instance is injected via factory
module.exports = function createApiRouter(context) {
  const { sandboxManager, playerRegistry, getEngineForPlayer, doStartBattle, doReset } = context;

  // ── POST /register ───────────────────────────
  // Creates a private sandbox arena for the player.
  router.post('/register', (req, res) => {
    const { username } = req.body;
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return res.status(400).json({ error: 'Username is required' });
    }
    if (username.length > 20) {
      return res.status(400).json({ error: 'Username max 20 characters' });
    }

    const trimmed = username.trim();

    // Check global registry for duplicate usernames
    for (const [id, info] of playerRegistry) {
      if (info.username === trimmed) {
        return res.status(409).json({ error: 'Username already taken', player_id: id });
      }
    }

    // Create isolated sandbox engine for this player
    const result = sandboxManager.createForPlayer(trimmed);
    if (result.error) {
      return res.status(409).json({ error: result.error });
    }

    // Store in global registry (preserving sandbox colour for battle continuity)
    playerRegistry.set(result.playerId, {
      username: trimmed,
      ready: false,
      color: result.player.color,
    });

    res.json({
      player_id: result.playerId,
      username: trimmed,
      position: { x: result.player.x, y: result.player.y },
      message: 'Registered! Your private sandbox is ready. Send actions to test your client.',
      mode: 'sandbox',
    });
  });

  // ── POST /action ─────────────────────────────
  // Routes to the player's sandbox or to the battle engine, whichever is active.
  router.post('/action', (req, res) => {
    const { player_id, action, direction } = req.body;

    if (!player_id) return res.status(400).json({ error: 'player_id is required' });
    if (!action)    return res.status(400).json({ error: 'action is required' });

    if (!playerRegistry.has(player_id)) {
      return res.status(404).json({ error: 'Player not found. Did you register?' });
    }

    const engine = getEngineForPlayer(player_id);
    if (!engine) {
      return res.status(503).json({ error: 'No active game session' });
    }

    const result = engine.submitAction(player_id, action, direction);
    if (result.error) return res.status(400).json(result);

    const state = engine.getPlayerState(player_id);
    res.json({ success: true, state });
  });

  // ── GET /state ───────────────────────────────
  // With ?player_id → returns that player's sandbox or battle state.
  // Without         → full battle state (or lobby state if no battle).
  router.get('/state', (req, res) => {
    const { player_id } = req.query;

    if (player_id) {
      if (!playerRegistry.has(player_id)) {
        return res.status(404).json({ error: 'Player not found' });
      }
      const engine = getEngineForPlayer(player_id);
      if (!engine) return res.status(503).json({ error: 'No active session' });
      const state = engine.getPlayerState(player_id);
      if (!state) return res.status(404).json({ error: 'Player state not found' });
      return res.json(state);
    }

    // Full state — only meaningful during battle
    if (context.battleActive && context.battleEngine) {
      return res.json(context.battleEngine.getFullState());
    }

    // Lobby state
    const players = [];
    for (const [id, info] of playerRegistry) {
      players.push({ id, username: info.username, ready: info.ready });
    }
    res.json({ mode: 'lobby', players });
  });

  // ── POST /ready ──────────────────────────────
  router.post('/ready', (req, res) => {
    const { player_id } = req.body;
    if (!player_id) return res.status(400).json({ error: 'player_id is required' });

    const info = playerRegistry.get(player_id);
    if (!info) return res.status(404).json({ error: 'Player not found' });

    info.ready = true;

    let readyCount = 0;
    for (const p of playerRegistry.values()) { if (p.ready) readyCount++; }

    res.json({
      success: true,
      readyCount,
      totalPlayers: playerRegistry.size,
      message: `${readyCount}/${playerRegistry.size} players ready`,
    });
  });

  // ── POST /start ──────────────────────────────
  router.post('/start', (req, res) => {
    const result = doStartBattle();
    if (result.error) return res.status(400).json(result);
    res.json(result);
  });

  // ── POST /reset ──────────────────────────────
  router.post('/reset', (req, res) => {
    doReset();
    res.json({ success: true, message: 'Reset complete. All players are back in their sandboxes.' });
  });

  // ── GET /debug ───────────────────────────────
  router.get('/debug', (req, res) => {
    const { player_id } = req.query;

    if (player_id) {
      const engine = getEngineForPlayer(player_id);
      if (!engine) return res.status(404).json({ error: 'Player not found or no active session' });
      return res.json(engine.getDebugState());
    }

    if (context.battleActive && context.battleEngine) {
      return res.json(context.battleEngine.getDebugState());
    }

    res.json({
      mode: 'lobby',
      message: 'No active battle. Use GET /debug?player_id=YOUR_ID for sandbox debug.',
      registeredPlayers: playerRegistry.size,
    });
  });

  // ── GET /players ─────────────────────────────
  router.get('/players', (req, res) => {
    const players = [];
    for (const [id, info] of playerRegistry) {
      const engine = getEngineForPlayer(id);
      const player = engine?.getPlayer(id);
      players.push({
        id,
        username: info.username,
        ready: info.ready,
        color: info.color,
        alive: player?.alive ?? true,
        hp: player?.hp ?? 100,
        mode: context.battleActive ? 'battle' : 'sandbox',
      });
    }
    res.json({ players, mode: context.battleActive ? 'battle' : 'lobby' });
  });

  // ── DELETE /player/:id ───────────────────────
  router.delete('/player/:id', (req, res) => {
    const { id } = req.params;
    if (!playerRegistry.has(id)) {
      return res.status(404).json({ error: 'Player not found' });
    }
    playerRegistry.delete(id);
    sandboxManager.remove(id);
    res.json({ success: true, message: 'Player removed' });
  });

  return router;
};

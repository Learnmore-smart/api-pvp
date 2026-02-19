# API PVP — API Reference

**Base URL (local):** `http://localhost:3000`  
**Protocol:** HTTP/REST + WebSocket  
**Content-Type:** `application/json`

---

## 1. Identity

There is no auth token. Endpoints that act on a player require `player_id`.

`player_id` format: `p_<8-char-id>` (example: `p_a1b2c3d4`).

---

## 2. Registration

### `POST /register`

Create a player and private sandbox engine.

**Request body**

```json
{ "username": "Alice" }
```

**Validation**

- username is required
- username must be a string
- username max length is 20
- username must be globally unique

**Success (`200`)**

```json
{
  "player_id": "p_a1b2c3d4",
  "username": "Alice",
  "position": { "x": 12.3, "y": 8.7 },
  "message": "Registered! Your private sandbox is ready. Send actions to test your client.",
  "mode": "sandbox"
}
```

**Errors**

- `400` invalid username
- `409` username already taken

---

## 3. Actions

### `POST /action`

Queue one action for the next tick (20 TPS / every 50ms).

**Rate limit:** 20 actions/second per player.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `player_id` | string | ✓ | must be registered |
| `action` | string | ✓ | one of `move`, `shoot`, `reload` |
| `direction` | string | ○ | `up`, `down`, `left`, `right` |
| `angle` | number | ○ | degrees, normalized to `[0, 360)` |

For `move` and `shoot`, provide either `direction` or `angle`.

**Success (`200`)**

```json
{
  "success": true,
  "state": {
    "mode": "test",
    "tick": 123,
    "self": {
      "id": "p_a1b2c3d4",
      "username": "Alice",
      "x": 12.5,
      "y": 8.0,
      "hp": 100,
      "ammo": 4,
      "alive": true,
      "reloading": false,
      "reloadCooldown": 0,
      "kills": 0,
      "color": "#e74c3c"
    },
    "nearbyPlayers": [],
    "nearbyProjectiles": [],
    "arena": { "width": 40, "height": 30, "obstacles": [] },
    "winner": null
  }
}
```

**Errors**

- `400` missing/invalid action payload
- `404` player not found
- `429` rate limit exceeded
- `503` no active game session

---

## 4. State

### `GET /state`

- With `?player_id=...`: returns player-scoped state
- Without params:
  - during battle: full battle state
  - otherwise: lobby summary

### `GET /state?player_id=p_a1b2c3d4` (`200`)

```json
{
  "mode": "test",
  "tick": 42,
  "self": { "id": "p_a1b2c3d4", "username": "Alice", "hp": 100, "ammo": 5, "alive": true },
  "nearbyPlayers": [],
  "nearbyProjectiles": [],
  "arena": { "width": 40, "height": 30, "obstacles": [] },
  "winner": null
}
```

### `GET /state` while in lobby (`200`)

```json
{
  "mode": "lobby",
  "players": [
    { "id": "p_a1b2c3d4", "username": "Alice", "ready": false }
  ]
}
```

### `GET /state` during battle (`200`)

```json
{
  "mode": "battle",
  "tick": 105,
  "arena": { "width": 40, "height": 30, "obstacles": [] },
  "players": [],
  "projectiles": [],
  "winner": null
}
```

---

## 5. Lobby / Battle Control

### `POST /ready`

```json
{ "player_id": "p_a1b2c3d4" }
```

Returns (`200`):

```json
{
  "success": true,
  "readyCount": 1,
  "totalPlayers": 2,
  "message": "1/2 players ready"
}
```

### `POST /start`

Starts shared battle arena using all registered players.

Returns (`200`):

```json
{ "success": true, "message": "Battle started!" }
```

Returns (`400`) when battle is active or no players are registered.

### `POST /reset`

Stops battle and resets all players to private sandbox state.

Returns (`200`):

```json
{ "success": true, "message": "Reset complete. All players are back in their sandboxes." }
```

---

## 6. Player Management / Debug

### `GET /players`

```json
{
  "players": [
    {
      "id": "p_a1b2c3d4",
      "username": "Alice",
      "ready": false,
      "color": "#e74c3c",
      "alive": true,
      "hp": 100,
      "mode": "sandbox"
    }
  ],
  "mode": "lobby"
}
```

### `DELETE /player/:id`

- `200`: `{ "success": true, "message": "Player removed" }`
- `404`: `{ "error": "Player not found" }`

### `GET /debug`

- `GET /debug?player_id=...` returns full internal state for that player's active engine
- `GET /debug` returns battle debug state when active, else lobby debug summary

---

## 7. WebSocket

**URL:** `ws://localhost:3000?type=<bigscreen|player>&player_id=<optional>`

- `type=bigscreen`: receives full lobby/battle state updates
- `type=player&player_id=...`: receives player-scoped state updates

Server message format:

```json
{ "type": "state", "data": { } }
```

Update frequency is tick-based (~50ms).

---

## 8. Gameplay Constants (current implementation)

- Arena: `40 x 30`
- Tick rate: `20 TPS` (`50ms`)
- Player speed: `0.5` units/action
- HP: `100`
- Ammo: `5`
- Reload cooldown: `10` ticks
- Projectile speed: `2` units/tick
- Projectile damage: `25`
- Projectile lifetime: `50` ticks
- Max bullets alive per player: `5`
- Max battle length: `2400` ticks (~2 minutes)

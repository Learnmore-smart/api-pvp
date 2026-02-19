# API PVP — API Reference

**Base URL:** `https://api-pvp-production.up.railway.app`
**Protocol:** HTTP/REST + WebSocket
**Content-Type:** `application/json` (all POST bodies and responses)

---

## Table of Contents

1. [Authentication / Identity](#1-authentication--identity)
2. [Registration](#2-registration)
3. [Actions](#3-actions)
4. [Game State](#4-game-state)
5. [Lobby & Battle Control](#5-lobby--battle-control)
6. [Player Management](#6-player-management)
7. [WebSocket Feed](#7-websocket-feed)
8. [Game Mechanics](#8-game-mechanics)
9. [Curl Examples](#9-curl-examples)
10. [Example Bot (Python)](#10-example-bot-python)

---

## 1. Authentication / Identity

There is no API key or session token. Every request that targets a specific player
must include that player's `player_id` in the request body or query string.

A `player_id` looks like `p_3f8a1c…` (UUID with a `p_` prefix).

---

## 2. Registration

### `POST /register`

Register a player and receive a player ID. Call this once before sending any actions.

**Request body**

| Field      | Type   | Required | Description            |
|------------|--------|----------|------------------------|
| `username` | string | ✓        | Display name (max 20 chars, must be unique) |

**Response `200`**

```json
{
  "player_id": "p_3f8a1c4d-...",
  "username":  "Alice",
  "color":     "#e74c3c",
  "mode":      "sandbox"
}
```

**Response `400`** — username taken or empty.

```json
{ "error": "Username already taken" }
```

---

## 3. Actions

### `POST /action`

Submit an action for your player. Actions are queued and processed on the next
game tick (20 TPS = every 50 ms). Only one action is processed per tick per player.

**Rate limit:** 20 actions per second per player.

**Request body**

| Field       | Type             | Required | Description                            |
|-------------|------------------|----------|----------------------------------------|
| `player_id` | string           | ✓        | Your player ID from `/register`        |
| `action`    | string           | ✓        | One of: `move`, `shoot`, `shield`, `reload`, `dash` |
| `direction` | string           | ○        | Cardinal: `up`, `down`, `left`, `right` |
| `angle`     | number (0–359)   | ○        | Free-angle in degrees. 0° = right, 90° = down. Takes precedence over `direction` for movement vectors. |

You must supply either `direction` or `angle` (or both) for `move`, `shoot`, and `dash`.
`shield` and `reload` ignore both fields.

**Actions table**

| Action    | Energy cost | Cooldown | Notes |
|-----------|-------------|----------|-------|
| `move`    | 0           | none     | Moves player 0.5 units in the given direction |
| `shoot`   | 0           | none     | Fires a projectile (costs 1 ammo). No ammo → rejected |
| `shield`  | 5           | none     | Activates shield for 1 tick; absorbs all damage |
| `reload`  | 0           | 10 ticks (0.5 s) | Restores all ammo to 5 |
| `dash`    | 8           | none     | Moves player 3 units in the given direction (ignores walls if no collision) |

**Response `200`**

```json
{
  "ok": true,
  "action": "shoot",
  "state": {
    "mode": "sandbox",
    "self": {
      "id":             "p_…",
      "username":       "Alice",
      "x":              12.50,
      "y":              8.00,
      "hp":             100,
      "ammo":           4,
      "energy":         25,
      "alive":          true,
      "shielded":       false,
      "kills":          0,
      "reloadCooldown": 0,
      "shieldTicks":    0,
      "color":          "#e74c3c",
      "ready":          false
    }
  }
}
```

**Response `400`** — invalid action, no ammo, not enough energy, etc.
**Response `404`** — player not found.
**Response `429`** — rate limited.

---

## 4. Game State

### `GET /state`

Returns the current game state. Pass your `player_id` to also get your own
detailed stats in a `self` field.

**Query parameters**

| Param       | Required | Description     |
|-------------|----------|-----------------|
| `player_id` | ○        | Your player ID  |

**Response `200`**

```json
{
  "mode":   "battle",
  "tick":   142,
  "arena": {
    "width":     30,
    "height":    20,
    "obstacles": [
      { "type": "wall",  "x": 5, "y": 3, "w": 3, "h": 1 },
      { "type": "crate", "x": 14, "y": 9, "w": 1, "h": 1 }
    ]
  },
  "players": [
    {
      "id":       "p_…",
      "username": "Alice",
      "x":        12.50,
      "y":        8.00,
      "hp":       85,
      "ammo":     3,
      "energy":   20,
      "alive":    true,
      "shielded": false,
      "kills":    1,
      "color":    "#e74c3c",
      "ready":    true
    }
  ],
  "projectiles": [
    { "id": "b_…", "x": 10.5, "y": 7.0, "dx": 0.707, "dy": -0.707, "ownerId": "p_…" }
  ],
  "self": { /* same shape as players entry, plus reloadCooldown and shieldTicks */ },
  "winner": null
}
```

**`mode` values**

| Value      | Meaning |
|------------|---------|
| `lobby`    | Waiting room — players register and mark ready |
| `sandbox`  | Each player has a private isolated arena for testing |
| `battle`   | Shared arena, PvP active |
| `finished` | Battle ended; `winner` field is set |

---

## 5. Lobby & Battle Control

These endpoints are intended for the host / big-screen operator.

### `POST /ready`

Mark yourself as ready to start the battle.

```json
{ "player_id": "p_…" }
```

Returns `200 { "ok": true }`.

### `POST /start`

Start the battle (host action). All players must be ready or this may be rejected
depending on server configuration.

No body required.

Returns `200 { "ok": true }` or `400 { "error": "…" }`.

### `POST /reset`

Reset the game back to sandbox/lobby mode. Clears all bullets and respawns players.

No body required.

Returns `200 { "ok": true }`.

---

## 6. Player Management

### `GET /players`

Returns a list of all registered players with their current stats.

**Response `200`**

```json
{
  "players": [
    { "id": "p_…", "username": "Alice", "hp": 100, "kills": 0, "alive": true, "ready": false }
  ]
}
```

### `DELETE /player/:id`

Remove (kick) a player from the game. Host action.

**Response `200`** `{ "ok": true }`
**Response `404`** `{ "error": "Player not found" }`

### `GET /debug`

Returns full internal engine state including all player positions, projectiles, and
mode. Useful for bots that want the complete picture.

---

## 7. WebSocket Feed

Connect to the WebSocket server to receive real-time state pushes.

**URL:** `wss://api-pvp-production.up.railway.app?type=<client_type>`

| `type` value | Receives |
|--------------|----------|
| `bigscreen`  | Full state broadcast every tick |
| `player`     | (optional) per-player filtered state |

The server sends JSON messages of the shape:

```json
{ "type": "state", "data": { /* same as GET /state response */ } }
```

Messages are pushed every game tick (~50 ms during battle, on action or change
otherwise).

---

## 8. Game Mechanics

### Arena

- Grid-based, default **30 × 20** tiles
- **Walls** (permanent, indestructible) and **crates** (breakable by projectiles)
- Players and projectiles are blocked by obstacles

### Player stats

| Stat    | Default | Max | Notes |
|---------|---------|-----|-------|
| HP      | 100     | 100 | Each projectile hit deals 20 damage |
| Ammo    | 5       | 5   | Reload restores to 5; 10-tick cooldown |
| Energy  | 25      | 25  | Regenerates 1 per tick; shield costs 5, dash costs 8 |

### Movement

- `move` action moves the player **0.5 units** per action
- `dash` teleports the player **3 units** in the given direction (blocked by walls)
- Angle-based movement: provide `angle` in degrees instead of `direction`
  - `0°` = right (+x), `90°` = down (+y), `180°` = left, `270°` = up

### Projectiles

- Travel at **2 units per tick** (independent of player movement)
- Disappear on wall/obstacle collision
- Deal **20 HP** damage on player hit
- Direction controlled by `direction` (cardinal) or `angle` (degrees)

### Win condition

Last player alive wins. The `mode` transitions to `finished` and `winner` is set.

---

## 9. Curl Examples

```bash
BASE=https://api-pvp-production.up.railway.app

# Register
curl -X POST $BASE/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"MyBot"}'
# → {"player_id":"p_abc123","username":"MyBot","color":"#3498db","mode":"sandbox"}

# Move right
curl -X POST $BASE/action \
  -H 'Content-Type: application/json' \
  -d '{"player_id":"p_abc123","action":"move","direction":"right"}'

# Move at 45 degrees (down-right)
curl -X POST $BASE/action \
  -H 'Content-Type: application/json' \
  -d '{"player_id":"p_abc123","action":"move","angle":45}'

# Shoot at 270 degrees (up)
curl -X POST $BASE/action \
  -H 'Content-Type: application/json' \
  -d '{"player_id":"p_abc123","action":"shoot","angle":270}'

# Reload
curl -X POST $BASE/action \
  -H 'Content-Type: application/json' \
  -d '{"player_id":"p_abc123","action":"reload"}'

# Shield
curl -X POST $BASE/action \
  -H 'Content-Type: application/json' \
  -d '{"player_id":"p_abc123","action":"shield"}'

# Get state
curl "$BASE/state?player_id=p_abc123"

# Mark ready
curl -X POST $BASE/ready \
  -H 'Content-Type: application/json' \
  -d '{"player_id":"p_abc123"}'
```

---

## 10. Example Bot (Python)

```python
import requests, time, math

BASE = "https://api-pvp-production.up.railway.app"

# 1. Register
res = requests.post(f"{BASE}/register", json={"username": "PyBot"})
pid = res.json()["player_id"]
print("Registered:", pid)

# 2. Mark ready
requests.post(f"{BASE}/ready", json={"player_id": pid})

def act(action, direction=None, angle=None):
    body = {"player_id": pid, "action": action}
    if direction: body["direction"] = direction
    if angle is not None: body["angle"] = angle
    r = requests.post(f"{BASE}/action", json=body)
    return r.json()

def get_state():
    r = requests.get(f"{BASE}/state", params={"player_id": pid})
    return r.json()

# 3. Simple loop — move toward nearest enemy and shoot
while True:
    state = get_state()
    if state.get("mode") != "battle":
        time.sleep(0.5)
        continue

    me = state.get("self", {})
    if not me.get("alive", True):
        print("Dead.")
        break

    # Find nearest alive enemy
    enemies = [p for p in state.get("players", [])
               if p["id"] != pid and p.get("alive", True)]
    if not enemies:
        print("No enemies — waiting")
        time.sleep(0.2)
        continue

    enemies.sort(key=lambda e: math.hypot(e["x"] - me["x"], e["y"] - me["y"]))
    target = enemies[0]

    dx = target["x"] - me["x"]
    dy = target["y"] - me["y"]
    angle = math.degrees(math.atan2(dy, dx)) % 360

    # Reload if out of ammo
    if me.get("ammo", 5) == 0:
        act("reload")
        time.sleep(0.55)  # wait for reload cooldown
        continue

    # Shoot at the target
    act("shoot", angle=angle)

    # Move toward target
    act("move", angle=angle)

    time.sleep(0.1)  # ~10 actions/sec, well within rate limit
```

---

*For the latest server source code, see the [GitHub repository](https://github.com/your-username/api-pvp).*

#!/usr/bin/env bash
set -e
BASE="http://localhost:3000"

echo "=== 1. Register ==="
ALICE_JSON=$(curl -sf -X POST "$BASE/register" -H 'Content-Type: application/json' -d '{"username":"Alice"}')
ALICE_ID=$(echo "$ALICE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['player_id'])")
echo "Alice: $ALICE_ID"

BOB_JSON=$(curl -sf -X POST "$BASE/register" -H 'Content-Type: application/json' -d '{"username":"Bob"}')
BOB_ID=$(echo "$BOB_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['player_id'])")
echo "Bob:   $BOB_ID"

echo ""
echo "=== 2. Sandbox isolation ==="
MOVE=$(curl -sf -X POST "$BASE/action" -H 'Content-Type: application/json' \
  -d "{\"player_id\":\"$ALICE_ID\",\"action\":\"move\",\"direction\":\"right\"}")
AX=$(echo "$MOVE" | python3 -c "import sys,json; print(json.load(sys.stdin)['state']['self']['x'])")
echo "Alice moved right, x=$AX (was 5.7, should be ~6.7)"

ALICE_STATE=$(curl -sf "$BASE/state?player_id=$ALICE_ID")
ALICE_NEAR=$(echo "$ALICE_STATE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['nearbyPlayers'])")
ALICE_MODE=$(echo "$ALICE_STATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['mode'])")
echo "Alice mode=$ALICE_MODE  nearbyPlayers=$ALICE_NEAR  (should be [] — Bob invisible)"

BOB_STATE=$(curl -sf "$BASE/state?player_id=$BOB_ID")
BOB_NEAR=$(echo "$BOB_STATE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['nearbyPlayers'])")
echo "Bob   nearbyPlayers=$BOB_NEAR  (should be [] — Alice invisible)"

echo ""
echo "=== 3. Players lobby ==="
curl -sf "$BASE/players" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('mode:', d['mode'])
for p in d['players']:
    print(' ', p['username'], 'ready='+str(p['ready']))
"

echo ""
echo "=== 4. Start battle ==="
START=$(curl -sf -X POST "$BASE/start" -H 'Content-Type: application/json')
echo "$START"

echo ""
echo "=== 5. Battle routing ==="
BATTLE_A=$(curl -sf "$BASE/state?player_id=$ALICE_ID")
BMODE=$(echo "$BATTLE_A" | python3 -c "import sys,json; print(json.load(sys.stdin)['mode'])")
BNEAR=$(echo "$BATTLE_A" | python3 -c "import sys,json; d=json.load(sys.stdin); print([p['username'] for p in d['nearbyPlayers']])")
echo "Alice mode=$BMODE  nearbyPlayers=$BNEAR  (should be battle + ['Bob'])"

echo ""
echo "=== 6. Reset ==="
RESET=$(curl -sf -X POST "$BASE/reset" -H 'Content-Type: application/json')
echo "$RESET"
AFTER=$(curl -sf "$BASE/state?player_id=$ALICE_ID" | python3 -c "import sys,json; print(json.load(sys.stdin)['mode'])")
echo "Post-reset Alice mode=$AFTER  (should be test)"

echo ""
echo "=== ALL DONE ==="

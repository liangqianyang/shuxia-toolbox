#!/bin/sh
# 飞行棋超时/托管路径验证（容器内）
set -e
BASE=http://127.0.0.1:9501
API_KEY=0dc92116a59b1bd23f46ae49f52ef62e4e4d74f7a7b5da2fea16f86aeb62cc0f
T1=ludo-test-token-001
T2=ludo-test-token-002

req() { curl -s -X "$2" "$BASE$3" -H "X-API-Key: $API_KEY" -H "X-User-Token: $1" -H 'Content-Type: application/json' ${4:+-d "$4"}; }

CODE=$(req $T1 POST /api/ludo/room | sed -n 's/.*"code":"\([0-9]*\)".*/\1/p')
req $T2 POST /api/ludo/room/$CODE/join > /dev/null
req $T1 POST /api/ludo/room/$CODE/start > /dev/null
echo "room=$CODE start: $(req $T1 GET "/api/ludo/room/$CODE?since=0" | grep -o '"version":[0-9]*\|"currentSeat":[0-9]*\|"phase":"[a-z]*"' | tr '\n' ' ')"

echo "-- 拨 deadline 到过去，逐秒观察 Timer 清扫 --"
docker_mysql() { mysql -h dev-mysql -uroot -p123456 shuxia_toolbox -e "$1" 2>/dev/null; }
docker_mysql "UPDATE ludo_rooms SET turn_deadline_at='2020-01-01 00:00:00' WHERE code='$CODE'"
for i in 1 2 3; do
  sleep 1.2
  echo "t+${i}: $(req $T1 GET "/api/ludo/room/$CODE?since=0" | grep -o '"version":[0-9]*\|"currentSeat":[0-9]*\|"t":"timeout"\|"t":"skip"\|"t":"takeoff"' | tr '\n' ' ')"
done

echo "-- T2 开托管（正确 JSON）--"
req $T2 POST /api/ludo/room/$CODE/auto -d '{"on":true}' | grep -o '"code":[0-9]*\|"currentSeat":[0-9]*\|"t":"roll","v":[0-9]*,"auto":true' | head -5
echo "after-auto: $(req $T1 GET "/api/ludo/room/$CODE?since=0" | grep -o '"version":[0-9]*\|"currentSeat":[0-9]*\|"auto":[a-z]*' | tr '\n' ' ')"

echo "-- T1 roll+move，之后 T2 应被托管代走 --"
S=$(req $T1 GET "/api/ludo/room/$CODE?since=0")
CS=$(printf '%s' "$S" | sed -n 's/.*"currentSeat":\([0-9]*\).*/\1/p' | head -1)
if [ "$CS" = "0" ]; then
  PH=$(printf '%s' "$S" | grep -o '"phase":"[a-z]*"' | head -1)
  if [ "$PH" = '"phase":"roll"' ]; then
    R=$(req $T1 POST /api/ludo/room/$CODE/roll)
    P=$(printf '%s' "$R" | sed -n 's/.*"legalMoves":\[{"p":\([0-9]*\).*/\1/p' | head -1)
    if [ -n "$P" ]; then
      req $T1 POST /api/ludo/room/$CODE/move -d "{\"plane\":$P}" > /dev/null
      echo "T1 moved plane $P"
    else
      echo "T1 rolled but no moves (skip)"
    fi
  fi
fi
sleep 1
echo "final: $(req $T1 GET "/api/ludo/room/$CODE?since=0" | grep -o '"version":[0-9]*\|"currentSeat":[0-9]*' | tr '\n' ' ')"

req $T1 POST /api/ludo/room/$CODE/leave > /dev/null
req $T2 POST /api/ludo/room/$CODE/leave > /dev/null
docker_mysql "DELETE FROM ludo_rooms"
echo done

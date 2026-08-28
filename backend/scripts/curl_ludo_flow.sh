#!/bin/sh
# 飞行棋联机 curl 全流程验证（容器内跑）：双人局 create→join→start→roll/move 循环到终局。
# 前置：user_sessions 里已有测试 token（见 scripts/seed 或手工 SQL）。
set -e
BASE=http://127.0.0.1:9501
API_KEY=0dc92116a59b1bd23f46ae49f52ef62e4e4d74f7a7b5da2fea16f86aeb62cc0f
T1=ludo-test-token-001
T2=ludo-test-token-002

req() { # req <token> <method> <path> [json]
  if [ -n "$4" ]; then
    curl -s -X "$2" "$BASE$3" -H "X-API-Key: $API_KEY" -H "X-User-Token: $1" -H 'Content-Type: application/json' -d "$4"
  else
    curl -s -X "$2" "$BASE$3" -H "X-API-Key: $API_KEY" -H "X-User-Token: $1"
  fi
}

echo "== create =="
CODE=$(req $T1 POST /api/ludo/room | sed -n 's/.*"code":"\([0-9]*\)".*/\1/p')
echo "room=$CODE"
[ -n "$CODE" ] || exit 1

echo "== join =="
req $T2 POST /api/ludo/room/$CODE/join | head -c 120; echo

echo "== start =="
req $T1 POST /api/ludo/room/$CODE/start | head -c 200; echo

# 循环：读状态，轮到谁谁掷骰、选第一架合法机
turn=0
while : ; do
  turn=$((turn+1))
  [ $turn -gt 2000 ] && { echo "!! 超过 2000 回合未终局，疑似死循环"; exit 1; }
  S=$(req $T1 GET /api/ludo/room/$CODE)
  STATUS=$(printf '%s' "$S" | sed -n 's/.*"status":"\([a-z]*\)".*/\1/p')
  [ "$STATUS" = "finished" ] && { echo "== finished after $turn polls =="; printf '%s' "$S" | head -c 1500; echo; break; }
  SEAT=$(printf '%s' "$S" | sed -n 's/.*"currentSeat":\([0-9]*\).*/\1/p' | head -1)
  PHASE=$(printf '%s' "$S" | sed -n 's/.*"phase":"\([a-z]*\)".*/\1/p' | head -1)
  MYSEAT1=$(printf '%s' "$S" | sed -n 's/.*"mySeat":0.*/0/p' | head -1)
  # 玩家一的 mySeat 固定 0、玩家二固定 1；按 currentSeat 选 token
  if [ "$SEAT" = "0" ]; then TK=$T1; else TK=$T2; fi
  if [ "$PHASE" = "roll" ]; then
    R=$(req $TK POST /api/ludo/room/$CODE/roll)
    ERR=$(printf '%s' "$R" | sed -n 's/.*"code":\([0-9]*\).*/\1/p' | head -1)
    if [ "$ERR" != "0" ] && [ -n "$ERR" ]; then echo "!! roll err: $R"; exit 1; fi
  else
    # 选 legalMoves 里第一架机
    P=$(printf '%s' "$R" | sed -n 's/.*"legalMoves":\[{"p":\([0-9]*\).*/\1/p' | head -1)
    if [ -z "$P" ]; then
      S2=$(req $TK GET /api/ludo/room/$CODE?since=0)
      P=$(printf '%s' "$S2" | sed -n 's/.*"legalMoves":\[{"p":\([0-9]*\).*/\1/p' | head -1)
    fi
    [ -z "$P" ] && { echo "!! move 阶段无合法走法（异常）"; exit 1; }
    M=$(req $TK POST /api/ludo/room/$CODE/move "{\"plane\":$P}")
    ERR=$(printf '%s' "$M" | sed -n 's/.*"code":\([0-9]*\).*/\1/p' | head -1)
    if [ "$ERR" != "0" ] && [ -n "$ERR" ]; then echo "!! move err: $M"; exit 1; fi
  fi
done

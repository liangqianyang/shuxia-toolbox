# 井字棋（联机快局）规则 · 唯一事实源

> 事实源：后端 `App\Service\Tictactoe\TictactoeRule`、前端 `src/utils/tictactoe.ts`、`test/algo.test.ts` tictactoe 块以本文为准。
>
> - 对外名：**井字棋**（tool_key `tictactoe`）；路由 `/pages/tictactoe/index`；HTTP `/api/tictactoe/room…`；WS `/tictactoe/ws`
> - 原型：`docs/tictactoe-redesign/01~03`

## 1. 规则

- 3×3 棋盘，格索引 0-8（行优先）。红 **X** 与蓝 **O** 轮流落子
- 8 条胜利线（3 横 3 竖 2 斜）任一被同方三子占满 → 该方胜，`win_line` 记录线索引
- 九格摆满未连线 → 平局（`draw`）
- 连绩计数 `scores = {x, o, draw}` 跨局累计（ rematch 不清零）

## 2. 状态机与先后手

- `waiting → rps(仅首局，10s，胜者执 X 先行) → playing → finished`
- rematch：**自动交换先后手**（双方交换执子，X 永远先行），不再猜拳；`scores` 保留
- 每步限时 **20 秒**，超时清扫器自动代落随机空格
- `waiting` 中离开 → 关房；`playing` 中离开 → 对方胜（win_reason `forfeit`）

## 3. 数值参数

| 参数 | 值 |
|---|---|
| RPS_SECONDS / RPS_MAX_ROUNDS | 10 / 3 |
| MOVE_SECONDS | 20 |
| CHAT_COOLDOWN_SECONDS / CHAT_KEEP | 3 / 50 |
| 房间码 | 4 位数字 |

## 4. JSON schema

- `board`: `[null|null|null, …]` 9 项，元素 `"x" | "o" | null`
- `scores`: `{ "x": 0, "o": 0, "draw": 0 }`
- `win_line`: 胜利线在 LINES 数组中的下标；无则 null
- 序列化：明棋全量；`myMark` = 请求者执子（'x'|'o'|null）

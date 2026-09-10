/* 算法与布局验证（Node 运行，无 Canvas 依赖）：
 * 1. 像素图：颜色无损通过、透明区为空格、统计一致
 * 2. 带噪照片模拟：去毛点收敛（无 ≤2 格孤立色块）、背景被清除
 * 3. 确定性：同图同参两次输出逐格一致
 * 4. 75×75 大图布局：不超 4000px、cellPx 足够印色号
 */
import { generatePattern, updatePatternCell, recolorColor, eraseColor, useBeadPattern } from '@/composables/useBeadPattern'
import { computeSheetLayout } from '@/utils/sheetRenderer'
import { getPalette } from '@/utils/beadPalette'
import { deltaE2000 } from '@/utils/color'
import { EMPTY_CELL, DEFAULT_PARAMS, type PatternResult } from '@/types/beads'
import type { LotteryOption, LotteryPrize, LotterySpecialGift } from '@/types/lottery'
import {
  calculatePrizePool,
  createBalancedGroups,
  drawWeightedOptions,
  findDuplicateLotteryLines,
  parseLotteryLines,
  pickWeighted,
  validateSpecialGifts,
} from '@/utils/lottery'
import { __setPixels, type PixelBuffer } from './stubCanvasAdapter'
import * as adventureBoard from '@/pages-adventure/utils/adventureBoard'
import * as advConstants from '@/pages-adventure/utils/adventure'
import * as adventureChat from '@/pages-adventure/utils/adventureChat'
import {
  BOARD_SIZE,
  CELL_BLACK,
  CELL_WHITE,
  boardFromMoves,
  boardMetrics,
  colorOfMoveIndex,
  findWinLine,
  intersectionToPoint,
  isLegalMove,
  pointToIntersection,
} from '@/utils/gomoku'
import { canPlay, cardColor, cardLabel, cardValue, isValidCard, isWild, scoreHand, sortHand } from '@/utils/uno'
import {
  BOARD_W,
  CLEAR_FLASH_MS,
  applyAction,
  collides,
  createGame,
  emptyBoard,
  gravityIntervalMs,
  levelFrom,
  pieceCells,
  shuffledBag,
  type ActivePiece,
  type PieceId,
  type TetrisState,
} from '@/utils/tetris'
import { computeTetrisLayout } from '@/utils/tetrisRender'
import { createDragController, defaultDragConfig } from '@/utils/touchGestures'
import {
  DIRS,
  applyAction as sokApplyAction,
  createGame as sokCreateGame,
  isDeadCell,
  parseLevel,
  starsFor,
  type SokobanLevelDef,
  type SokobanState,
} from '@/utils/sokoban'
import { nextPush, solve as sokSolve } from '@/utils/sokobanSolver'
import { CHAPTERS, LEVELS, LEVELS_PER_CHAPTER } from '@/utils/sokobanLevels'
import {
  CRUSH_CELL,
  FLY_FROM,
  FLY_TO,
  HANGAR,
  JOURNEY,
  PLANES,
  STAR_CELLS,
  absoluteCell,
  applyMove,
  colorStart,
  computePlaces,
  initialState,
  isGameOver,
  legalMoves,
  nextSeat,
  pickAuto,
  resolveMove,
  seatFinished,
  victimsAt,
  type LudoCoreState,
} from '@/pages-ludo/utils/ludo'

function testUno() {
  // 牌编码解析
  assert(cardColor('r5') === 'r' && cardValue('r5') === '5', '数字牌解析')
  assert(cardColor('yS') === 'y' && cardValue('yS') === 'S', '功能牌解析')
  assert(isWild('wW') && isWild('wF') && !isWild('b7'), '百搭判定')
  assert(isValidCard('r0') && isValidCard('g9') && isValidCard('bS') && isValidCard('yR') && isValidCard('rD') && isValidCard('wW') && isValidCard('wF'), '合法牌全部通过')
  assert(!isValidCard('w5') && !isValidCard('x1') && !isValidCard('rX') && !isValidCard('w') && !isValidCard(''), '非法牌全部拒绝')

  // canPlay：颜色匹配 / 面值匹配 / 百搭恒可出 / 均不匹配不可出
  assert(canPlay('r5', 'r9', 'r'), '同色可出')
  assert(canPlay('b5', 'r5', 'r'), '同数字可出')
  assert(canPlay('gS', 'rS', 'r'), '同功能可出')
  assert(canPlay('wW', 'r5', 'r') && canPlay('wF', 'r5', 'r'), '百搭恒可出（bluff 合法，靠质疑）')
  assert(!canPlay('b5', 'r9', 'r'), '颜色数字都不匹配不可出')
  assert(canPlay('y3', 'wW', 'y'), '顶牌是百搭时按 currentColor 匹配')
  assert(!canPlay('r3', 'wW', 'y'), '顶牌是百搭时颜色不符不可出')

  // 计分：数字按面值，功能 20，百搭 50
  assert(scoreHand([]) === 0, '空手牌 0 分')
  assert(scoreHand(['r0', 'y9', 'b3']) === 12, '数字牌按面值')
  assert(scoreHand(['rS', 'gR', 'yD']) === 60, '功能牌 20×3')
  assert(scoreHand(['wW', 'wF']) === 100, '百搭 50×2')
  assert(scoreHand(['r5', 'bD', 'wF']) === 75, '混合计分')

  // 展示名
  assert(cardLabel('r5') === '夏·5', '数字牌展示名（r=夏）')
  assert(cardLabel('gD') === '春·+2', '功能牌展示名')
  assert(cardLabel('wF') === '王牌+4' && cardLabel('wW') === '变色牌', '百搭展示名')

  // 理牌：同色归堆（春绿→夏红→秋黄→冬蓝→百搭），色内 0-9→S/R/D，百搭 变色牌→+4
  assert(JSON.stringify(sortHand(['wF', 'b7', 'r5', 'g0', 'yS', 'wW', 'gD', 'r9', 'rS', 'bD'])) === JSON.stringify(['g0', 'gD', 'r5', 'r9', 'rS', 'yS', 'b7', 'bD', 'wW', 'wF']), '乱序手牌按颜色归堆排序')
  assert(JSON.stringify(sortHand([])) === '[]', '空手牌')
  const source = ['wF', 'r5', 'b3']
  sortHand(source)
  assert(JSON.stringify(source) === JSON.stringify(['wF', 'r5', 'b3']), '理牌不改入参数组')
}


function testLudo() {
  console.log('飞行棋规则镜像（utils/ludo.ts ↔ PHP LudoRule）')
  const state = (planes: number[][], colors = [0, 1, 2, 3]): LudoCoreState => ({
    planes, colors, leftSeats: [], finishedOrder: [], leftProgress: {},
  })
  const st = (seat: number, mine: number[], enemies: Record<number, number[]> = {}): LudoCoreState => {
    const all = Array.from({ length: 4 }, () => Array<number>(PLANES).fill(HANGAR))
    all[seat] = mine
    for (const [s, p] of Object.entries(enemies)) all[Number(s)] = p
    return state(all)
  }

  // 几何：起飞格间隔 13、颜色循环、星标集
  assert(colorStart(0) === 0 && colorStart(1) === 13 && colorStart(2) === 26 && colorStart(3) === 39, '四色起飞格 0/13/26/39')
  assert(absoluteCell(1, 13) === 26 && absoluteCell(3, 13) === 0, '相对 13 落在下一色起飞格（星标）')
  assert(STAR_CELLS.includes(absoluteCell(2, 26)) && STAR_CELLS.includes(absoluteCell(0, 39)), '相对 26/39 也是星标格')

  // 机场：非 6 无走法，掷 6 全员可起飞
  const hangar = initialState(4, 0)
  assert(legalMoves(hangar, 0, 1).length === 0 && legalMoves(hangar, 0, 5).length === 0, '全在机场且非 6：无合法走法')
  const takeoffMoves = legalMoves(hangar, 0, 6)
  assert(takeoffMoves.length === 4 && takeoffMoves.every((m) => m.to === 0 && m.fx[0].t === 'takeoff'), '掷 6：四架均可起飞到 d=0')

  // 起飞格星标共存：敌机停在我起飞格，起飞不击落
  const takeoffMove = resolveMove(st(0, [HANGAR], { 1: [0, -1, -1, -1] }), 0, 0, 6)!
  assert(takeoffMove.fx.every((f) => f.t !== 'capture'), '起飞落自己星标格不击落共存敌机')

  // 反弹参数化：跑道内超出反弹回 [51..55]，恰好到 56 终局
  for (let pos = 51; pos <= 55; pos++) {
    for (let roll = 1; roll <= 6; roll++) {
      const s = st(0, [pos, -1, -1, -1])
      const mv = resolveMove(s, 0, 0, roll)!
      const target = pos + roll
      if (target <= 56) {
        assert(mv.to === target && mv.finish === (target === 56), `跑道 ${pos}+${roll} 直达`)
      } else {
        assert(mv.to === 112 - target && mv.to >= 51 && mv.to <= 55 && !mv.finish, `跑道 ${pos}+${roll} 反弹到 ${mv.to}`)
      }
    }
  }
  assert(resolveMove(st(0, [50, -1, -1, -1]), 0, 0, 6)!.finish, '主道 50+6 恰好终局')
  const bounceMove = resolveMove(st(0, [54, -1, -1, -1]), 0, 0, 5)!
  assert(bounceMove.wp.length === 2 && bounceMove.wp[0].d === 56 && bounceMove.wp[1].d === 53 && bounceMove.fx.length === 0, '反弹航点 [56, 53] 且无效果')

  // 跳跃：4..44 己色格跳 +4；48 死格不跳；跳后不再跳
  assert(resolveMove(st(0, [28, -1, -1, -1]), 0, 0, 4)!.to === 36, '28 掷 4 落 32 → 跳 36 后停（不再连跳）')
  const noJump48 = resolveMove(st(0, [44, -1, -1, -1]), 0, 0, 4)!
  assert(noJump48.to === 48 && noJump48.fx.every((f) => f.t !== 'jump'), '骰落 48 己色但不跳（目标已入跑道）')
  const jump44to48 = resolveMove(st(0, [40, -1, -1, -1]), 0, 0, 4)!
  assert(jump44to48.to === 48 && jump44to48.fx.some((f) => f.t === 'jump'), '骰落 44 → 跳 48 终结')

  // 飞行：直接骰落 16 → 飞行取代跳跃（16→28 接跳 32）；碾压恰为 22
  const flyMove = resolveMove(st(0, [10, -1, -1, -1]), 0, 0, 6)!
  assert(flyMove.to === 32 && !flyMove.fx.some((f) => f.t === 'jump' && f.from === 16), '骰落 16：飞行取代跳跃')
  assert(flyMove.wp.map((w) => w.d).join(',') === '16,28,32' && flyMove.wp[1].arc === true, '飞行航点 16→28(弧)→32')

  // 经典大连招：pos 8 掷 4 → 12 跳 16 飞 28 跳 32（+24）
  const combo = resolveMove(st(0, [8, -1, -1, -1]), 0, 0, 4)!
  assert(combo.to === 32 && combo.fx.some((f) => f.t === 'jump' && f.from === 12) && combo.fx.some((f) => f.t === 'fly'), '大连招 8→12→16→28→32')

  // 碾压：恰为弧下格（移动者色 0 相对 22 = 绝对 22；敌色 1 相对 9 → 绝对 22，相对 8/10 → 21/23）
  const crushMove = resolveMove(st(0, [10, -1, -1, -1], { 1: [9, 8, 10, -1] }), 0, 0, 6)!
  const crushFx = crushMove.fx.find((f) => f.t === 'crush')
  assert(!!crushFx && crushFx.v?.length === 1 && crushFx.v![0][0] === 1 && crushFx.v![0][1] === 0, '碾压恰为弧下格（绝对 22）上的敌机')
  assert(!crushMove.fx.some((f) => f.t === 'capture' && f.v?.some((v) => v[1] === 1 || v[1] === 2)), '弧两侧格（绝对 21/23）不受碾压')

  // 击落：非星标格落敌机全回机场；先击落后跳跃（敌色 3 相对 25 → 绝对 12 = 我色 0 相对 12 落点）
  const capMove = resolveMove(st(0, [8, -1, -1, -1], { 3: [25, -1, -1, -1] }), 0, 0, 4)!
  const capIdx = capMove.fx.findIndex((f) => f.t === 'capture')
  const jumpIdx = capMove.fx.findIndex((f) => f.t === 'jump')
  assert(capIdx >= 0 && capMove.fx[capIdx].v?.length === 1 && capMove.fx[capIdx].v![0][0] === 3, '落敌机格击落敌机')
  assert(jumpIdx > capIdx, '先结算击落再触发跳跃')
  const applied = state([[8, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [25, -1, -1, -1]])
  applyMove(applied, 0, 0, 4)
  assert(applied.planes[3][0] === HANGAR, 'applyMove 把被击落敌机送回机场')
  assert(applied.planes[0][0] === 32, 'applyMove 落定最终坐标（含跳跃/飞行）')

  // 己机共存：同格己机不被击落
  const ownStack = st(0, [12, 12, -1, -1])
  assert(resolveMove(ownStack, 0, 0, 4)!.fx.every((f) => f.t !== 'capture'), '己方飞机同格共存不互撞')

  // 完成与终局：第 4 架到 56 → finishedOrder；终局 = 活跃未完成座位 ≤ 1
  const finState = st(0, [56, 56, 56, 55])
  const finMove = resolveMove(finState, 0, 3, 1)!
  assert(finMove.finish && finMove.to === 56, '跑道 55+1 精确终局')
  applyMove(finState, 0, 3, 1)
  assert(seatFinished(finState, 0) && finState.finishedOrder.includes(0), '第 4 架到终点记入 finishedOrder')
  assert(resolveMove(finState, 0, 0, 6) === null, '已到终点的飞机不能再走（防反弹拉回）')
  assert(!isGameOver(finState, 4), '其余 3 人未完成：对局继续')
  finState.leftSeats = [1, 2]
  assert(isGameOver(finState, 4), '活跃未完成 ≤ 1 即终局')

  // 排名：离开者恒在存活者之后（2 人逃跑判负语义）
  const rankState: LudoCoreState = {
    planes: [[56, 56, 56, 56], [-1, -1, -1, -1]],
    colors: [0, 2], leftSeats: [], finishedOrder: [0], leftProgress: { '1': [50, 48, 20, 10] },
  }
  // 座位 1 是存活未完成 → 第 2 名
  const places2 = computePlaces({ ...rankState, leftSeats: [], leftProgress: {} }, 2)
  assert(places2[0] === 1 && places2[1] === 2, '完成者第 1、存活者第 2')
  const forfeitPlaces = computePlaces({ ...rankState, leftSeats: [1] }, 2)
  assert(forfeitPlaces[0] === 1 && forfeitPlaces[1] === 2, '离开者即使进度更高也排在存活者之后')

  // nextSeat 跳过离开/完成座位
  const skipState: LudoCoreState = {
    planes: [[56, 56, 56, 56], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]],
    colors: [0, 1, 2, 3], leftSeats: [2], finishedOrder: [0], leftProgress: { '2': [-1, -1, -1, -1] },
  }
  assert(nextSeat(skipState, 4, 0) === 1 && nextSeat(skipState, 4, 1) === 3, '回合推进跳过离开与完成座位')

  // 启发式确定性：能终局 > 击落 > 前进量；平局取最小机号
  assert(pickAuto(legalMoves(st(0, [55, 40, 44, -1]), 0, 1)) === 0, '能终局的机优先（55+1）')
  // 敌色 1 相对 24 → 绝对 37 = 我色 0 从 32 掷 5 的落点
  assert(pickAuto(legalMoves(st(0, [32, 20, -1, -1], { 1: [24, -1, -1, -1] }), 0, 5)) === 0, '能击落的走法优先')
  assert(pickAuto(legalMoves(st(0, [10, 10, 10, 10]), 0, 3)) === 0, '平局取最小机号')
  // 反弹走法得分为负（55 掷 5 → 52，-3 分）：唯一走法是反弹时也必须选得出飞机，不能返回 null
  const bounceMoves = legalMoves(st(0, [55, -1, -1, -1]), 0, 5)
  assert(bounceMoves.length === 1 && pickAuto(bounceMoves) === 0, '唯一反弹走法（负分）仍能选出飞机（PHP 同修）')

  // 模糊测试：随机走满整局，不变量校验（确定性 PRNG）
  const rand = rng(20260828)
  for (let game = 0; game < 200; game++) {
    const players = 2 + Math.floor(rand() * 3) // 2-4 人
    const gs = initialState(players, Math.floor(rand() * players))
    let current = Math.floor(rand() * players)
    let turns = 0
    while (!isGameOver(gs, players)) {
      turns++
      if (turns > 5000) throw new Error('模糊测试未终局（死循环）')
      if (gs.leftSeats.includes(current) || gs.finishedOrder.includes(current)) {
        current = nextSeat(gs, players, current)
        continue
      }
      const roll = 1 + Math.floor(rand() * 6)
      const moves = legalMoves(gs, current, roll)
      if (moves.length === 0) {
        // 不变量：掷 6 必有走法（未完成座位）
        if (roll === 6) throw new Error(`掷 6 却无走法（${players} 人局 seat=${current} planes=${gs.planes[current]}）`)
        current = nextSeat(gs, players, current)
        continue
      }
      const pick = moves[Math.floor(rand() * moves.length)]
      applyMove(gs, current, pick.p, roll)
      for (let s = 0; s < players; s++) {
        for (const pos of gs.planes[s]) {
          if (pos !== HANGAR && (pos < 0 || pos > JOURNEY)) throw new Error(`非法坐标 ${pos}`)
        }
      }
      if (roll !== 6 || gs.finishedOrder.includes(current)) current = nextSeat(gs, players, current)
    }
    const places = computePlaces(gs, players)
    assert(Object.keys(places).length === players, `模糊局 ${game} 排名覆盖全部座位`)
    const sortedPlaces = Object.values(places).sort((a, b) => a - b)
    if (JSON.stringify(sortedPlaces) !== JSON.stringify(Array.from({ length: players }, (_, i) => i + 1))) {
      throw new Error(`排名不连续：${JSON.stringify(places)}`)
    }
  }
  assert(true, '200 局随机模糊：全部终局、坐标合法、排名连续、掷 6 必有走法')
}

function testGomoku() {
  // 胜负判定：横/竖/双斜/贴边/长连/阻断/不中
  const place = (board: number[][], cells: Array<[number, number]>, color: number) => {
    cells.forEach(([x, y]) => {
      board[y][x] = color
    })
  }

  const horizontal = boardFromMoves([])
  place(horizontal, [[3, 5], [4, 5], [5, 5], [6, 5]], CELL_BLACK)
  const hLine = findWinLine(horizontal, 7, 5, CELL_BLACK)
  assert(Array.isArray(hLine) && hLine.length === 5, '横五连命中且连线长度为 5')

  const vertical = boardFromMoves([])
  place(vertical, [[7, 10], [7, 11], [7, 12], [7, 13]], CELL_WHITE)
  assert(findWinLine(vertical, 7, 14, CELL_WHITE)?.length === 5, '贴边竖五连命中')

  const diag = boardFromMoves([])
  place(diag, [[2, 2], [3, 3], [4, 4], [6, 6]], CELL_BLACK)
  assert(findWinLine(diag, 5, 5, CELL_BLACK)?.length === 5, '主对角线补中间一子命中')

  const antiDiag = boardFromMoves([])
  place(antiDiag, [[6, 8], [7, 7], [8, 6], [10, 4]], CELL_WHITE)
  assert(findWinLine(antiDiag, 9, 5, CELL_WHITE)?.length === 5, '副对角线命中')

  const overline = boardFromMoves([])
  place(overline, [[3, 0], [4, 0], [5, 0], [6, 0], [8, 0]], CELL_BLACK)
  assert(findWinLine(overline, 7, 0, CELL_BLACK)?.length === 6, '长连（6 子）休闲规则算赢')

  const nearMiss = boardFromMoves([])
  place(nearMiss, [[3, 3], [4, 3], [5, 3], [6, 3]], CELL_BLACK)
  assert(findWinLine(nearMiss, 6, 3, CELL_BLACK) === null, '四连不中')
  const blocked = boardFromMoves([])
  place(blocked, [[4, 3], [5, 3], [6, 3], [7, 3]], CELL_BLACK)
  place(blocked, [[8, 3]], CELL_WHITE)
  assert(findWinLine(blocked, 7, 3, CELL_BLACK) === null, '被对手子阻断不穿过')
  assert(findWinLine(boardFromMoves([]), 7, 7, CELL_BLACK) === null, '空盘孤子不误报')

  // 落子序列 → 棋盘：奇偶交替黑白
  const moves = [
    { x: 7, y: 7 },
    { x: 0, y: 0 },
    { x: 7, y: 8 },
  ]
  const board = boardFromMoves(moves)
  assert(board[7][7] === CELL_BLACK && board[0][0] === CELL_WHITE && board[8][7] === CELL_BLACK, '落子奇偶交替黑白')
  assert(colorOfMoveIndex(0) === 'black' && colorOfMoveIndex(3) === 'white', 'colorOfMoveIndex 奇偶定色')
  assert(!isLegalMove(board, 7, 7), '占用点不可落')
  assert(!isLegalMove(board, -1, 0) && !isLegalMove(board, 0, BOARD_SIZE), '越界不可落')
  assert(isLegalMove(board, 1, 1), '空点可落')

  // 触摸点 → 交叉点
  const metrics = boardMetrics(330)
  const center = intersectionToPoint(7, 7, metrics)
  const hit = pointToIntersection(center.px, center.py, metrics)
  assert(hit?.x === 7 && hit?.y === 7, '精确命中天元')
  const near = pointToIntersection(center.px + metrics.cell * 0.3, center.py - metrics.cell * 0.3, metrics)
  assert(near?.x === 7 && near?.y === 7, '0.3 格偏移就近取整')
  const miss = pointToIntersection(center.px + metrics.cell * 0.5, center.py, metrics)
  assert(miss === null, '超过 0.45 格容差判 miss')
  assert(pointToIntersection(-5, -5, metrics) === null, '棋盘外返回 null')
}


let failures = 0
function assert(cond: boolean, label: string) {
  if (cond) {
    console.log(`  ✓ ${label}`)
  } else {
    failures++
    console.error(`  ✗ ${label}`)
  }
}

function makeBuffer(size: number): PixelBuffer {
  return { data: new Uint8ClampedArray(size * size * 4), width: size, height: size }
}

function setPx(buf: PixelBuffer, x: number, y: number, r: number, g: number, b: number, a = 255) {
  const i = (y * buf.width + x) * 4
  buf.data[i] = r
  buf.data[i + 1] = g
  buf.data[i + 2] = b
  buf.data[i + 3] = a
}

function darkUsedCount(result: PatternResult): number {
  return result.used
    .filter((u) => {
      const [r, g, b] = u.color.rgb
      return 0.2126 * r + 0.7152 * g + 0.0722 * b < 95
    })
    .reduce((sum, u) => sum + u.count, 0)
}

function usedCodes(result: PatternResult): string[] {
  return result.used.map((u) => u.color.code).sort()
}

function fakeBoardPlan(width: number, height: number): PatternResult['boardPlan'] {
  const boardSize: 52 | 104 = width <= 52 && height <= 52 ? 52 : 104
  const cols = Math.ceil(width / boardSize)
  const rows = Math.ceil(height / boardSize)
  return {
    presetKey: 'custom',
    boardSize,
    cols,
    rows,
    total: cols * rows,
    capacityWidth: cols * boardSize,
    capacityHeight: rows * boardSize,
    label: `${cols * rows} 张 ${boardSize} 板`,
  }
}

/** 仍存在的 ≤2 格小色块里，有多少是"低对比噪点"（与邻域多数色 ΔE2000 ≤ 25，本应被去毛点清掉）。
 * 高对比小特征（眼/高光/字迹，ΔE2000>25）是有意保留的，不算噪点——与算法 DESPECKLE_PRESERVE_DE 一致。 */
function lowContrastSpeckCount(result: PatternResult): number {
  const { width: w, height: h, cells } = result
  const palette = getPalette(result.params.paletteKey)
  const seen = new Uint8Array(w * h)
  let specks = 0
  for (let start = 0; start < w * h; start++) {
    if (cells[start] === EMPTY_CELL || seen[start]) continue
    const color = cells[start]
    const member: number[] = []
    const stack = [start]
    seen[start] = 1
    const histogram = new Map<number, number>()
    let colored = 0
    while (stack.length) {
      const cell = stack.pop()!
      member.push(cell)
      const x = cell % w
      const y = (cell / w) | 0
      for (const next of [x > 0 ? cell - 1 : -1, x < w - 1 ? cell + 1 : -1, y > 0 ? cell - w : -1, y < h - 1 ? cell + w : -1]) {
        if (next < 0) continue
        if (cells[next] === color) {
          if (!seen[next]) {
            seen[next] = 1
            stack.push(next)
          }
        } else if (cells[next] !== EMPTY_CELL) {
          colored++
          histogram.set(cells[next], (histogram.get(cells[next]) ?? 0) + 1)
        }
      }
    }
    if (member.length > 2 || colored === 0) continue
    let majorColor = -1
    let majorN = 0
    for (const [c, n] of histogram) if (n > majorN) { majorN = n; majorColor = c }
    if (deltaE2000(palette.colors[color].lab, palette.colors[majorColor].lab) <= 25) specks++
  }
  return specks
}

// mulberry32，与算法内一致的确定性噪声源
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function testPixelArt() {
  console.log('用例 1：透明底像素图（4 色方块）')
  const buf = makeBuffer(64)
  // 四个 16×16 色块按 2×2 摆在中间，外圈透明
  const colors: [number, number, number][] = [
    [252, 40, 60], // ≈ MARD F04
    [255, 200, 48], // ≈ A26
    [0, 0, 0], // H07
    [254, 255, 255], // H02
  ]
  for (let y = 16; y < 48; y++) {
    for (let x = 16; x < 48; x++) {
      const block = (y < 32 ? 0 : 2) + (x < 32 ? 0 : 1)
      const [r, g, b] = colors[block]
      setPx(buf, x, y, r, g, b)
    }
  }
  __setPixels(buf)
  const result = await generatePattern('test', {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'custom',
    gridWidth: 32,
    gridHeight: 32,
    removeBackground: false,
  })

  assert(result.used.length === 4, `恰好 4 种颜色（实际 ${result.used.length}）`)
  const sum = result.used.reduce((acc, u) => acc + u.count, 0)
  assert(sum === result.totalBeads, `图例求和 = 总豆数（${sum} = ${result.totalBeads}）`)
  assert(result.totalBeads === 16 * 16, `非空格数正确（${result.totalBeads} = 256）`)
  let emptyOk = true
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const isCenter = x >= 8 && x < 24 && y >= 8 && y < 24
      const isEmpty = result.cells[y * 32 + x] === EMPTY_CELL
      if (isCenter === isEmpty) emptyOk = false
    }
  }
  assert(emptyOk, '透明区/实心区边界精确')
  const codes = result.used.map((u) => u.color.code).sort()
  assert(
    JSON.stringify(codes) === JSON.stringify(['A26', 'F04', 'H02', 'H07']),
    `匹配到预期色号 ${codes.join(',')}`,
  )
}

async function testNoisyPhoto() {
  console.log('用例 2：带噪照片模拟（纯色背景 + 两个噪声色块）')
  const size = 290
  const buf = makeBuffer(size)
  const noise = rng(42)
  const jitter = (v: number) => Math.max(0, Math.min(255, v + (noise() * 30 - 15)))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 背景：浅蓝
      let r = 205
      let g = 232
      let b = 255
      const dx = x - size / 2
      const dy = y - size / 2
      if (dx * dx + dy * dy < 90 * 90) {
        // 大红圆
        r = 252
        g = 40
        b = 60
      }
      if (x > 40 && x < 110 && y > 40 && y < 110) {
        // 黄色方块
        r = 255
        g = 200
        b = 48
      }
      setPx(buf, x, y, jitter(r), jitter(g), jitter(b))
    }
  }
  __setPixels(buf)
  const params = {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'custom' as const,
    gridWidth: 58,
    gridHeight: 58,
    removeBackground: true,
  }
  const result = await generatePattern('test', params)

  assert(lowContrastSpeckCount(result) === 0, '无低对比噪点毛点（高对比小特征允许保留）')
  // 背景被清除：四角应为空
  const corners = [0, 57, 57 * 58, 58 * 58 - 1]
  assert(corners.every((c) => result.cells[c] === EMPTY_CELL), '边缘背景被清除为空格')
  // 红圆中心应是红色系（F 组）
  const center = result.cells[29 * 58 + 29]
  const centerCode = center === EMPTY_CELL ? 'EMPTY' : result.used.find((u) => u.paletteIndex === center)!.color.code
  assert(/^F/.test(centerCode), `圆心匹配到红色系（${centerCode}）`)

  const again = await generatePattern('test', params)
  assert(
    Buffer.from(result.cells.buffer).equals(Buffer.from(again.cells.buffer)),
    '同图同参两次输出逐格一致（确定性）',
  )
}

async function testLineArtSticker() {
  console.log('用例 3：白底表情包细线保留')
  const size = 96
  const buf = makeBuffer(size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      setPx(buf, x, y, 255, 255, 255)
    }
  }

  const cx = 48
  const cy = 43
  const radius = 28
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      if (Math.abs(dist - radius) <= 1.7) {
        setPx(buf, x, y, 78, 44, 38)
      }
      if ((x - 38) ** 2 + (y - 43) ** 2 <= 2.2 ** 2 || (x - 58) ** 2 + (y - 43) ** 2 <= 2.2 ** 2) {
        setPx(buf, x, y, 78, 44, 38)
      }
      if (x >= 46 && x <= 50 && y >= 48 && y <= 57) {
        setPx(buf, x, y, 78, 44, 38)
      }
    }
  }

  __setPixels(buf)
  const result = await generatePattern('test', {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'custom',
    gridWidth: 38,
    gridHeight: 38,
    removeBackground: true,
  })
  const corners = [0, 37, 37 * 38, 38 * 38 - 1]
  assert(corners.every((c) => result.cells[c] === EMPTY_CELL), '白底边缘背景被清空')
  assert(darkUsedCount(result) >= 20, `深色轮廓/五官保留（${darkUsedCount(result)} 格）`)
  assert(result.used.some((u) => u.color.code === 'H02'), '白色主体保留')
}

async function testLightTransitionCleanup() {
  console.log('用例 4：低对比源坍缩为主色')
  const buf = makeBuffer(64)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      setPx(buf, x, y, 255, 255, 255)
    }
  }
  for (let y = 28; y < 36; y++) {
    for (let x = 28; x < 36; x++) {
      setPx(buf, x, y, 232, 228, 228)
    }
  }

  __setPixels(buf)
  const result = await generatePattern('test', {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'custom',
    gridWidth: 32,
    gridHeight: 32,
    removeBackground: false,
  })
  assert(result.used.length <= 2, `低对比源颜色数很少（实际 ${result.used.length} 色）`)
  assert(result.used[0]?.color.code === 'H02', `主色为白色 H02（实际 ${result.used[0]?.color.code ?? '无'}）`)
}

async function testOutlineUnification() {
  console.log('用例 5：多色合成图（直接映射不变量）')
  const buf = makeBuffer(64)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      setPx(buf, x, y, 254, 255, 255)
    }
  }

  const colors: [number, number, number][] = [
    [90, 33, 33],
    [120, 82, 75],
  ]
  for (let cell = 8; cell <= 23; cell++) {
    const [r, g, b] = colors[cell % 2]
    for (const [cx, cy] of [[cell, 8], [cell, 23], [8, cell], [23, cell]]) {
      const isIntentionalGap = cx === 16 && cy === 8
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          if (isIntentionalGap) {
            setPx(buf, cx * 2 + dx, cy * 2 + dy, 254, 255, 255)
          } else {
            setPx(buf, cx * 2 + dx, cy * 2 + dy, r, g, b)
          }
        }
      }
    }
  }
  for (let cell = 9; cell <= 22; cell++) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        setPx(buf, cell * 2 + dx, 9 * 2 + dy, 138, 163, 134)
      }
    }
  }
  for (let y = 20; y <= 22; y++) {
    for (let x = 14; x <= 17; x++) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          setPx(buf, x * 2 + dx, y * 2 + dy, 199, 115, 98)
        }
      }
    }
  }
  for (let x = 14; x <= 17; x++) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        setPx(buf, x * 2 + dx, 24 * 2 + dy, 199, 115, 98)
      }
    }
  }
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const isRedHalf = dx === 1
      setPx(buf, 18 * 2 + dx, 24 * 2 + dy, isRedHalf ? 199 : 90, isRedHalf ? 115 : 33, isRedHalf ? 98 : 33)
    }
  }

  __setPixels(buf)
  const result = await generatePattern('test', {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'custom',
    gridWidth: 32,
    gridHeight: 32,
    removeBackground: false,
  })
  // 干净管线不变量：不去背景时无空格、无毛点、局部独立色（红色）经直接映射保留
  assert(result.width === 32 && result.height === 32, `尺寸 32×32（实际 ${result.width}×${result.height}）`)
  assert(result.totalBeads === 32 * 32, `不去背景时无空格（实际 ${result.totalBeads}）`)
  assert(lowContrastSpeckCount(result) === 0, '无低对比噪点毛点（高对比小特征允许保留）')
  assert(usedCodes(result).includes('M14'), `局部红色块保留（实际 ${usedCodes(result).join(',')}）`)
}

async function testFeatureSpeckPreserved() {
  console.log('用例 10：高对比小特征（眼睛级）保留，不被去毛点抹掉')
  // 64px → 32 格（每格 2px）。整张铺肤色，正中放 2×2px 深色块 → 恰好 1 个深色格，
  // 四周全是肤色，是典型 1 格高对比"眼珠"。旧的无差别去毛点会把它并入肤色而消失。
  const buf = makeBuffer(64)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      setPx(buf, x, y, 255, 210, 170) // 肤色
    }
  }
  for (let y = 32; y <= 33; y++) {
    for (let x = 32; x <= 33; x++) {
      setPx(buf, x, y, 56, 38, 36) // 眼珠深色
    }
  }
  __setPixels(buf)
  const result = await generatePattern('test', {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'custom',
    gridWidth: 32,
    gridHeight: 32,
    removeBackground: false,
  })
  assert(darkUsedCount(result) > 0, '深色眼珠被保留（未被并入肤色）')
  const center = result.cells[16 * 32 + 16]
  assert(center !== EMPTY_CELL, '中心眼珠格非空')
}

async function testEdgeAntiAliasing() {
  console.log('用例 11：描边边缘清晰（crisp、无毛刺、无过渡杂色）')
  // 左黑右白、边界落在格内正中（px 32 黑 / px 33 白 → 第 16 列格 50/50）。
  // 新逻辑：50/50 边界格深色占够份量 → crisp 取深色（描边细而贴曲线），不平均成中灰杂色；
  // 边界外侧第一格深色占比为 0 → 不强制变深，不渗黑、无毛刺。
  const buf = makeBuffer(64)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      if (x < 33) setPx(buf, x, y, 0, 0, 0)
      else setPx(buf, x, y, 255, 255, 255)
    }
  }
  __setPixels(buf)
  const result = await generatePattern('test', {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'custom',
    gridWidth: 32,
    gridHeight: 32,
    removeBackground: false,
  })
  const lumaOf = (x: number, y: number): number => {
    const idx = result.cells[y * 32 + x]
    if (idx === EMPTY_CELL) return -1
    const [r, g, b] = getPalette(result.params.paletteKey).colors[idx].rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const darkLuma = lumaOf(0, 16) // 纯黑区
  const lightLuma = lumaOf(31, 16) // 纯白区
  const edgeLuma = lumaOf(16, 16) // 50/50 边界格
  const outsideLuma = lumaOf(17, 16) // 边界外侧第一格
  assert(
    edgeLuma <= darkLuma + 25,
    `50/50 边界格 crisp 取深色、不平均成中灰杂色（纯黑 ${darkLuma.toFixed(0)} · 边界 ${edgeLuma.toFixed(0)}）`,
  )
  assert(
    outsideLuma > lightLuma - 30,
    `边界外侧不渗黑、无毛刺（外侧 ${outsideLuma.toFixed(0)} ≈ 纯白 ${lightLuma.toFixed(0)}）`,
  )
}

async function testBulkRecolorErase() {
  console.log('用例 12：批量改色 / 批量擦除（隔离高亮后的操作）')
  const buf = makeBuffer(64)
  const colors: [number, number, number][] = [
    [252, 40, 60], // ≈ F04
    [255, 200, 48], // ≈ A26
    [0, 0, 0], // H07
    [254, 255, 255], // H02
  ]
  for (let y = 16; y < 48; y++) {
    for (let x = 16; x < 48; x++) {
      const block = (y < 32 ? 0 : 2) + (x < 32 ? 0 : 1)
      const [r, g, b] = colors[block]
      setPx(buf, x, y, r, g, b)
    }
  }
  __setPixels(buf)
  const result = await generatePattern('test', {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'custom',
    gridWidth: 32,
    gridHeight: 32,
    removeBackground: false,
  })

  const countOf = (res: PatternResult, code: string) =>
    res.used.find((u) => u.color.code === code)?.count ?? 0
  const idxOf = (res: PatternResult, code: string) =>
    res.used.find((u) => u.color.code === code)?.paletteIndex ?? -1

  const beforeF04 = countOf(result, 'F04')
  const beforeA26 = countOf(result, 'A26')
  const beforeTotal = result.totalBeads

  // 批量改色：F04 → A26
  const recolored = recolorColor(result, idxOf(result, 'F04'), idxOf(result, 'A26'))
  assert(countOf(recolored, 'F04') === 0, '改色后原色 F04 清零')
  assert(
    countOf(recolored, 'A26') === beforeA26 + beforeF04,
    `改色后目标色 A26 = 原 A26 + 原 F04（${countOf(recolored, 'A26')} = ${beforeA26}+${beforeF04}）`,
  )
  assert(recolored.totalBeads === beforeTotal, '改色不改变总豆数')

  // 批量擦除：H07 → 空
  const beforeH07 = countOf(recolored, 'H07')
  const erased = eraseColor(recolored, idxOf(recolored, 'H07'))
  assert(countOf(erased, 'H07') === 0, '擦除后 H07 清零')
  assert(
    erased.totalBeads === beforeTotal - beforeH07,
    `擦除后总豆数减少（${erased.totalBeads} = ${beforeTotal}-${beforeH07}）`,
  )
  assert(erased.cells.some((c) => c === EMPTY_CELL), '擦除产生了空格')
}

async function testUndo() {
  console.log('用例 13：撤销编辑（批量改色 / 批量擦除各算一步）')
  const buf = makeBuffer(64)
  const colors: [number, number, number][] = [
    [252, 40, 60], // ≈ F04
    [255, 200, 48], // ≈ A26
    [0, 0, 0], // H07
    [254, 255, 255], // H02
  ]
  for (let y = 16; y < 48; y++) {
    for (let x = 16; x < 48; x++) {
      const block = (y < 32 ? 0 : 2) + (x < 32 ? 0 : 1)
      const [r, g, b] = colors[block]
      setPx(buf, x, y, r, g, b)
    }
  }
  __setPixels(buf)
  const { params, generate, recolor, eraseAll, undo, canUndo, result } = useBeadPattern()
  params.boardPresetKey = 'custom'
  params.gridWidth = 32
  params.gridHeight = 32
  params.removeBackground = false
  await generate('test')

  const countOf = (code: string) => result.value!.used.find((u) => u.color.code === code)?.count ?? 0
  const idxOf = (code: string) =>
    result.value!.used.find((u) => u.color.code === code)?.paletteIndex ?? -1

  assert(canUndo.value === false, '初始无历史，不可撤销')

  // 批量改色 F04 → A26，再撤销
  recolor(idxOf('F04'), idxOf('A26'))
  assert(canUndo.value === true, '改色后可撤销')
  assert(countOf('F04') === 0, '改色后 F04 清零')
  assert(undo() !== null, '撤销返回结果')
  assert(countOf('F04') === 64, `撤销恢复 F04（${countOf('F04')} = 64）`)
  assert(countOf('A26') === 64, `撤销恢复 A26（${countOf('A26')} = 64）`)
  assert(canUndo.value === false, '撤销唯一一步后不可再撤销')

  // 批量擦除 H07，再撤销
  eraseAll(idxOf('H07'))
  assert(countOf('H07') === 0, '擦除后 H07 清零')
  undo()
  assert(countOf('H07') === 64, `撤销恢复 H07（${countOf('H07')} = 64）`)
}

async function testBoardSizing() {
  console.log('用例 6：真实拼板规格与等比缩放')
  const buf = { data: new Uint8ClampedArray(148 * 160 * 4), width: 148, height: 160 }
  for (let y = 0; y < 160; y++) {
    for (let x = 0; x < 148; x++) {
      setPx(buf, x, y, 252, 40, 60)
    }
  }

  __setPixels(buf)
  const small = await generatePattern('test', { ...DEFAULT_PARAMS, boardPresetKey: 'small-1', removeBackground: false })
  assert(small.width === 48 && small.height === 52, `1 张 52 小板等比生成 48×52（实际 ${small.width}×${small.height}）`)
  assert(small.boardPlan.boardSize === 52 && small.boardPlan.total === 1, '小板方案 = 1 张 52 板')

  __setPixels(buf)
  const twoSmall = await generatePattern('test', { ...DEFAULT_PARAMS, boardPresetKey: 'small-2', removeBackground: false })
  assert(twoSmall.width === 52 && twoSmall.height === 56, `2 张 52 小板等比生成 52×56（实际 ${twoSmall.width}×${twoSmall.height}）`)
  assert(twoSmall.boardPlan.cols === 1 && twoSmall.boardPlan.rows === 2, '2 张 52 板按竖图自动纵向拼接')

  __setPixels(buf)
  const large = await generatePattern('test', { ...DEFAULT_PARAMS, boardPresetKey: 'large-1', removeBackground: false })
  assert(large.width === 96 && large.height === 104, `1 张 104 大板等比生成 96×104（实际 ${large.width}×${large.height}）`)
  assert(large.boardPlan.boardSize === 104 && large.boardPlan.total === 1, '大板方案 = 1 张 104 板')

  __setPixels(buf)
  const simpleAuto = await generatePattern('test', { ...DEFAULT_PARAMS, boardPresetKey: 'auto', removeBackground: false })
  assert(
    simpleAuto.width === 29 && simpleAuto.height === 31,
    `auto 把纯色 148×160 简单图下探到 29×31（简单图不过度膨胀，实际 ${simpleAuto.width}×${simpleAuto.height}）`,
  )
  assert(
    simpleAuto.boardPlan.boardSize === 52 && simpleAuto.boardPlan.total === 1,
    `36×39 用 1 张 52 板（实际 ${simpleAuto.boardPlan.label}）`,
  )

  __setPixels(buf)
  const manual = await generatePattern('test', {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'auto',
    autoGridSize: false,
    gridLongSide: 60,
    removeBackground: false,
  })
  assert(
    Math.max(manual.width, manual.height) === 60,
    `关掉自动、手动定格长边 60（实际 ${manual.width}×${manual.height}）`,
  )
}

async function testAutoBoardRecommendation() {
  console.log('用例 7：auto 模式自动定格数')
  const size = 128
  const buf = makeBuffer(size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      setPx(buf, x, y, 255, 255, 255)
    }
  }

  for (let y = 16; y < 112; y += 8) {
    for (let x = 16; x < 112; x++) {
      setPx(buf, x, y, 80, 44, 40)
    }
  }
  for (let x = 16; x < 112; x += 8) {
    for (let y = 16; y < 112; y++) {
      setPx(buf, x, y, 80, 44, 40)
    }
  }

  __setPixels(buf)
  const result = await generatePattern('test', { ...DEFAULT_PARAMS, boardPresetKey: 'auto', removeBackground: true })
  const smallLong = Math.max(result.width, result.height)
  // 密集网格图边缘密度极高 → auto 顶到上限 64（线密图需要更多格才能分辨细线）
  assert(
    result.width === result.height && smallLong === 64,
    `auto 把 128×128 网格图自适应顶到上限 64×64（实际 ${result.width}×${result.height}）`,
  )
  assert(result.boardPlan.boardSize === 104, `64 格用 104 板（实际 ${result.boardPlan.label}）`)

  console.log('用例 7.1：细节图 auto 生成')
  const detailed = { data: new Uint8ClampedArray(148 * 160 * 4), width: 148, height: 160 }
  for (let y = 0; y < detailed.height; y++) {
    for (let x = 0; x < detailed.width; x++) {
      setPx(detailed, x, y, 255, 255, 255)
    }
  }

  for (let y = 0; y < detailed.height; y++) {
    for (let x = 0; x < detailed.width; x++) {
      const head = ((x - 70) / 46) ** 2 + ((y - 61) / 43) ** 2
      if (head > 0.9 && head < 1.08) setPx(detailed, x, y, 82, 42, 39)
      if ((x - 48) ** 2 + (y - 62) ** 2 < 5 ** 2 || (x - 75) ** 2 + (y - 64) ** 2 < 5 ** 2) {
        setPx(detailed, x, y, 82, 42, 39)
      }
      if (x >= 62 && x <= 67 && y >= 69 && y <= 84) setPx(detailed, x, y, 82, 42, 39)
      const leftWheel = ((x - 57) / 13) ** 2 + ((y - 125) / 20) ** 2
      const rightWheel = ((x - 104) / 11) ** 2 + ((y - 123) / 18) ** 2
      if ((leftWheel > 0.72 && leftWheel < 1.1) || (rightWheel > 0.72 && rightWheel < 1.1)) {
        setPx(detailed, x, y, 72, 70, 78)
      }
      if (x >= 52 && x <= 98 && y >= 103 && y <= 110) setPx(detailed, x, y, 253, 124, 114)
      if (x >= 72 && x <= 86 && y >= 116 && y <= 121) setPx(detailed, x, y, 199, 115, 98)
      if ((x - 116) ** 2 + (y - 43) ** 2 < 16 ** 2 || (x - 129) ** 2 + (y - 43) ** 2 < 16 ** 2) {
        setPx(detailed, x, y, 253, 124, 114)
      }
      if (x > 107 && x < 138 && y > 42 && y < 70 && y - 42 > Math.abs(x - 122) * 0.8) {
        setPx(detailed, x, y, 253, 124, 114)
      }
      const balloonLine = Math.abs(x - (113 + (y - 70) * 0.1)) < 1.4 && y >= 58 && y <= 124
      if (balloonLine) setPx(detailed, x, y, 82, 42, 39)
    }
  }

  __setPixels(detailed)
  const detailedResult = await generatePattern('test', { ...DEFAULT_PARAMS, boardPresetKey: 'auto', removeBackground: true })
  const detailedLong = Math.max(detailedResult.width, detailedResult.height)
  // 线密细节图（骑车熊猫）边缘密度高 → auto 顶到 ~56-64，比旧 52 上限多出的格用来分辨三轮车等细件
  assert(
    detailedLong >= 56 && detailedLong <= 64,
    `auto 把 148×160 细节图自适应顶到 56-64（实际 ${detailedResult.width}×${detailedResult.height}）`,
  )
  assert(detailedResult.boardPlan.boardSize === 104, `细节图用 104 板（实际 ${detailedResult.boardPlan.label}）`)
  assert(detailedResult.totalBeads < 22000, `细节图豆数合理（实际 ${detailedResult.totalBeads} 颗）`)
}

async function testLayout() {
  console.log('用例 8：布局约束')
  const fakeUsed = Array.from({ length: 32 }, (_, i) => ({
    paletteIndex: i,
    color: { code: 'A01', name: '', hex: '#FFFFFF', rgb: [255, 255, 255] as const, lab: { l: 0, a: 0, b: 0 } },
    count: 1,
  }))
  const big: PatternResult = {
    width: 75,
    height: 75,
    cells: new Int16Array(75 * 75),
    used: fakeUsed,
    totalBeads: 75 * 75,
    boardPlan: fakeBoardPlan(75, 75),
    params: { ...DEFAULT_PARAMS, boardPresetKey: 'custom', gridWidth: 75, gridHeight: 75 },
  }
  const layout = computeSheetLayout(big, 4000)
  assert(layout.totalW <= 4000 && layout.totalH <= 4000, `75×75 整图 ≤4000px（${layout.totalW}×${layout.totalH}）`)
  assert(layout.cellPx >= 24, `cellPx 足够印色号（${layout.cellPx}px）`)
  assert(layout.showCodes, '75×75 仍显示格内色号')
  assert(layout.legendCols * layout.legendRows >= 32, '图例容纳全部 32 色')

  const small: PatternResult = {
    ...big,
    width: 29,
    height: 29,
    boardPlan: fakeBoardPlan(29, 29),
    params: { ...DEFAULT_PARAMS, boardPresetKey: 'custom', gridWidth: 29, gridHeight: 29 },
  }
  const layoutSmall = computeSheetLayout(small, 4000)
  assert(layoutSmall.cellPx === 50, `小图 cellPx 顶满 50（${layoutSmall.cellPx}px）`)
}

async function testManualCellEdit() {
  console.log('用例 9：人工改单格同步统计')
  const result: PatternResult = {
    width: 2,
    height: 1,
    cells: new Int16Array([EMPTY_CELL, EMPTY_CELL]),
    used: [],
    totalBeads: 0,
    boardPlan: fakeBoardPlan(2, 1),
    params: { ...DEFAULT_PARAMS, boardPresetKey: 'custom', gridWidth: 2, gridHeight: 1 },
  }

  const filled = updatePatternCell(result, 0, 0, 0)
  assert(filled.cells[0] === 0, '改单格写入目标色')
  assert(filled.totalBeads === 1, `改单格后总豆数更新（${filled.totalBeads}）`)
  assert(filled.used.length === 1 && filled.used[0].count === 1, '改单格后图例统计更新')

  const emptied = updatePatternCell(filled, 0, 0, EMPTY_CELL)
  assert(emptied.cells[0] === EMPTY_CELL, '单格可改为空格')
  assert(emptied.totalBeads === 0 && emptied.used.length === 0, '改为空格后统计清零')
}

async function testDefringe() {
  console.log('用例 13：去背景光晕清理（defringe，主体边缘不留浅色白边）')
  // 带噪近白底（抬高 bg 容差到 realistic）+ 中央饱和红方块主体 + 一圈 ~88% 白的抗锯齿接缝。
  // 接缝像素"够像背景"（落在更宽容差环内）应被 defringe 清掉，否则采样时被平均进边缘格 → 浅色光晕。
  const size = 64
  const buf = makeBuffer(size)
  const rand = rng(4242)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = Math.round(rand() * 6)
      setPx(buf, x, y, 255 - n, 255 - n, 255 - n) // 250-255 近白噪点底
    }
  }
  const subj: [number, number, number] = [215, 45, 55] // 高饱和红
  const lo = 12
  const hi = 52 // 主体 [12,52) = 40×40，占多数，避开"背景>78%跳过去背景"的安全阀
  for (let y = lo; y < hi; y++) {
    for (let x = lo; x < hi; x++) setPx(buf, x, y, subj[0], subj[1], subj[2])
  }
  // 主体外一圈 2px 接缝：88% 白 + 12% 主体（够像背景、chroma>18 不被中性规则清）
  const f = 0.12
  const fr = Math.round(255 * (1 - f) + subj[0] * f)
  const fg = Math.round(255 * (1 - f) + subj[1] * f)
  const fb = Math.round(255 * (1 - f) + subj[2] * f)
  for (let y = lo - 2; y < hi + 2; y++) {
    for (let x = lo - 2; x < hi + 2; x++) {
      const inSubj = x >= lo && x < hi && y >= lo && y < hi
      if (!inSubj) setPx(buf, x, y, fr, fg, fb)
    }
  }

  __setPixels(buf)
  const result = await generatePattern('test', {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'auto',
    removeBackground: true,
  })
  const palette = getPalette(result.params.paletteKey)
  // 光晕豆 = 用到的浅色（luma>210）且非纯中性（chroma>10，即带背景色调的粉白边）
  let haloBeads = 0
  for (const u of result.used) {
    const [r, g, b] = u.color.rgb
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const chroma = Math.max(r, g, b) - Math.min(r, g, b)
    if (luma > 210 && chroma > 10) haloBeads += u.count
  }
  // 主体本身应保留为饱和红（存在 luma<160 的用色）
  const hasSaturatedSubject = result.used.some((u) => {
    const [r, g, b] = u.color.rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 160
  })
  assert(hasSaturatedSubject, `主体保留为饱和色（未被侵蚀）`)
  assert(
    haloBeads <= 3,
    `主体边缘无浅色光晕环（残留光晕豆 ${haloBeads} 颗，应≈0）`,
  )
}

function testLotteryAlgorithms() {
  console.log('用例 14：万能抽奖规则与权重')
  const prizes: LotteryPrize[] = [
    { id: 'speaker', name: '蓝牙音箱', quantity: 1, weight: 1 },
    { id: 'coffee', name: '咖啡券', quantity: 6, weight: 3 },
    { id: 'journal', name: '手账礼盒', quantity: 2, weight: 2 },
  ]
  const gifts: LotterySpecialGift[] = [
    { id: 'gift-1', prizeId: 'journal', quantity: 1, recipient: '林晓' },
    { id: 'gift-2', prizeId: 'coffee', quantity: 1, recipient: '周宁' },
    { id: 'gift-3', prizeId: 'journal', quantity: 1, recipient: '陈意' },
  ]
  const validation = validateSpecialGifts(prizes, gifts)
  assert(validation.valid, '多条特别赠礼在库存内时校验通过')
  assert(validation.reservedByPrize.journal === 2, '同一奖品的多条赠礼会累计预留')
  assert(validation.reservedByPrize.coffee === 1, '不同奖品分别统计预留数量')

  const pendingRecipient = validateSpecialGifts(prizes, [
    { id: 'gift-pending', prizeId: 'coffee', quantity: 1, recipient: '' },
  ], { requireRecipient: false })
  assert(pendingRecipient.valid, '奖品步骤允许先预留库存、到名单步骤再选择赠礼对象')

  const overflow = validateSpecialGifts(prizes, [
    ...gifts,
    { id: 'gift-4', prizeId: 'journal', quantity: 1, recipient: '顾遥' },
  ])
  assert(!overflow.valid && overflow.errors.some((error) => error.includes('超过库存')), '赠礼总数超过库存时阻止开奖')

  const pool = calculatePrizePool(prizes, gifts)
  const speaker = pool.find((item) => item.prizeId === 'speaker')!
  const coffee = pool.find((item) => item.prizeId === 'coffee')!
  const journal = pool.find((item) => item.prizeId === 'journal')!
  assert(journal.remaining === 0 && journal.probability === 0, '全部预留的奖品不再进入随机池')
  assert(coffee.remaining === 5, '随机库存正确扣除特别赠礼')
  assert(Math.abs(coffee.probability - 15 / 16) < 1e-9, '概率按剩余库存 × 权重计算')
  assert(Math.abs(speaker.probability - 1 / 16) < 1e-9, '低权重奖品仍保留正确概率')

  const weighted = [
    { id: 'a', weight: 1 },
    { id: 'b', weight: 3 },
  ]
  assert(pickWeighted(weighted, (item) => item.weight, () => 0)?.id === 'a', '权重区间起点选中第一项')
  assert(pickWeighted(weighted, (item) => item.weight, () => 0.999)?.id === 'b', '权重区间末端选中最后一项')

  const options: LotteryOption[] = [
    { id: 'a', label: '选项 A', weight: 1 },
    { id: 'b', label: '选项 B', weight: 1 },
    { id: 'c', label: '选项 C', weight: 1 },
  ]
  const drawn = drawWeightedOptions(options, 3, new Set(), false, () => 0)
  assert(new Set(drawn.map((item) => item.id)).size === 3, '不放回抽取不会重复')

  const groups = createBalancedGroups(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], 3, () => 0.42)
  const sizes = groups.map((group) => group.length)
  assert(Math.max(...sizes) - Math.min(...sizes) <= 1, '随机分组人数差不超过 1')
  assert(new Set(groups.flat()).size === 8, '随机分组不遗漏也不重复')

  const lines = parseLotteryLines(' 小王 \n小李\n小王\n\n 小张 ')
  assert(JSON.stringify(lines) === JSON.stringify(['小王', '小李', '小张']), '名单解析会清理空行并去重')

  const duplicates = findDuplicateLotteryLines('小王\n小李\n 小王 \n小李\n小张')
  assert(JSON.stringify(duplicates) === JSON.stringify(['小王', '小李']), '重复名单会被识别并提示')
}

async function main() {
  await testPixelArt()
  await testNoisyPhoto()
  await testLineArtSticker()
  await testLightTransitionCleanup()
  await testOutlineUnification()
  await testFeatureSpeckPreserved()
  await testEdgeAntiAliasing()
  await testBulkRecolorErase()
  await testUndo()
  await testBoardSizing()
  await testAutoBoardRecommendation()
  await testLayout()
  await testManualCellEdit()
  await testDefringe()
  testLotteryAlgorithms()
  testGomoku()
  testUno()
  testLudo()
  testAdventure()
  testTetris()
  testSokoban()
  testSokobanLevels()
  if (failures > 0) {
    console.error(`\n${failures} 项断言失败`)
    process.exit(1)
  }
  console.log('\n全部通过')
}

main()

// ══════════════════════════════ 枫趣冒险 ══════════════════════════════

/** 冒险棋：棋盘静态校验（与后端 AdventureBoard 双份同步的锁定断言）+ 几何 + 展示侧公式。 */
function testAdventure() {
  console.log('\n── 枫趣冒险棋盘 ──')

  const { CAMPS, CABLE_STATIONS, CELLS, SEGMENTS, cellToPoint, cellType, isCamp, previewTarget, segmentOf } = adventureBoard

  // 营地 / 缆车站 / 段位（与 docs/adventure-rules.md 一字不差）
  assert(JSON.stringify(CAMPS) === JSON.stringify([21, 41, 61, 81]), '营地 21/41/61/81')
  assert(JSON.stringify(CABLE_STATIONS) === JSON.stringify([14, 38, 62]), '缆车站 14/38/62')
  assert(SEGMENTS.length === 5 && SEGMENTS[4].duelDouble === true, '五段 + 雪线决斗翻倍')
  assert(segmentOf(1).duel === 'rps' && segmentOf(25).duel === 'bid' && segmentOf(50).duel === 'dice' && segmentOf(70).duel === 'rps', '段位决斗形式轮换')

  // 机关图无环：云梯/缆车/岔路捷径只前进，滑坡/落石只后退
  for (const [cellStr, def] of Object.entries(CELLS)) {
    const n = Number(cellStr)
    assert(n >= 1 && n <= 100, `格号范围 ${n}`)
    if (def.type === 'ladder' || def.type === 'cable') assert((def.to ?? 0) > n, `前进机关 ${n}→${def.to}`)
    if (def.type === 'slide') assert((def.to ?? 0) < n, `滑坡只后退 ${n}→${def.to}`)
    if (def.type === 'rock') assert(n - (def.back ?? 0) >= 1, `落石不越界 ${n}`)
    if (def.type === 'fork') {
      for (const opt of def.options ?? []) {
        if (opt.to !== null) assert(opt.to > n, `岔路捷径只前进 ${n}→${opt.to}`)
      }
    }
  }
  // 滑坡/落石落点全部是普通格或营地（唯一例外：落石 16 落 13 枫叶格——温和正面格不级联移动）
  for (const [cellStr, def] of Object.entries(CELLS)) {
    if (def.type === 'slide') {
      const to = def.type === 'slide' ? def.to! : 0
      const tt = cellType(to)
      assert(tt === 'plain' || tt === 'camp' || to === 13, `滑坡 ${cellStr}→${to} 落点 ${tt}`)
    }
  }
  // 大连锁：58 云梯 → 62 缆车 → 79
  assert(CELLS[58]?.to === 62 && CELLS[62]?.to === 79 && cellType(79) === 'plain', '大连锁 58→62→79')

  // 几何：1 在底行左端、100 在顶行、蛇形换行
  assert(Math.abs(cellToPoint(1).x - 0.05) < 1e-9 && Math.abs(cellToPoint(1).y - 0.95) < 1e-9, '格 1 位于底行左端')
  assert(Math.abs(cellToPoint(10).x - 0.95) < 1e-9, '格 10 在底行右端')
  assert(Math.abs(cellToPoint(11).x - 0.95) < 1e-9, '格 11 蛇形折返右端')
  assert(Math.abs(cellToPoint(100).y - 0.05) < 1e-9, '枫顶 100 在顶行')
  const all = Array.from({ length: 100 }, (_, k) => k + 1).map((n) => cellToPoint(n))
  assert(new Set(all.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`)).size === 100, '100 格坐标互不重叠')
  assert(cellToPoint(0).y > 1, '山脚起点在棋盘外（底边下方）')
  for (const camp of CAMPS) assert(isCamp(camp) && CELLS[camp]?.type === 'camp', `营地 ${camp} 格类型`)

  // 展示侧公式：exact 登顶 / 补票 / 反弹
  assert(previewTarget(98, 2, true, 0) === 100, 'exact 登顶')
  assert(previewTarget(98, 12, true, 3) === 100, '枫叶够则补票登顶')
  assert(previewTarget(98, 12, true, 1) === 90, '枫叶不够反弹 98+12=90')
  assert(previewTarget(50, 7, true, 9) === 57, '普通前进落点')

  // 路线长度（房主设定，双份同步）：短局公式与封锁
  assert(JSON.stringify(adventureBoard.GOALS) === JSON.stringify([40, 60, 80, 100]), '路线长度 40/60/80/100')
  assert(adventureBoard.GOAL_LABELS[60] === '溪谷线 · 标准局', '路线名')
  assert(previewTarget(58, 5, true, 2, 60) === 60, '短局补票登顶（goal=60）')
  assert(previewTarget(55, 8, true, 1, 60) === 57, '短局反弹（goal=60）：55+8→57')
  assert(previewTarget(40, 3, false, 0) === 43 || previewTarget(40, 3, false, 0, 40) === 37, '枫林线边界')

  // 道具/天气常量（与后端双份同步：8 道具 / 12 天气牌）
  assert(Object.keys(advConstants.ITEMS).length === 8, '8 种道具')
  assert(Object.keys(advConstants.WEATHER_CARDS).length === 12, '12 张天气牌')
  assert(advConstants.WEATHER_CARDS.summitblizzard.kind === 'rule' && advConstants.WEATHER_CARDS.tornado.kind === 'instant', '稀有牌类型')

  // 通用房间聊天白名单（与后端 Chat\GameChat 双份同步：20 快捷句 / 27 表情 / 10 贴纸，飞行棋/五子棋共用）
{
  const gameChat = require('@/utils/gameChat') as typeof import('@/utils/gameChat')
  assert(gameChat.GAME_PHRASE_GROUPS.reduce((s, g) => s + g.phrases.length, 0) === 20, '通用聊天 20 条快捷句')
  assert(gameChat.GAME_EMOJIS.length === 27, '通用聊天 27 个表情')
  assert(Object.keys(gameChat.GAME_STICKERS).length === 10, '通用聊天 10 张贴纸')
  assert(gameChat.gamePhraseText('nice_move') === '好棋！', '通用聊天 id 反查')
}

// 聊天白名单（与后端 AdventureChat 双份同步：20 快捷句 / 27 表情 / 10 贴纸）
  assert(adventureChat.ADVENTURE_PHRASE_GROUPS.reduce((s, g) => s + g.phrases.length, 0) === 20, '20 条快捷句')
  assert(adventureChat.ADVENTURE_EMOJIS.length === 27, '27 个表情')
  assert(Object.keys(adventureChat.ADVENTURE_STICKERS).length === 10, '10 张贴纸')
  assert(adventureChat.adventurePhraseText('duel_me') === '就决定是你了', '快捷句 id 反查')
}

// ---- 时光纪念卡：日历时刻纯函数 + 偏好拆分 round-trip ----
{
  const ann = require('@/utils/anniversary') as typeof import('@/utils/anniversary')

  // buildCalendarEventTimes：非全天日程落在所选时刻，offset 相对 startTime
  {
    const t = ann.buildCalendarEventTimes(7, '20:30', '2026-10-07')
    const start = new Date(t.startTime * 1000)
    const end = new Date(t.endTime * 1000)
    assert(start.getFullYear() === 2026 && start.getMonth() === 9 && start.getDate() === 7, '提醒日期落在发生日')
    assert(start.getHours() === 20 && start.getMinutes() === 30, '提醒时刻 = 所选 20:30')
    assert(t.endTime - t.startTime === 3600, '日程时长 1 小时')
    assert(t.alarmOffset === 7 * 86400, '提前 7 天 = 604800 秒')
  }
  {
    const t = ann.buildCalendarEventTimes(0, 'bad-time', '2026-10-07')
    const start = new Date(t.startTime * 1000)
    assert(start.getHours() === 9 && start.getMinutes() === 0, '非法时刻回退 09:00')
    assert(t.alarmOffset === 0, '当天提醒 offset 0')
  }

  // remindTime 默认值 + draftFromEvent round-trip
  {
    const draft = ann.emptyAnniversaryDraft('relationship')
    assert(draft.remindTime === '09:00', '新建 draft 默认提醒时刻 09:00')
    assert(draft.remindTime === ann.DEFAULT_REMIND_TIME, '与常量一致')
    assert(ann.REMINDER_TIME_PRESETS.length === 3, '3 个快捷时刻档')
    const event = {
      ...ann.emptyAnniversaryDraft('travel'),
      id: 1,
      remindTime: '20:00',
      calendarAddedAt: '',
      calendarRepeatType: '' as const,
      sortOrder: 0,
      role: 'editor' as const,
      ownerId: 9,
      shared: true,
      memberCount: 2,
      createdAt: '',
      updatedAt: '',
    }
    const round = ann.draftFromEvent(event)
    assert(round.remindTime === '20:00', 'draftFromEvent 保留提醒时刻')
    assert(round.id === 1 && round.title === event.title, 'draftFromEvent round-trip 基本字段')
  }

  // 列表排序：今年未到的由远到近（10-05 在 10-01 前），跨年的排今年之后，已过沉底
  {
    const now = new Date(2026, 8, 8) // 2026-09-08，对齐截图场景
    const eventOf = (id: number, title: string, eventDate: string, extras: Partial<ReturnType<typeof ann.emptyAnniversaryDraft>> = {}) => ({
      ...ann.emptyAnniversaryDraft('custom'),
      ...extras,
      id,
      title,
      eventDate,
      calendarAddedAt: '',
      calendarRepeatType: '' as const,
      sortOrder: 0,
      role: 'owner' as const,
      ownerId: 1,
      shared: false,
      memberCount: 1,
      createdAt: '',
      updatedAt: '',
    })
    const oct5 = eventOf(1, '熊友相识日', '2026-10-05')
    const oct1 = eventOf(2, '十一旅行', '2026-10-01')
    const sep19 = eventOf(3, '快闪店', '2026-09-19')
    const birthday = eventOf(4, '老婆生日', '1995-04-18', { sceneType: 'birthday', repeatType: 'yearly', countMode: 'countdown' })
    const pastJun = eventOf(5, '初访家日', '2026-06-06', { countMode: 'countup' })
    const pastSep = eventOf(6, '打卡日', '2025-09-01', { countMode: 'countup' })
    const titles = ann.sortAnniversaryEvents([sep19, oct1, birthday, pastSep, oct5, pastJun], now).map((item) => item.title)
    assert(JSON.stringify(titles) === JSON.stringify([
      '熊友相识日',
      '十一旅行',
      '快闪店',
      '老婆生日',
      '初访家日',
      '打卡日',
    ]), `今年由远到近：${titles.join(' / ')}`)
  }

  // 时间状态分组（tab 归类 + 段内排序 + 计数 + 来源标记）
  {
    const now = new Date(2026, 8, 8) // 2026-09-08
    const eventOf = (id: number, title: string, eventDate: string, extras: Partial<ReturnType<typeof ann.emptyAnniversaryDraft>> = {}) => ({
      ...ann.emptyAnniversaryDraft('custom'),
      ...extras,
      id,
      title,
      eventDate,
      calendarAddedAt: '',
      calendarRepeatType: '' as const,
      sortOrder: 0,
      role: 'owner' as const,
      ownerId: 1,
      shared: false,
      memberCount: 1,
      createdAt: '',
      updatedAt: '',
    })
    const todayBirthday = eventOf(1, '妈妈生日', '1990-09-08', { sceneType: 'birthday', repeatType: 'yearly', countMode: 'countdown' })
    const weekMeeting = eventOf(2, '周会', '2026-09-12', { repeatType: 'yearly', countMode: 'countdown' })
    const weekTrip = eventOf(3, '出发去大理', '2026-09-10', { sceneType: 'travel' })
    const farExam = eventOf(4, '考研倒计时', '2026-12-20', { sceneType: 'deadline' })
    const pastWedding = eventOf(5, '领证纪念日', '2020-06-06', { sceneType: 'wedding', repeatType: 'yearly' })
    const pastBirthday = eventOf(6, '老婆生日', '1995-04-18', { sceneType: 'birthday', repeatType: 'yearly', countMode: 'countdown' })
    const doneExam = eventOf(7, '毕业典礼', '2026-06-01')
    const counting = eventOf(8, '在一起', '2026-01-01', { sceneType: 'relationship', countMode: 'countup' })
    const g = ann.groupAnniversaryEvents([todayBirthday, weekMeeting, weekTrip, farExam, pastWedding, pastBirthday, doneExam, counting], now)

    assert(g.today.map((e) => e.title).join() === '妈妈生日', `今天段：周年且 daysUntil=0，实际 ${g.today.map((e) => e.title).join()}`)
    assert(g.week.map((e) => e.title).join() === '出发去大理,周会', `7 天内近的在前（沿用原段行为），实际 ${g.week.map((e) => e.title).join()}`)
    assert(g.later.map((e) => e.title).join() === '考研倒计时', '更晚段：一次性倒数也进即将到来')
    assert(g.counting.map((e) => e.title).join() === '在一起', '正计时段')
    assert(g.past.map((e) => e.title).join() === '领证纪念日,老婆生日', `今年已过刚过的在前，实际 ${g.past.map((e) => e.title).join()}`)
    assert(g.onceActive.map((e) => e.title).join() === '考研倒计时,出发去大理', `不重复·倒数中由远到近（沿用原列表规则），实际 ${g.onceActive.map((e) => e.title).join()}`)
    assert(g.onceDone.map((e) => e.title).join() === '毕业典礼', '不重复·已完成：一次性过了不进即将到来')
    assert(g.counts.soon === 5 && g.counts.past === 2 && g.counts.once === 3, `计数 soon/past/once = ${g.counts.soon}/${g.counts.past}/${g.counts.once}`)
    assert(ann.timeStatusOf(pastWedding, now) === 'past', 'timeStatusOf：周年过完 → past')
    assert(ann.timeStatusOf(doneExam, now) === 'once', 'timeStatusOf：一次性 → once')
    assert(ann.timeStatusOf(todayBirthday, now) === 'soon', 'timeStatusOf：周年未到 → soon')
    assert(ann.daysSinceLastOccurrence(ann.computeOccurrence(pastBirthday, now), now) === 143, '今年已过：距今年发生日 143 天')
  }
}

// ══════════════════════════════ 俄罗斯方块 ══════════════════════════════

function testTetris() {
  console.log('俄罗斯方块引擎（utils/tetris.ts）')

  // 种子随机（线性同余），让 7-bag / 出生序列可复现
  let seed = 42
  const rng = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }

  /** 以 createGame 为底板拼一个指定局面的状态（board/active/queue 可覆盖）。 */
  function craft(partials: Partial<TetrisState> & { active: ActivePiece }): TetrisState {
    return { ...createGame(1, rng), ...partials, events: [] }
  }

  // 加量 8-bag：7 种各一 + 加塞一根长条；出生序列取前 8 块（= 完整一袋）
  const bag = shuffledBag(rng)
  assert(bag.length === 9, '9-bag：一袋 9 块（7 种 + 加塞两根长条）')
  assert(bag.filter((id) => id === 'I').length === 2 || bag.some((id) => id === 'M' || id === 'D' || id === 'V'), '每袋保底两根长条（或被变种替换）')
  // 出生序列取每局前 8 块（一整袋；原地硬降堆太高会顶出,不宜连取 16 块）
  for (let round = 0; round < 2; round++) {
    const firstBag: PieceId[] = []
    let seq = createGame(1, rng)
    for (let i = 0; i < 8; i++) {
      firstBag.push((seq.active as ActivePiece).id)
      seq = applyAction(seq, { t: 'hardDrop' })
      if (seq.phase === 'clearing') seq = applyAction(seq, { t: 'tick', dtMs: CLEAR_FLASH_MS })
    }
    assert(firstBag.filter((id) => id === 'I').length >= 1, `第 ${round + 1} 局前 8 块至少一根长条`)
    assert(new Set(firstBag).size >= 6, `第 ${round + 1} 局前 8 块种类不少于 6`)
  }

  // 速度曲线（Guideline）
  assert(gravityIntervalMs(1) === 1000, '速度：1 级 1000ms/行')
  assert(Math.abs(gravityIntervalMs(2) - 793) < 1, '速度：2 级 ≈793ms')
  assert(gravityIntervalMs(15) < 10, '速度：15 级个位数 ms')
  let monotone = true
  for (let lv = 1; lv < 15; lv++) {
    if (gravityIntervalMs(lv) < gravityIntervalMs(lv + 1)) monotone = false
  }
  assert(monotone, '速度：1→15 单调不增')

  // 等级 = 起始 + floor(消行/10)
  assert(levelFrom(1, 0) === 1 && levelFrom(1, 9) === 1 && levelFrom(1, 10) === 2, '升级：每 10 行 +1 级')
  assert(levelFrom(5, 29) === 7 && levelFrom(15, 0) === 15, '升级：起始等级参与')

  // 边界 / 碰撞
  assert(!collides(emptyBoard(), 'T', 3, 0, 0), '碰撞：空盘出生位不碰撞')
  assert(collides(emptyBoard(), 'T', -1, 0, 0), '碰撞：出左墙')
  assert(collides(emptyBoard(), 'T', 3, 19, 0), '碰撞：穿底')
  const occupied = emptyBoard()
  occupied[5 * BOARD_W + 4] = 'I'
  assert(collides(occupied, 'T', 3, 4, 0), '碰撞：撞已占格')
  assert(JSON.stringify(pieceCells('O', 0)) === JSON.stringify(pieceCells('O', 1))
    && JSON.stringify(pieceCells('O', 1)) === JSON.stringify(pieceCells('O', 3)), 'O 块：四旋转态同形')

  // 移动：被挡返回原引用（composable 跳过重绘的依据）
  const atLeftWall = craft({ active: { id: 'T', x: 0, y: 15, rot: 0 } })
  assert(applyAction(atLeftWall, { t: 'move', dx: -1 }) === atLeftWall, '移动：左墙被挡返回原引用')

  // 重力 tick
  let falling = craft({ active: { id: 'T', x: 4, y: 0, rot: 0 } })
  falling = applyAction(falling, { t: 'tick', dtMs: 999 })
  assert(falling.active?.y === 0, '重力：999ms 不足一秒不下落')
  falling = applyAction(falling, { t: 'tick', dtMs: 1 })
  assert(falling.active?.y === 1, '重力：满 1000ms 落一格')
  falling = applyAction(falling, { t: 'tick', dtMs: 30000 })
  assert(falling.active?.y === 18 && falling.gravityMs === 0, '重力：大 dt 直落到底、接地清零累计')

  // SRS 踢墙（y-down 表）——T 地板旋转取 (-1,-1)
  const tOnFloor = craft({ active: { id: 'T', x: 4, y: 18, rot: 0 } })
  const tKicked = applyAction(tOnFloor, { t: 'rotate', dir: 1 })
  assert(tKicked.active?.x === 3 && tKicked.active?.y === 17 && tKicked.active?.rot === 1, '踢墙：T 地板 0→1 用 (-1,-1) 上移一格')

  // 踢墙穷尽 → 旋转 no-op（返回原引用）
  const blocked = emptyBoard()
  blocked[15 * BOARD_W + 4] = 'J'
  blocked[16 * BOARD_W + 4] = 'J'
  blocked[18 * BOARD_W + 5] = 'J'
  const tPinned = craft({ board: blocked, active: { id: 'T', x: 4, y: 16, rot: 0 } })
  assert(applyAction(tPinned, { t: 'rotate', dir: 1 }) === tPinned, '踢墙：五个偏移全被堵 → no-op 原引用')

  // SRS 踢墙 I——地板 0→1 只能走 I 表特有偏移 (+1,-2)
  const iOnFloor = craft({ active: { id: 'I', x: 3, y: 18, rot: 0 } })
  const iKicked = applyAction(iOnFloor, { t: 'rotate', dir: 1 })
  assert(iKicked.active?.x === 4 && iKicked.active?.y === 16 && iKicked.active?.rot === 1, '踢墙：I 地板 0→1 用 (1,-2)（I 表专有）')

  // 消行：行 19 缺 (9,19)，竖 I 补格 → clearing 白闪 → 塌行
  const oneHoleBoard = emptyBoard()
  for (let x = 0; x < 9; x++) oneHoleBoard[19 * BOARD_W + x] = 'J'
  let clearing = craft({ board: oneHoleBoard.slice(), active: { id: 'I', x: 7, y: 0, rot: 1 } })
  clearing = applyAction(clearing, { t: 'hardDrop' })
  assert(clearing.phase === 'clearing' && clearing.clearingRows.join() === '19', '消行：补上缺格 → clearing 相位')
  assert(clearing.events.some((e) => e.t === 'cleared' && e.rows === 1 && e.points === 100), '消行：1 行 100×lv')
  assert(clearing.board[19 * BOARD_W + 9] === 'I', '消行：闪烁期间棋盘已盖章（塌行只删满行）')
  clearing = applyAction(clearing, { t: 'tick', dtMs: CLEAR_FLASH_MS })
  assert(clearing.phase === 'playing', '消行：闪烁计时到 → 回 playing 出生下一块')
  assert(clearing.board[19 * BOARD_W + 9] === 'I' && clearing.board[16 * BOARD_W + 9] === null, '消行：塌行后上方内容整体下移一行')

  // 消行计分 1/2/3/4 行
  for (const [rows, points] of [[1, 100], [2, 300], [3, 500], [4, 800]] as const) {
    const stacked = emptyBoard()
    for (let y = 20 - rows; y < 20; y++) {
      for (let x = 0; x < 9; x++) stacked[y * BOARD_W + x] = 'J'
    }
    let s = craft({ board: stacked, active: { id: 'I', x: 7, y: 0, rot: 1 } })
    s = applyAction(s, { t: 'hardDrop' })
    assert(s.events.some((e) => e.t === 'cleared' && e.rows === rows && e.points === points), `消行计分：${rows} 行 = ${points}×lv`)
    if (rows === 4) {
      s = applyAction(s, { t: 'tick', dtMs: CLEAR_FLASH_MS })
      assert(s.lines === 4 && s.board.every((c) => c === null), 'Tetris：塌行后四行清空')
    }
  }

  // 升级事件：9 行存量 + 1 行 → levelUp 2
  const levelBoard = emptyBoard()
  for (let x = 0; x < 9; x++) levelBoard[19 * BOARD_W + x] = 'J'
  let leveling = craft({ board: levelBoard, lines: 9, active: { id: 'I', x: 7, y: 0, rot: 1 } })
  leveling = applyAction(leveling, { t: 'hardDrop' })
  assert(leveling.lines === 10 && leveling.level === 2 && leveling.events.some((e) => e.t === 'levelUp' && e.level === 2), '升级：满 10 行发 levelUp')

  // 锁定延迟：499 不锁 / 500 锁 / 接地移动重置 / 重置上限 15
  let locking = craft({ active: { id: 'T', x: 4, y: 18, rot: 0 } })
  locking = applyAction(locking, { t: 'tick', dtMs: 499 })
  assert(locking.active !== null, '锁定延迟：499ms 不锁')
  locking = applyAction(locking, { t: 'tick', dtMs: 1 })
  assert(locking.events.some((e) => e.t === 'locked' && e.piece === 'T'), '锁定延迟：满 500ms 固化（盖章并出生下一块）')

  let resetting = craft({ active: { id: 'T', x: 4, y: 18, rot: 0 } })
  resetting = applyAction(resetting, { t: 'tick', dtMs: 400 })
  resetting = applyAction(resetting, { t: 'move', dx: 1 })
  assert(resetting.lockResets === 1 && resetting.lockMs === 0, '锁定延迟：接地移动重置计时')
  resetting = applyAction(resetting, { t: 'tick', dtMs: 400 })
  assert(resetting.active !== null, '锁定延迟：重置后 400ms 仍不锁')

  let capped = craft({ active: { id: 'T', x: 0, y: 18, rot: 0 } })
  for (let i = 0; i < 16; i++) {
    capped = applyAction(capped, { t: 'move', dx: i % 2 === 0 ? 1 : -1 })
  }
  assert(capped.lockResets === 15, `锁定延迟：重置上限 15（实际 ${capped.lockResets}）`)
  capped = applyAction(capped, { t: 'tick', dtMs: 500 })
  assert(capped.events.some((e) => e.t === 'locked'), '锁定延迟：达上限后不再重置，500ms 固化')

  // HOLD：存/出生、每块一次、锁定后恢复、换回暂存块
  let holding = craft({ active: { id: 'T', x: 3, y: 0, rot: 0 }, queue: ['I', 'J', 'L', 'S', 'Z', 'O'] })
  holding = applyAction(holding, { t: 'hold' })
  assert(holding.hold === 'T' && holding.active?.id === 'I', 'HOLD：存当前块、出生队列下一块')
  holding = applyAction(holding, { t: 'hold' })
  assert(holding.events.some((e) => e.t === 'holdBlocked') && holding.hold === 'T' && holding.active?.id === 'I', 'HOLD：同块第二次被拒')
  holding = applyAction(holding, { t: 'hardDrop' })
  assert(holding.holdUsed === false && holding.active?.id === 'J', 'HOLD：锁定后恢复可用')
  holding = applyAction(holding, { t: 'hold' })
  assert(holding.hold === 'J' && holding.active?.id === 'T', 'HOLD：换回暂存块')

  // 硬降：+2/格 并立即锁定（跳过 500ms）
  const dropping = craft({ active: { id: 'I', x: 3, y: 5, rot: 0 } })
  const dropped = applyAction(dropping, { t: 'hardDrop' })
  assert(dropped.score === (18 - 5) * 2, '硬降：+2/格')
  assert(dropped.events.some((e) => e.t === 'hardDropped' && e.cells === 13) && dropped.events.some((e) => e.t === 'locked'), '硬降：立即锁定并盖章（事件链 hardDropped→locked）')
  assert(dropped.board[19 * BOARD_W + 3] === 'I' && dropped.board[19 * BOARD_W + 6] === 'I', '硬降：I 落底占满 cols 3-6')

  // 软降：移动但不计分（手指滑动连续触发，+1/行会被无声刷分）
  const soft = craft({ active: { id: 'T', x: 4, y: 5, rot: 0 } })
  const softed = applyAction(soft, { t: 'softDrop' })
  assert(softed.active?.y === 6 && softed.score === 0, '软降：下一行但不计分')

  // 顶出：出生区被占 → 游戏结束
  const topped = emptyBoard()
  for (let x = 3; x <= 6; x++) topped[x] = 'I'
  let topping = craft({ board: topped, queue: ['T', 'J', 'L', 'S', 'Z', 'O'], active: { id: 'I', x: 3, y: 17, rot: 0 } })
  topping = applyAction(topping, { t: 'hardDrop' })
  assert(topping.phase === 'over' && topping.events.some((e) => e.t === 'gameOver'), '顶出：出生碰撞 → 游戏结束')

  // 纯度：applyAction 不改入参
  const purity = craft({ active: { id: 'T', x: 4, y: 0, rot: 0 } })
  const snapshot = purity.board.slice()
  const mutated = applyAction(purity, { t: 'hardDrop' })
  assert(purity.board.every((c, i) => c === snapshot[i]) && purity.active?.y === 0, '纯度：applyAction 不改入参')
  assert(mutated !== purity, '纯度：返回新引用')

  // 布局：棋盘适配可用高度、右栏不与棋盘重叠、整体不超可用宽
  const layout = computeTetrisLayout(343, 500)
  assert(layout.cell * 20 <= 500 && layout.cell * 10 <= 343, '布局：棋盘适配可用空间')
  assert(layout.holdX >= layout.cell * 10 + 1, '布局：右栏在棋盘右侧不重叠')
  assert(layout.totalW <= 343 && layout.totalH <= 500, '布局：整体不超可用区域')
  assert(layout.holdCell * 4 <= layout.totalW - layout.holdX, '布局：I 块预览放得进右栏')

  // 手势识别器（纯逻辑,注入时钟的合成触摸序列）
  const gestures = { moves: [] as number[], softs: 0, taps: 0, hards: 0, ups: 0 }
  let clock = 0
  const ctrl = createDragController(
    { ...defaultDragConfig(20), now: () => clock },
    {
      onMove: (dx) => { gestures.moves.push(dx) },
      onSoftDrop: () => { gestures.softs++ },
      onTap: () => { gestures.taps++ },
      onHardDrop: () => { gestures.hards++ },
      onSwipeUp: () => { gestures.ups++ },
    },
  )
  const touch = (x: number, y: number) => ({ changedTouches: [{ clientX: x, clientY: y }] })
  ctrl.onTouchStart(touch(100, 100))
  ctrl.onTouchMove(touch(120, 102))
  ctrl.onTouchMove(touch(140, 103))
  ctrl.onTouchMove(touch(161, 104))
  clock = 400
  ctrl.onTouchEnd(touch(161, 104))
  assert(gestures.moves.join() === '1,1,1' && gestures.taps === 0, '手势：水平每 stepPx 一格（长拖不判 tap）')

  clock = 1000
  ctrl.onTouchStart(touch(100, 200))
  clock = 1150
  ctrl.onTouchEnd(touch(100, 320))
  assert(gestures.hards === 1, '手势：150ms/120px 快滑 → 硬降')

  clock = 2000
  ctrl.onTouchStart(touch(50, 50))
  clock = 2060
  ctrl.onTouchEnd(touch(58, 53))
  assert(gestures.taps === 1, '手势：60ms/8px → tap')

  clock = 3000
  ctrl.onTouchStart(touch(100, 300))
  clock = 3350
  ctrl.onTouchEnd(touch(98, 255))
  assert(gestures.ups === 1, '手势：40px+ 上滑 → 上滑手势')

  clock = 4000
  ctrl.onTouchStart(touch(100, 100))
  ctrl.onTouchMove(touch(105, 130))
  ctrl.onTouchMove(touch(90, 152))
  clock = 4500
  ctrl.onTouchEnd(touch(90, 152))
  assert(gestures.softs === 2 && gestures.moves.length === 3, '手势：竖直主导 → 软降且不再横移')

  // 旋转态手性回归：每个块的每个旋转态必须等于上一态顺时针旋转（旋转不改变手性）。
  // L 曾把 1/2/3 态写成逆时针家族，state3 甚至是个 J 家族形状——顺时针转就「L 变 Z/S」。
  const rotCWKeys = (id: 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L' | 'M' | 'D' | 'V', s: number) => {
    const box = id === 'I' ? 4 : id === 'D' || id === 'V' ? 2 : id === 'M' ? 1 : 3
    return pieceCells(id, s)
      .map(([c, r]) => `${box - 1 - r}:${c}`)
      .sort()
      .join('|')
  }
  const stateKeys = (id: 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L' | 'M' | 'D' | 'V', s: number) =>
    pieceCells(id, s)
      .map(([c, r]) => `${c}:${r}`)
      .sort()
      .join('|')
  for (const id of ['I', 'T', 'S', 'Z', 'J', 'L', 'D', 'V', 'X', 'M'] as const) {
    for (let s = 0; s < 4; s++) {
      const next = (s + 1) % 4
      assert(stateKeys(id, next) === rotCWKeys(id, s), `旋转手性：${id} 态${s}→态${next} 为顺时针`)
    }
  }
  // O 四态同形（SRS 中 O 旋转恒等）
  {
    const keys = [0, 1, 2, 3].map((s) => stateKeys('O', s))
    assert(keys[0] === keys[1] && keys[1] === keys[2] && keys[2] === keys[3], '旋转手性：O 四态同形')
  }

  // 变种块：每袋必有一个（M/D/V/X 四选一）
  const rngLow = (): number => 0.001
  const rngHigh = (): number => 0.99
  {
    assert(shuffledBag(rngLow).some((id) => id === 'M' || id === 'D' || id === 'V' || id === 'X'), 'rng 低值 → 袋中有变种块')
    assert(shuffledBag(rngHigh).some((id) => id === 'M' || id === 'D' || id === 'V' || id === 'X'), 'rng 高值 → 袋中也有变种块')
    let xCount = 0
    let mCount = 0
    for (let i = 0; i < 500; i++) {
      const bag = shuffledBag()
      assert(bag.length === 9, '混入后袋长仍为 9')
      assert(bag.filter((id) => id === 'M' || id === 'D' || id === 'V' || id === 'X').length === 2, '每袋恰好 2 个变种块')
      assert(bag.filter((id) => id === 'I').length >= 1, '长条保底 1 根（变种可能覆盖长条槽位）')
      for (let k = 0; k < bag.length - 1; k++) {
        assert(!(bag[k] === 'I' && bag[k + 1] === 'I'), '长条不相邻（不连出两根长条）')
      }
      if (bag.includes('X')) xCount++
      if (bag.includes('M')) mCount++
    }
    assert(xCount < mCount, '斜块 X 出现频率低于 M（加权四选一）')
  }

  // 单格闪块：消列算 1 行 + 整列清空；满行优先于消列
  {
    const base = createGame(1, rngHigh)
    const board = base.board.slice()
    for (let y = 6; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        if (x !== 4) board[y * 10 + x] = 'T'
      }
    }
    const withM: import('@/utils/tetris').TetrisState = {
      ...base,
      board,
      active: { id: 'M', x: 4, y: 3, rot: 0 },
      phase: 'playing',
    }
    const dropped = applyAction(withM, { t: 'hardDrop' })
    assert(dropped.phase === 'clearing' && dropped.clearingCols.includes(4), '单格闪块进入消列相位')
    assert(dropped.events.some((e) => e.t === 'cleared'), '消列产生 cleared 事件')
    const ticked = applyAction(dropped, { t: 'tick', dtMs: CLEAR_FLASH_MS })
    assert(ticked.lines === base.lines + 1, '消列计 1 行')
    assert(ticked.board.slice(4 * 10, 5 * 10).every((c) => c === null), '第 4 列整列清空')

    // 满行优先：补完整行时走行消除而非消列
    const rowFull = base.board.slice()
    for (let x = 0; x < 10; x++) {
      if (x !== 4) rowFull[19 * 10 + x] = 'T'
    }
    const withM2: import('@/utils/tetris').TetrisState = {
      ...base,
      board: rowFull,
      active: { id: 'M', x: 4, y: 3, rot: 0 },
      phase: 'playing',
    }
    const dropped2 = applyAction(withM2, { t: 'hardDrop' })
    assert(dropped2.phase === 'clearing' && dropped2.clearingRows.includes(19) && dropped2.clearingCols.length === 0, '满行优先于消列')
  }

  // 二格多米诺：贴墙旋转的踢墙
  {
    const empty = createGame(1, rngHigh)
    const atWall: import('@/utils/tetris').TetrisState = {
      ...empty,
      active: { id: 'D', x: 9, y: 5, rot: 1 },
      phase: 'playing',
    }
    const rotated = applyAction(atWall, { t: 'rotate', dir: 1 })
    assert(rotated.active?.rot === 2 && rotated.active.x === 8, '多米诺贴墙旋转左踢一格')
  }
}

// ══════════════════════════════ 推箱子 ══════════════════════════════

/** 引擎语义：解析/移动/推箱/撤销/死局启发/评星 + 求解器对拍与提示。 */
function testSokoban() {
  console.log('\n── 推箱子引擎 ──')

  // 解析
  const tiny = parseLevel({ id: 1, chapter: 1, xsb: ['#####', '#@$.#', '#####'], threeStar: 2, twoStar: 3 })
  assert(tiny.w === 5 && tiny.h === 3, '解析尺寸按最长行')
  assert(tiny.playerStart === 6 && tiny.boxesStart.length === 1, '小人与箱子位置')
  assert(tiny.floor.filter(Boolean).length === 3, '可达地板从人洪泛（不含墙外）')
  assert(tiny.targets[8], '目标点标记')

  let threw = ''
  try { parseLevel({ id: 2, chapter: 1, xsb: ['#####', '#@$..#', '#####'], threeStar: 1, twoStar: 2 }) } catch (e) { threw = String(e) }
  assert(threw.includes('箱子'), '箱子数 ≠ 目标数时解析报错')

  threw = ''
  try { parseLevel({ id: 3, chapter: 1, xsb: ['####', '# $.#', '####'], threeStar: 1, twoStar: 2 }) } catch (e) { threw = String(e) }
  assert(threw.includes('小人'), '缺小人时解析报错')

  // 移动语义（roomy：下方可走、右推被墙挡）
  const roomy = parseLevel({ id: 2, chapter: 1, xsb: ['#####', '#@$##', '#  .#', '#####'], threeStar: 2, twoStar: 3 })
  let s: SokobanState = sokCreateGame(roomy)
  const s0 = s
  assert(sokApplyAction(s, { t: 'move', dir: 0 }) === s, '撞墙返回原引用')
  assert(sokApplyAction(s, { t: 'move', dir: 1 }) === s, '推箱被墙挡返回原引用（无 blocked 事件）')
  const walked = sokApplyAction(s, { t: 'move', dir: 2 })
  assert(walked !== s && walked.player === twoW(roomy, 1, 2) && walked.steps === 1, '空走：人动步数+1')
  assert(s0.player === twoW(roomy, 1, 1) && s0.steps === 0, '纯函数：输入状态不被改动')

  const pushed = sokApplyAction(sokCreateGame(tiny), { t: 'move', dir: 1 })
  assert(pushed.boxes[0] === 8 && pushed.pushes === 1 && pushed.steps === 1, '推箱：箱前空则推')
  assert(pushed.events.some((ev) => ev.t === 'pushed' && ev.placed), '推箱事件带 placed')
  assert(pushed.phase === 'won' && pushed.events.some((ev) => ev.t === 'won'), '全箱归位即胜')

  // 撤销
  const two = parseLevel({ id: 4, chapter: 1, xsb: ['######', '#@$ .#', '######'], threeStar: 3, twoStar: 4 })
  s = sokCreateGame(two)
  s = sokApplyAction(s, { t: 'move', dir: 1 })
  const undone = sokApplyAction(s, { t: 'undo' })
  assert(undone !== s && undone.boxes[0] === twoW(two, 2, 1) && undone.steps === 0 && undone.pushes === 0, '撤销恢复上一快照')
  const fresh = sokCreateGame(two)
  assert(sokApplyAction(fresh, { t: 'undo' }) === fresh, '无历史撤销返回原引用')
  s = sokApplyAction(sokCreateGame(two), { t: 'move', dir: 1 })
  s = sokApplyAction(s, { t: 'move', dir: 1 })
  assert(s.boxes[0] === twoW(two, 4, 1) && s.phase === 'won', '连推两格到位并获胜')
  assert(sokApplyAction(s, { t: 'undo' }) === s, '已胜状态拒绝撤销（结算已接管）')

  // 死局启发（只允许漏报，不允许误报）：构造局面直呼 isDeadCell + 一个真实推箱触发用例
  const deadLab = parseLevel({ id: 5, chapter: 1, xsb: ['#####', '#@ .#', '#   #', '# $ #', '#####'], threeStar: 2, twoStar: 3 })
  assert(isDeadCell(deadLab, [twoW(deadLab, 1, 3)], twoW(deadLab, 1, 3)), '角死：左下角非点判死')
  assert(isDeadCell(deadLab, [twoW(deadLab, 3, 3)], twoW(deadLab, 3, 3)), '角死：右下角同理')
  assert(!isDeadCell(deadLab, [twoW(deadLab, 3, 1)], twoW(deadLab, 3, 1)), '角上是目标点 → 不判死')
  assert(!isDeadCell(deadLab, [twoW(deadLab, 2, 2)], twoW(deadLab, 2, 2)), '房间中央不判死')
  // 沿墙排：整段无点 → 死；有点 → 活
  const wallDead = parseLevel({ id: 6, chapter: 1, xsb: ['#######', '#   @.#', '#     #', '#  $  #', '#######'], threeStar: 3, twoStar: 4 })
  assert(isDeadCell(wallDead, [twoW(wallDead, 3, 3)], twoW(wallDead, 3, 3)), '沿墙死：整排扫到墙无点无开口')
  const wallAlive = parseLevel({ id: 7, chapter: 1, xsb: ['#######', '#  @  #', '#     #', '#  $ .#', '#######'], threeStar: 3, twoStar: 4 })
  assert(!isDeadCell(wallAlive, [twoW(wallAlive, 2, 3)], twoW(wallAlive, 2, 3)), '沿墙活：同排右边有目标点')
  const wallOpen = parseLevel({ id: 12, chapter: 1, xsb: ['#######', '#  @ .#', '#     #', '#  $  #', '###  ##', '#######'], threeStar: 3, twoStar: 4 })
  assert(!isDeadCell(wallOpen, [twoW(wallOpen, 3, 3)], twoW(wallOpen, 3, 3)), '沿墙活：扫到开口（墙断了）即活——回归：曾误判死')
  // 2×2 冻结：上方两墙 + 底排两箱（排上有目标，沿墙规则不触发，专测 2×2）
  const fzLab = parseLevel({ id: 8, chapter: 1, xsb: ['######', '#@.  #', '# ## #', '# $$.#', '######'], threeStar: 4, twoStar: 6 })
  assert(isDeadCell(fzLab, [twoW(fzLab, 2, 3), twoW(fzLab, 3, 3)], twoW(fzLab, 2, 3)), '2×2 冻结：上墙下箱整块判死')
  const openPair = parseLevel({ id: 9, chapter: 1, xsb: ['######', '#@.. #', '# $ $ #', '#    #', '######'], threeStar: 4, twoStar: 6 })
  assert(!isDeadCell(openPair, [twoW(openPair, 2, 2), twoW(openPair, 4, 2)], twoW(openPair, 2, 2)), '房间中部箱对不判死')

  // 真实推箱触发角死 + 撤销解除（箱子推进左下墙角：左墙 + 底墙）
  const cornerLv = parseLevel({ id: 10, chapter: 1, xsb: ['#####', '#@ .#', '#$  #', '#   #', '#####'], threeStar: 2, twoStar: 3 })
  s = sokCreateGame(cornerLv)
  const down = sokApplyAction(s, { t: 'move', dir: 2 })
  assert(down !== s && down.stuckBox === twoW(cornerLv, 1, 3), '角死：往下推进角落触发死局标记')
  assert(down.events.some((ev) => ev.t === 'deadlock'), '死局事件')
  const undone2 = sokApplyAction(down, { t: 'undo' })
  assert(undone2.stuckBox === null && undone2.boxes[0] === twoW(cornerLv, 1, 2), '撤销后死局标记清除、箱子复位')
  assert(sokApplyAction(down, { t: 'unstick' }).stuckBox === null, 'unstick 手动清除标记')

  // 评星
  const lv = parseLevel({ id: 9, chapter: 1, xsb: ['#####', '#@$.#', '#####'], threeStar: 3, twoStar: 5 })
  assert(starsFor(lv, 3) === 3 && starsFor(lv, 5) === 2 && starsFor(lv, 6) === 1, '三星/二星/一星门槛')

  // 求解器对拍（手算最优）
  assert(sokSolve(tiny, tiny.boxesStart, tiny.playerStart).moves === 1, '求解器：单推 1 步')
  assert(sokSolve(two, two.boxesStart, two.playerStart).moves === 2, '求解器：连推 2 步')
  const l5 = parseLevel({ id: 11, chapter: 1, xsb: ['#######', '#     #', '#@$#  #', '#  #  #', '# .#  #', '#######'], threeStar: 5, twoStar: 6 })
  assert(sokSolve(l5, l5.boxesStart, l5.playerStart).moves === 4, '求解器：绕顶 4 步（上右上推×2）')
  // 死局局面 → 无解
  assert(sokSolve(deadLab, [twoW(deadLab, 1, 3)], twoW(deadLab, 2, 3)).status === 'unsolvable', '求解器：角死局面判无解')
  // 提示：返回合法推法
  const hintLv = parseLevel({ id: 11, chapter: 1, xsb: ['######', '#@$ .#', '######'], threeStar: 3, twoStar: 4 })
  const hint = nextPush(hintLv, hintLv.boxesStart, hintLv.playerStart, 1000)
  assert(hint !== null && hint.dir === 1 && hint.box === twoW(hintLv, 2, 1), '提示：给出推法（右推该箱）')
}

function twoW(level: { w: number }, x: number, y: number): number {
  return y * level.w + x
}

/** 关卡管线：全关卡可解 + 三星/二星门槛与求解器一致（threeStar=0 时打印建议值并挂起，供填数）。 */
function testSokobanLevels() {
  console.log('\n── 推箱子关卡管线 ──')
  assert(LEVELS.length === 100, `五章 100 关（当前 ${LEVELS.length}）`)
  assert(CHAPTERS.length === 5 && LEVELS_PER_CHAPTER === 20, '5 章 × 20 关结构')
  // 各章 par 上限（章末最难关的合理范围,超了说明难度错章）
  const chapterParCap = [30, 50, 75, 95, 125]
  // 全局逐关严格递增（产品要求:第 N+1 关恒难于第 N 关）
  const pars: number[] = []
  let needFill = false
  for (const def of LEVELS) {
    const level = parseLevel(def)
    const result = sokSolve(level, level.boxesStart, level.playerStart, { mode: 'optimal', budgetMs: 20000 })
    assert(result.status === 'solved', `关卡 ${def.id} 可解（${result.status}）`)
    if (result.status !== 'solved') continue
    const par = result.moves
    pars.push(par)
    const want3 = Math.ceil(par * 1.25)
    const want2 = Math.ceil(par * 1.5)
    if (def.threeStar === 0) {
      console.log(`  → 关卡 ${def.id}：par=${par} 建议 threeStar=${want3} twoStar=${want2}（nodes=${result.nodes}）`)
      needFill = true
      continue
    }
    assert(def.threeStar === want3, `关卡 ${def.id} 三星门槛 ${def.threeStar} = ceil(par${par}×1.25)`)
    assert(def.twoStar === want2, `关卡 ${def.id} 二星门槛 ${def.twoStar} = ceil(par${par}×1.5)`)
    assert(par <= chapterParCap[def.chapter - 1], `关卡 ${def.id} 第${def.chapter}章 par≤${chapterParCap[def.chapter - 1]}（实际 ${par}）`)
  }
  assert(!needFill, '门槛数据已回填（见上方建议值）')
  assert(pars.length === LEVELS.length, 'par 全量收集')
  for (let i = 1; i < pars.length; i++) {
    assert(pars[i] > pars[i - 1], `全局递增:第 ${i + 1} 关 par${pars[i]} > 第 ${i} 关 par${pars[i - 1]}`)
  }
}

/* ── 斗兽棋规则镜像（与后端 app/Service/Jungle/JungleRule.php 双份同步：PHP 权威，此处锁 TS 侧行为） ── */
{
  const j = require('@/utils/jungle') as typeof import('@/utils/jungle')

  const P = (side: 'red' | 'blue', animal: j.JunglePiece['animal'], r: number, c: number): j.JunglePiece => ({ side, animal, r, c })

  // 初始摆位与地形
  {
    const pieces = j.initialPieces()
    assert(pieces.length === 16, '斗兽棋初始 16 子')
    assert(pieces.filter((p) => p.side === 'red').length === 8, '红方 8 子')
    assert(j.pieceAt(pieces, 0, 0)?.animal === 'lion', '蓝狮 (0,0)')
    assert(j.pieceAt(pieces, 2, 6)?.animal === 'elephant', '蓝象 (2,6)')
    assert(j.pieceAt(pieces, 8, 6)?.side === 'red' && j.pieceAt(pieces, 8, 6)?.animal === 'lion', '红狮 (8,6)')
    assert(j.pieceAt(pieces, 6, 0)?.side === 'red' && j.pieceAt(pieces, 6, 0)?.animal === 'elephant', '红象 (6,0) 中心对称')
    assert(j.isRiver(3, 1) && j.isRiver(5, 5) && !j.isRiver(3, 3) && !j.isRiver(6, 1), '河流 rows3-5×cols{1,2,4,5}')
    assert(j.isDenOf('blue', 0, 3) && j.isDenOf('red', 8, 3), '兽穴 (0,3)/(8,3)')
    assert(j.isTrapOf('red', 7, 3) && j.isTrapOf('blue', 1, 3) && !j.isTrapOf('red', 1, 3), '陷阱归属')
  }

  // 基础走子
  {
    const pieces = j.initialPieces()
    assert(j.validateMove(pieces, 'red', 6, 0, 5, 0) === null, '红象上行一步合法')
    assert(j.validateMove(pieces, 'red', 6, 0, 5, 1) === 'into_water', '象不能下河')
    assert(j.validateMove(pieces, 'red', 6, 2, 6, 4) === 'blocked_own', '不能落在己方子上')
    assert(j.validateMove(pieces, 'red', 8, 0, 8, 3) === 'own_den', '不可进己方兽穴')
    assert(j.validateMove(pieces, 'blue', 1, 1, 0, 2) === 'not_adjacent', '非狮虎斜走不允许')
    assert(j.validateMove(pieces, 'blue', 6, 0, 5, 0) === 'not_yours', '不能动对方的子')
  }

  // 鼠入河 + 水陆隔离
  {
    const iso = [P('red', 'rat', 4, 1), P('blue', 'rat', 4, 0)]
    assert(j.validateMove(iso, 'red', 4, 1, 4, 0) === 'cannot_capture', '水中鼠不能吃岸上鼠')
    assert(j.validateMove(iso, 'blue', 4, 0, 4, 1) === 'cannot_capture', '岸上鼠不能吃水中鼠')
  }

  // 鼠吃象 / 等级 / 陷阱
  {
    const re = [P('red', 'rat', 4, 3), P('blue', 'elephant', 3, 3)]
    assert(j.validateMove(re, 'red', 4, 3, 3, 3) === null, '鼠吃象')
    assert(j.validateMove(re, 'blue', 3, 3, 4, 3) === 'cannot_capture', '象不能吃鼠')
    const catDog = [P('red', 'cat', 4, 3), P('blue', 'dog', 3, 3)]
    assert(j.validateMove(catDog, 'red', 4, 3, 3, 3) === 'cannot_capture', '猫(2)不能吃狗(3)')
    const same = [P('red', 'dog', 4, 3), P('blue', 'dog', 3, 3)]
    assert(j.validateMove(same, 'red', 4, 3, 3, 3) === null, '同级互吃')
    const trap = [P('blue', 'elephant', 7, 3), P('red', 'cat', 7, 2)]
    assert(j.validateMove(trap, 'red', 7, 2, 7, 3) === null, '踩对方陷阱等级归零，猫吃象')
    const ownTrap = [P('red', 'elephant', 7, 3), P('blue', 'wolf', 7, 2)]
    assert(j.validateMove(ownTrap, 'blue', 7, 2, 7, 3) === 'cannot_capture', '己方陷阱不保护自己')
    const eatsRat = [P('blue', 'rat', 7, 3), P('red', 'elephant', 7, 2)]
    assert(j.validateMove(eatsRat, 'red', 7, 2, 7, 3) === null, '陷阱归零优先于鼠象特例：象吃陷阱鼠')
  }

  // 狮虎跳河
  {
    const jump = [P('red', 'lion', 4, 6), P('blue', 'dog', 4, 3)]
    assert(j.validateMove(jump, 'red', 4, 6, 4, 3) === null, '狮跳河吃对岸狗')
    const blocked = [P('red', 'lion', 4, 6), P('blue', 'rat', 4, 4)]
    assert(j.validateMove(blocked, 'red', 4, 6, 4, 3) === 'jump_blocked', '水中有鼠挡道跳不成')
    const ownBlock = [P('red', 'lion', 4, 6), P('red', 'rat', 4, 4)]
    assert(j.validateMove(ownBlock, 'red', 4, 6, 4, 3) === 'jump_blocked', '己方鼠也挡道')
    const tiger = [P('blue', 'tiger', 3, 0)]
    assert(j.validateMove(tiger, 'blue', 3, 0, 3, 3) === null, '虎 0→3 跳')
    assert(j.validateMove(tiger, 'blue', 3, 0, 3, 6) === 'jump_invalid', '0→6 不成对')
    const offRow = [P('red', 'tiger', 7, 0)]
    assert(j.validateMove(offRow, 'red', 7, 0, 7, 3) === 'jump_invalid', '河区外的行不能跳')
    const rat = [P('red', 'rat', 4, 0)]
    assert(j.validateMove(rat, 'red', 4, 0, 4, 3) === 'not_adjacent', '鼠不能跳河')
  }

  // 落点提示与胜负
  {
    const pieces = j.initialPieces()
    const lionHints = j.findLegalMoves(pieces, 'red', 8, 6)
    assert(lionHints.length === 2 && lionHints.every((h) => !h.capture && !h.jump), '开局红狮两个平移落点')
    const mid = [P('red', 'lion', 4, 6), P('blue', 'dog', 4, 3)]
    const hints = j.findLegalMoves(mid, 'red', 4, 6)
    const jumpHint = hints.find((h) => h.jump)
    assert(jumpHint?.r === 4 && jumpHint?.c === 3 && jumpHint?.capture === true, '狮跳河落点标记 jump+capture')
    assert(j.findWin([P('red', 'rat', 1, 3)], 'red', 0, 3) === 'den', '入对方兽穴获胜')
    assert(j.findWin([P('red', 'rat', 0, 0)], 'red', 0, 1) === 'eliminated', '吃光对方获胜')
    const stuck = [P('red', 'elephant', 4, 3), P('blue', 'rat', 3, 3), P('blue', 'rat', 5, 3)]
    assert(j.hasAnyMove(stuck, 'red') === false, '红象被双鼠围死困毙')
    assert(j.hasAnyMove(stuck, 'blue') === true, '蓝方仍有着法')
  }

  // 战况派生与触摸换算
  {
    const pieces = [P('red', 'lion', 4, 6), P('blue', 'dog', 4, 3)]
    assert(j.capturedOf(pieces, 'red').length === 7 && j.capturedOf(pieces, 'red')[0] === 'elephant', '红方阵亡 7 子按等级排序')
    assert(j.aliveCount(pieces, 'blue') === 1, '蓝方存活 1 子')
    const m = j.boardMetrics(315, 405)
    assert(Math.abs(m.cell - 45) < 0.001 && m.offsetX === 0 && m.offsetY === 0, 'boardMetrics 315×405 → 格 45 居中无偏移')
    const cell = j.pointToCell(100.5, 200.5, m)
    assert(cell?.r === 4 && cell?.c === 2, 'pointToCell 落格正确')
    assert(j.pointToCell(-1, 10, m) === null && j.pointToCell(316, 10, m) === null, '越界返回 null')
  }
}

/* ── 军棋规则镜像（与后端 app/Service/MountainChess/MountainChessRule.php 双份同步：PHP 权威，此处锁 TS 侧行为） ── */
{
  const q = require('@/utils/junqi') as typeof import('@/utils/junqi')

  type QP = import('@/types/junqi').JunqiPiece
  const P = (side: 'red' | 'blue', rank: QP['rank']!, r: number, c: number): QP => ({ side, rank, r, c, alive: true, revealed: false })
  const targetsOf = (pieces: QP[], r: number, c: number) => new Set(q.reachableTargets(pieces, r, c).map(([tr, tc]) => `${tr}:${tc}`))

  // 地形
  {
    assert(q.isCamp(2, 1) && q.isCamp(9, 3) && q.isCamp(9, 1) && !q.isCamp(2, 0) && !q.isCamp(6, 2), '军棋行营位置')
    assert(q.isHqOf('blue', 0, 1) && q.isHqOf('red', 11, 3) && !q.isHqOf('red', 0, 1), '大本营归属')
    assert(q.isRail(1, 2) && q.isRail(10, 4) && q.isRail(6, 2) && !q.isRail(0, 0) && !q.isRail(3, 1) && q.isRail(7, 0), '铁路格：行1/5/6/10 + 列0/4行1..10')
    assert(q.RANKS.si === 9 && q.RANKS.gong === 1, '军衔等级')
  }

  // 随机布阵 + 预设阵型全部合法
  {
    for (let i = 0; i < 20; i++) {
      assert(q.validateLayout('red', q.randomLayout('red')) === null, '红方随机布阵合法')
      assert(q.validateLayout('blue', q.randomLayout('blue')) === null, '蓝方随机布阵合法')
    }
    for (const preset of q.PRESETS) {
      assert(q.validateLayout('red', preset.layout) === null, `预设阵型「${preset.name}」合法`)
    }
    assert(q.buildPieces(q.PRESETS[0].layout, q.PRESETS[1].layout).length === 50, 'buildPieces 50 子')
    assert(q.validateLayout('red', [{ rank: 'qi', r: 11, c: 1 }] as import('@/types/junqi').JunqiLayoutPiece[]) === 'layout_count', '少于 25 枚被拒')
    assert(q.validateLayout('red', [{ rank: 'qi', r: 11, c: 2 }] as never) !== null, '坏阵型被拒')
  }

  // 铁路直线滑行（非工兵）
  {
    const slide = [P('red', 'shi', 5, 0), P('blue', 'pai', 9, 4)]
    const t = targetsOf(slide, 5, 0)
    assert(t.has('5:4') && t.has('1:0') && t.has('10:0'), '师长铁路直线：横滑 + 纵滑跨山界')
    assert(!t.has('0:0') && !t.has('5:0'), '直线不越铁路网、不含原格')
    const block = [P('red', 'shi', 5, 0), P('blue', 'pai', 5, 2)]
    const t2 = targetsOf(block, 5, 0)
    assert(t2.has('5:1') && t2.has('5:2') && !t2.has('5:3') && !t2.has('5:4'), '铁路滑行撞上第一枚子为止')
    const noTurn = targetsOf([P('red', 'shi', 1, 0)], 1, 0)
    assert(noTurn.has('10:0') && noTurn.has('1:4') && !noTurn.has('10:4') && !noTurn.has('6:4'), '非工兵铁路不拐弯')
  }

  // 工兵 BFS 拐弯
  {
    const t = targetsOf([P('red', 'gong', 1, 0)], 1, 0)
    assert(t.has('10:4') && t.has('10:0') && t.has('1:4') && t.has('6:2'), '工兵铁路 BFS 拐弯全网可达')
    assert(!t.has('2:2'), '工兵不越出铁路网')
  }

  // 公路 + 山界通路 + 行营斜线
  {
    const t = targetsOf([P('red', 'pai', 5, 2)], 5, 2)
    assert(t.has('6:2') && t.has('5:1') && t.has('4:2'), '公路一步 + 山界中路')
    assert(!targetsOf([P('red', 'pai', 5, 1)], 5, 1).has('6:1'), '山界列 1 无公路通路')
    const camp = targetsOf([P('red', 'pai', 7, 1)], 7, 1)
    assert(camp.has('6:0') && camp.has('6:2') && camp.has('8:0') && camp.has('8:2') && camp.has('7:0'), '行营八方连通')
    assert(!targetsOf([P('red', 'pai', 6, 0)], 6, 0).has('7:1'), '普通格不能斜走')
  }

  // 不可移动 / 大本营
  {
    assert(q.validateMove([P('red', 'lei', 10, 0)], 'red', 10, 0, 9, 0) === 'cannot_move', '地雷不能动')
    assert(q.validateMove([P('red', 'qi', 11, 1)], 'red', 11, 1, 10, 1) === 'cannot_move', '军旗不能动')
    assert(q.validateMove([P('red', 'si', 11, 1)], 'red', 11, 1, 10, 1) === 'locked_hq', '大本营内锁足')
    assert(q.validateMove([P('red', 'pai', 10, 1)], 'red', 10, 1, 11, 1) === 'in_own_hq', '不能进自己大本营')
    assert(q.validateMove([P('red', 'pai', 0, 0)], 'red', 0, 0, 0, 1) === null, '可进敌方大本营（空）')
  }

  // 行营免战
  {
    const guard = [P('red', 'pai', 6, 1), P('blue', 'pai', 7, 1)]
    assert(q.validateMove(guard, 'red', 6, 1, 7, 1) === 'camp_protected', '行营内敌子免战')
    assert(q.validateMove(guard, 'blue', 7, 1, 6, 1) === null, '营内子可正常出营攻击')
  }

  // 战斗裁决
  {
    const att = P('red', 'si', 6, 0)
    assert(q.resolveBattle(att, P('blue', 'pai', 5, 0)) === 'win', '司令吃排长')
    assert(q.resolveBattle(att, P('blue', 'jun', 5, 0)) === 'win', '司令吃军长（9>8）')
    assert(q.resolveBattle(P('red', 'jun', 6, 0), P('blue', 'si', 5, 0)) === 'lose', '军长不敌司令')
    assert(q.resolveBattle(att, P('blue', 'si', 5, 0)) === 'both', '同级同归于尽')
    assert(q.resolveBattle(P('red', 'zha', 6, 0), P('blue', 'si', 5, 0)) === 'both', '炸弹与司令同归于尽')
    assert(q.resolveBattle(P('red', 'gong', 6, 0), P('blue', 'lei', 5, 0)) === 'win', '工兵挖雷')
    assert(q.resolveBattle(P('red', 'pai', 6, 0), P('blue', 'lei', 5, 0)) === 'both', '非工兵撞雷同归于尽')
    assert(q.resolveBattle(att, P('blue', 'qi', 5, 0)) === 'flag', '撞军旗即夺旗')
  }

  // applyMove：吃子 + 交战暴露 + 阵亡公示 + 亮旗
  {
    const eat = q.applyMove([P('red', 'shi', 6, 0), P('blue', 'tuan', 5, 0)], 'red', 6, 0, 5, 0)
    assert(eat.result === 'win' && eat.captured === 'tuan', 'applyMove 师长吃团长')
    assert(eat.pieces[1].alive === false && eat.pieces[1].revealed === true, '阵亡子公示')
    assert(eat.pieces[0].revealed === true && eat.pieces[0].r === 5, '存活方交战暴露并位移')
    const both = q.applyMove([P('red', 'zha', 6, 0), P('blue', 'si', 5, 0)], 'red', 6, 0, 5, 0)
    assert(both.result === 'both' && both.revealSide === 'blue', '炸弹与司令同归，亮蓝旗')
    assert(both.pieces.filter((p) => p.alive).length === 0, '双亡盘面')
    const dig = q.applyMove([P('red', 'gong', 6, 0), P('blue', 'lei', 5, 0), P('blue', 'pai', 0, 4)], 'red', 6, 0, 5, 0)
    assert(dig.result === 'win' && dig.captured === 'lei' && dig.pieces[0].alive === true, '工兵挖雷只死雷')
    assert(q.findWin(dig.pieces, 'red', 'win') === null, '普通吃子不终局')
    const flagWin = q.applyMove([P('red', 'pai', 0, 0), P('blue', 'qi', 0, 1)], 'red', 0, 0, 0, 1)
    assert(flagWin.result === 'flag' && q.findWin(flagWin.pieces, 'red', 'flag') === 'flag', '夺旗终局')
  }

  // hasAnyMove 困毙：只剩不能动的子
  {
    const stuck = [P('red', 'pai', 6, 0), P('blue', 'lei', 0, 0), P('blue', 'qi', 0, 3)]
    assert(q.hasAnyMove(stuck, 'blue') === false, '蓝方只剩地雷军旗，无棋可走')
    assert(q.hasAnyMove(stuck, 'red') === true, '红方仍有着法')
  }

  // 画布几何（原型：pitch 36 / 格面 33 / 山界带 14）
  {
    const geo = q.boardGeometry(36)
    assert(geo.width === 180 && geo.height === 446 && geo.band === 14, '棋盘几何 180×446 / 山界 14')
    const rect = q.cellRect(6, 2, geo)
    assert(rect.y === 6 * 36 + 14 + 1.5, '山界下方行 y 偏移含带宽')
    const hit = q.pointToCell(40, 6 * 36 + 7, geo)
    assert(hit === null, '点中山界带返回 null')
    const cell = q.pointToCell(40, 100, geo)
    assert(cell?.r === 2 && cell?.c === 1, 'pointToCell 落格正确')
  }
}

/* ── 象棋规则镜像（与后端 app/Service/Xiangqi/XiangqiRule.php 双份同步：PHP 权威，此处锁 TS 侧行为） ── */
{
  const x = require('@/utils/xiangqi') as typeof import('@/utils/xiangqi')

  type XP = import('@/types/xiangqi').XiangqiPiece
  const P = (side: 'red' | 'black', piece: XP['piece']!, r: number, c: number): XP => ({ side, piece, r, c, alive: true })
  const pseudoOf = (pieces: XP[], r: number, c: number) => new Set(x.pseudoTargets(pieces, r, c).map(([tr, tc]) => `${tr}:${tc}`))
  const legalOf = (pieces: XP[], side: 'red' | 'black', r: number, c: number) => new Set(x.legalTargets(pieces, side, r, c).map(([tr, tc]) => `${tr}:${tc}`))

  // 开局与地形
  {
    const pieces = x.standardPieces()
    assert(pieces.length === 32, '象棋开局 32 子')
    assert(pieces.filter((p) => p.side === 'red').length === 16, '红方 16 子')
    assert(x.pieceAt(pieces, 0, 4)?.piece === 'k', '黑将 (0,4)')
    assert(x.pieceAt(pieces, 9, 4)?.piece === 'k', '红帅 (9,4)')
    assert(x.inPalace('black', 0, 3) && !x.inPalace('black', 3, 3) && x.inPalace('red', 9, 5) && !x.inPalace('red', 6, 4), '九宫范围')
    assert(x.crossedRiver('red', 4) && !x.crossedRiver('red', 5) && !x.crossedRiver('black', 4) && x.crossedRiver('black', 5), '过河判定')
  }

  // 马：8 日字 + 蹩马腿
  {
    const t = pseudoOf([P('red', 'h', 4, 4)], 4, 4)
    assert(t.size === 8 && t.has('2:3') && t.has('6:5'), '马空盘 8 日字')
    const leg = [P('red', 'h', 4, 4), P('blue' as never, 'p', 3, 4) as XP]
    const t2 = pseudoOf(leg, 4, 4)
    assert(!t2.has('2:3') && !t2.has('2:5') && t2.has('3:2'), '马腿 (3,4) 蹩住上方两跳')
  }

  // 相：田字 + 塞象眼 + 不过河
  {
    const t = pseudoOf([P('black', 'e', 2, 2)], 2, 2)
    assert(t.size === 4 && t.has('0:0') && t.has('4:4'), '象 4 田字')
    const eye = [P('black', 'e', 2, 2), P('red', 'p', 3, 3)]
    assert(!pseudoOf(eye, 2, 2).has('4:4'), '塞象眼 (3,3)')
    const river = [P('black', 'e', 4, 2)]
    assert(!pseudoOf(river, 4, 2).has('6:0'), '象不过河')
  }

  // 仕 / 帅九宫
  {
    const t = pseudoOf([P('black', 'a', 1, 4)], 1, 4)
    assert(t.size === 4 && t.has('0:3') && t.has('2:5') && !t.has('1:3'), '士宫心四斜')
    const t2 = pseudoOf([P('black', 'k', 0, 4)], 0, 4)
    assert(t2.size === 3 && t2.has('1:4') && t2.has('0:5'), '将九宫横竖')
  }

  // 兵过河
  {
    const home = pseudoOf([P('red', 'p', 6, 2)], 6, 2)
    assert(home.size === 1 && home.has('5:2'), '红兵未过河只进')
    const cross = pseudoOf([P('red', 'p', 4, 2)], 4, 2)
    assert(cross.has('3:2') && cross.has('4:1') && !cross.has('5:2'), '红兵过河可横不可退')
    const blackP = pseudoOf([P('black', 'p', 5, 4)], 5, 4)
    assert(blackP.has('6:4') && blackP.has('5:3') && blackP.has('5:5'), '黑卒过河三向')
  }

  // 车 + 炮架
  {
    const board = [P('red', 'r', 5, 0), P('black', 'p', 5, 3), P('black', 'p', 5, 6)]
    const t = pseudoOf(board, 5, 0)
    assert(t.has('5:2') && t.has('5:3') && !t.has('5:4'), '车遇子即止')
    const cannon = [P('red', 'c', 5, 0), P('black', 'p', 5, 3), P('red', 'p', 5, 7)]
    const t2 = pseudoOf(cannon, 5, 0)
    assert(t2.has('5:2') && !t2.has('5:3') && !t2.has('5:7'), '炮遇炮架不吃不穿')
    const cannonEat = [P('red', 'c', 5, 0), P('blue' as never, 'p', 5, 3) as XP, P('black', 'p', 5, 7)]
    const t3 = pseudoOf(cannonEat, 5, 0)
    assert(t3.has('5:2') && t3.has('5:7') && !t3.has('5:6'), '炮隔一炮架吃')
  }

  // 将帅对脸
  {
    const facing = [P('red', 'k', 9, 4), P('black', 'k', 0, 4)]
    assert(x.kingsFacing(facing) === true, '对脸：同列无隔子')
    const shield = [P('red', 'k', 9, 4), P('black', 'k', 0, 4), P('red', 'r', 5, 4)]
    assert(x.kingsFacing(shield) === false, '有隔子不对脸')
    const t = legalOf(facing, 'red', 9, 4)
    assert(!t.has('8:4') && t.has('9:3') && t.has('9:5'), '对脸时帅不可直进保持对脸')
  }

  // 应将过滤
  {
    const check = [P('red', 'k', 9, 4), P('black', 'r', 5, 4)]
    const t = legalOf(check, 'red', 9, 4)
    assert(t.has('9:3') && t.has('9:5') && !t.has('8:4'), '应将：不能走到仍被将军的格')
  }

  // 将死
  {
    const mate = [P('black', 'k', 0, 4), P('red', 'k', 9, 0), P('red', 'r', 0, 3), P('red', 'r', 7, 3), P('red', 'r', 7, 4), P('red', 'r', 7, 5)]
    assert(x.inCheck(mate, 'black') === true, '黑将被将军')
    assert(x.hasAnyLegalMove(mate, 'black') === false, '黑无合法步 → 将死')
    assert(x.hasAnyLegalMove(mate, 'red') === true, '红方仍有着法')
    assert(x.hasAnyLegalMove(x.standardPieces(), 'red') && x.hasAnyLegalMove(x.standardPieces(), 'black'), '开局双方都有着法')
  }

  // applyMove
  {
    const applied = x.applyMove([P('red', 'c', 5, 0), P('black', 'p', 2, 0)], 5, 0, 2, 0)
    assert(applied.captured === 'p' && applied.pieces[0].r === 2 && applied.pieces[1].alive === false, 'applyMove 炮打卒')
  }
}

/* ── 井字棋规则镜像（与后端 app/Service/Tictactoe/TictactoeRule.php 双份同步） ── */
{
  const t = require('@/utils/tictactoe') as typeof import('@/utils/tictactoe')
  type TTBoard = import('@/utils/tictactoe').TicTacToeBoard
  const board = (s: string): TTBoard => Array.from(s).map((ch) => (ch === '.' ? null : (ch as TicTacToeMark)))

  assert(t.LINES.length === 8, '井字棋 8 条胜利线')
  assert(t.findWin(board('xxx......'), 'x')?.[1] === 0, '首行三连 X')
  assert(t.findWin(board('......ooo'), 'o')?.[1] === 2, '末行三连 O')
  assert(t.findWin(board('o.x..x..x'), 'x')?.[1] === 5, '末列三连')
  assert(t.findWin(board('x...x...x'), 'x')?.[1] === 6, '主对角三连')
  assert(t.findWin(board('..x.x.x..'), 'x')?.[1] === 7, '副对角三连')
  assert(t.findWin(board('xxo......'), 'x') === null, '未连线不判胜')
  assert(t.isFull(board('xoxxooxox')) === true, '棋满判定')
  assert(t.isFull(board('xo.xxooxo')) === false, '有空格未满')
  assert(t.emptyCells(board('x.x...o..')).join(',') === '1,3,4,5,7,8', '空格列表')
}

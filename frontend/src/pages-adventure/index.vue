<template>
  <view class="page">
    <!-- ══════════ 大厅 ══════════ -->
    <view v-if="!current" class="lobby">
      <view class="lobby-logo">
        <image class="lobby-logo-img" :src="cdnUrl('/static/icons/adventure-1.png')" mode="aspectFit" />
        <view class="lobby-title">枫趣冒险</view>
        <view class="lobby-sub">2-6 人联机 · 蛇形山道 · 决斗押注与天气预报</view>
      </view>
      <view class="lobby-actions">
        <button class="btn btn-primary" :loading="acting" @tap="onCreate">创建房间</button>
        <view class="join-row">
          <input v-model="joinCode" class="join-input" type="number" maxlength="4" placeholder="输入 4 位房间码" />
          <button class="btn btn-gold" :disabled="joinCode.length !== 4" @tap="onJoin">加入</button>
        </view>
        <view class="rules-entry" @tap="rulesOpen = true">❓ 玩法说明</view>
      </view>
      <view v-if="myRooms.length" class="my-rooms">
        <view class="my-rooms-title">我的对局</view>
        <view v-for="room in myRooms" :key="room.code" class="my-room-item" @tap="joinByCode(room.code)">
          <view class="my-room-code">{{ room.code }}</view>
          <view class="my-room-meta">{{ roomStatusText(room.status) }} · {{ room.playerCount }} 人</view>
          <view class="my-room-go">{{ room.status === 'saved' ? '继续' : '回到' }} ›</view>
        </view>
      </view>
      <view class="lobby-hint">天气看得见 · 决斗押注 · 房主可存档续局</view>
    </view>

    <!-- ══════════ 房间 ══════════ -->
    <view v-else class="room">
      <!-- 顶栏 -->
      <view class="room-header">
        <view class="room-code" @tap="copyCode">房号 {{ current.code }} ⧉</view>
        <view class="header-btns">
          <view class="icon-btn" @tap="rulesOpen = true">❓</view>
          <view class="icon-btn" @tap="toggleSound">{{ soundOn ? '🔊' : '🔇' }}</view>
          <button class="icon-btn share-btn" open-type="share">📤</button>
          <view class="icon-btn" @tap="onLeave">退出</view>
        </view>
      </view>

      <!-- 等待室 -->
      <view v-if="current.status === 'waiting'" class="waiting">
        <!-- 路线长度（房主设定） -->
        <view class="route-picker">
          <view class="route-title">🗺️ 路线长度</view>
          <view v-if="isOwner" class="route-options">
            <view
              v-for="g in GOALS"
              :key="g"
              class="route-opt"
              :class="{ 'route-active': current.goal === g }"
              @tap="setGoal(g)"
            >
              <text class="route-name">{{ GOAL_LABELS[g] ?? g }}</text>
              <text class="route-cells">{{ g }} 格登顶</text>
            </view>
          </view>
          <view v-else class="route-current">本局路线：{{ GOAL_LABELS[current.goal] ?? current.goal }}（{{ current.goal }} 格登顶）</view>
        </view>
        <view class="seats-grid">
          <view v-for="i in 6" :key="i" class="seat-card" :class="{ 'seat-empty': !seatPlayer(i - 1) }">
            <template v-if="seatPlayer(i - 1)">
              <image class="seat-avatar" :src="resolveAvatar(seatPlayer(i - 1)!.avatarUrl)" mode="aspectFill" />
              <view class="seat-name">{{ seatPlayer(i - 1)!.nickname }}</view>
              <view class="seat-tags">
                <text v-if="i - 1 === 0" class="tag tag-owner">房主</text>
                <text v-if="!seatPlayer(i - 1)!.online" class="tag tag-off">离线</text>
              </view>
            </template>
            <template v-else>
              <view class="seat-plus">＋</view>
              <view class="seat-name muted">等待加入</view>
            </template>
          </view>
        </view>
        <view v-if="isOwner" class="waiting-actions">
          <button class="btn btn-primary" :disabled="current.players.length < 2" :loading="acting" @tap="start">
            开始登山（{{ current.players.length }}/6）
          </button>
          <view v-if="current.players.length < 2" class="hint">至少 2 人才能开局，分享房间码邀请好友</view>
        </view>
        <view v-else class="hint">等房主开局…</view>
      </view>

      <!-- 牌桌（playing / saved / finished 共用，结算浮层盖在上面） -->
      <view v-else class="table">
        <!-- 玩家条 -->
        <scroll-view class="players-bar" scroll-x :show-scrollbar="false">
          <view class="players-row">
            <view
              v-for="p in current.players"
              :key="p.seat"
              class="player-chip"
              :class="{
                'player-current': current.currentSeat === p.seat && current.status === 'playing',
                'player-targetable': !!targetingItem && canTargetSeat(p.seat),
              }"
              @tap="tapPlayerChip(p.seat)"
            >
              <view v-if="chatBubbles[p.seat]" class="seat-bubble" :class="{ 'seat-bubble--emoji': chatBubbles[p.seat].isEmoji }">{{ chatBubbles[p.seat].text }}</view>
              <view class="player-avatar-wrap">
                <image class="player-avatar" :src="resolveAvatar(p.avatarUrl)" mode="aspectFill" />
                <view class="player-dot" :style="{ background: seatColor(p.seat) }" />
                <view v-if="!p.online || p.left" class="player-badge">{{ p.left ? '离' : '掉' }}</view>
                <view v-else-if="p.auto" class="player-badge badge-auto">托</view>
              </view>
              <view class="player-name">{{ p.nickname }}</view>
              <view class="player-stats">
                <text class="stat">📍{{ p.pos || '山脚' }}</text>
                <text class="stat stat-leaf">🍁{{ p.leaves }}</text>
                <text class="stat">🎒{{ p.itemCount }}</text>
              </view>
              <view v-if="p.shield || p.slow || p.skip" class="player-effects">
                <text v-if="p.shield" class="fx">🎿</text>
                <text v-if="p.slow" class="fx">❄️{{ p.slow }}</text>
                <text v-if="p.skip" class="fx">💤</text>
              </view>
              <view v-if="p.place" class="player-place">#{{ p.place }}</view>
              <view v-if="p.finished" class="player-finished">已登顶</view>
            </view>
          </view>
        </scroll-view>

        <!-- 天气栏：当前 + 预报 -->
        <view class="weather-bar">
          <view class="weather-chip weather-current">
            <text class="weather-icon">{{ weatherIcon(current.weather.current) }}</text>
            <view class="weather-text">
              <view class="weather-name">{{ weatherName(current.weather.current) }}</view>
              <view class="weather-desc">{{ weatherDesc(current.weather.current) }}</view>
            </view>
          </view>
          <view class="weather-arrow">下一轮 ›</view>
          <view class="weather-chip weather-next">
            <text class="weather-icon">{{ weatherIcon(current.weather.next) }}</text>
            <view class="weather-text">
              <view class="weather-name">{{ weatherName(current.weather.next) }}</view>
              <view class="weather-desc">{{ weatherDesc(current.weather.next) }}</view>
            </view>
          </view>
        </view>

        <!-- 棋盘 -->
        <view class="board-wrap" :style="{ height: boardWrapHeight, width: boardCssSize ? boardCssSize + 'px' : 'auto' }">
          <image
            v-if="boardSrc"
            class="board-img"
            :src="boardSrc"
            mode="aspectFit"
            :style="{ width: boardCssSize + 'px', height: boardCssSize + 'px' }"
          />
          <view v-else class="board-fallback" :style="{ width: boardCssSize + 'px', height: boardCssSize + 'px' }" />
          <!-- 棋子（全 DOM + CSS transition） -->
          <view
            v-for="tok in tokens"
            :key="tok.seat"
            class="token"
            :class="{ 'token-me': tok.isMe, 'token-current': tok.isCurrent, 'token-finished': tok.finished }"
            :style="{ left: tok.x + '%', top: tok.y + '%', background: tok.color }"
          >
            <text class="token-face">{{ tok.isMe ? '我' : tok.initial }}</text>
          </view>
          <!-- 事件播报条 -->
          <view v-if="bannerText" class="event-banner">{{ bannerText }}</view>
          <!-- 天气翻牌横幅 -->
          <view v-if="weatherBanner" class="weather-banner">{{ weatherBanner }}</view>
        </view>

        <!-- 存档横幅 -->
        <view v-if="current.status === 'saved'" class="saved-bar">
          <view class="saved-text">⏸ 对局已保存{{ lastSaveByOwner ? '' : '（全员离线自动存档）' }}</view>
          <button v-if="isOwner" class="btn btn-primary btn-sm" :loading="acting" @tap="resumeRoom">继续对局</button>
          <view v-else class="saved-wait">等房主继续，或三天后任意成员可续局</view>
        </view>

        <!-- 行动区 -->
        <view v-if="inPlay" class="action-zone">
          <view class="turn-line">
            <template v-if="current.status === 'playing'">
              <text v-if="current.pendingChoice" class="turn-text">{{ choiceWaitingText }}</text>
              <text v-else-if="current.pendingDuel" class="turn-text">⚔️ 决斗进行中（{{ duelFormatName(current.pendingDuel.format) }}）</text>
              <text v-else-if="current.currentSeat === mySeat">
                {{ current.phase === 'act' ? '轮到你掷骰' : '掷骰后：可用道具，然后确认走子' }}
              </text>
              <text v-else class="turn-text">{{ playerBySeat(current.currentSeat ?? -1)?.nickname ?? '?' }} 行动中…</text>
              <text class="countdown">{{ turnCountdown }}s</text>
            </template>
            <text v-else class="turn-text muted">对局已暂停</text>
          </view>

          <!-- 骰子 -->
          <view class="dice-zone">
            <view class="dice-pair" :class="{ 'dice-shaking': diceRolling || diceShaking }">
              <view v-for="(d, i) in displayDice" :key="i" class="dice">{{ d }}</view>
            </view>
            <view v-if="resolveBonus > 0" class="dice-bonus">+{{ resolveBonus }} ⛏️</view>
            <view v-if="slowAhead > 0" class="dice-slow">−{{ slowAhead }} ❄️</view>
          </view>

          <!-- 道具手牌 -->
          <view class="hand-bar">
            <view class="hand-title">道具（{{ current.myItems.length }}/3）</view>
            <scroll-view class="hand-scroll" scroll-x :show-scrollbar="false">
              <view class="hand-row">
                <view
                  v-for="(id, idx) in current.myItems"
                  :key="idx"
                  class="item-card"
                  :class="{ 'item-usable': canUseItemNow(id), 'item-targeting': targetingItem === id }"
                  @tap="tapItem(id)"
                >
                  <text class="item-icon">{{ itemIcon(id) }}</text>
                  <text class="item-name">{{ itemName(id) }}</text>
                </view>
                <view v-if="!current.myItems.length" class="hand-empty">踩补给站/商店获得道具</view>
              </view>
            </scroll-view>
            <view v-if="targetingItem" class="targeting-hint">已选「{{ itemName(targetingItem) }}」→ 点击上方玩家头像指定目标 <text class="link" @tap="targetingItem = ''">取消</text></view>
          </view>

          <!-- 操作按钮 -->
          <view class="action-btns">
            <button
              v-if="current.status === 'playing' && current.currentSeat === mySeat && current.phase === 'act' && !current.pendingDuel && !current.pendingChoice"
              class="btn btn-primary btn-lg"
              :loading="acting"
              @tap="onRoll"
            >
              {{ diceRolling ? '🎲 掷骰中…' : '🎲 掷骰' }}
            </button>
            <button
              v-if="isMyResolve && !current.pendingDuel && !current.pendingChoice"
              class="btn btn-gold btn-lg"
              :loading="acting"
              @tap="confirmMove"
            >
              🥾 走 {{ previewSteps }} 步
            </button>
            <button class="btn btn-ghost" @tap="setAuto(!myAuto)">{{ myAuto ? '取消托管' : '托管' }}</button>
            <button v-if="isOwner && current.status === 'playing'" class="btn btn-ghost" @tap="onSave">保存并退出</button>
          </view>
        </view>

        <!-- ══ 定先手（开局掷骰仪式 + 结果定格） ══ -->
        <view v-if="current.opening || openingResult" class="duel-overlay">
          <!-- 结果定格：全员点数 + 先手者高亮，停留片刻再出发 -->
          <view v-if="!current.opening && openingResult" class="duel-panel">
            <view class="duel-title">🏆 先手诞生</view>
            <view class="open-grid">
              <view
                v-for="p in current.players.filter((x) => !x.left)"
                :key="p.seat"
                class="open-side"
                :class="{ 'open-win': p.seat === openingResult.winner, 'open-dim': p.seat !== openingResult.winner }"
              >
                <view v-if="p.seat === openingResult.winner" class="open-crown">👑 先手</view>
                <image class="duel-avatar open-avatar" :src="resolveAvatar(p.avatarUrl)" mode="aspectFill" />
                <view class="duel-name">{{ p.nickname }}</view>
                <view v-if="diceRolling && p.seat === current.mySeat" class="open-dice">🎲 掷骰中…</view>
                <view v-else-if="openingResult.rolls[String(p.seat)]" class="open-dice">
                  🎲 {{ openingResult.rolls[String(p.seat)]![0] }}+{{ openingResult.rolls[String(p.seat)]![1] }} = <text class="open-sum">{{ openingResult.rolls[String(p.seat)]![0] + openingResult.rolls[String(p.seat)]![1] }}</text>
                </view>
              </view>
            </view>
            <view class="duel-hint">{{ nickOf(openingResult.winner) }} 掷得先手，出发！</view>
          </view>
          <view v-else-if="current.opening" class="duel-panel">
            <view class="duel-title">🎯 定先手<text v-if="current.opening.round > 1"> · 并列重掷第 {{ current.opening.round }} 轮</text></view>
            <view class="open-grid">
              <view
                v-for="p in current.players.filter((x) => !x.left)"
                :key="p.seat"
                class="open-side"
                :class="{ 'open-tie': current.opening.tieSeats.includes(p.seat) }"
              >
                <image class="duel-avatar open-avatar" :src="resolveAvatar(p.avatarUrl)" mode="aspectFill" />
                <view class="duel-name">{{ p.nickname }}</view>
                <view v-if="diceRolling && p.seat === current.mySeat" class="open-dice">🎲 掷骰中…</view>
                <view v-else-if="openingRollOf(p.seat)" class="open-dice">
                  🎲 {{ openingRollOf(p.seat)![0] }}+{{ openingRollOf(p.seat)![1] }} = <text class="open-sum">{{ openingRollOf(p.seat)![0] + openingRollOf(p.seat)![1] }}</text>
                </view>
                <view v-else-if="current.opening.pending.includes(p.seat)" class="open-wait">待掷…</view>
                <view v-else class="open-wait muted">本轮轮空</view>
              </view>
            </view>
            <button v-if="current.opening.mine" class="btn btn-primary btn-lg" :loading="acting" @tap="onRoll">{{ diceRolling ? '🎲 掷骰中…' : '🎲 掷骰定先手' }}</button>
            <view v-else class="duel-hint muted">已出，等其他人掷骰…</view>
          </view>
        </view>

        <!-- ══ 决斗浮层（进行中 + 结果定格） ══ -->
        <view v-if="duelView || duelResultView" class="duel-overlay">
          <!-- 结果定格：双方亮招 + 胜者高亮（含比点数决斗） -->
          <view v-if="!duelView && duelResultView" class="duel-panel">
            <view class="duel-title">⚔️ 决斗结果</view>
            <view class="duel-vs">
              <view class="duel-side" :class="{ 'duel-side--win': duelResultView.a === duelResultView.winner, 'duel-side--dim': duelResultView.a !== duelResultView.winner }">
                <view v-if="duelResultView.a === duelResultView.winner" class="open-crown">👑 胜</view>
                <image class="duel-avatar" :src="resolveAvatar(playerBySeat(duelResultView.a)?.avatarUrl ?? '')" mode="aspectFill" />
                <view class="duel-name">{{ playerBySeat(duelResultView.a)?.nickname }}</view>
                <view class="duel-reveal">{{ pickLabel(duelResultView.picks[String(duelResultView.a)], duelResultView.format) }}</view>
              </view>
              <view class="duel-mid">VS</view>
              <view class="duel-side" :class="{ 'duel-side--win': duelResultView.b === duelResultView.winner, 'duel-side--dim': duelResultView.b !== duelResultView.winner }">
                <view v-if="duelResultView.b === duelResultView.winner" class="open-crown">👑 胜</view>
                <image class="duel-avatar" :src="resolveAvatar(playerBySeat(duelResultView.b)?.avatarUrl ?? '')" mode="aspectFill" />
                <view class="duel-name">{{ playerBySeat(duelResultView.b)?.nickname }}</view>
                <view class="duel-reveal">{{ pickLabel(duelResultView.picks[String(duelResultView.b)], duelResultView.format) }}</view>
              </view>
            </view>
            <view class="duel-stakes">胜 +{{ duelResultView.win }} / 败 -{{ duelResultView.lose }}</view>
          </view>
          <view v-else-if="duelView" class="duel-panel">
            <view class="duel-title">⚔️ 狭路相逢 · {{ duelFormatName(duelView.format) }}<text v-if="duelView.arena">（擂台）</text></view>
            <view class="duel-vs">
              <view class="duel-side">
                <image class="duel-avatar" :src="resolveAvatar(playerBySeat(duelView.a)?.avatarUrl ?? '')" mode="aspectFill" />
                <view class="duel-name">{{ playerBySeat(duelView.a)?.nickname }}</view>
              </view>
              <view class="duel-mid">VS</view>
              <view class="duel-side">
                <image v-if="duelView.b !== null" class="duel-avatar" :src="resolveAvatar(playerBySeat(duelView.b)?.avatarUrl ?? '')" mode="aspectFill" />
                <view v-else class="duel-avatar duel-avatar-unknown">？</view>
                <view class="duel-name">{{ duelView.b !== null ? playerBySeat(duelView.b)?.nickname : '选对手' }}</view>
              </view>
            </view>
            <view class="duel-stakes">胜 +{{ duelView.win }} / 败 -{{ duelView.lose }}<text v-if="huntwindOn"> · 猎风 +1</text></view>
            <view class="duel-countdown">{{ turnCountdown }}s</view>

            <!-- 我参与：选人 -->
            <view v-if="duelView.phase === 'pick' && duelView.mine" class="duel-picks">
              <view class="duel-hint">选择要挑战的对手</view>
              <view class="duel-candidates">
                <button v-for="c in duelView.candidates ?? []" :key="c" class="btn btn-ghost btn-sm" @tap="duel(c)">
                  {{ playerBySeat(c)?.nickname }}
                </button>
              </view>
            </view>

            <!-- 我参与：猜拳 -->
            <view v-else-if="duelView.phase === 'act' && duelView.mine && duelView.format === 'rps'" class="duel-picks">
              <view class="duel-hint">{{ duelView.myPick === null ? '暗出一拳' : '已出拳，等对方…' }}</view>
              <view v-if="duelView.myPick === null" class="duel-candidates">
                <button v-for="(label, i) in RPS_LABELS" :key="i" class="btn btn-primary btn-sm" @tap="duel(RPS_KEYS[i])">
                  {{ label }}
                </button>
              </view>
              <view v-else class="duel-picked">✊ {{ RPS_LABELS[Number(duelView.myPick)] }}</view>
            </view>

            <!-- 我参与：暗标 -->
            <view v-else-if="duelView.phase === 'act' && duelView.mine && duelView.format === 'bid'" class="duel-picks">
              <view class="duel-hint">{{ duelView.myPick === null ? `暗押枫叶（你有 🍁${myLeaves}）` : `已押 ${duelView.myPick}，等对方…` }}</view>
              <view v-if="duelView.myPick === null" class="duel-candidates">
                <button v-for="b in bidOptions" :key="b" class="btn btn-primary btn-sm" :disabled="b > myLeaves" @tap="duel(b)">
                  {{ b }}
                </button>
              </view>
            </view>

            <!-- 旁观/对方 -->
            <view v-else class="duel-picks">
              <view class="duel-hint muted">{{ duelView.format === 'dice' ? '比点数即出即结' : '双方暗出中…' }}</view>
            </view>

            <!-- 押注（非参战者） -->
            <view v-if="canBet" class="duel-bets">
              <view class="duel-bets-title">旁观押注（花 1 🍁，押中得 3）</view>
              <view class="duel-bets-row">
                <button class="btn btn-ghost btn-sm" :disabled="myLeaves < 1" @tap="bet(duelView.a)">
                  押 {{ playerBySeat(duelView.a)?.nickname }}
                </button>
                <button v-if="duelView.b !== null" class="btn btn-ghost btn-sm" :disabled="myLeaves < 1" @tap="bet(duelView.b)">
                  押 {{ playerBySeat(duelView.b)?.nickname }}
                </button>
              </view>
              <view v-if="duelView.bets.length" class="duel-bet-log">
                <text v-for="(b, i) in duelView.bets" :key="i">{{ playerBySeat(b.seat)?.nickname }}→{{ playerBySeat(b.on)?.nickname }} </text>
              </view>
            </view>
          </view>
        </view>

        <!-- ══ 选择窗弹层 ══ -->
        <view v-if="myChoice" class="choice-overlay">
          <view class="choice-panel">
            <view class="choice-title">{{ choiceTitle }}</view>
            <view v-if="myChoice.kind === 'fork'" class="choice-btns">
              <button v-for="opt in myChoice.options ?? []" :key="opt.key" class="btn btn-primary" :loading="acting" @tap="choose(opt.key)">
                {{ opt.label }}
              </button>
            </view>
            <view v-else-if="myChoice.kind === 'ambush'" class="choice-btns">
              <button class="btn btn-primary" :loading="acting" @tap="choose('yes')">埋雷（花 2 🍁）</button>
              <button class="btn btn-ghost" :loading="acting" @tap="choose('no')">不埋</button>
            </view>
            <view v-else-if="myChoice.kind === 'shop'" class="choice-btns">
              <button class="btn btn-primary" :loading="acting" @tap="choose('yes')">买一张（3 🍁）</button>
              <button class="btn btn-ghost" :loading="acting" @tap="choose('no')">不买</button>
            </view>
            <view v-else-if="myChoice.kind === 'shrine'" class="choice-btns">
              <button class="btn btn-primary" :loading="acting" @tap="choose('forward')">前进 4 格</button>
              <button class="btn btn-gold" :loading="acting" @tap="choose('item')">摸一张道具</button>
              <button class="btn btn-ghost" :loading="acting" @tap="choose('leaves')">+3 🍁</button>
            </view>
            <view v-else-if="myChoice.kind === 'arena'" class="choice-btns">
              <button v-for="c in myChoice.candidates ?? []" :key="c" class="btn btn-primary btn-sm" :loading="acting" @tap="choose(String(c))">
                挑战 {{ playerBySeat(c)?.nickname }}（{{ playerBySeat(c)?.pos }} 格）
              </button>
            </view>
            <view class="choice-countdown">{{ turnCountdown }}s 后自动选择</view>
          </view>
        </view>

        <!-- ══ 结算浮层 ══ -->
        <view v-if="current.status === 'finished'" class="finish-overlay">
          <view class="finish-panel">
            <view class="finish-title">🏁 登山结束</view>
            <view class="finish-list">
              <view v-for="p in rankedPlayers" :key="p.seat" class="finish-row" :class="{ 'finish-me': p.seat === mySeat }">
                <text class="finish-place">{{ medal(p.place) }}</text>
                <image class="finish-avatar" :src="resolveAvatar(p.avatarUrl)" mode="aspectFill" />
                <text class="finish-name">{{ p.nickname }}</text>
                <text class="finish-pos">{{ p.left ? `离场(${p.pos})` : p.finished ? `登顶` : `${p.pos} 格` }}</text>
                <text class="finish-score">胜 {{ current.scores[String(p.userId)] ?? 0 }}</text>
              </view>
            </view>
            <view class="finish-btns">
              <button class="btn btn-primary" :loading="acting" @tap="requestRematch">再来一局</button>
              <button class="btn btn-ghost" @tap="onLeave">离开</button>
            </view>
          </view>
        </view>

        <!-- ══ 聊天 ══ -->
        <view v-if="inPlay || current.status === 'finished'" class="chat-zone">
          <view class="chat-bar">
            <scroll-view class="chat-feed" scroll-x :show-scrollbar="false">
              <text v-for="m in recentChats" :key="m.seq" class="chat-feed-item" :class="{ 'chat-feed-me': m.seat === mySeat }">
                {{ chatPreview(m) }}
              </text>
            </scroll-view>
            <view class="chat-trigger" @tap="chatPanelOpen = true">
              💬<text v-if="unreadChat" class="chat-unread">{{ unreadChat > 9 ? '9+' : unreadChat }}</text>
            </view>
          </view>
        </view>
      </view>

    </view>

    <!-- 聊天面板 -->
    <view v-if="chatPanelOpen" class="chat-panel-mask" @tap="chatPanelOpen = false">
      <view class="chat-panel" @tap.stop>        <view class="chat-panel-tabs">
          <view v-for="t in chatTabs" :key="t.key" class="chat-tab" :class="{ active: chatTab === t.key }" @tap="chatTab = t.key">
            {{ t.label }}
          </view>
          <view class="chat-close" @tap="chatPanelOpen = false">✕</view>
        </view>
        <scroll-view class="chat-log" scroll-y :show-scrollbar="false">
          <view v-for="m in chatLog" :key="m.seq" class="chat-log-row" :class="{ 'chat-log-me': m.seat === mySeat }">
            <text class="chat-log-name">{{ m.seat === mySeat ? '我' : playerBySeat(m.seat)?.nickname }}</text>
            <text v-if="m.kind === 'sticker'" class="chat-log-sticker"><image class="sticker-img" :src="stickerUrl(m.text)" mode="aspectFit" /></text>
            <text v-else class="chat-log-text" :class="{ 'chat-log-emoji': m.kind === 'emoji' }">{{ chatBody(m) }}</text>
          </view>
        </scroll-view>
        <view v-if="chatTab === 'quick'" class="chat-groups">
          <view v-for="g in phraseGroups" :key="g.key" class="chat-group">
            <view class="chat-group-title">{{ g.title }}</view>
            <view class="chat-group-btns">
              <view v-for="p in g.phrases" :key="p.id" class="chat-phrase" :class="{ disabled: chatCooling }" @tap="sendPhrase(p.id)">
                {{ p.text }}
              </view>
            </view>
          </view>
        </view>
        <view v-else-if="chatTab === 'emoji'" class="chat-emoji-grid">
          <view v-for="e in ADVENTURE_EMOJIS" :key="e" class="chat-emoji" :class="{ disabled: chatCooling }" @tap="sendEmoji(e)">{{ e }}</view>
        </view>
        <view v-else-if="chatTab === 'sticker'" class="chat-sticker-grid">
          <view v-for="(path, id) in ADVENTURE_STICKERS" :key="id" class="chat-sticker" :class="{ disabled: chatCooling }" @tap="sendSticker(id)">
            <image class="chat-sticker-img" :src="stickerUrl(id)" mode="aspectFit" />
          </view>
        </view>
        <view v-else class="chat-text-row">
          <template v-if="adventureChatTextEnabled">
            <input
              v-model="chatInput"
              class="chat-input"
              type="text"
              maxlength="40"
              placeholder="说点什么（40 字内，须经审核）"
              confirm-type="send"
              :disabled="chatCooldown > 0"
              @confirm="sendText"
            />
            <button class="btn btn-primary btn-sm" :disabled="chatCooling || !chatInput.trim()" @tap="sendText">{{ chatCooling ? `${chatCooldown}s` : '发送' }}</button>

          </template>
          <view v-else class="chat-text-off">文字聊天维护中，快捷句/表情/贴纸仍可用</view>
        </view>
      </view>
    </view>

    <!-- 玩法说明 -->
    <GameRulesModal :visible="rulesOpen" title="枫趣冒险 · 玩法说明" :sections="GAME_RULES" @close="rulesOpen = false" />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload, onShareAppMessage } from '@dcloudio/uni-app'
import { cdnUrl } from '@/utils/cdn'
import { resolveAvatarUrl as resolveAvatar } from '@/services/toolbox'
import { useFeatures } from '@/composables/useFeatures'
import { useAdventureRoom } from './composables/useAdventureRoom'
import { cellToPoint, GOALS, GOAL_LABELS, seatColor } from './utils/adventureBoard'
import {
  ITEMS,
  RPS_KEYS,
  RPS_LABELS,
  duelFormatName,
  itemName,
  weatherDesc,
  weatherIcon,
  weatherName,
} from './utils/adventure'
import {
  ADVENTURE_EMOJIS,
  ADVENTURE_PHRASE_GROUPS,
  ADVENTURE_STICKERS,
  adventurePhraseText,
  stickerUrl,
} from './utils/adventureChat'
import {
  adventureSoundEnabled,
  playAdventureSound,
  setAdventureSoundEnabled,
  type AdventureSoundName,
} from './utils/adventureSound'
import type { AdventureChatMessage, AdventureEvent, AdventurePlayer } from '@/types/adventure'
import GameRulesModal from '@/components/GameRulesModal.vue'
import { adventureBoardImage } from './utils/adventureRender'

const rulesOpen = ref(false)

/** 玩法说明（玩家视角精简版；完整规则见 docs/adventure-rules.md）。 */
const GAME_RULES: { heading?: string; lines: string[] }[] = [
  {
    heading: '🎯 目标与移动',
    lines: [
      '2-6 人登山竞速，率先精确走到登顶格者夺冠，整局打满全部名次',
      '开局全员各掷一次双骰定先手，点数最大者先行；最大点并列的重新掷',
      '房主开局前可选路线长度：枫林 40 / 溪谷 60 / 岩壁 80 / 枫顶 100 格，短局时云雾之后的区域不开放',
      '每回合掷两颗骰子，按点数之和前进；双骰同点额外捡 2 枫叶',
      '步数超过登顶格会反弹；枫叶够差额时自动「补票」登顶',
      '棋盘分五段：山脚草原 → 枫叶林 → 清溪谷 → 岩壁 → 雪线',
    ],
  },
  {
    heading: '🏕️ 营地与机关格',
    lines: [
      '营地（21/41/61/81）是存档点：任何后退都不会跌破你已到过的营地，且营地内绝对安全',
      '云梯/缆车向前跳、滑坡/落石向后退；枫叶格和温泉捡枫叶',
      '商店花 3 枫叶买道具；补给站免费摸道具；手牌上限 3 张',
      '雪崩格：你身后 5 格内的其他人全部退 2',
      '岔路口二选一：捷径直达 vs 绕路捡枫叶，看天气预报再决定',
    ],
  },
  {
    heading: '⚔️ 狭路相逢（决斗）',
    lines: [
      '走到有人占的格子触发决斗，胜者前进败者后退（基础 +1 / -3，雪线翻倍）',
      '决斗形式按段位轮换：草原猜拳、枫叶林暗标枫叶（价高者胜且支付所标）、清溪谷比点数、岩壁猜拳',
      '擂台格可主动挑战任意玩家（+3 / -3）',
      '旁观者可花 1 枫叶押注某一方，押中得 3',
      '一回合最多一场决斗，之后再撞人只把对方顶退 2 格',
    ],
  },
  {
    heading: '🕳️ 事件格',
    lines: [
      '埋伏格：花 2 枫叶埋雷（归属保密），下一个踩中的对手退 3 且跳过一回合',
      '命运交换：与前方最近的人换位；第一名则白捡 3 枫叶',
      '山神小屋：和山神猜拳，赢了三选一（前进 4 / 摸道具 / +3 枫叶），输了交 2 枫叶买路钱',
    ],
  },
  {
    heading: '🎒 道具（掷骰后、走子前打出）',
    lines: [
      '⛏️ 登山镐：本回合 +2 步｜🎿 滑雪板：挡下一次滑坡/落石',
      '🌪️ 大风咒：指定玩家退 4｜❄️ 雪球：指定玩家下回合 -3',
      '🧥 换位斗篷：与任意玩家换位｜🚡 缆车票：前进到下一缆车站',
      '🍁 枫叶袋：+5 枫叶｜🔮 改天换地：弃掉下一张天气牌',
    ],
  },
  {
    heading: '🌤️ 天气',
    lines: [
      '每打满一轮翻一张天气牌，下一张预报对全员公开——看得见的随机，提前规划',
      '顺风全员前进、山风全员后退、泥石流领跑者后退、枫叶雨全员得枫叶',
      '暴风滑坡翻倍、大雾禁道具、缆车停运、封顶暴雪无法进入雪线',
    ],
  },
  {
    heading: '⏸️ 存档与掉线',
    lines: [
      '房主可随时保存对局，下次继续（7 天内有效）',
      '掉线不丢座位：回来即可接管，期间由托管代打',
      '超时会自动托管；连续 3 次超时进入挂机模式',
    ],
  },
]

const {
  state: current,
  acting,
  myRooms,
  isSeated,
  mySeat,
  isOwner,
  inPlay,
  isMyTurn,
  isMyResolve,
  myAuto,
  turnCountdown,
  refreshMyRooms,
  createAndEnter,
  joinByCode,
  start,
  setGoal,
  roll,
  useItem,
  confirmMove,
  choose,
  duel,
  bet,
  setAuto,
  saveRoom,
  resumeRoom,
  sendChat,
  requestRematch,
  exitRoom,
  startSync,
  stopSync,
} = useAdventureRoom()

const { adventureChatTextEnabled, refreshFeatures } = useFeatures()

// ---------------------------------------------------------------- 基础

const joinCode = ref('')
const soundOn = ref(adventureSoundEnabled())

function onCreate() {
  void createAndEnter()
}
function onJoin() {
  if (joinCode.value.length === 4) void joinByCode(joinCode.value)
}
function copyCode() {
  if (!current.value) return
  uni.setClipboardData({ data: current.value.code })
}
function toggleSound() {
  soundOn.value = !soundOn.value
  setAdventureSoundEnabled(soundOn.value)
}
function onSave() {
  uni.showModal({
    title: '保存对局',
    content: '保存后可下次继续，未归座位由托管代打。确定保存？',
    success: (res) => {
      if (res.confirm) void saveRoom()
    },
  })
}
function onLeave() {
  uni.showModal({
    title: '离开',
    content: '对局中离开将由托管代打，排名按离场时进度计算。确定离开？',
    success: (res) => {
      if (res.confirm) void exitRoom()
    },
  })
}

const seatPlayer = (seat: number): AdventurePlayer | undefined => current.value?.players.find((p) => p.seat === seat)
const playerBySeat = seatPlayer
function roomStatusText(status: string): string {
  return status === 'waiting' ? '等待中' : status === 'playing' ? '进行中' : status === 'saved' ? '已保存' : '已结束'
}
function medal(place: number | null): string {
  return place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : `#${place ?? '?'}`
}

// ---------------------------------------------------------------- 棋盘渲染

const boardSrc = ref('')
const boardWrapHeight = ref('0px')

const boardCssSize = ref(0)

async function ensureBoard() {
  const win = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
  const css = Math.min(win.windowWidth - 24, 560)
  boardCssSize.value = Math.round(css)
  boardWrapHeight.value = `${Math.round(css * 1.14)}px`
  const dpr = Math.min(Math.max(win.pixelRatio || 2, 2), 3)
  const px = Math.min(Math.round(css * dpr), 1600)
  const goal = current.value?.goal ?? 100
  // 渲染失败重试一次（canvas 偶发失败/资源迟到），再失败保留底色但记日志便于排查
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      boardSrc.value = await adventureBoardImage(px, goal)
      return
    } catch (error) {
      console.error(`[adventure] 棋盘渲染失败（第 ${attempt + 1} 次）`, error)
    }
  }
  boardSrc.value = ''
}

/** 进牌桌时若棋盘还没渲染出来则再试（首渲染失败/进入时房间态未知的自愈）。 */
watch(
  () => current.value?.status,
  (status) => {
    if ((status === 'playing' || status === 'saved' || status === 'finished') && !boardSrc.value) {
      void ensureBoard()
    }
  },
)

/** 路线长度变化（开局锁定/等待室切换）时重渲染棋盘（云雾封锁区）。 */
watch(
  () => current.value?.goal,
  () => {
    if (current.value) void ensureBoard()
  },
)

// ---------------------------------------------------------------- 棋子（全 DOM + CSS transition）

const BOARD_H_RATIO = 1.14

const tokens = computed(() => {
  const st = current.value
  if (!st || (!inPlay.value && st.status !== 'finished')) return []
  const present = st.players.filter((p) => !p.left)
  // 同格多棋子横向微错位
  const counts = new Map<number, number>()
  for (const p of present) counts.set(p.pos, (counts.get(p.pos) ?? 0) + 1)
  const seen = new Map<number, number>()
  return present.map((p) => {
    const point = cellToPoint(p.pos)
    const index = seen.get(p.pos) ?? 0
    seen.set(p.pos, index + 1)
    const total = counts.get(p.pos) ?? 1
    const dx = (index - (total - 1) / 2) * 4.2
    return {
      seat: p.seat,
      x: point.x * 100 + dx,
      y: (point.y / BOARD_H_RATIO) * 100,
      color: seatColor(p.seat),
      isMe: p.seat === st.mySeat,
      isCurrent: p.seat === st.currentSeat && st.status === 'playing',
      finished: p.finished,
      initial: (p.nickname || '?').slice(0, 1),
    }
  })
})

// ---------------------------------------------------------------- 骰子与决策窗口

/** 远端掷骰的短促抖动（别人掷骰时的反馈）。 */
const diceShaking = ref(false)
/** 我点击掷骰后的滚动动画：点击瞬间即开始随机翻面，权威点数到达（或超时）定格。 */
const diceRolling = ref(false)
const rollingFaces = ref<[number, number]>([1, 1])
let diceRollTimer: ReturnType<typeof setInterval> | null = null
let diceRollTimeout: ReturnType<typeof setTimeout> | null = null

const displayDice = computed<[number, number]>(() => {
  if (diceRolling.value) return rollingFaces.value
  return current.value?.roll ?? [0, 0]
})

function randomFace(): number {
  return 1 + Math.floor(Math.random() * 6)
}

function startDiceRolling() {
  if (diceRolling.value) return
  diceRolling.value = true
  rollingFaces.value = [randomFace(), randomFace()]
  if (diceRollTimer) clearInterval(diceRollTimer)
  diceRollTimer = setInterval(() => {
    rollingFaces.value = [randomFace(), randomFace()]
  }, 110)
  // 兜底：回包丢失/请求失败也不至于永远转
  if (diceRollTimeout) clearTimeout(diceRollTimeout)
  diceRollTimeout = setTimeout(stopDiceRolling, 3500)
}

function stopDiceRolling() {
  if (!diceRolling.value) return
  diceRolling.value = false
  if (diceRollTimer) { clearInterval(diceRollTimer); diceRollTimer = null }
  if (diceRollTimeout) { clearTimeout(diceRollTimeout); diceRollTimeout = null }
}

/** 权威点数到达即定格（含回包与 WS 推送两条路径）。 */
watch(
  () => current.value?.roll,
  (dice) => {
    if (dice) stopDiceRolling()
  },
)

/** 掷骰按钮统一入口：可掷才播动画（点了立刻有反馈），再发请求。 */
async function onRoll() {
  const st = current.value
  if (!st) return
  const openingMine = st.opening?.mine === true
  const myAct = st.status === 'playing' && st.phase === 'act' && isMyTurn.value
    && !st.pendingDuel && !st.pendingChoice
  if (!openingMine && !myAct) return
  startDiceRolling()
  await roll()
}
const myLeaves = computed(() => current.value?.players.find((p) => p.seat === current.value?.mySeat)?.leaves ?? 0)
/** 登山镐加成（本地跟踪事件；权威计算在服务端）。 */
const resolveBonus = ref(0)
const slowAhead = computed(() => current.value?.players.find((p) => p.seat === current.value?.mySeat)?.slow ?? 0)
const previewSteps = computed(() => {
  const st = current.value
  if (!st?.roll) return 0
  const sum = st.roll[0] + st.roll[1]
  return Math.max(1, sum - slowAhead.value) + resolveBonus.value
})
const huntwindOn = computed(() => current.value?.weather.current === 'huntwind')

// ---------------------------------------------------------------- 道具

const targetingItem = ref('')

function itemIcon(id: string): string {
  return ITEMS[id]?.icon ?? '🎁'
}
function canUseItemNow(id: string): boolean {
  const st = current.value
  if (!st || !isMyTurn.value || st.status !== 'playing') return false
  const def = ITEMS[id]
  if (!def) return false
  if (st.pendingChoice || st.pendingDuel) return false
  if (st.weather.current === 'fog') return false
  if (def.when === 'resolve' && st.phase !== 'resolve') return false
  if (id === 'cablecar') {
    if (st.weather.current === 'cablehalt') return false
    const pos = st.players.find((p) => p.seat === st.mySeat)?.pos ?? 0
    if (![14, 38, 62].some((s) => s > pos)) return false
  }
  return true
}
function tapItem(id: string) {
  if (!canUseItemNow(id)) {
    uni.showToast({ title: '现在不能用这张道具', icon: 'none' })
    return
  }
  const def = ITEMS[id]
  if (def?.target) {
    targetingItem.value = targetingItem.value === id ? '' : id
    return
  }
  void useItem(id)
}
function canTargetSeat(seat: number): boolean {
  const st = current.value
  return !!st && seat !== st.mySeat && !seatPlayer(seat)?.left && !seatPlayer(seat)?.finished
}
function tapPlayerChip(seat: number) {
  if (!targetingItem.value || !current.value) return
  if (!canTargetSeat(seat)) {
    uni.showToast({ title: '不能指定这个玩家', icon: 'none' })
    return
  }
  const id = targetingItem.value
  targetingItem.value = ''
  void useItem(id, seat)
}

// ---------------------------------------------------------------- 选择窗 / 决斗展示

const myChoice = computed(() => {
  const c = current.value?.pendingChoice
  return c && c.mine ? c : null
})
const duelView = computed(() => current.value?.pendingDuel ?? null)
const bidOptions = [0, 1, 2, 3, 4, 5]
const canBet = computed(() => {
  const st = current.value
  const d = st?.pendingDuel
  if (!st || !d || st.mySeat === null || st.status !== 'playing') return false
  if (d.a === st.mySeat || d.b === st.mySeat) return false
  if (d.phase === 'pick' || d.b === null) return false
  if (d.bets.some((b) => b.seat === st.mySeat)) return false
  const me = seatPlayer(st.mySeat)
  return !!me && !me.left && !me.finished
})
const choiceTitle = computed(() => {
  switch (myChoice.value?.kind) {
    case 'fork': return '🛤️ 岔路口'
    case 'ambush': return '🕳️ 埋伏格'
    case 'shop': return '🏪 山间商店'
    case 'shrine': return '⛩️ 山神的恩赐'
    case 'arena': return '⚔️ 决斗擂台'
    default: return '选择'
  }
})
const choiceWaitingText = computed(() => {
  const c = current.value?.pendingChoice
  if (!c) return ''
  return `${seatPlayer(c.seat)?.nickname ?? '?'} 正在${c.kind === 'arena' ? '挑选挑战对象' : '做选择'}…`
})

// ---------------------------------------------------------------- 定先手展示 + 结果定格

const openingView = computed(() => current.value?.opening ?? null)

function openingRollOf(seat: number): [number, number] | null {
  const roll = openingView.value?.rolls[String(seat)]
  return roll ?? null
}

/** 定先手结果定格：最后一轮全员点数 + 先手者，浮层多停留一会儿再收起。 */
const openingResult = ref<{ winner: number; rolls: Record<string, [number, number]> } | null>(null)
const openingDice = ref<Record<string, [number, number]>>({})
let openingResultTimer: ReturnType<typeof setTimeout> | null = null

/** 帧同步：重连/中间帧补齐已掷点数（最后一掷只存在于事件流里）。 */
watch(
  () => current.value?.opening?.rolls,
  (rolls) => {
    if (rolls) openingDice.value = { ...rolls }
  },
  { immediate: true },
)

function holdOpeningResult(winner: number) {
  openingResult.value = { winner, rolls: { ...openingDice.value } }
  if (openingResultTimer) clearTimeout(openingResultTimer)
  openingResultTimer = setTimeout(() => (openingResult.value = null), 2500)
}

/** 决斗结果定格：双方亮招 + 胜者高亮（比点数决斗此前完全没有浮层）。 */
const duelResultView = ref<{ a: number; b: number; picks: Record<string, number>; winner: number; win: number; lose: number; format: string } | null>(null)
const duelPicks: Record<string, number> = {}
let duelCtx: { a: number; b: number | null; format: string } | null = null
let duelResultTimer: ReturnType<typeof setTimeout> | null = null

/** 决斗亮招文案：猜拳值（0石头/1布/2剪刀）、暗标枫叶、比点数骰子。 */
function pickLabel(value: number | undefined, format: string): string {
  if (value === undefined) return '…'
  if (format === 'bid') return `${value} 🍁`
  if (format === 'dice') return `🎲 ${value}`
  return RPS_LABELS[value] ?? String(value)
}

function holdDuelResult(winner: number, win: number, lose: number) {
  if (duelCtx === null || duelCtx.b === null) return
  duelResultView.value = { a: duelCtx.a, b: duelCtx.b, picks: { ...duelPicks }, winner, win, lose, format: duelCtx.format }
  if (duelResultTimer) clearTimeout(duelResultTimer)
  duelResultTimer = setTimeout(() => (duelResultView.value = null), 2000)
}

// ---------------------------------------------------------------- 事件播报 + 音效

const bannerText = ref('')
const weatherBanner = ref('')
const lastSaveByOwner = ref(true)
let bannerTimer: ReturnType<typeof setTimeout> | null = null
let weatherBannerTimer: ReturnType<typeof setTimeout> | null = null
let lastSeq = 0
let lastRoomCode = ''

watch(
  () => current.value?.version,
  () => {
    const st = current.value
    if (!st) return
    if (st.code !== lastRoomCode) {
      lastRoomCode = st.code
      lastSeq = st.events.length ? Math.max(...st.events.map((e) => e.seq)) : 0
      return
    }
    for (const ev of st.events) {
      if (ev.seq <= lastSeq) continue
      lastSeq = ev.seq
      handleEvent(ev)
    }
  },
)

function handleEvent(ev: AdventureEvent) {
  const st = current.value
  // 定先手/决斗的展示层追踪（结果定格用）
  if (ev.t === 'openRoll' && Array.isArray(ev.v)) {
    openingDice.value[String(ev.seat)] = ev.v as [number, number]
    if (ev.seat === st?.mySeat) stopDiceRolling() // 定先手的点数不进 state.roll，动画由事件定格
  } else if (ev.t === 'openTie') {
    openingDice.value = {}
  } else if (ev.t === 'firstPlayer' && ev.seat !== null && ev.seat !== undefined) {
    holdOpeningResult(ev.seat)
  } else if (ev.t === 'duelStart') {
    duelCtx = { a: ev.a ?? 0, b: ev.b ?? null, format: ev.format ?? 'rps' }
    for (const k of Object.keys(duelPicks)) delete duelPicks[k]
  } else if (ev.t === 'duelTarget') {
    if (duelCtx) duelCtx.b = ev.b ?? null
  } else if (ev.t === 'duelPick' && ev.v && typeof ev.v === 'object') {
    for (const [k, val] of Object.entries(ev.v as Record<string, number>)) duelPicks[k] = val
  } else if (ev.t === 'duelTie') {
    for (const k of Object.keys(duelPicks)) delete duelPicks[k]
  } else if (ev.t === 'duelResult' && ev.winner !== undefined && ev.winner !== null) {
    holdDuelResult(ev.winner, ev.win ?? 1, ev.lose ?? 3)
  }
  // 登山镐加成本地跟踪：我掷骰时清零、我打出登山镐时 +2
  if (ev.t === 'roll' && ev.seat === st?.mySeat) resolveBonus.value = 0
  if (ev.t === 'item' && ev.seat === st?.mySeat && ev.v === 'pickaxe') resolveBonus.value += 2
  if (ev.t === 'roll' && ev.seat !== null) {
    diceShaking.value = true
    setTimeout(() => (diceShaking.value = false), 380)
  }
  if (ev.t === 'weather') {
    weatherBanner.value = `天气转变：${weatherName(typeof ev.v === 'string' ? ev.v : null)}`
    playAdventureSound('weather')
    if (weatherBannerTimer) clearTimeout(weatherBannerTimer)
    weatherBannerTimer = setTimeout(() => (weatherBanner.value = ''), 2600)
    return
  }
  if (ev.t === 'weatherChange') {
    weatherBanner.value = '🔮 天气预报已改变'
    if (weatherBannerTimer) clearTimeout(weatherBannerTimer)
    weatherBannerTimer = setTimeout(() => (weatherBanner.value = ''), 2200)
    return
  }
  if (ev.t === 'save') {
    lastSaveByOwner.value = ev.v !== 'auto'
    banner('⏸ 对局已保存')
    return
  }
  if (ev.t === 'resume') {
    banner('▶️ 对局继续')
    return
  }
  const text = eventText(ev)
  if (!text) return
  banner(text)
  const sound = eventSound(ev.t)
  if (sound) playAdventureSound(sound)
}

function banner(text: string) {
  bannerText.value = text
  if (bannerTimer) clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => (bannerText.value = ''), 2400)
}

function nickOf(seat: number | null | undefined): string {
  if (seat === null || seat === undefined) return '?'
  return seatPlayer(seat)?.nickname ?? '?'
}

function eventText(ev: AdventureEvent): string {
  switch (ev.t) {
    case 'start': return ev.v === 'rematch' ? '🏔️ 再来一局！重新掷骰定先手' : '🏔️ 对局开始！掷骰定先手'
    case 'roll': return `${nickOf(ev.seat)} 掷出 ${(ev.v as number[] | undefined)?.join(' + ') ?? '?'}`
    case 'openRoll': return '' // 定先手浮层实时展示，不占播报条
    case 'openTie': return '🎲 最大点并列，并列者重掷！'
    case 'firstPlayer': return `🎲 ${nickOf(ev.seat)} 掷得先手！`
    case 'doubles': return `${nickOf(ev.seat)} 双骰同点，捡 2 🍁`
    case 'ticket': return `${nickOf(ev.seat)} 花 ${ev.cost} 🍁 补票登顶！`
    case 'ladder': return `${nickOf(ev.seat)} 踩上云梯 → ${ev.to}`
    case 'cable': return `${nickOf(ev.seat)} 坐缆车 → ${ev.to}`
    case 'cableHalt': return '缆车停运，只能爬了'
    case 'slide': return `${nickOf(ev.seat)} 滑坡 ↓ 到 ${ev.to}`
    case 'rock': return `${nickOf(ev.seat)} 被落石砸退`
    case 'leaf': return `${nickOf(ev.seat)} 捡了 ${ev.v} 🍁`
    case 'spring': return `${nickOf(ev.seat)} 泡温泉 +${ev.v} 🍁`
    case 'shop': return ev.v ? `${nickOf(ev.seat)} 买了「${itemName(String(ev.v))}」` : `${nickOf(ev.seat)} 没买东西`
    case 'supply': return `${nickOf(ev.seat)} 补给到手「${itemName(String(ev.v))}」`
    case 'ambushSet': return `${nickOf(ev.seat)} 悄悄埋了雷…`
    case 'ambushHit': return `💥 ${nickOf(ev.seat)} 踩了 ${nickOf(ev.owner)} 的埋伏！退 3 且跳过一回合`
    case 'fate': return ev.with !== undefined ? `🔁 命运交换：${nickOf(ev.seat)} ↔ ${nickOf(ev.with)}` : `${nickOf(ev.seat)} 第一名，白捡 3 🍁`
    case 'shrineWin': return `⛩️ ${nickOf(ev.seat)} 赢了山神`
    case 'shrineLose': return `⛩️ ${nickOf(ev.seat)} 输给山神，交买路钱`
    case 'shrineReward': return `${nickOf(ev.seat)} 选了${ev.v === 'forward' ? '前进 4 格' : ev.v === 'item' ? '摸道具' : '+3 枫叶'}`
    case 'fork': return `${nickOf(ev.seat)} 在岔路口选了${ev.v === 'trail' ? '山道' : '捷径'}`
    case 'avalanche': return `⛰️ 雪崩！${nickOf(ev.seat)} 身后的人都被冲退`
    case 'bump': return `${nickOf(ev.by)} 把 ${nickOf(ev.seat)} 顶退 2 格`
    case 'duelStart': return `⚔️ ${nickOf(ev.a)} 与 ${nickOf(ev.b)} 狭路相逢！`
    case 'duelTarget': return `${nickOf(ev.a)} 选定对手 ${nickOf(ev.b)}`
    case 'duelTie': return '平局！重新出'
    case 'duelDiceOff': return '转比点数决胜'
    case 'duelPick': return '双方亮招！'
    case 'bidPaid': return `${nickOf(ev.seat)} 为胜利支付 ${ev.v} 🍁`
    case 'duelResult': return `${nickOf(ev.winner)} 赢下决斗！${nickOf(ev.loser)} 被击退`
    case 'bet': return `${nickOf(ev.seat)} 押注 ${nickOf(ev.on)}`
    case 'betWin': return `押中了！${(ev.v as number[] | undefined)?.map((s) => nickOf(s)).join('、')} 各得 3 🍁`
    case 'summit': return `🏁 ${nickOf(ev.seat)} 登顶枫顶！`
    case 'skip': return `${nickOf(ev.seat)} 被跳过一回合`
    case 'item': return `${nickOf(ev.seat)} 使用「${itemName(String(ev.v))}」`
    case 'shield': return `${nickOf(ev.seat)} 的滑雪板挡下了伤害`
    case 'timeout': return `${nickOf(ev.seat)} 超时`
    case 'autoOn': return `${nickOf(ev.seat)} 开启托管`
    case 'autoOff': return `${nickOf(ev.seat)} 取消托管`
    case 'leave': return `${nickOf(ev.seat)} 离开了`
    case 'win': return ev.reason === 'last_man' ? `只剩 ${nickOf(ev.seat)} 还在山上，判胜` : `🏆 ${nickOf(ev.seat)} 夺冠！`
    case 'tornado': return `🌀 龙卷风卷动了 ${nickOf(ev.seat)}`
    case 'leafrain': return '🍂 枫叶雨！全员 +3 🍁'
    case 'camp': return `${nickOf(ev.seat)} 到达营地（存档）`
    case 'campHold': return `${nickOf(ev.seat)} 被营地接住`
    case 'blizzardBlock': return `${nickOf(ev.seat)} 被暴雪拦在 81 营地`
    case 'bounce': return `${nickOf(ev.seat)} 冲过头反弹到 ${ev.to}`
    default: return ''
  }
}

function eventSound(t: string): AdventureSoundName | null {
  switch (t) {
    case 'roll': return 'roll'
    case 'ladder': case 'cable': return 'cable'
    case 'slide': case 'rock': return 'slide'
    case 'leaf': case 'spring': return 'leaf'
    case 'item': case 'shop': case 'supply': return 'item'
    case 'duelStart': case 'duelTarget': return 'duel'
    case 'duelResult': case 'firstPlayer': return 'duelwin'
    case 'bet': case 'betWin': return 'bet'
    case 'ambushHit': return 'trap'
    case 'summit': return 'summit'
    case 'win': return 'win'
    default: return null
  }
}

// ---------------------------------------------------------------- 排行

const rankedPlayers = computed(() => {
  const st = current.value
  if (!st?.places) return st?.players ?? []
  return [...st.players].sort((a, b) => (st.places?.[String(a.seat)] ?? 99) - (st.places?.[String(b.seat)] ?? 99))
})

// ---------------------------------------------------------------- 聊天

const chatPanelOpen = ref(false)
const chatTab = ref<'quick' | 'emoji' | 'sticker' | 'text'>('quick')
const chatTabs = [
  { key: 'quick', label: '快捷' },
  { key: 'emoji', label: '表情' },
  { key: 'sticker', label: '贴纸' },
  { key: 'text', label: '文字' },
] as const
const chatInput = ref('')
const chatCooling = ref(false)
const chatCooldown = ref(0)
const unreadChat = ref(0)
const chatBubbles = reactive<Record<number, { text: string; isEmoji: boolean }>>({})
const bubbleTimers = new Map<number, ReturnType<typeof setTimeout>>()
let lastChatSeq = 0
let chatSynced = false

const phraseGroups = computed(() => {
  const list = [...ADVENTURE_PHRASE_GROUPS]
  if (current.value?.pendingDuel) {
    // 决斗进行中把「决斗」组前置
    list.sort((a, b) => Number(b.key === 'duel') - Number(a.key === 'duel'))
  }
  return list
})

const recentChats = computed(() => (current.value?.chat ?? []).slice(-5))
const chatLog = computed(() => [...(current.value?.chat ?? [])].reverse().slice(0, 30))

function chatBody(m: AdventureChatMessage): string {
  if (m.kind === 'phrase') return adventurePhraseText(m.text) ?? m.text
  return m.text
}
function chatPreview(m: AdventureChatMessage): string {
  const name = m.seat === current.value?.mySeat ? '我' : nickOf(m.seat)
  const body = m.kind === 'sticker' ? '[贴纸]' : m.kind === 'emoji' ? m.text : chatBody(m)
  return `${name}: ${body}`
}

watch(
  () => current.value?.chat,
  (chat) => {
    const st = current.value
    if (!st || !chat?.length) return
    if (!chatSynced) {
      chatSynced = true
      lastChatSeq = chat[chat.length - 1].seq
      return
    }
    for (const m of chat) {
      if (m.seq <= lastChatSeq) continue
      lastChatSeq = m.seq
      showBubble(m)
      if (m.seat !== st.mySeat) {
        playAdventureSound('chat')
        if (!chatPanelOpen.value) unreadChat.value++
      }
    }
  },
)

watch(
  () => current.value?.code,
  () => {
    chatSynced = false
    lastChatSeq = 0
    unreadChat.value = 0
  },
)

function showBubble(m: AdventureChatMessage) {
  const text = m.kind === 'sticker' ? '[贴纸]' : m.kind === 'phrase' ? adventurePhraseText(m.text) ?? m.text : m.text
  chatBubbles[m.seat] = { text, isEmoji: m.kind === 'emoji' }
  const old = bubbleTimers.get(m.seat)
  if (old) clearTimeout(old)
  bubbleTimers.set(m.seat, setTimeout(() => delete chatBubbles[m.seat], 4000))
}

function startChatCooldown() {
  chatCooling.value = true
  chatCooldown.value = 3
  const timer = setInterval(() => {
    chatCooldown.value--
    if (chatCooldown.value <= 0) {
      clearInterval(timer)
      chatCooling.value = false
    }
  }, 1000)
}

async function sendPhrase(id: string) {
  if (chatCooling.value) return
  chatPanelOpen.value = false
  startChatCooldown()
  await sendChat('phrase', { id })
}
async function sendEmoji(emoji: string) {
  if (chatCooling.value) return
  chatPanelOpen.value = false
  startChatCooldown()
  await sendChat('emoji', { id: emoji })
}
async function sendSticker(id: string) {
  if (chatCooling.value) return
  chatPanelOpen.value = false
  startChatCooldown()
  await sendChat('sticker', { id })
}
async function sendText() {
  const text = chatInput.value.trim()
  if (!text || chatCooling.value) return
  // 同 uno：发送即清空输入并收起面板——消息随后出现在底部 feed / 座位气泡里
  chatInput.value = ''
  chatPanelOpen.value = false
  startChatCooldown()
  const ok = await sendChat('text', { text })
  if (!ok) chatInput.value = text // 发送失败还原文字（重开面板可见）
}

// ---------------------------------------------------------------- 生命周期

onLoad((query) => {
  void ensureBoard()
  void refreshFeatures()
  const room = typeof query?.room === 'string' ? query.room : ''
  if (room && /^[0-9]{4}$/.test(room)) {
    void joinByCode(room)
  }
})

onShow(() => {
  void refreshMyRooms()
  void refreshFeatures()
  if (current.value) startSync()
})

onHide(() => stopSync())
onUnload(() => stopSync())

onShareAppMessage(() => ({
  title: '枫趣冒险 · 一起来登枫叶山',
  path: current.value?.sharePath ?? '/pages-adventure/index',
}))
</script>

<style lang="scss" scoped>
$ink: #21483d;
$cream: #fff8ed;
$maple: #e85d4a;
$gold: #f4b942;
$muted: #9aa79e;

.page {
  min-height: 100vh;
  background: $cream;
  padding-bottom: env(safe-area-inset-bottom);
}

.btn {
  border-radius: 16rpx;
  font-size: 28rpx;
  font-weight: 600;
  padding: 0 32rpx;
  height: 76rpx;
  line-height: 76rpx;
  border: none;
  &.btn-primary { background: $maple; color: #fff; }
  &.btn-gold { background: $gold; color: $ink; }
  &.btn-ghost { background: rgba(33, 72, 61, 0.08); color: $ink; }
  &.btn-sm { height: 60rpx; line-height: 60rpx; font-size: 24rpx; padding: 0 24rpx; }
  &.btn-lg { height: 92rpx; line-height: 92rpx; font-size: 32rpx; flex: 1; }
  &[disabled] { opacity: 0.45; }
}

// ── 大厅 ──
.lobby { padding: 80rpx 48rpx; display: flex; flex-direction: column; align-items: center; gap: 40rpx; }
.lobby-logo { display: flex; flex-direction: column; align-items: center; gap: 16rpx; margin-top: 60rpx; }
.lobby-logo-img { width: 180rpx; height: 180rpx; border-radius: 40rpx; background: rgba(33,72,61,0.06); }
.lobby-title { font-size: 48rpx; font-weight: 800; color: $ink; letter-spacing: 4rpx; }
.lobby-sub { font-size: 24rpx; color: $muted; }
.lobby-actions { width: 100%; display: flex; flex-direction: column; gap: 24rpx; }
.join-row { display: flex; gap: 16rpx; }
.join-input {
  flex: 1; height: 76rpx; background: #fff; border: 2rpx solid rgba(33,72,61,0.15);
  border-radius: 16rpx; padding: 0 24rpx; font-size: 30rpx; letter-spacing: 8rpx; text-align: center;
}
.rules-entry { text-align: center; font-size: 26rpx; color: #21483d; text-decoration: underline; padding: 8rpx 0; }
.my-rooms { width: 100%; background: #fff; border-radius: 20rpx; padding: 24rpx; }
.my-rooms-title { font-size: 26rpx; font-weight: 700; color: $ink; margin-bottom: 16rpx; }
.my-room-item { display: flex; align-items: center; gap: 16rpx; padding: 16rpx 8rpx; border-top: 2rpx solid rgba(33,72,61,0.06); }
.my-room-code { font-size: 32rpx; font-weight: 800; color: $ink; letter-spacing: 4rpx; }
.my-room-meta { flex: 1; font-size: 24rpx; color: $muted; }
.my-room-go { font-size: 26rpx; color: $maple; font-weight: 600; }
.lobby-hint { font-size: 22rpx; color: $muted; }

// ── 顶栏 ──
.room-header { display: flex; align-items: center; justify-content: space-between; padding: 20rpx 24rpx; }
.room-code { font-size: 30rpx; font-weight: 800; color: $ink; letter-spacing: 4rpx; }
.header-btns { display: flex; gap: 16rpx; align-items: center; }
.icon-btn { font-size: 28rpx; padding: 8rpx 20rpx; background: rgba(33,72,61,0.08); border-radius: 12rpx; color: $ink; }
.share-btn { margin: 0; line-height: 1.4; font-size: 26rpx; }

// ── 等待室 ──
.waiting { padding: 24rpx; }
.route-picker { background: #fff; border-radius: 20rpx; padding: 20rpx 24rpx; margin-bottom: 20rpx; }
.route-title { font-size: 26rpx; font-weight: 700; color: $ink; margin-bottom: 14rpx; }
.route-options { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12rpx; }
.route-opt {
  display: flex; flex-direction: column; align-items: center; gap: 4rpx; padding: 14rpx 8rpx;
  background: rgba(33, 72, 61, 0.05); border-radius: 14rpx; border: 3rpx solid transparent;
}
.route-active { border-color: $maple; background: rgba(232, 93, 74, 0.1); }
.route-name { font-size: 21rpx; font-weight: 700; color: $ink; }
.route-cells { font-size: 19rpx; color: $muted; }
.route-current { font-size: 26rpx; color: $ink; font-weight: 600; }
.seats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20rpx; }
.seat-card {
  background: #fff; border-radius: 20rpx; padding: 24rpx 12rpx; display: flex; flex-direction: column;
  align-items: center; gap: 12rpx; border: 3rpx solid transparent;
}
.seat-empty { border-style: dashed; border-color: rgba(33,72,61,0.18); background: transparent; }
.seat-avatar { width: 96rpx; height: 96rpx; border-radius: 50%; background: rgba(33,72,61,0.06); }
.seat-plus { font-size: 64rpx; color: rgba(33,72,61,0.25); line-height: 96rpx; }
.seat-name { font-size: 24rpx; color: $ink; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.muted { color: $muted; }
.seat-tags { display: flex; gap: 8rpx; }
.tag { font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; }
.tag-owner { background: rgba(244,185,66,0.25); color: #8a6314; }
.tag-off { background: rgba(0,0,0,0.08); color: $muted; }
.waiting-actions { margin-top: 32rpx; display: flex; flex-direction: column; gap: 16rpx; align-items: center; }
.hint { font-size: 24rpx; color: $muted; text-align: center; margin-top: 16rpx; }

// ── 玩家条 ──
.players-bar { background: #fff; border-radius: 20rpx; padding: 16rpx 8rpx; white-space: nowrap; }
.players-row { display: inline-flex; gap: 16rpx; padding: 0 12rpx; padding-top: 64rpx; margin-top: -32rpx; }
.player-chip {
  display: inline-flex; flex-direction: column; align-items: center; gap: 6rpx; width: 140rpx;
  padding: 12rpx 8rpx; border-radius: 16rpx; border: 3rpx solid transparent; position: relative;
}
.player-current { border-color: $gold; background: rgba(244,185,66,0.1); }
.player-targetable { border-color: $maple; background: rgba(232,93,74,0.12); }
.player-avatar-wrap { position: relative; }
.player-avatar { width: 72rpx; height: 72rpx; border-radius: 50%; background: rgba(33,72,61,0.06); }
.player-dot { position: absolute; right: -4rpx; bottom: -4rpx; width: 22rpx; height: 22rpx; border-radius: 50%; border: 3rpx solid #fff; }
.player-badge {
  position: absolute; left: -8rpx; top: -8rpx; font-size: 18rpx; background: rgba(0,0,0,0.55); color: #fff;
  border-radius: 10rpx; padding: 2rpx 8rpx;
}
.badge-auto { background: rgba(244,185,66,0.9); color: $ink; }
.player-name { font-size: 22rpx; color: $ink; max-width: 130rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.player-stats { display: flex; gap: 6rpx; flex-wrap: wrap; justify-content: center; }
.stat { font-size: 18rpx; color: $muted; }
.stat-leaf { color: #b0631a; }
.player-effects { display: flex; gap: 4rpx; }
.fx { font-size: 18rpx; }
.player-place { font-size: 20rpx; font-weight: 800; color: $gold; }
.player-finished { font-size: 18rpx; color: #3a7e5f; font-weight: 700; }

// ── 天气栏 ──
.weather-bar { display: flex; align-items: center; gap: 12rpx; padding: 14rpx 24rpx; }
.weather-chip {
  flex: 1; display: flex; align-items: center; gap: 12rpx; background: #fff; border-radius: 16rpx; padding: 10rpx 16rpx;
  border: 3rpx solid rgba(74,127,181,0.25);
}
.weather-next { border-color: rgba(33,72,61,0.12); opacity: 0.85; }
.weather-icon { font-size: 40rpx; }
.weather-name { font-size: 22rpx; font-weight: 700; color: $ink; }
.weather-desc { font-size: 18rpx; color: $muted; }
.weather-arrow { font-size: 20rpx; color: $muted; white-space: nowrap; }

// ── 棋盘 ──
.board-wrap { position: relative; margin: 8rpx auto; }
.board-img { width: 100%; height: auto; aspect-ratio: 1 / 1; border-radius: 20rpx; }
.board-fallback { width: 100%; aspect-ratio: 1 / 1; border-radius: 20rpx; background: #f2ead9; }
.token {
  position: absolute; width: 7%; aspect-ratio: 1; border-radius: 50%; transform: translate(-50%, -50%);
  display: flex; align-items: center; justify-content: center; border: 4rpx solid #fff;
  box-shadow: 0 4rpx 10rpx rgba(33,72,61,0.35);
  transition: left 0.45s cubic-bezier(0.34, 1.3, 0.64, 1), top 0.45s cubic-bezier(0.34, 1.3, 0.64, 1);
  z-index: 5;
}
.token-face { color: #fff; font-size: 22rpx; font-weight: 800; }
.token-me { box-shadow: 0 0 0 4rpx rgba(244,185,66,0.7), 0 4rpx 10rpx rgba(33,72,61,0.35); }
.token-current { animation: token-pulse 0.9s infinite; }
.token-finished { opacity: 0.55; }
@keyframes token-pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); }
  50% { transform: translate(-50%, -50%) scale(1.12); }
}
.event-banner {
  position: absolute; left: 50%; top: 6%; transform: translateX(-50%); background: rgba(33,72,61,0.85); color: #fff;
  font-size: 24rpx; padding: 10rpx 28rpx; border-radius: 999rpx; white-space: nowrap; z-index: 10;
  animation: banner-in 0.25s ease-out;
}
.weather-banner {
  position: absolute; left: 50%; top: 22%; transform: translateX(-50%); background: rgba(74,127,181,0.92); color: #fff;
  font-size: 30rpx; font-weight: 800; padding: 16rpx 40rpx; border-radius: 20rpx; white-space: nowrap; z-index: 10;
  animation: banner-in 0.3s ease-out;
}
@keyframes banner-in { from { opacity: 0; transform: translateX(-50%) translateY(-12rpx); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

.saved-bar { display: flex; align-items: center; gap: 16rpx; margin: 8rpx 24rpx; padding: 16rpx 24rpx; background: rgba(244,185,66,0.15); border-radius: 16rpx; }
.saved-text { flex: 1; font-size: 26rpx; color: #8a6314; font-weight: 600; }
.saved-wait { font-size: 22rpx; color: $muted; }

// ── 行动区 ──
.action-zone { padding: 12rpx 24rpx 8rpx; display: flex; flex-direction: column; gap: 16rpx; }
.turn-line { display: flex; align-items: center; justify-content: space-between; }
.turn-text { font-size: 26rpx; color: $ink; font-weight: 600; }
.countdown { font-size: 28rpx; font-weight: 800; color: $maple; min-width: 70rpx; text-align: right; }
.dice-zone { display: flex; align-items: center; justify-content: center; gap: 20rpx; }
.dice-pair { display: flex; gap: 16rpx; }
.dice {
  width: 88rpx; height: 88rpx; border-radius: 18rpx; background: #fff; border: 3rpx solid $ink;
  display: flex; align-items: center; justify-content: center; font-size: 44rpx; font-weight: 800; color: $ink;
}
.dice-shaking { animation: dice-shake 0.35s ease-in-out infinite; }
@keyframes dice-shake {
  0%, 100% { transform: rotate(0); }
  25% { transform: rotate(-8deg); }
  75% { transform: rotate(8deg); }
}
.dice-bonus { font-size: 26rpx; color: #3a7e5f; font-weight: 700; }
.dice-slow { font-size: 24rpx; color: #4a7fb5; }
.hand-bar { background: #fff; border-radius: 16rpx; padding: 12rpx 16rpx; }
.hand-title { font-size: 22rpx; color: $muted; margin-bottom: 8rpx; }
.hand-scroll { white-space: nowrap; }
.hand-row { display: inline-flex; gap: 12rpx; padding: 4rpx; }
.item-card {
  display: inline-flex; flex-direction: column; align-items: center; gap: 4rpx; width: 128rpx; padding: 12rpx 8rpx;
  background: rgba(33,72,61,0.05); border-radius: 14rpx; border: 3rpx solid transparent; opacity: 0.55;
}
.item-usable { opacity: 1; border-color: rgba(232,93,74,0.5); background: rgba(232,93,74,0.08); }
.item-targeting { border-color: $maple; background: rgba(232,93,74,0.18); }
.item-icon { font-size: 40rpx; }
.item-name { font-size: 20rpx; color: $ink; }
.hand-empty { font-size: 22rpx; color: $muted; line-height: 90rpx; }
.targeting-hint { font-size: 22rpx; color: $maple; margin-top: 8rpx; }
.link { text-decoration: underline; }
.action-btns { display: flex; gap: 16rpx; }

// ── 决斗浮层 ──
.duel-overlay { position: fixed; inset: 0; background: rgba(33,42,38,0.55); z-index: 90; display: flex; align-items: center; justify-content: center; }
.duel-panel {
  width: 82%; max-width: 640rpx; background: $cream; border-radius: 28rpx; padding: 32rpx;
  display: flex; flex-direction: column; align-items: center; gap: 16rpx; border: 4rpx solid $ink;
}
.duel-title { font-size: 30rpx; font-weight: 800; color: $ink; }
.duel-vs { display: flex; align-items: center; gap: 32rpx; }
.duel-side { display: flex; flex-direction: column; align-items: center; gap: 8rpx; }
.duel-avatar { width: 110rpx; height: 110rpx; border-radius: 50%; background: #fff; border: 4rpx solid $gold; }
.duel-avatar-unknown { display: flex; align-items: center; justify-content: center; font-size: 52rpx; color: $muted; }
.duel-name { font-size: 24rpx; color: $ink; }
.duel-mid { font-size: 36rpx; font-weight: 900; color: $maple; }
.duel-stakes { font-size: 24rpx; color: #8a6314; }
.duel-countdown { font-size: 26rpx; font-weight: 800; color: $maple; }

// ── 定先手浮层 ──
.open-grid { display: flex; flex-wrap: wrap; gap: 16rpx; justify-content: center; }
.open-side {
  display: flex; flex-direction: column; align-items: center; gap: 6rpx; width: 168rpx;
  background: rgba(33, 72, 61, 0.05); border-radius: 16rpx; padding: 12rpx 8rpx;
  border: 3rpx solid transparent;
}
.open-tie { border-color: $gold; background: rgba(244, 185, 66, 0.14); }
.open-avatar { width: 76rpx; height: 76rpx; }
.open-dice { font-size: 20rpx; color: $ink; }
.open-sum { font-weight: 800; color: $maple; font-size: 24rpx; }
.open-wait { font-size: 20rpx; color: $muted; }
.open-win { border-color: $gold; background: rgba(244, 185, 66, 0.16); animation: open-win-pulse 1s ease-in-out infinite; }
.open-dim { opacity: 0.55; }
.open-crown {
  align-self: center; font-size: 20rpx; font-weight: 800; background: $gold; color: $ink;
  border-radius: 999rpx; padding: 4rpx 14rpx; margin-bottom: 6rpx; box-shadow: 0 4rpx 10rpx rgba(0,0,0,0.25);
}
.duel-side--win { animation: open-win-pulse 1s ease-in-out infinite; }
.duel-side--dim { opacity: 0.5; }
.duel-reveal { font-size: 26rpx; font-weight: 800; color: $ink; margin-top: 4rpx; }
@keyframes open-win-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.07); }
}
.duel-picks { display: flex; flex-direction: column; align-items: center; gap: 12rpx; width: 100%; }
.duel-hint { font-size: 24rpx; color: $ink; }
.duel-candidates { display: flex; flex-wrap: wrap; gap: 12rpx; justify-content: center; }
.duel-picked { font-size: 30rpx; font-weight: 800; color: $ink; }
.duel-bets { width: 100%; border-top: 2rpx dashed rgba(33,72,61,0.2); padding-top: 16rpx; display: flex; flex-direction: column; gap: 8rpx; }
.duel-bets-title { font-size: 22rpx; color: $muted; text-align: center; }
.duel-bets-row { display: flex; gap: 12rpx; justify-content: center; }
.duel-bet-log { font-size: 20rpx; color: #b0631a; text-align: center; }

// ── 选择窗 ──
.choice-overlay { position: fixed; inset: 0; background: rgba(33,42,38,0.45); z-index: 95; display: flex; align-items: center; justify-content: center; }
.choice-panel {
  width: 74%; max-width: 560rpx; background: $cream; border-radius: 24rpx; padding: 32rpx;
  display: flex; flex-direction: column; align-items: center; gap: 20rpx; border: 4rpx solid $gold;
}
.choice-title { font-size: 32rpx; font-weight: 800; color: $ink; }
.choice-btns { display: flex; flex-wrap: wrap; gap: 16rpx; justify-content: center; }
.choice-countdown { font-size: 22rpx; color: $muted; }

// ── 结算 ──
.finish-overlay { position: fixed; inset: 0; background: rgba(33,42,38,0.6); z-index: 98; display: flex; align-items: center; justify-content: center; }
.finish-panel { width: 86%; max-width: 660rpx; background: $cream; border-radius: 28rpx; padding: 36rpx 28rpx; border: 4rpx solid $ink; }
.finish-title { font-size: 36rpx; font-weight: 900; color: $ink; text-align: center; margin-bottom: 24rpx; }
.finish-list { display: flex; flex-direction: column; }
.finish-row { display: flex; align-items: center; gap: 14rpx; padding: 14rpx 8rpx; border-bottom: 2rpx solid rgba(33,72,61,0.07); }
.finish-me { background: rgba(244,185,66,0.14); border-radius: 12rpx; }
.finish-place { width: 56rpx; font-size: 32rpx; }
.finish-avatar { width: 60rpx; height: 60rpx; border-radius: 50%; background: rgba(33,72,61,0.06); }
.finish-name { flex: 1; font-size: 26rpx; color: $ink; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.finish-pos { font-size: 22rpx; color: $muted; }
.finish-score { font-size: 22rpx; color: #b0631a; }
.finish-btns { display: flex; gap: 16rpx; margin-top: 28rpx; }

// ── 聊天 ──
.chat-zone { padding: 8rpx 24rpx 24rpx; }
.chat-bar { display: flex; align-items: center; gap: 12rpx; }
.chat-feed { flex: 1; background: rgba(255,255,255,0.85); border-radius: 999rpx; padding: 8rpx 20rpx; white-space: nowrap; }
.chat-feed-item { font-size: 22rpx; color: $muted; margin-right: 24rpx; }
.chat-feed-me { color: $ink; font-weight: 600; }
.chat-trigger { position: relative; font-size: 34rpx; padding: 6rpx 18rpx; background: #fff; border-radius: 999rpx; }
.chat-unread {
  position: absolute; top: -6rpx; right: -6rpx; background: $maple; color: #fff; font-size: 18rpx;
  border-radius: 999rpx; padding: 0 8rpx; line-height: 28rpx;
}
/* 座位气泡：锚定在各自玩家条头像上方（同 uno 的 seat-bubble） */
.seat-bubble {
  position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(100% + 8rpx);
  max-width: 300rpx; padding: 10rpx 20rpx; background: #fff; border: 2rpx solid rgba(33,72,61,0.15);
  border-radius: 18rpx; box-shadow: 0 4rpx 12rpx rgba(33,72,61,0.18); font-size: 24rpx; color: #21483d;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; z-index: 12;
  animation: bubble-pop 0.18s ease-out;
}
.seat-bubble--emoji { font-size: 40rpx; padding: 6rpx 18rpx; }
@keyframes bubble-pop {
  from { opacity: 0; transform: translateX(-50%) translateY(8rpx); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
.chat-panel-mask { position: fixed; inset: 0; background: rgba(33,42,38,0.5); z-index: 100; display: flex; align-items: flex-end; }
.chat-panel {
  width: 100%; max-height: 72vh; background: $cream; border-radius: 32rpx 32rpx 0 0; padding: 24rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
  display: flex; flex-direction: column; gap: 16rpx;
}
.chat-panel-tabs { display: flex; gap: 24rpx; align-items: center; }
.chat-tab { font-size: 28rpx; color: $muted; padding: 8rpx 4rpx; border-bottom: 5rpx solid transparent; }
.chat-tab.active { color: $ink; font-weight: 800; border-bottom-color: $maple; }
.chat-close { margin-left: auto; font-size: 32rpx; color: $muted; padding: 8rpx; }
.chat-log { max-height: 280rpx; background: rgba(255,255,255,0.7); border-radius: 16rpx; padding: 12rpx 20rpx; }
.chat-log-row { display: flex; gap: 12rpx; padding: 6rpx 0; align-items: center; }
.chat-log-name { font-size: 22rpx; color: $muted; white-space: nowrap; }
.chat-log-me .chat-log-name { color: $maple; font-weight: 700; }
.chat-log-text { font-size: 24rpx; color: $ink; }
.chat-log-emoji { font-size: 40rpx; }
.chat-log-sticker { display: inline-flex; }
.sticker-img { width: 96rpx; height: 96rpx; }
.chat-groups { max-height: 320rpx; overflow-y: auto; }
.chat-group { margin-bottom: 16rpx; }
.chat-group-title { font-size: 22rpx; color: $muted; margin-bottom: 8rpx; }
.chat-group-btns { display: flex; flex-wrap: wrap; gap: 12rpx; }
.chat-phrase {
  font-size: 24rpx; color: $ink; background: #fff; border-radius: 999rpx; padding: 10rpx 24rpx;
  border: 2rpx solid rgba(33,72,61,0.12);
}
.chat-phrase.disabled, .chat-emoji.disabled, .chat-sticker.disabled { opacity: 0.4; }
.chat-emoji-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12rpx; max-height: 320rpx; overflow-y: auto; }
.chat-emoji { font-size: 48rpx; text-align: center; padding: 12rpx 0; background: #fff; border-radius: 14rpx; }
.chat-sticker-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12rpx; max-height: 320rpx; overflow-y: auto; }
.chat-sticker { background: #fff; border-radius: 14rpx; padding: 8rpx; }
.chat-sticker-img { width: 100%; height: 140rpx; }
.chat-text-row { display: flex; gap: 12rpx; align-items: center; }
.chat-input { flex: 1; height: 72rpx; background: #fff; border-radius: 14rpx; padding: 0 24rpx; font-size: 26rpx; }
.chat-text-off { flex: 1; font-size: 24rpx; color: $muted; text-align: center; }
</style>

<template>
  <view class="junqi">
    <!-- 大厅：创建 / 加入 -->
    <view v-if="!state" class="junqi__lobby">
      <view class="junqi__brand">
        <view class="junqi__brand-chips">
          <view class="junqi__brand-chip junqi__brand-chip--red"><text>司</text></view>
          <text class="junqi__brand-vs">VS</text>
          <view class="junqi__brand-chip junqi__brand-chip--back"><text>枫</text></view>
        </view>
        <text class="junqi__brand-title">军棋</text>
        <text class="junqi__brand-sub">布阵猜拳 · 扛旗获胜 · 两人暗棋</text>
      </view>
      <button class="junqi__primary" :disabled="busy" @tap="onCreate">创建房间</button>
      <view class="junqi__divider"><text>或加入好友的房间</text></view>
      <view class="junqi__join">
        <input
          v-model="joinCode"
          class="junqi__join-input"
          type="number"
          maxlength="4"
          placeholder="输入 4 位房间码"
        />
        <button class="junqi__join-btn" :disabled="busy" @tap="onJoin">加入</button>
      </view>
      <text class="junqi__rules-link" hover-class="press" @tap="rulesOpen = true">❓ 玩法说明</text>
    </view>

    <!-- 房间 -->
    <view v-else class="junqi__room">
      <!-- 数据栏：返回 / 标题+房间码 / 回合数 -->
      <view class="junqi__topbar">
        <view class="junqi__back" hover-class="press" @tap="onBack">
          <text class="junqi__back-icon">‹</text>
        </view>
        <view class="junqi__title">
          <text class="junqi__title-main">军棋</text>
          <text class="junqi__title-sub">房间码 {{ state.code }} · 两人暗棋</text>
        </view>
        <view class="junqi__ply">
          <text class="junqi__ply-num">{{ roundCount }}</text>
          <text class="junqi__ply-label">回合</text>
        </view>
      </view>

      <!-- 对手栏（蓝方在上） -->
      <view class="junqi__bar">
        <view v-if="roomChat.chatBubbles['blue']" class="junqi__bubble" :class="{ 'junqi__bubble--emoji': roomChat.chatBubbles['blue'].isEmoji }">{{ roomChat.chatBubbles['blue'].text }}</view>
        <view class="junqi__avatar junqi__avatar--blue">
          <image v-if="state.blue?.avatarUrl" class="junqi__avatar-img" :src="avatarOf(state.blue.avatarUrl)" mode="aspectFill" />
          <text v-else class="junqi__avatar-hint">👤</text>
        </view>
        <view class="junqi__bar-info">
          <view class="junqi__bar-row">
            <text class="junqi__bar-name">{{ state.blue?.nickname || '等待加入' }}</text>
            <view class="junqi__pill junqi__pill--blue"><text>蓝方</text></view>
            <text v-if="state.blue" class="junqi__dot" :class="{ 'junqi__dot--off': !state.blue.online }"></text>
          </view>
          <text class="junqi__bar-status">{{ opponentStatusText }}</text>
        </view>
        <button v-if="state.status === 'waiting'" class="junqi__invite" open-type="share">邀请</button>
      </view>

      <!-- 棋盘卡（布阵期顶部带约束提示）：左右竖轨=阵亡托盘（照原型 02 号稿） -->
      <view class="junqi__board-card" :style="{ width: cardWidth + 'px' }">
        <view v-if="isLayoutPhase" class="junqi__layout-hint">
          <text>地雷限后两排 · 炸弹不入首排 · 军旗限大本营</text>
        </view>
        <view class="junqi__board-row">
          <view class="junqi__rail">
            <text class="junqi__rail-label">对方吃到</text>
            <view class="junqi__rail-chips">
              <view v-for="(rk, i) in capturedByOpponent" :key="'l' + i" class="junqi__rail-chip" :class="mySide === 'red' ? 'junqi__rail-chip--red' : 'junqi__rail-chip--blue'"><text>{{ RANK_NAMES[rk] }}</text></view>
              <text v-if="!capturedByOpponent.length" class="junqi__rail-empty">暂无</text>
            </view>
          </view>
          <canvas
            id="junqi-board"
            type="2d"
            class="junqi__board"
            :style="{ width: geo.width + 'px', height: geo.height + 'px' }"
          ></canvas>
          <view class="junqi__rail">
            <text class="junqi__rail-label">我吃到</text>
            <view class="junqi__rail-chips">
              <view v-for="(rk, i) in capturedByMe" :key="'r' + i" class="junqi__rail-chip" :class="opponentSide === 'red' ? 'junqi__rail-chip--red' : 'junqi__rail-chip--blue'"><text>{{ RANK_NAMES[rk] }}</text></view>
              <text v-if="!capturedByMe.length" class="junqi__rail-empty">暂无</text>
            </view>
          </view>
        </view>
        <view class="junqi__board-hit" @tap="onBoardTap"></view>
      </view>

      <!-- 布阵托盘（layout 阶段）：待部署棋子 + 操作 -->
      <view v-if="isLayoutPhase && isSeated" class="junqi__deploy">
        <view class="junqi__deploy-head">
          <text class="junqi__deploy-title">待部署</text>
          <text class="junqi__deploy-count">剩 {{ remainingCount }} 枚</text>
          <text v-if="traySelected" class="junqi__deploy-tip">已选中 {{ RANK_NAMES[traySelected] }} · 点格子放置</text>
        </view>
        <scroll-view class="junqi__deploy-scroll" scroll-x :show-scrollbar="false">
          <view class="junqi__deploy-chips">
            <view
              v-for="(item, i) in trayChips"
              :key="i"
              class="junqi__deploy-chip"
              :class="{
                'junqi__deploy-chip--special': item.rank === 'zha' || item.rank === 'lei',
                'junqi__deploy-chip--flag': item.rank === 'qi',
                'junqi__deploy-chip--active': traySelected === item.rank,
              }"
              hover-class="press"
              @tap="traySelected = traySelected === item.rank ? null : item.rank"
            >
              <text>{{ RANK_NAMES[item.rank] }}</text>
            </view>
          </view>
        </scroll-view>
      </view>

      <!-- 我的栏（红方在下） -->
      <view class="junqi__bar junqi__bar--me">
        <view v-if="roomChat.chatBubbles['red']" class="junqi__bubble" :class="{ 'junqi__bubble--emoji': roomChat.chatBubbles['red'].isEmoji }">{{ roomChat.chatBubbles['red'].text }}</view>
        <view v-if="isMyTurn" class="junqi__turn-bar"></view>
        <view class="junqi__avatar junqi__avatar--red">
          <image v-if="state.red?.avatarUrl" class="junqi__avatar-img" :src="avatarOf(state.red.avatarUrl)" mode="aspectFill" />
          <text v-else class="junqi__avatar-hint">👤</text>
        </view>
        <view class="junqi__bar-info">
          <view class="junqi__bar-row">
            <text class="junqi__bar-name">{{ state.red?.nickname || '等待加入' }}</text>
            <view class="junqi__pill junqi__pill--red"><text>红方</text></view>
            <text v-if="state.red" class="junqi__dot" :class="{ 'junqi__dot--off': !state.red.online }"></text>
          </view>
          <text class="junqi__bar-status" :class="{ 'junqi__bar-status--mine': isMyTurn }">{{ myStatusText }}</text>
        </view>
      </view>

      <!-- 操作区：布阵期=预设/随机/清空/开战；其余=规则/认输/离开 -->
      <view v-if="isLayoutPhase && isSeated" class="junqi__deploy-actions">
        <view class="junqi__deploy-btn" hover-class="press" @tap="applyPreset">
          <text>预设</text>
        </view>
        <view class="junqi__deploy-btn" hover-class="press" @tap="applyRandom">
          <text>随机</text>
        </view>
        <view class="junqi__deploy-btn" hover-class="press" @tap="clearGrid">
          <text>清空</text>
        </view>
        <view class="junqi__deploy-btn junqi__deploy-btn--go" :class="{ 'junqi__deploy-btn--disabled': remainingCount > 0 }" hover-class="press" @tap="onReady">
          <text>{{ remainingCount > 0 ? `开战 · 还差 ${remainingCount} 枚` : '开战' }}</text>
        </view>
      </view>
      <view v-else class="junqi__actions">
        <view class="junqi__action" hover-class="press" @tap="rulesOpen = true">
          <text class="junqi__action-icon">📖</text>
        </view>
        <view class="junqi__action" hover-class="press" @tap="onResign">
          <text class="junqi__action-icon">🚩</text>
        </view>
        <view class="junqi__action" hover-class="press" @tap="onBack">
          <text class="junqi__action-icon">🚪</text>
        </view>
      </view>
      <text class="junqi__hint">{{ hintText }}</text>

      <!-- 底部聊天条（家法同 uno:消息 feed 在上,💬 触发钮在左下） -->
      <view v-if="state.status !== 'waiting' && state.status !== 'finished'" class="junqi__chatbar">
        <view v-if="feedChats.length" class="junqi__chatbar-feed">
          <view v-for="m in feedChats" :key="m.seq" class="junqi__chatbar-item">
            <text class="junqi__chatbar-name">{{ chatNameOf(m) }}：</text>
            <text class="junqi__chatbar-text" :class="{ 'junqi__chatbar-text--emoji': m.kind === 'emoji' }">{{ chatBodyOf(m) }}</text>
          </view>
        </view>
        <view class="junqi__chatbar-trigger" hover-class="press" @tap="openChat">
          <text class="junqi__chatbar-icon">💬</text>
          <text class="junqi__chatbar-hint">快捷嘴炮…</text>
          <text v-if="roomChat.unreadChat.value" class="junqi__chatbar-unread">{{ roomChat.unreadChat.value > 9 ? '9+' : roomChat.unreadChat.value }}</text>
        </view>
      </view>
    </view>

    <!-- 猜拳定先手（出拳 → 亮拳定格） -->
    <view v-if="state && (state.status === 'rps' || rpsHold)" class="junqi__rps-mask">
      <view class="junqi__rps">
        <view v-if="state.status === 'rps' && state.rps && state.rps.phase === 'pick'" class="junqi__rps-body">
          <view class="junqi__rps-title">✊ 猜拳定先手<text v-if="state.rps.round > 1"> · 平局重出第 {{ state.rps.round }} 轮</text></view>
          <view v-if="state.rps.lastPicks" class="junqi__rps-sub">上轮：{{ rpsLabel(state.rps.lastPicks.red) }} vs {{ rpsLabel(state.rps.lastPicks.blue) }}，平局！</view>
          <view class="junqi__rps-sub">胜者先行 · {{ rpsCountdown }}s 后未出自动代出</view>
          <view class="junqi__rps-sides">
            <view class="junqi__rps-side">
              <view class="junqi__rps-chip junqi__rps-chip--red"><text>红</text></view>
              <text class="junqi__rps-name">{{ state.red?.nickname ?? '等待' }}</text>
              <text class="junqi__rps-status">{{ state.myRole === 'red' ? (state.rps.myPick === null ? '出拳中…' : '已出 ✓') : (state.rps.opponentPicked ? '已出 ✓' : '出拳中…') }}</text>
            </view>
            <text class="junqi__rps-vs">VS</text>
            <view class="junqi__rps-side">
              <view class="junqi__rps-chip junqi__rps-chip--blue"><text>蓝</text></view>
              <text class="junqi__rps-name">{{ state.blue?.nickname ?? '等待' }}</text>
              <text class="junqi__rps-status">{{ state.myRole === 'blue' ? (state.rps.myPick === null ? '出拳中…' : '已出 ✓') : (state.rps.opponentPicked ? '已出 ✓' : '出拳中…') }}</text>
            </view>
          </view>
          <view v-if="state.rps.myTurn" class="junqi__rps-btns">
            <button v-for="(label, i) in RPS_LABELS" :key="i" class="junqi__rps-btn" :disabled="busy" @tap="rps(RPS_KEYS[i])">{{ label }}</button>
          </view>
          <view v-else class="junqi__rps-wait">已出拳，等对方…</view>
        </view>
        <!-- 结果定格：开局后短暂展示（胜者先行，无选边） -->
        <view v-else-if="rpsHold && rpsHoldData" class="junqi__rps-body">
          <view class="junqi__rps-title">✅ {{ rpsHoldData.winnerName }} 猜拳获胜 · 先行</view>
          <view class="junqi__rps-sides">
            <view class="junqi__rps-side" :class="{ 'junqi__rps-side--win': rpsHoldData.winner === 'red' }">
              <view class="junqi__rps-chip junqi__rps-chip--red"><text>红</text></view>
              <text class="junqi__rps-name">{{ rpsHoldData.red }}</text>
              <text class="junqi__rps-pick">{{ rpsLabel(rpsHoldData.picks.red) }}</text>
            </view>
            <text class="junqi__rps-vs">VS</text>
            <view class="junqi__rps-side" :class="{ 'junqi__rps-side--win': rpsHoldData.winner === 'blue' }">
              <view class="junqi__rps-chip junqi__rps-chip--blue"><text>蓝</text></view>
              <text class="junqi__rps-name">{{ rpsHoldData.blue }}</text>
              <text class="junqi__rps-pick">{{ rpsLabel(rpsHoldData.picks.blue) }}</text>
            </view>
          </view>
          <view class="junqi__rps-wait">对局开始！</view>
        </view>
      </view>
    </view>

    <!-- 战斗结算弹卡（战斗/亮旗事件，2.6s 自动收起） -->
    <view v-if="battleCard" class="junqi__battle-mask" @tap="battleCard = null">
      <view class="junqi__battle-card" @tap.stop>
        <text class="junqi__battle-title">战斗结算</text>
        <text class="junqi__battle-boom">💥</text>
        <text class="junqi__battle-text">{{ battleCard.text }}</text>
        <view v-if="battleCard.reveal" class="junqi__battle-reveal">
          <text>🚩 军旗亮出 · 目标清晰了</text>
        </view>
        <view class="junqi__battle-btn" hover-class="press" @tap="battleCard = null">
          <text>继续对局</text>
        </view>
      </view>
    </view>

    <!-- 结算遮罩 -->
    <view v-if="state && state.status === 'finished'" class="junqi__scrim">
      <view class="junqi__result-card">
        <view class="junqi__result-deco">
          <view class="junqi__deco-line"></view>
          <text class="junqi__deco-leaf">🍁</text>
          <view class="junqi__deco-line"></view>
        </view>
        <text class="junqi__result-title">{{ iWon ? '胜利！' : '惜败' }}</text>
        <text class="junqi__result-sub">{{ resultSubText }}</text>
        <view class="junqi__result-stats">
          <view class="junqi__stat-row">
            <text class="junqi__stat-label">存活血子</text>
            <view class="junqi__stat-values">
              <text class="junqi__stat-num junqi__stat-num--red">{{ myAliveCount }}</text>
              <text class="junqi__stat-colon">:</text>
              <text class="junqi__stat-num junqi__stat-num--blue">{{ opponentAliveCount }}</text>
            </view>
          </view>
          <view class="junqi__stat-row">
            <text class="junqi__stat-label">阵亡名单</text>
            <view class="junqi__stat-dead">
              <view v-for="(rk, i) in capturedByOpponent" :key="'m' + i" class="junqi__dead-chip" :class="mySide === 'red' ? 'junqi__dead-chip--red' : 'junqi__dead-chip--blue'"><text>{{ RANK_NAMES[rk] }}</text></view>
              <text class="junqi__stat-colon">|</text>
              <view v-for="(rk, i) in capturedByMe" :key="'o' + i" class="junqi__dead-chip" :class="opponentSide === 'red' ? 'junqi__dead-chip--red' : 'junqi__dead-chip--blue'"><text>{{ RANK_NAMES[rk] }}</text></view>
            </view>
          </view>
        </view>
        <view class="junqi__result-badge"><text>{{ iWon ? '🎉 扛旗漂亮' : '💪 再战一局扳回来' }}</text></view>
        <button v-if="isSeated" class="junqi__result-rematch" :disabled="busy" @tap="onRematch">再来一局 · 重新布阵</button>
        <button class="junqi__result-leave" @tap="onLeaveAndBack">返回房间</button>
      </view>
    </view>

    <!-- 规则抽屉 -->
    <view v-if="rulesOpen" class="junqi__rules-scrim" @tap="rulesOpen = false">
      <view class="junqi__drawer" @tap.stop>
        <view class="junqi__drawer-head">
          <text class="junqi__drawer-title">军棋 · 玩法</text>
          <view class="junqi__drawer-close" hover-class="press" @tap="rulesOpen = false">
            <text>✕</text>
          </view>
        </view>
        <scroll-view class="junqi__drawer-scroll" scroll-y :show-scrollbar="false">
          <view class="junqi__rule">
            <view class="junqi__rule-label"><text>目标</text></view>
            <text class="junqi__rule-text">布阵后猜拳定先手。夺取对方军旗（扛旗）即获胜；对方无棋可走同样判负。</text>
          </view>
          <view class="junqi__rule">
            <view class="junqi__rule-label"><text>等级</text></view>
            <text class="junqi__rule-text">大子吃小子，同级相碰同归于尽。每方 25 枚。</text>
            <view class="junqi__rank-chain">
              <template v-for="(a, i) in RANK_ORDER" :key="a">
                <text v-if="i" class="junqi__rank-gt">&gt;</text>
                <view class="junqi__rank-chip"><text>{{ RANK_NAMES[a] }}</text></view>
              </template>
            </view>
          </view>
          <view class="junqi__rule">
            <view class="junqi__rule-label"><text>特殊棋子</text></view>
            <view class="junqi__sp-row"><text class="junqi__sp-chip">炸弹</text><text class="junqi__sp-text">与任何棋子相碰同归于尽</text></view>
            <view class="junqi__sp-row"><text class="junqi__sp-chip junqi__sp-chip--dark">地雷</text><text class="junqi__sp-text">不能动 · 限后两排 · 只能被工兵挖掉（非工兵撞雷同归于尽）</text></view>
            <view class="junqi__sp-row"><text class="junqi__sp-chip">工兵</text><text class="junqi__sp-text">唯一能挖雷 · 铁路上可任意拐弯</text></view>
            <view class="junqi__sp-row"><text class="junqi__sp-chip junqi__sp-chip--gold">军旗</text><text class="junqi__sp-text">被扛走即输 · 限大本营 · 司令阵亡时亮出</text></view>
          </view>
          <view class="junqi__rule">
            <view class="junqi__rule-label"><text>走子</text></view>
            <view class="junqi__sp-row"><text class="junqi__sp-chip junqi__sp-chip--dark">公路</text><text class="junqi__sp-text">素底格一次走一格（山界中路也一步跨过）</text></view>
            <view class="junqi__sp-row"><text class="junqi__sp-chip junqi__sp-chip--sand">铁路</text><text class="junqi__sp-text">沿铁路直线滑行任意远，中间不能有子</text></view>
            <view class="junqi__mv-demo">
              <view class="junqi__mv-cell junqi__mv-cell--piece junqi__mv-cell--red"><text>排</text></view>
              <view class="junqi__mv-cell junqi__mv-cell--rail"></view>
              <view class="junqi__mv-cell junqi__mv-cell--rail"></view>
              <view class="junqi__mv-cell junqi__mv-cell--piece junqi__mv-cell--blue"><text>连</text></view>
              <text class="junqi__mv-note">红排长沿铁路滑行吃掉蓝连长</text>
            </view>
            <view class="junqi__sp-row"><text class="junqi__sp-chip">工兵</text><text class="junqi__sp-text">铁路上可任意拐弯走「L」形，是唯一能拐弯的子</text></view>
            <view class="junqi__sp-row"><text class="junqi__sp-chip junqi__sp-chip--green">行营</text><text class="junqi__sp-text">进出行营可斜走一格</text></view>
            <view class="junqi__sp-row"><text class="junqi__sp-chip junqi__sp-chip--dark">锁足</text><text class="junqi__sp-text">地雷、军旗、已进大本营的棋子不能移动</text></view>
            <view class="junqi__sp-row"><text class="junqi__sp-chip">开战</text><text class="junqi__sp-text">走到敌子格即战斗：大吃小、同级同归（炸弹/地雷见上）</text></view>
          </view>
          <view class="junqi__rule">
            <view class="junqi__rule-label"><text>地形</text></view>
            <view class="junqi__sp-row"><text class="junqi__sp-geo junqi__sp-geo--rail"></text><text class="junqi__sp-text">铁路：沿线直线滑行任意远（工兵可拐弯），跨山界左右两条</text></view>
            <view class="junqi__sp-row"><text class="junqi__sp-geo junqi__sp-geo--road"></text><text class="junqi__sp-text">公路：一步一格；山界中间一条通路</text></view>
            <view class="junqi__sp-row"><text class="junqi__sp-geo junqi__sp-geo--camp"></text><text class="junqi__sp-text">行营：进入免战，不可被攻击；布阵不可放子</text></view>
            <view class="junqi__sp-row"><text class="junqi__sp-geo junqi__sp-geo--hq"></text><text class="junqi__sp-text">大本营：军旗所在，棋子进入后不能再动</text></view>
          </view>
          <view class="junqi__rule">
            <view class="junqi__rule-label"><text>本局村规</text></view>
            <view class="junqi__sp-row"><view class="junqi__cg-badge"><text>村规</text></view><text class="junqi__sp-text">非工兵撞雷 · 同归于尽</text></view>
            <view class="junqi__sp-row"><view class="junqi__cg-badge"><text>村规</text></view><text class="junqi__sp-text">司令阵亡 · 军旗对双方亮出</text></view>
            <view class="junqi__sp-row"><view class="junqi__cg-badge"><text>村规</text></view><text class="junqi__sp-text">布阵 5 分钟 · 每步 45 秒 · 超时系统代走</text></view>
          </view>
          <text class="junqi__rule-tail">祝对弈开心 🍁</text>
        </scroll-view>
      </view>
    </view>

    <!-- 房间聊天面板 -->
    <GameChatPanel :ctrl="roomChat" :text-enabled="unoChatTextEnabled" />
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, ref, watch } from 'vue'
import { onHide, onLoad, onShareAppMessage, onShow, onUnload } from '@dcloudio/uni-app'
import { useJunqiRoom } from '@/pages-games/composables/useJunqiRoom'
import { leaveRoom } from '@/pages-games/services/junqi'
import { resolveAvatarUrl } from '@/services/toolbox'
import { getCanvasNode, getElementRect, getWindowInfo } from '@/utils/canvasAdapter'
import {
  PIECE_COUNTS,
  PRESETS,
  RANK_NAMES,
  RANK_ORDER,
  RANKS,
  boardGeometry,
  cellRect,
  isCamp,
  isHqOf,
  isRail,
  pieceAt,
  pointToCell,
  randomLayout,
  reachableTargets,
  validateLayout,
  type JunqiGeometry,
} from '@/pages-games/utils/junqi'
import type { CanvasNode, ElementRect } from '@/utils/canvasAdapter'
import type { JunqiLastMove, JunqiLayoutPiece, JunqiRank, JunqiRoomState, JunqiSide } from '@/types/junqi'
import GameChatPanel from '@/pages-games/components/GameChatPanel.vue'
import { useRoomChat, type RoomChatMessage } from '@/pages-games/composables/useRoomChat'
import { useFeatures } from '@/composables/useFeatures'
import { gamePhraseText } from '@/pages-games/utils/gameChat'
import { playJunqiSound } from '@/pages-games/utils/junqiSound'

// ---------- 原型色板（prototypes/枫叶小屋原型.pen 军棋六帧，jun-*/dou-* 变量实值） ----------
const COLOR_LAND = '#F7EEDF'
const COLOR_GRID = '#E8D9C4'
const COLOR_RAIL_FILL = '#F1DDB5'
const COLOR_RAIL = '#C9A876'
const COLOR_RAIL_LINE = '#B98A50'
const COLOR_RAIL_TIE = '#D9BC8E'
const COLOR_LINE = '#DCCDB6'
const COLOR_BAND = '#E4D5BC'
const COLOR_BAND_HILL = '#D5C09B'
const COLOR_CAMP = '#DFEED6'
const COLOR_CAMP_RING = '#6F9E58'
const COLOR_CAMP_TEXT = '#3F6D33'
const COLOR_HQ = '#F7DFD3'
const COLOR_HQ_LINE = '#E3B4A6'
const COLOR_HQ_RING = '#D98C74'
const COLOR_HQ_TEXT = '#B84A38'
const COLOR_RED = '#E85D4A'
const COLOR_RED_DEEP = '#B8402E'
const COLOR_BLUE = '#5B8FB9'
const COLOR_BLUE_DEEP = '#2C4F73'
const COLOR_BACK_INNER = '#FFFFFF52'
const COLOR_BACK_LEAF = '#F4B942'
const COLOR_GOLD = '#F4B942'
const COLOR_GOLD_DOT = '#F4B942E6'
const COLOR_GOLD_TINT = '#F4B9421A'
const COLOR_ATTACK = '#E85D4A'
const COLOR_SPECIAL = '#7A6A58'
const COLOR_SPECIAL_DEEP = '#5F5346'
const COLOR_FLAG_TEXT = '#5C3A08'
const COLOR_BADGE = '#FFF8F0'

const rulesOpen = ref(false)

// ---------- 房间聊天（通用 useRoomChat + 共享面板；气泡按红/蓝座位键锚定） ----------
const { unoChatTextEnabled, refreshFeatures } = useFeatures()
const roomChat = useRoomChat({
  chat: () => (state.value?.chat ?? []) as RoomChatMessage[],
  code: () => state.value?.code ?? '',
  send: (kind, payload) => sendChat(kind, payload),
  nameOf: (m) => chatNameOf(m),
})

const {
  state,
  isSeated,
  myColor,
  isMyTurn,
  createAndEnter,
  joinByCode,
  rps,
  sendChat,
  readyLayout,
  submitMove,
  requestRematch,
  exitRoom,
  startSync,
  stopSync,
} = useJunqiRoom()

const instance = getCurrentInstance()
const joinCode = ref('')
const busy = ref(false)

const avatarOf = (url: string) => resolveAvatarUrl(url)

// ---------- 底部聊天条（关掉面板后消息常驻可见） ----------
const feedChats = computed(() => roomChat.recentChats.value)
const chatNameOf = (m: RoomChatMessage): string =>
  m.role === 'red' ? (state.value?.red?.nickname ?? '红方') : (state.value?.blue?.nickname ?? '蓝方')
const chatBodyOf = (m: RoomChatMessage): string =>
  m.kind === 'sticker' ? '[贴纸]' : m.kind === 'phrase' ? (gamePhraseText(m.text) ?? m.text) : m.text

// ---------- 派生数据 ----------
const roundCount = computed(() => Math.ceil((state.value?.ply ?? 0) / 2))
const mySide = computed<JunqiSide>(() => myColor.value ?? 'red')
const opponentSide = computed<JunqiSide>(() => (mySide.value === 'red' ? 'blue' : 'red'))
const isLayoutPhase = computed(() => state.value?.status === 'layout')
/** 我吃到 = 对方阵亡（trays 公示）；对方吃到 = 我方阵亡。 */
const capturedByMe = computed<JunqiRank[]>(() => state.value?.trays[opponentSide.value] ?? [])
const capturedByOpponent = computed<JunqiRank[]>(() => state.value?.trays[mySide.value] ?? [])
const myAliveCount = computed(() => (state.value ? state.value.pieces.filter(p => p.side === mySide.value && p.alive).length : 0))
const opponentAliveCount = computed(() => (state.value ? state.value.pieces.filter(p => p.side === opponentSide.value && p.alive).length : 0))
const iWon = computed(() => state.value?.winner != null && state.value.winner === myColor.value)

const opponentStatusText = computed(() => {
  const current = state.value
  if (!current) return ''
  if (current.status === 'waiting') return '等待好友加入…'
  if (current.status === 'layout') return (current.ready?.[opponentSide.value] ?? false) ? '对方已布好阵' : '对方布阵中…'
  if (current.status === 'rps') return '猜拳定先手中…'
  if (current.status === 'finished') {
    if (current.winReason === 'forfeit') return current.winner === myColor.value ? '对方中途离开' : '你认输了'
    return current.winReason === 'flag' ? '军旗被扛走了…' : current.winReason === 'stuck' ? '无棋可走…' : '全军覆没…'
  }
  return current.turn === opponentSide.value ? '对方思考中…' : '等待你走棋'
})

const myStatusText = computed(() => {
  const current = state.value
  if (!current) return ''
  if (current.status === 'waiting') return isSeated.value ? '等好友进来就开局' : ''
  if (current.status === 'layout') return isLayoutReady.value ? '已就绪 · 等对方布阵' : '布阵中 · 点击棋子部署'
  if (current.status === 'rps') return '猜拳定先手'
  if (current.status === 'finished') return iWon.value ? '你赢了 🎉' : '下次一定'
  if (!isSeated.value) return '观战中'
  return isMyTurn.value ? `轮到你了 · 剩 ${countdown.value} 秒` : '等待对方走棋…'
})

const hintText = computed(() => {
  const current = state.value
  if (!current) return ''
  if (current.lastEvent && current.lastEvent.seq > 0) return `战报：${current.lastEvent.text}`
  if (current.status === 'waiting') return '等待好友加入 · 分享房间码即可开局'
  if (current.status === 'layout') return '布阵完成后点击开战 · 双方互不可见'
  if (current.status === 'rps') return '猜拳定先手 · 胜者先行'
  if (current.status === 'finished') return '对局结束'
  if (current.status === 'playing' && isMyTurn.value) return '点击棋子查看可行位置 · 金点为落点 · 红圈为进攻'
  return '等待对方走棋…'
})

const resultSubText = computed(() => {
  const current = state.value
  if (!current) return ''
  const reason = current.winReason
  const reasonText
    = reason === 'flag' ? (iWon.value ? '扛走对方军旗' : '军旗被扛走')
      : reason === 'eliminated' ? (iWon.value ? '全歼对方棋子' : '全军覆没')
        : reason === 'stuck' ? (iWon.value ? '对方无棋可走' : '无棋可走')
          : iWon.value ? '对方中途离开' : '中途离场判负'
  return `${reasonText} · 共 ${roundCount.value} 回合`
})

// ---------- 坐标换算：蓝方座位本地 180° 旋转（screen↔absolute：r'=11-r，c'=4-c） ----------
function screenToAbs(r: number, c: number): { r: number, c: number } {
  if (myColor.value === 'blue') return { r: 11 - r, c: 4 - c }
  return { r, c }
}
function absToScreen(r: number, c: number): { r: number, c: number } {
  if (myColor.value === 'blue') return { r: 11 - r, c: 4 - c }
  return { r, c }
}

// ---------- 布阵编辑器（screen 坐标 rows 6..11 = 己方半场） ----------
const isLayoutReady = computed(() => (state.value?.ready?.[mySide.value] ?? false) === true)

/** 已放置棋子：screenKey → rank。 */
const grid = ref<Map<string, JunqiRank>>(new Map())
const traySelected = ref<JunqiRank | null>(null)
const gridVersion = ref(0)

const remainingCount = computed(() => {
  void gridVersion.value
  const placed: Partial<Record<JunqiRank, number>> = {}
  for (const rank of grid.value.values()) placed[rank] = (placed[rank] ?? 0) + 1
  let remaining = 0
  for (const [rank, count] of Object.entries(PIECE_COUNTS)) {
    remaining += Math.max(0, count - (placed[rank as JunqiRank] ?? 0))
  }
  return remaining
})

const trayChips = computed(() => {
  void gridVersion.value
  const placed: Partial<Record<JunqiRank, number>> = {}
  for (const rank of grid.value.values()) placed[rank] = (placed[rank] ?? 0) + 1
  const chips: { rank: JunqiRank }[] = []
  for (const [rank, count] of Object.entries(PIECE_COUNTS)) {
    const left = count - (placed[rank as JunqiRank] ?? 0)
    for (let i = 0; i < left; i++) chips.push({ rank: rank as JunqiRank })
  }
  // 军旗排最后（只能放大本营，单独挑出来更顺）
  return chips.sort((a, b) => (a.rank === 'qi' ? 1 : 0) - (b.rank === 'qi' ? 1 : 0))
})

/** 军旗未放置时高亮两个大本营（screen 恒为 (11,1)/(11,3)）。 */
const flagPlaced = computed(() => {
  void gridVersion.value
  for (const rank of grid.value.values()) {
    if (rank === 'qi') return true
  }
  return false
})

function gridToAbsLayout(): JunqiLayoutPiece[] {
  const out: JunqiLayoutPiece[] = []
  for (const [key, rank] of grid.value.entries()) {
    const [r, c] = key.split(':').map(Number)
    const abs = screenToAbs(r, c)
    out.push({ rank, r: abs.r, c: abs.c })
  }
  return out
}

function applyPreset() {
  const preset = PRESETS[0]
  fillFromAbsLayout(preset.layout)
  traySelected.value = null
  uni.showToast({ title: `已套用「${preset.name}」阵型`, icon: 'none' })
}

function applyRandom() {
  fillFromAbsLayout(randomLayout(mySide.value))
  traySelected.value = null
}

function clearGrid() {
  grid.value = new Map()
  gridVersion.value++
  traySelected.value = null
}

/** 把绝对坐标阵型灌进 screen 网格（预设/随机共用）。 */
function fillFromAbsLayout(layout: JunqiLayoutPiece[]) {
  const next = new Map<string, JunqiRank>()
  for (const p of layout) {
    const s = absToScreen(p.r, p.c)
    next.set(`${s.r}:${s.c}`, p.rank)
  }
  grid.value = next
  gridVersion.value++
}

async function onReady() {
  if (remainingCount.value > 0) {
    uni.showToast({ title: `还差 ${remainingCount.value} 枚棋子`, icon: 'none' })
    return
  }
  const layout = gridToAbsLayout()
  const error = validateLayout(mySide.value, layout)
  if (error) {
    uni.showToast({ title: '阵型不合法，重新摆一摆', icon: 'none' })
    return
  }
  await guard(async () => {
    await readyLayout(layout)
    uni.showToast({ title: '已就绪，等对方布阵', icon: 'none' })
  })
}

// ---------- 选中与落点提示（对局期） ----------
const selected = ref<{ r: number, c: number } | null>(null)
const hints = ref<Array<{ r: number, c: number }>>([])

function clearSelection() {
  selected.value = null
  hints.value = []
}

// ---------- 落子动画 + 首尾标记（lastMove 驱动：起点虚线框 / 终点金框 / 250ms 滑动） ----------
// 背面棋子一模一样，换位肉眼难辨——动画 + 首尾标记是对方看清走子的唯一线索
const ANIM_MS = 250
const anim = ref<{ rank: JunqiRank | null; side: JunqiSide; fr: number; fc: number; tr: number; tc: number; startMs: number } | null>(null)
let animTimer: ReturnType<typeof setInterval> | null = null

function startMoveAnim(next: JunqiRoomState, lm: JunqiLastMove | null): void {
  const moved = lm ? next.pieces.find((p) => p.alive && p.r === lm.tr && p.c === lm.tc) : null
  if (!lm || !moved) {
    drawBoard()
    return
  }
  anim.value = { rank: moved.rank ?? null, side: moved.side, fr: lm.fr, fc: lm.fc, tr: lm.tr, tc: lm.tc, startMs: Date.now() }
  if (animTimer) clearInterval(animTimer)
  animTimer = setInterval(() => {
    if (!anim.value) {
      if (animTimer) clearInterval(animTimer)
      animTimer = null
      return
    }
    const p = Math.min(1, (Date.now() - anim.value.startMs) / ANIM_MS)
    drawBoard()
    if (p >= 1) {
      if (animTimer) clearInterval(animTimer)
      animTimer = null
      anim.value = null
      drawBoard()
    }
  }, 16)
}

// ---------- 棋盘渲染 ----------
const windowWidth = getWindowInfo().windowWidth
const windowHeight = getWindowInfo().windowHeight
/** 卡宽 343（375 屏）；左右窄轨（阵亡托盘，32px）填掉两侧余量，格尺寸尽量吃满高度（必要时轻微滚动）。 */
const cardWidth = Math.min(windowWidth - 16, 343)
const RAIL_WIDTH = 32
const BOARD_GAP = 6
const canvasWidth = cardWidth - 24 - RAIL_WIDTH * 2 - BOARD_GAP * 2
const widthCell = canvasWidth / 5
const cell = Math.max(Math.floor(Math.min(widthCell, (windowHeight - 240) / 12.4, 52)), 36)
const geo: JunqiGeometry = boardGeometry(cell)
let boardNode: CanvasNode | null = null
let boardRect: ElementRect | null = null

async function initBoard() {
  await nextTick()
  try {
    boardNode = await getCanvasNode('#junqi-board', instance)
    boardNode.canvas.width = geo.width * boardNode.dpr
    boardNode.canvas.height = geo.height * boardNode.dpr
    boardNode.ctx.scale(boardNode.dpr, boardNode.dpr)
    boardRect = await getElementRect('#junqi-board', instance)
    drawBoard()
  } catch (error) {
    console.warn('[junqi] init board failed:', error)
  }
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawBoard() {
  if (!boardNode) return
  const { ctx } = boardNode
  const s = cell / 36

  ctx.clearRect(0, 0, geo.width, geo.height)
  ctx.fillStyle = COLOR_LAND
  ctx.fillRect(0, 0, geo.width, geo.height)

  // 连接线（先画线再铺格子，线只在格间隙里露出）——横线/竖线按铁路网
  for (let r = 0; r < 12; r++) {
    for (let c = 0; c < 4; c++) {
      const rail = isRail(r, c) && isRail(r, c + 1) && (r === 1 || r === 5 || r === 6 || r === 10)
      const rect = cellRect(r, c, geo)
      ctx.fillStyle = rail ? COLOR_RAIL : COLOR_LINE
      ctx.fillRect(rect.x + rect.size, rect.y + rect.size / 2 - (rail ? 1 : 0.6) * s, 3 * s, (rail ? 2 : 1.2) * s)
    }
  }
  for (let r = 0; r < 11; r++) {
    for (let c = 0; c < 5; c++) {
      if (r === 5) continue // 山界带单独画
      const rail = isRail(r, c) && isRail(r + 1, c) && (c === 0 || c === 4)
      const rect = cellRect(r, c, geo)
      ctx.fillStyle = rail ? COLOR_RAIL : COLOR_LINE
      ctx.fillRect(rect.x + rect.size / 2 - (rail ? 1 : 0.6) * s, rect.y + rect.size, (rail ? 2 : 1.2) * s, 3 * s)
    }
  }

  // 山界带 + 山峰剪影 + 三条通路
  const bandY = 6 * cell
  ctx.fillStyle = COLOR_BAND
  roundRectPath(ctx, 1.5 * s, bandY + 1 * s, geo.width - 3 * s, geo.band - 2 * s, 3 * s)
  ctx.fill()
  ctx.fillStyle = COLOR_BAND_HILL
  ctx.beginPath()
  ctx.moveTo(6 * s, bandY + geo.band - 1 * s)
  for (let px = 6 * s; px < geo.width - 8 * s; px += 14 * s) {
    ctx.lineTo(px + 7 * s, bandY + geo.band - 1 * s - geo.band * 0.42)
    ctx.lineTo(px + 14 * s, bandY + geo.band - 1 * s)
  }
  ctx.closePath()
  ctx.fill()
  for (const c of [0, 4]) {
    const cx = c * cell + cell / 2
    ctx.fillStyle = COLOR_RAIL
    ctx.fillRect(cx - 2.25 * s, bandY, 1.5 * s, geo.band)
    ctx.fillRect(cx + 0.75 * s, bandY, 1.5 * s, geo.band)
  }
  ctx.fillStyle = COLOR_LINE
  ctx.fillRect(2 * cell + cell / 2 - 0.75 * s, bandY, 1.5 * s, geo.band)

  // 地形格：公路素底 / 铁路双轨+枕木 / 行营绿环 / 大本营旗座
  for (let r = 0; r < 12; r++) {
    for (let c = 0; c < 5; c++) {
      const rect = cellRect(r, c, geo)
      const railH = r === 1 || r === 5 || r === 6 || r === 10
      const railV = (c === 0 || c === 4) && r >= 1 && r <= 10
      const cx = rect.x + rect.size / 2
      const cy = rect.y + rect.size / 2

      if (isCamp(r, c)) {
        // 行营：双层绿环徽章（免战安全区）
        ctx.beginPath()
        ctx.arc(cx, cy, rect.size / 2 - 1.5 * s, 0, Math.PI * 2)
        ctx.fillStyle = COLOR_CAMP
        ctx.fill()
        ctx.strokeStyle = COLOR_CAMP_RING
        ctx.lineWidth = 2 * s
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(cx, cy, rect.size / 2 - 6.5 * s, 0, Math.PI * 2)
        ctx.strokeStyle = '#FFFFFFB0'
        ctx.lineWidth = 1.2 * s
        ctx.stroke()
        ctx.fillStyle = COLOR_CAMP_TEXT
        ctx.font = `700 ${12 * s}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('营', cx, cy + 0.5 * s)
        continue
      }

      if (isHqOf('red', r, c) || isHqOf('blue', r, c)) {
        // 大本营：红座双层描边 + 小旗 + 座标
        roundRectPath(ctx, rect.x, rect.y, rect.size, rect.size, 3 * s)
        ctx.fillStyle = COLOR_HQ
        ctx.fill()
        ctx.strokeStyle = COLOR_HQ_RING
        ctx.lineWidth = 1.8 * s
        ctx.stroke()
        roundRectPath(ctx, rect.x + 4 * s, rect.y + 4 * s, rect.size - 8 * s, rect.size - 8 * s, 2.5 * s)
        ctx.strokeStyle = COLOR_HQ_LINE
        ctx.lineWidth = 1 * s
        ctx.stroke()
        ctx.strokeStyle = COLOR_HQ_TEXT
        ctx.lineWidth = 1.2 * s
        ctx.beginPath()
        ctx.moveTo(cx - 4 * s, rect.y + 5 * s)
        ctx.lineTo(cx - 4 * s, rect.y + 13 * s)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(cx - 4 * s, rect.y + 5 * s)
        ctx.lineTo(cx + 5 * s, rect.y + 7.5 * s)
        ctx.lineTo(cx - 4 * s, rect.y + 10 * s)
        ctx.closePath()
        ctx.fillStyle = COLOR_HQ_TEXT
        ctx.fill()
        ctx.font = `700 ${8.5 * s}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('大本营', cx, rect.y + rect.size / 2 + 4.5 * s)
        continue
      }

      if (railH || railV) {
        // 铁路：暖沙底 + 双轨线 + 枕木刻度（交叉口双向枕木成十字）
        roundRectPath(ctx, rect.x, rect.y, rect.size, rect.size, 2 * s)
        ctx.fillStyle = COLOR_RAIL_FILL
        ctx.fill()
        ctx.strokeStyle = COLOR_RAIL
        ctx.lineWidth = 1.5 * s
        ctx.stroke()
        const half = 3.5 * s
        if (railH) {
          ctx.strokeStyle = COLOR_RAIL_LINE
          ctx.lineWidth = 1.1 * s
          ctx.beginPath()
          ctx.moveTo(rect.x + 2 * s, cy - half)
          ctx.lineTo(rect.x + rect.size - 2 * s, cy - half)
          ctx.moveTo(rect.x + 2 * s, cy + half)
          ctx.lineTo(rect.x + rect.size - 2 * s, cy + half)
          ctx.stroke()
          ctx.strokeStyle = COLOR_RAIL_TIE
          ctx.lineWidth = 1 * s
          ctx.beginPath()
          for (let tx = rect.x + 5 * s; tx <= rect.x + rect.size - 4 * s; tx += 6.5 * s) {
            ctx.moveTo(tx, cy - half - 1.5 * s)
            ctx.lineTo(tx, cy + half + 1.5 * s)
          }
          ctx.stroke()
        }
        if (railV) {
          ctx.strokeStyle = COLOR_RAIL_LINE
          ctx.lineWidth = 1.1 * s
          ctx.beginPath()
          ctx.moveTo(cx - half, rect.y + 2 * s)
          ctx.lineTo(cx - half, rect.y + rect.size - 2 * s)
          ctx.moveTo(cx + half, rect.y + 2 * s)
          ctx.lineTo(cx + half, rect.y + rect.size - 2 * s)
          ctx.stroke()
          ctx.strokeStyle = COLOR_RAIL_TIE
          ctx.lineWidth = 1 * s
          ctx.beginPath()
          for (let ty = rect.y + 5 * s; ty <= rect.y + rect.size - 4 * s; ty += 6.5 * s) {
            ctx.moveTo(cx - half - 1.5 * s, ty)
            ctx.lineTo(cx + half + 1.5 * s, ty)
          }
          ctx.stroke()
        }
        continue
      }

      // 公路：素底细线
      roundRectPath(ctx, rect.x, rect.y, rect.size, rect.size, 2 * s)
      ctx.fillStyle = COLOR_LAND
      ctx.fill()
      ctx.strokeStyle = COLOR_GRID
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  // 布阵期：军旗未放置时高亮己方大本营（screen 恒 (11,1)/(11,3)）
  if (isLayoutPhase.value && isSeated.value && !flagPlaced.value) {
    for (const [hr, hc] of [[11, 1], [11, 3]]) {
      const rect = cellRect(hr, hc, geo)
      ctx.strokeStyle = COLOR_GOLD
      ctx.lineWidth = 2 * s
      ctx.fillStyle = COLOR_GOLD_TINT
      roundRectPath(ctx, rect.x - 1.5 * s, rect.y - 1.5 * s, rect.size + 3 * s, rect.size + 3 * s, 5 * s)
      ctx.fill()
      ctx.stroke()
    }
  }

  const current = state.value

  // 棋子：对局期渲染服务端 pieces（abs→screen）；布阵期渲染我的网格
  if (isLayoutPhase.value && isSeated.value) {
    for (const [key, rank] of grid.value.entries()) {
      const [r, c] = key.split(':').map(Number)
      drawPiece(ctx, r, c, rank, 'face')
    }
  } else if (current) {
    for (const piece of current.pieces) {
      if (!piece.alive) continue
      // 落子动画期间跳过终点上的移动子，改为插值位置绘制
      if (anim.value && piece.r === anim.value.tr && piece.c === anim.value.tc && piece.side === anim.value.side) continue
      const sPos = absToScreen(piece.r, piece.c)
      const own = piece.side === mySide.value
      if (own || piece.rank) {
        drawPiece(ctx, sPos.r, sPos.c, piece.rank ?? 'pai', 'face', piece.side, own)
      } else {
        drawPiece(ctx, sPos.r, sPos.c, null, 'back')
      }
    }
  }

  // 选中金圈 + 落点金点 / 进攻红圈（screen 坐标）
  if (selected.value) {
    const rect = cellRect(selected.value.r, selected.value.c, geo)
    ctx.strokeStyle = COLOR_GOLD
    ctx.lineWidth = 2.5 * s
    roundRectPath(ctx, rect.x - 1.5 * s, rect.y - 1.5 * s, rect.size + 3 * s, rect.size + 3 * s, 5 * s)
    ctx.stroke()
  }
  for (const hint of hints.value) {
    const rect = cellRect(hint.r, hint.c, geo)
    const cx = rect.x + rect.size / 2
    const cy = rect.y + rect.size / 2
    if (pieceAt(current?.pieces ?? [], hint.r, hint.c)) {
      ctx.strokeStyle = COLOR_ATTACK
      ctx.lineWidth = 2.5 * s
      ctx.beginPath()
      ctx.arc(cx, cy, rect.size / 2 + 1 * s, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      ctx.fillStyle = COLOR_GOLD_DOT
      ctx.beginPath()
      ctx.arc(cx, cy, 6 * s, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 落子首尾标记 + 滑动插值（lastMove 驱动；起点虚线框 / 终点金框，背面换位的关键线索）
  const lm = current?.lastMove
  if (lm) {
    const startPos = absToScreen(lm.fr, lm.fc)
    const startRect = cellRect(startPos.r, startPos.c, geo)
    ctx.strokeStyle = COLOR_GOLD
    ctx.globalAlpha = anim.value ? 0.85 : 0.45
    ctx.lineWidth = 2 * s
    ctx.setLineDash([4 * s, 3 * s])
    roundRectPath(ctx, startRect.x - 1.5 * s, startRect.y - 1.5 * s, startRect.size + 3 * s, startRect.size + 3 * s, 5 * s)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }
  if (anim.value) {
    const a = anim.value
    const p = Math.min(1, (Date.now() - a.startMs) / ANIM_MS)
    const eased = 1 - (1 - p) * (1 - p)
    const fromPos = absToScreen(a.fr, a.fc)
    const toPos = absToScreen(a.tr, a.tc)
    const from = cellRect(fromPos.r, fromPos.c, geo)
    const to = cellRect(toPos.r, toPos.c, geo)
    drawPieceAt(
      ctx,
      from.x + (to.x - from.x) * eased + 1 * s,
      from.y + (to.y - from.y) * eased + 1 * s,
      to.size - 2 * s,
      a.rank,
      a.rank ? 'face' : 'back',
      a.side,
    )
  } else if (lm) {
    const endPos = absToScreen(lm.tr, lm.tc)
    const endRect = cellRect(endPos.r, endPos.c, geo)
    ctx.strokeStyle = COLOR_GOLD
    ctx.lineWidth = 2.5 * s
    roundRectPath(ctx, endRect.x - 1.5 * s, endRect.y - 1.5 * s, endRect.size + 3 * s, endRect.size + 3 * s, 5 * s)
    ctx.stroke()
  }
}

/** 画一枚棋子；rank=null 画背面。 */
function drawPiece(
  ctx: CanvasRenderingContext2D,
  r: number,
  c: number,
  rank: JunqiRank | null,
  mode: 'face' | 'back',
  side: JunqiSide = mySide.value,
  own = true,
) {
  const rect = cellRect(r, c, geo)
  const s = cell / 36
  drawPieceAt(ctx, rect.x + 1 * s, rect.y + 1 * s, rect.size - 2 * s, rank, mode, side)
  void own
}

/** 以左上角像素坐标绘制棋子（落子动画的插值位置也走这里）；rank=null 画背面。 */
function drawPieceAt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rank: JunqiRank | null,
  mode: 'face' | 'back',
  side: JunqiSide,
) {
  const s = cell / 36
  const red = side === 'red'
  const special = rank === 'zha' || rank === 'lei'
  const flag = rank === 'qi'

  const fill = mode === 'back' ? COLOR_BLUE : flag ? COLOR_GOLD : special ? COLOR_SPECIAL : (red ? COLOR_RED : COLOR_BLUE)
  const stroke = mode === 'back' ? COLOR_BLUE_DEEP : flag ? '#C08A1E' : special ? COLOR_SPECIAL_DEEP : (red ? COLOR_RED_DEEP : COLOR_BLUE_DEEP)

  roundRectPath(ctx, x, y, size, size, 6 * s)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = 1.5 * s
  ctx.strokeStyle = stroke
  ctx.stroke()

  if (mode === 'back') {
    // 背面：内描边 + 金色枫字
    ctx.strokeStyle = COLOR_BACK_INNER
    ctx.lineWidth = 1 * s
    roundRectPath(ctx, x + 3 * s, y + 3 * s, size - 6 * s, size - 6 * s, 4 * s)
    ctx.stroke()
    ctx.fillStyle = COLOR_BACK_LEAF
    ctx.font = `700 ${11 * s}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('枫', x + size / 2, y + size / 2)
    return
  }

  ctx.fillStyle = flag ? COLOR_FLAG_TEXT : '#FFFFFF'
  ctx.font = `700 ${13 * s}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(rank ? RANK_NAMES[rank] : '', x + size / 2, y + size / 2)

  // 右下角阶数徽章（特殊子不带）
  if (rank && RANKS[rank] !== undefined) {
    const bx = x + size - 5 * s
    const by = y + size - 5 * s
    ctx.beginPath()
    ctx.arc(bx, by, 6.5 * s, 0, Math.PI * 2)
    ctx.fillStyle = COLOR_BADGE
    ctx.fill()
    ctx.fillStyle = red ? COLOR_RED : COLOR_BLUE
    ctx.font = `700 ${8.5 * s}px sans-serif`
    ctx.fillText(String(RANKS[rank]), bx, by + 0.5 * s)
  }
}

async function onBoardTap(event: unknown) {
  const current = state.value
  if (anim.value) return // 落子动画播放中不接受输入
  if (!current || !isSeated.value) return
  const detail = (event as { detail?: { x?: number, y?: number } }).detail
  if (detail?.x === undefined || detail?.y === undefined) return
  if (!boardRect) boardRect = await getElementRect('#junqi-board', instance)
  const target = pointToCell(detail.x - boardRect.left, detail.y - boardRect.top, geo)
  if (!target) {
    clearSelection()
    drawBoard()
    return
  }

  // 布阵编辑：点己方半场放置 / 拾起 / 交换
  if (current.status === 'layout') {
    if (current.ready?.[mySide.value]) {
      uni.showToast({ title: '已就绪，等对方布阵', icon: 'none' })
      return
    }
    if (target.r < 6) {
      uni.showToast({ title: '只能在自己半场布阵', icon: 'none' })
      return
    }
    const key = `${target.r}:${target.c}`
    const existing = grid.value.get(key)
    if (traySelected.value) {
      if (existing) {
        // 交换：手里的放下，原格的回到手里
        grid.value.set(key, traySelected.value)
        traySelected.value = existing
      } else {
        grid.value.set(key, traySelected.value)
        traySelected.value = null
      }
    } else if (existing) {
      grid.value.delete(key)
      traySelected.value = existing
    } else {
      return
    }
    gridVersion.value++
    playJunqiSound('select')
    drawBoard()
    return
  }

  if (current.status !== 'playing') return
  if (!isMyTurn.value) {
    uni.showToast({ title: '还没轮到你', icon: 'none' })
    return
  }
  // screen → absolute
  const abs = screenToAbs(target.r, target.c)
  const piece = pieceAt(current.pieces, abs.r, abs.c)
  if (piece && piece.side === mySide.value) {
    if (selected.value && selected.value.r === abs.r && selected.value.c === abs.c) {
      clearSelection()
    } else {
      selected.value = { r: abs.r, c: abs.c }
      hints.value = reachableTargets(current.pieces, abs.r, abs.c).map(([hr, hc]) => ({ r: hr, c: hc }))
      playJunqiSound('select')
    }
    drawBoard()
    return
  }
  if (selected.value) {
    const hit = hints.value.find(h => h.r === abs.r && h.c === abs.c)
    if (hit) {
      const from = selected.value
      clearSelection()
      drawBoard()
      await submitMove(from.r, from.c, abs.r, abs.c)
      return
    }
    clearSelection()
    drawBoard()
  }
}

// ---------- 状态变化：重画 + 播报（lastEvent 差分） + 音效 ----------
let prevPly = 0
let prevStatus = ''
let prevTurn: string | null = null
let prevEventSeq = 0
const battleCard = ref<{ text: string, reveal: boolean } | null>(null)
let battleCardTimer: ReturnType<typeof setTimeout> | null = null

const countdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null
function resetCountdown() {
  if (countdownTimer) clearInterval(countdownTimer)
  countdown.value = state.value?.ttl ?? 0
  countdownTimer = setInterval(() => {
    if (countdown.value > 0) countdown.value--
  }, 1000)
}

watch(
  state,
  (next) => {
    clearSelection()
    if (!next) {
      prevPly = 0
      prevStatus = ''
      prevTurn = null
      prevEventSeq = 0
      return
    }
    const firstLoad = prevStatus === ''
    if (next.ttl > 0 && next.status !== (prevStatus || '')) resetCountdown()
    drawBoard()

    // lastEvent 差分：战报弹卡 + 音效（战斗/亮旗弹卡，其余只刷战报条）+ 落子滑动动画
    const event = next.lastEvent
    if (event && event.seq > prevEventSeq && !firstLoad) {
      // 任何一手落地都重置回合倒计时（否则走完一步倒计时继续往下数到 0）
      if (event.type === 'move' || event.type === 'battle' || event.type === 'reveal') resetCountdown()
      // 落子滑动动画（背面棋子换位肉眼难辨——动画 + 首尾标记是唯一线索）
      if (event.type === 'move' || event.type === 'battle' || event.type === 'reveal') startMoveAnim(next, next.lastMove)
      if (event.type === 'battle' || event.type === 'reveal') {
        playJunqiSound('capture')
        battleCard.value = { text: event.text, reveal: event.type === 'reveal' }
        if (battleCardTimer) clearTimeout(battleCardTimer)
        battleCardTimer = setTimeout(() => {
          battleCard.value = null
        }, 2600)
      } else if (event.type === 'win' || event.type === 'forfeit') {
        playJunqiSound(iWon.value ? 'win' : 'lose')
      } else if (event.type === 'rps_win') {
        playJunqiSound('rps')
      } else if (event.type === 'move') {
        playJunqiSound('move')
      }
    }
    prevEventSeq = Math.max(prevEventSeq, event?.seq ?? 0)

    if (!firstLoad && next.status === 'playing' && prevStatus === 'rps') {
      uni.showToast({ title: '对局开始', icon: 'none' })
    }
    if (!firstLoad && next.status === 'playing' && prevStatus === 'playing' && next.turn === myColor.value && prevTurn !== myColor.value) {
      uni.showToast({ title: '轮到你了', icon: 'none' })
    }
    prevPly = next.ply
    prevStatus = next.status
    prevTurn = next.turn
  },
  { deep: true },
)

// ---------- 猜拳 ----------
const RPS_LABELS = ['石头', '布', '剪刀']
const RPS_KEYS = ['r', 'p', 's']
const rpsCountdown = ref(0)
let rpsCountdownTimer: ReturnType<typeof setInterval> | null = null

function rpsLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return '…'
  return RPS_LABELS[value] ?? String(value)
}

/** 结果定格：status 从 rps → playing 时用最后一份 rps 数据停留 2s。 */
const rpsHold = ref(false)
const rpsHoldData = ref<{ winnerName: string, winner: JunqiSide, picks: { red: number | null, blue: number | null }, red: string, blue: string } | null>(null)
let rpsHoldTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => `${state.value?.status ?? ''}|${state.value?.rps?.phase ?? ''}`,
  (key, prevKey) => {
    // 字符串 key 值比较：数组 getter 每次返回新引用，会让每个动作都重触发回调（gomoku/jungle 家法）
    const [status, phase] = key.split('|')
    if (status === 'rps' && phase === 'pick') {
      const rpsState = state.value?.rps
      if (rpsState?.myTurn) {
        if (rpsCountdownTimer) clearInterval(rpsCountdownTimer)
        rpsCountdown.value = state.value?.ttl ?? 10
        rpsCountdownTimer = setInterval(() => {
          if (rpsCountdown.value > 0) rpsCountdown.value--
        }, 1000)
      }
    }
    if (status === 'playing') {
      if (rpsCountdownTimer) { clearInterval(rpsCountdownTimer); rpsCountdownTimer = null }
      const rpsState = state.value?.rps
      if (prevKey === 'rps|pick' && rpsState && rpsState.phase === 'done' && rpsState.winner && !rpsHold.value) {
        const st = state.value
        rpsHoldData.value = {
          winnerName: (rpsState.winner === 'red' ? st?.red : st?.blue)?.nickname ?? '?',
          winner: rpsState.winner,
          picks: rpsState.picks ?? { red: null, blue: null },
          red: st?.red?.nickname ?? '?',
          blue: st?.blue?.nickname ?? '?',
        }
        rpsHold.value = true
        if (rpsHoldTimer) clearTimeout(rpsHoldTimer)
        rpsHoldTimer = setTimeout(() => {
          rpsHold.value = false
          rpsHoldData.value = null
        }, 2000)
      }
    }
  },
)

// ---------- 操作 ----------

async function guard(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  try {
    await action()
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '操作失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

async function onCreate() {
  await guard(async () => {
    await createAndEnter()
    await initBoard()
  })
}

async function onJoin() {
  await guard(async () => {
    await joinByCode(joinCode.value.trim())
    await initBoard()
  })
}

async function onRematch() {
  await guard(async () => {
    clearSelection()
    clearGrid()
    battleCard.value = null
    await requestRematch()
  })
}

/** 结算卡「返回房间」。 */
async function onLeaveAndBack() {
  await exitRoom()
  joinCode.value = ''
  uni.navigateBack({ fail: () => {} })
}

/** 数据栏返回：waiting/layout/finished 直接退；对局中二次确认（离开判负）。 */
function onBack() {
  const current = state.value
  if (!current) {
    uni.navigateBack({ fail: () => {} })
    return
  }
  if (current.status === 'playing' || current.status === 'rps') {
    uni.showModal({
      title: '离开房间',
      content: '对局还没结束，离开将判负，确定吗？',
      confirmColor: '#E85D4A',
      success: (res) => {
        if (res.confirm) void onLeaveAndBack()
      },
    })
    return
  }
  void onLeaveAndBack()
}

/** 认输（🚩）：确认后判负但留在房间看结算。 */
function onResign() {
  const current = state.value
  if (!current) return
  if (current.status !== 'playing' && current.status !== 'rps') {
    void onLeaveAndBack()
    return
  }
  if (!isSeated.value) {
    void onLeaveAndBack()
    return
  }
  uni.showModal({
    title: '认输',
    content: '确定认输结束本局吗？',
    confirmColor: '#E85D4A',
    success: (res) => {
      if (!res.confirm) return
      void guard(async () => {
        // leave 即判负（forfeit），保留 state 展示结算卡
        state.value = await leaveRoom(current.code)
      })
    },
  })
}

function openChat() {
  roomChat.chatPanelOpen.value = true
}

// ---------- 生命周期 ----------

onLoad((query) => {
  const code = typeof query?.room === 'string' ? query.room : ''
  if (/^[0-9]{4}$/.test(code)) {
    void guard(async () => {
      await joinByCode(code)
      await initBoard()
    })
  }
})

onShow(() => {
  void refreshFeatures()
  if (state.value) startSync()
})

onHide(() => {
  stopSync()
})

onUnload(() => {
  stopSync()
})

onShareAppMessage(() => ({
  title: state.value ? `来下军棋！房间码 ${state.value.code}` : '来下军棋！',
  path: state.value?.sharePath ?? '/pages-games/junqi/index',
}))
</script>

<style lang="scss" scoped>
.junqi {
  min-height: 100vh;
  padding: 0 16px 24rpx;
  box-sizing: border-box;
  background: #fff8f0;

  /* ── 大厅 ── */
  &__lobby {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 120rpx;
  }

  &__brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16rpx;
    margin-bottom: 64rpx;
  }

  &__brand-chips {
    display: flex;
    align-items: center;
    gap: 20rpx;
  }

  &__brand-chip {
    width: 88rpx;
    height: 88rpx;
    border-radius: 16rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 40rpx;
    font-weight: 700;

    &--red {
      background: #e85d4a;
      border: 3rpx solid #b8402e;
    }

    &--back {
      background: #3d6e96;
      border: 3rpx solid #2c4f73;
      color: #f4b942;
    }
  }

  &__brand-vs {
    font-size: 28rpx;
    font-weight: 700;
    color: #b9a98f;
  }

  &__brand-title {
    font-size: 48rpx;
    font-weight: 700;
    color: #4a3f35;
  }

  &__brand-sub {
    font-size: 24rpx;
    color: #7d6f60;
  }

  &__primary {
    width: 100%;
    height: 96rpx;
    line-height: 96rpx;
    border-radius: 48rpx;
    background: #e85d4a;
    color: #fff;
    font-size: 32rpx;
    font-weight: 600;

    &::after {
      border: none;
    }
  }

  &__divider {
    margin: 40rpx 0;
    font-size: 22rpx;
    color: #b9a98f;
  }

  &__join {
    display: flex;
    gap: 16rpx;
    width: 100%;
  }

  &__join-input {
    flex: 1;
    height: 88rpx;
    padding: 0 32rpx;
    border-radius: 44rpx;
    background: #fff;
    border: 1rpx solid #f0e4d7;
    font-size: 30rpx;
  }

  &__join-btn {
    width: 200rpx;
    height: 88rpx;
    line-height: 88rpx;
    border-radius: 44rpx;
    background: #f7eedf;
    color: #4a3f35;
    font-size: 30rpx;
    font-weight: 600;

    &::after {
      border: none;
    }
  }

  &__rules-link {
    margin-top: 48rpx;
    font-size: 26rpx;
    color: #7d6f60;
  }

  /* ── 数据栏 ── */
  &__room {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 6px;
    /* 固定聊天 dock（6 行 feed）的避让位 */
    padding-bottom: calc(200px + env(safe-area-inset-bottom));
  }

  &__topbar {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__back {
    width: 40px;
    height: 40px;
    border-radius: 20px;
    background: #f7eedf;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__back-icon {
    font-size: 22px;
    color: #4a3f35;
    margin-top: -2px;
  }

  &__title {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  &__title-main {
    font-size: 17px;
    font-weight: 600;
    color: #4a3f35;
  }

  &__title-sub {
    font-size: 10px;
    color: #7d6f60;
  }

  &__ply {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  &__ply-num {
    font-size: 24px;
    font-weight: 600;
    color: #4a3f35;
  }

  &__ply-label {
    font-size: 10px;
    color: #7d6f60;
  }

  /* ── 上下玩家栏 ── */
  &__bar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
  }

  &__bar--me {
    padding-left: 6px;
  }

  &__turn-bar {
    position: absolute;
    left: -4px;
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 2px;
    background: #f4b942;
  }

  &__avatar {
    width: 36px;
    height: 36px;
    border-radius: 18px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  &__avatar--blue {
    background: #f7eedf;
  }

  &__avatar--red {
    background: #f9e0da;
  }

  &__avatar-img {
    width: 100%;
    height: 100%;
  }

  &__avatar-hint {
    font-size: 16px;
  }

  &__bar-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__bar-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__bar-name {
    font-size: 13px;
    font-weight: 600;
    color: #4a3f35;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__pill {
    padding: 1px 8px;
    border-radius: 8px;
    font-size: 10px;
    color: #fff;

    &--blue {
      background: #5b8fb9;
    }

    &--red {
      background: #e85d4a;
    }
  }

  &__dot {
    width: 6px;
    height: 6px;
    border-radius: 3px;
    background: #6fa06b;

    &--off {
      background: #dccdb6;
    }
  }

  &__bar-status {
    font-size: 10px;
    color: #7d6f60;

    &--mine {
      color: #c08a1e;
      font-weight: 600;
    }
  }

  &__invite {
    margin: 0;
    padding: 0 16px;
    height: 32px;
    line-height: 32px;
    border-radius: 16px;
    background: #f4b942;
    color: #4a3f35;
    font-size: 13px;
    font-weight: 600;

    &::after {
      border: none;
    }
  }

  &__board-row {
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: 8px;
  }

  &__rail {
    width: 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
  }

  &__rail-label {
    flex-shrink: 0;
    width: 32px;
    font-size: 8px;
    line-height: 1.3;
    text-align: center;
    color: #b9a98f;
  }

  &__rail-chips {
    flex: 1;
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
    align-items: center;
    align-content: center;
    gap: 4px;
    overflow: hidden;
  }

  &__rail-chip {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 10px;
    font-weight: 600;

    &--red {
      background: #e85d4a;
    }

    &--blue {
      background: #5b8fb9;
    }
  }

  &__rail-empty {
    font-size: 9px;
    color: #dccdb6;
  }

  &__bubble {
    position: absolute;
    top: -30px;
    left: 12px;
    max-width: 70%;
    padding: 4px 10px;
    border-radius: 10px;
    background: #fff;
    border: 1rpx solid #f0e4d7;
    font-size: 11px;
    color: #4a3f35;
    z-index: 2;

    &--emoji {
      font-size: 20px;
    }
  }

  /* ── 棋盘卡 ── */
  &__board-card {
    align-self: center;
    padding: 12px;
    border-radius: 16px;
    background: #fff;
    border: 1rpx solid #f0e4d7;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    position: relative;
  }

  &__layout-hint {
    width: 100%;
    text-align: center;
    font-size: 10px;
    color: #b9a98f;
  }

  &__board {
    display: block;
  }

  &__board-hit {
    position: absolute;
    inset: 0;
  }

  /* ── 布阵托盘 ── */
  &__deploy {
    padding: 10px 12px;
    border-radius: 16px;
    background: #fff;
    border: 1rpx solid #f0e4d7;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__deploy-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__deploy-title {
    font-size: 12px;
    font-weight: 600;
    color: #4a3f35;
  }

  &__deploy-count {
    font-size: 10px;
    color: #b9a98f;
  }

  &__deploy-tip {
    margin-left: auto;
    font-size: 10px;
    font-weight: 600;
    color: #c08a1e;
  }

  &__deploy-scroll {
    width: 100%;
    white-space: nowrap;
  }

  &__deploy-chips {
    display: flex;
    gap: 6px;
  }

  &__deploy-chip {
    flex-shrink: 0;
    padding: 4px 12px;
    border-radius: 12px;
    background: #e85d4a;
    color: #fff;
    font-size: 13px;
    font-weight: 700;

    &--special {
      background: #7a6a58;
    }

    &--flag {
      background: #f4b942;
      color: #5c3a08;
    }

    &--active {
      box-shadow: 0 0 0 3rpx #f4b942;
    }
  }

  /* ── 操作区 ── */
  &__deploy-actions {
    display: flex;
    justify-content: center;
    gap: 10px;
  }

  &__deploy-btn {
    padding: 0 16px;
    height: 40px;
    line-height: 40px;
    border-radius: 20px;
    background: #f7eedf;
    color: #4a3f35;
    font-size: 13px;
    font-weight: 600;

    &--go {
      background: #e85d4a;
      color: #fff;
    }

    &--disabled {
      background: #ebdcce;
      color: #b9a98f;
    }
  }

  &__actions {
    display: flex;
    justify-content: center;
    gap: 24px;
  }

  &__action {
    width: 44px;
    height: 44px;
    border-radius: 22px;
    background: #f7eedf;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__action-icon {
    font-size: 20px;
  }

  &__hint {
    text-align: center;
    font-size: 11px;
    color: #7d6f60;
  }

  /* ── 聊天条 ── */
  &__chatbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
    background: rgba(255, 248, 237, 0.95);
    border-radius: 12px 12px 0 0;
    box-shadow: 0 -2px 10px rgba(62, 50, 38, 0.08);
  }

  &__chatbar-trigger {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border-radius: 16px;
    background: #f7eedf;
    flex-shrink: 0;
  }

  &__chatbar-icon {
    font-size: 14px;
  }

  &__chatbar-hint {
    font-size: 11px;
    color: #b9a98f;
  }

  &__chatbar-unread {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 16px;
    height: 16px;
    line-height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: #e85d4a;
    color: #fff;
    font-size: 9px;
    text-align: center;
  }

  &__chatbar-feed {
    width: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: #fff;
    border: 1rpx solid #f0e4d7;
    border-radius: 12px;
    padding: 6px 12px;
    overflow: hidden;
  }

  &__chatbar-item {
    display: flex;
    gap: 2px;
    overflow: hidden;
    white-space: nowrap;
  }

  &__chatbar-name {
    font-size: 10px;
    color: #b9a98f;
    flex-shrink: 0;
  }

  &__chatbar-text {
    font-size: 10px;
    color: #7d6f60;
    overflow: hidden;
    text-overflow: ellipsis;

    &--emoji {
      font-size: 16px;
    }
  }

  /* ── 猜拳遮罩 ── */
  &__rps-mask {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: #3e3226b8;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__rps {
    width: 299px;
    border-radius: 20px;
    background: #fff8f0;
    padding: 24px 20px;
  }

  &__rps-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    align-items: center;
  }

  &__rps-title {
    font-size: 16px;
    font-weight: 700;
    color: #4a3f35;
  }

  &__rps-sub {
    font-size: 11px;
    color: #7d6f60;
  }

  &__rps-sides {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
    width: 100%;
  }

  &__rps-side {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;

    &--win {
      .junqi__rps-name {
        color: #c08a1e;
      }
    }
  }

  &__rps-chip {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 20px;
    font-weight: 700;

    &--red {
      background: #e85d4a;
    }

    &--blue {
      background: #5b8fb9;
    }
  }

  &__rps-name {
    font-size: 12px;
    font-weight: 600;
    color: #4a3f35;
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__rps-status {
    font-size: 10px;
    color: #7d6f60;
  }

  &__rps-pick {
    font-size: 11px;
    font-weight: 600;
    color: #c08a1e;
  }

  &__rps-vs {
    font-size: 14px;
    font-weight: 700;
    color: #b9a98f;
  }

  &__rps-btns {
    display: flex;
    gap: 12px;
    width: 100%;
  }

  &__rps-btn {
    flex: 1;
    height: 76rpx;
    line-height: 76rpx;
    border-radius: 16rpx;
    background: #f7eedf;
    color: #4a3f35;
    font-size: 28rpx;
    font-weight: 600;
    padding: 0;

    &::after {
      border: none;
    }
  }

  &__rps-wait {
    font-size: 12px;
    color: #7d6f60;
  }

  /* ── 战斗结算弹卡 ── */
  &__battle-mask {
    position: fixed;
    inset: 0;
    z-index: 25;
    background: #3e3226b8;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__battle-card {
    width: 280px;
    border-radius: 20px;
    background: #fff8f0;
    padding: 24px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  &__battle-title {
    font-size: 15px;
    font-weight: 700;
    color: #4a3f35;
  }

  &__battle-boom {
    font-size: 40px;
  }

  &__battle-text {
    font-size: 14px;
    font-weight: 600;
    color: #c05b4a;
    text-align: center;
  }

  &__battle-reveal {
    padding: 6px 12px;
    border-radius: 10px;
    background: #f4b94226;
    font-size: 11px;
    font-weight: 700;
    color: #c08a1e;
  }

  &__battle-btn {
    width: 100%;
    height: 44px;
    border-radius: 22px;
    background: #e85d4a;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── 结算 ── */
  &__scrim {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: #3e3226b8;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__result-card {
    width: 299px;
    border-radius: 20px;
    background: #fff8f0;
    padding: 28px 20px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  &__result-deco {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__deco-line {
    width: 60px;
    height: 1px;
    background: #e8d9c4;
  }

  &__deco-leaf {
    font-size: 18px;
  }

  &__result-title {
    font-size: 30px;
    font-weight: 700;
    color: #e85d4a;
  }

  &__result-sub {
    font-size: 12px;
    color: #7d6f60;
  }

  &__result-stats {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px 4px;
  }

  &__stat-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__stat-label {
    font-size: 11px;
    color: #b9a98f;
  }

  &__stat-values {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__stat-num {
    font-size: 20px;
    font-weight: 700;

    &--red {
      color: #e85d4a;
    }

    &--blue {
      color: #5b8fb9;
    }
  }

  &__stat-colon {
    color: #dccdb6;
  }

  &__stat-dead {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: flex-end;
    max-width: 200px;
  }

  &__dead-chip {
    padding: 2px 6px;
    border-radius: 5px;
    color: #fff;
    font-size: 10px;
    font-weight: 600;

    &--red {
      background: #e85d4a;
    }

    &--blue {
      background: #5b8fb9;
    }
  }

  &__result-badge {
    padding: 6px 16px;
    border-radius: 16px;
    background: #f7eedf;
    font-size: 12px;
    color: #4a3f35;
  }

  &__result-rematch {
    width: 100%;
    height: 44px;
    line-height: 44px;
    border-radius: 22px;
    background: #e85d4a;
    color: #fff;
    font-size: 14px;
    font-weight: 600;

    &::after {
      border: none;
    }
  }

  &__result-leave {
    width: 100%;
    height: 40px;
    line-height: 40px;
    border-radius: 20px;
    background: #f7eedf;
    color: #4a3f35;
    font-size: 13px;
    font-weight: 600;

    &::after {
      border: none;
    }
  }

  /* ── 规则抽屉 ── */
  &__rules-scrim {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: #3e322680;
    display: flex;
    align-items: flex-end;
  }

  &__drawer {
    width: 100%;
    max-height: 72vh;
    border-radius: 24px 24px 0 0;
    background: #fff8f0;
    padding: 20px 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__drawer-title {
    font-size: 16px;
    font-weight: 700;
    color: #4a3f35;
  }

  &__drawer-close {
    width: 28px;
    height: 28px;
    border-radius: 14px;
    background: #f7eedf;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    color: #7d6f60;
  }

  &__drawer-scroll {
    max-height: 56vh;
  }

  &__rule {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 14px;
  }

  &__rule-label {
    display: flex;
    align-items: center;
    gap: 6px;

    text {
      font-size: 12px;
      font-weight: 700;
      color: #4a3f35;
    }

    &::before {
      content: '';
      width: 3px;
      height: 12px;
      border-radius: 2px;
      background: #f4b942;
    }
  }

  &__rule-text {
    font-size: 11px;
    line-height: 1.6;
    color: #7d6f60;
  }

  &__rule-note {
    font-size: 10px;
    color: #b9a98f;
  }

  &__rule-tail {
    display: block;
    text-align: center;
    font-size: 11px;
    color: #b9a98f;
    padding: 8px 0;
  }

  &__rank-chain {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }

  &__rank-chip {
    padding: 2px 8px;
    border-radius: 5px;
    background: #e85d4a;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
  }

  &__rank-gt {
    font-size: 11px;
    font-weight: 700;
    color: #b9a98f;
  }

  &__sp-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__sp-chip {
    flex-shrink: 0;
    width: 36px;
    padding: 2px 0;
    border-radius: 5px;
    background: #e85d4a;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    text-align: center;

    &--dark {
      background: #7a6a58;
    }

    &--gold {
      background: #f4b942;
      color: #5c3a08;
    }

    &--sand {
      background-color: #f1ddb5;
      background-image: repeating-linear-gradient(90deg, #d9bc8e 0 1px, transparent 1px 3px);
      color: #7a5c2e;
    }

    &--green {
      background: #dfeed6;
      color: #3f6d33;
      border: 1px solid #6f9e58;
    }
  }

  &__mv-demo {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 2px 0 2px 2px;
  }

  &__mv-cell {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;

    &--rail {
      background-color: #f1ddb5;
      background-image: repeating-linear-gradient(90deg, #d9bc8e 0 1.5px, transparent 1.5px 4.5px);
      border: 1.5px solid #b98a50;
    }

    &--piece {
      color: #fff;
      font-size: 11px;
      font-weight: 700;
    }

    &--red {
      background: #e85d4a;
    }

    &--blue {
      background: #5b8fb9;
    }
  }

  &__mv-note {
    margin-left: 6px;
    font-size: 10px;
    color: #b9a98f;
  }

  &__sp-text {
    font-size: 11px;
    line-height: 1.5;
    color: #7d6f60;
  }

  &__sp-geo {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    border-radius: 3px;

    &--rail {
      background-color: #f1ddb5;
      background-image: repeating-linear-gradient(90deg, #d9bc8e 0 1.5px, transparent 1.5px 4.5px);
      border: 1.5px solid #b98a50;
    }

    &--road {
      background: #f7eedf;
      border: 1px solid #e8d9c4;
    }

    &--camp {
      border-radius: 50%;
      background: #dfeed6;
      border: 2px solid #6f9e58;
      box-shadow: inset 0 0 0 2px #ffffffb0;
    }

    &--hq {
      background: #f7dfd3;
      border: 2px solid #d98c74;
      box-shadow: inset 0 0 0 2px #e3b4a6;
    }
  }

  &__cg-badge {
    flex-shrink: 0;
    padding: 1px 7px;
    border-radius: 8px;
    background: #f4b94233;
    color: #c08a1e;
    font-size: 9px;
    font-weight: 700;
  }
}
</style>

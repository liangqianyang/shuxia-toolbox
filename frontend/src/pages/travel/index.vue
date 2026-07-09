<template>
  <view class="travel">
    <!-- 输入：出发地 + 目的地 + 出行方式 + 天数/时长 + 偏好 -->
    <view class="card travel__ai">
      <view class="travel__ai-head">
        <text class="section-title">AI 规划行程</text>
        <text class="caption">填出发地、目的地和出行方式，AI 联网生成路线 + 多张攻略图（约 10-30s）</text>
      </view>

      <view class="travel__ai-place">
        <input
          class="travel__ai-place-input"
          v-model="aiOrigin"
          placeholder="出发地（可选），如「杭州东站」"
          @confirm="searchAiPlace('origin')"
        />
        <view class="travel__ai-place-btn" @tap="searchAiPlace('origin')">{{
          aiPlaceSearching === 'origin' ? '…' : '地图'
        }}</view>
      </view>
      <view v-if="aiOriginCandidates.length" class="travel__ai-candidates">
        <view
          v-for="(c, i) in aiOriginCandidates"
          :key="`origin-${i}`"
          class="travel__ai-candidate"
          @tap="pickAiPlace('origin', c)"
        >
          <text class="travel__ai-cand-name">{{ c.title || c.name }}</text>
          <text class="travel__ai-cand-addr">{{ c.province }}{{ c.city }}</text>
        </view>
      </view>

      <view class="travel__ai-place">
        <input
          class="travel__ai-place-input"
          v-model="aiDestination"
          placeholder="目的地，如「杭州」"
          @confirm="searchAiPlace('destination')"
        />
        <view class="travel__ai-place-btn" @tap="searchAiPlace('destination')">{{
          aiPlaceSearching === 'destination' ? '…' : '地图'
        }}</view>
      </view>
      <view v-if="aiDestinationCandidates.length" class="travel__ai-candidates">
        <view
          v-for="(c, i) in aiDestinationCandidates"
          :key="`destination-${i}`"
          class="travel__ai-candidate"
          @tap="pickAiPlace('destination', c)"
        >
          <text class="travel__ai-cand-name">{{ c.title || c.name }}</text>
          <text class="travel__ai-cand-addr">{{ c.province }}{{ c.city }}</text>
        </view>
      </view>

      <view class="travel__modes">
        <view
          v-for="m in TRAVEL_MODE_ORDER"
          :key="m"
          class="travel__mode"
          :class="{ 'travel__mode--active': aiMode === m }"
          @tap="aiMode = m"
        >
          <text class="travel__mode-icon">{{ TRAVEL_MODE_META[m].icon }}</text>
          <text class="travel__mode-label">{{ TRAVEL_MODE_META[m].label }}</text>
        </view>
      </view>

      <view class="travel__intensity">
        <text class="caption">旅行强度</text>
        <view class="travel__intensity-options">
          <view
            v-for="level in TRAVEL_INTENSITY_ORDER"
            :key="level"
            class="travel__intensity-item"
            :class="{ 'travel__intensity-item--active': aiIntensity === level }"
            @tap="aiIntensity = level"
          >
            <text class="travel__intensity-label">{{ TRAVEL_INTENSITY_META[level].label }}</text>
            <text class="travel__intensity-hint">{{ TRAVEL_INTENSITY_META[level].hint }}</text>
          </view>
        </view>
      </view>

      <view class="travel__ai-row">
        <view class="travel__ai-num">
          <text class="caption">天数</text>
          <view class="travel__ai-stepper">
            <text class="travel__ai-step" @tap="setDays(Math.max(1, aiDays - 1))">−</text>
            <text class="travel__ai-step-val">{{ aiDays }}</text>
            <text class="travel__ai-step" @tap="setDays(Math.min(30, aiDays + 1))">+</text>
          </view>
        </view>
        <view class="travel__ai-num">
          <text class="caption">行程</text>
          <view class="travel__ai-seg">
            <text
              class="travel__ai-seg-item"
              :class="{ 'travel__ai-seg-item--active': !aiRoundTrip }"
              @tap="aiRoundTrip = false"
              >单程</text
            >
            <text
              class="travel__ai-seg-item"
              :class="{ 'travel__ai-seg-item--active': aiRoundTrip }"
              @tap="aiRoundTrip = true"
              >往返</text
            >
          </view>
        </view>
      </view>

      <view class="travel__ai-hours">
        <text class="caption">每天时长</text>
        <view class="travel__ai-hours-list">
          <view v-for="(h, i) in aiHoursPerDay" :key="i" class="travel__ai-hour">
            <text class="travel__ai-hour-lab">D{{ i + 1 }}</text>
            <view class="travel__ai-stepper travel__ai-stepper--sm">
              <text class="travel__ai-step" @tap="decHour(i)">−</text>
              <text class="travel__ai-step-val">{{ h }}h</text>
              <text class="travel__ai-step" @tap="incHour(i)">+</text>
            </view>
          </view>
        </view>
      </view>

      <textarea
        class="travel__ai-pref"
        v-model="aiPreferences"
        placeholder="偏好（可选），如「亲子、自然景观、必吃美食、避开人流」"
        :auto-height="true"
      />

      <input
        class="travel__ai-input"
        v-model="aiSights"
        placeholder="想去的景点（可选），如「西湖、灵隐寺、雷峰塔」"
      />
      <input
        class="travel__ai-input"
        v-model="aiFoods"
        placeholder="想吃的美食（可选），如「西湖醋鱼、东坡肉」"
      />

      <view class="travel__ai-date">
        <text class="caption">出发日期（可选，按目的地天气准备清单）</text>
        <picker mode="date" :value="aiDepartureDate" :start="todayStr" @change="onDateChange">
          <view class="travel__ai-date-val">{{ aiDepartureDate || '点此选择日期（不选则按当季）' }}</view>
        </picker>
      </view>

      <view class="travel__ai-style">
        <text class="caption">攻略图风格（影响所有攻略图的背景和标题氛围）</text>
        <view class="travel__style-options">
          <view
            v-for="style in GUIDE_STYLE_ORDER"
            :key="style"
            class="travel__style-item"
            :class="{ 'travel__style-item--active': trip.guideStyle === style }"
            @tap="setGuideStyleChoice(style)"
          >
            <text class="travel__style-label">{{ GUIDE_STYLE_META[style].label }}</text>
            <text class="travel__style-hint">{{ GUIDE_STYLE_META[style].hint }}</text>
          </view>
        </view>
      </view>

      <view v-if="planError" class="travel__ai-err caption">{{ planError }}</view>
      <view
        class="btn-primary travel__ai-go"
        :class="{ disabled: planning || !aiDestination.trim() }"
        @tap="onPlan"
      >
        {{ planning ? 'AI 联网规划中…' : 'AI 生成攻略' }}
      </view>
    </view>

    <!-- 行程标题 -->
    <view class="card travel__head">
      <input
        class="travel__title-input"
        v-model="trip.title"
        placeholder="给行程起个名字，如「3 天杭州行」"
        @input="markDirty"
      />
    </view>

    <view class="card travel__cloud">
      <view class="travel__cloud-head">
        <view>
          <text class="section-title">云保存与分享</text>
          <text class="caption">保存当前行程到后端，分享码可发给同行人导入</text>
        </view>
        <view class="btn-primary travel__cloud-save" :class="{ disabled: cloudSaving }" @tap="onCloudSave">{{
          cloudSaving ? '保存中…' : '云保存'
        }}</view>
      </view>
      <view v-if="lastShareCode" class="travel__cloud-code">
        <text class="travel__cloud-code-label">分享码</text>
        <text class="travel__cloud-code-val">{{ lastShareCode }}</text>
        <text class="travel__cloud-copy" @tap="onCopyShareCode">复制</text>
      </view>
      <view class="travel__cloud-import">
        <input class="travel__cloud-input" v-model="shareCodeInput" placeholder="输入分享码导入行程" />
        <view class="btn-ghost travel__cloud-import-btn" @tap="onImportShareCode()">导入</view>
      </view>
    </view>

    <!-- 规划确认台：把可执行性和可信提醒前置，避免用户只看到漂亮图却忽略风险 -->
    <view v-if="tripReviewItems.length" class="card travel__review">
      <view class="travel__review-head">
        <view>
          <text class="section-title">规划确认台</text>
          <text class="caption">生成后先确认地点、交通和出发前待办</text>
        </view>
        <text class="travel__review-status" :class="`travel__review-status--${tripReadiness.level}`">{{
          tripReadiness.label
        }}</text>
      </view>
      <view class="travel__review-metrics">
        <view v-for="metric in tripReviewMetrics" :key="metric.key" class="travel__review-metric">
          <text class="travel__review-metric-val">{{ metric.value }}</text>
          <text class="travel__review-metric-label">{{ metric.label }}</text>
        </view>
      </view>
      <view v-for="item in tripReviewItems" :key="item.key" class="travel__review-item">
        <text class="travel__review-mark" :class="`travel__review-mark--${item.level}`">{{
          item.level === 'warn' ? '!' : 'i'
        }}</text>
        <text class="travel__review-text">{{ item.text }}</text>
      </view>
    </view>

    <!-- 跨城段（可编辑：AI 联网估算不准可手动修正，改完点「应用到攻略图」重画路线规划图）-->
    <view v-if="trip.intercity" class="card travel__intercity">
      <view class="travel__intercity-head">
        <text class="section-title">跨城交通</text>
        <text class="caption">AI 联网估算，不准可手动修正</text>
      </view>
      <view class="travel__intercity-od">
        <input
          class="travel__intercity-input"
          v-model="trip.intercity.from"
          placeholder="出发地"
          @input="markDirty"
        />
        <text class="travel__intercity-arrow">{{ trip.intercity.roundTrip ? '⇄' : '→' }}</text>
        <input
          class="travel__intercity-input"
          v-model="trip.intercity.to"
          placeholder="目的地"
          @input="markDirty"
        />
      </view>
      <view class="travel__modes">
        <view
          v-for="m in TRAVEL_MODE_ORDER"
          :key="m"
          class="travel__mode"
          :class="{ 'travel__mode--active': trip.intercity.mode === m }"
          @tap="updateIntercity({ mode: m })"
        >
          <text class="travel__mode-icon">{{ TRAVEL_MODE_META[m].icon }}</text>
          <text class="travel__mode-label">{{ TRAVEL_MODE_META[m].label }}</text>
        </view>
      </view>
      <view class="travel__intercity-nums">
        <text class="caption">单程耗时</text>
        <input class="travel__intercity-num" type="number" v-model="durHoursStr" @blur="commitDur" />
        <text class="caption">时</text>
        <input class="travel__intercity-num" type="number" v-model="durMinsStr" @blur="commitDur" />
        <text class="caption travel__intercity-dist">距离</text>
        <input class="travel__intercity-num" type="number" v-model="distKmStr" @blur="commitDist" />
        <text class="caption">公里</text>
      </view>
      <text class="caption travel__intercity-durhint">{{ durHint }}</text>
      <textarea
        class="travel__intercity-note"
        v-model="trip.intercity.note"
        placeholder="备注（可选），如「建议合肥南出发，提前购票」"
        :auto-height="true"
        @input="markDirty"
      />
      <view class="btn-primary travel__intercity-apply" @tap="onApplyToCards">应用到攻略图</view>
    </view>

    <!-- 按天编辑 -->
    <view v-for="day in trip.days" :key="day.id" class="card travel__day">
      <view class="travel__day-head">
        <text class="travel__day-badge">Day {{ day.index }}</text>
        <input
          class="travel__day-title"
          v-model="day.title"
          :placeholder="`Day ${day.index} 副标题（如「西湖」）`"
          @input="markDirty"
        />
        <text
          class="travel__day-ai"
          :class="{ 'travel__day-ai--disabled': refiningDayId === day.id }"
          @tap="onRefineDay(day.id)"
          >{{ refiningDayId === day.id ? '重写中' : 'AI重写' }}</text
        >
        <text class="travel__day-sort" @tap="onReorderDay(day.id)">重排</text>
        <text v-if="trip.days.length > 1" class="travel__day-del" @tap="removeDay(day.id)">删除</text>
      </view>
      <view class="travel__day-check">
        <text
          v-for="item in dayCheckMap[day.id] || []"
          :key="item.key"
          class="travel__day-check-chip"
          :class="`travel__day-check-chip--${item.level}`"
          >{{ item.text }}</text
        >
      </view>

      <view class="travel__day-handbook">
        <textarea
          class="travel__day-summary"
          v-model="day.handbookSummary"
          :placeholder="`Day ${day.index} 今日一句话`"
          :auto-height="true"
          @input="markDirty"
        />
        <view class="travel__day-moods">
          <view
            v-for="mood in DAY_MOOD_ORDER"
            :key="mood"
            class="travel__day-mood"
            :class="{ 'travel__day-mood--active': (day.dayMood || 'citywalk') === mood }"
            @tap="setDayMood(day.id, mood)"
          >
            <text class="travel__day-mood-label">{{ DAY_MOOD_META[mood].label }}</text>
            <text class="travel__day-mood-hint">{{ DAY_MOOD_META[mood].hint }}</text>
          </view>
        </view>
      </view>

      <view class="travel__stops">
        <TravelStopCard
          v-for="stop in day.stops"
          :key="stop.id"
          :stop="stop"
          :replacing="replacingStopId === stop.id"
          :on-geocode="(q) => geocodeStop(day.id, stop.id, q)"
          @update="(patch) => updateStop(day.id, stop.id, patch)"
          @remove="removeStop(day.id, stop.id)"
          @move="(dir) => moveStop(day.id, stop.id, dir)"
          @replace="onReplaceStop(day.id, stop.id)"
        />
      </view>

      <view class="travel__add-stop" @tap="addStop(day.id)">+ 添加地点</view>
    </view>

    <view class="travel__add-day" @tap="addDay()">+ 添加一天</view>

    <!-- 图片画廊：每张独立图 = 一个 canvas + 保存 -->
    <view v-if="rendered" class="card travel__gallery">
      <view class="travel__gallery-head">
        <text class="section-title">攻略图（已选 {{ selectedCardCount }}/{{ cards.length }} 张）</text>
        <view class="travel__gallery-actions">
          <text class="travel__gallery-link" @tap="selectRecommendedCards">推荐</text>
          <text class="travel__gallery-link" @tap="selectAllCards">全选</text>
          <view class="btn-primary travel__save-all" @tap="onSaveAll">保存选中</view>
        </view>
      </view>
      <view class="travel__suite-list">
        <view
          v-for="suite in CARD_SUITES"
          :key="suite.id"
          class="travel__suite"
          :class="{ 'travel__suite--active': selectedCardPreset === suite.id }"
          @tap="selectCardSuite(suite.id)"
        >
          <text class="travel__suite-label">{{ suite.label }}</text>
          <text class="travel__suite-hint">{{ suite.hint }}</text>
        </view>
      </view>

      <template v-for="(card, i) in cards" :key="card.key">
        <view class="travel__gitem">
          <view class="travel__gitem-head">
            <view class="travel__gitem-title">
              <text
                class="travel__gitem-check"
                :class="{ 'travel__gitem-check--active': isCardSelected(card.key) }"
                @tap="toggleCardSelected(card.key)"
                >{{ isCardSelected(card.key) ? '已选' : '未选' }}</text
              >
              <view class="travel__gitem-copy">
                <view class="travel__gitem-name">
                  <text class="travel__gitem-label">{{ card.label }}</text>
                  <text class="travel__gitem-group">{{ cardGroupLabel(card.group) }}</text>
                </view>
                <text class="travel__gitem-hint">{{ card.hint }}</text>
              </view>
            </view>
            <view class="travel__gitem-tools">
              <text class="travel__gitem-bg" @tap="onPickBg(i)">{{ cardBgs[i] ? '换底图' : '自定义底图' }}</text>
              <text v-if="cardBgs[i]" class="travel__gitem-bgclear" @tap="onClearBg(i)">清除</text>
              <text class="travel__gitem-save" @tap="onSaveOne(i)">保存本张</text>
            </view>
          </view>
          <canvas
            :id="`guide-canvas-${i}`"
            type="2d"
            class="travel__gcanvas"
            :style="{ width: cssWidth + 'px', height: cssHeight + 'px' }"
          ></canvas>
        </view>
        <!-- 美食推荐图下方紧接「必吃美食」编辑器（改完点应用到攻略图重画本卡）-->
        <view v-if="card.key === 'food' && trip.food.length > 0" class="travel__food">
          <view class="travel__food-head">
            <text class="section-title">必吃美食</text>
            <text class="caption">AI 生成，可增删改</text>
          </view>
          <view v-for="(f, fi) in trip.food" :key="fi" class="travel__food-row">
            <text class="travel__food-num">{{ fi + 1 }}</text>
            <view class="travel__food-fields">
              <input
                class="travel__food-input travel__food-input--name"
                v-model="f.name"
                placeholder="美食名，如 西湖醋鱼"
                @input="markDirty"
              />
              <input class="travel__food-input" v-model="f.shop" placeholder="推荐店，如 楼外楼" @input="markDirty" />
              <input
                class="travel__food-input"
                v-model="foodDishesStr[fi]"
                placeholder="必点菜，用、分隔，如 醋鱼、龙井虾仁"
                @blur="commitFoodDishes(fi)"
              />
              <input class="travel__food-input" v-model="f.note" placeholder="简短点评" @input="markDirty" />
            </view>
            <view class="travel__food-ops">
              <text class="travel__food-op" @tap="moveFood(fi, -1)">↑</text>
              <text class="travel__food-op" @tap="moveFood(fi, 1)">↓</text>
              <text class="travel__food-op travel__food-op--del" @tap="removeFood(fi)">删</text>
            </view>
          </view>
          <view class="travel__food-add" @tap="addFood()">+ 添加美食</view>
          <view class="btn-primary travel__food-apply" @tap="onApplyToCards">应用到攻略图</view>
        </view>
      </template>
    </view>

    <!-- 出行清单（可编辑：AI 按天气+特色生成，分必带物品/注意事项两组，改完点「应用到攻略图」重画出清单卡）-->
    <view
      v-if="trip.packingMust.length > 0 || trip.packingNotes.length > 0"
      class="card travel__pack"
    >
      <view class="travel__pack-head">
        <text class="section-title">出行清单</text>
        <text class="caption">AI 按天气+特色生成，分两组可增删改</text>
      </view>
      <!-- 必带物品 -->
      <view class="travel__pack-group">
        <text class="travel__pack-grouptitle">📦 必带物品</text>
        <view v-for="(tip, i) in trip.packingMust" :key="`m${i}`" class="travel__pack-row">
          <input
            class="travel__pack-input"
            v-model="trip.packingMust[i]"
            :placeholder="`物品 ${i + 1}`"
            @input="markDirty"
          />
          <text class="travel__pack-op" @tap="movePacking('must', i, -1)">↑</text>
          <text class="travel__pack-op" @tap="movePacking('must', i, 1)">↓</text>
          <text class="travel__pack-op travel__pack-op--del" @tap="removePacking('must', i)">删</text>
        </view>
        <view class="travel__pack-add" @tap="addPacking('must')">+ 添加物品</view>
      </view>
      <!-- 注意事项 -->
      <view class="travel__pack-group">
        <text class="travel__pack-grouptitle">📝 注意事项</text>
        <view v-for="(tip, i) in trip.packingNotes" :key="`n${i}`" class="travel__pack-row">
          <input
            class="travel__pack-input"
            v-model="trip.packingNotes[i]"
            :placeholder="`注意事项 ${i + 1}`"
            @input="markDirty"
          />
          <text class="travel__pack-op" @tap="movePacking('note', i, -1)">↑</text>
          <text class="travel__pack-op" @tap="movePacking('note', i, 1)">↓</text>
          <text class="travel__pack-op travel__pack-op--del" @tap="removePacking('note', i)">删</text>
        </view>
        <view class="travel__pack-add" @tap="addPacking('note')">+ 添加注意事项</view>
      </view>
      <view class="btn-primary travel__pack-apply" @tap="onApplyToCards">应用到攻略图</view>
    </view>

    <!-- 小红书文案卡（可编辑，放出行清单之后）-->
    <view v-if="rendered && (trip.xhs.title || trip.xhs.body)" class="card travel__xhs">
      <view class="travel__xhs-head">
        <text class="section-title">小红书文案</text>
        <view class="btn-primary travel__xhs-copy" @tap="onCopyXhs">复制文案</view>
      </view>
      <input
        class="travel__xhs-title-input"
        v-model="trip.xhs.title"
        placeholder="标题"
        @input="markDirty"
      />
      <view class="travel__xhs-body-wrap">
        <!-- 非编辑态用 <text> 展示：原生 textarea 的 auto-height 在长文下会截断（只显 Day1），
             text 一定全显且自适应高度；点此或下方按钮进入 textarea 编辑 -->
        <text
          v-if="!editingBody"
          class="travel__xhs-body"
          @tap="editingBody = true"
          >{{ trip.xhs.body || '点此编辑正文…' }}</text
        >
        <textarea
          v-else
          class="travel__xhs-body-input"
          v-model="trip.xhs.body"
          placeholder="正文"
          :auto-height="true"
          :focus="true"
          @input="markDirty"
          @blur="editingBody = false"
        />
      </view>
      <text v-if="!editingBody" class="travel__xhs-editbtn" @tap="editingBody = true">✏️ 编辑正文</text>
      <view v-if="trip.xhs.tags.length" class="travel__xhs-tags">
        <view v-for="(t, ti) in trip.xhs.tags" :key="ti" class="travel__xhs-tagrow">
          <text class="travel__xhs-tag">{{ t }}</text>
          <text class="travel__xhs-tagdel" @tap="removeXhsTag(ti)">×</text>
        </view>
      </view>
      <input
        class="travel__xhs-tagadd"
        v-model="newTag"
        placeholder="添加话题，如 #杭州攻略（回车确认）"
        @confirm="addXhsTag"
      />
    </view>

    <!-- 底部操作 -->
    <view class="travel__dock">
      <view class="travel__dock-hint caption">{{ dirty ? '有未保存改动' : '草稿已保存' }}</view>
      <view class="travel__dock-actions">
        <view class="btn-ghost" :class="{ disabled: regenerating }" @tap="onSave">保存草稿</view>
        <view
          v-if="rendered"
          class="btn-ghost travel__dock-saveall"
          :class="{ disabled: regenerating || saving }"
          @tap="onSaveAll"
          >{{ saving ? '保存中…' : '批量保存' }}</view
        >
        <view class="btn-primary" :class="{ disabled: regenerating }" @tap="onGenerate">{{
          regenerating ? '生成中…' : rendered ? '重新生成图' : '生成攻略图'
        }}</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onMounted, ref, watch } from 'vue'
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app'
import TravelStopCard from '@/components/TravelStopCard.vue'
import { useTravelEditor } from '@/composables/useTravelEditor'
import { useTravelImages } from '@/composables/useTravelImages'
import {
  DAY_MOOD_META,
  DAY_MOOD_ORDER,
  GUIDE_STYLE_META,
  GUIDE_STYLE_ORDER,
  TRAVEL_INTENSITY_META,
  TRAVEL_INTENSITY_ORDER,
  TRAVEL_MODE_META,
  TRAVEL_MODE_ORDER,
  type DayMood,
  type GeocodeCandidate,
  type GuideStyle,
  type TravelIntensity,
  type TravelMode,
} from '@/types/travel'
import { chooseImage } from '@/utils/canvasAdapter'

const {
  trip,
  dirty,
  markDirty,
  addDay,
  removeDay,
  addStop,
  updateStop,
  removeStop,
  moveStop,
  reorderDayByRoute,
  updateIntercity,
  updatePacking,
  addPacking,
  removePacking,
  movePacking,
  updateFood,
  addFood,
  removeFood,
  moveFood,
  geocodeStop,
  planWithAi,
  refineDayWithAi,
  replaceStopWithAi,
  saveTripToCloud,
  loadSharedTrip,
  loadFromStorage,
  saveToStorage,
} = useTravelEditor()

const aiOrigin = ref('')
const aiDestination = ref('')
const aiOriginCandidates = ref<GeocodeCandidate[]>([])
const aiDestinationCandidates = ref<GeocodeCandidate[]>([])
const aiPlaceSearching = ref<'origin' | 'destination' | ''>('')
const aiMode = ref<TravelMode>('walking')
const aiIntensity = ref<TravelIntensity>('standard')
const aiDays = ref(3)
// 每天时长：按天数组，与 aiDays 同步（增天补 8、减天截断）
const aiHoursPerDay = ref<number[]>([8, 8, 8])
const aiRoundTrip = ref(false)
const aiPreferences = ref('')
const aiDepartureDate = ref('')
// 出发日期最早只能选今天：过去的日期没有备货意义
const todayStr = computed(() => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})
const aiSights = ref('')
const aiFoods = ref('')
const planning = ref(false)
const planError = ref('')
const refiningDayId = ref('')
const replacingStopId = ref('')
const cloudSaving = ref(false)
const shareCodeInput = ref('')
const lastShareCode = ref('')
const lastSharePath = ref('')
const pendingShareCode = ref('')

type TripReviewLevel = 'warn' | 'info'
interface TripReviewItem {
  key: string
  level: TripReviewLevel
  text: string
}
interface TripReviewMetric {
  key: string
  label: string
  value: string
}
interface DayCheckItem {
  key: string
  level: 'ok' | 'warn' | 'info'
  text: string
}
interface TripReviewStats {
  totalStops: number
  geocodedStops: number
  missingCoords: number
  longLegs: number
  denseDayLabels: string[]
  missingTimes: number
  missingPoiInfo: number
}

const tripReviewStats = computed<TripReviewStats>(() => {
  const namedStops = trip.days.flatMap((day) => day.stops.filter((stop) => stop.name.trim()))
  const missingCoords = namedStops.filter((stop) => stop.lng === null || stop.lat === null).length
  const longLegs = namedStops.filter((stop) => {
    const leg = stop.travelToNext
    return leg !== null && (leg.durationMin >= 45 || leg.distanceM >= 12000)
  }).length
  const denseDayLabels = trip.days
    .map((day) => ({ label: `Day ${day.index}`, count: day.stops.filter((stop) => stop.name.trim()).length }))
    .filter((day) => day.count >= 6)
    .map((day) => day.label)
  const missingPoiInfo = namedStops.filter((stop) => {
    const info = stop.poiInfo
    return !info || !info.openHours || !info.reservation || !info.ticket || !info.duration
  }).length

  return {
    totalStops: namedStops.length,
    geocodedStops: namedStops.length - missingCoords,
    missingCoords,
    longLegs,
    denseDayLabels,
    missingTimes: namedStops.filter((stop) => !stop.time.trim()).length,
    missingPoiInfo,
  }
})

const tripReadiness = computed(() => {
  const s = tripReviewStats.value
  if (s.totalStops === 0) return { level: 'info', label: '待规划' }
  if (s.missingCoords > 0 || s.longLegs > 0 || s.denseDayLabels.length > 0) {
    return { level: 'warn', label: '需校验' }
  }
  if (s.missingTimes > 0 || s.missingPoiInfo > 0) return { level: 'info', label: '可优化' }
  return { level: 'good', label: '可出行' }
})

const tripReviewMetrics = computed<TripReviewMetric[]>(() => {
  const s = tripReviewStats.value
  return [
    { key: 'coords', label: '已定位地点', value: `${s.geocodedStops}/${s.totalStops}` },
    { key: 'long-legs', label: '长移动', value: `${s.longLegs}` },
    { key: 'todo', label: '待确认', value: `${s.missingTimes + s.missingPoiInfo}` },
  ]
})

const dayCheckMap = computed<Record<string, DayCheckItem[]>>(() => {
  const out: Record<string, DayCheckItem[]> = {}
  trip.days.forEach((day) => {
    const stops = day.stops.filter((stop) => stop.name.trim())
    const missingCoords = stops.filter((stop) => stop.lng === null || stop.lat === null).length
    const longLegs = stops.filter((stop) => {
      const leg = stop.travelToNext
      return leg !== null && (leg.durationMin >= 45 || leg.distanceM >= 12000)
    }).length
    const hasFood = stops.some((stop) => stop.type === 'food')
    out[day.id] = [
      { key: 'count', level: 'info', text: `${stops.length} 个地点` },
      missingCoords > 0
        ? { key: 'coords', level: 'warn', text: `${missingCoords} 个未定位` }
        : { key: 'coords', level: 'ok', text: '坐标完整' },
      longLegs > 0
        ? { key: 'legs', level: 'warn', text: `${longLegs} 段长移动` }
        : { key: 'legs', level: 'ok', text: '交通可控' },
      hasFood || stops.length < 4
        ? { key: 'food', level: 'ok', text: hasFood ? '有用餐点' : '轻量行程' }
        : { key: 'food', level: 'info', text: '待补用餐' },
    ]
  })
  return out
})

const tripReviewItems = computed<TripReviewItem[]>(() => {
  const items: TripReviewItem[] = []
  const namedStops = trip.days.flatMap((day) => day.stops.filter((stop) => stop.name.trim()))
  if (namedStops.length === 0) return items
  const stats = tripReviewStats.value

  if (stats.missingCoords > 0) {
    items.push({
      key: 'missing-coords',
      level: 'warn',
      text: `${stats.missingCoords} 个地点还没有坐标，地图和站间交通可能不够准确。`,
    })
  }

  if (stats.denseDayLabels.length > 0) {
    items.push({
      key: 'dense-days',
      level: 'warn',
      text: `${stats.denseDayLabels.join('、')} 地点较多，建议确认体力、排队和交通缓冲。`,
    })
  }

  if (stats.longLegs > 0) {
    items.push({
      key: 'long-legs',
      level: 'warn',
      text: `${stats.longLegs} 段站间移动偏长，可考虑换顺序或拆到不同天。`,
    })
  }

  const noFoodDays = trip.days.filter((day) => {
    const stops = day.stops.filter((stop) => stop.name.trim())
    return stops.length >= 4 && !stops.some((stop) => stop.type === 'food')
  })
  if (noFoodDays.length > 0) {
    items.push({
      key: 'food-gap',
      level: 'info',
      text: `${noFoodDays.map((day) => `Day ${day.index}`).join('、')} 没有明确用餐点，长线游玩建议补午餐或下午茶。`,
    })
  }

  if (stats.missingTimes > 0) {
    items.push({
      key: 'missing-times',
      level: 'info',
      text: `${stats.missingTimes} 个地点没有时间段，生成分享图前可补上，读起来会更像真实攻略。`,
    })
  }

  if (stats.missingPoiInfo > 0) {
    items.push({
      key: 'missing-poi-info',
      level: 'info',
      text: `${stats.missingPoiInfo} 个地点缺少开放/预约/门票/停留时长信息，出发前建议补齐。`,
    })
  }

  if (namedStops.some((stop) => stop.lng !== null && stop.lat !== null) && (!trip.routeMapImage || !trip.poiMapImage)) {
    items.push({
      key: 'map-fallback',
      level: 'info',
      text: '部分地图底图未生成成功，仍可出图，但建议检查地图服务配置后重新生成。',
    })
  }

  items.push({
    key: 'trust-reminder',
    level: 'info',
    text: '开放时间、预约规则、票价和天气会变化，出发前建议再确认一次。',
  })

  return items.slice(0, 6)
})

function setDays(n: number): void {
  aiDays.value = n
  const arr = aiHoursPerDay.value.slice(0, n)
  while (arr.length < n) arr.push(8)
  aiHoursPerDay.value = arr
}
function decHour(i: number): void {
  aiHoursPerDay.value[i] = Math.max(2, aiHoursPerDay.value[i] - 1)
}
function incHour(i: number): void {
  aiHoursPerDay.value[i] = Math.min(16, aiHoursPerDay.value[i] + 1)
}

async function searchAiPlace(field: 'origin' | 'destination'): Promise<void> {
  const query = (field === 'origin' ? aiOrigin.value : aiDestination.value).trim()
  if (!query) {
    uni.showToast({ title: field === 'origin' ? '先填出发地' : '先填目的地', icon: 'none' })
    return
  }

  aiPlaceSearching.value = field
  if (field === 'origin') {
    aiOriginCandidates.value = []
  } else {
    aiDestinationCandidates.value = []
  }

  try {
    const candidates = await geocodeStop('', '', query)
    if (field === 'origin') {
      aiOriginCandidates.value = candidates
    } else {
      aiDestinationCandidates.value = candidates
    }
    if (candidates.length === 0) {
      uni.showToast({ title: '没找到地点', icon: 'none' })
    }
  } finally {
    aiPlaceSearching.value = ''
  }
}

function pickAiPlace(field: 'origin' | 'destination', candidate: GeocodeCandidate): void {
  const name = candidate.name || candidate.title
  if (field === 'origin') {
    aiOrigin.value = name
    aiOriginCandidates.value = []
  } else {
    aiDestination.value = name
    aiDestinationCandidates.value = []
  }
}

const { cards, cssWidth, cssHeight, rendered, saving, renderAll, saveOne, saveAll, release } = useTravelImages()
const instance = getCurrentInstance()?.proxy
const BASE_RECOMMENDED_CARD_KEYS = ['route-real', 'route-by-day', 'multi-route', 'poi', 'timeline', 'food', 'packing']
type CardPresetId = 'recommended' | 'daily' | 'share' | 'map' | 'custom'
const CARD_SUITES: Array<{ id: Exclude<CardPresetId, 'recommended' | 'custom'>; label: string; hint: string }> = [
  { id: 'daily', label: '自用套装', hint: '路线、每日海报、时间线' },
  { id: 'share', label: '分享套装', hint: '每日海报、手帐、美食' },
  { id: 'map', label: '地图套装', hint: '分布、分日、多路线' },
]
const selectedCardKeys = ref<string[]>(BASE_RECOMMENDED_CARD_KEYS.slice())
const selectedCardPreset = ref<CardPresetId>('recommended')
const selectedCardCount = computed(() => cards.filter((card) => selectedCardKeys.value.includes(card.key)).length)

function isCardSelected(key: string): boolean {
  return selectedCardKeys.value.includes(key)
}

function toggleCardSelected(key: string): void {
  selectedCardPreset.value = 'custom'
  selectedCardKeys.value = isCardSelected(key)
    ? selectedCardKeys.value.filter((item) => item !== key)
    : [...selectedCardKeys.value, key]
}

function firstAvailable(keys: string[]): string[] {
  const available = new Set(cards.map((card) => card.key))
  return keys.filter((key) => available.has(key))
}

function dailyPosterKeys(limit = 5): string[] {
  return cards
    .filter((card) => card.key.startsWith('daily-poster-'))
    .slice(0, limit)
    .map((card) => card.key)
}

function handbookKeys(limit = 2): string[] {
  return cards
    .filter((card) => card.key.startsWith('handbook-day-'))
    .slice(0, limit)
    .map((card) => card.key)
}

function recommendedCardKeys(): string[] {
  let handbookCount = 0
  const handbookLimit = trip.days.length <= 2 ? 2 : 0
  let dailyPosterCount = 0
  const dailyPosterLimit = Math.min(5, trip.days.filter((day) => day.stops.some((stop) => stop.name.trim())).length)
  return cards
    .filter((card) => {
      if (BASE_RECOMMENDED_CARD_KEYS.includes(card.key)) return true
      if (card.key.startsWith('daily-poster-')) {
        if (dailyPosterCount >= dailyPosterLimit) return false
        dailyPosterCount++
        return true
      }
      if (!card.key.startsWith('handbook-day-')) return false
      if (handbookCount >= handbookLimit) return false
      handbookCount++
      return true
    })
    .map((card) => card.key)
}

function syncRecommendedCardSelection(): void {
  if (selectedCardPreset.value === 'custom') return
  if (selectedCardPreset.value === 'recommended') {
    selectedCardKeys.value = recommendedCardKeys()
    return
  }
  selectedCardKeys.value = cardSuiteKeys(selectedCardPreset.value)
}

function selectAllCards(): void {
  selectedCardPreset.value = 'custom'
  selectedCardKeys.value = cards.map((card) => card.key)
}

function selectRecommendedCards(): void {
  selectedCardPreset.value = 'recommended'
  selectedCardKeys.value = recommendedCardKeys()
}

function cardSuiteKeys(id: Exclude<CardPresetId, 'recommended' | 'custom'>): string[] {
  if (id === 'daily') {
    return firstAvailable(['route-real', 'route-by-day', ...dailyPosterKeys(), 'timeline', 'packing'])
  }
  if (id === 'share') {
    return firstAvailable([...dailyPosterKeys(), ...handbookKeys(), 'photo-timeline', 'food'])
  }
  return firstAvailable(['route-real', 'route-by-day', 'multi-route', 'poi', 'subway'])
}

function selectCardSuite(id: Exclude<CardPresetId, 'recommended' | 'custom'>): void {
  selectedCardPreset.value = id
  selectedCardKeys.value = cardSuiteKeys(id)
}

function selectedCardIndexes(): number[] {
  return cards
    .map((card, index) => (selectedCardKeys.value.includes(card.key) ? index : -1))
    .filter((index) => index >= 0)
}
function cardGroupLabel(group: string): string {
  if (group === 'core') return '自用'
  if (group === 'map') return '地图'
  if (group === 'share') return '分享'
  return '扩展'
}
// 每张卡的自定义底图临时路径（下标 → 路径）；未设置则用内置水彩主题
const cardBgs = ref<Record<number, string>>({})
const regenerating = ref(false)
const newTag = ref('')
const editingBody = ref(false)
// 必吃美食的「必点菜」本地编辑态：dishes(string[])↔ 顿号拼接串，失焦时拆回数组
const foodDishesStr = ref<string[]>([])
watch(
  () => trip.food,
  (foods) => {
    foodDishesStr.value = (foods ?? []).map((f) => (f.dishes ?? []).join('、'))
  },
  { immediate: true, deep: true },
)
function commitFoodDishes(i: number): void {
  const parts = (foodDishesStr.value[i] || '')
    .split(/[、,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
  updateFood(i, { dishes: parts })
}

async function onPickBg(i: number): Promise<void> {
  try {
    const path = await chooseImage()
    cardBgs.value = { ...cardBgs.value, [i]: path }
    await renderAll(trip, instance, cardBgs.value)
  } catch {
    /* 用户取消选图 */
  }
}
function onClearBg(i: number): void {
  const next = { ...cardBgs.value }
  delete next[i]
  cardBgs.value = next
  void renderAll(trip, instance, cardBgs.value)
}

function onDateChange(e: { detail: { value: string } }): void {
  aiDepartureDate.value = e.detail.value
}

function setGuideStyleChoice(style: GuideStyle): void {
  trip.guideStyle = style
  markDirty()
  if (rendered.value) {
    void renderAll(trip, instance, cardBgs.value)
  }
}

function setDayMood(dayId: string, mood: DayMood): void {
  const day = trip.days.find((item) => item.id === dayId)
  if (!day) return
  day.dayMood = mood
  markDirty()
}

/** 编辑后把数据重新渲染进攻略图（跨城段→路线规划图，出行清单→出行清单卡）*/
async function onApplyToCards(): Promise<void> {
  if (regenerating.value) return
  regenerating.value = true
  uni.showLoading({ title: '更新中…', mask: true })
  let ok = false
  try {
    await renderAll(trip, instance, cardBgs.value)
    ok = true
  } catch {
    /* 忽略，下方按 ok 给 toast */
  } finally {
    uni.hideLoading()
    regenerating.value = false
  }
  uni.showToast({ title: ok ? '已更新攻略图' : '更新失败，请重试', icon: ok ? 'success' : 'none' })
}

// 跨城段数字字段：本地字符串态（与 input v-model 的字符串一致），失焦换算提交。
// 与 codebase 的 local-ref + @blur 模式一致，避开 mp 下 number input 的类型/光标问题。
const durHoursStr = ref('0')
const durMinsStr = ref('0')
const distKmStr = ref('0')
watch(
  () => trip.intercity,
  (ic) => {
    if (!ic) return
    durHoursStr.value = String(Math.floor(ic.durationMin / 60))
    durMinsStr.value = String(ic.durationMin % 60)
    distKmStr.value = String(Math.round(ic.distanceM / 1000))
  },
  { immediate: true, deep: true },
)
function commitDur(): void {
  const ic = trip.intercity
  if (!ic) return
  const h = Math.max(0, Math.round(Number(durHoursStr.value) || 0))
  const m = Math.max(0, Math.min(59, Math.round(Number(durMinsStr.value) || 0)))
  updateIntercity({ durationMin: h * 60 + m })
}

/** 分钟 → 「X 小时 Y 分」/「Y 分钟」 */
function fmtMin(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  const r = m % 60
  return h > 0 ? `${h} 小时 ${r} 分` : `${r} 分钟`
}
/** 跨城耗时提示：明确「单程」，往返再给出全程，避免被当成往返总时长 */
const durHint = computed(() => {
  const ic = trip.intercity
  if (!ic) return ''
  return ic.roundTrip
    ? `即单程 ${fmtMin(ic.durationMin)} · 往返约 ${fmtMin(ic.durationMin * 2)}`
    : `即 ${fmtMin(ic.durationMin)}（单程）`
})
function commitDist(): void {
  const km = Math.max(0, Math.round(Number(distKmStr.value) || 0))
  updateIntercity({ distanceM: km * 1000 })
}

/**
 * 行程结构（天/站的增删与顺序）变化时，若攻略图已生成则自动重画。
 * 修复 WeChat canvas type="2d" 的已知行为：插入新 DOM（添加一天）触发大幅 reflow，
 * 已绘制的 canvas 会被系统清空，滚回来就是「文案被遮盖/空白」；同时让新天/新站及时上地图。
 * 仅监听 id+顺序签名，文本/耗时编辑不触发（避免逐键重画）。
 */
let renderTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => trip.days.map((d) => d.id + ':' + d.stops.map((s) => s.id).join(',')).join('|'),
  () => {
    if (!rendered.value) return
    if (renderTimer) clearTimeout(renderTimer)
    renderTimer = setTimeout(() => {
      void renderAll(trip, instance, cardBgs.value)
    }, 400)
  },
)

onLoad((query) => {
  const raw = query?.share
  pendingShareCode.value = Array.isArray(raw) ? String(raw[0] ?? '') : String(raw ?? '')
})

onShareAppMessage(() => ({
  title: trip.title || '旅游攻略',
  path: lastSharePath.value || '/pages/travel/index',
}))

onMounted(() => {
  const share = pendingShareCode.value.trim()
  if (share) {
    shareCodeInput.value = share
    void onImportShareCode(share)
  } else {
    loadFromStorage()
  }
})

function onSave(): void {
  saveToStorage()
  uni.showToast({ title: '已保存草稿', icon: 'success' })
}

async function onCloudSave(): Promise<void> {
  if (cloudSaving.value) return
  cloudSaving.value = true
  uni.showLoading({ title: '云保存中…', mask: true })
  try {
    const result = await saveTripToCloud()
    if (!result.ok || !result.code) {
      uni.showToast({ title: result.error || '云保存失败', icon: 'none' })
      return
    }
    lastShareCode.value = result.code
    lastSharePath.value = result.sharePath || `/pages/travel/index?share=${result.code}`
    uni.setClipboardData({
      data: result.code,
      success: () => uni.showToast({ title: '已保存并复制分享码', icon: 'success' }),
    })
  } finally {
    uni.hideLoading()
    cloudSaving.value = false
  }
}

function onCopyShareCode(): void {
  const code = lastShareCode.value.trim()
  if (!code) {
    uni.showToast({ title: '请先云保存', icon: 'none' })
    return
  }
  uni.setClipboardData({
    data: code,
    success: () => uni.showToast({ title: '分享码已复制', icon: 'success' }),
  })
}

async function onImportShareCode(code = shareCodeInput.value): Promise<void> {
  const share = code.trim()
  if (!share) {
    uni.showToast({ title: '请输入分享码', icon: 'none' })
    return
  }
  const confirmed = await confirmImportShare()
  if (!confirmed) return
  uni.showLoading({ title: '导入中…', mask: true })
  try {
    const result = await loadSharedTrip(share)
    if (!result.ok) {
      uni.showToast({ title: result.error || '导入失败', icon: 'none' })
      return
    }
    lastShareCode.value = share
    lastSharePath.value = `/pages/travel/index?share=${share}`
    shareCodeInput.value = ''
    saveToStorage()
    if (rendered.value) {
      await renderAll(trip, instance, cardBgs.value)
      syncRecommendedCardSelection()
    }
    uni.showToast({ title: '已导入行程', icon: 'success' })
  } finally {
    uni.hideLoading()
  }
}

async function onPlan(): Promise<void> {
  if (planning.value) return
  if (!aiDestination.value.trim()) {
    uni.showToast({ title: '请填目的地', icon: 'none' })
    return
  }
  planning.value = true
  planError.value = ''
  release()
  // AI 联网规划可能要 10-60s，给全屏 loading（mask 防误点）让用户知道在跑
  uni.showLoading({ title: 'AI 联网规划中…', mask: true })
  try {
    const r = await planWithAi({
      origin: aiOrigin.value.trim(),
      destination: aiDestination.value.trim(),
      travelMode: aiMode.value,
      intensity: aiIntensity.value,
      days: aiDays.value,
      dailyHours: aiHoursPerDay.value.slice(),
      roundTrip: aiRoundTrip.value,
      preferences: aiPreferences.value.trim(),
      departureDate: aiDepartureDate.value.trim(),
      sights: aiSights.value.trim(),
      foods: aiFoods.value.trim(),
    })
    if (r.ok) {
      uni.hideLoading()
      uni.showToast({ title: `已生成 ${trip.days.length} 天行程`, icon: 'success' })
      await nextTick()
      await renderAll(trip, instance, cardBgs.value)
      syncRecommendedCardSelection()
      dirty.value = false
    } else {
      showPlanFailed(r.error)
    }
  } catch (e) {
    showPlanFailed(e instanceof Error ? e.message : '')
  } finally {
    planning.value = false
  }
}

/** AI 规划失败的友好提示：识别限流/鉴权/超时给更贴切文案，其余按「繁忙/网络」处理并附原始原因 */
function showPlanFailed(detail?: string): void {
  const d = (detail || '').trim()
  const isTimeout = /timeout|超时|abort/i.test(d)
  const isRateLimit = /频繁|429/.test(d)
  const isAuth = /API Key|未授权|401/.test(d)
  let reason: string
  if (isRateLimit) {
    planError.value = '操作太频繁'
    reason = '刚才点得太快啦，接口被限流了，稍等几秒再点「AI 生成攻略」。'
  } else if (isAuth) {
    planError.value = '接口鉴权失败'
    reason = '接口鉴权失败（API Key 缺失或无效），请检查小程序配置。'
  } else if (isTimeout) {
    planError.value = 'AI 规划超时，请重试'
    reason = 'AI 规划超时了——联网搜索偶有波动，再点一次「AI 生成攻略」通常就好。'
  } else {
    planError.value = d || '规划失败'
    reason = '可能是网络不稳定或 AI 当前繁忙，请稍后点「AI 生成攻略」重试。'
  }
  uni.hideLoading()
  uni.showModal({
    title: '规划未能完成',
    content: reason + (d && !isRateLimit && !isAuth && !isTimeout ? `\n（${d}）` : ''),
    showCancel: false,
    confirmText: '知道了',
  })
}

async function onGenerate(): Promise<void> {
  if (regenerating.value) return
  const totalStops = trip.days.reduce((sum, d) => sum + d.stops.length, 0)
  if (totalStops === 0) {
    uni.showToast({ title: '请先添加至少一个地点', icon: 'none' })
    return
  }
  regenerating.value = true
  uni.showLoading({ title: '生成攻略图中…', mask: true })
  let ok = false
  let errMsg = ''
  try {
    await renderAll(trip, instance, cardBgs.value)
    syncRecommendedCardSelection()
    dirty.value = false
    ok = true
  } catch (e) {
    errMsg = e instanceof Error ? e.message : '生成失败'
  } finally {
    uni.hideLoading()
    regenerating.value = false
  }
  uni.showToast({
    title: ok ? `已生成 ${cards.length} 张攻略图` : errMsg || '生成失败',
    icon: ok ? 'success' : 'none',
  })
}

async function onSaveOne(index: number): Promise<void> {
  await saveOne(index, instance)
}

async function onSaveAll(): Promise<void> {
  const indexes = selectedCardIndexes()
  if (indexes.length === 0) {
    uni.showToast({ title: '请先选择要保存的图', icon: 'none' })
    return
  }
  const ok = await confirmSaveCards(indexes.map((i) => cards[i]?.label).filter(Boolean))
  if (!ok) return
  await saveAll(instance, indexes)
}

function confirmSaveCards(labels: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: '确认保存',
      content: `将保存 ${labels.length} 张：\n${labels.join('、')}`,
      confirmText: '保存',
      cancelText: '再看看',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    })
  })
}

function confirmImportShare(): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: '导入分享行程',
      content: '导入后会替换当前编辑中的行程，建议先保存草稿或云保存当前版本。',
      confirmText: '导入',
      cancelText: '取消',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    })
  })
}

function onCopyXhs(): void {
  const { title, body, tags } = trip.xhs
  const text = [title, body, tags.join(' ')].filter(Boolean).join('\n\n')
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '文案已复制', icon: 'success' }),
  })
}

function addXhsTag(): void {
  const v = newTag.value.trim()
  if (!v) return
  trip.xhs.tags.push(v.startsWith('#') ? v : '#' + v)
  newTag.value = ''
  markDirty()
}
function removeXhsTag(i: number): void {
  trip.xhs.tags.splice(i, 1)
  markDirty()
}

function onReorderDay(dayId: string): void {
  const result = reorderDayByRoute(dayId)
  uni.showToast({ title: result.message, icon: result.ok ? 'success' : 'none' })
}

async function onRefineDay(dayId: string): Promise<void> {
  if (refiningDayId.value) return
  refiningDayId.value = dayId
  uni.showLoading({ title: 'AI 重写当天…', mask: true })
  let error = ''
  let ok = false
  try {
    const result = await refineDayWithAi(dayId, { intensity: aiIntensity.value, dailyHours: 8 })
    if (!result.ok) {
      error = result.error || '请稍后重试'
    } else if (rendered.value) {
      await renderAll(trip, instance, cardBgs.value)
      dirty.value = true
      ok = true
    } else {
      dirty.value = true
      ok = true
    }
  } finally {
    uni.hideLoading()
    refiningDayId.value = ''
  }
  if (error) {
    uni.showModal({
      title: '重写失败',
      content: error,
      showCancel: false,
      confirmText: '知道了',
    })
  } else if (ok) {
    uni.showToast({ title: '已重写当天', icon: 'success' })
  }
}

async function onReplaceStop(dayId: string, stopId: string): Promise<void> {
  if (replacingStopId.value) return
  const day = trip.days.find((item) => item.id === dayId)
  const stop = day?.stops.find((item) => item.id === stopId)
  if (!day || !stop) {
    uni.showToast({ title: '未找到这个地点', icon: 'none' })
    return
  }
  if (stop.locked) {
    uni.showToast({ title: '先解锁再替换', icon: 'none' })
    return
  }
  const confirmed = await confirmReplaceStop(stop.name || `Day ${day.index} 的地点`)
  if (!confirmed) return

  replacingStopId.value = stopId
  uni.showLoading({ title: 'AI 替换地点…', mask: true })
  let error = ''
  let ok = false
  try {
    const result = await replaceStopWithAi(dayId, stopId, {
      intensity: aiIntensity.value,
      dailyHours: aiHoursPerDay.value[day.index - 1] ?? 8,
    })
    if (!result.ok) {
      error = result.error || '请稍后重试'
    } else if (rendered.value) {
      await renderAll(trip, instance, cardBgs.value)
      dirty.value = true
      ok = true
    } else {
      dirty.value = true
      ok = true
    }
  } finally {
    uni.hideLoading()
    replacingStopId.value = ''
  }
  if (error) {
    uni.showModal({
      title: '替换失败',
      content: error,
      showCancel: false,
      confirmText: '知道了',
    })
  } else if (ok) {
    uni.showToast({ title: '已替换地点', icon: 'success' })
  }
}

function confirmReplaceStop(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: '替换地点',
      content: `让 AI 替换「${name}」，当天其它地点会保留。`,
      confirmText: '替换',
      cancelText: '取消',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    })
  })
}
</script>

<style lang="scss" scoped>
.travel {
  // 底部留白须盖过固定 dock（dock 自身含 safe-area-inset-bottom），否则滚动到底会被遮挡
  padding: 32rpx 32rpx calc(240rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 24rpx;

  &__head {
    display: flex;
    flex-direction: column;
    gap: 24rpx;
  }

  &__ai {
    display: flex;
    flex-direction: column;
    gap: 18rpx;
  }

  &__ai-head {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
  }

  &__ai-input {
    padding: 20rpx 28rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-body;
    font-weight: 600;
  }

  &__ai-place {
    display: flex;
    gap: 12rpx;
  }

  &__ai-place-input {
    min-width: 0;
    flex: 1;
    padding: 20rpx 28rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-body;
    font-weight: 600;
  }

  &__ai-place-btn {
    flex-shrink: 0;
    min-width: 108rpx;
    padding: 0 20rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: $radius-md;
    background-color: $color-primary;
    color: #ffffff;
    font-size: $font-body;
    font-weight: 700;
  }

  &__ai-candidates {
    margin-top: -6rpx;
    display: flex;
    flex-direction: column;
    border: 2rpx solid $color-border;
    border-radius: $radius-md;
    overflow: hidden;
    background-color: #ffffff;
  }

  &__ai-candidate {
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    padding: 16rpx 22rpx;
    border-bottom: 2rpx solid $color-border;

    &:last-child {
      border-bottom: none;
    }
  }

  &__ai-cand-name {
    font-size: $font-body;
    color: $color-text;
    font-weight: 700;
  }

  &__ai-cand-addr {
    font-size: $font-caption;
    color: $color-text-secondary;
  }

  &__modes {
    display: flex;
    gap: 12rpx;
  }

  &__mode {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4rpx;
    padding: 14rpx 0;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    color: $color-text-secondary;

    &--active {
      border-color: $color-primary;
      background-color: #fff3e6;
      color: $color-primary-dark;
      font-weight: 600;
    }
  }

  &__mode-icon {
    font-size: 40rpx;
  }

  &__mode-label {
    font-size: $font-caption;
  }

  &__intensity {
    display: flex;
    flex-direction: column;
    gap: 10rpx;
  }

  &__intensity-options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12rpx;
  }

  &__intensity-item {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    padding: 16rpx 12rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
  }

  &__intensity-item--active {
    border-color: $color-primary;
    background-color: #fff3e6;
  }

  &__intensity-label {
    font-size: $font-body;
    color: $color-text;
    font-weight: 700;
    text-align: center;
  }

  &__intensity-hint {
    font-size: 22rpx;
    color: $color-text-secondary;
    line-height: 1.3;
    text-align: center;
  }

  &__ai-row {
    display: flex;
    gap: 32rpx;
  }

  &__ai-num {
    display: flex;
    flex-direction: column;
    gap: 8rpx;
  }

  &__ai-stepper {
    display: flex;
    align-items: center;
    border: 2rpx solid $color-border;
    border-radius: $radius-md;
    overflow: hidden;
  }

  &__ai-step {
    width: 64rpx;
    height: 64rpx;
    line-height: 64rpx;
    text-align: center;
    background-color: $color-bg;
    color: $color-primary-dark;
    font-size: 36rpx;
  }

  &__ai-step-val {
    min-width: 72rpx;
    text-align: center;
    font-size: $font-body;
    font-weight: 600;
  }

  &__ai-stepper--sm {
    .travel__ai-step {
      width: 48rpx;
      height: 48rpx;
      line-height: 48rpx;
      font-size: 30rpx;
    }

    .travel__ai-step-val {
      min-width: 56rpx;
      font-size: $font-caption;
    }
  }

  &__ai-seg {
    display: flex;
    border: 2rpx solid $color-border;
    border-radius: $radius-md;
    overflow: hidden;
  }

  &__ai-seg-item {
    padding: 12rpx 28rpx;
    font-size: $font-caption;
    color: $color-text-secondary;
    background-color: $color-bg;
  }

  &__ai-seg-item--active {
    background-color: $color-primary;
    color: #ffffff;
    font-weight: 600;
  }

  &__ai-hours {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
  }

  &__ai-hours-list {
    display: flex;
    flex-wrap: wrap;
    gap: 14rpx 18rpx;
  }

  &__ai-hour {
    display: flex;
    align-items: center;
    gap: 10rpx;
  }

  &__ai-hour-lab {
    font-size: $font-caption;
    color: $color-text-secondary;
    font-weight: 600;
  }

  &__ai-pref {
    width: 100%;
    box-sizing: border-box;
    padding: 16rpx 24rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-body;
    // auto-height 只随「内容」增高、不随 placeholder，故给够两行高度让长占位文完整显示
    min-height: 132rpx;
  }

  &__ai-err {
    color: #d9534f;
  }

  &__ai-go {
    padding: 20rpx 0;
    font-size: $font-body;
  }

  &__title-input {
    padding: 20rpx 28rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: 36rpx;
    font-weight: 700;
  }

  &__ai-style {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
  }

  &__style-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12rpx;
  }

  &__style-item {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    padding: 16rpx 18rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
  }

  &__style-item--active {
    border-color: $color-primary;
    background-color: #fff3e6;
  }

  &__style-label {
    font-size: $font-body;
    color: $color-text;
    font-weight: 700;
  }

  &__style-hint {
    font-size: 22rpx;
    color: $color-text-secondary;
    line-height: 1.3;
  }

  &__cloud {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
  }

  &__cloud-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18rpx;
  }

  &__cloud-save {
    flex-shrink: 0;
    padding: 12rpx 24rpx;
    font-size: $font-caption;
    font-weight: 700;
    border-radius: $radius-md;
  }

  &__cloud-code {
    display: flex;
    align-items: center;
    gap: 12rpx;
    padding: 14rpx 18rpx;
    border-radius: $radius-md;
    background-color: #fff8ef;
    border: 2rpx solid #ead6bf;
  }

  &__cloud-code-label {
    font-size: $font-caption;
    color: $color-text-secondary;
  }

  &__cloud-code-val {
    flex: 1;
    min-width: 0;
    font-size: $font-body;
    color: $color-primary-dark;
    font-weight: 800;
    letter-spacing: 1rpx;
  }

  &__cloud-copy {
    flex-shrink: 0;
    color: $color-primary;
    font-size: $font-caption;
    font-weight: 700;
  }

  &__cloud-import {
    display: flex;
    gap: 12rpx;
  }

  &__cloud-input {
    flex: 1;
    min-width: 0;
    padding: 18rpx 22rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-body;
  }

  &__cloud-import-btn {
    flex-shrink: 0;
    padding: 16rpx 26rpx;
    font-size: $font-caption;
    font-weight: 700;
    border-radius: $radius-md;
  }

  &__review {
    display: flex;
    flex-direction: column;
    gap: 14rpx;
  }

  &__review-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16rpx;
  }

  &__review-status {
    flex-shrink: 0;
    padding: 8rpx 18rpx;
    border-radius: 999rpx;
    font-size: $font-caption;
    font-weight: 700;
  }

  &__review-status--good {
    background-color: #edf8ef;
    color: #2f7d46;
  }

  &__review-status--info {
    background-color: #fff3e6;
    color: $color-primary-dark;
  }

  &__review-status--warn {
    background-color: #fff0ee;
    color: #d9534f;
  }

  &__review-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12rpx;
  }

  &__review-metric {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    padding: 16rpx 12rpx;
    border-radius: $radius-md;
    background-color: #fff8ef;
    border: 2rpx solid #ead6bf;
  }

  &__review-metric-val {
    font-size: 34rpx;
    font-weight: 800;
    color: $color-primary-dark;
    text-align: center;
  }

  &__review-metric-label {
    font-size: 22rpx;
    color: $color-text-secondary;
    text-align: center;
  }

  &__review-item {
    display: flex;
    align-items: flex-start;
    gap: 14rpx;
    padding: 14rpx 16rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
  }

  &__review-mark {
    flex-shrink: 0;
    width: 34rpx;
    height: 34rpx;
    line-height: 34rpx;
    border-radius: 50%;
    text-align: center;
    font-size: 22rpx;
    font-weight: 700;
  }

  &__review-mark--warn {
    color: #ffffff;
    background-color: #d9534f;
  }

  &__review-mark--info {
    color: #ffffff;
    background-color: $color-primary;
  }

  &__review-text {
    flex: 1;
    min-width: 0;
    font-size: $font-caption;
    color: $color-text-secondary;
    line-height: 1.55;
  }

  &__day {
    display: flex;
    flex-direction: column;
    gap: 24rpx;
  }

  &__day-head {
    display: flex;
    align-items: center;
    gap: 16rpx;
  }

  &__day-badge {
    padding: 8rpx 20rpx;
    border-radius: 999rpx;
    background-color: $color-primary;
    color: #ffffff;
    font-size: $font-caption;
    font-weight: 600;
    flex-shrink: 0;
  }

  &__day-title {
    flex: 1;
    padding: 12rpx 20rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-body;
  }

  &__day-del {
    color: #d9534f;
    font-size: $font-caption;
    flex-shrink: 0;
  }

  &__day-sort {
    color: $color-primary;
    font-size: $font-caption;
    font-weight: 600;
    flex-shrink: 0;
  }

  &__day-ai {
    color: $color-primary-dark;
    font-size: $font-caption;
    font-weight: 600;
    flex-shrink: 0;
  }

  &__day-ai--disabled {
    color: $color-text-secondary;
  }

  &__day-check {
    display: flex;
    flex-wrap: wrap;
    gap: 10rpx;
  }

  &__day-check-chip {
    padding: 6rpx 14rpx;
    border-radius: 999rpx;
    font-size: 22rpx;
    font-weight: 700;
  }

  &__day-check-chip--ok {
    background-color: #edf8ef;
    color: #2f7d46;
  }

  &__day-check-chip--info {
    background-color: #f4f5f7;
    color: $color-text-secondary;
  }

  &__day-check-chip--warn {
    background-color: #fff0ee;
    color: #d9534f;
  }

  &__day-handbook {
    display: flex;
    flex-direction: column;
    gap: 14rpx;
    padding: 18rpx;
    border-radius: $radius-md;
    background-color: #fff8ef;
    border: 2rpx solid #ead6bf;
  }

  &__day-summary {
    width: 100%;
    box-sizing: border-box;
    padding: 16rpx 22rpx;
    border-radius: $radius-md;
    background-color: #ffffff;
    border: 2rpx solid $color-border;
    font-size: $font-body;
    color: $color-text;
    min-height: 76rpx;
    line-height: 1.45;
  }

  &__day-moods {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10rpx;
  }

  &__day-mood {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2rpx;
    padding: 12rpx 10rpx;
    border-radius: $radius-md;
    background-color: #ffffff;
    border: 2rpx solid $color-border;
    color: $color-text-secondary;
  }

  &__day-mood--active {
    border-color: $color-primary;
    background-color: #fff3e6;
    color: $color-primary-dark;
  }

  &__day-mood-label {
    font-size: $font-caption;
    font-weight: 700;
    text-align: center;
  }

  &__day-mood-hint {
    font-size: 20rpx;
    line-height: 1.25;
    text-align: center;
  }

  &__stops {
    display: flex;
    flex-direction: column;
    gap: 20rpx;
  }

  &__add-stop {
    padding: 20rpx;
    border-radius: $radius-md;
    border: 2rpx dashed $color-border;
    text-align: center;
    color: $color-text-secondary;
    font-size: $font-body;
  }

  &__add-day {
    padding: 24rpx;
    border-radius: $radius-md;
    border: 2rpx dashed $color-primary;
    text-align: center;
    color: $color-primary;
    font-size: $font-body;
    font-weight: 600;
  }

  &__gallery {
    display: flex;
    flex-direction: column;
    gap: 24rpx;
  }

  &__gallery-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18rpx;
  }

  &__gallery-actions {
    display: flex;
    align-items: center;
    gap: 16rpx;
    flex-shrink: 0;
  }

  &__gallery-link {
    font-size: $font-caption;
    color: $color-primary;
    font-weight: 600;
    white-space: nowrap;
  }

  &__save-all {
    padding: 12rpx 28rpx;
    font-size: $font-caption;
    font-weight: 600;
    border-radius: $radius-md;
  }

  &__suite-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12rpx;
  }

  &__suite {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    padding: 16rpx 14rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
  }

  &__suite--active {
    border-color: $color-primary;
    background-color: #fff3e6;
  }

  &__suite-label {
    font-size: $font-caption;
    color: $color-text;
    font-weight: 800;
    text-align: center;
  }

  &__suite-hint {
    font-size: 20rpx;
    line-height: 1.25;
    color: $color-text-secondary;
    text-align: center;
  }

  &__gitem {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
  }

  &__gitem-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
  }

  &__gitem-title {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12rpx;
    flex: 1;
  }

  &__gitem-check {
    flex-shrink: 0;
    padding: 6rpx 14rpx;
    border-radius: 999rpx;
    border: 2rpx solid $color-border;
    background-color: $color-bg;
    color: $color-text-secondary;
    font-size: 22rpx;
    font-weight: 600;
  }

  &__gitem-check--active {
    border-color: $color-primary;
    background-color: #fff3e6;
    color: $color-primary-dark;
  }

  &__gitem-label {
    min-width: 0;
    font-size: $font-body;
    font-weight: 600;
    color: $color-text;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__gitem-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4rpx;
  }

  &__gitem-name {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10rpx;
  }

  &__gitem-group {
    flex-shrink: 0;
    padding: 3rpx 10rpx;
    border-radius: 999rpx;
    background-color: #fff3e6;
    color: $color-primary-dark;
    font-size: 20rpx;
    font-weight: 700;
  }

  &__gitem-hint {
    font-size: 22rpx;
    line-height: 1.35;
    color: $color-text-secondary;
    white-space: normal;
  }

  &__gitem-tools {
    display: flex;
    align-items: center;
    gap: 18rpx;
  }

  &__gitem-bg {
    color: $color-text-secondary;
    font-size: $font-caption;
  }

  &__gitem-bgclear {
    color: #d9534f;
    font-size: $font-caption;
  }

  &__gitem-save {
    color: $color-primary;
    font-size: $font-caption;
    font-weight: 600;
  }

  &__gcanvas {
    border-radius: $radius-md;
    border: 2rpx solid $color-border;
    background-color: #fff;
  }

  &__xhs {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
  }

  &__xhs-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__xhs-copy {
    padding: 12rpx 28rpx;
    font-size: $font-caption;
    font-weight: 600;
    border-radius: $radius-md;
  }

  &__xhs-title {
    font-size: 34rpx;
    font-weight: 700;
    color: $color-text;
  }

  &__xhs-body {
    font-size: $font-body;
    color: $color-text-secondary;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  &__xhs-body-wrap {
    width: 100%;
  }

  &__xhs-editbtn {
    align-self: flex-start;
    font-size: $font-caption;
    color: $color-primary;
    font-weight: 600;
    padding: 4rpx 8rpx;
  }

  &__xhs-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }

  &__xhs-tag {
    padding: 6rpx 18rpx;
    border-radius: 999rpx;
    background-color: #fff3e6;
    color: $color-primary-dark;
    font-size: $font-caption;
  }

  &__xhs-title-input {
    padding: 16rpx 24rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: 34rpx;
    font-weight: 700;
    color: $color-text;
  }

  &__xhs-body-input {
    width: 100%;
    box-sizing: border-box;
    padding: 16rpx 24rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-body;
    color: $color-text-secondary;
    line-height: 1.6;
    min-height: 160rpx;
  }

  &__xhs-tagrow {
    display: flex;
    align-items: center;
    gap: 8rpx;
  }

  &__xhs-tagdel {
    color: #d9534f;
    font-size: $font-caption;
    padding: 0 6rpx;
  }

  &__xhs-tagadd {
    padding: 14rpx 24rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx dashed $color-border;
    font-size: $font-caption;
    color: $color-text-secondary;
  }

  &__dock {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
    background-color: #fff8f0;
    border-top: 2rpx solid $color-border;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24rpx;
  }

  &__dock-hint {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__dock-actions {
    display: flex;
    flex-shrink: 0;
    gap: 16rpx;

    .btn-primary,
    .btn-ghost {
      padding: 10rpx 28rpx;
      font-size: $font-caption;
      font-weight: 600;
      line-height: 1.2;
      border-radius: $radius-md;
      white-space: nowrap; // 单行，且按钮按内容自适应宽度，避免「生成攻略图」被截成…
      text-align: center;
    }
  }

  &__dock-saveall {
    // 批量保存图：用主色描边+字色，比普通 ghost 更突出（导出是核心动作）
    color: $color-primary;
    border-color: $color-primary;
  }

  &__ai-date {
    display: flex;
    flex-direction: column;
    gap: 8rpx;
  }

  &__ai-date-val {
    padding: 18rpx 24rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-body;
    color: $color-text-secondary;
  }

  &__intercity {
    display: flex;
    flex-direction: column;
    gap: 18rpx;
  }

  &__intercity-head {
    display: flex;
    flex-direction: column;
    gap: 4rpx;
  }

  &__intercity-od {
    display: flex;
    align-items: center;
    gap: 16rpx;
  }

  &__intercity-input {
    flex: 1;
    padding: 16rpx 24rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-body;
    font-weight: 600;
  }

  &__intercity-arrow {
    font-size: 36rpx;
    color: $color-primary;
    flex-shrink: 0;
  }

  &__intercity-nums {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10rpx;
  }

  &__intercity-num {
    width: 88rpx;
    padding: 12rpx 16rpx;
    text-align: center;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-body;
    font-weight: 600;
  }

  &__intercity-dist {
    margin-left: 16rpx;
  }

  &__intercity-durhint {
    color: $color-primary-dark;
    font-weight: 600;
  }

  &__intercity-note {
    width: 100%;
    box-sizing: border-box;
    padding: 16rpx 24rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-body;
    min-height: 72rpx;
  }

  &__intercity-apply {
    padding: 16rpx 0;
    font-size: $font-body;
    text-align: center;
  }

  &__pack {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
  }

  &__pack-head {
    display: flex;
    flex-direction: column;
    gap: 4rpx;
  }

  &__pack-group {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
    padding: 18rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
  }

  &__pack-grouptitle {
    font-size: $font-body;
    font-weight: 600;
    color: $color-text;
  }

  &__pack-row {
    display: flex;
    align-items: center;
    gap: 16rpx;
  }

  &__pack-input {
    flex: 1;
    padding: 14rpx 22rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-body;
  }

  &__pack-op {
    font-size: $font-caption;
    color: $color-text-secondary;
    flex-shrink: 0;
  }

  &__pack-op--del {
    color: #d9534f;
  }

  &__pack-add {
    padding: 18rpx;
    border-radius: $radius-md;
    border: 2rpx dashed $color-border;
    text-align: center;
    color: $color-text-secondary;
    font-size: $font-body;
  }

  &__pack-apply {
    padding: 16rpx 0;
    font-size: $font-body;
    text-align: center;
  }

  &__food {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
    padding: 24rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
  }

  &__food-head {
    display: flex;
    flex-direction: column;
    gap: 4rpx;
  }

  &__food-row {
    display: flex;
    align-items: flex-start;
    gap: 14rpx;
    padding: 16rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
  }

  &__food-num {
    flex-shrink: 0;
    width: 44rpx;
    height: 44rpx;
    line-height: 44rpx;
    text-align: center;
    border-radius: 50%;
    background-color: $color-primary;
    color: #ffffff;
    font-size: $font-caption;
    font-weight: 600;
  }

  &__food-fields {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10rpx;
  }

  &__food-input {
    padding: 12rpx 18rpx;
    border-radius: $radius-md;
    background-color: #ffffff;
    border: 2rpx solid $color-border;
    font-size: $font-body;
  }

  &__food-input--name {
    font-weight: 600;
    color: $color-text;
  }

  &__food-ops {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12rpx;
    flex-shrink: 0;
  }

  &__food-op {
    font-size: $font-caption;
    color: $color-text-secondary;
  }

  &__food-op--del {
    color: #d9534f;
  }

  &__food-add {
    padding: 18rpx;
    border-radius: $radius-md;
    border: 2rpx dashed $color-border;
    text-align: center;
    color: $color-text-secondary;
    font-size: $font-body;
  }

  &__food-apply {
    padding: 16rpx 0;
    font-size: $font-body;
    text-align: center;
  }
}
</style>

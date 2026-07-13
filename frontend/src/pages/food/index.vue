<template>
  <view class="food">
    <view class="food__header">
      <view>
        <text class="food__eyebrow">10 秒帮你拍板</text>
        <text class="food__title">今天吃什么</text>
      </view>
    </view>

    <view class="food__account">
      <image
        v-if="accountUser?.avatarUrl"
        class="food__account-avatar"
        :src="accountUser.avatarUrl"
        mode="aspectFill"
      />
      <view class="food__account-copy">
        <text class="food__account-title">{{ accountUser?.nickname || (authToken ? '微信用户' : '未登录') }}</text>
        <text class="food__account-sub">{{ authToken ? '饭池和饭局已同步到数据库' : '登录后跨设备同步饭池和饭局' }}</text>
      </view>
      <view class="food__account-btn" @tap="openProfileEditor">{{ authToken ? '编辑资料' : '微信登录' }}</view>
    </view>

    <view v-if="profileEditing" class="food__profile">
      <button class="food__avatar-btn" open-type="chooseAvatar" @chooseavatar="onChooseAvatar">
        <image v-if="profileAvatarUrl" class="food__avatar-preview" :src="profileAvatarUrl" mode="aspectFill" />
        <text v-else>选头像</text>
      </button>
      <input
        class="food__nickname-input"
        v-model="profileNickname"
        type="nickname"
        placeholder="填写昵称"
      />
      <view class="food__profile-save" @tap="saveProfile">保存</view>
    </view>

    <view class="food__tabs">
      <view
        v-for="tab in tabs"
        :key="tab.id"
        class="food__tab"
        :class="{ 'food__tab--active': activeTab === tab.id }"
        @tap="switchTab(tab.id)"
      >
        <text class="food__tab-symbol">{{ tab.icon }}</text>
        <text>{{ tab.label }}</text>
      </view>
    </view>

    <view v-if="activeTab === 'nearby' || activeTab === 'group'" class="food__panel">
      <view class="food__section-head">
        <text class="food__section-title">选定地点</text>
        <text class="food__link" @tap="locateMe">当前位置</text>
      </view>
      <view class="food__place">
        <input
          class="food__place-input"
          v-model="placeQuery"
          placeholder="输入地点，如 武林门 / 公司 / 家"
          confirm-type="search"
          @input="onPlaceInput"
          @confirm="searchPlace"
        />
        <view class="food__place-btn" @tap="searchPlace">{{ placeSearching ? '搜索中' : '搜索' }}</view>
      </view>
      <view class="food__place-current">
        <text>{{ locationLabel }}</text>
      </view>
      <view v-if="placeCandidates.length > 0" class="food__place-results">
        <view
          v-for="candidate in placeCandidates"
          :key="candidateKey(candidate)"
          class="food__place-result"
          :class="{ 'food__place-result--active': isSelectedPlace(candidate) }"
          @tap="choosePlace(candidate)"
        >
          <view class="food__place-result-copy">
            <text class="food__place-result-title">{{ candidate.title || candidate.name }}</text>
            <text class="food__place-result-sub">{{ shopCandidateSubtitle(candidate) }}</text>
          </view>
          <text class="food__place-result-action">{{ isSelectedPlace(candidate) ? '已选' : '选择' }}</text>
        </view>
      </view>
      <view v-else-if="placeSearched && !placeSearching" class="food__place-empty">
        <text>没有找到匹配地点，可以换个关键词试试。</text>
      </view>

      <view class="food__section">
        <view class="food__section-head">
          <text class="food__section-title">随机范围</text>
          <text class="food__caption">最多 20 公里</text>
        </view>
        <view class="food__radius">
          <view
            v-for="item in radiusOptions"
            :key="item.value"
            class="food__radius-item"
            :class="{ 'food__radius-item--active': radiusM === item.value }"
            @tap="radiusM = item.value"
          >{{ item.label }}</view>
        </view>
      </view>

      <view class="food__section">
        <view class="food__section-head">
          <text class="food__section-title">今天想要</text>
          <text class="food__link" @tap="preferenceEditing = !preferenceEditing">{{ preferenceEditing ? '完成' : '编辑' }}</text>
        </view>
        <view class="food__tags">
          <view
            v-for="tag in preferences"
            :key="tag.id"
            class="food__tag"
            :class="{
              'food__tag--active': selectedPreferenceIds.includes(tag.id),
              'food__tag--editing': preferenceEditing,
            }"
            @tap="togglePreference(tag.id)"
          >
            <text>{{ tag.label }}</text>
            <text v-if="preferenceEditing" class="food__tag-close" @tap.stop="removePreference(tag.id)">×</text>
          </view>
        </view>

        <view v-if="preferenceEditing" class="food__add-tag">
          <input
            class="food__add-input"
            v-model="newPreferenceLabel"
            placeholder="新增偏好，如 日料 / 不吃辣"
            confirm-type="done"
            @confirm="addPreference"
          />
          <view class="food__mini-btn" @tap="addPreference">添加</view>
        </view>
      </view>

      <view v-if="activeTab === 'group'" class="food__section">
        <view class="food__room">
          <view class="food__room-code">
            <text>饭局 {{ groupRoomCode }}</text>
            <view class="food__room-actions">
              <text class="food__room-copy" @tap="newRoom">新饭局</text>
              <text class="food__room-divider">|</text>
              <text class="food__room-copy" @tap="saveFoodRoomRemote()">{{ roomSaving ? '保存中' : '保存' }}</text>
              <text class="food__room-divider">|</text>
              <text class="food__room-copy" @tap="copyRoomCode">复制</text>
            </view>
          </view>
          <view class="food__join-room">
            <input
              class="food__add-input"
              v-model="roomCodeInput"
              placeholder="输入饭局码加入"
              type="number"
              maxlength="4"
              confirm-type="done"
              @confirm="loadFoodRoomByInput"
            />
            <view class="food__mini-btn" @tap="loadFoodRoomByInput">加入</view>
          </view>
          <view class="food__member-row">
            <view v-for="member in groupMembers" :key="member.id" class="food__member">
              <text>{{ member.name.slice(0, 2) }}</text>
              <text v-if="groupMembers.length > 1" class="food__member-remove" @tap.stop="removeGroupMember(member.id)">×</text>
            </view>
          </view>
          <view class="food__add-member">
            <input
              class="food__add-input"
              v-model="newMemberName"
              placeholder="添加参与人，如 小梁"
              confirm-type="done"
              @confirm="addGroupMember"
            />
            <view class="food__mini-btn" @tap="addGroupMember">添加</view>
          </view>
        </view>

        <view class="food__section-head food__section-head--inner">
          <text class="food__section-title">大家不想吃</text>
          <text class="food__caption">{{ selectedGroupAvoidLabels.length }} 项避开</text>
        </view>
        <view class="food__tags">
          <view
            v-for="tag in groupAvoidOptions"
            :key="tag.id"
            class="food__tag"
            :class="{ 'food__tag--active': selectedGroupAvoidIds.includes(tag.id) }"
            @tap="toggleGroupAvoid(tag.id)"
          >
            <text>{{ tag.label }}</text>
          </view>
        </view>
        <view class="food__add-tag">
          <input
            class="food__add-input"
            v-model="newAvoidLabel"
            placeholder="新增避雷，如 不吃鱼"
            confirm-type="done"
            @confirm="addGroupAvoid"
          />
          <view class="food__mini-btn" @tap="addGroupAvoid">添加</view>
        </view>
      </view>

      <view class="food__decide" :class="{ 'food__decide--loading': deciding }" @tap="decideFood">
        <view>
          <text class="food__decide-title">{{ decideTitle }}</text>
          <text class="food__decide-sub">{{ decideHint }}</text>
        </view>
        <text class="food__decide-arrow">→</text>
      </view>
      <view v-if="deciding" class="food__draw">
        <view class="food__draw-wheel">
          <view class="food__draw-ring"></view>
          <text class="food__draw-core">抽</text>
        </view>
        <view class="food__draw-copy">
          <text class="food__draw-stage">{{ drawStage }}</text>
          <text class="food__draw-name">{{ drawRollingName }}</text>
          <view class="food__draw-progress">
            <view class="food__draw-progress-bar" :style="{ width: drawProgress + '%' }"></view>
          </view>
          <text class="food__draw-hint">{{ drawHint }}</text>
        </view>
      </view>
    </view>

    <view v-if="activeTab === 'ticket' && result" class="food__ticket">
      <view v-if="deciding" class="food__draw food__draw--ticket">
        <view class="food__draw-wheel">
          <view class="food__draw-ring"></view>
          <text class="food__draw-core">抽</text>
        </view>
        <view class="food__draw-copy">
          <text class="food__draw-stage">{{ drawStage }}</text>
          <text class="food__draw-name">{{ drawRollingName }}</text>
          <view class="food__draw-progress">
            <view class="food__draw-progress-bar" :style="{ width: drawProgress + '%' }"></view>
          </view>
          <text class="food__draw-hint">{{ drawHint }}</text>
        </view>
      </view>
      <template v-else>
        <view class="food__ticket-head">
          <text class="food__ticket-kicker">今日饭票</text>
          <text class="food__ticket-source">{{ result.scene === 'group' ? '饭局抽中' : result.source === 'nearby' ? '附近抽中' : '饭池抽中' }}</text>
        </view>
        <text class="food__shop-name">{{ result.name }}</text>
        <view class="food__meta">
          <text v-if="result.distanceM !== null" class="food__meta-chip">{{ formatDistance(result.distanceM) }}</text>
          <text class="food__meta-chip">{{ selectedPreferenceLabels.join(' / ') }}</text>
          <text
            class="food__meta-chip food__meta-chip--link"
            @tap="openResultLocation"
          >{{ result.lat !== null && result.lng !== null ? '地图导航' : '📍 绑定地点' }}</text>
        </view>
        <text class="food__reason">{{ result.reason }}</text>
        <text v-if="result.address" class="food__address">{{ result.address }}</text>
        <view class="food__ticket-actions">
          <view class="food__ticket-btn food__ticket-btn--primary" @tap="openResultLocation">{{ result.lat !== null && result.lng !== null ? '打开导航' : '绑定地点' }}</view>
          <view class="food__ticket-btn" @tap="decideFood">换一个</view>
          <view class="food__ticket-btn" @tap="saveResultToPool">加入饭池</view>
          <view class="food__ticket-btn" @tap="markAte">吃过了</view>
        </view>
      </template>
    </view>

    <view v-else-if="activeTab === 'ticket'" class="food__panel">
      <view class="food__empty">
        <text>还没有今日饭票，先去“附近”或“饭池”抽一个。</text>
      </view>
    </view>

    <view v-if="activeTab === 'pool'" class="food__panel">
      <view class="food__pool-location">
        <view class="food__pool-location-copy">
          <text class="food__pool-location-kicker">当前搜索位置</text>
          <text class="food__pool-location-text">{{ poolLocationText }}</text>
        </view>
        <view class="food__pool-location-actions">
          <text class="food__pool-location-action" @tap="locateMe">定位</text>
          <text class="food__pool-location-action" @tap="openNearbyLocationSetup">{{ poolLocationActionText }}</text>
        </view>
      </view>
      <view class="food__section-head">
        <text class="food__section-title">我的饭池</text>
        <text class="food__caption">{{ activePoolGroupCountText }}</text>
      </view>
      <view class="food__tags">
        <view
          v-for="group in visiblePoolGroups"
          :key="group.id"
          class="food__tag"
          :class="{ 'food__tag--active': activePoolGroupId === group.id }"
          @tap="switchPoolGroup(group.id)"
          @longpress="managePoolGroup(group.id)"
        >
          <text>{{ group.name }}</text>
        </view>
        <view class="food__tag food__tag--add" @tap="addPoolGroup">
          <text>＋ 新建</text>
        </view>
      </view>
      <text class="food__caption food__caption--hint">长按分组可重命名或删除</text>
      <view class="food__decide food__decide--pool" :class="{ 'food__decide--loading': deciding }" @tap="decideFromPoolTab">
        <view>
          <text class="food__decide-title">{{ poolDecideTitle }}</text>
          <text class="food__decide-sub">{{ poolDecideSubText }}</text>
        </view>
        <text class="food__decide-arrow">→</text>
      </view>
      <view v-if="deciding" class="food__draw">
        <view class="food__draw-wheel">
          <view class="food__draw-ring"></view>
          <text class="food__draw-core">抽</text>
        </view>
        <view class="food__draw-copy">
          <text class="food__draw-stage">{{ drawStage }}</text>
          <text class="food__draw-name">{{ drawRollingName }}</text>
          <view class="food__draw-progress">
            <view class="food__draw-progress-bar" :style="{ width: drawProgress + '%' }"></view>
          </view>
          <text class="food__draw-hint">{{ drawHint }}</text>
        </view>
      </view>
      <view class="food__pool-form">
        <input
          class="food__pool-input"
          v-model="newShopName"
          placeholder="店名，如 楼下牛肉面"
          @input="onShopNameInput"
        />
        <view v-if="shopSearching || shopCandidates.length > 0 || shopSearched" class="food__place-results">
          <view v-if="shopSearching" class="food__place-current">搜索地点中…</view>
          <view v-else-if="shopSearched && shopCandidates.length === 0" class="food__place-current">{{ shopSearchEmptyText }}</view>
          <view
            v-for="candidate in shopCandidates"
            :key="candidateKey(candidate)"
            class="food__place-result"
            :class="{ 'food__place-result--active': isPickedShop(candidate) }"
            @tap="chooseShopCandidate(candidate)"
          >
            <view class="food__place-result-copy">
              <text class="food__place-result-title">{{ candidate.title || candidate.name }}</text>
              <text class="food__place-result-sub">{{ shopCandidateSubtitle(candidate) }}</text>
            </view>
            <text class="food__place-result-action">{{ isPickedShop(candidate) ? '已选' : '带定位' }}</text>
          </view>
        </view>
        <text v-if="pickedShopCoords" class="food__caption food__caption--hint">已绑定定位，加入后可直接导航</text>
        <input class="food__pool-input" v-model="newShopNote" placeholder="备注，如 快速 / 人均 30 / 适合午餐" />
        <view class="food__pool-add" @tap="addPoolItem">{{ poolAddButtonText }}</view>
      </view>

      <view v-if="currentGroupItems.length === 0" class="food__empty">
        <text>{{ poolEmptyText }}</text>
      </view>

      <view v-else class="food__pool-list">
        <view v-for="item in currentGroupItems" :key="item.id" class="food__pool-item">
          <view class="food__pool-copy">
            <view class="food__pool-nameline">
              <text class="food__pool-name">{{ item.name }}</text>
              <text
                v-if="item.lat === null || item.lng === null"
                class="food__pool-badge"
                @tap.stop="bindPoolItem(item)"
              >未绑定</text>
            </view>
            <text class="food__pool-note">{{ item.note || '自定义店家' }}</text>
          </view>
          <view class="food__pool-delete" @tap="removePoolItem(item.id)">删</view>
        </view>
      </view>
    </view>

    <view v-if="history.length > 0" class="food__panel food__panel--last">
      <view class="food__section-head">
        <text class="food__section-title">最近吃过</text>
        <text class="food__link" @tap="clearHistory">清空</text>
      </view>
      <view class="food__history">
        <text v-for="item in history.slice(0, 6)" :key="item.id" class="food__history-chip">{{ item.name }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { computed, onMounted, onUnmounted, ref } from 'vue'

type SourceMode = 'nearby' | 'pool' | 'group'
type FoodTab = 'nearby' | 'ticket' | 'pool' | 'group'

interface PreferenceTag {
  id: string
  label: string
  /** 搜索用关键词；缺省时回退到 label。心情类标签（辣一点→川菜）的映射在这里显式声明。 */
  keyword?: string
}

interface FoodGroup {
  id: string
  name: string
}

interface FoodShop {
  id: string
  name: string
  note: string
  address: string
  lat: number | null
  lng: number | null
  distanceM: number | null
  source: SourceMode
  category?: string
  typecode?: string
  groupId?: string
}

interface FoodResult extends FoodShop {
  reason: string
  scene: SourceMode
}

interface NearbyItem {
  id: string
  name: string
  address: string
  distanceM: number
  lat: number
  lng: number
  category: string
  typecode: string
}

interface NearbyResponse {
  items: NearbyItem[]
}

interface GeocodeCandidate {
  name: string
  title: string
  address: string
  lng: number
  lat: number
  province: string
  city: string
  adcode: string
  distanceM?: number
}

interface GeocodeResponse {
  candidates: GeocodeCandidate[]
}

interface ReverseLocationResponse {
  address: string
  province: string
  city: string
  adcode: string
}

interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

interface FoodHistoryItem {
  id: string
  name: string
  at: number
}

interface GroupMember {
  id: string
  name: string
}

interface FoodRoomPayload {
  members: GroupMember[]
  avoids: PreferenceTag[]
  selectedAvoidIds: string[]
}

interface FoodRoomRecord {
  code: string
  updatedAt: string
  room: FoodRoomPayload
}

interface SaveFoodRoomResponse {
  code: string
  updatedAt: string
  sharePath: string
}

interface AccountUser {
  id: number
  openid: string
  nickname: string
  avatarUrl: string
}

interface LoginResponse {
  token: string
  expiresAt: string
  user: AccountUser
}

interface ProfileResponse {
  user: AccountUser
}

interface FoodMineResponse {
  preferences: PreferenceTag[]
  poolGroups: FoodGroup[]
  poolItems: FoodShop[]
  history: FoodHistoryItem[]
}

const API_BASE = (import.meta.env.VITE_API_BASE || 'http://127.0.0.1:9501').replace(/\/$/, '')
const API_KEY = import.meta.env.VITE_API_KEY || ''
const PREF_STORAGE_KEY = 'shuxia-food-preferences-v1'
const POOL_STORAGE_KEY = 'shuxia-food-pool-v1'
const POOL_GROUP_STORAGE_KEY = 'shuxia-food-pool-groups-v1'
const HISTORY_STORAGE_KEY = 'shuxia-food-history-v1'
const GROUP_STORAGE_KEY = 'shuxia-food-group-v1'
const AUTH_STORAGE_KEY = 'shuxia-food-auth-token-v1'
const USER_STORAGE_KEY = 'shuxia-food-auth-user-v1'

const DEFAULT_PREFERENCES: PreferenceTag[] = [
  { id: 'quick', label: '快速', keyword: '快餐' },
  { id: 'spicy', label: '辣一点', keyword: '川菜' },
  { id: 'cheap', label: '便宜', keyword: '快餐' },
  { id: 'warm', label: '热乎', keyword: '面馆' },
  { id: 'treat', label: '奖励自己', keyword: '美食' },
]

const DEFAULT_POOL_GROUP_ID = 'default'
const DEFAULT_POOL_GROUPS: FoodGroup[] = [{ id: DEFAULT_POOL_GROUP_ID, name: '我的饭池' }]

const DEFAULT_GROUP_AVOIDS: PreferenceTag[] = [
  { id: 'hotpot', label: '火锅' },
  { id: 'light', label: '轻食' },
  { id: 'fast', label: '快餐' },
  { id: 'japanese', label: '日料' },
  { id: 'bbq', label: '烧烤' },
]

const DRAW_MIN_DURATION_MS = 1400
const DRAW_REVEAL_DURATION_MS = 420
const DRAW_STAGES = ['筛选候选店', '避开最近吃过', '摇匀选择', '准备揭晓']
const DRAW_FALLBACK_NAMES = ['热乎面馆', '家常小炒', '附近好店', '人气餐馆', '今天的惊喜', '下饭小馆']

const radiusOptions = [
  { label: '500m', value: 500 },
  { label: '1km', value: 1000 },
  { label: '5km', value: 5000 },
  { label: '10km', value: 10000 },
  { label: '15km', value: 15000 },
  { label: '20km', value: 20000 },
]

const tabs: Array<{ id: FoodTab, label: string, icon: string }> = [
  { id: 'nearby', label: '附近', icon: '⌖' },
  { id: 'ticket', label: '饭票', icon: '◎' },
  { id: 'pool', label: '饭池', icon: '▦' },
  { id: 'group', label: '饭局', icon: '◇' },
]

const activeTab = ref<FoodTab>('nearby')
const sourceMode = ref<SourceMode>('nearby')
const radiusM = ref(1000)
const placeQuery = ref('')
const placeSearching = ref(false)
const placeSearched = ref(false)
const deciding = ref(false)
const drawStage = ref(DRAW_STAGES[0])
const drawRollingName = ref('正在找好吃的')
const drawProgress = ref(0)
const preferenceEditing = ref(false)
const newPreferenceLabel = ref('')
const newMemberName = ref('')
const newAvoidLabel = ref('')
const roomCodeInput = ref('')
const newShopName = ref('')
const newShopNote = ref('')
const locationLabel = ref('尚未选择地点')
const center = ref<{ lat: number, lng: number } | null>(null)
// 设备真实定位：center 会在输入/搜索时被清空，这个保留下来，让地点搜索能带上坐标按“离我近”排序。
const deviceLocation = ref<{ lat: number, lng: number } | null>(null)
const currentRegion = ref('')
const placeCandidates = ref<GeocodeCandidate[]>([])
const preferences = ref<PreferenceTag[]>([])
const selectedPreferenceIds = ref<string[]>([])
const poolItems = ref<FoodShop[]>([])
const poolGroups = ref<FoodGroup[]>(DEFAULT_POOL_GROUPS.slice())
const activePoolGroupId = ref<string>(DEFAULT_POOL_GROUP_ID)
const history = ref<FoodHistoryItem[]>([])
const result = ref<FoodResult | null>(null)
const groupRoomCode = ref(randomRoomCode())
const groupMembers = ref<GroupMember[]>([])
const groupAvoidOptions = ref<PreferenceTag[]>([])
const selectedGroupAvoidIds = ref<string[]>([])
const roomSaving = ref(false)
const pendingRoomCode = ref('')
const authToken = ref('')
const accountUser = ref<AccountUser | null>(null)
const profileEditing = ref(false)
const profileNickname = ref('')
const profileAvatarUrl = ref('')
// 无坐标自愈：查找/回写位置时的并发锁
const resolving = ref(false)
// 录入即搜索：饭池店名框的候选与已选坐标
const shopCandidates = ref<GeocodeCandidate[]>([])
const shopSearching = ref(false)
const shopSearched = ref(false)
const shopSearchError = ref('')
const pickedShopCoords = ref<{ lat: number, lng: number, address: string } | null>(null)
let shopSearchTimer: ReturnType<typeof setTimeout> | null = null
let drawTimer: ReturnType<typeof setInterval> | null = null
let shopSearchSeq = 0

const selectedPreferenceLabels = computed(() => {
  const selected = preferences.value.filter((tag) => selectedPreferenceIds.value.includes(tag.id)).map((tag) => tag.label)
  return selected.length > 0 ? selected : [preferences.value[0]?.label ?? '随便']
})

const selectedGroupAvoidLabels = computed(() => {
  return groupAvoidOptions.value
    .filter((tag) => selectedGroupAvoidIds.value.includes(tag.id))
    .map((tag) => tag.label)
})

const currentGroupItems = computed(() =>
  poolItems.value.filter((item) => (item.groupId || DEFAULT_POOL_GROUP_ID) === activePoolGroupId.value),
)

const visiblePoolGroups = computed(() => normalizePoolGroups(poolGroups.value))

const activePoolGroupName = computed(() => {
  const found = poolGroups.value.find((group) => group.id === activePoolGroupId.value)
  return readableText(found?.name, '我的饭池')
})

const activePoolGroupCountText = computed(() => `${currentGroupItems.value.length} 家店`)

const poolDecideTitle = computed(() => `从「${activePoolGroupName.value}」抽一个`)

const poolDecideSubText = computed(() =>
  currentGroupItems.value.length > 0
    ? `${currentGroupItems.value.length} 家自定义店，自动避开最近吃过`
    : '先录入常吃店家',
)

const poolAddButtonText = computed(() => `加入「${activePoolGroupName.value}」`)

const poolEmptyText = computed(() => `「${activePoolGroupName.value}」还是空的，先录入几家平时常吃的店。`)

const decideTitle = computed(() => {
  if (sourceMode.value === 'pool') return `从「${activePoolGroupName.value}」抽一个`
  if (sourceMode.value === 'group') return '生成饭局结果'
  return '帮我决定'
})

const decideHint = computed(() => {
  if (deciding.value) return '正在帮你筛选候选店'
  if (sourceMode.value === 'pool') {
    return currentGroupItems.value.length > 0 ? `${currentGroupItems.value.length} 家自定义店，自动避开最近吃过` : '先录入常吃店家'
  }
  if (sourceMode.value === 'group') {
    const source = center.value ? `${formatDistance(radiusM.value)} 附近` : '饭池'
    return `${groupMembers.value.length} 人参与，从${source}筛掉大家不想吃的`
  }
  return center.value ? `从 ${formatDistance(radiusM.value)} 内搜索 ${nearbyKeyword.value}` : '先选择地点或使用当前位置'
})

const drawHint = computed(() => {
  if (sourceMode.value === 'pool') {
    return `从「${activePoolGroupName.value}」里抽，最近吃过的会尽量避开`
  }
  if (sourceMode.value === 'group') {
    const avoidText = selectedGroupAvoidLabels.value.length > 0 ? `，避开 ${selectedGroupAvoidLabels.value.length} 项` : ''
    return `${groupMembers.value.length} 人饭局正在合并附近和饭池${avoidText}`
  }
  return center.value ? `${formatDistance(radiusM.value)} 内按“${selectedPreferenceLabels.value.join('、')}”筛选` : '先确认地点，再给你抽今日饭票'
})

const poolLocationText = computed(() => {
  const label = readableText(locationLabel.value, '')
  if (center.value && label !== '' && label !== '尚未选择地点') return label
  if (currentRegion.value !== '') return `${currentRegion.value}，未选具体位置`
  return '未选择位置，录入店名时会按关键词搜索'
})

const poolLocationActionText = computed(() => center.value ? '更换' : '设置')

const shopSearchEmptyText = computed(() =>
  shopSearchError.value !== ''
    ? shopSearchError.value
    : '没有搜到地点，可换个关键词或直接手动加入',
)

const nearbyKeyword = computed(() => {
  const tag = preferences.value.find((t) => selectedPreferenceIds.value.includes(t.id))
  return compactText(tag?.keyword || tag?.label || '').slice(0, 8) || '美食'
})

onMounted(() => {
  authToken.value = safeStorageGet<string>(AUTH_STORAGE_KEY, '')
  accountUser.value = safeStorageGet<AccountUser | null>(USER_STORAGE_KEY, null)
  loadPreferences()
  loadPoolGroups()
  loadPool()
  loadHistory()
  loadGroup()
  void syncFoodDataFromCloud()
  if (pendingRoomCode.value !== '') {
    loadFoodRoom(pendingRoomCode.value)
  }
})

onUnmounted(() => {
  stopDrawAnimation()
})

onLoad((query) => {
  const code = typeof query?.room === 'string' ? query.room : ''
  pendingRoomCode.value = code
})

function switchTab(tab: FoodTab): void {
  activeTab.value = tab
  if (tab === 'nearby') sourceMode.value = 'nearby'
  if (tab === 'pool') sourceMode.value = 'pool'
  if (tab === 'group') sourceMode.value = 'group'
}

function openNearbyLocationSetup(): void {
  activeTab.value = 'nearby'
  sourceMode.value = 'nearby'
}

async function loginWithWechatProfile(): Promise<void> {
  let profile: Record<string, unknown> = {}
  let profileSynced = true
  try {
    profile = await getWechatProfile()
  } catch (e) {
    profileSynced = false
    console.warn('[food] getUserProfile failed:', e)
  }

  try {
    await loginWithWechat(profile)
    await syncFoodDataFromCloud()
    uni.showToast({ title: profileSynced ? '资料已同步' : '饭池已同步', icon: 'success' })
  } catch (e) {
    uni.showToast({ title: e instanceof Error ? e.message : '微信登录失败', icon: 'none' })
  }
}

async function openProfileEditor(): Promise<void> {
  const ok = await ensureAccount()
  if (!ok) {
    uni.showToast({ title: '微信登录失败', icon: 'none' })
    return
  }
  profileNickname.value = accountUser.value?.nickname || ''
  profileAvatarUrl.value = accountUser.value?.avatarUrl || ''
  profileEditing.value = !profileEditing.value
}

function onChooseAvatar(event: { detail?: { avatarUrl?: string } }): void {
  const avatarUrl = event.detail?.avatarUrl || ''
  if (avatarUrl === '') return
  profileAvatarUrl.value = avatarUrl
}

async function saveProfile(): Promise<void> {
  const ok = await ensureAccount()
  if (!ok) {
    uni.showToast({ title: '请先微信登录', icon: 'none' })
    return
  }
  try {
    const data = await apiPost<ProfileResponse>('/api/auth/profile', {
      nickname: compactText(profileNickname.value),
      avatarUrl: profileAvatarUrl.value,
    })
    accountUser.value = data.user
    uni.setStorageSync(USER_STORAGE_KEY, data.user)
    profileEditing.value = false
    uni.showToast({ title: '资料已保存', icon: 'success' })
  } catch (e) {
    uni.showToast({ title: e instanceof Error ? e.message : '资料保存失败', icon: 'none' })
  }
}

async function ensureAccount(): Promise<boolean> {
  if (authToken.value !== '') return true
  try {
    await loginWithWechat({})
    return true
  } catch (e) {
    return false
  }
}

async function loginWithWechat(profile: Record<string, unknown>): Promise<void> {
  const code = await wxLoginCode()
  const data = await apiPost<LoginResponse>('/api/auth/wechat-login', { code, profile }, false)
  authToken.value = data.token
  accountUser.value = data.user
  uni.setStorageSync(AUTH_STORAGE_KEY, data.token)
  uni.setStorageSync(USER_STORAGE_KEY, data.user)
}

async function syncFoodDataFromCloud(): Promise<void> {
  const ok = await ensureAccount()
  if (!ok) return

  try {
    const data = await apiGet<FoodMineResponse>('/api/food/me', {})
    const hasRemote = data.preferences.length > 0 || (data.poolGroups?.length ?? 0) > 0 || data.poolItems.length > 0 || data.history.length > 0
    const hasLocal = preferences.value.length > 0 || poolItems.value.length > 0 || history.value.length > 0
    if (hasRemote) {
      if (data.preferences.length > 0) {
        preferences.value = normalizePreferences(data.preferences)
        if (!preferences.value.some((tag) => selectedPreferenceIds.value.includes(tag.id))) {
          selectedPreferenceIds.value = [preferences.value[0].id]
        }
        uni.setStorageSync(PREF_STORAGE_KEY, preferences.value)
      }
      poolGroups.value = normalizePoolGroups(data.poolGroups)
      poolItems.value = data.poolItems.map((item) => ({ ...item, groupId: item.groupId || DEFAULT_POOL_GROUP_ID }))
      history.value = data.history
      ensureActivePoolGroup()
      uni.setStorageSync(POOL_GROUP_STORAGE_KEY, poolGroups.value)
      uni.setStorageSync(POOL_STORAGE_KEY, poolItems.value)
      uni.setStorageSync(HISTORY_STORAGE_KEY, history.value)
    } else if (hasLocal) {
      await saveFoodDataRemote()
    }
  } catch (e) {
    // 云同步失败不阻断本地随机工具使用。
  }
}

async function saveFoodDataRemote(): Promise<void> {
  const ok = await ensureAccount()
  if (!ok) return

  try {
    poolGroups.value = normalizePoolGroups(poolGroups.value)
    const data = await apiPost<FoodMineResponse>('/api/food/me', {
      preferences: preferences.value,
      poolGroups: poolGroups.value,
      poolItems: poolItems.value,
      history: history.value,
    })
    if (data.preferences.length > 0) {
      preferences.value = normalizePreferences(data.preferences)
      uni.setStorageSync(PREF_STORAGE_KEY, preferences.value)
    }
    poolGroups.value = normalizePoolGroups(data.poolGroups)
    poolItems.value = data.poolItems.map((item) => ({ ...item, groupId: item.groupId || DEFAULT_POOL_GROUP_ID }))
    history.value = data.history
    ensureActivePoolGroup()
    uni.setStorageSync(POOL_GROUP_STORAGE_KEY, poolGroups.value)
    uni.setStorageSync(POOL_STORAGE_KEY, poolItems.value)
    uni.setStorageSync(HISTORY_STORAGE_KEY, history.value)
  } catch (e) {
    // 保存失败保留本地数据，下次操作再同步。
  }
}

function loadPreferences(): void {
  const saved = safeStorageGet<PreferenceTag[]>(PREF_STORAGE_KEY, [])
  preferences.value = Array.isArray(saved) && saved.length > 0 ? normalizePreferences(saved) : DEFAULT_PREFERENCES.slice()
  if (preferences.value.length === 0) {
    preferences.value = DEFAULT_PREFERENCES.slice(0, 1)
  }
  selectedPreferenceIds.value = [preferences.value[0].id]
}

function normalizePreferences(raw: PreferenceTag[]): PreferenceTag[] {
  const seen = new Set<string>()
  return raw
    .map((item): PreferenceTag => {
      const label = compactText(item.label).slice(0, 8)
      // 显式 keyword 优先；否则按 label 命中默认表补上映射（兼容旧数据里没有 keyword 的心情标签）；
      // 都没有就留空，读取时回退到 label 本身（自定义标签如「火锅」走这条）。
      const keyword =
        compactText(item.keyword || '').slice(0, 8) ||
        DEFAULT_PREFERENCES.find((d) => d.label === label)?.keyword ||
        ''
      const tag: PreferenceTag = { id: String(item.id || genId()), label }
      if (keyword !== '' && keyword !== label) {
        tag.keyword = keyword
      }
      return tag
    })
    .filter((item) => item.label !== '')
    .filter((item) => {
      const key = item.label.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function normalizePoolGroups(raw: unknown): FoodGroup[] {
  const seen = new Set<string>()
  const list = Array.isArray(raw) ? raw : []
  const normalized = list
    .map((item, index): FoodGroup | null => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const id = readableText(record.id, index === 0 ? DEFAULT_POOL_GROUP_ID : genId())
      const name = readableText(record.name, index === 0 ? '我的饭池' : '')
      if (id === '' || name === '') return null
      return { id, name: name.slice(0, 10) }
    })
    .filter((item): item is FoodGroup => item !== null)
    .filter((item) => {
      const key = item.id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  return normalized.length > 0 ? normalized : DEFAULT_POOL_GROUPS.slice()
}

function readableText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    const text = compactText(value)
    return text === '' ? fallback : text
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : fallback
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return readableText(record.name ?? record.label ?? record.title, fallback)
  }
  return fallback
}

function savePreferences(): void {
  uni.setStorageSync(PREF_STORAGE_KEY, preferences.value)
  void saveFoodDataRemote()
}

function togglePreference(id: string): void {
  selectedPreferenceIds.value = [id]
}

function addPreference(): void {
  const label = compactText(newPreferenceLabel.value).slice(0, 8)
  if (label === '') {
    uni.showToast({ title: '先输入偏好', icon: 'none' })
    return
  }
  if (preferences.value.some((item) => item.label === label)) {
    uni.showToast({ title: '这个偏好已存在', icon: 'none' })
    return
  }
  const tag = { id: genId(), label }
  preferences.value.push(tag)
  selectedPreferenceIds.value = [tag.id]
  newPreferenceLabel.value = ''
  savePreferences()
}

function removePreference(id: string): void {
  if (preferences.value.length <= 1) {
    uni.showToast({ title: '不能全部删除', icon: 'none' })
    return
  }
  preferences.value = preferences.value.filter((item) => item.id !== id)
  selectedPreferenceIds.value = selectedPreferenceIds.value.filter((item) => item !== id)
  if (selectedPreferenceIds.value.length === 0) {
    selectedPreferenceIds.value = [preferences.value[0].id]
  }
  savePreferences()
}

function loadPoolGroups(): void {
  const saved = safeStorageGet<FoodGroup[]>(POOL_GROUP_STORAGE_KEY, [])
  poolGroups.value = normalizePoolGroups(saved)
  ensureActivePoolGroup()
  uni.setStorageSync(POOL_GROUP_STORAGE_KEY, poolGroups.value)
}

function savePoolGroups(): void {
  poolGroups.value = normalizePoolGroups(poolGroups.value)
  uni.setStorageSync(POOL_GROUP_STORAGE_KEY, poolGroups.value)
  void saveFoodDataRemote()
}

// 保证当前选中分组仍存在，否则回落到第一个分组。
function ensureActivePoolGroup(): void {
  poolGroups.value = normalizePoolGroups(poolGroups.value)
  if (poolGroups.value.length === 0) {
    poolGroups.value = DEFAULT_POOL_GROUPS.slice()
  }
  if (!poolGroups.value.some((group) => group.id === activePoolGroupId.value)) {
    activePoolGroupId.value = poolGroups.value[0].id
  }
}

function loadPool(): void {
  const saved = safeStorageGet<FoodShop[]>(POOL_STORAGE_KEY, [])
  // 老数据没有 groupId，统一归入默认分组，保证向后兼容。
  poolItems.value = Array.isArray(saved)
    ? saved.map((item) => ({ ...item, groupId: item.groupId || DEFAULT_POOL_GROUP_ID }))
    : []
}

function savePool(): void {
  uni.setStorageSync(POOL_STORAGE_KEY, poolItems.value)
  void saveFoodDataRemote()
}

function switchPoolGroup(id: string): void {
  activePoolGroupId.value = id
}

function addPoolGroup(): void {
  uni.showModal({
    title: '新建饭池分组',
    editable: true,
    placeholderText: '如 公司午餐 / 家附近晚餐',
    success: (res) => {
      if (!res.confirm) return
      const name = compactText(res.content || '')
      if (name === '') {
        uni.showToast({ title: '分组名不能为空', icon: 'none' })
        return
      }
      if (poolGroups.value.some((group) => group.name === name)) {
        uni.showToast({ title: '已有同名分组', icon: 'none' })
        return
      }
      const group: FoodGroup = { id: genId(), name }
      poolGroups.value.push(group)
      activePoolGroupId.value = group.id
      savePoolGroups()
    },
  })
}

function renamePoolGroup(id: string): void {
  const target = poolGroups.value.find((group) => group.id === id)
  if (!target) return
  uni.showModal({
    title: '重命名分组',
    editable: true,
    content: target.name,
    success: (res) => {
      if (!res.confirm) return
      const name = compactText(res.content || '')
      if (name === '') {
        uni.showToast({ title: '分组名不能为空', icon: 'none' })
        return
      }
      if (poolGroups.value.some((group) => group.id !== id && group.name === name)) {
        uni.showToast({ title: '已有同名分组', icon: 'none' })
        return
      }
      target.name = name
      savePoolGroups()
    },
  })
}

function removePoolGroup(id: string): void {
  if (poolGroups.value.length <= 1) {
    uni.showToast({ title: '至少保留一个分组', icon: 'none' })
    return
  }
  const target = poolGroups.value.find((group) => group.id === id)
  if (!target) return
  const count = poolItems.value.filter((item) => (item.groupId || DEFAULT_POOL_GROUP_ID) === id).length
  uni.showModal({
    title: '删除分组',
    content: count > 0 ? `「${target.name}」里的 ${count} 家店会一起删除，确定吗？` : `确定删除「${target.name}」吗？`,
    success: (res) => {
      if (!res.confirm) return
      poolGroups.value = poolGroups.value.filter((group) => group.id !== id)
      poolItems.value = poolItems.value.filter((item) => (item.groupId || DEFAULT_POOL_GROUP_ID) !== id)
      ensureActivePoolGroup()
      savePoolGroups()
      savePool()
    },
  })
}

function managePoolGroup(id: string): void {
  const target = poolGroups.value.find((group) => group.id === id)
  if (!target) return
  uni.showActionSheet({
    itemList: ['重命名', '删除分组'],
    success: (res) => {
      if (res.tapIndex === 0) renamePoolGroup(id)
      if (res.tapIndex === 1) removePoolGroup(id)
    },
  })
}

function addPoolItem(): void {
  const name = compactText(newShopName.value)
  if (name === '') {
    uni.showToast({ title: '先输入店名', icon: 'none' })
    return
  }
  if (currentGroupItems.value.some((item) => item.name === name)) {
    uni.showToast({ title: '这个饭池里已经有这家', icon: 'none' })
    return
  }
  // 选了建议就带坐标入库；没选（纯手输「妈妈做的饭」这类）就留空，走无坐标自愈。
  const picked = pickedShopCoords.value
  poolItems.value.unshift({
    id: genId(),
    name,
    note: compactText(newShopNote.value),
    address: picked?.address ?? '',
    lat: picked?.lat ?? null,
    lng: picked?.lng ?? null,
    distanceM: null,
    source: 'pool',
    category: '',
    typecode: '',
    groupId: activePoolGroupId.value,
  })
  newShopName.value = ''
  newShopNote.value = ''
  pickedShopCoords.value = null
  shopCandidates.value = []
  shopSearched.value = false
  shopSearchError.value = ''
  if (shopSearchTimer) {
    clearTimeout(shopSearchTimer)
    shopSearchTimer = null
  }
  savePool()
}

// 店名输入 debounce 搜索地点候选；小程序端 input 事件早于 v-model 回写，需直接取事件值。
function onShopNameInput(event: Event): void {
  const value = inputEventValue(event, newShopName.value)
  newShopName.value = value
  pickedShopCoords.value = null
  shopSearched.value = false
  shopSearchError.value = ''
  const query = compactText(value)
  if (shopSearchTimer) {
    clearTimeout(shopSearchTimer)
    shopSearchTimer = null
  }
  if (query.length < 2) {
    shopSearchSeq += 1
    shopCandidates.value = []
    shopSearching.value = false
    return
  }
  shopSearchTimer = setTimeout(() => {
    void searchShopCandidates(query)
  }, 350)
}

function inputEventValue(event: Event | undefined, fallback: string): string {
  const payload = event as (Event & { detail?: { value?: unknown }, target?: { value?: unknown } }) | undefined
  const value = payload?.detail?.value ?? payload?.target?.value
  return typeof value === 'string' ? value : fallback
}

async function searchShopCandidates(query: string): Promise<void> {
  const seq = ++shopSearchSeq
  shopSearching.value = true
  shopSearched.value = false
  shopSearchError.value = ''
  try {
    const params: Record<string, string | number> = {
      q: query,
      region: currentRegion.value,
    }
    if (center.value) {
      params.lat = center.value.lat
      params.lng = center.value.lng
      params.radius = Math.max(radiusM.value, 5000)
    }
    const res = await apiGet<GeocodeResponse>('/api/food/search-shops', params)
    // 若用户在等待期间已选定或清空，丢弃过期结果。
    if (seq !== shopSearchSeq || pickedShopCoords.value || compactText(newShopName.value) !== query) return
    shopCandidates.value = uniqueGeocodeCandidates(res.candidates ?? []).slice(0, 6)
  } catch (e) {
    if (seq === shopSearchSeq) {
      shopCandidates.value = []
      shopSearchError.value = e instanceof Error ? e.message : '搜索失败，请稍后再试'
    }
  } finally {
    if (seq === shopSearchSeq) {
      shopSearching.value = false
      shopSearched.value = true
    }
  }
}

function chooseShopCandidate(candidate: GeocodeCandidate): void {
  newShopName.value = candidate.title || candidate.name
  pickedShopCoords.value = { lat: candidate.lat, lng: candidate.lng, address: candidate.address || '' }
  if (candidate.city || candidate.province) {
    currentRegion.value = candidate.city || candidate.province || currentRegion.value
  }
  shopCandidates.value = []
  shopSearching.value = false
  shopSearched.value = false
  shopSearchError.value = ''
}

function isPickedShop(candidate: GeocodeCandidate): boolean {
  return pickedShopCoords.value !== null
    && Math.abs(pickedShopCoords.value.lat - candidate.lat) < 0.000001
    && Math.abs(pickedShopCoords.value.lng - candidate.lng) < 0.000001
}

function removePoolItem(id: string): void {
  poolItems.value = poolItems.value.filter((item) => item.id !== id)
  savePool()
}

// 从饭池列表直接给某条无坐标记录补定位（Layer1 自愈的第二入口）。
async function bindPoolItem(item: FoodShop): Promise<void> {
  if (resolving.value) return
  resolving.value = true
  uni.showLoading({ title: '查找位置中', mask: true })
  let candidates: GeocodeCandidate[] = []
  try {
    const res = await apiGet<GeocodeResponse>('/api/travel/geocode', {
      q: item.name,
      region: currentRegion.value,
    })
    candidates = res.candidates ?? []
  } catch (e) {
    uni.hideLoading()
    resolving.value = false
    uni.showToast({ title: e instanceof Error ? e.message : '查找失败', icon: 'none' })
    return
  }
  uni.hideLoading()
  resolving.value = false

  if (candidates.length === 0) {
    fallbackSearchInMap(item.name)
    return
  }
  if (candidates.length === 1) {
    writePoolItemCoords(item.id, candidates[0])
    return
  }
  uni.showActionSheet({
    itemList: candidates.slice(0, 6).map((c) => truncateLabel(`${c.title || c.name}｜${c.address || c.city || ''}`)),
    success: (r) => {
      const picked = candidates[r.tapIndex]
      if (picked) writePoolItemCoords(item.id, picked)
    },
  })
}

// 回写坐标到饭池记录；若当前饭票正是这家，也一并更新，UI 立即变成已绑定。
function writePoolItemCoords(id: string, candidate: GeocodeCandidate): void {
  const idx = poolItems.value.findIndex((item) => item.id === id)
  if (idx < 0) return
  const address = candidate.address || poolItems.value[idx].address || ''
  poolItems.value[idx] = { ...poolItems.value[idx], lat: candidate.lat, lng: candidate.lng, address }
  if (result.value && result.value.id === id) {
    result.value = { ...result.value, lat: candidate.lat, lng: candidate.lng, address }
  }
  savePool()
  uni.showToast({ title: '已绑定地点', icon: 'success' })
}

function loadHistory(): void {
  const saved = safeStorageGet<FoodHistoryItem[]>(HISTORY_STORAGE_KEY, [])
  history.value = Array.isArray(saved) ? saved : []
}

function saveHistory(): void {
  uni.setStorageSync(HISTORY_STORAGE_KEY, history.value.slice(0, 20))
  void saveFoodDataRemote()
}

function clearHistory(): void {
  history.value = []
  saveHistory()
}

function loadGroup(): void {
  const saved = safeStorageGet<{
    roomCode?: string
    members?: GroupMember[]
    avoids?: PreferenceTag[]
    selectedAvoidIds?: string[]
  }>(GROUP_STORAGE_KEY, {})
  groupRoomCode.value = saved.roomCode || randomRoomCode()
  groupMembers.value = Array.isArray(saved.members) && saved.members.length > 0
    ? saved.members
    : [{ id: genId(), name: '我' }]
  groupAvoidOptions.value = Array.isArray(saved.avoids) && saved.avoids.length > 0
    ? normalizePreferences(saved.avoids)
    : DEFAULT_GROUP_AVOIDS.slice()
  selectedGroupAvoidIds.value = Array.isArray(saved.selectedAvoidIds)
    ? saved.selectedAvoidIds.filter((id) => groupAvoidOptions.value.some((tag) => tag.id === id))
    : []
}

function saveGroup(): void {
  uni.setStorageSync(GROUP_STORAGE_KEY, {
    roomCode: groupRoomCode.value,
    members: groupMembers.value,
    avoids: groupAvoidOptions.value,
    selectedAvoidIds: selectedGroupAvoidIds.value,
  })
}

function roomPayload(): FoodRoomPayload {
  return {
    members: groupMembers.value,
    avoids: groupAvoidOptions.value,
    selectedAvoidIds: selectedGroupAvoidIds.value,
  }
}

function applyRoomPayload(payload: Partial<FoodRoomPayload>): void {
  if (Array.isArray(payload.members) && payload.members.length > 0) {
    groupMembers.value = payload.members
  }
  if (Array.isArray(payload.avoids) && payload.avoids.length > 0) {
    groupAvoidOptions.value = normalizePreferences(payload.avoids)
  }
  if (Array.isArray(payload.selectedAvoidIds)) {
    selectedGroupAvoidIds.value = payload.selectedAvoidIds.filter((id) => groupAvoidOptions.value.some((tag) => tag.id === id))
  }
  saveGroup()
}

async function saveFoodRoomRemote(showToast = true): Promise<SaveFoodRoomResponse | null> {
  if (roomSaving.value) return null
  const ok = await ensureAccount()
  if (!ok) {
    uni.showToast({ title: '请先微信登录', icon: 'none' })
    return null
  }
  roomSaving.value = true
  try {
    const record = await apiPost<SaveFoodRoomResponse>('/api/food/room', {
      code: groupRoomCode.value,
      room: roomPayload(),
    })
    groupRoomCode.value = record.code
    roomCodeInput.value = record.code
    saveGroup()
    if (showToast) {
      uni.showToast({ title: '饭局已保存', icon: 'success' })
    }
    return record
  } catch (e) {
    uni.showToast({ title: e instanceof Error ? e.message : '饭局保存失败', icon: 'none' })
    return null
  } finally {
    roomSaving.value = false
  }
}

async function loadFoodRoomByInput(): Promise<void> {
  await loadFoodRoom(roomCodeInput.value)
}

async function loadFoodRoom(code: string): Promise<void> {
  const cleanCode = compactText(code)
  if (!/^[0-9]{4}$/.test(cleanCode)) {
    uni.showToast({ title: '请输入 4 位饭局码', icon: 'none' })
    return
  }
  if (roomSaving.value) return
  roomSaving.value = true
  try {
    const record = await apiGet<FoodRoomRecord>(`/api/food/room/${cleanCode}`, {})
    groupRoomCode.value = record.code
    roomCodeInput.value = record.code
    applyRoomPayload(record.room)
    sourceMode.value = 'group'
    activeTab.value = 'group'
    uni.showToast({ title: '已加入饭局', icon: 'success' })
  } catch (e) {
    uni.showToast({ title: e instanceof Error ? e.message : '饭局加载失败', icon: 'none' })
  } finally {
    roomSaving.value = false
  }
}

function addGroupMember(): void {
  const name = compactText(newMemberName.value).slice(0, 8)
  if (name === '') {
    uni.showToast({ title: '先输入参与人', icon: 'none' })
    return
  }
  if (groupMembers.value.some((member) => member.name === name)) {
    uni.showToast({ title: '这个人已在饭局里', icon: 'none' })
    return
  }
  groupMembers.value.push({ id: genId(), name })
  newMemberName.value = ''
  saveGroup()
}

function removeGroupMember(id: string): void {
  if (groupMembers.value.length <= 1) {
    uni.showToast({ title: '至少保留一个人', icon: 'none' })
    return
  }
  groupMembers.value = groupMembers.value.filter((member) => member.id !== id)
  saveGroup()
}

function toggleGroupAvoid(id: string): void {
  selectedGroupAvoidIds.value = selectedGroupAvoidIds.value.includes(id)
    ? selectedGroupAvoidIds.value.filter((item) => item !== id)
    : [...selectedGroupAvoidIds.value, id]
  saveGroup()
}

function addGroupAvoid(): void {
  const label = compactText(newAvoidLabel.value).slice(0, 8)
  if (label === '') {
    uni.showToast({ title: '先输入避雷项', icon: 'none' })
    return
  }
  if (groupAvoidOptions.value.some((item) => item.label === label)) {
    uni.showToast({ title: '这个避雷项已存在', icon: 'none' })
    return
  }
  const tag = { id: genId(), label }
  groupAvoidOptions.value.push(tag)
  selectedGroupAvoidIds.value.push(tag.id)
  newAvoidLabel.value = ''
  saveGroup()
}

async function copyRoomCode(): Promise<void> {
  await saveFoodRoomRemote(false)
  uni.setClipboardData({
    data: groupRoomCode.value,
    success: () => uni.showToast({ title: '饭局码已复制', icon: 'success' }),
  })
}

// 开一顿新饭局：换新码、清空参与人与避雷，回到默认配置。
function newRoom(): void {
  uni.showModal({
    title: '开启新饭局',
    content: '会生成新的饭局码，并清空当前参与人和避雷项，确定吗？',
    success: (res) => {
      if (!res.confirm) return
      groupRoomCode.value = randomRoomCode()
      roomCodeInput.value = ''
      groupMembers.value = [{ id: genId(), name: '我' }]
      groupAvoidOptions.value = DEFAULT_GROUP_AVOIDS.slice()
      selectedGroupAvoidIds.value = []
      saveGroup()
      uni.showToast({ title: `新饭局 ${groupRoomCode.value}`, icon: 'none' })
    },
  })
}

function markAte(): void {
  if (!result.value) return
  history.value = [
    { id: result.value.id + '-' + Date.now(), name: result.value.name, at: Date.now() },
    ...history.value.filter((item) => item.name !== result.value?.name),
  ].slice(0, 20)
  saveHistory()
  uni.showToast({ title: '已记录', icon: 'success' })
}

async function locateMe(): Promise<void> {
  try {
    const loc = await getLocation()
    center.value = loc
    deviceLocation.value = loc
    try {
      const info = await apiGet<ReverseLocationResponse>('/api/food/reverse-geocode', {
        lat: loc.lat,
        lng: loc.lng,
      })
      currentRegion.value = info.city || info.province || info.adcode
      locationLabel.value = info.address || currentRegion.value || '当前位置'
    } catch {
      locationLabel.value = `当前位置 ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`
    }
    placeQuery.value = ''
    placeCandidates.value = []
    placeSearched.value = false
    uni.showToast({ title: '已定位', icon: 'success' })
  } catch (e) {
    uni.showToast({ title: e instanceof Error ? e.message : '定位失败', icon: 'none' })
  }
}

function onPlaceInput(): void {
  placeCandidates.value = []
  placeSearched.value = false
  center.value = null
  locationLabel.value = '尚未选择地点'
}

async function searchPlace(): Promise<void> {
  const query = compactText(placeQuery.value)
  if (query === '') {
    uni.showToast({ title: '先输入地点', icon: 'none' })
    return
  }
  placeSearching.value = true
  placeSearched.value = false
  center.value = null
  try {
    // 先尽力拿到设备定位：带上坐标才能命中本地门店并按“离我近”排序，
    // 否则纯地点联想会返回外地同名店（如沈阳/长春的粉小主）。
    if (!deviceLocation.value) {
      try {
        deviceLocation.value = await getLocation()
      } catch {
        // 用户拒绝定位也没关系，退化为仅按 region 的地点搜索。
      }
    }
    const params: Record<string, string | number> = {
      q: query,
      region: currentRegion.value,
    }
    if (deviceLocation.value) {
      params.lat = deviceLocation.value.lat
      params.lng = deviceLocation.value.lng
      params.radius = 20000
    }
    // search-shops 走高德周边 + 腾讯兜底 + 距离排序，比 travel/geocode 更适合“搜本地门店”。
    const res = await apiGet<GeocodeResponse>('/api/food/search-shops', params)
    placeCandidates.value = res.candidates ?? []
    placeSearched.value = true
    if (placeCandidates.value.length === 0) {
      uni.showToast({ title: '没有找到这个地点', icon: 'none' })
      return
    }
    locationLabel.value = '请选择搜索结果'
  } catch (e) {
    uni.showToast({ title: e instanceof Error ? e.message : '地点搜索失败', icon: 'none' })
  } finally {
    placeSearching.value = false
  }
}

function choosePlace(candidate: GeocodeCandidate): void {
  center.value = { lat: candidate.lat, lng: candidate.lng }
  locationLabel.value = candidate.title || candidate.name || placeQuery.value
  placeQuery.value = candidate.title || candidate.name || placeQuery.value
  currentRegion.value = candidate.city || candidate.province || candidate.adcode || currentRegion.value
  placeCandidates.value = []
  placeSearched.value = false
  uni.showToast({ title: '地点已选定', icon: 'success' })
}

function candidateKey(candidate: GeocodeCandidate): string {
  return `${candidate.lng},${candidate.lat},${candidate.title || candidate.name}`
}

function isSelectedPlace(candidate: GeocodeCandidate): boolean {
  return center.value !== null
    && Math.abs(center.value.lat - candidate.lat) < 0.000001
    && Math.abs(center.value.lng - candidate.lng) < 0.000001
}

function placeCandidateSubtitle(candidate: GeocodeCandidate): string {
  const parts = [candidate.province, candidate.city, candidate.adcode].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '点击设为随机中心'
}

function shopCandidateSubtitle(candidate: GeocodeCandidate): string {
  const address = candidate.address || placeCandidateSubtitle(candidate)
  if (typeof candidate.distanceM === 'number') {
    return `${formatDistance(candidate.distanceM)} · ${address}`
  }
  return address
}

function uniqueGeocodeCandidates(candidates: GeocodeCandidate[]): GeocodeCandidate[] {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const title = compactText(candidate.title || candidate.name).toLowerCase()
    const address = compactText(candidate.address).toLowerCase()
    const location = `${candidate.lng.toFixed(5)},${candidate.lat.toFixed(5)}`
    const key = `${title}|${address}|${location}`
    if (title === '' || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function startDrawAnimation(): void {
  stopDrawAnimation()
  const names = drawCandidateNames()
  let tick = 0
  drawStage.value = DRAW_STAGES[0]
  drawRollingName.value = names[0] || DRAW_FALLBACK_NAMES[0]
  drawProgress.value = 8
  drawTimer = setInterval(() => {
    tick += 1
    const currentNames = drawCandidateNames()
    drawRollingName.value = currentNames[tick % currentNames.length] || DRAW_FALLBACK_NAMES[tick % DRAW_FALLBACK_NAMES.length]
    drawStage.value = DRAW_STAGES[Math.min(DRAW_STAGES.length - 1, Math.floor(tick / 4))]
    drawProgress.value = Math.min(94, drawProgress.value + (tick < 5 ? 11 : 6))
  }, 140)
}

function finishDrawAnimation(name: string): void {
  stopDrawAnimation()
  drawStage.value = '抽中了'
  drawRollingName.value = name
  drawProgress.value = 100
}

function stopDrawAnimation(): void {
  if (drawTimer !== null) {
    clearInterval(drawTimer)
    drawTimer = null
  }
}

function drawCandidateNames(): string[] {
  const names: string[] = []
  if (sourceMode.value === 'pool') {
    names.push(...currentGroupItems.value.map((item) => item.name))
  } else if (sourceMode.value === 'group') {
    names.push(...poolItems.value.map((item) => item.name))
    names.push('附近美食', '适合聚餐', '大家都能吃')
  } else {
    names.push(...selectedPreferenceLabels.value.map((label) => `${label}美食`))
    names.push(`${formatDistance(radiusM.value)}附近`, nearbyKeyword.value)
  }

  return uniqueLabels([...names, ...DRAW_FALLBACK_NAMES]).slice(0, 10)
}

function uniqueLabels(items: string[]): string[] {
  const seen = new Set<string>()
  return items
    .map((item) => compactText(item))
    .filter((item) => {
      if (item === '' || seen.has(item)) return false
      seen.add(item)
      return true
    })
}

async function keepDrawVisible(startedAt: number): Promise<void> {
  const remaining = DRAW_MIN_DURATION_MS - (Date.now() - startedAt)
  if (remaining > 0) {
    await sleep(remaining)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function decideFood(): Promise<void> {
  if (deciding.value) return
  deciding.value = true
  const startedAt = Date.now()
  startDrawAnimation()
  try {
    let nextResult: FoodResult
    if (sourceMode.value === 'nearby') {
      nextResult = await decideNearby()
    } else if (sourceMode.value === 'group') {
      nextResult = await decideGroup()
    } else {
      nextResult = decideFromPool()
    }
    await keepDrawVisible(startedAt)
    finishDrawAnimation(nextResult.name)
    await sleep(DRAW_REVEAL_DURATION_MS)
    result.value = nextResult
    activeTab.value = 'ticket'
  } catch (e) {
    uni.showToast({ title: e instanceof Error ? e.message : '随机失败', icon: 'none' })
  } finally {
    stopDrawAnimation()
    deciding.value = false
  }
}

async function decideFromPoolTab(): Promise<void> {
  sourceMode.value = 'pool'
  await decideFood()
  if (result.value) {
    activeTab.value = 'ticket'
  }
}

async function decideNearby(): Promise<FoodResult> {
  if (!center.value) {
    throw new Error('先选择地点或使用当前位置')
  }
  const items = avoidRecent(await fetchNearbyShops(nearbyKeyword.value))
  const picked = randomPick(items)
  if (!picked) {
    throw new Error('附近没有搜到合适美食')
  }

  return {
    ...picked,
    scene: 'nearby',
    reason: `按“${selectedPreferenceLabels.value.join('、')}”从 ${formatDistance(radiusM.value)} 内随机抽中，距离约 ${formatDistance(picked.distanceM)}。`,
  }
}

function decideFromPool(): FoodResult {
  const picked = randomPick(avoidRecent(currentGroupItems.value))
  if (!picked) {
    throw new Error(`「${activePoolGroupName.value}」还是空的`)
  }
  return {
    ...picked,
    scene: 'pool',
    reason: picked.note || `从「${activePoolGroupName.value}」的 ${currentGroupItems.value.length} 家常吃店里随机抽中，最近吃过的店会尽量避开。`,
  }
}

async function decideGroup(): Promise<FoodResult> {
  const nearby = center.value ? await fetchNearbyShops('美食') : []
  const candidates = uniqueByName([...nearby, ...poolItems.value])
  if (candidates.length === 0) {
    throw new Error('先选择地点或录入饭池')
  }

  const avoided = selectedGroupAvoidLabels.value
  const filtered = candidates.filter((item) => !matchesAvoid(item, avoided))
  const finalCandidates = avoidRecent(filtered.length > 0 ? filtered : candidates)
  const picked = randomPick(finalCandidates)
  if (!picked) {
    throw new Error('没有可用候选')
  }

  const avoidedText = avoided.length > 0 ? `，已避开 ${avoided.join('、')}` : ''
  const sourceText = nearby.length > 0 ? `附近 ${nearby.length} 家 + 饭池 ${poolItems.value.length} 家` : `饭池 ${poolItems.value.length} 家`
  return {
    ...picked,
    scene: 'group',
    reason: `${groupMembers.value.length} 人饭局，从${sourceText}候选里筛选${avoidedText}，随机抽中这家。`,
  }
}

async function fetchNearbyShops(keyword: string): Promise<FoodShop[]> {
  if (!center.value) return []
  const res = await apiGet<NearbyResponse>('/api/food/nearby', {
    lat: center.value.lat,
    lng: center.value.lng,
    radius: radiusM.value,
    keyword,
  })
  return res.items.map((item) => ({
    id: item.id,
    name: item.name,
    note: '',
    address: item.address,
    lat: item.lat,
    lng: item.lng,
    distanceM: item.distanceM,
    source: 'nearby',
    category: item.category || '',
    typecode: item.typecode || '',
  }))
}

function saveResultToPool(): void {
  if (!result.value) return
  const shop = result.value
  const commit = (groupId: string): void => {
    const groupName = poolGroups.value.find((group) => group.id === groupId)?.name ?? '我的饭池'
    const exists = poolItems.value.some(
      (item) => (item.groupId || DEFAULT_POOL_GROUP_ID) === groupId && item.name === shop.name,
    )
    if (exists) {
      uni.showToast({ title: `「${groupName}」已有这家`, icon: 'none' })
      return
    }
    poolItems.value.unshift({
      id: genId(),
      name: shop.name,
      note: selectedPreferenceLabels.value.join(' / '),
      address: shop.address,
      lat: shop.lat,
      lng: shop.lng,
      distanceM: null,
      source: 'pool',
      category: shop.category || '',
      typecode: shop.typecode || '',
      groupId,
    })
    savePool()
    uni.showToast({ title: `已加入「${groupName}」`, icon: 'success' })
  }

  if (poolGroups.value.length <= 1) {
    commit(poolGroups.value[0]?.id ?? DEFAULT_POOL_GROUP_ID)
    return
  }
  uni.showActionSheet({
    itemList: poolGroups.value.map((group) => group.name),
    success: (res) => {
      const group = poolGroups.value[res.tapIndex]
      if (group) commit(group.id)
    },
  })
}

async function openResultLocation(): Promise<void> {
  if (!result.value) return
  // Layer1 自愈：没坐标不再弹「暂无坐标」死胡同，转去查找并绑定位置。
  if (result.value.lat === null || result.value.lng === null) {
    await resolveResultCoords()
    return
  }
  navigateToResult()
}

// 拿店名 + 当前城市搜地点，让用户从分店里选一个，选中即回写坐标并导航。
async function resolveResultCoords(): Promise<void> {
  if (!result.value || resolving.value) return
  const name = result.value.name
  resolving.value = true
  uni.showLoading({ title: '查找位置中', mask: true })
  let candidates: GeocodeCandidate[] = []
  try {
    const res = await apiGet<GeocodeResponse>('/api/travel/geocode', {
      q: name,
      region: currentRegion.value,
    })
    candidates = res.candidates ?? []
  } catch (e) {
    uni.hideLoading()
    resolving.value = false
    uni.showToast({ title: e instanceof Error ? e.message : '查找失败', icon: 'none' })
    return
  }
  uni.hideLoading()
  resolving.value = false

  if (candidates.length === 0) {
    // Layer2 降级：搜不到就外链地图 App —— 复制店名让用户自己去搜。
    fallbackSearchInMap(name)
    return
  }
  if (candidates.length === 1) {
    applyResolvedCoords(candidates[0])
    return
  }
  // 多家分店必须让用户选，否则可能绑错门店。
  uni.showActionSheet({
    itemList: candidates.slice(0, 6).map((c) => truncateLabel(`${c.title || c.name}｜${c.address || c.city || ''}`)),
    success: (r) => {
      const picked = candidates[r.tapIndex]
      if (picked) applyResolvedCoords(picked)
    },
  })
}

// 回写坐标到饭票和饭池同一条记录，下次抽中即带坐标（存量手动项被顺手治好）。
function applyResolvedCoords(candidate: GeocodeCandidate): void {
  if (!result.value) return
  const address = candidate.address || result.value.address || ''
  const targetId = result.value.id
  const targetName = result.value.name
  result.value = { ...result.value, lat: candidate.lat, lng: candidate.lng, address }
  const idx = poolItems.value.findIndex(
    (item) => item.id === targetId || (item.name === targetName && (item.lat === null || item.lng === null)),
  )
  if (idx >= 0) {
    poolItems.value[idx] = { ...poolItems.value[idx], lat: candidate.lat, lng: candidate.lng, address }
    savePool()
  }
  uni.showToast({ title: '已绑定地点', icon: 'success' })
  navigateToResult()
}

function fallbackSearchInMap(name: string): void {
  uni.showModal({
    title: '没找到这家店的位置',
    content: `可以复制「${name}」到地图 App 里搜索。`,
    confirmText: '复制店名',
    cancelText: '取消',
    success: (res) => {
      if (!res.confirm) return
      uni.setClipboardData({
        data: name,
        success: () => uni.showToast({ title: '已复制店名', icon: 'success' }),
      })
    },
  })
}

function navigateToResult(): void {
  if (!result.value || result.value.lat === null || result.value.lng === null) return

  const system = uni.getSystemInfoSync()
  if (system.platform === 'devtools') {
    const text = [result.value.name, result.value.address].filter(Boolean).join('，')
    uni.showModal({
      title: '开发者工具不支持导航',
      content: '开发者工具无法拉起 qqmap:// 导航协议，请用真机预览验证。可先复制店名和地址。',
      confirmText: '复制地址',
      showCancel: false,
      success: () => {
        uni.setClipboardData({ data: text || result.value?.name || '' })
      },
    })
    return
  }

  uni.openLocation({
    latitude: result.value.lat,
    longitude: result.value.lng,
    name: result.value.name,
    address: result.value.address,
  })
}

function avoidRecent<T extends { name: string }>(items: T[]): T[] {
  const recent = new Set(history.value.slice(0, 5).map((item) => item.name))
  const filtered = items.filter((item) => !recent.has(item.name))
  return filtered.length > 0 ? filtered : items
}

function uniqueByName(items: FoodShop[]): FoodShop[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = compactText(item.name).toLowerCase()
    if (key === '' || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function matchesAvoid(item: FoodShop, avoided: string[]): boolean {
  if (avoided.length === 0) return false
  const text = `${item.name} ${item.note} ${item.address} ${item.category || ''} ${item.typecode || ''}`.toLowerCase()
  return avoided.some((label) => {
    const key = label.toLowerCase()
    if (key.includes('不吃')) {
      return text.includes(key.replace('不吃', ''))
    }
    return text.includes(key)
  })
}

function randomPick<T>(items: T[]): T | null {
  if (items.length === 0) return null
  return items[Math.floor(Math.random() * items.length)]
}

function formatDistance(value: number | null): string {
  if (value === null || Number.isNaN(value)) return ''
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 3000 ? 0 : 1)}km`
  return `${Math.max(1, Math.round(value))}m`
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateLabel(value: string): string {
  const text = compactText(value).replace(/｜$/, '')
  return text.length > 28 ? `${text.slice(0, 27)}…` : text
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

function randomRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

function safeStorageGet<T>(key: string, fallback: T): T {
  try {
    const value = uni.getStorageSync(key)
    return value || fallback
  } catch {
    return fallback
  }
}

function getLocation(): Promise<{ lat: number, lng: number }> {
  return new Promise((resolve, reject) => {
    uni.getLocation({
      type: 'gcj02',
      success: (res) => resolve({ lat: res.latitude, lng: res.longitude }),
      fail: (err) => reject(new Error(locationErrorMessage(err.errMsg))),
    })
  })
}

function locationErrorMessage(errMsg = ''): string {
  if (/requiredPrivateInfos/i.test(errMsg)) return '定位接口未声明，请重新编译小程序'
  if (/auth|authorize|deny|denied/i.test(errMsg)) return '定位权限未开启，可手动搜索地点'
  return '定位失败，可手动搜索地点'
}

function wxLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: (res) => {
        if (res.code) {
          resolve(res.code)
          return
        }
        reject(new Error('微信登录未返回 code'))
      },
      fail: () => reject(new Error('微信登录失败')),
    })
  })
}

function getWechatProfile(): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const api = typeof wx !== 'undefined' && typeof wx.getUserProfile === 'function' ? wx : null
    if (!api) {
      resolve({})
      return
    }
    api.getUserProfile({
      desc: '用于展示用户昵称和同步吃饭工具数据',
      success: (res: { userInfo?: Record<string, unknown> }) => resolve(res.userInfo ?? {}),
      fail: (err: { errMsg?: string }) => reject(new Error(err.errMsg || '用户未授权微信资料')),
    })
  })
}

function apiGet<T>(path: string, query: Record<string, string | number>): Promise<T> {
  const qs = Object.entries(query)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
  const url = qs ? `${API_BASE}${path}?${qs}` : `${API_BASE}${path}`

  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method: 'GET',
      header: requestHeaders(),
      timeout: 8000,
      success: (res) => {
        const body = res.data as ApiEnvelope<T>
        if (!body || body.code !== 0) {
          reject(new Error(body?.message || '接口返回异常'))
          return
        }
        resolve(body.data)
      },
      fail: (err) => reject(new Error(err.errMsg || '网络请求失败')),
    })
  })
}

function apiPost<T>(path: string, data: Record<string, unknown>, withUserToken = true): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${API_BASE}${path}`,
      method: 'POST',
      data,
      header: requestHeaders(withUserToken),
      timeout: 8000,
      success: (res) => {
        const body = res.data as ApiEnvelope<T>
        if (!body || body.code !== 0) {
          reject(new Error(body?.message || '接口返回异常'))
          return
        }
        resolve(body.data)
      },
      fail: (err) => reject(new Error(err.errMsg || '网络请求失败')),
    })
  })
}

function requestHeaders(withUserToken = true): Record<string, string> {
  const headers: Record<string, string> = { 'X-API-Key': API_KEY }
  if (withUserToken && authToken.value !== '') {
    headers['X-User-Token'] = authToken.value
  }
  return headers
}
</script>

<style lang="scss" scoped>
.food {
  min-height: 100vh;
  padding: 32rpx 28rpx calc(156rpx + constant(safe-area-inset-bottom));
  padding: 32rpx 28rpx calc(156rpx + env(safe-area-inset-bottom));
  background: #f7f8f8;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 20rpx;
    margin-bottom: 24rpx;
  }

  &__eyebrow {
    display: block;
    margin-bottom: 8rpx;
    color: #7f8a91;
    font-size: 24rpx;
  }

  &__title {
    display: block;
    color: #202326;
    font-size: 48rpx;
    font-weight: 800;
    line-height: 1.15;
  }

  &__account {
    margin-bottom: 18rpx;
    padding: 18rpx 22rpx;
    border: 2rpx solid #e2e7e9;
    border-radius: 16rpx;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18rpx;
    background: #ffffff;
  }

  &__account-avatar {
    width: 64rpx;
    height: 64rpx;
    border-radius: 50%;
    background: #eef1f2;
    flex-shrink: 0;
  }

  &__account-copy {
    min-width: 0;
    flex: 1;
  }

  &__account-title,
  &__account-sub {
    display: block;
  }

  &__account-title {
    color: #202326;
    font-size: 26rpx;
    font-weight: 800;
  }

  &__account-sub {
    margin-top: 4rpx;
    color: #7f8a91;
    font-size: 22rpx;
    line-height: 1.35;
  }

  &__account-btn {
    min-width: 132rpx;
    min-height: 56rpx;
    border-radius: 999rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #1d6671;
    background: #eef8fa;
    font-size: 24rpx;
    font-weight: 800;
    flex-shrink: 0;
  }

  &__profile {
    margin: -4rpx 0 18rpx;
    padding: 18rpx;
    border: 2rpx solid #e2e7e9;
    border-radius: 16rpx;
    display: grid;
    grid-template-columns: 92rpx 1fr 96rpx;
    gap: 12rpx;
    align-items: center;
    background: #ffffff;
  }

  &__avatar-btn {
    width: 92rpx;
    height: 92rpx;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #1d6671;
    background: #eef8fa;
    font-size: 22rpx;
    font-weight: 800;
    line-height: 1.2;

    &::after {
      border: 0;
    }
  }

  &__avatar-preview {
    width: 92rpx;
    height: 92rpx;
    border-radius: 50%;
  }

  &__nickname-input {
    min-height: 76rpx;
    padding: 0 20rpx;
    border: 2rpx solid #e2e7e9;
    border-radius: 14rpx;
    background: #f8faf9;
    color: #202326;
    font-size: 26rpx;
  }

  &__profile-save {
    min-height: 76rpx;
    border-radius: 14rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    background: #202326;
    font-size: 26rpx;
    font-weight: 800;
  }

  &__tabs {
    position: fixed;
    left: 28rpx;
    right: 28rpx;
    bottom: calc(20rpx + constant(safe-area-inset-bottom));
    bottom: calc(20rpx + env(safe-area-inset-bottom));
    z-index: 20;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8rpx;
    padding: 6rpx;
    border: 2rpx solid #e2e7e9;
    border-radius: 16rpx;
    background: rgba(237, 241, 241, 0.96);
    box-shadow: 0 12rpx 36rpx rgba(31, 44, 52, 0.16);
    backdrop-filter: blur(16rpx);
  }

  &__tab {
    min-height: 78rpx;
    border-radius: 12rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4rpx;
    color: #6b747b;
    font-size: 22rpx;
    font-weight: 760;

    &--active {
      color: #b73c2e;
      background: #ffffff;
      box-shadow: 0 4rpx 12rpx rgba(30, 42, 50, 0.08);
    }
  }

  &__tab-symbol {
    font-size: 28rpx;
    line-height: 1;
  }

  &__mode {
    display: flex;
    padding: 6rpx;
    border: 2rpx solid #e2e7e9;
    border-radius: 16rpx;
    background: #edf1f1;
    flex-shrink: 0;
  }

  &__mode-item {
    min-width: 82rpx;
    padding: 14rpx 18rpx;
    border-radius: 12rpx;
    color: #6b747b;
    font-size: 24rpx;
    font-weight: 700;
    text-align: center;

    &--active {
      color: #202326;
      background: #ffffff;
      box-shadow: 0 4rpx 12rpx rgba(30, 42, 50, 0.08);
    }
  }

  &__panel,
  &__ticket {
    padding: 28rpx;
    border: 2rpx solid #e2e7e9;
    border-radius: 16rpx;
    background: #ffffff;
    box-shadow: 0 10rpx 32rpx rgba(31, 44, 52, 0.08);
  }

  &__panel {
    margin-bottom: 24rpx;

    &--last {
      margin-bottom: 0;
    }
  }

  &__section {
    margin-top: 28rpx;
  }

  &__section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
    margin-bottom: 16rpx;

    &--inner {
      margin-top: 22rpx;
    }
  }

  &__section-title {
    color: #202326;
    font-size: 28rpx;
    font-weight: 800;
  }

  &__caption,
  &__link {
    color: #7f8a91;
    font-size: 24rpx;
  }

  &__caption--hint {
    display: block;
    margin: 12rpx 0 4rpx;
  }

  &__link {
    color: #238a9a;
    font-weight: 700;
  }

  &__place {
    display: grid;
    grid-template-columns: 1fr 116rpx;
    gap: 12rpx;
  }

  &__place-input,
  &__add-input,
  &__pool-input {
    min-height: 76rpx;
    padding: 0 22rpx;
    border: 2rpx solid #e2e7e9;
    border-radius: 14rpx;
    background: #f8faf9;
    color: #202326;
    font-size: 26rpx;
  }

  &__place-btn,
  &__mini-btn,
  &__pool-add {
    min-height: 76rpx;
    border-radius: 14rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    background: #202326;
    font-size: 26rpx;
    font-weight: 800;
  }

  &__place-current {
    margin-top: 12rpx;
    color: #69717a;
    font-size: 24rpx;
    line-height: 1.4;
  }

  &__place-results {
    display: grid;
    gap: 12rpx;
    margin-top: 16rpx;
  }

  &__place-result {
    min-height: 92rpx;
    padding: 16rpx 18rpx;
    border: 2rpx solid #e2e7e9;
    border-radius: 14rpx;
    display: grid;
    grid-template-columns: 1fr 72rpx;
    gap: 16rpx;
    align-items: center;
    background: #ffffff;

    &--active {
      border-color: rgba(35, 138, 154, 0.36);
      background: #eef8fa;
    }
  }

  &__place-result-copy {
    min-width: 0;
  }

  &__place-result-title,
  &__place-result-sub {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__place-result-title {
    color: #202326;
    font-size: 26rpx;
    font-weight: 800;
  }

  &__place-result-sub {
    margin-top: 6rpx;
    color: #7f8a91;
    font-size: 22rpx;
  }

  &__place-result-action {
    height: 52rpx;
    border-radius: 999rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #1d6671;
    background: #eef8fa;
    font-size: 22rpx;
    font-weight: 800;
  }

  &__place-empty {
    margin-top: 16rpx;
    padding: 18rpx;
    border: 2rpx dashed #d9e0e3;
    border-radius: 14rpx;
    color: #7f8a91;
    font-size: 24rpx;
    line-height: 1.5;
    text-align: center;
  }

  &__radius {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8rpx;
    padding: 6rpx;
    border: 2rpx solid #e2e7e9;
    border-radius: 16rpx;
    background: #edf1f1;
  }

  &__radius-item {
    min-height: 68rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12rpx;
    color: #6b747b;
    font-size: 24rpx;
    font-weight: 700;

    &--active {
      color: #202326;
      background: #ffffff;
      box-shadow: 0 4rpx 12rpx rgba(30, 42, 50, 0.08);
    }
  }

  &__tags,
  &__meta,
  &__history {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }

  &__tag,
  &__meta-chip,
  &__history-chip {
    min-height: 60rpx;
    display: inline-flex;
    align-items: center;
    gap: 8rpx;
    padding: 0 22rpx;
    border: 2rpx solid #e2e7e9;
    border-radius: 999rpx;
    background: #ffffff;
    color: #394149;
    font-size: 24rpx;
  }

  &__tag {
    &--active {
      border-color: rgba(223, 81, 63, 0.28);
      background: #fff2ef;
      color: #b73c2e;
      font-weight: 800;
    }

    &--editing {
      padding-right: 12rpx;
    }

    &--add {
      border-style: dashed;
      color: #7f8a91;
    }
  }

  &__tag-close {
    width: 36rpx;
    height: 36rpx;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    background: #df513f;
    font-size: 24rpx;
    font-weight: 800;
    line-height: 1;
  }

  &__add-tag {
    display: grid;
    grid-template-columns: 1fr 104rpx;
    gap: 12rpx;
    margin-top: 16rpx;
  }

  &__room {
    padding: 18rpx;
    border: 2rpx solid rgba(35, 138, 154, 0.22);
    border-radius: 16rpx;
    background: #f2fafb;
  }

  &__room-code {
    min-height: 68rpx;
    padding: 0 18rpx;
    border-radius: 14rpx;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
    color: #1d6671;
    background: #ffffff;
    font-size: 26rpx;
    font-weight: 850;
  }

  &__room-copy {
    color: #238a9a;
    font-size: 24rpx;
    font-weight: 800;
  }

  &__room-divider {
    color: #bcd3d7;
    font-size: 22rpx;
  }

  &__room-actions {
    display: flex;
    align-items: center;
    gap: 12rpx;
    flex-shrink: 0;
  }

  &__join-room {
    display: grid;
    grid-template-columns: 1fr 104rpx;
    gap: 12rpx;
    margin-top: 14rpx;
  }

  &__member-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
    margin-top: 16rpx;
  }

  &__member {
    position: relative;
    width: 66rpx;
    height: 66rpx;
    border: 4rpx solid #ffffff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    background: #238a9a;
    font-size: 22rpx;
    font-weight: 850;
    box-shadow: 0 4rpx 14rpx rgba(30, 42, 50, 0.12);

    &:nth-child(2n) {
      background: #df513f;
    }

    &:nth-child(3n) {
      background: #2f8f72;
    }
  }

  &__member-remove {
    position: absolute;
    right: -8rpx;
    top: -8rpx;
    width: 28rpx;
    height: 28rpx;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    background: #202326;
    font-size: 20rpx;
    line-height: 1;
  }

  &__add-member {
    display: grid;
    grid-template-columns: 1fr 104rpx;
    gap: 12rpx;
    margin-top: 16rpx;
  }

  &__decide {
    min-height: 128rpx;
    margin-top: 30rpx;
    padding: 0 28rpx;
    border-radius: 16rpx;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20rpx;
    color: #ffffff;
    background: #df513f;
    box-shadow: 0 14rpx 28rpx rgba(223, 81, 63, 0.22);

    &--loading {
      transform: translateY(2rpx);
      opacity: 0.78;
    }

    &--pool {
      margin-top: 0;
      margin-bottom: 18rpx;
      background: #b73c2e;
      box-shadow: 0 14rpx 28rpx rgba(183, 60, 46, 0.22);
    }
  }

  &__decide-title,
  &__decide-sub {
    display: block;
  }

  &__decide-title {
    font-size: 40rpx;
    font-weight: 850;
    line-height: 1.1;
  }

  &__decide-sub {
    margin-top: 8rpx;
    color: rgba(255, 255, 255, 0.84);
    font-size: 24rpx;
  }

  &__decide-arrow {
    width: 64rpx;
    height: 64rpx;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.18);
    font-size: 36rpx;
    font-weight: 800;
    flex-shrink: 0;
  }

  &__draw {
    margin-top: 18rpx;
    padding: 22rpx;
    border: 2rpx solid rgba(223, 81, 63, 0.2);
    border-radius: 16rpx;
    display: flex;
    align-items: center;
    gap: 18rpx;
    background: #fffdf9;
    box-shadow: inset 0 0 0 2rpx rgba(255, 255, 255, 0.62);
    animation: food-draw-in 180ms ease-out;

    &--ticket {
      margin-top: 0;
      background: #ffffff;
    }
  }

  &__draw-wheel {
    position: relative;
    width: 92rpx;
    height: 92rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  &__draw-ring {
    position: absolute;
    inset: 0;
    border: 6rpx solid rgba(223, 81, 63, 0.16);
    border-top-color: #df513f;
    border-right-color: #238a9a;
    border-radius: 50%;
    animation: food-draw-spin 760ms linear infinite;
  }

  &__draw-core {
    position: relative;
    width: 60rpx;
    height: 60rpx;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    background: #202326;
    font-size: 26rpx;
    font-weight: 900;
    animation: food-draw-pop 620ms ease-in-out infinite alternate;
  }

  &__draw-copy {
    min-width: 0;
    flex: 1;
  }

  &__draw-stage,
  &__draw-name,
  &__draw-hint {
    display: block;
  }

  &__draw-stage {
    color: #b73c2e;
    font-size: 22rpx;
    font-weight: 850;
  }

  &__draw-name {
    margin-top: 6rpx;
    color: #202326;
    font-size: 34rpx;
    font-weight: 900;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__draw-progress {
    height: 10rpx;
    margin-top: 14rpx;
    border-radius: 999rpx;
    overflow: hidden;
    background: #edf1f1;
  }

  &__draw-progress-bar {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #df513f, #238a9a);
    transition: width 140ms ease;
  }

  &__draw-hint {
    margin-top: 10rpx;
    color: #7f8a91;
    font-size: 22rpx;
    line-height: 1.4;
  }

  &__ticket {
    position: relative;
    overflow: hidden;
    margin-bottom: 24rpx;
    border-color: rgba(223, 81, 63, 0.24);
    background: #fff8f6;
  }

  &__ticket-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
    margin-bottom: 16rpx;
  }

  &__ticket-kicker {
    color: #b73c2e;
    font-size: 24rpx;
    font-weight: 850;
  }

  &__ticket-source {
    color: #7f8a91;
    font-size: 22rpx;
  }

  &__shop-name {
    display: block;
    color: #202326;
    font-size: 46rpx;
    font-weight: 880;
    line-height: 1.16;
    animation: food-ticket-pop 220ms ease-out;
  }

  &__meta {
    margin-top: 18rpx;
  }

  &__meta-chip,
  &__history-chip {
    min-height: 52rpx;
    padding: 0 18rpx;
    background: #ffffff;
    color: #69717a;
    font-size: 22rpx;
  }

  &__meta-chip--link {
    border-color: rgba(35, 138, 154, 0.28);
    background: #eef8fa;
    color: #1d6671;
    font-weight: 800;
  }

  &__reason,
  &__address {
    display: block;
    margin-top: 18rpx;
    color: #394149;
    font-size: 26rpx;
    line-height: 1.65;
  }

  &__address {
    margin-top: 10rpx;
    color: #7f8a91;
    font-size: 24rpx;
  }

  &__ticket-actions {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12rpx;
    margin-top: 24rpx;
  }

  &__ticket-btn {
    min-height: 76rpx;
    border: 2rpx solid #e2e7e9;
    border-radius: 14rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #ffffff;
    color: #202326;
    font-size: 26rpx;
    font-weight: 800;

    &--primary {
      border-color: #df513f;
      color: #ffffff;
      background: #df513f;
    }
  }

  &__pool-location {
    margin-bottom: 22rpx;
    padding: 18rpx;
    border: 2rpx solid rgba(35, 138, 154, 0.18);
    border-radius: 16rpx;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18rpx;
    background: #f2fafb;
  }

  &__pool-location-copy {
    min-width: 0;
    flex: 1;
  }

  &__pool-location-kicker,
  &__pool-location-text {
    display: block;
  }

  &__pool-location-kicker {
    color: #1d6671;
    font-size: 22rpx;
    font-weight: 850;
  }

  &__pool-location-text {
    margin-top: 6rpx;
    color: #394149;
    font-size: 24rpx;
    line-height: 1.45;
  }

  &__pool-location-actions {
    display: flex;
    align-items: center;
    gap: 10rpx;
    flex-shrink: 0;
  }

  &__pool-location-action {
    min-width: 72rpx;
    min-height: 52rpx;
    padding: 0 14rpx;
    border-radius: 999rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #1d6671;
    background: #ffffff;
    font-size: 22rpx;
    font-weight: 850;
  }

  &__pool-form {
    display: grid;
    gap: 12rpx;
  }

  &__pool-add {
    background: #b73c2e;
  }

  &__empty {
    margin-top: 18rpx;
    padding: 24rpx;
    border: 2rpx dashed #d9e0e3;
    border-radius: 16rpx;
    color: #7f8a91;
    font-size: 26rpx;
    line-height: 1.55;
    text-align: center;
  }

  &__pool-list {
    display: grid;
    gap: 14rpx;
    margin-top: 18rpx;
  }

  &__pool-item {
    min-height: 96rpx;
    padding: 18rpx;
    border: 2rpx solid #e2e7e9;
    border-radius: 16rpx;
    display: grid;
    grid-template-columns: 1fr 64rpx;
    gap: 14rpx;
    align-items: center;
    background: #ffffff;
  }

  &__pool-copy {
    min-width: 0;
  }

  &__pool-nameline {
    display: flex;
    align-items: center;
    gap: 12rpx;
    min-width: 0;
  }

  &__pool-badge {
    flex-shrink: 0;
    min-height: 40rpx;
    padding: 0 14rpx;
    border-radius: 999rpx;
    display: inline-flex;
    align-items: center;
    color: #b06a00;
    background: #fff3df;
    font-size: 20rpx;
    font-weight: 800;
    line-height: 1;
  }

  &__pool-name,
  &__pool-note {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__pool-name {
    min-width: 0;
    color: #202326;
    font-size: 28rpx;
    font-weight: 800;
  }

  &__pool-note {
    margin-top: 6rpx;
    color: #7f8a91;
    font-size: 23rpx;
  }

  &__pool-delete {
    height: 56rpx;
    border-radius: 14rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #df513f;
    background: #fff2ef;
    font-size: 24rpx;
    font-weight: 800;
  }
}

@keyframes food-draw-in {
  from {
    transform: translateY(12rpx);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes food-draw-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes food-draw-pop {
  from {
    transform: scale(0.92);
  }

  to {
    transform: scale(1);
  }
}

@keyframes food-ticket-pop {
  from {
    transform: translateY(10rpx) scale(0.98);
    opacity: 0;
  }

  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}
</style>

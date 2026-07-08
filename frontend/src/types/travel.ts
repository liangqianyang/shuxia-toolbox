/** 地点类型：攻略图核心维度，每种带 emoji icon + 主题色 */
export type PoiType = 'sight' | 'food' | 'stay' | 'shop' | 'transit'

/** 活动类型（小时粒度时间线用，覆盖 PoiType 并增加 rest/shopping） */
export type ActivityType = 'sight' | 'food' | 'rest' | 'transit' | 'shopping'

/** 小时粒度活动条目（用于时间线卡片细化展示） */
export interface ActivityItem {
  /** 时间点，如「09:30」 */
  time: string
  /** 活动类型 */
  type: ActivityType
  /** 活动名称，如「参观正殿」 */
  name: string
  /** 时长（分钟）；可空 */
  duration?: number
}

/** 出行方式：决定后端路线规划模式 + 卡片交通图标 */
export type TravelMode = 'walking' | 'cycling' | 'driving' | 'transit' | 'train'

/** 旅行强度：影响 AI 每天排点密度、休息/用餐缓冲与路线跨度 */
export type TravelIntensity = 'relaxed' | 'standard' | 'packed'

/** 攻略图模板风格 */
export type GuideStyle = 'handbook' | 'minimal' | 'family' | 'couple' | 'weekend'

/** 手帐日记氛围：影响手帐卡片配色、装饰和 AI 文案口吻 */
export type DayMood = 'citywalk' | 'nature' | 'culture' | 'food' | 'family' | 'couple' | 'classic'

/** 地点（行程中的一个停留点） */
export interface PoiInfo {
  /** 开放时间 / 营业时间，未知时写出发前确认 */
  openHours: string
  /** 预约要求，如无需预约/需提前预约/节假日建议预约 */
  reservation: string
  /** 门票或消费提示，如免费/约 60 元/人均 80 */
  ticket: string
  /** 建议停留时长，如 1.5 小时 */
  duration: string
}

export interface Stop {
  /** 前端生成的稳定 id（v-for key + 编辑） */
  id: string
  /** 显示名，如「外滩」 */
  name: string
  /** 类型，决定 icon + 主题色 */
  type: PoiType
  /** 经度（腾讯坐标系 GCJ-02）；未 geocode 时为 null */
  lng: number | null
  /** 纬度 */
  lat: number | null
  /** 备注，如「夜景最美」「提前预约」 */
  note: string
  /** 时间段，自由文本，如「09:30-12:00」；可空 */
  time: string
  /** 到下一站的交通（AI 规划时由后端 directions 算出填充；手填行程为 null） */
  travelToNext: {
    mode: string
    distanceM: number
    durationMin: number
    detail?: string
    transit?: TransitRoute | null
  } | null
  /** 配图临时路径（chooseImage 返回）；可空 */
  photo: string | null
  /** 是否锁定：局部重排/重生成时优先保持该地点当前位置 */
  locked?: boolean
  /** 景点/餐厅可信信息，用于出发前确认和攻略细节 */
  poiInfo?: PoiInfo
  /** AI 生成的水彩手帐插画提示词，供后续图片生成服务使用 */
  illustrationPrompt?: string
  /** 手帐图中展示的旅行日记短句，用户可单独编辑，不影响实用备注 */
  handbookText?: string
  /** 小时粒度子活动（时间线升级后使用，AI 规划时返回）；可空 */
  activities?: ActivityItem[]
}

export interface TransitLine {
  vehicle: string
  title: string
  geton: string
  getoff: string
  stationCount: number
  distanceM: number
  durationMin: number
  price?: number
  startTime?: string
  endTime?: string
}

export interface TransitRoute {
  distanceM: number
  durationMin: number
  walkingM: number
  transferCount: number
  summary: string
  lines: TransitLine[]
}

/** 一天的行程 */
export interface Day {
  id: string
  /** 第几天（1-based，渲染「Day N」标题） */
  index: number
  /** 副标题，如「上海」；可空 */
  title: string
  /** 当天地点序列（顺序即路线顺序） */
  stops: Stop[]
  /** AI 标注的路线主题标签，如「西湖线」「灵隐茶山线」；用于多路线分区地图；可空 */
  routeTag?: string
  /** 手帐卡片氛围，用于自动挑选配色和装饰 */
  dayMood?: DayMood
  /** 手帐卡片底部今日一句话，用户可编辑 */
  handbookSummary?: string
}

/** 美食推荐（AI 生成，美食推荐图数据源） */
export interface FoodRec {
  /** 美食名，如「西湖醋鱼」 */
  name: string
  /** 推荐店名 */
  shop: string
  /** 必点菜 */
  dishes: string[]
  /** 简短点评 */
  note: string
  /** 餐厅可信信息（AI 生成或从行程内美食 stop 匹配而来）；可空 */
  poiInfo?: PoiInfo
}

/** 小红书文案（AI 生成，一键复制发布） */
export interface XhsCopy {
  title: string
  body: string
  tags: string[]
}

/** 地图视口（center + zoom，Web Mercator），后端按站点 bounds 算出，前端用它把站点投影到底图像素画清晰编号点 */
export interface MapViewport {
  centerLat: number
  centerLng: number
  zoom: number
}

/** 跨城段：出发地 → 目的地（用户所选出行方式）。耗时/里程优先用 AI 联网查的真实值，geocode 失败则无坐标 */
export interface IntercityLeg {
  from: string
  to: string
  /** 出行方式（用户所选，如 train） */
  mode: string
  distanceM: number
  durationMin: number
  /** 是否往返（含返程） */
  roundTrip: boolean
  /** 出发地坐标（路线概览图已含，前端一般不直接用）；geocode 失败兜底时为 null */
  lat: number | null
  lng: number | null
  /** AI/手动编辑的跨城备注（如「建议合肥南出发，提前购票」）；可空 */
  note?: string
}

/** 整个行程（编辑输入 + 渲染输入） */
export interface Trip {
  /** 行程标题，如「3 天上海行」 */
  title: string
  /** 出发地（可空） */
  origin: string
  /** 出行方式 */
  travelMode: TravelMode
  /** 攻略图模板风格 */
  guideStyle: GuideStyle
  /** 路线规划图真实底图 URL（staticMap 带折线；无坐标时为 null） */
  routeMapImage: string | null
  /** 景点分布图真实底图 URL（staticMap 仅打点；无坐标时为 null） */
  poiMapImage: string | null
  /** 游玩顺序图真实底图 URL（staticMap 编号点 + 按天连线；无坐标时为 null） */
  cityRouteMapImage: string | null
  /** 景点分布图视口（无标注底图 + 前端 canvas 编号点用）；无坐标时为 null */
  mapViewport: MapViewport | null
  /** 美食推荐（AI 生成）；手填行程为空 */
  food: FoodRec[]
  /** 实用贴士 / 最佳游玩方式（AI 生成）；手填行程为空 */
  tips: string[]
  /** 小红书文案（AI 生成）；手填行程为空串/空数组 */
  xhs: XhsCopy
  /** 跨城段（出发地→目的地，用户所选方式）；无出发地或 geocode 失败时为 null */
  intercity: IntercityLeg | null
  days: Day[]
  /** 必带物品（AI 生成，实物类：证件/电子设备/衣物/药品/雨具防晒等） */
  packingMust: string[]
  /** 注意事项（AI 生成，非实物提醒：预约/避坑/礼仪/安全等） */
  packingNotes: string[]
}

/** 攻略图渲染参数（控制版式，区别于 Trip 数据本身） */
export interface TravelParams {
  /** 卡片是否显示配图缩略图 */
  showPhotos: boolean
  /** 配色主题（首版仅 default） */
  theme: 'default'
}

/** geocode 接口返回的候选地点（GET /api/travel/geocode 的 data.candidates 项） */
export interface GeocodeCandidate {
  name: string
  title: string
  lng: number
  lat: number
  province: string
  city: string
  adcode: string
}

/** 传给各卡片渲染器的完整数据包 */
export interface TravelResult {
  trip: Trip
  params: TravelParams
}

export const DEFAULT_PARAMS: TravelParams = {
  showPhotos: true,
  theme: 'default',
}

/** 类型 → 主题色（hex 用于填色，rgb 用于 textColorOn 判黑白） */
export const POI_THEME: Record<PoiType, { hex: string; rgb: [number, number, number] }> = {
  sight: { hex: '#E8945A', rgb: [232, 148, 90] }, // 暖橙，呼应主色 #C8956C
  food: { hex: '#D9534F', rgb: [217, 83, 79] }, // 餐红
  stay: { hex: '#5B8DEF', rgb: [91, 141, 239] }, // 住宿蓝
  shop: { hex: '#9B59B6', rgb: [155, 89, 182] }, // 购物紫
  transit: { hex: '#27AE60', rgb: [39, 174, 96] }, // 交通绿
}

/** 类型 → emoji icon（UI 与 canvas 均用；canvas 真机表现见 guide/theme 退路开关） */
export const POI_ICON: Record<PoiType, string> = {
  sight: '📸',
  food: '🍜',
  stay: '🏨',
  shop: '🛍️',
  transit: '🚉',
}

/** 类型 → 中文标签（图例 / 卡片标签） */
export const POI_LABEL: Record<PoiType, string> = {
  sight: '景点',
  food: '美食',
  stay: '住宿',
  shop: '购物',
  transit: '交通',
}

/** POI 类型的可选顺序（picker 用） */
export const POI_TYPE_ORDER: readonly PoiType[] = ['sight', 'food', 'stay', 'shop', 'transit']

/** 出行方式 → emoji + 中文（输入选择 + 卡片站间衔接图标） */
export const TRAVEL_MODE_META: Record<TravelMode, { icon: string; label: string }> = {
  walking: { icon: '🚶', label: '步行' },
  cycling: { icon: '🚴', label: '骑行' },
  driving: { icon: '🚗', label: '驾车' },
  transit: { icon: '🚌', label: '公交' },
  train: { icon: '🚆', label: '火车' },
}

/** 出行方式可选顺序（分段选择器用） */
export const TRAVEL_MODE_ORDER: readonly TravelMode[] = ['walking', 'cycling', 'driving', 'transit', 'train']

/** 旅行强度 → 中文说明（AI 输入 + 前端选择） */
export const TRAVEL_INTENSITY_META: Record<TravelIntensity, { label: string; hint: string }> = {
  relaxed: { label: '轻松', hint: '少排点，多留休息' },
  standard: { label: '标准', hint: '兼顾效率和舒适' },
  packed: { label: '充实', hint: '多打卡，节奏更紧' },
}

/** 旅行强度可选顺序 */
export const TRAVEL_INTENSITY_ORDER: readonly TravelIntensity[] = ['relaxed', 'standard', 'packed']

export const GUIDE_STYLE_META: Record<GuideStyle, { label: string; hint: string }> = {
  handbook: { label: '清新手账', hint: '柔和水彩感' },
  minimal: { label: '极简地图', hint: '干净信息流' },
  family: { label: '亲子', hint: '明亮轻松' },
  couple: { label: '情侣', hint: '温柔纪念' },
  weekend: { label: '周末游', hint: '城市短途' },
}

export const GUIDE_STYLE_ORDER: readonly GuideStyle[] = ['handbook', 'minimal', 'family', 'couple', 'weekend']

export const DAY_MOOD_META: Record<DayMood, { label: string; hint: string }> = {
  citywalk: { label: '城市漫游', hint: '街巷和光影' },
  nature: { label: '自然风景', hint: '山水和花草' },
  culture: { label: '人文历史', hint: '古迹和故事' },
  food: { label: '美食日记', hint: '烟火和小店' },
  family: { label: '亲子轻松', hint: '明亮和松弛' },
  couple: { label: '浪漫纪念', hint: '温柔和合照' },
  classic: { label: '经典打卡', hint: '地标和路线' },
}

export const DAY_MOOD_ORDER: readonly DayMood[] = ['citywalk', 'nature', 'culture', 'food', 'family', 'couple', 'classic']

/** 生成稳定 id（页面新建 stop/day 时用） */
export function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function createEmptyPoiInfo(): PoiInfo {
  return {
    openHours: '',
    reservation: '',
    ticket: '',
    duration: '',
  }
}

/** 创建默认空行程（含一个空 Day 1） */
export function createEmptyTrip(): Trip {
  return {
    title: '',
    origin: '',
    travelMode: 'walking',
    guideStyle: 'handbook',
    routeMapImage: null,
    poiMapImage: null,
    cityRouteMapImage: null,
    mapViewport: null,
    food: [],
    tips: [],
    xhs: { title: '', body: '', tags: [] },
    intercity: null,
    packingMust: [],
    packingNotes: [],
    days: [{ id: genId('day'), index: 1, title: '', stops: [], dayMood: 'citywalk', handbookSummary: '' }],
  }
}

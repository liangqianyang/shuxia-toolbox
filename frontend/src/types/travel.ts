/** 地点类型：攻略图核心维度，每种带 emoji icon + 主题色 */
export type PoiType = 'sight' | 'food' | 'stay' | 'shop' | 'transit'

/** 出行方式：决定后端路线规划模式 + 卡片交通图标 */
export type TravelMode = 'walking' | 'cycling' | 'driving' | 'transit' | 'train'

/** 地点（行程中的一个停留点） */
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
  travelToNext: { mode: string; distanceM: number; durationMin: number } | null
  /** 配图临时路径（chooseImage 返回）；可空 */
  photo: string | null
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
}

/** 小红书文案（AI 生成，一键复制发布） */
export interface XhsCopy {
  title: string
  body: string
  tags: string[]
}

/** 跨城段：出发地 → 目的地（用户所选出行方式），由后端 geocode 出发地 + 估算距离/耗时 */
export interface IntercityLeg {
  from: string
  to: string
  /** 出行方式（用户所选，如 train） */
  mode: string
  distanceM: number
  durationMin: number
  /** 是否往返（含返程） */
  roundTrip: boolean
  /** 出发地坐标（路线概览图已含，前端一般不直接用） */
  lat: number
  lng: number
}

/** 整个行程（编辑输入 + 渲染输入） */
export interface Trip {
  /** 行程标题，如「3 天上海行」 */
  title: string
  /** 出发地（可空） */
  origin: string
  /** 出行方式 */
  travelMode: TravelMode
  /** 路线规划图真实底图 URL（staticMap 带折线；无坐标时为 null） */
  routeMapImage: string | null
  /** 景点分布图真实底图 URL（staticMap 仅打点；无坐标时为 null） */
  poiMapImage: string | null
  /** 游玩顺序图真实底图 URL（staticMap 编号点 + 按天连线；无坐标时为 null） */
  cityRouteMapImage: string | null
  /** 美食推荐（AI 生成）；手填行程为空 */
  food: FoodRec[]
  /** 实用贴士 / 最佳游玩方式（AI 生成）；手填行程为空 */
  tips: string[]
  /** 小红书文案（AI 生成）；手填行程为空串/空数组 */
  xhs: XhsCopy
  /** 跨城段（出发地→目的地，用户所选方式）；无出发地或 geocode 失败时为 null */
  intercity: IntercityLeg | null
  days: Day[]
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

/** 生成稳定 id（页面新建 stop/day 时用） */
export function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 创建默认空行程（含一个空 Day 1） */
export function createEmptyTrip(): Trip {
  return {
    title: '',
    origin: '',
    travelMode: 'walking',
    routeMapImage: null,
    poiMapImage: null,
    cityRouteMapImage: null,
    food: [],
    tips: [],
    xhs: { title: '', body: '', tags: [] },
    intercity: null,
    days: [{ id: genId('day'), index: 1, title: '', stops: [] }],
  }
}

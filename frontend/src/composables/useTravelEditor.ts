import { reactive, ref } from 'vue'
import type { Trip, Stop, PoiType, TravelMode, TravelIntensity, TravelParams, GeocodeCandidate, IntercityLeg, FoodRec, DayMood } from '@/types/travel'
import { createEmptyPoiInfo, createEmptyTrip, DAY_MOOD_ORDER, DEFAULT_PARAMS, genId } from '@/types/travel'

const STORAGE_KEY = 'shuxia-travel-trip'

/**
 * 后端 API 基址。
 * 开发期：微信开发者工具勾选「不校验合法域名 / TLS 版本」，且需让后端 9501 可被访问
 *   （容器需映射端口或暴露可访问地址）。
 * 上线前：把 API_BASE 改成线上域名，并在小程序后台配 request 合法域名、后端填腾讯 key。
 */
const API_BASE = (import.meta.env.VITE_API_BASE || 'http://127.0.0.1:9501').replace(/\/$/, '')

/**
 * AI 规划类请求（plan / refine-day / replace-stop）超时。
 * 后端这类请求要串联 AI 联网规划 + 多次地图 API（geocode / directions / staticMap），
 * 链路较长，120s 偶尔不够会前端先超时，放宽到 180s。
 * geocode 是腾讯 suggestion 轻量代理，走 uni.request 默认超时即可，不在此列。
 */
const AI_REQUEST_TIMEOUT_MS = 180000

/** 后端 API Key，随 X-API-Key 请求头带上（后端中间件校验）。本地/生产由 VITE_API_KEY 注入，需与后端 APP_API_KEY 一致。 */
const API_KEY = import.meta.env.VITE_API_KEY || ''

interface Envelope<T> {
  code: number
  message: string
  data: T
}

function uniRequest<T>(
  url: string,
  method: 'GET' | 'POST' = 'GET',
  data?: unknown,
  timeoutMs?: number,
): Promise<Envelope<T>> {
  return new Promise((resolve, reject) => {
    const opts: UniApp.RequestOptions = {
      url,
      method,
      data: data as Record<string, unknown> | undefined,
      header: { 'X-API-Key': API_KEY },
      success: (res) => resolve(res.data as Envelope<T>),
      fail: (err) => reject(new Error(err.errMsg || '网络请求失败')),
    }
    if (timeoutMs) opts.timeout = timeoutMs
    uni.request(opts)
  })
}

function hasCoords(stop: Stop): boolean {
  return stop.lng !== null && stop.lat !== null
}

function sortStopsByNearest(stops: Stop[]): Stop[] {
  const withCoords = stops.filter(hasCoords)
  const withoutCoords = stops.filter((s) => !hasCoords(s))
  if (withCoords.length < 2) return stops.slice()

  const remaining = withCoords.slice(1)
  const sorted = [withCoords[0]]
  while (remaining.length > 0) {
    const last = sorted[sorted.length - 1]
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (let i = 0; i < remaining.length; i++) {
      const distance = roughDistanceM(last, remaining[i])
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = i
      }
    }
    sorted.push(remaining.splice(bestIndex, 1)[0])
  }

  return [...sorted, ...withoutCoords]
}

function roughDistanceM(a: Stop, b: Stop): number {
  if (!hasCoords(a) || !hasCoords(b)) return Number.POSITIVE_INFINITY
  const lat1 = (a.lat as number) * Math.PI / 180
  const lat2 = (b.lat as number) * Math.PI / 180
  const dLat = lat2 - lat1
  const dLng = ((b.lng as number) - (a.lng as number)) * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

function guessDestinationFromTitle(title: string): string {
  return title.replace(/旅游|旅行|攻略|行程|路线|[0-9０-９]+天/g, '').trim() || title.trim()
}

function normalizeDayMood(value: unknown): DayMood {
  return DAY_MOOD_ORDER.includes(value as DayMood) ? (value as DayMood) : 'citywalk'
}

function mergeRefinedStops(oldStops: Stop[], refinedStops: Array<Partial<Stop> & {
  name: string
  type: PoiType
  time: string
  note: string
  lng: number | null
  lat: number | null
}>): Stop[] {
  const maxLen = Math.max(oldStops.length, refinedStops.length)
  const out: Stop[] = []
  for (let i = 0; i < maxLen; i++) {
    const old = oldStops[i]
    const refined = refinedStops[i]
    if (old?.locked) {
      out.push({
        ...old,
        lng: refined?.lng ?? old.lng,
        lat: refined?.lat ?? old.lat,
        travelToNext: refined?.travelToNext ?? old.travelToNext,
        locked: true,
        poiInfo: old.poiInfo ?? refined?.poiInfo ?? createEmptyPoiInfo(),
        illustrationPrompt: old.illustrationPrompt ?? refined?.illustrationPrompt ?? '',
        handbookText: old.handbookText ?? refined?.handbookText ?? '',
      })
      continue
    }
    if (!refined) continue
    out.push({
      id: typeof refined.id === 'string' ? refined.id : genId('stop'),
      name: refined.name,
      type: refined.type,
      lng: refined.lng ?? null,
      lat: refined.lat ?? null,
      note: refined.note ?? '',
      time: refined.time ?? '',
      travelToNext: refined.travelToNext ?? null,
      photo: refined.photo ?? null,
      locked: Boolean(refined.locked),
      poiInfo: refined.poiInfo ?? createEmptyPoiInfo(),
      illustrationPrompt: refined.illustrationPrompt ?? '',
      handbookText: refined.handbookText ?? '',
    })
  }
  return out
}

/** 行程编辑器：增删改 day/stop、地理编码、本地草稿读写 */
export function useTravelEditor() {
  const trip = reactive<Trip>(createEmptyTrip())
  const params = reactive<TravelParams>({ ...DEFAULT_PARAMS })
  const dirty = ref(false)
  const geocoding = ref(false)
  const geocodeError = ref('')

  function markDirty(): void {
    dirty.value = true
  }

  // ---- Day ----
  function addDay(): void {
    trip.days.push({ id: genId('day'), index: trip.days.length + 1, title: '', stops: [], dayMood: 'citywalk', handbookSummary: '' })
    markDirty()
  }
  function removeDay(dayId: string): void {
    const idx = trip.days.findIndex((d) => d.id === dayId)
    if (idx < 0) return
    trip.days.splice(idx, 1)
    trip.days.forEach((d, i) => (d.index = i + 1))
    markDirty()
  }
  function updateDayTitle(dayId: string, title: string): void {
    const d = trip.days.find((it) => it.id === dayId)
    if (d) {
      d.title = title
      markDirty()
    }
  }

  // ---- Stop ----
  function addStop(dayId: string, type: PoiType = 'sight'): void {
    const d = trip.days.find((it) => it.id === dayId)
    if (!d) return
    d.stops.push({
      id: genId('stop'),
      name: '',
      type,
      lng: null,
      lat: null,
      note: '',
      time: '',
      travelToNext: null,
      photo: null,
      locked: false,
      poiInfo: createEmptyPoiInfo(),
      illustrationPrompt: '',
      handbookText: '',
    })
    markDirty()
  }
  function updateStop(dayId: string, stopId: string, patch: Partial<Stop>): void {
    const s = trip.days.find((d) => d.id === dayId)?.stops.find((it) => it.id === stopId)
    if (s) {
      Object.assign(s, patch)
      markDirty()
    }
  }
  function removeStop(dayId: string, stopId: string): void {
    const d = trip.days.find((it) => it.id === dayId)
    if (!d) return
    const idx = d.stops.findIndex((s) => s.id === stopId)
    if (idx >= 0) {
      d.stops.splice(idx, 1)
      markDirty()
    }
  }
  function moveStop(dayId: string, stopId: string, dir: -1 | 1): void {
    const d = trip.days.find((it) => it.id === dayId)
    if (!d) return
    const i = d.stops.findIndex((s) => s.id === stopId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= d.stops.length) return
    const tmp = d.stops[i]
    d.stops[i] = d.stops[j]
    d.stops[j] = tmp
    markDirty()
  }

  function reorderDayByRoute(dayId: string): { ok: boolean; message: string } {
    const d = trip.days.find((it) => it.id === dayId)
    if (!d) return { ok: false, message: '未找到这一天' }
    const named = d.stops.filter((s) => s.name.trim())
    if (named.length < 3) return { ok: false, message: '至少 3 个地点才需要重排' }

    const movable = d.stops.filter((s) => !s.locked)
    const movableWithCoords = movable.filter(hasCoords)
    if (movableWithCoords.length < 2) {
      return { ok: false, message: '可重排地点坐标不足，请先搜索地点坐标' }
    }

    const sortedMovable = sortStopsByNearest(movable)
    let mi = 0
    d.stops = d.stops.map((s) => (s.locked ? s : sortedMovable[mi++]))
    markDirty()
    const lockedCount = d.stops.filter((s) => s.locked).length
    return {
      ok: true,
      message: lockedCount > 0 ? `已重排，保留 ${lockedCount} 个锁定地点` : '已按顺路顺序重排',
    }
  }

  // ---- 跨城段 / 出行清单编辑（改后由页面调 renderAll 重画对应卡片）----
  function updateIntercity(patch: Partial<IntercityLeg>): void {
    if (!trip.intercity) return
    Object.assign(trip.intercity, patch)
    markDirty()
  }
  /** 出行清单分组：'must'=必带物品，'note'=注意事项 */
  function packingArr(cat: 'must' | 'note'): string[] {
    return cat === 'must' ? trip.packingMust : trip.packingNotes
  }
  function updatePacking(cat: 'must' | 'note', index: number, text: string): void {
    const arr = packingArr(cat)
    if (index < 0 || index >= arr.length) return
    arr[index] = text
    markDirty()
  }
  function addPacking(cat: 'must' | 'note', text = ''): void {
    packingArr(cat).push(text)
    markDirty()
  }
  function removePacking(cat: 'must' | 'note', index: number): void {
    const arr = packingArr(cat)
    if (index < 0 || index >= arr.length) return
    arr.splice(index, 1)
    markDirty()
  }
  function movePacking(cat: 'must' | 'note', index: number, dir: -1 | 1): void {
    const arr = packingArr(cat)
    const j = index + dir
    if (index < 0 || j < 0 || j >= arr.length) return
    const tmp = arr[index]
    arr[index] = arr[j]
    arr[j] = tmp
    markDirty()
  }

  // ---- 必吃美食编辑（改后由页面调 renderAll 重画美食推荐图）----
  function updateFood(index: number, patch: Partial<FoodRec>): void {
    if (index < 0 || index >= trip.food.length) return
    Object.assign(trip.food[index], patch)
    markDirty()
  }
  function addFood(): void {
    trip.food.push({ name: '', shop: '', dishes: [], note: '' })
    markDirty()
  }
  function removeFood(index: number): void {
    if (index < 0 || index >= trip.food.length) return
    trip.food.splice(index, 1)
    markDirty()
  }
  function moveFood(index: number, dir: -1 | 1): void {
    const j = index + dir
    if (index < 0 || j < 0 || j >= trip.food.length) return
    const tmp = trip.food[index]
    trip.food[index] = trip.food[j]
    trip.food[j] = tmp
    markDirty()
  }

  // ---- AI 行程规划 ----
  /** 调后端 /api/travel/plan 生成行程并整段替换 trip（生成新 id，带坐标/时间/备注/美食/贴士/文案，photo 留空） */
  async function planWithAi(input: {
    origin: string
    destination: string
    travelMode: TravelMode
    intensity: TravelIntensity
    days: number
    dailyHours: number[]
    roundTrip: boolean
    preferences: string
    departureDate: string
    sights: string
    foods: string
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await uniRequest<{
        title: string
        routeMapImage: string | null
        poiMapImage: string | null
        cityRouteMapImage: string | null
        mapViewport: { centerLat: number; centerLng: number; zoom: number } | null
        food: Array<{ name: string; shop: string; dishes: string[]; note: string; poiInfo?: Stop['poiInfo'] }>
        tips: string[]
        xhs: { title: string; body: string; tags: string[] }
        packingMust: string[]
        packingNotes: string[]
        intercity: {
          from: string
          to: string
          mode: string
          distanceM: number
          durationMin: number
          roundTrip: boolean
          lat: number | null
          lng: number | null
          note?: string
        } | null
        days: Array<{
          index: number
          title: string
          routeTag?: string
          dayMood?: string
          handbookSummary?: string
          stops: Array<{ name: string; type: PoiType; time: string; note: string; lng: number | null; lat: number | null; poiInfo?: Stop['poiInfo']; illustrationPrompt?: string; handbookText?: string; travelToNext: Stop['travelToNext'] }>
        }>
      }>(`${API_BASE}/api/travel/plan`, 'POST', {
        origin: input.origin,
        destination: input.destination,
        travel_mode: input.travelMode,
        intensity: input.intensity,
        days: input.days,
        daily_hours: input.dailyHours,
        round_trip: input.roundTrip,
        preferences: input.preferences,
        departure_date: input.departureDate,
        sights: input.sights,
        foods: input.foods,
      }, AI_REQUEST_TIMEOUT_MS)
      if (res.code !== 0) {
        return { ok: false, error: res.message || '规划失败' }
      }
      const data = res.data
      trip.title = data.title
      trip.origin = input.origin
      trip.travelMode = input.travelMode
      trip.routeMapImage = data.routeMapImage ?? null
      trip.poiMapImage = data.poiMapImage ?? null
      trip.cityRouteMapImage = data.cityRouteMapImage ?? null
      trip.mapViewport = data.mapViewport ?? null
      trip.food = data.food ?? []
      trip.tips = data.tips ?? []
      trip.xhs = data.xhs ?? { title: '', body: '', tags: [] }
      trip.intercity = data.intercity ?? null
      trip.packingMust = data.packingMust ?? []
      trip.packingNotes = data.packingNotes ?? []
      trip.days = data.days.map((d) => ({
        id: genId('day'),
        index: d.index,
        title: d.title,
        routeTag: d.routeTag,
        dayMood: normalizeDayMood(d.dayMood),
        handbookSummary: d.handbookSummary ?? '',
        stops: d.stops.map((s) => ({
          id: genId('stop'),
          name: s.name,
          type: s.type,
          lng: s.lng,
          lat: s.lat,
          note: s.note,
          time: s.time,
          travelToNext: s.travelToNext ?? null,
          photo: null,
          locked: false,
          poiInfo: s.poiInfo ?? createEmptyPoiInfo(),
          illustrationPrompt: s.illustrationPrompt ?? '',
          handbookText: s.handbookText ?? '',
        })),
      }))
      markDirty()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : '网络错误' }
    }
  }

  async function refineDayWithAi(
    dayId: string,
    input: { intensity: TravelIntensity; dailyHours?: number },
  ): Promise<{ ok: boolean; error?: string }> {
    const day = trip.days.find((d) => d.id === dayId)
    if (!day) return { ok: false, error: '未找到这一天' }
    const lockedStops = day.stops
      .map((stop, slot) => (stop.locked ? { slot, stop } : null))
      .filter((item): item is { slot: number; stop: Stop } => item !== null)

    try {
      const res = await uniRequest<{
        day: {
          index: number
          title: string
          routeTag?: string
          dayMood?: string
          handbookSummary?: string
          stops: Array<{
            id?: string
            name: string
            type: PoiType
            time: string
            note: string
            lng: number | null
            lat: number | null
            photo?: string | null
            locked?: boolean
            poiInfo?: Stop['poiInfo']
            illustrationPrompt?: string
            handbookText?: string
            travelToNext: Stop['travelToNext']
          }>
        }
        routeMapImage: string | null
        poiMapImage: string | null
        cityRouteMapImage: string | null
        mapViewport: { centerLat: number; centerLng: number; zoom: number } | null
      }>(`${API_BASE}/api/travel/refine-day`, 'POST', {
        destination: trip.intercity?.to || guessDestinationFromTitle(trip.title),
        day_index: day.index,
        day,
        days: trip.days,
        locked_stops: lockedStops,
        travel_mode: trip.travelMode,
        intensity: input.intensity,
        daily_hours: input.dailyHours ?? 8,
        intercity: trip.intercity,
      }, AI_REQUEST_TIMEOUT_MS)
      if (res.code !== 0) {
        return { ok: false, error: res.message || '重写失败' }
      }

      const data = res.data
      day.title = data.day.title
      day.routeTag = data.day.routeTag
      day.dayMood = normalizeDayMood(data.day.dayMood ?? day.dayMood)
      day.handbookSummary = data.day.handbookSummary ?? day.handbookSummary ?? ''
      day.stops = mergeRefinedStops(day.stops, data.day.stops)
      trip.routeMapImage = data.routeMapImage ?? null
      trip.poiMapImage = data.poiMapImage ?? null
      trip.cityRouteMapImage = data.cityRouteMapImage ?? null
      trip.mapViewport = data.mapViewport ?? null
      markDirty()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : '网络错误' }
    }
  }

  async function replaceStopWithAi(
    dayId: string,
    stopId: string,
    input: { intensity: TravelIntensity; dailyHours?: number },
  ): Promise<{ ok: boolean; error?: string }> {
    const day = trip.days.find((d) => d.id === dayId)
    if (!day) return { ok: false, error: '未找到这一天' }
    const stopIndex = day.stops.findIndex((stop) => stop.id === stopId)
    if (stopIndex < 0) return { ok: false, error: '未找到这个地点' }
    const targetStop = day.stops[stopIndex]
    if (targetStop.locked) return { ok: false, error: '锁定地点不能替换，请先解锁' }

    const lockedStops = day.stops
      .map((stop, slot) => (stop.locked ? { slot, stop } : null))
      .filter((item): item is { slot: number; stop: Stop } => item !== null)

    try {
      const res = await uniRequest<{
        day: {
          index: number
          title: string
          routeTag?: string
          dayMood?: string
          handbookSummary?: string
          stops: Array<{
            id?: string
            name: string
            type: PoiType
            time: string
            note: string
            lng: number | null
            lat: number | null
            photo?: string | null
            locked?: boolean
            poiInfo?: Stop['poiInfo']
            illustrationPrompt?: string
            handbookText?: string
            travelToNext: Stop['travelToNext']
          }>
        }
        routeMapImage: string | null
        poiMapImage: string | null
        cityRouteMapImage: string | null
        mapViewport: { centerLat: number; centerLng: number; zoom: number } | null
      }>(`${API_BASE}/api/travel/replace-stop`, 'POST', {
        destination: trip.intercity?.to || guessDestinationFromTitle(trip.title),
        day_index: day.index,
        stop_index: stopIndex,
        day,
        days: trip.days,
        target_stop: targetStop,
        locked_stops: lockedStops,
        travel_mode: trip.travelMode,
        intensity: input.intensity,
        daily_hours: input.dailyHours ?? 8,
        intercity: trip.intercity,
      }, AI_REQUEST_TIMEOUT_MS)
      if (res.code !== 0) {
        return { ok: false, error: res.message || '替换失败' }
      }

      const data = res.data
      day.title = data.day.title || day.title
      day.routeTag = data.day.routeTag
      day.dayMood = normalizeDayMood(data.day.dayMood ?? day.dayMood)
      day.handbookSummary = data.day.handbookSummary ?? day.handbookSummary ?? ''
      day.stops = mergeRefinedStops(day.stops, data.day.stops)
      trip.routeMapImage = data.routeMapImage ?? null
      trip.poiMapImage = data.poiMapImage ?? null
      trip.cityRouteMapImage = data.cityRouteMapImage ?? null
      trip.mapViewport = data.mapViewport ?? null
      markDirty()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : '网络错误' }
    }
  }

  // ---- 地理编码 ----
  async function geocodeStop(_dayId: string, _stopId: string, query: string): Promise<GeocodeCandidate[]> {
    geocoding.value = true
    geocodeError.value = ''
    try {
      const res = await uniRequest<{ candidates: GeocodeCandidate[] }>(
        `${API_BASE}/api/travel/geocode?q=${encodeURIComponent(query)}`,
      )
      if (res.code !== 0) {
        geocodeError.value = res.message || '查询失败'
        return []
      }
      return res.data?.candidates ?? []
    } catch (e) {
      geocodeError.value = e instanceof Error ? e.message : '网络错误'
      return []
    } finally {
      geocoding.value = false
    }
  }

  async function saveTripToCloud(): Promise<{ ok: boolean; code?: string; sharePath?: string; error?: string }> {
    try {
      const plainTrip = JSON.parse(JSON.stringify(trip)) as Trip
      const res = await uniRequest<{ code: string; sharePath: string }>(
        `${API_BASE}/api/travel/share`,
        'POST',
        { trip: plainTrip },
      )
      if (res.code !== 0) return { ok: false, error: res.message || '云保存失败' }
      dirty.value = false
      return { ok: true, code: res.data.code, sharePath: res.data.sharePath }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : '网络错误' }
    }
  }

  async function loadSharedTrip(code: string): Promise<{ ok: boolean; error?: string }> {
    const shareCode = code.trim()
    if (!shareCode) return { ok: false, error: '请输入分享码' }
    try {
      const res = await uniRequest<{ trip: Partial<Trip> }>(
        `${API_BASE}/api/travel/share/${encodeURIComponent(shareCode)}`,
      )
      if (res.code !== 0) return { ok: false, error: res.message || '导入失败' }
      if (!applyTripData(res.data.trip)) return { ok: false, error: '分享行程数据不完整' }
      dirty.value = true
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : '网络错误' }
    }
  }

  // ---- 本地草稿 ----
  function loadFromStorage(): void {
    try {
      const raw = uni.getStorageSync(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as Partial<Trip>
      if (applyTripData(saved)) {
        dirty.value = false
      }
    } catch {
      /* 草稿损坏则忽略 */
    }
  }

  function applyTripData(saved: Partial<Trip> | undefined): boolean {
    if (!saved || !Array.isArray(saved.days) || saved.days.length === 0) return false
    const empty = createEmptyTrip()
    trip.title = saved.title || ''
    trip.origin = saved.origin || ''
    trip.travelMode = saved.travelMode || 'walking'
    trip.guideStyle = saved.guideStyle || 'handbook'
    trip.routeMapImage = saved.routeMapImage ?? null
    trip.poiMapImage = saved.poiMapImage ?? null
    trip.cityRouteMapImage = saved.cityRouteMapImage ?? null
    trip.mapViewport = saved.mapViewport ?? null
    trip.food = saved.food ?? []
    trip.tips = saved.tips ?? []
    trip.xhs = saved.xhs ?? empty.xhs
    trip.intercity = saved.intercity ?? null
    if (Array.isArray(saved.packingMust) && Array.isArray(saved.packingNotes)) {
      trip.packingMust = saved.packingMust
      trip.packingNotes = saved.packingNotes
    } else {
      const legacy = (saved as { packingTips?: unknown }).packingTips
      const arr = Array.isArray(legacy) ? legacy.filter((t): t is string => typeof t === 'string') : []
      const half = Math.ceil(arr.length / 2)
      trip.packingMust = arr.slice(0, half)
      trip.packingNotes = arr.slice(half)
    }
    trip.days = saved.days
    return true
  }
  function saveToStorage(): void {
    try {
      uni.setStorageSync(STORAGE_KEY, JSON.stringify(trip))
      dirty.value = false
    } catch {
      /* 存储满则忽略 */
    }
  }
  function reset(): void {
    const empty = createEmptyTrip()
    trip.title = empty.title
    trip.origin = empty.origin
    trip.travelMode = empty.travelMode
    trip.guideStyle = empty.guideStyle
    trip.routeMapImage = empty.routeMapImage
    trip.poiMapImage = empty.poiMapImage
    trip.cityRouteMapImage = empty.cityRouteMapImage
    trip.mapViewport = empty.mapViewport
    trip.food = empty.food
    trip.tips = empty.tips
    trip.xhs = empty.xhs
    trip.intercity = empty.intercity
    trip.packingMust = empty.packingMust
    trip.packingNotes = empty.packingNotes
    trip.days = empty.days
    Object.assign(params, DEFAULT_PARAMS)
    dirty.value = false
  }

  return {
    trip,
    params,
    dirty,
    geocoding,
    geocodeError,
    markDirty,
    addDay,
    removeDay,
    updateDayTitle,
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
    reset,
  }
}

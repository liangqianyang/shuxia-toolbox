import { reactive, ref } from 'vue'
import type { Trip, Stop, PoiType, TravelMode, TravelParams, GeocodeCandidate } from '@/types/travel'
import { createEmptyTrip, DEFAULT_PARAMS, genId } from '@/types/travel'

const STORAGE_KEY = 'shuxia-travel-trip'

/**
 * 后端 API 基址。
 * 开发期：微信开发者工具勾选「不校验合法域名 / TLS 版本」，且需让后端 9501 可被访问
 *   （容器需映射端口或暴露可访问地址）。
 * 上线前：把 API_BASE 改成线上域名，并在小程序后台配 request 合法域名、后端填腾讯 key。
 */
const API_BASE = 'http://127.0.0.1:9501'

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
      success: (res) => resolve(res.data as Envelope<T>),
      fail: (err) => reject(new Error(err.errMsg || '网络请求失败')),
    }
    if (timeoutMs) opts.timeout = timeoutMs
    uni.request(opts)
  })
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
    trip.days.push({ id: genId('day'), index: trip.days.length + 1, title: '', stops: [] })
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

  // ---- AI 行程规划 ----
  /** 调后端 /api/travel/plan 生成行程并整段替换 trip（生成新 id，带坐标/时间/备注/美食/贴士/文案，photo 留空） */
  async function planWithAi(input: {
    origin: string
    destination: string
    travelMode: TravelMode
    days: number
    dailyHours: number[]
    roundTrip: boolean
    preferences: string
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await uniRequest<{
        title: string
        routeMapImage: string | null
        poiMapImage: string | null
        cityRouteMapImage: string | null
        food: Array<{ name: string; shop: string; dishes: string[]; note: string }>
        tips: string[]
        xhs: { title: string; body: string; tags: string[] }
        intercity: {
          from: string
          to: string
          mode: string
          distanceM: number
          durationMin: number
          roundTrip: boolean
          lat: number
          lng: number
        } | null
        days: Array<{
          index: number
          title: string
          stops: Array<{ name: string; type: PoiType; time: string; note: string; lng: number | null; lat: number | null; travelToNext: { mode: string; distanceM: number; durationMin: number } | null }>
        }>
      }>(`${API_BASE}/api/travel/plan`, 'POST', {
        origin: input.origin,
        destination: input.destination,
        travel_mode: input.travelMode,
        days: input.days,
        daily_hours: input.dailyHours,
        round_trip: input.roundTrip,
        preferences: input.preferences,
      }, 120000)
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
      trip.food = data.food ?? []
      trip.tips = data.tips ?? []
      trip.xhs = data.xhs ?? { title: '', body: '', tags: [] }
      trip.intercity = data.intercity ?? null
      trip.days = data.days.map((d) => ({
        id: genId('day'),
        index: d.index,
        title: d.title,
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
        })),
      }))
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

  // ---- 本地草稿 ----
  function loadFromStorage(): void {
    try {
      const raw = uni.getStorageSync(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as Partial<Trip>
      if (saved && Array.isArray(saved.days) && saved.days.length) {
        const empty = createEmptyTrip()
        trip.title = saved.title || ''
        trip.origin = saved.origin || ''
        trip.travelMode = saved.travelMode || 'walking'
        trip.routeMapImage = saved.routeMapImage ?? null
        trip.poiMapImage = saved.poiMapImage ?? null
        trip.cityRouteMapImage = saved.cityRouteMapImage ?? null
        trip.food = saved.food ?? []
        trip.tips = saved.tips ?? []
        trip.xhs = saved.xhs ?? empty.xhs
        trip.intercity = saved.intercity ?? null
        trip.days = saved.days
        dirty.value = false
      }
    } catch {
      /* 草稿损坏则忽略 */
    }
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
    trip.routeMapImage = empty.routeMapImage
    trip.poiMapImage = empty.poiMapImage
    trip.cityRouteMapImage = empty.cityRouteMapImage
    trip.food = empty.food
    trip.tips = empty.tips
    trip.xhs = empty.xhs
    trip.intercity = empty.intercity
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
    geocodeStop,
    planWithAi,
    loadFromStorage,
    saveToStorage,
    reset,
  }
}

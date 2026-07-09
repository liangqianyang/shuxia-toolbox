import type { Trip } from '@/types/travel'
import { CARD_W, CARD_H } from './theme'
import { renderRouteCard } from './routeCard'
import { renderPoiCard } from './poiCard'
import { renderFoodCard } from './foodCard'
import { renderTimelineCard } from './timelineCard'
import { renderPackingCard } from './packingCard'
import { renderMultiRouteCard } from './multiRouteCard'
import { renderPhotoTimelineCard } from './photoTimelineCard'
import { renderSubwayCard } from './subwayCard'
import { renderHandbookDayCard } from './handbookDayCard'
import { renderDailyPosterCard } from './dailyPosterCard'

export { CARD_W, CARD_H } from './theme'

/**
 * 攻略卡片注册表。页面遍历生成多张独立图；每张固定 1080×1440。
 * mapSource 指明该卡需要预加载哪张真实底图（'route'→routeMapImage，'poi'→poiMapImage，null→不需要）。
 * needsStopPhotos 为 true 时，useTravelImages 会预加载所有 stop.photo 并以 stopPhotos Map 传入 render。
 */
export interface GuideCard {
  key: string
  /** 画廊标签 + 保存文件提示 */
  label: string
  /** 这张图适合什么场景 */
  hint: string
  /** 用于画廊分组和弱化高级图 */
  group: 'core' | 'map' | 'share' | 'extra'
  /** 需要的真实底图来源 */
  mapSource: 'route' | 'poi' | 'cityRoute' | null
  /** 是否需要预加载每个 stop 的用户照片（stop.photo 临时路径 → CanvasImageSource） */
  needsStopPhotos?: boolean
  /** 渲染函数。stopPhotos 仅在 needsStopPhotos=true 时由 useTravelImages 注入 */
  render: (
    ctx: CanvasRenderingContext2D,
    trip: Trip,
    mapImage: CanvasImageSource | null,
    bgImage: CanvasImageSource | null,
    stopPhotos?: Map<string, CanvasImageSource>,
  ) => void
}

export const GUIDE_CARDS: GuideCard[] = [
  {
    key: 'route-real',
    label: '路线规划图',
    hint: '出发前确认整体方向和跨城/市内主路线',
    group: 'core',
    mapSource: 'route',
    render: (ctx, trip, map, bg) => renderRouteCard(ctx, trip, 'real', map, bg),
  },
  {
    key: 'route-schematic',
    label: '游玩顺序图',
    hint: '弱化真实地图，突出从第 1 站到最后一站的顺序',
    group: 'extra',
    mapSource: 'cityRoute',
    render: (ctx, trip, map, bg) => renderRouteCard(ctx, trip, 'schematic', map, bg),
  },
  {
    key: 'route-by-day',
    label: '分日路线图',
    hint: '按 Day 区分颜色，适合多天行程总览',
    group: 'map',
    mapSource: 'cityRoute',
    render: (ctx, trip, map, bg) => renderRouteCard(ctx, trip, 'by-day', map, bg),
  },
  {
    key: 'multi-route',
    label: '多路线分区图',
    hint: '适合多天、多片区行程，用来解释每天玩哪一块',
    group: 'extra',
    mapSource: 'cityRoute',
    render: (ctx, trip, map, bg) => renderMultiRouteCard(ctx, trip, map, bg),
  },
  {
    key: 'poi',
    label: '景点分布图',
    hint: '看景点在城市里的空间分布，方便判断是否绕路',
    group: 'map',
    mapSource: 'poi',
    render: (ctx, trip, map, bg) => renderPoiCard(ctx, trip, map, bg),
  },
  {
    key: 'timeline',
    label: '行程时间线',
    hint: '当天照着走，重点看时间、地点和站间交通',
    group: 'core',
    mapSource: null,
    render: (ctx, trip, _map, bg) => renderTimelineCard(ctx, trip, bg),
  },
  {
    key: 'photo-timeline',
    label: '照片时间线',
    hint: '有照片时生成回忆感更强的分享图',
    group: 'share',
    mapSource: null,
    needsStopPhotos: true,
    render: (ctx, trip, _map, bg, photos) => renderPhotoTimelineCard(ctx, trip, null, bg, photos),
  },
  {
    key: 'subway',
    label: '地铁公交换乘图',
    hint: '有公共交通数据时，单独展示地铁/公交换乘',
    group: 'map',
    mapSource: null,
    render: (ctx, trip, _map, bg) => renderSubwayCard(ctx, trip, null, bg),
  },
  {
    key: 'food',
    label: '美食推荐图',
    hint: '单独发给同行人，快速确认吃什么',
    group: 'share',
    mapSource: null,
    render: (ctx, trip, _map, bg) => renderFoodCard(ctx, trip, bg),
  },
  {
    key: 'packing',
    label: '出行清单',
    hint: '出发前一天检查必带物品和注意事项',
    group: 'core',
    mapSource: null,
    render: (ctx, trip, _map, bg) => renderPackingCard(ctx, trip, bg),
  },
]

export function guideCardsForTrip(trip?: Trip): GuideCard[] {
  if (!trip) return GUIDE_CARDS.slice()
  const visitStopCount = trip.days.reduce(
    (sum, day) => sum + day.stops.filter((stop) => stop.name.trim() && stop.type !== 'transit').length,
    0,
  )
  const activeDays = trip.days.filter((day) => day.stops.some((stop) => stop.name.trim() && stop.type !== 'transit'))
  const hasPhotos = trip.days.some((day) => day.stops.some((stop) => Boolean(stop.photo)))
  const hasTransit = trip.days.some((day) =>
    day.stops.some((stop) => (stop.travelToNext?.transit?.lines?.length ?? 0) > 0),
  )
  const hasFood = trip.food.length > 0
  const hasPacking = trip.packingMust.length > 0 || trip.packingNotes.length > 0
  const shouldInclude = (card: GuideCard): boolean => {
    if (card.key === 'route-by-day') return activeDays.length >= 2
    if (card.key === 'multi-route') return activeDays.length >= 2 && visitStopCount >= 6
    if (card.key === 'photo-timeline') return hasPhotos
    if (card.key === 'subway') return hasTransit
    if (card.key === 'food') return hasFood
    if (card.key === 'packing') return hasPacking
    return visitStopCount > 0
  }
  const handbookCards: GuideCard[] = trip.days
    .filter((day) => day.stops.some((stop) => stop.name.trim()))
    .map((day) => ({
      key: `handbook-day-${day.id}`,
      label: `手帐 Day ${day.index}`,
      hint: '适合发朋友圈/小红书的单日氛围图',
      group: 'share' as const,
      mapSource: null,
      needsStopPhotos: true,
      render: (ctx, currentTrip, _map, bg, photos) => renderHandbookDayCard(ctx, currentTrip, day.id, bg, photos),
    }))
  const dailyPosterCards: GuideCard[] = activeDays.map((day) => ({
    key: `daily-poster-${day.id}`,
    label: `Day ${day.index}攻略海报`,
    hint: '单日地图、时间线、美食和避坑提醒，适合作为多日套图详情页',
    group: 'core' as const,
    mapSource: 'cityRoute' as const,
    render: (ctx, currentTrip, map, bg) => renderDailyPosterCard(ctx, currentTrip, day.id, map, bg),
  }))
  const baseCards = GUIDE_CARDS.filter(shouldInclude)
  return [
    ...baseCards.slice(0, 5),
    ...dailyPosterCards,
    ...handbookCards,
    ...baseCards.slice(5),
  ]
}

/** 取该卡对应的真实底图 URL（无则 null） */
export function cardMapUrl(trip: Trip, card: GuideCard): string | null {
  if (card.mapSource === 'route') return trip.routeMapImage
  if (card.mapSource === 'poi') return trip.poiMapImage
  if (card.mapSource === 'cityRoute') return trip.cityRouteMapImage
  return null
}

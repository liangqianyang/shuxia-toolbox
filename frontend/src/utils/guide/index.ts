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
    mapSource: 'route',
    render: (ctx, trip, map, bg) => renderRouteCard(ctx, trip, 'real', map, bg),
  },
  {
    key: 'route-schematic',
    label: '游玩顺序图',
    mapSource: 'cityRoute',
    render: (ctx, trip, map, bg) => renderRouteCard(ctx, trip, 'schematic', map, bg),
  },
  {
    key: 'route-by-day',
    label: '分日路线图',
    mapSource: 'cityRoute',
    render: (ctx, trip, map, bg) => renderRouteCard(ctx, trip, 'by-day', map, bg),
  },
  {
    key: 'multi-route',
    label: '多路线分区图',
    mapSource: 'cityRoute',
    render: (ctx, trip, map, bg) => renderMultiRouteCard(ctx, trip, map, bg),
  },
  {
    key: 'poi',
    label: '景点分布图',
    mapSource: 'poi',
    render: (ctx, trip, map, bg) => renderPoiCard(ctx, trip, map, bg),
  },
  {
    key: 'timeline',
    label: '行程时间线',
    mapSource: null,
    render: (ctx, trip, _map, bg) => renderTimelineCard(ctx, trip, bg),
  },
  {
    key: 'photo-timeline',
    label: '照片时间线',
    mapSource: null,
    needsStopPhotos: true,
    render: (ctx, trip, _map, bg, photos) => renderPhotoTimelineCard(ctx, trip, null, bg, photos),
  },
  {
    key: 'subway',
    label: '地铁公交换乘图',
    mapSource: null,
    render: (ctx, trip, _map, bg) => renderSubwayCard(ctx, trip, null, bg),
  },
  {
    key: 'food',
    label: '美食推荐图',
    mapSource: null,
    render: (ctx, trip, _map, bg) => renderFoodCard(ctx, trip, bg),
  },
  {
    key: 'packing',
    label: '出行清单',
    mapSource: null,
    render: (ctx, trip, _map, bg) => renderPackingCard(ctx, trip, bg),
  },
]

export function guideCardsForTrip(trip?: Trip): GuideCard[] {
  if (!trip) return GUIDE_CARDS.slice()
  const handbookCards: GuideCard[] = trip.days
    .filter((day) => day.stops.some((stop) => stop.name.trim()))
    .map((day) => ({
      key: `handbook-day-${day.id}`,
      label: `手帐 Day ${day.index}`,
      mapSource: null,
      needsStopPhotos: true,
      render: (ctx, currentTrip, _map, bg, photos) => renderHandbookDayCard(ctx, currentTrip, day.id, bg, photos),
    }))
  return [
    ...GUIDE_CARDS.slice(0, 5),
    ...handbookCards,
    ...GUIDE_CARDS.slice(5),
  ]
}

/** 取该卡对应的真实底图 URL（无则 null） */
export function cardMapUrl(trip: Trip, card: GuideCard): string | null {
  if (card.mapSource === 'route') return trip.routeMapImage
  if (card.mapSource === 'poi') return trip.poiMapImage
  if (card.mapSource === 'cityRoute') return trip.cityRouteMapImage
  return null
}

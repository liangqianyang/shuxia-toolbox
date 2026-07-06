import type { Trip } from '@/types/travel'
import { CARD_W, CARD_H } from './theme'
import { renderRouteCard } from './routeCard'
import { renderPoiCard } from './poiCard'
import { renderFoodCard } from './foodCard'
import { renderTimelineCard } from './timelineCard'

export { CARD_W, CARD_H } from './theme'

/**
 * 攻略卡片注册表。页面遍历生成多张独立图；每张固定 1080×1440。
 * mapSource 指明该卡需要预加载哪张真实底图（'route'→routeMapImage，'poi'→poiMapImage，null→不需要）。
 */
export interface GuideCard {
  key: string
  /** 画廊标签 + 保存文件提示 */
  label: string
  /** 需要的真实底图来源 */
  mapSource: 'route' | 'poi' | 'cityRoute' | null
  /** 渲染：mapImage 为已预加载的对应底图（可能为 null）；bgImage 为用户自定义卡片底图（可能为 null） */
  render: (
    ctx: CanvasRenderingContext2D,
    trip: Trip,
    mapImage: CanvasImageSource | null,
    bgImage: CanvasImageSource | null,
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
    key: 'poi',
    label: '景点分布图',
    mapSource: 'poi',
    render: (ctx, trip, map, bg) => renderPoiCard(ctx, trip, map, bg),
  },
  {
    key: 'food',
    label: '美食推荐图',
    mapSource: null,
    render: (ctx, trip, _map, bg) => renderFoodCard(ctx, trip, bg),
  },
  {
    key: 'timeline',
    label: '行程时间线',
    mapSource: null,
    render: (ctx, trip, _map, bg) => renderTimelineCard(ctx, trip, bg),
  },
]

/** 取该卡对应的真实底图 URL（无则 null） */
export function cardMapUrl(trip: Trip, card: GuideCard): string | null {
  if (card.mapSource === 'route') return trip.routeMapImage
  if (card.mapSource === 'poi') return trip.poiMapImage
  if (card.mapSource === 'cityRoute') return trip.cityRouteMapImage
  return null
}

/**
 * 七牛云 CDN 资源基址：小程序包内不再打包图片/音频（瘦身主包/分包），
 * 全部走 oss.lqy-comic.com（微信公众平台 downloadFile 合法域名需包含它）。
 * key 与包内原路径一致（frontend/cdn-assets/ 目录结构 = 上传结构），
 * 上传/更新资源跑 frontend/scripts/upload_qiniu.py。
 */
export const CDN_BASE = 'https://oss.lqy-comic.com/fengye'

/** 包内路径 → CDN 绝对地址。 */
export function cdnUrl(path: string): string {
  return CDN_BASE + (path.startsWith('/') ? path : `/${path}`)
}

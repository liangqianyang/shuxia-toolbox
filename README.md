# 枫叶小屋的工具箱

一个以微信小程序为优先端的工具合集。第一期工具是「拼豆图纸生成器」：上传图片后生成拼豆网格图纸，并统计每种颜色需要的颗数。

## 项目结构

```text
shuxia-toolbox/
  frontend/   uni-app + Vue3，小程序端优先
  backend/    PHP 8.4 + Swoole + Hyperf
  docs/       设计与开发说明
```

## 前端启动

```bash
cd /Users/liangqy/www/shuxia-toolbox/frontend
pnpm install
pnpm dev:mp-weixin
```

本地开发默认请求 `http://127.0.0.1:9501`，微信开发者工具导入 `frontend/dist/dev/mp-weixin`。
如果需要把本地开发产物也输出到 `dist/build/mp-weixin`，使用：

```bash
pnpm build:mp-weixin:local
```

如需临时切换本地后端地址，可在 `frontend/.env.local` 配置：

```bash
VITE_API_BASE=https://your-api.example.com
```

正式生产构建会读取 `frontend/.env.production`，接口为 `https://shuxia.lqy-comic.com`：

```bash
pnpm build:mp-weixin
```

构建产物在 `frontend/dist/build/mp-weixin`。

## 后端启动

容器名按你的环境使用 `php84-fpm`。如果容器内项目挂载路径不是下面示例里的 `/var/www/html/shuxia-toolbox/backend`，把 `-w` 后面的路径替换成实际路径。

注意：`php84-fpm` 需要能在容器内访问这个项目目录。若容器内 `/var/www/html` 为空，请先把 `/Users/liangqy/www/shuxia-toolbox` 挂载到容器里。

```bash
docker exec -w /var/www/html/shuxia-toolbox/backend php84-fpm composer install
docker exec -w /var/www/html/shuxia-toolbox/backend php84-fpm php bin/hyperf.php start
```

默认服务端口是 `9501`，健康检查：

```bash
curl http://127.0.0.1:9501/health
```

地图服务默认走腾讯。如需尝试高德，给后端环境配置：

```bash
MAP_PROVIDER=amap
AMAP_WEB_SERVICE_KEY=你的高德 Web 服务 Key
# 兼容旧变量名：AMAP_MAP_KEY / GAODE_MAP_KEY 也会被读取，但建议服务端 REST key 单独配置
# 高德静态图 key 不可用时默认用腾讯静态图兜底；如需关闭：
# AMAP_STATIC_MAP_FALLBACK=none
# 可选兜底：公交/地铁规划城市，正常会优先使用目的地
AMAP_TRANSIT_CITY=杭州
```

高德这里必须是控制台里“Web 服务”类型的 Key；JS API、小程序 SDK 等平台类型的 Key 调用 `restapi.amap.com` 会返回 `USERKEY_PLAT_NOMATCH`，地图底图会加载失败。若前端直接下载高德静态图，还需要在微信小程序后台把 `https://restapi.amap.com` 加入 `downloadFile` 合法域名。

## 第一版范围

- 工具箱首页
- 拼豆图纸生成器入口
- 上传图片或表情包
- 选择图纸尺寸
- 前端 Canvas 像素采样
- 自动匹配基础拼豆色卡
- 网格预览
- 颜色用量统计
- 保存图纸图片到相册

后端当前作为接口骨架和未来扩展预留，适合后续接入 AI 抠图、图片简化、用户作品保存、色卡管理等能力。

# 开发避坑清单（项目踩坑全量汇总）

> 单一事实源：CLAUDE.md 通过 `@.claude/rules/pitfalls.md` 引入本文件，每个会话自动加载。
> 维护约定：新踩的坑**必须回填**到对应分区，一条一行，格式 =「坑 → 规避」；已废弃的坑删掉，保持清单最短可用。
> 标注 (2026-09-23) 的是最新会话踩的坑。

## 1. 流程铁律（每次改动都做）

- **(2026-09-23) 禁止用 `perl -pi`/`sed -i` 裸正则批量改多个源码文件**——一次 `s/\s+$//`（无 `/m`）吃掉每行换行符，8 个 .vue 整文件塌成一行，SCSS/JS 的 `//` 注释把后面代码全部吸收进注释（prettier 也救不回），最后靠 git checkout + 会话转录重放 Edit 才恢复。多文件机械修改：要么逐文件用 Edit 工具（old_string 精确匹配），要么改完**立即 `wc -l` 对比行数**再继续。
- 改完前端必须重新编译并检查报错，否则不算完成：本地 `pnpm build:mp-weixin:local`，发布生产才用 `build:mp-weixin`（.env.production 自动切换 API base），配合 `pnpm typecheck`。
- 改后端 PHP 必须重启 hyperf（Swoole 不热加载，进程名 `shuxia-toolbox-api.Master`）；**改了带 `#[RateLimit]` 注解的 Controller 还必须 `rm -rf runtime/container` 再重启**——DI 代理缓存是旧的，新代码会静默不执行。
- 有 Pen 原型的界面：必须先用 pencil MCP 读节点**精确属性**（坐标/尺寸/颜色/圆角/旋转/图标名/描边），禁止截图目测或凭记忆近似。已验证陷阱：①Pen 的 `rotation` 绕左上角不绕中心；②icon 节点是线条风格（颜色查 `fill` 但渲染是描边）；③颜色变量（`$tet-bg` 等）要解析成实值再抄；④Pen MCP execute 五坑：全局变量不跨调用 / Copy 固化尺寸 / flex 必须显式 layout / 坐标是父级相对 / 验证用 `c.problems`；⑤MCP 报 -32000 检查是否被 VS Code 版配置覆盖。
- 改版/重设计前先跑 H5 预览 + 读真实代码，按真实功能结构 1:1 换皮，禁止编造内容。
- 用户拍板的交互规则不得擅改（例：时光纪念卡列表排序——未到由远到近、已过近的在前——是用户特意的）。
- 原型/图标/音效一律程序化生成：`docs/*.html`（headless Chrome 截图）+ `frontend/scripts/gen_*.py`，不要手画 PNG。

## 2. 小程序 / 前端通用

- 按压反馈用 `hover-class="press"`（common.scss 全局类）；`:active` 在小程序 WebView 不生效。
- **composable 返回的 ref 必须解构成顶层绑定再进模板**——模板里 `game.paused.value` 这类嵌套 ref 访问在 MP 编译下不建响应依赖（暂停遮罩永远不渲染，gomoku/uno/tetris 全踩过）。
- watch 数组 getter 每次产生新引用 → 每动作重触发；改字符串 key + prevKey 守卫（gomoku/jungle 猜拳定格翻过车）。
- page-meta 是配置节点不渲染内容，内容必须平级放外面（home 整页不可见翻过车）。
- canvas type=2d 三坑：①导出（canvasToTempFilePath）前别 resize/重画，否则失败返回 0 张；②别用 Path2D（异常会让 save 的变换栈泄漏、后续帧全歪）；③整幅重绘要么 clearRect 后画满、要么先铺不透明底色，留透明区会被合成出中间帧。
- 原生组件（canvas）层级最高：动态尺寸布局照 tetris 家法用文档流兄弟节点排按钮，弹层出现时 canvas `v-show` 隐藏。
- WXSS `background-image` 只支持网络图 / base64 data-URI，明文 SVG URI 不渲染。
- 设计 token 强制：间距/字号/圆角/阴影一律 `src/styles/variables.scss`（`$space-*`/`$font-*`/`$radius-*`/`$shadow-*`），禁止裸写 rpx 数值；新页面/新组件强制，触碰存量顺手迁移。
- 启动报 "$vm of undefined" / 白屏 / timeout：删 manifest.json 的 `lazyCodeLoading`。
- H5 对照截图管线：禁用 Chrome CLI `--virtual-time-budget`（HMR 卡死）。

## 3. 游戏开发

- 所有游戏前端代码只进 `src/pages-games/` 单一分包；跨游戏共享进 `pages-games/{composables,utils,services,components}`，与主包共用留主包（分包 require 主包合法）。uni-app 的 `optimization.subPackages` 只优化 node_modules **不搬源码模块**，必须物理移动，否则 DevTools 判「主包存在未使用 JS」。注意 `cdnUrl('/pages-ludo/...')` 是 CDN key 不是页面路由，分包调整时别跟着改。
- 新游戏大厅**禁止手抄，直接用 GameLobby**；页面差异内容放 `#extra` 插槽；组件事件全是自定义名（create/join/rules），勿改用原生事件名 tap（`$emit('tap')` + 父级 `@tap` 被宿主 bindtap 双重接收，点击触发两次）。四宫格已下线（2026-09-23 拍板）：聊天/邀请/再来一局只在房内，规则=大厅 hero ⓘ。
- **(2026-09-23) GameLobby 组件自身不带页边距——页面必须提供左右 padding**（包一层 `.lobby`、`padding: 0 $space-4 $space-3`），否则按钮/卡片贴屏幕边（uno/ludo/adventure 翻车；jungle/gomoku 等页面根自带 padding 所以正常）。
- **(2026-09-23) 俄罗斯方块：引擎 tick 每 33ms 必产新状态引用**（`gravityMs`/`lockMs` 计时器每 tick 累加，`{ ...state, gravityMs }` 永远是新对象）→ composable「同引用跳过重绘」守卫对 tick 永不生效 → 页面 `drawState` 必须过 `visualSig()` 视觉签名守卫（active 块/相位/消行 40ms 桶/M 闪块 300ms 桶/level/hold/queue/board），签名相同跳过 `drawTetrisFrame`，否则 30fps 全画布空转重绘 = 「整个界面抖一下」。`initCanvas`/`beginRound` 里 `lastDrawSig = null` 强制首帧真画。另：硬降/消行的 `uni.vibrateShort` 是故意的手感反馈（真机手机会震），不是 bug。
- 房间聊天布局规则（uno/ludo/gomoku/adventure/jungle/tictactoe/xiangqi/junqi 全遵守，新游戏照抄）：常驻聊天 feed（最近 6 条）+ 固定底部 dock + 💬 触发钮在 dock 左下 + 页面内容 `padding-bottom`（≈380-400rpx + safe-area）避让；贴纸 tab 已下线（白名单数据保留）。
- 联机架构通病与修法：uno 懒推进必须放行请求者本人，否则「懒推进→422 回滚→再请求再推进」把活跃玩家软锁在 422 循环；Hyperf **没有** OnWorkerStart 事件（用 MainWorkerStart + `Coordinator\Timer::tick`）；ludo `pickAuto` 启发式初值必须 INT_MIN（反弹走法得分为负）且 `resolveMove` 对 `pos===56` 返回 null（万局模糊测试抓的）；adventure 清扫器验证用 PDO 只读观测，容器内 hyperf 日志会丢。
- `game_scores` 加新列必须同步 `GameScore::$fillable`，否则 `updateOrCreate` 静默丢字段。
- **(2026-09-23) `uni.vibrateShort({})` 不传 `type` 时真机（尤其 iOS）走最强档短振动**——整部手机物理弹一下，用户会报「整个界面抖一下」当成渲染 bug（tetris 直落翻过车）。若要游戏内触感反馈必须 `uni.vibrateShort({ type: 'light' })`；**tetris 的直落/消行振动已按用户拍板整体移除**（只留音效），勿加回。
- 画面随时间变的帧（闪烁/动画）必须给重绘路径留时间桶驱动，别依赖状态变化触发。

## 4. 后端 Hyperf

- 注解 AOP 生效三前提：`config/autoload/annotations.php` 配 paths + `bin/hyperf.php` 调 setContainer + 类不能 final，缺一**静默失效**。
- hyperf 命令（migrate/seeders）必须手动登记 `config/config.php` 的 `commands`（hyperf/database 无 ConfigProvider）。
- php84-fpm 与 dev-mysql 默认不同 docker 网络 → `SQLSTATE[HY000] [2006] MySQL server has gone away`；修：`docker network connect development_default php84-fpm`（或写进 compose）。
- 没装 hyperf/paginator，别用 `paginate()`；Hyperf **没有** `collect()` 助手。
- PHP 类型声明强制（常量/属性/参数/返回值全带类型）；闭包返回类型写在 `use (...)` **之后**；WS 契约回调 `onOpen/onMessage/onClose` 保持无类型（加 Swoole 类型会 fatal）。
- 容器 9501 未映射宿主机，健康检查在容器内 curl；容器需要 pcntl 扩展（Dockerfile `RUN docker-php-ext-install pcntl`）。
- 所有 AI 类接口入口必须过 `FeatureFlagService::requireAiEnabled()` 硬拦截（`feature.ai_enabled` 默认 0），不能只靠前端隐藏入口；聊天自由文字同理（`feature.uno_chat_text` 等 + msg_sec_check fail-closed、事务外执行）。

## 5. 资源与部署

- 小程序包内零图片/音频：全走七牛 CDN（`cdnUrl()` → `https://oss.lqy-comic.com/fengye/...`），本地唯一副本 `frontend/cdn-assets/`（git 跟踪），上传 `python3 frontend/scripts/upload_qiniu.py`（HEAD 大小一致自动跳过，`--force` 强制）；微信公众平台 downloadFile 合法域名必须含 `oss.lqy-comic.com`。
- 生产 API `https://shuxia.lqy-comic.com`；canvas 贴远程图用 `canvasAdapter.loadDrawableImage`（wx.downloadFile 缓存），音效 InnerAudioContext 直接播 https。
- WS 联机上线前置（每款游戏一个 location）：nginx `/{gomoku|uno|ludo|adventure|jungle|junqi|xiangqi|tictactoe}/ws` upgrade 反代到 9502（复用同域名）+ 微信公众平台 socket 合法域名加 `wss://shuxia.lqy-comic.com` + 容器映射 9502。

## 6. 工具链备忘

- 本地编译看效果：`pnpm build:mp-weixin:local` → DevTools 导入 `dist/build/mp-weixin`；H5 对照截图管线：`pnpm dev:h5` + CDP 截图，预置 token + Fetch 拦截伪造后端接口（禁用 `--virtual-time-budget`，见 §2）。
- 后端无测试框架；前端算法断言 `pnpm test`（Node 直跑，规则引擎双端一致性靠它锁定——改 PHP/TS 规则必须双侧同修 + 测试补 case）。

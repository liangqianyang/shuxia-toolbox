# v4 小清新改版 · 落地执行计划（代码迁移）

> 设计已定稿：规范 `docs/design/maple-paper-system.md`（v4 小清新 FRESH BLUE），
> 交互原型 `docs/design/maple-paper-prototype.html`（34 屏可点击），
> 现状截图 `docs/design/current-ui/*.png`。
> 本文件 = 代码迁移的施工顺序与验收标准。**每完成一个 Phase 就勾选并写一行完成记录。**

## 新会话怎么接（复制即可用）

```
继续 v4 小清新改版。先读 docs/design/MIGRATION-PLAN.md 和 docs/design/maple-paper-system.md，
本次只执行【Phase N：xxx】，不要做其它 Phase。改完跑 pnpm typecheck 和 pnpm dev:mp-weixin:local 确认编译，
并更新 MIGRATION-PLAN.md 的进度勾选。
```

通用约束（每个 Phase 都适用）：
- 只换视觉与布局，**不新增功能、不重构业务逻辑**（除非该 Phase 明确列出）
- 无渐变、黄色不做实底填充、chrome 用蓝白、内容（棋盘/牌面/色卡）可保留个性但需减淡调和
- 改完必跑：`pnpm typecheck` + `pnpm dev:mp-weixin:local`（本地编译）；涉及后端的不涉及
- 验收对照：原型对应屏（`#home` `#beads` `#play-tetris` 等 hash 可直达）

## 进度总览

- [x] Phase 0 设计令牌地基（variables.scss / common.scss / uni.scss）
- [x] Phase 1 框架层：4 个 tab + 工具集 + 运营台 + 游戏页联机/单机分组
- [x] Phase 2a 工具页：拼豆 + 抽奖
- [x] Phase 2b 工具页：旅游
- [x] Phase 2c 工具页：时光纪念卡 + 每日灵签
- [x] Phase 2d 工具页：吃饭决策器（最重，单独一个会话）
- [x] Phase 3a 游戏壳：俄罗斯方块（直落防误触 + 速度开关 + 大厅等级/速度设置）
- [x] Phase 3b 游戏壳：推箱子（撤销/重开上移顶栏 + 方向键加大）
- [x] Phase 3c 游戏壳：uno / gomoku / ludo 对局 chrome v4 化
- [x] Phase 3d 游戏壳：adventure / jungle / junqi / xiangqi / tictactoe 对局 chrome v4 化
- [x] Phase 4 收尾：GameChatPanel 聊天坞 v4 化 + 截图对照存档 + 真机过查

---

## Phase 0 · 设计令牌地基

改：`src/styles/variables.scss`（v4 令牌全量）、`src/styles/common.scss`（全局类）、`src/uni.scss`（如需）。
- 中性：`$bg #F6F9FB`、`$card #FFF`、`$fill #F2F6F9`、`$line #EAF0F4`、`$line-strong #DDE6EC`
- 墨色（蓝灰）：`$ink #2E4154`、`$ink2 #6E8093`、`$ink3 #A4B3C0`
- 主色：`$blue #58A6DC`、`$blue-deep #3B86B8`、`$blue-tint #E9F4FB`
- 功能：`$green #5FB98C`、`$amber #EFB54E`（只做内容点缀，禁实底按钮）、`$red #E8806F`
- 淡彩图标表（16 组 tint/fg）：照原型 JS `PASTEL` 表落地为 SCSS map
- **兼容策略**：旧变量名（`$color-bg/$color-primary/$color-danger…`）保留但**值改指向 v4**（如 `$color-primary → $blue`），让已用 token 的页面（beads/home 等）自动变蓝白；硬编码杂色留到各 Phase 逐页清
- 全局禁渐变：删 common.scss 里的渐变类；阴影只留极淡一层

验收：typecheck 0 错；编译 0 错；首页/拼豆/工具箱打开不破版（细节走样可接受，后续 Phase 修）。

> ✅ **2026-09-22 完成**：`variables.scss` 重写为 v4 令牌全量（中性 `$bg/$card/$fill/$line/$line-strong`、墨色 `$ink/$ink2/$ink3`、主色 `$blue/$blue-deep/$blue-tint`、功能 `$green/$red/$amber`、`$scrim`、PASTEL 16 组 SCSS map + `pastel-tint()/pastel-fg()` 取值函数，dart-sass `map-get` 全局函数写法避免 `@use` 注入问题）；阴影转冷调极淡（卡片 .05/浮层 .12）；9 个旧变量名 `$color-*` 保留为别名值指向 v4（全仓 grep 核对无遗漏）；common.scss 无渐变类可删，仅 CTA 投影收淡 0.28→0.16；uni.scss 无需改（已注入）。typecheck 0 错 + `build:mp-weixin:local` 编译 0 错，产物抽查 page/`btn-primary` 已是 v4 蓝白。注意：MIGRATION-PLAN 通用约束里的 `pnpm dev:mp-weixin:local` 实际不存在，本地编译脚本名是 `pnpm build:mp-weixin:local`（会退出的完整编译）。

## Phase 1 · 框架层

改：`pages/home/index.vue`、`pages/toolbox/index.vue`、`pages/games/index.vue`、`pages/mine/index.vue`、`pages/tool-library/index.vue`、`pages/admin/index.vue`、`components/AppBottomNav.vue`、复活 `components/ToolCard.vue`。
- 布局换「分组列表」：白色组卡 + 发丝线行分隔（对照原型 `#home/#toolbox/#games/#mine`）
- 页头：蓝 kicker + 大标题 + 副题（去掉旧 eyebrow 的暖棕）
- **游戏页分组**：`ONLINE_KEYS = [gomoku,uno,ludo,adventure,jungle,junqi,xiangqi,tictactoe]` 前端白名单分「派对联机/单机消遣」两组，行尾加 联机/单机 标签（纯前端，不改 tool_catalog）
- 底部导航：扁平白条 + 蓝色选中 + 小圆点
- 首页纪念卡动态副标题/角标逻辑保留不动

验收：4 tab + 两管理页与原型一致；首页排序模式可进可出；纪念卡副标题正常。

> ✅ **2026-09-22 完成**：ToolCard.vue 复活为 v4 分组列表行唯一实现（pastel 淡彩 tile + divided 发丝线 + pressable + right/bottom 插槽，home/toolbox/games/tool-library/admin 五处手抄行全部收编）；新增 `utils/pastel.ts` 运行时 PASTEL 表（与 variables.scss `$pastel` map 双份同步，动态 key 编译期函数取不到）；AppSection 加非破坏性 `card` 模式（seclabel+白卡组容器，anniversary 不传不受影响）；AppBottomNav 扁平白条+蓝选中+小圆点（unicode 图标留待 Phase 4 管线）；common.scss 补 `.tag--blue/--gray/--red` 与 `.hintline` 全局类；游戏页 ONLINE_KEYS 前端白名单分组（不在名单按单机展示，安全默认）；首页拖动排序改分组内重排（工具/游戏两组分开测量 `.home__tool-card`/`.home__game-card`，保存顺序=工具组+游戏组拼接），纪念卡副标题/角标逻辑原样未动；pages.json 全局导航栏/页面底 `#FFF8F0`→`#F6F9FB`（7 处），switch 硬编码 `#c64f3d`→`#58A6DC`（tool-library/admin 共 5 处）。typecheck 0 错 + `build:mp-weixin:local` 0 错，产物抽查 kicker 蓝、ToolCard 动态淡彩 style/divided/hover 绑定、app.json window 底色均正确。**待 DevTools 手测**：首页分组内拖动排序（selector 挂自定义组件宿主，boundingClientRect 理论可行未实测）。

## Phase 2a · 拼豆 + 抽奖

拼豆：上传卡虚线 v4 化；ParamPanel 的 `#C8956C` 字面量换 token；结果卡/用豆统计/购物清单按原型 `#beads`。
抽奖：删私有 `$maple/$forest/$ink`；步条/玩法卡/礼盒开奖屏按 `#lottery/#lottery-draw/#lottery-result`；16 档字号归 8 档。
验收：两页核心流程手点一遍（选图→生成→导出；建活动→开奖→结果）。

> ✅ **2026-09-22 完成**：**拼豆**——beads 页 slider/ParamPanel 4 处 switch+slider `#C8956C`→`#58A6DC`；上传卡虚线 `$line-strong` 3rpx + 文字转 `$ink`；用例 tile/板型 chip/编辑/缩放/擦除选中态从蓝实底白字改原型 `.tile.on/.chip.on` 蓝 tint+蓝描边+深蓝字；`__dirty` 提示转 `$blue-tint`；图纸滚动区/对比图/进度条底转 `$fill`；编辑坞描边转 `$line`+`$shadow-float`，画布手势描边/画笔&图例聚焦环/库存勾选环 暖棕 rgba 全换蓝 rgba；危险钮 `#fbecec/#b03a3a`→`#fdefec/$red`；购物清单复制钮改 tint chip、行分隔转 `$line` 发丝线。**抽奖**——私有 `$maple/$forest/$ink` 全删（信息类绿→蓝 tint/中性灰、强调红→蓝系、danger 用 `$red`）；品牌头 kicker 转蓝 kicker（20rpx/600/字距 4）、brand-mark 用 `pastel-tint('lottery')`；步条去横向滚动改 5 等分白卡（选中蓝 tint/走过蓝字，原型 `.step`）；玩法卡/模板卡转 `$radius-md` 白卡+蓝 tint 选中（原型 `.modecard.on`）；活动性质 segment 改 `$fill` 轨道+白块选中（原型 `.seg`）；**签筒+签杆删除换 CSS 礼盒**（bow/lid/boxbody 全程序化，抽奖不出现签筒隐喻=拍板决策 2，动画改名 gift-shake/leaf-fall 挂礼盒）；开奖舞台/结果 hero 改白卡；4 处 switch `#c64f3d`→`#58A6DC`；字号 16 档→6 档（$font-micro/caption/body + 32/title/display，emoji 图标字号豁免）。逻辑零改动（脚本区未动）。typecheck 0 错 + `build:mp-weixin:local` 0 错，产物抽查 wxml/wxss 均已是 v4 值、无 `#C8956C` 残留。**待 DevTools 手测**：两页核心流程（选图→生成→导出；建活动→开奖→结果，重点看礼盒动画与逐格编辑坞）。

## Phase 2b · 旅游

`pages/travel/index.vue` + `TravelStopCard.vue`：清 `#d9534f`×9、`#fff3e6`×9、`#fff8ef`、`#ead6bf`；POI 分类色重制为淡彩；AI 卡/路线卡/Day 卡/底部工作台按原型 `#travel`。**功能零改动**（重写/替换/云保存逻辑不动）。
验收：生成攻略图全流程 + 手动编辑流程回归。

> ✅ **2026-09-23 完成**：**POI 分类色淡彩重制**——`types/travel.ts` POI_THEME 5 色从 Material 原色（`#E8945A/#D9534F/#5B8DEF/#9B59B6/#27AE60`）换 PASTEL fg 系（`#E08A4C` 暖杏/`#E27966` 柔红/`#4E97CE` 清新蓝/`#8E7CC3` 藕紫/`#67A75B` 苔绿），`textColorOn` 自动判黑白字故 chips 与 canvas 卡（theme.ts/poiCard.ts/photoTimelineCard.ts）零逻辑改动；packingCard 注意事项列 `#5B8DEF`→`#4E97CE` 同步；subwayCard LINE_COLORS 是真实地铁标识色（内容数据）不动，水彩卡主题 `C`（内容个性）不动。**页面（index.vue 32 处）**——9×`#d9534f`→`$red`（错误文案/警示章/删除/清除/标签叉）；9×`#fff3e6` 选中态→`.chip.on` 三件套（`$blue-tint` 底+`$blue` 描边+`$blue-deep` 字：出行方式/强度/风格/心情/套装/卡片勾选/分组 tag/xhs 标签）；`#fff8ef/#ead6bf` 暖面板（分享码/Day 手帐）→`$blue-tint`+`$line`；状态章照原型 `.checks`（ok `#ebf5f0/#3f8a66`、info `$fill/$ink3`、warn `#fdefec/$red`）；确认台指标卡暖底→`$fill/$line`；Day 徽章蓝实底→原型 `.daypill` 蓝 tint+蓝字；单程/往返 seg 蓝实底选中→原型 `.seg`（`$fill` 轨道+白块+冷影）；stepper ±钮 `$color-bg`+蓝字→`$fill`+墨字；「+添加地点/一天」虚线框→原型 `.btn.tonal`（蓝 tint 实底+蓝字）；dock `#fff8f0`→白 `rgba(255,255,255,.94)`+`$line` 顶线；字重 800×3→600、字号 34→32、20→`$font-micro`。**TravelStopCard（5 处）**——手帐/推荐理由暖面板→`$blue-tint/$line`、交通方式选中→chip.on 三件套、删除→`$red`、禁用→`$ink3`。逻辑区（script）零改动。typecheck 0 错 + test 全过 + `build:mp-weixin:local` 0 错，travel wxss 产物旧色 0 残留、v4 值抽查全中。**待 DevTools 手测**：生成攻略图全流程（AI 卡填目的地→生成→卡片画廊）+ 手动编辑流程（加天/加地点/改类型 chip 淡彩/跨城修正/云保存分享码导入）。

## Phase 2c · 纪念卡 + 灵签

纪念卡：布局不动，场景渐变转**粉彩扁平**（8 场景 tint 化）；事件行/筛选 chips 按原型 `#anniversary`；导出画布 `utils/anniversaryCard.ts` 主题色同步调。
灵签：牌卡改淡彩扁平（4 牌 tint 底 + 白 icon 方块）；出签卡/掷杯按原型 `#fortune`；宋体保留。
验收：纪念卡建/编/成员/邀请回归；灵签抽签全流程 + 历史页。

> ✅ **2026-09-23 完成**：**纪念卡**——`styles/anniversary-scene.scss` 8 场景重制为 v4 淡彩三元组 `(mid/deep/tint)`（birthday `#DE8FAB/#C9698E/#FDF0F5`、relationship `#E8806F/#C96B5A/#FDEFEC`、wedding、travel `#6FA5D6/#4E86B4/#EBF3FA`、deadline `#A08CC7/#8E7CC3/#F1EDF9`、baby、habit `#79B590/#4E8A66/#EDF6F0` 全部照原型 filtrow/事件行；custom 留奶茶=内容点缀），**hero 满幅渐变+白字 → tint 扁平底 + 深彩字**（`background:$tint; color:$deep`，场景规则新增 milestone-bar=$color、hero-btn 描边 `rgba($color,.35)`，hero 大标题/单位/副题转墨色/次级，场景徽章白底深彩字，进度条轨白 0.75，blob 提亮 0.08→0.45）；时间 tab 蓝实底选中 → 原型 `.seg`（`$fill` 轨道+白块+冷影）；新建钮蓝实底 → 原型 `.pillbtn.blue`（蓝 tint+蓝描边 pill）；`#fffdfb/#fffdf9` 输入/底栏 → 白/`rgba(255,255,255,.94)`、`#f6efe7/#f0e7da/#f9eee3` → `$fill`、时间 chip 选中红 → 蓝 tint 三件套、segmented 选中字 `$color-primary-dark`→`$color-text`；`#c0392b` 预览印章 + 导出画布 `anniversaryCard.ts` 印章 `#C96B5A` 同步（所见即所分享）；`#8a6fa8` 日历缩略图 → `#8E7CC3`、`#b8925e` 证书双边 → `#C99A34`、照片纹理条纹转冷灰；sheet 全套（scrim→`$scrim`、grabber、分隔线、icon 底、danger `#fdefec`）；`__bottom-cta` 红渐变 → 蓝实底+`rgba($blue,.16)` 阴影；`confirmColor #e06a5a`→`#58A6DC`；reminder-status 绿 → `#ebf5f0/#cfe6db`（原型 ck.ok）。**保留不动**：`__card-preview--warm` 等 5 风格渐变背景 + tone swatch 渐变（=导出卡内容个性的 DOM 预照）、TONES 五风格色板。**灵签**——`utils/fortune/theme.ts` DeckTheme 新增 `tint/fg` 字段（观音 `#F1EDF9/#8E7CC3`、关帝 `#FDEEEA/#E27966`、月老 `#FCEFF4/#DE8FAB`、答案之书 `#E8F3FB/#4E97CE`，与 PASTEL 表同源）；**牌卡改淡彩扁平**：渐变实底白字 → tint 底+发丝线+墨字+白 icon 方块+`$ink3` 箭头；**chrome 全归蓝白**（原型把灵签动作全画成蓝）：诚心求签/请大师详解/保存签卡/分享加签 → 蓝实底 `$radius-md`，分享签卡 → 白底描边 ghost，再抽/换签种/看看别的 → 蓝 tint tonal，分类 chip 选中/换签种 pill/大师详解 lucky 条 → 蓝 tint 系，出签卡 paper 底+深色边 → 白卡发丝线（verse 墨/gist/书答/签题蓝 deep）；**掷杯**：暗红渐变杯 → 原型 `$fill` 扁平杯+`$line-strong` 描边，结果字蓝 deep；签筒/答案之书封面渐变 → `theme.fg` 实底 / `theme.tint` 封面+fg 标题；**签级印章保留语义色但 v4 柔化**（上上 `#C96B5A`→下下 `#2E4154`，页面/导出卡/历史页 badge 三处同源）；洒金 confetti 红 `#B03A2E`→`#C96B5A`；页面底 `#FFF8F0`+主题渐变 wash → `$bg` 纯色；history lucky 金字→蓝、deckColor 兜底→`$ink`。**宋体全部保留**；cardRenderer 导出签卡配色不动（内容个性）。逻辑零改动（仅删 pageBackground computed 与内联色绑定）。typecheck 0 错 + test 全过 + `build:mp-weixin:local` 0 错，两页 wxss 旧暖色 0 残留、场景/牌 tint 落盘抽查通过。**待 DevTools 手测**：纪念卡建/编/成员/邀请（重点看 8 场景 hero 粉彩底上深彩字对比度）+ 灵签抽签全流程（牌卡淡彩→问事→摇签→出签→掷杯→保存签卡）+ 历史页。

## Phase 2d · 吃饭决策器（最重）

`pages/food/index.vue` 全量换肤：冷灰底 `#f7f8f8` → `--bg`；青绿/番茄红 → 蓝系 + 淡彩；炭黑按钮 → 蓝；radius 14 → 12；四 tab / 附近 / 饭票 / 饭池 / 饭局 全部按原型 `#food`。**逻辑零改动**（抽取算法、云同步、房间码不动）。
验收：四 tab 全流程（定位→抽取→饭票→加池→饭局码）。

> ✅ **2026-09-23 完成**：`pages/food/index.vue` 样式块整体重写（模板/脚本零改动，script 本就无硬编码色）。**底与中性**——冷灰底 `#f7f8f8`→`$bg`、描边 `#e2e7e9`→`$line`、轨道 `#edf1f1`→`$fill`、输入底 `#f8faf9`→白、`#eef1f2`→`$fill`、虚线框 `#d9e0e3`→`$line-strong`；墨色 `#202326/#394149`→`$ink`、`#6b747b/#7f8a91/#69717a`→`$ink2`。**主行动全转蓝**（原型 #food 把「帮我决定/搜索/添加/保存/抽」全画成蓝实底）：炭黑按钮（place-btn/mini-btn/pool-add/profile-save/抽字 core）→`$blue` 实底白字；番茄红决定钮 `#df513f`→`$blue`（--pool 变体→`$blue-deep`）、阴影 `rgba($blue,.2)`；饭票主钮/进度条（红青渐变→扁平淡蓝）/转盘环（红青双色→蓝两档）→蓝系；eyebrow → 蓝 kicker。**青绿→蓝 tint 族**：`#238a9a/#1d6671`→`$blue-deep`、`#eef8fa/#f2fafb`→`$blue-tint`、饭局卡/饭池位置卡/结果选中态/链接/room 分隔线全部 `rgba($blue,x)` 家族。**红仅留危险语义**：tag 删除叉 `#df513f`→`$red`、饭池删钮→`$red`+`#fdefec`。**成员头像三色轮换**（青/红/绿）→ 淡彩 `#4E97CE/#E27966/#67A75B`。「未绑定」amber 徽章→`$fill`+$ink2（同 `.tag--gray` 约定，黄不做标签底）；抽取面板 `#fffdf9`→`$blue-tint`、饭票卡红边粉底→白卡+`rgba($blue,.24)` 边+kicker 蓝字。**tabs4**（fixed 底 dock 保留布局）照原型：白 0.96 轨道+`$line` 边+冷影，选中=蓝 tint 底+蓝字（`.t4.on`）。radius 14→`$radius-sm`(12)/16→`$radius-md`(20)；字重 760/800/850/880/900→600、字号 48/46→`$font-display`、40→`$font-title`、34→32、23→`$font-caption`；抽入进度条渐变删除（禁渐变）。typecheck 0 错 + test 全过 + `build:mp-weixin:local` 0 错，food wxss 产物旧色 0 残留、v4 值抽查全中（蓝×9/deep×16/tint×10/淡彩×3）。**待 DevTools 手测**：四 tab 全流程（定位→搜索地点→抽取看动画配色→饭票导航/换一个→加池/分组长按→饭局码新建/加入/复制）+ 微信登录资料编辑弹层。

## Phase 3a · 俄罗斯方块

- 控制排：`[←][→][旋转 accent][⤓直落 蓝实底]‖隔离‖` + HOLD——直落蓝色实底与高频键区分（防误触三件套，见规范 v4.1）
- **速度模式开关**：`utils/tetris.ts` state 加 `speedMode:'progressive'|'constant'`，tick 重力间隔二选一（constant 恒取基础档）；对局内可切、选择持久化；计分榜单不拆
- 大厅/菜单：下落速度 + 初始等级 1~15（已有）+ 本地最高分 + 排行榜；HUD 按原型 `#play-tetris`
- 皮肤：奶油金面板 → 白/浅蓝；方块色转马卡龙
验收：开一局 + 快滑直落 + 按钮直落 + 两种速度模式对比 + 上报榜单。

> ✅ **2026-09-22 完成**：**速度模式**——`TetrisState.speedMode('progressive'|'constant')` + `setSpeedMode` action（对局内即时切，结束后不生效、同值回原引用），tick 重力间隔 constant 恒取 `gravityIntervalMs(startLevel)`（等级/计分照常涨，榜单不拆）；`useTetris.start(level, speedMode)`；页面 `shuxia_tetris_speed_mode` 持久化，菜单设置卡（下落速度 chips + 初始等级 chips，原型 lobby-tetris 结构）与对局 HUD 第二行速度 chips 双入口。algo.test.ts 新增 8 断言（600ms 在 4 级 progressive 落/constant 不落、累计仍落、setSpeedMode 引用语义）。**控制排**按原型序 `[←108][→108][旋转 accent 140][⤓直落蓝实底 112]‖32 隔离‖[HOLD 108]` 高 108rpx 居中（原 flex 撑开布局废弃）；**大厅**改原型结构：马卡龙方块装饰 + kicker「单机消遣 · 离线可玩」+ 蓝实底开始按钮上移 + 设置卡（发丝线分组）+ 白卡战绩/排行榜；**皮肤**——HUD 改 3 枚 statchip + 白 iconbtn 暂停（battletop），页面底 `$bg`、卡片白+`$line` 发丝线、scrim 冷调、金实底钮全转蓝（消行闪金带保留=内容特效）、结算「新纪录/名次」章转蓝 tint、rankColor 转 PASTEL 低饱和点缀；**渲染器**——方块 11 色转马卡龙（原型 pc 6 色 + 同族 5：M 闪块保留金）、棋盘 fill 底+白格发丝线（原型 .tgrid）、右栏白面板发丝线+「下一块」蓝框、LEVEL 数字 `$blue-deep`。typecheck 0 错 + test 全过 + `build:mp-weixin:local` 0 错，产物无旧色残留。**待 DevTools 手测**：开一局 + 快滑直落 + 按钮直落 + 两种速度模式对比（恒定档 1 级开局应明显慢于越消越快）+ 上报榜单。

## Phase 3b · 推箱子

- **撤销/重开上移顶栏**（重开二次确认），方向键区只留加大 dpad（长按连走）
- 选关页结构不动，配色 v4（当前关蓝框、星 amber、锁定灰）
- 对局板内容色减淡（墙 #E9DBC4、箱 amber、目标蓝环）
验收：第 4-2 关试玩 + 撤销/重开新位置 + 误触自查（拇指覆盖测试）。

> ✅ **2026-09-22 完成**：**布局**——撤销(蓝 tint 胶囊)/提示(白胶囊)/重开(白 iconbtn) 上移顶栏右侧，底栏 `[撤销][重开][提示金]` 三钮排删除；新增 `showReset` 重开二次确认弹层（canvas v-show 条件同步加 `!showReset` 防原生组件穿透）；dpad 只留十字键 128×116rpx（cell 位同步缩），**长按连走**：touchstart 立即走一格 + 300ms 后每 160ms 连走，touchend/cancel 与弹层出现即停；`sizeBoard` 预留 -400→-350。**配色**——选关结构不动：当前关蓝框蓝 tint、星 amber(#C99A34)、锁定章灰($fill+$ink3)、章节圆点转 PASTEL fg（sokobanLevels CHAPTERS color 数据改）；渲染器白板+发丝线棋盘格、墙 `#E9DBC4`+`#D9C5A0`、箱淡 amber `#F3CE79`/`#C99A34`（归位仍金+白勾）、落叶点转蓝环 `#58A6DC`、小人白身加发丝描边+柔红叶帽、卡死圈 `$red`；chrome 白卡发丝线 + scrim 冷调 + 弹层主钮蓝实底。typecheck/test/build 全绿。**待 DevTools 手测**：第 4-2 关试玩 + 撤销/重开新位置 + dpad 长按连走 + 拇指覆盖自查。

## Phase 3c/3d · 其余 8 款对局 chrome v4 化

- uno/gomoku/ludo（Phase 3c）：墨绿牌桌→白、枫红按钮→蓝、gomoku 木纹减淡 `#FBF5E8`、ludo 座位转马卡龙；**布局与玩法逻辑零改动**
- adventure/jungle/junqi/xiangqi/tictactoe（Phase 3d）：同框架；阵营红蓝 → 柔红 `#E8806F`/柔蓝 `#4A86B8`
- **GameChatPanel + 常驻聊天坞 v4 化**（白底圆顶 + 蓝 trigger + 发丝线），消息 feed 规则不变（最近 6 条）
验收：每款双开房间走一局（含聊天发一条）。

> ✅ **2026-09-22 完成（3c+3d+聊天坞一并）**：**uno**——墨绿桌布→白卡发丝线（table/dealer/opp 卡）、枫红按钮全转蓝（创建/开始/喊 UNO/出牌/发送/抽牌）、disabled 态 `rgba($blue,.45)`；牌背重绘浅蓝底 `#A9CFEA`+深蓝门窗（unoCards BACK）；万能+4 转中性灰（灰叶两档+灰点阵）；牌面纸底 `#fdf6e8`→白、墨线 `#4a3b32`→`#2E4154`；聊天坞白底圆顶+发丝线+蓝名灰气泡+蓝 tint 触发钮。**gomoku**——chrome 已走 `$color-*` 别名自动变蓝，木纹减淡 `#FBF5E8`+格线 `#D8C9A8`、最后一手/落子预览圈红转蓝、胜利连线柔金、棋子渐变冷调（黑 `#4a5a6a→#25303c`）、猜拳卡/钮/黑白子转蓝白冷调、聊天坞同款。**ludo**——座位四色转马卡龙 `#F5A99C/#F2CE7E/#A9CFEA/#9AD4B4`（ludoRender LUDO_COLORS，DOM 飞机/骰子描边/播报同源）、棋盘白底冷墨、开局仪式卡/聊天坞转蓝白。**adventure**——座位色转马卡龙（adventureBoard SEAT_COLORS）、棋盘白底+柔红枫叶旗、`$maple` 行动色→`$blue`（btn-primary/targetable/countdown）、决斗/选窗/结算三遮罩 scrim 冷调、自带聊天面板转蓝名/蓝 tint。**jungle/junqi/xiangqi/tictactoe**——全量暖→冷映射（奶油底/板面→`$bg/$fill`、阵营 `#e85d4a/#5b8fb9`→`#E8806F/#4A86B8`、棋盘木色减淡 gomoku 同款、金文字转 `#C99A34`、金实底按钮→蓝实底、wx.showModal confirmColor→`#58A6DC`、字重 700/800/900→600）；xiangqi 红黑阵营=红`#E8806F`+墨`#2E4154`。**共享 chrome**——GameRulesModal 白底圆顶+蓝 tint 小节标+蓝 bullet；GameChatPanel 白底+蓝名+发丝线 chip。工程坑：python 批量替换把 junqi `'#C08A1E'` 连引号吃掉（TS18016），typecheck 抓住已修。typecheck 0 错 + test 全过 + `build:mp-weixin:local` 0 错，10 页 wxss 产物旧色 0 残留。**待 DevTools 手测**：每款双开房间走一局（含聊天发一条）；uno 重点看牌背/+4 新色、ludo 看马卡龙棋盘。

## Phase 4 · 收尾

- 截图存档：headless Chrome 375×812 逐页截 → `docs/design/screenshots-after/`
- 对照原型逐屏过差
- 真机过查（按压反馈 hover-class、安全区、键盘顶起）
- （可选，单独立项）程序化线性图标管线替换 emoji

> ✅ **2026-09-23 完成（聊天坞已在 3c/3d 一并做完，本次补齐截图对照 + 过差修复）**：**截图存档**——CDP 驱动 headless Chrome 375×812@2x 逐页截 23 张（13 主包 + 10 游戏）→ `docs/design/screenshots-after/`（3.1MB）。H5 无微信登录（`uni.login` 失败且 `/api/tools/home` 需登录态），截图管线用 CDP `Page.addScriptToEvaluateOnNewDocument` 预置 token（uni-h5 storage 格式：字符串裸存/对象包 `{"type","data"}`）+ `Fetch` 域拦截按 TS 类型伪造回包（`/api/tools/home` 的 catalog 取 dev 库 tool_catalog 真实行、榜单伪造 5 行），列表页/榜单/我的才能出数据态；后端无 CORS 头，浏览器侧另需 `--disable-web-security`（仅截图用，仓库零改动）。**对照过差修 5 处**：①**P0·home 整页不可见**——模板把页面内容包在 `<page-meta>` 里，而 page-meta 是配置节点不渲染内容（微信官方文档明确「内部内容不渲染」；H5 DOM 实证 `<uni-view style="display:none">` 包裹全部内容），即微信端同样整页空白，Phase 1 的「待 DevTools 手测」恰好没盖到；改成 `<page-meta ... />` 配置节点 + 内容平级的官方写法，`build:mp-weixin` 产物已验证。②**ludo** 大厅创建/开始/掷骰/再来一局 4 钮仍 `$red` 实底（3c 把 `$red` 定义成柔红 #E8806F 后误当已迁移）→ 全转 `$blue`，掷骰 `--move` 金 tint 变体（黄实底违规）→ 蓝 tint 蓝字；`__rules` 链接墨色→蓝。③**junqi/xiangqi/tictactoe** 大厅 `__primary` `#e8806f`→`#58a6dc`（游戏内阵营/炸弹红保留）、`__join-btn` 灰底→白底蓝描边蓝字（uno/gomoku 同款）、玩法说明链接→蓝。④**jungle** 加入按钮金边金字/玩法说明金字/品牌 VS 金字 → 蓝/蓝/次级墨；**adventure** 3 处 `btn-gold`（大厅加入、走N步主 CTA、摸道具）→ 蓝系（黄色不做实底），`.btn-gold` 规则删除、大厅加入改专用 `.join-btn` 白底蓝描边、规则入口→蓝。⑤8 款大厅「❓」红 emoji 退役（链接纯文字化、房内规则钮改 "?" 文字继承蓝色）——emoji 退役的第一小步，程序化图标管线仍单独立项。**静态审计**：`hover-class="press"` 覆盖确认（ToolCard 是 `:hover-class` 动态绑定，全局 `.press` 类在 common.scss）；`env(safe-area-inset-bottom)` 19 处（聊天坞 8 游戏/AppBottomNav/弹层均有）；仓库无 `adjust-position` 定制（默认顶起）。**待真机/DevTools 手测清单**：iPhone 底条上聊天坞输入/底部导航/对局按钮不被遮；uno/gomoku/junqi 等大厅房码输入键盘顶起与收起复位；对局态手测——uno 牌背浅蓝/+4 中性灰、ludo 马卡龙棋盘+飞机滑动、tetris 两种速度模式对比+直落防误触、sokoban 撤销/重开顶栏+dpad 长按连走+**小人在浅底上的可见度（H5 截图里白身发丝描边偏淡，需真机确认）**；8 款联机各发一条聊天（3c/3d 遗留）。**截图对照接受的差异**：列表页原生导航栏标题（平台 chrome）；工具图标为 emoji（DB 数据即 emoji，换图标=单独立项）；travel/food/anniversary/fortune 仍旧皮（Phase 2b/2c/2d 未做，不在本次范围）。typecheck 0 错 + test 全过 + `build:mp-weixin:local` 0 错，ludo wxss 仅存 `__leave`（退出=危险语义红，符合规范）。

---

## 已拍板决策（迁移时不得回退）

1. 小清新浅蓝 `#58A6DC` 唯一主色；全局禁渐变；黄色不做实底
2. 抽奖不出现签筒/抽签隐喻（礼盒 + 「开始开奖」）
3. 游戏以工具为主：无快速匹配、无实时在线数；联机 = 房间码邀请
4. 联机/单机分组用前端白名单，不改 tool_catalog
5. 原型/代码只体现已存在的功能，不虚构（成就/章节数据等）
6. 灵签宋体、纪念卡场景色、棋盘木色 = 内容个性，保留但减淡

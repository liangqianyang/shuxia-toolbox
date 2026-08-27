<?php

declare(strict_types=1);

use App\Controller\AdminFeatureController;
use App\Controller\BeadController;
use App\Controller\AdminToolController;
use App\Controller\AnniversaryController;
use App\Controller\AuthController;
use App\Controller\FeatureController;
use App\Controller\FoodController;
use App\Controller\FortuneController;
use App\Controller\GomokuController;
use App\Controller\GomokuWsController;
use App\Controller\HealthController;
use App\Controller\TravelController;
use App\Controller\ToolController;
use App\Controller\UnoController;
use App\Controller\UnoWsController;
use Hyperf\HttpServer\Router\Router;

// 容器/负载均衡健康检查，不需要 API Key。
Router::get('/health', [HealthController::class, 'index']);
Router::get('/uploads/avatar/{filename}', [AuthController::class, 'avatar']);

Router::addGroup('/api', function (): void {
    // API 健康检查：给前端或运维侧验证 /api 前缀可用。
    Router::get('/health', [HealthController::class, 'index']);

    // 微信账号体系：小程序 wx.login 换后端 token；用户主动同步头像昵称。
    Router::post('/auth/wechat-login', [AuthController::class, 'wechatLogin']);
    Router::post('/auth/profile', [AuthController::class, 'saveProfile']);
    Router::post('/auth/avatar', [AuthController::class, 'uploadAvatar']);
    Router::get('/auth/me', [AuthController::class, 'me']);

    // 用户工具集：首页展示选择和排序由用户账号持久化。
    Router::get('/tools/home', [ToolController::class, 'home']);
    Router::post('/tools/home', [ToolController::class, 'saveHome']);

    // 时光纪念卡：纪念日云同步、手机日历写入状态和站内提醒数据源。
    Router::get('/anniversaries', [AnniversaryController::class, 'index']);
    Router::post('/anniversaries', [AnniversaryController::class, 'save']);
    Router::post('/anniversaries/{id}/delete', [AnniversaryController::class, 'delete']);
    Router::post('/anniversaries/{id}/calendar-added', [AnniversaryController::class, 'markCalendarAdded']);
    Router::post('/anniversaries/{id}/subscribe', [AnniversaryController::class, 'subscribe']);

    // 全局功能开关：公开只读（前端决定 AI 入口展示）+ 运营台读写。
    Router::get('/config/features', [FeatureController::class, 'index']);
    Router::get('/admin/features', [AdminFeatureController::class, 'index']);
    Router::post('/admin/features', [AdminFeatureController::class, 'save']);

    // 工具运营台：仅由 ADMIN_WECHAT_OPENIDS 指定的管理员账号访问。
    Router::get('/admin/tools', [AdminToolController::class, 'index']);
    Router::post('/admin/tools/publication', [AdminToolController::class, 'setPublication']);
    Router::post('/admin/tools/order', [AdminToolController::class, 'saveOrder']);

    // 拼豆工具：色卡/估算接口，以及生成图纸前的微信内容安全检测。
    Router::get('/beads/palettes', [BeadController::class, 'palettes']);
    Router::post('/beads/estimate', [BeadController::class, 'estimate']);
    Router::post('/beads/sec-check', [BeadController::class, 'secCheck']);

    // 今天吃什么：附近餐厅、饭池店名搜索、定位反查、用户饭池/历史和饭局房间。
    Router::get('/food/nearby', [FoodController::class, 'nearby']);
    Router::get('/food/search-shops', [FoodController::class, 'searchShops']);
    Router::get('/food/reverse-geocode', [FoodController::class, 'reverseGeocode']);
    Router::get('/food/me', [FoodController::class, 'getMine']);
    Router::post('/food/me', [FoodController::class, 'saveMine']);
    Router::post('/food/room', [FoodController::class, 'saveRoom']);
    Router::get('/food/room/{code}', [FoodController::class, 'getRoom']);

    // 联机五子棋：房间创建/加入、轮询同步（WS 降级通道）、落子、再来一局与离开。
    Router::post('/gomoku/room', [GomokuController::class, 'create']);
    Router::post('/gomoku/room/{code}/join', [GomokuController::class, 'join']);
    Router::get('/gomoku/room/{code}', [GomokuController::class, 'state']);
    Router::post('/gomoku/room/{code}/move', [GomokuController::class, 'move']);
    Router::post('/gomoku/room/{code}/rematch', [GomokuController::class, 'rematch']);
    Router::post('/gomoku/room/{code}/undo-request', [GomokuController::class, 'requestUndo']);
    Router::post('/gomoku/room/{code}/undo-respond', [GomokuController::class, 'respondUndo']);
    Router::post('/gomoku/room/{code}/leave', [GomokuController::class, 'leave']);

    // UNO 联机：房间创建/加入/开局、轮询同步（WS 降级通道）、出牌/摸牌/不出、
    // +4 质疑、喊/举报 UNO、再来一局与离开。回合超时由 Timer 清扫器 + 写操作懒检查推进。
    Router::post('/uno/room', [UnoController::class, 'create']);
    Router::post('/uno/room/{code}/join', [UnoController::class, 'join']);
    Router::get('/uno/room/{code}', [UnoController::class, 'state']);
    Router::post('/uno/room/{code}/start', [UnoController::class, 'start']);
    Router::post('/uno/room/{code}/play', [UnoController::class, 'play']);
    Router::post('/uno/room/{code}/draw', [UnoController::class, 'draw']);
    Router::post('/uno/room/{code}/pass', [UnoController::class, 'pass']);
    Router::post('/uno/room/{code}/challenge', [UnoController::class, 'challenge']);
    Router::post('/uno/room/{code}/declare-uno', [UnoController::class, 'declareUno']);
    Router::post('/uno/room/{code}/catch-uno', [UnoController::class, 'catchUno']);
    Router::post('/uno/room/{code}/rematch', [UnoController::class, 'rematch']);
    Router::post('/uno/room/{code}/leave', [UnoController::class, 'leave']);

    // 每日灵签：配额、抽签（服务端权威随机）、AI 解签（缓存）、分享加次、历史。
    Router::get('/fortune/quota', [FortuneController::class, 'quota']);
    Router::post('/fortune/draw', [FortuneController::class, 'draw']);
    Router::post('/fortune/interpret', [FortuneController::class, 'interpret']);
    Router::post('/fortune/share-bonus', [FortuneController::class, 'shareBonus']);
    Router::get('/fortune/history', [FortuneController::class, 'history']);

    // AI 旅行攻略：地点搜索、生成/局部重写行程，以及云保存分享码。
    Router::get('/travel/geocode', [TravelController::class, 'geocode']);
    Router::post('/travel/plan', [TravelController::class, 'plan']);
    Router::post('/travel/refine-day', [TravelController::class, 'refineDay']);
    Router::post('/travel/replace-stop', [TravelController::class, 'replaceStop']);
    Router::post('/travel/share', [TravelController::class, 'saveShare']);
    Router::get('/travel/share/{code}', [TravelController::class, 'getShare']);
});

// 联机游戏 WebSocket 通道：只负责连接管理与状态推送，对局变更仍走上面的 HTTP 接口。
Router::addServer('ws', function (): void {
    Router::get('/gomoku/ws', GomokuWsController::class);
    Router::get('/uno/ws', UnoWsController::class);
});

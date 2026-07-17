<?php

declare(strict_types=1);

use App\Controller\BeadController;
use App\Controller\AdminToolController;
use App\Controller\AnniversaryController;
use App\Controller\AuthController;
use App\Controller\FoodController;
use App\Controller\HealthController;
use App\Controller\TravelController;
use App\Controller\ToolController;
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

    // AI 旅行攻略：地点搜索、生成/局部重写行程，以及云保存分享码。
    Router::get('/travel/geocode', [TravelController::class, 'geocode']);
    Router::post('/travel/plan', [TravelController::class, 'plan']);
    Router::post('/travel/refine-day', [TravelController::class, 'refineDay']);
    Router::post('/travel/replace-stop', [TravelController::class, 'replaceStop']);
    Router::post('/travel/share', [TravelController::class, 'saveShare']);
    Router::get('/travel/share/{code}', [TravelController::class, 'getShare']);
});

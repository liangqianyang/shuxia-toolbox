<?php

declare(strict_types=1);

use App\Controller\BeadController;
use App\Controller\AuthController;
use App\Controller\FoodController;
use App\Controller\HealthController;
use App\Controller\TravelController;
use Hyperf\HttpServer\Router\Router;

Router::get('/health', [HealthController::class, 'index']);

Router::addGroup('/api', function (): void {
    Router::get('/health', [HealthController::class, 'index']);
    Router::post('/auth/wechat-login', [AuthController::class, 'wechatLogin']);
    Router::post('/auth/profile', [AuthController::class, 'saveProfile']);
    Router::get('/beads/palettes', [BeadController::class, 'palettes']);
    Router::post('/beads/estimate', [BeadController::class, 'estimate']);
    Router::get('/food/nearby', [FoodController::class, 'nearby']);
    Router::get('/food/search-shops', [FoodController::class, 'searchShops']);
    Router::get('/food/reverse-geocode', [FoodController::class, 'reverseGeocode']);
    Router::get('/food/me', [FoodController::class, 'getMine']);
    Router::post('/food/me', [FoodController::class, 'saveMine']);
    Router::post('/food/room', [FoodController::class, 'saveRoom']);
    Router::get('/food/room/{code}', [FoodController::class, 'getRoom']);
    Router::get('/travel/geocode', [TravelController::class, 'geocode']);
    Router::post('/travel/plan', [TravelController::class, 'plan']);
    Router::post('/travel/refine-day', [TravelController::class, 'refineDay']);
    Router::post('/travel/replace-stop', [TravelController::class, 'replaceStop']);
    Router::post('/travel/share', [TravelController::class, 'saveShare']);
    Router::get('/travel/share/{code}', [TravelController::class, 'getShare']);
});

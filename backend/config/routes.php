<?php

declare(strict_types=1);

use App\Controller\BeadController;
use App\Controller\HealthController;
use App\Controller\TravelController;
use Hyperf\HttpServer\Router\Router;

Router::get('/health', [HealthController::class, 'index']);

Router::addGroup('/api', function (): void {
    Router::get('/health', [HealthController::class, 'index']);
    Router::get('/beads/palettes', [BeadController::class, 'palettes']);
    Router::post('/beads/estimate', [BeadController::class, 'estimate']);
    Router::get('/travel/geocode', [TravelController::class, 'geocode']);
    Router::post('/travel/plan', [TravelController::class, 'plan']);
    Router::post('/travel/refine-day', [TravelController::class, 'refineDay']);
    Router::post('/travel/replace-stop', [TravelController::class, 'replaceStop']);
});

<?php

declare(strict_types=1);

namespace App\Service;

use App\Model\FoodHistory;
use App\Model\FoodPoolGroup;
use App\Model\FoodPoolItem;
use App\Model\FoodPreference;
use Hyperf\DbConnection\Db;

/**
 * 用户吃饭工具数据：饭池和吃过历史。
 */
final class FoodUserDataService
{
    /**
     * 读取用户饭池和历史。
     *
     * @return array{preferences: array<int, array<string, mixed>>, poolGroups: array<int, array<string, mixed>>, poolItems: array<int, array<string, mixed>>, history: array<int, array<string, mixed>>}
     */
    public function get(int $userId): array
    {
        return [
            'preferences' => $this->preferences($userId),
            'poolGroups' => $this->poolGroups($userId),
            'poolItems' => $this->poolItems($userId),
            'history' => $this->history($userId),
        ];
    }

    /**
     * 覆盖保存用户饭池和历史。前端当前是单页工具，整包同步比逐条 CRUD 更简单稳定。
     *
     * @param array<int, mixed> $poolItems
     * @param array<int, mixed> $history
     * @param array<int, mixed> $preferences
     * @param array<int, mixed> $poolGroups
     */
    public function save(int $userId, array $poolItems, array $history, array $preferences = [], array $poolGroups = []): array
    {
        Db::transaction(function () use ($userId, $poolItems, $history, $preferences, $poolGroups): void {
            FoodPreference::query()->where('user_id', $userId)->delete();
            FoodPoolGroup::query()->where('user_id', $userId)->delete();
            FoodPoolItem::query()->where('user_id', $userId)->delete();
            FoodHistory::query()->where('user_id', $userId)->delete();

            $now = date('Y-m-d H:i:s');
            foreach (array_values(array_slice($preferences, 0, 50)) as $index => $item) {
                if (! is_array($item)) {
                    continue;
                }
                $label = trim((string) ($item['label'] ?? ''));
                if ($label === '') {
                    continue;
                }
                FoodPreference::query()->create([
                    'user_id' => $userId,
                    'client_id' => (string) ($item['id'] ?? hash('crc32b', $label . $index)),
                    'label' => mb_substr($label, 0, 40),
                    'sort_order' => $index,
                ]);
            }

            foreach (array_values(array_slice($poolGroups, 0, 50)) as $index => $item) {
                if (! is_array($item)) {
                    continue;
                }
                $name = trim((string) ($item['name'] ?? ''));
                if ($name === '') {
                    continue;
                }
                FoodPoolGroup::query()->create([
                    'user_id' => $userId,
                    'client_id' => (string) ($item['id'] ?? hash('crc32b', $name . $index)),
                    'name' => mb_substr($name, 0, 40),
                    'sort_order' => $index,
                ]);
            }

            foreach (array_values(array_slice($poolItems, 0, 200)) as $index => $item) {
                if (! is_array($item)) {
                    continue;
                }
                $name = trim((string) ($item['name'] ?? ''));
                if ($name === '') {
                    continue;
                }
                FoodPoolItem::query()->create([
                    'user_id' => $userId,
                    'client_id' => (string) ($item['id'] ?? hash('crc32b', $name . $index)),
                    'group_id' => mb_substr(trim((string) ($item['groupId'] ?? 'default')) ?: 'default', 0, 80),
                    'name' => mb_substr($name, 0, 120),
                    'note' => mb_substr(trim((string) ($item['note'] ?? '')), 0, 255),
                    'address' => mb_substr(trim((string) ($item['address'] ?? '')), 0, 255),
                    'lat' => is_numeric($item['lat'] ?? null) ? (float) $item['lat'] : 0,
                    'lng' => is_numeric($item['lng'] ?? null) ? (float) $item['lng'] : 0,
                    'source' => mb_substr(trim((string) ($item['source'] ?? 'pool')), 0, 20),
                    'sort_order' => $index,
                ]);
            }

            foreach (array_values(array_slice($history, 0, 50)) as $index => $item) {
                if (! is_array($item)) {
                    continue;
                }
                $name = trim((string) ($item['name'] ?? ''));
                if ($name === '') {
                    continue;
                }
                $at = (int) ($item['at'] ?? time() * 1000);
                FoodHistory::query()->create([
                    'user_id' => $userId,
                    'client_id' => (string) ($item['id'] ?? hash('crc32b', $name . $index)),
                    'name' => mb_substr($name, 0, 120),
                    'eaten_at' => date('Y-m-d H:i:s', (int) floor($at / 1000)),
                    'sort_order' => $index,
                    'created_at' => $now,
                ]);
            }
        });

        return $this->get($userId);
    }

    /** @return array<int, array<string, mixed>> */
    private function preferences(int $userId): array
    {
        return FoodPreference::query()
            ->where('user_id', $userId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(static fn (FoodPreference $item): array => [
                'id' => (string) $item->client_id,
                'label' => (string) $item->label,
            ])
            ->values()
            ->all();
    }

    /** @return array<int, array<string, mixed>> */
    private function poolGroups(int $userId): array
    {
        return FoodPoolGroup::query()
            ->where('user_id', $userId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(static fn (FoodPoolGroup $item): array => [
                'id' => (string) $item->client_id,
                'name' => (string) $item->name,
            ])
            ->values()
            ->all();
    }

    /** @return array<int, array<string, mixed>> */
    private function poolItems(int $userId): array
    {
        return FoodPoolItem::query()
            ->where('user_id', $userId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(static fn (FoodPoolItem $item): array => [
                'id' => (string) $item->client_id,
                'groupId' => (string) $item->group_id !== '' ? (string) $item->group_id : 'default',
                'name' => (string) $item->name,
                'note' => (string) $item->note,
                'address' => (string) $item->address,
                'lat' => (float) $item->lat !== 0.0 ? (float) $item->lat : null,
                'lng' => (float) $item->lng !== 0.0 ? (float) $item->lng : null,
                'distanceM' => null,
                'source' => (string) $item->source,
            ])
            ->values()
            ->all();
    }

    /** @return array<int, array<string, mixed>> */
    private function history(int $userId): array
    {
        return FoodHistory::query()
            ->where('user_id', $userId)
            ->orderBy('sort_order')
            ->orderByDesc('eaten_at')
            ->get()
            ->map(static fn (FoodHistory $item): array => [
                'id' => (string) $item->client_id,
                'name' => (string) $item->name,
                'at' => strtotime((string) $item->eaten_at) * 1000,
            ])
            ->values()
            ->all();
    }
}

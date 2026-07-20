<?php

declare(strict_types=1);

namespace App\Service;

use App\Exception\BizException;
use App\Model\ToolCatalog;
use App\Model\UserToolPreference;
use Hyperf\DbConnection\Db;

/** 工具目录、用户首页偏好与运营上架状态。 */
final class ToolCatalogService
{
    /**
     * @return array{catalog: array<int, array{key: string, name: string, description: string, icon: string, route: string}>, homeToolKeys: array<int, string>}
     */
    public function userTools(int $userId): array
    {
        /** @var array<int, ToolCatalog> $catalog */
        $catalog = ToolCatalog::query()
            ->where('is_published', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->all();
        $catalogByKey = [];
        foreach ($catalog as $tool) {
            $catalogByKey[(string) $tool->tool_key] = $tool;
        }

        $preferences = UserToolPreference::query()
            ->where('user_id', $userId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
        $homeToolKeys = [];
        foreach ($preferences as $preference) {
            $toolKey = (string) $preference->tool_key;
            if (isset($catalogByKey[$toolKey])) {
                $homeToolKeys[] = $toolKey;
            }
        }

        // 老用户首次进入该功能时，默认保留全部当前上架工具，避免首页突然变空。
        if ($homeToolKeys === [] && $catalogByKey !== []) {
            $homeToolKeys = array_keys($catalogByKey);
        }

        return [
            'catalog' => array_map([$this, 'formatTool'], $catalog),
            'homeToolKeys' => $homeToolKeys,
        ];
    }

    /** @param array<int, mixed> $toolKeys */
    public function saveUserTools(int $userId, array $toolKeys): array
    {
        $keys = [];
        foreach ($toolKeys as $toolKey) {
            if (! is_string($toolKey)) {
                continue;
            }
            $toolKey = trim($toolKey);
            if ($toolKey !== '' && ! in_array($toolKey, $keys, true)) {
                $keys[] = $toolKey;
            }
        }
        if ($keys === []) {
            throw new BizException(422, '首页至少保留一个工具');
        }
        if (count($keys) > 20) {
            throw new BizException(422, '首页最多展示 20 个工具');
        }

        $publishedKeys = ToolCatalog::query()
            ->where('is_published', true)
            ->whereIn('tool_key', $keys)
            ->pluck('tool_key')
            ->all();
        if (count($publishedKeys) !== count($keys)) {
            throw new BizException(422, '存在未上架或无效的工具');
        }

        Db::transaction(function () use ($userId, $keys): void {
            UserToolPreference::query()->where('user_id', $userId)->delete();
            foreach ($keys as $index => $toolKey) {
                UserToolPreference::query()->create([
                    'user_id' => $userId,
                    'tool_key' => $toolKey,
                    'sort_order' => ($index + 1) * 10,
                ]);
            }
        });

        return $this->userTools($userId);
    }

    /** @return array<int, array{key: string, name: string, description: string, icon: string, route: string, isPublished: bool, sortOrder: int}> */
    public function adminTools(): array
    {
        return ToolCatalog::query()
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(fn(ToolCatalog $tool): array => $this->formatAdminTool($tool))
            ->all();
    }

    public function setPublished(string $toolKey, bool $published): array
    {
        /** @var null|ToolCatalog $tool */
        $tool = ToolCatalog::query()->where('tool_key', trim($toolKey))->first();
        if ($tool === null) {
            throw new BizException(404, '工具不存在');
        }
        $tool->is_published = $published;
        $tool->save();
        return $this->formatAdminTool($tool);
    }

    /** @param array<int, mixed> $toolKeys */
    public function saveCatalogOrder(array $toolKeys): array
    {
        $keys = [];
        foreach ($toolKeys as $toolKey) {
            if (! is_string($toolKey)) {
                continue;
            }
            $toolKey = trim($toolKey);
            if ($toolKey !== '' && ! in_array($toolKey, $keys, true)) {
                $keys[] = $toolKey;
            }
        }
        $catalog = ToolCatalog::query()->orderBy('sort_order')->orderBy('id')->get();
        if (count($keys) !== $catalog->count() || count(array_intersect($keys, $catalog->pluck('tool_key')->all())) !== count($keys)) {
            throw new BizException(422, '工具排序数据不完整');
        }

        Db::transaction(function () use ($keys): void {
            foreach ($keys as $index => $toolKey) {
                ToolCatalog::query()->where('tool_key', $toolKey)->update(['sort_order' => ($index + 1) * 10]);
            }
        });
        return $this->adminTools();
    }

    /** @return array{key: string, name: string, description: string, icon: string, route: string} */
    private function formatTool(ToolCatalog $tool): array
    {
        return [
            'key' => (string) $tool->tool_key,
            'name' => (string) $tool->name,
            'description' => (string) $tool->description,
            'icon' => (string) $tool->icon,
            'route' => (string) $tool->route,
        ];
    }

    /** @return array{key: string, name: string, description: string, icon: string, route: string, isPublished: bool, sortOrder: int} */
    private function formatAdminTool(ToolCatalog $tool): array
    {
        return [
            ...$this->formatTool($tool),
            'isPublished' => (bool) $tool->is_published,
            'sortOrder' => (int) $tool->sort_order,
        ];
    }
}

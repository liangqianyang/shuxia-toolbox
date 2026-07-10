<?php

declare(strict_types=1);

namespace App\Service;

use App\Model\TravelShare;
use RuntimeException;

/**
 * 旅行行程分享存储。
 *
 * 使用 MySQL 保存完整 Trip JSON，不再写 runtime 文件。
 */
final class TravelShareService
{
    /** 单个分享记录上限，避免用户照片临时路径或异常数据把数据库写爆。 */
    private const int MAX_PAYLOAD_BYTES = 2_000_000;

    /**
     * 保存完整 Trip JSON，并返回可导入的分享码。
     *
     * @param array<string, mixed> $trip 前端当前行程对象，服务端不修改内容，只做大小和序列化校验
     * @return array{code: string, title: string, createdAt: string, sharePath: string}
     */
    public function save(array $trip): array
    {
        if ($trip === []) {
            throw new RuntimeException('行程数据不能为空');
        }

        $json = json_encode($trip, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (! is_string($json)) {
            throw new RuntimeException('行程数据序列化失败');
        }
        if (strlen($json) > self::MAX_PAYLOAD_BYTES) {
            throw new RuntimeException('行程数据过大，暂不能云保存');
        }

        $title = is_string($trip['title'] ?? null) ? trim((string) $trip['title']) : '未命名行程';
        $code = $this->newCode();
        /** @var TravelShare $share */
        $share = TravelShare::query()->create([
            'code' => $code,
            'title' => $title,
            'payload' => $trip,
        ]);

        return [
            'code' => $code,
            'title' => (string) $share->title,
            'createdAt' => (string) $share->created_at,
            'sharePath' => '/pages/travel/index?share=' . $code,
        ];
    }

    /**
     * 按分享码读取记录；分享码非法或记录不存在视为未命中。
     *
     * @return array<string, mixed>|null
     */
    public function find(string $code): ?array
    {
        $code = $this->normalizeCode($code);
        if ($code === '') {
            return null;
        }

        /** @var null|TravelShare $share */
        $share = TravelShare::query()->where('code', $code)->first();
        if ($share === null || ! is_array($share->payload)) {
            return null;
        }

        return [
            'code' => (string) $share->code,
            'title' => (string) $share->title,
            'createdAt' => (string) $share->created_at,
            'trip' => $share->payload,
        ];
    }

    /** 生成短分享码。冲突概率很低，但仍循环避开已存在记录。 */
    private function newCode(): string
    {
        for ($i = 0; $i < 8; $i++) {
            $code = bin2hex(random_bytes(4));
            if (! TravelShare::query()->where('code', $code)->exists()) {
                return $code;
            }
        }
        throw new RuntimeException('分享码生成失败');
    }

    /** 分享码只接受 8 位十六进制。 */
    private function normalizeCode(string $code): string
    {
        $code = strtolower(trim($code));
        return preg_match('/^[a-f0-9]{8}$/', $code) === 1 ? $code : '';
    }
}

<?php

declare(strict_types=1);

namespace App\Service;

use App\Model\FoodRoom;
use RuntimeException;

/**
 * 吃饭饭局数据库存储。
 *
 * 饭局码可分享给朋友；房间数据保存在 MySQL，不落 runtime 文件。
 */
final class FoodRoomService
{
    private const int MAX_PAYLOAD_BYTES = 200_000;

    /**
     * 保存或覆盖饭局数据。
     *
     * @param array<string, mixed> $room 前端饭局状态
     * @return array{code: string, updatedAt: string, sharePath: string}
     */
    public function save(array $room, int $ownerUserId, string $code = ''): array
    {
        if ($ownerUserId <= 0) {
            throw new RuntimeException('用户未登录');
        }
        if ($room === []) {
            throw new RuntimeException('饭局数据不能为空');
        }

        $payload = json_encode($room, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (! is_string($payload)) {
            throw new RuntimeException('饭局数据序列化失败');
        }
        if (strlen($payload) > self::MAX_PAYLOAD_BYTES) {
            throw new RuntimeException('饭局数据过大，暂不能保存');
        }

        $code = $this->normalizeCode($code) ?: $this->newCode();
        /** @var FoodRoom $model */
        $model = FoodRoom::query()->firstOrNew(['code' => $code]);
        $model->owner_user_id = $ownerUserId;
        $model->payload = $room;
        $model->save();

        return [
            'code' => $code,
            'updatedAt' => (string) $model->updated_at,
            'sharePath' => '/pages/food/index?room=' . $code,
        ];
    }

    /**
     * 读取饭局记录。
     *
     * @return array{code: string, updatedAt: string, room: array<string, mixed>}|null
     */
    public function find(string $code): ?array
    {
        $code = $this->normalizeCode($code);
        if ($code === '') {
            return null;
        }

        /** @var null|FoodRoom $room */
        $room = FoodRoom::query()->where('code', $code)->first();
        if ($room === null || ! is_array($room->payload)) {
            return null;
        }

        return [
            'code' => (string) $room->code,
            'updatedAt' => (string) $room->updated_at,
            'room' => $room->payload,
        ];
    }

    /** 生成 4 位饭局码；小概率冲突时重试。 */
    private function newCode(): string
    {
        for ($i = 0; $i < 16; $i++) {
            $code = (string) random_int(1000, 9999);
            if (! FoodRoom::query()->where('code', $code)->exists()) {
                return $code;
            }
        }
        throw new RuntimeException('饭局码生成失败');
    }

    /** 饭局码只接受 4 位数字。 */
    private function normalizeCode(string $code): string
    {
        $code = trim($code);
        return preg_match('/^[0-9]{4}$/', $code) === 1 ? $code : '';
    }
}

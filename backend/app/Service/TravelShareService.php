<?php

declare(strict_types=1);

namespace App\Service;

use RuntimeException;

/**
 * 旅行行程轻量分享存储。
 *
 * 当前阶段先用 runtime 文件存储验证「云保存/分享码导入」闭环，不引入账号、数据库和权限模型。
 * 生产化后建议替换为数据库表，并补充 owner、过期时间、删除/覆盖、访问审计等字段。
 */
final class TravelShareService
{
    /** 单个分享记录上限，避免用户照片临时路径或异常数据把本地磁盘写爆。 */
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

        $code = $this->newCode();
        $record = [
            'code' => $code,
            'title' => is_string($trip['title'] ?? null) ? trim((string) $trip['title']) : '未命名行程',
            'createdAt' => date(DATE_ATOM),
            'trip' => $trip,
        ];

        $json = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (! is_string($json)) {
            throw new RuntimeException('行程数据序列化失败');
        }
        if (strlen($json) > self::MAX_PAYLOAD_BYTES) {
            throw new RuntimeException('行程数据过大，暂不能云保存');
        }

        $dir = $this->storageDir();
        if (! is_dir($dir) && ! mkdir($dir, 0775, true) && ! is_dir($dir)) {
            throw new RuntimeException('云保存目录不可写');
        }

        file_put_contents($this->recordPath($code), $json, LOCK_EX);

        return [
            'code' => $code,
            'title' => $record['title'],
            'createdAt' => $record['createdAt'],
            'sharePath' => '/pages/travel/index?share=' . $code,
        ];
    }

    /**
     * 按分享码读取记录；分享码非法、文件不存在或 JSON 损坏均视为未命中。
     *
     * @return array<string, mixed>|null
     */
    public function find(string $code): ?array
    {
        $code = $this->normalizeCode($code);
        if ($code === '') {
            return null;
        }

        $path = $this->recordPath($code);
        if (! is_file($path)) {
            return null;
        }

        $raw = file_get_contents($path);
        if (! is_string($raw) || $raw === '') {
            return null;
        }

        $data = json_decode($raw, true);
        return is_array($data) ? $data : null;
    }

    /** 生成短分享码。冲突概率很低，但仍循环避开已存在文件。 */
    private function newCode(): string
    {
        for ($i = 0; $i < 8; $i++) {
            $code = bin2hex(random_bytes(4));
            if (! is_file($this->recordPath($code))) {
                return $code;
            }
        }
        throw new RuntimeException('分享码生成失败');
    }

    /** 分享码只接受 8 位十六进制，避免路径穿越或任意文件读取。 */
    private function normalizeCode(string $code): string
    {
        $code = strtolower(trim($code));
        return preg_match('/^[a-f0-9]{8}$/', $code) === 1 ? $code : '';
    }

    /** 单条记录文件路径。 */
    private function recordPath(string $code): string
    {
        return $this->storageDir() . '/' . $code . '.json';
    }

    /** runtime 目录随应用部署，需要线上持久化时应挂载 volume 或改用数据库。 */
    private function storageDir(): string
    {
        return BASE_PATH . '/runtime/travel-shares';
    }
}

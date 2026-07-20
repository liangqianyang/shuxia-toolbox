<?php

declare(strict_types=1);

namespace App\Service;

use App\Exception\BizException;
use Psr\Http\Message\UploadedFileInterface;
use RuntimeException;

/** 本地开发期的用户头像存储；线上可替换为对象存储实现。 */
final class AvatarUploadService
{
    private const int MAX_BYTES = 2 * 1024 * 1024;

    private const array MIME_EXTENSIONS = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];

    public function store(UploadedFileInterface $file, int $userId): string
    {
        if ($file->getError() !== UPLOAD_ERR_OK) {
            throw new BizException(422, '头像上传失败');
        }
        if (($file->getSize() ?? 0) < 1 || $file->getSize() > self::MAX_BYTES) {
            throw new BizException(422, '头像大小需小于 2MB');
        }

        $stream = $file->getStream();
        $metadata = $stream->getMetadata('uri');
        $temporaryPath = is_string($metadata) ? $metadata : '';
        $mimeType = $temporaryPath !== '' && function_exists('mime_content_type')
            ? (string) mime_content_type($temporaryPath)
            : (string) $file->getClientMediaType();
        $extension = self::MIME_EXTENSIONS[$mimeType] ?? null;
        if ($extension === null) {
            throw new BizException(422, '请上传 JPG、PNG 或 WebP 格式的头像');
        }

        $directory = $this->directory();
        if (! is_dir($directory) && ! mkdir($directory, 0o775, true) && ! is_dir($directory)) {
            throw new RuntimeException('创建头像目录失败');
        }

        $filename = sprintf('%d-%s.%s', $userId, bin2hex(random_bytes(12)), $extension);
        $file->moveTo($directory . '/' . $filename);

        return '/uploads/avatar/' . $filename;
    }

    public function pathFor(string $filename): ?string
    {
        if (! preg_match('/^\d+-[a-f0-9]{24}\.(jpg|png|webp)$/', $filename)) {
            return null;
        }
        $path = $this->directory() . '/' . $filename;
        return is_file($path) && is_readable($path) ? $path : null;
    }

    public function mimeType(string $path): string
    {
        $mimeType = function_exists('mime_content_type') ? (string) mime_content_type($path) : '';
        return array_key_exists($mimeType, self::MIME_EXTENSIONS) ? $mimeType : 'application/octet-stream';
    }

    private function directory(): string
    {
        return BASE_PATH . '/runtime/uploads/avatars';
    }
}

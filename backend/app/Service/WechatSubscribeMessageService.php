<?php

declare(strict_types=1);

namespace App\Service;

use GuzzleHttp\Client;
use Hyperf\Contract\ConfigInterface;
use RuntimeException;
use Throwable;

/**
 * 微信小程序订阅消息：获取 access_token 并发送一次性订阅提醒。
 */
final class WechatSubscribeMessageService
{
    private readonly Client $client;

    /** @var array{token: string, expiresAt: int}|null */
    private static ?array $tokenCache = null;

    public function __construct(
        private readonly ConfigInterface $config,
    ) {
        $this->client = new Client();
    }

    /**
     * 发一条订阅消息。成功返回 true，失败返回错误信息。
     *
     * @param array{thing1?: array{value: string}, date2?: array{value: string}, thing3?: array{value: string}} $data
     */
    public function send(string $openid, string $templateId, string $page, array $data): true|string
    {
        $token = $this->accessToken();

        try {
            $response = $this->client->post(
                "https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token={$token}",
                [
                    'json' => [
                        'touser' => $openid,
                        'template_id' => $templateId,
                        'page' => $page,
                        'data' => $data,
                        'miniprogram_state' => $this->isProduction() ? 'formal' : 'developer',
                    ],
                    'timeout' => 10,
                ],
            );
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            return '微信订阅消息请求失败：' . $e->getMessage();
        }

        $errcode = (int) ($body['errcode'] ?? -1);
        if ($errcode !== 0) {
            return (string) ($body['errmsg'] ?? '发送失败');
        }

        return true;
    }

    /** 获取 access_token，内存缓存 7000 秒。 */
    private function accessToken(): string
    {
        if (self::$tokenCache !== null && time() < self::$tokenCache['expiresAt']) {
            return self::$tokenCache['token'];
        }

        $appid = (string) $this->config->get('wechat.mini_program.appid', '');
        $secret = (string) $this->config->get('wechat.mini_program.secret', '');
        if ($appid === '' || $secret === '') {
            throw new RuntimeException('未配置 WECHAT_MINI_APPID/WECHAT_MINI_SECRET');
        }

        try {
            $response = $this->client->get('https://api.weixin.qq.com/cgi-bin/token', [
                'query' => [
                    'grant_type' => 'client_credential',
                    'appid' => $appid,
                    'secret' => $secret,
                ],
                'timeout' => 8,
            ]);
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            throw new RuntimeException('获取微信 access_token 失败：' . $e->getMessage(), 0, $e);
        }

        $token = (string) ($body['access_token'] ?? '');
        if ($token === '') {
            throw new RuntimeException('微信未返回 access_token：' . json_encode($body, JSON_UNESCAPED_UNICODE));
        }

        $expiresIn = max(60, (int) ($body['expires_in'] ?? 7200) - 200);

        self::$tokenCache = [
            'token' => $token,
            'expiresAt' => time() + $expiresIn,
        ];

        return $token;
    }

    private function isProduction(): bool
    {
        // 注意：入口用 putenv() 注入 .env，$_ENV 数组不会被填充，只能用 config/getenv 读取。
        // miniprogram_state=developer 时正式版小程序收不到订阅消息，故这里必须能正确判定生产环境。
        $env = (string) $this->config->get('app_env', getenv('APP_ENV') ?: 'dev');

        return in_array($env, ['production', 'prod'], true);
    }
}

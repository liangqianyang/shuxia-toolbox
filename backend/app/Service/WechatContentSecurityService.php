<?php

declare(strict_types=1);

namespace App\Service;

use GuzzleHttp\Client;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Redis\RedisFactory;
use RuntimeException;
use Throwable;

/**
 * 微信小程序内容安全服务。
 *
 * 审核要求用户可输入/发布的内容必须在后端接入内容安全 API。
 * 这里只对外暴露「安全/违规」结果，业务层不向用户展示具体命中原因。
 */
final class WechatContentSecurityService
{
    private const string TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
    private const string MSG_CHECK_URL = 'https://api.weixin.qq.com/wxa/msg_sec_check';
    private const string TOKEN_CACHE_KEY = 'shuxia:wechat:mini_program:access_token';

    private readonly Client $client;

    public function __construct(
        private readonly ConfigInterface $config,
        private readonly RedisFactory $redisFactory,
    ) {
        $this->client = new Client();
    }

    /**
     * 检测文本内容；命中风险时返回 false。
     *
     * @param string $content 待检测文本，建议调用方传用户输入或即将发布的摘要文本。
     * @param string $openid 用户 openid；微信接口要求传入真实用户 openid。
     * @param int $scene 场景值；2 = 评论/资料/论坛等用户输入场景，覆盖拼豆生成前安全校验。
     */
    public function checkText(string $content, string $openid, int $scene = 2): bool
    {
        $content = trim($content);
        if ($content === '') {
            return true;
        }

        $token = $this->accessToken();
        try {
            $response = $this->client->post(self::MSG_CHECK_URL, [
                'query' => ['access_token' => $token],
                'json' => [
                    'content' => mb_substr($content, 0, 2500),
                    'version' => 2,
                    'scene' => $scene,
                    'openid' => $openid,
                ],
                'timeout' => 8,
            ]);
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            throw new RuntimeException('内容安全检测失败：' . $e->getMessage(), 0, $e);
        }

        $errcode = (int) ($body['errcode'] ?? -1);
        if ($errcode !== 0) {
            $errmsg = is_string($body['errmsg'] ?? null) ? $body['errmsg'] : 'unknown';
            throw new RuntimeException('内容安全接口返回错误：' . $errmsg);
        }

        $result = is_array($body['result'] ?? null) ? $body['result'] : [];
        return (int) ($result['suggest'] ?? 0) === 0;
    }

    /**
     * 获取小程序 access_token；统一使用 Redis 缓存，避免频繁请求微信接口。
     */
    private function accessToken(): string
    {
        $redis = $this->redisFactory->get('default');
        $cached = $redis->get(self::TOKEN_CACHE_KEY);
        if (is_string($cached) && $cached !== '') {
            return (string) $cached;
        }

        $appid = (string) $this->config->get('wechat.mini_program.appid', '');
        $secret = (string) $this->config->get('wechat.mini_program.secret', '');
        if ($appid === '' || $secret === '') {
            throw new RuntimeException('未配置 WECHAT_MINI_APPID/WECHAT_MINI_SECRET');
        }

        try {
            $response = $this->client->get(self::TOKEN_URL, [
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

        if ((int) ($body['errcode'] ?? 0) !== 0) {
            throw new RuntimeException((string) ($body['errmsg'] ?? '获取微信 access_token 失败'));
        }

        $token = trim((string) ($body['access_token'] ?? ''));
        if ($token === '') {
            throw new RuntimeException('微信 access_token 为空');
        }

        $ttl = max(300, (int) ($body['expires_in'] ?? 7200) - 300);
        $redis->setex(self::TOKEN_CACHE_KEY, $ttl, $token);

        return $token;
    }
}

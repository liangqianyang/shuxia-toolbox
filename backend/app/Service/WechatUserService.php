<?php

declare(strict_types=1);

namespace App\Service;

use App\Model\UserSession;
use App\Model\WechatUser;
use GuzzleHttp\Client;
use Hyperf\Contract\ConfigInterface;
use Random\RandomException;
use RuntimeException;
use Throwable;

/**
 * 微信小程序用户服务。
 *
 * 用 wx.login code 换 openid，落库后签发后端 token；业务接口用 X-User-Token 识别用户。
 */
final class WechatUserService
{
    private readonly Client $client;

    public function __construct(
        private readonly ConfigInterface $config,
    ) {
        $this->client = new Client();
    }

    /**
     * 微信 code 登录并返回后端 token。
     *
     * @param string $code
     * @param array<string, mixed> $profile 可选昵称/头像，来自用户授权后的 getUserProfile
     * @return array{token: string, expiresAt: string, user: array{id: int, openid: string, nickname: string, avatarUrl: string}}
     * @throws RandomException
     */
    public function login(string $code, array $profile = []): array
    {
        $code = trim($code);
        if ($code === '') {
            throw new RuntimeException('微信登录 code 不能为空');
        }

        $session = $this->codeToSession($code);
        $openid = trim((string) ($session['openid'] ?? ''));
        if ($openid === '') {
            throw new RuntimeException('微信登录未返回 openid');
        }

        $user = $this->upsertUser($openid, (string) ($session['unionid'] ?? ''), $profile);
        $token = bin2hex(random_bytes(32));
        $expiresAt = date('Y-m-d H:i:s', time() + 86400 * 30);
        $now = date('Y-m-d H:i:s');

        UserSession::query()->create([
            'token_hash' => hash('sha256', $token),
            'user_id' => $user['id'],
            'expires_at' => $expiresAt,
            'created_at' => $now,
            'last_seen_at' => $now,
        ]);

        return [
            'token' => $token,
            'expiresAt' => $expiresAt,
            'user' => $user,
        ];
    }

    /**
     * 根据请求头 token 获取用户 id，非法或过期返回 null。
     */
    public function userIdByToken(string $token): ?int
    {
        $token = trim($token);
        if ($token === '') {
            return null;
        }

        /** @var null|UserSession $session */
        $session = UserSession::query()
            ->where('token_hash', hash('sha256', $token))
            ->where('expires_at', '>', date('Y-m-d H:i:s'))
            ->first();
        if ($session === null) {
            return null;
        }

        $session->last_seen_at = date('Y-m-d H:i:s');
        $session->save();

        return (int) $session->user_id;
    }

    /**
     * 读取用户资料。
     *
     * @return array{id: int, openid: string, nickname: string, avatarUrl: string}|null
     */
    public function findUser(int $userId): ?array
    {
        /** @var null|WechatUser $user */
        $user = WechatUser::query()->find($userId);
        return $user === null ? null : $this->formatUser($user);
    }

    /**
     * 更新用户主动填写/选择的头像昵称。
     *
     * @return array{id: int, openid: string, nickname: string, avatarUrl: string}
     */
    public function updateProfile(int $userId, string $nickname, string $avatarUrl): array
    {
        /** @var null|WechatUser $user */
        $user = WechatUser::query()->find($userId);
        if ($user === null) {
            throw new RuntimeException('用户不存在');
        }

        $nickname = mb_substr(trim($nickname), 0, 120);
        $avatarUrl = mb_substr(trim($avatarUrl), 0, 600);
        if ($nickname !== '') {
            $user->nickname = $nickname;
        }
        if ($avatarUrl !== '') {
            $user->avatar_url = $avatarUrl;
        }
        $user->save();

        return $this->formatUser($user);
    }

    /** 调微信 jscode2session。 */
    private function codeToSession(string $code): array
    {
        $appid = (string) $this->config->get('wechat.mini_program.appid', '');
        $secret = (string) $this->config->get('wechat.mini_program.secret', '');
        if ($appid === '' || $secret === '') {
            throw new RuntimeException('未配置 WECHAT_MINI_APPID/WECHAT_MINI_SECRET');
        }

        try {
            $response = $this->client->get('https://api.weixin.qq.com/sns/jscode2session', [
                'query' => [
                    'appid' => $appid,
                    'secret' => $secret,
                    'js_code' => $code,
                    'grant_type' => 'authorization_code',
                ],
                'timeout' => 8,
            ]);
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            throw new RuntimeException('微信登录请求失败：' . $e->getMessage(), 0, $e);
        }

        if ((int) ($body['errcode'] ?? 0) !== 0) {
            throw new RuntimeException((string) ($body['errmsg'] ?? '微信登录失败'));
        }

        return is_array($body) ? $body : [];
    }

    /**
     * 创建或更新用户。
     *
     * @param array<string, mixed> $profile
     * @return array{id: int, openid: string, nickname: string, avatarUrl: string}
     */
    private function upsertUser(string $openid, string $unionid, array $profile): array
    {
        /** @var WechatUser $user */
        $user = WechatUser::query()->firstOrNew(['openid' => $openid]);
        if ($unionid !== '') {
            $user->unionid = $unionid;
        }

        $nickname = trim((string) ($profile['nickname'] ?? $profile['nickName'] ?? ''));
        $avatarUrl = trim((string) ($profile['avatarUrl'] ?? $profile['avatar_url'] ?? ''));
        if ($nickname !== '') {
            $user->nickname = $nickname;
        }
        if ($avatarUrl !== '') {
            $user->avatar_url = $avatarUrl;
        }
        $user->save();

        return $this->formatUser($user);
    }

    /**
     * @return array{id: int, openid: string, nickname: string, avatarUrl: string}
     */
    private function formatUser(WechatUser $user): array
    {
        return [
            'id' => (int) $user->id,
            'openid' => (string) $user->openid,
            'nickname' => (string) ($user->nickname ?? ''),
            'avatarUrl' => (string) ($user->avatar_url ?? ''),
        ];
    }
}

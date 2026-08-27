<?php

declare(strict_types=1);

namespace App\Service\Uno;

/**
 * UNO 纯规则引擎：无副作用静态方法，服务端权威判定（官方规则，无村规叠加）。
 *
 * 牌编码：颜色首字母 r/g/b/y + 面值（0-9 / S 跳过 / R 反转 / D +2）；百搭 wW / wF（+4）。
 * 约定：
 * - 2 人局 reverse 按官方视为 skip；
 * - +2/+4 不可叠加，效果立即结算；
 * - 摸牌后仅可立即出「摸的那张」（官方），否则 pass；
 * - wild4 永远允许出（官方允许 bluff），合法性由下家质疑判定；
 * - 以 +2/+4 收尾获胜时，下家仍须先摸牌再计分（官方）；
 * - 首张翻到百搭则洗回重翻（官方仅 wF 重翻，wW 需首位选色——为免开局多一个选色态，一并重翻）。
 *
 * 前端 src/utils/uno.ts 有一份平行实现，仅用于即时 UI 反馈与单测，冲突以本类为准。
 */
final class UnoRule
{
    public const int HAND_SIZE = 7;

    public const int MAX_PLAYERS = 10;

    public const int DOUBLE_DECK_PLAYERS = 5;

    public const int SCORE_ACTION = 20;

    public const int SCORE_WILD = 50;

    public const array COLORS = ['r', 'g', 'b', 'y'];

    public static function cardColor(string $card): string
    {
        return $card[0] ?? '';
    }

    public static function cardValue(string $card): string
    {
        return $card[1] ?? '';
    }

    public static function isWild(string $card): bool
    {
        return self::cardColor($card) === 'w';
    }

    public static function isValidCard(string $card): bool
    {
        $color = self::cardColor($card);
        $value = self::cardValue($card);
        if ($color === 'w') {
            return $value === 'W' || $value === 'F';
        }
        if (! in_array($color, self::COLORS, true)) {
            return false;
        }
        return ($value >= '0' && $value <= '9') || in_array($value, ['S', 'R', 'D'], true);
    }

    /**
     * 建牌堆并洗牌；>5 人双牌堆（108×2）。
     *
     * @return array<int, string>
     */
    public static function buildDeck(int $playerCount): array
    {
        $deck = [];
        foreach (self::COLORS as $c) {
            $deck[] = $c . '0';
            for ($n = 1; $n <= 9; ++$n) {
                $deck[] = $c . $n;
                $deck[] = $c . $n;
            }
            foreach (['S', 'R', 'D'] as $a) {
                $deck[] = $c . $a;
                $deck[] = $c . $a;
            }
        }
        for ($i = 0; $i < 4; ++$i) {
            $deck[] = 'wW';
            $deck[] = 'wF';
        }
        if ($playerCount > self::DOUBLE_DECK_PLAYERS) {
            $deck = array_merge($deck, $deck);
        }
        self::shuffle($deck);
        return $deck;
    }

    /**
     * @param array<int, string> $deck
     */
    public static function shuffle(array &$deck): void
    {
        for ($i = count($deck) - 1; $i > 0; --$i) {
            $j = random_int(0, $i);
            [$deck[$i], $deck[$j]] = [$deck[$j], $deck[$i]];
        }
    }

    /**
     * 能否出在某顶牌上（wild/wild4 恒可出——wild4 的合法性靠质疑判定，官方允许 bluff）。
     */
    public static function canPlay(string $card, string $topCard, string $currentColor): bool
    {
        if (self::isWild($card)) {
            return true;
        }
        if (self::cardColor($card) === $currentColor) {
            return true;
        }
        return self::cardValue($card) === self::cardValue($topCard);
    }

    /**
     * wild4 质疑：打出时手中是否握有「当前颜色」的牌（有 = 违规，官方只查颜色不查面值）。
     *
     * @param array<int, string> $hand
     */
    public static function isWild4Guilty(array $hand, string $colorBefore): bool
    {
        foreach ($hand as $card) {
            if (! self::isWild($card) && self::cardColor($card) === $colorBefore) {
                return true;
            }
        }
        return false;
    }

    /**
     * 从牌堆摸 n 张（牌堆空时把弃牌堆洗回，留顶牌）；返回摸到的牌，不加入任何手牌。
     *
     * @param array<string, mixed> $state
     * @return array<int, string>
     */
    public static function drawCards(array &$state, int $n): array
    {
        $cards = [];
        while ($n-- > 0) {
            if (empty($state['deck'])) {
                self::reshuffle($state);
                if (empty($state['deck'])) {
                    break;
                }
            }
            $cards[] = array_pop($state['deck']);
        }
        return $cards;
    }

    /**
     * @param array<string, mixed> $state
     */
    public static function reshuffle(array &$state): void
    {
        $discard = $state['discard'];
        if (count($discard) <= 1) {
            return;
        }
        $top = array_pop($discard);
        $state['deck'] = array_values($discard);
        self::shuffle($state['deck']);
        $state['discard'] = [$top];
    }

    /**
     * 当前存活玩家数（游戏中途离开的不计）。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     */
    public static function activePlayerCount(array $state, array $seats): int
    {
        return count($seats) - count($state['leftSeats'] ?? []);
    }

    /**
     * 从 currentSeat 沿 direction 推进 $steps 个存活座位。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     */
    public static function advanceSeat(array $state, array $seats, int $steps): int
    {
        $seat = (int) $state['currentSeat'];
        $left = $state['leftSeats'] ?? [];
        $n = count($seats);
        for ($i = 0; $i < $steps; ++$i) {
            do {
                $seat = ($seat + (int) $state['direction'] + $n) % $n;
            } while (in_array($seat, $left, true));
        }
        return $seat;
    }

    /**
     * 开局：发牌 + 翻首张并结算首张效果，返回初始 state。
     *
     * @param array<int, int> $seats
     * @return array<string, mixed>
     */
    public static function setupGame(array $seats): array
    {
        $deck = self::buildDeck(count($seats));
        $hands = [];
        foreach ($seats as $uid) {
            $hands[(string) $uid] = array_splice($deck, 0, self::HAND_SIZE);
        }
        // 翻首张：百搭洗回重翻
        $first = array_pop($deck);
        while (self::isWild($first)) {
            $deck[] = $first;
            self::shuffle($deck);
            $first = array_pop($deck);
        }
        $state = [
            'deck' => $deck,
            'hands' => $hands,
            'discard' => [$first],
            'currentColor' => self::cardColor($first),
            'direction' => 1,
            'currentSeat' => 0,
            'pendingWild4' => null,
            'unoVulnerable' => null,
            'unoDeclared' => [],
            'idleStrikes' => [],
            'leftSeats' => [],
            'drawnCard' => null,
            'scores' => array_fill_keys(array_map('strval', $seats), 0),
            'roundScores' => null,
            'lastEvent' => ['type' => 'start', 'seat' => 0],
        ];
        // 首张功能牌效果（官方）：S 跳首位 / R 反转方向 / D 首位摸 2 并跳过
        $value = self::cardValue($first);
        if ($value === 'S') {
            $state['currentSeat'] = self::advanceSeat($state, $seats, 1);
        } elseif ($value === 'R') {
            $state['direction'] = -1;
        } elseif ($value === 'D') {
            $uid = (string) $seats[0];
            foreach (self::drawCards($state, 2) as $c) {
                $state['hands'][$uid][] = $c;
            }
            $state['currentSeat'] = self::advanceSeat($state, $seats, 1);
        }
        return $state;
    }

    /**
     * 出牌并结算效果。调用方（Service）已完成轮次/手牌/canPlay 校验。
     * 返回 needsUnoCheck=true 时由 Service 按 declaredUno 决定置举报窗口或记已喊。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array{state: array<string, mixed>, event: array<string, mixed>, win: bool, needsUnoCheck: bool}
     */
    public static function applyPlay(array $state, array $seats, int $seat, string $card, ?string $chosenColor): array
    {
        $uid = (string) $seats[$seat];
        $hand = $state['hands'][$uid];
        $idx = array_search($card, $hand, true);
        array_splice($hand, (int) $idx, 1);
        $state['hands'][$uid] = array_values($hand);
        $state['drawnCard'] = null;
        $topBefore = end($state['discard']) ?: $card;
        $colorBefore = (string) $state['currentColor'];
        $state['discard'][] = $card;
        $value = self::cardValue($card);
        $state['currentColor'] = self::isWild($card)
            ? (in_array($chosenColor, self::COLORS, true) ? $chosenColor : 'r')
            : self::cardColor($card);
        $state['unoVulnerable'] = null;
        $declaredIdx = array_search($seat, $state['unoDeclared'], true);
        if ($declaredIdx !== false) {
            unset($state['unoDeclared'][$declaredIdx]);
            $state['unoDeclared'] = array_values($state['unoDeclared']);
        }

        $event = ['type' => 'play', 'seat' => $seat, 'card' => $card, 'color' => $state['currentColor']];
        $win = count($hand) === 0;

        if ($win) {
            // 官方：以 +2/+4 收尾时，下家仍须先摸牌再计分
            if ($value === 'D' || $value === 'F') {
                $target = self::advanceSeat($state, $seats, 1);
                $tuid = (string) $seats[$target];
                foreach (self::drawCards($state, $value === 'D' ? 2 : 4) as $c) {
                    $state['hands'][$tuid][] = $c;
                }
            }
            $state['pendingWild4'] = null;
            $event['type'] = 'win';
            return ['state' => $state, 'event' => $event, 'win' => true, 'needsUnoCheck' => false];
        }

        switch ($value) {
            case 'S':
                $state['currentSeat'] = self::advanceSeat($state, $seats, 2);
                $event['type'] = 'skip';
                $event['skippedSeat'] = self::advanceSeat($state, $seats, 1);
                break;
            case 'R':
                if (self::activePlayerCount($state, $seats) === 2) {
                    // 2 人局 reverse 视为 skip
                    $state['currentSeat'] = self::advanceSeat($state, $seats, 2);
                } else {
                    $state['direction'] = -((int) $state['direction']);
                    $state['currentSeat'] = self::advanceSeat($state, $seats, 1);
                }
                $event['type'] = 'reverse';
                $event['direction'] = (int) $state['direction'];
                break;
            case 'D':
                $target = self::advanceSeat($state, $seats, 1);
                $tuid = (string) $seats[$target];
                foreach (self::drawCards($state, 2) as $c) {
                    $state['hands'][$tuid][] = $c;
                }
                $state['currentSeat'] = self::advanceSeat($state, $seats, 2);
                $event['type'] = 'draw2';
                $event['toSeat'] = $target;
                break;
            case 'F':
                $target = self::advanceSeat($state, $seats, 1);
                $state['pendingWild4'] = [
                    'fromSeat' => $seat,
                    'toSeat' => $target,
                    'prevColor' => $colorBefore,
                    'prevTop' => $topBefore,
                    'at' => time(),
                ];
                $state['currentSeat'] = $target;
                $event['type'] = 'wild4';
                $event['toSeat'] = $target;
                break;
            default:
                $state['currentSeat'] = self::advanceSeat($state, $seats, 1);
                if ($value === 'W') {
                    $event['type'] = 'wild';
                }
        }

        return ['state' => $state, 'event' => $event, 'win' => false, 'needsUnoCheck' => count($hand) === 1];
    }

    /**
     * 主动摸牌（官方：即使手上有可出的牌也可选择摸牌；摸后可立即出「摸的那张」）。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array{state: array<string, mixed>, event: array<string, mixed>}
     */
    public static function applyDraw(array $state, array $seats, int $seat): array
    {
        $uid = (string) $seats[$seat];
        $cards = self::drawCards($state, 1);
        if ($cards !== []) {
            $state['hands'][$uid][] = $cards[0];
            $state['drawnCard'] = ['seat' => $seat, 'card' => $cards[0]];
        }
        $state['unoVulnerable'] = null; // 下家已行动，举报窗口结束
        return ['state' => $state, 'event' => ['type' => 'draw', 'seat' => $seat, 'count' => count($cards)]];
    }

    /**
     * 摸牌后放弃出牌，回合推进。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array{state: array<string, mixed>, event: array<string, mixed>}
     */
    public static function applyPass(array $state, array $seats): array
    {
        $seat = (int) $state['currentSeat'];
        $state['drawnCard'] = null;
        $state['unoVulnerable'] = null; // 下家已行动，举报窗口结束
        $state['currentSeat'] = self::advanceSeat($state, $seats, 1);
        return ['state' => $state, 'event' => ['type' => 'pass', 'seat' => $seat]];
    }

    /**
     * 回合超时/挂机自动：摸 1 张直接跳过（不给立即出的机会）。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array{state: array<string, mixed>, event: array<string, mixed>}
     */
    public static function applyTimeoutDraw(array $state, array $seats): array
    {
        $seat = (int) $state['currentSeat'];
        $uid = (string) $seats[$seat];
        $cards = self::drawCards($state, 1);
        if ($cards !== []) {
            $state['hands'][$uid][] = $cards[0];
        }
        $state['drawnCard'] = null;
        $state['unoVulnerable'] = null; // 下家已行动，举报窗口结束
        $state['currentSeat'] = self::advanceSeat($state, $seats, 1);
        return ['state' => $state, 'event' => ['type' => 'timeout', 'seat' => $seat, 'count' => count($cards)]];
    }

    /**
     * wild4 质疑/超时结算。$challenged=true 表示下家在窗口内发起质疑。
     * 官方：成立 → 出 +4 者改摸 4 张，下家正常出牌；不成立 → 质疑者摸 6 张并跳过；超时未质疑 → 下家摸 4 张并跳过。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array{state: array<string, mixed>, event: array<string, mixed>}
     */
    public static function resolveWild4(array $state, array $seats, bool $challenged): array
    {
        $pending = $state['pendingWild4'];
        $fromSeat = (int) $pending['fromSeat'];
        $toSeat = (int) $pending['toSeat'];
        $fromUid = (string) $seats[$fromSeat];
        $toUid = (string) $seats[$toSeat];
        $state['pendingWild4'] = null;

        if (! $challenged) {
            foreach (self::drawCards($state, 4) as $c) {
                $state['hands'][$toUid][] = $c;
            }
            $state['currentSeat'] = self::advanceSeat($state, $seats, 1);
            return ['state' => $state, 'event' => ['type' => 'wild4_draw', 'seat' => $fromSeat, 'toSeat' => $toSeat]];
        }

        $guilty = self::isWild4Guilty($state['hands'][$fromUid], (string) $pending['prevColor']);
        if ($guilty) {
            foreach (self::drawCards($state, 4) as $c) {
                $state['hands'][$fromUid][] = $c;
            }
            $state['currentSeat'] = $toSeat; // 下家不摸不跳，正常出牌
            $event = ['type' => 'challenge_guilty', 'seat' => $toSeat, 'fromSeat' => $fromSeat];
        } else {
            foreach (self::drawCards($state, 6) as $c) {
                $state['hands'][$toUid][] = $c;
            }
            $state['currentSeat'] = self::advanceSeat($state, $seats, 1);
            $event = ['type' => 'challenge_innocent', 'seat' => $toSeat, 'fromSeat' => $fromSeat];
        }
        return ['state' => $state, 'event' => $event];
    }

    /**
     * 举报未喊 UNO：罚摸 2 张。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array{state: array<string, mixed>, event: array<string, mixed>}
     */
    public static function applyUnoPenalty(array $state, array $seats, int $seat, int $bySeat): array
    {
        $uid = (string) $seats[$seat];
        foreach (self::drawCards($state, 2) as $c) {
            $state['hands'][$uid][] = $c;
        }
        $state['unoVulnerable'] = null;
        return ['state' => $state, 'event' => ['type' => 'catch', 'seat' => $seat, 'bySeat' => $bySeat]];
    }

    /**
     * 一手牌的分值：数字按面值，功能牌 20，百搭 50。
     *
     * @param array<int, string> $hand
     */
    public static function scoreHand(array $hand): int
    {
        $score = 0;
        foreach ($hand as $card) {
            $value = self::cardValue($card);
            if (self::isWild($card)) {
                $score += self::SCORE_WILD;
            } elseif ($value >= '0' && $value <= '9') {
                $score += (int) $value;
            } else {
                $score += self::SCORE_ACTION;
            }
        }
        return $score;
    }

    /**
     * 结算一局：胜者收其他所有人手牌分值之和。返回 roundScores {uid: 本局得分}（负家记 0，分值在 handValues）。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array{roundScores: array<string, int>, handValues: array<string, int>}
     */
    public static function settleRound(array $state, array $seats, int $winnerSeat): array
    {
        $handValues = [];
        $total = 0;
        foreach ($seats as $i => $uid) {
            $value = self::scoreHand($state['hands'][(string) $uid] ?? []);
            $handValues[(string) $uid] = $value;
            if ($i !== $winnerSeat) {
                $total += $value;
            }
        }
        $roundScores = array_fill_keys(array_map('strval', $seats), 0);
        $roundScores[(string) $seats[$winnerSeat]] = $total;
        return ['roundScores' => $roundScores, 'handValues' => $handValues];
    }
}

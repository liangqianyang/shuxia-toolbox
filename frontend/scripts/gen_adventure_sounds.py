#!/usr/bin/env python3
"""枫趣冒险音效程序合成器：生成 16 个短提示音 wav 到 cdn-assets/pages-adventure/static/sounds-adventure/。

用法：python3 frontend/scripts/gen_adventure_sounds.py [--force]
纯标准库（wave/math/struct），无第三方依赖。音色设计（与游戏语义对应）：
- roll/move：短促木质感点击；ladder/cable：上行滑音；slide：下行滑音
- leaf/item/bet/chat：轻快双音；duel：对峙低音；duelwin：上行三连音；duellose：下行
- trap：不和谐警示；weather：风声扫频；summit/win：凯旋琶音
"""

import math
import os
import struct
import sys
import wave

SR = 22050
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'cdn-assets', 'pages-adventure', 'static', 'sounds-adventure')


def env(i: int, n: int, attack: float = 0.05, release: float = 0.4) -> float:
    """简单 Attack/Release 包络。"""
    a = max(1, int(n * attack))
    r = max(1, int(n * release))
    if i < a:
        return i / a
    if i >= n - r:
        return max(0.0, (n - i) / r)
    return 1.0


def tone(freq_start: float, freq_end: float, seconds: float, vol: float = 0.5,
         shape: str = 'sine', harmonics: tuple[int, ...] = (1,)) -> list[float]:
    n = int(SR * seconds)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / n
        f = freq_start + (freq_end - freq_start) * t
        phase += 2 * math.pi * f / SR
        s = 0.0
        for h in harmonics:
            s += math.sin(phase * h) / h
        if shape == 'square':
            s = 0.6 * (1 if s >= 0 else -1)
        elif shape == 'tri':
            s = 2 / math.pi * math.asin(math.sin(phase))
        out.append(s * env(i, n) * vol)
    return out


def silence(seconds: float) -> list[float]:
    return [0.0] * int(SR * seconds)


def write(name: str, samples: list[float]) -> None:
    path = os.path.join(OUT_DIR, f'{name}.wav')
    if os.path.exists(path) and '--force' not in sys.argv:
        print(f'skip {name}.wav（已存在，--force 覆盖）')
        return
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = b''.join(struct.pack('<h', max(-32767, min(32767, int(s * 32767)))) for s in samples)
        w.writeframes(frames)
    print(f'wrote {name}.wav ({len(samples) / SR:.2f}s)')


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    # 掷骰：两下木质敲击
    write('roll', tone(880, 660, 0.06, 0.5, 'tri') + silence(0.05) + tone(660, 500, 0.08, 0.45, 'tri'))
    # 走子：轻快哒
    write('move', tone(520, 480, 0.09, 0.4, 'tri', harmonics=(1, 3)))
    # 云梯：轻快上行滑音
    write('ladder', tone(440, 880, 0.22, 0.45))
    # 缆车：更长更飘的上行
    write('cable', tone(392, 784, 0.34, 0.45, harmonics=(1, 2)))
    # 滑坡：淘气下行
    write('slide', tone(700, 240, 0.3, 0.5, 'tri'))
    # 枫叶：双音叮
    write('leaf', tone(1318, 1318, 0.08, 0.35) + silence(0.03) + tone(1568, 1568, 0.12, 0.3))
    # 道具：魔法感小滑音
    write('item', tone(660, 990, 0.16, 0.4, harmonics=(1, 2, 3)))
    # 决斗开始：低音对峙
    write('duel', tone(180, 150, 0.24, 0.55, 'square', harmonics=(1,)))
    # 决斗胜：三连上行
    write('duelwin', tone(523, 523, 0.1, 0.45) + tone(659, 659, 0.1, 0.45) + tone(784, 880, 0.2, 0.5))
    # 决斗败：失意下行
    write('duellose', tone(494, 494, 0.1, 0.4) + tone(392, 392, 0.1, 0.4) + tone(311, 262, 0.24, 0.42))
    # 押注：金币感双击
    write('bet', tone(988, 988, 0.06, 0.4) + silence(0.04) + tone(1245, 1245, 0.1, 0.38))
    # 天气：风声扫频（宽降再升）
    write('weather', tone(500, 220, 0.25, 0.3) + tone(220, 660, 0.3, 0.32))
    # 登顶：号角三连
    write('summit', tone(523, 523, 0.14, 0.5, harmonics=(1, 2)) + tone(659, 659, 0.14, 0.5, harmonics=(1, 2)) + tone(784, 784, 0.3, 0.55, harmonics=(1, 2)))
    # 聊天：气泡音
    write('chat', tone(740, 980, 0.09, 0.3))
    # 踩雷：不和谐警示
    write('trap', tone(311, 233, 0.18, 0.5, 'square') + tone(233, 175, 0.22, 0.45, 'square'))
    # 胜利：凯旋琶音
    write('win', tone(523, 523, 0.12, 0.5) + tone(659, 659, 0.12, 0.5) + tone(784, 784, 0.12, 0.5) + tone(1047, 1047, 0.36, 0.55))
    print('done')


if __name__ == '__main__':
    main()

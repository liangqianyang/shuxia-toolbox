#!/usr/bin/env python3
"""推箱子音效程序合成器：生成 6 个短提示音 wav 到 cdn-assets/static/sounds-sokoban/。

用法：python3 frontend/scripts/gen_sokoban_sounds.py [--force]
纯标准库（wave/math/struct/random），结构照 gen_tetris_sounds.py。
音色设计（回合制,音效低频出现,可以比 tetris 稍有 melodic）：
- walk：干涩极短咔哒（滑动连走,必须短而轻）
- push：低闷短推（木头蹭地）；place：双音上行+暖尾（箱子落上落叶点）
- undo：短下滑（时光倒回）；win：四音琶音（过关奖赏）；dead：低哑双降（卡住的惋惜感）
"""

import math
import os
import struct
import sys
import wave

SR = 22050
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'cdn-assets', 'static', 'sounds-sokoban')


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
    # 走：干涩极短咔哒（滑动每格触发）
    write('walk', tone(840, 780, 0.03, 0.22, 'tri', harmonics=(1, 5)))
    # 推箱：低闷短推
    write('push', tone(260, 190, 0.09, 0.5, harmonics=(1, 2)))
    # 归位：双音上行 + 暖尾（落叶点收箱）
    write('place', tone(587, 587, 0.06, 0.42) + silence(0.015) + tone(784, 880, 0.18, 0.46, harmonics=(1, 2)))
    # 撤销：短下滑
    write('undo', tone(660, 480, 0.09, 0.32, 'tri'))
    # 过关：四音琶音（C 大调,温暖收束）
    write('win', tone(523, 523, 0.08, 0.45) + tone(659, 659, 0.08, 0.45)
          + tone(784, 784, 0.08, 0.45) + tone(1047, 1047, 0.28, 0.5, harmonics=(1, 2)))
    # 卡住：低哑双降（惋惜但不刺耳）
    write('dead', tone(330, 294, 0.12, 0.36, harmonics=(1, 2)) + tone(262, 208, 0.22, 0.4, harmonics=(1, 2)))
    print('done')


if __name__ == '__main__':
    main()

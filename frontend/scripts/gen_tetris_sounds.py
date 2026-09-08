#!/usr/bin/env python3
"""俄罗斯方块音效程序合成器：生成 9 个短提示音 wav 到 cdn-assets/static/sounds-tetris/。

用法：python3 frontend/scripts/gen_tetris_sounds.py [--force]
纯标准库（wave/math/struct/random），无第三方依赖（结构照 gen_adventure_sounds.py）。
音色设计（与游戏语义对应）：
- move：干涩极短咔哒（高频连发不吵）；rotate：短上滑音
- lock：低闷落地；harddrop：噪声脉冲+闷响（砸下去的分量感）
- clear：双音上行；tetris：四音琶音（最高奖赏）；levelup：三音上行
- hold：柔双哔；gameover：下行三音
"""

import math
import os
import random
import struct
import sys
import wave

SR = 22050
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'cdn-assets', 'static', 'sounds-tetris')


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


def noise(seconds: float, vol: float = 0.4) -> list[float]:
    """白噪声脉冲（harddrop 的砸击感）。"""
    rng = random.Random(20260908)
    n = int(SR * seconds)
    return [(rng.random() * 2 - 1) * env(i, n, 0.02, 0.9) * vol for i in range(n)]


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
    # 移动：干涩极短咔哒（水平连移每格触发,必须短而轻）
    write('move', tone(920, 860, 0.035, 0.28, 'tri', harmonics=(1, 5)))
    # 旋转：短上滑
    write('rotate', tone(560, 760, 0.07, 0.4, 'tri'))
    # 锁定：低闷落地
    write('lock', tone(220, 140, 0.12, 0.5, harmonics=(1, 2)))
    # 硬降：噪声砸击 + 闷响
    write('harddrop', noise(0.07, 0.45) + tone(180, 110, 0.13, 0.55, harmonics=(1, 2)))
    # 消行：双音上行
    write('clear', tone(659, 659, 0.07, 0.42) + silence(0.02) + tone(880, 988, 0.14, 0.45))
    # Tetris：四音琶音
    write('tetris', tone(523, 523, 0.07, 0.45) + tone(659, 659, 0.07, 0.45)
          + tone(784, 784, 0.07, 0.45) + tone(1047, 1175, 0.26, 0.5))
    # HOLD：柔双哔
    write('hold', tone(740, 740, 0.05, 0.3) + silence(0.04) + tone(880, 880, 0.08, 0.28))
    # 升级：三音上行
    write('levelup', tone(587, 587, 0.08, 0.45) + tone(740, 740, 0.08, 0.45) + tone(880, 1047, 0.2, 0.5))
    # 结束：下行三音
    write('gameover', tone(494, 494, 0.12, 0.4) + tone(392, 392, 0.12, 0.4) + tone(311, 233, 0.32, 0.42))
    print('done')


if __name__ == '__main__':
    main()

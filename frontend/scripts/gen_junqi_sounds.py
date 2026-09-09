#!/usr/bin/env python3
"""军棋音效合成：程序生成短提示音 wav，输出到 cdn-assets/static/sounds-junqi/。
上传跑 python3 frontend/scripts/upload_qiniu.py。生成器风格照 gen_sokoban_sounds.py。
用法：python3 frontend/scripts/gen_junqi_sounds.py
"""

import math
import struct
import wave
from pathlib import Path

SR = 22050
OUT = Path(__file__).resolve().parent.parent / "cdn-assets" / "static" / "sounds-junqi"


def envelope(i: int, n: int, attack: int = 40) -> float:
    if i < attack:
        return i / attack
    return max(0.0, 1.0 - (i - attack) / (n - attack))


def tone(freqs, ms, vol=0.5, slide=0.0):
    n = int(SR * ms / 1000)
    out = []
    for i in range(n):
        t = i / SR
        env = envelope(i, n)
        f = freqs
        if slide:
            f = [fr * (1 + slide * t) for fr in freqs]
        sample = sum(math.sin(2 * math.pi * fr * t) for fr in f) / len(freqs)
        out.append(sample * env * vol)
    return out


def silence(ms):
    return [0.0] * int(SR * ms / 1000)


def write(name, samples):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.wav"
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32767)) for s in samples)
        w.writeframes(frames)
    print(f"gen {path.relative_to(OUT.parent.parent.parent)} ({len(samples) / SR:.2f}s)")


# select：拾子轻点
write("select", tone([660], 70, vol=0.35))
# move：走子软哒（短低音）
write("move", tone([330], 90, vol=0.4, slide=-0.15))
# capture：战斗闷响（低频双击）
write("capture", tone([150, 90], 160, vol=0.6, slide=-0.3) + silence(30) + tone([120], 200, vol=0.5, slide=-0.4))
# reveal：亮旗上行双音
write("reveal", tone([523], 120, vol=0.4) + tone([784], 180, vol=0.45))
# rps：猜拳出拳（中频短促）
write("rps", tone([440], 60, vol=0.4) + tone([550], 90, vol=0.4))
# win：胜利琶音
write("win", tone([523], 110, vol=0.45) + tone([659], 110, vol=0.45) + tone([784], 110, vol=0.45) + tone([1047], 260, vol=0.5))
# lose：下行叹号
write("lose", tone([392], 160, vol=0.45) + tone([330], 160, vol=0.4) + tone([262], 300, vol=0.4, slide=-0.1))

#!/usr/bin/env python3
"""象棋音效合成：程序生成短提示音 wav，输出到 cdn-assets/static/sounds-xiangqi/。
上传跑 python3 frontend/scripts/upload_qiniu.py。
用法：python3 frontend/scripts/gen_xiangqi_sounds.py
"""

import math
import struct
import wave
from pathlib import Path

SR = 22050
OUT = Path(__file__).resolve().parent.parent / "cdn-assets" / "static" / "sounds-xiangqi"


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
        f = [fr * (1 + slide * t) for fr in freqs] if slide else freqs
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


# select：拾子木鱼点
write("select", tone([520], 70, vol=0.35))
# move：落子木声（低频短促带滑落）
write("move", tone([220, 180], 110, vol=0.5, slide=-0.2))
# capture：吃子（闷响 + 清脆跟随）
write("capture", tone([140], 130, vol=0.6, slide=-0.3) + silence(20) + tone([660], 120, vol=0.35))
# check：将军（急促双高音）
write("check", tone([880], 90, vol=0.45) + tone([880], 90, vol=0.45))
# rps：猜拳出拳
write("rps", tone([440], 60, vol=0.4) + tone([550], 90, vol=0.4))
# win：胜利琶音
write("win", tone([523], 110, vol=0.45) + tone([659], 110, vol=0.45) + tone([784], 110, vol=0.45) + tone([1047], 260, vol=0.5))
# lose：下行
write("lose", tone([392], 160, vol=0.45) + tone([330], 160, vol=0.4) + tone([262], 300, vol=0.4, slide=-0.1))

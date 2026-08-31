#!/usr/bin/env python3
"""飞行棋素材修复：从素材包参考图重切错位的格子/骰子、裁残留蓝条、过滤无用图。

用法：python3 frontend/scripts/fix_ludo_assets.py
输入：~/Downloads/微信小程序飞行棋_开发可直接用素材包（AI 生成素材包第一版）
输出：frontend/src/pages-ludo/static/ludo/（planes/dice/tiles/effects/status/buttons/decor/result/players）

背景：自动切图版 04_tiles 四色路径格整体错位、dice_4 实际 3 点 / dice_5 实际 6 点、
3 张图顶边有截图蓝条残留。本脚本从 reference 原图按色相/形状重新定位切割，
并用断言（色相区间、骰子点数连通域、四角透明）自校验，失败即非零退出。

棋盘整图（board_main/board_reference，逐字节相同的 914KB 装饰插画）不入库：
棋盘由 utils/ludoRender.ts 程序化渲染。
"""
from __future__ import annotations

import colorsys
import os
import sys

from PIL import Image

SRC = os.path.expanduser("~/Downloads/微信小程序飞行棋_开发可直接用素材包")
OUT = os.path.join(os.path.dirname(__file__), "..", "cdn-assets", "pages-ludo", "static", "ludo")

# 图形带（已实测的参考图像素行区间）
TILE_BAND = (26, 83)   # tiles_reference.png 中 9 个格子的图形带

# tiles_reference 从左到右的顺序（与图内中文标注一致），及色相断言区间
TILE_ORDER = [
    ("normal", (195, 225)),          # 蓝底白圆普通格
    ("takeoff", (120, 145)),         # 绿底十字起飞格
    ("safe", (195, 225)),            # 蓝底四色星安全格
    ("finish", (348, 368)),          # 红底白十字
    ("direction_arrow", (30, 50)),   # 黄底白箭头
    ("red_path", (348, 368)),
    ("yellow_path", (40, 55)),
    ("blue_path", (200, 225)),
    ("green_path", (120, 145)),
]

failures: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)
    print(f"  ✗ {msg}")


def is_bg(p) -> bool:
    """参考图浅色底/软阴影：三通道都偏亮且低饱和。"""
    r, g, b, a = p
    if a < 30:
        return True
    return min(r, g, b) >= 210 and (max(r, g, b) - min(r, g, b)) <= 30


def content(p) -> bool:
    if p[3] <= 30:
        return False
    return not is_bg(p)


def col_clusters(im, band, min_gap=8, min_width=15):
    """在指定行带内按内容列密度切簇。"""
    w, h = im.size
    px = im.load()
    y0, y1 = band
    cols = []
    for x in range(w):
        c = sum(1 for y in range(y0, y1 + 1) if content(px[x, y]))
        cols.append(c)
    clusters, start = [], None
    for x, c in enumerate(cols):
        if c > 3 and start is None:
            start = x
        elif c <= 3 and start is not None:
            if x - start >= min_width:
                clusters.append((start, x - 1))
            start = None
    if start is not None and w - start >= min_width:
        clusters.append((start, w - 1))
    return clusters


def key_background(im):
    """从边框洪水填充去底（保住精灵内部的白色），再只留最大连通不透明块。"""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    stack = []
    for x in range(w):
        for y in (0, h - 1):
            if not seen[y][x] and is_bg(px[x, y]):
                seen[y][x] = True
                stack.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y][x] and is_bg(px[x, y]):
                seen[y][x] = True
                stack.append((x, y))
    while stack:
        x, y = stack.pop()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and is_bg(px[nx, ny]):
                seen[ny][nx] = True
                stack.append((nx, ny))
    # 只留最大不透明连通块（去掉游离阴影残片）
    best = None
    visited = [[False] * w for _ in range(h)]
    for y0 in range(h):
        for x0 in range(w):
            if visited[y0][x0] or px[x0, y0][3] <= 30:
                continue
            comp, stack2 = [], [(x0, y0)]
            visited[y0][x0] = True
            while stack2:
                x, y = stack2.pop()
                comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] and px[nx, ny][3] > 30:
                        visited[ny][nx] = True
                        stack2.append((nx, ny))
            if best is None or len(comp) > len(best):
                best = comp
    keep = set(best) if best else set()
    for y in range(h):
        for x in range(w):
            if (x, y) not in keep and px[x, y][3] > 30:
                px[x, y] = (0, 0, 0, 0)
    return im


def trim(im, pad=2):
    bbox = im.getchannel("A").getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(im.width - 1, x1 + pad), min(im.height - 1, y1 + pad)
    return im.crop((x0, y0, x1 + 1, y1 + 1))


def dominant_hue(im):
    rs = gs = bs = n = 0
    px = im.load()
    for x in range(im.width):
        for y in range(im.height):
            r, g, b, a = px[x, y]
            if a > 200:
                rs += r
                gs += g
                bs += b
                n += 1
    if not n:
        return None, n
    h, _s, _v = colorsys.rgb_to_hsv(rs / n / 255, gs / n / 255, bs / n / 255)
    return h * 360, n


def check_sprite(path, hue_range=None, expect_pips=None):
    im = Image.open(path).convert("RGBA")
    px = im.load()
    corners = [px[0, 0][3], px[im.width - 1, 0][3], px[0, im.height - 1][3], px[im.width - 1, im.height - 1][3]]
    if any(c > 10 for c in corners):
        fail(f"{os.path.basename(path)} 四角不透明: {corners}")
    total = im.width * im.height
    transp = sum(1 for x in range(im.width) for y in range(im.height) if px[x, y][3] < 10)
    if not (0.15 <= transp / total <= 0.85):
        fail(f"{os.path.basename(path)} 透明占比异常: {transp / total:.0%}")
    if hue_range:
        hue, _ = dominant_hue(im)
        if hue is None or not (hue_range[0] <= hue <= hue_range[1]):
            fail(f"{os.path.basename(path)} 色相 {hue and round(hue)} 不在 {hue_range}")
    if expect_pips:
        got = count_pips(im)
        if got != expect_pips:
            fail(f"{os.path.basename(path)} 点数 {got} ≠ {expect_pips}")


def count_pips(im):
    return len(find_pips(im))


def find_pips(im):
    """找骰子点：暗色连通域（≥20px），返回 bbox 列表。"""
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    blobs = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 200 and (r + g + b) / 3 < 140 and not seen[y][x]:
                xs, ys = [], []
                stack = [(x, y)]
                seen[y][x] = True
                while stack:
                    sx, sy = stack.pop()
                    xs.append(sx)
                    ys.append(sy)
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = sx + dx, sy + dy
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx]:
                            r2, g2, b2, a2 = px[nx, ny]
                            if a2 > 200 and (r2 + g2 + b2) / 3 < 150:
                                seen[ny][nx] = True
                                stack.append((nx, ny))
                if len(xs) > 20:
                    blobs.append((min(xs), min(ys), max(xs), max(ys)))
    return blobs


def inpaint_pips(im, pips):
    """把点用同行的邻侧身体色填掉（骰面渐变以纵向为主，行内取色保渐变）。"""
    im = im.copy()
    px = im.load()
    for x0, y0, x1, y1 in pips:
        pad = 2
        x0, y0, x1, y1 = max(0, x0 - pad), max(0, y0 - pad), min(im.width - 1, x1 + pad), min(im.height - 1, y1 + pad)
        # 左列点取更左侧身体色，右列点取更右侧
        src_x = x0 - 4 if x0 - 4 >= 0 else x1 + 4
        for y in range(y0, y1 + 1):
            r, g, b, a = px[src_x, y]
            for x in range(x0, x1 + 1):
                px[x, y] = (r, g, b, a)
    return im


def crop_blue_strip(im):
    """裁掉顶边截图蓝条（rgb≈(1,122,224) 的不透明行）。"""
    px = im.load()
    drop = 0
    for y in range(min(10, im.height)):
        blue = sum(
            1
            for x in range(im.width)
            if px[x, y][3] > 200 and px[x, y][2] > 150 and px[x, y][2] > px[x, y][0] + 60
        )
        if blue > im.width * 0.12:
            drop = y + 1
        elif drop:
            break
    if drop:
        im = im.crop((0, drop, im.width, im.height))
    return trim(im)


def save(im, rel):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)
    return path


def main() -> int:
    os.makedirs(OUT, exist_ok=True)

    # ── 1. 重切 9 个棋盘格子 ──
    print("重切 04_tiles …")
    ref = Image.open(os.path.join(SRC, "04_tiles/tiles_reference.png")).convert("RGBA")
    clusters = col_clusters(ref, TILE_BAND)
    # 过滤 <15px 的噪声簇
    clusters = [c for c in clusters if c[1] - c[0] >= 15]
    if len(clusters) != 9:
        fail(f"tiles 簇数 {len(clusters)} ≠ 9: {clusters}")
    else:
        for (x0, x1), (name, hue_range) in zip(clusters, TILE_ORDER):
            y0, y1 = TILE_BAND
            box = ref.crop((max(0, x0 - 4), y0 - 4, min(ref.width, x1 + 5), y1 + 5))
            box = trim(key_background(box))
            check_sprite(save(box, f"tiles/{name}.png"), hue_range)
            print(f"  tiles/{name}.png  {box.width}x{box.height}")

    # ── 2. 骰子：1/2/3/6 原样拷贝（已验证），4/5 用 dice_6 合成 ──
    # 参考图里骰子白主体与浅底同色无法洪水切割；错误切图 dice_4 实际 3 点、dice_5 实际 6 点。
    # dice_6 六点齐全且正确：抹掉点得干净底，再按标准点阵（4 点 2×2 / 5 点梅花）重盖。
    print("合成 03_dice …")
    d6 = Image.open(os.path.join(SRC, "03_dice/dice_6.png")).convert("RGBA")
    pips = find_pips(d6)  # [(x0,y0,x1,y1)] 6 个，左列 x0=22、右列 x0=45，行 y 21/35/49
    if len(pips) != 6:
        fail(f"dice_6 点数 {len(pips)} ≠ 6，无法合成")
    else:
        body = inpaint_pips(d6, pips)
        tmpl = d6.crop(pips[0])  # 10×10 点模板（含软边）
        left_c, right_c = 26.5, 49.5
        top_c, mid_c, bot_c = 26.0, 40.0, 54.0

        def stamp(base, centers):
            for cx, cy in centers:
                px = int(round(cx - tmpl.width / 2))
                py = int(round(cy - tmpl.height / 2))
                base.alpha_composite(tmpl, (px, py))
            return base

        corners = [(left_c, top_c), (right_c, top_c), (left_c, bot_c), (right_c, bot_c)]
        d4 = stamp(body.copy(), corners)
        d5 = stamp(body.copy(), corners + [((left_c + right_c) / 2, (top_c + bot_c) / 2)])
        check_sprite(save(d4, "dice/dice_4.png"), expect_pips=4)
        check_sprite(save(d5, "dice/dice_5.png"), expect_pips=5)
        print(f"  dice/dice_4.png  {d4.width}x{d4.height}")
        print(f"  dice/dice_5.png  {d5.width}x{d5.height}")
    for i in (1, 2, 3, 6):
        im = Image.open(os.path.join(SRC, f"03_dice/dice_{i}.png")).convert("RGBA")
        check_sprite(save(im, f"dice/dice_{i}.png"), expect_pips=i)

    # ── 3. 蓝条裁除 ──
    print("裁蓝条 …")
    for rel in ["players/frame_red.png", "turn/current_player_plane.png", "effects/takeoff_effect.png"]:
        src_map = {
            "players/frame_red.png": "05_players/frame_red.png",
            "turn/current_player_plane.png": "06_turn/current_player_plane.png",
            "effects/takeoff_effect.png": "09_effects/takeoff_effect.png",
        }
        im = crop_blue_strip(Image.open(os.path.join(SRC, src_map[rel])).convert("RGBA"))
        save(im, rel)
        print(f"  {rel}  {im.width}x{im.height}")

    # ── 4. 原样拷贝（已验证可用） ──
    copies = {
        "planes/": ["02_planes/red_plane.png", "02_planes/green_plane.png", "02_planes/blue_plane.png", "02_planes/yellow_plane.png"],
        "dice/": [f"03_dice/animation/roll_0{i}.png" for i in range(1, 5)],
        "effects/": ["09_effects/capture_burst.png", "09_effects/coin_plus_one.png", "09_effects/finish_star.png", "09_effects/flight_trail.png"],
        "status/": ["08_status/your_turn.png", "08_status/waiting.png", "08_status/takeoff.png", "08_status/capture.png", "08_status/defeat.png", "08_status/ai_thinking.png"],
        "buttons/": ["07_buttons/roll_dice.png", "07_buttons/auto.png", "07_buttons/exit.png", "07_buttons/home.png", "07_buttons/settings.png", "07_buttons/start_game.png"],
        "decor/": ["11_decor/airport.png", "11_decor/cloud.png", "11_decor/flags.png", "11_decor/luggage.png", "11_decor/stars.png", "11_decor/trees.png"],
        "result/": ["10_result/victory.png", "10_result/champion.png", "10_result/ranking.png"],
        "players/": ["05_players/frame_blue.png", "05_players/frame_green.png", "05_players/frame_yellow.png"],
    }
    print("拷贝其余素材 …")
    for subdir, files in copies.items():
        for f in files:
            im = Image.open(os.path.join(SRC, f)).convert("RGBA")
            save(im, os.path.join(subdir, os.path.basename(f)))
    print(f"  共 {sum(len(v) for v in copies.values())} 个文件")

    # ── 5. 汇总 ──
    total = 0
    count = 0
    for dirpath, _dirs, files in os.walk(OUT):
        for f in files:
            if f.endswith(".png"):
                total += os.path.getsize(os.path.join(dirpath, f))
                count += 1
    print(f"\n产物：{count} 个 PNG，共 {total / 1024:.0f} KB → {os.path.normpath(OUT)}")
    if total > 800 * 1024:
        fail(f"总体积 {total / 1024:.0f}KB 超过 800KB 预算")

    if failures:
        print(f"\n失败 {len(failures)} 项：")
        for m in failures:
            print(f"  - {m}")
        return 1
    print("全部断言通过 ✓")
    return 0


if __name__ == "__main__":
    sys.exit(main())

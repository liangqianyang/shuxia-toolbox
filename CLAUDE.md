# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

枫叶小屋的工具箱 (shuxia-toolbox) — a WeChat mini-program toolbox. The only current tool is a 拼豆图纸生成器 (Perler/fuse-bead pattern generator): the user uploads an image and the app produces a bead grid pattern plus per-color bead counts.

Key design decision: all image processing runs **client-side** via Canvas (no image upload) to reduce privacy/audit risk. The backend is an API skeleton reserved for future features (AI cutout, saving works, palette management) and is currently **not consumed by the frontend** — there are no network calls in the frontend code.

## Commands

### Frontend (`frontend/`, uses pnpm)

```bash
pnpm dev:mp-weixin      # dev build for WeChat mini program → dist/dev/mp-weixin (open in WeChat DevTools)
pnpm build:mp-weixin    # production build → dist/build/mp-weixin
pnpm dev:h5             # H5 dev server
pnpm test               # algorithm/layout assertions (Node, no canvas needed) via test/run.cjs
pnpm typecheck          # vue-tsc --noEmit
```

No lint script is configured.

### Backend (`backend/`, runs inside Docker container `php84-fpm`)

```bash
docker exec -w /var/www/html/shuxia-toolbox/backend php84-fpm composer install
docker exec -w /var/www/html/shuxia-toolbox/backend php84-fpm php bin/hyperf.php start
docker exec -w /var/www/html/shuxia-toolbox/backend php84-fpm composer cs:fix   # php-cs-fixer
curl http://127.0.0.1:9501/health   # health check
```

No test framework is configured.

## Architecture

### Frontend — uni-app + Vue 3 + Vite + TypeScript

- Page routing via `src/pages.json` (uni-app convention, no vue-router): `pages/home/index` (toolbox home) and `pages/beads/index` (bead generator).
- No Pinia/Vuex. State lives in composables under `src/composables/`:
  - `useBeadPattern.ts` — the pattern pipeline (`generatePattern`): (1) optional pixel-level background removal (`removeSourceBackgroundFlood`) — edge-color flood from the 4 borders; for near-neutral (white/gray) backgrounds it also clears near-neutral, luminance-similar pixels to handle noisy/compressed backgrounds, and an inward-depth check bails when the candidate is only a thin outline/border so frame-filling stickers' outlines aren't deleted; (2) crop — transparent-margin crop only (`detectOpaqueCrop`), else full image (no "colorful subject" crop: it dropped non-colorful subjects like a white panda and warped aspect ratio); (3) downsample — per cell, if one color is the majority (>50% of the cell) use that **dominant color** (crisp boundaries, no muddy blend — more detail per bead at the same count), else the alpha-weighted area average (smooth gradients/photos don't get noisy). `auto` sizes **by content complexity, not pixels**: it measures the image's dominant structural colors (area-average to ref 80, **2-bit quantize** so anti-aliasing/JPEG noise merges back into the flat colors instead of inflating the count, count colors >1%) **plus an edge-density factor** (fraction of non-empty cells whose color differs sharply from a 4-neighbor — captures thin-line/many-part complexity that the color count misses) and sets long side = `clamp(38 + colors×0.6 + edgeDensity×80, 38, 64)`, capped at `min(that, sourceLong)` (small images aren't upscaled). The floor of 38 ensures low-color images (a single-character emoji) still get enough cells to keep detail; cap is 64 — raised from 52 because line-dense subjects (a panda riding a tricycle: few colors but dense outlines/spokes/frame) need ~62 cells to resolve sub-cell features that otherwise blob into solid dark; pure-color/gradient images have edgeDensity≈0 and stay at 38-45 (unaffected). Simple images ~1.5-2k beads / 1 small board; complex line-dense images ~2-2.5k beads / 1 big (104) board. board-preset/custom override; **detail preservation**: a cell crossed by a thin feature (dark outline, colored text/strokes) would average to a washed-out transition color (outlines break, text becomes illegible). The fix is directional, not RGB-distance (a two-color cell averages between the two, so both colors are "far from average" and cancel out): the dark rule **binarises** outline edges by `darkShare` (the cell's dark-pixel alpha share — robust to anti-aliasing because it sums all luma<90 pixels regardless of palette fragmentation): a cell snaps to the dark color when `darkShare ≥ DARK_MIN_SHARE=0.35` (the outline covers the cell); a low-`darkShare` "graze" cell (outline only clips a corner) takes the **non-dark average** — dark pixels excluded — so it becomes the pure fill, never a mid-tone. This is the key anti-杂色 measure: averaging dark+fill in non-dominant edge cells produces a scatter of distinct mid-tone palette colors along the curve that reads exactly as 杂色+jaggies, so outline edges are forced binary (dark or fill), never averaged. Smoother curves come from more cells / higher resolution, not from transition colors. A chroma gate remains on the snap: if the cell average is already clearly chromatic (avgChroma>50) and dark is a minority (<50%), the dark is bleed from an adjacent outline, not the cell's own feature — keep the color, don't snap dark, or a small colored region ringed by dark (e.g. the pink tongue inside an open mouth) gets eaten into solid black ring-by-ring. High-saturation minorities much more *saturated* than the cell average keep the saturated color (text/strokes stay legible); (4) per-cell **direct** ΔE2000 nearest-palette mapping (`mapCellsDirectToPalette` → `nearestBeadIndex`); (5) merge low-frequency colors (share <1%) within ΔE2000<16 into more common ones (`mergeSimilarColorsByFrequency`) to collapse anti-aliasing fragmentation — at 16 (raised from 12) the dark-red/gray-purple/brown transition specks along outlines get pulled back into the main outline color so borders stay continuous instead of speckled (worse at higher resolution where edge cells multiply), while independent semantic detail (e.g. a wheel's yellow-green spokes, ΔE>16 from every high-freq color) survives because merge only folds *near* colors; (5b) **dark-outline consolidation** (`consolidateDarkOutline`) — folds **all** *dark* colors (luma≤112) into the single most-frequent dark, **no ΔE limit**, regardless of share. This is separate from (5) because a dark outline gets split across 5+ beads (dark-red/gray-purple/brown, each >1% share so (5) skips them) and the user sees a speckled border; the AA fragments span large ΔE (>20) by *hue* (red↔purple↔brown), so a ΔE threshold always misses half of them — the reliable signal is that they are all dark, so every dark merges into the dominant one. It is luma-gated (not global) so light skin/blush (ΔE~5 but luma>112) are untouched. Near-black sources (luma<55) are protected so pupils/eyes don't fold into mid-dark gray; cost: any other same-darkness element also merges into the outline color (fine for single-subject stickers/cartoons); (6) connected-component despeckle (regions ≤3 cells → neighbor majority, iterated to fixed point); (7) color counts. There is **no k-means / quantize-then-map** — direct per-cell mapping on the *downsampled* grid is intentional (downsampling pre-averages, so flat areas stay clean and photo gradients are preserved); the color-merge + despeckle steps are what suppress noise. Tunable params: `boardPresetKey / paletteKey / removeBackground` plus `autoGridSize` + `gridLongSide` (in `auto` board mode: `autoGridSize=true` uses the content-adaptive sizing above; `false` lets the user manually set the long side 30-104 via a slider — auto-sizing is unreliable for some image types like a vehicle with many small parts, so manual override exists for those). `removeBackground` defaults **on** (most inputs are stickers/emoji on a flat background the user wants gone; changed from off — note the tradeoff: removing the background of a light/white subject on a *colored* background can destroy the contrast that makes it visible, so it remains a user-toggleable param); merge threshold is a code constant.
  - `useBeadCanvas.ts` — on-page preview (zoom by re-render at 1x/2x/3x inside a scroll-view); `useBeadExport.ts` — high-res export + save-to-album with permission-denied → openSetting flow.
- `src/utils/sheetRenderer.ts` — shared by preview and export (preview is exactly what gets exported): title `Mard(total)`, row/column indices on all four edges, per-cell color codes with auto black/white text, checkerboard empty cells, legend pills. All dimensions are ratios of `cellPx`; total canvas is capped at 4000px (iOS canvas limit), falling back to 2800px on export failure.
- `src/utils/canvasAdapter.ts` — the only file with `#ifdef MP-WEIXIN` / `#ifdef H5` conditional compilation; both branches must typecheck (vue-tsc sees both).
- `src/utils/beadPalette.ts` + `beadPaletteData.ts` — palette data (RGB, ported from PHP; LAB computed lazily at runtime) and ΔE2000 nearest-color matching. Default palette key: `mard-221`. Color codes are zero-padded in data (`F04`); strip via `displayCode()` only at render time (`F4`).
- `@/` aliases `src/`.

### Backend — PHP 8.4 + Hyperf 3.2 (beta) on Swoole

- Entry point `bin/hyperf.php`; Swoole HTTP server on port 9501 (env `SERVER_PORT`).
- Routes defined in `config/routes.php`: `GET /health`, `GET /api/health`, `GET /api/beads/palettes`, `POST /api/beads/estimate`.
- Response envelope: `{code, message, data}` with code 0 = success, 422 = validation error.
- `app/Service/BeadPaletteService.php` holds hard-coded palettes (`basic-24`, `mard-291`, and `mard-221` derived from MARD by filtering prefix groups A–H,M).
- No database, no middleware, no auth wired in. `config/autoload/wechat.php` holds placeholder mini-program credentials (`WECHAT_MINI_APPID`/`WECHAT_MINI_SECRET` from env).

### Cross-cutting concern

Palette definitions are **duplicated** between PHP (`BeadPaletteService`, source of truth) and TypeScript (`src/utils/beadPaletteData.ts`, generated copy with identical RGB values). Changes to palettes must be kept in sync across both.

"use strict";

// src/utils/textLayout.ts
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  const paragraphs = text.split("\n");
  for (const paragraph of paragraphs) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    let line = "";
    for (const ch of paragraph) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line !== "") {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line !== "")
      lines.push(line);
  }
  return lines;
}

// src/utils/routeProject.ts
var CLUSTER_THRESHOLD = 0.5;
function projectRoute(stops, box, options) {
  const padding = (options?.padding ?? 0.08) * Math.min(box.width, box.height);
  const innerX = box.x + padding;
  const innerY = box.y + padding;
  const innerW = Math.max(1, box.width - 2 * padding);
  const innerH = Math.max(1, box.height - 2 * padding);
  const valid = stops.map((s, i) => ({ s, i })).filter((it) => it.s.lng != null && it.s.lat != null);
  if (valid.length < 2) {
    const n = stops.length;
    const points = stops.map((s, i) => ({
      x: innerX + (n <= 1 ? innerW / 2 : i * innerW / (n - 1)),
      y: innerY + innerH / 2,
      stopIndex: i,
      stopId: s.id
    }));
    return { segments: [{ points }], reliable: false };
  }
  const groups = [];
  let cur = [valid[0]];
  for (let k = 1; k < valid.length; k++) {
    const prev = valid[k - 1].s;
    const now = valid[k].s;
    const dist = Math.max(
      Math.abs(now.lng - prev.lng),
      Math.abs(now.lat - prev.lat)
    );
    if (dist > CLUSTER_THRESHOLD) {
      groups.push(cur);
      cur = [valid[k]];
    } else {
      cur.push(valid[k]);
    }
  }
  groups.push(cur);
  const segCount = groups.length;
  const bandH = innerH / segCount;
  const segments = groups.map((group, gi) => {
    const lngs = group.map((it) => it.s.lng);
    const lats = group.map((it) => it.s.lat);
    const lngMin = Math.min(...lngs);
    const lngMax = Math.max(...lngs);
    const latMin = Math.min(...lats);
    const latMax = Math.max(...lats);
    const bandY = innerY + gi * bandH;
    const points = group.map((it) => {
      const t = lngMax === lngMin ? 0.5 : (it.s.lng - lngMin) / (lngMax - lngMin);
      const u = latMax === latMin ? 0.5 : (it.s.lat - latMin) / (latMax - latMin);
      return {
        x: innerX + t * innerW,
        y: bandY + (1 - u) * bandH,
        // 纬度大=北=上
        stopIndex: it.i,
        stopId: it.s.id
      };
    });
    return { points };
  });
  return { segments, reliable: true };
}

// test/guide.test.ts
var failures = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  \u2713 ${label}`);
  } else {
    failures++;
    console.error(`  \u2717 ${label}`);
  }
}
function mockCtx(charW) {
  return { measureText: (s) => ({ width: s.length * charW }) };
}
console.log("\u2014 wrapText \u2014");
{
  const ctx = mockCtx(10);
  assert(wrapText(ctx, "\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D\u5341", 55).length === 2, "\u8D85\u5BBD\u6309\u5B57\u7B26\u6298\u6210 2 \u884C");
  assert(wrapText(ctx, "\u77ED", 100).length === 1, "\u77ED\u6587\u672C 1 \u884C");
  const multi = wrapText(ctx, "\u4E00\u4E8C\u4E09\n\u56DB\u4E94\u516D", 1e3);
  assert(multi.length === 2 && multi[0] === "\u4E00\u4E8C\u4E09" && multi[1] === "\u56DB\u4E94\u516D", "\u652F\u6301\u663E\u5F0F \\n");
  const empty = wrapText(ctx, "", 100);
  assert(empty.length === 1 && empty[0] === "", "\u7A7A\u4E32\u8FD4\u56DE 1 \u4E2A\u7A7A\u884C");
}
console.log("\u2014 projectRoute \u2014");
{
  const box = { x: 0, y: 0, width: 100, height: 100 };
  const sameCity = [
    { id: "a", lng: 121.4, lat: 31.2 },
    { id: "b", lng: 121.5, lat: 31.3 },
    { id: "c", lng: 121.6, lat: 31.25 },
    { id: "d", lng: 121.45, lat: 31.35 },
    { id: "e", lng: 121.55, lat: 31.15 }
  ];
  const proj1 = projectRoute(sameCity, box);
  assert(proj1.reliable === true, "\u540C\u57CE reliable=true");
  const pts1 = proj1.segments.flatMap((s) => s.points);
  assert(pts1.length === 5, "\u540C\u57CE 5 \u70B9\u5168\u90E8\u6295\u5F71");
  assert(pts1.every((p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100), "\u70B9\u843D\u5728 box \u5185");
  const c = pts1.find((p) => p.stopId === "c");
  const d = pts1.find((p) => p.stopId === "d");
  const e = pts1.find((p) => p.stopId === "e");
  assert(c.x === Math.max(...pts1.map((p) => p.x)), "\u6700\u4E1C\u70B9 x \u6700\u5927");
  assert(d.y === Math.min(...pts1.map((p) => p.y)), "\u6700\u5317\u70B9 y \u6700\u5C0F");
  assert(e.y === Math.max(...pts1.map((p) => p.y)), "\u6700\u5357\u70B9 y \u6700\u5927");
  const cross = [
    { id: "s1", lng: 121.4, lat: 31.2 },
    { id: "s2", lng: 121.5, lat: 31.3 },
    { id: "h1", lng: 120.1, lat: 30.2 },
    { id: "h2", lng: 120.2, lat: 30.3 }
  ];
  const proj2 = projectRoute(cross, box);
  assert(proj2.reliable === true, "\u8DE8\u57CE reliable=true");
  assert(proj2.segments.length === 2, "\u8DE8\u57CE\u5206 2 \u6BB5");
  assert(
    proj2.segments[0].points.length === 2 && proj2.segments[1].points.length === 2,
    "\u6BCF\u6BB5\u5404 2 \u70B9"
  );
  const nulls = [
    { id: "x", lng: null, lat: null },
    { id: "y", lng: null, lat: null },
    { id: "z", lng: null, lat: null }
  ];
  const proj3 = projectRoute(nulls, box);
  assert(proj3.reliable === false, "\u5168 null reliable=false");
  assert(proj3.segments[0].points.length === 3, "\u964D\u7EA7\u4ECD\u4FDD\u7559\u5168\u90E8\u70B9");
  const proj4 = projectRoute([{ id: "o", lng: 121, lat: 31 }], box);
  assert(proj4.reliable === false, "\u5355\u70B9\u964D\u7EA7 reliable=false");
}
if (failures > 0) {
  console.error(`
${failures} \u9879\u65AD\u8A00\u5931\u8D25`);
  process.exit(1);
}
console.log("\n\u6240\u6709\u653B\u7565\u56FE\u6E32\u67D3\u65AD\u8A00\u901A\u8FC7");

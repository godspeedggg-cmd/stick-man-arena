/* ============================================================
 * Stickman: Warrior's Legacy
 * utils.js — math, RNG, color, easing helpers
 * ============================================================ */
(function (SL) {
  "use strict";

  const TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function chance(p) { return Math.random() < p; }
  function choose(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pickWeighted(items) { // items: [{w, v}]
    let total = 0;
    for (const it of items) total += it.w;
    let r = Math.random() * total;
    for (const it of items) { r -= it.w; if (r <= 0) return it.v; }
    return items[items.length - 1].v;
  }
  function dist(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }
  function len(x, y) { return Math.sqrt(x * x + y * y); }
  function angleTo(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); }
  function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function easeOutCubic(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function easeInQuad(t) { t = clamp(t, 0, 1); return t * t; }
  function easeOutQuad(t) { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); }
  function formatNum(n) { return Math.floor(n).toLocaleString(); }
  function formatTime(s) {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60), ss = s % 60;
    return m + ":" + (ss < 10 ? "0" : "") + ss;
  }
  function hashCode(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h;
  }

  /* Seeded RNG (mulberry32) */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* A tiny vec used for coordinates; plain objects are fine elsewhere */
  const Vec = {
    new: (x, y) => ({ x, y }),
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
    scale: (a, s) => ({ x: a.x * s, y: a.y * s }),
    length: (a) => Math.sqrt(a.x * a.x + a.y * a.y),
    normalize: (a) => { const l = Math.sqrt(a.x * a.x + a.y * a.y) || 1; return { x: a.x / l, y: a.y / l }; },
  };

  /* Rects */
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function pointInRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  /* HSL helpers */
  function hsla(h, s, l, a) {
    return "hsla(" + h + "," + (s * 100).toFixed(1) + "%," + (l * 100).toFixed(1) + "%," + (a === undefined ? 1 : a) + ")";
  }
  function rgba(r, g, b, a) {
    return "rgba(" + r + "," + g + "," + b + "," + (a === undefined ? 1 : a) + ")";
  }
  function shade(hex, amt) { // darken (-) or lighten (+) a hex color
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt < 0) { r = Math.max(0, Math.floor(r * (1 + amt))); g = Math.max(0, Math.floor(g * (1 + amt))); b = Math.max(0, Math.floor(b * (1 + amt))); }
    else { r = Math.min(255, Math.floor(r + (255 - r) * amt)); g = Math.min(255, Math.floor(g + (255 - g) * amt)); b = Math.min(255, Math.floor(b + (255 - b) * amt)); }
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  /* Canvas drawing helpers */
  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* Global symbol used for objects that need a stable id */
  let uidCounter = 1;
  function uid() { return uidCounter++; }

  SL.U = {
    TAU, clamp, lerp, rand, randInt, chance, choose, pickWeighted,
    dist, len, angleTo, smoothstep, easeOutCubic, easeInQuad, easeOutQuad,
    formatNum, formatTime, hashCode, mulberry32, Vec, rectsOverlap, pointInRect,
    hsla, rgba, shade, roundRectPath, uid,
  };

})(window.SL = window.SL || {});

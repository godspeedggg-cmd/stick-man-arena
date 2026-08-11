/* ============================================================
 * Stickman: Warrior's Legacy
 * levels.js — six zones, parallax backgrounds, procedural
 *             chunk generation, hazards and ambient effects
 * ============================================================ */
(function (SL) {
  "use strict";
  const U = SL.U;

  const ZONE_LENGTH = 500; // meters per zone

  const ZONES = [
    {
      id: "forest", name: "The Whispering Forest", bossId: "gorGul",
      sky: ["#0e2a3a", "#15363f"], sun: { x: 0.78, y: 0.18, color: "#ffd9a0", r: 46 },
      far: "#0d2230", mid: "#14403a", groundTop: "#1c4a2e", groundBot: "#0d2017", line: "#2f7a45",
      farType: "forest", ambient: "leaves", hazard: ["spikes", "rootspike"],
      deco: ["tree", "bush", "rock"],
    },
    {
      id: "village", name: "The Shadow Village", bossId: "wraithKing",
      sky: ["#180f2e", "#241136"], sun: { x: 0.22, y: 0.2, color: "#c9a0ff", r: 34 },
      far: "#150c28", mid: "#1f1240", groundTop: "#241540", groundBot: "#0e0818", line: "#4a2f7a",
      farType: "village", ambient: "bats", hazard: ["spikes", "grave"],
      deco: ["house", "tomb", "deadTree"],
    },
    {
      id: "desert", name: "The Endless Desert", bossId: "magmaTyrant",
      sky: ["#3a2410", "#5c3a18"], sun: { x: 0.5, y: 0.14, color: "#ffb84d", r: 60 },
      far: "#331f0e", mid: "#4a2e14", groundTop: "#7a5a24", groundBot: "#3a2410", line: "#a07a34",
      farType: "desert", ambient: "sand", hazard: ["cactus", "spikes"],
      deco: ["cactus", "dune", "rock"],
    },
    {
      id: "frozen", name: "The Frozen Kingdom", bossId: "frostColossus",
      sky: ["#0a2030", "#123a4e"], sun: { x: 0.78, y: 0.22, color: "#c9f0ff", r: 40 },
      far: "#0a1c2a", mid: "#123a4a", groundTop: "#d8eef5", groundBot: "#1a4a5e", line: "#8fd0e8",
      farType: "frozen", ambient: "snow", hazard: ["spikes", "icecrystal"],
      deco: ["iceTree", "iceRock"],
    },
    {
      id: "volcano", name: "The Molten Volcano", bossId: "magmaTyrant",
      sky: ["#2a0e08", "#4a1808"], sun: { x: 0.3, y: 0.16, color: "#ff7a3a", r: 52 },
      far: "#260c06", mid: "#3a1408", groundTop: "#5a2c14", groundBot: "#1a0c06", line: "#7a3a18",
      farType: "volcano", ambient: "embers", hazard: ["lava", "firejet"],
      deco: ["volcRock", "lavaPool"],
    },
    {
      id: "castle", name: "The Dark Castle", bossId: "wraithKing",
      sky: ["#0e0e1c", "#1a142e"], sun: { x: 0.85, y: 0.16, color: "#a09aff", r: 30 },
      far: "#0c0c18", mid: "#18122c", groundTop: "#241c38", groundBot: "#0a0812", line: "#3a2f5e",
      farType: "castle", ambient: "bats", hazard: ["spikes", "spikewall"],
      deco: ["castleWall", "torch", "bone"],
    },
  ];

  class LevelGen {
    constructor(game) {
      this.game = game;
      this.chunks = {};
      this.ambientT = 0;
      this.rng = U.mulberry32((Date.now() % 1e9) ^ 987654321);
    }

    zoneIndexFor(distance) {
      return Math.floor(distance / ZONE_LENGTH);
    }
    zoneFor(distance) {
      return ZONES[this.zoneIndexFor(distance) % ZONES.length];
    }

    chunkIndex(x) { return Math.floor(x / 320); }

    /* generate one 320-wide chunk of decorations + hazards (world coords) */
    generateChunk(idx) {
      if (this.chunks[idx]) return this.chunks[idx];
      const zoneIdx = Math.max(0, idx);
      const zone = ZONES[Math.floor((zoneIdx * 320) / (ZONE_LENGTH * 60)) % ZONES.length];
      const rng = U.mulberry32((this.game.seed ^ (idx * 7919)) >>> 0);
      const x0 = idx * 320;
      const decos = [];
      const step = 40;
      for (let x = x0 + 20; x < x0 + 320; x += step) {
        const roll = rng();
        if (roll < 0.28) {
          const type = U.choose(zone.deco);
          const d = this.makeDeco(type, x, rng, zone);
          if (d) decos.push(d);
        } else if (roll < 0.28 + 0.06) {
          const type = U.choose(zone.hazard);
          const h = this.makeHazard(type, x, rng, zone);
          if (h) decos.push(h);
        }
        // occasional small filler
        if (rng() < 0.1) {
          decos.push({ type: "grass", x: x + rng() * 20, y: this.game.groundY, w: 20, h: 8, v: rng(), zone: zone.id });
        }
      }
      this.chunks[idx] = decos;
      return decos;
    }

    makeDeco(type, x, rng, zone) {
      const g = this.game;
      const gy = g.groundY;
      const s = 0.8 + rng() * 0.6;
      switch (type) {
        case "tree": return { type, x, y: gy, w: 50 * s, h: 110 * s, s, v: rng(), zone: zone.id };
        case "bush": return { type, x, y: gy, w: 24 * s, h: 16 * s, s, v: rng(), zone: zone.id };
        case "rock": return { type, x, y: gy, w: 22 * s, h: 14 * s, s, v: rng(), zone: zone.id };
        case "house": return { type, x, y: gy, w: 70, h: 70, s, v: rng(), zone: zone.id };
        case "tomb": return { type, x, y: gy, w: 26, h: 34, s, v: rng(), zone: zone.id };
        case "deadTree": return { type, x, y: gy, w: 34, h: 80, s, v: rng(), zone: zone.id };
        case "cactus": return { type, x, y: gy, w: 24 * s, h: 50 * s, s, v: rng(), zone: zone.id };
        case "dune": return { type, x, y: gy, w: 80 * s, h: 16 * s, s, v: rng(), zone: zone.id };
        case "iceTree": return { type, x, y: gy, w: 40 * s, h: 100 * s, s, v: rng(), zone: zone.id };
        case "iceRock": return { type, x, y: gy, w: 26 * s, h: 18 * s, s, v: rng(), zone: zone.id };
        case "volcRock": return { type, x, y: gy, w: 26 * s, h: 16 * s, s, v: rng(), zone: zone.id };
        case "lavaPool": return { type, x, y: gy, w: 30 * s, h: 10, s, v: rng(), zone: zone.id };
        case "castleWall": return { type, x, y: gy, w: 50, h: 90, s, v: rng(), zone: zone.id };
        case "torch": return { type, x, y: gy, w: 10, h: 40, s, v: rng(), zone: zone.id };
        case "bone": return { type, x, y: gy, w: 16, h: 10, s, v: rng(), zone: zone.id };
      }
      return null;
    }

    makeHazard(type, x, rng, zone) {
      const g = this.game;
      const gy = g.groundY;
      switch (type) {
        case "spikes": {
          const n = 2 + Math.floor(rng() * 3);
          return { type, x, y: gy, w: n * 12, h: 14, n, hazard: true, dmg: 12, zone: zone.id };
        }
        case "rootspike": {
          return { type, x, y: gy, w: 26, h: 18, hazard: true, dmg: 10, zone: zone.id };
        }
        case "grave": {
          return { type, x, y: gy, w: 30, h: 26, hazard: false, zone: zone.id };
        }
        case "cactus": {
          return { type, x, y: gy, w: 22, h: 40, hazard: true, dmg: 9, zone: zone.id };
        }
        case "icecrystal": {
          return { type, x, y: gy, w: 18, h: 26, hazard: true, dmg: 11, zone: zone.id };
        }
        case "lava": {
          const w = 60 + rng() * 80;
          return { type, x, y: gy, w, h: 10, hazard: true, dmg: 18, zone: zone.id, burn: true };
        }
        case "firejet": {
          return { type, x, y: gy, w: 18, h: 0, hazard: true, dmg: 15, zone: zone.id, cycle: rng(), phase: rng() };
        }
        case "spikewall": {
          const h = 40 + rng() * 30;
          return { type, x, y: gy, w: 16, h, hazard: true, dmg: 12, zone: zone.id };
        }
      }
      return null;
    }

    decosInRange(x0, x1) {
      const c0 = this.chunkIndex(x0), c1 = this.chunkIndex(x1);
      const out = [];
      for (let i = c0; i <= c1; i++) {
        const decos = this.generateChunk(i);
        for (const d of decos) {
          if (d.x + d.w >= x0 && d.x <= x1) out.push(d);
        }
      }
      return out;
    }

    hazardsInRange(x0, x1) {
      const c0 = this.chunkIndex(x0), c1 = this.chunkIndex(x1);
      const out = [];
      for (let i = c0; i <= c1; i++) {
        const decos = this.generateChunk(i);
        for (const d of decos) if (d.hazard) out.push(d);
      }
      return out;
    }

    /* ---------------- background rendering ---------------- */
    drawBackground(ctx, time, scrollX, viewW, viewH, groundY) {
      const dist = this.game.distance;
      const zone = this.zoneFor(dist);
      const zIdx = this.zoneIndexFor(dist) % ZONES.length;
      const grad = ctx.createLinearGradient(0, 0, 0, viewH);
      grad.addColorStop(0, zone.sky[0]);
      grad.addColorStop(1, zone.sky[1]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, viewW, viewH);

      // sun / moon
      const sun = zone.sun;
      const sunX = sun.x * viewW;
      const sunY = sun.y * viewH;
      const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sun.r * 4);
      glow.addColorStop(0, sun.color);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = glow;
      ctx.fillRect(sunX - sun.r * 4, sunY - sun.r * 4, sun.r * 8, sun.r * 8);
      ctx.globalAlpha = 1;
      ctx.fillStyle = sun.color;
      ctx.beginPath(); ctx.arc(sunX, sunY, sun.r, 0, U.TAU); ctx.fill();

      // stars (night zones)
      if (zone.id === "village" || zone.id === "castle") {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "#ffffff";
        for (let i = 0; i < 30; i++) {
          const sx = ((i * 97.3 + 13) % 100) / 100 * viewW;
          const sy = ((i * 61.7 + 7) % 55) / 100 * viewH;
          const tw = 0.4 + 0.6 * Math.sin(time * 2 + i);
          ctx.globalAlpha = Math.max(0.1, tw) * 0.6;
          ctx.beginPath(); ctx.arc(sx, sy, 1.2, 0, U.TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // far parallax
      this.drawFarLayer(ctx, zone, time, scrollX * 0.15, viewW, viewH, groundY);
      // mid parallax
      this.drawMidLayer(ctx, zone, time, scrollX * 0.4, viewW, viewH, groundY);

      // fog / darkness for village & castle
      if (zone.id === "village" || zone.id === "castle") {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = "#1a0e3a";
        ctx.fillRect(0, 0, viewW, viewH);
        ctx.globalAlpha = 1;
        // moving fog bands
        for (let i = 0; i < 4; i++) {
          const fx = ((scrollX * 0.15 + i * 340) % (viewW + 340)) - 170;
          const fy = groundY - 40 + Math.sin(time * 0.4 + i * 2) * 14 + i * 18;
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = "#a09aff";
          ctx.beginPath(); ctx.ellipse(fx, fy, 130, 26, 0, 0, U.TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // ground
      const gg = ctx.createLinearGradient(0, groundY, 0, viewH);
      gg.addColorStop(0, zone.groundTop);
      gg.addColorStop(1, zone.groundBot);
      ctx.fillStyle = gg;
      ctx.fillRect(0, groundY, viewW, viewH - groundY);
      // ground top line
      ctx.fillStyle = zone.line;
      ctx.fillRect(0, groundY - 2, viewW, 3);
      // ground texture dashes
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = zone.line;
      ctx.lineWidth = 1.5;
      const off = (scrollX % 48);
      for (let x = -off; x < viewW; x += 48) {
        ctx.beginPath(); ctx.moveTo(x, groundY + 8); ctx.lineTo(x + 20, groundY + 8); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    drawFarLayer(ctx, zone, time, off, viewW, viewH, groundY) {
      ctx.fillStyle = zone.far;
      ctx.save();
      const seg = 180;
      const baseY = groundY;
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      for (let x = -(off % seg); x < viewW + seg; x += seg) {
        const idx = Math.round((x + off) / seg);
        const rng = U.mulberry32((this.game.seed + idx * 31) >>> 0);
        const h = (this.zoneFor && (0.4 + rng() * 0.5)) ? 0.28 + rng() * 0.4 : 0.3;
        const hh = viewH * h;
        switch (zone.farType) {
          case "forest": ctx.lineTo(x + seg * 0.2, baseY - hh * 0.5); ctx.lineTo(x + seg * 0.5, baseY - hh); ctx.lineTo(x + seg * 0.8, baseY - hh * 0.5); break;
          case "frozen": ctx.lineTo(x + seg * 0.15, baseY - hh * 0.4); ctx.lineTo(x + seg * 0.5, baseY - hh); ctx.lineTo(x + seg * 0.85, baseY - hh * 0.4); break;
          case "desert": ctx.lineTo(x + seg * 0.1, baseY - hh * 0.6); ctx.lineTo(x + seg * 0.5, baseY - hh); ctx.lineTo(x + seg * 0.9, baseY - hh * 0.55); break;
          case "village": ctx.lineTo(x + seg * 0.15, baseY - hh); ctx.lineTo(x + seg * 0.25, baseY - hh); ctx.lineTo(x + seg * 0.3, baseY - hh * 0.8); ctx.lineTo(x + seg * 0.45, baseY - hh); ctx.lineTo(x + seg * 0.55, baseY - hh * 0.85); ctx.lineTo(x + seg * 0.7, baseY - hh); ctx.lineTo(x + seg * 0.85, baseY - hh * 0.9); break;
          case "volcano": ctx.lineTo(x + seg * 0.15, baseY - hh * 0.4); ctx.lineTo(x + seg * 0.5, baseY - hh); ctx.lineTo(x + seg * 0.85, baseY - hh * 0.45); break;
          case "castle": ctx.lineTo(x + seg * 0.1, baseY - hh * 0.6); ctx.lineTo(x + seg * 0.2, baseY - hh); ctx.lineTo(x + seg * 0.3, baseY - hh); ctx.lineTo(x + seg * 0.32, baseY - hh * 0.75); ctx.lineTo(x + seg * 0.45, baseY - hh); ctx.lineTo(x + seg * 0.6, baseY - hh * 0.7); ctx.lineTo(x + seg * 0.7, baseY - hh); ctx.lineTo(x + seg * 0.85, baseY - hh); ctx.lineTo(x + seg * 0.9, baseY - hh * 0.6); break;
          default: ctx.lineTo(x + seg * 0.5, baseY - hh); break;
        }
      }
      ctx.lineTo(viewW + seg, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawMidLayer(ctx, zone, time, off, viewW, viewH, groundY) {
      ctx.fillStyle = zone.mid;
      ctx.save();
      const seg = 130;
      const baseY = groundY;
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      for (let x = -(off % seg); x < viewW + seg; x += seg) {
        const idx = Math.round((x + off) / seg);
        const rng = U.mulberry32((this.game.seed + idx * 77) >>> 0);
        const hh = viewH * (0.12 + rng() * 0.18);
        switch (zone.farType) {
          case "forest": ctx.lineTo(x + seg * 0.5, baseY - hh); break;
          case "frozen": ctx.lineTo(x + seg * 0.5, baseY - hh); break;
          case "desert": ctx.lineTo(x + seg * 0.35, baseY - hh * 0.8); ctx.lineTo(x + seg * 0.65, baseY - hh * 0.6); break;
          case "village": ctx.lineTo(x + seg * 0.35, baseY - hh * 0.7); ctx.lineTo(x + seg * 0.55, baseY - hh); ctx.lineTo(x + seg * 0.75, baseY - hh * 0.8); break;
          case "volcano": ctx.lineTo(x + seg * 0.3, baseY - hh); ctx.lineTo(x + seg * 0.6, baseY - hh * 0.6); break;
          case "castle": ctx.lineTo(x + seg * 0.2, baseY - hh); ctx.lineTo(x + seg * 0.45, baseY - hh * 0.8); ctx.lineTo(x + seg * 0.7, baseY - hh); break;
          default: break;
        }
      }
      ctx.lineTo(viewW + seg, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    /* ---------------- decorations ---------------- */
    drawDecos(ctx, time, scrollX, viewW, viewH, groundY) {
      const x0 = scrollX - 60, x1 = scrollX + viewW + 60;
      const decos = this.decosInRange(x0, x1);
      for (const d of decos) {
        this.drawDeco(ctx, d, time, groundY);
      }
    }

    drawDeco(ctx, d, time, groundY) {
      const zone = this.zoneFor(this.game.distance);
      const gy = groundY;
      switch (d.type) {
        case "tree": {
          ctx.fillStyle = "#12331f";
          ctx.fillRect(d.x + d.w * 0.4, gy - d.h * 0.4, d.w * 0.2, d.h * 0.4);
          ctx.fillStyle = "#1c4a2e";
          ctx.beginPath();
          ctx.arc(d.x + d.w * 0.5, gy - d.h * 0.55, d.w * 0.5, 0, U.TAU);
          ctx.arc(d.x + d.w * 0.2, gy - d.h * 0.4, d.w * 0.35, 0, U.TAU);
          ctx.arc(d.x + d.w * 0.8, gy - d.h * 0.4, d.w * 0.35, 0, U.TAU);
          ctx.fill();
          break;
        }
        case "bush": {
          ctx.fillStyle = "#1c4a2e";
          ctx.beginPath();
          ctx.arc(d.x + d.w * 0.3, gy, d.w * 0.3, Math.PI, 0);
          ctx.arc(d.x + d.w * 0.7, gy, d.w * 0.3, Math.PI, 0);
          ctx.fill();
          break;
        }
        case "rock": {
          ctx.fillStyle = zone.id === "desert" ? "#7a5a24" : "#2a3a44";
          ctx.beginPath();
          ctx.ellipse(d.x + d.w / 2, gy - d.h * 0.4, d.w / 2, d.h / 2, 0, 0, U.TAU);
          ctx.fill();
          break;
        }
        case "house": {
          ctx.fillStyle = "#1f1240";
          ctx.fillRect(d.x, gy - d.h, d.w, d.h);
          ctx.fillStyle = "#2a1c55";
          ctx.beginPath(); ctx.moveTo(d.x - 4, gy - d.h); ctx.lineTo(d.x + d.w / 2, gy - d.h * 1.4); ctx.lineTo(d.x + d.w + 4, gy - d.h); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#ffb84d";
          ctx.fillRect(d.x + d.w * 0.42, gy - d.h * 0.6, d.w * 0.16, d.h * 0.4);
          break;
        }
        case "tomb": {
          ctx.fillStyle = "#3a2f5e";
          ctx.fillRect(d.x, gy - d.h, d.w, d.h);
          ctx.beginPath(); ctx.arc(d.x + d.w / 2, gy - d.h * 0.3, d.w * 0.32, 0, U.TAU); ctx.fill();
          ctx.fillStyle = "#1a1230";
          ctx.font = "10px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("RIP", d.x + d.w / 2, gy - d.h * 0.25);
          break;
        }
        case "deadTree": {
          ctx.strokeStyle = "#2a1c40";
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(d.x + d.w / 2, gy); ctx.lineTo(d.x + d.w / 2, gy - d.h);
          ctx.lineTo(d.x + d.w / 2 - 14, gy - d.h * 0.7);
          ctx.moveTo(d.x + d.w / 2, gy - d.h * 0.85);
          ctx.lineTo(d.x + d.w / 2 + 12, gy - d.h * 0.6);
          ctx.stroke();
          break;
        }
        case "cactus": {
          ctx.fillStyle = "#2a7a3a";
          ctx.fillRect(d.x + d.w * 0.4, gy - d.h, d.w * 0.2, d.h);
          ctx.fillRect(d.x, gy - d.h * 0.7, d.w * 0.4, d.h * 0.16);
          ctx.fillRect(d.x + d.w * 0.6, gy - d.h * 0.5, d.w * 0.4, d.h * 0.16);
          break;
        }
        case "dune": {
          ctx.fillStyle = "#4a2e14";
          ctx.beginPath();
          ctx.moveTo(d.x, gy);
          ctx.quadraticCurveTo(d.x + d.w / 2, gy - d.h, d.x + d.w, gy);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case "iceTree": {
          ctx.fillStyle = "#0f3a4a";
          ctx.fillRect(d.x + d.w * 0.42, gy - d.h * 0.5, d.w * 0.16, d.h * 0.5);
          ctx.fillStyle = "#d8eef5";
          ctx.beginPath();
          ctx.arc(d.x + d.w * 0.5, gy - d.h * 0.7, d.w * 0.55, 0, U.TAU);
          ctx.fill();
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = "#8fd0e8";
          ctx.beginPath(); ctx.arc(d.x + d.w * 0.3, gy - d.h * 0.55, d.w * 0.3, 0, U.TAU); ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case "iceRock": {
          ctx.fillStyle = "#8fd0e8";
          ctx.beginPath();
          ctx.moveTo(d.x, gy);
          ctx.lineTo(d.x + d.w * 0.3, gy - d.h);
          ctx.lineTo(d.x + d.w * 0.7, gy - d.h * 0.7);
          ctx.lineTo(d.x + d.w, gy);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case "volcRock": {
          ctx.fillStyle = "#3a1408";
          ctx.beginPath();
          ctx.ellipse(d.x + d.w / 2, gy - d.h * 0.4, d.w / 2, d.h / 2, 0, 0, U.TAU);
          ctx.fill();
          ctx.fillStyle = "rgba(255,120,40,0.5)";
          ctx.fillRect(d.x + d.w * 0.3, gy - d.h * 0.7, d.w * 0.15, 4);
          break;
        }
        case "lavaPool": {
          const pul = 0.7 + Math.sin(time * 3 + d.x) * 0.3;
          ctx.fillStyle = "rgba(255,90,20," + pul + ")";
          ctx.beginPath();
          ctx.ellipse(d.x + d.w / 2, gy - 4, d.w / 2, 6, 0, 0, U.TAU);
          ctx.fill();
          break;
        }
        case "castleWall": {
          ctx.fillStyle = "#241c38";
          ctx.fillRect(d.x, gy - d.h, d.w, d.h);
          ctx.fillStyle = "#3a2f5e";
          ctx.fillRect(d.x - 4, gy - d.h - 8, d.w + 8, 8);
          ctx.fillStyle = "#0e0c18";
          for (let i = 0; i < 3; i++) ctx.fillRect(d.x + 8 + i * 14, gy - d.h + 14, 8, 8);
          break;
        }
        case "torch": {
          ctx.strokeStyle = "#3a2f5e";
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(d.x + 5, gy); ctx.lineTo(d.x + 5, gy - d.h); ctx.stroke();
          const fl = 0.8 + Math.sin(time * 10 + d.x) * 0.3;
          ctx.fillStyle = "#ffb84d";
          ctx.beginPath(); ctx.arc(d.x + 5, gy - d.h - 4, 4 * fl, 0, U.TAU); ctx.fill();
          ctx.fillStyle = "rgba(255,180,60,0.3)";
          ctx.beginPath(); ctx.arc(d.x + 5, gy - d.h - 4, 9, 0, U.TAU); ctx.fill();
          break;
        }
        case "bone": {
          ctx.strokeStyle = "#d8dce8";
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(d.x + 8, gy - 5, 5, 0, U.TAU); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(d.x + 8, gy - 5); ctx.lineTo(d.x + d.w, gy - 4); ctx.stroke();
          ctx.beginPath(); ctx.arc(d.x + d.w, gy - 4, 5, 0, U.TAU); ctx.stroke();
          break;
        }
        case "grass": {
          ctx.strokeStyle = "#2f7a45";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(d.x, gy); ctx.lineTo(d.x + 3, gy - 6);
          ctx.moveTo(d.x + 5, gy); ctx.lineTo(d.x + 8, gy - 7);
          ctx.moveTo(d.x + 10, gy); ctx.lineTo(d.x + 12, gy - 5);
          ctx.stroke();
          break;
        }

        /* -------- hazards -------- */
        case "spikes": {
          ctx.fillStyle = "#b8c4d8";
          for (let i = 0; i < d.n; i++) {
            ctx.beginPath();
            ctx.moveTo(d.x + i * 12, gy);
            ctx.lineTo(d.x + i * 12 + 6, gy - d.h);
            ctx.lineTo(d.x + i * 12 + 12, gy);
            ctx.closePath();
            ctx.fill();
          }
          break;
        }
        case "rootspike": {
          ctx.fillStyle = "#4a8a5e";
          ctx.beginPath();
          ctx.moveTo(d.x, gy);
          ctx.quadraticCurveTo(d.x + d.w / 2, gy - d.h, d.x + d.w, gy);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case "cactus": {
          ctx.fillStyle = "#2a7a3a";
          ctx.fillRect(d.x + d.w * 0.35, gy - d.h, d.w * 0.3, d.h);
          ctx.fillRect(d.x + d.w * 0.65, gy - d.h * 0.5, d.w * 0.4, d.h * 0.15);
          ctx.fillRect(d.x, gy - d.h * 0.6, d.w * 0.35, d.h * 0.15);
          break;
        }
        case "icecrystal": {
          ctx.fillStyle = "#bdf0ff";
          ctx.beginPath();
          ctx.moveTo(d.x + d.w / 2, gy - d.h);
          ctx.lineTo(d.x + d.w * 0.2, gy);
          ctx.lineTo(d.x + d.w * 0.8, gy);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case "lava": {
          const pul = 0.6 + Math.sin(time * 4 + d.x * 0.1) * 0.35;
          ctx.fillStyle = "rgba(255,90,20," + pul + ")";
          ctx.fillRect(d.x, gy - d.h, d.w, d.h);
          ctx.fillStyle = "rgba(255,200,80,0.7)";
          for (let x = d.x + 4; x < d.x + d.w - 4; x += 12) {
            ctx.fillRect(x, gy - d.h + 2, 5, 3);
          }
          break;
        }
        case "firejet": {
          const period = 3.2;
          const phase = ((time + d.phase * period) % period) / period;
          // idle → telegraph → erupt
          let hgt = 0;
          if (phase > 0.72) hgt = (phase - 0.72) / 0.28 * 90;
          if (phase > 0.85) hgt = 90;
          if (phase < 0.12) hgt = 0;
          if (phase >= 0.12 && phase <= 0.5) hgt = 0;
          if (phase > 0.5 && phase <= 0.72) hgt = 30 + Math.sin(phase * 30) * 10; // pre-glow
          ctx.save();
          ctx.translate(d.x + d.w / 2, gy);
          if (phase >= 0.5 && phase < 0.72) {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = "#ff8a3a";
            ctx.beginPath(); ctx.ellipse(0, -8, 8, 14, 0, 0, U.TAU); ctx.fill();
          }
          if (hgt > 0) {
            ctx.fillStyle = "rgba(255,120,30,0.85)";
            ctx.beginPath();
            ctx.moveTo(-7, 0);
            ctx.quadraticCurveTo(0, -hgt, 7, 0);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = "rgba(255,220,120,0.9)";
            ctx.beginPath();
            ctx.moveTo(-3, 0);
            ctx.quadraticCurveTo(0, -hgt * 0.7, 3, 0);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
          d.erupting = phase > 0.85;
          break;
        }
        case "spikewall": {
          ctx.fillStyle = "#4a3a6a";
          for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(d.x + i * 4, gy);
            ctx.lineTo(d.x + i * 4 + 2, gy - d.h);
            ctx.lineTo(d.x + i * 4 + 4, gy);
            ctx.closePath();
            ctx.fill();
          }
          break;
        }
      }
    }

    /* ---------------- ambient effects ---------------- */
    updateAmbient(dt, time) {
      const zone = this.zoneFor(this.game.distance);
      const g = this.game;
      this.ambientT -= dt;
      if (this.ambientT <= 0) {
        this.ambientT = zone.ambient === "snow" ? 0.08 : zone.ambient === "embers" ? 0.12 : 0.18;
        const x = g.scrollX + Math.random() * g.viewW;
        const color = zone.ambient === "leaves" ? "#3f8a5a" : zone.ambient === "snow" ? "#d8eef5" : zone.ambient === "embers" ? "#ff8a3a" : zone.ambient === "sand" ? "#c9a86e" : "#a09aff";
        g.particles.spawn({
          x, y: g.groundY - Math.random() * g.viewH * 0.8,
          vx: (Math.random() - 0.5) * 20 - 40, vy: zone.ambient === "embers" ? -60 - Math.random() * 40 : 30 + Math.random() * 20,
          life: zone.ambient === "snow" ? 3 : 2.5, size: zone.ambient === "snow" ? 2 : 2.5,
          color, type: zone.ambient === "sand" ? "spark" : "circle", drag: 1, fade: 0.8,
        });
        if (zone.ambient === "bats" && Math.random() < 0.3) {
          g.particles.spawn({
            x: g.scrollX + g.viewW + 20, y: g.groundY - 60 - Math.random() * 60,
            vx: -90 - Math.random() * 60, vy: Math.sin(time * 3) * 20,
            life: 4, size: 3, color: "#2a1c55", type: "bat", drag: 1,
          });
        }
      }
    }

    zoneNames() { return ZONES.map((z) => z.name); }
    zoneForDistance(d) { return this.zoneFor(d); }
  }

  SL.Levels = { LevelGen, ZONES, ZONE_LENGTH };

})(window.SL = window.SL || {});

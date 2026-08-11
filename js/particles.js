/* ============================================================
 * Stickman: Warrior's Legacy
 * particles.js — pooled particle system + floating damage numbers
 * ============================================================ */
(function (SL) {
  "use strict";
  const U = SL.U;

  const MAX_PARTICLES = 420;

  class Particle {
    constructor() {
      this.active = false;
      this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
      this.life = 0; this.maxLife = 1;
      this.size = 2; this.grow = 0;
      this.gravity = 0;
      this.drag = 0.98;
      this.color = "#fff";
      this.type = "circle"; // circle | spark | ring | slash | shock | smoke | glow
      this.rot = 0; this.vrot = 0;
      this.drag = 0.99;
      this.fade = 1;
    }
  }

  class ParticleSystem {
    constructor() {
      this.pool = [];
      this.dmgNumbers = [];
      this.density = 1;
      for (let i = 0; i < MAX_PARTICLES; i++) this.pool.push(new Particle());
      this._cursor = 0;
    }

    _get() {
      const p = this.pool[this._cursor];
      this._cursor = (this._cursor + 1) % MAX_PARTICLES;
      p.active = true;
      return p;
    }

    clear() {
      for (const p of this.pool) p.active = false;
      this.dmgNumbers.length = 0;
    }

    spawn(opts) {
      const p = this._get();
      p.active = true;
      p.x = opts.x; p.y = opts.y;
      p.vx = opts.vx || 0; p.vy = opts.vy || 0;
      p.life = 0; p.maxLife = opts.life || 0.5;
      p.size = opts.size || 3;
      p.grow = opts.grow || 0;
      p.gravity = opts.gravity || 0;
      p.drag = opts.drag || 0.98;
      p.color = opts.color || "#fff";
      p.type = opts.type || "circle";
      p.rot = opts.rot || 0;
      p.vrot = opts.vrot || 0;
      p.fade = opts.fade !== undefined ? opts.fade : 1;
      return p;
    }

    burst(x, y, color, count, speed, size, life, gravity, drag) {
      count = Math.min(count, 24);
      count = Math.max(1, Math.round(count * this.density));
      for (let i = 0; i < count; i++) {
        const a = Math.random() * U.TAU;
        const s = speed * (0.3 + Math.random() * 0.9);
        this.spawn({
          x, y,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: life || 0.4 + Math.random() * 0.4,
          size: size || (2 + Math.random() * 3),
          color, gravity: gravity || 300, drag: drag || 0.94,
          type: Math.random() < 0.5 ? "circle" : "spark",
        });
      }
    }

    ring(x, y, color, size, life) {
      this.spawn({ x, y, life: life || 0.35, size: size || 8, grow: 160, color, type: "ring" });
    }

    slash(x, y, angle, color, scale) {
      this.spawn({
        x, y, life: 0.18, size: (10 + Math.random() * 6) * (scale || 1),
        color, type: "slash", rot: angle, vrot: (Math.random() - 0.5) * 6,
      });
    }

    shock(x, y, color, size) {
      this.spawn({ x, y, life: 0.3, size: size || 6, grow: 320, color, type: "shock" });
    }

    smoke(x, y, color, count) {
      count = Math.min(count, 10);
      for (let i = 0; i < count; i++) {
        this.spawn({
          x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 4,
          vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 40,
          life: 0.5 + Math.random() * 0.6, size: 4 + Math.random() * 6, grow: 18,
          color, type: "smoke", gravity: -40, drag: 0.96,
        });
      }
    }

    trail(x, y, color, size) {
      this.spawn({
        x, y, life: 0.25, size: size || 4,
        vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20,
        color, type: "glow", drag: 0.92,
      });
    }

    lightning(x1, y1, x2, y2, color, segments) {
      segments = segments || 8;
      const pts = [];
      pts.push({ x: x1, y: y1 });
      for (let i = 1; i < segments; i++) {
        const t = i / segments;
        pts.push({ x: U.lerp(x1, x2, t) + (Math.random() - 0.5) * 26, y: U.lerp(y1, y2, t) + (Math.random() - 0.5) * 26 });
      }
      pts.push({ x: x2, y: y2 });
      this.spawn({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, life: 0.18, size: 2, color, type: "bolt", pts });
    }

    damageText(x, y, text, color, opts) {
      opts = opts || {};
      this.dmgNumbers.push({
        x, y, text, color: color || "#fff",
        life: 0, maxLife: opts.life || 0.9,
        vy: opts.vy || -70,
        size: opts.size || 15,
        crit: !!opts.crit,
        active: true,
      });
    }

    update(dt) {
      for (const p of this.pool) {
        if (!p.active) continue;
        p.life += dt;
        if (p.life >= p.maxLife) { p.active = false; continue; }
        p.vx *= p.drag; p.vy *= p.drag;
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.size += p.grow * dt;
        p.rot += p.vrot * dt;
      }
      for (let i = this.dmgNumbers.length - 1; i >= 0; i--) {
        const d = this.dmgNumbers[i];
        d.life += dt;
        d.y += d.vy * dt;
        d.vy *= 0.94;
        if (d.life >= d.maxLife) this.dmgNumbers.splice(i, 1);
      }
    }

    render(ctx) {
      for (const p of this.pool) {
        if (!p.active) continue;
        const t = p.life / p.maxLife;
        const alpha = (1 - t) * p.fade;
        if (alpha <= 0) continue;
        switch (p.type) {
          case "circle": {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, U.TAU);
            ctx.fill();
            break;
          }
          case "spark": {
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = Math.max(1, p.size * 0.5);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
            ctx.stroke();
            break;
          }
          case "glow": {
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
            g.addColorStop(0, p.color);
            g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.globalAlpha = alpha * 0.6;
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3, 0, U.TAU); ctx.fill();
            break;
          }
          case "ring": {
            ctx.globalAlpha = alpha * 0.8;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = Math.max(1, p.size * 0.12);
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, U.TAU); ctx.stroke();
            break;
          }
          case "shock": {
            ctx.globalAlpha = alpha * 0.7;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = Math.max(1, p.size * 0.15);
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, U.TAU); ctx.stroke();
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.6, 0, U.TAU); ctx.stroke();
            break;
          }
          case "slash": {
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = Math.max(2, p.size * 0.25);
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            const r = p.size;
            ctx.beginPath();
            ctx.arc(0, 0, r, -0.9, 0.9);
            ctx.stroke();
            ctx.restore();
            break;
          }
          case "smoke": {
            ctx.globalAlpha = alpha * 0.5;
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, U.TAU); ctx.fill();
            break;
          }
          case "bolt": {
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            const pts = p.pts;
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();
            ctx.globalAlpha = alpha * 0.5;
            ctx.lineWidth = 7;
            ctx.stroke();
            break;
          }
          case "bat": {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            const flap = Math.sin(p.x * 0.3 + p.life * 18) * 4;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.quadraticCurveTo(p.x - 4, p.y - 3 - flap, p.x - 8, p.y - flap);
            ctx.lineTo(p.x, p.y + 2);
            ctx.lineTo(p.x + 8, p.y - flap);
            ctx.quadraticCurveTo(p.x + 4, p.y - 3 - flap, p.x, p.y);
            ctx.fill();
            break;
          }
        }
      }
      ctx.globalAlpha = 1;

      // damage numbers
      for (const d of this.dmgNumbers) {
        const t = d.life / d.maxLife;
        const alpha = 1 - t;
        const scale = d.crit ? 1 + 0.25 * t : 1;
        ctx.globalAlpha = alpha;
        ctx.font = (d.crit ? "900 " : "700 ") + Math.round(d.size * scale) + "px 'Segoe UI', system-ui, sans-serif";
        ctx.textAlign = "center";
        if (d.crit) {
          ctx.lineWidth = 4;
          ctx.strokeStyle = "rgba(0,0,0,.6)";
          ctx.strokeText(d.text, d.x, d.y);
          ctx.fillStyle = d.color;
          ctx.fillText(d.text, d.x, d.y);
        } else {
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(0,0,0,.55)";
          ctx.strokeText(d.text, d.x, d.y);
          ctx.fillStyle = d.color;
          ctx.fillText(d.text, d.x, d.y);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  SL.Particles = new ParticleSystem();

})(window.SL = window.SL || {});

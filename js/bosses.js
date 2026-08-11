/* ============================================================
 * Stickman: Warrior's Legacy
 * bosses.js — unique bosses with phases, telegraphs and patterns
 * ============================================================ */
(function (SL) {
  "use strict";
  const U = SL.U;

  /* ---------- shared attack helpers ---------- */
  function shockwaves(boss, game, count, spacing, speed, radius, dmg, color) {
    for (let i = 0; i < count; i++) {
      const x0 = boss.x - (i + 1) * spacing * boss.facing;
      game.shockwaves.push({
        x: x0, y: game.groundY - 6, vx: -boss.facing * speed, radius: radius || 30,
        life: 3, dmg: dmg || boss.damage, color: color || "#ffd27a", maxR: 46,
      });
    }
  }

  function groundTelegraphs(game, count, spread, delay) {
    const spots = [];
    const base = game.player.x - spread * count / 2;
    for (let i = 0; i < count; i++) {
      spots.push({ x: base + spread * i + U.rand(-10, 10), delay: delay });
    }
    game.groundTelegraphs.push({ spots, t: 0, color: "#ff5252", type: "spike", armed: false });
  }

  function spawnMinions(game, count, type) {
    for (let i = 0; i < count; i++) {
      game.spawnEnemy(type, game.scrollX + game.viewW + 60 + i * 60, false);
    }
  }

  /* ---------- boss definition ---------- */
  const BOSS_DEFS = {
    gorGul: {
      id: "gorGul", name: "GOR'GUL, ROOT WARDEN", zone: "forest",
      hp: 950, scale: 2.3, speed: 42, color: "#8a5a3a", dmg: 20,
      weapon: { kind: "hammer", color: "#5a3a2a", len: 30 },
      outfit: { horns: true, cloak: "#3a2414" },
      aura: "#c99a5a",
      intro: "A titan of root and stone rises from the forest!",
      attacks: ["slam", "pound", "roots"],
      attackDefs: {
        slam: { cd: 6, telegraph: 0.85, dur: 1.2, phase: 1, name: "Axe Slam",
          start(b, g) { b.audio("bossWarn"); },
          update(b, g, dt, t) {
            if (t >= 0.45 && !b.attack.data.slammed) {
              b.attack.data.slammed = true;
              g.screenShake(10, 0.4);
              g.audio.play("explosion");
              g.particles.shock(b.x, g.groundY, "#c99a5a", 44);
              g.particles.burst(b.x, g.groundY - 10, "#c99a5a", 20, 320, 5, 0.6, 500);
              g.damageArea(b.x, g.groundY - 20, 150, 1.6, 400, { bypassBlock: true });
              const waves = b.phase === 2 ? 3 : 2;
              shockwaves(b, g, waves, 120, 330, 34, b.damage, "#c99a5a");
            }
          } },
        pound: { cd: 8, telegraph: 0.7, dur: 0.9, phase: 1, name: "Root Pound",
          start(b, g) { b.audio("bossWarn"); },
          update(b, g, dt, t) {
            if (t >= 0.4 && !b.attack.data.pounded) {
              b.attack.data.pounded = true;
              g.screenShake(12, 0.5);
              g.audio.play("explosion");
              g.particles.shock(b.x, b.y - 60, "#c99a5a", 60);
              g.particles.burst(b.x, b.y - 60, "#c99a5a", 26, 380, 5, 0.6, 600);
              g.damageArea(b.x, b.y - 60, 150, 1.8, 450, { bypassBlock: true });
            }
          } },
        roots: { cd: 9, telegraph: 0.9, dur: 1.6, phase: 2, name: "Thorned Roots",
          start(b, g) { groundTelegraphs(g, 5, 46, 0.6); b.audio("bossWarn"); },
          update(b, g, dt, t) {} },
      },
    },
    wraithKing: {
      id: "wraithKing", name: "THE WRAITH KING", zone: "village",
      hp: 1150, scale: 2.0, speed: 60, color: "#7a5ac9", dmg: 18,
      weapon: { kind: "sword", color: "#c9a0ff", len: 34 },
      outfit: { hood: true, cloak: "#2a1450", crown: true },
      aura: "#b080ff",
      intro: "Death itself walks out of the shadows...",
      attacks: ["teleport", "bolts", "summon"],
      attackDefs: {
        teleport: { cd: 6.5, telegraph: 0.75, dur: 1.3, phase: 1, name: "Phase Slash",
          start(b, g) { b.audio("bossWarn"); },
          update(b, g, dt, t) {
            const data = b.attack.data;
            if (!data.teleported && t >= 0.5) {
              data.teleported = true;
              g.particles.smoke(b.x, b.y - 60, "#5a3a9a", 14);
              const px = g.player.x;
              b.x = U.clamp(px + U.rand(-70, 70), g.scrollX + 120, g.scrollX + g.viewW - 120);
              g.particles.smoke(b.x, b.y - 60, "#9a7ae0", 14);
              g.screenShake(4, 0.2);
            }
            if (t >= 0.75 && !data.slashed) {
              data.slashed = true;
              b.facing = g.player.x > b.x ? 1 : -1;
              g.damageCone(b.x, b.y - 60, b.facing, 150, 2.0, 400, { bypassBlock: true });
              g.particles.slash(b.x + b.facing * 60, b.y - 60, b.facing > 0 ? 0.2 : Math.PI - 0.2, "#c9a0ff", 2.2);
              g.audio.play("heavy");
            }
          } },
        bolts: { cd: 7, telegraph: 0.7, dur: 1.1, phase: 1, name: "Shadow Bolts",
          start(b, g) { b.audio("bossWarn"); },
          update(b, g, dt, t) {
            const data = b.attack.data;
            if (!data.fired && t >= 0.5) {
              data.fired = true;
              const n = b.phase === 2 ? 8 : 6;
              const ang = U.angleTo(b.x, b.y - 70, g.player.x, g.player.y - 40);
              for (let i = 0; i < n; i++) {
                const a = ang + (i - (n - 1) / 2) * 0.14;
                g.enemyProjectiles.push({
                  x: b.x, y: b.y - 70, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
                  dmg: b.damage, color: "#b080ff", type: "bolt", life: 6,
                });
              }
              g.audio.play("shoot");
            }
          } },
        summon: { cd: 10, telegraph: 1.1, dur: 1.4, phase: 2, name: "Raise Wraiths",
          start(b, g) { b.audio("bossWarn"); },
          update(b, g, dt, t) {
            if (t >= 1.0 && !b.attack.data.summoned) {
              b.attack.data.summoned = true;
              spawnMinions(g, 2, "grunt");
              g.particles.smoke(g.scrollX + g.viewW - 40, g.groundY - 40, "#7a5ac9", 16);
            }
          } },
      },
    },
    frostColossus: {
      id: "frostColossus", name: "FROST COLOSSUS", zone: "frozen",
      hp: 1400, scale: 2.5, speed: 34, color: "#7ad0e0", dmg: 20,
      weapon: { kind: "hammer", color: "#d0f0ff", len: 32 },
      outfit: { horns: true, cloak: "#2a5a6a" },
      aura: "#8fd8ff",
      intro: "The frozen mountain takes its first step!",
      attacks: ["breath", "icicles", "charge"],
      attackDefs: {
        breath: { cd: 7.5, telegraph: 0.9, dur: 1.6, phase: 1, name: "Glacial Breath",
          start(b, g) { b.audio("bossWarn"); },
          update(b, g, dt, t) {
            const data = b.attack.data;
            if (t >= 0.6) {
              if (!data.spawned) {
                data.spawned = true;
                data.tick = 0;
              }
              data.tick -= dt;
              if (data.tick <= 0) {
                data.tick = 0.16;
                const ang = U.angleTo(b.x, b.y - 80, g.player.x, g.player.y - 40) + U.rand(-0.08, 0.08);
                g.enemyProjectiles.push({
                  x: b.x, y: b.y - 80, vx: Math.cos(ang) * 360, vy: Math.sin(ang) * 360,
                  dmg: b.damage, color: "#bdf0ff", type: "ice", life: 4,
                });
                g.audio.play("shoot");
              }
            }
          } },
        icicles: { cd: 8, telegraph: 0.8, dur: 2.0, phase: 1, name: "Icicle Rain",
          start(b, g) {
            groundTelegraphs(g, 4, 40, 0.7);
            g.groundTelegraphs[g.groundTelegraphs.length - 1].type = "falling";
            b.audio("bossWarn");
          },
          update(b, g, dt, t) {} },
        charge: { cd: 9, telegraph: 0.8, dur: 1.6, phase: 2, name: "Glacial Charge",
          start(b, g) { b.audio("bossWarn"); b.attack.data.charging = false; },
          update(b, g, dt, t) {
            const data = b.attack.data;
            if (t >= 0.5 && !data.charging) {
              data.charging = true;
              b.chargeDir = g.player.x > b.x ? 1 : -1;
              b.chargeSpeed = 900;
              g.screenShake(4, 0.3);
            }
            if (data.charging) {
              b.x += b.chargeDir * b.chargeSpeed * dt;
              b.chargeSpeed *= 0.98;
              g.particles.trail(b.x - b.chargeDir * 30, b.y - 60, "#bdf0ff", 8);
            }
          } },
      },
    },
    magmaTyrant: {
      id: "magmaTyrant", name: "MAGMA TYRANT", zone: "volcano",
      hp: 1650, scale: 2.3, speed: 46, color: "#ff8a3a", dmg: 22,
      weapon: { kind: "hammer", color: "#ffb87a", len: 34 },
      outfit: { horns: true, cloak: "#7a2400" },
      aura: "#ff8a3a",
      intro: "The volcano itself has awakened!",
      attacks: ["fireballs", "meteor", "eruption"],
      attackDefs: {
        fireballs: { cd: 6.5, telegraph: 0.7, dur: 1.2, phase: 1, name: "Fireball Volley",
          start(b, g) { b.audio("bossWarn"); },
          update(b, g, dt, t) {
            const data = b.attack.data;
            if (!data.fired && t >= 0.5) {
              data.fired = true;
              const n = b.phase === 2 ? 7 : 5;
              const ang = U.angleTo(b.x, b.y - 80, g.player.x, g.player.y - 40);
              for (let i = 0; i < n; i++) {
                const a = ang + (i - (n - 1) / 2) * 0.16;
                g.enemyProjectiles.push({
                  x: b.x, y: b.y - 80, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280,
                  dmg: b.damage, color: "#ff8a3a", type: "fire", life: 6, radius: 12,
                });
              }
              g.audio.play("fire");
            }
          } },
        meteor: { cd: 9, telegraph: 0.9, dur: 1.8, phase: 1, name: "Meteor Slam",
          start(b, g) {
            b.audio("bossWarn");
            b.attack.data.fallen = false;
          },
          update(b, g, dt, t) {
            const data = b.attack.data;
            if (t >= 0.5 && !data.fallen) {
              data.fallen = true;
              b.attack.data.impactX = b.x;
              g.screenShake(14, 0.6);
              g.audio.play("explosion");
              g.particles.shock(b.x, g.groundY, "#ff8a3a", 60);
              g.particles.burst(b.x, g.groundY - 10, "#ff8a3a", 28, 420, 6, 0.7, 600);
              g.damageArea(b.x, g.groundY - 20, 170, 2.0, 480, { bypassBlock: true });
              // lava pools
              for (let i = -1; i <= 1; i++) {
                g.lavaPools.push({
                  x: b.x + i * 90, y: g.groundY - 8, w: 70, t: 0, life: 4, dmg: b.damage * 0.4,
                });
              }
            }
          } },
        eruption: { cd: 10, telegraph: 0.9, dur: 1.6, phase: 2, name: "Eruption",
          start(b, g) {
            groundTelegraphs(g, 3, 55, 0.6);
            g.groundTelegraphs[g.groundTelegraphs.length - 1].color = "#ff8a3a";
            b.audio("bossWarn");
          },
          update(b, g, dt, t) {} },
      },
    },
  };

  class Boss {
    constructor(game, def, worldIndex) {
      this.game = game;
      this.def = def;
      this.name = def.name;
      this.scale = def.scale;
      this.hpMul = 1 + worldIndex * 0.65;
      this.maxHp = Math.round(def.hp * this.hpMul);
      this.hp = this.maxHp;
      this.damage = Math.round(def.dmg * (1 + worldIndex * 0.3));
      this.w = 60; this.h = 140;
      this.x = game.scrollX + game.viewW + 140;
      this.y = game.groundY;
      this.vx = 0;
      this.facing = -1;
      this.state = "intro";
      this.stateT = 0;
      this.phase = 1;
      this.attackCd = 3;
      this.attack = null;
      this.hurtFlash = 0;
      this.contactCd = 0;
      this.dots = [];
      this.dead = false;
      this.faded = 0;
      this.id = U.uid();
      this.staggerT = 0;
    }

    audio(n) { this.game.audio.play(n); }

    get attacksPool() {
      const defs = this.def.attackDefs;
      return this.def.attacks
        .map((a) => ({ a, d: defs[a] }))
        .filter((x) => x.d.phase <= this.phase);
    }

    update(dt, game) {
      this.stateT += dt;
      if (this.hurtFlash > 0) this.hurtFlash -= dt;
      if (this.contactCd > 0) this.contactCd -= dt;
      if (this.staggerT > 0) this.staggerT -= dt;
      this.facing = game.player.x > this.x ? 1 : -1;

      // dots
      for (let i = this.dots.length - 1; i >= 0; i--) {
        const d = this.dots[i];
        d.t -= dt; d.tick -= dt;
        if (d.tick <= 0) { d.tick = 0.5; game.dealDamage(this, d.dps * 0.5, { silent: true, dot: true, element: d.element }); }
        if (d.t <= 0) this.dots.splice(i, 1);
      }

      // phase check
      if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
        this.phase = 2;
        game.toast(this.name + " enrages!", "boss");
        game.audio.play("bossWarn");
        game.particles.shock(this.x, this.y - 80, "#ff5252", 70);
        game.screenShake(10, 0.4);
      }

      switch (this.state) {
        case "intro": {
          this.x -= 150 * dt;
          if (this.x <= game.scrollX + game.viewW * 0.72) {
            this.state = "idle";
            this.stateT = 0;
            game.toast(this.def.intro, "boss");
          }
          break;
        }
        case "idle": {
          // slowly approach player but keep distance
          const dx = game.player.x - this.x;
          const dist = Math.abs(dx);
          if (dist > 260) {
            this.vx = Math.sign(dx) * this.def.speed * (this.phase === 2 ? 1.3 : 1);
            this.x += this.vx * dt;
          } else if (dist < 120) {
            this.vx = -Math.sign(dx) * this.def.speed * 0.5;
            this.x += this.vx * dt;
          }
          this.attackCd -= dt;
          if (this.attackCd <= 0) {
            const pool = this.attacksPool;
            let pick = U.choose(pool);
            // avoid repeating
            if (this.lastAttack && pool.length > 1) {
              while (pick.a === this.lastAttack) pick = U.choose(pool);
            }
            this.lastAttack = pick.a;
            const d = pick.d;
            this.attack = { id: pick.a, t: 0, dur: d.dur, def: d, data: {} };
            this.state = "telegraph";
            this.stateT = 0;
            d.start(this, game);
          }
          break;
        }
        case "telegraph": {
          this.vx = 0;
          if (this.stateT >= this.attack.def.telegraph) {
            this.state = "attack";
            this.stateT = 0;
          }
          break;
        }
        case "attack": {
          const atk = this.attack;
          atk.t += dt;
          if (atk.def.update) atk.def.update(this, game, dt, atk.t);
          if (atk.t >= atk.dur) {
            this.state = "idle";
            this.stateT = 0;
            this.attackCd = atk.def.cd * (this.phase === 2 ? 0.72 : 1) * U.rand(0.9, 1.1);
            this.attack = null;
          }
          break;
        }
      }

      // keep boss on screen
      this.x = U.clamp(this.x, game.scrollX + 60, game.scrollX + game.viewW + 60);

      // contact damage
      if (this.contactCd <= 0) {
        const dx = Math.abs(game.player.x - this.x);
        const dy = Math.abs((game.player.y - 40) - (this.y - 80));
        if (dx < this.w && dy < this.h) {
          this.contactCd = 1.2;
          game.player.takeDamage(this.damage, { source: this });
        }
      }
    }

    applyDamage(amount, opts) {
      opts = opts || {};
      const g = this.game;
      this.hp -= amount;
      this.hurtFlash = 0.12;
      if (opts.knock) { this.x += opts.knock.x * 0.1; }
      if (opts.stun) this.staggerT = Math.max(this.staggerT, opts.stun);
      if (opts.burn) this.addDot("fire", opts.burn.dps, opts.burn.dur);
      if (opts.poison) this.addDot("poison", opts.poison.dps, opts.poison.dur);
      if (opts.slow) { /* boss resist slow */ }
      if (this.hp <= 0) {
        this.dead = true;
        g.onBossKilled(this);
      }
      return amount;
    }

    addDot(element, dps, duration) {
      const e = this.dots.find((d) => d.element === element);
      if (e) { e.dps = Math.max(e.dps, dps); e.t = Math.min(e.t + 1, duration + 2); }
      else this.dots.push({ element, dps, duration, t: duration, tick: 0 });
    }

    draw(ctx, time) {
      const d = this.def;
      // aura
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = d.aura;
      ctx.beginPath(); ctx.arc(this.x, this.y - 70, 80 + Math.sin(time * 4) * 8, 0, U.TAU); ctx.fill();
      ctx.globalAlpha = 1;

      // telegraph
      if (this.state === "telegraph") {
        const pul = 0.55 + Math.sin(time * 20) * 0.4;
        ctx.globalAlpha = pul;
        ctx.fillStyle = "#ff3b3b";
        ctx.beginPath();
        const ex = this.x, ey = this.y - 150;
        ctx.moveTo(ex, ey - 16);
        ctx.lineTo(ex - 10, ey + 6);
        ctx.lineTo(ex + 10, ey + 6);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        // name of attack
        ctx.font = "700 14px 'Segoe UI', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#ff8a8a";
        ctx.fillText(this.attack ? this.attack.def.name : "", ex, ey - 26);
      }

      const alpha = this.hurtFlash > 0 && Math.floor(time * 24) % 2 === 0 ? 0.5 : 1;
      const pose = this.state === "attack" ? "attack" : (this.state === "telegraph" ? "cast" : "idle");
      const t = this.state === "attack" ? Math.min(1, this.stateT / (this.attack ? this.attack.dur : 1)) : 0;
      SL.Entities.drawStickman(ctx, {
        x: this.x, y: this.y, scale: this.scale, facing: this.facing, t: time,
        speed: 0.3, pose, poseT: t, color: d.color, weapon: d.weapon,
        outfit: d.outfit, alpha,
        shadow: false,
      });
      ctx.globalAlpha = 1;

      // name tag
      ctx.font = "900 13px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ff6b9d";
      ctx.fillText(this.name, this.x, this.y - 150 - this.scale * 6);
    }
  }

  SL.Bosses = { Boss, BOSS_DEFS };

})(window.SL = window.SL || {});

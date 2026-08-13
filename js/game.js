/* ============================================================
 * Stickman: Warrior's Legacy
 * game.js — core game loop, world, combat resolution, combo &
 *           score, spawning, bosses, pickups, abilities.
 * ============================================================ */
(function (SL) {
  "use strict";
  const U = SL.U;

  class Game {
    constructor() {
      this.canvas = document.getElementById("game-canvas");
      this.ctx = this.canvas.getContext("2d");
      this.input = new SL.Input();
      this.levelGen = null;
      this.particles = SL.Particles;
      this.audio = SL.Audio;
      this.state = "boot";

      // view
      this.dpr = 1;
      this.scale = 1;
      this.viewW = 1280;
      this.viewH = 720;

      // world
      this.scrollX = 0;
      this.groundY = 0;
      this.gravity = 2400;
      this.jumpVel = 800;
      this.dashSpeed = 900;
      this.dashDuration = 0.22;

      this.run = null;
      this.player = null;
      this.warrior = null;
      this.enemies = [];
      this.director = new SL.Aidirector.Aidirector(this);
      this.worldGen = new SL.WorldGen.WorldGen(this);
      this.projectiles = [];
      this.enemyProjectiles = [];
      this.pickups = [];
      this.afterimages = [];
      this.shockwaves = [];
      this.tempHazards = [];
      this.groundTelegraphs = [];
      this.lavaPools = [];
      this.boss = null;
      this.ultFx = null;
      this.activePlatforms = [];
      this.dynamicHazards = [];
      this.enteredSegs = new Set();
      this.darkness = null;

      // run stats
      this.distance = 0;
      this.score = 0;
      this.combo = 0;
      this.comboTime = 0;
      this.comboTier = 0;
      this.scoreMul = 1;
      this.rampage = false;
      this.kills = 0;
      this.elitesKilled = 0;
      this.bossKills = 0;
      this.maxCombo = 0;
      this.timeSurvived = 0;
      this.coinsEarned = 0;
      this.gemsEarned = 0;
      this.xpEarned = 0;
      this.upgradesTaken = 0;

      this.scrollBlend = 0;
      this.backBlend = 0;
      this.spawnT = 1;
      this.zoneIndex = 0;
      this.lastBossZone = -1;
      this.bossIntroDone = false;
      this.seed = (Math.random() * 1e9) | 0;

      this.shake = { t: 0, mag: 0 };
      this.flashT = 0;
      this.flashColor = "#ffffff";
      this.deathTimer = 0;
      this.hitstop = 0;

      this.last = 0;
      this.elapsed = 0;
    }

    init() {
      this.levelGen = new SL.Levels.LevelGen(this);
      this._resize();
      window.addEventListener("resize", () => this._resize());
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && this.state === "playing") this.pause();
      });
      document.addEventListener("keydown", (e) => {
        if ((e.code === "KeyP" || e.code === "Escape") && this.state === "playing") { e.preventDefault(); this.pause(); }
        else if ((e.code === "KeyP" || e.code === "Escape") && this.state === "paused") { e.preventDefault(); this.resume(); }
      });
      this._applySettings();
      this.state = "menu";
      this.loop(performance.now());
    }

    _applySettings() {
      const s = SL.Save.get().settings;
      SL.Audio.setVolumes(s.soundOn ? s.sfxVol : 0, s.musicOn ? s.musicVol : 0, s.musicOn);
      SL.Particles.density = s.reduceEffects ? 0.5 : 1;
    }

    _resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
      this.scale = Math.min(h / 720, w / 640);
      this.viewW = w / this.scale;
      this.viewH = h / this.scale;
      this.groundY = this.viewH - 120;
    }

    /* ================= run lifecycle ================= */
    startRun() {
      SL.UI.hideDeath();
      SL.UI.hidePause();
      SL.UI.hideLevelUp();
      SL.UI.hideAllScreens();
      document.getElementById("hud").classList.remove("hidden");
      const tc = document.getElementById("touch-controls");
      if (this.input.touchMode) {
        tc.classList.remove("hidden");
        tc.classList.add("touch-mode");
      } else {
        tc.classList.add("hidden");
        tc.classList.remove("touch-mode");
      }

      const save = SL.Save.get();
      this.warrior = SL.Progression.WARRIOR_BY_ID[save.selectedWarrior] || SL.Progression.WARRIORS[0];
      this.run = SL.Progression.newRunStats();
      // apply class base
      const base = this.warrior.base;
      this.run.dmgMul = base.dmg;
      this.run.critChance = base.critChance;
      this.run.critMul = base.critMul;
      this.run.attackSpeedMul = base.attackSpeed;
      this.run.maxHpMul = 1;
      this.run.speedMul = base.speed / 265;
      this.run.jumpMul = 1;
      this.run.armor = base.armor;
      SL.Progression.applyPermAndRelics(this.run, this.warrior);

      // weekly challenge modifiers
      this.weeklyMods = save.weeklyOn ? SL.Challenges.weeklyModifiers() : [];
      SL.Challenges.applyWeeklyModifiers(this.run, this.weeklyMods);

      this.seed = (Math.random() * 1e9) | 0;
      this.levelGen.chunks = {};
      this.levelGen.seed = this.seed;

      // reset world
      this.enemies = [];
      this.director.reset();
      this.worldGen.setSeed(this.seed);
      this.projectiles = [];
      this.enemyProjectiles = [];
      this.pickups = [];
      this.afterimages = [];
      this.shockwaves = [];
      this.tempHazards = [];
      this.groundTelegraphs = [];
      this.lavaPools = [];
      this.boss = null;
      this.ultFx = null;
      this.activePlatforms = [];
      this.dynamicHazards = [];
      this.enteredSegs = new Set();
      this.darkness = null;

      this.distance = 0;
      this.score = 0;
      this.combo = 0;
      this.comboTier = 0;
      this.scoreMul = 1;
      this.rampage = false;
      this.kills = 0;
      this.elitesKilled = 0;
      this.bossKills = 0;
      this.maxCombo = 0;
      this.timeSurvived = 0;
      this.coinsEarned = 0;
      this.gemsEarned = 0;
      this.xpEarned = 0;
      this.upgradesTaken = 0;
      this.lastBossZone = -1;
      this.bossIntroDone = false;
      this.scrollBlend = 0;
      this.backBlend = 0;
      this.spawnT = 0.6;
      this.zoneIndex = 0;
      this.deathTimer = 0;
      this._ended = false;
      this.clones = [];

      this.player = new SL.Entities.Player(this, this.warrior);
      this.player.resetPosition(this.groundY, this.scrollX + this.viewW * 0.32);
      this.scrollX = Math.max(0, this.player.x - this.viewW * 0.32);

      this.state = "playing";
      SL.Audio.resume();
      SL.Audio.startMusic();
      this.toastZone();
      SL.UI.toast("HOLD \u2192 TO ADVANCE", "zone");
    }

    pause() {
      if (this.state !== "playing") return;
      this.state = "paused";
      SL.UI.showPause();
      SL.Audio.play("click");
      SL.Audio.pauseMusic();
    }
    resume() {
      if (this.state !== "paused") return;
      this.state = "playing";
      SL.UI.hidePause();
      SL.Audio.resumeMusic();
      this.last = performance.now();
    }

    toMainMenu() {
      SL.UI.hideDeath();
      SL.UI.hidePause();
      SL.UI.hideLevelUp();
      document.getElementById("hud").classList.add("hidden");
      document.getElementById("touch-controls").classList.add("hidden");
      this.state = "menu";
      this.player = null;
      SL.Audio.stopMusic();
      SL.UI.show("main");
      SL.UI.refreshResourceBar();
    }

    endRun(quit) {
      if (this._ended) return;
      this._ended = true;
      const save = SL.Save.get();
      // grant currency & meta-xp
      const coins = Math.floor(this.coinsEarned);
      const gems = Math.floor(this.gemsEarned);
      const xp = Math.floor(this.xpEarned);
      SL.Save.addCoins(coins);
      SL.Save.addGems(gems);
      SL.Save.addXp(xp);

      if (!quit) {
        this._updateChallenges();
        SL.Audio.stopMusic();
        // submit leaderboard
        const entry = {
          name: save.playerName, score: Math.floor(this.score),
          cls: this.warrior.id, board: null,
          distance: Math.floor(this.distance), kills: this.kills,
          bosses: this.bossKills, maxCombo: this.maxCombo,
          time: this.timeSurvived,
        };
        SL.Leaderboard.submit(entry).then(async () => {
          const pb = save.personalBest;
          const res = await SL.Leaderboard.rankOf("global", Math.floor(this.score), null);
          this.finalRank = res;
          this.isNewBest = this.score >= pb.score && this.score > 0;
          this.rewards = { coins, gems, xp };
          SL.UI.showDeath(this);
        });
      } else {
        SL.UI.refreshResourceBar();
        this.toMainMenu();
      }
    }

    _updateChallenges() {
      const save = SL.Save.get();
      const prog = save.challengeProgress;
      const daily = SL.Challenges.dailyChallenges();
      const weekly = SL.Challenges.weeklyChallenges();
      const all = daily.concat(weekly);
      const update = (id, value) => {
        const p = prog[id] || (prog[id] = { value: 0, claimed: false });
        p.value = Math.max(p.value, value);
      };
      update("kill500", this.kills);
      update("kill1000", this.kills);
      update("dist5000", Math.floor(this.distance));
      update("combo50", this.maxCombo);
      update("boss3", this.bossKills);
      update("lvl15", this.player ? this.player.level : 1);
      update("elite10", this.elitesKilled);
      update("survive300", Math.floor(this.timeSurvived));
      update("gruntClass", 1);
      update("noUpgrade", this.upgradesTaken === 0 ? this.distance : 0);
      for (const c of all) {
        if (SL.Challenges.claimable(c, save)) {
          // nothing automatic; user claims in UI
        }
      }
      SL.Save.save();
    }

    /* ================= level / upgrades ================= */
    onLevelUp() {
      if (this.state !== "playing") return;
      const picks = SL.Upgrades.pickThree(this.run);
      if (!picks.length) { this.player.addXp(99999); return; }
      this.state = "levelup";
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.1);
      SL.Audio.play("levelup");
      SL.Particles.ring(this.player.x, this.player.y - 40, "#ffd27a", 40, 0.6);
      SL.Particles.burst(this.player.x, this.player.y - 40, "#ffd27a", 16, 240, 3, 0.6, 0);
      SL.UI.showLevelUp(picks);
    }

    afterLevelUp() {
      this.upgradesTaken++;
      this.state = "playing";
      this.last = performance.now();
    }

    /* ================= main loop ================= */
    loop(now) {
      requestAnimationFrame((t) => this.loop(t));
      const raw = (now - this.last) / 1000;
      this.last = now;
      if (raw > 0.1) return; // tab was likely backgrounded
      const dt = U.clamp(raw, 0, 0.033);
      this.elapsed += dt;

      if (this.state === "playing") this.update(dt);
      else if (this.state === "dead") {
        this.deathTimer -= dt;
        SL.Particles.update(dt);
        this._updateShake(dt);
        if (this.deathTimer <= 0 && !this._ended) this.endRun(false);
      } else {
        // levelup / paused / menu: update particles only for pretty frozen scene
        SL.Particles.update(dt * 0.5);
        this._updateShake(dt);
      }
      this.render(dt);
      if (this.state === "playing") SL.UI.updateHUD(this);
    }

    update(dt) {
      const p = this.player;
      if (!p) return;
      if (this.hitstop > 0) {
        this.hitstop -= dt;
        SL.Particles.update(dt * 0.4);
        this._updateShake(dt);
        return;
      }
      this.timeSurvived += dt;

      /* world scroll — only moves while the player walks, both directions.
       * Forward ramps world speed up, backward ramps it down (never below 0). */
      const axis = this.input.getAxisX();
      const bossSlow = this.boss ? 0.4 : 1;
      const scrollBase = (210 + Math.min(110, this.distance * 0.01)) * bossSlow;
      const wantScroll = axis > 0.15;
      this.scrollBlend += ((wantScroll ? 1 : 0) - this.scrollBlend) * Math.min(1, dt * (wantScroll ? 3 : 14));
      const wantBack = axis < -0.15;
      this.backBlend += ((wantBack ? 1 : 0) - this.backBlend) * Math.min(1, dt * (wantBack ? 3 : 14));
      this.scrollX += (this.scrollBlend - this.backBlend) * scrollBase * dt;
      if (this.scrollX < 0) this.scrollX = 0;
      this.distance = this.scrollX / 60;

      /* player */
      this._updatePlatforms(dt);
      p.update(dt);

      /* clamp player within view */
      p.x = U.clamp(p.x, this.scrollX + 70, this.scrollX + this.viewW - 110);

      /* locked gates stop progress */
      this._gateClamp();

      /* zone / boss logic */
      this._zoneLogic();

      /* worldgen segments (encounters, gates, events, features) */
      this._updateWorldSegments(dt);

      /* spawning */
      this._spawnLogic(dt);

      /* combat director (coordination, roles, events) */
      this.director.update(dt);

      /* dash hit damage */
      if (p.dashTimer > 0) {
        for (const e of this.enemies) {
          if (e.dead || p.dashHit.has(e.id)) continue;
          if (U.dist(p.x, p.y - 30, e.x, e.y - 30) < 40 + e.w) {
            p.dashHit.add(e.id);
            this.dealDamage(e, this._meleeDmg(1.2), {
              knock: { x: p.dashDir * 320, y: -120 }, fromPlayer: true,
            });
            if (this.run.synFlamingDash) {
              this.dealDamage(e, this._meleeDmg(0.8), { fromPlayer: true, effects: true, forceBurn: true });
              this.puff(e.x, e.y - 30, "#ff7b2e", 6);
            }
          }
        }
      }

      /* melee hit resolution — apply active player attack hitboxes */
      if (p.attack && !p.dead) {
        const hbs = p.activeHitboxes();
        for (const hb of hbs) {
          let hitCount = 0;
          const pierce = hb.pierce || 1;
          for (const e of this.enemies) {
            if (e.dead) continue;
            if (p.attack.hits.has(e.id)) continue;
            if (!this._inMeleeArc(p, hb, e)) continue;
            p.attack.hits.add(e.id);
            const dmg = this._meleeDmg(hb.dmgMul);
            this.dealDamage(e, dmg, {
              fromPlayer: true, effects: true,
              knock: { x: p.facing * hb.knock, y: (hb.type === "air" || hb.type === "airHeavy") ? 220 : -50 },
            });
            this.puff(e.x, e.y - 30, "#ffe1ea", 4);
            // impact feedback: hitstop, shake, sparks, weapon recoil
            const heavyHit = hb.type === "heavy" || hb.type === "airHeavy";
            const isBoss = e.isBoss || (e.hpMax && e.hpMax > 3000);
            const cam = window.SL.Anim ? window.SL.Anim.CONFIG.camera : null;
            if (cam) {
              const shakeCfg = isBoss ? cam.boss : (heavyHit ? cam.heavy : cam.light);
              this.screenShake(shakeCfg.mag, shakeCfg.dur);
            }
            const hsCfg = window.SL.Anim ? window.SL.Anim.CONFIG.hitstop : null;
            if (hsCfg) {
              this.hitstop = Math.min(hsCfg.max, isBoss ? hsCfg.boss : (heavyHit ? hsCfg.heavy : hsCfg.light));
            }
            if (p.animator) {
              p.animator.impact("hit", { heavy: heavyHit });
            }
            if (heavyHit) {
              SL.Particles.burst(e.x, e.y - 30, "#ffd27a", 10, 220, 3, 0.4, 300);
              SL.Particles.shock(e.x, e.y - 30, "#ffd27a", heavyHit ? 18 : 10);
            }
            hitCount++;
            if (hitCount >= pierce) break;
          }
        }
      }

      /* shadow clones */
      this._updateClones(dt);

      /* enemies */
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (e.dead) { this.enemies.splice(i, 1); continue; }
        e.update(dt, this);
        // enemy contact damage
        e.contactCd = e.contactCd || 0;
        e.contactCd -= dt;
        if (e.contactCd <= 0 && !p.dead) {
          const dx = Math.abs(p.x - e.x);
          const dy = Math.abs((p.y - 30) - (e.y - 30 * e.scale));
          if (dx < e.w + 14 && dy < e.h * 0.8) {
            e.contactCd = 1.1;
            p.takeDamage(e.damage, { source: e });
            if (this.run.thorns > 0) this.dealDamage(e, Math.round(e.damage * this.run.thorns), { silent: true, fromThorns: true });
            this._onComboBroken();
          }
        }
        // cull behind
        if (e.x < this.scrollX - 160) { this.enemies.splice(i, 1); continue; }
      }

      /* boss */
      if (this.boss) {
        this.boss.update(dt, this);
        if (this.boss.dead) {
          this.boss = null;
          this.bossIntroDone = false;
          this.toast("World Cleared! The path forward opens...", "zone");
        }
      }

      /* player projectiles */
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const pr = this.projectiles[i];
        pr.life -= dt;
        if (pr.homing && this.enemies.length) {
          let target = null, bd = 400;
          for (const e of this.enemies) {
            const d = U.dist(pr.x, pr.y, e.x, e.y - 30);
            if (d < bd) { bd = d; target = e; }
          }
          if (target) {
            const ang = U.angleTo(pr.x, pr.y, target.x, target.y - 30);
            const s = 5 + this.run.homingLevel * 3;
            pr.vx = U.lerp(pr.vx, Math.cos(ang) * pr.speed, s * dt);
            pr.vy = U.lerp(pr.vy, Math.sin(ang) * pr.speed, s * dt);
          }
        }
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        if (pr.fall) pr.y += pr.fall * dt;
        let hitAny = false;
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (pr.hitIds && pr.hitIds.has(e.id)) continue;
          if (U.dist(pr.x, pr.y, e.x, e.y - 30 * e.scale) < 26 + e.w * 0.5) {
            hitAny = true;
            this.dealDamage(e, pr.dmg, { fromPlayer: true, effects: true, element: pr.element });
            if (pr.pierce && pr.pierce > 1) {
              (pr.hitIds = pr.hitIds || new Set()).add(e.id);
              pr.pierce--;
            } else {
              break;
            }
          }
        }
        if (hitAny && !(pr.pierce && pr.pierce > 0)) {
          if (pr.type === "fire") this.puff(pr.x, pr.y, "#ff7b2e", 8);
          else this.puff(pr.x, pr.y, pr.color, 5);
          this.projectiles.splice(i, 1);
          continue;
        }
        if (pr.life <= 0 || pr.x < this.scrollX - 80 || pr.x > this.scrollX + this.viewW + 160 || pr.y > this.viewH + 80) {
          this.projectiles.splice(i, 1);
        }
      }

      /* enemy projectiles */
      for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
        const pr = this.enemyProjectiles[i];
        pr.life -= dt;
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        if (!p.dead && p.iFrames <= 0 && U.dist(pr.x, pr.y, p.x, p.y - 34) < 20) {
          p.takeDamage(pr.dmg, { source: null });
          this.puff(pr.x, pr.y, pr.color, 6);
          this.enemyProjectiles.splice(i, 1);
          continue;
        }
        if (pr.life <= 0 || pr.y > this.viewH + 40 || pr.x < this.scrollX - 100 || pr.x > this.scrollX + this.viewW + 100) {
          this.enemyProjectiles.splice(i, 1);
        }
      }

      /* shockwaves */
      for (let i = this.shockwaves.length - 1; i >= 0; i--) {
        const sw = this.shockwaves[i];
        sw.life -= dt;
        sw.x += sw.vx * dt;
        sw.radius = Math.min(sw.maxR, sw.radius + dt * 60);
        if (!p.dead && p.iFrames <= 0 && U.dist(sw.x, sw.y, p.x, p.y - 20) < sw.radius + 16) {
          p.takeDamage(sw.dmg, { source: null });
          this.shockwaves.splice(i, 1);
          continue;
        }
        if (sw.life <= 0) this.shockwaves.splice(i, 1);
      }

      /* ground telegraphs -> hazards */
      for (let i = this.groundTelegraphs.length - 1; i >= 0; i--) {
        const gt = this.groundTelegraphs[i];
        gt.t += dt;
        for (const spot of gt.spots) {
          if (!spot.armed && gt.t >= spot.delay) {
            spot.armed = true;
            if (gt.type === "falling") {
              this.enemyProjectiles.push({
                x: spot.x, y: -20, vx: 0, vy: 0, fall: 650,
                dmg: 14, color: "#bdf0ff", type: "ice", life: 4, hitIds: new Set(),
              });
            } else {
              this.tempHazards.push({ x: spot.x - 12, y: this.groundY - 22, w: 24, h: 22, dmg: 13, t: 0.85, life: 0.85, color: gt.color || "#ff5252", type: "spike" });
            }
          }
        }
        if (gt.t > 2.2) this.groundTelegraphs.splice(i, 1);
      }

      /* temp hazards */
      for (let i = this.tempHazards.length - 1; i >= 0; i--) {
        const hz = this.tempHazards[i];
        hz.t -= dt;
        if (!p.dead && p.iFrames <= 0 && U.rectsOverlap({ x: hz.x, y: hz.y, w: hz.w, h: hz.h }, { x: p.x - 10, y: p.y - 52, w: 20, h: 52 })) {
          p.takeDamage(hz.dmg, { source: null });
          p.iFrames = 0.5;
          this._onComboBroken();
          hz.t = 0;
        }
        if (hz.t <= 0) this.tempHazards.splice(i, 1);
      }

      /* lava pools */
      for (let i = this.lavaPools.length - 1; i >= 0; i--) {
        const lp = this.lavaPools[i];
        lp.t += dt;
        if (!p.dead && p.iFrames <= 0 && U.rectsOverlap({ x: lp.x - lp.w / 2, y: lp.y, w: lp.w, h: 12 }, { x: p.x - 10, y: p.y - 52, w: 20, h: 52 })) {
          p.takeDamage(lp.dmg, { source: null });
          p.iFrames = 0.4;
          this._onComboBroken();
        }
        if (lp.t >= lp.life) this.lavaPools.splice(i, 1);
      }

      /* static hazards from world */
      this._checkWorldHazards();

      /* pickups */
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const pk = this.pickups[i];
        pk.t += dt;
        const d = U.dist(pk.x, pk.y, p.x, p.y - 30);
        if (d < 130) {
          const speed = 900 * dt;
          const ang = U.angleTo(pk.x, pk.y, p.x, p.y - 30);
          pk.x += Math.cos(ang) * speed;
          pk.y += Math.sin(ang) * speed;
        }
        if (d < 24) {
          this._collectPickup(pk);
          this.pickups.splice(i, 1);
          continue;
        }
        if (pk.x < this.scrollX - 100) this.pickups.splice(i, 1);
      }

      /* ultimate effects */
      this._updateUltFx(dt);

      /* combo / score */
      this._updateCombo(dt);
      this.score += dt * (8 + this.distance * 0.05) * this.scoreMul;

      /* particles & shake */
      SL.Particles.update(dt);
      this._updateShake(dt);
      this.levelGen.updateAmbient(dt, this.elapsed);

      /* afterimages */
      for (let i = this.afterimages.length - 1; i >= 0; i--) {
        this.afterimages[i].t -= dt;
        if (this.afterimages[i].t <= 0) this.afterimages.splice(i, 1);
      }

      /* death check */
      if (p.dead && this.state === "playing") {
        this.state = "dead";
        this.deathTimer = 1.4;
        this._ended = false;
      }

      this.input.consumeFrame();
    }

    puff(x, y, color, n) {
      SL.Particles.burst(x, y, color, n, 160, 3, 0.5, 300);
    }

    _zoneLogic() {
      const newZone = Math.floor(this.distance / SL.Levels.ZONE_LENGTH);
      if (newZone > this.zoneIndex) {
        this.zoneIndex = newZone;
        this.toastZone();
      }
      // boss spawn at zone boundary crossing
      const bossZone = Math.floor(this.distance / SL.Levels.ZONE_LENGTH);
      if (bossZone > this.lastBossZone && this.state === "playing" && !this.boss) {
        this.lastBossZone = bossZone;
        if (bossZone >= 1) this._spawnBoss(bossZone - 1);
      }
    }

    toastZone() {
      const zone = this.levelGen.zoneForDistance(this.distance);
      SL.UI.toast(zone.name, "zone");
      SL.Audio.play("bossWarn");
    }

    _spawnBoss(zoneIdx) {
      const zone = SL.Levels.ZONES[zoneIdx % SL.Levels.ZONES.length];
      const def = SL.Bosses.BOSS_DEFS[zone.bossId];
      if (!def) return;
      const worldIdx = Math.floor(zoneIdx / SL.Levels.ZONES.length);
      this.boss = new SL.Bosses.Boss(this, def, worldIdx);
      if (this.run.bossHpMul) this.boss.maxHp = Math.round(this.boss.maxHp * this.run.bossHpMul);
      this.boss.hp = this.boss.maxHp;
      SL.Audio.play("bossWarn");
      this.screenShake(6, 0.5);
    }

    /* ================= worldgen segments ================= */
    _updateWorldSegments(dt) {
      const p = this.player;
      if (!p || p.dead) return;
      const x0 = this.scrollX - 40, x1 = this.scrollX + this.viewW + 40;
      const segs = this.worldGen.segmentsInRange(x0, x1);
      let activeDark = null;

      for (const seg of segs) {
        /* entering a segment: spawn its encounter, fire events */
        if (!this.enteredSegs.has(seg.idx)) {
          this.enteredSegs.add(seg.idx);
          if (seg.encounter && !this.boss) this.director.applyEncounterToSegment(seg);
          if (seg.event) this.director.triggerEvent(seg.event, seg.x0 + (seg.x1 - seg.x0) / 2);
          if (seg.rewards) seg._rewardReady = true;
          /* junction: offer a branching path choice */
          if (seg.junction && !this.boss && !seg.junction.offered) {
            seg.junction.offered = true;
            this._offerPathChoice(seg);
          }
        }

        /* locked gates open once their guards are dead */
        if (seg.gate && !seg.gate.bossGate && seg.gate.locked && !seg.gate.open) {
          const cleared = !(seg.spawned && seg.spawned.some((id) =>
            this.enemies.some((e) => e.id === id && !e.dead)));
          if (cleared) {
            seg.gate.open = true;
            this.toast("The gate grinds open!", "zone");
            SL.Audio.play("bossWarn");
          }
        }

        /* rockfall feature */
        if (seg.feature && seg.feature.type === "rockfall") {
          seg.rockT = (seg.rockT || 0) + dt;
          if (seg.rockT > seg.feature.interval) {
            seg.rockT = 0;
            const spot = U.choose(seg.feature.spots);
            this.groundTelegraphs.push({ type: "falling", spots: [{ x: spot, delay: 0 }], t: 0, color: "#b08a5e" });
          }
        }

        /* darkness feature */
        if (seg.feature && seg.feature.type === "darkness") {
          if (p.x >= seg.x0 && p.x <= seg.x1) activeDark = seg;
        }

        /* wind feature */
        if (seg.feature && seg.feature.type === "wind" && p.x >= seg.feature.x && p.x <= seg.feature.x + seg.feature.w) {
          const push = seg.feature.dir * seg.feature.strength * 420;
          p.x += push * dt;
          for (const e of this.enemies) {
            if (e.x >= seg.feature.x && e.x <= seg.feature.x + seg.feature.w) e.x += push * 0.6 * dt;
          }
        }

        /* reward caches trigger when the player reaches their center */
        if (seg.rewards && seg._rewardReady) {
          const cx = seg.x0 + (seg.x1 - seg.x0) / 2;
          if (Math.abs(p.x - cx) < 170) {
            seg._rewardReady = false;
            this._dropRewards(seg.rewards, cx);
          }
        }

        /* explosive barrels */
        for (const b of seg.barrels) {
          if (b.broken) continue;
          if (this._barrelHit(b)) {
            b.broken = true;
            this.damageArea(b.x, b.y - 20, 95, 0.85, 240, {});
            SL.Particles.burst(b.x, b.y - 20, "#ff7b2e", 16, 260, 4, 0.5, 0);
            SL.Particles.smoke(b.x, b.y - 20, "#444", 8);
            this.screenShake(4, 0.3);
            SL.Audio.play("explosion");
          }
        }
      }
      this.darkness = activeDark ? { x: activeDark.x0, w: activeDark.x1 - activeDark.x0 } : null;
    }

    _gateClamp() {
      const gate = this._nearestLockedGate();
      if (!gate) return;
      const maxScroll = Math.max(0, gate.x - this.viewW + 100);
      if (this.scrollX > maxScroll) this.scrollX = maxScroll;
      if (this.player && this.player.x > gate.x - 26) this.player.x = gate.x - 26;
    }

    _nearestLockedGate() {
      const x0 = this.scrollX - 200, x1 = this.scrollX + this.viewW + 60;
      const segs = this.worldGen.segmentsInRange(x0, x1);
      let best = null, bx = Infinity;
      for (const seg of segs) {
        if (!seg.gate || seg.gate.bossGate || !seg.gate.locked || seg.gate.open) continue;
        if (seg.gate.x < bx && seg.gate.x > this.scrollX - 300) { bx = seg.gate.x; best = seg.gate; }
      }
      return best;
    }

    _barrelHit(b) {
      const p = this.player;
      if (!p || p.dead || !p.attack) return false;
      const hbs = p.activeHitboxes();
      for (const hb of hbs) {
        const d = U.dist(hb.x, hb.y, b.x, b.y - 20);
        if (d < hb.radius + b.w) return true;
      }
      return false;
    }

    _offerPathChoice(seg) {
      if (this.state !== "playing") return;
      this.state = "path";
      const options = this.worldGen.offerPath(seg);
      SL.UI.showPathChoice(options, (opt) => this._resolvePathChoice(opt));
    }

    _resolvePathChoice(option) {
      if (this.state !== "path") return;
      this.state = "playing";
      if (option) this.worldGen.applyPath(this, option);
    }

    _dropRewards(r, x) {
      for (let i = 0; i < (r.coins || 0); i++) {
        this.spawnPickup("coin", x + (Math.random() - 0.5) * 170, this.groundY - 30 - Math.random() * 50);
      }
      for (let i = 0; i < (r.gems || 0); i++) {
        this.spawnPickup("gem", x + (Math.random() - 0.5) * 130, this.groundY - 40 - Math.random() * 60);
      }
      for (let i = 0; i < (r.xp || 0); i++) {
        this.spawnPickup("xp", x + (Math.random() - 0.5) * 150, this.groundY - 40 - Math.random() * 70);
      }
      SL.Particles.burst(x, this.groundY - 40, "#ffd75e", 12, 180, 3, 0.5, 0);
      SL.Audio.play("coin");
    }

    _spawnLogic(dt) {
      const interval = U.clamp(1.4 - this.distance / 5000, 0.42, 1.4) / (this.run.spawnMul || 1);
      this.spawnT -= dt;
      const cap = this.boss ? 8 : Math.min(16, 9 + Math.floor(this.distance / 400));
      if (this.spawnT <= 0 && this.enemies.length < cap) {
        this.spawnT = interval;
        const zone = this.levelGen.zoneForDistance(this.distance);
        const pool = this._enemyPool(zone.id);
        let type = U.choose(pool);
        let elite = false;
        const eliteChance = Math.min(0.05 + this.distance / 18000, 0.16) * (this.run.eliteMul || 1);
        if (Math.random() < eliteChance && !this.boss) elite = true;
        const x = this.scrollX + this.viewW + U.rand(60, 260);
        this.spawnEnemy(type, x, elite);
      }
      // occasional XP orbs drift from the distance as a reward for progress
      if (Math.random() < dt * 0.06) {
        this.spawnPickup("xp", this.scrollX + this.viewW, this.groundY - 40 - Math.random() * 80);
      }
    }

    _enemyPool(zoneId) {
      switch (zoneId) {
        case "forest": return ["grunt", "grunt", "archer", "shield"];
        case "village": return ["grunt", "assassin", "mage", "shield", "grunt"];
        case "desert": return ["grunt", "archer", "assassin", "tank", "archer"];
        case "frozen": return ["grunt", "mage", "tank", "grunt", "archer"];
        case "volcano": return ["grunt", "archer", "mage", "tank", "assassin"];
        case "castle": return ["assassin", "mage", "tank", "shield", "assassin"];
        default: return ["grunt"];
      }
    }

    spawnEnemy(type, x, elite) {
      const e = new SL.Entities.Enemy(this, type, x, elite);
      this.enemies.push(e);
    }

    /* ================= combat ================= */
    _meleeDmg(scale) {
      const r = this.run;
      return this.warrior.base.dmg * 11 * scale * r.dmgMul;
    }

    dealDamage(target, amount, opts) {
      opts = opts || {};
      if (target.dead) return;
      const r = this.run;
      let dmg = Math.max(1, amount);
      let crit = false;
      if (!opts.dot && !opts.silent) {
        let cc = r.critChance;
        if (r.synCritRage && this.player && this.player.hp < this.player.maxHp * 0.4) cc *= 2;
        if (cc > 0 && Math.random() < cc) {
          crit = true;
          dmg *= r.critMul;
        }
      }
      if (opts.crit) { crit = true; dmg *= r.critMul; }
      const final = Math.max(1, Math.round(dmg));
      const frontAngle = opts.frontAngle !== undefined ? opts.frontAngle : null;

      const apply = {
        knock: opts.knock,
        stun: opts.stun,
        silent: opts.silent,
        frontAngle,
        fromPlayer: opts.fromPlayer,
        bypassBlock: opts.bypassBlock,
      };
      // elemental statuses
      if (opts.fromPlayer && (opts.effects || opts.forceBurn)) {
        const onHit = this._applyOnHitEffects(target, final);
        if (onHit.burn) apply.burn = onHit.burn;
        if (onHit.poison) apply.poison = onHit.poison;
        if (onHit.slow) apply.slow = onHit.slow;
      }
      target.applyDamage(final, apply);

      // feedback
      if (!opts.silent && !opts.dot) {
        const color = crit ? "#ffd75e" : "#ffffff";
        SL.Particles.damageText(target.x, target.y - 60 * target.scale - 10, String(final), color, { crit, size: crit ? 19 : 15 });
        SL.Audio.play(crit ? "crit" : "hit");
        SL.Particles.burst(target.x, target.y - 40, crit ? "#ffd75e" : "#c9d4ff", Math.min(6, 3 + (crit ? 3 : 0)), 140, 2.5, 0.35, 200);
      }

      // lifesteal
      if (opts.fromPlayer && r.lifesteal > 0 && this.player && !this.player.dead) {
        this.player.heal(final * r.lifesteal);
      }

      // lightning on hit
      if (opts.fromPlayer && r.lightning && Math.random() < 0.15 * r.lightningLevel && !opts.dot) {
        this.lightningStrike(target, final);
      }
    }

    _applyOnHitEffects(target, dmg) {
      const r = this.run;
      const out = {};
      if (r.burn) {
        out.burn = { dps: dmg * 0.1 * r.burnLevel, dur: 2.5 };
      }
      if (r.poison) {
        out.poison = { dps: dmg * 0.06 * r.poisonLevel, dur: 3 };
      }
      if (r.frost) {
        out.slow = 1.4;
        if (r.synSuperconduct) target._chilled = true;
      }
      return out;
    }

    lightningStrike(target, baseDmg) {
      const r = this.run;
      let dmg = baseDmg * 1.3 * r.lightningLevel;
      if (r.synSuperconduct && (target._chilled || target.slowT > 0)) dmg *= 2;
      this.dealDamage(target, dmg, { silent: true, fromPlayer: true, element: "lightning" });
      SL.Particles.lightning(target.x, -40, target.x, target.y - 50, "#aedcff", 10);
      SL.Particles.burst(target.x, target.y - 40, "#aedcff", 10, 200, 3, 0.4, 0);
      SL.Audio.play("lightning");
      this.screenShake(4, 0.15);
    }

    damageArea(x, y, radius, dmgMul, knock, opts) {
      opts = opts || {};
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = U.dist(x, y, e.x, e.y - 30 * e.scale);
        if (d < radius + e.w) {
          const ang = U.angleTo(x, y, e.x, e.y);
          this.dealDamage(e, this._meleeDmg(dmgMul), {
            knock: { x: Math.cos(ang) * knock, y: Math.sin(ang) * knock - 60 },
            fromPlayer: true, effects: true, bypassBlock: opts.bypassBlock,
          });
        }
      }
    }

    damageCone(x, y, facing, range, dmgMul, knock, opts) {
      opts = opts || {};
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.x - x, dy = (e.y - 30) - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > range + e.w) continue;
        const ang = Math.atan2(dy, dx);
        const baseAng = facing > 0 ? 0 : Math.PI;
        let diff = Math.abs(ang - baseAng);
        if (diff > Math.PI) diff = U.TAU - diff;
        if (diff < Math.PI * 0.55) {
          this.dealDamage(e, this._meleeDmg(dmgMul), {
            knock: { x: facing * knock, y: -80 },
            stun: opts.stun, fromPlayer: true, effects: true,
          });
        }
      }
    }

    firePlayerProjectile(x, y, dx, dy, speed, dmg, type, opts) {
      opts = opts || {};
      const mag = Math.sqrt(dx * dx + dy * dy) || 1;
      this.projectiles.push({
        x, y, vx: dx / mag * speed, vy: dy / mag * speed,
        dmg, type, life: 4, color: opts.color || (type === "arrow" ? "#7dff6a" : "#a06bff"),
        homing: this.run.homing, element: opts.element || null,
        pierce: opts.pierce || 1,
        speed, hitIds: opts.pierce ? new Set() : null,
      });
    }

    /* ultimate fx helpers */
    rainBlades(facing, dmg) {
      this.ultFx = { type: "rain", t: 0, dur: 3, dmg, x0: this.player.x + facing * 260, spread: 240, color: "#5fc8ff", ico: "blade" };
    }
    rainArrows(dmg) {
      this.ultFx = { type: "rain", t: 0, dur: 3, dmg, x0: this.scrollX + this.viewW / 2, spread: this.viewW * 0.8, color: "#7dff6a", ico: "arrow" };
    }
    deathMark(dmg) {
      for (const e of this.enemies.slice()) {
        if (e.dead) continue;
        this.dealDamage(e, dmg, { crit: true, fromPlayer: true });
        SL.Particles.ring(e.x, e.y - 40, "#c86bff", 16, 0.4);
      }
      SL.UI.toast("Death Mark!", "synergy");
    }
    voidStorm(dmg) {
      this.ultFx = { type: "void", t: 0, dur: 4.5, dmg };
      SL.UI.toast("Void Storm!", "synergy");
    }

    _updateUltFx(dt) {
      if (!this.ultFx) return;
      const fx = this.ultFx;
      fx.t += dt;
      if (fx.type === "rain") {
        fx.tick = fx.tick || 0;
        fx.tick -= dt;
        if (fx.tick <= 0) {
          fx.tick = 0.13;
          const x = fx.x0 + (Math.random() - 0.5) * fx.spread;
          this.projectiles.push({
            x, y: -30, vx: 0, vy: 0, fall: 780,
            dmg: fx.dmg, type: fx.ico, life: 3, color: fx.color,
            hitIds: new Set(), pierce: 2,
          });
          this.puff(x, 10, fx.color, 2);
        }
        if (fx.t >= fx.dur) this.ultFx = null;
      } else if (fx.type === "void") {
        fx.tick = fx.tick || 0;
        fx.tick -= dt;
        if (fx.tick <= 0) {
          fx.tick = 0.4;
          this.damageArea(this.player.x, this.player.y - 30, 130, 1.8, 260, {});
        }
        if (fx.t >= fx.dur) this.ultFx = null;
      }
    }

    /* ================= pickups / drops ================= */
    spawnPickup(type, x, y) {
      this.pickups.push({ type, x, y, vx: 0, vy: 0, t: 0 });
    }

    _collectPickup(pk) {
      const r = this.run;
      switch (pk.type) {
        case "xp": {
          const v = 5;
          this.player.addXp(v);
          this.xpEarned += v;
          SL.Audio.play("coin");
          break;
        }
        case "coin": {
          const v = 1;
          this.coinsEarned += Math.round(v * r.coinMul);
          this.score += 20 * this.scoreMul;
          SL.Audio.play("coin");
          SL.Particles.burst(pk.x, pk.y, "#ffc34d", 4, 100, 2, 0.3, 0);
          break;
        }
        case "gem": {
          const v = 1;
          this.gemsEarned += Math.round(v * r.gemMul);
          this.score += 200 * this.scoreMul;
          SL.Audio.play("gem");
          SL.Particles.burst(pk.x, pk.y, "#6ce6ff", 6, 140, 2.5, 0.4, 0);
          break;
        }
      }
    }

    /* ================= kills ================= */
    onEnemyKilled(e) {
      this.kills++;
      if (e.elite) this.elitesKilled++;
      if (this.director) this.director.notifyKill(e);
      this.combo++;
      this.comboTime = 3.2;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const r = this.run;

      const killScore = (e.elite ? 500 : 100) * this.scoreMul;
      this.score += killScore;

      SL.Audio.play("enemyHit");
      SL.Particles.burst(e.x, e.y - 40 * e.scale, e.elite ? "#ffc34d" : "#c9d4ff", e.elite ? 16 : 8, 200, 3, 0.5, 200);
      SL.Particles.smoke(e.x, e.y - 40, "#555", e.elite ? 8 : 4);

      // drops
      const coinChance = e.def.coins * (this.run.coinMul > 2 ? 1 : 1) * 1.2;
      if (Math.random() < coinChance) this.spawnPickup("coin", e.x, e.y - 40);
      if (e.elite) {
        this.spawnPickup("gem", e.x, e.y - 40);
        SL.UI.toast("Elite defeated!", "zone");
      } else if (Math.random() < 0.04 * (this.run.gemMul || 1)) {
        this.spawnPickup("gem", e.x, e.y - 40);
      }
      this.spawnPickup("xp", e.x, e.y - 60);

      // explosive kill
      if (r.explosiveKill) {
        this.damageArea(e.x, e.y - 30, 60 + r.explosiveKill * 20, 0.9, 260, {});
        SL.Particles.shock(e.x, e.y - 30, "#ff8a3a", 20);
        this.screenShake(3, 0.12);
        if (r.synChain) {
          let nearest = null, bd = 140;
          for (const o of this.enemies) {
            if (o.dead || o.id === e.id) continue;
            const d = U.dist(e.x, e.y, o.x, o.y);
            if (d < bd) { bd = d; nearest = o; }
          }
          if (nearest) this.dealDamage(nearest, this._meleeDmg(1.2), { fromPlayer: true });
        }
      }

      // thunder aura
      if (r.thunderAura) {
        this.lightningStrike(e, this._meleeDmg(1));
      }
    }

    onBossKilled(b) {
      this.bossKills++;
      const bonus = 5000 * this.scoreMul;
      this.score += bonus;
      this.combo += 10;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      SL.Audio.play("bossDefeat");
      SL.UI.toast("BOSS DEFEATED! +" + U.formatNum(bonus), "boss");
      this.screenShake(12, 0.6);
      if (this.player) {
        this.player.victoryT = 1.6;
        this.player.attack = null;
        this.player.airAtk = false;
        if (this.player.animator) this.player.animator.beginVictory();
      }
      SL.Particles.shock(b.x, b.y - 60, "#ffd75e", 80);
      SL.Particles.burst(b.x, b.y - 60, "#ffd75e", 30, 400, 5, 0.8, 500);
      // rewards
      for (let i = 0; i < 6; i++) this.spawnPickup("gem", b.x + (Math.random() - 0.5) * 80, b.y - 40 - Math.random() * 60);
      for (let i = 0; i < 12; i++) this.spawnPickup("coin", b.x + (Math.random() - 0.5) * 120, b.y - 40 - Math.random() * 60);
      for (let i = 0; i < 8; i++) this.spawnPickup("xp", b.x + (Math.random() - 0.5) * 100, b.y - 40 - Math.random() * 60);
    }

    onPlayerDeath() {
      this.state = "dead";
      this.deathTimer = 1.4;
      this._ended = false;
      SL.Audio.play("death");
      SL.Particles.burst(this.player.x, this.player.y - 30, this.warrior.color, 24, 300, 4, 0.8, 400);
      SL.Particles.smoke(this.player.x, this.player.y - 30, "#222", 12);
      this.screenShake(10, 0.5);
      this.player.dead = true;
    }

    _onComboBroken() {
      if (this.combo > 0 && !this.rampage) {
        this.combo = 0;
        this.comboTier = 0;
        this.scoreMul = 1;
        SL.UI.updateHUD(this);
      }
    }

    /* ================= combo / score ================= */
    _updateCombo(dt) {
      if (this.combo > 0) {
        this.comboTime -= dt;
        if (this.comboTime <= 0) {
          this.combo -= 5;
          if (this.combo < 0) this.combo = 0;
          this.comboTime = 0.8;
        }
      }
      let tier = 0;
      if (this.combo >= 100) tier = 4;
      else if (this.combo >= 50) tier = 3;
      else if (this.combo >= 25) tier = 2;
      else if (this.combo >= 10) tier = 1;
      this.comboTier = tier;
      const tierBonus = [0, 0.05, 0.15, 0.3, 0.5][tier];
      this.scoreMul = 1 + tierBonus * this.run.comboMul;
      const wasRampage = this.rampage;
      this.rampage = tier === 4;
      if (this.rampage && !wasRampage) {
        SL.UI.toast("RAMPAGE! x" + this.combo, "boss");
        SL.Audio.play("bossWarn");
      }
    }

    /* ================= world hazards ================= */
    _checkWorldHazards() {
      const p = this.player;
      if (!p || p.dead || p.iFrames > 0) return;
      const x0 = this.scrollX - 40, x1 = this.scrollX + this.viewW + 40;
      const hazards = this.levelGen.hazardsInRange(x0, x1).concat(this.worldGen.hazardsInRange(x0, x1));
      for (const hz of hazards) {
        if (hz.type === "firejet") {
          const period = 3.2;
          const phase = ((this.elapsed + hz.phase * period) % period) / period;
          if (phase <= 0.85) continue;
          // erupting: tall flame zone
          const rect = { x: hz.x, y: this.groundY - 90, w: hz.w, h: 90 };
          if (U.rectsOverlap(rect, { x: p.x - 10, y: p.y - 52, w: 20, h: 52 })) {
            p.takeDamage(hz.dmg, { source: null });
            p.iFrames = 0.6;
            this._onComboBroken();
          }
          continue;
        }
        if (hz.type === "lava") {
          if (U.rectsOverlap({ x: hz.x, y: hz.y - hz.h, w: hz.w, h: hz.h }, { x: p.x - 10, y: p.y - 52, w: 20, h: 52 })) {
            p.takeDamage(hz.dmg, { source: null });
            p.iFrames = 0.5;
            this._onComboBroken();
          }
          continue;
        }
        if (hz.type === "spikewall" || hz.type === "spikes" || hz.type === "cactus" || hz.type === "icecrystal" || hz.type === "rootspike") {
          if (U.rectsOverlap({ x: hz.x, y: hz.y - hz.h, w: hz.w, h: hz.h }, { x: p.x - 10, y: p.y - 52, w: 20, h: 52 })) {
            p.takeDamage(hz.dmg, { source: null });
            p.iFrames = 0.5;
            this._onComboBroken();
          }
        }
      }
    }

    /* ================= helpers ================= */
    _inMeleeArc(p, hb, e) {
      const ex = e.x, ey = e.y - 30 * e.scale;
      const radius = hb.radius + e.w * 0.5;
      if (U.dist(hb.x, hb.y, ex, ey) > radius) return false;
      // generous front cone (~222°), mirrored by facing
      let ang = U.angleTo(p.x, p.y - 30, ex, ey);
      if (p.facing < 0) ang = Math.atan2(ey - (p.y - 30), -(ex - p.x));
      return Math.abs(ang) <= Math.PI * 0.62;
    }

    nearestEnemy(x, y, range) {
      let best = null, bd = range;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = U.dist(x, y, e.x, e.y - 30);
        if (d < bd) { bd = d; best = e; }
      }
      if (this.boss && !this.boss.dead) {
        const d = U.dist(x, y, this.boss.x, this.boss.y - 70);
        if (d < bd) return this.boss;
      }
      return best;
    }

    spawnAfterimages(n) {
      const p = this.player;
      n = n || 4;
      for (let i = 0; i < n; i++) {
        this.afterimages.push({
          x: p.x - p.dashDir * i * 12, y: p.y, t: 0.3,
          facing: p.facing, color: this.warrior.color,
        });
      }
    }

    screenShake(mag, dur) {
      if (!SL.Save.get().settings.screenShake) return;
      this.shake.mag = Math.max(this.shake.mag, mag);
      this.shake.t = Math.max(this.shake.t, dur);
    }

    _updateShake(dt) {
      if (this.shake.t > 0) this.shake.t -= dt;
      else this.shake.mag = 0;
    }

    /* ================= dynamic platforms ================= */
    _updatePlatforms(dt) {
      const plats = this.worldGen.platformsInRange(this.scrollX - 60, this.scrollX + this.viewW + 420);
      for (const p of plats) {
        if (p.collapsed) continue;
        // moving platforms
        if (p.move) {
          if (p.baseY === undefined) { p.baseY = p.y; p.baseX = p.x; }
          p.osc = (p.osc || 0) + dt * p.move.speed;
          const ph = p.move.phase || 0;
          if (p.move.axis === "y") p.y = p.baseY + Math.sin(p.osc + ph) * p.move.amp;
          else if (p.move.axis === "x") p.x = p.baseX + Math.sin(p.osc + ph) * p.move.amp;
        }
        // collapsing bridges
        if (p.collapse) {
          if (this._entityOnPlatform(p)) {
            p.collapseT = (p.collapseT || 0) + dt;
            if (p.collapseT > 0.55) {
              p.collapsed = true;
              this.screenShake(3, 0.2);
              SL.Particles.burst(p.x + p.w / 2, p.y, "#8a8f9c", 10, 160, 3, 0.4, 0);
              this.audio.play("rock");
            }
          } else {
            p.collapseT = 0;
          }
        }
      }
      this.activePlatforms = plats;
    }

    resolveGround(ent, prevY) {
      // ground plane
      if (ent.y >= this.groundY) return { y: this.groundY, platform: null };
      const halfW = (ent.w || 20) / 2;
      // ride a platform from last frame: follow its vertical movement
      // (only while not moving upward away from it — lets jumps escape)
      if (ent.platform && !ent.platform.collapsed && ent.vy >= 0) {
        const p = ent.platform;
        if (ent.x + halfW > p.x && ent.x - halfW < p.x + p.w) {
          return { y: p.y, platform: p };
        }
      }
      // worldgen platforms (top surface landing)
      let best = null, bestY = -1e9;
      for (const p of this.activePlatforms) {
        if (p.collapsed) continue;
        if (ent.x + halfW < p.x || ent.x - halfW > p.x + p.w) continue;
        if (ent.y >= p.y && prevY <= p.y) {
          if (p.y > bestY) { bestY = p.y; best = p; }
        }
      }
      return best ? { y: best.y, platform: best } : null;
    }

    _entityOnPlatform(p) {
      const pl = this.player;
      if (pl && !pl.dead && pl.onGround && this._overlapsPlatform(pl, p)) return true;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (e.onGround && this._overlapsPlatform(e, p)) return true;
      }
      return false;
    }

    _overlapsPlatform(ent, p) {
      const halfW = (ent.w || 20) / 2;
      return ent.x + halfW > p.x && ent.x - halfW < p.x + p.w && Math.abs(ent.y - p.y) < 4;
    }

    _drawPlatform(ctx, p, time) {
      const colors = {
        stone: ["#3a3e4a", "#6a7080", "#4a4f5c"],
        wood: ["#54371f", "#8a6138", "#6b4a2e"],
        bridge: ["#46301e", "#7a5534", "#5c4028"],
        ice: ["#8fd0e8", "#dff6ff", "#bfe9f5"],
      }[p.kind] || ["#3a3e4a", "#6a7080", "#4a4f5c"];
      const shaking = p.collapse && (p.collapseT || 0) > 0.2 && Math.floor(time * 30) % 2 === 0;
      const x = p.x + (shaking ? (Math.random() - 0.5) * 3 : 0);
      const y = p.y + (shaking ? (Math.random() - 0.5) * 2 : 0);
      ctx.fillStyle = colors[1];
      ctx.fillRect(x, y, p.w, 16);
      ctx.fillStyle = colors[2];
      ctx.fillRect(x, y + 6, p.w, 10);
      ctx.fillStyle = colors[0];
      ctx.fillRect(x, y, p.w, 3);
    }

    _drawWorldDecos(ctx, time) {
      const x0 = this.scrollX - 60, x1 = this.scrollX + this.viewW + 60;
      const decos = this.worldGen.decosInRange(x0, x1);
      for (const d of decos) {
        const gy = this.groundY;
        switch (d.type) {
          case "tree": case "iceTree": {
            ctx.fillStyle = d.type === "iceTree" ? "#cfeef7" : "#2e5a3a";
            ctx.fillRect(d.x + d.w * 0.42, gy - d.h * 0.72, d.w * 0.16, d.h * 0.72);
            ctx.beginPath();
            ctx.arc(d.x + d.w / 2, gy - d.h * 0.78, d.w * 0.5, 0, U.TAU);
            ctx.fill();
            break;
          }
          case "cactus": {
            ctx.fillStyle = "#3e7a3a";
            ctx.fillRect(d.x + d.w * 0.4, gy - d.h, d.w * 0.2, d.h);
            ctx.fillRect(d.x + d.w * 0.1, gy - d.h * 0.55, d.w * 0.3, 7);
            ctx.fillRect(d.x + d.w * 0.6, gy - d.h * 0.7, d.w * 0.3, 7);
            break;
          }
          case "rock": {
            ctx.fillStyle = "#6a6f78";
            ctx.beginPath();
            ctx.arc(d.x + d.w / 2, gy, d.w * 0.5, Math.PI, 0);
            ctx.fill();
            break;
          }
          case "wall": {
            ctx.fillStyle = "#3d4250";
            ctx.fillRect(d.x, gy - d.h, d.w, d.h);
            ctx.fillStyle = "#575d6e";
            ctx.fillRect(d.x, gy - d.h, d.w, 6);
            break;
          }
          case "pillar": {
            ctx.fillStyle = d.broken ? "#4a4f5c" : "#6a7080";
            ctx.fillRect(d.x, gy - d.h, d.w, d.h);
            ctx.fillStyle = "#8a90a0";
            ctx.fillRect(d.x, gy - d.h, d.w, 4);
            if (d.broken) {
              ctx.fillStyle = "#4a4f5c";
              ctx.fillRect(d.x - 4, gy - d.h * 0.7, 7, 10);
              ctx.fillRect(d.x + d.w - 3, gy - d.h * 0.4, 7, 10);
            }
            break;
          }
          case "chest": {
            ctx.fillStyle = "#7a5a24";
            ctx.fillRect(d.x, gy - d.h, d.w, d.h);
            ctx.fillStyle = "#e0b84a";
            ctx.fillRect(d.x, gy - d.h, d.w, d.h * 0.4);
            ctx.fillRect(d.x + d.w / 2 - 2, gy - d.h, 4, d.h);
            break;
          }
        }
      }
    }

    _drawWorldHazards(ctx, time) {
      const x0 = this.scrollX - 40, x1 = this.scrollX + this.viewW + 40;
      const hzs = this.worldGen.hazardsInRange(x0, x1);
      const gy = this.groundY;
      for (const hz of hzs) {
        switch (hz.type) {
          case "spikes": case "spikewall": case "cactus": case "icecrystal": case "rootspike": {
            const n = hz.n || 2;
            const color = hz.type === "cactus" ? "#4a8a3a" : hz.type === "icecrystal" ? "#bfe9f5" : hz.type === "rootspike" ? "#5a4a3a" : "#9aa2b0";
            ctx.fillStyle = color;
            for (let i = 0; i < n; i++) {
              const sx = hz.x + i * (hz.w / n);
              ctx.beginPath();
              ctx.moveTo(sx, gy);
              ctx.lineTo(sx + hz.w / n / 2, gy - hz.h);
              ctx.lineTo(sx + hz.w / n, gy);
              ctx.fill();
            }
            break;
          }
          case "lava": {
            const pulse = 0.5 + Math.sin(time * 6 + hz.x) * 0.15;
            ctx.fillStyle = U.rgba(255, 80, 20, pulse);
            ctx.fillRect(hz.x, gy - 4, hz.w, 10);
            ctx.fillStyle = "#ffd75e";
            ctx.fillRect(hz.x, gy - 4, hz.w, 3);
            break;
          }
          case "firejet": {
            const period = 3.2;
            const phase = ((time + hz.phase * period) % period) / period;
            if (phase > 0.85) {
              const f = (phase - 0.85) / 0.15;
              ctx.fillStyle = U.rgba(255, 120, 30, 0.5 + f * 0.5);
              ctx.fillRect(hz.x - 6, gy - 90 * f, 18, 90 * f + 6);
              ctx.fillStyle = U.rgba(255, 220, 90, 0.7 * f);
              ctx.fillRect(hz.x - 4, gy - 70 * f, 14, 70 * f + 4);
            }
            break;
          }
        }
      }
    }

    _drawBarrels(ctx, time) {
      const x0 = this.scrollX - 60, x1 = this.scrollX + this.viewW + 60;
      const bars = this.worldGen.barrelsInRange(x0, x1);
      const gy = this.groundY;
      for (const b of bars) {
        if (b.broken) continue;
        ctx.fillStyle = "#8a4a2e";
        ctx.fillRect(b.x, gy - b.h, b.w, b.h);
        ctx.fillStyle = "#c96b42";
        ctx.fillRect(b.x, gy - b.h, b.w, 5);
        ctx.fillRect(b.x, gy - b.h * 0.5, b.w, 4);
        ctx.fillStyle = "#ff7b2e";
        ctx.fillRect(b.x + b.w * 0.38, gy - b.h * 0.62, b.w * 0.24, 5);
        // warning shimmer
        if (Math.floor(time * 6) % 2 === 0) {
          ctx.fillStyle = "rgba(255,120,40,0.25)";
          ctx.beginPath(); ctx.arc(b.x + b.w / 2, gy - b.h / 2, 12, 0, U.TAU); ctx.fill();
        }
      }
    }

    _drawDarkness(ctx, viewW, viewH) {
      if (!this.darkness) return;
      const p = this.player;
      const cx = p ? p.x : this.scrollX + viewW / 2;
      const cy = p ? p.y - 40 : this.groundY - 60;
      const grad = ctx.createRadialGradient(cx, cy, 60, cx, cy, 340);
      grad.addColorStop(0, "rgba(3,5,12,0.15)");
      grad.addColorStop(0.6, "rgba(3,5,12,0.72)");
      grad.addColorStop(1, "rgba(3,5,12,0.92)");
      ctx.fillStyle = grad;
      ctx.fillRect(this.scrollX, -40, viewW, viewH + 80);
    }

    flash(color) {
      this.flashT = 0.2;
      this.flashColor = color || "#ffffff";
    }

    toast(msg, kind) {
      SL.UI.toast(msg, kind);
    }

    banner(msg, kind) {
      SL.UI.banner(msg, kind);
    }

    /* ================= clone update ================= */
    _updateClones(dt) {
      const r = this.run;
      const p = this.player;
      if (!p || p.dead) return;
      const n = r.cloneCount || 0;
      if (n <= 0) return;
      if (!this.clones) this.clones = [];
      while (this.clones.length < n) this.clones.push({ x: p.x, y: p.y, t: 0 });
      for (const c of this.clones) {
        c.t += dt;
        if (c.t > 0.35) {
          c.t = 0;
          const cloneScale = 0.85;
          // mimic attack
          if (p.attack) {
            const dmg = this._meleeDmg(0.4);
            const hbs = p.activeHitboxes();
            if (hbs.length) {
              const hb = hbs[0];
              for (const e of this.enemies) {
                if (e.dead) continue;
                const d = U.dist(c.x, c.y - 30, e.x, e.y - 30);
                const ang = U.angleTo(c.x, c.y - 30, e.x, e.y - 30);
                if (d < hb.radius + e.w && Math.abs(ang) < Math.PI * 0.6) {
                  this.dealDamage(e, dmg, { fromPlayer: true, effects: this.run.synLightningClone });
                }
              }
            }
          }
        }
        c.x = p.x;
        c.y = p.y;
      }
    }

    /* ================= render ================= */
    render(dt) {
      const ctx = this.ctx;
      const dpr = this.dpr;
      const scale = this.scale;
      const scrollX = this.scrollX;
      const viewW = this.viewW, viewH = this.viewH;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // world transform
      let sx = 0, sy = 0;
      if (this.shake.t > 0) {
        sx = (Math.random() - 0.5) * this.shake.mag * this.shake.t;
        sy = (Math.random() - 0.5) * this.shake.mag * this.shake.t;
      }
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, (-scrollX + sx) * scale * dpr, sy * scale * dpr);

      // background
      this.levelGen.drawBackground(ctx, this.elapsed, scrollX, viewW, viewH, this.groundY);
      this.levelGen.drawDecos(ctx, this.elapsed, scrollX, viewW, viewH, this.groundY);

      // worldgen platforms
      for (const p of this.activePlatforms) {
        if (p.collapsed) continue;
        this._drawPlatform(ctx, p, this.elapsed);
      }
      // worldgen decos / hazards / barrels
      this._drawWorldDecos(ctx, this.elapsed);
      this._drawBarrels(ctx, this.elapsed);
      this._drawWorldHazards(ctx, this.elapsed);

      // ground telegraphs
      for (const gt of this.groundTelegraphs) {
        for (const spot of gt.spots) {
          const armed = gt.t >= spot.delay;
          const flash = Math.floor(this.elapsed * 8) % 2 === 0;
          ctx.globalAlpha = armed ? 0.9 : (flash ? 0.7 : 0.3);
          ctx.fillStyle = gt.color || "#ff5252";
          if (gt.type === "falling") {
            ctx.beginPath();
            ctx.moveTo(spot.x, this.groundY - 20);
            ctx.lineTo(spot.x - 7, this.groundY);
            ctx.lineTo(spot.x + 7, this.groundY);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.fillRect(spot.x - 12, this.groundY - 3, 24, 3);
          }
          ctx.globalAlpha = 1;
        }
      }

      // lava pools
      for (const lp of this.lavaPools) {
        ctx.fillStyle = "rgba(255,90,20," + (0.5 + Math.sin(this.elapsed * 5 + lp.x) * 0.3) + ")";
        ctx.fillRect(lp.x - lp.w / 2, lp.y, lp.w, 10);
      }

      // temp hazards
      for (const hz of this.tempHazards) {
        ctx.globalAlpha = Math.min(1, hz.t * 3);
        if (hz.type === "spike") {
          ctx.fillStyle = hz.color;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(hz.x + i * 8, hz.y + hz.h);
            ctx.lineTo(hz.x + i * 8 + 4, hz.y);
            ctx.lineTo(hz.x + i * 8 + 8, hz.y + hz.h);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }

      // shockwaves
      for (const sw of this.shockwaves) {
        ctx.globalAlpha = sw.life * 0.4;
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.radius, 0, U.TAU); ctx.stroke();
        ctx.lineWidth = 8;
        ctx.globalAlpha *= 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // pickups
      for (const pk of this.pickups) {
        const bob = Math.sin(this.elapsed * 6 + pk.x * 0.1) * 3;
        const y = pk.y + bob;
        if (pk.type === "xp") {
          ctx.fillStyle = "#4dd0ff";
          ctx.beginPath(); ctx.arc(pk.x, y, 6, 0, U.TAU); ctx.fill();
          ctx.globalAlpha = 0.35;
          ctx.beginPath(); ctx.arc(pk.x, y, 11, 0, U.TAU); ctx.fill();
        } else if (pk.type === "coin") {
          ctx.fillStyle = "#ffc34d";
          ctx.beginPath(); ctx.arc(pk.x, y, 7, 0, U.TAU); ctx.fill();
          ctx.strokeStyle = "#ff9d2e";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(pk.x, y, 7, 0, U.TAU); ctx.stroke();
        } else if (pk.type === "gem") {
          ctx.fillStyle = "#6ce6ff";
          ctx.beginPath();
          ctx.moveTo(pk.x, y - 8);
          ctx.lineTo(pk.x + 6, y);
          ctx.lineTo(pk.x, y + 8);
          ctx.lineTo(pk.x - 6, y);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 0.4;
          ctx.beginPath(); ctx.arc(pk.x, y, 10, 0, U.TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // afterimages
      for (const ai of this.afterimages) {
        ctx.globalAlpha = (ai.t / 0.3) * 0.4;
        SL.Entities.drawStickman(ctx, {
          x: ai.x, y: ai.y, scale: 1, facing: ai.facing, t: this.elapsed,
          speed: 1, pose: "dash", poseT: 0, color: ai.color,
          weapon: this.player ? this.player._weaponConfig() : { kind: "sword", color: ai.color },
        });
        ctx.globalAlpha = 1;
      }

      // enemies
      for (const e of this.enemies) {
        if (e.x > scrollX - 120 && e.x < scrollX + viewW + 120) e.draw(ctx, this.elapsed);
      }

      // boss
      if (this.boss && !this.boss.dead) this.boss.draw(ctx, this.elapsed);

      // player
      if (this.player) this.player.draw(ctx, this.elapsed);

      // clones
      if (this.clones) {
        for (const c of this.clones) {
          ctx.globalAlpha = 0.6;
          SL.Entities.drawStickman(ctx, {
            x: c.x, y: c.y, scale: 0.85, facing: this.player.facing, t: this.elapsed,
            speed: 0.5, pose: this.player.pose(), poseT: 0, color: "#7a5ac9",
            weapon: { kind: "sword", color: "#b080ff" },
          });
          ctx.globalAlpha = 1;
        }
      }

      // projectiles
      for (const pr of this.projectiles) this._drawProjectile(ctx, pr, true);
      for (const pr of this.enemyProjectiles) this._drawProjectile(ctx, pr, false);

      // particles
      SL.Particles.render(ctx);

      // darkness (tunnel rooms)
      this._drawDarkness(ctx, viewW, viewH);

      // zone tint vignette
      this._drawVignette(ctx, viewW, viewH);

      // flash overlay
      if (this.flashT > 0) {
        this.flashT -= dt;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = Math.max(0, this.flashT / 0.2) * 0.5;
        ctx.fillStyle = this.flashColor;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.globalAlpha = 1;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    _drawProjectile(ctx, pr, friendly) {
      const t = this.elapsed;
      if (pr.fall) {
        // falling arrow/blade
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.fillStyle = pr.color;
        if (pr.type === "arrow" || pr.type === "blade") {
          ctx.beginPath();
          ctx.moveTo(0, -14); ctx.lineTo(-4, 0); ctx.lineTo(0, 4); ctx.lineTo(4, 0);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(0, 0, 7, 0, U.TAU); ctx.fill();
        }
        ctx.restore();
        return;
      }
      if (pr.type === "arrow") {
        const ang = Math.atan2(pr.vy, pr.vx);
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.rotate(ang);
        ctx.strokeStyle = pr.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(8, 0); ctx.stroke();
        ctx.fillStyle = pr.color;
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(5, -3.5); ctx.lineTo(5, 3.5); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (pr.type === "bolt" || pr.type === "fire" || pr.type === "ice") {
        const glow = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, 14);
        glow.addColorStop(0, pr.color);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(pr.x, pr.y, 14, 0, U.TAU); ctx.fill();
        ctx.fillStyle = pr.color;
        ctx.beginPath(); ctx.arc(pr.x, pr.y, 5, 0, U.TAU); ctx.fill();
      } else {
        ctx.fillStyle = pr.color;
        ctx.beginPath(); ctx.arc(pr.x, pr.y, 5, 0, U.TAU); ctx.fill();
      }
    }

    _drawVignette(ctx, viewW, viewH) {
      const zone = this.levelGen.zoneForDistance(this.distance);
      const grad = ctx.createRadialGradient(viewW / 2, viewH * 0.4, viewH * 0.5, viewW / 2, viewH * 0.5, viewH * 1.1);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, zone.id === "forest" ? "rgba(0,0,0,0.28)" : "rgba(0,0,0,0.35)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  SL.Game = new Game();

})(window.SL = window.SL || {});

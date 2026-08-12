/* ============================================================
 * Stickman: Warrior's Legacy
 * aidirector.js — combat director / enemy coordination AI.
 *
 * Keeps fights fair but smart:
 *   - Limits how many enemies may attack at once (no dogpiles).
 *   - Assigns coordination roles (shields guard archers, tanks
 *     lead, assassins flank the open side, ranged hold range,
 *     grunts swarm gaps).
 *   - Reads the player's behavior (dashing, combos, distance,
 *     health) and shifts enemy tactics without cheating.
 *   - Scales difficulty through behavior, not raw stats.
 *   - Spawns structured encounter templates and world events.
 *
 * The enemy AI in entities.js asks the director for permission
 * to attack and for a per-frame role hint via game.director.
 * ============================================================ */
(function (SL) {
  "use strict";
  const U = SL.U;

  /* Encounter templates — mirrored from worldgen so the director
   * can spawn them independently (events, junctions, ambushes). */
  const TEMPLATES = {
    patrol:        { types: ["grunt", "grunt"], count: 2, elite: false },
    archerDefense: { types: ["shield", "archer", "archer"], count: 3, elite: false },
    assassinAmbush:{ types: ["assassin", "assassin", "grunt"], count: 3, elite: false },
    tankWall:      { types: ["tank", "archer", "grunt"], count: 3, elite: false },
    swarm:         { types: ["grunt", "grunt", "grunt", "grunt"], count: 4, elite: false },
    eliteGuard:    { types: ["grunt", "shield", "mage"], count: 3, elite: true },
    darkPack:      { types: ["mage", "assassin", "grunt"], count: 3, elite: false },
    ironBrigade:   { types: ["shield", "shield", "archer"], count: 3, elite: false },
    bloodMages:    { types: ["mage", "mage", "tank"], count: 3, elite: false },
    hunt:          { types: ["archer", "assassin", "grunt", "grunt"], count: 4, elite: false },
  };

  const ROLES = {
    grunt:    "swarm",
    shield:   "guard",
    archer:   "hold",
    assassin: "flank",
    tank:     "lead",
    mage:     "hold",
    elite:    "lead",
  };

  class Aidirector {
    constructor(game) {
      this.game = game;
      this.bias = { danger: 1, reward: 1, room: null };
      this.attackers = new Set();   // enemy ids currently attacking
      this.roles = new Map();       // enemy id -> role hint
      this.react = { dash: 0, combo: 0, hurt: 0, press: 0 };
      this.roleTimer = 0;
      this.hard = false;            // elite keep / ambush pressure
      this.active = null;           // active world event
      this.waveTimer = 0;
      this.waveQueue = [];
      this._kills = 0;
    }

    reset() {
      this.bias = { danger: 1, reward: 1, room: null };
      this.attackers.clear();
      this.roles.clear();
      this.react = { dash: 0, combo: 0, hurt: 0, press: 0 };
      this.hard = false;
      this.active = null;
      this.waveTimer = 0;
      this.waveQueue = [];
    }

    /* ---------- path bias (called by worldgen.applyPath) ---------- */
    biasFor(option) {
      this.bias.danger = option.danger || 1;
      this.bias.reward = option.reward || 1;
      this.bias.room = option.room || null;
      if (this.bias.danger >= 1.6) this.hard = true;
    }

    /* ---------- difficulty / behavior scaling ---------- */
    tier() {
      const d = this.game.distance;
      let t = 1 + Math.floor(d / 1500);
      if (this.bias.danger > 1.4) t += 1;
      if (this.hard) t += 1;
      return Math.min(4, Math.max(1, t));
    }

    aggression() {
      // 0..1 — how eagerly enemies press attacks and pursue
      let a = 0.45 + (this.tier() - 1) * 0.12 + (this.bias.danger - 1) * 0.15;
      if (this.hard) a += 0.1;
      if (this.react.combo > 0) a += 0.1;      // player on a streak -> enemies hit back harder
      if (this.react.press > 0) a -= 0.12;     // player pushing -> enemies play safer
      return U.clamp(a, 0.2, 1);
    }

    maxAttackers() {
      let n = 3;
      if (this.tier() >= 3) n = 4;
      if (this.bias.danger > 1.4 || this.hard) n = 5;
      const count = this._aliveCount();
      return Math.min(n, Math.max(2, Math.min(5, Math.ceil(count / 2))));
    }

    attackCdMul() {
      // enemies at higher tiers recover faster
      return Math.max(0.62, 1 - (this.tier() - 1) * 0.08);
    }

    /* ---------- attacker slot gating ---------- */
    requestAttack(e) {
      if (e.dead) return false;
      if (this.attackers.has(e.id)) return true;
      if (this.attackers.size >= this.maxAttackers()) return false;
      // ranged get priority so melee swarms don't starve the fight
      if (e.def.ranged && Math.random() < 0.3) {
        if (this.attackers.size >= this.maxAttackers() + 1) return false;
      }
      this.attackers.add(e.id);
      return true;
    }

    releaseAttack(e) {
      this.attackers.delete(e.id);
    }

    /* ---------- per-frame update ---------- */
    update(dt) {
      const g = this.game;
      const p = g.player;
      this._pruneDead();

      if (p && !p.dead) this._trackPlayer(dt);

      // reassign roles a few times a second
      this.roleTimer -= dt;
      if (this.roleTimer <= 0) {
        this.roleTimer = 0.15;
        this._assignRoles();
      }

      // active world events (waves)
      this._updateEvent(dt);
    }

    _trackPlayer(dt) {
      const p = this.game.player;
      // dash recently?
      if (p.dashTimer > 0 || p.dashCd > 1.8) this.react.dash = 0.9;
      else this.react.dash = Math.max(0, this.react.dash - dt * 2);

      // high combo -> aggressive phase
      this.react.combo = this.game.combo >= 25 ? 1 : 0;

      // player pushing into enemies?
      const nearest = this.game.nearestEnemy(p.x, p.y, 340);
      if (nearest && U.dist(p.x, p.y, nearest.x, nearest.y) < 200) this.react.press = 0.8;
      else this.react.press = Math.max(0, this.react.press - dt * 2);

      // hurt phase -> mixed response
      this.react.hurt = p.hp < p.maxHp * 0.4 ? 1 : 0;
    }

    _aliveCount() {
      let n = 0;
      for (const e of this.game.enemies) if (!e.dead) n++;
      return n;
    }

    _pruneDead() {
      for (const id of this.attackers) {
        const e = this.game.enemies.find((x) => x.id === id);
        if (!e || e.dead) this.attackers.delete(id);
      }
    }

    /* ---------- role assignment (coordination + flanking) ---------- */
    _assignRoles() {
      const g = this.game;
      const p = g.player;
      if (!p || p.dead) return;
      this.roles.clear();

      const live = [];
      for (const e of g.enemies) if (!e.dead) live.push(e);
      if (!live.length) return;

      // which side of the player is the "open" flank?
      let leftW = 0, rightW = 0;
      for (const e of live) {
        const d = e.x - p.x;
        if (d < 0) leftW += 1;
        else rightW += 1;
      }
      const flankDir = leftW <= rightW ? -1 : 1;

      const archers = live.filter((e) => e.type === "archer" || e.type === "mage");
      const shields = live.filter((e) => e.type === "shield");

      for (const e of live) {
        const role = e.elite ? "lead" : (ROLES[e.type] || "swarm");
        const hint = {
          role,
          flankDir,
          aggression: this.aggression(),
          defensive: false,
          keepRange: null,
          guard: null,
          targetX: null,
        };

        switch (role) {
          case "hold": {
            // ranged: hold preferred range, back off if player closes
            const min = e.type === "mage" ? 240 : 280;
            const max = e.type === "mage" ? 400 : 460;
            hint.keepRange = [min, max];
            hint.defensive = this.react.dash > 0 || this.react.combo > 0;
            break;
          }
          case "flank": {
            // assassins circle toward the open side
            hint.targetX = p.x + flankDir * 190;
            // if player keeps distance, assassins close aggressively
            const d = U.dist(e.x, e.y, p.x, p.y);
            if (d > 420) hint.aggression = Math.max(hint.aggression, 0.8);
            break;
          }
          case "guard": {
            // shields position between player and their ranged ally
            let target = archers.length ? archers[Math.floor(Math.random() * archers.length)] : null;
            if (target) {
              hint.guard = target.id;
              hint.keepRange = [target.x, target.x];
              hint.defensive = true;
            }
            break;
          }
          case "lead": {
            // tanks push in front
            hint.targetX = p.x + flankDir * 60;
            hint.aggression = Math.max(hint.aggression, 0.15);
            break;
          }
          default: {
            // grunts: fill gaps around the player ring
            const gap = e.x < p.x ? -1 : 1;
            hint.targetX = p.x + gap * 120;
          }
        }

        // hurt player -> melee presses, ranged keeps range
        if (this.react.hurt > 0) {
          if (e.type === "archer" || e.type === "mage") hint.aggression = Math.min(hint.aggression, 0.5);
          else hint.aggression = Math.max(hint.aggression, 0.65);
        }

        this.roles.set(e.id, hint);
      }
    }

    /* Called by enemies each frame to fetch their role hint. */
    hintFor(e) {
      return this.roles.get(e.id) || { role: "swarm", flankDir: 1, aggression: this.aggression(), defensive: false, keepRange: null, guard: null, targetX: null };
    }

    /* ---------- encounter templates ---------- */
    spawnEncounter(key, x, opts) {
      opts = opts || {};
      const g = this.game;
      const t = TEMPLATES[key];
      if (!t) return [];
      const types = opts.types || t.types;
      const count = opts.count || t.count || types.length;
      const elite = opts.elite !== undefined ? opts.elite : t.elite;
      const spread = opts.spread !== undefined ? opts.spread : 46;
      const spawned = [];
      for (let i = 0; i < count; i++) {
        const type = types[i % types.length];
        const ex = x + (i - (count - 1) / 2) * spread + U.rand(-8, 8);
        g.spawnEnemy(type, ex, elite && i === 0);
        spawned.push(type);
      }
      return spawned;
    }

    /* ---------- world events ---------- */
    triggerEvent(kind, x) {
      const g = this.game;
      switch (kind) {
        case "ambush": {
          this.active = { kind, t: 0, done: false };
          const p = g.player;
          for (let i = 0; i < 4; i++) {
            const side = i < 2 ? -1 : 1;
            g.spawnEnemy(i % 2 === 0 ? "assassin" : "grunt", p.x + side * (120 + Math.random() * 260));
          }
          g.toast("AMBUSH!", "boss");
          SL.UI.banner("AMBUSH!", "boss");
          break;
        }
        case "raid": {
          this.active = { kind, t: 0, done: false };
          this._queueWave(["grunt", "grunt", "archer"], 0.8);
          this._queueWave(["grunt", "shield", "grunt"], 1.6);
          this._queueWave(["tank", "archer", "grunt", "grunt"], 2.6);
          g.toast("A RAID DESCENDS!", "boss");
          SL.UI.banner("A RAID DESCENDS!", "boss");
          break;
        }
        case "treasureRush": {
          this.active = { kind, t: 0, done: false };
          g.spawnEnemy("grunt", x + 60);
          g.spawnEnemy("grunt", x + 200);
          for (let i = 0; i < 5; i++) {
            g.spawnPickup("coin", x + 40 + Math.random() * 200, g.groundY - 30 - Math.random() * 60);
            g.spawnPickup("xp", x + 60 + Math.random() * 180, g.groundY - 40 - Math.random() * 80);
          }
          g.toast("TREASURE RUSH!", "synergy");
          SL.UI.banner("TREASURE RUSH!", "gold");
          break;
        }
        case "survival": {
          this.active = { kind, t: 0, done: false, survive: 8 };
          this._queueWave(["grunt", "grunt", "grunt"], 0.4);
          this._queueWave(["archer", "grunt"], 0.9);
          this._queueWave(["assassin", "grunt", "grunt"], 1.4);
          g.toast("SURVIVE THE HORDE!", "boss");
          SL.UI.banner("SURVIVE THE HORDE!", "boss");
          break;
        }
        case "escape": {
          this.active = { kind, t: 0, done: false };
          g.toast("ESCAPE! DON'T STOP!", "boss");
          SL.UI.banner("ESCAPE! DON'T STOP!", "blue");
          break;
        }
        case "mystery": {
          this.active = { kind, t: 0, done: false };
          if (Math.random() < 0.5) {
            for (let i = 0; i < 3; i++) g.spawnPickup("gem", x + i * 40, g.groundY - 40 - Math.random() * 50);
            g.toast("MYSTERY: FORTUNE!", "synergy");
            SL.UI.banner("MYSTERY: FORTUNE!", "gold");
          } else {
            g.spawnEnemy(U.choose(["elite", "tank", "assassin", "mage"]), x + 80, true);
            g.toast("MYSTERY: A CHALLENGER!", "boss");
            SL.UI.banner("MYSTERY: A CHALLENGER!", "boss");
          }
          break;
        }
        case "merchant": {
          this.active = { kind, t: 0, done: false };
          g.spawnPickup("gem", x, g.groundY - 40);
          g.spawnPickup("gem", x + 60, g.groundY - 40);
          g.toast("A WANDERING MERCHANT!", "synergy");
          SL.UI.banner("A WANDERING MERCHANT!", "green");
          break;
        }
        case "challenge": {
          this.active = { kind, t: 0, done: false };
          this._queueWave(["shield", "grunt", "archer"], 0.6);
          this._queueWave(["tank", "mage"], 1.6);
          this._queueWave(["grunt", "grunt", "mage", "shield"], 2.6);
          g.toast("CHALLENGE ACCEPTED!", "boss");
          SL.UI.banner("CHALLENGE ACCEPTED!", "boss");
          break;
        }
      }
    }

    _queueWave(types, delay) {
      this.waveQueue.push({ types, delay, t: 0 });
    }

    _updateEvent(dt) {
      if (this.active) {
        this.active.t += dt;
        if (this.active.kind === "survival" && this.active.t >= this.active.survive) {
          for (let i = 0; i < 4; i++) this.game.spawnPickup("coin", this.game.player.x + (Math.random() - 0.5) * 200, this.game.groundY - 40 - Math.random() * 60);
          this.game.spawnPickup("gem", this.game.player.x, this.game.groundY - 50);
          this.active.done = true;
          this.active = null;
        }
      }

      for (let i = this.waveQueue.length - 1; i >= 0; i--) {
        const w = this.waveQueue[i];
        w.t += dt;
        if (w.t >= w.delay) {
          const g = this.game;
          const x = g.player.x + g.viewW * 0.7;
          for (const type of w.types) g.spawnEnemy(type, x + Math.random() * 120);
          this.waveQueue.splice(i, 1);
        }
      }
    }

    /* ---------- integration helpers ---------- */
    applyEncounterToSegment(seg) {
      if (seg.encounter && seg.encounter.template) {
        const g = this.game;
        const t = seg.encounter;
        const cx = seg.x0 + (seg.x1 - seg.x0) / 2;
        seg.spawned = [];
        for (let i = 0; i < t.types.length; i++) {
          const ex = cx + (i - (t.types.length - 1) / 2) * 52;
          const e = new SL.Entities.Enemy(g, t.types[i], ex, t.elite && i === 0);
          g.enemies.push(e);
          seg.spawned.push(e.id);
        }
      }
    }

    notifyKill(e) {
      this.releaseAttack(e);
      this._kills++;
      // on a kill streak, enemies briefly play safer
      if (this._kills % 6 === 0) this.react.combo = 1;
    }
  }

  SL.Aidirector = { Aidirector, TEMPLATES };

})(window.SL = window.SL || {});

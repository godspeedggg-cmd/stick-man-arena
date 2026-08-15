/* ============================================================
 * Stickman: Warrior's Legacy
 * worldgen.js — modular procedural world generator.
 *
 * Replaces flat chunk spam with connected, validated room
 * segments. Each run builds a unique sequence of rooms
 * (open battlefields, corridors, verticals, bridges, tunnels,
 * ruins, multi-level arenas, forest paths, traps, treasure,
 * elite, secret and boss arenas) with random layouts, enemy
 * groups, hazards, platform positions, rewards, secrets and
 * events. Recently used patterns are tracked so the run never
 * repeats itself.
 *
 * Segments are seeded per index, deterministic per run seed,
 * and validated before being committed so every room stays
 * playable (enter/exit reachable, no impossible jumps,
 * survivable hazards, valid spawns).
 * ============================================================ */
(function (SL) {
  "use strict";
  const U = SL.U;

  const SEG_LEN = 900;        // px per room segment
  const JUMP_MAX = 133;       // max jump height (player physics)
  const JUMP_REACH = 175;     // max horizontal jump distance
  const RECENT_WINDOW = 4;    // anti-repetition window

  /* ------------------------------------------------------------
   * Room types
   * ------------------------------------------------------------ */
  const ROOMS = {
    open: {
      name: "Open Battlefield", weight: 18,
      desc: "Flat ground, wide sight lines.",
    },
    corridor: {
      name: "Corridor", weight: 11,
      desc: "Narrow passage, hazards close in.",
    },
    vertical: {
      name: "Vertical Rise", weight: 8,
      desc: "Towering platforms.",
    },
    bridge: {
      name: "Shattered Bridge", weight: 9,
      desc: "Collapsing spans over a hazard.",
    },
    tunnel: {
      name: "Dark Tunnel", weight: 7,
      desc: "Little light, ambushes breed.",
    },
    ruins: {
      name: "Ancient Ruins", weight: 9,
      desc: "Falling stone, broken pillars.",
    },
    multiarena: {
      name: "Tiered Arena", weight: 7,
      desc: "Multi-level combat ground.",
    },
    forestpath: {
      name: "Forest Path", weight: 11,
      desc: "Roots and undergrowth.",
    },
    trap: {
      name: "Trap Gallery", weight: 7,
      desc: "Survive the gauntlet for loot.",
    },
    treasure: {
      name: "Treasury", weight: 6,
      desc: "Rich pickings, light guard.",
    },
    elite: {
      name: "Elite Keep", weight: 5,
      desc: "A champion holds this ground.",
    },
    secret: {
      name: "Hidden Sanctum", weight: 4,
      desc: "Concealed riches.",
    },
    machine: {
      name: "Ancient Machine", weight: 6,
      desc: "Power an old device to open the vault.",
    },
    boss: {
      name: "Boss Arena", weight: 0,
      desc: "The zone's lord awaits.",
    },
  };

  const ROOM_KEYS = Object.keys(ROOMS);

  /* ------------------------------------------------------------
   * Encounter templates (structured enemy groups)
   * ------------------------------------------------------------ */
  const TEMPLATES = {
    patrol:      { types: ["grunt", "grunt"], count: 2, elite: false },
    archerDefense: { types: ["shield", "archer", "archer"], count: 3, elite: false },
    assassinAmbush: { types: ["assassin", "assassin", "grunt"], count: 3, elite: false },
    tankWall:    { types: ["tank", "archer", "grunt"], count: 3, elite: false },
    swarm:       { types: ["grunt", "grunt", "grunt", "grunt"], count: 4, elite: false },
    eliteGuard:  { types: ["grunt", "shield", "mage"], count: 3, elite: true },
    darkPack:    { types: ["mage", "assassin", "grunt"], count: 3, elite: false },
    ironBrigade: { types: ["shield", "shield", "archer"], count: 3, elite: false },
    bloodMages:  { types: ["mage", "mage", "tank"], count: 3, elite: false },
    hunt:        { types: ["archer", "assassin", "grunt", "grunt"], count: 4, elite: false },
  };

  /* ------------------------------------------------------------
   * World events
   * ------------------------------------------------------------ */
  const EVENT_WEIGHTS = {
    ambush: 16, raid: 12, treasureRush: 14, survival: 12, escape: 10,
    mystery: 12, merchant: 14, challenge: 10,
  };

  /* ------------------------------------------------------------
   * WorldGen
   * ------------------------------------------------------------ */
  class WorldGen {
    constructor(game) {
      this.game = game;
      this.seed = 1;
      this.segments = {};     // idx -> segment
      this.recent = [];       // recently used room keys
      this.pathMod = null;    // active branching-path override
    }

    setSeed(seed) {
      this.seed = seed >>> 0;
      this.segments = {};
      this.recent = [];
      this.pathMod = null;
      this.lastJunction = 0;
    }

    segmentIndex(x) { return Math.floor(x / SEG_LEN); }

    zoneForSeg(idx) {
      const zoneIdx = Math.floor((idx * SEG_LEN) / (SL.Levels.ZONE_LENGTH * 60));
      return SL.Levels.ZONES[zoneIdx % SL.Levels.ZONES.length];
    }

    segmentFor(idx) {
      idx = Math.max(0, Math.floor(idx));
      if (this.segments[idx]) return this.segments[idx];
      const seg = this._generate(idx);
      this.segments[idx] = seg;
      return seg;
    }

    _generate(idx) {
      const zone = this.zoneForSeg(idx);
      const zoneId = zone.id;
      const dist = (idx * SEG_LEN) / 60; // meters at segment start
      const rng = U.mulberry32((this.seed ^ (idx * 2654435761)) >>> 0);
      const x0 = idx * SEG_LEN;

      // boss arena at each zone boundary (~every ZONE_LENGTH meters)
      const isBoss = Math.floor((idx * SEG_LEN) / (SL.Levels.ZONE_LENGTH * 60))
        !== Math.floor(((idx + 1) * SEG_LEN - 1) / (SL.Levels.ZONE_LENGTH * 60));

      let type;
      let junctionSeg = false;
      if (isBoss) type = "boss";
      else if (this.pathMod && this.pathMod.remaining > 0) {
        type = this.pathMod.type;
        this.pathMod.remaining--;
        if (this.pathMod.remaining <= 0) this.pathMod = null;
      } else {
        type = this._pickRoomType(zoneId, dist, rng);
      }

      // occasional junction: the run branches here (calm open room, then a choice)
      if (!isBoss && !this.pathMod && idx >= 4 && idx - this.lastJunction >= 5 && rng() < 0.45) {
        this.lastJunction = idx;
        type = "open";
        junctionSeg = true;
      }

      const seg = {
        idx, x0, x1: x0 + SEG_LEN, zoneId, type,
        name: ROOMS[type].name, rng, dist,
        platforms: [], hazards: [], decos: [], barrels: [], breakables: [],
        encounter: null, rewards: null, feature: null, event: null,
        secret: null, junction: null, gate: null,
      };
      if (junctionSeg) {
        seg.junction = { offered: false };
        seg.rewards = { coins: 6, gems: 1, xp: 4 };
      }

      const g = this.game;
      const gy = g.groundY;

      switch (type) {
        case "open": this._genOpen(seg, zone, gy, rng, dist); break;
        case "corridor": this._genCorridor(seg, zone, gy, rng, dist); break;
        case "vertical": this._genVertical(seg, zone, gy, rng, dist); break;
        case "bridge": this._genBridge(seg, zone, gy, rng, dist); break;
        case "tunnel": this._genTunnel(seg, zone, gy, rng, dist); break;
        case "ruins": this._genRuins(seg, zone, gy, rng, dist); break;
        case "multiarena": this._genMultiArena(seg, zone, gy, rng, dist); break;
        case "forestpath": this._genForest(seg, zone, gy, rng, dist); break;
        case "trap": this._genTrap(seg, zone, gy, rng, dist); break;
        case "treasure": this._genTreasure(seg, zone, gy, rng, dist); break;
        case "elite": this._genElite(seg, zone, gy, rng, dist); break;
        case "secret": this._genSecret(seg, zone, gy, rng, dist); break;
        case "machine": this._genMachine(seg, zone, gy, rng, dist); break;
        case "boss": this._genBoss(seg, zone, gy, rng, dist); break;
      }

      if (junctionSeg) {
        seg.encounter = null;
        seg.gate = null;
        seg.event = null;
      }

      this._validate(seg, gy);
      return seg;
    }

    /* ---------- room type selection with anti-repetition ---------- */
    _pickRoomType(zoneId, dist, rng) {
      // adjust weights per zone / distance
      const weights = {};
      for (const k of ROOM_KEYS) {
        if (k === "boss") { weights[k] = 0; continue; }
        let w = ROOMS[k].weight;
        // later zones: fewer safe rooms, more danger
        if (dist > 1200) {
          if (k === "treasure") w *= 0.6;
          if (k === "elite") w *= 1.6;
          if (k === "trap") w *= 1.3;
        }
        if (dist > 2400) {
          if (k === "open") w *= 0.7;
          if (k === "multiarena") w *= 1.4;
        }
        // punish recently used rooms
        const rec = this.recent.filter((r) => r === k).length;
        if (rec > 0) w /= (1 + rec * 1.6);
        weights[k] = Math.max(0.001, w);
      }
      const total = Object.values(weights).reduce((a, b) => a + b, 0);
      let r = rng() * total;
      let pick = "open";
      for (const k of ROOM_KEYS) {
        r -= weights[k];
        if (r <= 0) { pick = k; break; }
      }
      this.recent.push(pick);
      if (this.recent.length > RECENT_WINDOW) this.recent.shift();
      return pick;
    }

    /* ---------- shared helpers ---------- */
    _plat(seg, x, y, w, extra) {
      const p = Object.assign({ x, y, w, h: 16, kind: "stone", move: null, collapse: false, osc: 0 }, extra);
      seg.platforms.push(p);
      return p;
    }
    _spike(seg, zone, x, rng) {
      const n = 2 + Math.floor(rng() * 3);
      seg.hazards.push({ type: "spikes", x, y: this.game.groundY, w: n * 12, h: 14, n, hazard: true, dmg: 12, zone: zone.id });
    }
    _haz(seg, zone, type, x, extra) {
      const g = this.game;
      const gy = g.groundY;
      const base = {
        spikes: { type, x, y: gy, w: 24, h: 14, hazard: true, dmg: 12, zone: zone.id },
        lava: { type, x, y: gy, w: 70, h: 10, hazard: true, dmg: 18, zone: zone.id, burn: true },
        firejet: { type, x, y: gy, w: 18, h: 0, hazard: true, dmg: 15, zone: zone.id, cycle: Math.random(), phase: Math.random() },
        spikewall: { type, x, y: gy, w: 16, h: 46, hazard: true, dmg: 12, zone: zone.id },
        cactus: { type, x, y: gy, w: 22, h: 40, hazard: true, dmg: 9, zone: zone.id },
        icecrystal: { type, x, y: gy, w: 18, h: 26, hazard: true, dmg: 11, zone: zone.id },
        rootspike: { type, x, y: gy, w: 26, h: 18, hazard: true, dmg: 10, zone: zone.id },
        water: { type, x, y: gy, w: 130, h: 18, hazard: false, zone: zone.id, water: true },
      }[type];
      if (!base) return;
      seg.hazards.push(Object.assign(base, extra || {}));
    }
    _barrel(seg, x) {
      seg.barrels.push({ type: "barrel", x, y: this.game.groundY, w: 26, h: 30, broken: false });
    }
    /* breakable world objects (walls, crates, bridge supports, towers).
       hp is tuned against ~_meleeDmg(1) (~60 dmg per melee swing). */
    _breakable(seg, zone, x, type, extra) {
      const gy = this.game.groundY;
      const defs = {
        crate:   { w: 26, h: 26, hp: 60, effect: "crate" },
        wall:    { w: 22, h: 150, hp: 180, effect: "wall" },
        support: { w: 20, h: 70, hp: 120, effect: "support" },
        tower:   { w: 26, h: 120, hp: 180, effect: "tower" },
        machine: { w: 40, h: 62, hp: 400, effect: "machine" },
      };
      const def = defs[type];
      const o = Object.assign({
        type, x, y: gy, w: def.w, h: def.h,
        hp: def.hp, maxHp: def.hp,
        broken: false, zone: zone.id, effect: def.effect,
        segIdx: seg.idx,
      }, extra || {});
      seg.breakables.push(o);
      return o;
    }

    /* ---------- room generators ---------- */
    _genOpen(seg, zone, gy, rng, dist) {
      const n = 3 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        const x = seg.x0 + 80 + rng() * (SEG_LEN - 160);
        const roll = rng();
        if (roll < 0.5) {
          const d = { type: "tree", x, y: gy, w: 40, h: 100, s: 1, v: rng(), zone: zone.id };
          if (zone.farType === "forest") d.type = "tree";
          else if (zone.farType === "desert") d.type = "cactus";
          else if (zone.farType === "frozen") d.type = "iceTree";
          else d.type = "rock";
          seg.decos.push(d);
        } else if (roll < 0.75) {
          this._spike(seg, zone, x, rng);
        } else {
          seg.decos.push({ type: "rock", x, y: gy, w: 22, h: 14, s: 1, v: rng(), zone: zone.id });
        }
      }
      // a couple explosive barrels scattered around
      for (let i = 0; i < 2; i++) {
        this._barrel(seg, seg.x0 + 160 + rng() * (SEG_LEN - 320));
      }
      // a water pool that an ice build can freeze into a bridge
      if (rng() < 0.4) {
        this._haz(seg, zone, "water", seg.x0 + 130 + rng() * (SEG_LEN - 260));
      }
      // crates you can smash open for a small stash
      if (rng() < 0.7) {
        this._breakable(seg, zone, seg.x0 + 90 + rng() * (SEG_LEN - 180), "crate",
          { drop: { coins: 2 + Math.floor(rng() * 3), gems: rng() < 0.4 ? 1 : 0, xp: 2 } });
      }
      seg.encounter = { template: "patrol", types: ["grunt", "grunt"], count: 2, elite: false };
      if (dist > 800 && rng() < 0.4) seg.encounter.types.push(rng() < 0.5 ? "archer" : "assassin");
    }

    _genCorridor(seg, zone, gy, rng, dist) {
      // tall walls bookend the passage, dense low hazards
      seg.decos.push({ type: "wall", x: seg.x0 + 30, y: gy, w: 18, h: 240, zone: zone.id });
      seg.decos.push({ type: "wall", x: seg.x1 - 48, y: gy, w: 18, h: 240, zone: zone.id });
      const n = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const x = seg.x0 + 90 + rng() * (SEG_LEN - 180);
        const t = U.choose(["spikes", "firejet", "spikewall", "spikes"]);
        this._haz(seg, zone, t, x, t === "firejet" ? { phase: rng() } : {});
      }
      // a couple low platforms to hop over hazards
      for (let i = 0; i < 2; i++) {
        const x = seg.x0 + 140 + i * 330 + rng() * 120;
        this._plat(seg, x, gy - 72 - rng() * 20, 120 + rng() * 60, { kind: "stone" });
      }
      seg.encounter = { template: "patrol", types: ["grunt", "shield"], count: 2, elite: false };
      seg.gate = { x: seg.x1 - 60, locked: true, open: false };
      // some corridors block the exit with a destructible wall instead of a guard gate
      if (rng() < 0.55) {
        const wx = seg.x1 - 100;
        seg.decos.push({ type: "wall", x: wx, y: gy, w: 18, h: 150, zone: zone.id });
        this._breakable(seg, zone, wx, "wall", {
          openGate: true, drop: { coins: 3, gems: rng() < 0.3 ? 1 : 0, xp: 2 },
        });
        seg.encounter = { template: "patrol", types: ["grunt", "grunt"], count: 2, elite: false };
      }
    }

    _genVertical(seg, zone, gy, rng, dist) {
      // stacked platforms climbing up and down
      let y = gy - 70;
      let x = seg.x0 + 60;
      const steps = 4 + Math.floor(rng() * 3);
      for (let i = 0; i < steps; i++) {
        const w = 110 + rng() * 70;
        this._plat(seg, x, y, w, { kind: i % 2 === 0 ? "stone" : "wood" });
        x += 150 + rng() * 70;
        if (rng() < 0.5) y -= 40 + rng() * 40;
        else y += 40 + rng() * 50;
        y = U.clamp(y, gy - 120, gy - 30);
        if (x > seg.x1 - 200) break;
      }
      // archers on the high platforms
      const high = seg.platforms.filter((p) => p.y < gy - 90);
      seg.encounter = {
        template: "archerDefense",
        types: ["archer", "archer", "grunt"], count: 3, elite: false,
        platforms: high.map((p) => p.x + p.w / 2),
      };
    }

    _genBridge(seg, zone, gy, rng, dist) {
      // hazard below, collapsing/moving spans above
      this._haz(seg, zone, zone.id === "volcano" ? "lava" : "spikes", seg.x0 + SEG_LEN / 2, zone.id === "volcano" ? { w: SEG_LEN - 60 } : { w: SEG_LEN - 60 });
      let x = seg.x0 + 40;
      while (x < seg.x1 - 120) {
        const w = 100 + rng() * 80;
        const collapse = rng() < 0.4;
        const move = !collapse && rng() < 0.35;
        this._plat(seg, x, gy - 84, w, {
          kind: "bridge",
          collapse,
          move: move ? { axis: "y", amp: 14 + rng() * 14, speed: 1 + rng() * 0.8, phase: rng() * U.TAU } : null,
        });
        x += w + (rng() < 0.5 ? 20 + rng() * 30 : 0);
      }
      seg.encounter = { template: "tankWall", types: ["tank", "archer", "grunt"], count: 3, elite: false };
      seg.feature = { type: "wind", x: seg.x0, w: SEG_LEN, dir: 1, strength: 0.12 };
      if (rng() < 0.35) {
        seg.encounter.types.push("tank");
        seg.encounter.count = 4;
      }
      // bridge support pillar: destroy it to collapse the span and reveal a hidden route
      seg.bridge = { supports: [], collapsed: false, collapseT: 0, done: false, routeRevealed: false };
      const supX = seg.x1 - 200;
      seg.bridge.supports.push(this._breakable(seg, zone, supX, "support",
        { drop: { coins: 4, gems: 1, xp: 4 } }));
      // hidden stash on a shelf near the far exit, materialized only after the collapse
      seg.bridge.secret = { x: seg.x1 - 190, y: gy - 120, w: 130 };
    }

    _genTunnel(seg, zone, gy, rng, dist) {
      seg.feature = { type: "darkness", x: seg.x0, w: SEG_LEN };
      // low ceiling illusion + floor spikes
      seg.decos.push({ type: "wall", x: seg.x0 + 20, y: gy - 200, w: SEG_LEN - 40, h: 30, zone: zone.id });
      const n = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const x = seg.x0 + 70 + rng() * (SEG_LEN - 140);
        this._haz(seg, zone, "spikes", x);
      }
      for (let i = 0; i < 2; i++) {
        const x = seg.x0 + 120 + i * 360 + rng() * 80;
        this._plat(seg, x, gy - 64 - rng() * 26, 90 + rng() * 50, { kind: "stone" });
      }
      seg.encounter = { template: "darkPack", types: ["mage", "assassin", "grunt"], count: 3, elite: false };
    }

    _genRuins(seg, zone, gy, rng, dist) {
      // broken pillars + falling rocks
      const pillars = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < pillars; i++) {
        const x = seg.x0 + 80 + rng() * (SEG_LEN - 160);
        const h = 90 + rng() * 100;
        seg.decos.push({ type: "pillar", x, y: gy, w: 26, h, broken: rng() < 0.5, zone: zone.id });
      }
      seg.feature = { type: "rockfall", x: seg.x0, w: SEG_LEN, interval: 2.6 + rng() * 1.5, spots: [] };
      for (let i = 0; i < 4; i++) {
        seg.feature.spots.push(seg.x0 + 80 + rng() * (SEG_LEN - 160));
      }
      const n = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        const x = seg.x0 + 100 + rng() * (SEG_LEN - 200);
        this._haz(seg, zone, U.choose(["spikes", "firejet"]), x, { phase: rng() });
      }
      for (let i = 0; i < 2; i++) {
        const x = seg.x0 + 140 + i * 330 + rng() * 90;
        this._plat(seg, x, gy - 66 - rng() * 34, 110 + rng() * 60, { kind: "stone" });
      }
      // barrels among the rubble
      for (let i = 0; i < 2; i++) this._barrel(seg, seg.x0 + 120 + rng() * (SEG_LEN - 240));
      // a tower you can knock down onto nearby enemies + a crate
      if (rng() < 0.7) {
        const tx = seg.x0 + 120 + rng() * (SEG_LEN - 240);
        this._breakable(seg, zone, tx, "tower");
        seg.decos.push({ type: "pillar", x: tx, y: gy, w: 26, h: 120, broken: false, zone: zone.id });
      }
      this._breakable(seg, zone, seg.x0 + 200 + rng() * (SEG_LEN - 400), "crate",
        { drop: { coins: 3, gems: rng() < 0.4 ? 1 : 0, xp: 2 } });
      seg.encounter = { template: "hunt", types: ["archer", "assassin", "grunt", "grunt"], count: 4, elite: false };
    }

    _genMultiArena(seg, zone, gy, rng, dist) {
      // wide tiered arena, elite fight
      this._plat(seg, seg.x0 + 120, gy - 60, 200, { kind: "stone" });
      this._plat(seg, seg.x0 + 420, gy - 112, 200, { kind: "stone", move: { axis: "x", amp: 40, speed: 0.9, phase: 0 } });
      this._plat(seg, seg.x0 + 700, gy - 64, 190, { kind: "stone" });
      this._haz(seg, zone, "spikes", seg.x0 + SEG_LEN - 120);
      seg.encounter = { template: "eliteGuard", types: ["grunt", "shield", "mage"], count: 3, elite: true };
      if (dist > 900) {
        seg.encounter.types.push("archer");
        seg.encounter.count = 4;
      }
    }

    _genForest(seg, zone, gy, rng, dist) {
      const n = 5 + Math.floor(rng() * 5);
      for (let i = 0; i < n; i++) {
        const x = seg.x0 + 40 + rng() * (SEG_LEN - 80);
        seg.decos.push({ type: "tree", x, y: gy, w: 40 + rng() * 20, h: 90 + rng() * 40, s: 1, v: rng(), zone: zone.id });
      }
      const nH = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < nH; i++) {
        const x = seg.x0 + 90 + rng() * (SEG_LEN - 180);
        this._haz(seg, zone, "rootspike", x);
      }
      for (let i = 0; i < 2; i++) {
        const x = seg.x0 + 120 + i * 360 + rng() * 100;
        this._plat(seg, x, gy - 56 - rng() * 30, 100 + rng() * 60, { kind: "wood" });
      }
      // forest ponds — freeze them with an ice build for safe footing
      if (rng() < 0.5) {
        this._haz(seg, zone, "water", seg.x0 + 140 + rng() * (SEG_LEN - 280));
      }
      if (rng() < 0.6) {
        this._breakable(seg, zone, seg.x0 + 100 + rng() * (SEG_LEN - 200), "crate",
          { drop: { coins: 2 + Math.floor(rng() * 2), gems: rng() < 0.3 ? 1 : 0, xp: 2 } });
      }
      seg.encounter = { template: "hunt", types: ["grunt", "archer", "grunt"], count: 3, elite: false };
    }

    _genTrap(seg, zone, gy, rng, dist) {
      // gauntlet of hazards + treasure at the end
      const n = 4 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const x = seg.x0 + 60 + i * ((SEG_LEN - 120) / (n + 1));
        this._haz(seg, zone, U.choose(["firejet", "spikes", "spikewall", "lava"]), x, { phase: rng() });
      }
      // narrow stepping stones
      let x = seg.x0 + 90;
      while (x < seg.x1 - 150) {
        this._plat(seg, x, gy - 70, 70 + rng() * 40, { kind: "stone", collapse: rng() < 0.3 });
        x += 90 + rng() * 40;
      }
      seg.rewards = { coins: 6 + Math.floor(rng() * 5), gems: 0, xp: 10 + Math.floor(rng() * 6) };
      seg.encounter = null;
    }

    _genTreasure(seg, zone, gy, rng, dist) {
      // chests / rich pickups, light guard
      seg.rewards = { coins: 8 + Math.floor(rng() * 6), gems: 1 + Math.floor(rng() * 3), xp: 8 + Math.floor(rng() * 5) };
      seg.decos.push({ type: "chest", x: seg.x0 + SEG_LEN - 140, y: gy, w: 34, h: 26, zone: zone.id });
      seg.encounter = { template: "patrol", types: ["grunt"], count: 1, elite: false };
      if (dist > 1000 && rng() < 0.35) seg.encounter.types.push("shield");
    }

    _genElite(seg, zone, gy, rng, dist) {
      seg.rewards = { coins: 5 + Math.floor(rng() * 4), gems: 2 + Math.floor(rng() * 2), xp: 12 + Math.floor(rng() * 6) };
      this._plat(seg, seg.x0 + SEG_LEN / 2 - 100, gy - 60, 200, { kind: "stone" });
      this._haz(seg, zone, "spikes", seg.x0 + SEG_LEN - 100);
      seg.encounter = { template: "eliteGuard", types: ["grunt", "mage", "shield"], count: 3, elite: true };
      if (rng() < 0.5) seg.encounter.types.push("assassin");
    }

    _genSecret(seg, zone, gy, rng, dist) {
      // hidden upper shelf with loot; door opens when reached
      const h = 84 + rng() * 24;
      this._plat(seg, seg.x0 + 140, gy - h, 150, { kind: "stone", secret: true });
      seg.secret = { platformX: seg.x0 + 140, platformY: gy - h, revealed: false };
      seg.rewards = { coins: 10 + Math.floor(rng() * 6), gems: 2 + Math.floor(rng() * 3), xp: 10 + Math.floor(rng() * 6) };
      seg.decos.push({ type: "chest", x: seg.x0 + 150, y: gy - h, w: 34, h: 26, zone: zone.id });
      seg.encounter = null;
    }

    _genMachine(seg, zone, gy, rng, dist) {
      // an ancient machine guards a vault. Smash it, or power it with lightning.
      const mx = seg.x0 + SEG_LEN - 190;
      const mach = this._breakable(seg, zone, mx, "machine", {
        drop: { coins: 6 + Math.floor(rng() * 4), gems: 1 + Math.floor(rng() * 2), xp: 6 + Math.floor(rng() * 4) },
      });
      seg.machine = { x: mx + 20, y: gy - 62, charges: 0, needed: 3 };
      seg.gate = { x: mx - 20, locked: true, open: false };
      seg.decos.push({ type: "chest", x: seg.x0 + SEG_LEN - 90, y: gy, w: 34, h: 26, zone: zone.id });
      seg.encounter = { template: "ironBrigade", types: ["shield", "shield", "archer"], count: 3, elite: false };
      if (dist > 1000 && rng() < 0.4) {
        seg.encounter.types.push("mage");
        seg.encounter.count = 4;
      }
      if (rng() < 0.5) {
        this._barrel(seg, seg.x0 + 120 + rng() * 300);
      }
    }

    _genBoss(seg, zone, gy, rng, dist) {
      // wide open arena, sealed
      seg.decos.push({ type: "wall", x: seg.x0 + 20, y: gy, w: 20, h: 260, zone: zone.id });
      seg.decos.push({ type: "wall", x: seg.x1 - 40, y: gy, w: 20, h: 260, zone: zone.id });
      seg.encounter = null;
      seg.gate = { x: seg.x0 + 30, locked: true, open: false, bossGate: true };
    }

    /* ---------- validation ---------- */
    _validate(seg, gy) {
      const remove = [];
      for (const p of seg.platforms) {
        const reachable = this._platformReachable(seg, p, gy);
        if (!reachable) remove.push(p);
      }
      if (remove.length) {
        for (const p of remove) seg.platforms.splice(seg.platforms.indexOf(p), 1);
      }
      // trap rooms need at least 1 stepping stone or they are unplayable
      if (seg.type === "trap" && !seg.platforms.length) {
        this._plat(seg, seg.x0 + SEG_LEN / 2 - 60, gy - 70, 120, { kind: "stone" });
      }
      // gate must not be at the very entrance of a segment
      if (seg.gate && seg.gate.x < seg.x0 + 80) seg.gate.x = seg.x0 + 80;
    }

    _platformReachable(seg, p, gy) {
      // reachable from the ground below or from another platform
      if (gy - p.y <= JUMP_MAX) return true;
      for (const o of seg.platforms) {
        if (o === p) continue;
        if (o.y < p.y) continue; // must step UP
        const dy = p.y - o.y;
        if (dy <= 0) continue;
        if (dy <= JUMP_MAX + 20) {
          // horizontal overlap or short gap to step across
          const gap = Math.max(0, Math.max(o.x, p.x) - Math.min(o.x + o.w, p.x + p.w));
          if (gap <= JUMP_REACH) return true;
        }
      }
      return false;
    }

    /* ---------- branching paths ---------- */
    offerPath(seg) {
      const safe = seg.dist < 2400 ? 1 : 0;
      const options = [];
      options.push({ id: "safe", name: "SAFE PATH", icon: "\u2764",
        desc: "Low enemy density, modest reward.", danger: 0.5, reward: 1.0 });
      options.push({ id: "battle", name: "BATTLE PATH", icon: "\u2694",
        desc: "Heavy combat, better reward.", danger: 1.4, reward: 1.5 });
      if (Math.random() < 0.5 + safe) {
        options.push({ id: "treasure", name: "TREASURE PATH", icon: "\u25c9",
          desc: "Traps and loot.", danger: 0.9, reward: 1.8, room: "treasure" });
      }
      options.push({ id: "elite", name: "ELITE PATH", icon: "\u2605",
        desc: "A champion stands in your way... and drops a rare reward.", danger: 1.8, reward: 2.2, room: "elite" });
      if (Math.random() < 0.4) {
        options.push({ id: "secret", name: "SECRET PATH", icon: "\u2726",
          desc: "A hidden chamber of riches.", danger: 0.6, reward: 2.0, room: "secret" });
      }
      return options.slice(0, 4);
    }

    applyPath(game, option) {
      this.pathMod = { type: option.room || "open", remaining: 1, reward: option.reward, danger: option.danger };
      // next segments get heavier / lighter via path modifier applied in _generate
      if (game.director) game.director.biasFor(option);
      if (option.room) {
        // ensure the forced room is actually generated next
        this.pathMod.type = option.room;
        this.pathMod.remaining = 1;
      }
      SL.UI.toast(option.name + " chosen!", "zone");
    }

    /* ---------- queries ---------- */
    segmentsInRange(x0, x1) {
      const i0 = this.segmentIndex(x0), i1 = this.segmentIndex(x1);
      const out = [];
      for (let i = i0; i <= i1; i++) out.push(this.segmentFor(i));
      return out;
    }
    platformsInRange(x0, x1) {
      const out = [];
      for (const seg of this.segmentsInRange(x0, x1)) {
        for (const p of seg.platforms) {
          if (p.x + p.w >= x0 && p.x <= x1) out.push(p);
        }
      }
      return out;
    }
    hazardsInRange(x0, x1) {
      const out = [];
      for (const seg of this.segmentsInRange(x0, x1)) {
        for (const h of seg.hazards) {
          if (h.x + h.w >= x0 && h.x <= x1) out.push(h);
        }
      }
      return out;
    }
    decosInRange(x0, x1) {
      const out = [];
      for (const seg of this.segmentsInRange(x0, x1)) {
        for (const d of seg.decos) {
          if (d.x + d.w >= x0 && d.x <= x1) out.push(d);
        }
      }
      return out;
    }
    barrelsInRange(x0, x1) {
      const out = [];
      for (const seg of this.segmentsInRange(x0, x1)) {
        for (const b of seg.barrels) {
          if (b.x + b.w >= x0 && b.x <= x1) out.push(b);
        }
      }
      return out;
    }
    breakablesInRange(x0, x1) {
      const out = [];
      for (const seg of this.segmentsInRange(x0, x1)) {
        for (const b of seg.breakables) {
          if (b.hidden) continue;
          if (b.x + b.w >= x0 && b.x <= x1) out.push(b);
        }
      }
      return out;
    }
  }

  SL.WorldGen = { WorldGen, SEG_LEN, ROOMS, TEMPLATES, EVENT_WEIGHTS, JUMP_MAX, JUMP_REACH };

})(window.SL = window.SL || {});

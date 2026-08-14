/* jshint esversion: 8 */
/* Player animation overhaul: configurable 16-state animator + articulated renderer.
   Visual layer only - never gates input, collision, or damage logic.
   States: idle, walk, run, dash, dashRecover, jump, fall, land, attack1, attack2,
   attack3, heavyAttack, airAttack, airHeavy, hurt, death, victory, block, cast */
window.SL = window.SL || {};
window.SL.Anim = (function (SL) {
  "use strict";

  const U = SL.U;
  const H = 64; // player height unit (matches drawStickman)
  const SH_Y = -H * 0.7; // shoulder rest height (torso ~22% of height)
  const HIP_Y = -H * 0.48; // hip rest height (legs ~48%)
  const TORSO = SH_Y - HIP_Y; // ~14.1
  const ARM = H * 0.3; // shoulder -> hand reach (~30% of height)
  const LEG = H * 0.24; // hip->knee = knee->foot (legs ~48%)
  const HEAD_DIST = 6.5; // shoulder -> head center

  /* Neon-cyan warrior palette (single source of truth for colors):
     body pure #000000, armor/energy #00FFFF, gems deep blue/purple.
     No skin, no white outlines, no random colors. */
  const PAL = {
    body: "#000000",
    armor: "#00FFFF",
    armorHi: "#8CFFFF",
    core: "#E8FFFF",
    gem: "#241a66",
    gemHi: "#5a3bd8",
    face: "#05070d"
  };

  function dir(ang, len, dx, dy) {
    return { x: Math.cos(ang) * len + (dx || 0), y: Math.sin(ang) * len + (dy || 0) };
  }

  function easeIn(x) { return x * x * x; }
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }

  /* ------------------------------------------------------------------ */
  /* Config                                                            */
  /* ------------------------------------------------------------------ */

  const CONFIG = {
    comboWindow: 0.35, // seconds a follow-up attack may chain
    defaultGrip: 2,
    footPlant: 0.5, // foot adjust strength on run cycle
    runSpeedT: 0.5,
    runPhaseMult: 0.045,
    dodgeBounce: 0.25,
    hurtBounce: 0.3,
    airAttackBounce: 0.22,
    camera: {
      light: { mag: 2.2, dur: 0.12 },
      heavy: { mag: 4.5, dur: 0.18 },
      boss: { mag: 7.5, dur: 0.28 },
      heavyFall: { mag: 5.5, dur: 0.2 },
      landing: { mag: 2.0, dur: 0.12 },
      hit: { mag: 2.5, dur: 0.14 }
    },
    hitstop: {
      light: 0.03,
      heavy: 0.06,
      boss: 0.09,
      max: 0.12
    },
    trailFade: 0.28, // seconds weapon trail arcs persist
    trailMax: 14,
    particles: {
      dustPerSec: 26,
      landDust: 8,
      impactSparks: 10,
      impactHeavy: 16,
      bowMuzzle: 6,
      staffPuff: 8
    }
  };

  const WEAPONS = {
    sword: {
      kind: "sword", label: "Sword", speed: 1.0,
      idle: { stance: "combat", wep: -2.3, handX: 0.18, handY: 0.12, hip: 0.06, grip: 2, bob: 1 },
      combos: [
        { startup: 0.07, active: 0.09, recovery: 0.12, arc: [-2.05, -0.85], follow: 0.35 },
        { startup: 0.07, active: 0.10, recovery: 0.12, arc: [-0.7, -2.3], follow: 0.3 },
        { startup: 0.12, active: 0.11, recovery: 0.16, arc: [-2.7, -0.2], follow: 0.5 }
      ],
      heavy: { startup: 0.2, active: 0.16, recovery: 0.24, arc: [-2.9, -0.15], follow: 0.6 },
      trail: "#cfe7ff", heavyTrail: "#ffd27a"
    },
    dagger: {
      kind: "dagger", label: "Dagger", speed: 0.85,
      idle: { stance: "crouch", wep: -1.85, handX: 0.2, handY: 0.16, hip: 0.03, grip: 2, bob: 1.2 },
      combos: [
        { startup: 0.06, active: 0.07, recovery: 0.10, arc: [-1.95, -1.05], follow: 0.25 },
        { startup: 0.06, active: 0.07, recovery: 0.10, arc: [-0.9, -2.15], follow: 0.22 },
        { startup: 0.09, active: 0.09, recovery: 0.13, arc: [-2.5, -0.5], follow: 0.35 }
      ],
      heavy: { startup: 0.18, active: 0.14, recovery: 0.22, arc: [-2.7, -0.3], follow: 0.5 },
      trail: "#e0a0ff", heavyTrail: "#ff9de0"
    },
    axe: {
      kind: "axe", label: "Axe", heavy: true, speed: 1.15,
      idle: { stance: "wide", wep: -2.6, handX: 0.1, handY: 0.02, hip: 0.1, grip: 2, bob: 0.8 },
      combos: [
        { startup: 0.11, active: 0.10, recovery: 0.15, arc: [-2.2, -0.7], follow: 0.5 },
        { startup: 0.11, active: 0.11, recovery: 0.15, arc: [-0.8, -2.4], follow: 0.45 },
        { startup: 0.16, active: 0.13, recovery: 0.2, arc: [-2.85, -0.2], follow: 0.7 }
      ],
      heavy: { startup: 0.26, active: 0.18, recovery: 0.3, arc: [-3.0, -0.1], follow: 0.8 },
      trail: "#ffd27a", heavyTrail: "#ff7b2e"
    },
    bow: {
      kind: "bow", label: "Bow", speed: 1.0,
      idle: { stance: "ready", wep: -0.5, handX: 0.3, handY: 0.16, hip: 0.04, grip: 2, bob: 0.9 },
      combos: [
        { startup: 0.1, active: 0.08, recovery: 0.12, draw: -1.6, aim: -0.3, release: 0.75, follow: 0.3 },
        { startup: 0.1, active: 0.08, recovery: 0.12, draw: -1.7, aim: -0.35, release: 0.75, follow: 0.3 },
        { startup: 0.12, active: 0.09, recovery: 0.14, draw: -1.8, aim: -0.4, release: 0.72, follow: 0.35 }
      ],
      heavy: { startup: 0.22, active: 0.12, recovery: 0.24, draw: -2.0, aim: -0.2, release: 0.7, follow: 0.4 },
      trail: "#9dff8a", heavyTrail: "#eaffb0"
    },
    staff: {
      kind: "staff", label: "Staff", speed: 1.0,
      idle: { stance: "magic", wep: -0.65, handX: 0.16, handY: 0.12, hip: 0.04, grip: 1, bob: 1.1 },
      combos: [
        { startup: 0.09, active: 0.09, recovery: 0.12, raise: -1.5, thrust: -0.4, release: 0.7, follow: 0.3 },
        { startup: 0.09, active: 0.09, recovery: 0.12, raise: -1.6, thrust: -0.45, release: 0.7, follow: 0.3 },
        { startup: 0.12, active: 0.10, recovery: 0.15, raise: -1.8, thrust: -0.5, release: 0.65, follow: 0.4 }
      ],
      heavy: { startup: 0.22, active: 0.14, recovery: 0.24, raise: -2.0, thrust: -0.2, release: 0.65, follow: 0.4 },
      trail: "#b08ae0", heavyTrail: "#ff7bff"
    },
    hammer: {
      kind: "axe", label: "Hammer", heavy: true, speed: 1.1,
      idle: { stance: "wide", wep: -2.6, handX: 0.1, handY: 0.02, hip: 0.1, grip: 2, bob: 0.8 },
      combos: [
        { startup: 0.11, active: 0.10, recovery: 0.15, arc: [-2.2, -0.7], follow: 0.5 },
        { startup: 0.11, active: 0.11, recovery: 0.15, arc: [-0.8, -2.4], follow: 0.45 },
        { startup: 0.16, active: 0.13, recovery: 0.2, arc: [-2.85, -0.2], follow: 0.7 }
      ],
      heavy: { startup: 0.26, active: 0.18, recovery: 0.3, arc: [-3.0, -0.1], follow: 0.8 },
      trail: "#ffd27a", heavyTrail: "#ff7b2e"
    },
    spear: {
      kind: "spear", label: "Spear", speed: 1.0,
      idle: { stance: "combat", wep: -1.7, handX: 0.26, handY: 0.04, hip: 0.05, grip: 2, bob: 1 },
      combos: [
        { startup: 0.09, active: 0.08, recovery: 0.13, pull: -2.1, thrust: 0.15, follow: 0.35 },
        { startup: 0.09, active: 0.08, recovery: 0.13, pull: -1.9, thrust: 0.0, follow: 0.35 },
        { startup: 0.12, active: 0.10, recovery: 0.16, pull: -2.2, thrust: 0.2, follow: 0.45 }
      ],
      heavy: { startup: 0.24, active: 0.14, recovery: 0.26, pull: -2.4, thrust: 0.3, follow: 0.6 },
      trail: "#a8d8ff", heavyTrail: "#ffd27a"
    }
  };

  function weaponFor(warrior) {
    if (!warrior) return WEAPONS.sword;
    const kind = warrior.weaponKind || warrior.weapon || "sword";
    if (WEAPONS[kind]) return WEAPONS[kind];
    if (kind === "melee") {
      const w = warrior.id === "berserker" ? WEAPONS.axe : (warrior.id === "assassin" ? WEAPONS.dagger : WEAPONS.sword);
      return w;
    }
    if (kind === "ranged") return warrior.id === "shadowmage" ? WEAPONS.staff : WEAPONS.bow;
    return WEAPONS[kind] || WEAPONS.sword;
  }

  function timingsFor(anim, a, kind) {
    const w = kind === "heavy" ? anim.cfg.heavy : anim.cfg.combos[Math.min(a.combo, anim.cfg.combos.length - 1)];
    const speed = anim.attackSpeed || 1;
    return {
      startup: w.startup / speed,
      active: w.active / speed,
      recovery: w.recovery / speed,
      dur: (w.startup + w.active + w.recovery) / speed,
      w: w,
      speed: speed
    };
  }

  /* ------------------------------------------------------------------ */
  /* Animator                                                          */
  /* ------------------------------------------------------------------ */

  class PlayerAnimator {
    constructor(player, warrior) {
      this.p = player;
      this.game = player.game;
      this.warrior = warrior;
      this.cfg = weaponFor(warrior);
      this._seed = Math.random() * 6.28;

      this.state = "idle";
      this.stateT = 0;
      this.phase = 0;
      this.speedSmooth = 0;
      this.lean = 0;
      this.attackSpeed = 1;
      this._fxT2 = 0;
      this._slamDone = false;
      this._slamFlash = 0;

      this.pose = this._makePose();
      this.t = this._makePose();
      this.handMode = "weapon";
      this.trailArr = [];
      this._fxT = 0;
      this._wasOnGround = true;
      this._impactFlash = 0;
      this._guardian = warrior && warrior.id === "guardian";
    }

    _makePose() {
      return {
        hipDX: 0, hipDY: HIP_Y, bodyRot: 0, headAngle: 0,
        shDX: 0, shDY: SH_Y, headDX: 0, headDY: SH_Y - HEAD_DIST,
        hfDX: 0, hfDY: 0, hbDX: 0, hbDY: 0,
        ffDX: 0, ffDY: 0, fbDX: 0, fbDY: 0,
        wep: -2.3, grip: 2, squash: 0, stretch: 0, charge: 0, handMode: "weapon",
        crouch: 0, hurt: 0, armSwing: 0
      };
    }

    reset() {
      this.state = "idle";
      this.stateT = 0;
      this.pose = this._makePose();
      this.t = this._makePose();
      this.trailArr.length = 0;
      this.phase = 0;
      this.speedSmooth = 0;
      this.lean = 0;
    }

    /* Called by Player.startAttack to compute config-driven duration and
       reset the state machine to the attack state (visual only). */
    beginAttack(type, combo) {
      const kind = (type === "heavy" || type === "airHeavy") ? "heavy" : (type === "air" ? "air" : "combo");
      const temp = { type, combo: combo || 0 };
      this.currentTiming = timingsFor(this, temp, kind);
      this.state = type === "heavy" ? "heavyAttack" :
        type === "airHeavy" ? "airHeavy" :
        type === "air" ? "airAttack" : "attack" + (combo + 1);
      this.stateT = 0;
      return this.currentTiming;
    }

    beginVictory() {
      this.state = "victory";
      this.stateT = 0;
    }

    /* ---- helpers ---- */

    _smo(cur, tgt, k, dt) {
      const a = Math.min(1, k * dt);
      return cur + (tgt - cur) * a;
    }

    _nearEnemy() {
      const g = this.game;
      if (!g || !g.enemies) return false;
      for (let i = 0; i < g.enemies.length; i++) {
        const e = g.enemies[i];
        if (e.dead) continue;
        if (Math.abs(e.x - this.p.x) < 240 && e.y > this.p.y - 320 && e.y < this.p.y + 80) return true;
      }
      return false;
    }

    _desired() {
      const p = this.p;
      if (p.dead) return "death";
      if (p.victoryT > 0) return "victory";
      if (p.hurtT > 0 && p.dashTimer <= 0) return "hurt";
      if (p.dashTimer > 0) return "dash";
      if (p.dashRecoverT > 0) return "dashRecover";
      if (p.castTimer > 0 && !p.attack) return "cast";
      if (p.attack) {
        const a = p.attack;
        if (a.type === "heavy") return "heavyAttack";
        if (a.type === "air" || a.type === "airHeavy") return a.type === "airHeavy" ? "airHeavy" : "airAttack";
        return "attack" + (a.combo + 1);
      }
      if (!p.onGround) return p.vy < -40 ? "jump" : "fall";
      if (p.landT > 0) return "land";
      const sp = Math.abs(p.vx);
      const thresh = (p.baseSpeed || 260) * (p.stats ? p.stats.speedMul || 1 : 1);
      if (sp > thresh * CONFIG.runSpeedT) return "run";
      if (sp > 25) return "walk";
      return (this._guardian && this._nearEnemy()) ? "block" : "idle";
    }

    /* ---- entry callbacks ---- */

    _onEnter(prev, next) {
      const p = this.p;
      if (next === "dash") {
        this.lean = p.dashDir === 1 ? 0.32 : -0.32;
        this._dust(p.x, p.y, 5, 0.6);
      }
      if (next === "land") {
        const strength = Math.max(0, Math.min(1, Math.abs(p.vy) / 1000));
        if (strength > 0.35) this._dust(p.x, p.y, Math.round(6 * strength), strength * 0.7);
      }
      if (next.indexOf("attack") === 0 || next === "heavyAttack" || next === "airAttack" || next === "airHeavy") {
        const a = p.attack;
        this.attackSpeed = a.speed || 1;
      }
      if (prev === "dash") this.lean = 0;
    }

    /* ---- main update ---- */

    update(dt) {
      const p = this.p;
      const pose = this.pose;
      dt = Math.min(dt, 0.05);

      const thresh = (p.baseSpeed || 260) * (p.stats ? p.stats.speedMul || 1 : 1);
      this.speedSmooth = this._smo(this.speedSmooth, Math.min(1, Math.abs(p.vx) / thresh), 8, dt);
      if (p.dashTimer <= 0 && !p.attack) {
        const leanT = Math.max(-0.22, Math.min(0.22, (p.vx / thresh) * 0.22));
        this.lean = this._smo(this.lean, leanT, 6, dt);
      }
      this.phase += Math.abs(p.vx) * dt * CONFIG.runPhaseMult;
      if (this.phase > 6.2832) this.phase -= 6.2832;

      const prev = this.state;
      const next = this._desired();
      if (next !== prev) {
        this.state = next;
        this.stateT = 0;
        this._onEnter(prev, next);
      }
      this.stateT += dt;

      // smooth squash/stretch toward 0
      pose.squash = this._smo(pose.squash, 0, 10, dt);
      pose.stretch = this._smo(pose.stretch, 0, 10, dt);
      if (pose.charge > 0) pose.charge = Math.max(0, pose.charge - dt * 3);

      this._solve(dt);
      this._smooth(dt);
      this._fx(dt);
      this._trailUpdate(dt);
      this._wasOnGround = p.onGround;
    }

    /* ---- state solving: writes targets into this.t ---- */

    _solve(dt) {
      const t = this.t;
      const p = this.p;
      const cfg = this.cfg;
      const st = this.state;
      const sT = this.stateT;
      const seed = this._seed;
      const g = this.game;

      t.grip = cfg.idle.grip;
      t.handMode = "weapon";
      t.hipDX = 0; t.hipDY = HIP_Y;
      t.bodyRot = 0; t.headAngle = 0;
      t.ffDX = 0; t.ffDY = 0; t.fbDX = 0; t.fbDY = 0;
      t.charge = this.pose.charge;
      t.crouch = 0;
      t.armSwing = 0;

      switch (st) {
        case "idle": {
          const id = cfg.idle;
          const breath = Math.sin(g.elapsed * 2.6 + seed);
          t.bodyRot = breath * 0.03;
          t.headAngle = breath * 0.05;
          t.hipDY = HIP_Y + breath * 1.2;
          t.hipDX = id.hip * H * 0.3;
          if (id.stance === "magic") {
            t.handMode = "magic";
            t.wep = id.wep;
            t.grip = 1;
          } else if (id.stance === "bow" || id.stance === "ready") {
            t.handMode = "bow";
            t.wep = id.wep;
            t.charge = 0.15;
          } else {
            t.wep = id.wep;
            t.grip = id.grip;
          }
          t.ffDX = id.hip * H * 0.5; t.ffDY = 0;
          t.fbDX = -id.hip * H * 0.5; t.fbDY = 0;
          break;
        }
        case "block": {
          t.bodyRot = 0.06;
          t.headAngle = 0.05;
          t.wep = -1.05;
          t.grip = 2;
          t.hipDX = -H * 0.06;
          t.hipDY = HIP_Y - 1.5;
          t.ffDX = H * 0.16; t.ffDY = 0;
          t.fbDX = -H * 0.16; t.fbDY = 0;
          break;
        }
        case "walk":
        case "run": {
          const sp = this.speedSmooth;
          const ph = this.phase;
          const sw = st === "run" ? (0.5 + sp * 0.55) : (0.26 + sp * 0.3);
          const f = Math.sin(ph);
          const b = Math.sin(ph + Math.PI);
          t.bodyRot = this.lean + Math.sin(ph) * 0.03;
          t.headAngle = -t.bodyRot * 0.4;
          t.hipDY = HIP_Y + Math.abs(Math.sin(ph)) * 0.6;
          t.ffDX = f * sw * H; t.ffDY = Math.max(0, -Math.cos(ph)) * H * 0.14;
          t.fbDX = b * sw * H; t.fbDY = Math.max(0, -Math.cos(ph + Math.PI)) * H * 0.14;
          const swing = Math.sin(ph + seed);
          t.armSwing = swing;
          t.hfDX = H * (0.13 + sp * 0.05) + swing * H * 0.04; t.hfDY = H * 0.08 - Math.abs(swing) * H * 0.05;
          t.hbDX = -H * 0.12 - swing * H * 0.05; t.hbDY = H * 0.12;
          t.handMode = "relaxed";
          t.wep = cfg.idle.wep;
          break;
        }
        case "dash": {
          const d = p.dashDir;
          const inT = Math.min(1, sT / 0.1);
          const outT = Math.max(0, Math.min(1, (p.dashTimer / p.dashDur || 0)));
          const lean = d * (0.3 + easeOut(outT) * 0.12);
          t.bodyRot = lean;
          t.headAngle = d * 0.14;
          t.hipDY = HIP_Y + 1.5;
          t.ffDX = d * H * 0.42; t.ffDY = H * 0.02;
          t.fbDX = d * H * 0.1; t.fbDY = 0;
          t.handMode = "weapon";
          t.wep = d === 1 ? -1.15 : -2.35;
          t.grip = 2;
          t.stretch = 0.04;
          break;
        }
        case "dashRecover": {
          t.bodyRot = this.lean * 0.4;
          t.hipDY = HIP_Y - 1;
          t.wep = cfg.idle.wep;
          t.grip = cfg.idle.grip;
          t.handMode = "weapon";
          break;
        }
        case "jump": {
          t.bodyRot = this.lean + 0.04;
          t.headAngle = -0.06;
          t.hipDY = HIP_Y + 1;
          t.ffDX = H * 0.22; t.ffDY = -H * 0.1;
          t.fbDX = -H * 0.1; t.fbDY = -H * 0.04;
          t.armSwing = 0.35;
          t.handMode = "relaxed";
          t.wep = cfg.idle.wep;
          break;
        }
        case "fall": {
          t.bodyRot = this.lean * 0.8;
          t.headAngle = 0.04;
          t.hipDY = HIP_Y;
          t.ffDX = H * 0.28; t.ffDY = H * 0.16;
          t.fbDX = -H * 0.18; t.fbDY = H * 0.1;
          t.armSwing = 0.55;
          t.handMode = "relaxed";
          t.wep = cfg.idle.wep;
          break;
        }
        case "land": {
          const k = Math.min(1, sT / 0.16);
          const bounce = Math.sin(k * Math.PI);
          t.crouch = bounce * 0.12;
          t.bodyRot = 0;
          t.hipDY = HIP_Y + bounce * 2.5;
          t.ffDX = H * 0.2; t.ffDY = 0;
          t.fbDX = -H * 0.2; t.fbDY = 0;
          t.wep = cfg.idle.wep;
          t.grip = cfg.idle.grip;
          break;
        }
        case "hurt": {
          const k = Math.min(1, p.hurtT / (p.hurtDur || 0.3));
          const recoil = Math.sin(k * Math.PI) * CONFIG.hurtBounce;
          const d = p.facing;
          t.bodyRot = d * (0.1 + recoil);
          t.headAngle = d * 0.16;
          t.hipDX = -d * H * 0.08;
          t.hipDY = HIP_Y - recoil * 1.2;
          t.hfDX = d * H * 0.16; t.hfDY = -H * 0.06;
          t.hbDX = -d * H * 0.1; t.hbDY = H * 0.1;
          t.armSwing = 0.4;
          t.handMode = "relaxed";
          t.wep = cfg.idle.wep;
          break;
        }
        case "death": {
          const k = Math.min(1, p.deathT || sT);
          const fall = easeIn(k);
          t.bodyRot = this.p.facing * (0.1 + fall * 1.5);
          t.headAngle = this.p.facing * 0.2 * fall;
          t.hipDY = HIP_Y - fall * H * 0.05;
          t.handMode = "relaxed";
          t.hfDX = H * 0.15; t.hfDY = H * 0.12;
          t.hbDX = -H * 0.12; t.hbDY = H * 0.16;
          t.wep = cfg.idle.wep;
          break;
        }
        case "victory": {
          const k = Math.min(1, sT / 0.7);
          const raise = easeOut(Math.min(1, k * 2));
          const bob = Math.sin(g.elapsed * 3.2) * 0.03;
          t.bodyRot = bob;
          t.headAngle = 0.06;
          t.hipDY = HIP_Y;
          t.wep = -2.7 + raise * 0.5 + bob;
          t.grip = 2;
          t.ffDX = H * 0.14; t.ffDY = 0;
          t.fbDX = -H * 0.14; t.fbDY = 0;
          break;
        }
        case "cast": {
          const k = Math.min(1, p.castTimer / (p.castDur || 0.6));
          const ch = easeOut(k);
          t.handMode = "magic";
          t.grip = 1;
          t.wep = -0.6 - ch * 0.5;
          t.bodyRot = 0.05;
          t.hipDY = HIP_Y + 1;
          t.charge = 0.4 + ch * 0.6;
          t.ffDX = H * 0.2; t.ffDY = 0;
          t.fbDX = -H * 0.2; t.fbDY = 0;
          break;
        }
        case "attack1":
        case "attack2":
        case "attack3": {
          this._solveMelee(sT, t, false);
          break;
        }
        case "heavyAttack": {
          this._solveMelee(sT, t, true);
          break;
        }
        case "airAttack": {
          this._solveMelee(sT, t, false, true);
          break;
        }
        case "airHeavy": {
          this._solveMelee(sT, t, true, true);
          break;
        }
      }
    }

    _solveMelee(sT, t, heavy, air) {
      const p = this.p;
      const a = p.attack;
      if (!a) { this._solveIdleFallback(t); return; }
      const kind = heavy ? "heavy" : a.type === "air" || a.type === "airHeavy" ? "air" : "combo";
      const timing = timingsFor(this, a, kind);
      const w = timing.w;
      const start = timing.startup;
      const dur = timing.dur;
      const prog = Math.min(1, sT / dur);

      const cfg = this.cfg;
      const isBow = cfg.kind === "bow";
      const isStaff = cfg.kind === "staff";
      const isSpear = cfg.kind === "spear";

      // feet stance
      const d = p.facing;
      t.hipDX = 0; t.hipDY = HIP_Y + (air ? 0 : 0.5);
      t.ffDX = H * 0.2; t.ffDY = 0;
      t.fbDX = -H * 0.2; t.fbDY = 0;

      if (isBow) {
        t.grip = 2;
        t.handMode = "bow";
        const draw = this._easePhase(prog, start, timing.active);
        if (draw < 0.5) {
          const k = easeOut(draw / 0.5);
          t.charge = k;
          t.bodyRot = d * 0.04 + k * 0.05;
          t.headAngle = k * 0.12;
          t.wep = w.draw + (w.aim - w.draw) * k;
        } else {
          const k = easeOut(Math.min(1, (draw - 0.5) * 2));
          t.charge = 1 - k;
          t.bodyRot = d * 0.09;
          t.headAngle = 0.12 + k * 0.06;
          t.wep = w.aim;
        }
        if (air) t.bodyRot = 0.05;
        return;
      }

      if (isStaff) {
        t.grip = 1;
        t.handMode = "magic";
        const cast = this._easePhase(prog, start, timing.active);
        if (cast < 0.55) {
          const k = easeOut(cast / 0.55);
          t.charge = k;
          t.wep = w.raise + (w.thrust - w.raise) * k;
        } else {
          const k = (cast - 0.55) / 0.45;
          t.charge = 1 - k * 0.8;
          t.wep = w.thrust + k * 0.4;
        }
        t.bodyRot = 0.06;
        return;
      }

      if (isSpear) {
        t.grip = 2;
        t.handMode = "weapon";
        const thr = this._easePhase(prog, start, timing.active);
        if (thr < 0.4) {
          const k = easeIn(thr / 0.4);
          t.wep = w.pull + (w.thrust - w.pull) * k;
        } else {
          const k = easeOut(Math.min(1, (thr - 0.4) / 0.35));
          t.wep = w.thrust + k * 0.25;
        }
        t.bodyRot = d * 0.08;
        return;
      }

      // melee blade swings
      const wind = Math.min(1, sT / start);
      const swing = this._easePhase(prog, start, timing.active);
      t.grip = 2;
      t.handMode = "weapon";
      t.charge = 0;

      if (wind < 1) {
        // wind-up: pull back toward arc start
        const k = easeIn(wind);
        const from = (air ? -1.9 : -2.35) + d * 0.15;
        const arcStart = w.arc[0];
        t.wep = from + (arcStart - from) * k;
        t.bodyRot = d * (air ? 0.05 : 0.04) - k * 0.08;
        t.headAngle = -k * 0.06;
      } else {
        const k = swing;
        const a0 = w.arc[0], a1 = w.arc[1];
        // reverse direction arcs (negative sweep) go forward visually
        const sweep = Math.sign(a1 - a0) || 1;
        t.wep = a0 + (a1 - a0) * easeOut(k);
        t.bodyRot = d * (0.05 + Math.sin(k * Math.PI) * (air ? 0.06 : 0.1) * sweep);
        t.headAngle = d * 0.06;
        // weapon overshoot on follow-through handled by smoothing layer
        if (k > 0.6) {
          const ft = Math.min(1, (k - 0.6) / 0.4);
          t.wep += sweep * ft * (w.follow || 0.3);
        }
      }

      if (air) {
        t.hipDY = HIP_Y - 1;
        t.bodyRot += 0.03;
        t.ffDX = H * 0.3; t.ffDY = -H * 0.1;
        t.fbDX = -H * 0.2; t.fbDY = -H * 0.02;
      }
    }

    _easePhase(prog, start, active) {
      const a = start * 0.55;
      const b = start + active * 0.8;
      if (prog < a) return 0;
      if (prog > b) return 1;
      return (prog - a) / (b - a);
    }

    _solveIdleFallback(t) {
      const id = this.cfg.idle;
      t.wep = id.wep;
      t.grip = id.grip;
      t.handMode = "weapon";
    }

    /* ---- smoothing: move live pose toward targets ---- */

    _smooth(dt) {
      const pose = this.pose;
      const t = this.t;
      const attacking = this.state.indexOf("attack") === 0 || this.state === "heavyAttack" ||
        this.state === "airAttack" || this.state === "airHeavy";

      // body & head ease smoothly
      pose.bodyRot = this._smo(pose.bodyRot, t.bodyRot, 14, dt);
      pose.headAngle = this._smo(pose.headAngle, t.headAngle, 12, dt);
      pose.hipDX = this._smo(pose.hipDX, t.hipDX, 12, dt);
      pose.hipDY = this._smo(pose.hipDY, t.hipDY, 12, dt);
      pose.grip = t.grip;
      pose.handMode = t.handMode;

      // weapon: snap during attacks (crisp swings), ease otherwise (follow-through)
      if (attacking) {
        pose.wep = t.wep;
        pose.charge = t.charge;
      } else {
        pose.wep = this._smo(pose.wep, t.wep, 7, dt);
        pose.charge = this._smo(pose.charge, t.charge, 6, dt);
      }

      // crouch (landing squash) 
      pose.crouch = this._smo(pose.crouch, t.crouch, 10, dt);
      pose.armSwing = this._smo(pose.armSwing, t.armSwing, 10, dt);

      // feet
      pose.ffDX = this._smo(pose.ffDX, t.ffDX, 14, dt);
      pose.ffDY = this._smo(pose.ffDY, t.ffDY, 14, dt);
      pose.fbDX = this._smo(pose.fbDX, t.fbDX, 14, dt);
      pose.fbDY = this._smo(pose.fbDY, t.fbDY, 14, dt);
    }

    /* ---- FX: dust, impact sparks, bow/staff release ---- */

    _fx(dt) {
      const p = this.p;
      this._fxT -= dt;
      if (this._fxT <= 0) {
        const sp = Math.abs(p.vx);
        if (p.onGround && sp > 60 && this.state !== "attack1" && this.state !== "attack2" &&
          this.state !== "attack3" && this.state !== "heavyAttack") {
          this._dust(p.x - Math.sign(p.vx) * H * 0.15, p.y, 2, 0.5);
          this._fxT = 1 / CONFIG.particles.dustPerSec;
        }
      }

      // dash streaks (cyan energy lines behind the player)
      if (this.state === "dash" && SL.Particles) {
        this._fxT2 -= dt;
        if (this._fxT2 <= 0) {
          this._fxT2 = 0.028;
          SL.Particles.trail(p.x - p.dashDir * H * 0.35, p.y - H * 0.45, "rgba(0,255,255,0.55)", 5);
          SL.Particles.trail(p.x - p.dashDir * H * 0.55, p.y - H * 0.3, "rgba(140,255,255,0.4)", 4);
        }
      }

      // heavy attack ground slam: cyan shockwave + fragments
      if ((this.state === "heavyAttack" || this.state === "airHeavy") && p.attack) {
        const timing = timingsFor(this, p.attack, "heavy");
        const at = this.stateT - timing.startup;
        if (at >= 0 && at <= dt && !this._slamDone) {
          this._slamDone = true;
          this._slamFlash = 0.35;
          if (p.onGround) {
            SL.Particles.shock(p.x, p.y, "#00FFFF", 26);
            SL.Particles.ring(p.x, p.y, "#00FFFF", 34, 0.4);
            SL.Particles.burst(p.x, p.y - 6, "#8CFFFF", 8, 170, 2.6, 0.3, 300);
            SL.Particles.burst(p.x, p.y - 6, "#00FFFF", 6, 130, 2.2, 0.3, 280);
          }
        }
      }
      if (!p.attack || (p.attack.type !== "heavy" && p.attack.type !== "airHeavy")) this._slamDone = false;
      if (this._slamFlash > 0) this._slamFlash -= dt;

      // bow release FX
      if (this.state === "attack1" || this.state === "attack2" || this.state === "attack3" || this.state === "heavyAttack") {
        const a = p.attack;
        if (a && this.cfg.kind === "bow") {
          const timing = timingsFor(this, a, a.type === "heavy" ? "heavy" : "combo");
          const at = this.stateT - timing.startup;
          const rel = (timing.w.release || 0.75) * timing.active;
          if (at >= 0 && at <= dt && !this._released) {
            this._released = true;
            const px = p.x + p.facing * H * 0.4;
            const py = p.y - H * 0.62;
            SL.Particles.burst(px, py, "#8CFFFF", 5, 120, 2.2, 0.3, 140);
          }
        }
        if (a && this.cfg.kind === "staff") {
          const timing = timingsFor(this, a, a.type === "heavy" ? "heavy" : "combo");
          const at = this.stateT - timing.startup;
          const rel = (timing.w.release || 0.65) * timing.active;
          if (at >= 0 && at <= dt && !this._released) {
            this._released = true;
            const px = p.x + p.facing * H * 0.5;
            const py = p.y - H * 0.55;
            SL.Particles.burst(px, py, "#00FFFF", 7, 150, 2.6, 0.35, 160);
          }
        }
      }
      if (!p.attack) this._released = false;
    }

    /* ---- weapon trail recording ---- */

    _trailUpdate(dt) {
      const attacking = this.state.indexOf("attack") === 0 || this.state === "heavyAttack" ||
        this.state === "airAttack" || this.state === "airHeavy";
      if (attacking && this.cfg.kind !== "bow") {
        this.trailArr.push({ ang: this.pose.wep, t: 0, len: this.pose.grip === 2 ? 1 : 0.6 });
        if (this.trailArr.length > CONFIG.trailMax) this.trailArr.shift();
      }
      for (let i = this.trailArr.length - 1; i >= 0; i--) {
        this.trailArr[i].t += dt;
        if (this.trailArr[i].t > CONFIG.trailFade) this.trailArr.splice(i, 1);
      }
      if (this._impactFlash > 0) this._impactFlash -= dt;
    }

    /* ---- rendering ---- */

    draw(ctx, o) {
      const p = this.p;
      const pose = this.pose;
      const f = p.facing;
      const s = p.scale || 1;
      const h = H * s;

      // squash & stretch
      const squash = pose.squash * h * 0.12;
      const stretch = pose.stretch * h * 0.1;
      const squ = 1 + stretch - squash;
      const stv = 1 - stretch + squash;

      const lw = Math.max(1.5, 3.2 * s);
      const P = PAL;

      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.scale(f, 1);
      ctx.scale(s * squ, s * stv);
      if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // shadow
      this._drawShadow(ctx, s, o);

      // rear energy: soft neon aura behind the body
      this._aura(ctx, h, P);

      // rear energy: weapon trail behind the body
      this._drawTrail(ctx, s, P);

      // final joint positions (feet-anchored, facing-right frame)
      const J = this._joints(pose, h);

      /* ---- rear layer: back waist fin ---- */
      this._waistFins(ctx, J, lw, h, P, "back");

      /* ---- legs (back then front) ---- */
      const bk = this._knee(J.hipX, J.hipY, J.fbX, J.fbY, h, s);
      this._leg(ctx, J.hipX, J.hipY, bk.x, bk.y, J.fbX, J.fbY, lw * 0.8, P);
      const fk = this._knee(J.hipX, J.hipY, J.ffX, J.ffY, h, s);
      this._leg(ctx, J.hipX, J.hipY, fk.x, fk.y, J.ffX, J.ffY, lw, P);

      /* ---- torso + chest armor ---- */
      this._torso(ctx, J, lw, P);
      this._chest(ctx, J, lw, h, P);

      /* ---- arms (back then front) ---- */
      this._arm(ctx, J.shX, J.shY, J.hbX, J.hbY, lw * 0.8, P);
      this._arm(ctx, J.shX, J.shY, J.hfX, J.hfY, lw, P);

      /* ---- shoulder armor ---- */
      this._shoulder(ctx, J, lw, h, P);

      /* ---- head / helmet ---- */
      this._head(ctx, J, lw, P, s);

      /* ---- front waist fins ---- */
      this._waistFins(ctx, J, lw, h, P, "front");

      // shield (guardian)
      this._shield(ctx, J, lw, h, P, o);

      /* ---- weapon + weapon energy ---- */
      this._drawWeapon(ctx, J, h, s, P, o);

      /* ---- attack effects ---- */
      this._attackFX(ctx, J, h, P);

      ctx.restore();
    }

    _drawShadow(ctx, s, o) {
      if (o.shadow === false) return;
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(0, 0, 15 * s, 3.6 * s, 0, 0, 6.2832);
      ctx.fill();
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.ellipse(-2 * s, 1.4 * s, 20 * s, 6 * s, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    /* thin black arm with slight elbow bend (straight during walk/run, matching the original animation) */
    _arm(ctx, x0, y0, x1, y1, w, P) {
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const dx = x1 - x0, dy = y1 - y0;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const px = -dy / d, py = dx / d;
      const straight = this.state === "walk" || this.state === "run";
      let ex = mx, ey = my;
      if (!straight) {
        const bend = w * 0.45;
        ex = mx + px * bend; ey = my + py * bend;
      }

      ctx.strokeStyle = P.body;
      ctx.lineWidth = w * 1.15;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.lineWidth = w * 0.95;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      // small cyan accent at shoulder
      ctx.strokeStyle = P.armor;
      ctx.lineWidth = Math.max(1, w * 0.32);
      ctx.beginPath();
      ctx.moveTo(x0 + px * w * 0.15, y0 + py * w * 0.15);
      ctx.lineTo(x0 + px * w * 0.6, y0 + py * w * 0.6);
      ctx.stroke();

      // wrist band + gem, then simple black hand
      this._wrist(ctx, x1, y1, w, P);
      ctx.fillStyle = P.body;
      ctx.beginPath();
      ctx.arc(x1, y1, w * 0.3, 0, 6.2832);
      ctx.fill();
    }

    /* cyan multi-strip wrist band with deep-blue gem */
    _wrist(ctx, x, y, w, P) {
      ctx.strokeStyle = P.armor;
      ctx.lineWidth = Math.max(1, w * 0.26);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(x, y, w * 0.5 + i * w * 0.18, 0, 6.2832);
        ctx.stroke();
      }
      ctx.fillStyle = P.gem;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, w * 0.24), 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = P.gemHi;
      ctx.beginPath();
      ctx.arc(x - w * 0.05, y - w * 0.05, Math.max(0.7, w * 0.1), 0, 6.2832);
      ctx.fill();
    }

    /* thin black leg with cyan knee/shin marks and armored boot */
    _leg(ctx, hx, hy, kx, ky, fx, fy, w, P) {
      ctx.strokeStyle = P.body;
      ctx.lineWidth = w * 1.1;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(kx, ky);
      ctx.stroke();
      ctx.lineWidth = w * 0.92;
      ctx.beginPath();
      ctx.moveTo(kx, ky);
      ctx.lineTo(fx, fy);
      ctx.stroke();

      // knee cap (black) with sharp cyan chevron mark
      ctx.fillStyle = P.body;
      ctx.beginPath();
      ctx.arc(kx, ky, w * 0.5, 0, 6.2832);
      ctx.fill();
      const kA = Math.atan2(fy - ky, fx - kx);
      ctx.strokeStyle = P.armor;
      ctx.lineWidth = Math.max(1, w * 0.28);
      ctx.beginPath();
      ctx.moveTo(kx + Math.cos(kA + 2.1) * w * 0.72, ky + Math.sin(kA + 2.1) * w * 0.72);
      ctx.lineTo(kx, ky);
      ctx.lineTo(kx + Math.cos(kA - 2.1) * w * 0.72, ky + Math.sin(kA - 2.1) * w * 0.72);
      ctx.stroke();

      // sharp cyan shin mark (short band with black gaps)
      ctx.strokeStyle = P.armor;
      ctx.lineWidth = Math.max(1, w * 0.26);
      ctx.beginPath();
      ctx.moveTo(fx + (kx - fx) * 0.52, fy + (ky - fy) * 0.52);
      ctx.lineTo(fx + (kx - fx) * 0.8, fy + (ky - fy) * 0.8);
      ctx.stroke();

      this._boot(ctx, fx, fy, w, P);
    }

    /* chunky black angular foot + cyan ankle band + gem */
    _boot(ctx, x, y, w, P) {
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = P.armor;
      ctx.lineWidth = Math.max(1, w * 0.26);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.42 + i * w * 0.16, 0, 6.2832);
        ctx.stroke();
      }
      ctx.fillStyle = P.gem;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1, w * 0.2), 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = P.gemHi;
      ctx.beginPath();
      ctx.arc(-w * 0.05, -w * 0.05, Math.max(0.7, w * 0.08), 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = P.body;
      ctx.beginPath();
      ctx.moveTo(0, -w * 0.08);
      ctx.lineTo(w * 0.75, -w * 0.12);
      ctx.lineTo(w * 1.15, w * 0.02);
      ctx.lineTo(w * 1.25, w * 0.32);
      ctx.lineTo(w * 0.8, w * 0.45);
      ctx.lineTo(0, w * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    /* angular black torso */
    _torso(ctx, J, lw, P) {
      const ax = J.hipX, ay = J.hipY, bx = J.shX, by = J.shY;
      const wH = lw * 0.8, wS = lw * 1.15;
      ctx.beginPath();
      ctx.moveTo(ax - wH, ay);
      ctx.lineTo(bx - wS * 0.55, by);
      ctx.lineTo(bx + wS * 0.55, by);
      ctx.lineTo(ax + wH, ay);
      ctx.closePath();
      ctx.fillStyle = P.body;
      ctx.fill();
      // faint cyan edge reads the angular form (never a white outline)
      ctx.strokeStyle = "rgba(0,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax - wH, ay);
      ctx.lineTo(bx - wS * 0.55, by);
      ctx.lineTo(bx + wS * 0.55, by);
      ctx.lineTo(ax + wH, ay);
      ctx.stroke();
    }

    /* symmetric angular cyan chest plates + waist belt with diamond emblem */
    _chest(ctx, J, lw, h, P) {
      const ax = J.hipX, ay = J.hipY, bx = J.shX, by = J.shY;
      const wS = lw * 1.15;
      const bw = lw * 0.72;
      const span = by - ay;

      // upper diagonal chest plates (both sides, symmetric)
      ctx.fillStyle = P.armor;
      for (const sgn of [1, -1]) {
        ctx.beginPath();
        ctx.moveTo(bx + sgn * wS * 0.5, by - span * 0.06);
        ctx.lineTo(bx + sgn * wS * 0.14, by - span * 0.55);
        ctx.lineTo(bx + sgn * wS * 0.3, by - span * 0.62);
        ctx.lineTo(bx + sgn * wS * 0.62, by - span * 0.12);
        ctx.closePath();
        ctx.fill();
      }
      // central core plate (angular chevron toward belt)
      ctx.fillStyle = P.armorHi;
      ctx.beginPath();
      ctx.moveTo(bx - bw * 0.28, by - span * 0.45);
      ctx.lineTo(bx, by - span * 0.62);
      ctx.lineTo(bx + bw * 0.28, by - span * 0.45);
      ctx.lineTo(bx + bw * 0.2, by - span * 0.3);
      ctx.lineTo(bx - bw * 0.2, by - span * 0.3);
      ctx.closePath();
      ctx.fill();
      // black gaps between plates
      ctx.strokeStyle = P.body;
      ctx.lineWidth = lw * 0.3;
      ctx.beginPath();
      ctx.moveTo(bx - bw * 0.05, by - span * 0.38);
      ctx.lineTo(bx - bw * 0.05, by - span * 0.6);
      ctx.moveTo(bx + bw * 0.05, by - span * 0.38);
      ctx.lineTo(bx + bw * 0.05, by - span * 0.6);
      ctx.stroke();

      // waist belt
      const by2 = ay + 1;
      ctx.strokeStyle = P.armor;
      ctx.lineWidth = lw * 0.4;
      ctx.beginPath();
      ctx.moveTo(ax - lw * 0.85, by2);
      ctx.lineTo(ax + lw * 0.85, by2);
      ctx.stroke();
      // diamond-shaped central emblem
      ctx.fillStyle = P.armor;
      ctx.beginPath();
      ctx.moveTo(ax, by2 - lw * 0.5);
      ctx.lineTo(ax + lw * 0.5, by2);
      ctx.lineTo(ax, by2 + lw * 0.5);
      ctx.lineTo(ax - lw * 0.5, by2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = P.gemHi;
      ctx.beginPath();
      ctx.moveTo(ax, by2 - lw * 0.26);
      ctx.lineTo(ax + lw * 0.26, by2);
      ctx.lineTo(ax, by2 + lw * 0.26);
      ctx.lineTo(ax - lw * 0.26, by2);
      ctx.closePath();
      ctx.fill();
    }

    /* large angular spiked shoulder pauldrons (wider than upper arms) */
    _shoulder(ctx, J, lw, h, P) {
      const shX = J.shX, shY = J.shY;
      const armH = h * 0.15;
      const spike = h * 0.1;
      for (const sgn of [1, -1]) {
        const cx = shX + sgn * h * 0.03;
        const cy = shY - h * 0.01;
        // black base pad
        ctx.fillStyle = P.body;
        ctx.beginPath();
        ctx.moveTo(cx - sgn * armH * 0.45, cy + armH * 0.26);
        ctx.lineTo(cx - sgn * armH * 0.18, cy - armH * 0.38);
        ctx.lineTo(cx + sgn * armH * 0.24, cy - armH * 0.44);
        ctx.lineTo(cx + sgn * armH * 0.45, cy + armH * 0.26);
        ctx.closePath();
        ctx.fill();
        // cyan angular plate
        ctx.fillStyle = P.armor;
        ctx.beginPath();
        ctx.moveTo(cx - sgn * armH * 0.3, cy + armH * 0.18);
        ctx.lineTo(cx - sgn * armH * 0.1, cy - armH * 0.26);
        ctx.lineTo(cx + sgn * armH * 0.05, cy - armH * 0.33);
        ctx.lineTo(cx + sgn * armH * 0.32, cy + armH * 0.02);
        ctx.lineTo(cx + sgn * armH * 0.24, cy + armH * 0.22);
        ctx.lineTo(cx - sgn * armH * 0.18, cy + armH * 0.22);
        ctx.closePath();
        ctx.fill();
        // upward spike
        ctx.fillStyle = P.armorHi;
        ctx.beginPath();
        ctx.moveTo(cx - sgn * armH * 0.14, cy - armH * 0.28);
        ctx.lineTo(cx + sgn * armH * 0.02, cy - armH * 0.28 - spike);
        ctx.lineTo(cx + sgn * armH * 0.18, cy - armH * 0.26);
        ctx.closePath();
        ctx.fill();
        // outward spike
        ctx.fillStyle = P.armor;
        ctx.beginPath();
        ctx.moveTo(cx + sgn * armH * 0.28, cy - armH * 0.04);
        ctx.lineTo(cx + sgn * (armH * 0.52 + spike * 0.8), cy + armH * 0.12);
        ctx.lineTo(cx + sgn * armH * 0.3, cy + armH * 0.18);
        ctx.closePath();
        ctx.fill();
        // gem on pauldron
        ctx.fillStyle = P.gemHi;
        ctx.beginPath();
        ctx.arc(cx, cy - armH * 0.05, Math.max(1.4, armH * 0.13), 0, 6.2832);
        ctx.fill();
      }
    }

    /* waist blade-fins: long sharp cyan/black fins that flare during movement */
    _waistFins(ctx, J, lw, h, P, side) {
      const hipX = J.hipX, hipY = J.hipY;
      const flare = this._flare();
      const sway = Math.sin(this.game.elapsed * 6.5 + this._seed + (side === "front" ? 1.6 : 0)) * h * 0.025;
      const len = h * (0.15 + flare * 0.13);
      const spread = h * (0.07 + flare * 0.17);
      const sgn = side === "front" ? 1 : -1;
      const bw = Math.max(1.2, lw * 0.5);

      // cyan blade fin
      ctx.fillStyle = P.armor;
      ctx.beginPath();
      ctx.moveTo(hipX + sgn * bw, hipY + 1);
      ctx.lineTo(hipX + sgn * (bw + spread * 0.45), hipY + len * 0.4);
      ctx.lineTo(hipX + sgn * (bw + spread), hipY + len + sway);
      ctx.lineTo(hipX + sgn * (bw * 0.55), hipY + len * 0.55 + sway);
      ctx.closePath();
      ctx.fill();
      // black inner blade (two-tone sharp fin)
      ctx.fillStyle = P.body;
      ctx.beginPath();
      ctx.moveTo(hipX + sgn * bw * 1.1, hipY + 2);
      ctx.lineTo(hipX + sgn * (bw + spread * 0.5), hipY + len * 0.55);
      ctx.lineTo(hipX + sgn * (bw + spread * 0.82), hipY + len + sway);
      ctx.lineTo(hipX + sgn * (bw * 0.8), hipY + len * 0.5 + sway);
      ctx.closePath();
      ctx.fill();
    }

    _flare() {
      const st = this.state;
      if (st === "dash") return 1;
      if (st === "run") return 0.55;
      if (st === "walk") return 0.3;
      if (st.indexOf("attack") === 0 || st === "heavyAttack" || st === "airAttack" || st === "airHeavy") return 0.45;
      if (st === "jump" || st === "fall") return 0.35;
      return 0.15 + Math.sin(this.game.elapsed * 2.2 + this._seed) * 0.08;
    }

    /* angular pointed helmet: dark face, cyan visor + markings, two long cyan fins */
    _head(ctx, J, lw, P, s) {
      const hr = 5.6 * s;
      const hx = J.hdX, hy = J.hdY;
      const id = this.warrior ? this.warrior.id : null;
      const g = this.game;

      // helmet silhouette (angular, pointed crown, tapering chin)
      ctx.fillStyle = P.face;
      ctx.beginPath();
      ctx.moveTo(hx - hr * 0.78, hy + hr * 0.5);
      ctx.lineTo(hx - hr * 0.98, hy - hr * 0.08);
      ctx.lineTo(hx - hr * 0.42, hy - hr * 0.72);
      ctx.lineTo(hx, hy - hr * 0.98);
      ctx.lineTo(hx + hr * 0.48, hy - hr * 0.6);
      ctx.lineTo(hx + hr * 0.88, hy + hr * 0.02);
      ctx.lineTo(hx + hr * 0.62, hy + hr * 0.6);
      ctx.lineTo(hx, hy + hr * 0.68);
      ctx.closePath();
      ctx.fill();

      // helmet geometric edge lines (cyan)
      ctx.strokeStyle = P.armor;
      ctx.lineWidth = Math.max(1, lw * 0.3);
      ctx.beginPath();
      ctx.moveTo(hx - hr * 0.92, hy - hr * 0.04);
      ctx.lineTo(hx - hr * 0.36, hy - hr * 0.66);
      ctx.lineTo(hx, hy - hr * 0.9);
      ctx.lineTo(hx + hr * 0.42, hy - hr * 0.56);
      ctx.lineTo(hx + hr * 0.82, hy + hr * 0.06);
      ctx.stroke();

      // two long cyan fins / horns sweeping back
      this._helmetFins(ctx, hx, hy, hr, s, id, P);

      // angular cyan visor
      ctx.fillStyle = P.armorHi;
      ctx.beginPath();
      ctx.moveTo(hx - hr * 0.12, hy - hr * 0.3);
      ctx.lineTo(hx + hr * 0.55, hy - hr * 0.1);
      ctx.lineTo(hx + hr * 0.64, hy + hr * 0.02);
      ctx.lineTo(hx + hr * 0.3, hy + hr * 0.12);
      ctx.lineTo(hx - hr * 0.06, hy + hr * 0.02);
      ctx.closePath();
      ctx.fill();
      // visor glow line (pulsing energy)
      ctx.strokeStyle = P.core;
      ctx.globalAlpha = 0.5 + Math.sin(g.elapsed * 4 + this._seed) * 0.25;
      ctx.lineWidth = Math.max(1, lw * 0.26);
      ctx.beginPath();
      ctx.moveTo(hx - hr * 0.14, hy - hr * 0.32);
      ctx.lineTo(hx + hr * 0.52, hy - hr * 0.08);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // sharp geometric facial markings (angular cheek / jaw)
      ctx.strokeStyle = P.armor;
      ctx.lineWidth = Math.max(0.8, lw * 0.2);
      ctx.beginPath();
      ctx.moveTo(hx - hr * 0.6, hy + hr * 0.06);
      ctx.lineTo(hx - hr * 0.14, hy + hr * 0.4);
      ctx.moveTo(hx + hr * 0.16, hy + hr * 0.5);
      ctx.lineTo(hx + hr * 0.6, hy + hr * 0.28);
      ctx.stroke();
    }

    _helmetFins(ctx, hx, hy, hr, s, id, P) {
      const g = this.game;
      const wag = Math.sin(g.elapsed * 5 + this._seed) * 0.05;
      let fins;
      if (id === "assassin") fins = [{ a: -2.45, l: 1.5, w: 0.5 }, { a: -2.0, l: 1.1, w: 0.42 }];
      else if (id === "berserker") fins = [{ a: -2.5, l: 1.65, w: 0.58 }, { a: -1.95, l: 1.28, w: 0.48 }];
      else if (id === "shadowmage") fins = [{ a: -2.4, l: 1.4, w: 0.46 }, { a: -2.0, l: 1.0, w: 0.4 }];
      else if (id === "guardian") fins = [{ a: -2.35, l: 1.35, w: 0.5 }, { a: -1.9, l: 1.05, w: 0.42 }];
      else fins = [{ a: -2.3, l: 1.4, w: 0.48 }, { a: -1.85, l: 1.0, w: 0.4 }];
      ctx.lineJoin = "miter";
      for (const fn of fins) {
        const a = fn.a + wag;
        const tipX = hx + Math.cos(a) * hr * fn.l;
        const tipY = hy - hr * 0.72 + Math.sin(a) * hr * fn.l * 0.55;
        const midX = hx + Math.cos(a) * hr * fn.l * 0.55 - hr * 0.08;
        const midY = hy - hr * 0.72 + Math.sin(a) * hr * fn.l * 0.55 * 0.55;
        // fin blade (cyan)
        ctx.strokeStyle = P.armor;
        ctx.lineWidth = hr * fn.w;
        ctx.beginPath();
        ctx.moveTo(hx + Math.cos(a) * hr * 0.12, hy - hr * 0.72);
        ctx.lineTo(midX, midY);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
        // black inner core
        ctx.strokeStyle = P.body;
        ctx.lineWidth = Math.max(1, hr * fn.w * 0.42);
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(tipX * 0.97, tipY * 0.97);
        ctx.stroke();
        // bright tip
        ctx.fillStyle = P.armorHi;
        ctx.beginPath();
        ctx.arc(tipX, tipY, Math.max(1, hr * fn.w * 0.3), 0, 6.2832);
        ctx.fill();
      }
    }

    /* angular cyan energy shield (guardian) */
    _shield(ctx, J, lw, h, P, o) {
      if (!o.shield || !this._guardian) return;
      const sx = J.hbX + h * 0.05, sy = J.hbY - h * 0.05;
      const r = h * 0.11;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-0.18);
      // energy glow behind the angular shield
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(0,255,255,0.25)";
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.15);
      ctx.lineTo(r * 0.8, -r * 0.75);
      ctx.lineTo(r, 0);
      ctx.lineTo(r * 0.6, r * 0.9);
      ctx.lineTo(0, r * 1.2);
      ctx.lineTo(-r * 0.6, r * 0.9);
      ctx.lineTo(-r, 0);
      ctx.lineTo(-r * 0.8, -r * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      // angular shield body
      ctx.fillStyle = P.armor;
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.05);
      ctx.lineTo(r * 0.7, -r * 0.65);
      ctx.lineTo(r * 0.9, 0);
      ctx.lineTo(r * 0.55, r * 0.8);
      ctx.lineTo(0, r * 1.1);
      ctx.lineTo(-r * 0.55, r * 0.8);
      ctx.lineTo(-r * 0.9, 0);
      ctx.lineTo(-r * 0.7, -r * 0.65);
      ctx.closePath();
      ctx.fill();
      // dark core + purple emblem
      ctx.fillStyle = P.face;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.4);
      ctx.lineTo(r * 0.3, 0);
      ctx.lineTo(0, r * 0.4);
      ctx.lineTo(-r * 0.3, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = P.gemHi;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.24);
      ctx.lineTo(r * 0.18, 0);
      ctx.lineTo(0, r * 0.24);
      ctx.lineTo(-r * 0.18, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    /* soft neon energy aura behind the body (rear energy layer) */
    _aura(ctx, h, P) {
      const pulse = 0.5 + Math.sin(this.game.elapsed * 3 + this._seed) * 0.5;
      const g = ctx.createRadialGradient(0, -h * 0.4, h * 0.05, 0, -h * 0.4, h * 0.6);
      g.addColorStop(0, "rgba(0,255,255," + (0.08 + pulse * 0.06) + ")");
      g.addColorStop(1, "rgba(0,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, -h * 0.4, h * 0.6, 0, 6.2832);
      ctx.fill();
    }

    /* attack effects: cyan crescent slash, body ring, heavy-slam vertical streak */
    _attackFX(ctx, J, h, P) {
      if (this._slamFlash > 0) {
        const k = Math.max(0, this._slamFlash / 0.35);
        const front = h * 0.2;
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = "rgba(0,255,255," + (0.5 * k) + ")";
        ctx.lineWidth = (2 + k * 3) * (h / H);
        ctx.beginPath();
        ctx.moveTo(front, 0);
        ctx.lineTo(front, -h * (0.35 + (1 - k) * 0.45));
        ctx.stroke();
        ctx.strokeStyle = "rgba(232,255,255," + (0.4 * k) + ")";
        ctx.lineWidth = (1 + k) * (h / H);
        ctx.beginPath();
        ctx.moveTo(front, 0);
        ctx.lineTo(front, -h * (0.24 + (1 - k) * 0.35));
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
      if (this._impactFlash <= 0) return;
      const k = Math.max(0, this._impactFlash / 0.12);
      const arm = ARM * (h / H);
      const shX = J.shX, shY = J.shY;
      ctx.strokeStyle = "rgba(0,255,255," + (0.3 + k * 0.4) + ")";
      ctx.lineWidth = (3 + k * 3) * (h / H);
      ctx.beginPath();
      ctx.arc(shX, shY, arm * 1.05, this.pose.wep - 0.45, this.pose.wep + 0.45);
      ctx.stroke();
      ctx.strokeStyle = "rgba(232,255,255," + (0.5 * k) + ")";
      ctx.lineWidth = (1.5 + k) * (h / H);
      ctx.beginPath();
      ctx.arc(shX, shY, arm * 1.05, this.pose.wep - 0.22, this.pose.wep + 0.22);
      ctx.stroke();
      ctx.strokeStyle = "rgba(0,255,255," + (0.2 * k) + ")";
      ctx.lineWidth = 2 * (h / H);
      ctx.beginPath();
      ctx.arc(0, -h * 0.4, h * (0.42 + (1 - k) * 0.2), 0, 6.2832);
      ctx.stroke();
    }


    /* final joint positions from pose (feet-anchored, +x = facing) */
    _joints(pose, h) {
      const f = this.p.facing;
      const torso = TORSO * (h / H);
      const arm = ARM * (h / H);
      const headDist = HEAD_DIST * (h / H);
      const hipX = pose.hipDX;
      const hipY = pose.hipDY;
      const shX = hipX + Math.sin(pose.bodyRot) * torso;
      const shY = hipY - Math.cos(pose.bodyRot) * torso;
      const hdX = shX + Math.sin(pose.bodyRot + pose.headAngle) * headDist;
      const hdY = shY - Math.cos(pose.bodyRot + pose.headAngle) * headDist;

      let hfX, hfY, hbX, hbY;
      const hm = pose.handMode;
      if (hm === "bow") {
        hfX = shX + Math.cos(pose.wep) * arm * 1.1;
        hfY = shY + Math.sin(pose.wep) * arm * 1.1;
        const pull = pose.charge * 0.7;
        hbX = shX + Math.cos(pose.wep + pull) * arm * 0.8;
        hbY = shY + Math.sin(pose.wep + pull) * arm * 0.8;
      } else if (hm === "magic") {
        hfX = shX + Math.cos(pose.wep) * arm * 1.15;
        hfY = shY + Math.sin(pose.wep) * arm * 1.15;
        hbX = shX + Math.cos(pose.wep - 0.7) * arm * 0.6;
        hbY = shY + Math.sin(pose.wep - 0.7) * arm * 0.6;
      } else if (hm === "relaxed") {
        const sw = pose.armSwing;
        hfX = shX + h * 0.17 + sw * h * 0.05;
        hfY = shY + h * 0.1 - Math.abs(sw) * h * 0.03;
        hbX = shX - h * 0.12 - sw * h * 0.04;
        hbY = shY + h * 0.12;
      } else {
        // weapon grip
        hfX = shX + Math.cos(pose.wep) * arm;
        hfY = shY + Math.sin(pose.wep) * arm;
        if (pose.grip === 2) {
          hbX = shX + Math.cos(pose.wep) * arm * 0.45;
          hbY = shY + Math.sin(pose.wep) * arm * 0.45;
        } else {
          hbX = shX - h * 0.1;
          hbY = shY + h * 0.12;
        }
      }

      return {
        hipX: hipX, hipY: hipY,
        shX: shX, shY: shY,
        hdX: hdX, hdY: hdY,
        hfX: hfX, hfY: hfY,
        hbX: hbX, hbY: hbY,
        ffX: pose.ffDX, ffY: pose.ffDY,
        fbX: pose.fbDX, fbY: pose.fbDY
      };
    }

    /* knee position for a 2-bone IK leg */
    _knee(hx, hy, fx, fy, h, s) {
      const seg = LEG * (h / H);
      const dx = fx - hx, dy = fy - hy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) return { x: (hx + fx) / 2, y: (hy + fy) / 2 };
      const nx = dx / dist, ny = dy / dist;
      const reach = Math.min(seg * 2, dist);
      const bendDir = this.p.facing * (hx >= 0 ? -1 : 1) * -1;
      return {
        x: hx + nx * reach * 0.5 - ny * seg * 0.35 * bendDir,
        y: hy + ny * reach * 0.5 + nx * seg * 0.35 * bendDir
      };
    }

    _drawTrail(ctx, s, P) {
      const arr = this.trailArr;
      if (arr.length < 2) return;
      const pose = this.pose;
      const sh = this._joints(pose, H * s);
      const arm = ARM * s;
      for (let i = 1; i < arr.length; i++) {
        const prev = arr[i - 1];
        const cur = arr[i];
        const alpha = 1 - cur.t / CONFIG.trailFade;
        if (alpha <= 0) continue;
        const a0 = prev.ang;
        const a1 = cur.ang;
        const span = Math.abs(a1 - a0);
        if (span > 0.2) {
          const mid = (a0 + a1) / 2;
          ctx.strokeStyle = U.hsla(180, 100, 65, 0.08 + alpha * 0.3);
          ctx.lineWidth = (4 + alpha * 6) * s;
          ctx.beginPath();
          ctx.arc(sh.shX, sh.shY, arm * 0.9, mid - span / 2, mid + span / 2);
          ctx.stroke();
        }
      }
      // active swing: bright cyan arc
      if (this._impactFlash > 0 && this.cfg.kind !== "bow" && this.cfg.kind !== "staff") {
        ctx.strokeStyle = U.hsla(180, 100, 80, this._impactFlash);
        ctx.lineWidth = (7 + this._impactFlash * 4) * s;
        ctx.beginPath();
        ctx.arc(sh.shX, sh.shY, arm * 0.92, pose.wep - 0.35, pose.wep + 0.35);
        ctx.stroke();
      }
    }

    _drawWeapon(ctx, J, h, s, P, o) {
      const cfg = this.cfg;
      const kind = cfg.kind;
      const tx = J.hfX, ty = J.hfY;
      const ang = this.pose.wep;
      const lw = Math.max(1.5, 3 * s);
      const charge = this.pose.charge;

      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(ang);

      if (kind === "staff") {
        this._energyStaff(ctx, h, lw, P, charge);
      } else if (kind === "bow") {
        this._energyBow(ctx, h, lw, P, charge);
      } else {
        this._energyBlade(ctx, h, lw, P, kind, charge);
      }

      ctx.restore();
    }

    /* melee energy blade: black mechanical handle + jagged bright-cyan blade */
    _energyBlade(ctx, h, lw, P, kind, charge) {
      const isSpear = kind === "spear";
      const isDagger = kind === "dagger";
      const isAxe = kind === "axe";
      const bladeLen = isSpear ? h * 0.8 : isDagger ? h * 0.42 : isAxe ? h * 0.62 : h * 0.72;
      const handleLen = isSpear ? h * 0.2 : h * 0.08;
      const guardX = -handleLen * 0.45;

      // black mechanical handle with cyan rings
      ctx.strokeStyle = P.body;
      ctx.lineWidth = lw * 1.1;
      ctx.beginPath();
      ctx.moveTo(-handleLen, 0);
      ctx.lineTo(guardX, 0);
      ctx.stroke();
      ctx.strokeStyle = P.armor;
      ctx.lineWidth = Math.max(1, lw * 0.4);
      for (let i = 0; i < 3; i++) {
        const rx = -handleLen + handleLen * 0.16 + i * handleLen * 0.28;
        ctx.beginPath();
        ctx.moveTo(rx, -lw * 0.62);
        ctx.lineTo(rx, lw * 0.62);
        ctx.stroke();
      }
      // pommel gem
      ctx.fillStyle = P.gemHi;
      ctx.beginPath();
      ctx.arc(-handleLen, 0, lw * 0.4, 0, 6.2832);
      ctx.fill();

      // angular crossguard
      ctx.fillStyle = P.armor;
      ctx.beginPath();
      ctx.moveTo(guardX, -lw * (isSpear ? 0.9 : 1.5));
      ctx.lineTo(guardX + lw * 0.7, 0);
      ctx.lineTo(guardX, lw * (isSpear ? 0.9 : 1.5));
      ctx.lineTo(guardX - lw * 0.3, 0);
      ctx.closePath();
      ctx.fill();

      // jagged flame-like energy blade with tapered tip
      const prof = this._bladeProfile(bladeLen, lw, isAxe, isSpear);
      // outer energy glow
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(0,255,255," + (0.22 + charge * 0.15) + ")";
      ctx.lineWidth = lw * 3.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(guardX, 0);
      ctx.lineTo(bladeLen, 0);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      // outer blade fill
      ctx.fillStyle = P.armor;
      this._fillProfile(ctx, prof, 1);
      // bright inner blade
      ctx.fillStyle = P.armorHi;
      this._fillProfile(ctx, prof, 0.55);
      // extreme-bright core line
      ctx.strokeStyle = P.core;
      ctx.lineWidth = Math.max(1, lw * 0.42);
      ctx.beginPath();
      ctx.moveTo(guardX + lw * 0.8, 0);
      ctx.lineTo(bladeLen * 0.97, 0);
      ctx.stroke();
      // tip glow
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(232,255,255," + (0.55 + this._impactFlash * 0.4) + ")";
      ctx.beginPath();
      ctx.arc(bladeLen, 0, lw * 0.75, 0, 6.2832);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }

    /* deterministic jagged blade profile: sharp projections, tapered angular tip */
    _bladeProfile(len, lw, isAxe, isSpear) {
      const pts = [];
      const baseH = (isAxe ? 2.3 : isSpear ? 0.9 : 1.15) * lw;
      const n = 7;
      pts.push({ x: 0, y: baseH });
      for (let i = 1; i < n; i++) {
        const t = i / (n - 1);
        const x = len * t;
        const spike = (i % 2 === 1);
        const y = baseH * (1 - t) * (1 + (spike ? 0.5 : -0.12));
        pts.push({ x: x, y: Math.max(0, y) });
      }
      pts.push({ x: len, y: 0 });
      for (let i = n - 1; i >= 1; i--) {
        const t = i / (n - 1);
        const x = len * t;
        const spike = (i % 2 === 0);
        const y = -baseH * (1 - t) * (1 + (spike ? 0.42 : -0.1));
        pts.push({ x: x, y: Math.min(0, y) });
      }
      return pts;
    }

    _fillProfile(ctx, prof, ys) {
      ctx.beginPath();
      ctx.moveTo(prof[0].x, prof[0].y * ys);
      for (let i = 1; i < prof.length; i++) ctx.lineTo(prof[i].x, prof[i].y * ys);
      ctx.closePath();
      ctx.fill();
    }

    /* angular cyan energy bow */
    _energyBow(ctx, h, lw, P, charge) {
      const bend = 0.3 + charge * 0.6;
      const bw = h * 0.2;
      const tipX = h * 0.55;
      // dark angular frame
      ctx.strokeStyle = P.body;
      ctx.lineWidth = lw * 1.3;
      ctx.beginPath();
      ctx.moveTo(tipX, -bw);
      ctx.lineTo(tipX - bend * h * 0.28, 0);
      ctx.lineTo(tipX, bw);
      ctx.stroke();
      // cyan energy limbs
      ctx.strokeStyle = P.armor;
      ctx.lineWidth = lw * 0.7;
      ctx.beginPath();
      ctx.moveTo(tipX, -bw);
      ctx.lineTo(tipX - bend * h * 0.28, 0);
      ctx.lineTo(tipX, bw);
      ctx.stroke();
      // bright edge
      ctx.strokeStyle = P.armorHi;
      ctx.lineWidth = lw * 0.24;
      ctx.beginPath();
      ctx.moveTo(tipX, -bw);
      ctx.lineTo(tipX - bend * h * 0.26, 0);
      ctx.lineTo(tipX, bw);
      ctx.stroke();
      // energy string
      ctx.strokeStyle = P.core;
      ctx.lineWidth = lw * 0.2;
      ctx.beginPath();
      ctx.moveTo(tipX, -bw);
      ctx.lineTo(tipX - bend * h * 0.32, 0);
      ctx.lineTo(tipX, bw);
      ctx.stroke();
      // nocked energy arrow while drawing
      if (charge > 0) {
        const cx = tipX - bend * h * 0.24;
        ctx.strokeStyle = P.armorHi;
        ctx.lineWidth = lw * 0.3;
        ctx.beginPath();
        ctx.moveTo(cx - h * 0.16, 0);
        ctx.lineTo(cx + h * 0.12, 0);
        ctx.stroke();
        ctx.fillStyle = P.core;
        ctx.beginPath();
        ctx.moveTo(cx + h * 0.12, -lw * 0.5);
        ctx.lineTo(cx + h * 0.2, 0);
        ctx.lineTo(cx + h * 0.12, lw * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }

    /* black energy staff with cyan rings and bright-cyan orb */
    _energyStaff(ctx, h, lw, P, charge) {
      const shaftLen = h * 0.55;
      ctx.strokeStyle = P.body;
      ctx.lineWidth = lw * 1.1;
      ctx.beginPath();
      ctx.moveTo(-h * 0.1, 0);
      ctx.lineTo(shaftLen, 0);
      ctx.stroke();
      ctx.strokeStyle = P.armor;
      ctx.lineWidth = Math.max(1, lw * 0.45);
      for (let i = 0; i < 3; i++) {
        const rx = h * 0.04 + i * h * 0.1;
        ctx.beginPath();
        ctx.moveTo(rx, -lw * 0.7);
        ctx.lineTo(rx, lw * 0.7);
        ctx.stroke();
      }
      // orb
      const orbR = lw * (1.1 + charge);
      const orbX = shaftLen;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(0,255,255," + (0.3 + charge * 0.2) + ")";
      ctx.beginPath();
      ctx.arc(orbX, 0, orbR * 2.3, 0, 6.2832);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = P.armor;
      ctx.beginPath();
      ctx.arc(orbX, 0, orbR, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = P.core;
      ctx.beginPath();
      ctx.arc(orbX, 0, orbR * 0.5, 0, 6.2832);
      ctx.fill();
      if (charge > 0.2) {
        const t = this.game.elapsed * 6;
        for (let i = 0; i < 3; i++) {
          const a = t + i * 2.094;
          const r = orbR + 3 + charge * 3;
          ctx.fillStyle = P.armorHi;
          ctx.beginPath();
          ctx.arc(orbX + Math.cos(a) * r, Math.sin(a) * r, lw * 0.3, 0, 6.2832);
          ctx.fill();
        }
      }
    }


    /* ---- pooled dust particles ---- */

    _dust(x, y, n, strength) {
      const g = this.game;
      if (!g || !SL.Particles) return;
      if (g.settings && g.settings.fx === false) return;
      for (let i = 0; i < n; i++) {
        SL.Particles.trail(x + (Math.random() - 0.5) * 8, y - 1,
          { vx: (Math.random() - 0.5) * 90, vy: -Math.random() * 40 - 15, life: 0.35 + Math.random() * 0.2, size: 3 + Math.random() * 2.5, color: "rgba(0,255,255,0.4)", grow: true });
      }
    }

    impact(kind, opts) {
      const cam = CONFIG.camera;
      if (kind === "hit") {
        this._impactFlash = 0.12;
        this.pose.squash = Math.min(0.22, (opts && opts.squash) || 0.15);
      }
    }

    weaponSweepFor(o) {
      const J = this._joints(this.pose, H * (this.p.scale || 1));
      const ang = this.pose.wep;
      const shX = this.p.x + this.p.facing * J.shX * (this.p.scale || 1);
      const shY = this.p.y + J.shY * (this.p.scale || 1);
      return {
        x: shX, y: shY,
        ang: ang,
        len: ARM * (this.p.scale || 1) * 1.2,
        facing: this.p.facing,
        sweep: Math.sign(this.cfg.combos[0].arc[1] - this.cfg.combos[0].arc[0]) || 1
      };
    }
  }

  /* ------------------------------------------------------------------ */
  /* public                                                             */
  /* ------------------------------------------------------------------ */

  return {
    CONFIG: CONFIG,
    WEAPONS: WEAPONS,
    PlayerAnimator: PlayerAnimator,
    weaponFor: weaponFor,
    timingsFor: timingsFor,
    constants: { H: H, SH_Y: SH_Y, HIP_Y: HIP_Y, ARM: ARM, LEG: LEG, HEAD_DIST: HEAD_DIST }
  };
})(window.SL);

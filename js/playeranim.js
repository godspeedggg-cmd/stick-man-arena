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
  const SH_Y = -H * 0.66; // shoulder rest height
  const HIP_Y = -H * 0.42; // hip rest height
  const TORSO = SH_Y - HIP_Y; // ~15.4
  const ARM = H * 0.24; // shoulder -> hand reach
  const LEG = H * 0.21; // hip->knee = knee->foot
  const HEAD_DIST = 9.5;

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

      // bow release FX
      if (this.state === "attack1" || this.state === "attack2" || this.state === "attack3" || this.state === "heavyAttack") {
        const a = p.attack;
        if (a && this.cfg.kind === "bow") {
          const timing = timingsFor(this, a, a.type === "heavy" ? "heavy" : "combo");
          const at = this.stateT - timing.startup;
          const rel = (timing.w.release || 0.75) * timing.active;
          if (at >= 0 && at <= dt && !this._released) {
            this._released = true;
            const g = this.game;
            const px = p.x + p.facing * H * 0.4;
            const py = p.y - H * 0.62;
            SL.Particles.burst(px, py, "#ffe9a8", 5, 120, 2.2, 0.3, 140);
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
            SL.Particles.burst(px, py, "#d0a8ff", 7, 150, 2.6, 0.35, 160);
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

      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.scale(f, 1);
      ctx.scale(s * squ, s * stv);

      // shadow
      this._drawShadow(ctx, s, o);

      const light = this._lightFor(o);
      const line = o.color || "#f0f0f0";
      const dark = U.shade(line, -0.32);
      const deep = U.shade(line, -0.52);
      const accent = (o.weapon && o.weapon.color) || this.cfg.trail || "#ffffff";
      const lw = Math.max(1.5, 3.2 * s);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // weapon trail (behind body)
      this._drawTrail(ctx, s, light);

      // compute final joint positions (feet-anchored, facing-right frame)
      const J = this._joints(pose, h);

      /* ---- back layer ---- */
      // back arm
      this._limb(ctx, J.shX, J.shY, J.hbX, J.hbY, lw * 0.8, dark, deep);
      this._cap(ctx, J.hbX, J.hbY, lw * 0.4, deep);

      // back leg (knee bent, 2-bone)
      const bk = this._knee(J.hipX, J.hipY, J.fbX, J.fbY, h, s);
      this._limb(ctx, J.hipX, J.hipY, bk.x, bk.y, lw * 0.8, dark, deep);
      this._limb(ctx, bk.x, bk.y, J.fbX, J.fbY, lw * 0.72, dark, deep);
      this._cap(ctx, bk.x, bk.y, lw * 0.38, deep);
      this._boot(ctx, J.fbX, J.fbY, lw * 0.55, dark);

      // torso (filled, tapered)
      this._torso(ctx, J, lw, line, dark, accent);

      // head + face + class headgear
      this._head(ctx, J, lw, line, deep, accent, s);

      /* ---- front layer ---- */
      // front leg
      const fk = this._knee(J.hipX, J.hipY, J.ffX, J.ffY, h, s);
      this._limb(ctx, J.hipX, J.hipY, fk.x, fk.y, lw, line, dark);
      this._limb(ctx, fk.x, fk.y, J.ffX, J.ffY, lw * 0.88, line, dark);
      this._cap(ctx, fk.x, fk.y, lw * 0.46, dark);
      this._boot(ctx, J.ffX, J.ffY, lw * 0.62, line);

      // front arm (over torso)
      this._limb(ctx, J.shX, J.shY, J.hfX, J.hfY, lw, line, dark);
      this._cap(ctx, J.shX, J.shY, lw * 0.44, deep);
      this._hand(ctx, J.hfX, J.hfY, lw * 0.46, light, accent);

      // shield (guardian)
      this._shield(ctx, J, lw, h, o);

      // weapon
      this._drawWeapon(ctx, J, h, s, light, o);

      // cape / cloak
      this._cloak(ctx, J, lw, h, o);

      // impact flash
      if (this._impactFlash > 0) {
        ctx.strokeStyle = "rgba(255,255,255," + (this._impactFlash * 3) + ")";
        ctx.lineWidth = lw * 2;
        ctx.beginPath();
        ctx.arc(0, -h * 0.4, h * (0.5 + (1 - this._impactFlash) * 0.3), 0, 6.2832);
        ctx.stroke();
      }

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

    /* capsule: filled tapered torso/limb body with rounded ends */
    _capsule(ctx, ax, ay, bx, by, ra, rb, col) {
      const ang = Math.atan2(by - ay, bx - ax);
      const px = Math.cos(ang), py = Math.sin(ang);
      const nx = -py, ny = px;
      ctx.beginPath();
      ctx.moveTo(ax + nx * ra, ay + ny * ra);
      ctx.lineTo(bx + nx * rb, by + ny * rb);
      ctx.arc(bx, by, rb, ang - Math.PI / 2, ang + Math.PI / 2);
      ctx.lineTo(ax - nx * ra, ay - ny * ra);
      ctx.arc(ax, ay, ra, ang + Math.PI / 2, ang + Math.PI * 1.5);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
    }

    /* limb with outline + colored core for depth */
    _limb(ctx, x0, y0, x1, y1, w, col, edge) {
      ctx.strokeStyle = edge;
      ctx.lineWidth = w * 1.28;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    _cap(ctx, x, y, r, col) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.2832);
      ctx.fill();
    }

    _boot(ctx, x, y, w, col) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(0.08);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(w * 0.65, 0, w * 0.6, w * 0.36, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    _hand(ctx, x, y, r, light, accent) {
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.2832);
      ctx.fill();
      ctx.strokeStyle = U.shade(light, -0.25);
      ctx.lineWidth = Math.max(1, r * 0.3);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.85, 0, 6.2832);
      ctx.stroke();
    }

    /* torso: tapered capsule with chest highlight + belt */
    _torso(ctx, J, lw, line, dark, accent) {
      const ax = J.hipX, ay = J.hipY, bx = J.shX, by = J.shY;
      const wH = lw * 0.92, wS = lw * 1.22;
      this._capsule(ctx, ax, ay, bx, by, wH + 1.4, wS + 1.4, dark);
      this._capsule(ctx, ax, ay, bx, by, wH, wS, line);
      // chest highlight along the back edge
      const ang = Math.atan2(by - ay, bx - ax);
      const nx = -Math.cos(ang), ny = -Math.sin(ang);
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.lineWidth = lw * 0.4;
      ctx.beginPath();
      ctx.moveTo(ax + nx * (wH - 1.5), ay + ny * (wH - 1.5));
      ctx.lineTo(bx + nx * (wS - 1.5), by + ny * (wS - 1.5));
      ctx.stroke();
      // belt at hip
      ctx.strokeStyle = accent;
      ctx.lineWidth = lw * 0.5;
      ctx.beginPath();
      ctx.moveTo(ax - wH * 0.9, ay + 1);
      ctx.lineTo(ax + wH * 0.9, ay + 1);
      ctx.stroke();
    }

    /* head + face + class-specific headgear */
    _head(ctx, J, lw, line, deep, accent, s) {
      const hr = 5.4 * s;
      const headX = J.hdX, headY = J.hdY;
      const id = this.warrior ? this.warrior.id : null;

      // head base with rim
      ctx.fillStyle = deep;
      ctx.beginPath();
      ctx.arc(headX, headY, hr + 0.9 * s, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = line;
      ctx.beginPath();
      ctx.arc(headX, headY, hr, 0, 6.2832);
      ctx.fill();

      // back-low shading crescent
      ctx.fillStyle = U.shade(line, -0.2);
      ctx.beginPath();
      ctx.arc(headX, headY, hr, Math.PI * 0.12, Math.PI * 1.18);
      ctx.arc(headX, headY, hr * 0.42, Math.PI * 1.18, Math.PI * 0.12, true);
      ctx.closePath();
      ctx.fill();

      // face (eye toward facing = +x)
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(headX + hr * 0.36, headY - hr * 0.06, hr * 0.3, hr * 0.34, 0, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(headX + hr * 0.45, headY - hr * 0.06, hr * 0.17, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = "#0a0a12";
      ctx.beginPath();
      ctx.arc(headX + hr * 0.51, headY - hr * 0.06, hr * 0.09, 0, 6.2832);
      ctx.fill();
      // brow
      ctx.strokeStyle = U.shade(line, -0.45);
      ctx.lineWidth = hr * 0.16;
      ctx.beginPath();
      ctx.moveTo(headX + hr * 0.06, headY - hr * 0.44);
      ctx.lineTo(headX + hr * 0.62, headY - hr * 0.4);
      ctx.stroke();

      // class headgear
      if (id === "guardian") {
        // steel helmet dome
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(headX, headY - hr * 0.08, hr * 1.14, Math.PI, Math.PI * 2);
        ctx.fill();
        // visor slit
        ctx.strokeStyle = U.shade(accent, -0.5);
        ctx.lineWidth = hr * 0.2;
        ctx.beginPath();
        ctx.moveTo(headX - hr * 0.78, headY - hr * 0.12);
        ctx.lineTo(headX + hr * 0.78, headY - hr * 0.12);
        ctx.stroke();
        // crest
        ctx.strokeStyle = "#ffd75e";
        ctx.lineWidth = hr * 0.26;
        ctx.beginPath();
        ctx.moveTo(headX, headY - hr * 1.05);
        ctx.quadraticCurveTo(headX + hr * 0.2, headY - hr * 1.5, headX + hr * 0.55, headY - hr * 1.35);
        ctx.stroke();
      } else if (id === "assassin") {
        // dark hood
        ctx.fillStyle = U.shade(line, -0.55);
        ctx.beginPath();
        ctx.arc(headX, headY - hr * 0.12, hr * 1.2, Math.PI * 0.92, Math.PI * 2.08);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = deep;
        ctx.lineWidth = lw * 0.32;
        ctx.beginPath();
        ctx.moveTo(headX + hr * 0.1, headY - hr * 1.05);
        ctx.quadraticCurveTo(headX - hr * 0.35, headY + hr * 0.1, headX - hr * 0.3, headY + hr * 0.75);
        ctx.stroke();
      } else if (id === "berserker") {
        // horns
        ctx.strokeStyle = "#efe9d8";
        ctx.lineWidth = hr * 0.3;
        ctx.beginPath();
        ctx.moveTo(headX + hr * 0.55, headY - hr * 0.55);
        ctx.quadraticCurveTo(headX + hr * 1.05, headY - hr * 1.1, headX + hr * 0.9, headY - hr * 1.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(headX - hr * 0.55, headY - hr * 0.55);
        ctx.quadraticCurveTo(headX - hr * 1.0, headY - hr * 1.15, headX - hr * 0.8, headY - hr * 1.65);
        ctx.stroke();
      } else if (id === "ranger") {
        // headband
        ctx.strokeStyle = accent;
        ctx.lineWidth = hr * 0.22;
        ctx.beginPath();
        ctx.moveTo(headX - hr * 0.9, headY - hr * 0.55);
        ctx.quadraticCurveTo(headX, headY - hr * 0.95, headX + hr * 0.9, headY - hr * 0.5);
        ctx.stroke();
        // feather
        ctx.strokeStyle = "#ffb84d";
        ctx.lineWidth = hr * 0.2;
        ctx.beginPath();
        ctx.moveTo(headX + hr * 0.3, headY - hr * 0.62);
        ctx.quadraticCurveTo(headX + hr * 0.75, headY - hr * 1.2, headX + hr * 0.35, headY - hr * 1.5);
        ctx.stroke();
      } else if (id === "shadowmage") {
        // hood with glowing eyes
        ctx.fillStyle = U.shade(line, -0.55);
        ctx.beginPath();
        ctx.arc(headX, headY - hr * 0.12, hr * 1.2, Math.PI * 0.92, Math.PI * 2.08);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#c86bff";
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(headX + hr * 0.45, headY - hr * 0.06, hr * 0.16, 0, 6.2832);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        // warrior: headband + plume
        ctx.strokeStyle = accent;
        ctx.lineWidth = hr * 0.2;
        ctx.beginPath();
        ctx.moveTo(headX - hr * 0.9, headY - hr * 0.5);
        ctx.quadraticCurveTo(headX, headY - hr * 0.9, headX + hr * 0.9, headY - hr * 0.46);
        ctx.stroke();
        ctx.strokeStyle = "#ff5252";
        ctx.lineWidth = hr * 0.26;
        ctx.beginPath();
        ctx.moveTo(headX + hr * 0.05, headY - hr * 0.85);
        ctx.quadraticCurveTo(headX - hr * 0.25, headY - hr * 1.35, headX - hr * 0.6, headY - hr * 1.2);
        ctx.stroke();
      }
    }

    _shield(ctx, J, lw, h, o) {
      if (!o.shield || !this._guardian) return;
      const sx = J.hbX + h * 0.05, sy = J.hbY - h * 0.05;
      const r = h * 0.11;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-0.18);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(r, -r * 0.82, r, 0);
      ctx.quadraticCurveTo(r, r * 0.72, 0, r * 1.12);
      ctx.quadraticCurveTo(-r, r * 0.72, -r, 0);
      ctx.quadraticCurveTo(-r, -r * 0.82, 0, -r);
      ctx.closePath();
      ctx.fillStyle = "#3f5c8f";
      ctx.fill();
      ctx.strokeStyle = "#cfe0ff";
      ctx.lineWidth = lw * 0.4;
      ctx.stroke();
      ctx.fillStyle = "#ffd75e";
      ctx.beginPath();
      ctx.arc(0, -r * 0.05, r * 0.34, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    _cloak(ctx, J, lw, h, o) {
      if (!o.cloak) return;
      const g = this.game;
      const sway = Math.sin(g.elapsed * 6 + this._seed) * h * 0.02;
      ctx.fillStyle = o.cloak;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(J.shX - h * 0.05, J.shY + h * 0.02);
      ctx.quadraticCurveTo(J.shX - h * 0.22, J.shY + h * 0.2, J.shX - h * 0.16 + sway, J.shY + h * 0.44);
      ctx.quadraticCurveTo(J.shX - h * 0.1, J.shY + h * 0.34, J.shX - h * 0.02, J.shY + h * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    _lightFor(o) {
      if (o.light) return o.light;
      return "#ffffff";
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

    _drawTrail(ctx, s, light) {
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
          ctx.strokeStyle = U.hsla(210, 90, 80, 0.06 + alpha * 0.28);
          ctx.lineWidth = (4 + alpha * 6) * s;
          ctx.beginPath();
          ctx.arc(sh.shX, sh.shY, arm * 0.9, mid - span / 2, mid + span / 2);
          ctx.stroke();
        }
      }
      // active swing: bright arc
      if (this._impactFlash > 0 && this.cfg.kind !== "bow" && this.cfg.kind !== "staff") {
        ctx.strokeStyle = U.hsla(40, 100, 70, this._impactFlash);
        ctx.lineWidth = (7 + this._impactFlash * 4) * s;
        ctx.beginPath();
        ctx.arc(sh.shX, sh.shY, arm * 0.92, pose.wep - 0.35, pose.wep + 0.35);
        ctx.stroke();
      }
    }

    _drawWeapon(ctx, J, h, s, light, o) {
      const cfg = this.cfg;
      const wepLen = h * (cfg.kind === "spear" ? 0.75 : cfg.kind === "staff" ? 0.6 : 0.55);
      const tx = J.hfX, ty = J.hfY;
      const ang = this.pose.wep;
      const lw = Math.max(1.5, 3 * s);

      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(ang);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.1 + Math.min(0.4, this.pose.charge * 0.5);
      ctx.strokeStyle = U.shade(light, 0.3);
      ctx.lineWidth = lw * 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(wepLen, 0);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      const col = (o.weapon && o.weapon.color) || cfg.trail || "#ffffff";
      const dk = U.shade(col, -0.5);
      switch (cfg.kind) {
        case "sword":
        case "axe":
        case "hammer":
        case "dagger": {
          // outline
          ctx.strokeStyle = dk;
          ctx.lineWidth = lw * 1.5;
          ctx.beginPath();
          ctx.moveTo(-h * 0.05, 0);
          ctx.lineTo(wepLen, 0);
          ctx.stroke();
          // blade
          ctx.strokeStyle = col;
          ctx.lineWidth = lw * 0.95;
          ctx.beginPath();
          ctx.moveTo(-h * 0.05, 0);
          ctx.lineTo(wepLen, 0);
          ctx.stroke();
          // edge highlight
          ctx.save();
          ctx.translate(0, -lw * 0.26);
          ctx.strokeStyle = "rgba(255,255,255,0.5)";
          ctx.lineWidth = lw * 0.22;
          ctx.beginPath();
          ctx.moveTo(h * 0.01, 0);
          ctx.lineTo(wepLen * 0.96, 0);
          ctx.stroke();
          ctx.restore();
          // grip + pommel
          ctx.strokeStyle = U.shade(col, -0.6);
          ctx.lineWidth = lw * 0.7;
          ctx.beginPath();
          ctx.moveTo(-h * 0.05, 0);
          ctx.lineTo(h * 0.03, 0);
          ctx.stroke();
          ctx.fillStyle = U.shade(col, -0.35);
          ctx.beginPath();
          ctx.arc(-h * 0.06, 0, lw * 0.5, 0, 6.2832);
          ctx.fill();
          // crossguard
          ctx.strokeStyle = U.shade(col, -0.2);
          ctx.lineWidth = lw * 0.8;
          ctx.beginPath();
          ctx.moveTo(h * 0.03, -lw * 1.5);
          ctx.lineTo(h * 0.03, lw * 1.5);
          ctx.stroke();
          // tip glow
          ctx.fillStyle = col;
          ctx.globalAlpha = 0.5 + this._impactFlash;
          ctx.beginPath();
          ctx.arc(wepLen, 0, lw * 0.5, 0, 6.2832);
          ctx.fill();
          ctx.globalAlpha = 1;
          // axe / hammer head
          if (cfg.kind === "axe" || cfg.kind === "hammer") {
            const hx0 = wepLen - h * 0.02;
            ctx.fillStyle = dk;
            ctx.beginPath();
            ctx.moveTo(hx0, -lw * 2.4);
            ctx.lineTo(wepLen + h * 0.05, 0);
            ctx.lineTo(hx0, lw * 2.4);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.moveTo(hx0, -lw * 2.0);
            ctx.lineTo(wepLen + h * 0.05, 0);
            ctx.lineTo(hx0, lw * 2.0);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.4)";
            ctx.lineWidth = lw * 0.18;
            ctx.beginPath();
            ctx.moveTo(hx0, -lw * 1.4);
            ctx.lineTo(wepLen + h * 0.02, 0);
            ctx.stroke();
          }
          break;
        }
        case "spear": {
          ctx.strokeStyle = dk;
          ctx.lineWidth = lw * 1.3;
          ctx.beginPath();
          ctx.moveTo(-h * 0.12, 0);
          ctx.lineTo(wepLen, 0);
          ctx.stroke();
          ctx.strokeStyle = U.shade(col, -0.2);
          ctx.lineWidth = lw * 0.8;
          ctx.beginPath();
          ctx.moveTo(-h * 0.12, 0);
          ctx.lineTo(wepLen, 0);
          ctx.stroke();
          ctx.fillStyle = U.shade("#ffffff", -0.35);
          ctx.beginPath();
          ctx.moveTo(wepLen, -lw * 1.7);
          ctx.lineTo(wepLen + h * 0.08, 0);
          ctx.lineTo(wepLen, lw * 1.7);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.moveTo(wepLen - lw * 0.4, -lw * 1.3);
          ctx.lineTo(wepLen + h * 0.07, 0);
          ctx.lineTo(wepLen - lw * 0.4, lw * 1.3);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case "staff": {
          ctx.strokeStyle = dk;
          ctx.lineWidth = lw * 1.4;
          ctx.beginPath();
          ctx.moveTo(-h * 0.12, 0);
          ctx.lineTo(wepLen, 0);
          ctx.stroke();
          ctx.strokeStyle = U.shade(col, -0.15);
          ctx.lineWidth = lw * 0.9;
          ctx.beginPath();
          ctx.moveTo(-h * 0.12, 0);
          ctx.lineTo(wepLen, 0);
          ctx.stroke();
          // orb
          const orbR = lw * (1 + this.pose.charge);
          ctx.fillStyle = U.shade(col, -0.3);
          ctx.beginPath();
          ctx.arc(wepLen, 0, orbR + 0.9, 0, 6.2832);
          ctx.fill();
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(wepLen, 0, orbR, 0, 6.2832);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.8)";
          ctx.beginPath();
          ctx.arc(wepLen - orbR * 0.25, -orbR * 0.25, orbR * 0.3, 0, 6.2832);
          ctx.fill();
          if (this.pose.charge > 0.2) {
            ctx.strokeStyle = U.hsla(270, 90, 80, 0.5 + this.pose.charge * 0.4);
            ctx.lineWidth = lw * 0.5;
            ctx.beginPath();
            ctx.arc(wepLen, 0, orbR + 2 + this.pose.charge * 4, 0, 6.2832);
            ctx.stroke();
            const t = this.game.elapsed * 6;
            for (let i = 0; i < 3; i++) {
              const a = t + i * 2.094;
              const r = orbR + 3.5 + this.pose.charge * 3;
              ctx.fillStyle = "rgba(200,140,255,0.8)";
              ctx.beginPath();
              ctx.arc(wepLen + Math.cos(a) * r, Math.sin(a) * r, lw * 0.28, 0, 6.2832);
              ctx.fill();
            }
          }
          break;
        }
        case "bow": {
          const bend = 0.25 + this.pose.charge * 0.7;
          ctx.strokeStyle = dk;
          ctx.lineWidth = lw * 1.2;
          ctx.beginPath();
          ctx.moveTo(wepLen, -h * 0.2);
          ctx.quadraticCurveTo(wepLen - bend * h * 0.25, 0, wepLen, h * 0.2);
          ctx.stroke();
          ctx.strokeStyle = col;
          ctx.lineWidth = lw * 0.7;
          ctx.beginPath();
          ctx.moveTo(wepLen, -h * 0.2);
          ctx.quadraticCurveTo(wepLen - bend * h * 0.25, 0, wepLen, h * 0.2);
          ctx.stroke();
          // string
          ctx.strokeStyle = "rgba(255,255,255,0.75)";
          ctx.lineWidth = lw * 0.2;
          ctx.beginPath();
          ctx.moveTo(wepLen, -h * 0.2);
          ctx.quadraticCurveTo(wepLen - bend * h * 0.3, 0, wepLen, h * 0.2);
          ctx.stroke();
          // nocked arrow while drawing
          if (this.pose.charge > 0) {
            const cx = wepLen - bend * h * 0.22;
            ctx.strokeStyle = "#e8d9a8";
            ctx.lineWidth = lw * 0.3;
            ctx.beginPath();
            ctx.moveTo(cx - h * 0.18, 0);
            ctx.lineTo(cx + h * 0.1, 0);
            ctx.stroke();
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.moveTo(cx + h * 0.1, -lw * 0.5);
            ctx.lineTo(cx + h * 0.16, 0);
            ctx.lineTo(cx + h * 0.1, lw * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "#ff8a5c";
            ctx.lineWidth = lw * 0.2;
            ctx.beginPath();
            ctx.moveTo(cx - h * 0.13, 0);
            ctx.lineTo(cx - h * 0.18, -lw * 0.55);
            ctx.moveTo(cx - h * 0.13, 0);
            ctx.lineTo(cx - h * 0.18, lw * 0.55);
            ctx.stroke();
          }
          break;
        }
      }
      ctx.restore();
    }

    /* ---- pooled dust particles ---- */

    _dust(x, y, n, strength) {
      const g = this.game;
      if (!g || !SL.Particles) return;
      if (g.settings && g.settings.fx === false) return;
      for (let i = 0; i < n; i++) {
        SL.Particles.trail(x + (Math.random() - 0.5) * 8, y - 1,
          { vx: (Math.random() - 0.5) * 90, vy: -Math.random() * 40 - 15, life: 0.35 + Math.random() * 0.2, size: 3 + Math.random() * 2.5, color: "rgba(190,190,195,0.5)", grow: true });
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

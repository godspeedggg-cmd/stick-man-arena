/* ============================================================
 * Stickman: Warrior's Legacy
 * entities.js — procedural stickman renderer, Player,
 *               Enemy AI (7 types), Projectiles, Pickups
 * ============================================================ */
(function (SL) {
  "use strict";
  const U = SL.U;

  /* 2-bone IK knee: returns the knee joint for a hip->foot limb so legs
   * naturally bend instead of drawing as rigid straight lines. */
  function ikKnee(hx, hy, fx, fy, seg, f) {
    const dx = fx - hx, dy = fy - hy;
    const d = Math.hypot(dx, dy) || 0.0001;
    const len = Math.min(seg, d * 0.62);
    if (d >= len * 2) {
      return { x: hx + dx * 0.5, y: hy + dy * 0.5 };
    }
    const midX = (hx + fx) / 2, midY = (hy + fy) / 2;
    const off = Math.sqrt(Math.max(0, len * len - (d / 2) * (d / 2)));
    let nx = -dy / d, ny = dx / d;
    if (nx * f > 0) { nx = -nx; ny = -ny; }
    return { x: midX + nx * off, y: midY + ny * off };
  }

  /* =================================================================
   * drawStickman — draws a procedural stick figure from joints.
   * o: { x, y (feet center), scale, facing, t (time), speed (0..1),
   *     pose, poseT (0..1), color, weapon, shield, outfit,
   *     alpha, glow }
   * ================================================================= */
  function drawStickman(ctx, o) {
    const s = o.scale || 1;
    const h = 64 * s;
    const f = o.facing || 1;
    const x = o.x;
    const y = o.y;
    const t = o.t || 0;
    const speed = o.speed || 0;
    const pose = o.pose || "idle";
    const pt = o.poseT || 0;
    const bodyCol = o.color || "#dfe7ff";
    const alpha = o.alpha !== undefined ? o.alpha : 1;

    const headR = 5.4 * s;
    const neckY = y - h * 0.74;
    const shoulderY = y - h * 0.66;
    let hipY = y - h * 0.42;
    const limbW = Math.max(1.6, h * 0.05);
    const torsoW = Math.max(2.2, h * 0.07);

    ctx.save();
    ctx.globalAlpha = alpha;

    // shadow
    if (o.shadow !== false) {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(x, y + 1, h * 0.22, h * 0.05, 0, 0, U.TAU);
      ctx.fill();
    }

    const cx = x;
    const cy = shoulderY;

    // compute limb positions
    let hands = { fx: 0, fy: 0, bx: 0, by: 0 };
    let feet = { fx: 0, fy: 0, bx: 0, by: 0 };
    let headPos = { x: cx, y: neckY - headR - 2 * s };
    let weaponAngle = 0;
    let shX = cx, shY = shoulderY, hipX = cx;

    const walkPhase = t * 9 * (0.4 + speed * 0.6);

    if (pose === "idle") {
      const breath = Math.sin(t * 3) * 0.03 * h;
      headPos = { x: cx, y: neckY - headR + breath * 0.4 };
      feet = {
        fx: cx + h * 0.08 * f, fy: y,
        bx: cx - h * 0.08 * f, by: y,
      };
      hands = {
        fx: cx + h * 0.16 * f, fy: cy + h * 0.1,
        bx: cx - h * 0.10 * f, by: cy + h * 0.12,
      };
      weaponAngle = -Math.PI * 0.75;
    } else if (pose === "run") {
      const ph = walkPhase;
      const step = Math.sin(ph);
      const step2 = Math.sin(ph + Math.PI);
      const stride = h * 0.19;
      const bob = Math.abs(step) * h * 0.03;
      const lean = h * 0.05;
      const fLift = (0.5 * (1 + Math.cos(2 * ph))) * h * 0.14;
      const bLift = (0.5 * (1 + Math.cos(2 * (ph + Math.PI)))) * h * 0.14;
      feet = {
        fx: cx + step * stride * f, fy: y - fLift,
        bx: cx - step * stride * f, by: y - bLift,
      };
      shX = cx + lean * f;
      shY = shoulderY + bob;
      hipX = cx + lean * 0.55 * f;
      hipY += bob;
      hands = {
        fx: shX + h * 0.2 * f + step2 * h * 0.04 * f, fy: shY - h * 0.02 + step2 * h * 0.06,
        bx: shX - h * 0.14 * f + step * h * 0.03 * f, by: shY + h * 0.05 + step * h * 0.06,
      };
      weaponAngle = -Math.PI * 0.85;
      headPos = { x: shX + h * 0.03 * f, y: neckY - headR + bob };
    } else if (pose === "attack" || pose === "heavy") {
      const isHeavy = pose === "heavy";
      const wind = isHeavy ? 0.4 : 0.26;
      const strikeEnd = wind + (1 - wind) * 0.62;
      const a0 = isHeavy ? Math.PI * 0.62 : Math.PI * 0.42;
      const a1 = isHeavy ? -Math.PI * 0.98 : -Math.PI * 0.76;
      let ang;
      if (pt < wind) {
        ang = U.lerp(a0 + 0.18, a0, U.easeInQuad(pt / wind));
      } else if (pt < strikeEnd) {
        ang = U.lerp(a0, a1, U.easeOutCubic((pt - wind) / (strikeEnd - wind)));
      } else {
        ang = U.lerp(a1, a1 + 0.32, U.easeOutQuad((pt - strikeEnd) / (1 - strikeEnd)));
      }
      weaponAngle = ang;
      const swingAmt = pt < wind ? -(pt / wind) : (pt - wind) / (strikeEnd - wind);
      const lean = (isHeavy ? 0.09 : 0.06) * h;
      const lDip = (isHeavy ? 0.045 : 0.02) * h * Math.max(0, -Math.sin(ang));
      shX = cx + swingAmt * lean * f;
      shY = shoulderY + lDip;
      hipX = cx + swingAmt * lean * 0.5 * f;
      hipY += lDip * 0.6;
      const reach = h * 0.27;
      hands = {
        fx: shX + Math.cos(ang) * reach * f,
        fy: shY + Math.sin(ang) * reach,
        bx: cx - h * 0.13 * f, by: shoulderY + h * 0.1,
      };
      feet = {
        fx: cx + (isHeavy ? -0.02 : 0.1) * h * f, fy: y,
        bx: cx - 0.12 * h * f, by: y,
      };
      if (pt >= wind && pt < strikeEnd + 0.1) {
        const arcP = U.clamp((pt - wind) / (strikeEnd - wind), 0, 1);
        const arcA0 = a0 - 0.1, arcA1 = a1 + 0.3;
        const arcR = h * (isHeavy ? 0.45 : 0.4);
        ctx.save();
        ctx.globalAlpha = alpha * 0.3 * (1 - arcP);
        ctx.strokeStyle = isHeavy ? "#ffd27a" : "#cfe7ff";
        ctx.lineWidth = (isHeavy ? 4.5 : 3) * s;
        ctx.beginPath();
        for (let i = 0; i <= 14; i++) {
          const a = U.lerp(arcA0, arcA1, i / 14);
          const px = shX + Math.cos(a) * arcR * f;
          const py = shY + Math.sin(a) * arcR;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
      }
    } else if (pose === "cast") {
      const aim = pt * 0.3;
      weaponAngle = 0;
      hands = {
        fx: cx + h * 0.3 * f, fy: cy + Math.sin(t * 5) * 2 * s,
        bx: cx - h * 0.1 * f, by: cy + h * 0.1,
      };
      feet = {
        fx: cx + h * 0.07 * f, fy: y,
        bx: cx - h * 0.07 * f, by: y,
      };
    } else if (pose === "jump") {
      feet = {
        fx: cx + h * 0.16 * f, fy: y - h * 0.12,
        bx: cx - h * 0.02 * f, by: y - h * 0.2,
      };
      hands = {
        fx: cx + h * 0.2 * f, fy: cy - h * 0.1,
        bx: cx - h * 0.12 * f, by: cy + h * 0.08,
      };
      weaponAngle = -Math.PI * 0.6;
    } else if (pose === "dash") {
      const lean = 0.25;
      feet = {
        fx: cx - h * 0.1 * f, fy: y,
        bx: cx - h * 0.26 * f, by: y,
      };
      hands = {
        fx: cx - h * 0.3 * f, fy: cy + h * 0.06,
        bx: cx - h * 0.1 * f, by: cy + h * 0.12,
      };
      weaponAngle = -Math.PI * 0.95;
      headPos = { x: cx - h * 0.05 * f, y: neckY - headR };
    } else if (pose === "hurt") {
      const knock = pt;
      headPos = { x: cx - h * 0.12 * f, y: neckY - headR };
      hands = {
        fx: cx - h * 0.2 * f, fy: cy + h * 0.16,
        bx: cx - h * 0.24 * f, by: cy + h * 0.05,
      };
      feet = {
        fx: cx + h * 0.06 * f, fy: y,
        bx: cx - h * 0.2 * f, by: y + h * 0.02,
      };
    } else if (pose === "dead") {
      // lying on ground
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(f * 1.45);
      const hx = 0, hy = -h * 0.14;
      ctx.globalAlpha = alpha * 0.9;
      // draw lying body
      const layHip = { x: hx, y: hy + h * 0.28 };
      const laySh = { x: hx + h * 0.26, y: hy + h * 0.1 };
      const layHead = { x: laySh.x + h * 0.16, y: laySh.y - h * 0.08 };
      ctx.strokeStyle = bodyCol; ctx.lineWidth = torsoW; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(layHip.x, layHip.y); ctx.lineTo(laySh.x, laySh.y); ctx.stroke();
      ctx.strokeStyle = bodyCol; ctx.lineWidth = limbW;
      ctx.beginPath(); ctx.moveTo(layHip.x, layHip.y); ctx.lineTo(layHip.x - h * 0.05, layHip.y + h * 0.16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(layHip.x, layHip.y); ctx.lineTo(layHip.x + h * 0.12, layHip.y + h * 0.14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(laySh.x, laySh.y); ctx.lineTo(laySh.x - h * 0.02, laySh.y + h * 0.14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(laySh.x, laySh.y); ctx.lineTo(laySh.x + h * 0.14, laySh.y + h * 0.02); ctx.stroke();
      ctx.fillStyle = bodyCol;
      ctx.beginPath(); ctx.arc(layHead.x, layHead.y, headR, 0, U.TAU); ctx.fill();
      ctx.restore();
      ctx.restore();
      return;
    }

    // ---- torso ----
    ctx.lineCap = "round";
    ctx.strokeStyle = bodyCol;
    ctx.lineWidth = torsoW;
    ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(shX, shY); ctx.stroke();

    // ---- legs (2-bone IK so knees bend naturally) ----
    const legSeg = h * 0.22;
    const kneeF = ikKnee(hipX, hipY, feet.fx, feet.fy, legSeg, f);
    const kneeB = ikKnee(hipX, hipY, feet.bx, feet.by, legSeg, f);
    ctx.strokeStyle = bodyCol;
    ctx.lineWidth = limbW;
    ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(kneeF.x, kneeF.y); ctx.lineTo(feet.fx, feet.fy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(kneeB.x, kneeB.y); ctx.lineTo(feet.bx, feet.by); ctx.stroke();

    // ---- head ----
    if (o.outfit && o.outfit.hood) {
      ctx.fillStyle = U.shade(bodyCol, -0.25);
      ctx.beginPath(); ctx.arc(headPos.x, headPos.y, headR + 1.5 * s, 0, U.TAU); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath(); ctx.arc(headPos.x + headR * 0.35 * f, headPos.y + headR * 0.2, headR * 0.55, 0, U.TAU); ctx.fill();
    } else {
      ctx.fillStyle = bodyCol;
      ctx.beginPath(); ctx.arc(headPos.x, headPos.y, headR, 0, U.TAU); ctx.fill();
      // eye
      ctx.fillStyle = "rgba(10,12,24,0.9)";
      ctx.beginPath();
      ctx.arc(headPos.x + headR * 0.5 * f, headPos.y + headR * 0.1, headR * 0.22, 0, U.TAU);
      ctx.fill();
    }
    // horns / crown
    if (o.outfit && o.outfit.horns) {
      ctx.strokeStyle = U.shade(bodyCol, -0.35);
      ctx.lineWidth = limbW * 0.8;
      ctx.beginPath();
      ctx.moveTo(headPos.x - headR * 0.7, headPos.y - headR * 0.5);
      ctx.quadraticCurveTo(headPos.x - headR * 1.3, headPos.y - headR * 1.7, headPos.x - headR * 1.6, headPos.y - headR * 2.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(headPos.x + headR * 0.7, headPos.y - headR * 0.5);
      ctx.quadraticCurveTo(headPos.x + headR * 1.3, headPos.y - headR * 1.7, headPos.x + headR * 1.6, headPos.y - headR * 2.4);
      ctx.stroke();
    }
    if (o.outfit && o.outfit.crown) {
      ctx.fillStyle = "#ffc34d";
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(headPos.x + i * headR * 0.7 - headR * 0.2, headPos.y - headR);
        ctx.lineTo(headPos.x + i * headR * 0.7, headPos.y - headR * 1.7);
        ctx.lineTo(headPos.x + i * headR * 0.7 + headR * 0.2, headPos.y - headR);
        ctx.fill();
      }
    }
    if (o.outfit && o.outfit.helmet) {
      ctx.fillStyle = U.shade(bodyCol, 0.05);
      ctx.beginPath(); ctx.arc(headPos.x, headPos.y, headR + 1 * s, Math.PI, 0); ctx.fill();
    }

    // ---- legs ----
    ctx.strokeStyle = bodyCol;
    ctx.lineWidth = limbW;
    ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(feet.fx, feet.fy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(feet.bx, feet.by); ctx.stroke();
    // feet
    ctx.fillStyle = bodyCol;
    ctx.beginPath(); ctx.ellipse(feet.fx, feet.fy, h * 0.05, h * 0.025, 0, 0, U.TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(feet.bx, feet.by, h * 0.05, h * 0.025, 0, 0, U.TAU); ctx.fill();

    // ---- arms ----
    ctx.lineWidth = limbW;
    ctx.strokeStyle = bodyCol;
    ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(hands.fx, hands.fy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(hands.bx, hands.by); ctx.stroke();

    // ---- shield (off-hand) ----
    if (o.shield) {
      const sx = hands.bx, sy = hands.by;
      ctx.fillStyle = "#3d6bd4";
      ctx.strokeStyle = "#9cc4ff";
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(sx + 3 * f, sy - h * 0.09);
      ctx.quadraticCurveTo(sx + h * 0.13 * f, sy - h * 0.02, sx + 3 * f, sy + h * 0.07);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    // ---- weapon ----
    if (o.weapon) drawWeapon(ctx, o.weapon, hands.fx, hands.fy, weaponAngle, s, f, t);

    // ---- cloak ----
    if (o.outfit && o.outfit.cloak) {
      ctx.strokeStyle = o.outfit.cloak;
      ctx.lineWidth = torsoW * 1.5;
      ctx.globalAlpha = alpha * 0.6;
      const sway = Math.sin(t * 4) * h * 0.04;
      ctx.beginPath();
      ctx.moveTo(shX, shY + h * 0.02);
      ctx.quadraticCurveTo(shX - h * 0.1 * f, shY + h * 0.2, shX - h * 0.16 * f + sway, hipY + h * 0.12);
      ctx.stroke();
      ctx.globalAlpha = alpha;
    }

    ctx.restore();
  }

  /* draws the weapon (sword/axe/dagger/bow/staff) attached to the hand */
  function drawWeapon(ctx, w, hx, hy, ang, s, f, t) {
    const kind = w.kind || "sword";
    const col = w.color || "#cfe0ff";
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang * f);
    ctx.lineCap = "round";
    if (kind === "sword") {
      const len = w.len || 30 * s;
      const grd = ctx.createLinearGradient(0, 0, len, 0);
      grd.addColorStop(0, U.shade(col, -0.3));
      grd.addColorStop(0.6, col);
      grd.addColorStop(1, "#ffffff");
      ctx.strokeStyle = grd;
      ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
      // guard
      ctx.strokeStyle = U.shade(col, -0.5);
      ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.moveTo(2 * s, -3.5 * s); ctx.lineTo(2 * s, 3.5 * s); ctx.stroke();
      // glow
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = col;
      ctx.lineWidth = 7 * s;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (kind === "dagger") {
      const len = (w.len || 16 * s);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.4 * s;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 5 * s;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (kind === "axe") {
      const len = 24 * s;
      ctx.strokeStyle = col;
      ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(len * 0.7, -6 * s);
      ctx.quadraticCurveTo(len * 1.15, -10 * s, len * 0.95, -2 * s);
      ctx.lineTo(len * 0.95, 3 * s);
      ctx.quadraticCurveTo(len * 1.15, 8 * s, len * 0.7, 4 * s);
      ctx.closePath();
      ctx.fill();
    } else if (kind === "hammer") {
      const len = 26 * s;
      ctx.strokeStyle = col;
      ctx.lineWidth = 3.4 * s;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
      ctx.fillStyle = col;
      ctx.fillRect(len * 0.7, -7 * s, 12 * s, 12 * s);
      ctx.fillStyle = U.shade(col, 0.3);
      ctx.fillRect(len * 0.7, -7 * s, 12 * s, 3 * s);
    } else if (kind === "bow") {
      const len = 26 * s;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.2 * s;
      ctx.beginPath();
      ctx.arc(0, 0, len, -Math.PI / 2 - 0.6, Math.PI / 2 + 0.6);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      ctx.moveTo(len * Math.cos(-Math.PI / 2 - 0.5), len * Math.sin(-Math.PI / 2 - 0.5));
      ctx.lineTo(0, 0);
      ctx.lineTo(len * Math.cos(Math.PI / 2 + 0.5), len * Math.sin(Math.PI / 2 + 0.5));
      ctx.stroke();
    } else if (kind === "staff") {
      const len = 30 * s;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.6 * s;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
      const orb = 5 * s;
      const pulse = 1 + Math.sin(t * 6) * 0.2;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(len, 0, orb * pulse, 0, U.TAU); ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(len, 0, orb * 2.2 * pulse, 0, U.TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /* =================================================================
   * PLAYER
   * ================================================================= */
  class Player {
    constructor(game, warrior) {
      this.game = game;
      this.warrior = warrior;
      this.stats = game.run;
      const base = warrior.base;
      this.maxHp = (base.maxHp) * (1 + game.run.maxHpMul) + game.run.maxHpFlat;
      this.hp = this.maxHp;
      this.shieldHp = 0;
      this.baseSpeed = base.speed;
      this.w = 20; this.h = 58;
      this.x = 0; this.y = 0;
      this.vx = 0; this.vy = 0;
      this.facing = 1;
      this.onGround = true;
      this.platform = null;
      this.jumps = 1;
      this.dead = false;
      this.level = 1;
      this.xp = 0;
      this.xpNeed = this._xpNeed(1);
      this.attack = null;        // {type, t, dur, hits, strike, activeStart}
      this.attackChain = 0;
      this.chainTimer = 0;
      this.heavyCd = 0;
      this.dashCd = 0;
      this.dashTimer = 0;
      this.dashDir = 1;
      this.specialCd = 0;
      this.ultCd = 0;
      this.iFrames = 0;
      this.hurtFlash = 0;
      this.airAtk = false;
      this.castTimer = 0;
      this.reviveUsed = false;
      this.aegisTimer = 0;
      this.buffs = {};
      this.spinAnim = 0;
      this.attackHoldT = 0;
      this.victoryT = 0;
      this.hurtT = 0;
      this.hurtDur = 0.3;
      this.hurtDir = 1;
      this.landT = 0;
      this.dashRecoverT = 0;
      this.animator = window.SL.Anim ? new window.SL.Anim.PlayerAnimator(this, warrior) : null;
    }

    _xpNeed(lvl) { return Math.round(12 * Math.pow(lvl, 1.5) + 8); }

    addXp(n) {
      const g = this.game;
      this.xp += Math.max(1, Math.floor(n * this.stats.xpMul));
      while (this.xp >= this.xpNeed) {
        this.xp -= this.xpNeed;
        this.level++;
        this.xpNeed = this._xpNeed(this.level);
        g.onLevelUp();
      }
    }

    resetPosition(groundY, worldX) {
      this.x = worldX;
      this.y = groundY;
      this.vx = 0; this.vy = 0;
      this.onGround = true;
    }

    update(dt) {
      const g = this.game;
      const inp = g.input;
      const st = this.stats;

      // timers
      if (this.dashCd > 0) this.dashCd -= dt;
      if (this.specialCd > 0) this.specialCd -= dt;
      if (this.ultCd > 0) this.ultCd -= dt;
      if (this.iFrames > 0) this.iFrames -= dt;
      if (this.hurtFlash > 0) this.hurtFlash -= dt;
      if (this.chainTimer > 0) this.chainTimer -= dt;
      if (this.castTimer > 0) this.castTimer -= dt;
      if (this.spinAnim > 0) this.spinAnim -= dt;
      if (this.heavyCd > 0) this.heavyCd -= dt;
      if (this.attackHoldT > 0) this.attackHoldT -= dt;
      if (this.victoryT > 0) this.victoryT -= dt;
      if (this.hurtT > 0) this.hurtT -= dt;
      if (this.landT > 0) this.landT -= dt;
      if (st.aegis > 0) {
        this.aegisTimer -= dt;
        if (this.aegisTimer <= 0) {
          this.aegisTimer = 20;
          this.shieldHp += Math.round(this.maxHp * 0.3 * st.aegis);
          g.particles.ring(this.x, this.y - 40, "#8fd8ff", 20, 0.5);
          g.audio.play("shield");
        }
      }

      // regenerate
      if (this.hp < this.maxHp && !this.dead) {
        const regen = st.regen + (this.buffs.warcry ? this.maxHp * 0.03 : 0);
        this.hp = Math.min(this.maxHp, this.hp + regen * dt);
      }

      const canAct = !this.dead && this.dashTimer <= 0;

      /* -------- movement -------- */
      if (this.dashTimer > 0) {
        this.dashTimer -= dt;
        this.vx = this.dashDir * g.dashSpeed * (this.stats.dashDistMul * 0.5 + 0.5);
        this.x += this.vx * dt;
        g.particles.trail(this.x - this.dashDir * 10, this.y - 30, this.warrior.color, 5);
        if (this.dashTimer <= 0) this.dashRecoverT = 0.14;
      } else if (this.dashRecoverT > 0) {
        this.dashRecoverT -= dt;
        this.vx *= 0.85;
      } else {
        let mx = inp.getAxisX();
        if (inp.isDown("left")) mx = -1;
        if (inp.isDown("right")) mx = 1;
        const speed = this.baseSpeed * st.speedMul * (this.buffs.warcry ? 1.2 : 1);
        this.vx = mx * speed;
        this.x += this.vx * dt;
        if (Math.abs(this.vx) > 20) this.facing = this.vx > 0 ? 1 : -1;
        // face nearest threat otherwise
      }

      // set facing toward nearest enemy
      const near = g.nearestEnemy(this.x, this.y, 460);
      if (near && this.attack === null) {
        this.facing = near.x > this.x ? 1 : -1;
      }

      /* -------- vertical -------- */
      if (!this.dead) {
        this.vy += g.gravity * dt;
        this.vyBeforeLand = this.vy;
        const jp = inp.wasPressed("jump");
        if (jp && this.onGround) {
          this.vy = -g.jumpVel * st.jumpMul;
          this.onGround = false;
          this.jumps = st.doubleJump ? 2 : 1;
          g.audio.play("jump");
          g.particles.burst(this.x, this.y, "#bcd0ff", 6, 90, 2.5, 0.3, 0);
        } else if (jp && st.doubleJump && this.jumps > 1) {
          this.vy = -g.jumpVel * st.jumpMul * 0.85;
          this.jumps--;
          this.onGround = false;
          g.audio.play("jump");
          g.particles.ring(this.x, this.y - 30, "#8fd8ff", 12, 0.4);
        } else if (jp && !this.onGround && !st.doubleJump) {
          this.airAtk = true;
        }
        this.y += this.vy * dt;
        const ground = g.resolveGround(this, this.y - this.vy * dt);
        if (ground) {
          const wasAir = !this.onGround;
          this.y = ground.y;
          this.vy = 0;
          this.onGround = true;
          this.jumps = st.doubleJump ? 2 : 1;
          this.platform = ground.platform || null;
          // ice platforms slide (low friction)
          if (this.platform && this.platform.kind === "ice") this.vx *= 0.92;
          if (wasAir && this.attack && this.attack.type === "air") {
            this.landSlam();
          }
          if (wasAir) {
            this.landT = 0.18;
            if (Math.abs(this.vyBeforeLand) > 1300) {
              g.screenShake(5.5, 0.2);
              g.particles.burst(this.x, this.y, "#cfd8e8", 10, 220, 3, 0.4, 300);
            }
          }
          this.vyBeforeLand = 0;
        } else {
          this.onGround = false;
          this.platform = null;
        }
      }

      /* -------- attacking -------- */
      if (this.attack) {
        this.attack.t += dt;
        if (this.attack.t >= this.attack.dur) {
          this.attack = null;
          this.airAtk = false;
        }
      }

      if (canAct && this.attack === null) {
        if (inp.wasPressed("heavy")) {
          if (!this.onGround) this.startAttack("airHeavy");
          else this.startAttack("heavy");
          this.attackHoldT = 0.5;
        } else if (inp.wasPressed("attack") || (inp.isDown("attack") && this.attackHoldT <= 0)) {
          if (!this.onGround) {
            this.startAttack("air");
          } else {
            this.startAttack("light");
          }
          this.attackHoldT = 0.32;
        }
      } else if (this.attack && this.attack.t > this.attack.dur * 0.55 && this.attackChain < 2) {
        if (inp.wasPressed("attack") && this.onGround) {
          this.attackChain++;
          this.startAttack("light");
        }
      }
      if (this.attack === null && this.attackChain > 0 && this.chainTimer <= 0) {
        this.attackChain = 0;
      }

      /* -------- dash -------- */
      if (canAct && this.attack === null && inp.wasPressed("dash") && this.dashCd <= 0) {
        const dir = this.facing;
        this.dashDir = dir;
        this.dashTimer = g.dashDuration;
        this.dashCd = 2.1 * st.dashCdMul;
        this.iFrames = Math.max(this.iFrames, g.dashDuration + 0.05);
        this.vy = 0;
        g.audio.play("dash");
        g.screenShake(3, 0.15);
        g.spawnAfterimages();
        this.dashHit = new Set();
      }

      /* -------- special / ultimate -------- */
      if (canAct && inp.wasPressed("special") && this.specialCd <= 0 && this.castTimer <= 0) {
        this.useSpecial();
      }
      if (canAct && inp.wasPressed("ultimate") && this.ultCd <= 0 && this.castTimer <= 0) {
        this.useUltimate();
      }

      /* -------- animation (visual only) -------- */
      if (this.animator) this.animator.update(dt);
    }

    startAttack(type) {
      const st = this.stats;
      const aspd = 1 + (st.attackSpeedMul - 1) * (1 + (this.game.run.synFrenzy ? Math.min(1, this.game.combo / 100) * 0.5 : 0));
      let combo = 0;
      if (type === "light") {
        combo = this.attackChain % 3;
      }
      let dur;
      if (this.animator) {
        this.animator.attackSpeed = aspd;
        const timing = this.animator.beginAttack(type, combo);
        dur = timing.dur;
      } else {
        if (type === "light") dur = (combo === 2 ? 0.34 : 0.26) / aspd;
        else if (type === "heavy") dur = 0.58 / aspd;
        else if (type === "air") dur = 0.3;
        else dur = 0.35;
      }
      this.attack = { type, t: 0, dur, hits: new Set(), strike: 0, combo, speed: aspd };
      if (type === "light") {
        this.chainTimer = window.SL.Anim ? window.SL.Anim.CONFIG.comboWindow / aspd : 0.3 / aspd;
      }
      if (type === "heavy") {
        this.heavyCd = 0.6;
        this.castTimer = Math.min(0.4, dur * 0.45);
      } else if (type === "airHeavy") {
        this.vy = Math.max(this.vy, 260);
      }
      this.game.audio.play("slash");
    }

    /* returns active hitbox list for current attack (world coords) */
    activeHitboxes() {
      const st = this.stats;
      const out = [];
      const atk = this.attack;
      if (!atk) return out;
      const range = (atk.type === "heavy" ? 118 : 82) * st.rangeMul;
      const dmgMulBase = atk.type === "heavy" ? 2.6 : (atk.combo === 2 ? 1.3 : atk.combo === 1 ? 1.1 : 1.0);
      // derive active damage window from animation timing so damage lands on the visual swing
      let start = 0.06, end = 0.2;
      if (window.SL.Anim && this.animator) {
        const kind = (atk.type === "heavy" || atk.type === "airHeavy") ? "heavy" : "combo";
        const timing = window.SL.Anim.timingsFor(this.animator, atk, kind);
        start = Math.max(0.02, timing.startup * 0.75);
        end = Math.min(atk.dur, timing.startup + timing.active * 0.9);
      } else {
        if (atk.type === "heavy") { start = 0.24; end = 0.46; }
        else if (atk.type === "air") { start = 0.06; end = 0.22; }
        else if (atk.type === "airHeavy") { start = 0.1; end = 0.3; }
      }
      if (atk.type === "light" || atk.type === "heavy") {
        if (atk.t >= start && atk.t <= end) {
          if (st.whirlwind && atk.type === "heavy") {
            out.push({ x: this.x, y: this.y - 34, radius: range * 0.9, arc: U.TAU, dmgMul: dmgMulBase, knock: 260, type: atk.type, angle: 0, pierce: 999 });
          } else {
            let a0 = -Math.PI * 0.15, a1 = -Math.PI * 0.62;
            const arcW = Math.PI * 0.85;
            out.push({ x: this.x, y: this.y - 34, radius: range, arc: arcW, angle: a0, dmgMul: dmgMulBase, knock: atk.type === "heavy" ? 280 : 70, type: atk.type, pierce: st.pierce || 1 });
          }
        }
      } else if (atk.type === "air" || atk.type === "airHeavy") {
        if (atk.t >= start && atk.t <= end) {
          out.push({
            x: this.x, y: this.y - 20, radius: range * 0.8, arc: Math.PI * 0.8,
            angle: Math.PI / 2, dmgMul: atk.type === "airHeavy" ? 2.2 : 1.2,
            knock: 140, type: "air", pierce: st.pierce || 1,
          });
        }
      }
      return out;
    }

    landSlam() {
      const st = this.stats;
      if (!st.groundSlam) return;
      const g = this.game;
      g.screenShake(6, 0.2);
      g.audio.play("explosion");
      g.particles.shock(this.x, this.y, "#ffd27a", 20);
      g.particles.burst(this.x, this.y, "#ffd27a", 14, 260, 4, 0.5, 500);
      g.damageArea(this.x, this.y - 10, 100 + st.slamSize, 2.0, 320, { fire: false });
    }

    useSpecial() {
      const g = this.game;
      const sp = this.warrior.special;
      const st = this.stats;
      const cd = sp.cooldown * st.cdMul;
      this.specialCd = cd;
      const abilityMul = st.abilityDmgMul || 1;
      const dmg = (this.warrior.base.dmg * 14 * st.dmgMul) * abilityMul;
      g.audio.play("shoot");
      switch (sp.type) {
        case "spinslash": {
          this.spinAnim = 0.4;
          this.castTimer = 0.4;
          g.damageArea(this.x, this.y - 34, 105 * st.rangeMul, 2.0, 220, {});
          g.particles.ring(this.x, this.y - 34, this.warrior.color, 24, 0.4);
          g.particles.burst(this.x, this.y - 34, this.warrior.color, 12, 220, 3, 0.4, 0);
          break;
        }
        case "shadestep": {
          this.castTimer = 0.3;
          this.dashTimer = 0.28;
          this.dashDir = this.facing;
          this.iFrames = Math.max(this.iFrames, 0.35);
          this.vy = 0;
          this.dashHit = new Set();
          g.spawnAfterimages(6);
          break;
        }
        case "slam": {
          this.castTimer = 0.4;
          this.spinAnim = 0.35;
          g.screenShake(8, 0.25);
          g.damageArea(this.x, this.y - 20, 130 * st.rangeMul, 2.6, 380, { fire: false });
          g.particles.shock(this.x, this.y, "#ff6b4a", 30);
          g.particles.burst(this.x, this.y - 10, "#ff6b4a", 16, 320, 4, 0.5, 400);
          break;
        }
        case "bash": {
          this.castTimer = 0.35;
          g.damageCone(this.x, this.y - 30, this.facing, 110 * st.rangeMul, 1.6, 340, { stun: 0.9 });
          g.particles.slash(this.x + this.facing * 30, this.y - 30, this.facing > 0 ? 0 : Math.PI, "#3fe0b0", 1.6);
          break;
        }
        case "volley": {
          this.castTimer = 0.35;
          const n = 5;
          for (let i = 0; i < n; i++) {
            const ang = -0.3 + (i / (n - 1)) * 0.6;
            g.firePlayerProjectile(this.x + this.facing * 20, this.y - 36,
              this.facing * Math.cos(ang), Math.sin(ang), 620, dmg, "arrow", {});
          }
          break;
        }
        case "nova": {
          this.castTimer = 0.4;
          g.damageArea(this.x, this.y - 30, 130 * st.rangeMul, 2.2, 420, {});
          g.particles.shock(this.x, this.y - 30, "#a06bff", 34);
          g.particles.burst(this.x, this.y - 30, "#a06bff", 20, 300, 4, 0.5, 0);
          break;
        }
      }
    }

    useUltimate() {
      const g = this.game;
      const ult = this.warrior.ultimate;
      const st = this.stats;
      const cd = ult.cooldown * st.ultCdMul;
      this.ultCd = cd;
      const abilityMul = st.abilityDmgMul || 1;
      const dmg = (this.warrior.base.dmg * 30 * st.dmgMul) * abilityMul;
      g.audio.play("ult");
      g.screenShake(8, 0.3);
      g.flash(0.3);
      switch (ult.type) {
        case "bladeStorm": {
          this.castTimer = 0.6;
          g.rainBlades(this.facing, dmg);
          break;
        }
        case "deathmark": {
          this.castTimer = 0.5;
          g.deathMark(dmg);
          break;
        }
        case "warcry": {
          this.buffs.warcry = 6;
          g.damageArea(this.x, this.y - 30, 140, 2.0, 300, {});
          g.particles.shock(this.x, this.y - 30, "#ff6b4a", 34);
          g.audio.play("bossDefeat");
          break;
        }
        case "bulwark": {
          this.buffs.bulwark = 4.5;
          this.iFrames = Math.max(this.iFrames, 4.5);
          g.particles.ring(this.x, this.y - 34, "#3fe0b0", 30, 0.6);
          g.particles.shock(this.x, this.y - 34, "#3fe0b0", 36);
          break;
        }
        case "rainArrows": {
          this.castTimer = 0.5;
          g.rainArrows(dmg);
          break;
        }
        case "voidStorm": {
          this.buffs.voidStorm = 4.5;
          g.voidStorm(dmg);
          break;
        }
      }
    }

    takeDamage(amount, opts) {
      const g = this.game;
      opts = opts || {};
      if (this.iFrames > 0 || this.dead) return 0;
      if (this.buffs.bulwark > 0) { // reflect
        if (opts.source && opts.source.hp !== undefined) {
          g.dealDamage(opts.source, Math.round(amount * 1.5), { silent: true, fromThorns: true });
        }
        return 0;
      }
      const st = this.stats;
      let dmg = Math.max(1, Math.round(amount * (1 - Math.min(0.7, st.armor * 0.015))));
      if (this.shieldHp > 0) {
        const absorbed = Math.min(this.shieldHp, dmg);
        this.shieldHp -= absorbed;
        dmg -= absorbed;
        g.particles.ring(this.x, this.y - 34, "#8fd8ff", 12, 0.3);
        if (st.synRetribution && dmg <= 0) {
          g.damageArea(this.x, this.y - 34, 70, 1.5, 200, {});
          g.particles.shock(this.x, this.y - 34, "#8fd8ff", 24);
        }
        if (dmg <= 0) return 0;
      }
      this.hp -= dmg;
      this.hurtFlash = 0.25;
      this.hurtT = 0.28;
      this.hurtDur = 0.28;
      this.hurtDir = opts.source ? (opts.source.x > this.x ? -1 : 1) : (opts.knockDir || -1);
      if (this.animator) this.animator.impact("hit", {});
      g.screenShake(2.5, 0.14);
      g.audio.play("hurt");
      g.particles.burst(this.x, this.y - 30, "#ff5252", 8, 150, 3, 0.4, 200);
      if (this.hp <= 0) {
        this.hp = 0;
        if (st.revive > 0 && !this.reviveUsed) {
          this.reviveUsed = true;
          this.hp = this.maxHp * 0.5;
          this.iFrames = 2;
          g.audio.play("heal");
          g.particles.shock(this.x, this.y - 34, "#4dff9e", 40);
          g.toast("Last Stand: Revived!", "boss");
          return dmg;
        }
        this.die();
      }
      return dmg;
    }

    die() {
      if (this.dead) return;
      this.dead = true;
      this.game.onPlayerDeath();
    }

    heal(n) {
      if (this.dead) return;
      this.hp = Math.min(this.maxHp, this.hp + n);
      SL.Audio.play("heal");
    }

    pose() {
      if (this.dead) return "dead";
      if (this.victoryT > 0) return "victory";
      if (this.hurtT > 0) return "hurt";
      if (this.dashTimer > 0) return "dash";
      if (this.attack) {
        if (this.attack.type === "heavy") return "heavy";
        if (this.attack.type === "air" || this.attack.type === "airHeavy") return "jump";
        return "attack";
      }
      if (this.castTimer > 0) return "cast";
      if (!this.onGround) return "jump";
      const moving = Math.abs(this.vx) > 30;
      return moving ? "run" : "idle";
    }

    draw(ctx, time) {
      const g = this.game;
      if (this.hurtFlash > 0 && Math.floor(time * 20) % 2 === 0) {
        ctx.globalAlpha = 0.5;
      }
      // aura
      if (this.buffs.warcry > 0 || (this.stats.berserk && this.hp < this.maxHp * 0.4)) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "#ff6b4a";
        ctx.beginPath(); ctx.arc(this.x, this.y - 32, 34 + Math.sin(time * 8) * 5, 0, U.TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (this.buffs.bulwark > 0) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#3fe0b0";
        ctx.beginPath(); ctx.arc(this.x, this.y - 32, 40, 0, U.TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (this.buffs.voidStorm > 0) {
        const n = 8;
        for (let i = 0; i < n; i++) {
          const a = time * 3 + (i / n) * U.TAU;
          const r = 46 + Math.sin(time * 6 + i) * 6;
          ctx.fillStyle = "#a06bff";
          ctx.beginPath(); ctx.arc(this.x + Math.cos(a) * r, this.y - 32 + Math.sin(a) * r * 0.4, 4, 0, U.TAU); ctx.fill();
        }
      }

      const weapon = this._weaponConfig();
      const outfit = { helmet: this.warrior.id === "guardian" ? true : false, cloak: this.warrior.id === "berserker" ? "#7a2c14" : (this.warrior.id === "assassin" ? "#3b1660" : null) };
      if (this.animator) {
        this.animator.draw(ctx, {
          x: this.x, y: this.y, scale: 1, facing: this.facing, t: time,
          color: this.warrior.color, weapon, shield: this.warrior.id === "guardian",
          helmet: outfit.helmet, cloak: outfit.cloak,
          glow: this.hurtFlash > 0 ? "#ff5252" : null,
          alpha: this.hurtFlash > 0 && Math.floor(time * 20) % 2 === 0 ? 0.5 : 1,
        });
      } else {
        const pose = this.pose();
        const pt = this.attack ? Math.min(1, this.attack.t / this.attack.dur) : 0;
        const runSpeed = this.dashTimer > 0 ? 1.4 : Math.min(1, Math.abs(this.vx) / (this.baseSpeed * this.stats.speedMul));
        drawStickman(ctx, {
          x: this.x, y: this.y, scale: 1, facing: this.facing, t: time,
          speed: runSpeed, pose, poseT: pt, color: this.warrior.color,
          weapon, shield: this.warrior.id === "guardian",
          outfit, glow: this.hurtFlash > 0 ? "#ff5252" : null,
          alpha: this.hurtFlash > 0 && Math.floor(time * 20) % 2 === 0 ? 0.5 : 1,
        });
      }
      ctx.globalAlpha = 1;

      // hp bar above player (small)
      if (this.hp < this.maxHp) {
        const w = 34;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(this.x - w / 2, this.y - 74, w, 4);
        ctx.fillStyle = "#ff5252";
        ctx.fillRect(this.x - w / 2, this.y - 74, w * Math.max(0, this.hp / this.maxHp), 4);
      }
    }

    _weaponConfig() {
      const w = this.warrior.id;
      switch (w) {
        case "assassin": return { kind: "dagger", color: "#c86bff", len: 20 };
        case "berserker": return { kind: "axe", color: "#ff8a4a", len: 30 };
        case "guardian": return { kind: "sword", color: "#3fe0b0", len: 28 };
        case "ranger": return { kind: "bow", color: "#7dff6a", len: 26 };
        case "shadowmage": return { kind: "staff", color: "#a06bff", len: 30 };
        default: return { kind: "sword", color: "#5fc8ff", len: 32 };
      }
    }
  }

  /* =================================================================
   * ENEMIES
   * ================================================================= */
  const ENEMY_TYPES = {
    grunt: {
      name: "Grunt", hp: 30, speed: 62, dmg: 9, xp: 6, scale: 1, color: "#9aa6bd",
      weapon: { kind: "sword", color: "#c0cada", len: 24 }, range: 52, cooldown: 1.4,
      telegraph: 0.5, attackDur: 0.3, coins: 0.35, detect: 430,
    },
    archer: {
      name: "Archer", hp: 24, speed: 48, dmg: 8, xp: 8, scale: 1, color: "#c98a5e",
      weapon: { kind: "bow", color: "#e0a86e", len: 22 }, range: 300, cooldown: 2.2,
      telegraph: 0.65, attackDur: 0.2, coins: 0.3, ranged: true, detect: 520,
    },
    shield: {
      name: "Shield Warrior", hp: 60, speed: 44, dmg: 11, xp: 10, scale: 1.05, color: "#5f7fd6",
      weapon: { kind: "sword", color: "#9cc4ff", len: 22 }, range: 56, cooldown: 1.8,
      telegraph: 0.55, attackDur: 0.3, coins: 0.4, blocks: true, detect: 430,
    },
    assassin: {
      name: "Assassin", hp: 26, speed: 130, dmg: 12, xp: 11, scale: 0.95, color: "#b04a6e",
      weapon: { kind: "dagger", color: "#e0809e", len: 16 }, range: 300, cooldown: 2.6,
      telegraph: 0.45, attackDur: 0.25, coins: 0.35, lunges: true, hood: true, detect: 360,
    },
    tank: {
      name: "Tank", hp: 130, speed: 32, dmg: 16, xp: 16, scale: 1.3, color: "#6b4a52",
      weapon: { kind: "hammer", color: "#8a6a74", len: 26 }, range: 66, cooldown: 2.4,
      telegraph: 0.8, attackDur: 0.4, coins: 0.5, detect: 460,
    },
    mage: {
      name: "Mage", hp: 36, speed: 40, dmg: 13, xp: 13, scale: 1, color: "#8a5fc9",
      weapon: { kind: "staff", color: "#b08ae0", len: 26 }, range: 340, cooldown: 2.8,
      telegraph: 0.9, attackDur: 0.2, coins: 0.35, ranged: true, hood: true, magic: true, detect: 520,
    },
  };

  class Enemy {
    constructor(game, type, x, elite) {
      const def = ENEMY_TYPES[type];
      this.game = game;
      this.type = type;
      this.def = def;
      this.elite = !!elite;
      const scale = def.scale * (this.elite ? 1.35 : 1);
      this.scale = scale;
      this.w = 22 * scale; this.h = 60 * scale;
      const hpMul = 1 + Math.min(4, game.distance / 400) * 0.12 + (this.elite ? 3.2 : 0);
      const dmgMul = 1 + Math.min(3, game.distance / 500) * 0.08;
      this.maxHp = Math.round(def.hp * hpMul);
      this.hp = this.maxHp;
      this.damage = Math.round(def.dmg * dmgMul);
      this.speed = def.speed * (1 + Math.min(1.5, game.distance / 900));
      this.x = x;
      this.y = game.groundY;
      this.vx = 0; this.vy = 0;
      this.state = "idle";
      this.stateT = 0;
      this.attackCd = 0;
      this.onGround = true;
      this.platform = null;
      this.hurtFlash = 0;
      this.staggerT = 0;
      this.slowT = 0; this.slowFactor = 1;
      this.dots = [];
      this.kbVx = 0; this.kbVy = 0;
      this.dead = false;
      this.facing = -1;
      this.xpValue = def.xp * (this.elite ? 5 : 1);
      this.id = U.uid();
      this.aggro = false;
      this.homeX = x;
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      this.retreatT = 0;
      this.retreatDist = 0;
      this.patrolT = Math.random() * 2;
      this.patrolX = x;
      this._throttleT = 0;
    }

    update(dt, game) {
      this.stateT += dt;
      if (this.hurtFlash > 0) this.hurtFlash -= dt;
      if (this.staggerT > 0) this.staggerT -= dt;
      if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowFactor = 1; }
      if (this.attackCd > 0) this.attackCd -= dt;

      // knockback
      if (this.kbVx !== 0 || this.kbVy !== 0) {
        this.x += this.kbVx * dt;
        this.y += this.kbVy * dt;
        this.kbVx *= 0.9;
        this.kbVy *= 0.9;
        if (Math.abs(this.kbVx) < 2 && Math.abs(this.kbVy) < 2) { this.kbVx = 0; this.kbVy = 0; }
      }

      const player = game.player;
      if (!player || player.dead) { this.vx = 0; this._ground(dt, game); this.updateDots(dt, game); return; }

      this.facing = player.x > this.x ? 1 : -1;

      const dx = player.x - this.x;
      const dist = Math.abs(dx);
      const speedEff = this.speed * this.slowFactor * (this.staggerT > 0 ? 0.1 : 1);
      const hint = game.director ? game.director.hintFor(this) : null;
      const aggression = hint ? hint.aggression : 0.5;

      // performance: off-screen enemies only reason at ~10Hz, keeps 60 FPS under hordes
      if (dist > 1000) {
        this._throttleT -= dt;
        if (this._throttleT > 0) {
          this.vx = 0;
          this._ground(dt, game);
          this.updateDots(dt, game);
          return;
        }
        this._throttleT = 0.1;
      }

      // ----- detection / idle / patrol -----
      if (!this.aggro) {
        const detect = this.def.detect || 460;
        if (dist < detect) {
          this.aggro = true;
          this.state = "detect";
          this.stateT = 0;
          game.audio.play("enemyWarn");
        } else {
          this._patrol(dt, speedEff);
        }
        this._ground(dt, game);
        this.updateDots(dt, game);
        return;
      }

      switch (this.state) {
        case "detect": {
          this.vx = 0;
          if (this.stateT >= 0.35) { this.state = "approach"; this.stateT = 0; }
          break;
        }
        case "approach": {
          this._doApproach(dt, game, dx, dist, speedEff, hint, aggression);
          break;
        }
        case "telegraph": {
          this.vx = 0;
          if (this.stateT >= this.def.telegraph) {
            this.state = "attack";
            this.stateT = 0;
            game.audio.play("slash");
            if (this.def.lunges) {
              this.lungeVx = Math.sign(dx) * this.speed * 5.5;
              this.lungeT = 0;
            }
            if (this.def.ranged) {
              this.fireProjectile(game);
            }
            if (this.def.magic) {
              this.fireProjectile(game, true);
            }
          }
          break;
        }
        case "attack": {
          this.vx = 0;
          if (this.def.lunges && this.stateT < 0.35) {
            this.x += this.lungeVx * dt;
          }
          if (this.stateT >= this.def.attackDur + 0.25) {
            this.state = "recover";
            this.stateT = 0;
            this.attackCd = this.def.cooldown * U.rand(0.85, 1.2) * (game.director ? game.director.attackCdMul() : 1);
            if (game.director) game.director.releaseAttack(this);
          }
          break;
        }
        case "recover": {
          this.vx = 0;
          const recoverT = (this.def.cooldown * 0.4) / Math.max(0.6, aggression);
          if (this.stateT >= recoverT) {
            if (this._shouldRetreat(game, dist, hint)) {
              this.state = "retreat";
              this.stateT = 0;
              this.retreatT = 0.5 + Math.random() * 0.5;
              this.retreatDist = dist + 140;
            } else {
              this.state = "approach";
              this.stateT = 0;
            }
          }
          break;
        }
        case "retreat": {
          const away = Math.sign(dx);
          this.vx = -away * speedEff * 0.7;
          this.x += this.vx * dt;
          if (this.stateT >= this.retreatT || dist > this.retreatDist) {
            this.state = "approach";
            this.stateT = 0;
          }
          break;
        }
        case "chase": {
          const spd = speedEff * (aggression > 0.7 ? 1.15 : 1);
          this.vx = Math.sign(dx) * spd;
          this.x += this.vx * dt;
          if (this.stateT > 0.8) { this.state = "approach"; this.stateT = 0; }
          if (dist <= this.def.range + 30 && this.attackCd <= 0 && this._wantAttack(game)) {
            this.toTelegraph();
          }
          break;
        }
      }

      this._ground(dt, game);
      this.updateDots(dt, game);
    }

    /* ---------- state machine helpers ---------- */

    _patrol(dt, speedEff) {
      // wander around the spawn point until the player is detected
      this.patrolT -= dt;
      if (this.patrolT <= 0 || Math.abs(this.patrolX - this.x) < 6) {
        this.patrolT = 1 + Math.random() * 2;
        this.patrolX = this.homeX + (Math.random() - 0.5) * 260;
      }
      const d = this.patrolX - this.x;
      this.vx = Math.sign(d) * speedEff * 0.4;
      this.x += this.vx * dt;
    }

    _wantAttack(game) {
      if (!game.director) return true;
      return game.director.requestAttack(this);
    }

    _shouldRetreat(game, dist, hint) {
      // player dodging through us -> give ground
      if (game.director && game.director.react.dash > 0 && dist < 160) return true;
      // hurt, non-elite enemies fall back (mixed difficulty)
      const lowHp = this.hp < this.maxHp * 0.3;
      if (lowHp && !this.elite && Math.random() < 0.4) return true;
      // assassins never retreat; tanks never retreat
      if (this.def.lunges) return false;
      if (this.type === "tank") return false;
      // player pushing hard -> back off briefly
      if (game.director && game.director.react.press > 0 && dist < 120) return true;
      return false;
    }

    _doApproach(dt, game, dx, dist, speedEff, hint, aggression) {
      if (this.def.lunges) {
        // assassin: circle the flank target, then lunge
        const tx = hint && hint.targetX ? hint.targetX : game.player.x;
        if (dist > 420) {
          this.vx = Math.sign(game.player.x - this.x) * speedEff;
          this.x += this.vx * dt;
        } else if (dist < 260 && this.attackCd <= 0 && this._wantAttack(game)) {
          this.toTelegraph();
        } else {
          const d = tx - this.x;
          this.vx = Math.sign(d) * speedEff * 0.5;
          this.x += this.vx * dt;
        }
      } else if (this.def.ranged) {
        // ranged: hold preferred range, back off if the player closes
        const keep = (hint && hint.keepRange) ? hint.keepRange : [this.def.range - 60, this.def.range + 60];
        if (dist < keep[0]) {
          this.vx = -Math.sign(dx) * speedEff * 0.65;
        } else if (dist > keep[1]) {
          this.vx = Math.sign(dx) * speedEff;
        } else {
          this.strafeDir *= (Math.random() < 0.02 ? -1 : 1);
          this.vx = this.strafeDir * speedEff * 0.35;
        }
        this.x += this.vx * dt;
        if (dist <= this.def.range + 40 && this.attackCd <= 0 && this._wantAttack(game)) {
          this.toTelegraph();
        }
      } else {
        // melee: close in (respecting role hint offsets), attack when in range
        if (dist <= this.def.range && this.attackCd <= 0 && this._wantAttack(game)) {
          this.toTelegraph();
        } else {
          const tx = (hint && hint.targetX) ? hint.targetX : game.player.x;
          const d = tx - this.x;
          this.vx = Math.sign(d) * speedEff;
          this.x += this.vx * dt;
        }
      }
    }

    _ground(dt, game) {
      const prevY = this.y;
      this.vy += game.gravity * dt;
      this.y += this.vy * dt;
      const ground = game.resolveGround(this, prevY);
      if (ground) {
        this.y = ground.y;
        this.vy = 0;
        this.onGround = true;
        this.platform = ground.platform || null;
      } else {
        this.onGround = false;
        this.platform = null;
      }
    }

    toTelegraph() {
      this.state = "telegraph";
      this.stateT = 0;
      this.game.audio.play("enemyWarn");
      this.game.particles.ring(this.x, this.y - 60 * this.scale, "#ff5252", 10, 0.4);
    }

    fireProjectile(game, magic) {
      const player = game.player;
      const ang = U.angleTo(this.x, this.y - 36, player.x, player.y - 36);
      const speed = magic ? 240 : 340;
      game.enemyProjectiles.push({
        x: this.x, y: this.y - 36,
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        dmg: this.damage, color: magic ? "#b08ae0" : "#ff6b6b",
        type: magic ? "bolt" : "arrow", life: 6,
      });
    }

    updateDots(dt, game) {
      for (let i = this.dots.length - 1; i >= 0; i--) {
        const d = this.dots[i];
        d.t -= dt;
        d.tick -= dt;
        if (d.tick <= 0) {
          d.tick = 0.5;
          game.dealDamage(this, d.dps * 0.5, { silent: true, dot: true, element: d.element });
        }
        if (d.t <= 0) this.dots.splice(i, 1);
      }
    }

    addDot(element, dps, duration) {
      const existing = this.dots.find((d) => d.element === element);
      if (existing) {
        existing.dps = Math.max(existing.dps, dps);
        existing.t = Math.min(existing.t + 1, duration + 2);
      } else {
        this.dots.push({ element, dps, duration, t: duration, tick: 0 });
      }
    }

    knockback(vx, vy) {
      this.kbVx += vx;
      this.kbVy += vy;
      this.staggerT = Math.max(this.staggerT, 0.18);
    }

    applyDamage(amount, opts) {
      opts = opts || {};
      const g = this.game;
      // shield block from front
      if (this.def.blocks && !opts.bypassBlock) {
        const fromFront = opts.frontAngle !== undefined && Math.cos(opts.frontAngle - (this.facing > 0 ? 0 : Math.PI)) > 0.2;
        if (fromFront) {
          g.particles.slash(this.x - this.facing * 20, this.y - 36, opts.frontAngle || 0, "#9cc4ff", 1);
          g.audio.play("hit");
          g.particles.burst(this.x - this.facing * 18, this.y - 36, "#9cc4ff", 4, 120, 2, 0.3, 0);
          return Math.round(amount * 0.2);
        }
      }
      let dmg = amount;
      this.hp -= dmg;
      this.hurtFlash = 0.15;
      if (opts.knock) this.knockback(opts.knock.x, opts.knock.y);
      if (opts.stun) this.staggerT = Math.max(this.staggerT, opts.stun);
      if (opts.slow) { this.slowT = opts.slow; this.slowFactor = 0.45; }
      if (opts.burn) this.addDot("fire", opts.burn.dps, opts.burn.dur);
      if (opts.poison) this.addDot("poison", opts.poison.dps, opts.poison.dur);
      if (dmg <= 0 && this.hp >= 0 && opts.silent) { /* nothing */ }
      if (this.hp <= 0) {
        this.dead = true;
        this.die(g);
      }
      return dmg;
    }

    die(game) {
      game.onEnemyKilled(this);
    }

    pose() {
      if (this.staggerT > 0 || this.kbVx !== 0) return "hurt";
      if (this.state === "attack") return "attack";
      if (this.state === "telegraph" || this.state === "detect") return "cast";
      if (Math.abs(this.vx) > 20) return "run";
      return "idle";
    }

    draw(ctx, time) {
      const def = this.def;
      const alpha = this.hurtFlash > 0 && Math.floor(time * 24) % 2 === 0 ? 0.4 : 1;
      // telegraph indicator
      if (this.state === "telegraph") {
        const pul = 0.6 + Math.sin(time * 18) * 0.3;
        ctx.globalAlpha = pul;
        ctx.fillStyle = "#ff3b3b";
        ctx.beginPath();
        const ex = this.x, ey = this.y - 70 * this.scale;
        ctx.moveTo(ex, ey - 9);
        ctx.lineTo(ex - 6, ey + 4);
        ctx.lineTo(ex + 6, ey + 4);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = alpha;
        // ranged aim line
        if (this.def.ranged) {
          ctx.globalAlpha = 0.3 + pul * 0.4;
          ctx.strokeStyle = "#ff5252";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(this.x, this.y - 36);
          ctx.lineTo(this.game.player.x, this.game.player.y - 36);
          ctx.stroke();
          ctx.globalAlpha = alpha;
        }
      }
      // elite aura
      if (this.elite) {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = "#ffc34d";
        ctx.beginPath(); ctx.arc(this.x, this.y - 32 * this.scale, 36 * this.scale + Math.sin(time * 6) * 4, 0, U.TAU); ctx.fill();
        ctx.globalAlpha = alpha;
      }

      // dots visuals
      if (this.dots.length) {
        for (const d of this.dots) {
          ctx.globalAlpha = 0.4 + Math.sin(time * 14) * 0.2;
          if (d.element === "fire") { ctx.fillStyle = "#ff7b2e"; ctx.beginPath(); ctx.arc(this.x, this.y - 40, 8 + d.dps * 0.5, 0, U.TAU); ctx.fill(); }
          if (d.element === "poison") { ctx.fillStyle = "#7dff6a"; ctx.beginPath(); ctx.arc(this.x, this.y - 30, 6, 0, U.TAU); ctx.fill(); }
          if (d.element === "ice") { ctx.fillStyle = "#8fd8ff"; }
        }
        ctx.globalAlpha = 1;
      }

      const outfit = {
        hood: def.hood, horns: this.elite && this.type !== "assassin", crown: this.elite,
        cloak: this.type === "assassin" ? "#4a1c30" : (this.type === "mage" ? "#3b1c55" : null),
      };
      drawStickman(ctx, {
        x: this.x, y: this.y, scale: this.scale, facing: this.facing, t: time,
        speed: this.state === "attack" || this.state === "telegraph" || this.state === "detect" || this.state === "recover" ? 0 : 0.6,
        pose: this.pose(), poseT: this.state === "attack" ? Math.min(1, this.stateT / this.def.attackDur) : 0,
        color: def.color, weapon: def.weapon,
        shield: this.type === "shield", outfit, alpha,
      });
      ctx.globalAlpha = 1;

      // hp bar
      const bw = 30 * this.scale;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(this.x - bw / 2, this.y - 78 * this.scale, bw, 4);
      ctx.fillStyle = this.elite ? "#ffc34d" : "#ff5252";
      ctx.fillRect(this.x - bw / 2, this.y - 78 * this.scale, bw * Math.max(0, this.hp / this.maxHp), 4);
    }
  }

  /* =================================================================
   * Bosses (defined in bosses.js, imported via SL.Bosses)
   * ================================================================= */

  SL.Entities = {
    drawStickman, drawWeapon, Player, Enemy, ENEMY_TYPES,
  };

})(window.SL = window.SL || {});

/* ============================================================
 * Stickman: Warrior's Legacy
 * input.js — unified action-based input (keyboard/mouse/touch)
 *
 * Actions: moveX, moveY (axes), jump, attack, heavy, dash,
 *          special, ultimate, pause (buttons)
 *
 * Button actions expose .held and .pressed (edge-triggered,
 * consumed once per frame by the game).
 * ============================================================ */
(function (SL) {
  "use strict";

  class Input {
    constructor() {
      this.actions = {
        moveX: 0, moveY: 0,
        jump: { held: false, pressed: false },
        attack: { held: false, pressed: false },
        heavy: { held: false, pressed: false },
        dash: { held: false, pressed: false },
        special: { held: false, pressed: false },
        ultimate: { held: false, pressed: false },
        pause: { held: false, pressed: false },
      };
      this.joystick = { active: false, id: null, originX: 0, originY: 0, x: 0, y: 0, magnitude: 0 };
      this.touchMode = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
      this._virtual = {}; // action -> {held, pressed}
      this._bindKeyboard();
      this._bindPointer();
    }

    /* ---------- virtual button press (DOM touch buttons) ---------- */
    press(action) {
      const v = this._virtual[action] || (this._virtual[action] = { held: false, pressed: false });
      v.held = true;
      v.pressed = true;
      this.actions[action].held = true;
      this.actions[action].pressed = true;
    }
    release(action) {
      const v = this._virtual[action];
      if (v) v.held = false;
      this.actions[action].held = false;
    }
    setVirtualAxis(axis, value) {
      this._virtual[axis] = value;
    }

    /* ---------- edge-triggered consumption ---------- */
    consumeFrame() {
      for (const k in this.actions) {
        const a = this.actions[k];
        if (a && typeof a === "object") a.pressed = false;
      }
      // re-assert held states from virtual buttons (buttons that remain held)
      for (const k in this._virtual) {
        const v = this._virtual[k];
        if (typeof v === "object" && v.held) {
          this.actions[k].held = true;
        }
      }
    }

    isDown(action) {
      const a = this.actions[action];
      return typeof a === "object" ? a.held : !!a;
    }
    wasPressed(action) {
      const a = this.actions[action];
      return typeof a === "object" ? a.pressed : false;
    }

    getAxisX() {
      let v = this._virtual.moveX || 0;
      if (this.joystick.active) v = this.joystick.x;
      return SL.U.clamp(v, -1, 1);
    }
    getAxisY() {
      let v = this._virtual.moveY || 0;
      if (this.joystick.active) v = this.joystick.y;
      return SL.U.clamp(v, -1, 1);
    }

    /* ---------- keyboard ---------- */
    _bindKeyboard() {
      const keymap = {
        ArrowLeft: "left", KeyA: "left",
        ArrowRight: "right", KeyD: "right",
        ArrowUp: "up", KeyW: "up",
        ArrowDown: "down", KeyS: "down",
        Space: "jump", KeyJ: "attack",
        MouseLeft: "attack",
        KeyK: "heavy",
        ShiftLeft: "dash", ShiftRight: "dash",
        KeyE: "special",
        KeyQ: "ultimate",
        KeyP: "pause", Escape: "pause",
      };
      window.addEventListener("keydown", (e) => {
        if (e.repeat) return;
        const a = keymap[e.code];
        if (!a) return;
        if (e.code === "Space") e.preventDefault();
        if (a === "left" || a === "right" || a === "up" || a === "down") {
          this._keyAxis(e.code, true);
        } else {
          this._setAction(a, true);
        }
      });
      window.addEventListener("keyup", (e) => {
        const a = keymap[e.code];
        if (!a) return;
        if (a === "left" || a === "right" || a === "up" || a === "down") {
          this._keyAxis(e.code, false);
          if (a === "up") this._setAction("jump", false);
        } else {
          this._setAction(a, false);
        }
      });
      window.addEventListener("blur", () => { this._resetAll(); });
    }

    _keyAxis(code, down) {
      let x = this._virtual.leftKey || 0;
      let y = this._virtual.upKey || 0;
      if (code === "ArrowLeft" || code === "KeyA") x = down ? -1 : 0;
      if (code === "ArrowRight" || code === "KeyD") x = down ? 1 : 0;
      if (code === "ArrowUp" || code === "KeyW") y = down ? -1 : 0;
      if (code === "ArrowDown" || code === "KeyS") y = down ? 1 : 0;
      this._virtual.leftKey = x;
      this._virtual.upKey = y;
      // up/down also map to jump-like behavior via keyboard joystick
      this._virtual.moveX = x;
      this._virtual.moveY = y;
      if (y === -1 && down) {
        this._setAction("jump", true);
      } else if (y !== -1) {
        // allow releasing jump by pressing down or letting go
      }
    }

    _setAction(action, down) {
      const a = this.actions[action];
      if (!a) return;
      if (down) {
        a.held = true;
        a.pressed = true;
      } else {
        a.held = false;
      }
    }

    /* ---------- pointer / mouse / touch ---------- */
    _bindPointer() {
      const canvas = document.getElementById("game-canvas");
      if (!canvas) return;

      // mouse: left click = attack
      canvas.addEventListener("mousedown", (e) => {
        if (e.button === 0) this._setAction("attack", true);
        if (e.button === 2) this._setAction("heavy", true);
        SL.Audio.resume();
      });
      window.addEventListener("mouseup", (e) => {
        if (e.button === 0) this._setAction("attack", false);
        if (e.button === 2) this._setAction("heavy", false);
      });
      window.addEventListener("contextmenu", (e) => e.preventDefault());

      // touch joystick on left half
      const zone = document.getElementById("joystick-zone");
      const base = document.getElementById("joystick-base");
      const knob = document.getElementById("joystick-knob");
      if (zone && base && knob) {
        const touchHandler = (start) => {
          zone.addEventListener("touchstart", (e) => {
            SL.Audio.resume();
            const t = e.changedTouches[0];
            this.joystick.active = true;
            this.joystick.id = t.identifier;
            this.joystick.originX = t.clientX;
            this.joystick.originY = t.clientY;
            base.style.left = "0px"; base.style.bottom = "0px";
            base.style.transform = "translate(0,0)";
            knob.style.transform = "translate(0,0)";
            e.preventDefault();
          }, { passive: false });
          zone.addEventListener("touchmove", (e) => {
            if (!this.joystick.active) return;
            for (const t of e.changedTouches) {
              if (t.identifier !== this.joystick.id) continue;
              let dx = t.clientX - this.joystick.originX;
              let dy = t.clientY - this.joystick.originY;
              const maxR = 46;
              const m = Math.sqrt(dx * dx + dy * dy);
              if (m > maxR) { dx = dx / m * maxR; dy = dy / m * maxR; }
              this.joystick.x = dx / maxR;
              this.joystick.y = dy / maxR;
              knob.style.transform = "translate(" + dx + "px," + dy + "px)";
            }
            e.preventDefault();
          }, { passive: false });
          const endTouch = (e) => {
            if (!this.joystick.active) return;
            for (const t of e.changedTouches) {
              if (t.identifier === this.joystick.id) {
                this.joystick.active = false;
                this.joystick.x = 0; this.joystick.y = 0;
                knob.style.transform = "translate(0,0)";
                // joystick-up counts as jump release
              }
            }
            e.preventDefault();
          };
          zone.addEventListener("touchend", endTouch, { passive: false });
          zone.addEventListener("touchcancel", endTouch, { passive: false });
        };
        touchHandler();
      }
    }

    wireButton(el, action) {
      if (!el) return;
      const set = (down) => {
        if (down) this.press(action);
        else this.release(action);
      };
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); SL.Audio.resume(); set(true); el.classList.add("tactive"); });
      const end = (e) => { set(false); el.classList.remove("tactive"); };
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
      el.addEventListener("pointerleave", end);
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    /* swipe gestures on the right action half: up = jump, down = dash */
    enableSwipes() {
      const zone = document.getElementById("touch-controls");
      if (!zone) return;
      let startY = null, startX = null;
      zone.addEventListener("touchstart", (e) => {
        const t = e.touches[0];
        // only on right half, outside buttons handled by buttons themselves
        if (t.clientX > window.innerWidth * 0.5) {
          startX = t.clientX; startY = t.clientY;
        }
      }, { passive: true });
      zone.addEventListener("touchend", (e) => {
        if (startY === null) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) * 1.5) {
          if (dy < 0) this._setAction("jump", true);
          else this._setAction("dash", true);
          setTimeout(() => {
            if (dy < 0) this._setAction("jump", false);
            else this._setAction("dash", false);
          }, 120);
        }
        startY = null; startX = null;
      }, { passive: true });
    }

    _resetAll() {
      for (const k in this.actions) {
        const a = this.actions[k];
        if (a && typeof a === "object") { a.held = false; a.pressed = false; }
      }
      this._virtual = {};
      this.joystick.active = false;
      this.joystick.x = 0; this.joystick.y = 0;
    }
  }

  SL.Input = Input;

})(window.SL = window.SL || {});

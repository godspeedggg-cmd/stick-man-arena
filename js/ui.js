/* ============================================================
 * Stickman: Warrior's Legacy
 * ui.js — HUD, menus, level-up cards, death screen, toasts,
 *         settings, leaderboards, challenges, equipment, upgrades
 * ============================================================ */
(function (SL) {
  "use strict";
  const U = SL.U;

  const $ = (id) => document.getElementById(id);

  const UI = {
    currentScreen: null,
    heroRaf: null,
    heroTime: 0,

    init() {
      this.bindMainMenu();
      this.bindPause();
      this.bindTouch();
      this.bindSettingsStatic();
      this.setupTouchButtons();
    },

    /* ---------------- screens ---------------- */
    showScreen(id) {
      document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
      this.currentScreen = id;
      if (id === "screen-main") {
        $("screen-main").classList.remove("hidden");
        this.refreshResourceBar();
        this.startMenuHero();
      } else {
        $("screen-main").classList.add("hidden");
        this.stopMenuHero();
        if (id) $(id).classList.remove("hidden");
      }
    },

    show(name) {
      this.showScreen("screen-" + name);
    },

    hideAllScreens() {
      document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
      this.stopMenuHero();
    },

    refreshResourceBar() {
      const d = SL.Save.get();
      $("main-coins").textContent = U.formatNum(d.coins);
      $("main-gems").textContent = U.formatNum(d.gems);
      $("main-xp").textContent = U.formatNum(d.xp);
    },

    /* ---------------- main menu ---------------- */
    bindMainMenu() {
      $("btn-play").addEventListener("click", () => {
        SL.Audio.resume();
        SL.Audio.play("click");
        this.hideAllScreens();
        SL.Game.startRun();
      });
      $("btn-warriors").addEventListener("click", () => { SL.Audio.play("click"); this.showWarriors(); });
      $("btn-equipment").addEventListener("click", () => { SL.Audio.play("click"); this.showEquipment(); });
      $("btn-upgrades").addEventListener("click", () => { SL.Audio.play("click"); this.showPermUpgrades(); });
      $("btn-leaderboard").addEventListener("click", () => { SL.Audio.play("click"); this.showLeaderboard("global"); });
      $("btn-challenges").addEventListener("click", () => { SL.Audio.play("click"); this.showChallenges(); });
      $("btn-settings").addEventListener("click", () => { SL.Audio.play("click"); this.showSettings(); });
      this.refreshWeeklyBtn();
      $("btn-weekly").addEventListener("click", () => {
        const save = SL.Save.get();
        save.weeklyOn = !save.weeklyOn;
        SL.Save.save();
        SL.Audio.play("click");
        this.refreshWeeklyBtn();
      });
    },

    refreshWeeklyBtn() {
      const on = !!SL.Save.get().weeklyOn;
      const btn = $("btn-weekly");
      if (btn) btn.textContent = "\uD83C\uDF9F WEEKLY CHALLENGE: " + (on ? "ON" : "OFF");
    },

    startMenuHero() {
      const cv = $("menu-hero-canvas");
      if (!cv) return;
      const ctx = cv.getContext("2d");
      const warrior = SL.Progression.WARRIOR_BY_ID[SL.Save.get().selectedWarrior] || SL.Progression.WARRIORS[0];
      const draw = () => {
        this.heroRaf = requestAnimationFrame(draw);
        this.heroTime += 0.016;
        ctx.clearRect(0, 0, cv.width, cv.height);
        const cx = cv.width / 2, cy = cv.height - 10;
        const weapon = { sword: { kind: "sword", color: warrior.color }, dagger: { kind: "dagger", color: warrior.color }, axe: { kind: "axe", color: warrior.color }, hammer: { kind: "sword", color: warrior.color }, bow: { kind: "bow", color: warrior.color }, staff: { kind: "staff", color: warrior.color } };
        let wcfg;
        switch (warrior.id) {
          case "assassin": wcfg = { kind: "dagger", color: "#c86bff" }; break;
          case "berserker": wcfg = { kind: "axe", color: "#ff8a4a" }; break;
          case "guardian": wcfg = { kind: "sword", color: "#3fe0b0" }; break;
          case "ranger": wcfg = { kind: "bow", color: "#7dff6a" }; break;
          case "shadowmage": wcfg = { kind: "staff", color: "#a06bff" }; break;
          default: wcfg = { kind: "sword", color: "#5fc8ff" };
        }
        // glow
        const g = ctx.createRadialGradient(cx, cy - 60, 0, cx, cy - 60, 80);
        g.addColorStop(0, warrior.color + "44");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(cx - 90, cy - 140, 180, 180);
        const scale = 1.7;
        SL.Entities.drawStickman(ctx, {
          x: cx, y: cy, scale, facing: 1, t: this.heroTime, speed: 0,
          pose: "idle", poseT: 0, color: warrior.color, weapon: wcfg,
          shield: warrior.id === "guardian",
          outfit: { helmet: warrior.id === "guardian", cloak: warrior.id === "berserker" ? "#7a2c14" : warrior.id === "assassin" ? "#3b1660" : null },
        });
      };
      draw();
    },
    stopMenuHero() {
      if (this.heroRaf) { cancelAnimationFrame(this.heroRaf); this.heroRaf = null; }
    },

    /* ---------------- warriors ---------------- */
    showWarriors() {
      this.renderSubscreen("Warriors", () => {
        const save = SL.Save.get();
        const rows = SL.Progression.WARRIORS.map((w) => {
          const unlocked = save.unlockedWarriors.indexOf(w.id) !== -1;
          const selected = save.selectedWarrior === w.id;
          const stats = [
            "HP " + w.base.maxHp,
            "DMG " + Math.round(w.base.dmg * 100) + "%",
            "SPD " + w.base.speed,
            "CRIT " + Math.round(w.base.critChance * 100) + "%",
          ];
          return `
          <div class="warrior-card ${selected ? "selected" : ""} ${unlocked ? "" : "locked"}" style="border-top: 3px solid ${w.color}">
            ${selected ? '<div class="w-badge">SELECTED</div>' : ""}
            <div class="w-name" style="color:${w.color}">${w.icon} ${w.name}</div>
            <div class="w-desc">${w.desc}</div>
            <div class="w-stats">${stats.map((s) => `<span class="w-stat">${s}</span>`).join("")}</div>
            ${unlocked
              ? `<button class="big-btn small w-btn select" data-select="${w.id}">${selected ? "In use" : "SELECT"}</button>`
              : `<button class="big-btn small w-btn unlock" data-unlock="${w.id}">UNLOCK — ${w.cost} GEMS</button>`}
          </div>`;
        }).join("");
        return `<div class="warrior-grid">${rows}</div>`;
      }, () => {
        document.querySelectorAll("[data-select]").forEach((b) => {
          b.addEventListener("click", () => {
            SL.Save.get().selectedWarrior = b.dataset.select;
            SL.Save.save();
            SL.Audio.play("upgrade");
            this.showWarriors();
          });
        });
        document.querySelectorAll("[data-unlock]").forEach((b) => {
          b.addEventListener("click", () => {
            const w = SL.Progression.WARRIOR_BY_ID[b.dataset.unlock];
            if (SL.Save.spendGems(w.cost)) {
              SL.Save.unlockWarrior(w.id);
              SL.Audio.play("gem");
              this.showWarriors();
            } else {
              this.toast("Not enough gems!", "boss");
            }
          });
        });
      });
    },

    /* ---------------- equipment ---------------- */
    showEquipment() {
      this.renderSubscreen("Equipment", () => {
        const save = SL.Save.get();
        const rows = SL.Progression.RELICS.map((r) => {
          const owned = save.equipment.indexOf(r.id) !== -1;
          const equipped = save.equippedRelics.indexOf(r.id) !== -1;
          return `
          <div class="relic-card ${equipped ? "equipped" : ""}" data-relic="${r.id}" style="${owned ? "cursor:pointer" : ""}">
            <div class="r-name">${r.icon} ${r.name}</div>
            <div class="r-desc">${r.desc}</div>
            <div class="r-state" style="font-size:11px;font-weight:800;color:${equipped ? "#ffc34d" : owned ? "#8fd8ff" : "#ff8a8a"}">
              ${equipped ? "EQUIPPED" : owned ? "Equip (tap)" : r.cost + " coins"}
            </div>
          </div>`;
        }).join("");
        return `<div class="relic-grid">${rows}</div>
          <p class="lb-note">Equip up to 3 relics. Tap an owned relic to toggle.</p>`;
      }, () => {
        document.querySelectorAll("[data-relic]").forEach((el) => {
          el.addEventListener("click", () => {
            const save = SL.Save.get();
            const id = el.dataset.relic;
            if (save.equipment.indexOf(id) === -1) {
              const r = SL.Progression.RELIC_BY_ID[id];
              if (SL.Save.spendCoins(r.cost)) {
                SL.Save.buyRelic(id);
                SL.Audio.play("coin");
                this.showEquipment();
              } else {
                this.toast("Not enough coins!", "boss");
              }
            } else {
              const eq = save.equippedRelics.slice();
              const i = eq.indexOf(id);
              if (i !== -1) eq.splice(i, 1);
              else {
                if (eq.length >= 3) { this.toast("Only 3 relics can be equipped!", "boss"); return; }
                eq.push(id);
              }
              SL.Save.setEquipped(eq);
              SL.Audio.play("click");
              this.showEquipment();
            }
          });
        });
      });
    },

    /* ---------------- permanent upgrades ---------------- */
    showPermUpgrades() {
      this.renderSubscreen("Upgrades", () => {
        const parts = SL.Progression.PERM_CATS.map((cat) => {
          const ups = SL.Progression.PERM_UPGRADES.filter((u) => u.cat === cat.id)
            .map((u) => this.permRow(u)).join("");
          return `<h3>${cat.name}</h3><div class="currency-cards">${ups}</div>`;
        }).join("");
        return parts;
      }, () => {
        document.querySelectorAll("[data-perm]").forEach((el) => {
          el.addEventListener("click", () => {
            const id = el.dataset.perm;
            const def = SL.Progression.PERM_BY_ID[id];
            const lvl = SL.Save.getPermLevel(id);
            if (lvl >= def.max) return;
            const cost = SL.Progression.permCost(def, lvl);
            const ok = def.currency === "gem" ? SL.Save.spendGems(cost) : SL.Save.spendCoins(cost);
            if (ok) {
              SL.Save.setPermLevel(id, lvl + 1);
              SL.Audio.play("upgrade");
              this.showPermUpgrades();
            } else {
              this.toast("Not enough " + (def.currency === "gem" ? "gems" : "coins") + "!", "boss");
            }
          });
        });
      });
    },

    permRow(u) {
      const lvl = SL.Save.getPermLevel(u.id);
      const cost = SL.Progression.permCost(u, lvl);
      const maxed = lvl >= u.max;
      const effectText = u.unit.replace("%1", lvl * u.effect);
      return `
      <div class="currency-card ${maxed ? "maxed" : ""}" data-perm="${u.id}">
        <div class="c-name">${u.icon} ${u.name}</div>
        <div class="c-level">Level ${lvl}/${u.max}</div>
        <div class="c-desc">${effectText}</div>
        <div class="c-cost ${u.currency === "gem" ? "gem" : ""}">${maxed ? "MAX" : (u.currency === "gem" ? "\u25c7 " : "\u25c9 ") + cost}</div>
      </div>`;
    },

    /* ---------------- leaderboard ---------------- */
    showLeaderboard(active) {
      this.renderSubscreen("Leaderboards", () => {
        const tabs = ["global", "weekly", "friends", "class", "personal"].map((t) =>
          `<button class="lb-tab ${active === t ? "active" : ""}" data-lb="${t}">${t.toUpperCase()}</button>`).join("");
        return `<div class="lb-tabs">${tabs}</div>
          <div id="lb-content" style="display:flex;flex-direction:column;gap:10px">
            <div class="lb-note">Loading...</div>
          </div>`;
      }, () => {
        document.querySelectorAll("[data-lb]").forEach((b) => {
          b.addEventListener("click", () => this.showLeaderboard(b.dataset.lb));
        });
        this.loadBoard(active);
      });
    },

    async loadBoard(board) {
      const content = $("lb-content");
      const save = SL.Save.get();
      let cls = null;
      let entries = await SL.Leaderboard.get(board, { cls });
      if (board === "class") {
        cls = save.selectedWarrior;
        entries = await SL.Leaderboard.get("class", { cls });
      }
      const me = save.personalBest.score;
      let html = "";
      if (board === "friends") {
        html = '<div class="lb-note">No friends connected yet. Connect an online backend to see your friends here.</div>';
      } else {
        const rows = entries.slice(0, 12).map((e, i) => `
          <div class="lb-row ${e.me ? "me" : ""}">
            <span class="lb-rank ${i < 3 ? "top" + (i + 1) : ""}">#${i + 1}</span>
            <span class="lb-name">${e.name || "Hero"}</span>
            <span class="lb-class">${(SL.Progression.WARRIOR_BY_ID[e.cls] || {}).name || "—"}</span>
            <span class="lb-score">${U.formatNum(e.score)}</span>
          </div>`).join("");
        html = `<div class="lb-list">${rows || '<div class="lb-note">No scores yet.</div>'}</div>`;
        html += `<div class="lb-note">Your best: <b style="color:#ffc34d">${U.formatNum(me)}</b></div>`;
      }
      html += `<div class="lb-note">${board === "weekly" ? "Weekly scores reset every Monday." : ""}${board !== "friends" ? " Demo scores stored locally in this browser \u2014 no online backend connected." : ""}</div>`;
      if (content) content.innerHTML = html;
    },

    /* ---------------- challenges ---------------- */
    showChallenges() {
      this.renderSubscreen("Challenges", () => {
        const daily = SL.Challenges.dailyChallenges();
        const weekly = SL.Challenges.weeklyChallenges();
        const mods = SL.Challenges.weeklyModifiers();
        const save = SL.Save.get();

        const renderChal = (c) => {
          const prog = save.challengeProgress[c.id] || { value: 0, claimed: false };
          const frac = SL.Challenges.progressOf(c, prog.value);
          const pct = Math.round(frac * 100);
          const canClaim = !prog.claimed && frac >= 1;
          const display = c.desc.replace("%1", typeof c.target === "string" ? c.target : U.formatNum(c.target));
          return `
          <div class="chal-card">
            <div class="ch-info">
              <div class="ch-name">${c.name}</div>
              <div class="ch-prog">${display} — ${prog.claimed ? "CLAIMED" : Math.min(100, pct) + "%"}</div>
              <div class="bar" style="margin-top:6px;height:7px"><div class="bar-fill xp" style="width:${Math.min(100, pct)}%"></div></div>
            </div>
            <div class="ch-reward">\u25c9${c.reward.coins} \u25c7${c.reward.gems}</div>
            ${canClaim ? `<button class="big-btn small primary ch-btn" data-claim="${c.id}">CLAIM</button>` : `<button class="big-btn small ch-btn" disabled style="opacity:.5">${prog.claimed ? "DONE" : "LOCKED"}</button>`}
          </div>`;
        };

        return `
          <h3>Daily Challenges</h3>
          <div class="chal-list">${daily.map(renderChal).join("")}</div>
          <h3 style="margin-top:10px">Weekly Challenges</h3>
          <div class="chal-list">${weekly.map(renderChal).join("")}</div>
          <h3 style="margin-top:10px">Weekly Challenge Modifiers</h3>
          <div class="chal-list">${mods.map((m) => `<div class="chal-card"><div class="ch-info"><div class="ch-name">${m.name}</div><div class="ch-prog">${m.desc}</div></div></div>`).join("")}</div>
          <div class="chal-daily-note">Challenges rotate daily. Progress tracks your best values each run.</div>`;
      }, () => {
        document.querySelectorAll("[data-claim]").forEach((b) => {
          b.addEventListener("click", () => {
            const id = b.dataset.claim;
            const all = SL.Challenges.dailyChallenges().concat(SL.Challenges.weeklyChallenges());
            const c = all.find((x) => x.id === id);
            if (c) {
              const save = SL.Save.get();
              save.challengeProgress[id].claimed = true;
              SL.Save.addCoins(c.reward.coins);
              SL.Save.addGems(c.reward.gems);
              SL.Audio.play("gem");
              this.toast("Reward claimed!", "synergy");
              this.showChallenges();
            }
          });
        });
      });
    },

    /* ---------------- settings ---------------- */
    bindSettingsStatic() {
      $("btn-death-upgrades").addEventListener("click", () => {
        this.hideDeath();
        this.showPermUpgrades();
      });
      $("btn-death-menu").addEventListener("click", () => {
        this.hideDeath();
        SL.Game.toMainMenu();
      });
      $("btn-death-replay").addEventListener("click", () => {
        this.hideDeath();
        SL.Game.startRun();
      });
    },

    showSettings() {
      this.renderSubscreen("Settings", () => {
        const s = SL.Save.get().settings;
        return `
        <div class="setting-row"><label>Player Name</label><input id="set-name" type="text" maxlength="14" value="${SL.Save.get().playerName}" style="background:#0e1224;border:1px solid var(--line);border-radius:8px;padding:6px 10px;color:#fff;font-weight:700"></div>
        <div class="setting-row"><label>Sound Effects</label><button id="set-sfx" class="toggle ${s.soundOn ? "on" : ""}"></button></div>
        <div class="setting-row"><label>SFX Volume</label><input id="set-sfxvol" type="range" min="0" max="1" step="0.05" value="${s.sfxVol}"></div>
        <div class="setting-row"><label>Music</label><button id="set-mus" class="toggle ${s.musicOn ? "on" : ""}"></button></div>
        <div class="setting-row"><label>Music Volume</label><input id="set-musvol" type="range" min="0" max="1" step="0.05" value="${s.musicVol}"></div>
        <div class="setting-row"><label>Screen Shake</label><button id="set-shake" class="toggle ${s.screenShake ? "on" : ""}"></button></div>
        <div class="setting-row"><label>Damage Numbers</label><button id="set-dmg" class="toggle ${s.damageNumbers ? "on" : ""}"></button></div>
        <div class="setting-row"><label>Reduced Effects (perf)</label><button id="set-lowfx" class="toggle ${s.reduceEffects ? "on" : ""}"></button></div>
        <div class="setting-row"><label>Controls</label><button class="big-btn small" id="set-controls">SHOW CONTROLS</button></div>
        <div class="setting-row"><label>Reset Save</label><button class="big-btn small danger" id="set-reset">RESET ALL DATA</button></div>
        <div class="setting-desc">Reset clears all progress, currency and settings. This cannot be undone.</div>`;
      }, () => {
        const save = SL.Save.get();
        const applyAudio = () => {
          const s = save.settings;
          SL.Audio.setVolumes(s.soundOn ? s.sfxVol : 0, s.musicOn ? s.musicVol : 0, s.musicOn);
        };
        $("set-name").addEventListener("change", (e) => { save.playerName = e.target.value || "Hero"; SL.Save.save(); });
        $("set-sfx").addEventListener("click", (e) => { save.settings.soundOn = !save.settings.soundOn; e.target.classList.toggle("on", save.settings.soundOn); SL.Save.setSettings(save.settings); applyAudio(); SL.Audio.play("click"); });
        $("set-sfxvol").addEventListener("input", (e) => { save.settings.sfxVol = parseFloat(e.target.value); SL.Save.setSettings(save.settings); applyAudio(); });
        $("set-mus").addEventListener("click", (e) => { save.settings.musicOn = !save.settings.musicOn; e.target.classList.toggle("on", save.settings.musicOn); SL.Save.setSettings(save.settings); applyAudio(); });
        $("set-musvol").addEventListener("input", (e) => { save.settings.musicVol = parseFloat(e.target.value); SL.Save.setSettings(save.settings); applyAudio(); });
        $("set-shake").addEventListener("click", (e) => { save.settings.screenShake = !save.settings.screenShake; e.target.classList.toggle("on", save.settings.screenShake); SL.Save.setSettings(save.settings); });
        $("set-dmg").addEventListener("click", (e) => { save.settings.damageNumbers = !save.settings.damageNumbers; e.target.classList.toggle("on", save.settings.damageNumbers); SL.Save.setSettings(save.settings); });
        $("set-lowfx").addEventListener("click", (e) => { save.settings.reduceEffects = !save.settings.reduceEffects; e.target.classList.toggle("on", save.settings.reduceEffects); SL.Save.setSettings(save.settings); });
        $("set-controls").addEventListener("click", () => { SL.Audio.play("click"); this.showControlsModal(); });
        $("set-reset").addEventListener("click", () => {
          this.confirm("Reset all saved data?", "This will permanently delete all progress, coins, gems, and settings.", () => {
            SL.Save.resetSave();
            this.toast("Save reset.", "boss");
            this.show("main");
            this.refreshResourceBar();
          });
        });
      });
    },

    /* ---------------- generic subscreen ---------------- */
    renderSubscreen(title, contentFn, wireFn) {
      const root = $("screen-loadout");
      // reuse screen-loadout for all subscreens
      ["screen-equip", "screen-perm", "screen-leaderboard", "screen-challenges", "screen-settings"].forEach((s) => $(s).classList.add("hidden"));
      root.classList.remove("hidden");
      root.innerHTML = `
        <div class="subscreen">
          <div class="back-row">
            <button class="back-btn" id="sub-back">\u2190 BACK</button>
            <h2 style="margin:0">${title}</h2>
            <span></span>
          </div>
          <div class="resources-top">
            <span class="res-coin">\u25c9 <b>${U.formatNum(SL.Save.get().coins)}</b></span>
            <span class="res-gem">\u25c7 <b>${U.formatNum(SL.Save.get().gems)}</b></span>
          </div>
          ${contentFn()}
        </div>`;
      this.currentScreen = "screen-loadout";
      $("sub-back").addEventListener("click", () => { SL.Audio.play("click"); this.show("main"); });
      if (wireFn) wireFn();
    },

    /* ---------------- touch controls ---------------- */
    setupTouchButtons() {
      const inp = SL.Game.input;
      if (!inp.touchMode) {
        // hybrid device: enable touch controls the moment a real touch happens
        window.addEventListener("touchstart", () => {
          inp.touchMode = true;
          this.setupTouchButtons();
        }, { once: true });
        return;
      }
      if (!this.touchWired) {
        this.touchWired = true;
        inp.wireButton($("btn-attack"), "attack");
        inp.wireButton($("btn-heavy"), "heavy");
        inp.wireButton($("btn-dash"), "dash");
        inp.wireButton($("btn-jump"), "jump");
        inp.wireButton($("btn-special"), "special");
        inp.wireButton($("btn-ultimate"), "ultimate");
        inp.enableSwipes();
      }
      const tc = document.getElementById("touch-controls");
      tc.classList.add("touch-mode");
      if (SL.Game.state === "playing") tc.classList.remove("hidden");
    },

    bindTouch() {
      // handled in setupTouchButtons
    },

    /* ---------------- HUD ---------------- */
    updateHUD(g) {
      const p = g.player;
      if (!p) return;
      const hpPct = Math.max(0, p.hp / p.maxHp * 100);
      $("hud-hp").style.width = hpPct + "%";
      $("hud-hp-text").textContent = Math.ceil(p.hp) + "/" + Math.ceil(p.maxHp);
      const xpPct = Math.min(100, p.xp / p.xpNeed * 100);
      $("hud-xp").style.width = xpPct + "%";
      $("hud-lvl").textContent = "Lv " + p.level;
      $("hud-distance").textContent = Math.floor(g.distance) + "m";
      $("hud-score").textContent = U.formatNum(g.score);
      $("hud-coins-val").textContent = U.formatNum(g.coinsEarned);
      $("hud-gems-val").textContent = U.formatNum(g.gemsEarned);

      // combo
      const comboEl = $("hud-combo");
      if (g.combo >= 10) {
        comboEl.classList.remove("hidden");
        const tier = g.comboTier;
        comboEl.textContent = (g.rampage ? "RAMPAGE! " : "") + "x" + g.combo + "  +" + Math.round((g.scoreMul - 1) * 100) + "%";
        if (tier !== this._lastTier) {
          this._lastTier = tier;
          comboEl.classList.remove("pop");
          void comboEl.offsetWidth;
          comboEl.classList.add("pop");
          SL.Audio.play("combo", { combo: g.combo });
        }
      } else {
        comboEl.classList.add("hidden");
        this._lastTier = 0;
      }

      // boss bar
      if (g.boss) {
        $("hud-boss").classList.remove("hidden");
        $("boss-name").textContent = g.boss.name + (g.boss.phase === 2 ? " — ENRAGED" : "");
        $("hud-boss-hp").style.width = Math.max(0, g.boss.hp / g.boss.maxHp * 100) + "%";
      } else {
        $("hud-boss").classList.add("hidden");
      }

      // abilities
      this.setAbility($("ab-special"), "special", p.specialCd, g.warrior.special.cooldown * p.stats.cdMul, g.warrior.special.icon);
      this.setAbility($("ab-ultimate"), "ultimate", p.ultCd, g.warrior.ultimate.cooldown * p.stats.ultCdMul, g.warrior.ultimate.icon);
      this.setAbility($("ab-dash"), "dash", p.dashCd, 2.1 * p.stats.dashCdMul, "\u27a1");
    },

    setAbility(el, name, cd, max, icon) {
      const frac = max > 0 ? U.clamp(cd / max, 0, 1) : 0;
      const overlay = el.querySelector(".ab-cd");
      if (frac <= 0) {
        overlay.style.display = "none";
      } else {
        overlay.style.display = "flex";
        overlay.style.clipPath = "inset(0 0 " + (frac * 100).toFixed(0) + "% 0)";
        overlay.textContent = cd > 0 ? cd.toFixed(1) : "";
      }
    },

    /* ---------------- level-up cards ---------------- */
    showLevelUp(picks) {
      $("levelup-overlay").classList.remove("hidden");
      const container = $("levelup-cards");
      const owned = SL.Game.run.upgradeLevels;
      container.innerHTML = picks.map((u, i) => {
        const lvl = (owned[u.id] || 0) + 1;
        const synHints = SL.Upgrades.SYNERGIES
          .filter((s) => s.requires.indexOf(u.id) !== -1 && s.requires.every((rid) => rid === u.id || (owned[rid] || 0) > 0))
          .map((s) => `<div class="upg-syn">&#9889; ${s.name}</div>`).join("");
        const color = SL.Upgrades.RARITY_COLORS[u.rarity];
        return `
        <div class="upg-card ${u.rarity}" data-pick="${i}" style="position:relative;animation-delay:${i * 0.08}s">
          <div class="upg-ico" style="color:${color}">${u.icon}</div>
          <div class="upg-rarity ${u.rarity}">${u.rarity.toUpperCase()}</div>
          <div class="upg-name">${u.name}</div>
          <div class="upg-desc">${u.desc(lvl)}</div>
          <div class="upg-stack">Level ${lvl}/${u.max}</div>
          ${synHints}
        </div>`;
      }).join("");
      container.querySelectorAll("[data-pick]").forEach((card) => {
        card.addEventListener("click", () => {
          const idx = parseInt(card.dataset.pick, 10);
          const result = SL.Upgrades.applyUpgrade(SL.Game.run, picks[idx].id);
          SL.Audio.play("upgrade");
          for (const syn of result.synergies) {
            this.toast("SYNERGY DISCOVERED: " + syn.name, "synergy");
          }
          $("levelup-overlay").classList.add("hidden");
          SL.Game.afterLevelUp();
        });
      });
    },

    hideLevelUp() {
      $("levelup-overlay").classList.add("hidden");
    },

    /* ---------------- death screen ---------------- */
    showDeath(g) {
      const d = SL.Save.get();
      const pb = d.personalBest;
      const rank = g.finalRank || { rank: "—", total: "—" };
      const isNewBest = g.score >= pb.score && g.score > 0;
      $("death-stats").innerHTML = `
        ${this.dstat("Distance", Math.floor(g.distance) + "m")}
        ${this.dstat("Enemies Defeated", U.formatNum(g.kills))}
        ${this.dstat("Bosses Defeated", g.bossKills)}
        ${this.dstat("Highest Combo", g.maxCombo)}
        ${this.dstat("Time Survived", U.formatTime(g.timeSurvived))}
        ${this.dstat("Final Score", U.formatNum(g.score), "gold")}
        ${this.dstat("Leaderboard", "#" + rank.rank + " of " + rank.total)}
        ${this.dstat("Level Reached", g.player ? g.player.level : 1)}
        ${isNewBest ? '<div class="dstat wide"><div class="k">NEW PERSONAL BEST!</div><div class="v gold">' + U.formatNum(g.score) + "</div></div>" : ""}`;
      $("death-screen").classList.remove("hidden");
      const rw = g.rewards || { coins: 0, gems: 0, xp: 0 };
      $("death-rewards").innerHTML = `<span class="res-coin">&#9679; <b>${U.formatNum(rw.coins)}</b> earned</span>
        <span class="res-gem">&#9673; <b>${U.formatNum(rw.gems)}</b> earned</span>
        <span class="res-xp">&#10022; <b>${U.formatNum(rw.xp)}</b> xp</span>`;
    },

    dstat(k, v, cls) {
      return `<div class="dstat"><div class="k">${k}</div><div class="v ${cls || ""}">${v}</div></div>`;
    },

    hideDeath() {
      $("death-screen").classList.add("hidden");
    },

    /* ---------------- pause ---------------- */
    showPause() {
      $("pause-screen").classList.remove("hidden");
    },
    hidePause() {
      $("pause-screen").classList.add("hidden");
    },

    bindPause() {
      $("btn-pause").addEventListener("click", () => { SL.Audio.play("click"); SL.Game.pause(); });
      $("btn-resume").addEventListener("click", () => { SL.Audio.play("click"); SL.Game.resume(); });
      $("btn-pause-controls").addEventListener("click", () => { SL.Audio.play("click"); this.showControlsModal(); });
      $("btn-pause-settings").addEventListener("click", () => { SL.Audio.play("click"); this.showSettings(); });
      $("btn-quit-run").addEventListener("click", () => {
        SL.Audio.play("click");
        this.confirm("Quit this run?", "Your progress in this run will be lost, but coins and gems earned will be kept.", () => {
          $("pause-screen").classList.add("hidden");
          SL.Game.endRun(true);
        });
      });
    },

    /* ---------------- toast / modal ---------------- */
    toast(msg, kind) {
      const root = $("toast-root");
      const el = document.createElement("div");
      el.className = "toast " + (kind || "");
      el.textContent = msg;
      root.appendChild(el);
      setTimeout(() => { el.style.transition = "opacity .4s"; el.style.opacity = "0"; }, 2200);
      setTimeout(() => el.remove(), 2700);
    },

    confirm(title, msg, onOk) {
      const root = $("modal-root");
      const box = document.createElement("div");
      box.className = "modal";
      box.innerHTML = `<div class="modal-box">
        <h2 style="color:#ffc34d">${title}</h2>
        <p>${msg}</p>
        <button class="big-btn danger" id="modal-ok">YES, CONTINUE</button>
        <button class="big-btn" id="modal-cancel">CANCEL</button>
      </div>`;
      root.appendChild(box);
      $("modal-ok").addEventListener("click", () => { box.remove(); onOk(); });
      $("modal-cancel").addEventListener("click", () => box.remove());
    },

    showControlsModal() {
      const root = $("modal-root");
      const box = document.createElement("div");
      box.className = "modal";
      box.innerHTML = `<div class="modal-box">
        <h2 style="color:#57c8ff">CONTROLS</h2>
        <div class="keys-grid">
          <span class="kg-k">WASD / Arrows</span><span>Move</span>
          <span class="kg-k">Space / Tap</span><span>Jump</span>
          <span class="kg-k">Mouse Click / Attack</span><span>Light Attack</span>
          <span class="kg-k">Right Click / Heavy</span><span>Heavy Attack</span>
          <span class="kg-k">Shift / Dash</span><span>Dash</span>
          <span class="kg-k">E / Special</span><span>Ability</span>
          <span class="kg-k">Q / Ultimate</span><span>Ultimate</span>
          <span class="kg-k">P / Esc</span><span>Pause</span>
        </div>
        <p style="font-size:12px;color:#93a1c4">On mobile: drag the joystick to move, tap buttons to act. Swipe up to jump, swipe down to dash.</p>
        <button class="big-btn primary" id="modal-close">CLOSE</button>
      </div>`;
      root.appendChild(box);
      $("modal-close").addEventListener("click", () => box.remove());
    },
  };

  SL.UI = UI;

})(window.SL = window.SL || {});

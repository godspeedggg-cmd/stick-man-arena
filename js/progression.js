/* ============================================================
 * Stickman: Warrior's Legacy
 * progression.js — warrior classes, permanent upgrades,
 *                  equipment relics, and the run stat factory.
 * ============================================================ */
(function (SL) {
  "use strict";

  /* ---------------- Warrior classes ---------------- */
  const WARRIORS = [
    {
      id: "warrior", name: "Warrior", icon: "\u2694", cost: 0,
      color: "#5fc8ff", weapon: "melee",
      desc: "A balanced fighter. The starting class of every legend.",
      base: { maxHp: 110, dmg: 1.4, speed: 265, critChance: 0.05, critMul: 1.6, attackSpeed: 1, armor: 2, dashCd: 2.1 },
      special: { type: "spinslash", name: "Blade Arc", cooldown: 7, icon: "\u2749" },
      ultimate: { type: "bladeStorm", name: "Blade Storm", cooldown: 28, icon: "\u2694" },
      tags: ["balanced"],
    },
    {
      id: "assassin", name: "Assassin", icon: "\u2699", cost: 150,
      color: "#c86bff", weapon: "melee",
      desc: "Lightning-fast strikes and devastating crits. Moves through the fray.",
      base: { maxHp: 85, dmg: 0.92, speed: 305, critChance: 0.16, critMul: 1.9, attackSpeed: 1.4, armor: 0, dashCd: 1.5 },
      special: { type: "shadestep", name: "Shadow Step", cooldown: 6, icon: "\u2741" },
      ultimate: { type: "deathmark", name: "Death Mark", cooldown: 24, icon: "\u2715" },
      tags: ["fast", "crit"],
    },
    {
      id: "berserker", name: "Berserker", icon: "\u2604", cost: 150,
      color: "#ff6b4a", weapon: "melee",
      desc: "Raw fury. Gains damage and speed as his health drops.",
      base: { maxHp: 135, dmg: 1.3, speed: 240, critChance: 0.07, critMul: 1.6, attackSpeed: 0.92, armor: 4, dashCd: 2.3 },
      special: { type: "slam", name: "Rage Slam", cooldown: 7.5, icon: "\u2b63" },
      ultimate: { type: "warcry", name: "Warcry", cooldown: 26, icon: "\u26a1" },
      tags: ["damage", "rage"],
    },
    {
      id: "guardian", name: "Guardian", icon: "\u2b22", cost: 150,
      color: "#3fe0b0", weapon: "melee",
      desc: "An unbreakable wall. High health, armor, and punishing counters.",
      base: { maxHp: 180, dmg: 0.82, speed: 235, critChance: 0.05, critMul: 1.5, attackSpeed: 0.95, armor: 10, dashCd: 2.2 },
      special: { type: "bash", name: "Shield Bash", cooldown: 6.5, icon: "\u2595" },
      ultimate: { type: "bulwark", name: "Bulwark", cooldown: 30, icon: "\u25a6" },
      tags: ["tank", "counter"],
    },
    {
      id: "ranger", name: "Ranger", icon: "\u27b6", cost: 200,
      color: "#7dff6a", weapon: "ranged",
      desc: "Fights from afar with a storm of arrows.",
      base: { maxHp: 90, dmg: 0.78, speed: 292, critChance: 0.1, critMul: 1.7, attackSpeed: 1.15, armor: 1, dashCd: 1.9 },
      special: { type: "volley", name: "Arrow Volley", cooldown: 7, icon: "\u2191" },
      ultimate: { type: "rainArrows", name: "Rain of Arrows", cooldown: 27, icon: "\u2912" },
      tags: ["ranged", "fast"],
    },
    {
      id: "shadowmage", name: "Shadow Mage", icon: "\u2726", cost: 250,
      color: "#a06bff", weapon: "ranged",
      desc: "Commands shadow and void. Bolts, novas, and starfall.",
      base: { maxHp: 98, dmg: 0.98, speed: 268, critChance: 0.08, critMul: 1.6, attackSpeed: 1, armor: 1, dashCd: 2.0 },
      special: { type: "nova", name: "Shadow Nova", cooldown: 7.5, icon: "\u2737" },
      ultimate: { type: "voidStorm", name: "Void Storm", cooldown: 28, icon: "\u2756" },
      tags: ["magic", "ranged"],
    },
  ];

  const WARRIOR_BY_ID = {};
  WARRIORS.forEach((w) => { WARRIOR_BY_ID[w.id] = w; });

  /* ---------------- Permanent upgrades ---------------- */
  const PERM_UPGRADES = [
    { id: "perm_dmg", cat: "combat", name: "Attack Mastery", icon: "\u2694", currency: "coin", baseCost: 45, mul: 1.65, max: 20, effect: 0.05, unit: "+%1 damage per level" },
    { id: "perm_crit", cat: "combat", name: "Critical Eye", icon: "\u25ce", currency: "coin", baseCost: 60, mul: 1.6, max: 15, effect: 0.02, unit: "+%1 crit chance per level" },
    { id: "perm_critdmg", cat: "combat", name: "Critical Might", icon: "\u2737", currency: "coin", baseCost: 60, mul: 1.6, max: 15, effect: 0.15, unit: "+%1 crit damage per level" },

    { id: "perm_hp", cat: "survival", name: "Vitality", icon: "\u2764", currency: "coin", baseCost: 50, mul: 1.6, max: 25, effect: 10, unit: "+%1 max health per level" },
    { id: "perm_armor", cat: "survival", name: "Iron Resolve", icon: "\u25a6", currency: "coin", baseCost: 60, mul: 1.6, max: 15, effect: 2, unit: "+%1 armor per level" },
    { id: "perm_regen", cat: "survival", name: "Regeneration", icon: "\u2756", currency: "gem", baseCost: 40, mul: 1.55, max: 15, effect: 0.3, unit: "+%1 health/s per level" },

    { id: "perm_speed", cat: "mobility", name: "Swift Feet", icon: "\u2b0a", currency: "coin", baseCost: 55, mul: 1.6, max: 15, effect: 0.03, unit: "+%1 move speed per level" },
    { id: "perm_dashdist", cat: "mobility", name: "Dash Distance", icon: "\u2192", currency: "coin", baseCost: 60, mul: 1.6, max: 10, effect: 0.1, unit: "+%1 dash distance per level" },
    { id: "perm_dashcd", cat: "mobility", name: "Dash Recovery", icon: "\u23f3", currency: "coin", baseCost: 60, mul: 1.6, max: 10, effect: 0.04, unit: "-%1 dash cooldown per level" },

    { id: "perm_abdmg", cat: "abilities", name: "Arcane Might", icon: "\u2726", currency: "gem", baseCost: 70, mul: 1.6, max: 15, effect: 0.06, unit: "+%1 ability damage per level" },
    { id: "perm_abcd", cat: "abilities", name: "Arcane Focus", icon: "\u23f3", currency: "gem", baseCost: 70, mul: 1.6, max: 10, effect: 0.04, unit: "-%1 ability cooldown per level" },
    { id: "perm_ult", cat: "abilities", name: "Ultimate Power", icon: "\u2733", currency: "gem", baseCost: 90, mul: 1.6, max: 10, effect: 0.15, unit: "+%1 ultimate damage per level" },
  ];
  const PERM_BY_ID = {};
  PERM_UPGRADES.forEach((p) => { PERM_BY_ID[p.id] = p; });
  const PERM_CATS = [
    { id: "combat", name: "Combat" },
    { id: "survival", name: "Survival" },
    { id: "mobility", name: "Mobility" },
    { id: "abilities", name: "Abilities" },
  ];

  function permCost(def, level) {
    return Math.round(def.baseCost * Math.pow(def.mul, level));
  }

  /* ---------------- Relics (equipment) ---------------- */
  const RELICS = [
    { id: "relic_sharp", name: "Sharp Talon", icon: "\u2694", cost: 120, currency: "coin", desc: "+8% damage" },
    { id: "relic_heart", name: "Iron Heart", icon: "\u2764", cost: 100, currency: "coin", desc: "+15 max health" },
    { id: "relic_luck", name: "Lucky Coin", icon: "\u25c9", cost: 140, currency: "coin", desc: "+12% coins earned" },
    { id: "relic_wind", name: "Wind Slippers", icon: "\u2b0a", cost: 120, currency: "coin", desc: "+7% move speed" },
    { id: "relic_thorn", name: "Thorn Band", icon: "\u2733", cost: 160, currency: "coin", desc: "Reflect 25% of melee damage" },
    { id: "relic_gem", name: "Gem Pouch", icon: "\u25c7", cost: 180, currency: "coin", desc: "+15% gems earned" },
    { id: "relic_regen", name: "Regrowth Seed", icon: "\u2756", cost: 140, currency: "coin", desc: "+1 health per second" },
    { id: "relic_crit", name: "Owl Feather", icon: "\u25ce", cost: 150, currency: "coin", desc: "+5% critical chance" },
    { id: "relic_haste", name: "Haste Charm", icon: "\u26a1", cost: 150, currency: "coin", desc: "+10% attack speed" },
    { id: "relic_shield", name: "Aegis Fragment", icon: "\u2b22", cost: 200, currency: "coin", desc: "+10 armor" },
  ];
  const RELIC_BY_ID = {};
  RELICS.forEach((r) => { RELIC_BY_ID[r.id] = r; });

  /* ---------------- RunStats factory ---------------- */
  function newRunStats() {
    return {
      dmgMul: 1, flatDmg: 0, critChance: 0.05, critMul: 1.6,
      attackSpeedMul: 1, maxHpFlat: 0, maxHpMul: 1, armor: 0, regen: 0,
      speedMul: 1, jumpMul: 1, lifesteal: 0,
      xpMul: 1, coinMul: 1, gemMul: 1, comboMul: 1, rangeMul: 1,
      dashCdMul: 1, dashDistMul: 1, cdMul: 1, ultCdMul: 1, thorns: 0,
      // upgrades
      upgradeLevels: {}, tags: [], synergiesActive: {},
      burn: false, burnLevel: 0, poison: false, poisonLevel: 0,
      frost: false, frostLevel: 0, lightning: false, lightningLevel: 0,
      explosiveKill: 0, pierce: 0, whirlwind: false, whirlSize: 0,
      groundSlam: false, slamSize: 0, doubleJump: false,
      homing: false, homingLevel: 0, boltCount: 0, cloneCount: 0,
      lightStrikes: 1, revive: 0, aegis: 0, berserk: 0, thunderAura: false,
      // synergy flags
      synFlamingDash: false, synLightningClone: false, synCritRage: false,
      synChain: false, synSoulBurn: false, synSuperconduct: false,
      synPhantomFlurry: false, synIronCyclone: false, synSkyfall: false,
      synRetribution: false, synFrenzy: false, synTitanReach: false,
    };
  }

  function applyPermAndRelics(run, warrior) {
    const save = SL.Save.get();
    run.dmgMul += (SL.Save.getPermLevel("perm_dmg") * 0.05);
    run.critChance += (SL.Save.getPermLevel("perm_crit") * 0.02);
    run.critMul += (SL.Save.getPermLevel("perm_critdmg") * 0.15);
    run.maxHpFlat += SL.Save.getPermLevel("perm_hp") * 10;
    run.armor += SL.Save.getPermLevel("perm_armor") * 2;
    run.regen += SL.Save.getPermLevel("perm_regen") * 0.3;
    run.speedMul += SL.Save.getPermLevel("perm_speed") * 0.03;
    run.dashDistMul += SL.Save.getPermLevel("perm_dashdist") * 0.1;
    run.dashCdMul *= Math.pow(0.96, SL.Save.getPermLevel("perm_dashcd"));
    run.cdMul *= Math.pow(0.96, SL.Save.getPermLevel("perm_abcd"));
    run.ultCdMul *= Math.pow(0.96, SL.Save.getPermLevel("perm_ult"));
    // ability dmg is separate; store flat ability bonus
    run.abilityDmgMul = 1 + SL.Save.getPermLevel("perm_abdmg") * 0.06 + SL.Save.getPermLevel("perm_ult") * 0.15;

    // relics
    for (const rid of save.equippedRelics) {
      const r = RELIC_BY_ID[rid];
      if (!r) continue;
      switch (rid) {
        case "relic_sharp": run.dmgMul += 0.08; break;
        case "relic_heart": run.maxHpFlat += 15; break;
        case "relic_luck": run.coinMul += 0.12; break;
        case "relic_wind": run.speedMul += 0.07; break;
        case "relic_thorn": run.thorns += 0.25; break;
        case "relic_gem": run.gemMul += 0.15; break;
        case "relic_regen": run.regen += 1; break;
        case "relic_crit": run.critChance += 0.05; break;
        case "relic_haste": run.attackSpeedMul += 0.1; break;
        case "relic_shield": run.armor += 10; break;
      }
    }
  }

  SL.Progression = {
    WARRIORS, WARRIOR_BY_ID, PERM_UPGRADES, PERM_BY_ID, PERM_CATS, RELICS, RELIC_BY_ID,
    permCost, newRunStats, applyPermAndRelics,
  };

})(window.SL = window.SL || {});

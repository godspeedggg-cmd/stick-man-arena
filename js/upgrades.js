/* ============================================================
 * Stickman: Warrior's Legacy
 * upgrades.js — roguelite run upgrades (30+) + synergy system
 *
 * Each upgrade is applied onto a "run" object (RunStats) that the
 * game uses to scale the player. Synergies combine two owned
 * upgrades into stronger effects and are fully data-driven.
 * ============================================================ */
(function (SL) {
  "use strict";
  const U = SL.U;

  const RARITY = { common: 0, rare: 1, epic: 2, legendary: 3 };
  const RARITY_WEIGHTS = { common: 55, rare: 30, epic: 12, legendary: 4 };
  const RARITY_COLORS = { common: "#9fb6e0", rare: "#3da2ff", epic: "#c45dff", legendary: "#ffb02e" };

  const UPGRADES = [
    { id: "razor", name: "Razor Edge", icon: "\u2694", rarity: "common", max: 5, tags: ["dmg"],
      desc: (l) => "+18% attack damage per level.", apply: (r, l) => { r.dmgMul += 0.18 * l; } },

    { id: "swift", name: "Swift Boots", icon: "\u2b0a", rarity: "common", max: 4, tags: ["speed"],
      desc: (l) => "+12% movement speed per level.", apply: (r, l) => { r.speedMul += 0.12 * l; } },

    { id: "eagle", name: "Eagle Eye", icon: "\u25ce", rarity: "common", max: 5, tags: ["crit"],
      desc: (l) => "+8% critical chance per level.", apply: (r, l) => { r.critChance += 0.08 * l; } },

    { id: "sharpedge", name: "Sharpened Edge", icon: "\u2737", rarity: "common", max: 4, tags: ["crit"],
      desc: (l) => "+40% critical damage per level.", apply: (r, l) => { r.critMul += 0.4 * l; } },

    { id: "iron", name: "Iron Skin", icon: "\u25c8", rarity: "common", max: 5, tags: ["hp"],
      desc: (l) => "+20 maximum health per level.", apply: (r, l) => { r.maxHpFlat += 20 * l; } },

    { id: "quick", name: "Quick Hands", icon: "\u23f3", rarity: "common", max: 4, tags: ["cd"],
      desc: (l) => "-10% ability cooldowns per level.", apply: (r, l) => { r.cdMul *= Math.pow(0.9, l); } },

    { id: "xp", name: "Scholar's Tome", icon: "\u2756", rarity: "common", max: 4, tags: ["xp"],
      desc: (l) => "+30% experience gain per level.", apply: (r, l) => { r.xpMul += 0.3 * l; } },

    { id: "gold", name: "Golden Heart", icon: "\u25c9", rarity: "common", max: 4, tags: ["gold"],
      desc: (l) => "+50% coins earned per level.", apply: (r, l) => { r.coinMul += 0.5 * l; } },

    { id: "armor", name: "Fortress", icon: "\u25a6", rarity: "common", max: 5, tags: ["hp"],
      desc: (l) => "+8 armor per level.", apply: (r, l) => { r.armor += 8 * l; } },

    { id: "bigblade", name: "Colossal Blade", icon: "\u2696", rarity: "common", max: 3, tags: ["dmg", "range"],
      desc: (l) => "+30% attack range and +10% damage per level.", apply: (r, l) => { r.rangeMul += 0.3 * l; r.dmgMul += 0.1 * l; } },

    { id: "dash", name: "Wind Step", icon: "\u27a1", rarity: "common", max: 4, tags: ["dash"],
      desc: (l) => "-20% dash cooldown per level.", apply: (r, l) => { r.dashCdMul *= Math.pow(0.8, l); } },

    { id: "dashdist", name: "Long Dash", icon: "\u2192", rarity: "common", max: 4, tags: ["dash"],
      desc: (l) => "+30% dash distance per level.", apply: (r, l) => { r.dashDistMul += 0.3 * l; } },

    { id: "lifesteal", name: "Vampiric Touch", icon: "\u2764", rarity: "rare", max: 4, tags: ["heal"],
      desc: (l) => "Heal for 4% of damage dealt per level.", apply: (r, l) => { r.lifesteal += 0.04 * l; } },

    { id: "gem", name: "Gem Attunement", icon: "\u25c7", rarity: "rare", max: 3, tags: ["gem"],
      desc: (l) => "+40% gems earned per level.", apply: (r, l) => { r.gemMul += 0.4 * l; } },

    { id: "combo", name: "Combo Master", icon: "\u2261", rarity: "rare", max: 3, tags: ["combo"],
      desc: (l) => "Score multiplier from combos +25% per level.", apply: (r, l) => { r.comboMul += 0.25 * l; } },

    { id: "adre", name: "Adrenaline", icon: "\u26a1", rarity: "rare", max: 4, tags: ["speed"],
      desc: (l) => "+20% attack speed per level.", apply: (r, l) => { r.attackSpeedMul += 0.2 * l; } },

    { id: "doubleStrike", name: "Twin Strikes", icon: "\u2aaf", rarity: "rare", max: 3, tags: ["multi"],
      desc: (l) => "Light attacks strike an extra time per level.", apply: (r, l) => { r.lightStrikes = 1 + l; } },

    { id: "groundSlam", name: "Ground Slam", icon: "\u2b63", rarity: "rare", max: 2, tags: ["aoe"],
      desc: (l) => "Landing attacks unleash a shockwave.", apply: (r, l) => { r.groundSlam = true; r.slamSize += 40 * l; } },

    { id: "burn", name: "Crimson Flame", icon: "\u2601", rarity: "rare", max: 3, tags: ["fire"],
      desc: (l) => "Attacks set enemies on fire (burning damage).", apply: (r, l) => { r.burn = true; r.burnLevel = l; } },

    { id: "poison", name: "Venom Coating", icon: "\u2623", rarity: "rare", max: 3, tags: ["poison"],
      desc: (l) => "Attacks poison enemies (stacking damage over time).", apply: (r, l) => { r.poison = true; r.poisonLevel = l; } },

    { id: "frost", name: "Frostbite", icon: "\u2744", rarity: "rare", max: 3, tags: ["frost"],
      desc: (l) => "Attacks chill enemies, slowing them.", apply: (r, l) => { r.frost = true; r.frostLevel = l; } },

    { id: "berserk", name: "Berserker Rage", icon: "\u25b2", rarity: "rare", max: 3, tags: ["dmg", "crit"],
      desc: (l) => "Below 40% HP, deal +50% damage and +20% attack speed per level.", apply: (r, l) => { r.berserk = l; } },

    { id: "aegis", name: "Aegis Shield", icon: "\u2b22", rarity: "rare", max: 3, tags: ["shield", "hp"],
      desc: (l) => "Gain a shield every 20s that absorbs damage.", apply: (r, l) => { r.aegis = l; } },

    { id: "explosive", name: "Explosive Impact", icon: "\u2739", rarity: "epic", max: 3, tags: ["aoe", "fire"],
      desc: (l) => "Enemies explode on death dealing area damage.", apply: (r, l) => { r.explosiveKill = l; } },

    { id: "pierce", name: "Piercing Strike", icon: "\u2b21", rarity: "epic", max: 2, tags: ["pierce", "range"],
      desc: (l) => "Attacks pierce through enemies, hitting more.", apply: (r, l) => { r.pierce = l + 1; } },

    { id: "whirlwind", name: "Whirlwind", icon: "\u2749", rarity: "epic", max: 2, tags: ["aoe"],
      desc: (l) => "Heavy attacks spin and strike all around.", apply: (r, l) => { r.whirlwind = true; r.whirlSize += 30 * l; } },

    { id: "lightning", name: "Storm Caller", icon: "\u26a1", rarity: "epic", max: 3, tags: ["lightning"],
      desc: (l) => "15% chance per hit to call a lightning strike.", apply: (r, l) => { r.lightning = true; r.lightningLevel = l; } },

    { id: "leaping", name: "Leaping Stride", icon: "\u2b08", rarity: "epic", max: 2, tags: ["move"],
      desc: (l) => "Unlock double jump.", apply: (r, l) => { r.doubleJump = true; r.jumpMul += 0.15 * l; } },

    { id: "homing", name: "Homing Bolts", icon: "\u25b6", rarity: "rare", max: 3, tags: ["projectile"],
      desc: (l) => "Projectiles home toward enemies.", apply: (r, l) => { r.homing = true; r.homingLevel = l; } },

    { id: "extrabolt", name: "Arcane Bolt", icon: "\u2726", rarity: "rare", max: 3, tags: ["projectile"],
      desc: (l) => "Special ability fires +2 bolts.", apply: (r, l) => { r.boltCount = 3 + 2 * l; } },

    { id: "ultcd", name: "Ultimate Charge", icon: "\u2733", rarity: "rare", max: 3, tags: ["cd", "ult"],
      desc: (l) => "-25% ultimate cooldown per level.", apply: (r, l) => { r.ultCdMul *= Math.pow(0.75, l); } },

    { id: "lucky", name: "Lucky Charm", icon: "\u2660", rarity: "rare", max: 3, tags: ["crit", "gold"],
      desc: (l) => "+5% crit chance and +25% coins per level.", apply: (r, l) => { r.critChance += 0.05 * l; r.coinMul += 0.25 * l; } },

    { id: "bloodpact", name: "Blood Pact", icon: "\u26d5", rarity: "epic", max: 2, tags: ["heal"],
      desc: (l) => "+12% lifesteal per level, but -12% max health.", apply: (r, l) => { r.lifesteal += 0.12 * l; r.maxHpMul -= 0.12 * l; } },

    { id: "thorns", name: "Thorned Aegis", icon: "\u2733", rarity: "rare", max: 3, tags: ["hp"],
      desc: (l) => "Reflect 40% of melee damage taken per level.", apply: (r, l) => { r.thorns = 0.4 * l; } },

    { id: "clone", name: "Shadow Clone", icon: "\u2463", rarity: "legendary", max: 2, tags: ["clone"],
      desc: (l) => "Summon a shadow clone that mimics your attacks for 40% damage.", apply: (r, l) => { r.cloneCount = l; } },

    { id: "laststand", name: "Last Stand", icon: "\u2691", rarity: "legendary", max: 1, tags: ["hp", "heal"],
      desc: () => "Survive a killing blow once, reviving at 50% health.", apply: (r, l) => { r.revive = l; } },

    { id: "storm", name: "Thunder Aura", icon: "\u26a1", rarity: "legendary", max: 1, tags: ["lightning", "aoe"],
      desc: () => "A storm aura surrounds you, striking nearby enemies.", apply: (r, l) => { r.thunderAura = true; } },
  ];

  const BY_ID = {};
  UPGRADES.forEach((u) => { BY_ID[u.id] = u; });

  /* ---------------- synergies ---------------- */
  const SYNERGIES = [
    { id: "syn_fire_dash", name: "Flaming Dash", icon: "\u26a0",
      requires: ["burn", "dash"],
      desc: "Your dash leaves a trail of fire that burns enemies.",
      apply: (r) => { r.synFlamingDash = true; } },
    { id: "syn_light_clone", name: "Lightning Clones", icon: "\u26a1",
      requires: ["lightning", "clone"],
      desc: "Your shadow clones strike with lightning.",
      apply: (r) => { r.synLightningClone = true; } },
    { id: "syn_crit_rage", name: "Critical Rage", icon: "\u26a0",
      requires: ["eagle", "berserk"],
      desc: "Below 40% HP your critical chance is doubled.",
      apply: (r) => { r.synCritRage = true; } },
    { id: "syn_pierce_exp", name: "Chain Detonations", icon: "\u2739",
      requires: ["pierce", "explosive"],
      desc: "Explosions chain to nearby enemies.",
      apply: (r) => { r.synChain = true; } },
    { id: "syn_ls_burn", name: "Soul Burn", icon: "\u2764",
      requires: ["lifesteal", "burn"],
      desc: "Burning damage heals you.",
      apply: (r) => { r.synSoulBurn = true; } },
    { id: "syn_frost_light", name: "Superconduct", icon: "\u26a1",
      requires: ["frost", "lightning"],
      desc: "Chilled enemies take double lightning damage.",
      apply: (r) => { r.synSuperconduct = true; } },
    { id: "syn_quick_ds", name: "Blade Storm", icon: "\u2749",
      requires: ["quick", "doubleStrike"],
      desc: "+30% attack speed.",
      apply: (r) => { r.attackSpeedMul += 0.3; } },
    { id: "syn_clone_ds", name: "Phantom Flurry", icon: "\u2463",
      requires: ["clone", "doubleStrike"],
      desc: "Clones attack twice as fast.",
      apply: (r) => { r.synPhantomFlurry = true; } },
    { id: "syn_whirl_iron", name: "Iron Cyclone", icon: "\u25a6",
      requires: ["whirlwind", "iron"],
      desc: "Whirlwind grants +20 armor for 4 seconds.",
      apply: (r) => { r.synIronCyclone = true; } },
    { id: "syn_gold_xp", name: "Prosperity", icon: "\u2756",
      requires: ["gold", "xp"],
      desc: "+30% coins and experience.",
      apply: (r) => { r.coinMul += 0.3; r.xpMul += 0.3; } },
    { id: "syn_leap_slam", name: "Skyfall", icon: "\u2b08",
      requires: ["leaping", "groundSlam"],
      desc: "Double jump creates a damaging shockwave.",
      apply: (r) => { r.synSkyfall = true; } },
    { id: "syn_home_bolt", name: "Seeker Storm", icon: "\u2726",
      requires: ["homing", "extrabolt"],
      desc: "All projectiles gain strong homing.",
      apply: (r) => { r.homing = true; r.homingLevel = Math.max(r.homingLevel || 0, 3); } },
    { id: "syn_ult_quick", name: "Overdrive", icon: "\u2733",
      requires: ["ultcd", "quick"],
      desc: "-40% ultimate cooldown.",
      apply: (r) => { r.ultCdMul *= 0.6; } },
    { id: "syn_thorns_aegis", name: "Retribution", icon: "\u2b22",
      requires: ["thorns", "aegis"],
      desc: "Your shield shatters in a damaging explosion.",
      apply: (r) => { r.synRetribution = true; } },
    { id: "syn_adre_combo", name: "Frenzy", icon: "\u2261",
      requires: ["adre", "combo"],
      desc: "Your combo grants attack speed.",
      apply: (r) => { r.synFrenzy = true; } },
    { id: "syn_blade_pierce", name: "Titan Reach", icon: "\u2696",
      requires: ["bigblade", "pierce"],
      desc: "Attacks hit every enemy in a huge arc.",
      apply: (r) => { r.synTitanReach = true; r.pierce = 99; } },
  ];

  const SYN_BY_ID = {};
  SYNERGIES.forEach((s) => { SYN_BY_ID[s.id] = s; });

  /* ---------------- selection ---------------- */
  function availablePool(run) {
    const owned = run.upgradeLevels;
    return UPGRADES.filter((u) => (owned[u.id] || 0) < u.max);
  }

  function rollRarity() {
    const r = Math.random() * (RARITY_WEIGHTS.common + RARITY_WEIGHTS.rare + RARITY_WEIGHTS.epic + RARITY_WEIGHTS.legendary);
    if (r < RARITY_WEIGHTS.common) return "common";
    if (r < RARITY_WEIGHTS.common + RARITY_WEIGHTS.rare) return "rare";
    if (r < RARITY_WEIGHTS.common + RARITY_WEIGHTS.rare + RARITY_WEIGHTS.epic) return "epic";
    return "legendary";
  }

  function pickThree(run) {
    const pool = availablePool(run);
    const picks = [];
    const used = new Set();
    for (let attempt = 0; attempt < 12 && picks.length < 3; attempt++) {
      const rarity = rollRarity();
      const candidates = pool.filter((u) => !used.has(u.id) && RARITY[u.rarity] === RARITY[rarity]);
      // fall back to any if rarity pool exhausted
      const src = candidates.length ? candidates : pool.filter((u) => !used.has(u.id));
      if (!src.length) break;
      const u = U.choose(src);
      used.add(u.id);
      picks.push(u);
    }
    if (picks.length < 3) {
      for (const u of pool) {
        if (picks.length >= 3) break;
        if (!used.has(u.id)) picks.push(u);
      }
    }
    return picks;
  }

  function applyUpgrade(run, id) {
    const def = BY_ID[id];
    if (!def) return null;
    const lvl = (run.upgradeLevels[id] || 0) + 1;
    run.upgradeLevels[id] = lvl;
    def.apply(run, lvl);
    run.tags.push.apply(run.tags, def.tags);
    const syns = checkSynergies(run);
    return { def, level: lvl, synergies: syns };
  }

  function checkSynergies(run) {
    const activated = [];
    for (const syn of SYNERGIES) {
      if (run.synergiesActive[syn.id]) continue;
      const haveA = (run.upgradeLevels[syn.requires[0]] || 0) > 0;
      const haveB = (run.upgradeLevels[syn.requires[1]] || 0) > 0;
      if (haveA && haveB) {
        run.synergiesActive[syn.id] = true;
        syn.apply(run);
        activated.push(syn);
      }
    }
    return activated;
  }

  SL.Upgrades = {
    UPGRADES, SYNERGIES, BY_ID, SYN_BY_ID, RARITY, RARITY_COLORS, RARITY_WEIGHTS,
    pickThree, applyUpgrade, checkSynergies,
  };

})(window.SL = window.SL || {});

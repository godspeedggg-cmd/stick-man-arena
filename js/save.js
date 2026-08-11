/* ============================================================
 * Stickman: Warrior's Legacy
 * save.js — localStorage persistence for progression, currency,
 *           permanent upgrades, unlocked warriors, equipment,
 *           personal bests, settings, challenges & leaderboard data.
 * ============================================================ */
(function (SL) {
  "use strict";

  const KEY = "stickmanWarriorsLegacySave.v1";

  function defaultSave() {
    return {
      version: 1,
      playerName: "Hero",
      coins: 0,
      gems: 0,
      xp: 0,
      selectedWarrior: "warrior",
      unlockedWarriors: ["warrior"],
      equipment: [],          // owned relic ids
      equippedRelics: [],     // equipped relic ids (max 3)
      permUpgrades: {},       // id -> level
      personalBest: { score: 0, distance: 0 },
      stats: {
        totalKills: 0, totalBosses: 0, totalRuns: 0, bestCombo: 0, totalTime: 0,
      },
      settings: {
        sfxVol: 0.85, musicVol: 0.4, musicOn: true, soundOn: true,
        screenShake: true, damageNumbers: true, reduceEffects: false, quality: "auto",
      },
      achievements: {},       // id -> unlockedAt
      challengeProgress: {},  // challenge id -> {value, claimed}
      leaderboardLocal: {},   // boardKey -> [{name, score, cls, date}]
      weeklyScores: [],       // [{name, score, cls, date}]
      weeklyWeek: null,
      lastLogin: Date.now(),
    };
  }

  let data = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        data = Object.assign(defaultSave(), parsed);
        data.settings = Object.assign(defaultSave().settings, parsed.settings || {});
        data.stats = Object.assign(defaultSave().stats, parsed.stats || {});
        return true;
      }
    } catch (e) { /* corrupted save */ }
    data = defaultSave();
    return false;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) { /* storage full / unavailable */ }
  }

  function resetSave() {
    data = defaultSave();
    save();
  }

  function get() { return data; }

  function addCoins(n) { data.coins += Math.max(0, Math.floor(n)); save(); }
  function addGems(n) { data.gems += Math.max(0, Math.floor(n)); save(); }
  function addXp(n) { data.xp += Math.max(0, Math.floor(n)); save(); }
  function spendCoins(n) { if (data.coins >= n) { data.coins -= n; save(); return true; } return false; }
  function spendGems(n) { if (data.gems >= n) { data.gems -= n; save(); return true; } return false; }

  function unlockWarrior(id) {
    if (data.unlockedWarriors.indexOf(id) === -1) {
      data.unlockedWarriors.push(id);
      save();
      return true;
    }
    return false;
  }

  function buyRelic(id) {
    if (data.equipment.indexOf(id) === -1) {
      data.equipment.push(id);
      save();
      return true;
    }
    return false;
  }

  function setEquipped(relics) {
    data.equippedRelics = relics.slice(0, 3);
    save();
  }

  function getPermLevel(id) { return data.permUpgrades[id] || 0; }
  function setPermLevel(id, lvl) { data.permUpgrades[id] = lvl; save(); }

  function recordRun(r) {
    const s = data.stats;
    s.totalRuns += 1;
    s.totalKills += r.kills || 0;
    s.totalBosses += r.bosses || 0;
    s.bestCombo = Math.max(s.bestCombo, r.maxCombo || 0);
    s.totalTime += r.time || 0;
    if (r.score > data.personalBest.score) data.personalBest.score = Math.floor(r.score);
    if (r.distance > data.personalBest.distance) data.personalBest.distance = Math.floor(r.distance);
    save();
  }

  function getPersonalBest() { return data.personalBest; }

  function setSettings(partial) {
    data.settings = Object.assign(data.settings, partial);
    save();
  }

  SL.Save = {
    load, save, resetSave, get,
    addCoins, addGems, addXp, spendCoins, spendGems,
    unlockWarrior, buyRelic, setEquipped,
    getPermLevel, setPermLevel, recordRun, getPersonalBest, setSettings,
  };

})(window.SL = window.SL || {});

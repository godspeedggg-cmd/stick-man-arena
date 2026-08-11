/* ============================================================
 * Stickman: Warrior's Legacy
 * challenges.js — daily/weekly rotating challenges + weekly
 *                 challenge modifiers for runs.
 * ============================================================ */
(function (SL) {
  "use strict";
  const U = SL.U;

  const CHALLENGE_POOL = [
    { id: "kill500", name: "Slaughterer", desc: "Defeat %1 enemies in one run", type: "kills", target: 500, reward: { coins: 600, gems: 10 } },
    { id: "kill1000", name: "Pest Exterminator", desc: "Defeat %1 enemies in one run", type: "kills", target: 1000, reward: { coins: 1400, gems: 25 } },
    { id: "dist5000", name: "Marathon", desc: "Reach %1 meters in one run", type: "distance", target: 5000, reward: { coins: 900, gems: 15 } },
    { id: "combo50", name: "Unstoppable", desc: "Maintain a %1 combo", type: "combo", target: 50, reward: { coins: 700, gems: 12 } },
    { id: "boss3", name: "Boss Slayer", desc: "Defeat %1 bosses in one run", type: "bosses", target: 3, reward: { coins: 1500, gems: 30 } },
    { id: "lvl15", name: "Ascendant", desc: "Reach level %1 in one run", type: "level", target: 15, reward: { coins: 800, gems: 15 } },
    { id: "elite10", name: "Elite Hunter", desc: "Defeat %1 elite enemies in one run", type: "elites", target: 10, reward: { coins: 900, gems: 18 } },
    { id: "survive300", name: "Survivor", desc: "Survive %1 seconds", type: "time", target: 300, reward: { coins: 1000, gems: 20 } },
    { id: "gruntClass", name: "Class Master", desc: "Finish a run with %1", type: "class", target: "a specific class", reward: { coins: 1200, gems: 25 } },
    { id: "noUpgrade", name: "Purist", desc: "Reach %1 meters without taking an upgrade", type: "noUpgrade", target: 1000, reward: { coins: 1100, gems: 22 } },
  ];

  const WEEKLY_MODIFIERS = [
    { id: "doubleSpawns", name: "Swarm", desc: "Double enemy spawn rate" },
    { id: "noHeal", name: "Shattered Hope", desc: "No healing sources" },
    { id: "bossBuff", name: "Titans", desc: "Bosses have 50% more health" },
    { id: "speedUp", name: "Time Warp", desc: "World moves 25% faster" },
    { id: "lowDamage", name: "Frail", desc: "Player damage reduced 25%" },
    { id: "moreElites", name: "Culling", desc: "Elite enemies appear twice as often" },
    { id: "limitedAir", name: "Heavy Earth", desc: "Jump height reduced 30%" },
  ];

  function daySeed() {
    const now = new Date();
    return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  }

  function pickChallenges(seed, count, usedIds) {
    const rng = U.mulberry32(seed ^ 0x9e3779b9);
    const pool = CHALLENGE_POOL.filter((c) => !usedIds || usedIds.indexOf(c.id) === -1);
    const picks = [];
    const shuffled = pool.slice().sort(() => rng() - 0.5);
    for (let i = 0; i < shuffled.length && picks.length < count; i++) picks.push(shuffled[i]);
    return picks;
  }

  function weeklyModifiers() {
    const rng = U.mulberry32(U.hashCode("week" + new Date().getFullYear() + (Math.floor(Date.now() / 604800000))));
    const shuffled = WEEKLY_MODIFIERS.slice().sort(() => rng() - 0.5);
    return shuffled.slice(0, 3);
  }

  function dailyChallenges() {
    return pickChallenges(daySeed(), 3, null);
  }
  function weeklyChallenges() {
    const week = Math.floor(Date.now() / 604800000);
    return pickChallenges(week * 31, 3, dailyChallenges().map((d) => d.id));
  }

  function claimable(chal, save) {
    const prog = save.challengeProgress[chal.id];
    if (!prog || prog.claimed) return false;
    return progressOf(chal, prog.value) >= 1;
  }
  function progressOf(chal, value) {
    if (chal.type === "class") return value ? 1 : 0;
    if (chal.type === "noUpgrade") return value / chal.target;
    return Math.min(1, value / chal.target);
  }

  function applyWeeklyModifiers(run, zoneMods) {
    for (const m of zoneMods) {
      if (!run._weeklyApplied) run._weeklyApplied = {};
      if (run._weeklyApplied[m.id]) continue;
      run._weeklyApplied[m.id] = true;
      switch (m.id) {
        case "doubleSpawns": run.spawnMul = (run.spawnMul || 1) * 2; break;
        case "noHeal": run.noHeal = true; break;
        case "bossBuff": run.bossHpMul = (run.bossHpMul || 1) * 1.5; break;
        case "speedUp": run.speedMul = (run.speedMul || 1) * 1.25; break;
        case "lowDamage": run.dmgMul *= 0.75; break;
        case "moreElites": run.eliteMul = (run.eliteMul || 1) * 2; break;
        case "limitedAir": run.jumpMul *= 0.7; break;
      }
    }
  }

  SL.Challenges = {
    CHALLENGE_POOL, WEEKLY_MODIFIERS, dailyChallenges, weeklyChallenges,
    weeklyModifiers, claimable, progressOf, applyWeeklyModifiers,
  };

})(window.SL = window.SL || {});

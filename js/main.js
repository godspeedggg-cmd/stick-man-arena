/* ============================================================
 * Stickman: Warrior's Legacy
 * main.js — bootstrap: load save, init game + UI, boot sequence
 * ============================================================ */
(function (SL) {
  "use strict";

  function boot() {
    SL.Save.load();
    SL.Game.init();
    SL.UI.init();
    SL.Game._applySettings();

    // audio must start after a user gesture on some browsers
    const resumeAudio = () => {
      SL.Audio.resume();
      if (!SL.Audio.musicStarted) {
        SL.Audio.musicStarted = true;
        if (SL.Save.get().settings.musicOn) SL.Audio.startMusic();
      }
    };
    document.addEventListener("pointerdown", resumeAudio, { once: true });
    document.addEventListener("keydown", resumeAudio, { once: true });

    setTimeout(() => {
      const bootEl = document.getElementById("screen-boot");
      if (bootEl) bootEl.classList.add("hidden");
      SL.UI.show("main");
      SL.UI.refreshResourceBar();
      SL.UI.refreshWeeklyBtn();
    }, 700);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})(window.SL = window.SL || {});

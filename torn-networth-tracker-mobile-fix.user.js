// ==UserScript==
// @name         Torn NetWorth Tracker - Mobile UI Fix
// @namespace    https://github.com/ehggzz/Networth-Tracker
// @version      0.1.0
// @description  Temporary compact mobile layout for Torn NetWorth Tracker.
// @author       ehggzz
// @match        https://www.torn.com/*
// @run-at       document-end
// ==/UserScript==

(() => {
  "use strict";

  const ROOT_ID = "networth-tracker-root";
  const STYLE_ID = "networth-tracker-mobile-fix";

  function apply() {
    if (!document.getElementById(ROOT_ID)) return false;
    if (document.getElementById(STYLE_ID)) return true;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        width: min(310px, calc(100vw - 32px)) !important;
        max-width: calc(100vw - 32px) !important;
        max-height: 55vh !important;
        right: 10px !important;
        bottom: 66px !important;
        border-radius: 10px !important;
        font-size: 13px !important;
      }
      #${ROOT_ID} .nwt-header {
        padding: 9px 11px !important;
      }
      #${ROOT_ID} .nwt-title {
        font-size: 14px !important;
      }
      #${ROOT_ID} .nwt-body {
        padding: 9px !important;
      }
      #${ROOT_ID} .nwt-card {
        padding: 9px !important;
        margin-bottom: 7px !important;
        border-radius: 8px !important;
      }
      #${ROOT_ID} .nwt-big {
        font-size: 21px !important;
      }
      #${ROOT_ID} .nwt-row {
        padding: 4px 0 !important;
      }
      #${ROOT_ID} .nwt-label {
        font-size: 10px !important;
      }
      #${ROOT_ID} .nwt-status {
        font-size: 11px !important;
      }
    `;
    document.head.appendChild(style);
    return true;
  }

  if (apply()) return;

  const timer = setInterval(() => {
    if (apply()) clearInterval(timer);
  }, 250);

  setTimeout(() => clearInterval(timer), 15000);
})();

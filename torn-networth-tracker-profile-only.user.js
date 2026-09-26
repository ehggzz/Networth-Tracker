// ==UserScript==
// @name         Torn NetWorth Tracker - Profile Only
// @namespace    https://github.com/ehggzz/Networth-Tracker
// @version      0.1.0
// @description  Keeps the NetWorth Tracker visible only on your own Torn profile page.
// @author       ehggzz
// @match        https://www.torn.com/*
// @run-at       document-end
// ==/UserScript==

(async () => {
  "use strict";

  const API_KEY = "###PDA-APIKEY###";
  const ROOT_ID = "networth-tracker-root";

  function isProfilePage() {
    const path = location.pathname.toLowerCase();
    return path.endsWith("/profiles.php") || path.endsWith("/profile.php");
  }

  function viewedId() {
    const q = new URLSearchParams(location.search);
    return q.get("XID") || q.get("xid") || q.get("id");
  }

  async function getOwnId() {
    if (!API_KEY || API_KEY === "###PDA-APIKEY###") return null;
    try {
      const url = `https://api.torn.com/user/?selections=profile&key=${encodeURIComponent(API_KEY)}&comment=NetWorthTrackerProfileOnly`;
      const headers = { Accept: "application/json", Authorization: `ApiKey ${API_KEY}` };
      const req = typeof PDA_httpGet === "function" ? PDA_httpGet(url, headers) : fetch(url, { headers });
      const result = await req;
      const text = result?.responseText ?? result;
      const json = typeof text === "string" ? JSON.parse(text) : await result.json();
      const p = json?.profile || json || {};
      return p.player_id ?? p.playerId ?? p.id ?? null;
    } catch (_) { return null; }
  }

  const ownId = await getOwnId();

  function sync() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const ownProfile = isProfilePage() && ownId != null && viewedId() != null && String(ownId) === String(viewedId());
    if (!ownProfile) {
      root.remove();
      return;
    }

    const target = document.querySelector("#profileroot") || document.querySelector(".profile-container");
    if (target && root.parentElement !== target) target.appendChild(root);
  }

  sync();
  setInterval(sync, 750);
})();

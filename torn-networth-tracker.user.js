// ==UserScript==
// @name         Torn NetWorth Tracker
// @namespace    https://github.com/ehggzz/Networth-Tracker
// @version      0.1.0
// @description  Track current Torn net worth, cash, and local net-worth history.
// @author       ehggzz
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/ehggzz/Networth-Tracker/main/torn-networth-tracker.user.js
// @downloadURL  https://raw.githubusercontent.com/ehggzz/Networth-Tracker/main/torn-networth-tracker.user.js
// @match        https://www.torn.com/*
// @run-at       document-end
// ==/UserScript==

(async () => {
  "use strict";

  const STORAGE_KEY = "networth_tracker_data_v1";
  const API_KEY_STORAGE_KEY = "networth_tracker_api_key";
  const ROOT_ID = "networth-tracker-root";
  const PDA_API_KEY = "###PDA-APIKEY###";
  const POLL_MS = 5 * 60 * 1000;
  const SNAPSHOT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

  let runtimeApiKey = PDA_API_KEY;
  let pollTimer = null;
  let refreshInProgress = false;

  const defaultData = {
    current: null,
    snapshots: [],
    apiStatus: "Not checked",
    apiError: null,
    lastChecked: null
  };

  function effectiveKey() {
    return runtimeApiKey && runtimeApiKey !== PDA_API_KEY ? String(runtimeApiKey).trim() : "";
  }

  async function getStoredApiKey() {
    try {
      if (typeof PDA_storage !== "undefined") {
        const value = String((await PDA_storage.get(API_KEY_STORAGE_KEY, "")) || "").trim();
        if (value) return value;
      }
    } catch (e) {
      console.warn("[NetWorth Tracker] Could not read PDA API key storage:", e);
    }

    try {
      return String(localStorage.getItem(API_KEY_STORAGE_KEY) || "").trim();
    } catch (e) {
      console.warn("[NetWorth Tracker] Could not read browser API key storage:", e);
      return "";
    }
  }

  async function saveStoredApiKey(key) {
    const value = String(key || "").trim();

    try {
      if (typeof PDA_storage !== "undefined") {
        await PDA_storage.set(API_KEY_STORAGE_KEY, value);
      }
    } catch (e) {
      console.warn("[NetWorth Tracker] Could not save PDA API key storage:", e);
    }

    try {
      localStorage.setItem(API_KEY_STORAGE_KEY, value);
    } catch (e) {
      console.warn("[NetWorth Tracker] Could not save browser API key storage:", e);
    }
  }

  async function loadData() {
    try {
      if (typeof PDA_storage !== "undefined") {
        const stored = await PDA_storage.get(STORAGE_KEY, defaultData);
        return normaliseData(stored);
      }
    } catch (e) {
      console.warn("[NetWorth Tracker] PDA storage unavailable:", e);
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return normaliseData(raw ? JSON.parse(raw) : defaultData);
    } catch (e) {
      console.warn("[NetWorth Tracker] Could not load local data:", e);
      return normaliseData(defaultData);
    }
  }

  async function saveData(data) {
    try {
      if (typeof PDA_storage !== "undefined") {
        await PDA_storage.set(STORAGE_KEY, data);
        return;
      }
    } catch (e) {
      console.warn("[NetWorth Tracker] PDA storage write failed:", e);
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("[NetWorth Tracker] Browser storage write failed:", e);
    }
  }

  function normaliseData(value) {
    const data = { ...defaultData, ...(value && typeof value === "object" ? value : {}) };
    data.snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];
    data.snapshots = data.snapshots
      .filter(x => x && Number.isFinite(Number(x.timestamp)))
      .map(x => ({
        timestamp: Number(x.timestamp),
        cash: Number.isFinite(Number(x.cash)) ? Number(x.cash) : null,
        networth: Number.isFinite(Number(x.networth)) ? Number(x.networth) : null,
        components: x.components && typeof x.components === "object" ? x.components : {}
      }));
    return data;
  }

  function pruneSnapshots(data) {
    const cutoff = Date.now() - SNAPSHOT_RETENTION_MS;
    data.snapshots = data.snapshots.filter(x => x.timestamp >= cutoff);
  }

  function apiUrl(selections) {
    const params = new URLSearchParams({
      selections,
      key: effectiveKey(),
      comment: "TornNetWorthTracker"
    });
    return `https://api.torn.com/user/?${params.toString()}`;
  }

  async function requestJson(url) {
    try {
      const key = effectiveKey();
      if (!key) return { error: { code: "LOCAL", error: "No API key" } };

      const headers = {
        Accept: "application/json",
        Authorization: `ApiKey ${key}`
      };

      const request = typeof PDA_httpGet === "function"
        ? PDA_httpGet(url, headers)
        : fetch(url, { headers });

      const result = await Promise.race([
        request,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Torn API request timed out after 15 seconds")), 15000)
        )
      ]);

      const text = result?.responseText ?? result;
      return typeof text === "string" ? JSON.parse(text) : await result.json();
    } catch (e) {
      console.warn("[NetWorth Tracker] API request failed:", e);
      return { error: { code: "LOCAL", error: e?.message || "Request failed" } };
    }
  }

  function extractNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function extractCash(profile) {
    const candidates = [
      profile?.money,
      profile?.cash,
      profile?.money_on_hand,
      profile?.moneyOnHand
    ];

    for (const candidate of candidates) {
      const n = extractNumber(candidate);
      if (n !== null) return n;
    }

    return null;
  }

  function extractNetworth(networthResponse) {
    const nw = networthResponse?.networth;
    if (nw === null || nw === undefined) return null;
    if (typeof nw === "number" || typeof nw === "string") return extractNumber(nw);

    const totalCandidates = [nw?.total, nw?.total_networth, nw?.networth];
    for (const candidate of totalCandidates) {
      const n = extractNumber(candidate);
      if (n !== null) return n;
    }

    return null;
  }

  function extractComponents(networthResponse) {
    const nw = networthResponse?.networth;
    if (!nw || typeof nw !== "object") return {};

    const result = {};
    for (const [key, value] of Object.entries(nw)) {
      if (["total", "total_networth", "networth"].includes(key)) continue;
      const n = extractNumber(value);
      if (n !== null) result[key] = n;
    }
    return result;
  }

  function buildSnapshot(profileResponse, networthResponse) {
    const cash = extractCash(profileResponse?.profile || profileResponse);
    const networth = extractNetworth(networthResponse);
    const components = extractComponents(networthResponse);

    return {
      timestamp: Date.now(),
      cash,
      networth,
      components
    };
  }

  function getLatestPreviousSnapshot(data) {
    return data.snapshots.length ? data.snapshots[data.snapshots.length - 1] : null;
  }

  function getStartOfTodayTimestamp() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.getTime();
  }

  function getTodayBaseline(data) {
    const todayStart = getStartOfTodayTimestamp();
    const todaySnapshots = data.snapshots.filter(x => x.timestamp >= todayStart);
    return todaySnapshots.length ? todaySnapshots[0] : null;
  }

  function calculateChange(current, previous) {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
    return current - previous;
  }

  function formatMoney(value) {
    if (!Number.isFinite(Number(value))) return "—";
    return `$${Math.round(Number(value)).toLocaleString("en-GB")}`;
  }

  function formatSignedMoney(value) {
    if (!Number.isFinite(Number(value))) return "—";
    const n = Math.round(Number(value));
    const sign = n > 0 ? "+" : n < 0 ? "−" : "";
    return `${sign}$${Math.abs(n).toLocaleString("en-GB")}`;
  }

  function formatShortMoney(value) {
    if (!Number.isFinite(Number(value))) return "—";
    const n = Number(value);
    const abs = Math.abs(n);
    const sign = n < 0 ? "−" : "";
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}t`;
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}b`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}m`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}k`;
    return `${sign}$${Math.round(abs).toLocaleString("en-GB")}`;
  }

  function formatDate(value) {
    if (!value) return "Never";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Unknown";
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function injectStyles() {
    if (document.getElementById(`${ROOT_ID}-styles`)) return;

    const style = document.createElement("style");
    style.id = `${ROOT_ID}-styles`;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        right: 12px;
        bottom: 72px;
        z-index: 999999;
        width: min(360px, calc(100vw - 24px));
        max-height: calc(100vh - 100px);
        overflow: auto;
        color: #f4f4f4;
        background: #151515;
        border: 1px solid #333;
        border-radius: 12px;
        box-shadow: 0 10px 35px rgba(0,0,0,.55);
        font-family: Arial, sans-serif;
      }
      #${ROOT_ID} * { box-sizing: border-box; }
      #${ROOT_ID} .nwt-header {
        display:flex; align-items:center; justify-content:space-between;
        padding:12px 14px; border-bottom:1px solid #2d2d2d;
        position:sticky; top:0; background:#151515; z-index:2;
      }
      #${ROOT_ID} .nwt-title { font-size:16px; font-weight:700; }
      #${ROOT_ID} .nwt-close { border:0; background:transparent; color:#aaa; font-size:20px; cursor:pointer; }
      #${ROOT_ID} .nwt-body { padding:14px; }
      #${ROOT_ID} .nwt-card {
        background:#1d1d1d; border:1px solid #303030; border-radius:10px;
        padding:12px; margin-bottom:10px;
      }
      #${ROOT_ID} .nwt-label { color:#9c9c9c; font-size:11px; text-transform:uppercase; letter-spacing:.08em; }
      #${ROOT_ID} .nwt-big { font-size:25px; font-weight:800; margin-top:4px; }
      #${ROOT_ID} .nwt-row { display:flex; justify-content:space-between; gap:12px; padding:6px 0; }
      #${ROOT_ID} .nwt-row + .nwt-row { border-top:1px solid #292929; }
      #${ROOT_ID} .nwt-positive { color:#72df91; }
      #${ROOT_ID} .nwt-negative { color:#ff7777; }
      #${ROOT_ID} .nwt-muted { color:#888; }
      #${ROOT_ID} .nwt-actions { display:flex; gap:8px; margin-top:10px; }
      #${ROOT_ID} button.nwt-btn {
        flex:1; border:1px solid #444; border-radius:8px; padding:9px 10px;
        background:#262626; color:#fff; cursor:pointer;
      }
      #${ROOT_ID} button.nwt-btn:active { transform:translateY(1px); }
      #${ROOT_ID} .nwt-input {
        width:100%; margin-top:8px; padding:9px 10px; border-radius:8px;
        border:1px solid #444; background:#101010; color:#fff;
      }
      #${ROOT_ID} details summary { cursor:pointer; color:#ddd; font-weight:700; }
      #${ROOT_ID} .nwt-status { font-size:12px; line-height:1.5; }
    `;
    document.head.appendChild(style);
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement("section");
    root.id = ROOT_ID;
    document.body.appendChild(root);
    return root;
  }

  function render(data) {
    const root = ensureRoot();
    const current = data.current;
    const previous = getLatestPreviousSnapshot(data);
    const todayBaseline = getTodayBaseline(data);

    const networthChange = calculateChange(current?.networth, previous?.networth);
    const cashChange = calculateChange(current?.cash, previous?.cash);
    const todayNetworthChange = calculateChange(current?.networth, todayBaseline?.networth);
    const todayCashChange = calculateChange(current?.cash, todayBaseline?.cash);

    const networthClass = Number(todayNetworthChange) > 0 ? "nwt-positive" : Number(todayNetworthChange) < 0 ? "nwt-negative" : "";
    const cashClass = Number(todayCashChange) > 0 ? "nwt-positive" : Number(todayCashChange) < 0 ? "nwt-negative" : "";

    const apiError = data.apiError
      ? `${escapeHtml(data.apiError.code ?? "Error")}: ${escapeHtml(data.apiError.error ?? "Unknown error")}`
      : "";

    const componentEntries = Object.entries(current?.components || {})
      .sort((a, b) => b[1] - a[1]);

    root.innerHTML = `
      <div class="nwt-header">
        <div class="nwt-title">💰 NetWorth Tracker</div>
        <button class="nwt-close" id="nwt-close" aria-label="Close">×</button>
      </div>
      <div class="nwt-body">
        <div class="nwt-card">
          <div class="nwt-label">Current net worth</div>
          <div class="nwt-big">${formatMoney(current?.networth)}</div>
          <div class="${networthClass}" style="margin-top:4px;font-size:13px;">
            Today: ${formatSignedMoney(todayNetworthChange)}
          </div>
          <div class="nwt-muted" style="font-size:11px;margin-top:5px;">
            Torn value checked: ${formatDate(data.lastChecked)}
          </div>
        </div>

        <div class="nwt-card">
          <div class="nwt-label">Live cash</div>
          <div class="nwt-big">${formatMoney(current?.cash)}</div>
          <div class="${cashClass}" style="margin-top:4px;font-size:13px;">
            Today: ${formatSignedMoney(todayCashChange)}
          </div>
        </div>

        <div class="nwt-card">
          <div class="nwt-label">Snapshot change</div>
          <div class="nwt-row"><span>Net worth</span><strong>${formatSignedMoney(networthChange)}</strong></div>
          <div class="nwt-row"><span>Cash</span><strong>${formatSignedMoney(cashChange)}</strong></div>
          <div class="nwt-muted" style="font-size:11px;margin-top:6px;">
            This is change since the previous local snapshot, not a transaction ledger.
          </div>
        </div>

        <div class="nwt-card">
          <details>
            <summary>📊 Net-worth components</summary>
            <div style="margin-top:8px;">
              ${componentEntries.length
                ? componentEntries.map(([key, value]) => `
                    <div class="nwt-row">
                      <span>${escapeHtml(key)}</span>
                      <strong>${formatShortMoney(value)}</strong>
                    </div>`).join("")
                : `<div class="nwt-muted" style="margin-top:8px;">No component data returned yet.</div>`}
            </div>
          </details>
        </div>

        <div class="nwt-card">
          <details>
            <summary>⚙️ API / setup</summary>
            <input class="nwt-input" id="nwt-api-key" type="password" placeholder="Enter Torn API key" autocomplete="off" />
            <div class="nwt-actions">
              <button class="nwt-btn" id="nwt-save-key">Save & Test</button>
              <button class="nwt-btn" id="nwt-refresh">Refresh</button>
            </div>
            <div class="nwt-status" style="margin-top:9px;">
              Status: <strong>${escapeHtml(data.apiStatus)}</strong><br>
              ${apiError ? `<span class="nwt-negative">${apiError}</span><br>` : ""}
              Snapshots stored: ${data.snapshots.length}
            </div>
          </details>
        </div>
      </div>
    `;

    root.querySelector("#nwt-close")?.addEventListener("click", () => {
      root.remove();
    });

    root.querySelector("#nwt-save-key")?.addEventListener("click", async () => {
      const input = root.querySelector("#nwt-api-key");
      const value = String(input?.value || "").trim();
      if (!value) return;
      runtimeApiKey = value;
      await saveStoredApiKey(value);
      await refresh(true);
    });

    root.querySelector("#nwt-refresh")?.addEventListener("click", async () => {
      await refresh(true);
    });
  }

  async function refresh(forceRender = false) {
    if (refreshInProgress) return;
    if (!effectiveKey()) {
      const data = await loadData();
      data.apiStatus = "API key needed";
      data.apiError = { code: "LOCAL", error: "No API key saved" };
      await saveData(data);
      if (forceRender) render(data);
      return;
    }

    refreshInProgress = true;
    const data = await loadData();
    data.apiStatus = "Checking…";
    data.apiError = null;
    if (forceRender) render(data);

    try {
      // Keep the first version deliberately small: one user request for the
      // live profile/cash and one request for Torn's networth breakdown.
      const profileResponse = await requestJson(apiUrl("profile"));
      if (profileResponse?.error) {
        data.apiStatus = "Error";
        data.apiError = profileResponse.error;
        await saveData(data);
        render(data);
        return;
      }

      const networthResponse = await requestJson(apiUrl("networth"));
      if (networthResponse?.error) {
        data.apiStatus = "Profile OK / Networth error";
        data.apiError = networthResponse.error;
        const partial = buildSnapshot(profileResponse, null);
        if (partial.cash !== null) {
          data.current = partial;
          data.snapshots.push(partial);
          pruneSnapshots(data);
        }
        data.lastChecked = Date.now();
        await saveData(data);
        render(data);
        return;
      }

      const snapshot = buildSnapshot(profileResponse, networthResponse);
      const hasUsefulValue = snapshot.cash !== null || snapshot.networth !== null;

      if (hasUsefulValue) {
        data.current = snapshot;
        data.snapshots.push(snapshot);
        pruneSnapshots(data);
      }

      data.apiStatus = "Connected";
      data.apiError = null;
      data.lastChecked = Date.now();
      await saveData(data);
      render(data);
    } finally {
      refreshInProgress = false;
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => refresh(false), POLL_MS);
  }

  async function init() {
    runtimeApiKey = await getStoredApiKey();
    injectStyles();

    const data = await loadData();
    render(data);

    if (effectiveKey()) {
      await refresh(true);
    }

    startPolling();
  }

  init().catch(error => {
    console.error("[NetWorth Tracker] Startup failed:", error);
  });
})();

// ==UserScript==
// @name         Torn NetWorth Tracker
// @namespace    https://github.com/ehggzz/Networth-Tracker
// @version      0.2.0
// @description  Track current Torn net worth, cash, and local net-worth history.
// @author       ehggzz
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/ehggzz/Networth-Tracker/main/torn-networth-tracker-v0.2.0.user.js
// @downloadURL  https://raw.githubusercontent.com/ehggzz/Networth-Tracker/main/torn-networth-tracker-v0.2.0.user.js
// @match        https://www.torn.com/*
// @run-at       document-end
// ==/UserScript==

(async () => {
  "use strict";

  const STORAGE_KEY = "networth_tracker_data_v1";
  const API_KEY_STORAGE_KEY = "networth_tracker_api_key";
  const UI_STORAGE_KEY = "networth_tracker_ui_v1";
  const ROOT_ID = "networth-tracker-root";
  const PDA_API_KEY = "###PDA-APIKEY###";
  const POLL_MS = 5 * 60 * 1000;
  const SNAPSHOT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

  let runtimeApiKey = PDA_API_KEY;
  let pollTimer = null;
  let refreshInProgress = false;
  let uiState = { collapsed: false, x: null, y: null };

  const defaultData = { current: null, snapshots: [], apiStatus: "Not checked", apiError: null, lastChecked: null };

  const storageGet = async (key, fallback) => {
    try {
      if (typeof PDA_storage !== "undefined") return await PDA_storage.get(key, fallback);
    } catch (e) {}
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch (e) { return fallback; }
  };

  const storageSet = async (key, value) => {
    try {
      if (typeof PDA_storage !== "undefined") { await PDA_storage.set(key, value); return; }
    } catch (e) {}
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  };

  function effectiveKey() {
    return runtimeApiKey && runtimeApiKey !== PDA_API_KEY ? String(runtimeApiKey).trim() : "";
  }

  async function getStoredApiKey() {
    try {
      if (typeof PDA_storage !== "undefined") {
        const v = String((await PDA_storage.get(API_KEY_STORAGE_KEY, "")) || "").trim();
        if (v) return v;
      }
    } catch (e) {}
    try { return String(localStorage.getItem(API_KEY_STORAGE_KEY) || "").trim(); } catch (e) { return ""; }
  }

  async function saveApiKey(key) {
    const value = String(key || "").trim();
    try { if (typeof PDA_storage !== "undefined") await PDA_storage.set(API_KEY_STORAGE_KEY, value); } catch (e) {}
    try { localStorage.setItem(API_KEY_STORAGE_KEY, value); } catch (e) {}
  }

  function normaliseData(value) {
    const d = { ...defaultData, ...(value && typeof value === "object" ? value : {}) };
    d.snapshots = Array.isArray(d.snapshots) ? d.snapshots.filter(x => x && Number.isFinite(Number(x.timestamp))).map(x => ({
      timestamp: Number(x.timestamp), cash: Number.isFinite(Number(x.cash)) ? Number(x.cash) : null,
      networth: Number.isFinite(Number(x.networth)) ? Number(x.networth) : null,
      components: x.components && typeof x.components === "object" ? x.components : {}
    })) : [];
    return d;
  }

  async function loadData() { return normaliseData(await storageGet(STORAGE_KEY, defaultData)); }
  async function saveData(data) { await storageSet(STORAGE_KEY, data); }

  async function loadUiState() {
    const saved = await storageGet(UI_STORAGE_KEY, uiState);
    if (saved && typeof saved === "object") uiState = { ...uiState, ...saved };
  }
  async function saveUiState() { await storageSet(UI_STORAGE_KEY, uiState); }

  function apiUrl(selections) {
    const p = new URLSearchParams({ selections, key: effectiveKey(), comment: "TornNetWorthTracker" });
    return `https://api.torn.com/user/?${p.toString()}`;
  }

  async function requestJson(url) {
    try {
      if (!effectiveKey()) return { error: { code: "LOCAL", error: "No API key" } };
      const headers = { Accept: "application/json", Authorization: `ApiKey ${effectiveKey()}` };
      const req = typeof PDA_httpGet === "function" ? PDA_httpGet(url, headers) : fetch(url, { headers });
      const result = await Promise.race([req, new Promise((_, reject) => setTimeout(() => reject(new Error("Torn API request timed out after 15 seconds")), 15000))]);
      const text = result?.responseText ?? result;
      return typeof text === "string" ? JSON.parse(text) : await result.json();
    } catch (e) { return { error: { code: "LOCAL", error: e?.message || "Request failed" } }; }
  }

  const num = v => Number.isFinite(Number(v)) ? Number(v) : null;
  function extractCash(profile) {
    const p = profile?.profile || profile || {};
    for (const v of [p.money, p.cash, p.money_on_hand, p.moneyOnHand]) { const n = num(v); if (n !== null) return n; }
    return null;
  }
  function extractNetworth(r) {
    const n = r?.networth;
    if (n == null) return null;
    if (typeof n !== "object") return num(n);
    for (const v of [n.total, n.total_networth, n.networth]) { const x = num(v); if (x !== null) return x; }
    return null;
  }
  function extractComponents(r) {
    const n = r?.networth;
    if (!n || typeof n !== "object") return {};
    const out = {};
    for (const [k, v] of Object.entries(n)) if (!["total", "total_networth", "networth"].includes(k)) { const x = num(v); if (x !== null) out[k] = x; }
    return out;
  }

  function prune(data) {
    const cutoff = Date.now() - SNAPSHOT_RETENTION_MS;
    data.snapshots = data.snapshots.filter(s => s.timestamp >= cutoff);
  }

  async function refresh() {
    if (refreshInProgress || !effectiveKey()) return;
    refreshInProgress = true;
    try {
      const [profile, nw] = await Promise.all([requestJson(apiUrl("profile")), requestJson(apiUrl("networth"))]);
      if (profile?.error) throw new Error(`${profile.error.code}: ${profile.error.error}`);
      if (nw?.error) throw new Error(`${nw.error.code}: ${nw.error.error}`);
      const snapshot = { timestamp: Date.now(), cash: extractCash(profile), networth: extractNetworth(nw), components: extractComponents(nw) };
      const data = await loadData();
      data.current = snapshot;
      data.snapshots.push(snapshot);
      prune(data);
      data.apiStatus = "Connected";
      data.apiError = null;
      data.lastChecked = Date.now();
      await saveData(data);
      render(data);
    } catch (e) {
      const data = await loadData();
      data.apiStatus = "Error";
      data.apiError = { code: "API", error: e?.message || "Unknown error" };
      data.lastChecked = Date.now();
      await saveData(data);
      render(data);
    } finally { refreshInProgress = false; }
  }

  const money = v => Number.isFinite(Number(v)) ? `$${Math.round(Number(v)).toLocaleString("en-GB")}` : "—";
  const signed = v => { if (!Number.isFinite(Number(v))) return "—"; const n = Math.round(Number(v)); return `${n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-GB")}`; };
  const date = v => v ? new Date(v).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Never";
  const esc = v => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function injectStyles() {
    if (document.getElementById(`${ROOT_ID}-styles`)) return;
    const s = document.createElement("style"); s.id = `${ROOT_ID}-styles`;
    s.textContent = `
      #${ROOT_ID}{position:fixed;right:12px;bottom:72px;z-index:999999;width:min(360px,calc(100vw - 24px));max-height:calc(100vh - 100px);overflow:auto;color:#f4f4f4;background:#151515;border:1px solid #333;border-radius:12px;box-shadow:0 10px 35px rgba(0,0,0,.55);font-family:Arial,sans-serif}
      #${ROOT_ID} *{box-sizing:border-box}#${ROOT_ID}.nwt-collapsed{width:auto;max-height:none;overflow:visible;background:transparent;border:0;box-shadow:none}
      #${ROOT_ID} .nwt-pill{display:flex;align-items:center;gap:8px;border:1px solid #444;border-radius:999px;padding:9px 12px;background:#171717;color:#fff;box-shadow:0 5px 18px rgba(0,0,0,.45);font-weight:700;cursor:move;user-select:none}
      #${ROOT_ID} .nwt-pill button{border:0;background:transparent;color:#aaa;font-size:18px;cursor:pointer;padding:0}
      #${ROOT_ID} .nwt-header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #2d2d2d;position:sticky;top:0;background:#151515;z-index:2}
      #${ROOT_ID} .nwt-title{font-size:16px;font-weight:700}#${ROOT_ID} button{font:inherit}
      #${ROOT_ID} .nwt-headbuttons{display:flex;gap:3px}.nwt-headbuttons button{border:0;background:transparent;color:#aaa;font-size:19px;cursor:pointer;padding:3px 6px}
      #${ROOT_ID} .nwt-body{padding:14px}.nwt-card{background:#1d1d1d;border:1px solid #303030;border-radius:10px;padding:12px;margin-bottom:10px}
      #${ROOT_ID} .nwt-label{color:#9c9c9c;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.nwt-big{font-size:25px;font-weight:800;margin-top:4px}
      #${ROOT_ID} .nwt-row{display:flex;justify-content:space-between;gap:12px;padding:6px 0}.nwt-row+.nwt-row{border-top:1px solid #292929}
      #${ROOT_ID} .nwt-positive{color:#72df91}.nwt-negative{color:#ff7777}.nwt-muted{color:#888}.nwt-actions{display:flex;gap:8px;margin-top:10px}
      #${ROOT_ID} .nwt-btn{flex:1;border:1px solid #444;border-radius:8px;padding:9px 10px;background:#262626;color:#fff;cursor:pointer}
      #${ROOT_ID} .nwt-input{width:100%;margin-top:8px;padding:9px 10px;border-radius:8px;border:1px solid #444;background:#101010;color:#fff}
      #${ROOT_ID} details summary{cursor:pointer;color:#ddd;font-weight:700}.nwt-status{font-size:12px;line-height:1.5}
    `;
    document.head.appendChild(s);
  }

  function ensureRoot() { let r=document.getElementById(ROOT_ID); if(!r){r=document.createElement("section");r.id=ROOT_ID;document.body.appendChild(r);} return r; }

  function todayStart(){ const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); }
  function baseline(data){ const a=data.snapshots.filter(x=>x.timestamp>=todayStart()); return a[0]||null; }
  function diff(a,b){ return Number.isFinite(Number(a))&&Number.isFinite(Number(b)) ? Number(a)-Number(b) : null; }

  function render(data) {
    const root=ensureRoot();
    root.style.right=""; root.style.bottom="";
    if(uiState.x!==null && uiState.y!==null){root.style.left=`${uiState.x}px`;root.style.top=`${uiState.y}px`;root.style.right="auto";root.style.bottom="auto";}else{root.style.right="12px";root.style.bottom="72px";}
    if(uiState.collapsed){
      root.className="nwt-collapsed";
      root.innerHTML=`<div class="nwt-pill" id="nwt-drag"><span>💰 NetWorth Tracker</span><button id="nwt-expand" aria-label="Expand">＋</button></div>`;
      root.querySelector("#nwt-expand").onclick=async e=>{e.stopPropagation();uiState.collapsed=false;await saveUiState();render(data);};
      makeDraggable(root.querySelector("#nwt-drag"),root); return;
    }
    root.className="";
    const cur=data.current||{}; const base=baseline(data); const nwChange=diff(cur.networth,base?.networth); const cashChange=diff(cur.cash,base?.cash);
    const comps=Object.entries(cur.components||{}).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="nwt-row"><span>${esc(k)}</span><strong>${money(v)}</strong></div>`).join("") || `<div class="nwt-muted">No component data returned yet.</div>`;
    const err=data.apiError?`${esc(data.apiError.code)}: ${esc(data.apiError.error)}`:"";
    root.innerHTML=`
      <div class="nwt-header"><div class="nwt-title">💰 NetWorth Tracker</div><div class="nwt-headbuttons"><button id="nwt-collapse" title="Collapse">−</button><button id="nwt-close" title="Close">×</button></div></div>
      <div class="nwt-body">
        <div class="nwt-card"><div class="nwt-label">Current net worth</div><div class="nwt-big">${money(cur.networth)}</div><div class="nwt-muted">Today: <span class="${nwChange>0?'nwt-positive':nwChange<0?'nwt-negative':''}">${signed(nwChange)}</span></div><div class="nwt-muted">Torn value checked: ${date(data.lastChecked)}</div></div>
        <div class="nwt-card"><div class="nwt-label">Live cash</div><div class="nwt-big">${money(cur.cash)}</div><div class="nwt-muted">Today: <span class="${cashChange>0?'nwt-positive':cashChange<0?'nwt-negative':''}">${signed(cashChange)}</span></div></div>
        <div class="nwt-card"><div class="nwt-label">Snapshot change</div><div class="nwt-row"><span>Net worth</span><strong>${signed(diff(cur.networth,data.snapshots.length>1?data.snapshots[data.snapshots.length-2]?.networth:null))}</strong></div><div class="nwt-row"><span>Cash</span><strong>${signed(diff(cur.cash,data.snapshots.length>1?data.snapshots[data.snapshots.length-2]?.cash:null))}</strong></div><div class="nwt-muted">Change since the previous local snapshot — not a transaction ledger.</div></div>
        <div class="nwt-card"><details><summary>📊 Net-worth components</summary><div style="margin-top:8px">${comps}</div></details></div>
        <div class="nwt-card"><details><summary>⚙️ API / setup</summary><div class="nwt-status" style="margin-top:8px">Status: <strong>${esc(data.apiStatus)}</strong>${err?`<br><span class="nwt-negative">${err}</span>`:""}</div><input class="nwt-input" id="nwt-key" type="password" placeholder="Torn API key"><div class="nwt-actions"><button class="nwt-btn" id="nwt-save">Save & test</button><button class="nwt-btn" id="nwt-refresh">Refresh</button></div></details></div>
      </div>`;
    root.querySelector("#nwt-collapse").onclick=async()=>{uiState.collapsed=true;await saveUiState();render(data);};
    root.querySelector("#nwt-close").onclick=()=>root.remove();
    root.querySelector("#nwt-refresh").onclick=()=>refresh();
    root.querySelector("#nwt-save").onclick=async()=>{const key=root.querySelector("#nwt-key").value.trim();if(!key)return;runtimeApiKey=key;await saveApiKey(key);await refresh();};
    makeDraggable(root.querySelector(".nwt-header"),root);
  }

  function makeDraggable(handle,root){
    let drag=false,sx=0,sy=0,ox=0,oy=0;
    handle.addEventListener("pointerdown",e=>{if(e.target.closest("button"))return;drag=true;handle.setPointerCapture?.(e.pointerId);const r=root.getBoundingClientRect();sx=e.clientX;sy=e.clientY;ox=r.left;oy=r.top;});
    handle.addEventListener("pointermove",e=>{if(!drag)return;const x=Math.max(4,Math.min(window.innerWidth-root.offsetWidth-4,ox+e.clientX-sx));const y=Math.max(4,Math.min(window.innerHeight-root.offsetHeight-4,oy+e.clientY-sy));root.style.left=`${x}px`;root.style.top=`${y}px`;root.style.right="auto";root.style.bottom="auto";uiState.x=x;uiState.y=y;});
    handle.addEventListener("pointerup",async()=>{if(drag){drag=false;await saveUiState();}});
  }

  async function init(){
    runtimeApiKey=await getStoredApiKey(); await loadUiState(); injectStyles(); const data=await loadData(); render(data); if(effectiveKey()) await refresh();
    if(pollTimer)clearInterval(pollTimer); pollTimer=setInterval(()=>refresh(),POLL_MS);
  }
  init().catch(e=>console.error("[NetWorth Tracker] Startup failed:",e));
})();

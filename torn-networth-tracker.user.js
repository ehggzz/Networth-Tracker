// ==UserScript==
// @name         Torn NetWorth Tracker
// @namespace    https://github.com/ehggzz/Networth-Tracker
// @version      0.4.4
// @description  Track Torn net worth, live cash, financial stat changes and local history on your own profile only.
// @author       ehggzz
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/ehggzz/Networth-Tracker/main/torn-networth-tracker.user.js
// @downloadURL  https://raw.githubusercontent.com/ehggzz/Networth-Tracker/main/torn-networth-tracker.user.js
// @match        https://www.torn.com/*
// @run-at       document-end
// ==/UserScript==

(async () => {
  "use strict";

  const STORE = "networth_tracker_data_v2";
  const KEY_STORE = "networth_tracker_api_key";
  const PLAYER_ID_STORE = "networth_tracker_player_id";
  const PLAYER_NAME_STORE = "networth_tracker_player_name";
  const ROOT = "networth-tracker-root";
  const PDA_KEY = "###PDA-APIKEY###";
  const POLL = 5 * 60 * 1000;
  const PAGE_CHECK = 700;
  const KEEP = 90 * 24 * 60 * 60 * 1000;
  const IN_STATS = ["bazaarprofit","itemmarketrevenue","totalbountyreward","receivedbountyvalue","stockprofits","stocknetprofits","investedprofit"];
  const OUT_STATS = ["itemmarketfees","stockfees","rehabcost","totalbountyspent","peopleboughtspent"];
  const ALL_STATS = [...new Set([...IN_STATS, ...OUT_STATS])];

  let apiKey = PDA_KEY, playerId = null, playerName = null;
  let timer = null, busy = false, open = false;
  const defaults = { current:null, snapshots:[], statsCurrent:{}, statsSnapshots:[], apiStatus:"Not checked", apiError:null, lastChecked:null };

  const num = v => Number.isFinite(Number(v)) ? Number(v) : null;
  const money = v => num(v) === null ? "—" : `$${Math.round(v).toLocaleString("en-GB")}`;
  const signed = v => num(v) === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-GB")}`;
  const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const dayStart = () => { const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); };
  const effectiveKey = () => apiKey && apiKey !== PDA_KEY ? String(apiKey).trim() : "";

  async function storageGet(k, fallback="") {
    try { if (typeof PDA_storage !== "undefined") return await PDA_storage.get(k,fallback); } catch(e) {}
    try { const v=localStorage.getItem(k); return v===null?fallback:JSON.parse(v); } catch(e) { return fallback; }
  }
  async function storageSet(k,v) {
    try { if (typeof PDA_storage !== "undefined") { await PDA_storage.set(k,v); return; } } catch(e) {}
    try { localStorage.setItem(k,JSON.stringify(v)); } catch(e) {}
  }
  async function getKey(){
    try { if(typeof PDA_storage!=="undefined"){const v=String((await PDA_storage.get(KEY_STORE,""))||"").trim();if(v)return v;} } catch(e){}
    try{return String(localStorage.getItem(KEY_STORE)||"").trim();}catch(e){return "";}
  }
  async function saveKey(k){
    try{if(typeof PDA_storage!=="undefined")await PDA_storage.set(KEY_STORE,k);}catch(e){}
    try{localStorage.setItem(KEY_STORE,k);}catch(e){}
  }
  async function load(){
    try{if(typeof PDA_storage!=="undefined")return normalise(await PDA_storage.get(STORE,defaults));}catch(e){}
    try{const x=localStorage.getItem(STORE);if(x)return normalise(JSON.parse(x));}catch(e){}
    return normalise(defaults);
  }
  async function save(d){
    try{if(typeof PDA_storage!=="undefined"){await PDA_storage.set(STORE,d);return;}}catch(e){}
    try{localStorage.setItem(STORE,JSON.stringify(d));}catch(e){}
  }
  function normalise(x){
    const d={...defaults,...(x&&typeof x==="object"?x:{})};
    d.snapshots=Array.isArray(d.snapshots)?d.snapshots:[];
    d.statsSnapshots=Array.isArray(d.statsSnapshots)?d.statsSnapshots:[];
    return d;
  }

  async function request(url){
    try{
      if(!effectiveKey()) return {error:{code:"LOCAL",error:"No API key"}};
      const headers={Accept:"application/json",Authorization:`ApiKey ${effectiveKey()}`};
      const r=typeof PDA_httpGet==="function"?PDA_httpGet(url,headers):fetch(url,{headers});
      const out=await Promise.race([r,new Promise((_,rej)=>setTimeout(()=>rej(new Error("Request timed out after 15 seconds")),15000))]);
      const text=out?.responseText??out;
      return typeof text==="string"?JSON.parse(text):await out.json();
    }catch(e){return {error:{code:"LOCAL",error:e?.message||"Request failed"}};}
  }
  const v2=(path,params={})=>{const u=new URL(`https://api.torn.com/v2/user/${path}`);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));u.searchParams.set("key",effectiveKey());return request(u.toString());};

  async function identifyPlayer(){
    if(!effectiveKey()) return false;
    if(playerId && playerName) return true;
    const savedId=Number(await storageGet(PLAYER_ID_STORE,""));
    const savedName=String(await storageGet(PLAYER_NAME_STORE,"")||"").trim();
    if(savedId>0) playerId=savedId;
    if(savedName) playerName=savedName;
    if(playerId && playerName) return true;
    try{
      const r=await v2("basic");
      if(r?.error) throw new Error(`${r.error.code}: ${r.error.error}`);
      const b=r?.basic||r;
      const id=Number(b?.player_id??b?.id??r?.player_id??r?.userID);
      const name=String(b?.name??r?.name??"").trim();
      if(id>0){playerId=id;await storageSet(PLAYER_ID_STORE,id);}
      if(name){playerName=name;await storageSet(PLAYER_NAME_STORE,name);}
      return !!playerId;
    }catch(e){console.warn("[NetWorth Tracker] Could not identify player",e);return false;}
  }

  function profilePage(){return location.pathname.toLowerCase()==="/profiles.php";}
  function currentProfileId(){
    if(!profilePage()) return null;
    const p=new URLSearchParams(location.search);
    const xid=Number(p.get("XID")||p.get("ID"));
    return xid>0?xid:null;
  }
  function isOwnProfile(){
    if(!profilePage() || !playerId) return false;
    const p=new URLSearchParams(location.search);
    const xid=currentProfileId();
    if(xid) return xid===Number(playerId);
    const nid=String(p.get("NID")||"").trim();
    if(nid) return !!playerName && decodeURIComponent(nid).toLowerCase()===String(playerName).toLowerCase();
    return !p.get("XID") && !p.get("ID") && !p.get("NID");
  }

  function removeRoot(){const r=document.getElementById(ROOT);if(r)r.remove();}
  function stopPolling(){if(timer){clearInterval(timer);timer=null;}}

  function findProfileInsertionPoint(){
    const odRoot=document.getElementById("od-tracker-root");
    if(odRoot && odRoot.parentElement) return {parent:odRoot.parentElement, after:odRoot};
    const point=document.querySelector("#profileroot") ||
      document.querySelector(".profile-container") ||
      document.querySelector("#mainContainer .content-wrapper") ||
      document.querySelector("#mainContainer") ||
      document.body;
    return {parent:point, after:null};
  }

  function ensure(){
    let r=document.getElementById(ROOT);if(r)return r;
    const target=findProfileInsertionPoint();
    if(!target?.parent)return null;
    r=document.createElement("section");r.id=ROOT;
    if(target.after && target.after.parentElement===target.parent) target.after.insertAdjacentElement("afterend",r);
    else target.parent.prepend(r);
    return r;
  }

  function styles(){
    if(document.getElementById(ROOT+"-style"))return;
    const s=document.createElement("style");s.id=ROOT+"-style";s.textContent=`
      #${ROOT}{margin:8px 0;font-family:Arial,Helvetica,sans-serif;color:#ddd}
      #${ROOT} .nwt-header{width:100%;border:0;border-radius:4px;padding:9px 11px;background:rgba(30,30,30,.92);color:#ddd;text-align:left;font-size:13px;font-weight:600;cursor:pointer}
      #${ROOT} .nwt-arrow{float:right;opacity:.7}
      #${ROOT} .nwt-panel{display:none;margin-top:2px;padding:12px;border-radius:0 0 4px 4px;background:rgba(24,24,24,.96);font-size:12px;line-height:1.45}
      #${ROOT} .open{display:block} #${ROOT} .big{text-align:center;font-size:20px;font-weight:700;color:#fff} #${ROOT} .muted{opacity:.65;font-size:11px}
      #${ROOT} .card{margin-top:10px;border-top:1px solid #333;padding-top:9px} #${ROOT} .row{display:flex;justify-content:space-between;gap:8px;padding:4px 0}
      #${ROOT} .row+.row{border-top:1px solid #292929} #${ROOT} .pos{color:#72df91} #${ROOT} .neg{color:#ff7777}
      #${ROOT} details{margin-top:10px;border-top:1px solid #333;padding-top:9px} #${ROOT} summary{cursor:pointer;color:#ddd;font-weight:600}
      #${ROOT} input{width:100%;box-sizing:border-box;margin-top:7px;padding:7px;border:1px solid #444;border-radius:3px;background:#181818;color:#fff}
      #${ROOT} .buttons{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px} #${ROOT} .btn{border:1px solid #444;border-radius:3px;padding:7px;background:#2a2a2a;color:#ddd}
    `;document.head.appendChild(s);
  }

  async function personalStats(){
    const out={};
    for(let i=0;i<ALL_STATS.length;i+=10){
      const r=await v2("personalstats",{stat:ALL_STATS.slice(i,i+10).join(",")});
      if(r?.error)throw new Error(`${r.error.code}: ${r.error.error}`);
      Object.assign(out,r.personalstats||{});
    }
    return out;
  }
  function components(nw){
    const out={}; const add=(label,v)=>{const n=num(v);if(n!==null)out[label]=n;};
    add("Wallet",nw?.money?.wallet??nw?.wallet); add("Cayman",nw?.money?.cayman??nw?.cayman); add("Vault",nw?.money?.vault??nw?.vault); add("Piggy bank",nw?.money?.piggy_bank??nw?.piggybank);
    add("Points",nw?.points); add("Items",nw?.items?.inventory??nw?.items); add("Display case",nw?.items?.display_case??nw?.displaycase); add("Bazaar",nw?.items?.bazaar??nw?.bazaar); add("Item market",nw?.items?.item_market??nw?.itemmarket); add("Trades",nw?.items?.trades??nw?.trade);
    add("Properties",nw?.assets?.property??nw?.properties); add("Stocks",nw?.stockmarket??nw?.stocks); add("Auction house",nw?.items?.auction_house??nw?.auctionhouse); add("Company",nw?.assets?.company??nw?.company); add("Bookie",nw?.money?.bookie??nw?.bookie); add("Loan",nw?.money?.loans??nw?.loan); add("Unpaid fees",nw?.money?.unpaid_fees??nw?.unpaidfees);
    return out;
  }
  function totalNW(nw){for(const v of [nw?.total,nw?.networth]){const n=num(v);if(n!==null)return n;}return null;}

  async function refresh(){
    if(busy||!effectiveKey()||!isOwnProfile())return;
    busy=true;
    try{
      const [moneyR,nwR,stats]=await Promise.all([v2("money"),v2("networth"),personalStats()]);
      if(moneyR?.error)throw new Error(`${moneyR.error.code}: ${moneyR.error.error}`);
      if(nwR?.error)throw new Error(`${nwR.error.code}: ${nwR.error.error}`);
      const d=await load(), m=moneyR.money||{}, nw=nwR.networth||{};
      const snap={timestamp:Date.now(),cash:num(m.wallet),networth:totalNW(nw),components:components(nw)};
      d.current=snap; d.snapshots.push(snap); d.statsCurrent=stats; d.statsSnapshots.push({timestamp:Date.now(),stats});
      const cutoff=Date.now()-KEEP; d.snapshots=d.snapshots.filter(x=>x.timestamp>=cutoff); d.statsSnapshots=d.statsSnapshots.filter(x=>x.timestamp>=cutoff);
      d.apiStatus="Connected";d.apiError=null;d.lastChecked=Date.now();await save(d);render(d);
    }catch(e){const d=await load();d.apiStatus="Error";d.apiError={code:"API",error:e?.message||"Unknown error"};d.lastChecked=Date.now();await save(d);render(d);}finally{busy=false;}
  }
  function deltaStats(d){
    const base=d.statsSnapshots.find(x=>x.timestamp>=dayStart()),cur=d.statsCurrent||{},delta={};
    if(base)for(const k of ALL_STATS){const a=num(cur[k]),b=num(base.stats?.[k]);if(a!==null&&b!==null)delta[k]=a-b;}
    return delta;
  }
  function sumStats(d,names){const x=deltaStats(d);return names.reduce((s,k)=>s+(num(x[k])||0),0);}

  function render(d){
    if(!isOwnProfile()){removeRoot();return;}
    const r=ensure();if(!r)return;
    const c=d.current||{},base=d.snapshots.find(x=>x.timestamp>=dayStart());
    const nwToday=num(c.networth)!=null&&num(base?.networth)!=null?c.networth-base.networth:null;
    const cashToday=num(c.cash)!=null&&num(base?.cash)!=null?c.cash-base.cash:null;
    const knownIn=sumStats(d,IN_STATS),knownOut=sumStats(d,OUT_STATS),knownNet=knownIn-knownOut,colour=v=>v>0?"pos":v<0?"neg":"";
    const comp=Object.entries(c.components||{}).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="row"><span>${esc(k)}</span><strong>${money(v)}</strong></div>`).join("")||`<div class="muted">No component data returned.</div>`;
    const delta=deltaStats(d),tracked=[...new Set([...IN_STATS,...OUT_STATS])].map(k=>{const v=delta[k];return num(v)!==null?`<div class="row"><span>${esc(k)}</span><strong class="${colour(v)}">${signed(v)}</strong></div>`:""}).join("");
    r.innerHTML=`<button class="nwt-header" id="nwt-toggle"><span>💰 NetWorth Tracker</span><span class="nwt-arrow">${open?"▴":"▾"}</span></button>
      <div class="nwt-panel ${open?"open":""}">
        <div class="big">${money(c.networth)}</div><div style="text-align:center">Today: <strong class="${colour(nwToday)}">${signed(nwToday)}</strong></div><div class="muted" style="text-align:center">Updated: ${d.lastChecked?new Date(d.lastChecked).toLocaleTimeString("en-GB"):"Never"}</div>
        <div class="card"><div class="row"><span>💵 Cash</span><strong>${money(c.cash)}</strong></div><div class="row"><span>Cash today</span><strong class="${colour(cashToday)}">${signed(cashToday)}</strong></div></div>
        <div class="card"><strong>💸 Known financial activity today</strong><div class="row"><span>Tracked income</span><strong class="pos">${signed(knownIn)}</strong></div><div class="row"><span>Tracked costs</span><strong class="neg">${signed(-knownOut)}</strong></div><div class="row"><span>Tracked net</span><strong class="${colour(knownNet)}">${signed(knownNet)}</strong></div><div class="muted">These are categories Torn exposes as cumulative stats, not a complete transaction ledger.</div></div>
        <details><summary>📊 Today's tracked sources</summary><div style="margin-top:7px">${tracked||`<div class="muted">No change recorded yet.</div>`}</div></details>
        <details><summary>📈 Net-worth components</summary><div style="margin-top:7px">${comp}</div></details>
        <details><summary>⚙️ API / setup</summary><div>Status: <strong>${esc(d.apiStatus)}</strong>${d.apiError?`<div class="neg">${esc(d.apiError.code)}: ${esc(d.apiError.error)}</div>`:""}<input id="nwt-key" type="password" placeholder="Torn API key"><div class="buttons"><button class="btn" id="nwt-save">Save & test</button><button class="btn" id="nwt-refresh">Refresh</button></div></div></details>
      </div>`;
    r.querySelector("#nwt-toggle").onclick=()=>{open=!open;render(d)};
    r.querySelector("#nwt-refresh").onclick=()=>refresh();
    r.querySelector("#nwt-save").onclick=async()=>{const k=r.querySelector("#nwt-key").value.trim();if(k){apiKey=k;await saveKey(k);playerId=null;playerName=null;await identifyPlayer();await checkPage();}};
  }

  async function checkPage(){
    if(!effectiveKey()){stopPolling();removeRoot();return;}
    await identifyPlayer();
    if(!isOwnProfile()){stopPolling();removeRoot();return;}
    render(await load());
    if(!timer){await refresh();timer=setInterval(refresh,POLL);}
  }

  async function init(){apiKey=await getKey();styles();await checkPage();setInterval(checkPage,PAGE_CHECK);}
  init().catch(e=>console.error("[NetWorth Tracker]",e));
})();

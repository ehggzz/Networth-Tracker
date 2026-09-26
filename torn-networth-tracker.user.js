// ==UserScript==
// @name         Torn NetWorth Tracker
// @namespace    https://github.com/ehggzz/Networth-Tracker
// @version      0.5.2
// @description  Live Torn cash, cached net worth, observed daily cash movement and local history on your own profile only.
// @author      ehggzz
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/ehggzz/Networth-Tracker/main/torn-networth-tracker.user.js
// @downloadURL  https://raw.githubusercontent.com/ehggzz/Networth-Tracker/main/torn-networth-tracker.user.js
// @match        https://www.torn.com/*
// @run-at       document-end
// ==/UserScript==

(()=>{
  "use strict";

  const ROOT="networth-tracker-root";
  const KEY="###PDA-APIKEY###";
  const API_KEY_STORE="networth_tracker_api_key";
  const HISTORY_STORE="networth_tracker_history_v4";
  const MAX_HISTORY=90;
  const COMPONENTS=[
    ["wallet","💵 Wallet"],["vault","🔐 Vault"],["cayman","🌴 Offshore"],["points","⭐ Points"],
    ["items","🎒 Items"],["displaycase","🖼️ Display case"],["bazaar","🏪 Bazaar"],["itemmarket","🛒 Item market"],
    ["properties","🏠 Properties"],["stockmarket","📈 Stocks"],["auctionhouse","🔨 Auction house"],["company","🏢 Company"],
    ["bookie","🎰 Bookie"],["piggybank","🐷 Piggy bank"],["pending","🤝 Pending trades"],["enlistedcars","🏎️ Enlisted cars"],
    ["trade","🔄 Trades"],["loan","💳 Loan"],["unpaidfees","🧾 Unpaid fees"]
  ];

  if(location.pathname.toLowerCase()!=="/profiles.php") return;
  if(document.getElementById(ROOT)) return;

  const css=document.createElement("style");
  css.textContent=`
    #${ROOT}{margin:8px 0 10px;width:100%;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;position:relative;z-index:9999}
    #${ROOT} .nwt-head{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(#3b3b3b,#292929);border-radius:5px;padding:11px 13px;color:#fff;font-weight:700;font-size:15px;cursor:pointer;box-sizing:border-box}
    #${ROOT} .nwt-head:active{filter:brightness(1.15)}
    #${ROOT} .nwt-arrow{font-size:13px;opacity:.8;margin-left:8px}
    #${ROOT} .nwt-body{display:none;margin-top:5px;background:#242424;border-radius:5px;padding:10px;box-sizing:border-box;color:#eee}
    #${ROOT}.open .nwt-body{display:block}
    #${ROOT} .nwt-card{background:linear-gradient(#303030,#252525);border:1px solid #414141;border-radius:6px;padding:11px;margin-bottom:8px;box-sizing:border-box}
    #${ROOT} .nwt-label{font-size:11px;letter-spacing:1px;color:#aaa;text-transform:uppercase}
    #${ROOT} .nwt-big{font-size:25px;font-weight:800;margin-top:4px;color:#fff}
    #${ROOT} .nwt-row{display:flex;justify-content:space-between;gap:10px;padding:5px 0;font-size:13px}
    #${ROOT} .nwt-row strong{font-weight:800}
    #${ROOT} .in{color:#71d27a}.out{color:#ef7777}.muted{color:#999}
    #${ROOT} .nwt-components .nwt-row{border-top:1px solid #3a3a3a}
    #${ROOT} .nwt-foot{font-size:10px;color:#888;margin-top:7px;line-height:1.35}
    #${ROOT} button{border:0;border-radius:4px;background:#444;color:#fff;padding:7px 9px;font-weight:700}
    #${ROOT} .nwt-actions{display:flex;gap:7px;margin-top:8px}
  `;
  document.head.appendChild(css);

  const root=document.createElement("section");
  root.id=ROOT;
  root.innerHTML=`
    <div class="nwt-head"><span>💰 NetWorth Tracker</span><span class="nwt-arrow">▸</span></div>
    <div class="nwt-body">
      <div class="nwt-card">
        <div class="nwt-label">Current net worth</div>
        <div class="nwt-big" data-total>Loading…</div>
        <div class="muted" data-checked>Checking Torn…</div>
      </div>
      <div class="nwt-card">
        <div class="nwt-label">Live cash</div>
        <div class="nwt-big" data-wallet>Loading…</div>
        <div class="muted" data-cashchecked>Checking live wallet…</div>
      </div>
      <div class="nwt-card">
        <div class="nwt-label">Today's observed cash movement</div>
        <div class="nwt-row"><span>Cash received</span><strong class="in" data-cashin>—</strong></div>
        <div class="nwt-row"><span>Cash spent</span><strong class="out" data-cashout>—</strong></div>
        <div class="nwt-row"><span>Net cash movement</span><strong data-cashnet>—</strong></div>
        <div class="nwt-row"><span>Last cash change</span><strong data-lastcash>—</strong></div>
        <div class="nwt-foot">Movement is calculated from wallet snapshots taken by the tracker. If several transactions happen between checks, only the net wallet change can be observed.</div>
      </div>
      <div class="nwt-card">
        <div class="nwt-label">Net-worth snapshot</div>
        <div class="nwt-row"><span>Change since first snapshot today</span><strong data-nwchange>—</strong></div>
        <div class="nwt-foot">Torn's net-worth endpoint is cached, so this figure can lag behind live cash by up to about an hour.</div>
      </div>
      <details><summary>📊 Net-worth components</summary><div class="nwt-components" data-components></div></details>
      <details><summary>📚 Local history</summary><div data-history class="muted" style="padding-bottom:9px">No snapshots yet.</div></details>
      <div class="nwt-actions"><button data-refresh>↻ Refresh</button><button data-clear>Clear local history</button></div>
      <div class="nwt-foot">Bank is intentionally excluded from the live panel. Snapshots are stored locally on this device only.</div>
    </div>`;

  const target=document.querySelector("#profileroot")||document.querySelector(".profile-wrap")||document.querySelector(".profile-wrap-inner")||document.querySelector(".content-wrapper")||document.body;
  target.prepend(root);

  root.querySelector(".nwt-head").addEventListener("click",()=>{
    root.classList.toggle("open");
    root.querySelector(".nwt-arrow").textContent=root.classList.contains("open")?"▾":"▸";
  });

  const money=n=>Number.isFinite(Number(n))?Number(n):0;
  const fmt=n=>"$"+Math.round(money(n)).toLocaleString("en-GB");
  const signed=n=>{const x=money(n);return (x>=0?"+":"-")+fmt(Math.abs(x));};
  const esc=s=>String(s).replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));

  function getKey(){
    const stored=localStorage.getItem(API_KEY_STORE);
    if(stored) return stored.trim();
    return KEY&&KEY!=="###PDA-APIKEY###"?KEY.trim():"###PDA-APIKEY###";
  }

  async function api(selection,extra=""){
    const key=getKey();
    if(!key||key==="###PDA-APIKEY###") throw new Error("NO_API_KEY");
    const url=`https://api.torn.com/user/?selections=${encodeURIComponent(selection)}${extra}&key=${encodeURIComponent(key)}`;
    const r=await fetch(url,{credentials:"omit",cache:"no-store"});
    const j=await r.json();
    if(j.error) throw new Error(`${j.error.code}: ${j.error.error}`);
    return j;
  }

  function readHistory(){try{return JSON.parse(localStorage.getItem(HISTORY_STORE)||"[]")}catch{return[]}}
  function writeHistory(h){localStorage.setItem(HISTORY_STORE,JSON.stringify(h.slice(-MAX_HISTORY)))}
  function dayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
  function setText(sel,text,cls){const e=root.querySelector(sel);e.textContent=text;if(cls)e.className=e.className.replace(/\bin\b|\bout\b/g,"").trim()+" "+cls}

  function renderComponents(nw){
    root.querySelector("[data-components]").innerHTML=COMPONENTS.map(([k,label])=>`<div class="nwt-row"><span>${label}</span><strong>${fmt(nw[k])}</strong></div>`).join("");
  }

  function renderHistory(h){
    const box=root.querySelector("[data-history]");
    if(!h.length){box.textContent="No snapshots yet.";return;}
    box.innerHTML=h.slice().reverse().slice(0,14).map((x,i)=>`<div class="nwt-row" style="border-top:1px solid #3a3a3a"><span>${esc(x.date)}${i===0?" • latest":""}</span><strong>${fmt(x.total)}</strong></div>`).join("");
  }

  async function refresh(){
    setText("[data-total]","Loading…");
    setText("[data-wallet]","Loading…");
    try{
      const [nwData,moneyData]=await Promise.all([api("networth"),api("money")]);
      const nw=nwData.networth||{};
      const wealth=moneyData.money||moneyData||{};
      const total=money(nw.total);
      const wallet=money(wealth.money_onhand ?? wealth.wallet ?? wealth.cash ?? wealth.money);
      const date=dayKey(), now=Date.now();
      const history=readHistory();
      let today=history.find(x=>x.date===date);
      const previousWallet=today?.lastWallet;
      let cashIn=today?.cashIn||0;
      let cashOut=today?.cashOut||0;
      let lastChange=today?.lastChange||0;

      if(!today){
        today={date,total,wallet,firstTotal:total,firstWallet:wallet,lastWallet:wallet,cashIn:0,cashOut:0,lastChange:0,ts:now};
        history.push(today);
      }else if(Number.isFinite(previousWallet)){
        const delta=wallet-previousWallet;
        if(delta>0) cashIn+=delta;
        if(delta<0) cashOut+=Math.abs(delta);
        if(delta!==0) lastChange=delta;
        today.total=total;
        today.lastWallet=wallet;
        today.cashIn=cashIn;
        today.cashOut=cashOut;
        today.lastChange=lastChange;
        today.ts=now;
      }else{
        today.lastWallet=wallet;
        today.total=total;
      }

      writeHistory(history);
      renderHistory(history);
      renderComponents(nw);

      const nwChange=total-money(today.firstTotal);
      setText("[data-total]",fmt(total));
      setText("[data-wallet]",fmt(wallet));
      setText("[data-checked]",`Torn net worth checked ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`);
      setText("[data-cashchecked]",`Live wallet checked ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`);
      setText("[data-cashin]",fmt(today.cashIn),"in");
      setText("[data-cashout]",fmt(today.cashOut),"out");
      setText("[data-cashnet]",signed(today.cashIn-today.cashOut),(today.cashIn-today.cashOut)>=0?"in":"out");
      setText("[data-lastcash]",lastChange?signed(lastChange):"No change observed yet",lastChange>0?"in":lastChange<0?"out":"");
      setText("[data-nwchange]",signed(nwChange),nwChange>=0?"in":"out");
    }catch(err){
      const msg=err.message==="NO_API_KEY"?"API key not available — open script settings and add your key.":`Error: ${err.message}`;
      setText("[data-total]","—");
      setText("[data-wallet]","—");
      setText("[data-checked]",msg);
    }
  }

  root.querySelector("[data-refresh]").addEventListener("click",e=>{e.stopPropagation();refresh()});
  root.querySelector("[data-clear]").addEventListener("click",e=>{
    e.stopPropagation();
    if(confirm("Clear NetWorth Tracker history stored on this device?")){
      localStorage.removeItem(HISTORY_STORE);
      renderHistory([]);
    }
  });

  renderHistory(readHistory());
  refresh();
})();
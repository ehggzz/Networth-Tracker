// ==UserScript==
// @name         Torn NetWorth Tracker
// @namespace    https://github.com/ehggzz/Networth-Tracker
// @version      0.6.0
// @description  Live Torn cash, cached net worth, observed daily cash movement and local history on your own profile only.
// @author       ehggzz
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
  const COMPONENTS=[["wallet","💵 Wallet"],["vault","🔐 Vault"],["cayman","🌴 Offshore"],["points","⭐ Points"],["items","🎒 Items"],["displaycase","🖼️ Display case"],["bazaar","🏪 Bazaar"],["itemmarket","🛒 Item market"],["properties","🏠 Properties"],["stockmarket","📈 Stocks"],["auctionhouse","🔨 Auction house"],["company","🏢 Company"],["bookie","🎰 Bookie"],["piggybank","🐷 Piggy bank"],["pending","🤝 Pending trades"],["enlistedcars","🏎️ Enlisted cars"],["trade","🔄 Trades"],["loan","💳 Loan"],["unpaidfees","🧾 Unpaid fees"]];
  if(location.pathname.toLowerCase()!=="/profiles.php"||document.getElementById(ROOT))return;

  const css=document.createElement("style");
  css.textContent=`#${ROOT}{margin:8px 0 10px;width:100%;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;position:relative;z-index:9999}#${ROOT} .nwt-head{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(#3b3b3b,#292929);border-radius:5px;padding:11px 13px;color:#fff;font-weight:700;font-size:15px;cursor:pointer;box-sizing:border-box}#${ROOT} .nwt-arrow{font-size:13px;opacity:.8;margin-left:8px}#${ROOT} .nwt-body{display:none;margin-top:5px;background:#242424;border-radius:5px;padding:10px;box-sizing:border-box;color:#eee}#${ROOT}.open .nwt-body{display:block}#${ROOT} .nwt-card{background:linear-gradient(#303030,#252525);border:1px solid #414141;border-radius:6px;padding:11px;margin-bottom:8px;box-sizing:border-box}#${ROOT} .nwt-label{font-size:11px;letter-spacing:1px;color:#aaa;text-transform:uppercase}#${ROOT} .nwt-big{font-size:25px;font-weight:800;margin-top:4px;color:#fff}#${ROOT} .nwt-row{display:flex;justify-content:space-between;gap:10px;padding:5px 0;font-size:13px}#${ROOT} .nwt-row strong{font-weight:800}.in{color:#71d27a}.out{color:#ef7777}.muted{color:#999}#${ROOT} .nwt-components .nwt-row{border-top:1px solid #3a3a3a}#${ROOT} .nwt-foot{font-size:10px;color:#888;margin-top:7px;line-height:1.35}#${ROOT} button{border:0;border-radius:4px;background:#444;color:#fff;padding:7px 9px;font-weight:700}#${ROOT} .nwt-actions{display:flex;gap:7px;margin-top:8px;flex-wrap:wrap}#${ROOT} .nwt-chart-wrap{margin-top:9px}#${ROOT} .nwt-chart-controls{display:flex;gap:5px;margin:8px 0;flex-wrap:wrap}#${ROOT} .nwt-chart-controls button{padding:5px 8px;font-size:11px;background:#333}#${ROOT} .nwt-chart-controls button.active{background:#555;box-shadow:inset 0 0 0 1px #777}#${ROOT} .nwt-chart-summary{display:flex;justify-content:space-between;gap:8px;margin-bottom:7px;font-size:11px;color:#aaa}#${ROOT} .nwt-chart-summary strong{display:block;color:#eee;font-size:13px;margin-top:2px}#${ROOT} .nwt-chart{width:100%;height:150px;display:block;background:#202020;border-radius:5px;border:1px solid #393939}#${ROOT} .nwt-chart text{font-family:Arial,Helvetica,sans-serif;fill:#888;font-size:9px}#${ROOT} .nwt-chart .grid{stroke:#393939;stroke-width:1}#${ROOT} .nwt-chart .line{fill:none;stroke:#ddd;stroke-width:2}#${ROOT} .nwt-chart .dot{fill:#fff}#${ROOT} .nwt-chart .bar{fill:#777;opacity:.85}#${ROOT} .nwt-chart-empty{text-align:center;padding:45px 8px;color:#888;font-size:12px}#${ROOT} details{margin-bottom:8px}#${ROOT} summary{cursor:pointer;font-size:13px;font-weight:700;padding:7px 2px}`;
  document.head.appendChild(css);

  const root=document.createElement("section");
  root.id=ROOT;
  root.innerHTML=`<div class="nwt-head"><span>💰 NetWorth Tracker</span><span class="nwt-arrow">▸</span></div><div class="nwt-body"><div class="nwt-card"><div class="nwt-label">Current net worth</div><div class="nwt-big" data-total>Loading…</div><div class="muted" data-checked>Checking Torn…</div></div><div class="nwt-card"><div class="nwt-label">Live cash</div><div class="nwt-big" data-wallet>Loading…</div><div class="muted" data-cashchecked>Checking live wallet…</div></div><div class="nwt-card"><div class="nwt-label">Today's observed cash movement</div><div class="nwt-row"><span>Cash received</span><strong class="in" data-cashin>—</strong></div><div class="nwt-row"><span>Cash spent</span><strong class="out" data-cashout>—</strong></div><div class="nwt-row"><span>Net cash movement</span><strong data-cashnet>—</strong></div><div class="nwt-row"><span>Last cash change</span><strong data-lastcash>—</strong></div><div class="nwt-foot">Movement is calculated from wallet snapshots taken by the tracker. If several transactions happen between checks, only the net wallet change can be observed.</div></div><div class="nwt-card"><div class="nwt-label">Net-worth snapshot</div><div class="nwt-row"><span>Change since first snapshot today</span><strong data-nwchange>—</strong></div><div class="nwt-foot">Torn's net-worth endpoint is cached, so this figure can lag behind live cash by up to about an hour.</div></div><details><summary>📈 Net-worth & cash graph</summary><div class="nwt-chart-wrap"><div class="nwt-chart-controls"><button type="button" data-range="7" class="active">7 days</button><button type="button" data-range="30">30 days</button><button type="button" data-range="90">90 days</button></div><div class="nwt-chart-summary"><div><span data-chart-label>Net worth change</span><strong data-chart-change>—</strong></div><div><span data-chart-count>0 snapshots</span></div></div><div data-chart></div><div class="nwt-foot">Net worth uses the daily snapshots collected by the tracker. Daily cash movement is observed from wallet changes; it is not a complete transaction ledger or a guaranteed profit figure.</div></div></details><details><summary>📊 Net-worth components</summary><div class="nwt-components" data-components></div></details><details><summary>📚 Local history</summary><div data-history class="muted" style="padding-bottom:9px">No snapshots yet.</div></details><div class="nwt-actions"><button data-refresh>↻ Refresh</button><button data-clear>Clear local history</button></div><div class="nwt-foot">Bank is intentionally excluded from the live panel. Snapshots are stored locally on this device only.</div></div>`;

  const target=document.querySelector("#profileroot")||document.querySelector(".profile-wrap")||document.querySelector(".profile-wrap-inner")||document.querySelector(".content-wrapper")||document.body;
  target.prepend(root);

  root.querySelector(".nwt-head").addEventListener("click",()=>{root.classList.toggle("open");root.querySelector(".nwt-arrow").textContent=root.classList.contains("open")?"▾":"▸"});

  const money=n=>Number.isFinite(Number(n))?Number(n):0;
  const fmt=n=>"$"+Math.round(money(n)).toLocaleString("en-GB");
  const signed=n=>{const x=money(n);return(x>=0?"+":"-")+fmt(Math.abs(x))};
  const esc=s=>String(s).replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
  function getKey(){const stored=localStorage.getItem(API_KEY_STORE);if(stored)return stored.trim();return KEY&&KEY!=="###PDA-APIKEY###"?KEY.trim():"###PDA-APIKEY###"}
  async function api(selection){const key=getKey();if(!key||key==="###PDA-APIKEY###")throw new Error("NO_API_KEY");const r=await fetch(`https://api.torn.com/user/?selections=${encodeURIComponent(selection)}&key=${encodeURIComponent(key)}`,{credentials:"omit",cache:"no-store"});const j=await r.json();if(j.error)throw new Error(`${j.error.code}: ${j.error.error}`);return j}
  function readHistory(){try{return JSON.parse(localStorage.getItem(HISTORY_STORE)||"[]")}catch{return[]}}
  function writeHistory(h){localStorage.setItem(HISTORY_STORE,JSON.stringify(h.slice(-MAX_HISTORY)))}
  function dayKey(){const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
  function setText(sel,text,cls){const e=root.querySelector(sel);e.textContent=text;if(cls)e.className=e.className.replace(/\bin\b|\bout\b/g,"").trim()+" "+cls}
  function renderComponents(nw){root.querySelector("[data-components]").innerHTML=COMPONENTS.map(([k,label])=>`<div class="nwt-row"><span>${label}</span><strong>${fmt(nw[k])}</strong></div>`).join("")}
  function renderHistory(h){const box=root.querySelector("[data-history]");if(!h.length){box.textContent="No snapshots yet.";return}box.innerHTML=h.slice().reverse().slice(0,14).map((x,i)=>`<div class="nwt-row" style="border-top:1px solid #3a3a3a"><span>${esc(x.date)}${i===0?" • latest":""}</span><strong>${fmt(x.total)}</strong></div>`).join("")}

  let chartRange=7;
  let chartMode="nw";
  function chartPoints(history,range,mode){
    const rows=history.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-range);
    return rows.map(x=>({date:x.date,total:money(x.total),netCash:money(x.cashIn)-money(x.cashOut)}));
  }
  function renderChart(history){
    const box=root.querySelector("[data-chart]");
    const rows=chartPoints(history,chartRange,chartMode);
    root.querySelectorAll("[data-range]").forEach(b=>b.classList.toggle("active",Number(b.dataset.range)===chartRange));
    const label=root.querySelector("[data-chart-label]");
    label.textContent=chartMode==="nw"?"Net worth change":"Net cash movement";
    if(!rows.length){root.querySelector("[data-chart-change]").textContent="—";root.querySelector("[data-chart-count]").textContent="0 snapshots";box.innerHTML=`<div class="nwt-chart-empty">No snapshots yet. Use Refresh to start building your history.</div>`;return}
    const vals=rows.map(x=>chartMode==="nw"?x.total:x.netCash);
    const first=vals[0],last=vals[vals.length-1],change=last-first;
    root.querySelector("[data-chart-change]").textContent=chartMode==="nw"?signed(change):signed(vals.reduce((a,v)=>a+v,0));
    root.querySelector("[data-chart-count]").textContent=`${rows.length} snapshot${rows.length===1?"":"s"}`;
    const W=520,H=150,L=44,R=10,T=12,B=25,innerW=W-L-R,innerH=H-T-B;
    let min=Math.min(...vals),max=Math.max(...vals);
    if(min===max){const pad=Math.max(Math.abs(min)*0.02,1);min-=pad;max+=pad}
    const pad=(max-min)*0.08;min-=pad;max+=pad;
    const x=i=>L+(rows.length===1?innerW/2:i*innerW/(rows.length-1));
    const y=v=>T+(max-v)*innerH/(max-min);
    const path=vals.map((v,i)=>`${i===0?"M":"L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const grid=[0,.5,1].map(p=>{const yy=T+p*innerH;const val=max-p*(max-min);return`<line class="grid" x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}"/><text x="${L-5}" y="${yy+3}" text-anchor="end">${chartMode==="nw"?fmt(val):signed(val)}</text>`}).join("");
    const dots=rows.map((r,i)=>`<circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(vals[i]).toFixed(1)}" r="2.5"><title>${r.date} • ${chartMode==="nw"?fmt(vals[i]):signed(vals[i])}</title></circle>`).join("");
    const labels=rows.length<=10?rows.map((r,i)=>`<text x="${x(i).toFixed(1)}" y="${H-7}" text-anchor="middle">${r.date.slice(5)}</text>`).join(""):[rows[0],rows[Math.floor((rows.length-1)/2)],rows[rows.length-1]].map((r,i)=>{const idx=i===0?0:i===1?Math.floor((rows.length-1)/2):rows.length-1;return`<text x="${x(idx).toFixed(1)}" y="${H-7}" text-anchor="middle">${r.date.slice(5)}</text>`}).join("");
    box.innerHTML=`<svg class="nwt-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${chartMode==="nw"?"Net worth":"Net cash movement"} history">${grid}<path class="line" d="${path}"/>${dots}${labels}</svg>`;
  }
  function bindChartControls(){root.querySelectorAll("[data-range]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();chartRange=Number(b.dataset.range);renderChart(readHistory())}));}
  bindChartControls();
  root.querySelector("[data-chart-label]").addEventListener("click",()=>{});

  async function refresh(){
    setText("[data-total]","Loading…");
    setText("[data-wallet]","Loading…");
    try{
      const[nwData,moneyData]=await Promise.all([api("networth"),api("money")]);
      const nw=nwData.networth||{},wealth=moneyData.money||moneyData||{};
      const total=money(nw.total),wallet=money(wealth.money_onhand??wealth.wallet??wealth.cash??wealth.money);
      const date=dayKey(),now=Date.now(),history=readHistory();
      let today=history.find(x=>x.date===date),previousWallet=today?.lastWallet,cashIn=today?.cashIn||0,cashOut=today?.cashOut||0,lastChange=today?.lastChange||0;
      if(!today){today={date,total,wallet,firstTotal:total,firstWallet:wallet,lastWallet:wallet,cashIn:0,cashOut:0,lastChange:0,ts:now};history.push(today)}
      else if(Number.isFinite(previousWallet)){
        const delta=wallet-previousWallet;
        if(delta>0)cashIn+=delta;
        if(delta<0)cashOut+=Math.abs(delta);
        if(delta!==0)lastChange=delta;
        today.total=total;today.lastWallet=wallet;today.cashIn=cashIn;today.cashOut=cashOut;today.lastChange=lastChange;today.ts=now;
      }else{today.lastWallet=wallet;today.total=total}
      writeHistory(history);renderHistory(history);renderComponents(nw);renderChart(history);
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
      setText("[data-total]","—");setText("[data-wallet]","—");setText("[data-checked]",msg);
    }
  }

  root.querySelector("[data-refresh]").addEventListener("click",e=>{e.stopPropagation();refresh()});
  root.querySelector("[data-clear]").addEventListener("click",e=>{e.stopPropagation();if(confirm("Clear NetWorth Tracker history stored on this device?")){localStorage.removeItem(HISTORY_STORE);renderHistory([]);renderChart([])}});
  root.querySelector("summary").addEventListener("click",()=>setTimeout(()=>renderChart(readHistory()),0));
  renderHistory(readHistory());
  renderChart(readHistory());
  refresh();
})();

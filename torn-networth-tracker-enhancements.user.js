// ==UserScript==
// @name         Torn NetWorth Tracker Enhancements
// @namespace    https://github.com/ehggzz/Networth-Tracker
// @version      0.1.0
// @description  Adds the Ehggzz profile link, feedback note, and typed graph-range control to Torn NetWorth Tracker.
// @author       ehggzz
// @license      MIT
// @match        https://www.torn.com/profiles.php*
// @run-at       document-idle
// ==/UserScript==

(()=>{
  "use strict";
  const ROOT="networth-tracker-root";
  const PROFILE="https://www.torn.com/profiles.php?XID=3935112";
  const apply=()=>{
    const root=document.getElementById(ROOT);
    if(!root)return false;
    if(!root.querySelector("[data-nwt-author]")){
      const head=root.querySelector(".nwt-head span:first-child");
      if(head){
        head.innerHTML='💰 NetWorth Tracker <span style="font-weight:400;font-size:11px;color:#aaa;margin-left:5px">by <a data-nwt-author href="'+PROFILE+'" target="_blank" rel="noopener" style="color:#ddd;text-decoration:underline">Ehggzz</a></span>';
      }
    }
    if(!root.querySelector("[data-nwt-feedback]")){
      const body=root.querySelector(".nwt-body");
      if(body){
        const note=document.createElement("div");
        note.className="nwt-foot";
        note.setAttribute("data-nwt-feedback","");
        note.style.marginTop="10px";
        note.innerHTML='Feedback or bug report? Please DM <a href="'+PROFILE+'" target="_blank" rel="noopener" style="color:#ccc;text-decoration:underline">Ehggzz</a> on Torn.';
        body.appendChild(note);
      }
    }
    const slider=root.querySelector("[data-range-slider]");
    if(slider&&!root.querySelector("[data-nwt-range-input]")){
      const controls=root.querySelector(".nwt-chart-controls");
      if(controls){
        const oldValue=controls.querySelector("[data-range-value]");
        const row=document.createElement("div");
        row.style.cssText="display:flex;align-items:center;gap:6px;margin:6px 0 8px;flex-wrap:wrap";
        row.innerHTML='<span style="font-size:11px;color:#aaa">Graph range</span><input data-nwt-range-input type="number" min="5" max="365" step="1" value="5" aria-label="Graph range in days" style="width:64px;box-sizing:border-box;background:#171717;color:#eee;border:1px solid #555;border-radius:4px;padding:6px;text-align:center"><span style="font-size:11px;color:#aaa">days</span><button type="button" data-nwt-range-apply style="padding:6px 9px">Apply</button>';
        controls.insertBefore(row,controls.firstChild);
        const originalRange=controls.querySelector(".nwt-chart-range");
        const labels=controls.querySelector(".nwt-chart-slider-labels");
        if(originalRange)originalRange.style.display="none";
        slider.style.display="none";
        if(labels)labels.style.display="none";
        const input=row.querySelector("[data-nwt-range-input]"),button=row.querySelector("[data-nwt-range-apply]");
        const applyRange=()=>{
          let value=Number.parseInt(input.value,10);
          if(!Number.isFinite(value))value=5;
          value=Math.max(5,Math.min(365,value));
          input.value=String(value);
          slider.value=String(value);
          slider.dispatchEvent(new Event("input",{bubbles:true}));
        };
        button.addEventListener("click",e=>{e.stopPropagation();applyRange()});
        input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();e.stopPropagation();applyRange()}});
        if(oldValue)oldValue.style.display="none";
      }
    }
    return true;
  };
  const observer=new MutationObserver(()=>apply());
  const start=()=>{if(document.body)observer.observe(document.body,{childList:true,subtree:true});apply();};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
  setInterval(apply,1000);
})();
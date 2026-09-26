// ==UserScript==
// @name         Torn NetWorth Tracker
// @namespace    https://github.com/ehggzz/Networth-Tracker
// @version      0.4.8
// @description  Torn NetWorth Tracker diagnostic build
// @author       ehggzz
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/ehggzz/Networth-Tracker/main/torn-networth-tracker.user.js
// @downloadURL  https://raw.githubusercontent.com/ehggzz/Networth-Tracker/main/torn-networth-tracker.user.js
// @match        https://www.torn.com/*
// @run-at       document-end
// ==/UserScript==

(()=>{
"use strict";
const ID="networth-tracker-diagnostic";
if(document.getElementById(ID)||location.pathname.toLowerCase()!=="/profiles.php")return;
const s=document.createElement("style");
s.textContent=`#${ID}{margin:8px 0;padding:10px 12px;background:linear-gradient(#3a3a3a,#292929);border-radius:4px;color:#fff;font:700 14px Arial,Helvetica,sans-serif;box-sizing:border-box;width:100%;position:relative;z-index:9999}`;
document.head.appendChild(s);
const bar=document.createElement("div");
bar.id=ID;
bar.textContent="💰 NetWorth Tracker — DIAGNOSTIC RUNNING";
const target=document.querySelector("#profileroot")||document.querySelector(".profile-wrap")||document.querySelector(".profile-wrap-inner")||document.querySelector(".content-wrapper")||document.body;
target.prepend(bar);
})();
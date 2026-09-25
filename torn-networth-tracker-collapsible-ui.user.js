// ==UserScript==
// @name         Torn NetWorth Tracker - Collapsible UI
// @namespace    https://github.com/ehggzz/Networth-Tracker
// @version      0.1.0
// @description  Adds a compact, collapsible and draggable shell to Torn NetWorth Tracker while the main UI is being tested.
// @match        https://www.torn.com/*
// @run-at       document-end
// ==/UserScript==

(() => {
  'use strict';
  const ROOT = 'networth-tracker-root';
  const KEY = 'networth_tracker_ui_collapsed';
  const POS = 'networth_tracker_ui_position';
  let lastRoot = null;

  const css = document.createElement('style');
  css.id = 'nwt-ui-helper-style';
  css.textContent = `
    #${ROOT}.nwt-helper-collapsed{width:auto!important;max-width:none!important;max-height:none!important;overflow:visible!important;border-radius:999px!important}
    #${ROOT}.nwt-helper-collapsed .nwt-body{display:none!important}
    #${ROOT}.nwt-helper-collapsed .nwt-header{border:0!important;padding:9px 12px!important;border-radius:999px!important}
    #${ROOT}.nwt-helper-dragging{user-select:none!important}
    #${ROOT} .nwt-helper-collapse{border:0!important;background:transparent!important;color:#aaa!important;font-size:22px!important;line-height:1!important;padding:1px 5px!important;cursor:pointer!important}
    #${ROOT} .nwt-helper-collapse:hover{color:#fff!important}
  `;
  document.documentElement.appendChild(css);

  function state() { try { return localStorage.getItem(KEY) === '1'; } catch(e) { return false; } }
  function saveCollapsed(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch(e) {} }
  function position(root) {
    try {
      const p = JSON.parse(localStorage.getItem(POS) || 'null');
      if (!p || !Number.isFinite(p.left) || !Number.isFinite(p.top)) return;
      root.style.left = `${Math.max(0, Math.min(p.left, innerWidth-root.offsetWidth-4))}px`;
      root.style.top = `${Math.max(0, Math.min(p.top, innerHeight-root.offsetHeight-4))}px`;
      root.style.right = 'auto'; root.style.bottom = 'auto';
    } catch(e) {}
  }
  function savePosition(root) { try { const r=root.getBoundingClientRect(); localStorage.setItem(POS, JSON.stringify({left:r.left,top:r.top})); } catch(e) {} }

  function enhance(root) {
    if (root === lastRoot && root.dataset.nwtHelperReady === '1') return;
    lastRoot = root;
    root.dataset.nwtHelperReady = '1';
    const header = root.querySelector('.nwt-header');
    if (!header) return;

    let actions = header.querySelector('.nwt-header-actions');
    if (!actions) { actions = document.createElement('div'); actions.className='nwt-header-actions'; header.appendChild(actions); }
    let button = actions.querySelector('.nwt-helper-collapse');
    if (!button) { button=document.createElement('button'); button.className='nwt-helper-collapse'; actions.prepend(button); }

    const apply = () => { const collapsed=state(); root.classList.toggle('nwt-helper-collapsed', collapsed); button.textContent=collapsed?'＋':'−'; button.title=collapsed?'Expand NetWorth Tracker':'Collapse NetWorth Tracker'; position(root); };
    button.onclick = e => { e.preventDefault(); e.stopPropagation(); saveCollapsed(!state()); apply(); };
    apply();

    if (!header.dataset.nwtDragReady) {
      header.dataset.nwtDragReady='1';
      let drag=false,sx=0,sy=0,lx=0,ly=0;
      header.addEventListener('pointerdown',e=>{ if(e.target.closest('button')) return; const r=root.getBoundingClientRect(); drag=true;sx=e.clientX;sy=e.clientY;lx=r.left;ly=r.top;root.classList.add('nwt-helper-dragging');header.setPointerCapture?.(e.pointerId); });
      header.addEventListener('pointermove',e=>{ if(!drag)return; root.style.left=`${Math.max(0,Math.min(lx+e.clientX-sx,innerWidth-root.offsetWidth-4))}px`;root.style.top=`${Math.max(0,Math.min(ly+e.clientY-sy,innerHeight-root.offsetHeight-4))}px`;root.style.right='auto';root.style.bottom='auto'; });
      const end=()=>{if(!drag)return;drag=false;root.classList.remove('nwt-helper-dragging');savePosition(root);};
      header.addEventListener('pointerup',end);header.addEventListener('pointercancel',end);
    }
  }

  const observer = new MutationObserver(() => { const root=document.getElementById(ROOT); if(root) enhance(root); });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  const timer=setInterval(()=>{ const root=document.getElementById(ROOT); if(root) enhance(root); },500);
  setTimeout(()=>clearInterval(timer),30000);
})();

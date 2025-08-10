"use client";
import React, { useState, useCallback, useEffect, useRef } from 'react';
import Terminal from './Terminal';

function genSessionId(idx){
  return `tab-${idx}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
}

async function fetchTabs(){
  const res = await fetch('/api/tabs',{ cache:'no-store' });
  if(!res.ok) throw new Error('Failed fetch tabs');
  const data = await res.json();
  return data.tabs || [];
}
async function createTab(title){
  const res = await fetch('/api/tabs',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'create', title }) });
  if(!res.ok) throw new Error('Failed create tab');
  return (await res.json()).tab;
}
async function renameTabServer(id,title){
  await fetch('/api/tabs',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'rename', id, title }) });
}
async function deleteTabServer(id){
  await fetch(`/api/tabs?id=${encodeURIComponent(id)}`,{ method:'DELETE' });
}

export default function TerminalTabs(){
  const envForceShared = process.env.NEXT_PUBLIC_FORCE_SHARED_SESSION === '1';
  const sharedId = process.env.NEXT_PUBLIC_SHARED_SESSION_ID || 'main-session';
  // Allow runtime override via query param ?shared=0 or ?shared=1 (useful saat debug)
  const [forceShared,setForceShared] = useState(envForceShared);
  useEffect(()=>{
    try {
      const sp = new URLSearchParams(window.location.search);
      if(sp.has('shared')){
        const v = sp.get('shared');
        if(v === '0') setForceShared(false); else if(v === '1') setForceShared(true);
      }
    } catch {}
  },[]);
  useEffect(()=>{ console.log('[TerminalTabs] forceShared=', forceShared); },[forceShared]);

  const firstLoadRef = useRef(true);
  const [tabs,setTabs] = useState(()=> forceShared ? [{ id: sharedId, title: 'Shared Session', shared:true }] : []);
  const [active,setActive] = useState(0);
  const [loading,setLoading] = useState(!forceShared);

  // Keyboard shortcuts (avoid browser reserved combos):
  //  Alt+T  -> new tab
  //  Alt+W  -> close active tab
  //  Alt+1..9 -> switch tab
  useEffect(()=>{
    if(forceShared) return; // no multi-tab controls in shared mode
    const handler = (e)=>{
      if(e.altKey){
        // New tab
        if(!e.shiftKey && !e.ctrlKey && (e.key === 't' || e.key === 'T')){ e.preventDefault(); addTab(); return; }
        // Close tab
        if(!e.shiftKey && !e.ctrlKey && (e.key === 'w' || e.key === 'W')){ e.preventDefault(); closeTab(active); return; }
        // Switch tab 1..9
        if(/^[1-9]$/.test(e.key)){
          e.preventDefault();
          const idx = parseInt(e.key,10)-1;
          setActive(a=> idx < tabs.length ? idx : a);
          return;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return ()=> window.removeEventListener('keydown', handler);
  },[active, forceShared, tabs, addTab, closeTab]);

  const addTab = useCallback(async ()=>{
    try {
      const tab = await createTab();
      setTabs(t=>[...t, tab]);
      setActive(a=>tabs.length); // new last index
    } catch(e){ console.error(e); }
  },[tabs.length]);

  const closeTab = useCallback(async (idx)=>{
    setTabs(t=>{ if(t.length===1) return t; return t; }); // optimistic guard
    const target = tabs[idx];
    if(!target || tabs.length===1) return;
    try { await deleteTabServer(target.id); } catch(e){ console.error(e); }
    setTabs(t=>{
      const newTabs = t.filter((_,i)=>i!==idx);
      setActive(a=>{
        if(a === idx) return Math.max(0, idx -1);
        if(a > idx) return a -1;
        if(a >= newTabs.length) return newTabs.length -1;
        return a;
      });
      return newTabs;
    });
  },[tabs]);

  const renameTab = useCallback(async (idx)=>{
    const current = tabs[idx];
    if(!current) return;
    const label = prompt('Tab name:', current.title);
    if(label && label.trim()){
      try { await renameTabServer(current.id, label.trim()); } catch(e){ console.error(e); }
      setTabs(t=> t.map((tb,i)=> i===idx ? { ...tb, title: label.trim() } : tb));
    }
  },[tabs]);

  // Persist tabs & active to localStorage (debounced minimal)
  useEffect(()=>{
    if(forceShared) return;
    (async ()=>{
      setLoading(true);
      try {
        const serverTabs = await fetchTabs();
        setTabs(serverTabs);
        setActive(0);
      } catch(e){ console.error(e); }
      setLoading(false);
    })();
  },[forceShared]);

  const resetAll = useCallback(async ()=>{
    if(!confirm('Reset all tabs?')) return;
    try {
      // naive: delete each (skip last rule in API by ensuring more than 1 first)
      for(const t of tabs){
        try { await deleteTabServer(t.id); } catch {}
      }
      const first = await createTab('Tab 1');
      setTabs([first]);
      setActive(0);
    } catch(e){ console.error(e); }
  },[tabs]);

  return (
    <div className="flex flex-col h-screen w-full bg-black">
  <div className="flex items-stretch bg-gray-900 border-b border-gray-800 overflow-x-auto relative">
        {!forceShared && (
          <>
            <button onClick={addTab} title="Tambah tab (Alt+T)" className="px-3 py-1 text-xs font-mono text-gray-300 hover:text-white border-r border-gray-800 sticky left-0 bg-gray-900">+ New</button>
            <button onClick={resetAll} title="Reset semua tab" className="px-2 py-1 text-[10px] font-mono text-gray-400 hover:text-red-400 border-r border-gray-800 bg-gray-900">Reset</button>
          </>
        )}
        {tabs.map((tab,i)=>{
          const activeTab = i===active;
          return (
            <div key={tab.id} className={`flex items-center px-3 py-1 text-xs font-mono cursor-pointer select-none border-r border-gray-800 ${activeTab? 'bg-black text-green-400' : 'text-gray-400 hover:text-white'}`} onClick={()=>setActive(i)} onDoubleClick={()=>renameTab(i)}>
              <span className="mr-2 whitespace-nowrap">{tab.title}</span>
              {!forceShared && (
                <button aria-label="Close tab" onClick={(e)=>{e.stopPropagation(); closeTab(i);}} className="text-gray-500 hover:text-red-400 ml-auto">×</button>
              )}
            </div>
          );
        })}
        {forceShared && (
          <div className="ml-auto pr-4 py-1 text-[10px] text-gray-500 font-mono whitespace-nowrap">Shared session mode aktif (multi-tab off) | Tambah tab? hapus env NEXT_PUBLIC_FORCE_SHARED_SESSION atau pakai ?shared=0</div>
        )}
      </div>
      <div className="flex-1 min-h-0 relative">
        {loading && !forceShared && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs font-mono">Loading tabs...</div>
        )}
        {tabs.map((tab,i)=> (
          <div key={tab.id} style={{ display: i===active ? 'block':'none'}} className="w-full h-full">
            <Terminal sessionId={tab.id} zen={true} />
          </div>
        ))}
        {!forceShared && (
          <div className="pointer-events-none select-none absolute bottom-1 right-2 text-[10px] text-gray-600 font-mono opacity-70 text-right leading-tight">
            Alt+T New | Alt+W Close | Alt+1..9 Switch<br/>Server persisted tabs
          </div>
        )}
      </div>
    </div>
  );
}

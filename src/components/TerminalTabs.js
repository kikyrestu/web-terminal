"use client";
import React, { useState, useCallback, useEffect, useRef } from 'react';
import Terminal from './Terminal';

function genSessionId(idx){
  return `tab-${idx}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
}

const LS_KEY = 'terminalMultiTabs:v1';

function loadSaved(){
  try {
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!parsed || !Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return null;
    // sanitize
    const tabs = parsed.tabs.filter(t=> t && typeof t.id==='string' && t.id.trim() && typeof t.title==='string');
    if(!tabs.length) return null;
    return { tabs, active: typeof parsed.active === 'number' && parsed.active < tabs.length ? parsed.active : 0 };
  } catch { return null; }
}

function saveTabs(tabs, active){
  try { localStorage.setItem(LS_KEY, JSON.stringify({ tabs, active })); } catch {}
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
  const [tabs,setTabs] = useState(()=>{
    if(forceShared){
      return [{ id: sharedId, title: 'Shared Session', shared:true }];
    }
    if(typeof window !== 'undefined'){
      const saved = loadSaved();
      if(saved){
        return saved.tabs;
      }
    }
    return [{ id: genSessionId(1), title: 'Tab 1' }];
  });
  const [active,setActive] = useState(()=>{
    if(forceShared) return 0;
    if(typeof window !== 'undefined'){
      const saved = loadSaved();
      if(saved) return saved.active;
    }
    return 0;
  });

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

  const addTab = useCallback(()=>{
    setTabs(t=>{
      const idx = t.length + 1;
      const newTabs = [...t, { id: genSessionId(idx), title: `Tab ${idx}` }];
      // active update after setTabs using functional update below
      setActive(newTabs.length -1);
      return newTabs;
    });
  },[]);

  const closeTab = useCallback((idx)=>{
    setTabs(t=>{
      if(t.length === 1) return t; // keep at least one
      const newTabs = [...t.slice(0,idx), ...t.slice(idx+1)];
      setActive(a=>{
        if(a === idx) return Math.max(0, idx -1);
        if(a > idx) return a -1;
        if(a >= newTabs.length) return newTabs.length -1;
        return a;
      });
      return newTabs;
    });
  },[]);

  const renameTab = useCallback((idx)=>{
    const current = tabs[idx];
    if(!current) return;
    const label = prompt('Tab name:', current.title);
    if(label && label.trim()){
      setTabs(t=> t.map((tb,i)=> i===idx ? { ...tb, title: label.trim() } : tb));
    }
  },[tabs]);

  // Persist tabs & active to localStorage (debounced minimal)
  useEffect(()=>{
    if(forceShared) return; // not needed in shared
    if(firstLoadRef.current){
      // skip first run if loaded from storage (already same value)
      firstLoadRef.current = false;
      return;
    }
    saveTabs(tabs, active);
  },[tabs, active, forceShared]);

  const resetAll = useCallback(()=>{
    if(!confirm('Reset all tabs? This will create a fresh single tab.')) return;
    setTabs([{ id: genSessionId(1), title: 'Tab 1' }]);
    setActive(0);
    try { localStorage.removeItem(LS_KEY); } catch {}
  },[]);

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
        {tabs.map((tab,i)=> (
          <div key={tab.id} style={{ display: i===active ? 'block':'none'}} className="w-full h-full">
            <Terminal sessionId={tab.id} zen={true} />
          </div>
        ))}
        {!forceShared && (
          <div className="pointer-events-none select-none absolute bottom-1 right-2 text-[10px] text-gray-600 font-mono opacity-70 text-right leading-tight">
            Alt+T New | Alt+W Close | Alt+1..9 Switch<br/>Persisted tabs (local)
          </div>
        )}
      </div>
    </div>
  );
}

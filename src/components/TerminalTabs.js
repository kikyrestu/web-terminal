"use client";
import React, { useState, useCallback, useEffect } from 'react';
import Terminal from './Terminal';

function genSessionId(idx){
  return `tab-${idx}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
}

export default function TerminalTabs(){
  const forceShared = process.env.NEXT_PUBLIC_FORCE_SHARED_SESSION === '1';
  const sharedId = process.env.NEXT_PUBLIC_SHARED_SESSION_ID || 'main-session';

  const [tabs,setTabs] = useState(()=>{
    if(forceShared){
      return [{ id: sharedId, title: 'Shared Session', shared:true }];
    }
    return [{ id: genSessionId(1), title: 'Tab 1' }];
  });
  const [active,setActive] = useState(0);

  // Keyboard shortcut: Ctrl+Shift+T new tab, Ctrl+W close
  useEffect(()=>{
    if(forceShared) return; // no multi-tab controls in shared mode
    const handler = (e)=>{
      if(e.ctrlKey && e.shiftKey && (e.key === 'T' || e.key === 't')){ e.preventDefault(); addTab(); }
      if(e.ctrlKey && (e.key === 'w' || e.key === 'W')){ e.preventDefault(); closeTab(active); }
    };
    window.addEventListener('keydown', handler);
    return ()=> window.removeEventListener('keydown', handler);
  },[active, forceShared, tabs]);

  const addTab = useCallback(()=>{
    setTabs(t=>{
      const idx = t.length + 1;
      return [...t, { id: genSessionId(idx), title: `Tab ${idx}` }];
    });
    setActive(tabs.length);
  },[tabs.length]);

  const closeTab = useCallback((idx)=>{
    setTabs(t=>{
      if(t.length === 1) return t; // keep at least one
      const newTabs = [...t.slice(0,idx), ...t.slice(idx+1)];
      // Adjust active
      if(active >= newTabs.length){ setActive(newTabs.length -1); }
      else if(idx < active){ setActive(a=>a-1); }
      return newTabs;
    });
  },[active]);

  const renameTab = useCallback((idx)=>{
    const label = prompt('Tab name:', tabs[idx].title);
    if(label){
      setTabs(t=> t.map((tb,i)=> i===idx ? { ...tb, title: label } : tb));
    }
  },[tabs]);

  return (
    <div className="flex flex-col h-screen w-full bg-black">
      <div className="flex items-stretch bg-gray-900 border-b border-gray-800 overflow-x-auto">
        {tabs.map((tab,i)=>{
          const activeTab = i===active;
          return (
            <div key={tab.id} className={`flex items-center px-3 py-1 text-xs font-mono cursor-pointer select-none border-r border-gray-800 ${activeTab? 'bg-black text-green-400' : 'text-gray-400 hover:text-white'}`} onClick={()=>setActive(i)} onDoubleClick={()=>renameTab(i)}>
              <span className="mr-2">{tab.title}</span>
              {!forceShared && (
                <button onClick={(e)=>{e.stopPropagation(); closeTab(i);}} className="text-gray-500 hover:text-red-400 ml-auto">×</button>
              )}
            </div>
          );
        })}
        {!forceShared && (
          <button onClick={addTab} className="px-3 py-1 text-xs font-mono text-gray-400 hover:text-white">+ New</button>
        )}
        {forceShared && (
          <div className="ml-auto pr-4 py-1 text-[10px] text-gray-500 font-mono">Shared session mode aktif (multi-tab dinonaktifkan)</div>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {tabs.map((tab,i)=> (
          <div key={tab.id} style={{ display: i===active ? 'block':'none'}} className="w-full h-full">
            <Terminal sessionId={tab.id} zen={true} />
          </div>
        ))}
      </div>
    </div>
  );
}

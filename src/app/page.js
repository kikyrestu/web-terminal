'use client';

import dynamic from 'next/dynamic';
import React, { useState, useEffect, useCallback } from 'react';

// Dynamic import tabs wrapper
const TerminalTabs = dynamic(() => import('@/components/TerminalTabs'), { ssr:false });

export default function Home() {
  const [zen, setZen] = useState(false);
  const [user,setUser]=useState(null);
  const toggleZen = useCallback(() => setZen(z => !z), []);
  const [auth,setAuth]=useState(null); // null = checking, true = ok, false = redirect
  useEffect(()=>{ (async ()=>{
    try {
      const r = await fetch('/api/me',{cache:'no-store'});
  if(r.ok){ const j=await r.json(); setUser(j.user); setAuth(true); } else { setAuth(false); window.location.href='/login'; }
    } catch { setAuth(false); window.location.href='/login'; }
  })(); },[]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        toggleZen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleZen]);

  const logout = async () => { try { await fetch('/api/logout',{method:'POST'}); document.cookie='auth=; Max-Age=0; path=/'; window.location.href='/login'; } catch{} };

  return (
    <div className="font-sans h-screen w-screen bg-black text-white overflow-hidden">
      <div className="absolute inset-0 flex flex-col">
        {!zen && auth !== false && (
          <div className="flex items-center px-3 py-2 text-xs bg-gray-900 border-b border-gray-800 gap-4 select-none">
            <span className="font-semibold">Web Terminal</span>
            <span className="text-gray-500 hidden sm:inline">Multi-session persistent shell</span>
            <div className="ml-auto flex items-center gap-3 text-gray-500">
              <span className="hidden md:inline">Ctrl+Shift+Z toggle zen</span>
              <button onClick={logout} className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white">Logout</button>
              <button onClick={toggleZen} className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300">Zen</button>
            </div>
          </div>
        )}
        <div className="flex-grow relative">
          {auth === null && (
            <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">Checking auth...</div>
          )}
          {auth === true && <TerminalTabs zen={zen} user={user} />}
        </div>
      </div>
    </div>
  );
}

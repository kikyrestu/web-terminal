"use client";
import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
const Terminal = dynamic(() => import('./Terminal'), { ssr:false });

// Per-user single session (no localStorage tabs) – deterministic sessionId derived from username
export default function TerminalTabs({ zen=false, user }) {
  const [sessionId,setSessionId] = useState(null);
  useEffect(()=>{
    if(user){
      const sid = `user-${user}-session`;
      setSessionId(sid);
    }
  },[user]);
  if(!sessionId) return <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">Init session...</div>;
  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-grow relative min-h-0">
        <Terminal sessionId={sessionId} zen={zen} />
      </div>
    </div>
  );
}

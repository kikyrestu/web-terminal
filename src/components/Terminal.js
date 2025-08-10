"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { io } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';

export default function Terminal({ sessionId: externalSessionId, zen=false }) {
  const terminalRef = useRef(null);
  const terminalInitialized = useRef(false);
  const [terminal, setTerminal] = useState(null);
  const [socket, setSocket] = useState(null);
  const joinedRef = useRef(false);
  const [sessionId, setSessionId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const historyAppliedRef = useRef(false);
  const historyRetryAttemptsRef = useRef(0); // no longer used for looping, kept for backward compat
  const cachePrefilledRef = useRef(false); // whether we prefilled from local cache
  const cachedLengthRef = useRef(0); // length of cached raw applied
  const aggregateCacheRef = useRef(''); // full aggregated raw for local cache
  const lastCacheWriteRef = useRef(0);
  const pendingCacheWriteRef = useRef(false);

  // Setup / determine sessionId then create socket (without joining yet)
  useEffect(() => {
    if (externalSessionId) {
      setSessionId(externalSessionId);
    } else {
      // Shared session mode: if env flag set at build time, force a constant ID across all browsers
      const forceShared = process.env.NEXT_PUBLIC_FORCE_SHARED_SESSION === '1';
      const sharedId = process.env.NEXT_PUBLIC_SHARED_SESSION_ID || 'main-session';
      if (forceShared) {
        setSessionId(sharedId);
      } else {
        const stored = localStorage.getItem('terminalSessionId');
        const id = stored || `session-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
        if (!stored) localStorage.setItem('terminalSessionId', id);
        setSessionId(id);
      }
    }
    const s = io({
      path: '/socket.io',
      transports: ['websocket','polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    s.on('connect', () => setIsConnected(true));
    s.on('disconnect', () => setIsConnected(false));
    s.on('connect_error', () => setIsConnected(false));
    setSocket(s);
  }, [externalSessionId]);

  // Initialize xterm
  useEffect(() => {
    if (!terminalRef.current || terminalInitialized.current) return;
    terminalInitialized.current = true;
    try {
      const term = new XTerm({
        cursorBlink: true,
        scrollback: 5000,
        fontFamily: 'monospace',
        fontSize: 14,
        theme: { background: '#000', foreground: '#fff', cursor: '#00ff00' }
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      term.open(terminalRef.current);
      setTimeout(() => { try { fitAddon.fit(); term.focus(); } catch {} }, 200);
      setTerminal(term);

      // Prefill dari localStorage (instant) sebelum server history datang
      const disableLocal = process.env.NEXT_PUBLIC_DISABLE_LOCAL_CACHE === '1';
      if(!disableLocal){
        try {
          const sid = externalSessionId || localStorage.getItem('terminalSessionId');
          if (sid) {
            const cached = localStorage.getItem('terminalCache:'+sid);
            if (cached && cached.length) {
              term.write(cached);
              console.log('[HISTORY] Prefilled from localStorage cache len=', cached.length);
              historyAppliedRef.current = true; // mark applied, but allow delta
              cachePrefilledRef.current = true;
              cachedLengthRef.current = cached.length;
              aggregateCacheRef.current = cached;
            }
          }
        } catch {}
      }

      const handleResize = () => {
        if (!term.element) return;
        try { fitAddon.fit(); if (socket && socket.connected) socket.emit('resize',{cols:term.cols,rows:term.rows}); } catch {}
      };
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        try { term.dispose(); } catch {}
        terminalInitialized.current = false;
      };
    } catch (e) {
      terminalInitialized.current = false;
    }
  }, [terminalRef, socket]);

  // Join session only after terminal & socket ready so server gets correct size
  useEffect(() => {
    if (!socket || !terminal || !sessionId || !isConnected || joinedRef.current) return;
    try {
      socket.emit('join-session', { sessionId, cols: terminal.cols || 80, rows: terminal.rows || 24 });
      joinedRef.current = true;
      setTimeout(()=>{ if (socket.connected) socket.emit('resize',{cols:terminal.cols,rows:terminal.rows}); },50);
    } catch (e) {
      console.error('Failed to join session with size', e);
    }
  }, [socket, terminal, sessionId, isConnected]);

  // Wire data + history handling
  useEffect(() => {
    if (!socket || !terminal || !sessionId) return;

    console.log('Setting up terminal data handlers');
    
    // Handle data from server
    const handleOutput = (data) => {
      if (!terminal || !terminal.element || !terminal.element.isConnected) {
        console.warn('Terminal not ready to receive output');
        return;
      }
      
      console.log('Received output:', data);
      
      // Cek apakah ini adalah prompt shell yang baru
      const isNewPrompt = data.includes('┌──(') && data.includes('└─$');
      const isClearCommand = data.trim() === '\x1b[H\x1b[2J' || data.trim() === '\x1B[H\x1B[J';
      
      try {
        // Jika perintah clear, kita bersihkan terminal
        if (isClearCommand) {
          terminal.clear();
        }
        
        // Tulis output ke terminal
        terminal.write(data);

        // Incrementally update aggregate cache & localStorage (throttled)
        const disableLocal = process.env.NEXT_PUBLIC_DISABLE_LOCAL_CACHE === '1';
        if(!disableLocal){
          try {
            aggregateCacheRef.current += data;
            const now = Date.now();
            if (!pendingCacheWriteRef.current && (now - lastCacheWriteRef.current > 500 || aggregateCacheRef.current.length - cachedLengthRef.current > 8192)) {
              pendingCacheWriteRef.current = true;
              lastCacheWriteRef.current = now;
              const snapshot = aggregateCacheRef.current;
              setTimeout(() => {
                try {
                  localStorage.setItem('terminalCache:'+sessionId, snapshot);
                  cachedLengthRef.current = snapshot.length;
                } catch {}
                pendingCacheWriteRef.current = false;
              }, 50);
            }
          } catch {}
        }
        
        // Focus terminal setelah menerima data untuk memastikan input keyboard berfungsi
        setTimeout(() => terminal.focus(), 10);
        
        // Jika ini adalah prompt baru (command selesai), minta server untuk menyimpan history
        if (isNewPrompt && socket && socket.connected) {
          socket.emit('save-history', sessionId);
        }
      } catch (err) {
        console.error('Error handling output:', err);
      }
    };

    // Additional connected event
    const handleConnected = () => {
      // Server akan push history sendiri (kita tidak spam permintaan)
      terminal.focus();
    };
    
    // History replay (simple, no prompt trimming, no auto-enter)
    const handleHistory = (history) => {
      if (!terminal || !history) return;
      const hasContent = (history.raw && history.raw.length) || (history.lines && history.lines.length);
      if (!hasContent) return; // abaikan kosong supaya tidak spam
      if (historyAppliedRef.current && cachePrefilledRef.current && history.raw) {
        // Apply only delta if server raw is longer than cached
        if (history.raw.length > cachedLengthRef.current) {
          const appendPart = history.raw.slice(cachedLengthRef.current);
          if (appendPart.length) {
            terminal.write(appendPart);
            cachedLengthRef.current = history.raw.length;
      const disableLocal = process.env.NEXT_PUBLIC_DISABLE_LOCAL_CACHE === '1';
      if(!disableLocal){ try { localStorage.setItem('terminalCache:'+sessionId, history.raw); } catch {} }
          }
        }
        return; // skip full rewrite
      }
      try {
        console.log('[HISTORY] Received history event', {
          rawLen: history.raw ? history.raw.length : 0,
          lines: history.lines ? history.lines.length : 0,
          applied: historyAppliedRef.current
        });
        // Jangan clear: langsung tulis kalau belum pernah diterapkan
        if (!historyAppliedRef.current) {
          if (history.raw && history.raw.length) {
            terminal.write(history.raw);
          } else if (history.lines && history.lines.length) {
            terminal.write(history.lines.join('\r\n')+'\r\n');
          }
        }
        historyAppliedRef.current = true;
        // Cache ke localStorage untuk instant reuse
        try {
          if (history.raw && history.raw.length) {
            const disableLocal = process.env.NEXT_PUBLIC_DISABLE_LOCAL_CACHE === '1';
            if(!disableLocal){ localStorage.setItem('terminalCache:'+sessionId, history.raw); }
            cachedLengthRef.current = history.raw.length;
            cachePrefilledRef.current = false; // now replaced by authoritative history
          } else if (history.lines && history.lines.length) {
            const disableLocal2 = process.env.NEXT_PUBLIC_DISABLE_LOCAL_CACHE === '1';
            if(!disableLocal2){ localStorage.setItem('terminalCache:'+sessionId, history.lines.join('\n')); }
            cachedLengthRef.current = (history.lines.join('\n')).length;
            cachePrefilledRef.current = false;
          }
        } catch {}
        setTimeout(()=>terminal.focus(),30);
      } catch (e) {
        console.error('Failed to replay history', e);
      }
    };

    socket.on('output', handleOutput);
    socket.on('connected', handleConnected);
    socket.on('history', handleHistory);
    // Hard clear event from server (wipe everything)
    const handleHardClear = () => {
      try {
        console.log('[HARD-CLEAR] Received hard-clear event');
        terminal.clear();
        historyAppliedRef.current = false; // allow future history replay if any new appears
  cachePrefilledRef.current = false;
  cachedLengthRef.current = 0;
  aggregateCacheRef.current = '';
        try { localStorage.removeItem('terminalCache:'+sessionId); } catch {}
      } catch (e) {
        console.error('Failed to process hard-clear', e);
      }
    };
    socket.on('hard-clear', handleHardClear);
    
    // Event handler untuk konfirmasi penyimpanan history
    socket.on('history-saved', (response) => {
      console.log('History saved confirmation:', response);
    });

    // Listen for user input with better logging
    const dataHandler = (data) => {
      const charCode = data.charCodeAt(0);
      const char = JSON.stringify(data);
      console.log(`Sending input to server: ${char}, charCode: ${charCode}`);
      
      if (socket && socket.connected) {
        // Kirim input ke server
        socket.emit('input', data);
        
        // Jika user menekan Enter, mungkin itu adalah perintah yang selesai dijalankan
        if (data === '\r') {
          // Tidak perlu menyimpan history di sisi klien karena sudah ditangani server
          
          // Fokuskan terminal setelah perintah dijalankan
          setTimeout(() => terminal.focus(), 10);
        }
      } else {
        console.error('Socket not connected, cannot send input');
        terminal.write('\r\n\x1b[31mNot connected to server!\x1b[0m\r\n');
      }
    };
    
    terminal.onData(dataHandler);

    // Handle terminal resize
    if (socket.connected && terminal.element && terminal.element.isConnected) {
      try {
        const dimensions = { cols: terminal.cols, rows: terminal.rows };
        // Pastikan dimensi valid sebelum mengirimnya
        if (dimensions.cols > 0 && dimensions.rows > 0) {
          socket.emit('resize', dimensions);
          console.log('Initial terminal size set:', dimensions);
        } else {
          console.log('Waiting for valid terminal dimensions...');
          // Coba sekali lagi setelah beberapa saat jika dimensi belum valid
          setTimeout(() => {
            if (terminal.cols > 0 && terminal.rows > 0) {
              socket.emit('resize', { cols: terminal.cols, rows: terminal.rows });
              console.log('Delayed terminal size set:', { cols: terminal.cols, rows: terminal.rows });
            }
          }, 500);
        }
      } catch (e) {
        console.error('Error sending initial terminal size:', e);
      }
    }

    return () => {
      console.log('Cleaning up terminal handlers');
      socket.off('output', handleOutput);
      socket.off('connected', handleConnected);
  socket.off('history', handleHistory);
  socket.off('hard-clear');
      // We don't need to remove the onData handler as it's tied to the terminal instance
      // which will be disposed in the cleanup of the second effect
    };
  }, [socket, terminal, sessionId]);

  // Function to focus terminal when clicked
  const handleTerminalClick = React.useCallback(() => {
    if (terminal) {
      terminal.focus();
      console.log('Terminal clicked and focused via React handler');
    }
  }, [terminal]);
  
  // Add a function to detect and fix terminal output issues
  const detectAndFixOutputIssues = React.useCallback(() => {
    if (!terminal) return;
    
    try {
      // Check if terminal has duplicated prompts (a sign of display issues)
      let duplicatedPrompts = 0;
      let lastLine = '';
      
      for (let i = 0; i < terminal.buffer.active.length; i++) {
        const line = terminal.buffer.active.getLine(i);
        if (!line) continue;
        
        const lineContent = line.translateToString();
        if (lineContent.includes('└─$') && lastLine.includes('└─$')) {
          duplicatedPrompts++;
        }
        lastLine = lineContent;
      }
      
      // If we detect more than 2 consecutive prompts, it's likely a display issue
      if (duplicatedPrompts > 2) {
        console.log('Detected terminal display issues, auto-fixing...');
        // Clear terminal and send a clear command to fix the display
        terminal.clear();
        if (socket && socket.connected) {
          socket.emit('input', 'clear\r');
        }
        return true;
      }
      
      return false;
    } catch (e) {
      console.error('Error checking terminal output:', e);
      return false;
    }
  }, [terminal, socket]);
  
  // Add periodic check for terminal issues (run every 10 seconds)
  useEffect(() => {
    if (!terminal || !socket || !isConnected) return;
    
    const intervalId = setInterval(() => {
      detectAndFixOutputIssues();
    }, 10000);
    
    return () => clearInterval(intervalId);
  }, [terminal, socket, isConnected, detectAndFixOutputIssues]);

  // Function to reset terminal
  const handleResetTerminal = React.useCallback(async () => {
    if (terminal && socket && socket.connected) {
      console.log('Resetting terminal...');
      
      // Bersihkan terminal di sisi klien terlebih dahulu
      terminal.clear();
      
      // Kirim perintah clear ke server
      socket.emit('input', 'clear\r');
      
      // Fokus terminal setelah reset
      setTimeout(() => terminal.focus(), 100);
    }
  }, [socket, terminal]);

  return (
    <div className="flex flex-col w-full h-full">
      {!zen && (
        <div className="px-3 py-1 bg-gray-900 text-white text-[11px] font-mono flex items-center justify-between border-b border-gray-800 select-none">
          <span>Session: {sessionId}</span>
          <div className="flex items-center">
            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
            <button
              className="ml-4 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
              onClick={handleResetTerminal}
            >Reset</button>
          </div>
        </div>
      )}
      <div
        ref={terminalRef}
        className="flex-grow bg-black cursor-text font-mono text-[13px] leading-snug"
        style={{ width: '100%', position: 'relative', minHeight: 0 }}
        onClick={handleTerminalClick}
        tabIndex="0"
      >
        {!isConnected && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-80 z-10">
            <div className="text-white">Connecting to terminal...</div>
          </div>
        )}
      </div>
    </div>
  );
}

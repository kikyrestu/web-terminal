import { createServer } from 'http';
import fs from 'fs';
import path from 'path';

// If DEBUG_AUTH and no .env file but .env.example exists, attempt to load key lines (for local debug only)
if(process.env.DEBUG_AUTH === '1'){
  const envPath = path.join(process.cwd(), '.env');
  if(!fs.existsSync(envPath)){
    const examplePath = path.join(process.cwd(), '.env.example');
    if(fs.existsSync(examplePath)){
      try {
        const content = fs.readFileSync(examplePath,'utf8');
        content.split(/\r?\n/).forEach(line=>{
          if(!line || line.startsWith('#')) return;
          const eq = line.indexOf('=');
          if(eq === -1) return;
            const key = line.slice(0,eq).trim();
            const val = line.slice(eq+1).trim();
            if(!process.env[key]){
              process.env[key]=val;
            }
        });
        console.log('[AUTH DEBUG] Loaded vars from .env.example (fallback)');
      } catch(e){
        console.log('[AUTH DEBUG] Failed reading .env.example', e.message);
      }
    }
  }
}
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import os from 'os';
import { spawn } from 'node-pty';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ESM-specific features
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import history manager
import * as historyManager from './terminal-history-manager.js';

const dev = process.env.NODE_ENV !== 'production';
const port = process.env.PORT || 3001; // Changed to port 3001 as default

// Early auth / CORS debug (before Next prepares) when DEBUG_AUTH=1
if (process.env.DEBUG_AUTH === '1') {
  console.log('[AUTH DEBUG START]', {
    AUTH_USER: process.env.AUTH_USER || '(default admin)',
    hasHash: !!process.env.AUTH_PASS_HASH,
    hashPrefix: process.env.AUTH_PASS_HASH ? process.env.AUTH_PASS_HASH.slice(0, 20) : null,
    hasPlain: !!process.env.AUTH_PASS_PLAIN,
    ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || '*',
    NODE_ENV: process.env.NODE_ENV
  });
}

// Prepare the Next.js app
const app = next({ dev });
const handle = app.getRequestHandler();

// Store terminal sessions
const sessions = new Map();

function getDefaultShell() {
  return process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';
}

function getHomeDir() {
  return os.homedir();
}

app.prepare().then(() => {
  // Create HTTP server
  const server = createServer((req, res) => {
    try {
      // Parse the request URL
      const parsedUrl = parse(req.url, true);
      
      // Log incoming requests for debugging
      console.log(`Request received: ${req.method} ${parsedUrl.pathname}`);
      
      // Let Next.js handle the request
      handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });
  
  // Initialize Socket.IO server
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  const io = new Server(server, {
    path: '/socket.io',
    cors: {
      origin: allowedOrigin,
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });
  
  // Handle Socket.IO connections
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    // Simple auth check based on cookie set by Next.js login route
    try {
      const cookieHeader = socket.request.headers.cookie || '';
      const authed = /(?:^|; )auth=1/.test(cookieHeader);
      if (!authed) {
        console.log('Unauthorized socket -> disconnect');
        socket.emit('auth-error', { message: 'Not authenticated' });
        socket.disconnect(true);
        return;
      }
    } catch (e) { console.error('Auth check error', e); }
    
  socket.on('join-session', (payload) => {
      const sessionId = typeof payload === 'string' ? payload : payload.sessionId;
      const initialCols = typeof payload === 'object' && payload ? payload.cols : undefined;
      const initialRows = typeof payload === 'object' && payload ? payload.rows : undefined;
      console.log(`Client ${socket.id} joining session ${sessionId} ${initialCols && initialRows ? `(size ${initialCols}x${initialRows})` : ''}`);
      socket.join(sessionId);
      
      if (!sessions.has(sessionId)) {
  const shell = getDefaultShell();
  const homeDir = getHomeDir();
        // Cek apakah sudah ada history di disk (persisted from previous server run)
        let existingHistory = null;
        try {
          existingHistory = historyManager.getTerminalHistory(sessionId);
          if (existingHistory) {
            console.log(`[JOIN] Found existing persisted history for new pty session ${sessionId} (raw length: ${(existingHistory.raw||'').length})`);
          }
        } catch (e) {
          console.error('Error preloading existing history:', e);
        }
        
        try {
          const term = spawn(shell, [], {
            name: 'xterm-color',
            cwd: homeDir,
            env: process.env,
            cols: initialCols || 80,  // Use client provided size if available
            rows: initialRows || 24
          });
          
          const maxBuffer = parseInt(process.env.TERMINAL_MEMORY_BUFFER_MAX || '5242880', 10); // ~5MB default
          sessions.set(sessionId, {
            pty: term,
            clients: new Set([socket.id]),
            lastCommand: '',
            initialHistorySent: false,
            outputCaptured: false,
            buffer: existingHistory && existingHistory.raw ? existingHistory.raw : '',
            maxBuffer
          });
          const sessionRef = sessions.get(sessionId);
          
          term.onData(data => {
            io.to(sessionId).emit('output', data);
            if (data && data.length > 0) {
              sessionRef.outputCaptured = true;
              // Append to in-memory buffer
              sessionRef.buffer += data;
              if (sessionRef.buffer.length > sessionRef.maxBuffer) {
                sessionRef.buffer = sessionRef.buffer.slice(-sessionRef.maxBuffer);
              }
              // Persist async (still using existing manager)
              historyManager.appendTerminalOutput(sessionId, data);
              if (!sessionRef.initialHistorySent) {
                sendInitialHistory();
              }
            }
          });
          
          term.onExit(({ exitCode, signal }) => {
            console.log(`Terminal for session ${sessionId} exited`);
            sessions.delete(sessionId);
            io.to(sessionId).emit('exit', { exitCode, signal });
          });
          
          // Fungsi untuk kirim connected + history sekali saja
          const sendInitialHistory = () => {
            const s = sessions.get(sessionId);
            if (!s || s.initialHistorySent) return;
            s.initialHistorySent = true;
            io.to(sessionId).emit('connected', { sessionId });
            // Gunakan buffer in-memory untuk instant replay.
            if (s.buffer && s.buffer.length) {
              io.to(sessionId).emit('history', { raw: s.buffer, lines: [], commands: [] });
            } else if (existingHistory && ((existingHistory.raw && existingHistory.raw.length) || (existingHistory.lines && existingHistory.lines.length))) {
              // Fallback to existingHistory if buffer empty (unlikely)
              io.to(sessionId).emit('history', existingHistory);
            }
          };
          // Kalau sudah ada existingHistory (persisted) dan ada isinya, kirim cepat; kalau belum tunggu output atau fallback timeout 150ms
          if (existingHistory && ((existingHistory.raw && existingHistory.raw.length) || (existingHistory.lines && existingHistory.lines.length))) {
            sendInitialHistory();
          } else {
            setTimeout(() => {
              const s = sessions.get(sessionId);
              if (s && !s.initialHistorySent) sendInitialHistory();
            }, 150);
          }
        } catch (err) {
          console.error('Failed to create terminal:', err);
          socket.emit('error', { message: 'Failed to create terminal' });
        }
      } else {
        // Add client to existing session
        const existing = sessions.get(sessionId);
        existing.clients.add(socket.id);
  // Jangan kirim banner apapun agar tidak menambah prompt duplikat
        // Kirim buffer in-memory langsung (instant replay multi-tab)
        if (existing.buffer && existing.buffer.length) {
          socket.emit('connected', { sessionId });
          socket.emit('history', { raw: existing.buffer, lines: [], commands: [] });
        } else {
          socket.emit('connected', { sessionId });
        }
      }
    });
    
    socket.on('input', (data) => {
      for (const [sessionId, session] of sessions.entries()) {
        if (session.clients.has(socket.id)) {
          try {
            console.log(`Received input from client ${socket.id}: ${JSON.stringify(data)}`);
            
            // Buffer karakter untuk command (kecuali kita intercept Enter lebih dulu)
            if (data === '\u007F' || data === '\b') {
              session.lastCommand = session.lastCommand.slice(0, -1);
            } else if (data !== '\r') {
              session.lastCommand += data;
            } else if (data === '\r') {
              const completed = session.lastCommand.trim();
              if (completed) {
                try {
                  historyManager.appendTerminalOutput(sessionId, '', completed);
                  console.log(`Saved command to history: ${completed}`);
                } catch (e) { console.error('Error saving command to history:', e); }
              }
              // Hard clear: benar-benar hapus history & buffer saat user ketik 'clear'
              if (completed === 'clear') {
                try {
                  console.log('Hard clear invoked -> wiping in-memory buffer & persisted file');
                  // Hapus file history
                  historyManager.clearTerminalHistory(sessionId);
                  // Reset buffer in-memory
                  session.buffer = '';
                  // Beri tahu semua client di session untuk hard clear + hapus cache lokal
                  io.to(sessionId).emit('hard-clear', { sessionId, timestamp: Date.now() });
                } catch (e) {
                  console.error('Error performing hard clear', e);
                }
              }
              session.lastCommand = '';
            }
            
            // Kirim input ke terminal
            session.pty.write(data);
          } catch (err) {
            console.error('Error writing to terminal:', err);
            socket.emit('output', `\r\n\x1b[31mError processing input: ${err.message}\x1b[0m\r\n`);
          }
          break;
        }
      }
    });
    
    socket.on('resize', ({ cols, rows }) => {
      for (const [sessionId, session] of sessions.entries()) {
        if (session.clients.has(socket.id)) {
          try {
            session.pty.resize(cols, rows);
          } catch (err) {
            console.error('Error resizing terminal:', err);
          }
          break;
        }
      }
    });
    
    // Event untuk perintah langsung dari client
    socket.on('save-history', (sessionId) => {
      try {
        // Catat bahwa client meminta penyimpanan history
        console.log(`Client ${socket.id} requested history save for session ${sessionId}`);
        
        // Periksa apakah session ada
        const session = sessions.get(sessionId);
        if (!session) {
          console.log(`Session ${sessionId} not found`);
          return;
        }
        
        // Force simpan history saat ini (biasanya untuk refresh halaman)
        const history = historyManager.getTerminalHistory(sessionId);
        if (history) {
          // Kirim kembali ke client yang meminta sebagai konfirmasi
          socket.emit('history-saved', { success: true, timestamp: Date.now() });
        }
      } catch (err) {
        console.error(`Error saving history for session ${sessionId}:`, err);
        socket.emit('history-saved', { success: false, error: err.message });
      }
    });
    
    // Event untuk meminta history terminal
    socket.on('get-history', (sessionId) => {
      try {
        console.log(`Client ${socket.id} requested history for session ${sessionId}`);
        const history = historyManager.getTerminalHistory(sessionId);
        if (history) {
          socket.emit('history', history);
        } else {
          socket.emit('history', { lines: [], commands: [], timestamp: Date.now() });
        }
      } catch (err) {
        console.error(`Error getting history for session ${sessionId}:`, err);
        socket.emit('history', { lines: [], commands: [], timestamp: Date.now(), error: err.message });
      }
    });
    
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      
      for (const [sessionId, session] of sessions.entries()) {
        if (session.clients.has(socket.id)) {
          session.clients.delete(socket.id);
          console.log(`Clients remaining in session ${sessionId}: ${session.clients.size}`);
        }
      }
    });
  });
  
  // Start the server
  server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
  });
});

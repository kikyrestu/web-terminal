import { Server } from 'socket.io';
import os from 'os';
import { spawn } from 'node-pty';

// Mapping of session IDs to terminal processes
const sessions = new Map();

function getDefaultShell() {
  return process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';
}

function getHomeDir() {
  return os.homedir();
}

// Keep track of the Socket.IO server instance
let io;

export function getSocketIOServer() {
  if (!io) {
    console.log('Creating new Socket.IO server instance');
    io = new Server({
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
      }
    });

    // Initialize Socket.IO event handlers
    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);
      
      socket.on('join-session', (sessionId) => {
        console.log(`Client ${socket.id} joining session ${sessionId}`);
        
        socket.join(sessionId);
        
        // Create new terminal process if it doesn't exist
        if (!sessions.has(sessionId)) {
          const shell = getDefaultShell();
          const homeDir = getHomeDir();
          
          console.log(`Starting new terminal process with ${shell} in ${homeDir}`);
          
          try {
            const term = spawn(shell, [], {
              name: 'xterm-color',
              cwd: homeDir,
              env: process.env,
            });
            
            sessions.set(sessionId, {
              pty: term,
              clients: new Set([socket.id]),
            });
            
            // Handle terminal output
            term.onData((data) => {
              io.to(sessionId).emit('output', data);
            });
            
            // Handle terminal exit
            term.onExit(({ exitCode, signal }) => {
              console.log(`Terminal process for session ${sessionId} exited with code ${exitCode} and signal ${signal}`);
              sessions.delete(sessionId);
              io.to(sessionId).emit('exit', { exitCode, signal });
            });
          } catch (error) {
            console.error('Error creating terminal process:', error);
            socket.emit('error', { message: 'Failed to create terminal process' });
          }
        } else {
          // Add client to existing session
          const session = sessions.get(sessionId);
          session.clients.add(socket.id);
        }
      });
      
      // Handle user input
      socket.on('input', (data) => {
        // Find session this socket belongs to
        for (const [sessionId, session] of sessions.entries()) {
          if (session.clients.has(socket.id)) {
            try {
              session.pty.write(data);
            } catch (err) {
              console.error('Error writing to terminal:', err);
            }
            break;
          }
        }
      });
      
      // Handle terminal resize
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
      
      // Handle disconnection
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        
        // Remove client from sessions
        for (const [sessionId, session] of sessions.entries()) {
          if (session.clients.has(socket.id)) {
            session.clients.delete(socket.id);
            
            // If no clients are connected to this session, keep the process 
            // running for potential reconnection
            console.log(`Clients remaining in session ${sessionId}: ${session.clients.size}`);
          }
        }
      });
    });
  }
  
  return io;
}

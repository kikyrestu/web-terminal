import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ESM-specific features
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Direktori untuk menyimpan history terminal
const HISTORY_DIR = path.join(__dirname, 'terminal-history');

// Pastikan direktori history ada
if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

/**
 * Simpan history terminal ke file
 * @param {string} sessionId - ID sesi terminal
 * @param {object} history - Data history yang akan disimpan
 */
function saveTerminalHistory(sessionId, history) {
  try {
    const filePath = path.join(HISTORY_DIR, `${sessionId}.json`);
    console.log(`[DEBUG] Saving history to file: ${filePath}`);
    console.log(`[DEBUG] History data: ${JSON.stringify(history).substring(0, 100)}...`);
    fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
    console.log(`[DEBUG] History saved successfully`);
    return true;
  } catch (err) {
    console.error(`Error saving terminal history for session ${sessionId}:`, err);
    return false;
  }
}

/**
 * Ambil history terminal dari file
 * @param {string} sessionId - ID sesi terminal
 * @returns {object|null} - Data history atau null jika tidak ditemukan
 */
function getTerminalHistory(sessionId) {
  try {
    const filePath = path.join(HISTORY_DIR, `${sessionId}.json`);
    console.log(`[DEBUG] Getting history from file: ${filePath}`);
    
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
  const history = JSON.parse(data);
  // Tambahkan default jika field hilang (misal setelah clear lama)
  if (!Array.isArray(history.lines)) history.lines = [];
  if (!Array.isArray(history.commands)) history.commands = [];
  if (typeof history.raw !== 'string') history.raw = '';
  if (!history.timestamp) history.timestamp = Date.now();
      // Rekonstruksi raw jika kosong tapi ada lines (legacy file sebelum field raw disimpan)
      if ((!history.raw || history.raw.length === 0) && history.lines.length > 0) {
        history.raw = history.lines.join('\n') + '\n';
        console.log('[DEBUG] Reconstructed raw from lines for legacy history');
        // Simpan kembali agar next time tidak perlu rekonstruksi
        try { fs.writeFileSync(filePath, JSON.stringify(history, null, 2)); } catch {}
      }
  console.log(`[DEBUG] History loaded: raw=${history.raw.length} chars, lines=${history.lines.length}, commands=${history.commands.length}`);
  return history;
    }
    
    console.log(`[DEBUG] No history file exists for session ${sessionId}`);
    return null;
  } catch (err) {
    console.error(`Error loading terminal history for session ${sessionId}:`, err);
    return null;
  }
}

/**
 * Tambahkan output baru ke history terminal
 * @param {string} sessionId - ID sesi terminal
 * @param {string} output - Output yang akan ditambahkan
 * @param {string} command - Perintah yang dijalankan (opsional)
 */
function appendTerminalOutput(sessionId, output, command = null) {
  try {
    console.log(`[DEBUG] Appending output for session ${sessionId}, output length: ${output ? output.length : 0}, command: ${command || 'none'}`);
    
    let history = getTerminalHistory(sessionId) || {
      lines: [],
      commands: [],
      raw: '',
      timestamp: Date.now()
    };

    console.log(`[DEBUG] Current history for session ${sessionId}: ${history.lines.length} lines, ${history.commands.length} commands`);

    if (output) {
      const CLEAR_REGEX = /(\x1b\[H\x1b\[2J|\x1b\[2J\x1b\[H|\x1b\[H\x1b\[J|\x1b\[2J)/g;
      let safeOutput = output.replace(CLEAR_REGEX, '');
      safeOutput = safeOutput.replace(/\r(?=[^\n])/g, '\n');
      history.raw = (history.raw || '') + safeOutput;
      const unlimited = process.env.TERMINAL_HISTORY_UNLIMITED === '1';
      const MAX_RAW = unlimited ? Number.MAX_SAFE_INTEGER : parseInt(process.env.TERMINAL_HISTORY_MAX_RAW || '5242880', 10); // default ~5MB
      if (!unlimited && history.raw.length > MAX_RAW) {
        history.raw = history.raw.slice(-MAX_RAW);
        history.truncated = true;
        history.truncatedAt = Date.now();
      }

      const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').replace(/\u001b\][^\u0007]*\u0007/g,'');
      const outputLines = safeOutput.split(/\r?\n/).filter(line => {
        const plain = stripAnsi(line).trim();
        if (!plain) return false;
        return true; // keep prompts now
      });
      if (outputLines.length) {
        if (unlimited) {
          history.lines.push(...outputLines);
        } else {
          history.lines = [...history.lines, ...outputLines].slice(-5000);
        }
        console.log(`[DEBUG] Added ${outputLines.length} lines to history (total ${history.lines.length}${unlimited ? ' unlimited' : ''})`);
      }
    }

    // Tambahkan command jika ada
    if (command && command.trim()) {
      history.commands.push({
        text: command.trim(),
        timestamp: Date.now()
      });
      // Simpan maksimal 100 command terakhir
      history.commands = history.commands.slice(-100);
      console.log(`[DEBUG] Added command "${command.trim()}" to history`);
    }

    history.timestamp = Date.now();
    
    // Simpan history
    const saved = saveTerminalHistory(sessionId, history);
    console.log(`[DEBUG] History saved for session ${sessionId}: ${saved ? 'success' : 'failed'}`);
    
    return true;
  } catch (err) {
    console.error(`Error appending terminal output for session ${sessionId}:`, err);
    return false;
  }
}

/**
 * Bersihkan history terminal
 * @param {string} sessionId - ID sesi terminal 
 */
function clearTerminalHistory(sessionId) {
  try {
    const filePath = path.join(HISTORY_DIR, `${sessionId}.json`);
    if (fs.existsSync(filePath)) {
      // Buat history baru yang kosong dengan timestamp saat ini
      const emptyHistory = {
        lines: [],
        commands: [],
  raw: '',
        timestamp: Date.now(),
        cleared: true
      };
      fs.writeFileSync(filePath, JSON.stringify(emptyHistory, null, 2));
    }
    return true;
  } catch (err) {
    console.error(`Error clearing terminal history for session ${sessionId}:`, err);
    return false;
  }
}

export {
  saveTerminalHistory,
  getTerminalHistory,
  appendTerminalOutput,
  clearTerminalHistory
};

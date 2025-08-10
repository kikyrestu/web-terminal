# Web Terminal

Aplikasi terminal web interaktif dengan fitur persistensi sesi dan kompatibilitas multi-platform.

## Fitur

- Terminal interaktif berbasis browser (xterm.js + node-pty)
- Persistensi output terminal (reload & pindah device)
- Session nempel ke user (per-user deterministic session) – semua browser user sama join PTY sama
- Opsi shared global session via env flags
- Hard clear (command `clear` hapus buffer + file)
- Auth via ENV (bcrypt hash / plain dev)
- Unlimited history mode + in-memory rolling buffer

## Teknologi yang Digunakan

- Next.js 15
- React 19
- Socket.IO untuk komunikasi real-time
- node-pty untuk emulasi terminal
- xterm.js untuk UI terminal
- Tailwind CSS untuk styling

## Cara Menggunakan

1. Clone repositori
2. Install dependensi:
   ```
   npm install
   ```
3. Jalankan aplikasi:
   ```
   npm run dev
   ```
4. Buka browser di http://localhost:3000

Server Socket.IO akan berjalan di port 3001 untuk menangani komunikasi WebSocket.

## Arsitektur

Aplikasi ini terdiri dari dua bagian utama:

1. **Front-end (Browser)**:
   - Komponen Terminal berbasis xterm.js
   - Koneksi Socket.IO ke server
   - Penanganan input dan output terminal
   - Penyimpanan output terminal di localStorage untuk persistensi

2. **Back-end (Server)**:
   - Server Socket.IO terpisah di port 3001
   - Emulasi terminal menggunakan node-pty
   - Penanganan koneksi dan sesi terminal

## Persistensi Data

- Server menyimpan raw output ke file per session + buffer in-memory
- Client tidak wajib localStorage (bisa dimatikan: `NEXT_PUBLIC_DISABLE_LOCAL_CACHE=1`)
- Session ID per user: `user-<username>-session`
- Shared mode (semua user/browser satu PTY) jika: `NEXT_PUBLIC_FORCE_SHARED_SESSION=1`

## Pengembangan Lebih Lanjut

Ide lanjutan:
- Multi-session per user (misal user-admin-session-1..n)
- RBAC / multiple users table
- Rate limit input / flood protection
- Audit log command (append-only)
- Web SSH passthrough / container attach

## Autentikasi & ENV

Login sekarang memakai ENV:

Wajib set sebelum start (production):
```
AUTH_USER=admin
AUTH_PASS_HASH=$2a$10$YcKuGy0Nm.ZKkDYfA6/m/.6jJwwyN9lWI7UTz0kbXXniZ5iKpV5/m
```
Hash di atas adalah contoh untuk sebuah password contoh (jangan pakai di produksi!). Ganti dengan hash password kamu sendiri.

Generate hash baru:
```
node -e "import('bcryptjs').then(m=>{const b=m.default||m; b.hash('PasswordBaru',10).then(h=>console.log(h))})"
```

Mode dev sementara bisa pakai (jangan di production):
```
AUTH_PASS_PLAIN=PasswordBaru
```

## CORS / Origin

Batasi asal koneksi WebSocket / API:
```
ALLOWED_ORIGIN=https://domainkamu.com
```
Gunakan `*` hanya untuk lokal/testing.

## History / Buffer

```
TERMINAL_HISTORY_UNLIMITED=1            # simpan semua raw
TERMINAL_MEMORY_BUFFER_MAX=10485760     # 10MB buffer in-memory (atur sesuai RAM)
# TERMINAL_HISTORY_MAX_RAW=5242880      # aktif jika unlimited dimatikan
```

## File .env contoh
Lihat `.env.example` dan salin menjadi `.env`.

## Deployment Cepat (Produksi)

```
npm install --production
npm run build
NODE_ENV=production pm2 start server.js --name webterm
```

Nginx (cuplikan):
```
location /socket.io/ {
   proxy_pass http://127.0.0.1:3001;
   proxy_http_version 1.1;
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection "upgrade";
   proxy_set_header Host $host;
   proxy_read_timeout 600s;
}
location / {
   proxy_pass http://127.0.0.1:3001;
   proxy_set_header Host $host;
}
```

## Keamanan Minimum

- Ganti hash default
- Jangan commit `.env`
- Folder `terminal-history` permission 750, owner user proses
- Pakai HTTPS (Let’s Encrypt) di reverse proxy

## Hard Clear

Command `clear` sekarang menghapus seluruh history (file + buffer). Reload tidak mengembalikan output lama.

## GitHub / CI

Contoh GitHub Actions (buat `.github/workflows/ci.yml`):
```yaml
name: CI
on: [push, pull_request]
jobs:
   build:
      runs-on: ubuntu-latest
      steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
            with:
               node-version: 20
               cache: npm
         - run: npm ci
         - run: npm run build
```

## Variabel Lingkungan Tambahan
```
NEXT_PUBLIC_FORCE_SHARED_SESSION=1          # Global single PTY (opsional)
NEXT_PUBLIC_SHARED_SESSION_ID=main-session  # Nama session global
NEXT_PUBLIC_DISABLE_LOCAL_CACHE=1           # Matikan cache localStorage
NEXT_PUBLIC_SOCKET_URL=https://domainkamu.com  # Override base URL socket kalau beda port / domain
```

Pastikan untuk mengganti password/hash default sebelum publish publik.

## Otomatisasi Nginx Reverse Proxy
Gunakan helper script (Debian/Ubuntu):
```
sudo bash scripts/nginx-proxy-setup.sh
```
Langkah otomatis:
1. Tanya domain & port internal
2. Buat server block HTTP + proxy WebSocket
3. (Opsional) aktifkan gzip
4. (Opsional) jalankan certbot untuk HTTPS
5. Cetak ENV yang perlu diset

Set `.env` setelah selesai:
```
ALLOWED_ORIGIN=https://domainmu
NEXT_PUBLIC_SOCKET_URL=https://domainmu
```

Ulangi script untuk overwrite konfigurasi.

## One-Shot Setup (Interaktif)
Setelah clone repo di server produksi:
```
chmod +x ./setup-webterminal
./setup-webterminal
```
Script akan:
1. Tanya domain (opsional), port, username, password
2. Generate bcrypt hash (fallback ke plain jika gagal)
3. Buat `.env` aman (chmod 600)
4. Install dependencies + build
5. (Opsional) start via pm2
6. (Opsional) wizard Nginx + SSL

Ulangi script untuk re-konfigurasi (backup `.env` lama otomatis).


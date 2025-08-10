#!/usr/bin/env bash
set -euo pipefail

echo "=== Web Terminal Nginx Reverse Proxy Setup ==="
if [[ $EUID -ne 0 ]]; then
  echo "[ERROR] Jalankan script ini sebagai root (sudo)." >&2
  exit 1
fi

OS=$(awk -F= '/^ID=/{print $2}' /etc/os-release | tr -d '"')
if [[ "$OS" != "ubuntu" && "$OS" != "debian" ]]; then
  echo "[WARN] Script diuji pada Debian/Ubuntu. Lanjutkan? (y/n)"; read -r ans; [[ $ans == y* ]] || exit 1
fi

command -v nginx >/dev/null || { echo "[INFO] Menginstall nginx"; apt update && apt install -y nginx; }

read -rp "Masukkan hostname/domain (contoh: terminal.example.com): " DOMAIN
[[ -z "$DOMAIN" ]] && { echo "[ERROR] Domain wajib diisi"; exit 1; }

read -rp "Port internal aplikasi (default 3001): " PORT
PORT=${PORT:-3001}

read -rp "Enable gzip? (Y/n): " GZIP
GZIP=${GZIP:-Y}

read -rp "Pasang Let's Encrypt sekarang? (Y/n): " SSL
SSL=${SSL:-Y}

SITE_FILE="/etc/nginx/sites-available/${DOMAIN}.conf"
ENABLED_LINK="/etc/nginx/sites-enabled/${DOMAIN}.conf"

if [[ -f "$SITE_FILE" ]]; then
  echo "[INFO] Konfigurasi lama ditemukan: $SITE_FILE"
  read -rp "Backup & overwrite? (Y/n): " OVER
  OVER=${OVER:-Y}
  if [[ ! $OVER =~ ^[Yy]$ ]]; then
    echo "[ABORT] Tidak menimpa config. Keluar."; exit 0
  fi
  BK="$SITE_FILE.bak.$(date +%s)"
  cp "$SITE_FILE" "$BK"
  echo "[INFO] Backup disimpan: $BK"
fi

echo "[INFO] Menulis konfigurasi Nginx baru: $SITE_FILE"
cat > "$SITE_FILE" <<'EOF'
server {
  listen 80;
  server_name DOMAIN_PLACEHOLDER;
  # Setelah sertifikat & redirect HTTPS aktif, blok ini bisa diubah menjadi redirect 301.

  location /socket.io/ {
    proxy_pass http://127.0.0.1:PORT_PLACEHOLDER;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 600s;
  }

  location / {
    proxy_pass http://127.0.0.1:PORT_PLACEHOLDER;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
EOF

# Ganti placeholder
sed -i "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" "$SITE_FILE"
sed -i "s/PORT_PLACEHOLDER/${PORT}/g" "$SITE_FILE"

ln -sf "$SITE_FILE" "$ENABLED_LINK"

if nginx -t; then
  systemctl reload nginx
  echo "[OK] Nginx reloaded."
else
  echo "[ERROR] Konfigurasi Nginx invalid." >&2
  exit 1
fi

if [[ $GZIP =~ ^[Yy] ]]; then
  NGINX_MAIN=/etc/nginx/nginx.conf
  if ! grep -q "gzip_types" "$NGINX_MAIN"; then
    echo "[INFO] Menambahkan gzip config (jika belum)."
    awk '/http\s*{/ {print; print "    gzip on;\n    gzip_comp_level 6;\n    gzip_min_length 512;\n    gzip_vary on;\n    gzip_proxied any;\n    gzip_types text/plain text/css text/javascript application/javascript application/json application/xml application/xml+rss application/xhtml+xml application/wasm image/svg+xml font/ttf font/otf application/font-woff application/font-woff2;\n    gzip_disable \"msie6\";"; next} {print}' "$NGINX_MAIN" > /tmp/nginx.conf.new && mv /tmp/nginx.conf.new "$NGINX_MAIN"
    nginx -t && systemctl reload nginx || echo "[WARN] Gagal reload setelah gzip update"
  else
    echo "[INFO] Gzip sudah terkonfigurasi, skip."
  fi
fi

if [[ $SSL =~ ^[Yy] ]]; then
  CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
  if [[ -d "$CERT_DIR" && -f "$CERT_DIR/fullchain.pem" ]]; then
    echo "[INFO] Sertifikat sudah ada: $CERT_DIR"
    read -rp "Renew / reconfigure certbot sekarang? (y/N): " RENEW
    if [[ $RENEW =~ ^[Yy]$ ]]; then
      command -v certbot >/dev/null || { echo "[INFO] Install certbot"; apt install -y certbot python3-certbot-nginx; }
      certbot renew --nginx --dry-run || true
      certbot --nginx -d "$DOMAIN" --agree-tos --redirect --no-eff-email -m admin@${DOMAIN#*.} || echo "[WARN] Certbot re-run gagal." 
    else
      echo "[INFO] Lewati certbot (sertifikat sudah ada)."
    fi
  else
    command -v certbot >/dev/null || { echo "[INFO] Install certbot"; apt install -y certbot python3-certbot-nginx; }
    echo "[INFO] Menjalankan certbot pertama kali untuk domain ${DOMAIN}"
    certbot --nginx -d "$DOMAIN" --agree-tos --redirect --no-eff-email -m admin@${DOMAIN#*.} || echo "[WARN] Certbot gagal, jalankan manual: certbot --nginx -d $DOMAIN" 
  fi
fi

echo "\n=== Selesai ==="
echo "Set ENV app kamu misal:"
echo "  ALLOWED_ORIGIN=https://${DOMAIN}" 
echo "  NEXT_PUBLIC_SOCKET_URL=https://${DOMAIN}" 
echo "Restart aplikasi kalau sudah." 

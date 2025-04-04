# Telegram OpenRouter Bot 🤖

Solusi lengkap bot Telegram untuk berinteraksi dengan model AI melalui OpenRouter API, dibangun di platform Cloudflare Workers.

## ✨ Fitur Utama

### 🤖 Antarmuka Chat AI
- Terhubung ke 100+ model AI via OpenRouter
- Respons real-time dengan streaming
- Riwayat percakapan dan memori konteks
- System prompt yang bisa disesuaikan

### 🔒 Keamanan
- Autentikasi berbasis JWT
- Penyimpanan kredensial terenkripsi
- Cookie HttpOnly dan Secure
- Proteksi rate limiting
- Sistem blacklist token

### ⚡ Performa
- Komputasi edge via Cloudflare Workers
- Penyimpanan KV untuk akses cepat
- Skalasi otomatis
- Latensi rendah secara global

### 🌐 Dukungan Multi-bahasa
- Inggris (default)
- Lokalisasi Bahasa Indonesia
- Mudah menambah bahasa lain

## 🚀 Opsi Deployment

### Deploy Satu Klik
[![Deploy ke Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/adriandrmawan/Telegram-OpenRouter-Bot)

### Langkah Manual

1. **Prasyarat**
   - Node.js v16+
   - npm/yarn
   - Akun Cloudflare
   - Token bot Telegram

2. **Instalasi**
```bash
# Clone repository
git clone https://github.com/adriandrmawan/Telegram-OpenRouter-Bot.git.git
cd Telegram-OpenRouter-Bot

# Install dependencies
npm install

# Install Wrangler CLI
npm install -g wrangler
```

3. **Konfigurasi**
- Buat KV namespaces di dashboard Cloudflare:
  - USER_DATA
  - CACHE  
  - TOKEN_BLACKLIST
- Atur environment variables:
  - `TELEGRAM_BOT_TOKEN` (dari @BotFather)
  - `JWT_SECRET` (min 32 karakter acak)
  - `ALLOWED_USER_IDS` (ID Telegram dipisah koma)

4. **Deploy**
```bash
wrangler login
wrangler deploy
```

## 🛠 Detail Konfigurasi

### Variabel Wajib
| Variabel | Deskripsi | Contoh |
|----------|-----------|--------|
| TELEGRAM_BOT_TOKEN | Dari @BotFather | `123456:ABC-DEF1234` |
| JWT_SECRET | String acak untuk signing token | `kunci-rahasia-123` |
| ALLOWED_USER_IDS | ID Telegram yang diizinkan | `12345,67890` |

### Variabel Opsional
| Variabel | Deskripsi | Default |
|----------|-----------|---------|
| DEFAULT_MODEL | Model AI default | `openai/gpt-3.5-turbo` |
| DEFAULT_LANGUAGE | Bahasa antarmuka | `en` |

## 🤖 Perintah Bot

### Perintah Dasar
- `/start` - Inisialisasi bot
- `/help` - Tampilkan daftar perintah
- `/setkey API_KEY` - Simpan API Key OpenRouter

### Interaksi AI
- `/ask [pertanyaan]` - Tanya ke AI
- `/newchat` - Mulai percakapan baru
- `/changemodel` - Ganti model AI

### Pengaturan
- `/setsystemprompt` - Kustomisasi perilaku AI  
- `/setlang [en/id]` - Ganti bahasa
- `/togglesearch` - Aktifkan/nonaktifkan pencarian web
- `/managetoken` - Kelola token API Anda
- `/setpersona` - Pilih persona AI yang sudah ditentukan

## 🔒 Praktik Keamanan Terbaik

1. **Keamanan Token**
   - Gunakan JWT_SECRET panjang (min 32 karakter)
   - Rotasi secret secara berkala
   - Jangan commit secret ke git

2. **Kontrol Akses**
   - Batasi ke ID Telegram tertentu
   - Pantau log penggunaan
   - Terapkan rate limiting

3. **Proteksi Data**
   - Enkripsi semua data sensitif
   - Gunakan cookie HttpOnly
   - Backup rutin

[Lihat Versi Inggris](README.md)

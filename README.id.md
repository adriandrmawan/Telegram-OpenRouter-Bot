[Read in English](README.md)

# Bot Telegram OpenRouter (Cloudflare Worker)

Ini adalah bot Telegram yang berfungsi sebagai antarmuka ke model AI yang tersedia melalui OpenRouter.ai. Bot ini berjalan sepenuhnya di Cloudflare Workers, memanfaatkan penyimpanan KV untuk pengaturan pengguna dan variabel lingkungan untuk konfigurasi.

## Fitur

*   **Integrasi OpenRouter:** Terhubung ke berbagai model AI melalui kunci API OpenRouter yang disediakan pengguna.
*   **Cloudflare Workers:** Berjalan tanpa server (serverless) di jaringan edge Cloudflare.
*   **Penyimpanan KV:** Menyimpan kunci API dan preferensi pengguna (model, prompt sistem) dengan aman.
*   **Respons Streaming:** Memberikan respons real-time yang di-stream untuk perintah `/ask`.
*   **Otorisasi Pengguna:** Membatasi penggunaan bot hanya untuk ID Pengguna Telegram tertentu yang dikonfigurasi melalui variabel lingkungan.
*   **Dukungan Multi-bahasa:** Mendukung Bahasa Inggris (en) dan Bahasa Indonesia (id), dapat dikonfigurasi melalui variabel lingkungan dan berpotensi melalui preferensi pengguna nanti.
*   **Pengaturan yang Dapat Disesuaikan:** Pengguna dapat mengatur model dan prompt sistem pilihan mereka.
*   **Deployment Mudah:** Menyertakan tombol "Deploy to Cloudflare".

## Pengaturan Awal

1.  **Token Bot Telegram:**
    *   Bicara dengan [@BotFather](https://t.me/BotFather) di Telegram.
    *   Buat bot baru menggunakan `/newbot`.
    *   Ikuti instruksi dan salin **token HTTP API**.

2.  **Kunci API OpenRouter:**
    *   Daftar atau masuk di [OpenRouter.ai](https://openrouter.ai/).
    *   Buka pengaturan akun Anda dan buat kunci API. Pengguna akan memberikan kunci mereka sendiri ke bot melalui perintah `/setkey`.

3.  **Akun Cloudflare:**
    *   Daftar akun [Cloudflare](https://dash.cloudflare.com/sign-up) gratis.

4.  **Namespace KV:**
    *   Di dasbor Cloudflare Anda, navigasikan ke **Workers & Pages** > **KV**.
    *   Klik **Create a namespace**.
    *   Masukkan nama (misalnya, `TELEGRAM_BOT_KV`) dan klik **Add**.
    *   Salin **Namespace ID** dan **Preview ID**.

## Konfigurasi

1.  **`wrangler.toml`:**
    *   Buka file `wrangler.toml`.
    *   Perbarui field `name` dengan nama worker yang Anda inginkan.
    *   Temukan bagian `[[kv_namespaces]]`.
    *   Setel `binding` ke `"USER_DATA"` (ini adalah cara kode mengakses KV).
    *   Tempel **Namespace ID** yang Anda salin ke field `id`.
    *   Tempel **Preview ID** yang Anda salin ke field `preview_id`.

2.  **Variabel Lingkungan & Rahasia Cloudflare:**
    *   **Deploy melalui Tombol/CLI terlebih dahulu**, kemudian konfigurasikan rahasia dan variabel di dasbor Cloudflare untuk worker yang telah Anda deploy (**Settings > Variables**).
    *   **Rahasia (Secrets)** (Gunakan `wrangler secret put <KEY>` atau tambahkan melalui Dashboard > Workers & Pages > Worker Anda > Settings > Variables > Secret Variables):
        *   `TELEGRAM_BOT_TOKEN`: Token Bot Telegram Anda yang diperoleh dari BotFather.
        *   `OPENROUTER_API_KEY` (Opsional): Kunci OpenRouter *Anda sendiri* jika Anda memerlukan bot untuk melakukan tugas admin seperti mengambil semua model yang tersedia secara dinamis (tidak diimplementasikan secara default). Kunci pengguna disimpan di KV.
    *   **Variabel (Variables)** (Tambahkan melalui Dashboard > Workers & Pages > Worker Anda > Settings > Variables > Environment Variables):
        *   `ALLOWED_USER_IDS`: Daftar ID Pengguna Telegram yang dipisahkan koma yang diizinkan menggunakan bot (misalnya, `12345678,98765432`). Biarkan kosong atau tidak disetel untuk mengizinkan semua pengguna.
        *   `DEFAULT_LANGUAGE`: Atur bahasa default (`en` atau `id`). Default ke `en` jika tidak disetel.
        *   `DEFAULT_MODEL`: ID model OpenRouter default yang akan digunakan jika pengguna belum menyetelnya (misalnya, `openai/gpt-3.5-turbo`).
        *   `DEFAULT_SYSTEM_PROMPT`: Prompt sistem default yang akan digunakan jika pengguna belum menyetelnya (misalnya, `Anda adalah asisten yang membantu.`).

    *   **Rahasia Opsional untuk Fitur Pencarian Web:** (Jika Anda berencana mengimplementasikan perintah `/websearch`)
        *   `GOOGLE_API_KEY`: Kunci API Google Custom Search Anda.
        *   `GOOGLE_CX`: ID Google Programmable Search Engine Anda.
        *   `BING_API_KEY`: Kunci API Bing Search Anda (digunakan sebagai cadangan).

### Mendapatkan Kunci API Pencarian Web (Opsional)

**Bahasa Indonesia:**

*   **Kunci API Google Custom Search & ID Mesin Pencari (CX):**
    1.  Anda memerlukan proyek Google Cloud Platform. Buat baru atau gunakan yang sudah ada di [Konsol Google Cloud](https://console.cloud.google.com/).
    2.  Aktifkan **Custom Search API** untuk proyek Anda: Buka APIs & Services > Library, cari "Custom Search API", dan aktifkan.
    3.  Buat Kredensial API: Buka APIs & Services > Credentials, klik "Create Credentials", dan pilih "API key". Salin kunci ini (ini adalah `GOOGLE_API_KEY` Anda). Batasi penggunaan kunci jika diinginkan (misalnya, ke alamat IP atau perujuk HTTP tertentu).
    4.  Buat Mesin Pencari Terprogram (Programmable Search Engine): Buka [panel kontrol Programmable Search Engine](https://programmablesearchengine.google.com/controlpanel/all).
    5.  Klik "Add" untuk membuat mesin pencari baru. Konfigurasikan (misalnya, beri nama, tentukan "Search the entire web").
    6.  Setelah dibuat, temukan **Search engine ID** Anda di halaman pengaturan. Ini adalah `GOOGLE_CX` Anda.

*   **Kunci API Bing Search:**
    1.  Anda memerlukan akun Microsoft Azure. Buat baru atau gunakan yang sudah ada di [Portal Azure](https://portal.azure.com/).
    2.  Buat sumber daya "Bing Search v7": Di portal Azure, cari dan buat sumber daya "Bing Search v7". Pilih tingkat harga (seringkali tersedia tingkat gratis).
    3.  Setelah sumber daya di-deploy, buka bagian "Keys and Endpoint". Salin salah satu kunci (Key 1 atau Key 2). Ini adalah `BING_API_KEY` Anda.

## Deployment

### Opsi 1: Tombol Deploy to Cloudflare

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/adriandrmawan/Telegram-OpenRouter-Bot)

Setelah melakukan deployment dengan tombol, **Anda HARUS mengkonfigurasi Rahasia (Secrets) dan Variabel (Variables)** seperti yang dijelaskan di bagian Konfigurasi di dasbor Cloudflare Anda.

### Opsi 2: Menggunakan Wrangler CLI

1.  **Instal Wrangler:**
    ```bash
    npm install -g wrangler
    ```
2.  **Login ke Cloudflare:**
    ```bash
    wrangler login
    ```
3.  **Deploy:**
    ```bash
    wrangler deploy
    ```
    Perintah ini akan membangun dan men-deploy worker Anda berdasarkan `wrangler.toml`. Ini juga akan meminta Anda untuk mengatur rahasia jika didefinisikan dalam `wrangler.toml` tetapi belum dikonfigurasi di Cloudflare. Ingatlah untuk mengkonfigurasi variabel lingkungan non-rahasia di dasbor setelahnya.

4.  **Setel Webhook Telegram:**
    Setelah deployment, Anda perlu memberi tahu Telegram ke mana harus mengirim pembaruan. Jalankan perintah berikut di terminal Anda, ganti `<URL_WORKER_ANDA>` dengan URL yang diberikan setelah deployment (biasanya `https://nama-worker-anda.subdomain-anda.workers.dev`) dan `<TOKEN_BOT_TELEGRAM_ANDA>` dengan token Anda:
    ```bash
    curl "https://api.telegram.org/bot<TOKEN_BOT_TELEGRAM_ANDA>/setWebhook?url=<URL_WORKER_ANDA>"
    ```
    Anda akan melihat respons seperti `{"ok":true,"result":true,"description":"Webhook was set"}`.

## Penggunaan

Berinteraksi dengan bot Anda di Telegram:

*   `/start`: Menginisialisasi bot. Meminta kunci API jika belum diatur, jika tidak menampilkan opsi.
*   `/setkey KUNCI_API_ANDA`: Menyimpan dan memverifikasi kunci API OpenRouter Anda.
*   `/changemodel`: Menampilkan menu interaktif untuk menjelajahi dan memilih model AI pilihan Anda. Memerlukan kunci API yang valid untuk diatur.
*   `/setsystemprompt PROMPT_ANDA`: Mengatur prompt sistem kustom untuk AI. Biarkan prompt kosong (`/setsystemprompt`) untuk mereset ke default.
*   `/setpersona <nama>`: Mengatur persona yang telah ditentukan (yang merupakan system prompt spesifik). Contoh persona: `default`, `coder`, `translator`, `summarizer`. Menimpa system prompt kustom.
*   `/setlang <en|id>`: Mengatur bahasa pilihan Anda untuk respons bot (Bahasa Inggris atau Bahasa Indonesia).
*   `/resetsettings`: Menghapus kunci API, model, dan prompt sistem yang tersimpan.
*   `/ask PERTANYAAN_ANDA`: Mengajukan pertanyaan ke model AI yang dikonfigurasi. Bot mengingat beberapa pesan terakhir dalam percakapan. Respons akan di-stream.
*   `/newchat`: Menghapus memori bot tentang riwayat percakapan saat ini, memulai obrolan baru.
*   `/search KUERI_ANDA`: Melakukan pencarian web menggunakan Google (dengan Bing sebagai cadangan jika dikonfigurasi) dan mengembalikan hasil teratas. Memerlukan pengaturan administrator.
*   `/help`: Menampilkan daftar perintah yang tersedia dan pengaturan saat ini.

Selamat menikmati asisten AI Anda di Telegram!

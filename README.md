# Telegram AI Agent Bot 🤖🚀

Telegram Bot serba bisa berbasis AI (Groq SDK) dan Telegraf. Bot ini dilengkapi dengan AI Agent otonom yang dapat menggunakan berbagai alat (tools) seperti pencarian web, analisis visual, transkripsi suara, pembuatan gambar/video, pengunduhan media, hingga pelacakan harga kripto dan saham dengan grafik premium.

---

## 💻 Tech Stack

Proyek ini dibangun menggunakan teknologi modern berikut:

*   **Runtime Environment**: ![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green?style=flat-square&logo=node.js) (ES Modules)
*   **Telegram Framework**: ![Telegraf](https://img.shields.io/badge/Telegraf-v4.16-blue?style=flat-square&logo=telegram) (Telegram Bot API wrapper untuk Node.js)
*   **AI Engine**: ![Groq](https://img.shields.io/badge/Groq%20SDK-v0.12-orange?style=flat-square) (SDK untuk inference berkecepatan tinggi dengan model Llama 3/4 & Qwen)
*   **Image Processing**: ![Jimp](https://img.shields.io/badge/Jimp-v1.6-red?style=flat-square) (Pustaka manipulasi gambar untuk menempelkan logo perusahaan pada grafik secara dinamis)
*   **Data Fetching**: ![Axios](https://img.shields.io/badge/Axios-v1.16-purple?style=flat-square) & ![Cheerio](https://img.shields.io/badge/Cheerio-v1.2-orange?style=flat-square) (Untuk HTTP requests dan scraping data/informasi web)
*   **Visual Charting**: ![QuickChart](https://img.shields.io/badge/QuickChart%20API-Chart.js-blueviolet?style=flat-square) (Layanan generator grafik responsif untuk memvisualisasikan tren pasar dalam Dark Mode)
*   **Database & Memory**: Berkas JSON lokal (untuk menyimpan fakta/memori dan data limit harian pengguna)

---

## 🌟 Fitur Utama

### 1. 🤖 AI Agent & Model Pilihan
*   **Interaksi Natural**: Chat langsung di private chat atau sebut (mention) bot di group chat.
*   **Transkripsi Pesan Suara**: Kirim pesan suara (Voice Note) dan bot akan menerjemahkannya ke teks lalu merespons dengan AI.
*   **Analisis Foto**: Kirim foto beserta pertanyaan Anda untuk analisis visual otomatis.
*   **Ganti Model (`/model`)**: Ubah model AI yang digunakan secara real-time.
*   **Kustomisasi Kepribadian (`/sifat`)**: Ubah kepribadian/sifat AI Agent secara instan menggunakan menu tombol interaktif (Pilihan: *Biasa*, *Wibu*, *Tsundere*, *Sarkastik*, *Profesional*, *Mentor Coding*). AI juga dapat mengubah sifatnya secara mandiri saat diperintah melalui percakapan chat.
*   **Status Loading Kustom**: Tampilan status pemrosesan/loading bot (seperti berpikir atau memanggil alat) akan menyesuaikan gaya bicaranya sesuai kepribadian yang sedang aktif.

### 2. 📈 Informasi Pasar Real-Time (dengan Grafik Premium)
*   **💰 Harga Kripto (`/kripto [nama/simbol]`)**:
    *   Mendapatkan harga real-time (USD & IDR) dan persentase perubahan 24 jam via CoinGecko.
    *   Grafik tren harga historis 7 hari dengan tema gelap (Dark Mode) premium.
*   **📊 Harga Saham (`/saham [ticker]`)**:
    *   Mendukung bursa Indonesia (IDX) dan Amerika Serikat (US) via Yahoo Finance.
    *   *Perutean Cerdas*: Mengetik `BBCA` otomatis mendeteksi bursa Indonesia (`BBCA.JK`). Mengetik `AAPL` otomatis mendeteksi bursa US.
    *   Grafik tren harga historis 7 hari dengan **logo resmi perusahaan** yang ditempel secara presisi menggunakan `Jimp`.
    *   Informasi bursa, volume, harga tertinggi/terendah hari ini, dan rentang 52 minggu.

### 3. 🌤️ Informasi Cuaca BMKG (`/cuaca [kota]`)
*   Informasi cuaca lengkap (suhu, kelembapan, kecepatan angin, rekomendasi aktivitas).
*   Mengunduh grafik prakiraan cuaca visual langsung dari BMKG.

### 4. 🎮 Pusat Game (Game Center)
Akses menu interaktif `/game` untuk bermain:
*   ❌⭕ **Tic Tac Toe**: Main melawan bot dengan kecerdasan buatan.
*   ✊✌️🖐️ **Suit**: Bermain Batu-Gunting-Kertas lengkap dengan skor.
*   📝 **Tebak Kata**: Bermain tebak kata dengan sistem petunjuk (hints).
*   🧮 **Kuis Matematika**: Selesaikan soal aritmatika cepat secara beruntun.
*   🔥 **Tebak Hero FF**: Uji pengetahuan Anda tentang karakter Free Fire.

### 5. 📥 Unduh Media & Alat Kreatif
*   **Unduh Video (`/download [url]`)**: Dukungan download video dari YouTube, TikTok, dll. (Max 50MB).
*   **YouTube Downloader**: `/ytmp4` (video) dan `/ytmp3` (audio/lagu).
*   **Pembuat Media AI**: `/img` (buat gambar AI), `/video` (buat video AI), `/meme` (buat meme lucu).
*   **Alat Tambahan**: `/qr` (buat QR Code) dan `/tts` (teks ke pesan suara).

### 6. 💳 Sistem Kuota & Top-Up (`/limit` & `/topup`)
*   **Kuota Harian**: Batasan kuota limit karakter input/output harian untuk pengguna.
*   **Top-Up Otomatis**: Integrasi pembayaran dengan **Pakasir** menggunakan **QRIS (e-wallet)** dan **Virtual Account Bank** (BNI, BRI, CIMB, Permata). Kuota langsung bertambah otomatis setelah transaksi sukses.

---

## 🛠️ Panduan Instalasi & Setup

### 1. Prasyarat
*   Node.js (versi 18+)
*   NPM
*   Akun bot Telegram (buat melalui [@BotFather](https://t.me/BotFather))

### 2. Kloning & Instalasi Dependensi
```bash
git clone https://github.com/ADIVSTUDIO13/ai-agent.git
cd ai-agent
npm install
```

### 3. Konfigurasi Lingkungan (`.env`)
Buat berkas `.env` di direktori utama dan lengkapi variabel berikut:
```env
TELEGRAM_BOT_TOKEN=token_bot_telegram_anda
GROQ_API_KEY=api_key_groq_anda
GROQ_MODEL=qwen/qwen3-32b # atau model lainnya

# Opsional (Integrasi Top-Up Pakasir)
PAKASIR_API_KEY=api_key_pakasir_anda
PAKASIR_PROJECT_SLUG=slug_proyek_pakasir_anda

# Opsional (Lainnya)
POLLINATIONS_API_KEY=
VERCEL_TOKEN=
```

### 4. Menjalankan Bot
*   **Mode Pengembangan (Dev)**:
    ```bash
    npm run dev
    ```
*   **Mode Produksi (Start)**:
    ```bash
    npm start
    ```

---

## 📖 Ringkasan Perintah Bot

| Perintah | Deskripsi |
| :--- | :--- |
| `/ai` | Ajukan pertanyaan/perintah umum ke AI Agent |
| `/sifat` | Ubah kepribadian/sifat AI Agent (Wibu, Tsundere, dll.) secara interaktif |
| `/saham` | Cek harga saham (Indonesia & US) + Grafik tren + Logo |
| `/kripto` | Cek harga cryptocurrency + Grafik tren |
| `/cuaca` | Prakiraan Cuaca BMKG terbaru |
| `/img` | Buat gambar AI dari deskripsi teks |
| `/download` | Unduh video dari YouTube, TikTok, dll |
| `/game` | Masuk ke Pusat Game Center |
| `/limit` | Cek sisa kuota limit karakter AI Anda |
| `/topup` | Menu pembelian kuota AI |
| `/help` | Tampilkan panduan lengkap bot |

---

## 📜 Lisensi
Proyek ini dilisensikan di bawah lisensi ISC.

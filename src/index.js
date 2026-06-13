import dns from 'dns';
import fs from 'fs';
import path from 'path';
import { Telegraf, Markup } from 'telegraf';
import { config, validateConfig } from './config.js';
dns.setDefaultResultOrder('ipv4first');
import { runAgent, transcribeAudio, analyzePhoto, getCurrentModel, setModel, setUserModel, getCurrentThinkingLevel, setThinkingLevel, getAvailableModels } from './agent.js';
import { downloadVideo, getYtDlpPath, getFfmpegPath, getFfprobePath, ensureSandbox, downloadTelegramFile, compressImageIfLarge, compressAudioIfLarge, generateTts, applyTtsVoiceEffect, createMemeImage, getYtMetadata, uploadToTmpfiles, safeMarkdown, enhanceImage, applyVoiceFilter, killProcessTree } from './utils.js';
import { getGameMenu, startTicTacToe, handleTicTacToeMove, startSuit, handleSuitPlay, handleSuitReset, startTebakKata, handleTebakLetter, handleTebakHint, startMathQuiz, handleMathAnswer, startTebakFf, handleTebakFfAnswer, startTebakGambar, handleTebakGambarAnswer, handleTebakGambarHint, getArcadeMenu, getArcadeShopMenu, buyGachaTicket, drawGacha, exchangePointsForLimit, startSlot, spinSlot, renderSlot, startTebakAngka, handleTebakAngkaInput, startBlackjack, handleBlackjackHit, handleBlackjackStand, startTebakBendera, handleTebakBenderaAnswer, makeBotTttMoveAndRender, nextBlackjackRound, startChess, handleChessClick, makeBotChessMoveAndRender, handleChessForfeit, handleChessAiMove, handleTttAiMove } from './games.js';
import { getUserUsage, addUsage, getRemainingUsage, getDailyLimit, getExtraQuota, addExtraQuota, addXp, getUserLevel, getUserXp, getTokenUsage, isPremiumUser, getPremiumRemainingTime, addPremiumDays, removePremium, getUserData, setExtraQuota, setPoints, setTickets, setLevel, addPoints, addTickets } from './usage.js';
import { TOPUP_PACKAGES, createTransaction, checkTransactionStatus, isPakasirConfigured } from './payment.js';
import { toolHandlers } from './tools.js';

const BOT_START_TIME = Date.now();
const activePolls = new Map();

async function getChatPersonality(chatId) {
  const personalityPath = path.join(config.memoryDir, `${chatId}_personality.txt`);
  if (fs.existsSync(personalityPath)) {
    try {
      return fs.readFileSync(personalityPath, 'utf8').trim().toLowerCase();
    } catch (e) {
      console.error('Failed to read chat personality:', e.message);
    }
  }
  return 'biasa';
}

async function formatPersonalityText(chatId, action, entityName, rawText) {
  const personality = await getChatPersonality(chatId);
  
  const greetings = {
    kripto: {
      wibu: `Yatta! Ini dia informasi harga dan grafik ${entityName} untukmu, Senpai~ 🌸 Sugoi desu ne! ✨\n\n`,
      tsundere: `Ugh, ini info harga ${entityName} yang kamu minta. B-bukan karena aku peduli ya, baka! 💢\n\n`,
      sarcastic: `Ini harga ${entityName}. Siap-siap jantungan melihat grafiknya, atau mau pura-pura kaget saja? 🙄\n\n`,
      professional: `Berikut kami lampirkan laporan harga real-time dan analisis tren grafik 7 hari terakhir untuk instrumen cryptocurrency ${entityName}.\n\n`,
      mentor: `Mari kita analisis pergerakan harga ${entityName}. Grafik 7 hari terakhir menunjukkan tren teknikal sebagai berikut.\n\n`,
      biasa: `Berikut adalah harga terkini dan grafik tren 7 hari untuk ${entityName}:\n\n`
    },
    saham: {
      wibu: `Ini dia grafik pergerakan saham ${entityName} kesukaanmu, Senpai! Semangat trading-nya! 🌸\n\n`,
      tsundere: `Nih grafik saham ${entityName}. Jangan nangis ya kalau merah merona, dasar baka! 💢\n\n`,
      sarcastic: `Ini grafik saham ${entityName}. Semoga portofoliomu lebih hijau daripada rumput tetangga. 🙄\n\n`,
      professional: `Berikut adalah rangkuman kinerja pasar dan chart tren pergerakan saham ${entityName} terkini.\n\n`,
      mentor: `Berikut visualisasi pergerakan harga saham ${entityName}. Perhatikan area support dan resistance pada grafik.\n\n`,
      biasa: `Berikut adalah detail harga dan chart tren pergerakan saham ${entityName}:\n\n`
    },
    cuaca: {
      wibu: `Konnichiwa Senpai! 🌸 Ini dia cuaca di kota ${entityName} desu~\n\n`,
      tsundere: `Nih info cuaca di ${entityName}! B-bukan berarti aku mau kamu tahu agar tidak kehujanan ya! 💢\n\n`,
      sarcastic: `Cuaca di ${entityName}? Ini dia. Siap-siap pasang payung atau AC, terserah nasibmu saja. 🙄\n\n`,
      professional: `Berikut adalah laporan prakiraan cuaca resmi untuk wilayah ${entityName} dan sekitarnya.\n\n`,
      mentor: `Berikut kondisi cuaca di ${entityName}. Jangan lupa persiapkan diri sebelum melakukan aktivitas lapangan.\n\n`,
      biasa: `Info cuaca di kota ${entityName}:\n\n`
    },
    gempa: {
      wibu: `Kyaaa~! Ada info gempa bumi terbaru desu! Tetap aman ya Senpai~ 🌸\n\n`,
      tsundere: `H-hey! Baru saja ada gempa! Kamu baik-baik saja kan? B-bukan karena aku mengkhawatirkanmu! 💢\n\n`,
      sarcastic: `Info gempa bumi terbaru. Bumi berguncang lagi, barangkali sedang bosan. 🙄\n\n`,
      professional: `Pemberitahuan resmi mengenai aktivitas seismik/gempa bumi terkini dari BMKG.\n\n`,
      mentor: `Laporan gempa bumi terbaru. Selalu ingat protokol keselamatan gempa bumi jika berada di wilayah terdampak.\n\n`,
      biasa: `Laporan gempa bumi terkini BMKG:\n\n`
    },
    sholat: {
      wibu: `Jadwal sholat kota ${entityName} desu! Jangan lupa ibadah tepat waktu ya Senpai~ 🌸\n\n`,
      tsundere: `Nih jadwal sholat ${entityName}! Buruan sholat, jangan malas-malasan terus! 💢\n\n`,
      sarcastic: `Jadwal sholat ${entityName}. Jangan lupa ibadah, biar kelakuanmu tertolong sedikit. 🙄\n\n`,
      professional: `Jadwal sholat fardhu untuk wilayah ${entityName} dan sekitarnya hari ini.\n\n`,
      mentor: `Berikut jadwal sholat kota ${entityName}. Disiplin waktu ibadah adalah kunci ketenangan hati.\n\n`,
      biasa: `Jadwal sholat untuk kota ${entityName}:\n\n`
    },
    krl: {
      wibu: `Choo choo~! Ini jadwal kereta KRL di Stasiun ${entityName} desu~ Hati-hati di jalan ya Senpai! 🌸\n\n`,
      tsundere: `Jadwal KRL ${entityName}! Jangan sampai ketinggalan kereta lalu merepotkanku, baka! 💢\n\n`,
      sarcastic: `Jadwal KRL ${entityName}. Berdoalah kereta tidak terlambat seperti biasanya. 🙄\n\n`,
      professional: `Informasi jadwal kedatangan dan keberangkatan kereta KRL commuterline stasiun ${entityName}.\n\n`,
      mentor: `Jadwal operasional KRL stasiun ${entityName}. Rencanakan perjalanan Anda dengan margin waktu yang aman.\n\n`,
      biasa: `Jadwal KRL di Stasiun ${entityName}:\n\n`
    },
    lirik: {
      wibu: `Lirik lagu "${entityName}" untukmu desu, Senpai! Mari bernyanyi bersama~ 🌸\n\n`,
      tsundere: `Nih lirik lagu "${entityName}" yang kamu cari. Jangan nyanyi keras-keras ya, suaramu jelek! 💢\n\n`,
      sarcastic: `Lirik lagu "${entityName}". Semoga liriknya tidak mewakili nasib tragismu. 🙄\n\n`,
      professional: `Berikut adalah teks lirik lagu lengkap untuk judul "${entityName}".\n\n`,
      mentor: `Berikut teks lirik lagu "${entityName}". Perhatikan makna mendalam dari setiap baitnya.\n\n`,
      biasa: `Lirik lagu "${entityName}":\n\n`
    },
    anime: {
      wibu: `Sugoi! Ini detail anime "${entityName}" kesukaan kita desu, Senpai! 🌸\n\n`,
      tsundere: `Ini info anime "${entityName}". B-bukan berarti aku juga menontonnya ya! 💢\n\n`,
      sarcastic: `Informasi anime "${entityName}". Silakan lanjut maraton nonton wibu, abaikan kehidupan nyatamu. 🙄\n\n`,
      professional: `Berikut rangkuman informasi detail dari database MyAnimeList untuk anime "${entityName}".\n\n`,
      mentor: `Berikut ulasan informasi anime "${entityName}". Analisis naratif dan animasinya cukup menarik dipelajari.\n\n`,
      biasa: `Informasi anime "${entityName}":\n\n`
    },
    manga: {
      wibu: `Kyaa~! Ini info manga "${entityName}" desu, Senpai! Bagus banget ceritanya! 🌸\n\n`,
      tsundere: `Nih info manga "${entityName}". Buruan baca, dasar kutu buku! 💢\n\n`,
      sarcastic: `Informasi manga "${entityName}". Selamat membaca lembaran hitam putih, semoga duniamu tidak ikut hitam putih. 🙄\n\n`,
      professional: `Berikut ringkasan data resmi dari database MyAnimeList untuk manga "${entityName}".\n\n`,
      mentor: `Berikut informasi manga "${entityName}". Struktur alur cerita dan gaya komiknya sangat inspiratif.\n\n`,
      biasa: `Informasi manga "${entityName}":\n\n`
    },
    ss: {
      wibu: `Yatta! Ini hasil screenshot web ${entityName} desu, Senpai! 📸\n\n`,
      tsundere: `Nih screenshot web ${entityName}. Capek tahu ambilnya, jangan sering-sering ya! 💢\n\n`,
      sarcastic: `Screenshot dari ${entityName}. Semoga tampilannya tidak sehancur ekspektasimu. 🙄\n\n`,
      professional: `Berikut adalah tangkapan layar (screenshot) resmi dari halaman web ${entityName}.\n\n`,
      mentor: `Tangkapan layar halaman ${entityName}. Gunakan ini untuk menganalisis layout dan responsivitas desainnya.\n\n`,
      biasa: `Tangkapan layar untuk ${entityName}:\n\n`
    },
    translate: {
      wibu: `Konnichiwa! Ini hasil terjemahannya desu, Senpai~ 🌸\n\n`,
      tsundere: `Nih hasil terjemahannya! B-bukan berarti aku mau membantumu belajar ya! 💢\n\n`,
      sarcastic: `Ini terjemahannya. Semoga bahasa aslimu juga bisa dimengerti suatu hari nanti. 🙄\n\n`,
      professional: `Berikut adalah hasil terjemahan teks yang Anda minta secara formal.\n\n`,
      mentor: `Hasil terjemahan Anda siap. Perhatikan struktur kalimatnya agar sesuai konteks.\n\n`,
      biasa: `Hasil terjemahan:\n\n`
    },
    currency: {
      wibu: `Sugoi! Ini hitungan konversi kurs mata uangnya desu, Senpai~ 🌸\n\n`,
      tsundere: `Ugh, ini hasil konversi kursnya! Jangan boros-boros ya, dasar baka! 💢\n\n`,
      sarcastic: `Ini hasil konversi mata uang. Semoga dompetmu tidak menangis melihat nilainya. 🙄\n\n`,
      professional: `Berikut laporan konversi nilai tukar valuta asing (kurs) terkini.\n\n`,
      mentor: `Konversi kurs berhasil dihitung. Analisis fluktuasi nilai tukar ini penting untuk transaksi global.\n\n`,
      biasa: `Hasil konversi kurs:\n\n`
    },
    shortlink: {
      wibu: `Yatta! Link-nya sudah aku perkecil jadi imut desu, Senpai~ 🌸\n\n`,
      tsundere: `Nih link pendeknya! Tinggal klik aja, repot banget sih! 💢\n\n`,
      sarcastic: `Ini link pendeknya. Semoga tidak sependek ingatanmu. 🙄\n\n`,
      professional: `Tautan (link) Anda berhasil disingkat dan siap digunakan.\n\n`,
      mentor: `Link berhasil diperpendek. Ini membantu meningkatkan kebersihan dan keterbacaan URL.\n\n`,
      biasa: `Link berhasil diperpendek:\n\n`
    },
    qr: {
      wibu: `Sugoi! Ini dia QR code buatan aku desu, Senpai~ 🌸\n\n`,
      tsundere: `Nih QR code-nya! Tinggal scan aja, jangan nanya-nanya lagi! 💢\n\n`,
      sarcastic: `Ini QR code. Scan aja, semoga tidak mengarah ke jebakan Rick Astley. 🙄\n\n`,
      professional: `Dokumen/Teks Anda telah dikonversi menjadi gambar QR Code resmi.\n\n`,
      mentor: `Berikut QR Code yang digenerate. Format ini sangat efisien untuk distribusi URL fisik.\n\n`,
      biasa: `QR Code berhasil dibuat:\n\n`
    },
    whois: {
      wibu: `Yatta! Aku sudah kepoin domain/IP target desu, Senpai~ 🌸\n\n`,
      tsundere: `Nih info lookup WHOIS-nya! Jangan dipakai buat yang aneh-aneh ya, baka! 💢\n\n`,
      sarcastic: `Info WHOIS target. Silakan lanjut jadi hacker-hackeran, semoga aman. 🙄\n\n`,
      professional: `Laporan hasil lookup WHOIS/GeoIP untuk domain/IP yang Anda daftarkan.\n\n`,
      mentor: `Berikut data registrasi WHOIS dan routing GeoIP target. Berguna untuk audit jaringan.\n\n`,
      biasa: `Hasil lookup WHOIS/GeoIP:\n\n`
    },
    berita: {
      wibu: `Ada berita hangat untuk hari ini desu, Senpai! Pembacaan dimulai~ 🌸\n\n`,
      tsundere: `Nih berita yang kamu cari! Baca yang pinter ya, jangan malas! 💢\n\n`,
      sarcastic: `Ini rangkuman berita hari ini. Semoga ada yang berguna untuk hidupmu. 🙄\n\n`,
      professional: `Berikut adalah kumpulan berita terpopuler dari Google News mengenai topik terkait.\n\n`,
      mentor: `Kumpulan berita terbaru. Selalu lakukan cross-reference informasi untuk memverifikasi kebenarannya.\n\n`,
      biasa: `Berita terbaru hari ini:\n\n`
    }
  };

  const actionGreetings = greetings[action];
  if (!actionGreetings) return rawText;
  const greeting = actionGreetings[personality] || actionGreetings['biasa'];
  
  return greeting + rawText;
}


const validation = validateConfig();
if (!validation.valid) {
  console.error('❌ Configuration validation failed:');
  validation.errors.forEach((err) => console.error(`  - ${err}`));
  console.error('\nSilakan lengkapi file .env terlebih dahulu untuk menjalankan bot ini.');
  process.exit(1);
}


ensureSandbox();
if (!fs.existsSync(config.memoryDir)) {
  fs.mkdirSync(config.memoryDir, { recursive: true });
}
const taskDir = path.resolve(config.memoryDir, '../task');
if (!fs.existsSync(taskDir)) {
  fs.mkdirSync(taskDir, { recursive: true });
}


const bot = new Telegraf(config.telegramToken, {
  handlerTimeout: Infinity,
  telegram: {
    apiRoot: config.telegramApiRoot
  }
});


const sessions = new Map();


const activeProcesses = new Map(); // id -> processInfo
let nextProcessId = 1;

const DB_PATH = path.join(config.memoryDir, 'active_processes.json');

function saveActiveProcesses() {
  const list = [];
  for (const proc of activeProcesses.values()) {
    list.push({
      id: proc.id,
      chatId: proc.chatId,
      name: proc.name,
      startTime: proc.startTime,
      pid: proc.controller?.signal?.pid || proc.pid || process.pid
    });
  }
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write active processes database:', e.message);
  }
}

global.saveActiveProcesses = saveActiveProcesses;

const originalDelete = activeProcesses.delete.bind(activeProcesses);
activeProcesses.delete = function(key) {
  const result = originalDelete(key);
  saveActiveProcesses();
  return result;
};

const originalSet = activeProcesses.set.bind(activeProcesses);
activeProcesses.set = function(key, value) {
  const result = originalSet(key, value);
  saveActiveProcesses();
  return result;
};

function startProcess(chatId, name) {
  const id = nextProcessId++;
  const controller = new AbortController();
  const processInfo = {
    id,
    chatId,
    name,
    controller,
    startTime: Date.now(),
    pid: process.pid
  };
  activeProcesses.set(id, processInfo);
  return processInfo;
}

function stopProcess(id) {
  console.log(`[Stop] stopProcess called for process ID #${id}`);
  const proc = activeProcesses.get(id);
  if (proc) {
    console.log(`[Stop] Found active process in memory: ${proc.name}. Triggering controller.abort()`);
    proc.controller.abort();
    activeProcesses.delete(id);
    return true;
  }

  // Fallback: search and stop from the persistent DB (e.g. for orphaned child processes after restart)
  const dbPath = path.join(config.memoryDir, 'active_processes.json');
  if (fs.existsSync(dbPath)) {
    try {
      const dbProcs = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      const idx = dbProcs.findIndex(p => p.id === id);
      if (idx !== -1) {
        const procInfo = dbProcs[idx];
        console.log(`[Stop] Found process ID #${id} in DB fallback: ${procInfo.name}. Saved PID: ${procInfo.pid}`);
        if (procInfo.pid && procInfo.pid !== process.pid) {
          console.log(`[Stop] Killing process tree for PID ${procInfo.pid} from DB...`);
          killProcessTree(procInfo.pid);
        } else {
          console.log(`[Stop] Saved PID is equal to current bot process PID (${process.pid}), skipping killProcessTree.`);
        }
        dbProcs.splice(idx, 1);
        fs.writeFileSync(dbPath, JSON.stringify(dbProcs, null, 2), 'utf8');
        return true;
      }
    } catch (e) {
      console.error('Failed to stop process from DB:', e.message);
    }
  }
  console.log(`[Stop] Process ID #${id} not found in memory or DB.`);
  return false;
}

function getChatProcesses(chatId) {
  const list = [];
  for (const proc of activeProcesses.values()) {
    if (proc.chatId === chatId) {
      list.push(proc);
    }
  }
  return list;
}

function getSessionHistory(chatId) {
  if (!sessions.has(chatId)) {
    const memoryFilePath = path.join(config.memoryDir, `${chatId}.json`);
    const taskFilePath = path.join(config.memoryDir, '../task', `${chatId}.json`);
    let filePath = memoryFilePath;
    if (!fs.existsSync(filePath) && fs.existsSync(taskFilePath)) {
      filePath = taskFilePath;
    }
    if (fs.existsSync(filePath)) {
      try {
        const data = fs.readFileSync(filePath, 'utf8');
        sessions.set(chatId, JSON.parse(data));
      } catch (err) {
        console.error(`Failed to load memory for chat ${chatId}:`, err.message);
        sessions.set(chatId, []);
      }
    } else {
      sessions.set(chatId, []);
    }
  }
  return sessions.get(chatId);
}

function saveSessionHistory(chatId) {
  const history = sessions.get(chatId) || [];
  const memoryFilePath = path.join(config.memoryDir, `${chatId}.json`);
  const taskFilePath = path.join(config.memoryDir, '../task', `${chatId}.json`);
  try {
    fs.writeFileSync(memoryFilePath, JSON.stringify(history, null, 2), 'utf8');
    fs.writeFileSync(taskFilePath, JSON.stringify(history, null, 2), 'utf8');
  } catch (err) {
    console.error(`Failed to save memory for chat ${chatId}:`, err.message);
  }
}

function clearSessionHistory(chatId) {
  sessions.set(chatId, []);
  const memoryFilePath = path.join(config.memoryDir, `${chatId}.json`);
  const taskFilePath = path.join(config.memoryDir, '../task', `${chatId}.json`);
  if (fs.existsSync(memoryFilePath)) {
    try {
      fs.unlinkSync(memoryFilePath);
    } catch (err) {
      console.error(`Failed to delete memory file for chat ${chatId}:`, err.message);
    }
  }
  if (fs.existsSync(taskFilePath)) {
    try {
      fs.unlinkSync(taskFilePath);
    } catch (err) {
      console.error(`Failed to delete task file for chat ${chatId}:`, err.message);
    }
  }
}


function getCustomLoadingText(text, personality) {
  const clean = text.trim();
  
  if (!personality || personality === 'biasa') {
    return `⏳ ${text}`;
  }

  if (personality === 'wibu') {
    if (clean === 'Berpikir...') {
      return `🌸 *Chotto matte!* Sedang berpikir desu... (｀^´) ☕`;
    }
    if (clean.startsWith('Menjalankan alat:')) {
      const tool = clean.replace('Menjalankan alat:', '').trim();
      return `✨ Memanggil keajaiban alat: *${tool}*... Sugoi! 🌸`;
    }
    if (clean.startsWith('Menjalankan') && clean.endsWith('alat...')) {
      return `✨ Menyiapkan alat-alat sihir untukmu... 🌸`;
    }
    if (clean.includes('Mengunduh')) {
      return `📥 Sedang mendownload file-nya dulu ya, Senpai! 🌸`;
    }
    if (clean.includes('Menganalisis') || clean.includes('Mengekstrak')) {
      return `🔍 Menganalisis dengan mata keajaiban AI desu~ ✨`;
    }
    return `🌸 ${text} desu~ ✨`;
  }

  if (personality === 'tsundere') {
    if (clean === 'Berpikir...') {
      return `😒 H-hah? Aku terpaksa mikir dulu ya! B-bukan karena ingin membantumu, baka! (////)`;
    }
    if (clean.startsWith('Menjalankan alat:')) {
      const tool = clean.replace('Menjalankan alat:', '').trim();
      return `😒 Menjalankan *${tool}* nih! Jangan membuatku repot lagi ya! 💢`;
    }
    if (clean.startsWith('Menjalankan') && clean.endsWith('alat...')) {
      return `😒 Menyiapkan alat dulu! Jangan melihatku seperti itu! 💢`;
    }
    if (clean.includes('Mengunduh')) {
      return `📥 Mengunduh filenya... Cepat berterima kasih padaku! 😒`;
    }
    if (clean.includes('Menganalisis') || clean.includes('Mengekstrak')) {
      return `🔍 Menganalisis... Huh, jangan berharap hasilnya terlalu bagus ya! 😒`;
    }
    return `😒 ${text}...`;
  }

  if (personality === 'sarcastic') {
    if (clean === 'Berpikir...') {
      return `🎭 Coba mikir keras dulu ya, semoga pertanyaannya gak aneh-aneh... 🙄`;
    }
    if (clean.startsWith('Menjalankan alat:')) {
      const tool = clean.replace('Menjalankan alat:', '').trim();
      return `🎭 Menjalankan alat *${tool}*... Semoga ga meledak sistemnya ya. 💥`;
    }
    if (clean.startsWith('Menjalankan') && clean.endsWith('alat...')) {
      return `🎭 Mempersiapkan alat-alat berat... Mundur sana sedikit. 💥`;
    }
    if (clean.includes('Mengunduh')) {
      return `📥 Mendownload data... Koneksi internetmu lancar kan? 🙄`;
    }
    if (clean.includes('Menganalisis') || clean.includes('Mengekstrak')) {
      return `🔍 Menganalisis... Membaca isi pikiran gambarmu yang misterius... 🧠`;
    }
    return `🎭 ${text}... Semoga beruntung.`;
  }

  if (personality === 'professional') {
    if (clean === 'Berpikir...') {
      return `👔 Sedang memproses informasi dan menyusun jawaban secara sistematis...`;
    }
    if (clean.startsWith('Menjalankan alat:')) {
      const tool = clean.replace('Menjalankan alat:', '').trim();
      return `👔 Mengeksekusi sub-sistem operasional: *${tool}*...`;
    }
    if (clean.includes('Mengunduh')) {
      return `📥 Sedang mengunduh aset dokumen yang diperlukan...`;
    }
    if (clean.includes('Menganalisis') || clean.includes('Mengekstrak')) {
      return `🔍 Sedang menganalisis struktur data secara komprehensif...`;
    }
    return `👔 ${text}...`;
  }

  if (personality === 'mentor') {
    if (clean === 'Berpikir...') {
      return `🎓 Sedang menganalisis alur logika dan merumuskan penjelasan terbaik...`;
    }
    if (clean.startsWith('Menjalankan alat:')) {
      const tool = clean.replace('Menjalankan alat:', '').trim();
      return `🎓 Menjalankan modul *${tool}* untuk memproses data...`;
    }
    if (clean.includes('Mengunduh')) {
      return `📥 Mengunduh resource yang dibutuhkan untuk analisis...`;
    }
    if (clean.includes('Menganalisis') || clean.includes('Mengekstrak')) {
      return `🔍 Menelaah data masukan menggunakan model kognitif AI...`;
    }
    return `🎓 ${text}...`;
  }

  return `⏳ ${text}`;
}

function createStatusUpdater(ctx, procId = null) {
  let statusMessage = null;
  return {
    update: async (text) => {
      try {
        const chatId = ctx.chat.id;
        const personalityPath = path.join(config.memoryDir, `${chatId}_personality.txt`);
        let personality = 'biasa';
        if (fs.existsSync(personalityPath)) {
          try {
            personality = fs.readFileSync(personalityPath, 'utf8').trim();
          } catch (e) {}
        }

        let formattedText = getCustomLoadingText(text, personality);
        if (procId) {
          formattedText += `\n\n\`[ID: #${procId}]\``;
        }
        formattedText = safeMarkdown(formattedText);

        if (!statusMessage) {
          statusMessage = await ctx.reply(formattedText, { parse_mode: 'Markdown' });
        } else {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMessage.message_id,
            undefined,
            formattedText,
            { parse_mode: 'Markdown' }
          );
        }
      } catch (err) {
        console.log(`Status update: ${text}`);
      }
    },
    delete: async () => {
      if (statusMessage) {
        try {
          await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
        } catch (err) {
          
        }
      }
    }
  };
}

async function sendFileSafe(ctx, filePath, fileType, captionOptions = {}, status = null) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found at ${filePath}`);
    }

    const isImage = fileType === 'photo' || 
                    filePath.toLowerCase().endsWith('.png') || 
                    filePath.toLowerCase().endsWith('.jpg') || 
                    filePath.toLowerCase().endsWith('.jpeg');
    
    if (isImage) {
      console.log(`[Jimp] Checking image size for compression: ${filePath}`);
      await compressImageIfLarge(filePath, 2.5);
    }

    const audioExtensions = ['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.opus', '.alac', '.vorbis', '.mka'];
    const isAudio = fileType === 'audio' || 
                    audioExtensions.some(ext => filePath.toLowerCase().endsWith(ext));
    
    if (isAudio) {
      const stats = fs.statSync(filePath);
      const fileSizeMb = stats.size / (1024 * 1024);
      if (fileSizeMb > 10) {
        console.log(`[Audio Compression] Audio size ${fileSizeMb.toFixed(2)}MB is above 10MB. Compressing...`);
        if (status) {
          await status.update(`Mengompresi audio (${fileSizeMb.toFixed(1)}MB)...`);
        }
        const activeProcs = ctx.chat ? getChatProcesses(ctx.chat.id) : [];
        const signal = activeProcs.length > 0 ? activeProcs[activeProcs.length - 1].controller.signal : null;
        await compressAudioIfLarge(filePath, 10, signal);
      }
    }

    const stats = fs.statSync(filePath);
    const fileSizeMb = stats.size / (1024 * 1024);

    if (fileSizeMb > 50) {
      const msgText = `Berkas terlalu besar (${fileSizeMb.toFixed(1)}MB > 50MB limit Telegram). Mengunggah ke cloud storage...`;
      if (status) {
        await status.update(msgText);
      } else {
        await ctx.reply(`⏳ ${msgText}`);
      }

      const downloadLink = await uploadToTmpfiles(filePath);
      const filename = path.basename(filePath);
      const caption = captionOptions.caption || '';
      const messageText = `⚠️ *Berkas Melebihi Limit Telegram (50MB)*\n\n` +
        `📌 *Nama:* \`${filename}\`\n` +
        `📦 *Ukuran:* ${fileSizeMb.toFixed(1)} MB\n` +
        `${caption ? `💬 *Keterangan:* ${safeMarkdown(caption)}\n` : ''}\n` +
        `⬇️ *Tautan Unduhan:* [Klik untuk Mengunduh](${downloadLink})`;

      await ctx.reply(messageText, { parse_mode: 'Markdown' });
      return true;
    }

    if (fileType === 'video') {
      await ctx.replyWithVideo({ source: filePath }, captionOptions);
    } else if (fileType === 'audio') {
      await ctx.replyWithAudio({ source: filePath }, captionOptions);
    } else if (fileType === 'document') {
      await ctx.replyWithDocument({ source: filePath }, captionOptions);
    } else if (fileType === 'photo') {
      await ctx.replyWithPhoto({ source: filePath }, captionOptions);
    } else {
      await ctx.replyWithDocument({ source: filePath }, captionOptions);
    }
    return true;
  } catch (err) {
    console.error(`Error in sendFileSafe for type ${fileType}:`, err);
    throw err;
  }
}

/**
 * Convert markdown-style headers and bullet lists to Telegram-friendly format.
 * Telegram Markdown does NOT support ### headers or - bullet lists natively.
 */
function cleanAiResponse(text) {
  return text
    // ### Header -> *Header*
    .replace(/^#{3}\s+(.+)$/gm, '*$1*')
    // ## Header  -> *Header*
    .replace(/^#{2}\s+(.+)$/gm, '*$1*')
    // # Header   -> *Header*
    .replace(/^#{1}\s+(.+)$/gm, '*$1*')
    // Dash bullet  "- text" -> "• text"
    .replace(/^[ \t]*-\s+/gm, '\u2022 ')
    // Star bullet  "* text" -> "• text"  (only leading *, not inline bold)
    .replace(/^[ \t]*\*\s+/gm, '\u2022 ')
    // Collapse 3+ blank lines -> max 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function replySafe(ctx, text) {
  try {
    const cleaned = cleanAiResponse(text);
    if (cleaned.length > 4000) {
      for (let i = 0; i < cleaned.length; i += 4000) {
        await ctx.reply(cleaned.substring(i, i + 4000));
      }
      return;
    }
    await ctx.reply(safeMarkdown(cleaned), { parse_mode: 'Markdown' });
  } catch (err) {
    try {
      await ctx.reply(cleanAiResponse(text));
    } catch (err2) {
      console.error('Failed to send text:', err2.message);
    }
  }
}

function getStartMarkup(firstName) {
  const text = `Halo *${firstName}*! Saya adalah AI Agent Telegram Bot 🤖🚀\n\nSaya bertenaga Groq dan siap membantu Anda melakukan berbagai tugas cerdas, bermain game, membuat gambar, mendownload video, dan banyak lagi!\n\nSilakan gunakan tombol menu interaktif di bawah untuk menjelajah fitur kami secara langsung:`;
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🤖 Cara Tanya AI', 'ai_template:tanya_ai'),
      Markup.button.callback('🎮 Game Center', 'game:menu')
    ],
    [
      Markup.button.callback('🎨 Buat Gambar', 'ai_template:gambar'),
      Markup.button.callback('🌤️ Cek Cuaca', 'ai_template:cuaca')
    ],
    [
      Markup.button.callback('💰 Harga Crypto', 'ai_template:kripto'),
      Markup.button.callback('🚨 Info Gempa', 'ai_template:gempa')
    ],
    [
      Markup.button.callback('🕋 Jadwal Sholat', 'ai_template:sholat'),
      Markup.button.callback('🎬 Info Anime/Manga', 'ai_template:animemanga')
    ],
    [
      Markup.button.callback('🌐 Lookup WHOIS/IP', 'ai_template:whois'),
      Markup.button.callback('🎵 Cari Lirik', 'ai_template:lirik')
    ],
    [
      Markup.button.callback('📸 Screenshot Web', 'ai_template:ss'),
      Markup.button.callback('📰 Berita Populer', 'ai_template:berita')
    ],
    [
      Markup.button.callback('🧠 Sifat AI Agent', 'sifat:menu'),
      Markup.button.callback('🧠 Memori Saya', 'ai_template:memori')
    ],
    [
      Markup.button.callback('📊 Sisa Kuota', 'ai_template:limit'),
      Markup.button.callback('🛠️ Alat Lainnya', 'ai_template:lainnya')
    ],
    [
      Markup.button.callback('📖 Panduan Lengkap', 'ai_template:help')
    ]
  ]);
  return { text, keyboard };
}

bot.start((ctx) => {
  const firstName = safeMarkdown(ctx.from.first_name || 'Teman');
  const { text, keyboard } = getStartMarkup(firstName);
  ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.help((ctx) => {
  const helpMessage = `📖 *Panduan Lengkap AI Agent Bot*

*🤖 AI Agent:*
/ai \`[perintah]\` — Agent AI serba bisa
Contoh:
- \`/ai buatkan web kopi kekinian lalu zip\`
- \`/ai install axios lalu buat script fetch API\`

*🖼️ Gambar & Visual:*
/img \`[deskripsi]\` — Buat gambar AI (Pollinations)
- \`/img kucing astronot di luar angkasa\`
📷 Kirim/balas foto dengan \`/ocr\` atau \`/baca\` → Ekstrak teks dari foto
📷 Kirim foto → Analisis visual otomatis (tambah caption jika ada pertanyaan)

*🔍 Pencarian & Info:*
/cari \`[kata kunci]\` — Cari di Wikipedia
/cuaca \`[kota]\` — Cuaca real-time BMKG
/kripto \`[nama koin]\` — Harga cryptocurrency & grafik 7 hari
/saham \`[ticker]\` — Harga saham Indonesia & US & grafik 7 hari
/gempa — Info gempa bumi terkini dari BMKG 🚨
/sholat \`[kota]\` — Jadwal sholat harian kota Indonesia 🕋
/anime \`[judul]\` — Detail anime dari MyAnimeList 🎬
/manga \`[judul]\` — Detail manga dari MyAnimeList 📖
/whois \`[domain/IP]\` — Cek info WHOIS domain & GeoIP 🌐
/lirik \`[lagu]\` — Cari lirik lagu lengkap + cover 🎵
/ss \`[url]\` — Tangkapan layar website dari URL 📸
/berita \`[topik]\` — Berita terbaru Google News 📰

*📥 Download & Media:*
/ytmp4 \`[url]\` — Download video YouTube (MP4)
/ytmp3 \`[url]\` — Download audio YouTube (MP3)
/download \`[url]\` — Download video (YouTube, TikTok, dll)
/tts \`[teks]\` — Ubah teks ke suara / pesan suara (atau balas teks dengan /tts)
/meme \`[topik]\` — Buat meme AI lucu 🎭

*🔧 Tools & Sesi:*
/sifat — 🧠 Ganti kepribadian/sifat AI Agent (Wibu, Tsundere, dll.)
/translate \`[kode_bahasa]\` \`[teks]\` — Terjemahkan teks (Google Translate) 🌐
/currency \`[jumlah]\` \`[dari]\` \`[ke]\` — Konversi nilai mata uang 💱
/shortlink \`[url]\` — Singkat link/URL (TinyURL) 🔗
/ocr — Baca/ekstrak teks dari foto 📝
/krl \`[stasiun]\` — Cek jadwal KRL Commuterline (Comuline API) 🚆
/model \`[nama]\` — Lihat/ganti model AI
/thinking \`[off|low|high]\` — Lihat/ganti mode berpikir AI (off untuk respon cepat)
/memori — Lihat memori/fakta tentang Anda
/limit — Cek sisa kuota harian AI Anda
/status — Status & uptime bot
/export — Export riwayat chat ke file
/stop — 🛑 Hentikan permintaan AI yang sedang berjalan
/clear — Hapus memori sesi ini
/help — Tampilkan panduan lengkap penggunaan bot

*🎤 Input Lainnya:*
• Kirim *pesan suara* → transkripsi + proses AI
• Kirim *file teks* (.js/.py/.txt) + caption instruksi → AI analisis
• Chat langsung (privat) tanpa prefix /ai`;

  ctx.reply(helpMessage, { parse_mode: 'Markdown' });
});

bot.command('clear', (ctx) => {
  clearSessionHistory(ctx.chat.id);
  ctx.reply('🧹 Riwayat chat sesi ini telah berhasil dibersihkan! Mari kita mulai percakapan baru.');
});

function isAdmin(chatId) {
  const adminIds = config.adminIds || [];
  return adminIds.includes(String(chatId));
}

bot.command('admin', async (ctx) => {
  const chatId = ctx.chat.id;
  if (!isAdmin(chatId)) {
    return ctx.reply('⚠️ *Akses Ditolak!* Perintah ini hanya untuk Administrator bot.', { parse_mode: 'Markdown' });
  }

  const text = ctx.message.text.trim();
  const args = text.split(/\s+/).slice(1);
  const command = args[0] ? args[0].toLowerCase() : 'help';

  if (command === 'help') {
    const helpMsg = `🛠️ *Menu Admin AI Agent* 🛠️

Berikut adalah perintah admin yang tersedia:
• \`/admin info <chatId>\` - Melihat info lengkap pengguna.
• \`/admin setpremium <chatId> <hari>\` - Berikan status Premium selama X hari.
• \`/admin removepremium <chatId>\` - Hapus status Premium.
• \`/admin addquota <chatId> <jumlah>\` - Tambah kuota ekstra.
• \`/admin setquota <chatId> <jumlah>\` - Atur total kuota ekstra.
• \`/admin addpoints <chatId> <jumlah>\` - Tambah koin poin.
• \`/admin setpoints <chatId> <jumlah>\` - Atur total koin poin.
• \`/admin addtickets <chatId> <jumlah>\` - Tambah tiket gacha.
• \`/admin settickets <chatId> <jumlah>\` - Atur total tiket gacha.
• \`/admin setlevel <chatId> <level>\` - Atur level pengguna.`;
    return ctx.reply(helpMsg, { parse_mode: 'Markdown' });
  }

  const targetId = args[1];
  if (!targetId) {
    return ctx.reply('⚠️ Harap masukkan `<chatId>` target.\nContoh: `/admin info 1994347382`');
  }

  try {
    const userData = getUserData(targetId);
    if (!userData) {
      return ctx.reply(`❌ Data pengguna dengan ID \`${targetId}\` tidak ditemukan.`);
    }

    if (command === 'info') {
      const isPrem = isPremiumUser(targetId);
      const remTime = getPremiumRemainingTime(targetId);
      const infoMsg = `👤 *Info Pengguna:* \`${targetId}\`
━━━━━━━━━━━━━━━━━━━━
⭐ Level: *${userData.level || 1}* (XP: ${userData.xp || 0})
🪙 Koin Poin: *${userData.points || 0}*
🎟️ Tiket Gacha: *${userData.tickets || 0}*
🔋 Kuota Terpakai Hari Ini: *${(userData.used || 0).toLocaleString('id-ID')}*
💎 Kuota Ekstra Permanen: *${(userData.extraQuota || 0).toLocaleString('id-ID')}*
👑 Status Premium: *${isPrem ? 'Aktif' : 'Tidak Aktif'}* (${remTime})`;
      return ctx.reply(infoMsg, { parse_mode: 'Markdown' });
    }

    if (command === 'setpremium') {
      const days = parseInt(args[2]);
      if (isNaN(days) || days <= 0) {
        return ctx.reply('⚠️ Harap masukkan jumlah hari yang valid. Contoh: `/admin setpremium <chatId> 30`');
      }
      addPremiumDays(targetId, days);
      return ctx.reply(`✅ Berhasil memberikan status *Premium* selama *${days} hari* ke user \`${targetId}\`.`);
    }

    if (command === 'removepremium') {
      removePremium(targetId);
      return ctx.reply(`✅ Berhasil menghapus status *Premium* dari user \`${targetId}\`.`);
    }

    if (command === 'addquota') {
      const amount = parseInt(args[2]);
      if (isNaN(amount)) return ctx.reply('⚠️ Harap masukkan jumlah kuota yang valid.');
      addExtraQuota(targetId, amount);
      return ctx.reply(`✅ Berhasil menambahkan *+${amount.toLocaleString('id-ID')}* kuota ke user \`${targetId}\`.`);
    }

    if (command === 'setquota') {
      const amount = parseInt(args[2]);
      if (isNaN(amount) || amount < 0) return ctx.reply('⚠️ Harap masukkan jumlah kuota yang valid.');
      setExtraQuota(targetId, amount);
      return ctx.reply(`✅ Berhasil mengatur kuota user \`${targetId}\` menjadi *${amount.toLocaleString('id-ID')}*.`);
    }

    if (command === 'addpoints') {
      const amount = parseInt(args[2]);
      if (isNaN(amount)) return ctx.reply('⚠️ Harap masukkan jumlah poin yang valid.');
      addPoints(targetId, amount);
      return ctx.reply(`✅ Berhasil menambahkan *+${amount.toLocaleString('id-ID')}* koin poin ke user \`${targetId}\`.`);
    }

    if (command === 'setpoints') {
      const amount = parseInt(args[2]);
      if (isNaN(amount) || amount < 0) return ctx.reply('⚠️ Harap masukkan jumlah poin yang valid.');
      setPoints(targetId, amount);
      return ctx.reply(`✅ Berhasil mengatur poin user \`${targetId}\` menjadi *${amount.toLocaleString('id-ID')}*.`);
    }

    if (command === 'addtickets') {
      const amount = parseInt(args[2]);
      if (isNaN(amount)) return ctx.reply('⚠️ Harap masukkan jumlah tiket yang valid.');
      addTickets(targetId, amount);
      return ctx.reply(`✅ Berhasil menambahkan *+${amount.toLocaleString('id-ID')}* tiket ke user \`${targetId}\`.`);
    }

    if (command === 'settickets') {
      const amount = parseInt(args[2]);
      if (isNaN(amount) || amount < 0) return ctx.reply('⚠️ Harap masukkan jumlah tiket yang valid.');
      setTickets(targetId, amount);
      return ctx.reply(`✅ Berhasil mengatur tiket user \`${targetId}\` menjadi *${amount.toLocaleString('id-ID')}*.`);
    }

    if (command === 'setlevel') {
      const level = parseInt(args[2]);
      if (isNaN(level) || level <= 0) return ctx.reply('⚠️ Harap masukkan level yang valid (minimal 1).');
      setLevel(targetId, level);
      return ctx.reply(`✅ Berhasil mengatur level user \`${targetId}\` menjadi *Level ${level}*.`);
    }

    return ctx.reply('⚠️ Perintah admin tidak dikenali. Gunakan `/admin help` untuk daftar perintah.');

  } catch (err) {
    console.error('Error in admin command:', err);
    return ctx.reply(`❌ Terjadi kesalahan saat memproses perintah admin: ${err.message}`);
  }
});

bot.command(['game', 'play'], async (ctx) => {
  const { text, keyboard } = getGameMenu();
  await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.command(['arcade', 'gacha', 'shop'], async (ctx) => {
  const { text, keyboard } = getArcadeMenu(ctx.chat.id);
  await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.command(['catur', 'chess'], async (ctx) => {
  const { text, keyboard } = startChess(ctx.chat.id);
  await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.command('tictactoe', async (ctx) => {
  const { text, keyboard } = startTicTacToe(ctx.chat.id);
  await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.command('suit', async (ctx) => {
  const { text, keyboard } = startSuit(ctx.chat.id);
  await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.command('tebakkata', async (ctx) => {
  const { text, keyboard } = await startTebakKata(ctx.chat.id);
  await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.command('kuismat', async (ctx) => {
  const { text, keyboard } = startMathQuiz(ctx.chat.id);
  await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.command('tebakff', async (ctx) => {
  const { text, keyboard } = startTebakFf(ctx.chat.id);
  await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.command('tebakgambar', async (ctx) => {
  const tgRes = startTebakGambar(ctx.chat.id);
  try {
    await ctx.replyWithPhoto({ url: tgRes.imageUrl }, {
      caption: tgRes.text,
      parse_mode: 'Markdown',
      ...tgRes.keyboard
    });
  } catch (photoErr) {
    console.warn('Failed to send tebakgambar photo, using text fallback:', photoErr.message);
    const fallbackText = `${tgRes.text}\n\n🔗 *Gambar:* [Klik di sini untuk melihat gambar](${tgRes.imageUrl})`;
    await ctx.reply(fallbackText, {
      parse_mode: 'Markdown',
      ...tgRes.keyboard
    });
  }
});


bot.command('limit', async (ctx) => {
  const chatId = ctx.chat.id;
  const used = getUserUsage(chatId);
  const level = getUserLevel(chatId);
  const xp = getUserXp(chatId);
  const xpNeeded = level * 100;
  const pct = Math.floor((xp / xpNeeded) * 10);
  const bar = '█'.repeat(pct) + '░'.repeat(10 - pct);
  const xpPercentage = Math.floor((xp / xpNeeded) * 100);
  const baseLimit = getDailyLimit(chatId);
  const freeRemaining = Math.max(0, baseLimit - used);
  const extraQuota = getExtraQuota(chatId);
  const totalRemaining = freeRemaining + extraQuota;

  const isPremium = isPremiumUser(chatId);
  const remainingTime = getPremiumRemainingTime(chatId);
  const premiumInfoMsg = isPremium
    ? `👑 *Status Premium:* Aktif (${remainingTime})\n\n`
    : `👑 *Status Premium:* Tidak Aktif\n\n`;

  const quotaDetails = isPremium
    ? `🆓 Kuota Harian: *Tanpa Batas (Premium)* ♾️\n🔋 *Sisa Kuota:* *Unlimited* ♾️`
    : `🆓 Kuota Gratis Terpakai: *${used.toLocaleString('id-ID')}* / *${baseLimit.toLocaleString('id-ID')}* karakter (Meningkat seiring level)
⚡ Sisa Kuota Gratis Hari Ini: *${freeRemaining.toLocaleString('id-ID')}* karakter
💎 Kuota Ekstra Berbayar: *${extraQuota.toLocaleString('id-ID')}* karakter (Permanen)
🔋 *Total Kuota Tersisa:* *${totalRemaining.toLocaleString('id-ID')}* karakter`;

  const msg = `📊 *Status Kuota & Profil AI Anda*

👤 Pengguna: *${safeMarkdown(ctx.from?.first_name || 'Teman')}*
⭐ Level: *${level}*
✨ XP: *${xp}* / *${xpNeeded}* (${xpPercentage}%)
\`[${bar}]\`

${premiumInfoMsg}${quotaDetails}

🔄 _Kuota gratis di-reset otomatis menjadi 5.000 (ditambah bonus level) setiap jam 12 malam WIB (Asia/Jakarta)._`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💳 Top-Up Kuota (QRIS / VA)', 'topup:menu')],
    [Markup.button.callback('🔙 Menu Utama', 'ai_template:start')]
  ]);

  await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
});


bot.command('limittoken', async (ctx) => {
  const chatId = ctx.chat.id;
  const tokenUsage = getTokenUsage(chatId);
  const models = Object.keys(tokenUsage);

  if (models.length === 0) {
    return ctx.reply('📊 *Statistik Penggunaan Token Groq*\n\nBelum ada data penggunaan token untuk chat ini. Mulailah mengobrol dengan `/ai`!', { parse_mode: 'Markdown' });
  }

  let msg = `📊 *Statistik Penggunaan Token Groq*\n\nBerikut adalah total token yang telah dikonsumsi berdasarkan model yang digunakan:\n\n`;
  let overallTotal = 0;

  for (const model of models) {
    const usage = tokenUsage[model];
    overallTotal += usage.total_tokens || 0;
    msg += `🤖 *Model:* \`${model}\`\n`;
    msg += `• 📥 Prompt: *${(usage.prompt_tokens || 0).toLocaleString('id-ID')}* token\n`;
    msg += `• 📤 Completion: *${(usage.completion_tokens || 0).toLocaleString('id-ID')}* token\n`;
    msg += `• 🔋 Total: *${(usage.total_tokens || 0).toLocaleString('id-ID')}* token\n\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🔋 *Total Keseluruhan:* *${overallTotal.toLocaleString('id-ID')}* token`;

  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

function getTopupMenu() {
  const configured = isPakasirConfigured();
  if (!configured) {
    const text = `💳 *Menu Top-Up Kuota Karakter AI* 💳\n\n⚠️ *Sistem Pembayaran Belum Dikonfigurasi.*\nSilakan hubungi administrator bot Anda untuk mengatur kunci API Pakasir (\`PAKASIR_API_KEY\` dan \`PAKASIR_PROJECT_SLUG\`) di file \`.env\`.`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Kembali ke Menu Utama', 'ai_template:start')]
    ]);
    return { text, keyboard };
  }

  const title = `💳 *Menu Top-Up Kuota Karakter AI* 💳\n\nSilakan pilih paket kuota tambahan di bawah ini:`;
  const buttons = TOPUP_PACKAGES.map(p => {
    const detail = p.id === 'member_bulanan' ? 'Premium 30 Hari' : `${p.quota.toLocaleString('id-ID')} Karakter`;
    return [Markup.button.callback(`${p.name} - Rp ${p.amount.toLocaleString('id-ID')} (${detail})`, `topup:pkg:${p.id}`)];
  });
  
  buttons.push([Markup.button.callback('🔙 Kembali ke Menu Utama', 'ai_template:start')]);
  
  return { text: title, keyboard: Markup.inlineKeyboard(buttons) };
}

bot.command('topup', async (ctx) => {
  const { text, keyboard } = getTopupMenu();
  await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.command(['memori', 'memory'], async (ctx) => {
  const chatId = ctx.chat.id;
  const factsPath = path.join(config.memoryDir, `${chatId}_facts.json`);
  let userFacts = {};
  if (fs.existsSync(factsPath)) {
    try {
      userFacts = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
    } catch (e) {}
  }
  const factKeys = Object.keys(userFacts);
  if (factKeys.length > 0) {
    let msg = `🧠 *Memori/Fakta yang saya ingat tentang Anda:*\n`;
    for (const key of factKeys) {
      msg += `• *${key}*: ${userFacts[key]}\n`;
    }
    msg += `\nGunakan \`/clear\` untuk menghapus riwayat sesi ini.`;
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply('🧠 Saya belum memiliki memori tentang Anda. Beri tahu saya sesuatu seperti "Ingat bahwa saya suka pemrograman Javascript", maka saya akan menyimpannya!');
  }
});

bot.command('sifat', async (ctx) => {
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🤖 Biasa (Default)', 'sifat:biasa'),
      Markup.button.callback('🌸 Wibu / Otaku', 'sifat:wibu')
    ],
    [
      Markup.button.callback('😒 Tsundere', 'sifat:tsundere'),
      Markup.button.callback('🎭 Sarkastik (Ketus)', 'sifat:sarcastic')
    ],
    [
      Markup.button.callback('👔 Profesional', 'sifat:professional'),
      Markup.button.callback('🎓 Mentor Coding', 'sifat:mentor')
    ],
    [
      Markup.button.callback('🔙 Kembali ke Menu Utama', 'ai_template:start')
    ]
  ]);

  const chatId = ctx.chat.id;
  const personalityPath = path.join(config.memoryDir, `${chatId}_personality.txt`);
  let currentSifat = 'Biasa (Default) 🤖';
  if (fs.existsSync(personalityPath)) {
    try {
      const key = fs.readFileSync(personalityPath, 'utf8').trim();
      const mapping = {
        biasa: 'Biasa (Default) 🤖',
        wibu: '🌸 Wibu / Otaku',
        tsundere: '😒 Tsundere',
        sarcastic: '🎭 Sarkastik (Ketus)',
        professional: '👔 Profesional',
        mentor: '🎓 Mentor Coding'
      };
      currentSifat = mapping[key] || 'Biasa (Default) 🤖';
    } catch (e) {}
  }

  await ctx.reply(`🧠 *Pilih Sifat & Kepribadian AI Agent Anda* 🧠\n\nSifat saat ini: *${currentSifat}*\n\nSilakan pilih salah satu kepribadian di bawah ini:`, {
    parse_mode: 'Markdown',
    ...keyboard
  });
});

async function editToTemplate(ctx, text) {
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Kembali ke Utama', 'ai_template:start')]
  ]);
  try {
    await ctx.editMessageText(safeMarkdown(text), {
      parse_mode: 'Markdown',
      ...keyboard
    });
  } catch (err) {
    if (!err.message.includes('message is not modified')) {
      console.error('Failed to edit template:', err);
    }
  }
}

async function editToLainnyaTemplate(ctx, text) {
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Kembali ke Alat Lain', 'ai_template:lainnya')]
  ]);
  try {
    await ctx.editMessageText(safeMarkdown(text), {
      parse_mode: 'Markdown',
      ...keyboard
    });
  } catch (err) {
    if (!err.message.includes('message is not modified')) {
      console.error('Failed to edit lainnya template:', err);
    }
  }
}

bot.action(/^ai_template:(.+)$/, async (ctx) => {
  const choice = ctx.match[1];
  await ctx.answerCbQuery();
  const chatId = ctx.chat.id;

  if (choice === 'start') {
    const firstName = ctx.from.first_name || 'Teman';
    const { text, keyboard } = getStartMarkup(firstName);
    try {
      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    } catch (err) {
      if (!err.message.includes('message is not modified')) {
        console.error('Failed to return to start menu:', err);
      }
    }
  } else if (choice === 'tanya_ai') {
    const escapedUsername = ctx.botInfo.username.replace(/_/g, '\\_');
    const text = `🤖 *Cara Tanya AI Agent* 🤖\n\nUntuk berinteraksi dengan AI Agent, Anda dapat:\n\n1. **Kirim chat langsung (Private Chat):** Cukup ketik pertanyaan Anda secara langsung tanpa prefix apa pun.\n2. **Kirim pesan suara (Voice Note):** AI akan otomatis mentranskripsi suara Anda dan membalasnya.\n3. **Kirim foto/dokumen:** Anda bisa menyertakan pertanyaan pada teks caption.\n4. **Gunakan perintah /ai:** Ketik \`/ai [pertanyaan Anda]\`.\n5. **Di Group Chat:** Sebut (mention) @${escapedUsername} diikuti pertanyaan Anda.\n\nContoh:\n\`\`\`\n/ai buatkan skrip kalkulator javascript sederhana\n\`\`\``;
    await editToTemplate(ctx, text);
  } else if (choice === 'cuaca') {
    const text = `🌦️ *Cek Cuaca BMKG* 🌦️\n\nAnda dapat mengecek ramalan cuaca kota mana saja beserta grafik visual dari BMKG.\n\nKetik perintah berikut:\n\`/cuaca [nama kota]\`\n\nContoh:\n\`/cuaca Jakarta\`\n\`/cuaca Surabaya\``;
    await editToTemplate(ctx, text);
  } else if (choice === 'gambar') {
    const text = `🎨 *Buat Gambar AI* 🎨\n\nBuat gambar kreatif berkualitas tinggi dari deskripsi teks.\n\nKetik perintah berikut:\n\`/img [deskripsi visual]\`\n\nContoh:\n\`/img pemandangan gunung es fantasi dengan warna neon sinematik\``;
    await editToTemplate(ctx, text);
  } else if (choice === 'kripto') {
    const text = `💰 *Harga Crypto* 💰\n\nCek harga cryptocurrency real-time (USD & IDR) beserta persentase 24 jam.\n\nKetik perintah berikut:\n\`/kripto [nama koin]\`\n\nContoh:\n\`/kripto bitcoin\`\n\`/kripto ethereum\``;
    await editToTemplate(ctx, text);
  } else if (choice === 'gempa') {
    const text = `🚨 *Info Gempa Bumi BMKG* 🚨\n\nUntuk melihat info gempa bumi terkini di Indonesia beserta peta visual dari BMKG:\n\nKetik perintah:\n\`/gempa\`\n\nAtau tanyakan langsung ke AI Agent:\n_"Tampilkan info gempa bumi terbaru di Indonesia"_`;
    await editToTemplate(ctx, text);
  } else if (choice === 'sholat') {
    const text = `🕋 *Jadwal Sholat Harian* 🕋\n\nCek waktu sholat hari ini untuk kota/wilayah mana saja di Indonesia.\n\nKetik perintah:\n\`/sholat [nama kota]\`\n\nContoh:\n\`/sholat Jakarta\`\n\`/sholat Surabaya\`\n\nAtau tanyakan langsung ke AI Agent:\n_"Jadwal sholat kota Bandung hari ini"_`;
    await editToTemplate(ctx, text);
  } else if (choice === 'animemanga') {
    const text = `🎬 *Informasi Anime & Manga MAL* 📖\n\nDapatkan detail rating, genre, tipe, status, sinopsis, dan gambar cover dari MyAnimeList.\n\nKetik perintah:\n\`/anime [judul]\` atau \`/manga [judul]\`\n\nContoh:\n\`/anime Naruto\`\n\`/manga Attack on Titan\`\n\nAtau tanyakan langsung ke AI Agent:\n_"Cari anime One Piece di MAL"_`;
    await editToTemplate(ctx, text);
  } else if (choice === 'whois') {
    const text = `🌐 *WHOIS Domain & Geolokasi IP* 🌐\n\nPeriksa data registrar domain website atau lacak geolokasi suatu alamat IP.\n\nKetik perintah:\n\`/whois [domain/IP]\`\n\nContoh:\n\`/whois google.com\`\n\`/whois 8.8.8.8\`\n\nAtau tanyakan langsung ke AI Agent:\n_"Lookup IP 1.1.1.1"_`;
    await editToTemplate(ctx, text);
  } else if (choice === 'lirik') {
    const text = `🎵 *Cari Lirik Lagu* 🎵\n\nCari lirik lagu favorit Anda beserta cover album/artwork resminya.\n\nKetik perintah:\n\`/lirik [judul lagu / penyanyi]\`\n\nContoh:\n\`/lirik Faded Alan Walker\`\n\nAtau tanyakan langsung ke AI Agent:\n_"Tolong cari lirik lagu Bohemian Rhapsody"_`;
    await editToTemplate(ctx, text);
  } else if (choice === 'ss') {
    const text = `📸 *Tangkapan Layar Website* 📸\n\nAmbil screenshot tampilan website secara real-time dari sebuah URL.\n\nKetik perintah:\n\`/ss [URL]\`\n\nContoh:\n\`/ss wikipedia.org\`\n\nAtau tanyakan langsung ke AI Agent:\n_"Ambil screenshot google.com"_`;
    await editToTemplate(ctx, text);
  } else if (choice === 'berita') {
    const text = `📰 *Cari Berita Google News* 📰\n\nCari daftar artikel berita terpopuler seputar topik tertentu.\n\nKetik perintah:\n\`/berita [topik]\`\n\nContoh:\n\`/berita kecerdasan buatan\`\n\nAtau tanyakan langsung ke AI Agent:\n_"Tampilkan berita terbaru seputar teknologi AI"_`;
    await editToTemplate(ctx, text);
  } else if (choice === 'memori') {
    const factsPath = path.join(config.memoryDir, `${chatId}_facts.json`);
    let userFacts = {};
    if (fs.existsSync(factsPath)) {
      try {
        userFacts = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
      } catch (e) {}
    }
    const factKeys = Object.keys(userFacts);
    let msg = `🧠 *Memori/Fakta yang saya ingat tentang Anda:*\n\n`;
    if (factKeys.length > 0) {
      for (const key of factKeys) {
        msg += `• *${key}*: ${userFacts[key]}\n`;
      }
      msg += `\nGunakan perintah \`/clear\` di chat jika ingin menghapus seluruh memori sesi ini.`;
    } else {
      msg += `Saya belum memiliki memori khusus tentang Anda.\n\n_Beri tahu saya fakta/nama panggilan Anda di chat, misalnya:_ "Ingat nama saya adalah Arya dan hobi saya main basket", maka AI akan menyimpannya secara otomatis!`;
    }
    await editToTemplate(ctx, msg);
  } else if (choice === 'limit') {
    const used = getUserUsage(chatId);
    const level = getUserLevel(chatId);
    const xp = getUserXp(chatId);
    const xpNeeded = level * 100;
    const pct = Math.floor((xp / xpNeeded) * 10);
    const bar = '█'.repeat(pct) + '░'.repeat(10 - pct);
    const xpPercentage = Math.floor((xp / xpNeeded) * 100);
    const baseLimit = getDailyLimit(chatId);
    const freeRemaining = Math.max(0, baseLimit - used);
    const extraQuota = getExtraQuota(chatId);
    const totalRemaining = freeRemaining + extraQuota;

    const text = `📊 *Status Kuota & Profil AI Anda*

👤 Pengguna: *${safeMarkdown(ctx.from?.first_name || 'Teman')}*
⭐ Level: *${level}*
✨ XP: *${xp}* / *${xpNeeded}* (${xpPercentage}%)
\`[${bar}]\`

🆓 Kuota Gratis Terpakai: *${used.toLocaleString('id-ID')}* / *${baseLimit.toLocaleString('id-ID')}* karakter (Meningkat seiring level)
⚡ Sisa Kuota Gratis Hari Ini: *${freeRemaining.toLocaleString('id-ID')}* karakter
💎 Kuota Ekstra Berbayar: *${extraQuota.toLocaleString('id-ID')}* karakter (Permanen)

🔋 *Total Kuota Tersisa:* *${totalRemaining.toLocaleString('id-ID')}* karakter

🔄 _Kuota gratis di-reset otomatis menjadi 5.000 (ditambah bonus level) setiap jam 12 malam WIB (Asia/Jakarta)._`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('💳 Top-Up Kuota (QRIS / VA)', 'topup:menu')],
      [Markup.button.callback('🔙 Kembali ke Utama', 'ai_template:start')]
    ]);
    
    try {
      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    } catch (err) {
      if (!err.message.includes('message is not modified')) {
        console.error('Failed to edit limit template:', err);
      }
    }
  } else if (choice === 'help') {
    const text = `📖 *Panduan Lengkap AI Agent Bot*

*🤖 AI Agent:*
• /ai \`[perintah]\` — Jalankan perintah AI
• Kirim file/foto/suara langsung untuk diproses AI

*🖼️ Gambar & Visual:*
• /img \`[deskripsi]\` — Buat gambar AI
• /meme \`[topik]\` — Buat meme lucu 🎭
• /tts \`[teks]\` — Teks menjadi pesan suara 🗣️
• /download \`[url]\` — Unduh video (YT, TikTok)
• /ytmp4 & /ytmp3 — Unduh video/audio YouTube
• Kirim/balas foto dengan \`/ocr\` atau \`/baca\` untuk membaca teks 📝

*🔍 Pencarian & Info:*
• /cari \`[kueri]\` — Wikipedia
• /cuaca \`[kota]\` — Prakiraan Cuaca BMKG
• /kripto \`[koin]\` — Harga koin crypto + grafik
• /saham \`[ticker]\` — Harga saham Indonesia & US + grafik
• /gempa — Info gempa bumi terkini BMKG + peta 🚨
• /sholat \`[kota]\` — Jadwal sholat harian 🕋
• /anime \`[judul]\` — Info detail anime 🎬
• /manga \`[judul]\` — Info detail manga 📖
• /whois \`[domain/IP]\` — Info WHOIS & GeoIP 🌐
• /lirik \`[lagu]\` — Cari lirik lagu + cover 🎵
• /ss \`[url]\` — Screenshot website 📸
• /berita \`[topik]\` — Berita Google News 📰

*🔧 Tools & Sesi:*
• /sifat — Ganti sifat/kepribadian AI (Wibu, Tsundere, dll.) 🧠
• /translate \`[bahasa]\` \`[teks]\` — Terjemahkan teks 🌐
• /currency \`[jumlah]\` \`[dari]\` \`[ke]\` — Konversi nilai mata uang 💱
• /shortlink \`[url]\` — Singkat link/URL 🔗
• /ocr — Baca/ekstrak teks dari foto 📝
• /limit — Cek sisa kuota harian Anda
• /model — Ganti model AI
• /thinking — Ganti mode berpikir AI (off/low/high)
• /memori — Lihat fakta tersimpan
• /clear — Bersihkan riwayat chat sesi ini
• /status — Uptime & status bot`;
    await editToTemplate(ctx, text);
  } else if (choice === 'lainnya') {
    const text = `🛠️ *Alat & Fitur Lainnya* 🛠️

Berikut adalah daftar menu alat dan utilitas pendukung lainnya yang tersedia di bot ini. Pilih salah satu tombol di bawah untuk melihat cara penggunaan dan contohnya:`;
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📥 Downloader', 'ai_template:tool_download'),
        Markup.button.callback('🗣️ Text to Speech', 'ai_template:tool_tts')
      ],
      [
        Markup.button.callback('🎭 Meme Generator', 'ai_template:tool_meme'),
        Markup.button.callback('🌐 Terjemahan', 'ai_template:tool_translate')
      ],
      [
        Markup.button.callback('💱 Konversi Kurs', 'ai_template:tool_currency'),
        Markup.button.callback('🔗 Shortlink', 'ai_template:tool_shortlink')
      ],
      [
        Markup.button.callback('🚆 Jadwal KRL', 'ai_template:tool_krl'),
        Markup.button.callback('📝 OCR Ekstrak Teks', 'ai_template:tool_ocr')
      ],
      [
        Markup.button.callback('📱 QR Code', 'ai_template:tool_qr'),
        Markup.button.callback('🎙️ Filter Suara', 'ai_template:tool_voice')
      ],
      [
        Markup.button.callback('✨ Enhance HD', 'ai_template:tool_hd'),
        Markup.button.callback('🔙 Menu Utama', 'ai_template:start')
      ]
    ]);
    try {
      await ctx.editMessageText(safeMarkdown(text), {
        parse_mode: 'Markdown',
        ...keyboard
      });
    } catch (err) {
      if (!err.message.includes('message is not modified')) {
        console.error('Failed to edit lainnya menu:', err);
      }
    }
  } else if (choice === 'tool_download') {
    const text = `📥 *Pengunduh Video & Audio (Downloader)* 📥

Anda dapat mengunduh video atau audio dari berbagai platform media sosial seperti YouTube, TikTok, Instagram, Twitter/X, Facebook, dll.

*Pilihan Perintah:*
• \`/download [URL]\` — Unduh video/audio secara otomatis dari platform mana pun.
• \`/ytmp4 [URL]\` — Unduh video YouTube dalam format MP4.
• \`/ytmp3 [URL]\` — Unduh audio YouTube dalam format MP3.

*Contoh:*
\`\`\/download https://tiktok.com/...\`\`
\`\`\/ytmp3 https://youtu.be/...\`\``;
    await editToLainnyaTemplate(ctx, text);
  } else if (choice === 'tool_tts') {
    const text = `🗣️ *Teks Jadi Suara (Text-to-Speech)* 🗣️

Ubah teks tulisan menjadi pesan suara/voice note audio dalam Bahasa Indonesia secara otomatis.

*Perintah:*
• \`/tts [teks yang ingin diucapkan]\`
• Anda juga dapat membalas (reply) suatu pesan teks dari user lain dengan mengetik \`/tts\`.

*Contoh:*
\`\`\/tts Halo semuanya, selamat pagi! Semoga hari kalian menyenangkan.\`\``;
    await editToLainnyaTemplate(ctx, text);
  } else if (choice === 'tool_meme') {
    const text = `🎭 *AI Meme Generator* 🎭

Buat gambar meme lucu secara instan berdasarkan topik yang Anda inginkan menggunakan kecerdasan buatan.

*Perintah:*
• \`/meme [topik meme]\`

*Contoh:*
\`\`\/meme programmer lembur malam jumat\`\`
\`\`\/meme mahasiswa semester akhir bimbingan\`\``;
    await editToLainnyaTemplate(ctx, text);
  } else if (choice === 'tool_translate') {
    const text = `🌐 *Terjemahan Teks (Translate)* 🌐

Terjemahkan teks dari satu bahasa ke bahasa lain secara cepat menggunakan Google Translate.

*Perintah:*
• \`/translate [kode_bahasa] [teks]\`

*Contoh:*
• Ke Inggris: \`/translate en Selamat pagi dunia\`
• Ke Indonesia: \`/translate id Good morning world\`
• Ke Jepang: \`/translate ja Terima kasih banyak\``;
    await editToLainnyaTemplate(ctx, text);
  } else if (choice === 'tool_currency') {
    const text = `💱 *Konversi Nilai Mata Uang* 💱

Cek nilai tukar dan konversikan mata uang asing ke mata uang lainnya dengan kurs real-time terbaru.

*Perintah:*
• \`/currency [jumlah] [dari_kode] [ke_kode]\`

*Contoh:*
• \`/currency 100 usd idr\` (Konversi 100 USD ke IDR)
• \`/currency 500000 idr jpy\` (Konversi 500.000 IDR ke JPY)
• \`/currency 1 btc usd\` (Konversi 1 Bitcoin ke USD)

_Catatan: Singkatan kode mata uang menggunakan format internasional 3 huruf (USD, IDR, BTC, JPY, EUR, dll.)._`;
    await editToLainnyaTemplate(ctx, text);
  } else if (choice === 'tool_shortlink') {
    const text = `🔗 *Penyingkat URL (Shortlink)* 🔗

Singkat tautan/link URL yang panjang menjadi link pendek yang rapi menggunakan TinyURL.

*Perintah:*
• \`/shortlink [URL panjang]\`

*Contoh:*
\`\`\/shortlink https://google.com/search?q=kecerdasan+buatan+dan+teknologi+masa+depan\`\``;
    await editToLainnyaTemplate(ctx, text);
  } else if (choice === 'tool_krl') {
    const text = `🚆 *Jadwal Kereta KRL Commuterline* 🚆

Pantau jadwal keberangkatan KRL Commuterline terdekat untuk stasiun mana saja secara real-time.

*Perintah:*
• \`/krl [nama stasiun]\`

*Contoh:*
\`\`\/krl Manggarai\`\`
\`\`\/krl Bogor\`\`
\`\`\/krl Tanah Abang\`\``;
    await editToLainnyaTemplate(ctx, text);
  } else if (choice === 'tool_ocr') {
    const text = `📝 *Ekstrak Teks dari Gambar (OCR)* 📝

Ekstrak tulisan/teks yang ada di dalam gambar atau foto secara otomatis menggunakan teknologi Optical Character Recognition.

*Perintah/Cara Penggunaan:*
1. Kirim gambar/foto ke bot.
2. Balas (reply) gambar tersebut dengan mengetik \`/ocr\` atau \`/baca\`.
3. AI akan memproses gambar tersebut dan mengirimkan hasil ekstraksi teksnya.`;
    await editToLainnyaTemplate(ctx, text);
  } else if (choice === 'tool_qr') {
    const text = `📱 *Pembuat QR Code* 📱

Buat QR Code dari teks atau URL/link apa saja secara instan.

*Perintah:*
• \`/qr [teks atau URL]\`

*Contoh:*
\`\`\/qr https://wikipedia.org\`\`
\`\`\/qr Halo, ini pesan rahasia di QR code\`\``;
    await editToLainnyaTemplate(ctx, text);
  } else if (choice === 'tool_voice') {
    const text = `🎙️ *Filter Efek Suara (Voice Changer)* 🎙️

Terapkan berbagai efek filter unik ke pesan suara/audio Anda.

*Pilihan Efek:*
\`chipmunk\`, \`deep\`, \`robot\`, \`fast\`, \`slow\`, \`echo\`

*Perintah/Cara Penggunaan:*
1. Kirim/teruskan berkas audio atau pesan suara ke bot.
2. Balas (reply) audio tersebut dengan mengetik:
   \`/voice [jenis_filter]\` atau \`/filter [jenis_filter]\`

*Contoh:*
\`\`\/voice chipmunk\`\`
\`\`\/filter deep\`\``;
    await editToLainnyaTemplate(ctx, text);
  } else if (choice === 'tool_hd') {
    const text = `✨ *Tingkatkan Kualitas Gambar (Enhance HD)* ✨

Tingkatkan ketajaman, resolusi, dan kualitas visual gambar/foto Anda secara instan menggunakan AI.

*Perintah/Cara Penggunaan:*
1. Kirim gambar/foto ke bot.
2. Balas (reply) gambar tersebut dengan mengetik \`/hd\` atau \`/enhance\` atau \`/upscale\`.
3. AI akan memproses gambar tersebut dan mengembalikan versi resolusi tingginya (HD).`;
    await editToLainnyaTemplate(ctx, text);
  }
});

bot.action(/^sifat:(.+)$/, async (ctx) => {
  const chosen = ctx.match[1];
  const chatId = ctx.chat.id;
  const personalityPath = path.join(config.memoryDir, `${chatId}_personality.txt`);

  try {
    await ctx.answerCbQuery();
    
    if (chosen === 'menu') {
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('🤖 Biasa (Default)', 'sifat:biasa'),
          Markup.button.callback('🌸 Wibu / Otaku', 'sifat:wibu')
        ],
        [
          Markup.button.callback('😒 Tsundere', 'sifat:tsundere'),
          Markup.button.callback('🎭 Sarkastik (Ketus)', 'sifat:sarcastic')
        ],
        [
          Markup.button.callback('👔 Profesional', 'sifat:professional'),
          Markup.button.callback('🎓 Mentor Coding', 'sifat:mentor')
        ],
        [
          Markup.button.callback('🔙 Kembali ke Menu Utama', 'ai_template:start')
        ]
      ]);

      let currentSifat = 'Biasa (Default) 🤖';
      if (fs.existsSync(personalityPath)) {
        try {
          const key = fs.readFileSync(personalityPath, 'utf8').trim();
          const mapping = {
            biasa: 'Biasa (Default) 🤖',
            wibu: '🌸 Wibu / Otaku',
            tsundere: '😒 Tsundere',
            sarcastic: '🎭 Sarkastik (Ketus)',
            professional: '👔 Profesional',
            mentor: '🎓 Mentor Coding'
          };
          currentSifat = mapping[key] || 'Biasa (Default) 🤖';
        } catch (e) {}
      }

      await ctx.editMessageText(`🧠 *Pilih Sifat & Kepribadian AI Agent Anda* 🧠\n\nSifat saat ini: *${currentSifat}*\n\nSilakan pilih salah satu kepribadian di bawah ini:`, {
        parse_mode: 'Markdown',
        ...keyboard
      });
      return;
    }

    if (chosen === 'biasa') {
      if (fs.existsSync(personalityPath)) {
        fs.unlinkSync(personalityPath);
      }
    } else {
      fs.writeFileSync(personalityPath, chosen, 'utf8');
    }

    const mapping = {
      biasa: 'Biasa (Default) 🤖',
      wibu: 'Wibu / Otaku 🌸',
      tsundere: 'Tsundere 😒',
      sarcastic: 'Sarkastik (Ketus) 🎭',
      professional: 'Profesional 👔',
      mentor: 'Mentor Coding 🎓'
    };

    const sifatName = mapping[chosen] || 'Biasa (Default) 🤖';
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🔙 Pilih Sifat Lain', 'sifat:menu'),
        Markup.button.callback('🔙 Menu Utama', 'ai_template:start')
      ]
    ]);
    
    await ctx.editMessageText(`✅ Sifat AI Agent berhasil diubah menjadi: *${sifatName}*\n\nSilakan ajak bicara AI untuk melihat perubahannya!`, {
      parse_mode: 'Markdown',
      ...keyboard
    });
  } catch (err) {
    console.error('Error setting personality:', err);
    await ctx.reply(`❌ Gagal mengubah sifat AI: ${err.message}`);
  }
});

// Top-Up callback query router
bot.action(/^topup:(.+)$/, async (ctx) => {
  const actionData = ctx.match[1];
  const chatId = ctx.chat.id;

  try {
    await ctx.answerCbQuery();

    if (actionData === 'menu') {
      const { text, keyboard } = getTopupMenu();
      try {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
      } catch (err) {
        try {
          await ctx.deleteMessage();
        } catch (e) {}
        await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
      }
      return;
    }

    // 1. Choose package
    if (actionData.startsWith('pkg:')) {
      const packageId = actionData.split(':')[1];
      const pack = TOPUP_PACKAGES.find(p => p.id === packageId);
      if (!pack) return ctx.reply('Paket tidak ditemukan.');

      const text = `💳 *Detail Pembelian Kuota* 💳\n\n📌 Paket: *${pack.name}*\n💰 Nominal: *Rp ${pack.amount.toLocaleString('id-ID')}*\n⚡ Kuota Didapat: *${pack.quota.toLocaleString('id-ID')} karakter* (Permanen)\n\nSilakan pilih metode pembayaran di bawah ini:`;
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('📱 QRIS (OVO/Dana/BCA/Gopay/dll)', `topup:pay:${packageId}:qris`)
        ],
        [
          Markup.button.callback('🏛️ BNI Virtual Account', `topup:pay:${packageId}:bni_va`),
          Markup.button.callback('🏛️ BRI Virtual Account', `topup:pay:${packageId}:bri_va`)
        ],
        [
          Markup.button.callback('🏛️ CIMB Virtual Account', `topup:pay:${packageId}:cimb_niaga_va`),
          Markup.button.callback('🏛️ Permata Virtual Account', `topup:pay:${packageId}:permata_va`)
        ],
        [
          Markup.button.callback('🔙 Kembali ke Paket', 'topup:menu')
        ]
      ]);

      try {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
      } catch (err) {
        try {
          await ctx.deleteMessage();
        } catch (e) {}
        await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
      }
      return;
    }

    // 2. Generate Payment
    if (actionData.startsWith('pay:')) {
      const parts = actionData.split(':');
      const packageId = parts[1];
      const method = parts[2];
      const pack = TOPUP_PACKAGES.find(p => p.id === packageId);
      if (!pack) return ctx.reply('Paket tidak ditemukan.');

      try {
        await ctx.editMessageText(`⏳ Sedang membuat kode pembayaran / Virtual Account via Pakasir...\nMohon tunggu sebentar.`);
      } catch (err) {
        try {
          await ctx.deleteMessage();
        } catch (e) {}
        await ctx.reply(`⏳ Sedang membuat kode pembayaran / Virtual Account via Pakasir...\nMohon tunggu sebentar.`);
      }

      try {
        const txData = await createTransaction(chatId, method, packageId);
        const p = txData.payment;

        const cleanMethodName = method === 'qris' ? 'QRIS' : method.toUpperCase().replace('_', ' ');
        const expiryDate = new Date(p.expired_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

        if (method === 'qris') {
          const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=450x450&data=${encodeURIComponent(p.payment_number)}`;
          
          const caption = `📱 *PEMBAYARAN VIA QRIS (PAKASIR)* 📱\n\n` +
            `📌 Paket: *${pack.name}*\n` +
            `🧾 Invoice: \`${p.order_id}\`\n` +
            `💰 Total Bayar: *Rp ${p.total_payment.toLocaleString('id-ID')}*\n` +
            `⏳ Berlaku Hingga: *${expiryDate} WIB*\n\n` +
            `📢 *Instruksi:* \n` +
            `1. Scan gambar QR Code di atas menggunakan aplikasi e-wallet Anda (Gopay, OVO, Dana, LinkAja, ShopeePay) atau M-Banking (BCA, Mandiri, BRI, BNI, dll).\n` +
            `2. Masukkan pin dan bayar sesuai nominal.\n` +
            `3. Kuota akan otomatis ditambahkan setelah pembayaran sukses!`;

          const buttons = [
            [Markup.button.callback('🔄 Cek Status Pembayaran', `topup:check:${p.order_id}:${p.amount}`)],
            [Markup.button.callback('❌ Tutup / Batalkan', 'topup:menu')]
          ];

          // Clear previous loading message
          try {
            await ctx.deleteMessage();
          } catch (e) {}

          await ctx.replyWithPhoto({ url: qrCodeUrl }, {
            caption,
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
          });
        } else {
          // Virtual Account
          const text = `🏛️ *PEMBAYARAN VIA ${cleanMethodName}* 🏛️\n\n` +
            `📌 Paket: *${pack.name}*\n` +
            `🧾 Invoice: \`${p.order_id}\`\n` +
            `🏦 Bank Tujuan: *${cleanMethodName}*\n` +
            `💳 Nomor Virtual Account: \`${p.payment_number}\`\n` +
            `💰 Total Transfer: *Rp ${p.total_payment.toLocaleString('id-ID')}*\n` +
            `⏳ Berlaku Hingga: *${expiryDate} WIB*\n\n` +
            `📢 *Instruksi:* \n` +
            `1. Lakukan transfer ke bank tujuan melalui ATM, M-Banking, atau Internet Banking menggunakan nomor VA di atas.\n` +
            `2. Masukkan nominal transfer tepat sesuai tagihan.\n` +
            `3. Kuota akan otomatis ditambahkan setelah pembayaran sukses!`;

          const buttons = [
            [Markup.button.callback('🔄 Cek Status Pembayaran', `topup:check:${p.order_id}:${p.amount}`)],
            [Markup.button.callback('❌ Tutup / Batalkan', 'topup:menu')]
          ];

          await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
          });
        }

        // Start background polling
        startTransactionPolling(chatId, p.order_id, p.amount);

      } catch (err) {
        console.error('Create transaction handler error:', err);
        await ctx.editMessageText(`❌ Gagal membuat transaksi pembayaran: ${err.message}\n\nSilakan coba lagi beberapa saat lagi.`, Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Kembali ke Menu', 'topup:menu')]
        ]));
      }
      return;
    }

    // 3. Manual Check Status
    if (actionData.startsWith('check:')) {
      const parts = actionData.split(':');
      const orderId = parts[1];
      const amount = parseInt(parts[2]);

      const txStatus = await checkTransactionStatus(orderId, amount);

      if (txStatus.status === 'completed') {
        stopTransactionPolling(orderId);
        const isPremiumPkg = txStatus.packageId === 'member_bulanan';
        const successMsg = isPremiumPkg
          ? `🎉 *PEMBAYARAN SUKSES!* 🎉\n\nInvoice \`${orderId}\` telah berhasil diverifikasi. Keanggotaan *Member Premium Bulanan* Anda telah aktif! Anda sekarang memiliki akses penuh ke semua model AI terbaik dan kuota tanpa batas. Silakan cek status Anda menggunakan perintah \`/limit\`. Terima kasih!`
          : `🎉 *PEMBAYARAN SUKSES!* 🎉\n\nInvoice \`${orderId}\` telah berhasil diverifikasi. Kuota ekstra Anda telah ditambahkan! Silakan cek kembali sisa kuota Anda menggunakan perintah \`/limit\`. Terima kasih atas dukungannya!`;
        await ctx.reply(successMsg);
        try {
          await ctx.deleteMessage();
        } catch (e) {}
      } else if (txStatus.status === 'expired') {
        stopTransactionPolling(orderId);
        await ctx.reply(`😢 *TRANSAKSI KADALUWARSA!* \n\nInvoice \`${orderId}\` telah kedaluwarsa. Silakan lakukan top-up ulang.`);
        try {
          await ctx.deleteMessage();
        } catch (e) {}
      } else {
        await ctx.reply(`ℹ️ *Status Pembayaran:* \`PENDING\`\n\nMenunggu pembayaran masuk ke sistem kami. Silakan selesaikan pembayaran sesuai tagihan.`);
      }
      return;
    }

  } catch (err) {
    console.error('Error in topup action handler:', err);
  }
});

// Helper for starting polling
function startTransactionPolling(chatId, orderId, amount) {
  stopTransactionPolling(orderId);

  console.log(`[Payment] Starting background status polling for order: ${orderId}`);
  
  const startTime = Date.now();
  const maxPollDuration = 15 * 60 * 1000;

  const intervalId = setInterval(async () => {
    if (Date.now() - startTime > maxPollDuration) {
      console.log(`[Payment] Order ${orderId} exceeded maximum poll duration. Stopping poll.`);
      stopTransactionPolling(orderId);
      return;
    }

    try {
      const txStatus = await checkTransactionStatus(orderId, amount);
      if (txStatus.status === 'completed') {
        stopTransactionPolling(orderId);
        const isPremiumPkg = txStatus.packageId === 'member_bulanan';
        const successMsg = isPremiumPkg
          ? `🎉 *PEMBAYARAN SUKSES!* 🎉\n\nInvoice \`${orderId}\` telah berhasil diverifikasi. Keanggotaan *Member Premium Bulanan* Anda telah aktif! Anda sekarang memiliki akses penuh ke semua model AI terbaik dan kuota tanpa batas. Silakan cek status Anda menggunakan perintah \`/limit\`. Terima kasih!`
          : `🎉 *PEMBAYARAN SUKSES!* 🎉\n\nInvoice \`${orderId}\` telah berhasil diverifikasi. Kuota ekstra Anda telah ditambahkan! Silakan cek kembali sisa kuota Anda menggunakan perintah \`/limit\`. Terima kasih atas dukungannya!`;
        await bot.telegram.sendMessage(chatId, successMsg);
      } else if (txStatus.status === 'expired') {
        stopTransactionPolling(orderId);
        await bot.telegram.sendMessage(chatId, `😢 *TRANSAKSI KADALUWARSA!* \n\nInvoice \`${orderId}\` telah kedaluwarsa. Silakan lakukan top-up ulang.`);
      }
    } catch (e) {
      console.error(`[Payment Poll Error] Order ${orderId}:`, e.message);
    }
  }, 7000);

  activePolls.set(orderId, intervalId);
}

// Helper for stopping polling
function stopTransactionPolling(orderId) {
  if (activePolls.has(orderId)) {
    console.log(`[Payment] Stopping background status polling for order: ${orderId}`);
    clearInterval(activePolls.get(orderId));
    activePolls.delete(orderId);
  }
}

// Game Center callback query router
bot.action(/^game:(.+)$/, async (ctx) => {
  const actionData = ctx.match[1];
  const chatId = ctx.chat.id;

  try {
    let result = null;

    if (actionData === 'menu') {
      result = getGameMenu();
    } else if (actionData === 'arcade:menu') {
      result = getArcadeMenu(chatId);
    } else if (actionData === 'arcade:shop_menu') {
      result = getArcadeShopMenu(chatId);
    } else if (actionData === 'arcade:buy_ticket') {
      const buyRes = buyGachaTicket(chatId);
      result = {
        text: buyRes.text,
        keyboard: Markup.inlineKeyboard([
          [
            Markup.button.callback('🎡 Tarik Gacha (1 🎟️)', 'game:arcade:draw_gacha'),
            Markup.button.callback('🎟️ Beli Lagi (50 🪙)', 'game:arcade:buy_ticket')
          ],
          [
            Markup.button.callback('🔙 Kembali ke Arcade', 'game:arcade:menu')
          ]
        ])
      };
    } else if (actionData === 'arcade:draw_gacha') {
      const drawRes = drawGacha(chatId);
      if (!drawRes.success) {
        result = {
          text: drawRes.text,
          keyboard: Markup.inlineKeyboard([
            [
              Markup.button.callback('🎟️ Beli Tiket (50 🪙)', 'game:arcade:buy_ticket'),
              Markup.button.callback('🔙 Kembali ke Arcade', 'game:arcade:menu')
            ]
          ])
        };
      } else {
        await ctx.answerCbQuery();
        const gachaKb = Markup.inlineKeyboard([
          [
            Markup.button.callback('🎡 Tarik Lagi (1 🎟️)', 'game:arcade:draw_gacha'),
            Markup.button.callback('🎟️ Beli Tiket (50 🪙)', 'game:arcade:buy_ticket')
          ],
          [
            Markup.button.callback('🔙 Kembali ke Arcade', 'game:arcade:menu')
          ]
        ]);
        
        await ctx.editMessageText(`🎡 *Memulai Gacha...* 🎡\n\n[░░░░░░░░░░] 0%`, { parse_mode: 'Markdown' });
        await new Promise(resolve => setTimeout(resolve, 500));
        
        await ctx.editMessageText(`🎡 *Mengocok Kapsul...* 🎡\n\n[████░░░░░░] 40%`, { parse_mode: 'Markdown' });
        await new Promise(resolve => setTimeout(resolve, 500));
        
        await ctx.editMessageText(`🎡 *Membuka Hadiah...* 🎡\n\n[████████░░] 80%`, { parse_mode: 'Markdown' });
        await new Promise(resolve => setTimeout(resolve, 500));
        
        result = {
          text: drawRes.text,
          keyboard: gachaKb
        };
      }
    } else if (actionData.startsWith('arcade:exchange:')) {
      const tier = actionData.split(':')[2];
      const exRes = exchangePointsForLimit(chatId, tier);
      result = {
        text: exRes.text,
        keyboard: Markup.inlineKeyboard([
          [
            Markup.button.callback('💎 Toko Penukaran', 'game:arcade:shop_menu'),
            Markup.button.callback('🔙 Kembali ke Arcade', 'game:arcade:menu')
          ]
        ])
      };
    } else if (actionData === 'start:chess') {
      result = startChess(chatId);
    } else if (actionData === 'start:ttt') {
      const startRes = startTicTacToe(chatId);
      if (startRes && startRes.triggerBot) {
        await ctx.answerCbQuery();
        await ctx.editMessageText(startRes.text, {
          parse_mode: 'Markdown',
          ...startRes.keyboard
        });
        await new Promise(resolve => setTimeout(resolve, 800));
        result = makeBotTttMoveAndRender(chatId);
      } else {
        result = startRes;
      }
    } else if (actionData === 'start:suit') {
      result = startSuit(chatId);
    } else if (actionData === 'start:tebak') {
      await ctx.answerCbQuery();
      await ctx.editMessageText(`⏳ *Mengambil kata misterius dari AI...*`, { parse_mode: 'Markdown' });
      result = await startTebakKata(chatId);
    } else if (actionData === 'start:math') {
      result = startMathQuiz(chatId);
    } else if (actionData === 'start:tebakff') {
      result = startTebakFf(chatId);
    } else if (actionData === 'start:tebakgambar') {
      await ctx.answerCbQuery();
      const loadingMsg = await ctx.reply(`🎨 *Sedang merender gambar AI dengan FLUX... Mohon tunggu sebentar.*`, { parse_mode: 'Markdown' });
      
      const tgRes = startTebakGambar(chatId);
      try {
        await ctx.deleteMessage();
      } catch (e) {}
      
      try {
        await ctx.replyWithPhoto({ url: tgRes.imageUrl }, {
          caption: tgRes.text,
          parse_mode: 'Markdown',
          ...tgRes.keyboard
        });
      } catch (photoErr) {
        console.warn('Failed to send photo in start:tebakgambar:', photoErr.message);
        const fallbackText = `${tgRes.text}\n\n🔗 *Gambar:* [Klik di sini untuk melihat gambar](${tgRes.imageUrl})`;
        await ctx.reply(fallbackText, {
          parse_mode: 'Markdown',
          ...tgRes.keyboard
        });
      } finally {
        try {
          await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);
        } catch (e) {}
      }
      return;
    } else if (actionData.startsWith('tg:ans:')) {
      const ans = actionData.substring(7);
      await ctx.answerCbQuery();
      const tgRes = handleTebakGambarAnswer(chatId, ans);
      
      if (tgRes.imageUrl) {
        const loadingMsg = await ctx.reply(`🎨 *Sedang merender gambar AI berikutnya... Mohon tunggu.*`, { parse_mode: 'Markdown' });
        try {
          await ctx.deleteMessage();
        } catch (e) {}
        try {
          await ctx.replyWithPhoto({ url: tgRes.imageUrl }, {
            caption: tgRes.text,
            parse_mode: 'Markdown',
            ...tgRes.keyboard
          });
        } catch (photoErr) {
          console.warn('Failed to send photo in tg:ans:', photoErr.message);
          const fallbackText = `${tgRes.text}\n\n🔗 *Gambar:* [Klik di sini untuk melihat gambar](${tgRes.imageUrl})`;
          await ctx.reply(fallbackText, {
            parse_mode: 'Markdown',
            ...tgRes.keyboard
          });
        } finally {
          try {
            await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);
          } catch (e) {}
        }
      } else {
        try {
          await ctx.deleteMessage();
        } catch (e) {}
        await ctx.reply(tgRes.text, {
          parse_mode: 'Markdown',
          ...tgRes.keyboard
        });
      }
      return;
    } else if (actionData === 'tg:hint') {
      await ctx.answerCbQuery();
      const tgRes = handleTebakGambarHint(chatId);
      const loadingMsg = await ctx.reply(`🎨 *Mengambil petunjuk gambar... Mohon tunggu.*`, { parse_mode: 'Markdown' });
      try {
        await ctx.deleteMessage();
      } catch (e) {}
      try {
        await ctx.replyWithPhoto({ url: tgRes.imageUrl }, {
          caption: tgRes.text,
          parse_mode: 'Markdown',
          ...tgRes.keyboard
        });
      } catch (photoErr) {
        console.warn('Failed to send photo in tg:hint:', photoErr.message);
        const fallbackText = `${tgRes.text}\n\n🔗 *Gambar:* [Klik di sini untuk melihat gambar](${tgRes.imageUrl})`;
        await ctx.reply(fallbackText, {
          parse_mode: 'Markdown',
          ...tgRes.keyboard
        });
      } finally {
        try {
          await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);
        } catch (e) {}
      }
      return;
    } else if (actionData.startsWith('chess:click:')) {
      const index = parseInt(actionData.split(':')[2]);
      const moveRes = handleChessClick(chatId, index);
      if (moveRes && moveRes.triggerBot) {
        await ctx.answerCbQuery();
        await ctx.editMessageText(moveRes.text, {
          parse_mode: 'Markdown',
          ...moveRes.keyboard
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
        result = await makeBotChessMoveAndRender(chatId);
      } else {
        result = moveRes;
      }
    } else if (actionData === 'chess:ai_move') {
      await ctx.answerCbQuery();
      await ctx.editMessageText(`⏳ *AI sedang memikirkan langkah terbaik untuk Anda...*`, { parse_mode: 'Markdown' });
      const moveRes = await handleChessAiMove(chatId);
      if (moveRes && moveRes.triggerBot) {
        await ctx.editMessageText(moveRes.text, {
          parse_mode: 'Markdown',
          ...moveRes.keyboard
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
        result = await makeBotChessMoveAndRender(chatId);
      } else {
        result = moveRes;
      }
    } else if (actionData === 'chess:forfeit') {
      result = handleChessForfeit(chatId);
    } else if (actionData.startsWith('ttt:move:')) {
      const index = parseInt(actionData.split(':')[2]);
      const moveRes = handleTicTacToeMove(chatId, index);
      if (moveRes && moveRes.triggerBot) {
        await ctx.answerCbQuery();
        await ctx.editMessageText(moveRes.text, {
          parse_mode: 'Markdown',
          ...moveRes.keyboard
        });
        await new Promise(resolve => setTimeout(resolve, 800));
        result = makeBotTttMoveAndRender(chatId);
      } else {
        result = moveRes;
      }
    } else if (actionData === 'ttt:ai_move') {
      await ctx.answerCbQuery();
      await ctx.editMessageText(`⏳ *AI sedang memikirkan langkah terbaik untuk Anda...*`, { parse_mode: 'Markdown' });
      const moveRes = handleTttAiMove(chatId);
      if (moveRes && moveRes.triggerBot) {
        await ctx.editMessageText(moveRes.text, {
          parse_mode: 'Markdown',
          ...moveRes.keyboard
        });
        await new Promise(resolve => setTimeout(resolve, 800));
        result = makeBotTttMoveAndRender(chatId);
      } else {
        result = moveRes;
      }
    } else if (actionData.startsWith('suit:play:')) {
      const choice = actionData.split(':')[2];
      await ctx.answerCbQuery();
      await ctx.editMessageText(`⏳ *Bot sedang menganalisis strategi Anda...*`, { parse_mode: 'Markdown' });
      result = await handleSuitPlay(chatId, choice);
    } else if (actionData === 'suit:reset') {
      result = handleSuitReset(chatId);
    } else if (actionData.startsWith('tebak:guess:')) {
      const letter = actionData.split(':')[2];
      result = handleTebakLetter(chatId, letter);
    } else if (actionData === 'tebak:hint') {
      result = handleTebakHint(chatId);
    } else if (actionData === 'tebak:inert') {
      await ctx.answerCbQuery();
      return;
    } else if (actionData.startsWith('math:ans:')) {
      const answer = actionData.split(':')[2];
      result = handleMathAnswer(chatId, answer);
    } else if (actionData.startsWith('ff:ans:')) {
      const answer = actionData.split(':')[2];
      result = handleTebakFfAnswer(chatId, answer);
    } else if (actionData === 'start:slot') {
      result = startSlot(chatId);
    } else if (actionData === 'slot:spin') {
      const spinRes = spinSlot(chatId);
      if (!spinRes.success) {
        result = {
          text: spinRes.text,
          keyboard: Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Kembali ke Menu', 'game:menu')]
          ])
        };
      } else {
        await ctx.answerCbQuery();
        const r = spinRes.state.reels;
        
        await ctx.editMessageText(`🎰 *SLOT MACHINE ARCADE* 🎰\n\nBiaya per spin: 🪙 *5 Poin*\n\n*Reels:* [ 🔄 | 🔄 | 🔄 ]\n\n⏳ *Memutar reels...*`, { parse_mode: 'Markdown' });
        await new Promise(resolve => setTimeout(resolve, 500));
        
        await ctx.editMessageText(`🎰 *SLOT MACHINE ARCADE* 🎰\n\nBiaya per spin: 🪙 *5 Poin*\n\n*Reels:* [ ${r[0]} | 🔄 | 🔄 ]\n\n⏳ *Memutar reels...*`, { parse_mode: 'Markdown' });
        await new Promise(resolve => setTimeout(resolve, 500));
        
        await ctx.editMessageText(`🎰 *SLOT MACHINE ARCADE* 🎰\n\nBiaya per spin: 🪙 *5 Poin*\n\n*Reels:* [ ${r[0]} | ${r[1]} | 🔄 ]\n\n⏳ *Memutar reels...*`, { parse_mode: 'Markdown' });
        await new Promise(resolve => setTimeout(resolve, 500));
        
        result = renderSlot(spinRes.state);
      }
    } else if (actionData === 'start:ta') {
      result = startTebakAngka(chatId);
    } else if (actionData.startsWith('ta:digit:')) {
      const digit = actionData.split(':')[2];
      result = handleTebakAngkaInput(chatId, `digit:${digit}`);
    } else if (actionData === 'ta:clear') {
      result = handleTebakAngkaInput(chatId, 'clear');
    } else if (actionData === 'ta:submit') {
      result = handleTebakAngkaInput(chatId, 'submit');
    } else if (actionData === 'start:bj') {
      const bjRes = startBlackjack(chatId);
      if (bjRes.success === false) {
        result = {
          text: bjRes.text,
          keyboard: Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Kembali ke Menu', 'game:menu')]
          ])
        };
      } else {
        result = bjRes;
      }
    } else if (actionData === 'bj:hit') {
      result = handleBlackjackHit(chatId);
    } else if (actionData === 'bj:stand') {
      await ctx.answerCbQuery();
      await ctx.editMessageText(`🃏 *BLACKJACK 5-RONDE CHALLENGE* 🃏\n\n⏳ *Dealer sedang membuka kartu dan mengambil keputusan...*`, { parse_mode: 'Markdown' });
      await new Promise(resolve => setTimeout(resolve, 800));
      result = handleBlackjackStand(chatId);
    } else if (actionData === 'bj:next') {
      result = nextBlackjackRound(chatId);
    } else if (actionData === 'start:tb') {
      result = await startTebakBendera(chatId);
    } else if (actionData.startsWith('tb:ans:')) {
      const answer = actionData.split(':')[2];
      result = await handleTebakBenderaAnswer(chatId, answer);
    }

    if (result) {
      await ctx.answerCbQuery();
      try {
        await ctx.editMessageText(result.text, {
          parse_mode: 'Markdown',
          ...result.keyboard
        });
      } catch (editErr) {
        if (editErr.message.includes('message is not modified')) {
          // Ignore
        } else {
          try {
            await ctx.deleteMessage();
          } catch (delErr) {}
          await ctx.reply(result.text, {
            parse_mode: 'Markdown',
            ...result.keyboard
          });
        }
      }
    } else {
      await ctx.answerCbQuery();
    }
  } catch (err) {
    console.error('Error handling game callback:', err);
    try {
      await ctx.answerCbQuery('Terjadi kesalahan saat memproses game.');
    } catch (e) {}
  }
});

// Voice effect callback query router
bot.action(/^voiceeffect:(.+)$/, async (ctx) => {
  const actionData = ctx.match[1];
  
  try {
    await ctx.answerCbQuery();
    
    if (actionData === 'close') {
      try {
        await ctx.deleteMessage();
      } catch (e) {}
      return;
    }
    
    if (actionData.startsWith('apply:')) {
      const parts = actionData.split(':');
      const filterType = parts[1];
      const fileId = parts[2];
      
      const status = createStatusUpdater(ctx);
      await status.update(`Menerapkan efek suara *${filterType}*...`);
      
      const tempIn = path.join(config.workspaceDir, `voice_in_${Date.now()}.mp3`);
      
      try {
        const fileLink = await ctx.telegram.getFileLink(fileId);
        await downloadTelegramFile(fileLink.href, tempIn);
        
        await applyVoiceFilter(tempIn, filterType);
        
        await status.update('Mengirimkan rekaman suara baru...');
        await ctx.replyWithVoice(
          { source: tempIn },
          { caption: `✨ Efek suara *${filterType}* berhasil diterapkan! 🗣️`, parse_mode: 'Markdown' }
        );
        
        await status.delete();
        try {
          await ctx.deleteMessage();
        } catch (e) {}
      } catch (err) {
        console.error('Voice Changer action error:', err);
        await status.delete();
        await ctx.reply(`❌ Gagal menerapkan efek suara: ${err.message}`);
      } finally {
        if (fs.existsSync(tempIn)) {
          fs.unlinkSync(tempIn);
        }
      }
    }
  } catch (err) {
    console.error('Error handling voiceeffect callback:', err);
  }
});


bot.command('stop', async (ctx) => {
  const chatId = ctx.chat.id;
  const args = ctx.message.text.trim().split(/\s+/).slice(1);
  const targetIdStr = args[0];

  let chatProcs = getChatProcesses(chatId);

  if (chatProcs.length === 0) {
    const dbPath = path.join(config.memoryDir, 'active_processes.json');
    if (fs.existsSync(dbPath)) {
      try {
        const dbProcs = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        const filtered = dbProcs.filter(p => p.chatId === chatId);
        chatProcs = filtered.map(p => ({
          id: p.id,
          chatId: p.chatId,
          name: p.name,
          startTime: p.startTime,
          pid: p.pid
        }));
      } catch (e) {
        console.error('Failed to read active processes from DB:', e.message);
      }
    }
  }

  if (chatProcs.length === 0) {
    return ctx.reply('ℹ️ Tidak ada proses yang sedang berjalan di chat ini.');
  }

  if (targetIdStr) {
    const targetId = parseInt(targetIdStr, 10);
    const proc = chatProcs.find(p => p.id === targetId);
    if (!proc) {
      return ctx.reply(`❌ Proses dengan ID #${targetId} tidak ditemukan atau sudah selesai.`);
    }
    stopProcess(proc.id);
    return ctx.reply(`🛑 Proses #${proc.id} (${proc.name}) berhasil dihentikan!`);
  }

  if (chatProcs.length === 1) {
    const proc = chatProcs[0];
    stopProcess(proc.id);
    return ctx.reply(`🛑 Proses #${proc.id} (${proc.name}) berhasil dihentikan!`);
  }

  let msg = `⏳ *Proses yang sedang berjalan di chat ini:*\n\n`;
  for (const proc of chatProcs) {
    msg += `• *#${proc.id}* — ${proc.name} (berjalan selama ${Math.floor((Date.now() - proc.startTime) / 1000)} detik)\n`;
  }
  msg += `\nGunakan perintah \`/stop <ID>\` untuk menghentikan proses tertentu.\n`;
  msg += `Contoh: \`/stop ${chatProcs[0].id}\``;

  await ctx.reply(safeMarkdown(msg), { parse_mode: 'Markdown' });
});


bot.command('status', (ctx) => {
  const uptimeMs = Date.now() - BOT_START_TIME;
  const uptimeSec = Math.floor(uptimeMs / 1000);
  const uptimeMin = Math.floor(uptimeSec / 60);
  const uptimeHour = Math.floor(uptimeMin / 60);
  const uptimeStr = uptimeHour > 0
    ? `${uptimeHour} jam ${uptimeMin % 60} menit`
    : uptimeMin > 0
      ? `${uptimeMin} menit ${uptimeSec % 60} detik`
      : `${uptimeSec} detik`;
  const mem = process.memoryUsage();
  const memMb = (mem.rss / 1024 / 1024).toFixed(1);
  const activeSessions = sessions.size;
  const runningRequests = activeProcesses.size;

  const statusMsg = `🤖 *Status Bot AI Agent*

🟢 Status: Online
⏱ Uptime: ${uptimeStr}
🧠 Model: \`${getCurrentModel()}\`
💬 Sesi Aktif: ${activeSessions} pengguna
⚡ Permintaan Berjalan: ${runningRequests}
💾 Memori: ${memMb} MB
📦 Platform: Node.js ${process.version}`;

  ctx.reply(statusMsg, { parse_mode: 'Markdown' });
});


bot.command('export', async (ctx) => {
  const history = getSessionHistory(ctx.chat.id);
  if (!history || history.length === 0) {
    return ctx.reply('📭 Tidak ada riwayat obrolan untuk diekspor.');
  }

  const lines = history
    .filter(msg => msg.role === 'user' || msg.role === 'assistant')
    .map(msg => {
      const role = msg.role === 'user' ? '👤 Anda' : '🤖 AI';
      return `[${role}]\n${msg.content || '(tool call)'}\n`;
    });

  const content = `Ekspor Riwayat Chat - ${new Date().toLocaleString('id-ID')}\n${'='.repeat(50)}\n\n${lines.join('\n')}`;
  const exportPath = path.join(config.workspaceDir, `chat_export_${ctx.chat.id}_${Date.now()}.txt`);

  fs.writeFileSync(exportPath, content, 'utf8');
  await ctx.replyWithDocument({ source: exportPath }, { caption: '📄 Riwayat obrolan Anda berhasil diekspor!' });

  if (fs.existsSync(exportPath)) fs.unlinkSync(exportPath);
});


bot.command('model', async (ctx) => {
  const chatId = ctx.chat.id;
  const isPremium = isPremiumUser(chatId);
  const text = ctx.message.text.trim();
  const args = text.split(/\s+/).slice(1);
  const newModel = args[0];

  if (!isPremium) {
    const current = getCurrentModel(chatId);
    return ctx.reply(
      `🧠 *Model AI Anda Saat Ini:* \`${current}\` (Model Gratis)\n\n` +
      `⚠️ *Akses Terbatas!* Anda sedang menggunakan akun gratis. Fitur memilih dan mengganti ke model AI premium lainnya hanya tersedia untuk *Member Premium*.\n\n` +
      `Silakan beli *Member Bulanan* menggunakan perintah \`/topup\` untuk membuka akses ke semua model AI terbaik!`,
      { parse_mode: 'Markdown' }
    );
  }

  try {
    const availableModels = await getAvailableModels();

    if (!newModel) {
      if (availableModels.length === 0) {
        return ctx.reply(`🧠 *Model AI Anda Saat Ini:* \`${getCurrentModel(chatId)}\`\n\n⚠️ Gagal memuat daftar model dari Groq API.`, { parse_mode: 'Markdown' });
      }
      const modelList = availableModels.map((m, i) => `${i + 1}. \`${m}\``).join('\n');
      return ctx.reply(
        `🧠 *Model AI Anda Saat Ini:* \`${getCurrentModel(chatId)}\`\n\n*Model Tersedia:*\n${modelList}\n\nGunakan \`/model <nama_model>\` untuk mengganti model.\nContoh: \`/model llama-3.1-8b-instant\``,
        { parse_mode: 'Markdown' }
      );
    }

    if (!availableModels.includes(newModel)) {
      return ctx.reply(`⚠️ Model \`${newModel}\` tidak didukung oleh API Groq Anda saat ini.`, { parse_mode: 'Markdown' });
    }

    setUserModel(chatId, newModel);
    await ctx.reply(`✅ Model AI Anda berhasil diganti ke: \`${newModel}\``, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Error in /model command:', err.message);
    await ctx.reply(`⚠️ Gagal memproses perintah model: ${err.message}`);
  }
});


bot.command('thinking', async (ctx) => {
  const text = ctx.message.text.trim();
  const args = text.split(/\s+/).slice(1);
  const level = args[0];

  const availableLevels = ['off', 'low', 'high'];
  if (!level) {
    return ctx.reply(
      `🧠 *Pengaturan Berpikir AI (Thinking Mode):* \`${getCurrentThinkingLevel().toUpperCase()}\`\n\n` +
      `Gunakan \`/thinking <off|low|high>\` untuk mengganti mode berpikir.\n\n` +
      `- \`off\`: Respon sangat cepat, tanpa proses analisa mendalam.\n` +
      `- \`low\`: Respon cepat dengan sedikit proses berpikir.\n` +
      `- \`high\`: Respon lebih lambat tetapi sangat analitis (menjawab logika rumit/koding dengan baik).`,
      { parse_mode: 'Markdown' }
    );
  }

  const cleanLevel = level.toLowerCase();
  if (!availableLevels.includes(cleanLevel)) {
    return ctx.reply(`⚠️ Mode berpikir \`${level}\` tidak didukung. Gunakan: \`/thinking off\`, \`/thinking low\`, atau \`/thinking high\`.`, { parse_mode: 'Markdown' });
  }

  setThinkingLevel(cleanLevel);
  await ctx.reply(`✅ Mode berpikir AI berhasil diubah ke: \`${cleanLevel.toUpperCase()}\``, { parse_mode: 'Markdown' });
});


bot.command('img', async (ctx) => {
  const text = ctx.message.text.trim();
  const prompt = text.replace(/^\/img\s*/i, '').trim();
  if (!prompt) {
    return ctx.reply('Silakan berikan deskripsi gambar.\nContoh: `/img pemandangan pantai saat sunset dengan gaya foto sinematik`', { parse_mode: 'Markdown' });
  }
  await handleAiRequest(ctx, `Tolong buatkan gambar dengan deskripsi berikut dan langsung kirimkan hasilnya: "${prompt}"`);
});




bot.command('cari', async (ctx) => {
  const text = ctx.message.text.trim();
  const query = text.replace(/^\/cari\s*/i, '').trim();
  if (!query) {
    return ctx.reply('Silakan berikan kata kunci pencarian.\nContoh: `/cari Albert Einstein`', { parse_mode: 'Markdown' });
  }
  await handleAiRequest(ctx, `Cari informasi tentang "${query}" di Wikipedia, lalu ringkas hasilnya dalam bahasa Indonesia dengan poin-poin penting.`);
});

bot.command('gempa', async (ctx) => {
  const chatId = ctx.chat.id;
  const proc = startProcess(chatId, 'Cek Info Gempa BMKG');
  const status = createStatusUpdater(ctx, proc.id);
  await status.update('Mengambil info gempa terkini dari BMKG...');
  try {
    const result = await toolHandlers.get_earthquake_info({}, chatId, proc.controller.signal);
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    await status.delete();
    
    const match = result.match(/Saved at file path: (.+)/);
    if (match) {
      const filename = match[1].trim();
      const absPath = path.join(config.workspaceDir, filename);
      if (fs.existsSync(absPath)) {
        if (proc.controller.signal.aborted) throw new Error('STOPPED');
        const cleanText = result.replace(/\n\nSaved at file path: .+/g, '');
        const formattedText = await formatPersonalityText(chatId, 'gempa', '', cleanText);
        try {
          await ctx.replyWithPhoto({ source: absPath }, { caption: safeMarkdown(formattedText), parse_mode: 'Markdown' });
        } catch (photoErr) {
          await ctx.replyWithPhoto({ source: absPath }, { caption: formattedText });
        }
        fs.unlinkSync(absPath);
        return;
      }
    }
    
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    const formattedText = await formatPersonalityText(chatId, 'gempa', '', result);
    await replySafe(ctx, formattedText);
  } catch (err) {
    await status.delete();
    if (err.message === 'STOPPED' || err.name === 'AbortError' || proc.controller.signal.aborted) {
      console.log(`[${chatId}] Gempa request was stopped by user.`);
    } else {
      await ctx.reply(`❌ Gagal mengambil info gempa: ${err.message}`);
    }
  } finally {
    activeProcesses.delete(proc.id);
  }
});

bot.command(['sholat', 'jadwalsholat'], async (ctx) => {
  const text = ctx.message.text.trim();
  const city = text.replace(/^\/(sholat|jadwalsholat)\s*/i, '').trim();
  if (!city) {
    return ctx.reply('Silakan tentukan nama kota.\nContoh: `/sholat Jakarta` atau `/sholat Surabaya`', { parse_mode: 'Markdown' });
  }
  
  const chatId = ctx.chat.id;
  const proc = startProcess(chatId, 'Cek Jadwal Sholat');
  const status = createStatusUpdater(ctx, proc.id);
  await status.update(`Mengambil jadwal sholat kota ${city}...`);
  try {
    const result = await toolHandlers.get_prayer_times({ city }, chatId, proc.controller.signal);
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    await status.delete();
    const formattedText = await formatPersonalityText(chatId, 'sholat', city, result);
    await replySafe(ctx, formattedText);
  } catch (err) {
    await status.delete();
    if (err.message === 'STOPPED' || err.name === 'AbortError' || proc.controller.signal.aborted) {
      console.log(`[${chatId}] Sholat request was stopped by user.`);
    } else {
      await ctx.reply(`❌ Gagal mengambil jadwal sholat: ${err.message}`);
    }
  } finally {
    activeProcesses.delete(proc.id);
  }
});

bot.command('anime', async (ctx) => {
  const text = ctx.message.text.trim();
  const query = text.replace(/^\/anime\s*/i, '').trim();
  if (!query) {
    return ctx.reply('Silakan tentukan judul anime yang dicari.\nContoh: `/anime Naruto` atau `/anime One Piece`', { parse_mode: 'Markdown' });
  }
  
  const chatId = ctx.chat.id;
  const proc = startProcess(chatId, 'Cari Anime MAL');
  const status = createStatusUpdater(ctx, proc.id);
  await status.update(`Mencari informasi anime "${query}"...`);
  try {
    const result = await toolHandlers.search_anime_manga({ query, type: 'anime' }, chatId, proc.controller.signal);
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    await status.delete();
    
    const match = result.match(/Saved at file path: (.+)/);
    if (match) {
      const filename = match[1].trim();
      const absPath = path.join(config.workspaceDir, filename);
      if (fs.existsSync(absPath)) {
        if (proc.controller.signal.aborted) throw new Error('STOPPED');
        const cleanText = result.replace(/\n\nSaved at file path: .+/g, '');
        const formattedText = await formatPersonalityText(chatId, 'anime', query, cleanText);
        const caption = formattedText.length > 1024 ? formattedText.substring(0, 1000) + '...' : formattedText;
        try {
          await ctx.replyWithPhoto({ source: absPath }, { caption: safeMarkdown(caption), parse_mode: 'Markdown' });
        } catch (photoErr) {
          await ctx.replyWithPhoto({ source: absPath }, { caption });
        }
        fs.unlinkSync(absPath);
        return;
      }
    }
    
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    const formattedText = await formatPersonalityText(chatId, 'anime', query, result);
    await replySafe(ctx, formattedText);
  } catch (err) {
    await status.delete();
    if (err.message === 'STOPPED' || err.name === 'AbortError' || proc.controller.signal.aborted) {
      console.log(`[${chatId}] Anime request was stopped by user.`);
    } else {
      await ctx.reply(`❌ Gagal mencari anime: ${err.message}`);
    }
  } finally {
    activeProcesses.delete(proc.id);
  }
});

bot.command('manga', async (ctx) => {
  const text = ctx.message.text.trim();
  const query = text.replace(/^\/manga\s*/i, '').trim();
  if (!query) {
    return ctx.reply('Silakan tentukan judul manga yang dicari.\nContoh: `/manga Naruto` atau `/manga Attack on Titan`', { parse_mode: 'Markdown' });
  }
  
  const chatId = ctx.chat.id;
  const proc = startProcess(chatId, 'Cari Manga MAL');
  const status = createStatusUpdater(ctx, proc.id);
  await status.update(`Mencari informasi manga "${query}"...`);
  try {
    const result = await toolHandlers.search_anime_manga({ query, type: 'manga' }, chatId, proc.controller.signal);
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    await status.delete();
    
    const match = result.match(/Saved at file path: (.+)/);
    if (match) {
      const filename = match[1].trim();
      const absPath = path.join(config.workspaceDir, filename);
      if (fs.existsSync(absPath)) {
        if (proc.controller.signal.aborted) throw new Error('STOPPED');
        const cleanText = result.replace(/\n\nSaved at file path: .+/g, '');
        const formattedText = await formatPersonalityText(chatId, 'manga', query, cleanText);
        const caption = formattedText.length > 1024 ? formattedText.substring(0, 1000) + '...' : formattedText;
        try {
          await ctx.replyWithPhoto({ source: absPath }, { caption: safeMarkdown(caption), parse_mode: 'Markdown' });
        } catch (photoErr) {
          await ctx.replyWithPhoto({ source: absPath }, { caption });
        }
        fs.unlinkSync(absPath);
        return;
      }
    }
    
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    const formattedText = await formatPersonalityText(chatId, 'manga', query, result);
    await replySafe(ctx, formattedText);
  } catch (err) {
    await status.delete();
    if (err.message === 'STOPPED' || err.name === 'AbortError' || proc.controller.signal.aborted) {
      console.log(`[${chatId}] Manga request was stopped by user.`);
    } else {
      await ctx.reply(`❌ Gagal mencari manga: ${err.message}`);
    }
  } finally {
    activeProcesses.delete(proc.id);
  }
});

bot.command('whois', async (ctx) => {
  const text = ctx.message.text.trim();
  const target = text.replace(/^\/whois\s*/i, '').trim();
  if (!target) {
    return ctx.reply('Silakan tentukan IP address atau domain website.\nContoh: `/whois google.com` atau `/whois 8.8.8.8`', { parse_mode: 'Markdown' });
  }
  
  const chatId = ctx.chat.id;
  const proc = startProcess(chatId, 'WHOIS/GeoIP Lookup');
  const status = createStatusUpdater(ctx, proc.id);
  await status.update(`Melakukan lookup WHOIS/GeoIP untuk ${target}...`);
  try {
    const result = await toolHandlers.lookup_whois_geoip({ target }, chatId, proc.controller.signal);
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    await status.delete();
    const formattedText = await formatPersonalityText(chatId, 'whois', target, result);
    await replySafe(ctx, formattedText);
  } catch (err) {
    await status.delete();
    if (err.message === 'STOPPED' || err.name === 'AbortError' || proc.controller.signal.aborted) {
      console.log(`[${chatId}] WHOIS request was stopped by user.`);
    } else {
      await ctx.reply(`❌ Gagal melakukan lookup WHOIS/GeoIP: ${err.message}`);
    }
  } finally {
    activeProcesses.delete(proc.id);
  }
});

bot.command(['lirik', 'lyrics'], async (ctx) => {
  const text = ctx.message.text.trim();
  const query = text.replace(/^\/(lirik|lyrics)\s*/i, '').trim();
  if (!query) {
    return ctx.reply('Silakan tentukan judul lagu yang dicari liriknya.\nContoh: `/lirik Faded Alan Walker`', { parse_mode: 'Markdown' });
  }
  
  const chatId = ctx.chat.id;
  const proc = startProcess(chatId, 'Cari Lirik Lagu');
  const status = createStatusUpdater(ctx, proc.id);
  await status.update(`Mencari lirik lagu "${query}"...`);
  try {
    const result = await toolHandlers.get_song_lyrics({ songTitle: query }, chatId, proc.controller.signal);
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    await status.delete();
    
    const match = result.match(/Saved at file path: (.+)/);
    if (match) {
      const filename = match[1].trim();
      const absPath = path.join(config.workspaceDir, filename);
      if (fs.existsSync(absPath)) {
        if (proc.controller.signal.aborted) throw new Error('STOPPED');
        const cleanText = result.replace(/\n\nSaved at file path: .+/g, '');
        const formattedText = await formatPersonalityText(chatId, 'lirik', query, cleanText);
        if (formattedText.length > 1024) {
          try {
            await ctx.replyWithPhoto({ source: absPath }, { caption: `Cover Art: ${query}` });
          } catch (photoErr) {
            await ctx.reply(`Cover Art: ${query}`);
          }
          await replySafe(ctx, formattedText);
        } else {
          try {
            await ctx.replyWithPhoto({ source: absPath }, { caption: safeMarkdown(formattedText), parse_mode: 'Markdown' });
          } catch (photoErr) {
            await ctx.replyWithPhoto({ source: absPath }, { caption: formattedText });
          }
        }
        fs.unlinkSync(absPath);
        return;
      }
    }
    
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    const formattedText = await formatPersonalityText(chatId, 'lirik', query, result);
    await replySafe(ctx, formattedText);
  } catch (err) {
    await status.delete();
    if (err.message === 'STOPPED' || err.name === 'AbortError' || proc.controller.signal.aborted) {
      console.log(`[${chatId}] Lyrics request was stopped by user.`);
    } else {
      await ctx.reply(`❌ Gagal mencari lirik lagu: ${err.message}`);
    }
  } finally {
    activeProcesses.delete(proc.id);
  }
});

bot.command(['ss', 'screenshot'], async (ctx) => {
  const text = ctx.message.text.trim();
  const url = text.replace(/^\/(ss|screenshot)\s*/i, '').trim();
  if (!url) {
    return ctx.reply('Silakan sertakan URL website yang ingin diambil tangkapan layarnya.\nContoh: `/ss google.com`', { parse_mode: 'Markdown' });
  }
  
  const chatId = ctx.chat.id;
  const proc = startProcess(chatId, 'Ambil Screenshot Web');
  const status = createStatusUpdater(ctx, proc.id);
  await status.update(`Mengambil tangkapan layar website ${url}...`);
  try {
    const result = await toolHandlers.screenshot_webpage({ url }, chatId, proc.controller.signal);
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    await status.delete();
    
    const match = result.match(/Saved at file path: (.+)/);
    if (match) {
      const filename = match[1].trim();
      const absPath = path.join(config.workspaceDir, filename);
      if (fs.existsSync(absPath)) {
        if (proc.controller.signal.aborted) throw new Error('STOPPED');
        const formattedText = await formatPersonalityText(chatId, 'ss', url, `Tangkapan layar halaman: ${url} 📸`);
        await ctx.replyWithPhoto({ source: absPath }, { caption: formattedText });
        fs.unlinkSync(absPath);
        return;
      }
    }
    
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    const formattedText = await formatPersonalityText(chatId, 'ss', url, result);
    await replySafe(ctx, formattedText);
  } catch (err) {
    await status.delete();
    if (err.message === 'STOPPED' || err.name === 'AbortError' || proc.controller.signal.aborted) {
      console.log(`[${chatId}] Screenshot request was stopped by user.`);
    } else {
      await ctx.reply(`❌ Gagal mengambil tangkapan layar website: ${err.message}`);
    }
  } finally {
    activeProcesses.delete(proc.id);
  }
});

bot.command(['berita', 'news'], async (ctx) => {
  const text = ctx.message.text.trim();
  const query = text.replace(/^\/(berita|news)\s*/i, '').trim();
  if (!query) {
    return ctx.reply('Silakan sertakan topik berita yang ingin dicari.\nContoh: `/berita teknologi AI`', { parse_mode: 'Markdown' });
  }
  
  const chatId = ctx.chat.id;
  const proc = startProcess(chatId, 'Cari Berita Google');
  const status = createStatusUpdater(ctx, proc.id);
  await status.update(`Mencari berita terbaru tentang "${query}"...`);
  try {
    const result = await toolHandlers.google_news_search({ query }, chatId, proc.controller.signal);
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    await status.delete();
    const formattedText = await formatPersonalityText(chatId, 'berita', query, result);
    await replySafe(ctx, formattedText);
  } catch (err) {
    await status.delete();
    if (err.message === 'STOPPED' || err.name === 'AbortError' || proc.controller.signal.aborted) {
      console.log(`[${chatId}] News request was stopped by user.`);
    } else {
      await ctx.reply(`❌ Gagal mengambil berita: ${err.message}`);
    }
  } finally {
    activeProcesses.delete(proc.id);
  }
});


bot.command('cuaca', async (ctx) => {
  const text = ctx.message.text.trim();
  const city = text.replace(/^\/cuaca\s*/i, '').trim();
  if (!city) {
    return ctx.reply('Silakan berikan nama kota.\nContoh: `/cuaca Jakarta`', { parse_mode: 'Markdown' });
  }

  const chatId = ctx.chat.id;
  const proc = startProcess(chatId, 'Cek Cuaca');
  const status = createStatusUpdater(ctx, proc.id);
  await status.update(`Mengambil data cuaca ${city}...`);

  try {
    const result = await toolHandlers.get_weather({ city }, chatId, proc.controller.signal);
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    await status.delete();

    const formattedText = await formatPersonalityText(chatId, 'cuaca', city, result);
    await replySafe(ctx, formattedText);
  } catch (err) {
    await status.delete();
    if (err.message === 'STOPPED' || err.name === 'AbortError' || proc.controller.signal.aborted) {
      console.log(`[${chatId}] Weather request was stopped by user.`);
    } else {
      await ctx.reply(`❌ Gagal mengambil info cuaca: ${err.message}`);
    }
  } finally {
    activeProcesses.delete(proc.id);
  }
});


bot.command(['kripto', 'crypto', 'coin'], async (ctx) => {
  const text = ctx.message.text.trim();
  const symbol = text.replace(/^\/(kripto|crypto|coin)\s*/i, '').trim();
  if (!symbol) {
    return ctx.reply('Silakan berikan nama koin.\nContoh: `/kripto bitcoin`', { parse_mode: 'Markdown' });
  }

  const chatId = ctx.chat.id;
  const proc = startProcess(chatId, 'Cek Harga Crypto');
  const status = createStatusUpdater(ctx, proc.id);
  await status.update(`Mengambil data harga crypto ${symbol}...`);

  try {
    const result = await toolHandlers.get_crypto_price({ symbol }, chatId, proc.controller.signal);
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    await status.delete();

    const match = result.match(/Saved at file path: (.+)/);
    if (match) {
      const filename = match[1].trim();
      const absPath = path.join(config.workspaceDir, filename);
      if (fs.existsSync(absPath)) {
        if (proc.controller.signal.aborted) throw new Error('STOPPED');
        const cleanText = result.replace(/\nSaved at file path: .+/g, '');
        const formattedText = await formatPersonalityText(chatId, 'kripto', symbol, cleanText);

        try {
          await ctx.replyWithPhoto({ source: absPath }, { caption: `📈 Grafik Tren Harga ${symbol.toUpperCase()} (7 Hari Terakhir)` });
        } catch (photoErr) {
          console.error('Failed to send crypto chart photo:', photoErr.message);
        }

        await replySafe(ctx, formattedText);
        
        fs.unlinkSync(absPath);
        return;
      }
    }

    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    const formattedText = await formatPersonalityText(chatId, 'kripto', symbol, result);
    await replySafe(ctx, formattedText);
  } catch (err) {
    await status.delete();
    if (err.message === 'STOPPED' || err.name === 'AbortError' || proc.controller.signal.aborted) {
      console.log(`[${chatId}] Crypto price request was stopped by user.`);
    } else {
      await ctx.reply(`❌ Gagal mengambil harga crypto: ${err.message}`);
    }
  } finally {
    activeProcesses.delete(proc.id);
  }
});


bot.command(['saham', 'stock'], async (ctx) => {
  const text = ctx.message.text.trim();
  const symbol = text.replace(/^\/(saham|stock)\s*/i, '').trim();
  if (!symbol) {
    return ctx.reply('Silakan berikan ticker/simbol saham.\nContoh:\n- `/saham BBCA` (Indonesia)\n- `/saham AAPL` (AS)', { parse_mode: 'Markdown' });
  }

  const chatId = ctx.chat.id;
  const proc = startProcess(chatId, 'Cek Harga Saham');
  const status = createStatusUpdater(ctx, proc.id);
  await status.update(`Mengambil data harga saham ${symbol}...`);

  try {
    const result = await toolHandlers.get_stock_price({ symbol }, chatId, proc.controller.signal);
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    await status.delete();

    const match = result.match(/Saved at file path: (.+)/);
    if (match) {
      const filename = match[1].trim();
      const absPath = path.join(config.workspaceDir, filename);
      if (fs.existsSync(absPath)) {
        if (proc.controller.signal.aborted) throw new Error('STOPPED');
        const cleanText = result.replace(/\nSaved at file path: .+/g, '');
        const formattedText = await formatPersonalityText(chatId, 'saham', symbol, cleanText);

        try {
          await ctx.replyWithPhoto({ source: absPath }, { caption: `📈 Grafik Tren Harga ${symbol.toUpperCase()} (7 Hari Terakhir)` });
        } catch (photoErr) {
          console.error('Failed to send stock chart photo:', photoErr.message);
        }

        await replySafe(ctx, formattedText);
        
        fs.unlinkSync(absPath);
        return;
      }
    }

    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    const formattedText = await formatPersonalityText(chatId, 'saham', symbol, result);
    await replySafe(ctx, formattedText);
  } catch (err) {
    await status.delete();
    if (err.message === 'STOPPED' || err.name === 'AbortError' || proc.controller.signal.aborted) {
      console.log(`[${chatId}] Stock price request was stopped by user.`);
    } else {
      await ctx.reply(`❌ Gagal mengambil harga saham: ${err.message}`);
    }
  } finally {
    activeProcesses.delete(proc.id);
  }
});


bot.command('qr', async (ctx) => {
  const text = ctx.message.text.trim();
  const content = text.replace(/^\/qr\s*/i, '').trim();
  if (!content) {
    return ctx.reply('Silakan berikan teks atau URL.\nContoh: `/qr https://example.com`', { parse_mode: 'Markdown' });
  }

  const chatId = ctx.chat.id;
  const proc = startProcess(chatId, 'Buat QR Code');
  const status = createStatusUpdater(ctx, proc.id);
  await status.update('Menyiapkan pembuatan QR code...');

  try {
    const result = await toolHandlers.generate_qr({ text: content }, chatId, proc.controller.signal);
    await status.delete();

    const match = result.match(/Saved at file path: (.+)/);
    if (match) {
      const filename = match[1].trim();
      const absPath = path.join(config.workspaceDir, filename);
      if (fs.existsSync(absPath)) {
        const formattedText = await formatPersonalityText(chatId, 'qr', content, 'QR code berhasil dibuat!');
        await ctx.replyWithPhoto({ source: absPath }, { caption: formattedText });
        fs.unlinkSync(absPath);
        return;
      }
    }

    const formattedText = await formatPersonalityText(chatId, 'qr', content, result);
    await replySafe(ctx, formattedText);
  } catch (err) {
    await status.delete();
    await ctx.reply(`❌ Gagal membuat QR code: ${err.message}`);
  } finally {
    activeProcesses.delete(proc.id);
  }
});






bot.command('download', async (ctx) => {
  const text = ctx.message.text.trim();
  const args = text.split(/\s+/).slice(1);
  const url = args[0];
  const formatArg = args[1]?.toLowerCase().replace('.', '').trim() || 'mp4';

  if (!url) {
    return ctx.reply('Silakan sertakan URL video yang ingin diunduh.\nContoh: `/download https://tiktok.com/...` atau `/download https://tiktok.com/... mp3` untuk audio', { parse_mode: 'Markdown' });
  }

  const audioFormats = ['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac', 'opus', 'alac', 'vorbis', 'mka'];
  const isAudio = audioFormats.includes(formatArg);

  const chatId = ctx.chat.id;
  const proc = startProcess(chatId, isAudio ? 'Unduh Audio' : 'Unduh Video');
  const status = createStatusUpdater(ctx, proc.id);
  await status.update(`Menyiapkan pengunduh ${isAudio ? 'audio' : 'video'}...`);

  let videoPath;
  try {
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    if (isYouTube) {
      if (proc.controller.signal.aborted) throw new Error('STOPPED');
      await status.update('Mengambil metadata YouTube...');
      const meta = await getYtMetadata(url);
      if (meta) {
        if (proc.controller.signal.aborted) throw new Error('STOPPED');
        const metaText = `🎥 *INFORMASI YOUTUBE* 🎥\n\n📌 *Judul:* ${safeMarkdown(meta.title)}\n👤 *Channel:* ${safeMarkdown(meta.uploader)}\n⏱ *Durasi:* ${meta.duration}\n👁 *Views:* ${meta.views.toLocaleString('id-ID')}\n\n⏳ _Proses pengunduhan sedang berjalan, mohon tunggu..._`;
        try {
          await ctx.replyWithPhoto({ url: meta.thumbnail }, { caption: metaText, parse_mode: 'Markdown' });
        } catch (e) {
          await ctx.reply(metaText, { parse_mode: 'Markdown' });
        }
      }
    }

    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    videoPath = await downloadVideo(url, config.workspaceDir, formatArg, proc.controller.signal);
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    await status.update(`Mengirimkan ${isAudio ? 'audio' : 'video'} ke Telegram...`);

    const finalFileType = isAudio ? 'audio' : 'video';
    const finalCaption = isAudio ? `Unduhan audio ${formatArg.toUpperCase()} Anda berhasil selesai! 🎵` : `Unduhan video ${formatArg.toUpperCase()} Anda berhasil selesai! 🎬`;
    await sendFileSafe(ctx, videoPath, finalFileType, { caption: finalCaption }, status);
    await status.delete();
  } catch (error) {
    await status.delete();
    if (error.message === 'STOPPED' || error.name === 'AbortError' || proc.controller.signal.aborted) {
      console.log(`[${chatId}] Download request was stopped by user.`);
    } else {
      console.error('Download error:', error);
      await ctx.reply(`❌ Gagal mengunduh file. Detail:\n${error.message}`);
    }
  } finally {
    if (videoPath && fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
    activeProcesses.delete(proc.id);
  }
});


bot.command('ytmp4', async (ctx) => {
  const text = ctx.message.text.trim();
  const args = text.split(/\s+/).slice(1);
  const url = args[0];
  const formatArg = args[1]?.toLowerCase().replace('.', '').trim() || 'mp4';
  const videoFormats = ['mp4', 'mkv', 'webm', 'avi', 'flv', 'mov'];
  const format = videoFormats.includes(formatArg) ? formatArg : 'mp4';

  if (!url) {
    return ctx.reply('Silakan sertakan URL video yang ingin diunduh.\nContoh: `/ytmp4 https://youtube.com/...` atau `/ytmp4 https://youtube.com/... mkv` untuk format tertentu', { parse_mode: 'Markdown' });
  }

  const chatId = ctx.chat.id;
  const proc = startProcess(chatId, `Unduh Video YouTube (${format.toUpperCase()})`);
  const status = createStatusUpdater(ctx, proc.id);
  await status.update(`Menyiapkan pengunduh video ${format.toUpperCase()}...`);

  let videoPath;
  try {
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    await status.update('Mengambil metadata YouTube...');
    const meta = await getYtMetadata(url);
    if (meta) {
      if (proc.controller.signal.aborted) throw new Error('STOPPED');
      const metaText = `🎥 *INFORMASI YOUTUBE* 🎥\n\n📌 *Judul:* ${safeMarkdown(meta.title)}\n👤 *Channel:* ${safeMarkdown(meta.uploader)}\n⏱ *Durasi:* ${meta.duration}\n👁 *Views:* ${meta.views.toLocaleString('id-ID')}\n\n⏳ _Proses pengunduhan video sedang berjalan, mohon tunggu..._`;
      try {
        await ctx.replyWithPhoto({ url: meta.thumbnail }, { caption: metaText, parse_mode: 'Markdown' });
      } catch (e) {
        await ctx.reply(metaText, { parse_mode: 'Markdown' });
      }
    }

    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    videoPath = await downloadVideo(url, config.workspaceDir, format, proc.controller.signal);
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    await status.update('Mengirimkan video ke Telegram (maks 50MB)...');

    await sendFileSafe(ctx, videoPath, 'video', { caption: `Unduhan video ${format.toUpperCase()} Anda berhasil selesai! 🎬` }, status);
    await status.delete();
  } catch (error) {
    await status.delete();
    if (error.message === 'STOPPED' || error.name === 'AbortError' || proc.controller.signal.aborted) {
      console.log(`[${chatId}] YTMP4 request was stopped by user.`);
    } else {
      console.error('YTMP4 error:', error);
      await ctx.reply(`❌ Gagal mengunduh video. Detail:\n${error.message}`);
    }
  } finally {
    if (videoPath && fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
    activeProcesses.delete(proc.id);
  }
});


bot.command('ytmp3', async (ctx) => {
  const text = ctx.message.text.trim();
  const args = text.split(/\s+/).slice(1);
  const url = args[0];
  const formatArg = args[1]?.toLowerCase().replace('.', '').trim() || 'mp3';
  const audioFormats = ['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac', 'opus', 'alac', 'vorbis', 'mka'];
  const format = audioFormats.includes(formatArg) ? formatArg : 'mp3';

  if (!url) {
    return ctx.reply('Silakan sertakan URL audio yang ingin diunduh.\nContoh: `/ytmp3 https://youtube.com/...` atau `/ytmp3 https://youtube.com/... wav` untuk format tertentu', { parse_mode: 'Markdown' });
  }

  const chatId = ctx.chat.id;
  const proc = startProcess(chatId, `Unduh Audio YouTube (${format.toUpperCase()})`);
  const status = createStatusUpdater(ctx, proc.id);
  await status.update(`Menyiapkan pengunduh audio ${format.toUpperCase()}...`);

  let audioPath;
  try {
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    await status.update('Mengambil metadata YouTube...');
    const meta = await getYtMetadata(url);
    if (meta) {
      if (proc.controller.signal.aborted) throw new Error('STOPPED');
      const metaText = `🎵 *INFORMASI YOUTUBE AUDIO* 🎵\n\n📌 *Judul:* ${safeMarkdown(meta.title)}\n👤 *Channel:* ${safeMarkdown(meta.uploader)}\n⏱ *Durasi:* ${meta.duration}\n👁 *Views:* ${meta.views.toLocaleString('id-ID')}\n\n⏳ _Proses pengunduhan audio sedang berjalan, mohon tunggu..._`;
      try {
        await ctx.replyWithPhoto({ url: meta.thumbnail }, { caption: metaText, parse_mode: 'Markdown' });
      } catch (e) {
        await ctx.reply(metaText, { parse_mode: 'Markdown' });
      }
    }

    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    audioPath = await downloadVideo(url, config.workspaceDir, format, proc.controller.signal);
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    await status.update('Mengirimkan audio ke Telegram...');

    await sendFileSafe(ctx, audioPath, 'audio', { caption: `Unduhan audio ${format.toUpperCase()} Anda berhasil selesai! 🎵` }, status);
    await status.delete();
  } catch (error) {
    await status.delete();
    if (error.message === 'STOPPED' || error.name === 'AbortError' || proc.controller.signal.aborted) {
      console.log(`[${chatId}] YTMP3 request was stopped by user.`);
    } else {
      console.error('YTMP3 error:', error);
      await ctx.reply(`❌ Gagal mengunduh audio. Detail:\n${error.message}`);
    }
  } finally {
    if (audioPath && fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }
    activeProcesses.delete(proc.id);
  }
});


bot.command('tts', async (ctx) => {
  const text = ctx.message.text.trim();
  const replyMsg = ctx.message.reply_to_message;
  let ttsText = text.replace(/^\/tts\s*/i, '').trim();

  if (!ttsText && replyMsg && replyMsg.text) {
    ttsText = replyMsg.text;
  }

  if (!ttsText) {
    return ctx.reply('Silakan sertakan teks yang ingin diubah menjadi suara.\nContoh: `/tts Halo, selamat pagi!` atau balas (reply) pesan teks dengan `/tts`.', { parse_mode: 'Markdown' });
  }

  // Parse gender choice prefix
  let gender = null;
  const words = ttsText.split(/\s+/);
  const firstWord = words[0]?.toLowerCase();
  if (firstWord === 'cowo' || firstWord === 'cowok' || firstWord === 'laki' || firstWord === 'laki-laki') {
    gender = 'male';
    ttsText = ttsText.substring(words[0].length).trim();
  } else if (firstWord === 'cewe' || firstWord === 'cewek' || firstWord === 'perempuan' || firstWord === 'wanita') {
    gender = 'female';
    ttsText = ttsText.substring(words[0].length).trim();
  }

  if (!ttsText && replyMsg && replyMsg.text) {
    ttsText = replyMsg.text;
  }

  if (!ttsText) {
    return ctx.reply('Silakan tentukan teks setelah pilihan gender.\nContoh: `/tts cowo Halo!` atau balas (reply) pesan teks dengan `/tts cowo`.', { parse_mode: 'Markdown' });
  }

  const chatId = ctx.chat.id;
  const proc = startProcess(chatId, 'Ubah Teks ke Suara (TTS)');
  const status = createStatusUpdater(ctx, proc.id);
  await status.update('Mengonversi teks menjadi suara...');

  let audioPath;
  try {
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    audioPath = await generateTts(ttsText, config.workspaceDir, proc.controller.signal);
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    
    const personalityPath = path.join(config.memoryDir, `${chatId}_personality.txt`);
    let personality = 'biasa';
    if (fs.existsSync(personalityPath)) {
      personality = fs.readFileSync(personalityPath, 'utf8').trim();
    }

    // Apply voice filter based on personality and gender choice
    const mappingName = {
      wibu: 'Wibu 🌸',
      tsundere: 'Tsundere 😒',
      sarcastic: 'Sarkastik 🎭',
      professional: 'Profesional 👔',
      mentor: 'Mentor 🎓'
    };
    const resolvedGenderName = gender === 'male' ? 'Laki-laki 👦' : (gender === 'female' ? 'Perempuan 👧' : 'Default');
    const msgSifat = personality !== 'biasa' ? mappingName[personality] || personality : 'Default';
    
    await status.update(`Menerapkan efek suara (${msgSifat} - ${resolvedGenderName})...`);
    await applyTtsVoiceEffect(audioPath, personality, gender, proc.controller.signal);
    if (proc.controller.signal.aborted) throw new Error('STOPPED');

    await status.update('Mengirimkan pesan suara...');

    await ctx.replyWithVoice(
      { source: audioPath },
      { caption: 'Pesan suara Anda siap! 🗣️' }
    );
    await status.delete();
  } catch (error) {
    await status.delete();
    if (error.message === 'STOPPED' || error.name === 'AbortError' || proc.controller.signal.aborted) {
      console.log(`[${chatId}] TTS request was stopped by user.`);
    } else {
      console.error('TTS error:', error);
      await ctx.reply(`❌ Gagal mengubah teks menjadi suara. Detail:\n${error.message}`);
    }
  } finally {
    if (audioPath && fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }
    activeProcesses.delete(proc.id);
  }
});


bot.command('meme', async (ctx) => {
  const text = ctx.message.text.trim();
  const topic = text.replace(/^\/meme\s*/i, '').trim();

  if (!topic) {
    return ctx.reply('Silakan tentukan topik meme yang ingin dibuat.\nContoh: `/meme programmer lembur` atau `/meme belajar javascript`.', { parse_mode: 'Markdown' });
  }

  const chatId = ctx.chat.id;
  const remaining = getRemainingUsage(chatId);
  if (remaining <= 0) {
    return ctx.reply('⚠️ *Batas Limit Tercapai!*\n\nPemakaian AI Anda hari ini telah mencapai batas maksimal 5.000 karakter. Limit akan di-reset setiap jam 12 malam (WIB / Asia/Jakarta).\n\nGunakan perintah `/limit` untuk melihat kuota Anda.', { parse_mode: 'Markdown' });
  }

  addUsage(chatId, topic.length);

  const previousMemeProcs = getChatProcesses(chatId).filter(p => p.name === 'Buat Meme');
  for (const p of previousMemeProcs) {
    stopProcess(p.id);
  }

  const proc = startProcess(chatId, 'Buat Meme');
  const status = createStatusUpdater(ctx, proc.id);
  await status.update('Mendesain dan memikirkan meme kreatif...');

  let memePath;
  try {
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    const res = await createMemeImage(topic, config.workspaceDir, proc.controller.signal);
    memePath = res.memePath;
    const { topText, bottomText } = res;
    if (proc.controller.signal.aborted) throw new Error('STOPPED');
    addUsage(chatId, (topText || '').length + (bottomText || '').length);
    await status.update('Mengirimkan meme...');

    await ctx.replyWithPhoto(
      { source: memePath },
      { 
        caption: `🎭 *Meme:* "${topic}"\n\n*Top:* ${topText}\n*Bottom:* ${bottomText}\n\n_Generated via AI_`,
        parse_mode: 'Markdown'
      }
    );
    await status.delete();
  } catch (error) {
    await status.delete();
    if (error.message === 'STOPPED' || error.name === 'AbortError' || proc.controller.signal.aborted) {
      console.log(`[${chatId}] Meme request was stopped by user.`);
    } else {
      console.error('Meme error:', error);
      await ctx.reply(`❌ Gagal membuat meme. Detail:\n${error.message}`);
    }
  } finally {
    if (memePath && fs.existsSync(memePath)) {
      fs.unlinkSync(memePath);
    }
    activeProcesses.delete(proc.id);
  }
});


async function handleAiRequest(ctx, prompt) {
  let finalPrompt = (prompt || '').trim();
  const replyMsg = ctx.message && ctx.message.reply_to_message;

  if (finalPrompt === '') {
    if (replyMsg) {
      if (replyMsg.photo) {
        finalPrompt = 'Jelaskan dan analisis foto ini secara detail dalam bahasa Indonesia.';
      } else if (replyMsg.document) {
        finalPrompt = `Jelaskan isi dari berkas "${replyMsg.document.file_name}" ini.`;
      } else if (replyMsg.voice || replyMsg.audio) {
        finalPrompt = 'Tanggapi rekaman suara ini.';
      } else if (replyMsg.text) {
        finalPrompt = 'Jelaskan atau tanggapi pesan ini.';
      } else {
        finalPrompt = 'Tanggapi pesan ini.';
      }
    } else {
      const startText = `🤖 *Asisten AI Agent*
Minta AI melakukan apa saja! Cukup ketik perintah Anda setelah \`/ai\`.

*Contoh yang bisa Anda minta:*
• \`/ai buatkan landing page coffee shop dan zip\`
• \`/ai cari berita terbaru tentang teknologi AI\`
• \`/ai buat gambar kucing lucu gaya anime\`
• \`/ai cek cuaca di kota Surabaya hari ini\`
• \`/ai hitung (45 * 23) + Math.sqrt(144)\`

*Fitur Spesial:*
• Balas (Reply) foto/pesan/berkas/suara apa saja dengan \`/ai\` untuk menganalisisnya!`;
      return ctx.reply(startText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🌦️ Cek Cuaca', 'ai_template:cuaca'),
            Markup.button.callback('🎨 Buat Gambar', 'ai_template:gambar')
          ],
          [
            Markup.button.callback('🔍 Berita Terbaru', 'ai_template:berita'),
            Markup.button.callback('💰 Harga Crypto', 'ai_template:kripto')
          ],
          [
            Markup.button.callback('🧠 Lihat Memori', 'ai_template:memori')
          ]
        ])
      });
    }
  }

  const chatId = ctx.chat.id;

  // HD Enhance Image handler
  const cleanPrompt = finalPrompt.toLowerCase();
  const isEnhanceRequest = cleanPrompt === 'hd' || cleanPrompt === 'enhance' || cleanPrompt === 'upscale' || cleanPrompt.startsWith('hd ') || cleanPrompt.startsWith('enhance ') || cleanPrompt.startsWith('upscale ');
  const hasPhotoForEnhance = ctx.message && (ctx.message.photo || (replyMsg && replyMsg.photo));

  if (isEnhanceRequest && hasPhotoForEnhance) {
    const remaining = getRemainingUsage(chatId);
    if (remaining <= 0) {
      return ctx.reply('⚠️ *Batas Limit Tercapai!*\n\nPemakaian AI Anda hari ini telah mencapai batas maksimal 5.000 karakter. Limit akan di-reset setiap jam 12 malam (WIB / Asia/Jakarta).\n\nGunakan perintah `/limit` untuk melihat kuota Anda.', { parse_mode: 'Markdown' });
    }

    const proc = startProcess(chatId, 'HD Enhance Image');
    const status = createStatusUpdater(ctx, proc.id);
    await status.update('Mengunduh gambar untuk proses HD...');

    const photos = ctx.message.photo || replyMsg.photo;
    const bestPhoto = photos[photos.length - 1];

    let tempInputPath = path.join(config.workspaceDir, `enhance_in_${Date.now()}.jpg`);
    let tempOutputPath = path.join(config.workspaceDir, `enhance_out_${Date.now()}.jpg`);

    try {
      if (proc.controller.signal.aborted) throw new Error('STOPPED');
      const fileLink = await ctx.telegram.getFileLink(bestPhoto.file_id);
      await downloadTelegramFile(fileLink.href, tempInputPath, proc.controller.signal);
      if (proc.controller.signal.aborted) throw new Error('STOPPED');

      await status.update('Meningkatkan kualitas gambar ke HD (AI Enhancer)...');
      const enhancedBuffer = await enhanceImage(tempInputPath, proc.controller.signal);
      if (proc.controller.signal.aborted) throw new Error('STOPPED');

      fs.writeFileSync(tempOutputPath, enhancedBuffer);

      await status.update('Mengirimkan gambar HD...');
      await ctx.replyWithPhoto(
        { source: tempOutputPath },
        { caption: '✨ *Gambar berhasil ditingkatkan ke kualitas HD!* 🚀', parse_mode: 'Markdown' }
      );

      await status.delete();
    } catch (err) {
      await status.delete();
      if (err.message === 'STOPPED' || err.name === 'AbortError' || proc.controller.signal.aborted) {
        console.log(`[${chatId}] HD Enhance request was stopped by user.`);
      } else {
        console.error('HD Enhance error:', err);
        await ctx.reply(`❌ Gagal memproses HD Enhance: ${err.message}`);
      }
    } finally {
      if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
      if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
      activeProcesses.delete(proc.id);
    }
    return;
  }
  const remaining = getRemainingUsage(chatId);
  if (remaining <= 0) {
    return ctx.reply('⚠️ *Batas Limit Tercapai!*\n\nPemakaian AI Anda hari ini telah mencapai batas maksimal 5.000 karakter. Limit akan di-reset setiap jam 12 malam (WIB / Asia/Jakarta).\n\nGunakan perintah `/limit` untuk melihat kuota Anda.', { parse_mode: 'Markdown' });
  }

  const history = getSessionHistory(chatId);

  // Abort previous AI Agent process in this chat if any
  const previousProcs = getChatProcesses(chatId).filter(p => p.name === 'AI Agent');
  for (const p of previousProcs) {
    stopProcess(p.id);
  }

  const proc = startProcess(chatId, 'AI Agent');
  const controller = proc.controller;
  const status = createStatusUpdater(ctx, proc.id);

  // Download photo if present in message or reply
  const hasPhoto = ctx.message && (ctx.message.photo || (replyMsg && replyMsg.photo));
  if (hasPhoto) {
    const photos = ctx.message.photo || replyMsg.photo;
    const bestPhoto = photos[photos.length - 1];
    
    await status.update('Mengunduh gambar untuk diproses...');
    try {
      const fileLink = await ctx.telegram.getFileLink(bestPhoto.file_id);
      const inputImagePath = path.join(config.workspaceDir, 'input_image.jpg');
      await downloadTelegramFile(fileLink.href, inputImagePath);
      await compressImageIfLarge(inputImagePath);
      
      await status.update('Menganalisis gambar dengan AI Vision...');
      const imageUrl = fileLink.href;
      const visionAnalysis = await analyzePhoto(imageUrl, 'Deskripsikan gambar ini secara sangat detail dalam bahasa Indonesia, termasuk objek, teks, warna, aktivitas, layout, dan elemen penting lainnya untuk membantu asisten AI memahaminya.');
      
      finalPrompt += `\n\n[SISTEM: Pengguna melampirkan/membalas sebuah foto. Hasil analisis AI Vision untuk foto ini adalah:\n"""\n${visionAnalysis}\n"""\nFoto tersebut telah disimpan di sandbox Anda sebagai "input_image.jpg". Jika pengguna meminta untuk menganalisis, mendeskripsikan, atau bertanya tentang foto tersebut, gunakan informasi analisis di atas atau gunakan alat "analyze_image" dengan filePath "input_image.jpg". Jika pengguna meminta untuk mengubah gaya gambar (seperti kartun, anime, sketsa, dll.), gunakan alat "image_to_image" dengan file tersebut.]`;
    } catch (err) {
      console.error('Failed to download or analyze photo for agent:', err.message);
    }
  }

  // Handle reply to text messages
  if (replyMsg && replyMsg.text) {
    finalPrompt += `\n\n[SISTEM: Pengguna membalas pesan teks berikut:\n"""\n${replyMsg.text}\n"""]`;
  }

  // Handle voice notes or audio messages (direct or in reply)
  const targetVoiceOrAudio = (ctx.message && (ctx.message.voice || ctx.message.audio)) || (replyMsg && (replyMsg.voice || replyMsg.audio));
  if (targetVoiceOrAudio) {
    const isDirect = ctx.message && (ctx.message.voice || ctx.message.audio);
    const isVoice = !!(isDirect ? ctx.message.voice : replyMsg.voice);
    const actionText = isVoice ? 'rekaman suara' : 'berkas audio';
    const statusText = isDirect ? `Mengunduh ${actionText}...` : `Mengunduh dan mentranskripsi ${actionText} balasan...`;
    
    await status.update(statusText);
    try {
      const fileLink = await ctx.telegram.getFileLink(targetVoiceOrAudio.file_id);
      
      let fileName = isVoice ? 'input_voice.ogg' : 'input_audio.mp3';
      const file_name_prop = isDirect ? (ctx.message.audio?.file_name || ctx.message.document?.file_name) : (replyMsg.audio?.file_name || replyMsg.document?.file_name);
      if (!isVoice && file_name_prop) {
        const ext = path.extname(file_name_prop) || '.mp3';
        fileName = `input_audio${ext}`;
      }
      
      const targetPath = path.join(config.workspaceDir, fileName);
      await downloadTelegramFile(fileLink.href, targetPath);
      
      let voiceText = '';
      if (isDirect && isVoice) {
        // Direct voice notes are already transcribed by bot.on('voice') and passed as the prompt
        voiceText = prompt;
      } else {
        voiceText = await transcribeAudio(targetPath);
      }
      
      finalPrompt += `\n\n[SISTEM: Pengguna melampirkan/membalas ${actionText} dengan transkripsi: "${voiceText}"\nBerkas ${actionText} tersebut telah diunduh dan disimpan di sandbox sebagai "${fileName}". Jika pengguna meminta untuk menganalisis, memproses, mengubah, mengonversi, mengoptimasi, memperkecil, meningkatkan, atau menerapkan efek filter ke audio ini, gunakan berkas "${fileName}" yang sudah ada di sandbox ini langsung tanpa perlu mengunduh ulang.]`;
    } catch (err) {
      console.error(`Failed to download or process ${actionText}:`, err.message);
    }
  }

  // Handle document upload or reply
  const doc = (ctx.message && ctx.message.document) || (replyMsg && replyMsg.document);
  if (doc) {
    const fileName = doc.file_name;
    const fileSize = doc.file_size;
    const isZip = fileName.toLowerCase().endsWith('.zip');
    const maxAllowedSize = isZip ? 20 * 1024 * 1024 : 1024 * 1024;

    if (fileSize > maxAllowedSize) {
      await ctx.reply(`⚠️ Ukuran berkas terlalu besar. Batas maksimal adalah ${isZip ? '20MB' : '1MB'}.`);
    } else {
      await status.update(`Mengunduh berkas ${fileName}...`);
      try {
        const fileLink = await ctx.telegram.getFileLink(doc.file_id);
        if (isZip) {
          ensureSandbox();
          const zipPath = path.join(config.workspaceDir, 'project.zip');
          await downloadTelegramFile(fileLink.href, zipPath);
          finalPrompt += `\n\n[SISTEM: Pengguna melampirkan/membalas berkas ZIP bernama "${fileName}". File ini telah diunduh dan disimpan di sandbox sebagai "project.zip". Gunakan alat "unzip_file" jika Anda perlu mengekstrak isinya untuk dipelajari atau dimodifikasi.]`;
        } else {
          const tempPath = path.join(config.workspaceDir, `uploaded_${Date.now()}_${fileName}`);
          await downloadTelegramFile(fileLink.href, tempPath);
          try {
            const content = fs.readFileSync(tempPath, 'utf8');
            finalPrompt += `\n\n[SISTEM: Pengguna melampirkan/membalas berkas bernama "${fileName}" dengan isi:\n\`\`\`\n${content}\n\`\`\`]`;
          } catch (e) {
            finalPrompt += `\n\n[SISTEM: Pengguna melampirkan/membalas berkas bernama "${fileName}" (tidak dapat dibaca sebagai teks UTF-8).]`;
          }
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        }
      } catch (err) {
        console.error('Failed to download document:', err.message);
      }
    }
  }

  // Charge user for input finalPrompt length
  addUsage(chatId, finalPrompt.length);

  try {
    const result = await runAgent(chatId, finalPrompt, history, status.update, controller.signal, ctx.from || null, ctx);
    if (controller.signal.aborted) {
      throw new Error('STOPPED');
    }
    // Charge user for output result length
    if (result && result.text) {
      addUsage(chatId, result.text.length);
    }
    saveSessionHistory(chatId);
    await status.delete();

    // Award XP for the successful query
    const xpReward = Math.floor(Math.random() * 11) + 15; // 15 - 25 XP
    const xpRes = addXp(chatId, xpReward);
    if (xpRes.leveledUp) {
      const levelUpMsg = `\n\n🎉 *LEVEL UP!* Level Anda naik menjadi *Level ${xpRes.level}*! 🚀\n⚡ Sisa kuota gratis harian Anda meningkat menjadi *${getDailyLimit(chatId).toLocaleString('id-ID')}* karakter.`;
      if (result && result.text) {
        result.text += levelUpMsg;
      } else {
        if (controller.signal.aborted) throw new Error('STOPPED');
        await ctx.reply(levelUpMsg, { parse_mode: 'Markdown' });
      }
    }

    if (controller.signal.aborted) {
      throw new Error('STOPPED');
    }

    // De-duplicate filesToSend by absolute path
    if (result && result.filesToSend && Array.isArray(result.filesToSend)) {
      const uniqueFiles = [];
      const pathGroups = {};
      for (const file of result.filesToSend) {
        if (!file.path) continue;
        const absPath = path.resolve(file.path);
        if (!pathGroups[absPath]) {
          pathGroups[absPath] = [];
        }
        pathGroups[absPath].push(file);
      }
      for (const [absPath, group] of Object.entries(pathGroups)) {
        const merged = { ...group[0] };
        merged.path = absPath;
        for (const item of group) {
          if (item.keepFile) merged.keepFile = true;
          if (item.caption && !merged.caption) merged.caption = item.caption;
        }
        uniqueFiles.push(merged);
      }
      result.filesToSend = uniqueFiles;
    }

    let textSentAsCaption = false;
    const canUseCaption = result.text && result.text.length <= 1000 && result.filesToSend.length === 1;

    if (canUseCaption) {
      const file = result.filesToSend[0];
      try {
        let captionOptions = { caption: safeMarkdown(result.text), parse_mode: 'Markdown' };
        if (controller.signal.aborted) throw new Error('STOPPED');
        try {
          await sendFileSafe(ctx, file.path, file.type, captionOptions, status);
          textSentAsCaption = true;
        } catch (markdownErr) {
          if (controller.signal.aborted) throw new Error('STOPPED');
          captionOptions = { caption: result.text };
          await sendFileSafe(ctx, file.path, file.type, captionOptions, status);
          textSentAsCaption = true;
        }

        if (textSentAsCaption && !file.keepFile && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (err) {
        if (err.message === 'STOPPED') throw err;
        console.error('Failed to send file with caption, falling back to separate messages:', err);
        textSentAsCaption = false;
      }
    }

    if (controller.signal.aborted) {
      throw new Error('STOPPED');
    }

    if (!textSentAsCaption) {
      if (result.text) {
        if (controller.signal.aborted) throw new Error('STOPPED');
        await replySafe(ctx, result.text);
      }

      for (const file of result.filesToSend) {
        if (controller.signal.aborted) throw new Error('STOPPED');
        try {
          const basename = path.basename(file.path);
          let caption = '';
          if (file.type === 'video') {
            caption = `Video downloaded: ${basename}`;
          } else if (file.type === 'document') {
            caption = file.caption || `Project zip: ${basename}`;
          } else if (file.type === 'photo') {
            caption = file.caption || `Generated Image: ${basename}`;
          } else if (file.type === 'audio') {
            caption = file.caption || `Audio downloaded: ${basename}`;
          }

          if (controller.signal.aborted) throw new Error('STOPPED');
          await sendFileSafe(ctx, file.path, file.type, { caption }, status);

          if (!file.keepFile && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (fileError) {
          if (fileError.message === 'STOPPED') throw fileError;
          console.error('Failed to send file attachment:', fileError);
          await ctx.reply(`Gagal mengirim file lampiran: ${path.basename(file.path)}. Detail: ${fileError.message}`);
        }
      }
    }
  } catch (error) {
    await status.delete();
    
    if (error.message === 'STOPPED' || proc.controller.signal.aborted) {
      console.log(`[${chatId}] Request was stopped by user.`);
    } else if (error.message && error.message.startsWith('QUOTA_EXCEEDED:')) {
      const modelName = error.message.replace('QUOTA_EXCEEDED:', '');
      console.warn(`[Quota] Daily quota exhausted for model: ${modelName}`);
      await ctx.reply(
        `⚠️ *Kuota Harian Habis!*\n\n` +
        `Model *${modelName}* telah mencapai batas request gratis harian.\n\n` +
        `*Solusi:*\n` +
        `• Coba lagi besok setelah kuota di-reset\n` +
        `• Ganti ke model lain dengan perintah /model\n` +
        `• Upgrade limit API Groq di: https://console.groq.com/settings/billing`,
        { parse_mode: 'Markdown' }
      );
    } else {
      console.error('AI Agent loop error:', error);
      // Show friendly message, strip raw JSON if present
      let errMsg = error.message || 'Terjadi kesalahan tidak diketahui.';
      try {
        const jsonStart = errMsg.indexOf('{');
        if (jsonStart !== -1) {
          const parsed = JSON.parse(errMsg.substring(jsonStart));
          if (parsed?.error?.message) {
            errMsg = parsed.error.message.split('\n')[0];
          }
        }
      } catch (_) {}
      await ctx.reply(`❌ Terjadi kesalahan pada AI Agent:\n${errMsg}`);
    }
  } finally {
    activeProcesses.delete(proc.id);
  }
}


bot.command(['translate', 'terjemah'], async (ctx) => {
  const text = ctx.message.text.trim();
  const replyMsg = ctx.message.reply_to_message;
  
  const args = text.split(/\s+/).slice(1);
  let targetLang = args[0];
  let textToTranslate = args.slice(1).join(' ').trim();
  
  if (!targetLang) {
    return ctx.reply('Silakan berikan kode bahasa tujuan.\nFormat: `/translate <kode_bahasa> <teks>` atau balas pesan dengan `/translate <kode_bahasa>`\nContoh: `/translate en halo apa kabar` atau `/translate ja` (sambil membalas pesan).', { parse_mode: 'Markdown' });
  }
  
  if (!textToTranslate && replyMsg && replyMsg.text) {
    textToTranslate = replyMsg.text;
  }
  
  if (!textToTranslate) {
    return ctx.reply('Silakan tentukan teks yang ingin diterjemahkan.\nContoh: `/translate en halo apa kabar`', { parse_mode: 'Markdown' });
  }
  
  const chatId = ctx.chat.id;
  try {
    const translation = await toolHandlers.translate_text({ text: textToTranslate, targetLang });
    const formattedText = await formatPersonalityText(chatId, 'translate', targetLang, `🌐 *Terjemahan (${targetLang.toUpperCase()}):*\n\n${translation}`);
    await replySafe(ctx, formattedText);
  } catch (err) {
    await ctx.reply(`❌ Gagal menerjemahkan: ${err.message}`);
  }
});

bot.command(['currency', 'kurs'], async (ctx) => {
  const text = ctx.message.text.trim();
  const args = text.split(/\s+/).slice(1);
  
  if (args.length < 3) {
    return ctx.reply('Format salah.\nGunakan: `/currency <jumlah> <dari_mata_uang> <ke_mata_uang>`\nContoh: `/currency 100 usd idr` atau `/currency 50000 idr usd`', { parse_mode: 'Markdown' });
  }
  
  const amount = parseFloat(args[0]);
  const fromCurrency = args[1].toUpperCase();
  const toCurrency = args[2].toUpperCase();
  
  if (isNaN(amount)) {
    return ctx.reply('⚠️ Jumlah harus berupa angka.', { parse_mode: 'Markdown' });
  }
  
  const chatId = ctx.chat.id;
  try {
    const result = await toolHandlers.currency_converter({ amount, fromCurrency, toCurrency });
    const formattedText = await formatPersonalityText(chatId, 'currency', `${fromCurrency} -> ${toCurrency}`, result);
    await replySafe(ctx, formattedText);
  } catch (err) {
    await ctx.reply(`❌ Gagal mengonversi mata uang: ${err.message}`);
  }
});

bot.command(['shortlink', 'shorten'], async (ctx) => {
  const text = ctx.message.text.trim();
  const args = text.split(/\s+/).slice(1);
  const url = args[0];
  
  if (!url) {
    return ctx.reply('Silakan berikan URL/link yang ingin disingkat.\nContoh: `/shortlink https://example.com/sangat/panjang`', { parse_mode: 'Markdown' });
  }
  
  const chatId = ctx.chat.id;
  try {
    const result = await toolHandlers.shorten_url({ url });
    const formattedText = await formatPersonalityText(chatId, 'shortlink', url, result);
    await replySafe(ctx, formattedText);
  } catch (err) {
    await ctx.reply(`❌ Gagal menyingkat URL: ${err.message}`);
  }
});

bot.command(['krl', 'jadwalkrl'], async (ctx) => {
  const text = ctx.message.text.trim();
  const stationName = text.replace(/^\/(krl|jadwalkrl)\s*/i, '').trim();
  
  if (!stationName) {
    return ctx.reply('Silakan tentukan nama stasiun KRL.\nContoh: `/krl Manggarai` atau `/krl Bogor`', { parse_mode: 'Markdown' });
  }
  
  const chatId = ctx.chat.id;
  const status = createStatusUpdater(ctx);
  await status.update('Mengambil jadwal KRL...');
  
  try {
    const result = await toolHandlers.krl_schedule({ stationName });
    await status.delete();
    
    const match = result.match(/Saved at file path: (.+)/);
    if (match) {
      const absPath = path.join(config.workspaceDir, match[1].trim());
      if (fs.existsSync(absPath)) {
        const cleanText = result.replace(/\n\nSaved at file path: .+/g, '');
        const formattedText = await formatPersonalityText(chatId, 'krl', stationName, cleanText);
        const caption = formattedText.length > 1024 ? formattedText.substring(0, 1000) + '...' : formattedText;
        
        try {
          await ctx.replyWithPhoto({ source: absPath }, { caption: safeMarkdown(caption), parse_mode: 'Markdown' });
        } catch (photoErr) {
          await ctx.replyWithPhoto({ source: absPath }, { caption });
        }
        
        if (fs.existsSync(absPath)) {
          fs.unlinkSync(absPath);
        }
        return;
      }
    }
    
    const formattedText = await formatPersonalityText(chatId, 'krl', stationName, result);
    await replySafe(ctx, formattedText);
  } catch (err) {
    await status.delete();
    await ctx.reply(`❌ Gagal mengambil jadwal KRL: ${err.message}`);
  }
});

bot.command(['ocr', 'baca'], async (ctx) => {
  const replyMsg = ctx.message.reply_to_message;
  const photo = ctx.message.photo || (replyMsg && replyMsg.photo);
  
  if (!photo) {
    return ctx.reply('Silakan kirim foto dengan caption `/ocr` atau balas (reply) foto dengan perintah `/ocr` untuk mengekstrak teksnya.', { parse_mode: 'Markdown' });
  }
  
  const status = createStatusUpdater(ctx);
  await status.update('Mengunduh gambar untuk OCR...');
  
  try {
    const photos = photo;
    const bestPhoto = photos[photos.length - 1];
    const fileLink = await ctx.telegram.getFileLink(bestPhoto.file_id);
    const imageUrl = fileLink.href;
    
    await status.update('Mengekstrak dan membaca teks dari gambar dengan AI Vision...');
    const text = await analyzePhoto(imageUrl, 'Tolong baca dan tuliskan kembali semua teks yang terlihat pada gambar ini. Jangan berikan intro atau penjelasan tambahan, cukup berikan transkrip teksnya saja.');
    
    await status.delete();
    await replySafe(ctx, `📝 *Hasil Ekstraksi Teks (OCR):*\n\n${text}`);
  } catch (err) {
    await status.delete();
    await ctx.reply(`❌ Gagal membaca teks dari gambar: ${err.message}`);
  }
});

bot.command(['voice', 'filter'], async (ctx) => {
  const replyMsg = ctx.message.reply_to_message;
  const audio = replyMsg && (replyMsg.voice || replyMsg.audio || replyMsg.document);

  // Check if it is an audio document
  const isAudioDoc = replyMsg && replyMsg.document && (
    replyMsg.document.mime_type?.startsWith('audio/') || 
    /\.(mp3|m4a|wav|ogg|flac|aac|opus|alac|vorbis|mka)$/i.test(replyMsg.document.file_name || '')
  );

  if (!replyMsg || (!replyMsg.voice && !replyMsg.audio && !isAudioDoc)) {
    return ctx.reply('⚠️ Silakan balas (reply) rekaman suara atau file audio dengan perintah \`/voice\` atau \`/filter\` untuk mengubah efek suaranya!', { parse_mode: 'Markdown' });
  }

  const fileId = replyMsg.voice?.file_id || replyMsg.audio?.file_id || replyMsg.document?.file_id;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🐿️ Chipmunk', `voiceeffect:apply:chipmunk:${fileId}`),
      Markup.button.callback('👹 Deep Voice', `voiceeffect:apply:deep:${fileId}`)
    ],
    [
      Markup.button.callback('🤖 Robot', `voiceeffect:apply:robot:${fileId}`),
      Markup.button.callback('⚡ Cepat (Fast)', `voiceeffect:apply:fast:${fileId}`)
    ],
    [
      Markup.button.callback('🐌 Lambat (Slow)', `voiceeffect:apply:slow:${fileId}`),
      Markup.button.callback('📻 Echo/Reverb', `voiceeffect:apply:echo:${fileId}`)
    ],
    [
      Markup.button.callback('❌ Tutup', 'voiceeffect:close')
    ]
  ]);

  await ctx.reply('🗣️ *Pengubah Efek Suara (Voice Changer)* 🗣️\n\nSilakan pilih efek suara yang ingin diterapkan pada audio di bawah ini:', {
    parse_mode: 'Markdown',
    ...keyboard
  });
});

bot.command('ai', async (ctx) => {
  const text = ctx.message.text.trim();
  const prompt = text.replace(/^\/ai\s*/i, '').trim();
  await handleAiRequest(ctx, prompt);
});

bot.command(['hd', 'enhance', 'upscale'], async (ctx) => {
  const text = ctx.message.text.trim();
  const prompt = text.replace(/^\/(hd|enhance|upscale)\s*/i, '').trim();
  await handleAiRequest(ctx, prompt || 'hd');
});

// Non-command text handler (auto AI response in direct messages)
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) {
    return; 
  }

  if (ctx.chat.type === 'private') {
    await handleAiRequest(ctx, text);
  } else {
    
    const botInfo = ctx.botInfo;
    const botMention = `@${botInfo.username}`;
    if (text.includes(botMention)) {
      const cleanPrompt = text.replace(botMention, '').trim();
      await handleAiRequest(ctx, cleanPrompt);
    }
  }
});

// Voice note handler (Speech-to-Text)
bot.on('voice', async (ctx) => {
  const status = createStatusUpdater(ctx);
  await status.update('Mengunduh rekaman suara...');
  
  try {
    const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    const tempOgg = path.join(config.workspaceDir, `voice_${Date.now()}.ogg`);
    
    
    await downloadTelegramFile(fileLink.href, tempOgg);
    
    await status.update('Mentranskripsi suara (Speech-to-Text)...');
    
    
    const text = await transcribeAudio(tempOgg);
    
    
    if (fs.existsSync(tempOgg)) {
      fs.unlinkSync(tempOgg);
    }
    
    await status.update(`Transkripsi selesai: "${text}"\nMemproses dengan AI Agent...`);
    
    
    await handleAiRequest(ctx, text);
  } catch (error) {
    console.error('Voice note processing error:', error);
    await status.delete();
    await ctx.reply(`❌ Gagal memproses rekaman suara. Detail:\n${error.message}`);
  }
});


bot.on(['document', 'audio'], async (ctx) => {
  const caption = ctx.message.caption || '';
  await handleAiRequest(ctx, caption);
});


bot.on('photo', async (ctx) => {
  const caption = ctx.message.caption || '';
  
  if (caption.trim() !== '') {
    const cleanCaption = caption.trim();
    if (cleanCaption.startsWith('/ocr') || cleanCaption.startsWith('/baca')) {
      const status = createStatusUpdater(ctx);
      await status.update('Mengunduh gambar untuk OCR...');
      try {
        const photos = ctx.message.photo;
        const bestPhoto = photos[photos.length - 1];
        const fileLink = await ctx.telegram.getFileLink(bestPhoto.file_id);
        const imageUrl = fileLink.href;
        
        await status.update('Mengekstrak dan membaca teks dari gambar dengan AI Vision...');
        const text = await analyzePhoto(imageUrl, 'Tolong baca dan tuliskan kembali semua teks yang terlihat pada gambar ini. Jangan berikan intro atau penjelasan tambahan, cukup berikan transkrip teksnya saja.');
        
        await status.delete();
        await replySafe(ctx, `📝 *Hasil Ekstraksi Teks (OCR):*\n\n${text}`);
      } catch (err) {
        await status.delete();
        await ctx.reply(`❌ Gagal membaca teks dari gambar: ${err.message}`);
      }
      return;
    }

    if (ctx.chat.type !== 'private') {
      const botInfo = ctx.botInfo;
      const botMention = `@${botInfo.username}`;
      if (!caption.includes(botMention)) {
        return; 
      }
      const cleanCaption = caption.replace(botMention, '').trim();
      await handleAiRequest(ctx, cleanCaption);
    } else {
      await handleAiRequest(ctx, caption);
    }
    return;
  }

  // Fallback if no caption: standard vision analysis description
  const status = createStatusUpdater(ctx);
  await status.update('Mengunduh gambar...');

  try {
    // Get the best quality photo (last in array = largest)
    const photos = ctx.message.photo;
    const bestPhoto = photos[photos.length - 1];
    const fileLink = await ctx.telegram.getFileLink(bestPhoto.file_id);
    const imageUrl = fileLink.href;

    const question = 'Deskripsikan gambar ini secara detail dalam bahasa Indonesia.';

    await status.update('Menganalisis gambar dengan AI Vision...');
    const description = await analyzePhoto(imageUrl, question);

    await status.delete();
    await replySafe(ctx, `🔍 *Analisis Gambar:*\n\n${description}`);
  } catch (error) {
    console.error('Photo analysis error:', error);
    await status.delete();
    await ctx.reply(`❌ Gagal menganalisis gambar. Detail:\n${error.message}`);
  }
});

async function init() {
  console.log('🤖 Menyiapkan AI Agent Telegram Bot...');
  
  try {
    // Pre-download yt-dlp to make sure it's ready
    await getYtDlpPath();
  } catch (err) {
    console.warn('⚠️ Gagal menyiapkan yt-dlp secara otomatis. Download video mungkin bermasalah jika yt-dlp tidak diinstal manual di sistem.');
  }

  try {
    // Pre-download ffmpeg to make sure it's ready
    await getFfmpegPath();
  } catch (err) {
    console.warn('⚠️ Gagal menyiapkan ffmpeg secara otomatis:', err.message);
  }

  try {
    // Pre-download ffprobe to make sure it's ready
    await getFfprobePath();
  } catch (err) {
    console.warn('⚠️ Gagal menyiapkan ffprobe secara otomatis:', err.message);
  }

  const maxRetries = 3;
  const delayMs = 5000;
  let registered = false;

  console.log('Registering bot commands in Telegram menu...');
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await bot.telegram.setMyCommands([
        { command: 'ai', description: 'Tanyakan sesuatu atau jalankan perintah AI Agent' },
        { command: 'game', description: 'Pusat Game Interaktif (Game Center)' },
        { command: 'arcade', description: 'Gacha & Toko Arcade (Tukar Limit)' },
        { command: 'tictactoe', description: 'Main Tic Tac Toe lawan AI' },
        { command: 'suit', description: 'Main Batu Gunting Kertas' },
        { command: 'tebakkata', description: 'Main Tebak Kata / Hangman' },
        { command: 'kuismat', description: 'Main Kuis Matematika beruntun' },
        { command: 'tebakff', description: 'Main Tebak Hero Free Fire' },
        { command: 'tebakgambar', description: 'Main Tebak Gambar AI' },
        { command: 'limit', description: 'Cek sisa kuota harian pemakaian AI Anda' },
        { command: 'limittoken', description: 'Lihat penggunaan token API Groq berdasarkan model' },
        { command: 'topup', description: 'Top-Up kuota limit karakter AI (QRIS/VA)' },
        { command: 'img', description: 'Buat gambar AI dari deskripsi teks' },
        { command: 'cari', description: 'Cari informasi di Wikipedia' },
        { command: 'cuaca', description: 'Cek cuaca terkini di suatu kota' },
        { command: 'kripto', description: 'Cek harga cryptocurrency saat ini' },
        { command: 'saham', description: 'Cek harga saham Indonesia (IDX) & Amerika (US)' },
        { command: 'gempa', description: 'Info gempa bumi terkini dari BMKG + Peta' },
        { command: 'sholat', description: 'Cek jadwal sholat harian kota Indonesia' },
        { command: 'anime', description: 'Cari detail anime dari MyAnimeList' },
        { command: 'manga', description: 'Cari detail manga dari MyAnimeList' },
        { command: 'whois', description: 'Cek info WHOIS domain website atau GeoIP' },
        { command: 'lirik', description: 'Cari lirik lagu lengkap + cover' },
        { command: 'ss', description: 'Ambil tangkapan layar website dari URL' },
        { command: 'berita', description: 'Cari berita terbaru Google News' },
        { command: 'qr', description: 'Buat QR Code dari teks atau URL' },
        { command: 'tts', description: 'Ubah teks menjadi pesan suara/audio' },
        { command: 'meme', description: 'Buat meme AI lucu berdasarkan topik' },
        { command: 'ytmp4', description: 'Unduh video YouTube menjadi MP4' },
        { command: 'ytmp3', description: 'Unduh audio YouTube menjadi MP3/M4A' },
        { command: 'download', description: 'Unduh video dari YouTube, TikTok, dll' },
        { command: 'model', description: 'Lihat atau ganti model AI' },
        { command: 'thinking', description: 'Atur mode berpikir AI (off untuk respon cepat)' },
        { command: 'sifat', description: 'Ubah sifat/kepribadian AI Agent (Wibu, Tsundere, dll.)' },
        { command: 'memori', description: 'Lihat fakta/memori yang diingat AI tentang Anda' },
        { command: 'status', description: 'Cek status dan uptime bot' },
        { command: 'export', description: 'Ekspor riwayat percakapan sesi ini' },
        { command: 'stop', description: 'Hentikan proses AI yang sedang berjalan' },
        { command: 'clear', description: 'Hapus memori percakapan sesi ini' },
        { command: 'help', description: 'Tampilkan panduan lengkap penggunaan bot' },
        { command: 'translate', description: 'Terjemahkan teks ke bahasa lain (Google Translate)' },
        { command: 'currency', description: 'Konversi nilai mata uang (Real-time)' },
        { command: 'shortlink', description: 'Singkat link/URL yang panjang (TinyURL)' },
        { command: 'krl', description: 'Cek jadwal KRL Commuterline (Comuline API)' },
        { command: 'ocr', description: 'Ekstrak/baca teks dari gambar (AI Vision)' }
      ]);
      console.log('Bot commands registered successfully!');
      registered = true;
      break;
    } catch (cmdErr) {
      console.error(`⚠️ Attempt ${attempt}/${maxRetries} failed to register commands:`, cmdErr.message);
      if (attempt < maxRetries) {
        console.log(`Menunggu ${delayMs / 1000} detik sebelum mencoba kembali...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  if (!registered) {
    console.error('❌ Gagal meregistrasi command list ke Telegram setelah beberapa percobaan. Bot tetap dijalankan.');
  }

  bot.launch({ dropPendingUpdates: true }, () => {
    console.log('🚀 Telegram Bot berhasil dijalankan!');
    console.log('🤖 AI Agent siap digunakan!');
    console.log(`Menunggu pesan...`);
  }).catch((err) => {
    console.error('❌ Gagal menjalankan Telegram Bot:', err.message);
  });
}

init();


process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

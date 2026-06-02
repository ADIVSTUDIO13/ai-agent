import fs from 'fs';
import path from 'path';
import { Telegraf, Markup } from 'telegraf';
import { config, validateConfig } from './config.js';
import { runAgent, transcribeAudio, analyzePhoto, getCurrentModel, setModel } from './agent.js';
import { downloadVideo, getYtDlpPath, getFfmpegPath, getFfprobePath, ensureSandbox, downloadTelegramFile, compressImageIfLarge, generateTts, createMemeImage, getYtMetadata } from './utils.js';
import { getGameMenu, startTicTacToe, handleTicTacToeMove, startSuit, handleSuitPlay, handleSuitReset, startTebakKata, handleTebakLetter, handleTebakHint, startMathQuiz, handleMathAnswer, startTebakFf, handleTebakFfAnswer } from './games.js';
import { getUserUsage, addUsage, getRemainingUsage, getDailyLimit, getExtraQuota } from './usage.js';
import { TOPUP_PACKAGES, createTransaction, checkTransactionStatus, isPakasirConfigured } from './payment.js';

const BOT_START_TIME = Date.now();
const activePolls = new Map();


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


const bot = new Telegraf(config.telegramToken, { handlerTimeout: Infinity });


const sessions = new Map();


const activeRequests = new Map();

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


function createStatusUpdater(ctx) {
  let statusMessage = null;
  return {
    update: async (text) => {
      try {
        if (!statusMessage) {
          statusMessage = await ctx.reply(`⏳ ${text}`);
        } else {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMessage.message_id,
            undefined,
            `⏳ ${text}`
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


async function replySafe(ctx, text) {
  try {
    
    if (text.length > 4000) {
      for (let i = 0; i < text.length; i += 4000) {
        await ctx.reply(text.substring(i, i + 4000));
      }
      return;
    }
    await ctx.reply(text, { parse_mode: 'Markdown' });
  } catch (err) {
    try {
      await ctx.reply(text);
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
      Markup.button.callback('🎮 Pusat Game Center', 'game:menu')
    ],
    [
      Markup.button.callback('🎨 Buat Gambar', 'ai_template:gambar'),
      Markup.button.callback('🌤️ Cek Cuaca', 'ai_template:cuaca')
    ],
    [
      Markup.button.callback('💰 Harga Crypto', 'ai_template:kripto'),
      Markup.button.callback('🧠 Memori Saya', 'ai_template:memori')
    ],
    [
      Markup.button.callback('📊 Sisa Kuota (Limit)', 'ai_template:limit'),
      Markup.button.callback('📖 Panduan Lengkap', 'ai_template:help')
    ]
  ]);
  return { text, keyboard };
}

bot.start((ctx) => {
  const firstName = ctx.from.first_name || 'Teman';
  const { text, keyboard } = getStartMarkup(firstName);
  ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.help((ctx) => {
  const helpMessage = `📖 *Panduan Lengkap AI Agent Bot*

*🤖 AI Agent:*
/ai \`[perintah]\` — Agent AI serba bisa
Contoh:
- \`/ai buatkan web kopi kekinian lalu zip\`
- \`/ai install axios lalu buat script fetch API

*🖼️ Gambar & Visual:*
/img \`[deskripsi]\` — Buat gambar AI (Pollinations)
- \`/img kucing astronot di luar angkasa\`
📷 Kirim foto → Analisis visual otomatis (tambah caption jika ada pertanyaan)

*🔍 Pencarian & Info:*
/cari \`[kata kunci]\` — Cari di Wikipedia
/cuaca \`[kota]\` — Cuaca real-time
/kripto \`[nama koin]\` — Harga cryptocurrency
/saham \`[ticker]\` — Harga saham Indonesia & US

*📥 Download & Media:*
/ytmp4 \`[url]\` — Download video YouTube (MP4)
/ytmp3 \`[url]\` — Download audio YouTube (MP3)
/download \`[url]\` — Download video (YouTube, TikTok, dll)
/tts \`[teks]\` — Ubah teks ke suara / pesan suara (atau balas teks dengan /tts)
/meme \`[topik]\` — Buat meme AI lucu 🎭

*🔧 Tools:*
/qr \`[teks/url]\` — Buat QR Code
/model \`[nama]\` — Lihat/ganti model AI
/memori — Lihat memori/fakta tentang Anda
/limit — Cek sisa kuota harian AI Anda
/status — Status & uptime bot
/export — Export riwayat chat ke file
/stop — 🛑 Hentikan permintaan AI yang sedang berjalan
/clear — Hapus memori sesi ini

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

bot.command(['game', 'play'], async (ctx) => {
  const { text, keyboard } = getGameMenu();
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
  const { text, keyboard } = startTebakKata(ctx.chat.id);
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

bot.command('limit', async (ctx) => {
  const chatId = ctx.chat.id;
  const used = getUserUsage(chatId);
  const baseLimit = getDailyLimit();
  const freeRemaining = Math.max(0, baseLimit - used);
  const extraQuota = getExtraQuota(chatId);
  const totalRemaining = freeRemaining + extraQuota;

  const msg = `📊 *Status Kuota Karakter AI Anda*

👤 Pengguna: *${ctx.from?.first_name || 'Teman'}*
🆓 Kuota Gratis Terpakai: *${used.toLocaleString('id-ID')}* / *${baseLimit.toLocaleString('id-ID')}* karakter
⚡ Sisa Kuota Gratis Hari Ini: *${freeRemaining.toLocaleString('id-ID')}* karakter
💎 Kuota Ekstra Berbayar: *${extraQuota.toLocaleString('id-ID')}* karakter (Permanen)

🔋 *Total Kuota Tersisa:* *${totalRemaining.toLocaleString('id-ID')}* karakter

🔄 _Kuota gratis di-reset otomatis menjadi 5.000 setiap jam 12 malam WIB (Asia/Jakarta). Kuota ekstra tidak akan hangus._`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💳 Top-Up Kuota (QRIS / VA)', 'topup:menu')],
    [Markup.button.callback('🔙 Menu Utama', 'ai_template:start')]
  ]);

  await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
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
    return [Markup.button.callback(`${p.name} - Rp ${p.amount.toLocaleString('id-ID')} (${p.quota.toLocaleString('id-ID')} Karakter)`, `topup:pkg:${p.id}`)];
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

async function editToTemplate(ctx, text) {
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Kembali ke Utama', 'ai_template:start')]
  ]);
  try {
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...keyboard
    });
  } catch (err) {
    if (!err.message.includes('message is not modified')) {
      console.error('Failed to edit template:', err);
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
    const baseLimit = getDailyLimit();
    const freeRemaining = Math.max(0, baseLimit - used);
    const extraQuota = getExtraQuota(chatId);
    const totalRemaining = freeRemaining + extraQuota;
    
    const text = `📊 *Status Kuota Karakter AI Anda*

👤 Pengguna: *${ctx.from?.first_name || 'Teman'}*
🆓 Kuota Gratis Terpakai: *${used.toLocaleString('id-ID')}* / *${baseLimit.toLocaleString('id-ID')}* karakter
⚡ Sisa Kuota Gratis Hari Ini: *${freeRemaining.toLocaleString('id-ID')}* karakter
💎 Kuota Ekstra Berbayar: *${extraQuota.toLocaleString('id-ID')}* karakter (Permanen)

🔋 *Total Kuota Tersisa:* *${totalRemaining.toLocaleString('id-ID')}* karakter

🔄 _Kuota gratis di-reset otomatis menjadi 5.000 setiap jam 12 malam WIB (Asia/Jakarta). Kuota ekstra tidak akan hangus._`;

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

*🖼️ Gambar & Media:*
• /img \`[deskripsi]\` — Buat gambar AI
• /meme \`[topik]\` — Buat meme lucu 🎭
• /tts \`[teks]\` — Teks menjadi pesan suara 🗣️
• /download \`[url]\` — Unduh video (YT, TikTok)
• /ytmp4 & /ytmp3 — Unduh video/audio YouTube

*🔍 Pencarian & Info:*
• /cari \`[kueri]\` — Wikipedia
• /cuaca \`[kota]\` — Prakiraan Cuaca BMKG
• /kripto \`[koin]\` — Harga koin crypto
• /saham \`[ticker]\` — Harga saham Indonesia & US

*🔧 Tools & Sesi:*
• /limit — Cek sisa kuota harian Anda
• /model — Ganti model AI
• /memori — Lihat fakta tersimpan
• /clear — Bersihkan riwayat chat sesi ini
• /status — Uptime & status bot`;
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
        await ctx.reply(`🎉 *PEMBAYARAN SUKSES!* 🎉\n\nInvoice \`${orderId}\` telah berhasil diverifikasi. Kuota ekstra Anda telah ditambahkan! Silakan cek kembali sisa kuota Anda menggunakan perintah \`/limit\`. Terima kasih atas dukungannya!`);
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
        await bot.telegram.sendMessage(chatId, `🎉 *PEMBAYARAN SUKSES!* 🎉\n\nInvoice \`${orderId}\` telah berhasil diverifikasi. Kuota ekstra Anda telah ditambahkan! Silakan cek kembali sisa kuota Anda menggunakan perintah \`/limit\`. Terima kasih atas dukungannya!`);
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
    } else if (actionData === 'start:ttt') {
      result = startTicTacToe(chatId);
    } else if (actionData === 'start:suit') {
      result = startSuit(chatId);
    } else if (actionData === 'start:tebak') {
      result = startTebakKata(chatId);
    } else if (actionData === 'start:math') {
      result = startMathQuiz(chatId);
    } else if (actionData === 'start:tebakff') {
      result = startTebakFf(chatId);
    } else if (actionData.startsWith('ttt:move:')) {
      const index = parseInt(actionData.split(':')[2]);
      result = handleTicTacToeMove(chatId, index);
    } else if (actionData.startsWith('suit:play:')) {
      const choice = actionData.split(':')[2];
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
    }

    if (result) {
      await ctx.answerCbQuery();
      try {
        await ctx.editMessageText(result.text, {
          parse_mode: 'Markdown',
          ...result.keyboard
        });
      } catch (editErr) {
        if (!editErr.message.includes('message is not modified')) {
          throw editErr;
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


bot.command('stop', async (ctx) => {
  const chatId = ctx.chat.id;
  const req = activeRequests.get(chatId);
  if (!req) {
    return ctx.reply('ℹ️ Tidak ada permintaan AI yang sedang berjalan untuk dihentikan.');
  }
  req.controller.abort();
  activeRequests.delete(chatId);
  await ctx.reply('🛑 Permintaan AI dihentikan! Ketik pesan baru untuk memulai kembali.');
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
  const runningRequests = activeRequests.size;

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
  const text = ctx.message.text.trim();
  const args = text.split(/\s+/).slice(1);
  const newModel = args[0];

  const availableModels = [
    'qwen/qwen3-32b',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'gemma2-9b-it',
    'compound-beta',
  ];

  if (!newModel) {
    const modelList = availableModels.map((m, i) => `${i + 1}. \`${m}\``).join('\n');
    return ctx.reply(
      `🧠 *Model AI Saat Ini:* \`${getCurrentModel()}\`\n\n*Model Tersedia:*\n${modelList}\n\nGunakan \`/model <nama_model>\` untuk mengganti model.\nContoh: \`/model llama-3.3-70b-versatile\``,
      { parse_mode: 'Markdown' }
    );
  }

  setModel(newModel);
  await ctx.reply(`✅ Model AI berhasil diganti ke: \`${newModel}\``, { parse_mode: 'Markdown' });
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


bot.command('cuaca', async (ctx) => {
  const text = ctx.message.text.trim();
  const city = text.replace(/^\/cuaca\s*/i, '').trim();
  if (!city) {
    return ctx.reply('Silakan berikan nama kota.\nContoh: `/cuaca Jakarta`', { parse_mode: 'Markdown' });
  }
  await handleAiRequest(ctx, `Cek cuaca saat ini di kota ${city}, tampilkan informasinya, dan ambil serta tampilkan gambar prakiraan cuaca dari BMKG.`);
});


bot.command('kripto', async (ctx) => {
  const text = ctx.message.text.trim();
  const symbol = text.replace(/^\/kripto\s*/i, '').trim();
  if (!symbol) {
    return ctx.reply('Silakan berikan nama koin.\nContoh: `/kripto bitcoin`', { parse_mode: 'Markdown' });
  }
  await handleAiRequest(ctx, `Tampilkan harga terkini ${symbol} dalam USD dan IDR serta tampilkan grafik tren harganya.`);
});


bot.command(['saham', 'stock'], async (ctx) => {
  const text = ctx.message.text.trim();
  const symbol = text.replace(/^\/(saham|stock)\s*/i, '').trim();
  if (!symbol) {
    return ctx.reply('Silakan berikan ticker/simbol saham.\nContoh:\n- `/saham BBCA` (Indonesia)\n- `/saham AAPL` (AS)', { parse_mode: 'Markdown' });
  }
  await handleAiRequest(ctx, `Tampilkan harga terkini saham ${symbol} dalam USD/IDR serta tampilkan grafik tren harganya.`);
});


bot.command('qr', async (ctx) => {
  const text = ctx.message.text.trim();
  const content = text.replace(/^\/qr\s*/i, '').trim();
  if (!content) {
    return ctx.reply('Silakan berikan teks atau URL.\nContoh: `/qr https://example.com`', { parse_mode: 'Markdown' });
  }
  await handleAiRequest(ctx, `Buatkan QR code untuk teks/URL berikut dan kirimkan gambarnya: "${content}"`);
});






bot.command('download', async (ctx) => {
  const text = ctx.message.text.trim();
  const args = text.split(/\s+/).slice(1);
  const url = args[0];

  if (!url) {
    return ctx.reply('Silakan sertakan URL video yang ingin diunduh.\nContoh: `/download https://tiktok.com/...`', { parse_mode: 'Markdown' });
  }

  const status = createStatusUpdater(ctx);
  await status.update('Menyiapkan pengunduh video...');

  try {
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    if (isYouTube) {
      await status.update('Mengambil metadata YouTube...');
      const meta = await getYtMetadata(url);
      if (meta) {
        const metaText = `🎥 *INFORMASI YOUTUBE* 🎥\n\n📌 *Judul:* ${meta.title}\n👤 *Channel:* ${meta.uploader}\n⏱ *Durasi:* ${meta.duration}\n👁 *Views:* ${meta.views.toLocaleString('id-ID')}\n\n⏳ _Proses pengunduhan sedang berjalan, mohon tunggu..._`;
        try {
          await ctx.replyWithPhoto({ url: meta.thumbnail }, { caption: metaText, parse_mode: 'Markdown' });
        } catch (e) {
          await ctx.reply(metaText, { parse_mode: 'Markdown' });
        }
      }
    }

    const videoPath = await downloadVideo(url, config.workspaceDir);
    await status.update('Mengirimkan video ke Telegram (maks 50MB)...');

    await ctx.replyWithVideo(
      { source: videoPath },
      { caption: 'Unduhan video Anda berhasil selesai! 🎬' }
    );

    
    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
    await status.delete();
  } catch (error) {
    console.error('Download error:', error);
    await status.delete();
    await ctx.reply(`❌ Gagal mengunduh video. Detail:\n${error.message}`);
  }
});


bot.command('ytmp4', async (ctx) => {
  const text = ctx.message.text.trim();
  const args = text.split(/\s+/).slice(1);
  const url = args[0];

  if (!url) {
    return ctx.reply('Silakan sertakan URL video yang ingin diunduh.\nContoh: `/ytmp4 https://youtube.com/...`', { parse_mode: 'Markdown' });
  }

  const status = createStatusUpdater(ctx);
  await status.update('Menyiapkan pengunduh video MP4...');

  try {
    await status.update('Mengambil metadata YouTube...');
    const meta = await getYtMetadata(url);
    if (meta) {
      const metaText = `🎥 *INFORMASI YOUTUBE* 🎥\n\n📌 *Judul:* ${meta.title}\n👤 *Channel:* ${meta.uploader}\n⏱ *Durasi:* ${meta.duration}\n👁 *Views:* ${meta.views.toLocaleString('id-ID')}\n\n⏳ _Proses pengunduhan video sedang berjalan, mohon tunggu..._`;
      try {
        await ctx.replyWithPhoto({ url: meta.thumbnail }, { caption: metaText, parse_mode: 'Markdown' });
      } catch (e) {
        await ctx.reply(metaText, { parse_mode: 'Markdown' });
      }
    }

    const videoPath = await downloadVideo(url, config.workspaceDir, 'video');
    await status.update('Mengirimkan video ke Telegram (maks 50MB)...');

    await ctx.replyWithVideo(
      { source: videoPath },
      { caption: 'Unduhan video MP4 Anda berhasil selesai! 🎬' }
    );

    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
    await status.delete();
  } catch (error) {
    console.error('YTMP4 error:', error);
    await status.delete();
    await ctx.reply(`❌ Gagal mengunduh video. Detail:\n${error.message}`);
  }
});


bot.command('ytmp3', async (ctx) => {
  const text = ctx.message.text.trim();
  const args = text.split(/\s+/).slice(1);
  const url = args[0];

  if (!url) {
    return ctx.reply('Silakan sertakan URL audio yang ingin diunduh.\nContoh: `/ytmp3 https://youtube.com/...`', { parse_mode: 'Markdown' });
  }

  const status = createStatusUpdater(ctx);
  await status.update('Menyiapkan pengunduh audio MP3/M4A...');

  try {
    await status.update('Mengambil metadata YouTube...');
    const meta = await getYtMetadata(url);
    if (meta) {
      const metaText = `🎵 *INFORMASI YOUTUBE AUDIO* 🎵\n\n📌 *Judul:* ${meta.title}\n👤 *Channel:* ${meta.uploader}\n⏱ *Durasi:* ${meta.duration}\n👁 *Views:* ${meta.views.toLocaleString('id-ID')}\n\n⏳ _Proses pengunduhan audio sedang berjalan, mohon tunggu..._`;
      try {
        await ctx.replyWithPhoto({ url: meta.thumbnail }, { caption: metaText, parse_mode: 'Markdown' });
      } catch (e) {
        await ctx.reply(metaText, { parse_mode: 'Markdown' });
      }
    }

    const audioPath = await downloadVideo(url, config.workspaceDir, 'audio');
    await status.update('Mengirimkan audio ke Telegram...');

    await ctx.replyWithAudio(
      { source: audioPath },
      { caption: 'Unduhan audio MP3/M4A Anda berhasil selesai! 🎵' }
    );

    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }
    await status.delete();
  } catch (error) {
    console.error('YTMP3 error:', error);
    await status.delete();
    await ctx.reply(`❌ Gagal mengunduh audio. Detail:\n${error.message}`);
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

  const status = createStatusUpdater(ctx);
  await status.update('Mengonversi teks menjadi suara...');

  try {
    const audioPath = await generateTts(ttsText, config.workspaceDir);
    await status.update('Mengirimkan pesan suara...');

    await ctx.replyWithVoice(
      { source: audioPath },
      { caption: 'Pesan suara Anda siap! 🗣️' }
    );

    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }
    await status.delete();
  } catch (error) {
    console.error('TTS error:', error);
    await status.delete();
    await ctx.reply(`❌ Gagal mengubah teks menjadi suara. Detail:\n${error.message}`);
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

  if (activeRequests.has(chatId)) {
    activeRequests.get(chatId).controller.abort();
    activeRequests.delete(chatId);
  }

  const controller = new AbortController();
  activeRequests.set(chatId, { controller });

  const status = createStatusUpdater(ctx);
  await status.update('Mendesain dan memikirkan meme kreatif...');

  try {
    const { memePath, topText, bottomText } = await createMemeImage(topic, config.workspaceDir, controller.signal);
    addUsage(chatId, (topText || '').length + (bottomText || '').length);
    await status.update('Mengirimkan meme...');

    await ctx.replyWithPhoto(
      { source: memePath },
      { 
        caption: `🎭 *Meme:* "${topic}"\n\n*Top:* ${topText}\n*Bottom:* ${bottomText}\n\n_Generated via AI_`,
        parse_mode: 'Markdown'
      }
    );

    if (fs.existsSync(memePath)) {
      fs.unlinkSync(memePath);
    }
    await status.delete();
  } catch (error) {
    if (error.message === 'STOPPED' || controller.signal.aborted) {
      console.log(`[${chatId}] Meme request was stopped by user.`);
    } else {
      console.error('Meme error:', error);
      await ctx.reply(`❌ Gagal membuat meme. Detail:\n${error.message}`);
    }
    await status.delete();
  } finally {
    if (activeRequests.get(chatId)?.controller === controller) {
      activeRequests.delete(chatId);
    }
  }
});


async function handleAiRequest(ctx, prompt) {
  let finalPrompt = (prompt || '').trim();
  const replyMsg = ctx.message && ctx.message.reply_to_message;
  const status = createStatusUpdater(ctx);

  if (finalPrompt === '') {
    if (replyMsg) {
      if (replyMsg.photo) {
        finalPrompt = 'Jelaskan dan analisis foto ini secara detail dalam bahasa Indonesia.';
      } else if (replyMsg.document) {
        finalPrompt = `Jelaskan isi dari berkas "${replyMsg.document.file_name}" ini.`;
      } else if (replyMsg.voice) {
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
  const remaining = getRemainingUsage(chatId);
  if (remaining <= 0) {
    return ctx.reply('⚠️ *Batas Limit Tercapai!*\n\nPemakaian AI Anda hari ini telah mencapai batas maksimal 5.000 karakter. Limit akan di-reset setiap jam 12 malam (WIB / Asia/Jakarta).\n\nGunakan perintah `/limit` untuk melihat kuota Anda.', { parse_mode: 'Markdown' });
  }

  const history = getSessionHistory(chatId);

  // If there is already a running request for this user, abort it first
  if (activeRequests.has(chatId)) {
    activeRequests.get(chatId).controller.abort();
    activeRequests.delete(chatId);
  }

  // Create a new AbortController to allow /stop to cancel this request
  const controller = new AbortController();
  activeRequests.set(chatId, { controller });

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
      finalPrompt += `\n\n[SISTEM: Pengguna melampirkan/membalas sebuah foto. Foto tersebut telah diunduh dan disimpan di sandbox Anda sebagai "input_image.jpg". Jika pengguna meminta untuk mengubah gaya gambar (seperti kartun, anime, sketsa, dll.), gunakan alat "image_to_image" dengan file tersebut.]`;
    } catch (err) {
      console.error('Failed to download photo for agent:', err.message);
    }
  }

  // Handle reply to text messages
  if (replyMsg && replyMsg.text) {
    finalPrompt += `\n\n[SISTEM: Pengguna membalas pesan teks berikut:\n"""\n${replyMsg.text}\n"""]`;
  }

  // Handle reply to voice notes
  if (replyMsg && replyMsg.voice) {
    await status.update('Mengunduh dan mentranskripsi rekaman suara balasan...');
    try {
      const fileLink = await ctx.telegram.getFileLink(replyMsg.file_id);
      const tempOgg = path.join(config.workspaceDir, `voice_${Date.now()}.ogg`);
      await downloadTelegramFile(fileLink.href, tempOgg);
      const voiceText = await transcribeAudio(tempOgg);
      if (fs.existsSync(tempOgg)) {
        fs.unlinkSync(tempOgg);
      }
      finalPrompt += `\n\n[SISTEM: Pengguna membalas rekaman suara dengan transkripsi: "${voiceText}"]`;
    } catch (err) {
      console.error('Failed to transcribe replied voice:', err.message);
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
    // Charge user for output result length
    if (result && result.text) {
      addUsage(chatId, result.text.length);
    }
    saveSessionHistory(chatId);
    await status.delete();

    let textSentAsCaption = false;
    const canUseCaption = result.text && result.text.length <= 1000 && result.filesToSend.length === 1;

    if (canUseCaption) {
      const file = result.filesToSend[0];
      try {
        let captionOptions = { caption: result.text, parse_mode: 'Markdown' };
        try {
          if (file.type === 'video') {
            await ctx.replyWithVideo({ source: file.path }, captionOptions);
          } else if (file.type === 'document') {
            await ctx.replyWithDocument({ source: file.path }, captionOptions);
          } else if (file.type === 'photo') {
            await ctx.replyWithPhoto({ source: file.path }, captionOptions);
          } else if (file.type === 'audio') {
            await ctx.replyWithAudio({ source: file.path }, captionOptions);
          }
          textSentAsCaption = true;
        } catch (markdownErr) {
          
          captionOptions = { caption: result.text };
          if (file.type === 'video') {
            await ctx.replyWithVideo({ source: file.path }, captionOptions);
          } else if (file.type === 'document') {
            await ctx.replyWithDocument({ source: file.path }, captionOptions);
          } else if (file.type === 'photo') {
            await ctx.replyWithPhoto({ source: file.path }, captionOptions);
          } else if (file.type === 'audio') {
            await ctx.replyWithAudio({ source: file.path }, captionOptions);
          }
          textSentAsCaption = true;
        }

        
        if (textSentAsCaption && !file.keepFile && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (err) {
        console.error('Failed to send file with caption, falling back to separate messages:', err);
        textSentAsCaption = false;
      }
    }

    if (!textSentAsCaption) {
      
      if (result.text) {
        await replySafe(ctx, result.text);
      }

      
      for (const file of result.filesToSend) {
        try {
          const basename = path.basename(file.path);
          if (file.type === 'video') {
            await ctx.replyWithVideo(
              { source: file.path },
              { caption: `Video downloaded: ${basename}` }
            );
          } else if (file.type === 'document') {
            await ctx.replyWithDocument(
              { source: file.path },
              { caption: file.caption || `Project zip: ${basename}` }
            );
          } else if (file.type === 'photo') {
            await ctx.replyWithPhoto(
              { source: file.path },
              { caption: file.caption || `Generated Image: ${basename}` }
            );
          } else if (file.type === 'audio') {
            await ctx.replyWithAudio(
              { source: file.path },
              { caption: file.caption || `Audio downloaded: ${basename}` }
            );
          }

          
          if (!file.keepFile && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (fileError) {
          console.error('Failed to send file attachment:', fileError);
          await ctx.reply(`Gagal mengirim file lampiran: ${path.basename(file.path)}. Detail: ${fileError.message}`);
        }
      }
    }
  } catch (error) {
    await status.delete();
    
    if (error.message === 'STOPPED' || controller.signal.aborted) {
      console.log(`[${chatId}] Request was stopped by user.`);
    } else {
      console.error('AI Agent loop error:', error);
      await ctx.reply(`❌ Terjadi kesalahan pada AI Agent:\n${error.message}`);
    }
  } finally {
    
    if (activeRequests.get(chatId)?.controller === controller) {
      activeRequests.delete(chatId);
    }
  }
}


bot.command('ai', async (ctx) => {
  const text = ctx.message.text.trim();
  const prompt = text.replace(/^\/ai\s*/i, '').trim();
  await handleAiRequest(ctx, prompt);
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


bot.on('document', async (ctx) => {
  const caption = ctx.message.caption || '';
  await handleAiRequest(ctx, caption);
});




bot.on('photo', async (ctx) => {
  const caption = ctx.message.caption || '';
  
  // If there's a caption, let the AI Agent handle it (so they can cartoonify, edit, or ask complex questions)
  if (caption.trim() !== '') {
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

  try {
    console.log('Registering bot commands in Telegram menu...');
    await bot.telegram.setMyCommands([
      { command: 'ai', description: 'Tanyakan sesuatu atau jalankan perintah AI Agent' },
      { command: 'game', description: 'Pusat Game Interaktif (Game Center)' },
      { command: 'tictactoe', description: 'Main Tic Tac Toe lawan AI' },
      { command: 'suit', description: 'Main Batu Gunting Kertas' },
      { command: 'tebakkata', description: 'Main Tebak Kata / Hangman' },
      { command: 'kuismat', description: 'Main Kuis Matematika beruntun' },
      { command: 'tebakff', description: 'Main Tebak Hero Free Fire' },
      { command: 'limit', description: 'Cek sisa kuota harian pemakaian AI Anda' },
      { command: 'topup', description: 'Top-Up kuota limit karakter AI (QRIS/VA)' },
      { command: 'img', description: 'Buat gambar AI dari deskripsi teks' },
      { command: 'cari', description: 'Cari informasi di Wikipedia' },
      { command: 'cuaca', description: 'Cek cuaca terkini di suatu kota' },
      { command: 'kripto', description: 'Cek harga cryptocurrency saat ini' },
      { command: 'saham', description: 'Cek harga saham Indonesia (IDX) & Amerika (US)' },
      { command: 'qr', description: 'Buat QR Code dari teks atau URL' },
      { command: 'tts', description: 'Ubah teks menjadi pesan suara/audio' },
      { command: 'meme', description: 'Buat meme AI lucu berdasarkan topik' },
      { command: 'ytmp4', description: 'Unduh video YouTube menjadi MP4' },
      { command: 'ytmp3', description: 'Unduh audio YouTube menjadi MP3/M4A' },
      { command: 'download', description: 'Unduh video dari YouTube, TikTok, dll' },
      { command: 'model', description: 'Lihat atau ganti model AI' },
      { command: 'memori', description: 'Lihat fakta/memori yang diingat AI tentang Anda' },
      { command: 'status', description: 'Cek status dan uptime bot' },
      { command: 'export', description: 'Ekspor riwayat percakapan sesi ini' },
      { command: 'stop', description: 'Hentikan proses AI yang sedang berjalan' },
      { command: 'clear', description: 'Hapus memori percakapan sesi ini' },
      { command: 'help', description: 'Tampilkan panduan lengkap penggunaan bot' }
    ]);
    console.log('Bot commands registered successfully!');
  } catch (cmdErr) {
    console.error('⚠️ Gagal meregistrasi command list ke Telegram:', cmdErr.message);
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

import { Markup } from 'telegraf';
import Groq from 'groq-sdk';
import { config } from './config.js';
import { addXp, addPoints, addTickets, getUserPoints, getUserTickets, addExtraQuota, getUserLevel, getUserXp, wrapGroqClient } from './usage.js';

const groq = config.groqApiKey ? wrapGroqClient(new Groq({ apiKey: config.groqApiKey })) : null;

// Storage for active game states
export const gameSessions = new Map();

// Word pool with hints for Tebak Kata
const TEBAK_KATA_WORDS = [
  { word: 'JAVASCRIPT', hint: 'Bahasa pemrograman terpopuler untuk web development' },
  { word: 'TELEGRAM', hint: 'Aplikasi perpesanan instan yang kita gunakan saat ini' },
  { word: 'PROGRAMMER', hint: 'Profesi orang yang menulis baris-baris kode komputer' },
  { word: 'DATABASE', hint: 'Tempat penyimpanan data aplikasi yang terstruktur' },
  { word: 'INTERNET', hint: 'Jaringan komputer global yang menghubungkan seluruh dunia' },
  { word: 'KUCING', hint: 'Hewan peliharaan lucu berkaki empat yang suka mengeong' },
  { word: 'KOMPUTER', hint: 'Perangkat elektronik untuk mengolah informasi dan data' },
  { word: 'ROBOT', hint: 'Mesin otomatis yang bisa diprogram untuk melakukan tugas' },
  { word: 'ANGKASA', hint: 'Ruang hampa udara di luar atmosfer Bumi' },
  { word: 'INDONESIA', hint: 'Negara kepulauan terluas di Asia Tenggara' },
  { word: 'NODEJS', hint: 'Runtime environment untuk menjalankan JavaScript di server' },
  { word: 'ALGORITMA', hint: 'Langkah-langkah logis dan sistematis untuk memecahkan masalah' }
];

// Emojis for games
const EMOJI_TTT = {
  EMPTY: '⬜',
  X: '❌',
  O: '⭕'
};

const CHESS_PIECES = {
  'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙', // White
  'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟', // Black
  ' ': '' // empty
};

const INITIAL_CHESS_BOARD = [
  'r', 'n', 'b', 'q', 'k', 'b', 'n', 'r',
  'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p',
  ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ',
  ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ',
  ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ',
  ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ',
  'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P',
  'R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'
];

// --- GAME MENU ---
export function getGameMenu() {
  const text = `🎮 *Pusat Game AI Agent* 🎮\n\nSelamat datang di Game Center! Pilih game yang ingin Anda mainkan di bawah ini menggunakan tombol menu.`;
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('👑 Catur AI (Chess) 👑', 'game:start:chess')
    ],
    [
      Markup.button.callback('❌ Tic Tac Toe ⭕', 'game:start:ttt'),
      Markup.button.callback('✊ Suit (RPS) 🖐️', 'game:start:suit')
    ],
    [
      Markup.button.callback('📝 Tebak Kata 🔍', 'game:start:tebak'),
      Markup.button.callback('🧮 Kuis Matematika ⚡', 'game:start:math')
    ],
    [
      Markup.button.callback('🎨 Tebak Gambar AI 📸', 'game:start:tebakgambar'),
      Markup.button.callback('🎯 Tebak Hero FF 🎯', 'game:start:tebakff')
    ],
    [
      Markup.button.callback('🎰 Slot Gacor AI 🎰', 'game:start:slot'),
      Markup.button.callback('🔢 Tebak Angka 🔢', 'game:start:ta')
    ],
    [
      Markup.button.callback('🃏 Blackjack 21 🃏', 'game:start:bj'),
      Markup.button.callback('🏳️ Tebak Bendera 🏳️', 'game:start:tb')
    ],
    [
      Markup.button.callback('🎡 Gacha & Toko Arcade 🪙', 'game:arcade:menu')
    ],
    [
      Markup.button.callback('🔙 Kembali ke Menu Utama', 'ai_template:start')
    ]
  ]);
  return { text, keyboard };
}

// --- TIC TAC TOE LOGIC ---
export function startTicTacToe(chatId) {
  const board = Array(9).fill(' ');
  // Randomize who goes first: true for Player, false for Bot
  const isPlayerTurn = Math.random() < 0.5;

  const session = {
    gameType: 'ttt',
    state: {
      board,
      isPlayerTurn,
      playerSymbol: 'X',
      botSymbol: 'O',
      status: isPlayerTurn ? 'Giliran Anda! Klik salah satu kotak ➖.' : 'Giliran Bot berpikir...'
    }
  };

  gameSessions.set(chatId, session);

  if (!isPlayerTurn) {
    const render = renderTicTacToe(session.state);
    return {
      text: render.text,
      keyboard: render.keyboard,
      triggerBot: true
    };
  }

  return renderTicTacToe(session.state);
}

function renderTicTacToe(state) {
  const text = `❌ *TIC TAC TOE MATCH* ⭕\n` +
               `━━━━━━━━━━━━━━━━━━━━\n` +
               `👤 *Anda:* \`❌\`\n` +
               `🤖 *Bot AI:* \`⭕\`\n` +
               `━━━━━━━━━━━━━━━━━━━━\n\n` +
               `📢 *Status:* ${state.status}`;
  
  // Create 3x3 grid
  const buttons = [];
  for (let r = 0; r < 3; r++) {
    const row = [];
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const cell = state.board[idx];
      const emoji = cell === 'X' ? EMOJI_TTT.X : cell === 'O' ? EMOJI_TTT.O : EMOJI_TTT.EMPTY;
      
      // If game is over, the board buttons lead to an inert callback so clicking them does nothing
      const callback = state.isGameOver ? 'game:tebak:inert' : `game:ttt:move:${idx}`;
      row.push(Markup.button.callback(emoji, callback));
    }
    buttons.push(row);
  }
  
  // Add menu and/or restart button
  if (state.isGameOver) {
    buttons.push([
      Markup.button.callback('🔄 Main Lagi', 'game:start:ttt'),
      Markup.button.callback('🔙 Kembali ke Menu', 'game:menu')
    ]);
  } else {
    if (state.isPlayerTurn) {
      buttons.push([
        Markup.button.callback('🤖 Biar AI Jalan', 'game:ttt:ai_move'),
        Markup.button.callback('🔙 Kembali ke Menu', 'game:menu')
      ]);
    } else {
      buttons.push([Markup.button.callback('🔙 Kembali ke Menu', 'game:menu')]);
    }
  }

  return { text, keyboard: Markup.inlineKeyboard(buttons) };
}

export function handleTicTacToeMove(chatId, index) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'ttt') {
    return getGameMenu();
  }

  const state = session.state;
  if (!state.isPlayerTurn || state.board[index] !== ' ') {
    return null; // Ignore click if not user turn or cell occupied
  }

  // Player move
  state.board[index] = state.playerSymbol;
  
  // Check win or draw
  if (checkTttWin(state.board, state.playerSymbol)) {
    const xpRes = addXp(chatId, 50);
    addPoints(chatId, 10);
    const getTicket = Math.random() < 0.20;
    if (getTicket) addTickets(chatId, 1);
    const ticketMsg = getTicket ? '\n🎟️ *Bonus:* Anda mendapatkan *1 Tiket Gacha*!' : '';
    const lvMsg = xpRes.leveledUp ? `\n\n🎉 *LEVEL UP!* Level naik ke *${xpRes.level}*! 🚀` : '';
    state.status = `🎉 *Selamat! Anda menang!* 🎉\n⭐ +50 XP\n🪙 +10 Poin${ticketMsg}${lvMsg}`;
    state.isPlayerTurn = false;
    state.isGameOver = true;
    return renderTicTacToe(state);
  }

  if (state.board.every(cell => cell !== ' ')) {
    const xpRes = addXp(chatId, 20);
    addPoints(chatId, 5);
    const lvMsg = xpRes.leveledUp ? `\n\n🎉 *LEVEL UP!* Level naik ke *${xpRes.level}*! 🚀` : '';
    state.status = `🤝 *Permainan Seri!* 🤝\n⭐ +20 XP\n🪙 +5 Poin${lvMsg}`;
    state.isPlayerTurn = false;
    state.isGameOver = true;
    return renderTicTacToe(state);
  }

  // Bot turn
  state.isPlayerTurn = false;
  state.status = '⏳ Bot sedang berpikir...';
  
  const render = renderTicTacToe(state);
  return {
    text: render.text,
    keyboard: render.keyboard,
    triggerBot: true
  };
}

export function makeBotTttMoveAndRender(chatId) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'ttt') return null;
  makeBotTttMove(session.state, chatId);
  return renderTicTacToe(session.state);
}

function makeBotTttMove(state, chatId) {
  const board = state.board;
  const botSym = state.botSymbol;
  const playSym = state.playerSymbol;

  // 1. Try to win in this turn
  for (let i = 0; i < 9; i++) {
    if (board[i] === ' ') {
      board[i] = botSym;
      if (checkTttWin(board, botSym)) {
        const xpRes = addXp(chatId, 10);
        addPoints(chatId, 2);
        const lvMsg = xpRes.leveledUp ? `\n\n🎉 *LEVEL UP!* Level naik ke *${xpRes.level}*! 🚀` : '';
        state.status = `😢 *Bot Menang!* Coba lagi nanti.\n⭐ +10 XP\n🪙 +2 Poin${lvMsg}`;
        state.isPlayerTurn = false;
        state.isGameOver = true;
        return;
      }
      board[i] = ' '; // backtrack
    }
  }

  // 2. Block player from winning
  for (let i = 0; i < 9; i++) {
    if (board[i] === ' ') {
      board[i] = playSym;
      if (checkTttWin(board, playSym)) {
        board[i] = botSym;
        state.isPlayerTurn = true;
        state.status = 'Giliran Anda! Klik salah satu kotak ➖.';
        return;
      }
      board[i] = ' '; // backtrack
    }
  }

  // 3. Take center if open
  if (board[4] === ' ') {
    board[4] = botSym;
    state.isPlayerTurn = true;
    state.status = 'Giliran Anda! Klik salah satu kotak ➖.';
    return;
  }

  // 4. Take opposite corner if player took corner
  const corners = [0, 2, 6, 8];
  const openCorners = corners.filter(c => board[c] === ' ');
  if (openCorners.length > 0) {
    const randomCorner = openCorners[Math.floor(Math.random() * openCorners.length)];
    board[randomCorner] = botSym;
    state.isPlayerTurn = true;
    state.status = 'Giliran Anda! Klik salah satu kotak ➖.';
    return;
  }

  // 5. Take any empty cell
  const emptyCells = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] === ' ') emptyCells.push(i);
  }

  if (emptyCells.length > 0) {
    const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    board[randomCell] = botSym;

    // Check if bot won with this random move
    if (checkTttWin(board, botSym)) {
      const xpRes = addXp(chatId, 10);
      addPoints(chatId, 2);
      const lvMsg = xpRes.leveledUp ? `\n\n🎉 *LEVEL UP!* Level naik ke *${xpRes.level}*! 🚀` : '';
      state.status = `😢 *Bot Menang!* Coba lagi nanti.\n⭐ +10 XP\n🪙 +2 Poin${lvMsg}`;
      state.isPlayerTurn = false;
      state.isGameOver = true;
      return;
    }
  }

  // Check draw after bot move
  if (board.every(cell => cell !== ' ')) {
    const xpRes = addXp(chatId, 20);
    addPoints(chatId, 5);
    const lvMsg = xpRes.leveledUp ? `\n\n🎉 *LEVEL UP!* Level naik ke *${xpRes.level}*! 🚀` : '';
    state.status = `🤝 *Permainan Seri!* 🤝\n⭐ +20 XP\n🪙 +5 Poin${lvMsg}`;
    state.isPlayerTurn = false;
    state.isGameOver = true;
  } else {
    state.isPlayerTurn = true;
    state.status = 'Giliran Anda! Klik salah satu kotak ➖.';
  }
}

function checkTttWin(board, sym) {
  const winLines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6]             // diagonals
  ];
  return winLines.some(line => line.every(idx => board[idx] === sym));
}

function makePlayerTttMove(state, chatId) {
  const board = state.board;
  const playSym = state.playerSymbol;
  const botSym = state.botSymbol;

  // 1. Try to win in this turn
  for (let i = 0; i < 9; i++) {
    if (board[i] === ' ') {
      board[i] = playSym;
      if (checkTttWin(board, playSym)) {
        const xpRes = addXp(chatId, 50);
        addPoints(chatId, 10);
        const getTicket = Math.random() < 0.20;
        if (getTicket) addTickets(chatId, 1);
        const ticketMsg = getTicket ? '\n🎟️ *Bonus:* Anda mendapatkan *1 Tiket Gacha*!' : '';
        const lvMsg = xpRes.leveledUp ? `\n\n🎉 *LEVEL UP!* Level naik ke *${xpRes.level}*! 🚀` : '';
        state.status = `🎉 *AI memenangkan game untuk Anda!* 🎉\n⭐ +50 XP\n🪙 +10 Poin${ticketMsg}${lvMsg}`;
        state.isPlayerTurn = false;
        state.isGameOver = true;
        return;
      }
      board[i] = ' '; // backtrack
    }
  }

  // 2. Block bot from winning
  for (let i = 0; i < 9; i++) {
    if (board[i] === ' ') {
      board[i] = botSym;
      if (checkTttWin(board, botSym)) {
        board[i] = playSym;
        state.isPlayerTurn = false;
        state.status = '⏳ Giliran Bot AI berpikir...';
        return;
      }
      board[i] = ' '; // backtrack
    }
  }

  // 3. Take center if open
  if (board[4] === ' ') {
    board[4] = playSym;
    state.isPlayerTurn = false;
    state.status = '⏳ Giliran Bot AI berpikir...';
    return;
  }

  // 4. Take open corner
  const corners = [0, 2, 6, 8];
  const openCorners = corners.filter(c => board[c] === ' ');
  if (openCorners.length > 0) {
    const randomCorner = openCorners[Math.floor(Math.random() * openCorners.length)];
    board[randomCorner] = playSym;
    state.isPlayerTurn = false;
    state.status = '⏳ Giliran Bot AI berpikir...';
    return;
  }

  // 5. Take any empty cell
  const emptyCells = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] === ' ') emptyCells.push(i);
  }

  if (emptyCells.length > 0) {
    const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    board[randomCell] = playSym;
  }

  // Check draw
  if (board.every(cell => cell !== ' ')) {
    const xpRes = addXp(chatId, 20);
    addPoints(chatId, 5);
    const lvMsg = xpRes.leveledUp ? `\n\n🎉 *LEVEL UP!* Level naik ke *${xpRes.level}*! 🚀` : '';
    state.status = `🤝 *Permainan Seri!* 🤝\n⭐ +20 XP\n🪙 +5 Poin${lvMsg}`;
    state.isPlayerTurn = false;
    state.isGameOver = true;
  } else {
    state.isPlayerTurn = false;
    state.status = '⏳ Giliran Bot AI berpikir...';
  }
}

export function handleTttAiMove(chatId) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'ttt') {
    return getGameMenu();
  }

  const state = session.state;
  if (state.isGameOver || !state.isPlayerTurn) {
    return null;
  }

  makePlayerTttMove(state, chatId);

  if (state.isGameOver) {
    return renderTicTacToe(state);
  }

  return {
    text: renderTicTacToe(state).text,
    keyboard: renderTicTacToe(state).keyboard,
    triggerBot: true
  };
}


// --- SUIT (ROCK PAPER SCISSORS) LOGIC ---
export function startSuit(chatId) {
  const session = {
    gameType: 'suit',
    state: {
      playerScore: 0,
      botScore: 0,
      drawScore: 0,
      history: [], // Stores last 5 rounds: { player: string, bot: string, outcome: 'win'|'lose'|'draw' }
      lastResult: 'Ketuk salah satu pilihan di bawah untuk bermain!'
    }
  };
  gameSessions.set(chatId, session);
  return renderSuit(session.state);
}

function renderSuit(state) {
  const text = `🎮 *Suit (Batu Gunting Kertas)* 🎮\n\n🏆 *Papan Skor:*\n👤 Anda: ${state.playerScore} kemenangan\n🤖 Bot: ${state.botScore} kemenangan\n🤝 Seri: ${state.drawScore}\n\n📢 *Hasil Terakhir:*\n${state.lastResult}`;
  
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('✊ Batu', 'game:suit:play:batu'),
      Markup.button.callback('✌️ Gunting', 'game:suit:play:gunting'),
      Markup.button.callback('🖐️ Kertas', 'game:suit:play:kertas')
    ],
    [
      Markup.button.callback('🔄 Reset Skor', 'game:suit:reset'),
      Markup.button.callback('🔙 Kembali ke Menu', 'game:menu')
    ]
  ]);

  return { text, keyboard };
}

export async function handleSuitPlay(chatId, playerChoice) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'suit') {
    return getGameMenu();
  }

  const state = session.state;
  let botChoice = 'batu';
  let comment = 'Biar kekuatan batuku yang menghancurkanmu!';

  if (groq) {
    try {
      const historyJson = JSON.stringify(state.history || []);
      const prompt = `You are a highly intelligent and slightly sarcastic competitor playing Rock-Paper-Scissors (Batu, Gunting, Kertas) against a human.
Your goal is to beat the user. Analyze the user's previous play history to predict what they will choose next and choose the option that will beat them.
Remember:
- 'batu' beats 'gunting'
- 'gunting' beats 'kertas'
- 'kertas' beats 'batu'

Play history of previous rounds:
${historyJson}

Respond ONLY with a valid JSON matching this schema:
{
  "botChoice": "batu | gunting | kertas (your move)",
  "comment": "a very short, witty trash-talk comment in Indonesian (max 12 words) reacting to the game or predicting your win"
}`;

      const response = await groq.chat.completions.create({
        model: config.groqModel || 'qwen/qwen3-32b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        response_format: { type: 'json_object' }
      }, { chatId });

      const res = JSON.parse(response.choices[0].message.content.trim());
      if (res.botChoice && ['batu', 'gunting', 'kertas'].includes(res.botChoice.toLowerCase())) {
        botChoice = res.botChoice.toLowerCase();
      }
      if (res.comment) {
        comment = res.comment;
      }
    } catch (err) {
      console.warn('Groq failed for Suit, falling back to random choice:', err.message);
      const choices = ['batu', 'gunting', 'kertas'];
      botChoice = choices[Math.floor(Math.random() * choices.length)];
      comment = 'Pilihanku kali ini tidak terduga!';
    }
  } else {
    const choices = ['batu', 'gunting', 'kertas'];
    botChoice = choices[Math.floor(Math.random() * choices.length)];
  }
  
  const emojiMap = {
    batu: '✊ Batu',
    gunting: '✌️ Gunting',
    kertas: '🖐️ Kertas'
  };

  let outcome = '';
  let roundOutcome = 'draw';
  if (playerChoice === botChoice) {
    state.drawScore++;
    outcome = `🤝 *Seri!* Kedua pihak memilih ${emojiMap[playerChoice]}.`;
    roundOutcome = 'draw';
  } else if (
    (playerChoice === 'batu' && botChoice === 'gunting') ||
    (playerChoice === 'gunting' && botChoice === 'kertas') ||
    (playerChoice === 'kertas' && botChoice === 'batu')
  ) {
    state.playerScore++;
    const xpRes = addXp(chatId, 15);
    addPoints(chatId, 3);
    const getTicket = Math.random() < 0.05;
    if (getTicket) addTickets(chatId, 1);
    const ticketMsg = getTicket ? ' + 1 Tiket!' : '';
    const lvMsg = xpRes.leveledUp ? `\n\n🎉 *LEVEL UP!* Level naik ke *${xpRes.level}*! 🚀` : ` (+15 XP, +3 Poin${ticketMsg})`;
    outcome = `🎉 *Anda Menang!* Pilihan Anda ${emojiMap[playerChoice]} mengalahkan ${emojiMap[botChoice]} milik Bot.${lvMsg}`;
    roundOutcome = 'win';
  } else {
    state.botScore++;
    outcome = `😢 *Anda Kalah!* Pilihan Bot ${emojiMap[botChoice]} mengalahkan ${emojiMap[playerChoice]} milik Anda.`;
    roundOutcome = 'lose';
  }

  // Push to history
  if (!state.history) state.history = [];
  state.history.push({ player: playerChoice, bot: botChoice, outcome: roundOutcome });
  if (state.history.length > 5) {
    state.history.shift();
  }

  state.lastResult = `${outcome}\n\n🤖 *AI:* "${comment}"`;
  return renderSuit(state);
}

export function handleSuitReset(chatId) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'suit') {
    return getGameMenu();
  }

  const state = session.state;
  state.playerScore = 0;
  state.botScore = 0;
  state.drawScore = 0;
  state.history = [];
  state.lastResult = 'Skor dan riwayat permainan telah di-reset! Pilih lagi untuk memulai.';
  return renderSuit(state);
}


// --- TEBAK KATA (WORD GUESS) LOGIC ---
export async function startTebakKata(chatId) {
  let word = '';
  let hint = '';

  if (groq) {
    try {
      const prompt = `You are a game host. Generate a random Indonesian word for a word guessing game (like Hangman).
The word should be a common Indonesian noun, adjective, or verb.
Requirements:
- Word length: between 4 to 12 letters.
- Only A-Z letters, no spaces, no special characters, must be in UPPERCASE.
- Provide a clear, interesting hint/clue in Indonesian describing the word.

Respond ONLY with a valid JSON matching this schema:
{
  "word": "UPPERCASE_WORD",
  "hint": "clue in Indonesian explaining the word without directly using the word"
}`;

      const response = await groq.chat.completions.create({
        model: config.groqModel || 'qwen/qwen3-32b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        response_format: { type: 'json_object' }
      }, { chatId });

      const res = JSON.parse(response.choices[0].message.content.trim());
      if (res.word) {
        const cleanWord = res.word.replace(/\s+/g, '').toUpperCase();
        if (cleanWord && /^[A-Z]{3,15}$/.test(cleanWord)) {
          word = cleanWord;
          hint = res.hint || 'Tidak ada petunjuk.';
        }
      }
    } catch (err) {
      console.warn('Groq failed for Tebak Kata, falling back to static pool:', err.message);
    }
  }

  // Fallback to static pool if Groq fails or is not available
  if (!word) {
    const randomItem = TEBAK_KATA_WORDS[Math.floor(Math.random() * TEBAK_KATA_WORDS.length)];
    word = randomItem.word;
    hint = randomItem.hint;
  }

  const session = {
    gameType: 'tebak',
    state: {
      word,
      hint,
      guessedLetters: [],
      lives: 6,
      message: 'Tebak kata di bawah! Ketuk tombol huruf untuk menebak.',
      showHint: false
    }
  };
  gameSessions.set(chatId, session);
  return renderTebakKata(session.state);
}

function renderTebakKata(state) {
  // Build displayed word representation, e.g. "J _ V _ S C R I P T"
  let displayWord = '';
  let won = true;
  for (const char of state.word) {
    if (state.guessedLetters.includes(char)) {
      displayWord += `${char} `;
    } else {
      displayWord += `_ `;
      won = false;
    }
  }
  displayWord = displayWord.trim();

  // Create lives representations in hearts
  const heartEmoji = '❤️'.repeat(state.lives) + '🖤'.repeat(6 - state.lives);

  let text = `📝 *TEBAK KATA GAME* 📝\n` +
             `━━━━━━━━━━━━━━━━━━━━\n` +
             `📌 *Kata:* \`${displayWord}\`\n` +
             `💚 *Nyawa:* ${heartEmoji}\n` +
             `━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (state.showHint) {
    text += `💡 *Petunjuk (Clue AI):* _"${state.hint}"_\n\n`;
  } else {
    text += `💡 *Petunjuk:* ||Ketuk tombol di bawah untuk melihat petunjuk||\n\n`;
  }

  text += `📢 ${state.message}`;

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const keyboardButtons = [];
  
  // Check end game
  const isGameOver = state.lives <= 0;
  
  if (won) {
    const xpMsg = state.xpMsg || '';
    text = `🎉 *Hebat! Anda Menang!* 🎉\n` +
           `━━━━━━━━━━━━━━━━━━━━\n` +
           `📌 *Kata:* \`${state.word}\`\n` +
           `━━━━━━━━━━━━━━━━━━━━\n\n` +
           `${xpMsg}\nSemua huruf berhasil ditebak! Ingin bermain lagi?`;
    keyboardButtons.push([
      Markup.button.callback('🔄 Main Lagi', 'game:start:tebak'),
      Markup.button.callback('🔙 Menu Game', 'game:menu')
    ]);
  } else if (isGameOver) {
    text = `😢 *Game Over! Anda Kalah.* 😢\n` +
           `━━━━━━━━━━━━━━━━━━━━\n` +
           `📌 *Kata yang benar:* \`${state.word}\`\n` +
           `━━━━━━━━━━━━━━━━━━━━\n\n` +
           `Nyawa Anda telah habis. Mau coba lagi?`;
    keyboardButtons.push([
      Markup.button.callback('🔄 Coba Lagi', 'game:start:tebak'),
      Markup.button.callback('🔙 Menu Game', 'game:menu')
    ]);
  } else {
    // Generate virtual keyboard alphabet buttons: 6 letters per row
    let row = [];
    for (let i = 0; i < alphabet.length; i++) {
      const char = alphabet[i];
      const isGuessed = state.guessedLetters.includes(char);
      
      let label = char;
      let callback = `game:tebak:guess:${char}`;
      
      if (isGuessed) {
        // Replace with cross/tick if guessed or just space
        const isCorrect = state.word.includes(char);
        label = isCorrect ? '✅' : '❌';
        callback = 'game:tebak:inert'; // inert callback
      }
      
      row.push(Markup.button.callback(label, callback));
      
      if (row.length === 6 || i === alphabet.length - 1) {
        keyboardButtons.push(row);
        row = [];
      }
    }

    // Add Hint and Quit buttons
    keyboardButtons.push([
      Markup.button.callback('💡 Tampilkan Clue', 'game:tebak:hint'),
      Markup.button.callback('🔙 Keluar ke Menu', 'game:menu')
    ]);
  }

  return { text, keyboard: Markup.inlineKeyboard(keyboardButtons) };
}

export function handleTebakLetter(chatId, letter) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'tebak') {
    return getGameMenu();
  }

  const state = session.state;
  if (state.lives <= 0 || state.guessedLetters.includes(letter)) {
    return null; // Game already over or letter already guessed
  }

  state.guessedLetters.push(letter);
  
  let won = true;
  for (const char of state.word) {
    if (!state.guessedLetters.includes(char)) {
      won = false;
      break;
    }
  }

  if (won) {
    const xpRes = addXp(chatId, 40);
    addPoints(chatId, 8);
    const getTicket = Math.random() < 0.15;
    if (getTicket) addTickets(chatId, 1);
    const ticketMsg = getTicket ? ' + 1 Tiket!' : '';
    state.xpMsg = xpRes.leveledUp ? `\n\n🎉 *LEVEL UP!* Level naik ke *${xpRes.level}*! 🚀` : ` (+40 XP, +8 Poin${ticketMsg})`;
    state.message = `Semua huruf berhasil ditebak!`;
  } else if (state.word.includes(letter)) {
    state.message = `Tebakan tepat! Huruf *${letter}* ada di dalam kata.`;
  } else {
    state.lives--;
    state.message = `Ups! Huruf *${letter}* tidak ada. Nyawa berkurang.`;
  }

  return renderTebakKata(state);
}

export function handleTebakHint(chatId) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'tebak') {
    return getGameMenu();
  }

  const state = session.state;
  state.showHint = true;
  state.message = 'Petunjuk kata telah ditampilkan di atas!';
  return renderTebakKata(state);
}


// --- MATH QUIZ LOGIC ---
export function startMathQuiz(chatId) {
  const session = {
    gameType: 'math',
    state: {
      streak: 0,
      question: '',
      answer: 0,
      options: [],
      message: 'Mulai Kuis Matematika! Jawab pertanyaan pertama:'
    }
  };
  generateMathQuestion(session.state);
  gameSessions.set(chatId, session);
  return renderMathQuiz(session.state);
}

function generateMathQuestion(state) {
  const operators = ['+', '-', '*'];
  const operator = operators[Math.floor(Math.random() * operators.length)];
  let num1 = 0;
  let num2 = 0;
  let answer = 0;

  if (operator === '+') {
    num1 = Math.floor(Math.random() * 90) + 10; // 10 - 99
    num2 = Math.floor(Math.random() * 90) + 10;
    answer = num1 + num2;
  } else if (operator === '-') {
    num1 = Math.floor(Math.random() * 90) + 10;
    num2 = Math.floor(Math.random() * (num1 - 5)) + 5; // ensure positive answer
    answer = num1 - num2;
  } else { // '*'
    num1 = Math.floor(Math.random() * 11) + 2; // 2 - 12
    num2 = Math.floor(Math.random() * 11) + 2; // 2 - 12
    answer = num1 * num2;
  }

  state.question = `${num1} ${operator} ${num2} = ?`;
  state.answer = answer;

  // Generate 4 distinct options
  const optionsSet = new Set([answer]);
  while (optionsSet.size < 4) {
    const offset = Math.floor(Math.random() * 15) - 7; // -7 to +7
    const fakeAnswer = answer + offset;
    if (fakeAnswer >= 0 && fakeAnswer !== answer) {
      optionsSet.add(fakeAnswer);
    }
  }

  // Shuffle options
  state.options = Array.from(optionsSet).sort(() => Math.random() - 0.5);
}

function renderMathQuiz(state, isQuizOver = false) {
  let text = `🧮 *Kuis Matematika* 🧮\n\n🔥 *Skor Streak Saat Ini:* \`${state.streak}\`\n\n📌 *Pertanyaan:* \`${state.question}\`\n\n📢 ${state.message}`;
  const buttons = [];

  if (isQuizOver) {
    text = `😢 *Jawaban Salah! Game Over.* 😢\n\n🔥 *Skor Streak Terakhir Anda:* \`${state.streak}\`\n\nJawaban yang benar adalah: \`${state.answer}\`.\nIngin mencoba lagi?`;
    buttons.push([
      Markup.button.callback('🔄 Coba Lagi', 'game:start:math'),
      Markup.button.callback('🔙 Menu Game', 'game:menu')
    ]);
  } else {
    // Generate answers layout: 2 columns of 2 buttons
    buttons.push([
      Markup.button.callback(`${state.options[0]}`, `game:math:ans:${state.options[0]}`),
      Markup.button.callback(`${state.options[1]}`, `game:math:ans:${state.options[1]}`)
    ]);
    buttons.push([
      Markup.button.callback(`${state.options[2]}`, `game:math:ans:${state.options[2]}`),
      Markup.button.callback(`${state.options[3]}`, `game:math:ans:${state.options[3]}`)
    ]);
    buttons.push([
      Markup.button.callback('🔙 Keluar ke Menu', 'game:menu')
    ]);
  }

  return { text, keyboard: Markup.inlineKeyboard(buttons) };
}

export function handleMathAnswer(chatId, selectedAnswer) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'math') {
    return getGameMenu();
  }

  const state = session.state;
  const isCorrect = parseInt(selectedAnswer) === state.answer;

  if (isCorrect) {
    state.streak++;
    const xpRes = addXp(chatId, 10);
    addPoints(chatId, 2);
    const lvMsg = xpRes.leveledUp ? `\n\n🎉 *LEVEL UP!* Level naik ke *${xpRes.level}*! 🚀` : ' (+10 XP, +2 Poin)';
    state.message = `✅ *Benar!* Keren, teruskan!${lvMsg}`;
    generateMathQuestion(state);
    return renderMathQuiz(state, false);
  } else {
    // Game Over
    const lastState = { ...state }; // save score to render quiz over screen
    gameSessions.delete(chatId);
    return renderMathQuiz(lastState, true);
  }
}

// --- TEBAK HERO FF QUIZ LOGIC ---
const TEBAK_FF_QUESTIONS = [
  {
    question: "Siapakah karakter DJ terkenal yang memiliki skill aktif memulihkan HP dan meningkatkan kecepatan gerak rekan setim?",
    answer: "ALOK",
    options: ["ALOK", "CHRONO", "KLA", "JOTA"]
  },
  {
    question: "Karakter kolaborasi dengan CR7 yang memiliki skill menciptakan pelindung kubah (Time Turner).",
    answer: "CHRONO",
    options: ["CHRONO", "ALOK", "WUKONG", "HAYATO"]
  },
  {
    question: "Karakter petarung Muay Thai dengan skill meningkatkan damage pukulan tangan kosong hingga 400%.",
    answer: "KLA",
    options: ["KLA", "KELLY", "MAXIM", "ANDREW"]
  },
  {
    question: "Karakter hacker jenius yang dapat menandai musuh yang ditembak selama beberapa detik.",
    answer: "MOCO",
    options: ["MOCO", "LAURA", "KELLY", "MISA"]
  },
  {
    question: "Karakter yang memiliki kemampuan berubah wujud menjadi semak-semak berjalan (Camouflage).",
    answer: "WUKONG",
    options: ["WUKONG", "ALOK", "CHRONO", "JOTA"]
  },
  {
    question: "Karakter stuntman legendaris asal Indonesia yang memulihkan HP saat menembak musuh dengan SMG/Shotgun.",
    answer: "JOTA",
    options: ["JOTA", "HAYATO", "ANDREW", "MAXIM"]
  },
  {
    question: "Karakter polisi veteran dengan skill mengurangi tingkat kerapuhan/kerusakan Vest (Armor Specialist).",
    answer: "ANDREW",
    options: ["ANDREW", "MIGUEL", "KLA", "FORD"]
  },
  {
    question: "Karakter gadis sekolah pelari cepat yang memiliki skill pasif mempercepat lari (Dash).",
    answer: "KELLY",
    options: ["KELLY", "MOCO", "CAROLINE", "NOTORA"]
  },
  {
    question: "Karakter samurai legendaris dengan skill meningkatkan penetrasi armor musuh seiring berkurangnya HP.",
    answer: "HAYATO",
    options: ["HAYATO", "KLA", "JOTA", "WUKONG"]
  },
  {
    question: "Karakter yang doyan makan dengan skill mempercepat konsumsi jamur dan medkit.",
    answer: "MAXIM",
    options: ["MAXIM", "FORD", "JOSEPH", "ANTONIO"]
  },
  {
    question: "Karakter sniper wanita yang memiliki skill meningkatkan akurasi menembak saat menggunakan Scope.",
    answer: "LAURA",
    options: ["LAURA", "MOCO", "CLU", "PALOMA"]
  },
  {
    question: "Karakter perawat yang memiliki skill meningkatkan efek penyembuhan saat menghidupkan rekan setim (Revive).",
    answer: "OLIVIA",
    options: ["OLIVIA", "KAPELLA", "STEFFIE", "SHANI"]
  }
];

export function startTebakFf(chatId) {
  const session = {
    gameType: 'tebakff',
    state: {
      streak: 0,
      question: '',
      answer: '',
      options: [],
      message: 'Mulai Tebak Hero Free Fire! Jawab pertanyaan pertama:'
    }
  };
  generateTebakFfQuestion(session.state);
  gameSessions.set(chatId, session);
  return renderTebakFf(session.state);
}

function generateTebakFfQuestion(state) {
  const item = TEBAK_FF_QUESTIONS[Math.floor(Math.random() * TEBAK_FF_QUESTIONS.length)];
  state.question = item.question;
  state.answer = item.answer;
  state.options = [...item.options].sort(() => Math.random() - 0.5);
}

function renderTebakFf(state, isQuizOver = false) {
  let text = `🎯 *Tebak Hero Free Fire* 🎯\n\n🔥 *Skor Streak Saat Ini:* \`${state.streak}\`\n\n📌 *Pertanyaan:* \n"${state.question}"\n\n📢 ${state.message}`;
  const buttons = [];

  if (isQuizOver) {
    text = `😢 *Jawaban Salah! Game Over.* 😢\n\n🔥 *Skor Streak Terakhir Anda:* \`${state.streak}\`\n\nJawaban yang benar adalah: *${state.answer}*.\nIngin mencoba lagi?`;
    buttons.push([
      Markup.button.callback('🔄 Coba Lagi', 'game:start:tebakff'),
      Markup.button.callback('🔙 Menu Game', 'game:menu')
    ]);
  } else {
    buttons.push([
      Markup.button.callback(`${state.options[0]}`, `game:ff:ans:${state.options[0]}`),
      Markup.button.callback(`${state.options[1]}`, `game:ff:ans:${state.options[1]}`)
    ]);
    buttons.push([
      Markup.button.callback(`${state.options[2]}`, `game:ff:ans:${state.options[2]}`),
      Markup.button.callback(`${state.options[3]}`, `game:ff:ans:${state.options[3]}`)
    ]);
    buttons.push([
      Markup.button.callback('🔙 Keluar ke Menu', 'game:menu')
    ]);
  }

  return { text, keyboard: Markup.inlineKeyboard(buttons) };
}

export function handleTebakFfAnswer(chatId, selectedAnswer) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'tebakff') {
    return getGameMenu();
  }

  const state = session.state;
  const isCorrect = selectedAnswer.toUpperCase() === state.answer.toUpperCase();

  if (isCorrect) {
    state.streak++;
    const xpRes = addXp(chatId, 10);
    addPoints(chatId, 2);
    const lvMsg = xpRes.leveledUp ? `\n\n🎉 *LEVEL UP!* Level naik ke *${xpRes.level}*! 🚀` : ' (+10 XP, +2 Poin)';
    state.message = `✅ *Benar!* Hebat sekali, teruskan streak Anda!${lvMsg}`;
    generateTebakFfQuestion(state);
    return renderTebakFf(state, false);
  } else {
    const lastState = { ...state };
    gameSessions.delete(chatId);
    return renderTebakFf(lastState, true);
  }
}

// --- TEBAK GAMBAR AI LOGIC ---
const TEBAK_GAMBAR_POOL = [
  { prompt: 'a cute cat wearing a spacesuit in space, cartoon 3d style', promptIndo: 'kucing lucu memakai pakaian luar angkasa di luar angkasa, gaya kartun 3d', answer: 'Kucing Astronot', options: ['Kucing Astronot', 'Kucing Koki', 'Tikus Astronaut', 'Anjing Terbang'] },
  { prompt: 'a friendly dinosaur eating a giant pink glazed donut, 3d render cute', promptIndo: 'dinosaurus ramah sedang makan donat merah muda besar, render 3d lucu', answer: 'Dino Makan Donat', options: ['Dino Makan Donat', 'Dino Main Bola', 'Naga Bakar Roti', 'Monster Makan Es Krim'] },
  { prompt: 'a cute robot barista making latte art coffee cup, Pixar style', promptIndo: 'robot barista lucu membuat seni latte di cangkir kopi, gaya Pixar', answer: 'Robot Pembuat Kopi', options: ['Robot Pembuat Kopi', 'Robot Pembersih', 'Kucing Minum Kopi', 'Tukang Kopi Ajaib'] },
  { prompt: 'a dolphin flying through clouds in a sunset sky, dreamlike fantasy', promptIndo: 'lumba-lumba terbang menembus awan di langit matahari terbenam, fantasi indah', answer: 'Lumba-lumba Terbang', options: ['Lumba-lumba Terbang', 'Hiu di Awan', 'Burung Menyelam', 'Kuda Terbang'] },
  { prompt: 'a cute hamster wearing tiny glasses reading a book, cozy library', promptIndo: 'hamster lucu memakai kacamata kecil sedang membaca buku, perpustakaan yang nyaman', answer: 'Hamster Membaca Buku', options: ['Hamster Membaca Buku', 'Kelinci Menulis', 'Tikus Makan Buku', 'Hamster Tidur'] },
  { prompt: 'a majestic lion wearing a golden crown sitting on a throne, digital art', promptIndo: 'singa megah memakai mahkota emas duduk di singgasana, seni digital', answer: 'Singa Memakai Mahkota', options: ['Singa Memakai Mahkota', 'Harimau Berburu', 'Kucing Jadi Raja', 'Serigala Bermahkota'] },
  { prompt: 'a cute red panda eating boba milk tea, cartoon illustration', promptIndo: 'panda merah lucu sedang minum boba milk tea, ilustrasi kartun', answer: 'Panda Merah Minum Boba', options: ['Panda Merah Minum Boba', 'Kucing Minum Boba', 'Beruang Makan Es', 'Rakun Makan Boba'] },
  { prompt: 'a magical turtle with a garden growing on its shell, fantasy art', promptIndo: 'kura-kura ajaib dengan taman tumbuh di atas tempurungnya, seni fantasi', answer: 'Kura-kura Kebun', options: ['Kura-kura Kebun', 'Siput Raksasa', 'Kura-kura Berenang', 'Katak di Bunga'] },
  { prompt: 'a funny monkey wearing a business suit holding a suitcase, office background', promptIndo: 'monyet lucu memakai jas kerja memegang koper, latar belakang kantor', answer: 'Monyet Berjas Kantoran', options: ['Monyet Berjas Kantoran', 'Simpanse Main Laptop', 'Monyet Naik Sepeda', 'Bos Orangutan'] },
  { prompt: 'a cute astronaut koala holding the moon like a balloon, fantasy space', promptIndo: 'koala astronot lucu memegang bulan seperti balon, luar angkasa fantasi', answer: 'Koala Memegang Bulan', options: ['Koala Memegang Bulan', 'Panda di Bulan', 'Koala Makan Daun', 'Kucing Naik Bulan'] }
];

export function startTebakGambar(chatId) {
  const item = TEBAK_GAMBAR_POOL[Math.floor(Math.random() * TEBAK_GAMBAR_POOL.length)];
  const session = {
    gameType: 'tebakgambar',
    state: {
      prompt: item.prompt,
      promptIndo: item.promptIndo,
      answer: item.answer,
      options: [...item.options].sort(() => Math.random() - 0.5),
      streak: 0,
      lives: 3,
      imageUrl: `https://gen.pollinations.ai/image/${encodeURIComponent(item.prompt)}?model=flux&nologo=true&width=512&height=512${config.pollinationsApiKey ? `&key=${config.pollinationsApiKey}` : ''}`,
      message: 'Tebak gambar di atas! Jawab pertanyaan pertama:',
      showHint: false
    }
  };
  gameSessions.set(chatId, session);
  return renderTebakGambar(session.state);
}

function generateTebakGambarQuestion(state) {
  const item = TEBAK_GAMBAR_POOL[Math.floor(Math.random() * TEBAK_GAMBAR_POOL.length)];
  state.prompt = item.prompt;
  state.promptIndo = item.promptIndo;
  state.answer = item.answer;
  state.options = [...item.options].sort(() => Math.random() - 0.5);
  state.imageUrl = `https://gen.pollinations.ai/image/${encodeURIComponent(item.prompt)}?model=flux&nologo=true&width=512&height=512${config.pollinationsApiKey ? `&key=${config.pollinationsApiKey}` : ''}`;
  state.showHint = false;
}

function getStreakTitle(streak) {
  if (streak >= 10) return '👑 Dewa AI';
  if (streak >= 8) return '🦅 Ahli Visual';
  if (streak >= 5) return '🕵️‍♂️ Detektif Gambar';
  if (streak >= 3) return '🐣 Menebak Santai';
  return '🥚 Pemula';
}

export function renderTebakGambar(state, isQuizOver = false) {
  const heartEmoji = '❤️'.repeat(state.lives) + '🖤'.repeat(3 - state.lives);
  const title = getStreakTitle(state.streak);

  let text = `🎨 *Tebak Gambar AI* 🎨\n\n` +
             `🏆 *Gelar:* \`${title}\`\n` +
             `🔥 *Streak Saat Ini:* \`${state.streak}\`\n` +
             `💚 *Nyawa:* ${heartEmoji}\n\n`;

  if (state.showHint) {
    text += `💡 *Petunjuk (Deskripsi Gambar):* _"${state.promptIndo}"_\n\n`;
  } else {
    text += `💡 *Petunjuk:* ||Ketuk tombol di bawah untuk melihat petunjuk||\n\n`;
  }
  text += `📢 ${state.message}`;
  const buttons = [];

  if (isQuizOver) {
    text = `😢 *Game Over! Nyawa Habis.* 😢\n\n🏆 *Gelar Terakhir:* \`${title}\`\n🔥 *Streak Terakhir:* \`${state.streak}\`\n\nJawaban yang benar adalah: *${state.answer}*.\nIngin mencoba lagi?`;
    buttons.push([
      Markup.button.callback('🔄 Coba Lagi', 'game:start:tebakgambar'),
      Markup.button.callback('🔙 Menu Game', 'game:menu')
    ]);
  } else {
    buttons.push([
      Markup.button.callback(`${state.options[0]}`, `game:tg:ans:${state.options[0]}`),
      Markup.button.callback(`${state.options[1]}`, `game:tg:ans:${state.options[1]}`)
    ]);
    buttons.push([
      Markup.button.callback(`${state.options[2]}`, `game:tg:ans:${state.options[2]}`),
      Markup.button.callback(`${state.options[3]}`, `game:tg:ans:${state.options[3]}`)
    ]);
    buttons.push([
      Markup.button.callback('💡 Tampilkan Clue', 'game:tg:hint'),
      Markup.button.callback('🔙 Keluar ke Menu', 'game:menu')
    ]);
  }

  return { text, keyboard: Markup.inlineKeyboard(buttons), imageUrl: state.imageUrl };
}

export function handleTebakGambarAnswer(chatId, selectedAnswer) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'tebakgambar') {
    return getGameMenu();
  }

  const state = session.state;
  const isCorrect = selectedAnswer.toUpperCase() === state.answer.toUpperCase();

  if (isCorrect) {
    state.streak++;
    const xpRes = addXp(chatId, 50);
    addPoints(chatId, 10);
    const getTicket = Math.random() < 0.20;
    if (getTicket) addTickets(chatId, 1);
    const ticketMsg = getTicket ? ' + 1 Tiket!' : '';
    const lvMsg = xpRes.leveledUp ? `\n\n🎉 *LEVEL UP!* Level naik ke *${xpRes.level}*! 🚀` : ` (+50 XP, +10 Poin${ticketMsg})`;
    
    let streakBonusMsg = '';
    if (state.streak === 3) streakBonusMsg = '\n🔥 *Streak 3!* Gelar naik menjadi *Menebak Santai*! 🐣';
    else if (state.streak === 5) streakBonusMsg = '\n🔥 *Streak 5!* Keren! Gelar naik menjadi *Detektif Gambar*! 🕵️‍♂️';
    else if (state.streak === 8) streakBonusMsg = '\n🔥 *Streak 8!* Luar biasa! Gelar naik menjadi *Ahli Visual*! 🦅';
    else if (state.streak === 10) streakBonusMsg = '\n👑 *Streak 10!* SANG DEWA TELAH BANGKIT! Gelar naik menjadi *Dewa AI*! 👑';

    state.message = `✅ *Benar!* Hebat sekali, teruskan streak Anda!${streakBonusMsg}${lvMsg}`;
    generateTebakGambarQuestion(state);
    return renderTebakGambar(state, false);
  } else {
    state.lives--;
    if (state.lives <= 0) {
      const lastState = { ...state };
      gameSessions.delete(chatId);
      return renderTebakGambar(lastState, true);
    } else {
      state.streak = 0; // reset streak on error
      state.message = `❌ *Salah!* Jawaban yang benar bukan *${selectedAnswer}*.\nNyawa berkurang! Streak di-reset. Coba gambar berikutnya!`;
      generateTebakGambarQuestion(state);
      return renderTebakGambar(state, false);
    }
  }
}

export function handleTebakGambarHint(chatId) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'tebakgambar') {
    return getGameMenu();
  }

  const state = session.state;
  state.showHint = true;
  state.message = 'Petunjuk berupa deskripsi gambar (Prompt AI) telah ditampilkan!';
  return renderTebakGambar(state);
}

// --- ARCADE GACHA & SHOP SYSTEM ---
export function getArcadeMenu(chatId) {
  const points = getUserPoints(chatId);
  const tickets = getUserTickets(chatId);
  const level = getUserLevel(chatId);
  const xp = getUserXp(chatId);
  const xpNeeded = level * 100;

  const text = `🎡 *Gacha & Toko Arcade AI Agent* 🎡\n\n` +
               `Mainkan game, kumpulkan koin poin, beli tiket gacha, dan tukarkan poin Anda dengan hadiah menarik!\n\n` +
               `👤 *Profil Pemain:*\n` +
               `⭐ Level: *${level}* (XP: ${xp}/${xpNeeded})\n` +
               `🪙 Koin Poin: *${points} Poin*\n` +
               `🎟️ Tiket Gacha: *${tickets} Tiket*\n\n` +
               `Silakan pilih opsi menu di bawah ini:`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🎡 Tarik Gacha (1 🎟️)', 'game:arcade:draw_gacha'),
      Markup.button.callback('🎟️ Beli 1 Tiket (50 🪙)', 'game:arcade:buy_ticket')
    ],
    [
      Markup.button.callback('💎 Toko Penukaran Limit', 'game:arcade:shop_menu')
    ],
    [
      Markup.button.callback('🔙 Kembali ke Menu Game', 'game:menu')
    ]
  ]);

  return { text, keyboard };
}

export function getArcadeShopMenu(chatId) {
  const points = getUserPoints(chatId);
  const text = `💎 *Toko Penukaran Limit Arcade* 💎\n\n` +
               `Tukarkan Koin Poin Anda menjadi Limit Karakter Permanent (extraQuota).\n\n` +
               `🪙 Sisa Koin Poin Anda: *${points} Poin*\n\n` +
               `*Paket Penukaran Tersedia:*\n` +
               `• 🪙 *50 Poin* ➔ 🔋 *+1.000 Karakter*\n` +
               `• 🪙 *200 Poin* ➔ 🔋 *+5.000 Karakter*\n` +
               `• 🪙 *500 Poin* ➔ 🔋 *+15.000 Karakter*\n\n` +
               `Silakan klik tombol di bawah untuk menukar:`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🔋 +1.000 (50 🪙)', 'game:arcade:exchange:1'),
      Markup.button.callback('🔋 +5.000 (200 🪙)', 'game:arcade:exchange:2')
    ],
    [
      Markup.button.callback('🔋 +15.000 (500 🪙)', 'game:arcade:exchange:3')
    ],
    [
      Markup.button.callback('🔙 Kembali ke Arcade', 'game:arcade:menu')
    ]
  ]);

  return { text, keyboard };
}

export function buyGachaTicket(chatId) {
  const points = getUserPoints(chatId);
  if (points < 50) {
    return {
      success: false,
      text: `❌ *Gagal membeli tiket!* Koin Poin Anda tidak cukup.\n\n🪙 Anda memiliki: *${points} Poin* (Butuh 50 Poin untuk 1 Tiket).`
    };
  }

  addPoints(chatId, -50);
  addTickets(chatId, 1);
  const newPoints = getUserPoints(chatId);
  const newTickets = getUserTickets(chatId);

  return {
    success: true,
    text: `🎉 *Pembelian Tiket Sukses!* 🎉\n\n🎟️ Anda berhasil membeli *1 Tiket Gacha* seharga 50 Koin Poin.\n\n🪙 Sisa Poin: *${newPoints} Poin*\n🎟️ Total Tiket: *${newTickets} Tiket*`
  };
}

export function drawGacha(chatId) {
  const tickets = getUserTickets(chatId);
  if (tickets < 1) {
    return {
      success: false,
      text: `❌ *Gagal menarik gacha!* Anda tidak memiliki Tiket Gacha.\n\n🎟️ Sisa Tiket: *${tickets} Tiket*.\nSilakan beli tiket seharga 50 Koin Poin terlebih dahulu.`
    };
  }

  addTickets(chatId, -1);

  const rand = Math.random() * 100;
  let rewardVal = 0;
  let rewardMsg = '';

  if (rand < 5) {
    rewardVal = 20000;
    addExtraQuota(chatId, 20000);
    addTickets(chatId, 5);
    rewardMsg = `👑 *JACKPOT DEWA AI!* 👑\n\n🎁 Anda memenangkan:\n🔋 *+20.000 Limit Karakter Permanent*!\n🎟️ *+5 Tiket Gacha Gratis*!`;
  } else if (rand < 30) {
    const quotas = [1000, 1500, 2000, 3000, 5000];
    rewardVal = quotas[Math.floor(Math.random() * quotas.length)];
    addExtraQuota(chatId, rewardVal);
    rewardMsg = `🔋 *Bonus Kuota Tambahan!* 🔋\n\n🎁 Anda mendapatkan *+${rewardVal.toLocaleString('id-ID')} Limit Karakter Permanent*!`;
  } else if (rand < 60) {
    rewardVal = Math.floor(Math.random() * 201) + 50;
    const xpRes = addXp(chatId, rewardVal);
    const lvMsg = xpRes.leveledUp ? `\n\n🎉 *LEVEL UP!* Level naik ke *${xpRes.level}*! 🚀` : '';
    rewardMsg = `⭐ *Bonus XP Pengalaman!* ⭐\n\n🎁 Anda mendapatkan *+${rewardVal} XP*!${lvMsg}`;
  } else {
    rewardVal = Math.floor(Math.random() * 71) + 10;
    addPoints(chatId, rewardVal);
    rewardMsg = `🪙 *Koin Poin Kembali!* 🪙\n\n🎁 Anda mendapatkan cashback *+${rewardVal} Koin Poin*!`;
  }

  const newTickets = getUserTickets(chatId);
  const finalMsg = `🎡 *Hasil Tarikan Gacha Arcade* 🎡\n\n${rewardMsg}\n\n🎟️ Sisa Tiket Anda: *${newTickets} Tiket*`;

  return {
    success: true,
    text: finalMsg
  };
}

export function exchangePointsForLimit(chatId, tier) {
  const points = getUserPoints(chatId);
  let cost = 0;
  let quotaVal = 0;

  if (tier === '1') {
    cost = 50;
    quotaVal = 1000;
  } else if (tier === '2') {
    cost = 200;
    quotaVal = 5000;
  } else if (tier === '3') {
    cost = 500;
    quotaVal = 15000;
  } else {
    return {
      success: false,
      text: '❌ Paket penukaran tidak valid.'
    };
  }

  if (points < cost) {
    return {
      success: false,
      text: `❌ *Penukaran Gagal!* Koin Poin Anda tidak cukup.\n\n🪙 Poin Anda: *${points} Poin* (Butuh ${cost} Poin).`
    };
  }

  addPoints(chatId, -cost);
  addExtraQuota(chatId, quotaVal);
  const newPoints = getUserPoints(chatId);

  return {
    success: true,
    text: `🎉 *Penukaran Sukses!* 🎉\n\n🔋 Anda berhasil menukarkan *${cost} Poin* dengan *+${quotaVal.toLocaleString('id-ID')} Limit Karakter Permanent*.\n\n🪙 Sisa Poin Anda: *${newPoints} Poin*.`
  };
}

// --- SLOT MACHINE GAME LOGIC ---
const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣'];

export function startSlot(chatId) {
  const points = getUserPoints(chatId);
  const text = `🎰 *SLOT MACHINE ARCADE* 🎰\n\n` +
               `Biaya per spin: 🪙 *5 Poin*\n` +
               `Poin Anda saat ini: 🪙 *${points} Poin*\n\n` +
               `Putar reels dan dapatkan kombinasi simbol yang sama untuk memenangkan hadiah!\n\n` +
               `*Simbol & Hadiah:* \n` +
               `• 7️⃣ 7️⃣ 7️⃣ ➔ 👑 *JACKPOT* (+100 Poin, +200 XP, +1 Tiket Gacha)\n` +
               `• 💎 💎 💎 ➔ 💎 *MEGA WIN* (+50 Poin, +100 XP)\n` +
               `• Simbol 3x Sama Lainnya ➔ 🪙 *WIN* (+25 Poin, +50 XP)\n` +
               `• Simbol 2x Sama ➔ 🎟️ *MINI WIN* (+10 Poin, +15 XP)\n\n` +
               `*Reels saat ini:* [ 🎰 | 🎰 | 🎰 ]`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🎰 SPIN! (5 🪙)', 'game:slot:spin')
    ],
    [
      Markup.button.callback('🔙 Kembali ke Menu', 'game:menu')
    ]
  ]);

  return { text, keyboard };
}

export function renderSlot(state) {
  const reelsStr = state.reels.join(' | ');
  const text = `🎰 *SLOT MACHINE ARCADE* 🎰\n\n` +
               `Biaya per spin: 🪙 *5 Poin*\n` +
               `Poin Anda saat ini: 🪙 *${state.points} Poin*\n\n` +
               `*Reels:* [ ${reelsStr} ]\n\n` +
               `📢 ${state.message}`;

  const buttons = [];
  if (!state.isSpinning) {
    buttons.push([Markup.button.callback('🎰 SPIN LAGI! (5 🪙)', 'game:slot:spin')]);
  }
  buttons.push([Markup.button.callback('🔙 Kembali ke Menu', 'game:menu')]);

  return { text, keyboard: Markup.inlineKeyboard(buttons) };
}

export function spinSlot(chatId) {
  const points = getUserPoints(chatId);
  if (points < 5) {
    return {
      success: false,
      text: `❌ *Koin Poin Anda tidak cukup!* \n\n🪙 Anda memiliki: *${points} Poin* (Butuh 5 Poin untuk 1x spin).`
    };
  }

  // Deduct points
  addPoints(chatId, -5);

  const reels = [
    SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
    SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
    SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]
  ];

  let message = '';
  let pointsReward = 0;
  let xpReward = 0;
  let ticketReward = 0;

  // Check results
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    // 3 of a kind
    const sym = reels[0];
    if (sym === '7️⃣') {
      pointsReward = 100;
      xpReward = 200;
      ticketReward = 1;
      addPoints(chatId, pointsReward);
      addXp(chatId, xpReward);
      addTickets(chatId, ticketReward);
      message = `👑 *JACKPOT LUAR BIASA!* 👑\n\n🎁 Anda memenangkan *+100 Poin*, *+200 XP*, dan *+1 Tiket Gacha*!`;
    } else if (sym === '💎') {
      pointsReward = 50;
      xpReward = 100;
      addPoints(chatId, pointsReward);
      addXp(chatId, xpReward);
      message = `💎 *MEGA WIN!* 💎\n\n🎁 Anda memenangkan *+50 Poin* dan *+100 XP*!`;
    } else {
      pointsReward = 25;
      xpReward = 50;
      addPoints(chatId, pointsReward);
      addXp(chatId, xpReward);
      message = `🎉 *WIN!* 🎉\n\n🎁 Anda memenangkan *+25 Poin* dan *+50 XP*!`;
    }
  } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    // 2 of a kind
    pointsReward = 10;
    xpReward = 15;
    addPoints(chatId, pointsReward);
    addXp(chatId, xpReward);
    message = `🎟️ *MINI WIN!* 🎟️\n\n🎁 Anda memenangkan *+10 Poin* dan *+15 XP*!`;
  } else {
    message = `😢 *Zonk!* Anda tidak mendapatkan kecocokan. Coba spin lagi!`;
  }

  const finalPoints = getUserPoints(chatId);
  const sessionState = {
    reels,
    points: finalPoints,
    message,
    isSpinning: false
  };

  return {
    success: true,
    state: sessionState
  };
}

// --- TEBAK ANGKA (GUESS NUMBER) LOGIC ---
export function startTebakAngka(chatId) {
  const secret = Math.floor(Math.random() * 100) + 1;
  const session = {
    gameType: 'tebakangka',
    state: {
      secret,
      lives: 6,
      currentGuess: '',
      message: 'Masukkan tebakan Anda (1-100) menggunakan keypad di bawah!'
    }
  };
  gameSessions.set(chatId, session);
  return renderTebakAngka(session.state);
}

export function renderTebakAngka(state, isGameOver = false) {
  const heartEmoji = '❤️'.repeat(state.lives) + '🖤'.repeat(6 - state.lives);
  
  let text = `🔢 *Tebak Angka (1-100)* 🔢\n` +
             `━━━━━━━━━━━━━━━━━━━━\n` +
             `💚 *Nyawa:* ${heartEmoji}\n` +
             `📌 *Tebakan Anda:* \`${state.currentGuess || '(kosong)'}\`\n` +
             `━━━━━━━━━━━━━━━━━━━━\n\n` +
             `📢 *Status:* ${state.message}`;

  const buttons = [];

  if (isGameOver) {
    buttons.push([
      Markup.button.callback('🔄 Main Lagi', 'game:start:ta'),
      Markup.button.callback('🔙 Menu Game', 'game:menu')
    ]);
  } else {
    // Keypad layout
    buttons.push([
      Markup.button.callback('1', 'game:ta:digit:1'),
      Markup.button.callback('2', 'game:ta:digit:2'),
      Markup.button.callback('3', 'game:ta:digit:3')
    ]);
    buttons.push([
      Markup.button.callback('4', 'game:ta:digit:4'),
      Markup.button.callback('5', 'game:ta:digit:5'),
      Markup.button.callback('6', 'game:ta:digit:6')
    ]);
    buttons.push([
      Markup.button.callback('7', 'game:ta:digit:7'),
      Markup.button.callback('8', 'game:ta:digit:8'),
      Markup.button.callback('9', 'game:ta:digit:9')
    ]);
    buttons.push([
      Markup.button.callback('❌ Hapus', 'game:ta:clear'),
      Markup.button.callback('0', 'game:ta:digit:0'),
      Markup.button.callback('🎯 Tebak!', 'game:ta:submit')
    ]);
    buttons.push([
      Markup.button.callback('🔙 Keluar ke Menu', 'game:menu')
    ]);
  }

  return { text, keyboard: Markup.inlineKeyboard(buttons) };
}

export function handleTebakAngkaInput(chatId, action) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'tebakangka') {
    return getGameMenu();
  }

  const state = session.state;

  if (action.startsWith('digit:')) {
    const digit = action.split(':')[1];
    if (state.currentGuess.length >= 3) {
      return null; // Limit to 3 digits
    }
    state.currentGuess += digit;
    state.message = 'Sedang mengetik tebakan...';
    return renderTebakAngka(state);
  }

  if (action === 'clear') {
    state.currentGuess = '';
    state.message = 'Input dihapus. Masukkan angka baru.';
    return renderTebakAngka(state);
  }

  if (action === 'submit') {
    const guess = parseInt(state.currentGuess);
    if (isNaN(guess) || guess < 1 || guess > 100) {
      state.currentGuess = '';
      state.message = '⚠️ Tebakan tidak valid! Harap masukkan angka antara 1 sampai 100.';
      return renderTebakAngka(state);
    }

    state.currentGuess = ''; // Clear for next try

    if (guess === state.secret) {
      const xpRes = addXp(chatId, 40);
      addPoints(chatId, 8);
      const getTicket = Math.random() < 0.15;
      if (getTicket) addTickets(chatId, 1);
      const ticketMsg = getTicket ? '\n🎟️ *Bonus:* +1 Tiket Gacha!' : '';
      const lvMsg = xpRes.leveledUp ? `\n\n🎉 *LEVEL UP!* Level naik ke *${xpRes.level}*! 🚀` : '';
      
      state.message = `🎉 *Luar Biasa! Tebakan Anda Tepat!* 🎉\n` +
                      `Angka rahasia adalah *${state.secret}*.\n\n` +
                      `🎁 Hadiah:\n` +
                      `⭐ +40 XP\n` +
                      `🪙 +8 Poin${ticketMsg}${lvMsg}`;
      gameSessions.delete(chatId);
      return renderTebakAngka(state, true);
    } else {
      state.lives--;
      if (state.lives <= 0) {
        state.message = `😢 *Game Over! Nyawa Habis.* \nAngka rahasia yang benar adalah: *${state.secret}*.`;
        gameSessions.delete(chatId);
        return renderTebakAngka(state, true);
      } else {
        const diffMsg = guess > state.secret ? 'Terlalu TINGGI! 📈' : 'Terlalu RENDAH! 📉';
        state.message = `❌ Tebakan *${guess}* Salah!\n\n💡 Petunjuk: Angka rahasia lebih *${diffMsg}*`;
        return renderTebakAngka(state);
      }
    }
  }

  return null;
}

// --- BLACKJACK (KARTU 21) LOGIC ---
const SUITS = ['♥️', '♦️', '♣️', '♠️'];
const VALUES = [
  { name: 'A', val: 11 },
  { name: '2', val: 2 },
  { name: '3', val: 3 },
  { name: '4', val: 4 },
  { name: '5', val: 5 },
  { name: '6', val: 6 },
  { name: '7', val: 7 },
  { name: '8', val: 8 },
  { name: '9', val: 9 },
  { name: '10', val: 10 },
  { name: 'J', val: 10 },
  { name: 'Q', val: 10 },
  { name: 'K', val: 10 }
];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const val of VALUES) {
      deck.push({ suit, name: val.name, val: val.val });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function calculateHandValue(hand) {
  let val = 0;
  let aces = 0;
  for (const card of hand) {
    val += card.val;
    if (card.name === 'A') aces++;
  }
  while (val > 21 && aces > 0) {
    val -= 10;
    aces--;
  }
  return val;
}

export function startBlackjack(chatId) {
  const points = getUserPoints(chatId);
  if (points < 15) {
    return {
      success: false,
      text: `❌ *Koin Poin Anda tidak cukup!* \n\n🪙 Anda memiliki: *${points} Poin* (Butuh 15 Poin taruhan untuk bermain Blackjack 5-Ronde).`
    };
  }

  // Deduct points for bet
  addPoints(chatId, -15);

  const deck = createDeck();
  const playerHand = [deck.pop(), deck.pop()];
  const dealerHand = [deck.pop(), deck.pop()];

  const session = {
    gameType: 'blackjack',
    state: {
      round: 1,
      playerWins: 0,
      dealerWins: 0,
      draws: 0,
      deck,
      playerHand,
      dealerHand,
      bet: 15,
      status: 'Ronde 1 Dimulai! Tekan Hit untuk menambah kartu, atau Stand jika sudah cukup.',
      isGameOver: false,
      isMatchOver: false
    }
  };

  gameSessions.set(chatId, session);

  // Check for immediate Blackjack
  const playerVal = calculateHandValue(playerHand);
  if (playerVal === 21) {
    session.state.playerWins++;
    session.state.isGameOver = true;
    session.state.status = `🎉 *BLACKJACK!* Anda memenangkan Ronde 1 dengan nilai 21!`;
  }

  return renderBlackjack(session.state);
}

export function renderBlackjack(state) {
  const playerVal = calculateHandValue(state.playerHand);
  const playerHandStr = state.playerHand.map(c => `${c.suit}${c.name}`).join(' ');

  let dealerHandStr = '';
  let dealerValStr = '';

  if (state.isGameOver) {
    dealerHandStr = state.dealerHand.map(c => `${c.suit}${c.name}`).join(' ');
    dealerValStr = calculateHandValue(state.dealerHand);
  } else {
    // Hide dealer's second card
    dealerHandStr = `${state.dealerHand[0].suit}${state.dealerHand[0].name} 🂠`;
    dealerValStr = state.dealerHand[0].val;
  }

  let text = `🃏 *BLACKJACK 5-RONDE CHALLENGE* 🃏\n` +
             `━━━━━━━━━━━━━━━━━━━━\n` +
             `⚔️ *Ronde:* ${state.round} / 5\n` +
             `🏆 *Skor Match:* 👤 Anda *${state.playerWins}* - 🤖 Dealer *${state.dealerWins}* (🤝 Seri: *${state.draws}*)\n` +
             `💵 *Taruhan Match:* 🪙 \`15 Poin\`\n\n` +
             `👤 *Tangan Anda:* [ ${playerHandStr} ] (Nilai: *${playerVal}*)\n` +
             `🤖 *Tangan Dealer:* [ ${dealerHandStr} ] (Nilai: *${dealerValStr}*)\n` +
             `━━━━━━━━━━━━━━━━━━━━\n\n` +
             `📢 *Status:* ${state.status}`;

  const buttons = [];
  if (!state.isGameOver) {
    buttons.push([
      Markup.button.callback('🃏 Ambil Kartu (Hit)', 'game:bj:hit'),
      Markup.button.callback('🛑 Cukup (Stand)', 'game:bj:stand')
    ]);
  } else if (!state.isMatchOver) {
    buttons.push([
      Markup.button.callback(`➡️ Lanjut ke Ronde ${state.round + 1}`, 'game:bj:next')
    ]);
    buttons.push([
      Markup.button.callback('🛑 Forfeit / Keluar', 'game:menu')
    ]);
  } else {
    buttons.push([
      Markup.button.callback('🔄 Main Match Baru (15 🪙)', 'game:start:bj'),
      Markup.button.callback('🔙 Menu Game', 'game:menu')
    ]);
  }

  return { text, keyboard: Markup.inlineKeyboard(buttons) };
}

export function handleBlackjackHit(chatId) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'blackjack') {
    return getGameMenu();
  }

  const state = session.state;
  if (state.isGameOver) return null;

  // Draw card
  state.playerHand.push(state.deck.pop());
  const playerVal = calculateHandValue(state.playerHand);

  if (playerVal > 21) {
    // Player bust!
    state.isGameOver = true;
    state.dealerWins++;
    state.status = `💥 *Bust! Nilai kartu Anda melebihi 21 (${playerVal}).* Anda Kalah Ronde ${state.round}!`;
    
    if (state.round === 5) {
      state.isMatchOver = true;
      processBlackjackMatchOver(chatId, state);
    }
  } else if (playerVal === 21) {
    // Automatically stand on 21
    return handleBlackjackStand(chatId);
  }

  return renderBlackjack(state);
}

export function handleBlackjackStand(chatId) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'blackjack') {
    return getGameMenu();
  }

  const state = session.state;
  if (state.isGameOver) return null;

  state.isGameOver = true;
  const playerVal = calculateHandValue(state.playerHand);

  // Dealer plays: draws until >= 18 (make it hard!)
  let dealerVal = calculateHandValue(state.dealerHand);
  while (dealerVal < 18) {
    state.dealerHand.push(state.deck.pop());
    dealerVal = calculateHandValue(state.dealerHand);
  }

  if (dealerVal > 21) {
    // Dealer bust, player wins!
    state.playerWins++;
    state.status = `🎉 *Dealer Bust! Nilai dealer ${dealerVal} (> 21).* Anda memenangkan Ronde ${state.round}!`;
  } else if (playerVal > dealerVal) {
    // Player wins
    state.playerWins++;
    state.status = `🎉 *Anda Menang Ronde ${state.round}!* Nilai kartu Anda (*${playerVal}*) lebih tinggi dari Dealer (*${dealerVal}*).`;
  } else if (playerVal < dealerVal) {
    // Dealer wins
    state.dealerWins++;
    state.status = `😢 *Anda Kalah Ronde ${state.round}!* Nilai kartu Dealer (*${dealerVal}*) lebih tinggi dari Anda (*${playerVal}*).`;
  } else {
    // Draw / Push
    state.draws++;
    state.status = `🤝 *Seri (Push) di Ronde ${state.round}!* Nilai kartu sama-sama *${playerVal}*.`;
  }

  if (state.round === 5) {
    state.isMatchOver = true;
    processBlackjackMatchOver(chatId, state);
  }

  return renderBlackjack(state);
}

export function nextBlackjackRound(chatId) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'blackjack') {
    return getGameMenu();
  }

  const state = session.state;
  if (!state.isGameOver || state.isMatchOver) return null;

  state.round++;
  state.isGameOver = false;

  // Reshuffle deck if running low
  if (state.deck.length < 10) {
    state.deck = createDeck();
    state.status = `Deck dikocok ulang karena kartu hampir habis! Ronde ${state.round} dimulai.`;
  } else {
    state.status = `Ronde ${state.round} dimulai. Semoga beruntung!`;
  }

  state.playerHand = [state.deck.pop(), state.deck.pop()];
  state.dealerHand = [state.deck.pop(), state.deck.pop()];

  // Check for immediate Blackjack
  const playerVal = calculateHandValue(state.playerHand);
  if (playerVal === 21) {
    state.playerWins++;
    state.isGameOver = true;
    state.status = `🎉 *BLACKJACK!* Anda memenangkan Ronde ${state.round} dengan nilai 21!`;
    if (state.round === 5) {
      state.isMatchOver = true;
      processBlackjackMatchOver(chatId, state);
    }
  }

  return renderBlackjack(state);
}

function processBlackjackMatchOver(chatId, state) {
  let rewardMsg = '';
  if (state.playerWins > state.dealerWins) {
    // Player wins match
    let pReward = 25;
    let xReward = 50;
    
    if (state.playerWins === 5) {
      pReward = 60;
      xReward = 120;
      rewardMsg = `🏆 *SWEET SWEEP (5-0)!* Anda memenangkan kelima ronde! \n\nHadiah: \n⭐ +120 XP\n🪙 +60 Poin (+15 Poin Taruhan dikembalikan)`;
    } else if (state.playerWins === 4) {
      pReward = 40;
      xReward = 80;
      rewardMsg = `🏆 *MENANG BESAR (4-1)!* Anda mendominasi pertandingan! \n\nHadiah: \n⭐ +80 XP\n🪙 +40 Poin (+15 Poin Taruhan dikembalikan)`;
    } else {
      rewardMsg = `🏆 *MENANG MATCH (3-2 / 3-1-1)!* Anda memenangkan pertandingan! \n\nHadiah: \n⭐ +50 XP\n🪙 +25 Poin (+15 Poin Taruhan dikembalikan)`;
    }
    
    addPoints(chatId, pReward + 15); // refund 15 + reward points
    addXp(chatId, xReward);
  } else if (state.playerWins === state.dealerWins) {
    // Tie match
    addPoints(chatId, 15); // refund 15 points
    addXp(chatId, 20);
    rewardMsg = `🤝 *SERI MATCH!* Pertandingan berakhir dengan skor seimbang. Taruhan 🪙 *15 Poin* Anda dikembalikan.\n\nHadiah:\n⭐ +20 XP`;
  } else {
    // Dealer wins match
    addXp(chatId, 10);
    rewardMsg = `😢 *ANDA KALAH MATCH!* Dealer memenangkan pertandingan (${state.dealerWins} vs ${state.playerWins}). Taruhan 🪙 *15 Poin* Anda hangus.\n\nHadiah hiburan:\n⭐ +10 XP`;
  }

  state.status = rewardMsg;
  gameSessions.delete(chatId); // clean up session
}

// --- TEBAK BENDERA (FLAG TRIVIA) LOGIC ---
const FLAG_POOL = [
  { flag: '🇮🇩', country: 'Indonesia' },
  { flag: '🇯🇵', country: 'Jepang' },
  { flag: '🇰🇷', country: 'Korea Selatan' },
  { flag: '🇩🇪', country: 'Jerman' },
  { flag: '🇧🇷', country: 'Brasil' },
  { flag: '🇸🇦', country: 'Arab Saudi' },
  { flag: '🇫🇷', country: 'Prancis' },
  { flag: '🇮🇹', country: 'Italia' },
  { flag: '🇬🇧', country: 'Inggris' },
  { flag: '🇨🇦', country: 'Kanada' },
  { flag: '🇦🇺', country: 'Australia' },
  { flag: '🇷🇺', country: 'Rusia' },
  { flag: '🇮🇳', country: 'India' },
  { flag: '🇿🇦', country: 'Afrika Selatan' },
  { flag: '🇪🇸', country: 'Spanyol' },
  { flag: '🇳🇱', country: 'Belanda' },
  { flag: '🇲🇽', country: 'Meksiko' },
  { flag: '🇹🇭', country: 'Thailand' },
  { flag: '🇲🇾', country: 'Malaysia' },
  { flag: '🇸🇬', country: 'Singapura' }
];

export async function startTebakBendera(chatId) {
  const session = {
    gameType: 'tebakbendera',
    state: {
      streak: 0,
      lives: 3,
      correctFlag: '',
      correctCountry: '',
      options: [],
      message: 'Tebak bendera di bawah! Jawab pertanyaan pertama:'
    }
  };
  await generateTebakBenderaQuestion(session.state, chatId);
  gameSessions.set(chatId, session);
  return renderTebakBendera(session.state);
}

async function generateTebakBenderaQuestion(state, chatId = null) {
  let correctFlag = '';
  let correctCountry = '';
  let options = [];

  if (groq) {
    try {
      const prompt = `You are a game host. Generate a random trivia question for "Tebak Bendera" (Guess the country flag).
Select a random country and its flag emoji.
Provide:
1. The country name in Indonesian (e.g. "Prancis", "Brasil", "Afrika Selatan", "Turki", "Kanada").
2. The country flag emoji (e.g. "🇫🇷", "🇧🇷", "🇿🇦", "🇹🇷", "🇨🇦").
3. Three other incorrect country names in Indonesian to be used as options/distractors. Ensure they are common/valid countries and distinct.

Respond ONLY with a valid JSON matching this schema:
{
  "flag": "flag_emoji",
  "country": "correct_country_name",
  "distractors": ["incorrect_country_1", "incorrect_country_2", "incorrect_country_3"]
}`;

      const response = await groq.chat.completions.create({
        model: config.groqModel || 'qwen/qwen3-32b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        response_format: { type: 'json_object' }
      }, { chatId });

      const res = JSON.parse(response.choices[0].message.content.trim());
      if (res.flag && res.country && res.distractors && res.distractors.length === 3) {
        correctFlag = res.flag;
        correctCountry = res.country;
        
        const optionsSet = new Set([correctCountry]);
        for (const dist of res.distractors) {
          optionsSet.add(dist);
        }
        
        while (optionsSet.size < 4) {
          const randomItem = FLAG_POOL[Math.floor(Math.random() * FLAG_POOL.length)];
          optionsSet.add(randomItem.country);
        }
        
        options = Array.from(optionsSet).sort(() => Math.random() - 0.5);
      }
    } catch (err) {
      console.warn('Groq failed for Tebak Bendera, falling back to static pool:', err.message);
    }
  }

  if (!correctFlag || !correctCountry || options.length < 4) {
    const correctItem = FLAG_POOL[Math.floor(Math.random() * FLAG_POOL.length)];
    correctFlag = correctItem.flag;
    correctCountry = correctItem.country;

    const optionsSet = new Set([correctCountry]);
    while (optionsSet.size < 4) {
      const randomItem = FLAG_POOL[Math.floor(Math.random() * FLAG_POOL.length)];
      optionsSet.add(randomItem.country);
    }
    options = Array.from(optionsSet).sort(() => Math.random() - 0.5);
  }

  state.correctFlag = correctFlag;
  state.correctCountry = correctCountry;
  state.options = options;
}

export function renderTebakBendera(state, isGameOver = false) {
  const heartEmoji = '❤️'.repeat(state.lives) + '🖤'.repeat(3 - state.lives);

  let text = `🏳️ *Tebak Bendera Negara* 🏳️\n` +
             `━━━━━━━━━━━━━━━━━━━━\n` +
             `🔥 *Streak:* \`${state.streak}\`\n` +
             `💚 *Nyawa:* ${heartEmoji}\n` +
             `📌 *Bendera:*  ${state.correctFlag}\n` +
             `━━━━━━━━━━━━━━━━━━━━\n\n` +
             `📢 ${state.message}`;

  const buttons = [];

  if (isGameOver) {
    text = `😢 *Game Over! Nyawa Habis.* 😢\n` +
           `━━━━━━━━━━━━━━━━━━━━\n` +
           `🔥 *Streak Terakhir:* \`${state.streak}\`\n` +
           `📌 *Bendera:* ${state.correctFlag} adalah bendera *${state.correctCountry}*\n` +
           `━━━━━━━━━━━━━━━━━━━━\n\n` +
           `Mau mencoba lagi?`;
    buttons.push([
      Markup.button.callback('🔄 Coba Lagi', 'game:start:tb'),
      Markup.button.callback('🔙 Menu Game', 'game:menu')
    ]);
  } else {
    buttons.push([
      Markup.button.callback(state.options[0], `game:tb:ans:${state.options[0]}`),
      Markup.button.callback(state.options[1], `game:tb:ans:${state.options[1]}`)
    ]);
    buttons.push([
      Markup.button.callback(state.options[2], `game:tb:ans:${state.options[2]}`),
      Markup.button.callback(state.options[3], `game:tb:ans:${state.options[3]}`)
    ]);
    buttons.push([
      Markup.button.callback('🔙 Keluar ke Menu', 'game:menu')
    ]);
  }

  return { text, keyboard: Markup.inlineKeyboard(buttons) };
}

export async function handleTebakBenderaAnswer(chatId, selectedAnswer) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'tebakbendera') {
    return getGameMenu();
  }

  const state = session.state;
  const isCorrect = selectedAnswer.toUpperCase() === state.correctCountry.toUpperCase();

  if (isCorrect) {
    state.streak++;
    const xpRes = addXp(chatId, 15);
    addPoints(chatId, 3);
    const lvMsg = xpRes.leveledUp ? `\n\n🎉 *LEVEL UP!* Level naik ke *${xpRes.level}*! 🚀` : ' (+15 XP, +3 Poin)';
    state.message = `✅ *Benar!* Itu adalah bendera *${state.correctCountry}*.${lvMsg}`;
    await generateTebakBenderaQuestion(state, chatId);
    return renderTebakBendera(state, false);
  } else {
    state.lives--;
    if (state.lives <= 0) {
      const lastState = { ...state };
      gameSessions.delete(chatId);
      return renderTebakBendera(lastState, true);
    } else {
      state.message = `❌ *Salah!* Jawaban yang benar adalah bendera *${state.correctCountry}*. Nyawa berkurang.`;
      await generateTebakBenderaQuestion(state, chatId);
      return renderTebakBendera(state, false);
    }
  }
}

// --- CHESS GAME LOGIC ---

export function startChess(chatId) {
  const board = [...INITIAL_CHESS_BOARD];
  const session = {
    gameType: 'chess',
    state: {
      board,
      isPlayerTurn: true,
      selectedSquare: null,
      isGameOver: false,
      status: 'Catur dimulai! Anda memainkan bidak putih (♙ ♖...). Ketuk bidak Anda untuk memilih.'
    }
  };
  gameSessions.set(chatId, session);
  return renderChess(session.state);
}

function getChessSquareName(idx) {
  const files = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const r = Math.floor(idx / 8);
  const c = idx % 8;
  const rank = 8 - r;
  return `${files[c]}${rank}`;
}

function renderChess(state) {
  const RANK_NUM = ['8','7','6','5','4','3','2','1'];

  // --- Track captured pieces ---
  const startBlackCounts = { r:2, n:2, b:2, q:1, k:1, p:8 };
  const startWhiteCounts = { R:2, N:2, B:2, Q:1, K:1, P:8 };
  const curBlack = {}, curWhite = {};
  for (const cell of state.board) {
    if (cell === ' ') continue;
    if (cell === cell.toLowerCase()) curBlack[cell] = (curBlack[cell] || 0) + 1;
    else curWhite[cell] = (curWhite[cell] || 0) + 1;
  }
  const capturedByPlayer = [];
  for (const [p, n] of Object.entries(startBlackCounts)) {
    const diff = n - (curBlack[p] || 0);
    for (let i = 0; i < diff; i++) capturedByPlayer.push(CHESS_PIECES[p]);
  }
  const capturedByBot = [];
  for (const [p, n] of Object.entries(startWhiteCounts)) {
    const diff = n - (curWhite[p] || 0);
    for (let i = 0; i < diff; i++) capturedByBot.push(CHESS_PIECES[p]);
  }

  const capPlayer = capturedByPlayer.length ? capturedByPlayer.join('') : '—';
  const capBot    = capturedByBot.length    ? capturedByBot.join('')    : '—';

  const turnLine = state.isGameOver
    ? '🏁 *Permainan selesai*'
    : state.isPlayerTurn
      ? '♟️ *Giliran Anda — ketuk bidak putih untuk memilih*'
      : '🤖 *Giliran Bot AI sedang berpikir...*';

  const text =
    '♟️ *CATUR AI — PERTANDINGAN LIVE* ♟️\n' +
    '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n' +
    `👤 Anda *(Putih)* | Tangkapan: ${capPlayer}\n` +
    `🤖 Bot *(Hitam)*  | Tangkapan: ${capBot}\n` +
    '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n' +
    `${turnLine}\n\n` +
    `📢 ${state.status}`;

  // --- Build board buttons ---
  const buttons = [];

  // Top file label row (A–H)
  buttons.push([
    Markup.button.callback('➕', 'game:tebak:inert'),
    ...['A','B','C','D','E','F','G','H'].map(f => Markup.button.callback(f, 'game:tebak:inert'))
  ]);

  for (let r = 0; r < 8; r++) {
    const row = [];
    // Rank label on the left
    row.push(Markup.button.callback(RANK_NUM[r], 'game:tebak:inert'));

    for (let c = 0; c < 8; c++) {
      const idx = r * 8 + c;
      const cell = state.board[idx];
      const isLight = (r + c) % 2 === 0;

      let label;
      if (state.selectedSquare === idx) {
        label = '🟡'; // Gold highlight for selected square
      } else if (cell === ' ') {
        label = isLight ? '⬜' : '🟫';
      } else {
        label = CHESS_PIECES[cell];
      }

      const callback = state.isGameOver ? 'game:tebak:inert' : `game:chess:click:${idx}`;
      row.push(Markup.button.callback(label, callback));
    }
    buttons.push(row);
  }

  // Bottom file label row (A–H)
  buttons.push([
    Markup.button.callback('➕', 'game:tebak:inert'),
    ...['A','B','C','D','E','F','G','H'].map(f => Markup.button.callback(f, 'game:tebak:inert'))
  ]);

  // Action buttons
  if (state.isGameOver) {
    buttons.push([
      Markup.button.callback('🔄 Main Lagi', 'game:start:chess'),
      Markup.button.callback('🔙 Menu', 'game:menu')
    ]);
  } else {
    buttons.push([
      Markup.button.callback('🤖 Biar AI Jalan', 'game:chess:ai_move'),
      Markup.button.callback('🏳️ Menyerah', 'game:chess:forfeit')
    ]);
    buttons.push([Markup.button.callback('🔙 Kembali ke Menu', 'game:menu')]);
  }

  return { text, keyboard: Markup.inlineKeyboard(buttons) };
}

export function handleChessClick(chatId, index) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'chess') {
    return getGameMenu();
  }

  const state = session.state;
  if (state.isGameOver || !state.isPlayerTurn) {
    return null;
  }

  const cell = state.board[index];
  const isWhitePiece = cell !== ' ' && cell === cell.toUpperCase();

  if (state.selectedSquare === null) {
    if (isWhitePiece) {
      state.selectedSquare = index;
      state.status = `Bidak ${CHESS_PIECES[cell]} dipilih di ${getChessSquareName(index)}. Ketuk petak tujuan untuk melangkah.`;
      return renderChess(state);
    } else {
      state.status = '⚠️ Ketuk salah satu bidak putih Anda terlebih dahulu!';
      return renderChess(state);
    }
  }

  const fromIdx = state.selectedSquare;
  const selectedPiece = state.board[fromIdx];

  if (fromIdx === index) {
    state.selectedSquare = null;
    state.status = 'Bidak batal dipilih. Ketuk bidak Anda untuk memilih.';
    return renderChess(state);
  }

  if (isWhitePiece) {
    state.selectedSquare = index;
    state.status = `Bidak ${CHESS_PIECES[cell]} dipilih di ${getChessSquareName(index)}. Ketuk petak tujuan untuk melangkah.`;
    return renderChess(state);
  }

  const targetCell = state.board[index];
  const win = targetCell === 'k';

  state.board[index] = selectedPiece;
  state.board[fromIdx] = ' ';
  state.selectedSquare = null;

  if (win) {
    const xpRes = addXp(chatId, 100);
    addPoints(chatId, 25);
    const getTicket = Math.random() < 0.35;
    if (getTicket) addTickets(chatId, 1);
    const ticketMsg = getTicket ? '\n🎟️ *Bonus:* Anda mendapatkan *1 Tiket Gacha*!' : '';
    const lvMsg = xpRes.leveledUp ? `\n\n🎉 *LEVEL UP!* Level naik ke *${xpRes.level}*! 🚀` : '';
    state.status = `🎉 *Selamat! Anda menang! Raja hitam ditangkap!* 🎉\n⭐ +100 XP\n🪙 +25 Poin${ticketMsg}${lvMsg}`;
    state.isGameOver = true;
    state.isPlayerTurn = false;
    return renderChess(state);
  }

  state.isPlayerTurn = false;
  state.status = '⏳ Giliran Bot AI berpikir...';

  return {
    text: renderChess(state).text,
    keyboard: renderChess(state).keyboard,
    triggerBot: true
  };
}

export async function makeBotChessMoveAndRender(chatId) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'chess') return null;
  await makeBotChessMove(session.state, chatId);
  return renderChess(session.state);
}

async function makeBotChessMove(state, chatId) {
  const board = state.board;
  
  // Try to use Groq AI for Black moves
  let fromIdx = null;
  let toIdx = null;
  let comment = 'Biar kekuatan hitam menguasai papan!';

  if (groq) {
    try {
      const prompt = `Board state representation (64-element array):
${JSON.stringify(board)}

Select a valid move for Black (lowercase piece: k, q, r, b, n, p).
Respond ONLY with a raw JSON object on a single line, no markdown:
{"fromIndex": 12, "toIndex": 28, "comment": "komentar singkat dalam bahasa Indonesia"}`;

      const response = await groq.chat.completions.create({
        model: config.groqModel || 'qwen/qwen3-32b',
        messages: [
          { role: 'system', content: '/no_think\nYou are a Chess engine. Output ONLY a raw JSON object with keys fromIndex, toIndex, comment. No markdown, no backticks, no explanation.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2
      }, { chatId });

      const raw = response.choices[0].message.content || '';
      const jsonMatch = raw.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const res = JSON.parse(jsonMatch[0]);
        if (res.fromIndex !== undefined && res.toIndex !== undefined) {
          const cell = board[res.fromIndex];
          const destCell = board[res.toIndex];
          if (cell !== ' ' && cell === cell.toLowerCase() && (destCell === ' ' || destCell === destCell.toUpperCase())) {
            fromIdx = res.fromIndex;
            toIdx = res.toIndex;
            if (res.comment) comment = res.comment;
          }
        }
      }
    } catch (e) {
      console.warn('Groq Black move calculation failed:', e.message);
    }
  }

  // Fallback: Use rule-based heuristic move if Groq fails
  if (fromIdx === null || toIdx === null) {
    const blackPieces = [];
    for (let i = 0; i < 64; i++) {
      const cell = board[i];
      if (cell !== ' ' && cell === cell.toLowerCase()) {
        blackPieces.push({ idx: i, piece: cell });
      }
    }

    if (blackPieces.length === 0) {
      state.status = '🎉 *Selamat! Semua bidak lawan telah habis! Anda menang!*';
      state.isGameOver = true;
      state.isPlayerTurn = false;
      return;
    }

    blackPieces.sort(() => Math.random() - 0.5);

    for (const bp of blackPieces) {
      const tempFromIdx = bp.idx;
      const r = Math.floor(tempFromIdx / 8);
      const c = bp.idx % 8;
      const targets = [];

      if (bp.piece === 'p') {
        const nextRows = [r + 1];
        if (r === 1) nextRows.push(2);
        for (const nr of nextRows) {
          if (nr < 8) {
            const destIdx = nr * 8 + c;
            if (board[destIdx] === ' ') targets.push(destIdx);
          }
        }
        const diagCols = [c - 1, c + 1];
        for (const dc of diagCols) {
          if (dc >= 0 && dc < 8 && r + 1 < 8) {
            const destIdx = (r + 1) * 8 + dc;
            const targetCell = board[destIdx];
            if (targetCell !== ' ' && targetCell === targetCell.toUpperCase()) {
              targets.push(destIdx);
            }
          }
        }
      } else if (bp.piece === 'n') {
        const moves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
        for (const m of moves) {
          const nr = r + m[0];
          const nc = c + m[1];
          if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const destIdx = nr * 8 + nc;
            const targetCell = board[destIdx];
            if (targetCell === ' ' || targetCell === targetCell.toUpperCase()) {
              targets.push(destIdx);
            }
          }
        }
      } else {
        let dirs = [];
        if (bp.piece === 'r' || bp.piece === 'q' || bp.piece === 'k') {
          dirs.push([0, 1], [0, -1], [1, 0], [-1, 0]);
        }
        if (bp.piece === 'b' || bp.piece === 'q' || bp.piece === 'k') {
          dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
        }

        const maxSteps = bp.piece === 'k' ? 1 : 8;
        for (const d of dirs) {
          for (let step = 1; step <= maxSteps; step++) {
            const nr = r + d[0] * step;
            const nc = c + d[1] * step;
            if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) break;
            const destIdx = nr * 8 + nc;
            const targetCell = board[destIdx];
            if (targetCell === ' ') {
              targets.push(destIdx);
            } else {
              if (targetCell === targetCell.toUpperCase()) {
                targets.push(destIdx);
              }
              break;
            }
          }
        }
      }

      if (targets.length > 0) {
        fromIdx = tempFromIdx;
        toIdx = targets[Math.floor(Math.random() * targets.length)];
        comment = 'Bidak hitam bergerak secara taktis!';
        break;
      }
    }
  }

  // Final fallback
  if (fromIdx === null || toIdx === null) {
    const blackPieces = [];
    for (let i = 0; i < 64; i++) {
      const cell = board[i];
      if (cell !== ' ' && cell === cell.toLowerCase()) {
        blackPieces.push({ idx: i, piece: cell });
      }
    }
    for (const bp of blackPieces) {
      const tempFromIdx = bp.idx;
      const r = Math.floor(tempFromIdx / 8);
      const c = tempFromIdx % 8;
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      dirs.sort(() => Math.random() - 0.5);
      for (const d of dirs) {
        const nr = r + d[0];
        const nc = c + d[1];
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const destIdx = nr * 8 + nc;
          const targetCell = board[destIdx];
          if (targetCell === ' ' || targetCell === targetCell.toUpperCase()) {
            fromIdx = tempFromIdx;
            toIdx = destIdx;
            comment = 'Melangkah terpaksa!';
            break;
          }
        }
      }
      if (fromIdx !== null) break;
    }
  }

  if (fromIdx === null || toIdx === null) {
    state.status = '🤝 *Permainan Seri! Remis.*';
    state.isGameOver = true;
    state.isPlayerTurn = false;
    return;
  }

  const piece = board[fromIdx];
  const targetCell = board[toIdx];
  const win = targetCell === 'K';

  // Execute move
  board[toIdx] = piece;
  board[fromIdx] = ' ';

  if (win) {
    const xpRes = addXp(chatId, 15);
    addPoints(chatId, 3);
    const lvMsg = xpRes.leveledUp ? `\n\n🎉 *LEVEL UP!* Level naik ke *${xpRes.level}*! 🚀` : '';
    state.status = `😢 *Bot Menang! Raja Anda ditangkap!* Coba lagi nanti.\n💬 AI: "${comment}"\n⭐ +15 XP\n🪙 +3 Poin${lvMsg}`;
    state.isGameOver = true;
    state.isPlayerTurn = false;
    return;
  }

  state.isPlayerTurn = true;
  state.status = `Bot melangkah: ${CHESS_PIECES[piece]} ke ${getChessSquareName(toIdx)}.\n💬 "${comment}"\nGiliran Anda!`;
}

export async function handleChessAiMove(chatId) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'chess') {
    return getGameMenu();
  }

  const state = session.state;
  if (state.isGameOver || !state.isPlayerTurn) {
    return null;
  }

  let fromIdx = null;
  let toIdx = null;
  let comment = 'Saya melihat langkah terbaik!';

  if (groq) {
    try {
      const prompt = `Board state representation (64-element array):
${JSON.stringify(state.board)}

Select a valid move for White (uppercase piece: K, Q, R, B, N, P).
Respond ONLY with a raw JSON object on a single line, no markdown:
{"fromIndex": 48, "toIndex": 32, "comment": "komentar singkat dalam bahasa Indonesia"}`;

      const response = await groq.chat.completions.create({
        model: config.groqModel || 'qwen/qwen3-32b',
        messages: [
          { role: 'system', content: '/no_think\nYou are a Chess engine. Output ONLY a raw JSON object with keys fromIndex, toIndex, comment. No markdown, no backticks, no explanation.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2
      }, { chatId });

      const raw = response.choices[0].message.content || '';
      const jsonMatch = raw.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const res = JSON.parse(jsonMatch[0]);
        if (res.fromIndex !== undefined && res.toIndex !== undefined) {
          const cell = state.board[res.fromIndex];
          const destCell = state.board[res.toIndex];
          if (cell !== ' ' && cell === cell.toUpperCase() && (destCell === ' ' || destCell === destCell.toLowerCase())) {
            fromIdx = res.fromIndex;
            toIdx = res.toIndex;
            if (res.comment) comment = res.comment;
          }
        }
      }
    } catch (e) {
      console.warn('Groq AI move calculation failed:', e.message);
    }
  }

  if (fromIdx === null || toIdx === null) {
    const whitePieces = [];
    for (let i = 0; i < 64; i++) {
      const cell = state.board[i];
      if (cell !== ' ' && cell === cell.toUpperCase()) {
        whitePieces.push(i);
      }
    }
    
    whitePieces.sort(() => Math.random() - 0.5);
    for (const wp of whitePieces) {
      const r = Math.floor(wp / 8);
      const c = wp % 8;
      const targets = [];
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
      for (const d of dirs) {
        const nr = r + d[0];
        const nc = c + d[1];
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const destIdx = nr * 8 + nc;
          const destCell = state.board[destIdx];
          if (destCell === ' ' || destCell === destCell.toLowerCase()) {
            targets.push(destIdx);
          }
        }
      }
      if (targets.length > 0) {
        fromIdx = wp;
        toIdx = targets[Math.floor(Math.random() * targets.length)];
        comment = 'AI memilih langkah aman secara acak!';
        break;
      }
    }
  }

  if (fromIdx === null || toIdx === null) {
    state.status = '⚠️ AI tidak menemukan langkah valid!';
    return renderChess(state);
  }

  const piece = state.board[fromIdx];
  const targetCell = state.board[toIdx];
  const win = targetCell === 'k';

  // Execute move
  state.board[toIdx] = piece;
  state.board[fromIdx] = ' ';
  state.selectedSquare = null;

  if (win) {
    const xpRes = addXp(chatId, 100);
    addPoints(chatId, 25);
    const getTicket = Math.random() < 0.35;
    if (getTicket) addTickets(chatId, 1);
    const ticketMsg = getTicket ? '\n🎟️ *Bonus:* Anda mendapatkan *1 Tiket Gacha*!' : '';
    const lvMsg = xpRes.leveledUp ? `\n\n🎉 *LEVEL UP!* Level naik ke *${xpRes.level}*! 🚀` : '';
    state.status = `🎉 *AI menang untuk Anda! Raja hitam ditangkap!* 🎉\n💬 AI: "${comment}"\n⭐ +100 XP\n🪙 +25 Poin${ticketMsg}${lvMsg}`;
    state.isGameOver = true;
    state.isPlayerTurn = false;
    return renderChess(state);
  }

  state.isPlayerTurn = false;
  state.status = `AI melangkah untuk Anda: ${CHESS_PIECES[piece]} ke ${getChessSquareName(toIdx)}.\n💬 "${comment}"\n⏳ Giliran Bot AI berpikir...`;

  return {
    text: renderChess(state).text,
    keyboard: renderChess(state).keyboard,
    triggerBot: true
  };
}

export function handleChessForfeit(chatId) {
  const session = gameSessions.get(chatId);
  if (!session || session.gameType !== 'chess') {
    return getGameMenu();
  }
  const state = session.state;
  state.status = '🏳️ *Anda menyerah! Bot memenangkan pertandingan.*';
  state.isGameOver = true;
  state.isPlayerTurn = false;
  return renderChess(state);
}


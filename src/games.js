import { Markup } from 'telegraf';
import { Groq } from 'groq-sdk';
import { config } from './config.js';

const groqOptions = {};
if (config.groqApiKey) {
  groqOptions.apiKey = config.groqApiKey;
}
if (config.groqBaseUrl) {
  groqOptions.baseURL = config.groqBaseUrl;
}
const groq = config.groqApiKey ? new Groq(groqOptions) : null;

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
  EMPTY: '➖',
  X: '❌',
  O: '⭕'
};

// --- GAME MENU ---
export function getGameMenu() {
  const text = `🎮 *Pusat Game AI Agent* 🎮\n\nSelamat datang di Game Center! Pilih game yang ingin Anda mainkan di bawah ini menggunakan tombol menu.`;
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('❌ Tic Tac Toe ⭕', 'game:start:ttt'),
      Markup.button.callback('✊ Suit (RPS) 🖐️', 'game:start:suit')
    ],
    [
      Markup.button.callback('📝 Tebak Kata 🔍', 'game:start:tebak'),
      Markup.button.callback('🧮 Kuis Matematika ⚡', 'game:start:math')
    ],
    [
      Markup.button.callback('🎯 Tebak Hero FF 🎯', 'game:start:tebakff')
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
    makeBotTttMove(session.state);
  }

  return renderTicTacToe(session.state);
}

function renderTicTacToe(state) {
  const text = `🎮 *Tic Tac Toe* 🎮\n\nAnda: ❌\nBot: ⭕\n\n📢 *Status:* ${state.status}`;
  
  // Create 3x3 grid
  const buttons = [];
  for (let r = 0; r < 3; r++) {
    const row = [];
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const cell = state.board[idx];
      const emoji = cell === 'X' ? EMOJI_TTT.X : cell === 'O' ? EMOJI_TTT.O : EMOJI_TTT.EMPTY;
      // If cell is occupied or game is over, callback is inert or handled differently
      row.push(Markup.button.callback(emoji, `game:ttt:move:${idx}`));
    }
    buttons.push(row);
  }
  
  // Add menu button
  buttons.push([Markup.button.callback('🔙 Kembali ke Menu', 'game:menu')]);

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
    state.status = '🎉 *Selamat! Anda menang!* 🎉';
    state.isPlayerTurn = false;
    return renderTicTacToe(state);
  }

  if (state.board.every(cell => cell !== ' ')) {
    state.status = '🤝 *Permainan Seri!* 🤝';
    state.isPlayerTurn = false;
    return renderTicTacToe(state);
  }

  // Bot turn
  state.isPlayerTurn = false;
  state.status = '⏳ Bot sedang berpikir...';
  
  // Perform bot move with short delay simulated or immediately
  makeBotTttMove(state);

  return renderTicTacToe(state);
}

function makeBotTttMove(state) {
  const board = state.board;
  const botSym = state.botSymbol;
  const playSym = state.playerSymbol;

  // 1. Try to win in this turn
  for (let i = 0; i < 9; i++) {
    if (board[i] === ' ') {
      board[i] = botSym;
      if (checkTttWin(board, botSym)) {
        state.status = '😢 *Bot Menang!* Coba lagi nanti.';
        state.isPlayerTurn = false;
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
  }

  // Check draw after bot move
  if (board.every(cell => cell !== ' ')) {
    state.status = '🤝 *Permainan Seri!* 🤝';
    state.isPlayerTurn = false;
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
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        response_format: { type: 'json_object' }
      });

      const res = JSON.parse(response.choices[0].message.content.trim());
      if (['batu', 'gunting', 'kertas'].includes(res.botChoice.toLowerCase())) {
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
    outcome = `🎉 *Anda Menang!* Pilihan Anda ${emojiMap[playerChoice]} mengalahkan ${emojiMap[botChoice]} milik Bot.`;
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
export function startTebakKata(chatId) {
  const randomItem = TEBAK_KATA_WORDS[Math.floor(Math.random() * TEBAK_KATA_WORDS.length)];
  const session = {
    gameType: 'tebak',
    state: {
      word: randomItem.word,
      hint: randomItem.hint,
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

  let text = `📝 *Tebak Kata* 📝\n\n📌 *Kata:* \`${displayWord}\`\n\n💚 *Nyawa:* ${heartEmoji}\n📢 *Petunjuk:* ${state.showHint ? `_${state.hint}_` : '||Ketuk tombol di bawah untuk melihat petunjuk||'}\n\n💬 ${state.message}`;

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const keyboardButtons = [];
  
  // Check end game
  const isGameOver = state.lives <= 0;
  
  if (won) {
    text = `🎉 *Hebat! Anda Menang!* 🎉\n\n📌 *Kata:* \`${state.word}\`\n\nSemua huruf berhasil ditebak! Ingin bermain lagi?`;
    keyboardButtons.push([
      Markup.button.callback('🔄 Main Lagi', 'game:start:tebak'),
      Markup.button.callback('🔙 Menu Game', 'game:menu')
    ]);
  } else if (isGameOver) {
    text = `😢 *Game Over! Anda Kalah.* 😢\n\n📌 *Kata yang benar:* \`${state.word}\`\n\nNyawa Anda telah habis. Mau coba lagi?`;
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
  
  if (state.word.includes(letter)) {
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
    state.message = '✅ *Benar!* Keren, teruskan!';
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
    state.message = '✅ *Benar!* Hebat sekali, teruskan streak Anda!';
    generateTebakFfQuestion(state);
    return renderTebakFf(state, false);
  } else {
    const lastState = { ...state };
    gameSessions.delete(chatId);
    return renderTebakFf(lastState, true);
  }
}

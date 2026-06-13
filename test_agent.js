/**
 * test_agent.js — Test Komprehensif untuk AI Agent (/ai)
 *
 * Menguji:
 *   1. Koneksi Groq (ping test)
 *   2. Pembuatan scraper (anti-lazy code check)
 *   3. Pembuatan script Node.js sederhana
 *   4. Tool write_file — deteksi placeholder
 *   5. Pembuatan web scraper + validasi isi file
 *
 * Jalankan: node test_agent.js
 *
 * Catatan: config.workspaceDir = <project>/sandbox/
 *   Jadi write_file('scraper.js') → sandbox/scraper.js
 *   Jangan pakai prefix 'sandbox/' di prompt AI!
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// config.workspaceDir = <projectRoot>/sandbox — import langsung
import { config } from './src/config.js';

// ─── Warna terminal ──────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function log(level, msg) {
  const icons = { PASS: `${C.green}✅ PASS${C.reset}`, FAIL: `${C.red}❌ FAIL${C.reset}`, INFO: `${C.cyan}ℹ  INFO${C.reset}`, WARN: `${C.yellow}⚠  WARN${C.reset}` };
  console.log(`${icons[level] || level} ${msg}`);
}

// ─── Placeholder detector ────────────────────────────────────────────────────
const LAZY_PATTERNS = [
  /\/\/\s*TODO/i,
  /\/\/\s*\.\.\./,
  /\/\/\s*implement/i,
  /\/\/\s*add.*logic.*here/i,
  /\/\/\s*add.*parsing.*here/i,
  /\/\/\s*add.*code.*here/i,
  /\/\/\s*handle.*here/i,
  /\/\/\s*insert.*here/i,
  /\/\/\s*put.*code.*here/i,
  /\/\/\s*write.*here/i,
  /\/\/\s*your.*code/i,
  /\/\*\s*TODO\s*\*\//i,
  /\/\*\s*\.\.\.\s*\*\//,
  /\bplaceholder\b/i,
  /mock.*implementation/i,
  /stub.*function/i,
  /\/\/\s*rest of the code/i,
  /\/\/\s*more.*code/i,
  /\/\/\s*and so on/i,
  /\/\/\s*etc\./i,
  /\/\/\s*coming soon/i,
];

function detectLazyCode(code) {
  const hits = [];
  for (const pat of LAZY_PATTERNS) {
    const match = code.match(pat);
    if (match) hits.push(match[0].trim());
  }
  return hits;
}

// ─── Counters ────────────────────────────────────────────────────────────────
let passed = 0, failed = 0, warned = 0;

// ─── Import runAgent ─────────────────────────────────────────────────────────
let runAgent;
try {
  const mod = await import('./src/agent.js');
  runAgent = mod.runAgent;
  log('PASS', 'Import agent.js berhasil');
  passed++;
} catch (err) {
  log('FAIL', `Import agent.js gagal: ${err.message}`);
  failed++;
  process.exit(1);
}

// ─── Fake chatId & helpers ───────────────────────────────────────────────────
const CHAT_ID = 'test_' + Date.now();
// workspaceDir sudah mengarah ke folder sandbox/
const sandboxDir = config.workspaceDir;

function getStatus(msg) {
  process.stdout.write(`\r${C.dim}  → ${msg.padEnd(60)}${C.reset}`);
}

async function askAgent(prompt, label) {
  const history = [];
  const result = await runAgent(
    CHAT_ID,
    prompt,
    history,
    getStatus,
    null,
    { id: 999, first_name: 'Tester', language_code: 'id' },
    null
  );
  process.stdout.write('\r' + ' '.repeat(70) + '\r');
  return result;
}

// Hapus file test lama agar tidak false-positive dari run sebelumnya
const CLEANUP_FILES = ['scraper_hn.js', 'csv_to_json.js', 'hello_test.js'];
for (const f of CLEANUP_FILES) {
  const p = path.join(sandboxDir, f);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    log('INFO', `Cleaned up old test file: ${f}`);
  }
}

// ─── TEST 1: Koneksi dasar (simple math) ─────────────────────────────────────
console.log(`\n${C.bold}${C.cyan}══ TEST 1: Koneksi & Respons Dasar ═══════════════════════════════${C.reset}`);
try {
  const result = await askAgent('Berapa hasil dari 25 * 48?', 'math');
  if (result && result.text && result.text.includes('1200')) {
    log('PASS', `Kalkulasi dasar OK → "${result.text.substring(0, 80)}..."`);
    passed++;
  } else {
    log('WARN', `Respons diterima tapi tidak mengandung "1200": "${(result?.text || '').substring(0, 100)}"`);
    warned++;
  }
} catch (err) {
  log('FAIL', `Test 1 error: ${err.message}`);
  failed++;
}

// ─── TEST 2: Pembuatan scraper — deteksi anti-lazy ───────────────────────────
console.log(`\n${C.bold}${C.cyan}══ TEST 2: Buat Scraper (Anti-Lazy Code Check) ════════════════════${C.reset}`);
try {
  log('INFO', 'Meminta AI membuat scraper berita...');
  const result = await askAgent(
    'Buatkan script Node.js scraper berita dari https://news.ycombinator.com/ yang mengambil judul dan link dari 10 berita teratas lalu print ke console. Simpan ke file scraper_hn.js (gunakan axios + cheerio, kode harus LENGKAP dan bisa langsung dijalankan)',
    'scraper'
  );

  process.stdout.write('\r' + ' '.repeat(70) + '\r');

  // Cek apakah file scraper berhasil dibuat (AI write ke workspaceDir/scraper_hn.js)
  const scraperPath = path.join(sandboxDir, 'scraper_hn.js');
  log('INFO', `Mencari file di: ${scraperPath}`);
  if (fs.existsSync(scraperPath)) {
    const code = fs.readFileSync(scraperPath, 'utf8');
    log('PASS', `File scraper_hn.js berhasil dibuat (${code.length} chars)`);
    passed++;

    // Cek placeholder/lazy code
    const lazyHits = detectLazyCode(code);
    if (lazyHits.length > 0) {
      log('FAIL', `Kode LAZY terdeteksi! Placeholder ditemukan:\n    ${lazyHits.map(h => `"${h}"`).join('\n    ')}`);
      failed++;
    } else {
      log('PASS', 'Tidak ada placeholder/TODO/lazy code di scraper_hn.js ✓');
      passed++;
    }

    // Cek kode minimal memiliki axios/cheerio/fetch + fungsi utama
    const hasHttpLib = /require\(['"]axios['"]|require\(['"]cheerio['"]|require\(['"]got['"]|import axios|import \* as cheerio|from ['"]axios['"]|from ['"]cheerio['"]|fetch\s*\(/i.test(code);
    if (hasHttpLib) {
      log('PASS', 'Scraper menggunakan library HTTP yang valid ✓');
      passed++;
    } else {
      log('WARN', 'Scraper tidak terdeteksi menggunakan library HTTP standar (axios/cheerio/got/fetch)');
      warned++;
    }

    // Cek ada minimal 15 baris kode (bukan file kosong/stub)
    const lines = code.split('\n').filter(l => l.trim().length > 0);
    if (lines.length >= 15) {
      log('PASS', `Scraper memiliki ${lines.length} baris kode (tidak kosong) ✓`);
      passed++;
    } else {
      log('FAIL', `Scraper hanya punya ${lines.length} baris kode — terlalu pendek, kemungkinan tidak lengkap`);
      failed++;
    }

  } else {
    log('WARN', 'File scraper_hn.js tidak ditemukan di sandbox. Mungkin AI tidak menulis file langsung.');
    // Cek di respons teks
    if (result && result.text) {
      const lazyHitsInText = detectLazyCode(result.text);
      if (lazyHitsInText.length > 0) {
        log('FAIL', `Kode LAZY di respons teks:\n    ${lazyHitsInText.map(h => `"${h}"`).join('\n    ')}`);
        failed++;
      } else {
        log('WARN', 'AI merespons tapi tidak membuat file. Perlu pemeriksaan manual.');
        warned++;
      }
    }
  }
} catch (err) {
  log('FAIL', `Test 2 error: ${err.message}`);
  failed++;
}

// ─── TEST 3: Buat script Node.js (complete check) ────────────────────────────
console.log(`\n${C.bold}${C.cyan}══ TEST 3: Buat Script Node.js Lengkap ════════════════════════════${C.reset}`);
try {
  log('INFO', 'Meminta AI membuat script konverter CSV ke JSON...');
  const result = await askAgent(
    'Buatkan script Node.js bernama csv_to_json.js yang membaca file CSV (nama file sebagai argumen command line: process.argv[2]), mengkonversi setiap baris menjadi objek JSON menggunakan header baris pertama sebagai key, lalu menulis hasilnya ke file .json dengan nama yang sama. Gunakan hanya built-in Node.js (fs, path) tanpa npm package tambahan. Kode harus LENGKAP, tidak ada TODO atau placeholder.',
    'csv_to_json'
  );

  process.stdout.write('\r' + ' '.repeat(70) + '\r');

  const scriptPath = path.join(sandboxDir, 'csv_to_json.js');
  log('INFO', `Mencari file di: ${scriptPath}`);
  if (fs.existsSync(scriptPath)) {
    const code = fs.readFileSync(scriptPath, 'utf8');
    log('PASS', `File csv_to_json.js berhasil dibuat (${code.length} chars)`);
    passed++;

    // Anti-lazy check
    const lazyHits = detectLazyCode(code);
    if (lazyHits.length > 0) {
      log('FAIL', `Placeholder terdeteksi di csv_to_json.js:\n    ${lazyHits.map(h => `"${h}"`).join('\n    ')}`);
      failed++;
    } else {
      log('PASS', 'Tidak ada placeholder/lazy code di csv_to_json.js ✓');
      passed++;
    }

    // Cek penggunaan fs
    if (/require\(['"]fs['"]|from ['"]fs['"]|import fs/i.test(code)) {
      log('PASS', 'Script menggunakan Node.js built-in fs ✓');
      passed++;
    } else {
      log('WARN', 'Script tidak terdeteksi menggunakan fs module');
      warned++;
    }

    // Cek ada logika parsing CSV (split/parse)
    if (/split\s*\(|parse|map\s*\(|forEach|reduce/i.test(code)) {
      log('PASS', 'Script mengandung logika parsing data ✓');
      passed++;
    } else {
      log('FAIL', 'Script tidak mengandung logika parsing — kemungkinan tidak lengkap');
      failed++;
    }

  } else {
    log('WARN', 'File csv_to_json.js tidak ditemukan — AI mungkin tidak membuat file secara langsung');
    warned++;
  }
} catch (err) {
  log('FAIL', `Test 3 error: ${err.message}`);
  failed++;
}

// ─── TEST 4: Deteksi placeholder di write_file (simulasi) ────────────────────
console.log(`\n${C.bold}${C.cyan}══ TEST 4: Validasi Inline Placeholder Detection ══════════════════${C.reset}`);

const LAZY_CODE_SAMPLES = [
  { label: 'Comment TODO',         code: 'const x = 1;\n// TODO: implement this\nconsole.log(x);' },
  { label: 'Comment ...',          code: 'function doStuff() {\n  // ...\n}' },
  { label: 'implement logic here', code: 'function parse(data) {\n  // implement logic here\n  return null;\n}' },
  { label: 'add parsing here',     code: 'axios.get(url).then(res => {\n  // add parsing here\n});' },
];

const COMPLETE_CODE_SAMPLES = [
  {
    label: 'Scraper lengkap',
    code: `const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeHN() {
  try {
    const response = await axios.get('https://news.ycombinator.com/');
    const $ = cheerio.load(response.data);
    const results = [];
    $('.storylink, .titleline > a').slice(0, 10).each((i, el) => {
      results.push({ title: $(el).text().trim(), url: $(el).attr('href') });
    });
    results.forEach((item, i) => console.log(\`\${i + 1}. \${item.title} → \${item.url}\`));
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

scrapeHN();`
  },
];

let allLazyDetected = true;
for (const sample of LAZY_CODE_SAMPLES) {
  const hits = detectLazyCode(sample.code);
  if (hits.length > 0) {
    log('PASS', `Placeholder "${sample.label}" terdeteksi → ${hits[0]}`);
    passed++;
  } else {
    log('FAIL', `Placeholder "${sample.label}" TIDAK terdeteksi — regex mungkin salah`);
    failed++;
    allLazyDetected = false;
  }
}

for (const sample of COMPLETE_CODE_SAMPLES) {
  const hits = detectLazyCode(sample.code);
  if (hits.length === 0) {
    log('PASS', `Kode lengkap "${sample.label}" tidak menghasilkan false positive ✓`);
    passed++;
  } else {
    log('WARN', `False positive di "${sample.label}": ${hits[0]}`);
    warned++;
  }
}

// ─── TEST 5: Cek file scraper yang dibuat — bisa diparse Node ────────────────
console.log(`\n${C.bold}${C.cyan}══ TEST 5: Syntax Check File yang Dibuat AI ══════════════════════${C.reset}`);

const filesToCheck = [
  path.join(sandboxDir, 'scraper_hn.js'),
  path.join(sandboxDir, 'csv_to_json.js'),
];

let syntaxCheckCount = 0;
for (const fPath of filesToCheck) {
  if (!fs.existsSync(fPath)) {
    log('WARN', `File tidak ada untuk syntax check: ${path.basename(fPath)}`);
    warned++;
    continue;
  }
  try {
    const { execSync } = await import('child_process');
    const result = execSync(`node --check "${fPath}"`, { encoding: 'utf8', timeout: 10000 });
    log('PASS', `Syntax OK: ${path.basename(fPath)} ✓`);
    passed++;
    syntaxCheckCount++;
  } catch (err) {
    log('FAIL', `Syntax error di ${path.basename(fPath)}: ${err.stderr || err.message}`);
    failed++;
  }
}

if (syntaxCheckCount === 0 && filesToCheck.every(f => !fs.existsSync(f))) {
  log('WARN', 'Tidak ada file yang tersedia untuk syntax check (AI mungkin tidak membuat file)');
  warned++;
}

// ─── TEST 6: Pengujian Fitur run_js_file ─────────────────────────────────────
console.log(`\n${C.bold}${C.cyan}══ TEST 6: Uji Fitur Eksekusi Berkas JS & Output Gambar ══════════${C.reset}`);
try {
  const testJsPath = path.join(sandboxDir, 'hello_test.js');
  fs.writeFileSync(testJsPath, `console.log("Halo, ini test output konsol!");\nconsole.error("Ini pesan error tiruan!");`, 'utf8');
  log('INFO', 'Membuat file hello_test.js untuk diuji...');

  log('INFO', 'Meminta AI menjalankan hello_test.js...');
  const result = await askAgent('Jalankan file hello_test.js di workspace dan kembalikan hasilnya.', 'run_js');

  process.stdout.write('\r' + ' '.repeat(70) + '\r');

  // Cek apakah file gambar hasil konsol berhasil dibuat
  const files = fs.readdirSync(sandboxDir);
  const consoleImg = files.find(f => f.startsWith('console_output_') && f.endsWith('.png'));

  if (consoleImg) {
    const consoleImgPath = path.join(sandboxDir, consoleImg);
    log('PASS', `File gambar terminal output berhasil dibuat: ${consoleImg} (${fs.statSync(consoleImgPath).size} bytes) ✓`);
    passed++;
    
    // Hapus file test setelah berhasil
    fs.unlinkSync(testJsPath);
    fs.unlinkSync(consoleImgPath);
    log('INFO', 'Membersihkan file pengujian hello_test.js dan gambar output ✓');
  } else {
    log('FAIL', 'File gambar console_output_*.png tidak ditemukan di sandbox workspace.');
    failed++;
  }
} catch (err) {
  log('FAIL', `Test 6 error: ${err.message}`);
  failed++;
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────────
console.log(`\n${C.bold}═══════════════════════════════════════════════════════════════════${C.reset}`);
console.log(`${C.bold}📊 HASIL TEST AGENT (/ai)${C.reset}`);
console.log(`═══════════════════════════════════════════════════════════════════`);
console.log(`  ${C.green}✅ PASS  : ${passed}${C.reset}`);
console.log(`  ${C.red}❌ FAIL  : ${failed}${C.reset}`);
console.log(`  ${C.yellow}⚠  WARN  : ${warned}${C.reset}`);
console.log(`═══════════════════════════════════════════════════════════════════\n`);

if (failed === 0) {
  console.log(`${C.green}${C.bold}🎉 Semua test kritis LULUS! Agent AI siap digunakan.${C.reset}\n`);
  process.exit(0);
} else {
  console.log(`${C.red}${C.bold}⛔ Ada ${failed} test yang GAGAL. Periksa kembali system prompt dan tool handlers.${C.reset}\n`);
  process.exit(1);
}

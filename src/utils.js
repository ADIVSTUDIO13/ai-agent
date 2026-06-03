import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Groq } from 'groq-sdk';
import { Jimp } from 'jimp';
import AdmZip from 'adm-zip';
import { config } from './config.js';
import { igdl, ttdl, fbdown, twitter } from 'btch-downloader';

const USER_AGENTS = [
  // Chrome on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  
  // Chrome on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  
  // Firefox on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  
  // Firefox on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0',
  
  // Safari on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  
  // Edge on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
  
  // Chrome on Android
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
  
  // Samsung Internet on Android
  'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  
  // Safari on iOS
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/605.1.15',
  
  // Chrome on iOS
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.0.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1',
  
  // Chrome on Linux
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  
  // Firefox on Linux
  'Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  
  // Opera on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0'
];

export function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

const execAsync = promisify(exec);


async function checkCommand(cmd) {
  try {
    await execAsync(`${cmd} --version`);
    return true;
  } catch (err) {
    return false;
  }
}


export async function getYtDlpPath() {
  
  if (await checkCommand('yt-dlp')) {
    return 'yt-dlp';
  }

  
  const isWindows = process.platform === 'win32';
  const binaryName = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
  const binPath = path.join(config.binDir, binaryName);

  if (fs.existsSync(binPath)) {
    return binPath;
  }

  
  try {
    console.log(`yt-dlp not found in PATH. Downloading to ${binPath}...`);
    if (!fs.existsSync(config.binDir)) {
      fs.mkdirSync(config.binDir, { recursive: true });
    }

    const downloadUrl = isWindows
      ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
      : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

    const response = await axios({
      method: 'get',
      url: downloadUrl,
      responseType: 'stream',
    });

    const writer = fs.createWriteStream(binPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      response.data.on('error', reject);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    if (!isWindows) {
      fs.chmodSync(binPath, '755');
    }

    console.log(`yt-dlp downloaded successfully!`);
    return binPath;
  } catch (error) {
    console.error('Failed to download yt-dlp:', error.message);
    throw new Error('yt-dlp is not installed and automatic download failed: ' + error.message);
  }
}


function getFfmpegDownloadUrls() {
  const platform = process.platform;
  const arch = process.arch;

  let platformKey = '';
  if (platform === 'win32') {
    platformKey = arch === 'x64' ? 'win-64' : 'win-32';
  } else if (platform === 'darwin') {
    platformKey = 'osx-64';
  } else if (platform === 'linux') {
    if (arch === 'arm64') {
      platformKey = 'linux-arm-64';
    } else if (arch === 'arm') {
      platformKey = 'linux-arm-32';
    } else {
      platformKey = arch === 'x64' ? 'linux-64' : 'linux-32';
    }
  }

  if (!platformKey) {
    throw new Error(`Platform/architecture tidak didukung untuk ffmpeg otomatis: ${platform} ${arch}`);
  }

  return {
    ffmpeg: `https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-${platformKey}.zip`,
    ffprobe: `https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffprobe-4.4.1-${platformKey}.zip`
  };
}


export async function getFfmpegPath() {
  if (await checkCommand('ffmpeg')) {
    return 'ffmpeg';
  }

  const isWindows = process.platform === 'win32';
  const binaryName = isWindows ? 'ffmpeg.exe' : 'ffmpeg';
  const binPath = path.join(config.binDir, binaryName);

  if (fs.existsSync(binPath)) {
    return binPath;
  }

  try {
    console.log(`ffmpeg not found in PATH. Downloading to ${binPath}...`);
    if (!fs.existsSync(config.binDir)) {
      fs.mkdirSync(config.binDir, { recursive: true });
    }

    const urls = getFfmpegDownloadUrls();
    const downloadUrl = urls.ffmpeg;
    const zipPath = path.join(config.binDir, `ffmpeg_temp_${Date.now()}.zip`);

    const response = await axios({
      method: 'get',
      url: downloadUrl,
      responseType: 'stream',
    });

    const writer = fs.createWriteStream(zipPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      response.data.on('error', reject);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(config.binDir, true);

    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }

    if (!fs.existsSync(binPath)) {
      throw new Error(`Binary ${binaryName} was not found in the extracted zip!`);
    }

    if (!isWindows) {
      fs.chmodSync(binPath, '755');
    }

    console.log(`ffmpeg downloaded and extracted successfully!`);
    return binPath;
  } catch (error) {
    console.error('Failed to download ffmpeg:', error.message);
    throw new Error('ffmpeg is not installed and automatic download failed: ' + error.message);
  }
}


export async function getFfprobePath() {
  if (await checkCommand('ffprobe')) {
    return 'ffprobe';
  }

  const isWindows = process.platform === 'win32';
  const binaryName = isWindows ? 'ffprobe.exe' : 'ffprobe';
  const binPath = path.join(config.binDir, binaryName);

  if (fs.existsSync(binPath)) {
    return binPath;
  }

  try {
    console.log(`ffprobe not found in PATH. Downloading to ${binPath}...`);
    if (!fs.existsSync(config.binDir)) {
      fs.mkdirSync(config.binDir, { recursive: true });
    }

    const urls = getFfmpegDownloadUrls();
    const downloadUrl = urls.ffprobe;
    const zipPath = path.join(config.binDir, `ffprobe_temp_${Date.now()}.zip`);

    const response = await axios({
      method: 'get',
      url: downloadUrl,
      responseType: 'stream',
    });

    const writer = fs.createWriteStream(zipPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      response.data.on('error', reject);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(config.binDir, true);

    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }

    if (!fs.existsSync(binPath)) {
      throw new Error(`Binary ${binaryName} was not found in the extracted zip!`);
    }

    if (!isWindows) {
      fs.chmodSync(binPath, '755');
    }

    console.log(`ffprobe downloaded and extracted successfully!`);
    return binPath;
  } catch (error) {
    console.error('Failed to download ffprobe:', error.message);
    throw new Error('ffprobe is not installed and automatic download failed: ' + error.message);
  }
}



export async function resolveRedirect(url) {
  try {
    console.log(`Resolving redirect for URL: ${url}`);
    const response = await axios.get(url, {
      maxRedirects: 10,
      responseType: 'stream',
      headers: {
        'User-Agent': getRandomUserAgent()
      }
    });
    
    const resolvedUrl = response.request?.res?.responseUrl || response.headers?.location || url;
    
    
    if (response.data && typeof response.data.destroy === 'function') {
      response.data.destroy();
    }
    
    console.log(`Resolved URL: ${resolvedUrl}`);
    return resolvedUrl;
  } catch (err) {
    if (err.response?.request?.res?.responseUrl) {
      console.log(`Resolved URL from error response: ${err.response.request.res.responseUrl}`);
      return err.response.request.res.responseUrl;
    }
    console.warn(`Failed to resolve redirect for ${url}: ${err.message}`);
    return url;
  }
}


export async function downloadFromBtch(url, outputPath) {
  let mediaUrl = null;
  const lowerUrl = url.toLowerCase();
  
  try {
    if (lowerUrl.includes('instagram.com')) {
      const res = await igdl(url);
      if (Array.isArray(res) && res.length > 0 && res[0].url) {
        mediaUrl = res[0].url;
      } else if (typeof res === 'string' && res.startsWith('http')) {
        mediaUrl = res;
      }
    } else if (lowerUrl.includes('tiktok.com')) {
      const res = await ttdl(url);
      if (res && res.video && res.video[0]) {
        mediaUrl = res.video[0];
      }
    } else if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch')) {
      const res = await fbdown(url);
      if (res && (res.HD || res.Normal_video)) {
        mediaUrl = res.HD || res.Normal_video;
      }
    } else if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
      const res = await twitter(url);
      if (res && Array.isArray(res.url) && res.url.length > 0) {
        mediaUrl = res.url[0].hd || res.url[0].sd || (res.url[1] && (res.url[1].hd || res.url[1].sd));
      }
    }
  } catch (err) {
    console.error('Error in downloadFromBtch extractor:', err.message);
  }
  
  if (!mediaUrl) {
    throw new Error('Gagal mengekstrak direct URL menggunakan btch-downloader.');
  }
  
  return await downloadTelegramFile(mediaUrl, outputPath);
}

export async function downloadVideo(url, outputDir, type = 'video', signal = null) {
  const resolvedUrl = await resolveRedirect(url);
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = Date.now();
  const prefix = type === 'audio' ? 'aud' : 'vid';
  let downloadedPath = null;

  // 1. Try downloading with yt-dlp first
  try {
    const ytDlp = await getYtDlpPath();
    const filenameTemplate = path.join(outputDir, `${prefix}_${timestamp}.%(ext)s`);
    
    let cmd;
    if (type === 'audio') {
      cmd = `"${ytDlp}" -f "bestaudio[ext=m4a]/bestaudio" --no-playlist --no-warnings -o "${filenameTemplate}" "${resolvedUrl}"`;
    } else {
      cmd = `"${ytDlp}" -f "best[ext=mp4]/best" --no-playlist --no-warnings -o "${filenameTemplate}" "${resolvedUrl}"`;
    }
    
    console.log(`Executing download command (${type}) via yt-dlp: ${cmd}`);

    const binDir = path.resolve(config.binDir);
    const env = { ...process.env };
    if (process.platform === 'win32') {
      const pathKey = Object.keys(env).find(k => k.toLowerCase() === 'path') || 'Path';
      env[pathKey] = `${binDir};${env[pathKey] || ''}`;
      env.PATH = env[pathKey];
      env.Path = env[pathKey];
    } else {
      env.PATH = `${binDir}:${env.PATH || ''}`;
    }

    const { stdout, stderr } = await execAsync(cmd, {
      maxBuffer: 10 * 1024 * 1024, 
      timeout: 300_000,             
      signal,
      env
    });
    if (stdout && stdout.trim()) console.log('yt-dlp stdout:', stdout.substring(0, 500));
    if (stderr && stderr.trim()) console.warn('yt-dlp stderr:', stderr.substring(0, 500));

    const files = fs.readdirSync(outputDir);
    const downloadedFile = files.find(
      (file) => file.startsWith(`${prefix}_${timestamp}`) && !file.endsWith('.part') && !file.endsWith('.ytdl') && !file.endsWith('.tmp')
    );

    if (downloadedFile) {
      downloadedPath = path.join(outputDir, downloadedFile);
    }
  } catch (ytDlpErr) {
    console.warn('yt-dlp download failed, checking fallback...', ytDlpErr.message);
  }

  // 2. Fallback to btch-downloader for social media websites if yt-dlp fails
  if (!downloadedPath) {
    console.log('Attempting download via btch-downloader fallback...');
    try {
      const ext = type === 'audio' ? 'mp3' : 'mp4';
      const fallbackPath = path.join(outputDir, `${prefix}_${timestamp}.${ext}`);
      downloadedPath = await downloadFromBtch(resolvedUrl, fallbackPath);
      console.log('Successfully downloaded via btch-downloader fallback!');
    } catch (fallbackErr) {
      console.error('btch-downloader fallback failed:', fallbackErr.message);
    }
  }

  if (!downloadedPath) {
    throw new Error(
      `Gagal mengunduh ${type === 'audio' ? 'audio' : 'video'} dari URL ini. Silakan periksa kembali tautannya.\nURL: ${url}`
    );
  }

  return downloadedPath;
}

export async function getYtMetadata(url) {
  const ytDlp = await getYtDlpPath();
  const cmd = `"${ytDlp}" --dump-json --no-playlist --no-warnings "${url}"`;

  const binDir = path.resolve(config.binDir);
  const env = { ...process.env };
  if (process.platform === 'win32') {
    const pathKey = Object.keys(env).find(k => k.toLowerCase() === 'path') || 'Path';
    env[pathKey] = `${binDir};${env[pathKey] || ''}`;
    env.PATH = env[pathKey];
    env.Path = env[pathKey];
  } else {
    env.PATH = `${binDir}:${env.PATH || ''}`;
  }

  try {
    const { stdout } = await execAsync(cmd, { 
      timeout: 15000, 
      env 
    });
    const data = JSON.parse(stdout);
    
    const durSec = data.duration || 0;
    let durationStr = 'N/A';
    if (durSec) {
      const hrs = Math.floor(durSec / 3600);
      const mins = Math.floor((durSec % 3600) / 60);
      const secs = durSec % 60;
      durationStr = hrs > 0 
        ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        : `${mins}:${String(secs).padStart(2, '0')}`;
    }

    return {
      title: data.title || 'Unknown Title',
      thumbnail: data.thumbnail || 'https://img.youtube.com/vi/default/hqdefault.jpg',
      uploader: data.uploader || 'Unknown Channel',
      duration: durationStr,
      views: data.view_count || 0
    };
  } catch (err) {
    console.error('Failed to get YouTube metadata:', err.message);
    return null;
  }
}


export function isPathSafe(targetPath) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedSandbox = path.resolve(config.workspaceDir);
  return resolvedTarget.startsWith(resolvedSandbox);
}


export function ensureSandbox() {
  if (!fs.existsSync(config.workspaceDir)) {
    fs.mkdirSync(config.workspaceDir, { recursive: true });
  }
}


export async function searchWikipedia(query) {
  try {
    const response = await axios.get('https://en.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        list: 'search',
        srsearch: query,
        format: 'json',
      },
      headers: {
        'User-Agent': getRandomUserAgent()
      }
    });

    const searchResults = response.data?.query?.search || [];
    if (searchResults.length === 0) {
      return `No results found for "${query}" on Wikipedia.`;
    }

    return searchResults.map(item => {
      const snippet = item.snippet.replace(/<span class="searchmatch">/g, '').replace(/<\/span>/g, '').replace(/&quot;/g, '"');
      return `Title: ${item.title}\nSnippet: ${snippet}\nURL: https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`;
    }).join('\n\n');
  } catch (err) {
    return `Error searching Wikipedia: ${err.message}`;
  }
}

// Download and extract plain text from any webpage URL
export async function fetchWebpage(url, signal = null) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': getRandomUserAgent()
      },
      timeout: 10000,
      signal
    });

    const html = response.data;
    if (typeof html !== 'string') {
      return 'Error: Page content is not HTML or text.';
    }

    // Clean scripts, styles, tags
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return text.substring(0, 4000); // 4000 characters maximum context
  } catch (err) {
    return `Error fetching webpage: ${err.message}`;
  }
}

// Generate image via Pollinations AI
export async function downloadPollinationsImage(prompt, outputDir, signal = null) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = Date.now();
  const filename = `img_${timestamp}.jpg`;
  const outputPath = path.join(outputDir, filename);

  try {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=qwen-image&nologo=true&width=1024&height=768`;
    const response = await axios({
      method: 'get',
      url,
      responseType: 'stream',
      timeout: 60000,
      signal
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      response.data.on('error', reject);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    return outputPath;
  } catch (err) {
    throw new Error(`Failed to generate/download image: ${err.message}`);
  }
}

// Download any URL to a local destination file
export async function downloadTelegramFile(url, outputPath) {
  const response = await axios({
    method: 'get',
    url,
    responseType: 'stream',
    timeout: 30000
  });

  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    response.data.on('error', reject);
    writer.on('finish', () => resolve(outputPath));
    writer.on('error', reject);
  });
}

// Decodes a Google News article URL using batchexecute
async function getArticleUrl(googleRssUrl) {
  try {
    const response = await axios.get(googleRssUrl, {
      headers: {
        'User-Agent': getRandomUserAgent()
      },
      timeout: 6000
    });

    const $ = cheerio.load(response.data);
    let data = null;
    $('c-wiz').each((i, elem) => {
      const dp = $(elem).attr('data-p');
      if (dp && dp.includes('%.@.')) {
        data = dp;
      }
    });

    if (!data) {
      return googleRssUrl;
    }

    const obj = JSON.parse(data.replace('%.@.', '["garturlreq",'));
    const payload = {
      'f.req': JSON.stringify([[
        ['Fbv4je', JSON.stringify([...obj.slice(0, -6), ...obj.slice(-2)]), 'null', 'generic']
      ]])
    };

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': getRandomUserAgent()
    };

    const postResponse = await axios.post(
      'https://news.google.com/_/DotsSplashUi/data/batchexecute',
      new URLSearchParams(payload).toString(),
      { headers, timeout: 6000 }
    );

    const rawData = postResponse.data;
    const cleanJson = rawData.replace(")]}'\n", "");
    const parsedData = JSON.parse(cleanJson);
    const arrayString = parsedData[0][2];
    const articleUrl = JSON.parse(arrayString)[1];
    
    return articleUrl || googleRssUrl;
  } catch (error) {
    if (error.response?.status !== 429) {
      console.warn("Error decoding Google News URL:", error.message);
    }
    return googleRssUrl;
  }
}

// Search Google News for recent articles and return clean resolved links
export async function searchGoogleNews(query) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=id&gl=ID&ceid=ID:id`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': getRandomUserAgent()
      },
      timeout: 10000
    });

    const xml = response.data;
    if (typeof xml !== 'string') {
      return 'Gagal memuat berita dari Google.';
    }

    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const itemContent = match[1];
      const titleMatch = itemContent.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/);
      const pubDateMatch = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const sourceMatch = itemContent.match(/<source[^>]*>([\s\S]*?)<\/source>/);

      const title = titleMatch ? titleMatch[1].trim() : 'Tanpa Judul';
      const link = linkMatch ? linkMatch[1].trim() : '';
      const pubDate = pubDateMatch ? pubDateMatch[1].trim() : '';
      const source = sourceMatch ? sourceMatch[1].trim() : 'Sumber Tidak Dikenal';

      const cleanText = (str) => str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

      items.push({
        title: cleanText(title),
        link: cleanText(link),
        pubDate: cleanText(pubDate),
        source: cleanText(source)
      });
    }

    if (items.length === 0) {
      return `Tidak ada berita yang ditemukan untuk "${query}" di Google News.`;
    }

    const results = [];
    for (const item of items) {
      const resolvedLink = await getArticleUrl(item.link);
      results.push(`Judul: ${item.title}\nSumber: ${item.source}\nTanggal: ${item.pubDate}\nLink: ${resolvedLink}`);
    }

    return results.join('\n\n');
  } catch (err) {
    return `Error mencari berita Google: ${err.message}`;
  }
}

const groqOptions = {};
if (config.groqApiKey) {
  groqOptions.apiKey = config.groqApiKey;
}
if (config.groqBaseUrl) {
  groqOptions.baseURL = config.groqBaseUrl;
}
const groqClient = config.groqApiKey ? new Groq(groqOptions) : null;

function calculateFeelsLike(temp, humidity, windSpeedKmph) {
  const tempC = parseFloat(temp);
  const hu = parseFloat(humidity);
  const wsMps = parseFloat(windSpeedKmph) / 3.6;
  if (isNaN(tempC) || isNaN(hu)) return temp;
  const e = (hu / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));
  const windFactor = isNaN(wsMps) ? 0 : wsMps;
  const feelsLike = tempC + 0.33 * e - 0.70 * windFactor - 4.0;
  return Math.round(feelsLike);
}

function generateWeatherRecommendation(desc, temp) {
  const lower = desc.toLowerCase();
  if (lower.includes('petir')) {
    return 'Waspada hujan petir! Hindari tempat terbuka dan berteduhlah di bangunan yang aman.';
  }
  if (lower.includes('hujan')) {
    return 'Bawa payung atau jas hujan karena ada potensi hujan.';
  }
  if (lower.includes('cerah') && temp >= 33) {
    return 'Cuaca cukup panas, gunakan tabir surya dan pastikan minum air yang cukup.';
  }
  if (lower.includes('cerah')) {
    return 'Cuaca cerah dan bagus untuk beraktivitas di luar ruangan.';
  }
  if (lower.includes('berawan')) {
    return 'Cuaca berawan, nyaman untuk aktivitas luar ruangan tanpa terik matahari langsung.';
  }
  return 'Tetap pantau kondisi cuaca sebelum beraktivitas di luar ruangan.';
}

export function getWeatherEmoji(desc) {
  if (!desc) return '🌡️';
  const lower = desc.toLowerCase();
  if (lower.includes('petir')) return '⛈️';
  if (lower.includes('lebat')) return '🌧️';
  if (lower.includes('hujan')) {
    if (lower.includes('lokal') || lower.includes('ringan')) return '🌦️';
    return '🌧️';
  }
  if (lower.includes('cerah berawan')) return '🌤️';
  if (lower.includes('cerah')) return '☀️';
  if (lower.includes('berawan')) return '☁️';
  if (lower.includes('kabut') || lower.includes('kabur')) return '🌫️';
  return '🌡️';
}

export async function getBmkgLocationInfo(cityName) {
  if (!groqClient) {
    throw new Error('Groq client is not initialized in utils.js');
  }

  const prompt = `You are a helper that maps a city or region name in Indonesia to its BMKG adm4 (subdistrict/village) weather code and the province name formatted for the BMKG weather URL.
The province name should be formatted specifically for the BMKG URL parameter 'Prov' (e.g., using underscores instead of spaces, and proper casing, like DKI_Jakarta, Jawa_Barat, Jawa_Timur, Jawa_Tengah, DI_Yogyakarta, Banten, Sumatera_Utara, Bali, etc.).

Examples:
- Jakarta Pusat: 31.71.01.1001 (DKI_Jakarta)
- Bandung: 32.73.08.1001 (Jawa_Barat)
- Surabaya: 35.78.01.1001 (Jawa_Timur)
- Medan: 12.71.03.1001 (Sumatera_Utara)
- Makassar: 73.71.01.1001 (Sulawesi_Selatan)

Please find the closest matching BMKG adm4 code and the correct province URL parameter for: "${cityName}".
Respond ONLY with a valid JSON object matching this schema, no other text:
{
  "adm4": "string (the 10-digit code with dots)",
  "province": "string (formatted province name, e.g. 'DKI_Jakarta')",
  "locationName": "string (the actual matched location/subdistrict/village/city name)"
}`;

  const response = await groqClient.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    response_format: { type: 'json_object' }
  });

  return JSON.parse(response.choices[0].message.content.trim());
}

export async function fetchBmkgWeather(city) {
  // 1. Get adm4 and province from getBmkgLocationInfo
  const locationInfo = await getBmkgLocationInfo(city);
  if (!locationInfo || !locationInfo.adm4) {
    throw new Error(`Location mapping failed for city: ${city}`);
  }

  const { adm4, province, locationName } = locationInfo;

  // 2. Fetch from BMKG weather API
  const url = `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${adm4}`;
  const response = await axios.get(url, { timeout: 8000 });
  const data = response.data;

  const firstData = data.data?.[0];
  if (!firstData || !firstData.cuaca) {
    throw new Error(`Invalid BMKG API response for code: ${adm4}`);
  }

  
  const allForecasts = firstData.cuaca.flat();
  const now = new Date();
  let closestForecast = null;
  let minDiff = Infinity;

  for (const f of allForecasts) {
    const fTime = new Date(f.datetime);
    const diff = Math.abs(fTime - now);
    if (diff < minDiff) {
      minDiff = diff;
      closestForecast = f;
    }
  }

  if (!closestForecast) {
    throw new Error(`No weather forecast found for city: ${city}`);
  }

  
  const tempC = closestForecast.t;
  const humidity = closestForecast.hu;
  const desc = closestForecast.weather_desc;
  const windKmph = closestForecast.ws;
  const visibilityText = closestForecast.vs_text || `${closestForecast.vs / 1000} km`;
  const visibility = closestForecast.vs ? `${Math.round(closestForecast.vs / 1000)} km` : visibilityText;

  
  const feelsLike = calculateFeelsLike(tempC, humidity, windKmph);

  
  const recommendation = generateWeatherRecommendation(desc, tempC);

  
  const resolvedLocation = firstData.lokasi
    ? `${firstData.lokasi.kecamatan || firstData.lokasi.kotkab}, ${firstData.lokasi.provinsi}`
    : `${locationName}, ${province}`;

  return {
    location: resolvedLocation,
    tempC,
    feelsLike,
    description: desc,
    humidity,
    windKmph,
    visibility,
    recommendation,
    province,
    url: `https://www.bmkg.go.id/cuaca/prakiraan-cuaca.bmkg?Prov=${province}`
  };
}

export async function compressImageIfLarge(filePath, maxMb = 5) {
  try {
    if (!fs.existsSync(filePath)) return;
    
    const stats = fs.statSync(filePath);
    const fileSizeMb = stats.size / (1024 * 1024);
    
    if (fileSizeMb > maxMb) {
      console.log(`[Compression] Image size ${fileSizeMb.toFixed(2)}MB is above ${maxMb}MB. Compressing...`);
      const image = await Jimp.read(filePath);
      
      let quality = 80;
      let buffer = await image.getBuffer('image/jpeg', { quality });
      
      if (buffer.length / (1024 * 1024) > maxMb) {
        quality = 50;
        if (image.width > 2000) {
          image.resize({ w: 1600, h: Jimp.AUTO });
        }
        buffer = await image.getBuffer('image/jpeg', { quality });
      }
      
      fs.writeFileSync(filePath, buffer);
      const newStats = fs.statSync(filePath);
      console.log(`[Compression] Compressed successfully from ${fileSizeMb.toFixed(2)}MB to ${(newStats.size / (1024 * 1024)).toFixed(2)}MB`);
    }
  } catch (err) {
    console.error('[Compression] Failed to compress image:', err.message);
  }
}


export async function generateTts(text, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = Date.now();
  const outputPath = path.join(outputDir, `tts_${timestamp}.mp3`);
  const cleanText = text.trim().substring(0, 200);
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=id&client=tw-ob&q=${encodeURIComponent(cleanText)}`;

  try {
    const response = await axios({
      method: 'get',
      url,
      responseType: 'stream',
      headers: {
        'User-Agent': getRandomUserAgent()
      },
      timeout: 10000
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      response.data.on('error', reject);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    return outputPath;
  } catch (err) {
    throw new Error(`Failed to generate TTS: ${err.message}`);
  }
}


export async function createMemeImage(topic, outputDir, signal = null) {
  if (!groqClient) {
    throw new Error('Groq client is not initialized in utils.js');
  }

  const prompt = `You are a creative meme generator. Generate a hilarious meme based on the topic: "${topic}".
Respond ONLY with a valid JSON object matching this schema, no other text:
{
  "bgPrompt": "a description of the image background to generate, e.g. 'a confused cat staring at a computer screen, cartoon style'",
  "topText": "the top text of the meme in Indonesian, uppercase, funny, short",
  "bottomText": "the bottom text of the meme in Indonesian, uppercase, funny, short"
}`;

  const response = await groqClient.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    response_format: { type: 'json_object' }
  });

  const memeData = JSON.parse(response.choices[0].message.content.trim());
  const { bgPrompt, topText, bottomText } = memeData;

  const bgPath = await downloadPollinationsImage(bgPrompt, outputDir, signal);
  const image = await Jimp.read(bgPath);

  const { loadFont, measureText } = await import('jimp');
  const { SANS_64_WHITE, SANS_64_BLACK, SANS_32_WHITE, SANS_32_BLACK } = await import('jimp/fonts');

  const fontWhite = await loadFont(SANS_64_WHITE);
  const fontBlack = await loadFont(SANS_64_BLACK);
  const fontWhiteSmall = await loadFont(SANS_32_WHITE);
  const fontBlackSmall = await loadFont(SANS_32_BLACK);

  const printMemeText = (text, yPosition, isTop) => {
    let currentFontWhite = fontWhite;
    let currentFontBlack = fontBlack;
    let lines = wrapText(currentFontWhite, text, image.width - 40);
    
    if (lines.length > 2) {
      currentFontWhite = fontWhiteSmall;
      currentFontBlack = fontBlackSmall;
      lines = wrapText(currentFontWhite, text, image.width - 40);
    }

    const fontSize = currentFontWhite.info?.size || 64;
    const lineHeight = fontSize + 10;
    
    let startY = yPosition;
    if (!isTop) {
      startY = yPosition - (lines.length - 1) * lineHeight;
    }

    let currentY = startY;
    for (const line of lines) {
      const lineWidth = measureText(currentFontWhite, line);
      const x = Math.max(0, Math.floor((image.width - lineWidth) / 2));
      
      const offsets = [
        [-2, -2], [2, -2], [-2, 2], [2, 2],
        [-2, 0], [2, 0], [0, -2], [0, 2]
      ];
      for (const [ox, oy] of offsets) {
        image.print({ font: currentFontBlack, x: x + ox, y: currentY + oy, text: line });
      }
      
      image.print({ font: currentFontWhite, x: x, y: currentY, text: line });
      currentY += lineHeight;
    }
  };

  function wrapText(font, txt, maxWidth) {
    const words = txt.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = measureText(font, testLine);
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  }

  if (topText) {
    printMemeText(topText.toUpperCase(), 20, true);
  }

  if (bottomText) {
    const fontSizeEstimate = 64;
    printMemeText(bottomText.toUpperCase(), image.height - 40 - fontSizeEstimate, false);
  }

  const timestamp = Date.now();
  const outputPath = path.join(outputDir, `meme_${timestamp}.jpg`);

  const buffer = await image.getBuffer('image/jpeg');
  fs.writeFileSync(outputPath, buffer);

  if (fs.existsSync(bgPath)) {
    fs.unlinkSync(bgPath);
  }

  return {
    memePath: outputPath,
    topText,
    bottomText,
    bgPrompt
  };
}






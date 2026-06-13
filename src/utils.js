import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import * as cheerio from 'cheerio';
import Groq from 'groq-sdk';
import mime from 'mime';
import { Jimp } from 'jimp';
import AdmZip from 'adm-zip';
import { config } from './config.js';
import { igdl, ttdl, fbdown, twitter } from 'btch-downloader';
import dns from 'dns';
import vm from 'vm';
import got from 'got';
import https from 'https';

dns.setServers(['8.8.8.8', '1.1.1.1']);

const customLookup = (hostname, options, callback) => {
  dns.resolve4(hostname, (err, addresses) => {
    if (err || !addresses || addresses.length === 0) {
      dns.resolve6(hostname, (err6, addresses6) => {
        if (err6 || !addresses6 || addresses6.length === 0) {
          dns.lookup(hostname, options, callback);
        } else {
          if (options.all) {
            callback(null, addresses6.map(addr => ({ address: addr, family: 6 })));
          } else {
            callback(null, addresses6[0], 6);
          }
        }
      });
    } else {
      if (options.all) {
        callback(null, addresses.map(addr => ({ address: addr, family: 4 })));
      } else {
        callback(null, addresses[0], 4);
      }
    }
  });
};

const customAgent = new https.Agent({ lookup: customLookup });

function decryptSnapHtml(body) {
  const evalIdx = body.indexOf('eval(function(h,u,n,t,e,r)');
  if (evalIdx === -1) {
    throw new Error('Eval block not found in response');
  }
  const prefix = body.substring(0, evalIdx);
  const evalPart = body.substring(evalIdx);
  const cleanEvalPart = evalPart.replace('eval(function', '(function');
  const codeToRun = prefix + '\nconst decrypted = ' + cleanEvalPart + ';\ndecrypted;';
  const context = {};
  vm.createContext(context);
  return vm.runInContext(codeToRun, context);
}

import { USER_AGENTS, getRandomUserAgent, getRandomIP, getBypassHeaders } from './useragents.js';
import { wrapGroqClient } from './usage.js';

export { USER_AGENTS, getRandomUserAgent, getRandomIP, getBypassHeaders };

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


async function getInstagramUrl(url, signal = null) {
  try {
    const response = await got.post('https://snapinsta.app/action.php', {
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'content-type': 'application/x-www-form-urlencoded',
        'origin': 'https://snapinsta.app',
        'referer': 'https://snapinsta.app/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      },
      form: {
        url: url,
        action: 'post'
      },
      agent: {
        https: customAgent
      },
      timeout: { request: 15000 }
    });
    
    const decrypted = decryptSnapHtml(response.body);
    const $ = cheerio.load(decrypted);
    let downloadUrl = $('a.btn-download').attr('href');
    if (downloadUrl) {
      if (!downloadUrl.startsWith('http')) {
        downloadUrl = 'https://snapinsta.app' + downloadUrl;
      }
      return downloadUrl;
    }
  } catch (err) {
    console.error('Instagram download via Snapinsta failed:', err.message);
  }

  try {
    const response = await got.post('https://snapsave.app/action.php?lang=id', {
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'content-type': 'application/x-www-form-urlencoded',
        'origin': 'https://snapsave.app',
        'referer': 'https://snapsave.app/id',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      },
      form: {
        url: url
      },
      agent: {
        https: customAgent
      },
      timeout: { request: 15000 }
    });
    
    const decrypted = decryptSnapHtml(response.body);
    const $ = cheerio.load(decrypted);
    let downloadUrl = $('a.btn-download').attr('href') || $('tbody tr').first().find('td').eq(2).find('a').attr('href');
    if (downloadUrl) {
      if (downloadUrl.includes('get_progressApi')) {
        const match = downloadUrl.match(/get_progressApi\('(.*?)'\)/);
        if (match) downloadUrl = match[1];
      }
      if (!downloadUrl.startsWith('http')) {
        downloadUrl = 'https://snapsave.app' + downloadUrl;
      }
      return downloadUrl;
    }
  } catch (err) {
    console.error('Instagram download via Snapsave fallback failed:', err.message);
  }

  const res = await igdl(url);
  if (Array.isArray(res) && res.length > 0 && res[0].url) {
    return res[0].url;
  } else if (typeof res === 'string' && res.startsWith('http')) {
    return res;
  }
  
  throw new Error('Gagal mengekstrak direct URL untuk Instagram.');
}

async function getTikTokUrl(url, signal = null) {
  try {
    const searchRes = await got.post('https://lovetik.com/api/ajax/search', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      },
      form: {
        query: url
      },
      timeout: { request: 15000 }
    });
    
    const data = JSON.parse(searchRes.body);
    if (data.status === 'ok' && data.links && data.links.length > 0) {
      const directUrl = data.links[1]?.a || data.links[0]?.a;
      if (directUrl) return directUrl;
    }
  } catch (err) {
    console.error('TikTok download via Lovetik failed:', err.message);
  }

  const res = await ttdl(url);
  if (res && res.video && res.video[0]) {
    return res.video[0];
  }
  
  throw new Error('Gagal mengekstrak direct URL untuk TikTok.');
}

async function getFacebookUrl(url, signal = null) {
  try {
    const response = await got.post('https://snapsave.app/action.php?lang=id', {
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'content-type': 'application/x-www-form-urlencoded',
        'origin': 'https://snapsave.app',
        'referer': 'https://snapsave.app/id',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      },
      form: {
        url: url
      },
      agent: {
        https: customAgent
      },
      timeout: { request: 15000 }
    });
    
    const decrypted = decryptSnapHtml(response.body);
    const $ = cheerio.load(decrypted);
    
    let downloadUrl = null;
    $('tbody > tr').each((i, trElem) => {
      const tds = $(trElem).find('td');
      const resText = tds.eq(0).text().trim().toLowerCase();
      let href = tds.eq(2).find('a').attr('href') || tds.eq(2).find('button').attr('onclick');
      if (href && href.includes('get_progressApi')) {
        const match = href.match(/get_progressApi\('(.*?)'\)/);
        if (match) href = match[1];
      }
      if (href && !href.startsWith('http')) {
        href = 'https://snapsave.app' + href;
      }
      if (href) {
        if (resText.includes('hd')) {
          downloadUrl = href;
          return false;
        }
        if (!downloadUrl) {
          downloadUrl = href;
        }
      }
    });
    
    if (downloadUrl) return downloadUrl;
  } catch (err) {
    console.error('Facebook download via Snapsave failed:', err.message);
  }

  const res = await fbdown(url);
  if (res && (res.HD || res.Normal_video)) {
    return res.HD || res.Normal_video;
  }

  throw new Error('Gagal mengekstrak direct URL untuk Facebook.');
}

async function getTwitterUrl(url, signal = null) {
  const res = await twitter(url);
  if (res && Array.isArray(res.url) && res.url.length > 0) {
    return res.url[0].hd || res.url[0].sd || (res.url[1] && (res.url[1].hd || res.url[1].sd));
  }
  throw new Error('Gagal mengekstrak direct URL untuk Twitter/X.');
}

export async function downloadMediaFile(url, outputPath, signal = null) {
  if (signal && signal.aborted) {
    throw new Error('STOPPED');
  }

  const fileStream = fs.createWriteStream(outputPath);
  
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      fileStream.destroy();
      if (fs.existsSync(outputPath)) {
        try { fs.unlinkSync(outputPath); } catch (e) {}
      }
      reject(new Error('STOPPED'));
    };

    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort);
    }

    const downloadStream = got.stream(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Referer': url.includes('instagram.com') ? 'https://snapinsta.app/' : 'https://snapsave.app/'
      },
      agent: {
        https: customAgent
      },
      timeout: {
        request: 60000
      }
    });

    downloadStream.pipe(fileStream);

    downloadStream.on('end', () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve(outputPath);
    });

    downloadStream.on('error', (err) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      fileStream.destroy();
      if (fs.existsSync(outputPath)) {
        try { fs.unlinkSync(outputPath); } catch (e) {}
      }
      reject(err);
    });

    fileStream.on('error', (err) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      fileStream.destroy();
      if (fs.existsSync(outputPath)) {
        try { fs.unlinkSync(outputPath); } catch (e) {}
      }
      reject(err);
    });
  });
}

export async function downloadFromBtch(url, outputPath, signal = null) {
  if (signal && signal.aborted) {
    throw new Error('STOPPED');
  }
  let mediaUrl = null;
  const lowerUrl = url.toLowerCase();
  
  try {
    if (lowerUrl.includes('instagram.com')) {
      if (signal && signal.aborted) throw new Error('STOPPED');
      mediaUrl = await getInstagramUrl(url, signal);
    } else if (lowerUrl.includes('tiktok.com')) {
      if (signal && signal.aborted) throw new Error('STOPPED');
      mediaUrl = await getTikTokUrl(url, signal);
    } else if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch')) {
      if (signal && signal.aborted) throw new Error('STOPPED');
      mediaUrl = await getFacebookUrl(url, signal);
    } else if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
      if (signal && signal.aborted) throw new Error('STOPPED');
      mediaUrl = await getTwitterUrl(url, signal);
    }
  } catch (err) {
    if (signal && signal.aborted || err.message === 'STOPPED') {
      throw new Error('STOPPED');
    }
    console.error('Error in downloadFromBtch extractor:', err.message);
  }
  
  if (!mediaUrl) {
    throw new Error('Gagal mengekstrak direct URL menggunakan btch-downloader.');
  }
  
  if (signal && signal.aborted) {
    throw new Error('STOPPED');
  }
  return await downloadMediaFile(mediaUrl, outputPath, signal);
}


async function transcodeFile(inputPath, outputPath, isAudio = true, signal = null) {
  const ffmpegPath = await getFfmpegPath();
  let cmd;
  if (isAudio) {
    cmd = `"${ffmpegPath}" -y -i "${inputPath}" -vn -ar 44100 -ac 2 -b:a 192k "${outputPath}"`;
  } else {
    cmd = `"${ffmpegPath}" -y -i "${inputPath}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${outputPath}"`;
  }
  console.log(`Transcoding file to requested format: ${cmd}`);
  await execWithTreeKill(cmd, { timeout: 300_000 }, signal);
}

export async function downloadVideo(url, outputDir, type = 'video', signal = null) {
  if (signal && signal.aborted) {
    throw new Error('STOPPED');
  }
  const resolvedUrl = await resolveRedirect(url);
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = Date.now();
  const typeLower = type.toLowerCase().trim();
  const audioFormats = ['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac', 'opus', 'alac', 'vorbis', 'mka'];
  const videoFormats = ['mp4', 'mkv', 'webm', 'avi', 'flv', 'mov'];
  
  let isAudio = typeLower === 'audio' || audioFormats.includes(typeLower);
  let requestedFormat = 'mp4';
  if (isAudio) {
    requestedFormat = audioFormats.includes(typeLower) ? typeLower : 'mp3';
  } else {
    requestedFormat = videoFormats.includes(typeLower) ? typeLower : 'mp4';
  }

  const prefix = isAudio ? 'aud' : 'vid';
  let downloadedPath = null;

  // 1. Try downloading with yt-dlp first
  try {
    const ytDlp = await getYtDlpPath();
    const filenameTemplate = path.join(outputDir, `${prefix}_${timestamp}.%(ext)s`);
    
    let cmd;
    if (isAudio) {
      if (requestedFormat === 'm4a') {
        cmd = `"${ytDlp}" -f "bestaudio[ext=m4a]/bestaudio" --no-playlist --no-warnings -o "${filenameTemplate}" "${resolvedUrl}"`;
      } else {
        cmd = `"${ytDlp}" -x --audio-format ${requestedFormat} --audio-quality 0 --no-playlist --no-warnings -o "${filenameTemplate}" "${resolvedUrl}"`;
      }
    } else {
      if (requestedFormat === 'mp4') {
        cmd = `"${ytDlp}" -f "best[ext=mp4]/best" --no-playlist --no-warnings -o "${filenameTemplate}" "${resolvedUrl}"`;
      } else {
        cmd = `"${ytDlp}" -f "bestvideo+bestaudio/best" --merge-output-format ${requestedFormat} --no-playlist --no-warnings -o "${filenameTemplate}" "${resolvedUrl}"`;
      }
    }
    
    console.log(`Executing download command (${typeLower}) via yt-dlp: ${cmd}`);

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

    const { stdout, stderr } = await execWithTreeKill(cmd, {
      maxBuffer: 10 * 1024 * 1024, 
      timeout: 300_000,             
      env
    }, signal);
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
    if (signal && signal.aborted || ytDlpErr.name === 'AbortError') {
      throw new Error('STOPPED');
    }
    console.warn('yt-dlp download failed, checking fallback...', ytDlpErr.message);
  }

  if (signal && signal.aborted) {
    throw new Error('STOPPED');
  }

  // 2. Fallback to btch-downloader for social media websites if yt-dlp fails
  if (!downloadedPath) {
    console.log('Attempting download via btch-downloader fallback...');
    try {
      let rawExt = resolvedUrl.split('?')[0].split('.').pop() || '';
      if (!/^[a-zA-Z0-9]{3,4}$/.test(rawExt)) {
        rawExt = isAudio ? 'm4a' : 'mp4';
      }
      
      const tempFallbackPath = path.join(outputDir, `fallback_temp_${timestamp}.${rawExt}`);
      await downloadFromBtch(resolvedUrl, tempFallbackPath, signal);
      
      const finalPath = path.join(outputDir, `${prefix}_${timestamp}.${requestedFormat}`);
      
      if (rawExt !== requestedFormat) {
        console.log(`Converting fallback file from ${rawExt} to ${requestedFormat}...`);
        await transcodeFile(tempFallbackPath, finalPath, isAudio, signal);
        if (fs.existsSync(tempFallbackPath)) {
          fs.unlinkSync(tempFallbackPath);
        }
      } else {
        fs.renameSync(tempFallbackPath, finalPath);
      }
      
      downloadedPath = finalPath;
      console.log('Successfully downloaded and transcoded via btch-downloader fallback!');
    } catch (fallbackErr) {
      if (signal && signal.aborted || fallbackErr.message === 'STOPPED') {
        throw new Error('STOPPED');
      }
      console.error('btch-downloader fallback failed:', fallbackErr.message);
    }
  }

  if (!downloadedPath) {
    throw new Error(
      `Gagal mengunduh ${isAudio ? 'audio' : 'video'} dari URL ini. Silakan periksa kembali tautannya.\nURL: ${url}`
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


export async function searchWikipedia(query, signal = null) {
  try {
    const response = await axios.get('https://en.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        list: 'search',
        srsearch: query,
        format: 'json',
      },
      headers: getBypassHeaders('en.wikipedia.org'),
      signal: signal || undefined
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
    if (signal && signal.aborted || err.message === 'STOPPED') {
      throw new Error('STOPPED');
    }
    return `Error searching Wikipedia: ${err.message}`;
  }
}

// Download and extract plain text from any webpage URL
export async function fetchWebpage(url, signal = null) {
  try {
    let hostname = '';
    try {
      hostname = new URL(url).hostname;
    } catch (e) {}
    const response = await axios.get(url, {
      headers: getBypassHeaders(hostname),
      timeout: 10000,
      signal: signal || undefined
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
    const apiKey = config.pollinationsApiKey;
    if (!apiKey) {
      throw new Error('POLLINATIONS_API_KEY is missing in .env file. Please get a free key at https://enter.pollinations.ai');
    }
    const url = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=flux&nologo=true&width=1024&height=768&key=${apiKey}`;
    const response = await axios({
      method: 'get',
      url,
      responseType: 'stream',
      timeout: 60000,
      signal: signal || undefined
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      const onAbort = () => {
        writer.destroy();
        response.data.destroy();
        if (fs.existsSync(outputPath)) {
          try { fs.unlinkSync(outputPath); } catch (e) {}
        }
        reject(new Error('STOPPED'));
      };

      if (signal) {
        signal.addEventListener('abort', onAbort);
      }

      response.data.on('error', (err) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(err);
      });
      writer.on('finish', () => {
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve();
      });
      writer.on('error', (err) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(err);
      });
    });

    return outputPath;
  } catch (err) {
    if (signal && signal.aborted || err.message === 'STOPPED') {
      throw new Error('STOPPED');
    }
    throw new Error(`Failed to generate/download image: ${err.message}`);
  }
}

// Download any URL to a local destination file
export async function downloadTelegramFile(url, outputPath, signal = null) {
  if (signal && signal.aborted) {
    throw new Error('STOPPED');
  }

  const response = await axios({
    method: 'get',
    url,
    responseType: 'stream',
    timeout: 30000,
    signal: signal || undefined
  });

  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      writer.destroy();
      response.data.destroy();
      if (fs.existsSync(outputPath)) {
        try { fs.unlinkSync(outputPath); } catch (e) {}
      }
      reject(new Error('STOPPED'));
    };

    if (signal) {
      signal.addEventListener('abort', onAbort);
    }

    response.data.on('error', (err) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(err);
    });
    writer.on('finish', () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve(outputPath);
    });
    writer.on('error', (err) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(err);
    });
  });
}

// Decodes a Google News article URL using batchexecute
async function getArticleUrl(googleRssUrl, signal = null) {
  try {
    const response = await axios.get(googleRssUrl, {
      headers: {
        'User-Agent': getRandomUserAgent()
      },
      timeout: 6000,
      signal: signal || undefined
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
      { headers, timeout: 6000, signal: signal || undefined }
    );

    const rawData = postResponse.data;
    const cleanJson = rawData.replace(")]}'\n", "");
    const parsedData = JSON.parse(cleanJson);
    const arrayString = parsedData[0][2];
    const articleUrl = JSON.parse(arrayString)[1];
    
    return articleUrl || googleRssUrl;
  } catch (error) {
    if (signal && signal.aborted || error.message === 'STOPPED') {
      throw new Error('STOPPED');
    }
    if (error.response?.status !== 429) {
      console.warn("Error decoding Google News URL:", error.message);
    }
    return googleRssUrl;
  }
}

// Search Google News for recent articles and return clean resolved links
export async function searchGoogleNews(query, signal = null) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=id&gl=ID&ceid=ID:id`;
    const response = await axios.get(url, {
      headers: getBypassHeaders('news.google.com'),
      timeout: 10000,
      signal: signal || undefined
    });

    const xml = response.data;
    if (typeof xml !== 'string') {
      return 'Gagal memuat berita dari Google.';
    }

    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      if (signal && signal.aborted) throw new Error('STOPPED');
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
      if (signal && signal.aborted) throw new Error('STOPPED');
      const resolvedLink = await getArticleUrl(item.link, signal);
      results.push(`Judul: ${item.title}\nSumber: ${item.source}\nTanggal: ${item.pubDate}\nLink: ${resolvedLink}`);
    }

    return results.join('\n\n');
  } catch (err) {
    if (signal && signal.aborted || err.message === 'STOPPED') {
      throw new Error('STOPPED');
    }
    return `Error mencari berita Google: ${err.message}`;
  }
}

const groq = config.groqApiKey ? wrapGroqClient(new Groq({ apiKey: config.groqApiKey })) : null;

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

export async function getBmkgLocationInfo(cityName, signal = null, chatId = null) {
  if (signal && signal.aborted) {
    throw new Error('STOPPED');
  }
  if (!groq) {
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

  const response = await groq.chat.completions.create({
    model: config.groqModel || 'qwen/qwen3-32b',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    response_format: { type: 'json_object' }
  }, { chatId });

  return JSON.parse(response.choices[0].message.content.trim());
}

export async function fetchBmkgWeather(city, signal = null, chatId = null) {
  if (signal && signal.aborted) {
    throw new Error('STOPPED');
  }
  // 1. Get adm4 and province from getBmkgLocationInfo
  const locationInfo = await getBmkgLocationInfo(city, signal, chatId);
  if (!locationInfo || !locationInfo.adm4) {
    throw new Error(`Location mapping failed for city: ${city}`);
  }

  const { adm4, province, locationName } = locationInfo;

  if (signal && signal.aborted) {
    throw new Error('STOPPED');
  }

  // 2. Fetch from BMKG weather API
  const url = `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${adm4}`;
  const response = await axios.get(url, {
    headers: getBypassHeaders('api.bmkg.go.id'),
    timeout: 8000,
    signal: signal || undefined
  });
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
    if (signal && signal.aborted) {
      throw new Error('STOPPED');
    }
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


export async function compressAudioIfLarge(filePath, maxMb = 10, signal = null) {
  try {
    if (!fs.existsSync(filePath)) return;
    
    const stats = fs.statSync(filePath);
    const fileSizeMb = stats.size / (1024 * 1024);
    
    if (fileSizeMb > maxMb) {
      console.log(`[Audio Compression] File size ${fileSizeMb.toFixed(2)}MB is above ${maxMb}MB. Compressing...`);
      
      const ffmpegPath = await getFfmpegPath();
      const tempPath = filePath + '_compressed.mp3';
      
      // Execute audio compression to mono 64k mp3
      const cmd = `"${ffmpegPath}" -y -i "${filePath}" -map 0:a:0 -b:a 64k -ac 1 "${tempPath}"`;
      
      console.log(`[Audio Compression] Executing: ${cmd}`);
      await execWithTreeKill(cmd, {}, signal);
      
      if (fs.existsSync(tempPath)) {
        fs.copyFileSync(tempPath, filePath);
        fs.unlinkSync(tempPath);
        
        const newStats = fs.statSync(filePath);
        console.log(`[Audio Compression] Compressed successfully from ${fileSizeMb.toFixed(2)}MB to ${(newStats.size / (1024 * 1024)).toFixed(2)}MB`);
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('[Audio Compression] Compression aborted by signal.');
    } else {
      console.error('[Audio Compression] Failed to compress audio:', err.message);
    }
  }
}



export async function optimizeAudioFile(inputPath, outputPath, options = {}, signal = null) {
  const ffmpegPath = await getFfmpegPath();
  
  const enhancement = options.enhancement || 'normalization';
  const targetFormat = options.format || 'mp3';
  const quality = options.quality || 'medium';
  
  let bitrate = '128k';
  if (quality === 'low') bitrate = '64k';
  if (quality === 'high') bitrate = '192k';
  
  // Audio filters for enhancement (using loudnorm and limiter to prevent clipping and tinny/cempereng sound)
  let filter = 'loudnorm=I=-16:TP=-1.5:LRA=11'; 
  if (enhancement === 'bass_boost') {
    filter = 'bass=g=5:f=80:w=0.5,loudnorm=I=-16:TP=-1.5:LRA=11';
  } else if (enhancement === 'vocal_clarity') {
    filter = 'highpass=f=80,equalizer=f=3000:width_type=q:width=1:g=3,loudnorm=I=-16:TP=-1.5:LRA=11';
  } else if (enhancement === 'none') {
    filter = 'alimiter=limit=0.95';
  }
  
  let cmd = `"${ffmpegPath}" -y -i "${inputPath}"`;
  if (filter) {
    cmd += ` -af "${filter}"`;
  }
  
  if (targetFormat === 'mp3') {
    cmd += ` -c:a libmp3lame -b:a ${bitrate} "${outputPath}"`;
  } else if (targetFormat === 'm4a') {
    cmd += ` -c:a aac -b:a ${bitrate} "${outputPath}"`;
  } else if (targetFormat === 'ogg') {
    cmd += ` -c:a libvorbis -b:a ${bitrate} "${outputPath}"`;
  } else {
    cmd += ` -b:a ${bitrate} "${outputPath}"`;
  }
  
  console.log(`[Audio Optimization] Executing: ${cmd}`);
  await execWithTreeKill(cmd, {}, signal);
}

export async function trimAudioFile(inputPath, outputPath, startTime, endTime, signal = null) {
  const ffmpegPath = await getFfmpegPath();
  const cmd = `"${ffmpegPath}" -y -ss ${startTime} -to ${endTime} -i "${inputPath}" -c:a libmp3lame -q:a 2 "${outputPath}"`;
  console.log(`[Trim Audio] Executing: ${cmd}`);
  await execWithTreeKill(cmd, {}, signal);
}

export async function extractAudioFromVideo(videoPath, outputPath, format = 'mp3', signal = null) {
  const ffmpegPath = await getFfmpegPath();
  let cmd;
  if (format === 'mp3') {
    cmd = `"${ffmpegPath}" -y -i "${videoPath}" -vn -c:a libmp3lame -q:a 2 "${outputPath}"`;
  } else if (format === 'm4a') {
    cmd = `"${ffmpegPath}" -y -i "${videoPath}" -vn -c:a aac -b:a 128k "${outputPath}"`;
  } else if (format === 'wav') {
    cmd = `"${ffmpegPath}" -y -i "${videoPath}" -vn -c:a pcm_s16le "${outputPath}"`;
  } else if (format === 'ogg') {
    cmd = `"${ffmpegPath}" -y -i "${videoPath}" -vn -c:a libvorbis -q:a 4 "${outputPath}"`;
  } else {
    cmd = `"${ffmpegPath}" -y -i "${videoPath}" -vn -c:a libmp3lame -q:a 2 "${outputPath}"`;
  }
  console.log(`[Extract Audio] Executing: ${cmd}`);
  await execWithTreeKill(cmd, {}, signal);
}

function convertToWav(rawData, mimeType) {
  const options = parseMimeType(mimeType);
  const wavHeader = createWavHeader(rawData.length, options);
  const buffer = Buffer.from(rawData, 'base64');
  return Buffer.concat([wavHeader, buffer]);
}

function parseMimeType(mimeType) {
  const [fileType, ...params] = mimeType.split(';').map(s => s.trim());
  const [_, format] = fileType.split('/');

  const options = {
    numChannels: 1,
    sampleRate: 24000,
    bitsPerSample: 16
  };

  if (format && format.startsWith('L')) {
    const bits = parseInt(format.slice(1), 10);
    if (!isNaN(bits)) {
      options.bitsPerSample = bits;
    }
  }

  for (const param of params) {
    const [key, value] = param.split('=').map(s => s.trim());
    if (key === 'rate') {
      options.sampleRate = parseInt(value, 10);
    }
  }

  return options;
}

function createWavHeader(dataLength, options) {
  const {
    numChannels,
    sampleRate,
    bitsPerSample,
  } = options;

  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0);                      // ChunkID
  buffer.writeUInt32LE(36 + dataLength, 4);     // ChunkSize
  buffer.write('WAVE', 8);                      // Format
  buffer.write('fmt ', 12);                     // Subchunk1ID
  buffer.writeUInt32LE(16, 16);                 // Subchunk1Size (PCM)
  buffer.writeUInt16LE(1, 20);                  // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22);        // NumChannels
  buffer.writeUInt32LE(sampleRate, 24);         // SampleRate
  buffer.writeUInt32LE(byteRate, 28);           // ByteRate
  buffer.writeUInt16LE(blockAlign, 32);         // BlockAlign
  buffer.writeUInt16LE(bitsPerSample, 34);      // BitsPerSample
  buffer.write('data', 36);                     // Subchunk2ID
  buffer.writeUInt32LE(dataLength, 40);         // Subchunk2Size

  return buffer;
}

export async function generateTts(text, outputDir, signal = null) {
  if (signal && signal.aborted) {
    throw new Error('STOPPED');
  }
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    const sanitizedText = text.replace(/[*_`]/g, '').trim();
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(sanitizedText.substring(0, 200))}&tl=id&client=tw-ob`;
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': getRandomUserAgent()
      },
      timeout: 10000,
      signal: signal || undefined
    });
    const timestamp = Date.now();
    const outputPath = path.join(outputDir, `tts_${timestamp}.mp3`);
    fs.writeFileSync(outputPath, res.data);
    return outputPath;
  } catch (err) {
    if (signal && signal.aborted || err.message === 'STOPPED') {
      throw new Error('STOPPED');
    }
    throw new Error(`Failed to generate TTS: ${err.message}`);
  }
}


export async function applyTtsVoiceEffect(filePath, personality, gender = null, signal = null) {
  try {
    if (!fs.existsSync(filePath)) return;
    if (signal && signal.aborted) {
      throw new Error('STOPPED');
    }

    let filter = null;
    
    // Resolve gender based on explicit selection or personality default
    const resolvedGender = gender || (
      (personality === 'wibu' || personality === 'tsundere') ? 'female' :
      (personality === 'mentor' || personality === 'sarcastic') ? 'male' : 'female'
    );

    if (resolvedGender === 'male') {
      if (personality === 'wibu') {
        // Soft male anime boy voice (smooth pitch-down, gentle)
        filter = 'asetrate=44100*0.82,atempo=1.22';
      } else if (personality === 'mentor') {
        // Coding mentor: deep male voice
        filter = 'asetrate=44100*0.78,atempo=1.28';
      } else if (personality === 'tsundere') {
        // Fast, slightly higher pitch male voice
        filter = 'asetrate=44100*0.86,atempo=1.16';
      } else {
        // General soft male voice
        filter = 'asetrate=44100*0.80,atempo=1.25';
      }
    } else { // female
      if (personality === 'wibu') {
        // Kawaii/soft female voice (smooth pitch-up, slightly slowed down to sound cute/gentle)
        filter = 'asetrate=44100*1.12,atempo=0.893';
      } else if (personality === 'tsundere') {
        // Tsundere female voice: snappy/slightly fast
        filter = 'asetrate=44100*1.15,atempo=0.91';
      } else if (personality === 'sarcastic') {
        // Monotone/deep female voice
        filter = 'asetrate=44100*0.95,atempo=1.05';
      } else if (personality === 'professional') {
        // Professional female voice: clear, structured
        filter = 'asetrate=44100*1.05,atempo=0.95';
      } else {
        // General soft female voice
        filter = 'asetrate=44100*1.08,atempo=0.925';
      }
    }

    if (filter) {
      console.log(`[TTS Effect] Applying voice filter (${personality}/${resolvedGender}): ${filter}`);
      const ffmpegPath = await getFfmpegPath();
      const tempPath = filePath + '_effect.mp3';
      
      const cmd = `"${ffmpegPath}" -y -i "${filePath}" -filter:a "${filter}" "${tempPath}"`;
      await execWithTreeKill(cmd, {}, signal);
      
      if (fs.existsSync(tempPath)) {
        fs.copyFileSync(tempPath, filePath);
        fs.unlinkSync(tempPath);
        console.log(`[TTS Effect] Personality/gender effect applied successfully.`);
      }
    }
  } catch (err) {
    if (signal && signal.aborted || err.message === 'STOPPED' || err.name === 'AbortError') {
      throw new Error('STOPPED');
    }
    console.error('[TTS Effect] Failed to apply voice effect:', err.message);
  }
}



export async function createMemeImage(topic, outputDir, signal = null, chatId = null) {
  if (!groq) {
    throw new Error('Groq client is not initialized in utils.js');
  }

  const prompt = `You are a creative meme generator. Generate a hilarious meme based on the topic: "${topic}".
Respond ONLY with a valid JSON object matching this schema, no other text:
{
  "bgPrompt": "a description of the image background to generate, e.g. 'a confused cat staring at a computer screen, cartoon style'",
  "topText": "the top text of the meme in Indonesian, uppercase, funny, short",
  "bottomText": "the bottom text of the meme in Indonesian, uppercase, funny, short"
}`;

  const response = await groq.chat.completions.create({
    model: config.groqModel || 'qwen/qwen3-32b',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    response_format: { type: 'json_object' }
  }, { chatId });

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

export function killProcessTree(pid) {
  try {
    console.log(`[TreeKill] Attempting to kill process tree for PID ${pid}...`);
    if (process.platform === 'win32') {
      exec(`taskkill /pid ${pid} /T /F`, (err, stdout, stderr) => {
        if (err) {
          console.error(`[TreeKill] Failed taskkill for PID ${pid}:`, err.message);
        } else {
          console.log(`[TreeKill] Taskkill output for PID ${pid}:`, stdout.trim());
        }
      });
    } else {
      exec(`pkill -P ${pid}`, (err, stdout, stderr) => {
        try { process.kill(pid, 'SIGKILL'); } catch (e) {}
        console.log(`[TreeKill] Unix pkill/kill output for PID ${pid}`);
      });
    }
  } catch (err) {
    console.error(`[TreeKill] Error killing PID ${pid}:`, err.message);
  }
}

export function execWithTreeKill(command, options = {}, signal = null) {
  return new Promise((resolve, reject) => {
    const child = exec(command, options);
    let aborted = false;

    if (signal) {
      signal.pid = child.pid;
      if (global.saveActiveProcesses) {
        global.saveActiveProcesses();
      }
    }

    const onAbort = () => {
      aborted = true;
      console.log(`[Abort] Killing process tree for PID ${child.pid}...`);
      killProcessTree(child.pid);
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort);
      }
    }

    let stdoutData = '';
    let stderrData = '';

    if (child.stdout) {
      child.stdout.on('data', (data) => { stdoutData += data; });
    }
    if (child.stderr) {
      child.stderr.on('data', (data) => { stderrData += data; });
    }

    child.on('close', (code) => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      if (aborted || (signal && signal.aborted)) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      } else if (code !== 0) {
        const err = new Error(`Command failed with exit code ${code}`);
        err.code = code;
        err.stdout = stdoutData;
        err.stderr = stderrData;
        reject(err);
      } else {
        resolve({ stdout: stdoutData, stderr: stderrData });
      }
    });

    child.on('error', (err) => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      reject(err);
    });
  });
}

export async function uploadToCatbox(filePath, signal = null) {
  const fs = await import('fs');
  const path = await import('path');
  const axios = (await import('axios')).default;
  const https = await import('https');

  const fileBuffer = fs.readFileSync(filePath);
  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: 'application/octet-stream' });
  formData.append('reqtype', 'fileupload');
  formData.append('fileToUpload', blob, path.basename(filePath));

  const httpsAgent = new https.Agent({ rejectUnauthorized: false });

  console.log(`[Upload] Uploading ${filePath} (${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB) to catbox.moe...`);
  const response = await axios.post('https://catbox.moe/user/api.php', formData, {
    timeout: 180000,
    signal: signal || undefined,
    httpsAgent
  });

  const resText = response.data?.toString().trim();
  if (!resText || !resText.startsWith('http')) {
    throw new Error(`Upload to catbox.moe failed: ${resText}`);
  }

  console.log(`Uploaded to catbox.moe successfully. URL: ${resText}`);
  return resText;
}

export async function uploadToTmpfiles(filePath, signal = null) {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const axios = (await import('axios')).default;
    const https = await import('https');

    const fileBuffer = fs.readFileSync(filePath);
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'application/octet-stream' });
    formData.append('file', blob, path.basename(filePath));

    const httpsAgent = new https.Agent({ rejectUnauthorized: false });

    console.log(`[Upload] Uploading ${filePath} (${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB) to tmpfiles.org...`);
    const response = await axios.post('https://tmpfiles.org/api/v1/upload', formData, {
      timeout: 60000,
      signal: signal || undefined,
      httpsAgent
    });

    if (!response.data?.data?.url) {
      throw new Error('Upload response does not contain URL');
    }

    const pageUrl = response.data.data.url;
    const downloadUrl = pageUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
    return downloadUrl;
  } catch (err) {
    console.warn(`[Upload] tmpfiles.org failed (${err.message}). Falling back to catbox.moe...`);
    return await uploadToCatbox(filePath, signal);
  }
}

export function safeMarkdown(text) {
  if (typeof text !== 'string') return text;

  let result = '';
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    // 0. Handle escaped characters
    if (char === '\\' && i + 1 < len) {
      result += '\\' + text[i + 1];
      i += 2;
      continue;
    }

    // 1. Handle code blocks (triple backticks)
    if (text.startsWith('```', i)) {
      const closingIdx = text.indexOf('```', i + 3);
      if (closingIdx !== -1) {
        result += text.substring(i, closingIdx + 3);
        i = closingIdx + 3;
      } else {
        result += '\\`\\`\\`';
        i += 3;
      }
      continue;
    }

    // 2. Handle inline code (single backtick)
    if (char === '`') {
      const closingIdx = text.indexOf('`', i + 1);
      if (closingIdx !== -1) {
        result += text.substring(i, closingIdx + 1);
        i = closingIdx + 1;
      } else {
        result += '\\`';
        i += 1;
      }
      continue;
    }

    // 3. Handle markdown links: [text](url)
    if (char === '[') {
      const closeBracketIdx = text.indexOf(']', i + 1);
      if (closeBracketIdx !== -1 && text[closeBracketIdx + 1] === '(') {
        const closeParenIdx = text.indexOf(')', closeBracketIdx + 2);
        if (closeParenIdx !== -1) {
          const linkText = text.substring(i + 1, closeBracketIdx);
          const linkUrl = text.substring(closeBracketIdx + 2, closeParenIdx);
          result += '[' + safeMarkdown(linkText) + '](' + linkUrl + ')';
          i = closeParenIdx + 1;
          continue;
        }
      }
      result += '\\[';
      i += 1;
      continue;
    }

    // 4. Handle bold: *text*
    if (char === '*') {
      const closingIdx = text.indexOf('*', i + 1);
      if (closingIdx !== -1) {
        const innerText = text.substring(i + 1, closingIdx);
        result += '*' + safeMarkdown(innerText) + '*';
        i = closingIdx + 1;
      } else {
        result += '\\*';
        i += 1;
      }
      continue;
    }

    // 5. Handle italic: _text_
    if (char === '_') {
      const closingIdx = text.indexOf('_', i + 1);
      if (closingIdx !== -1) {
        const innerText = text.substring(i + 1, closingIdx);
        result += '_' + safeMarkdown(innerText) + '_';
        i = closingIdx + 1;
      } else {
        result += '\\_';
        i += 1;
      }
      continue;
    }

    result += char;
    i += 1;
  }

  return result;
}

export async function enhanceImage(filePath, signal = null) {
  const axios = (await import('axios')).default;
  const https = await import('https');

  // 1. Upload to public storage
  const imageUrl = await uploadToTmpfiles(filePath, signal);

  const httpsAgent = new https.Agent({ rejectUnauthorized: false });

  try {
    console.log(`[HD Enhance] Trying hdv4 for ${imageUrl}...`);
    const apiUrl = `https://api-faa.my.id/faa/hdv4?image=${encodeURIComponent(imageUrl)}`;
    const res = await axios.get(apiUrl, { timeout: 120000, httpsAgent, signal: signal || undefined });

    if (!res.data?.status || !res.data?.result?.image_upscaled) {
      throw new Error('hdv4 did not return upscaled image');
    }

    const resultUrl = res.data.result.image_upscaled;
    const imgRes = await axios.get(resultUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      httpsAgent,
      signal: signal || undefined
    });

    return Buffer.from(imgRes.data);
  } catch (err) {
    if (signal && signal.aborted || err.message === 'STOPPED' || err.name === 'AbortError') {
      throw new Error('STOPPED');
    }
    console.warn(`[HD Enhance] hdv4 failed (${err.message}). Falling back to hdv3...`);
    const apiUrl = `https://api-faa.my.id/faa/hdv3?image=${encodeURIComponent(imageUrl)}`;
    const res = await axios.get(apiUrl, { 
      responseType: 'arraybuffer',
      timeout: 120000,
      httpsAgent,
      signal: signal || undefined
    });
    return Buffer.from(res.data);
  }
}

export async function applyVoiceFilter(filePath, filterType) {
  try {
    if (!fs.existsSync(filePath)) return;

    let filter = null;
    if (filterType === 'chipmunk') {
      filter = 'asetrate=44100*1.3,atempo=0.9';
    } else if (filterType === 'deep') {
      filter = 'asetrate=44100*0.75,atempo=1.25';
    } else if (filterType === 'robot') {
      filter = 'vibrato=f=15:d=0.9';
    } else if (filterType === 'fast') {
      filter = 'atempo=1.5';
    } else if (filterType === 'slow') {
      filter = 'atempo=0.7';
    } else if (filterType === 'echo') {
      filter = 'aecho=0.8:0.88:60:0.4';
    }

    if (filter) {
      console.log(`[Voice Changer] Applying voice filter: ${filter}`);
      const ffmpegPath = await getFfmpegPath();
      const tempPath = filePath + '_voicechanged.mp3';
      
      const cmd = `"${ffmpegPath}" -y -i "${filePath}" -filter:a "${filter}" "${tempPath}"`;
      await execAsync(cmd);
      
      if (fs.existsSync(tempPath)) {
        fs.copyFileSync(tempPath, filePath);
        fs.unlinkSync(tempPath);
        console.log(`[Voice Changer] Voice filter applied successfully.`);
      }
    }
  } catch (err) {
    console.error('[Voice Changer] Failed to apply voice filter:', err.message);
    throw err;
  }
}








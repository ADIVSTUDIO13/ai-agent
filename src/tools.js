import fs from 'fs';
import https from 'https';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import AdmZip from 'adm-zip';
import { config } from './config.js';
import { isPathSafe, ensureSandbox, downloadVideo, getYtDlpPath, searchWikipedia, fetchWebpage, downloadPollinationsImage, searchGoogleNews, fetchBmkgWeather, getWeatherEmoji, compressImageIfLarge, getRandomUserAgent, getYtMetadata } from './utils.js';
import axios from 'axios';
import { Groq } from 'groq-sdk';
import * as cheerio from 'cheerio';
import { Jimp } from 'jimp';

const execAsync = promisify(exec);

const groqOptions = {};
if (config.groqApiKey) {
  groqOptions.apiKey = config.groqApiKey;
}
if (config.groqBaseUrl) {
  groqOptions.baseURL = config.groqBaseUrl;
}
const groq = config.groqApiKey ? new Groq(groqOptions) : null;


export const toolsDefinition = [
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or write/overwrite content of a file. Path must be relative to the sandbox workspace.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path of the file to write (e.g., "index.html" or "src/app.js")' },
          content: { type: 'string', description: 'Complete content to write to the file' }
        },
        required: ['filePath', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Path must be relative to the sandbox workspace.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path of the file to read (e.g., "package.json")' }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and directories in a given path. Path is relative to the sandbox workspace.',
      parameters: {
        type: 'object',
        properties: {
          directoryPath: { type: 'string', description: 'Relative path to list (use "." for root of sandbox)' }
        },
        required: ['directoryPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_command',
      description: 'Execute a terminal shell command (e.g. npm install, node test.js) inside the sandbox workspace.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to run (e.g., "npm install lodash" or "node script.js")' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'download_video_tool',
      description: 'Download a video or audio from a URL (YouTube, TikTok, Instagram, etc.) to the sandbox workspace.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL of the video/audio to download' },
          type: { type: 'string', enum: ['video', 'audio'], description: 'Format to download: video (default) or audio (mp3/m4a)' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'zip_project',
      description: 'Create a zip archive of a directory inside the sandbox. Helpful for packaging generated websites or project files for the user.',
      parameters: {
        type: 'object',
        properties: {
          dirName: { type: 'string', description: 'Relative path of directory to zip (e.g. "my-web-app" or ".")' },
          zipName: { type: 'string', description: 'Filename of output zip file (e.g. "website.zip")' }
        },
        required: ['dirName', 'zipName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'wikipedia_search',
      description: 'Search Wikipedia for articles and summaries. Useful for looking up technical information or general knowledge.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term or query to look up on Wikipedia' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'google_news_search',
      description: 'Search Google News for recent news articles based on user query. Returns the title, source, publication date, and link of the top news articles.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'News search term or query to look up on Google News' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_webpage',
      description: 'Fetch and extract clean plain text from any webpage URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL of the webpage to read' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Generate an image using Pollinations AI based on a descriptive text prompt.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed visual description of the image to generate' }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file in the sandbox workspace.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path of the file to delete' }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_directory',
      description: 'Create a new folder/directory inside the sandbox workspace.',
      parameters: {
        type: 'object',
        properties: {
          dirPath: { type: 'string', description: 'Relative path of the folder to create' }
        },
        required: ['dirPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather for any city or location.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name or location (e.g. "Jakarta", "Tokyo")' }
        },
        required: ['city']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_crypto_price',
      description: 'Get the current price of a cryptocurrency in USD.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Cryptocurrency symbol or name (e.g. "bitcoin", "ethereum", "solana")' }
        },
        required: ['symbol']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'Evaluate a mathematical expression and return the result.',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'A mathematical expression to evaluate, e.g. "(15 * 4) / 2 + Math.sqrt(9)"' }
        },
        required: ['expression']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_qr',
      description: 'Generate a QR code image for any text or URL and save it to the sandbox.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The text or URL to encode into the QR code' },
          filename: { type: 'string', description: 'Output filename (e.g. "my-qr.png")' }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rename_file',
      description: 'Rename or move a file inside the sandbox workspace. Helpful for renaming files to change their extensions (e.g. from .js to .cjs).',
      parameters: {
        type: 'object',
        properties: {
          oldFilePath: { type: 'string', description: 'Relative path of the existing file to rename/move' },
          newFilePath: { type: 'string', description: 'Relative path of the new destination filename' }
        },
        required: ['oldFilePath', 'newFilePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'screenshot_webpage',
      description: 'Take a high-quality screenshot image of any website/webpage URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL of the website to screenshot (e.g. "https://google.com")' },
          filename: { type: 'string', description: 'Optional output image filename (e.g. "screenshot.png")' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_image',
      description: 'Analyze the layout, styling, colors, and design of any local screenshot image file in the sandbox to recreate/code it.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path of the screenshot image to analyze (e.g. "ss_123.png")' },
          question: { type: 'string', description: 'What to analyze or look for in the image (e.g., color scheme, layout structure)' }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'save_user_memory',
      description: 'Simpan atau perbarui memori/fakta penting tentang pengguna (seperti hobi, pekerjaan, preferensi, nama panggilan, dll.) agar Anda dapat mengingatnya di sesi mendatang. Alat ini otomatis menyimpan fakta ke memori permanen pengguna.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Kategori atau kunci informasi (misal: "pekerjaan", "hobi", "makanan_favorit", "nama_panggilan")' },
          value: { type: 'string', description: 'Fakta atau informasi detail yang ingin diingat' }
        },
        required: ['key', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_user_memory',
      description: 'Hapus memori atau fakta tertentu yang sebelumnya disimpan tentang pengguna berdasarkan kuncinya.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Kategori atau kunci informasi yang ingin dihapus' }
        },
        required: ['key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Mengedit atau memodifikasi bagian tertentu dari berkas/file yang sudah ada di sandbox menggunakan blok pencarian-dan-penggantian (search-and-replace). Ini menghindari menimpa seluruh berkas secara utuh.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path relatif file yang ingin diedit (misal: "src/index.js")' },
          edits: {
            type: 'array',
            description: 'Daftar blok pencarian-dan-penggantian untuk diterapkan. Setiap blok mencari bagian teks yang unik lalu menggantinya.',
            items: {
              type: 'object',
              properties: {
                oldText: { type: 'string', description: 'Teks segmen lama di dalam berkas yang ingin diganti. Harus sama persis termasuk spasi, tab, dan baris baru.' },
                newText: { type: 'string', description: 'Teks segmen baru untuk menggantikan oldText.' }
              },
              required: ['oldText', 'newText']
            }
          }
        },
        required: ['filePath', 'edits']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_video',
      description: 'Buat video AI menggunakan Pollinations AI berdasarkan deskripsi teks (prompt). Memerlukan POLLINATIONS_API_KEY di .env.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Deskripsi detail konten video yang ingin dibuat' },
          model: { type: 'string', enum: ['seedance', 'veo', 'wan'], description: 'Model video yang digunakan. Default: "seedance".' }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'image_to_image',
      description: 'Buat atau modifikasi gambar berdasarkan gambar referensi yang ada (img2img) dan deskripsi teks prompt (misal untuk mengubah gaya menjadi kartun, anime, sketsa, dll.).',
      parameters: {
        type: 'object',
        properties: {
          imagePath: { type: 'string', description: 'Path relatif file gambar sumber di dalam sandbox (misal: "input_image.jpg")' },
          prompt: { type: 'string', description: 'Gaya baru atau deskripsi modifikasi yang diinginkan (misal: "cartoon style, Pixar cartoon, high quality")' }
        },
        required: ['imagePath', 'prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'unzip_file',
      description: 'Extract a zip archive file inside the sandbox workspace.',
      parameters: {
        type: 'object',
        properties: {
          zipFilePath: { type: 'string', description: 'Relative path of the zip file to extract (e.g. "project.zip")' },
          destDir: { type: 'string', description: 'Relative path of the destination directory where files should be extracted (e.g. "." or "my-folder")' }
        },
        required: ['zipFilePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deploy_to_vercel',
      description: 'Deploy a project directory or folder inside the sandbox to Vercel (vercel.com) and return the live URL.',
      parameters: {
        type: 'object',
        properties: {
          projectDir: { type: 'string', description: 'Relative path of the project directory to deploy (e.g. "." or "my-web-app")' },
          vercelToken: { type: 'string', description: 'Optional Vercel auth token. If not provided, it will use the VERCEL_TOKEN environment variable.' },
          production: { type: 'boolean', description: 'Whether to deploy to production (true) or preview (false). Default is true.' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'youtube_search',
      description: 'Search YouTube for videos, music, songs, and play links. Returns a list of matches with titles, durations, uploaders, and video URLs.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term or song name' },
          limit: { type: 'integer', description: 'Maximum number of results to return (default 5)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the general web for information, links, Chinese dramas (C-Dramas), trends, articles, and websites.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query to look up on the web' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_stock_price',
      description: 'Get the current price and 7-day history chart of a US or Indonesian stock. For Indonesian stocks, the ticker can be 4 letters (e.g. BBCA, TLKM) or with suffix .JK (e.g. BBCA.JK). For US stocks, use standard tickers (e.g. AAPL, TSLA, MSFT).',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Stock ticker symbol (e.g. "AAPL", "BBCA", "BBCA.JK", "TSLA")' }
        },
        required: ['symbol']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dramabox_search',
      description: 'Search Dramabox for Chinese dramas (dracin) by name/query. Returns drama titles, descriptions, episode count, cover image, and play URLs.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term or query for Chinese dramas (e.g., "husband", "ceo")' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'krl_schedule',
      description: 'Search for KRL Commuterline train schedules by station name (e.g., "Manggarai", "Sudirman"). Shows upcoming departures, destinations, and train lines.',
      parameters: {
        type: 'object',
        properties: {
          stationName: { type: 'string', description: 'The name of the KRL station (e.g., "Manggarai", "Bogor")' }
        },
        required: ['stationName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'translate_text',
      description: 'Translate text from one language to another (e.g. English to Indonesian, Indonesian to Japanese) using Google Translate.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The text to translate' },
          targetLang: { type: 'string', description: 'The target language ISO code (e.g. "id" for Indonesian, "en" for English, "ja" for Japanese, "ko" for Korean)' },
          sourceLang: { type: 'string', description: 'Optional source language ISO code (defaults to "auto" for auto-detect)' }
        },
        required: ['text', 'targetLang']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'currency_converter',
      description: 'Convert currency from one code to another (e.g., USD to IDR, EUR to USD, SGD to IDR) using real-time exchange rates.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'The amount of money to convert' },
          fromCurrency: { type: 'string', description: 'The base currency ISO code (e.g. "USD", "EUR", "IDR")' },
          toCurrency: { type: 'string', description: 'The target currency ISO code (e.g. "IDR", "USD", "JPY")' }
        },
        required: ['amount', 'fromCurrency', 'toCurrency']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'shorten_url',
      description: 'Shorten a long URL/link using TinyURL. Returns the shortened link.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The long URL to shorten (e.g. https://example.com/very/long/path/name)' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_personality',
      description: 'Change the AI Agent\'s own personality/demeanor.',
      parameters: {
        type: 'object',
        properties: {
          personality: { 
            type: 'string', 
            enum: ['biasa', 'wibu', 'tsundere', 'sarcastic', 'professional', 'mentor'],
            description: 'The personality template to switch to. "biasa" is standard/default, "wibu" is anime fan, "tsundere" is cold/denial, "sarcastic" is sassy/sarcastic, "professional" is formal, "mentor" is software engineering coach.' 
          }
        },
        required: ['personality']
      }
    }
  }
];


export const toolHandlers = {
  write_file: async ({ filePath, content }) => {
    ensureSandbox();
    const resolvedPath = path.join(config.workspaceDir, filePath);
    if (!isPathSafe(resolvedPath)) {
      throw new Error(`Access Denied: Path ${filePath} is outside sandbox workspace.`);
    }

    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resolvedPath, content, 'utf8');
    return `File written successfully at: ${filePath}`;
  },

  read_file: async ({ filePath }) => {
    ensureSandbox();
    const resolvedPath = path.join(config.workspaceDir, filePath);
    if (!isPathSafe(resolvedPath)) {
      throw new Error(`Access Denied: Path ${filePath} is outside sandbox workspace.`);
    }

    if (!fs.existsSync(resolvedPath)) {
      return `Error: File not found at ${filePath}`;
    }

    const content = fs.readFileSync(resolvedPath, 'utf8');
    return content;
  },

  list_files: async ({ directoryPath }) => {
    ensureSandbox();
    const resolvedPath = path.join(config.workspaceDir, directoryPath);
    if (!isPathSafe(resolvedPath)) {
      throw new Error(`Access Denied: Path ${directoryPath} is outside sandbox workspace.`);
    }

    if (!fs.existsSync(resolvedPath)) {
      return `Error: Directory not found at ${directoryPath}`;
    }

    const items = fs.readdirSync(resolvedPath);
    const details = items.map((item) => {
      const itemPath = path.join(resolvedPath, item);
      const stat = fs.statSync(itemPath);
      return `${stat.isDirectory() ? '[DIR]' : '[FILE]'} ${item}`;
    });

    return details.length > 0 ? details.join('\n') : '(empty directory)';
  },

  execute_command: async ({ command }, chatId, signal) => {
    ensureSandbox();
    try {
      console.log(`Executing command in sandbox: ${command}`);
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
      const { stdout, stderr } = await execAsync(command, { cwd: config.workspaceDir, signal, env });
      let response = `Command executed successfully.\n`;
      if (stdout) response += `Stdout:\n${stdout}\n`;
      if (stderr) response += `Stderr:\n${stderr}\n`;
      return response;
    } catch (error) {
      return `Error executing command: ${error.message}\nStdout: ${error.stdout || ''}\nStderr: ${error.stderr || ''}`;
    }
  },

  download_video_tool: async ({ url, type }, chatId, signal, ctx) => {
    ensureSandbox();
    const downloadType = type === 'audio' ? 'audio' : 'video';
    try {
      console.log(`Downloading ${downloadType} from tool: ${url}`);
      
      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
      if (isYouTube && ctx) {
        try {
          console.log(`Fetching YouTube metadata for tool preview: ${url}`);
          const meta = await getYtMetadata(url);
          if (meta) {
            const isAudio = downloadType === 'audio';
            const titleHeader = isAudio ? '🎵 *INFORMASI YOUTUBE AUDIO* 🎵' : '🎥 *INFORMASI YOUTUBE* 🎥';
            const processText = isAudio ? 'audio' : 'video';
            const metaText = `${titleHeader}\n\n` +
              `📌 *Judul:* ${meta.title}\n` +
              `👤 *Channel:* ${meta.uploader}\n` +
              `⏱ *Durasi:* ${meta.duration}\n` +
              `👁 *Views:* ${meta.views.toLocaleString('id-ID')}\n\n` +
              `⏳ _Proses pengunduhan ${processText} sedang berjalan via AI, mohon tunggu..._`;
            
            try {
              await ctx.replyWithPhoto({ url: meta.thumbnail }, { caption: metaText, parse_mode: 'Markdown' });
            } catch (photoErr) {
              await ctx.reply(metaText, { parse_mode: 'Markdown' });
            }
          }
        } catch (metaErr) {
          console.error('Failed to send YouTube metadata preview in tool:', metaErr);
        }
      }

      const filePath = await downloadVideo(url, config.workspaceDir, downloadType, signal);
      const relativePath = path.relative(config.workspaceDir, filePath);
      return `${downloadType === 'audio' ? 'Audio' : 'Video'} downloaded successfully. Saved at file path: ${relativePath}`;
    } catch (error) {
      return `Failed to download ${downloadType}: ${error.message}`;
    }
  },

  zip_project: async ({ dirName, zipName }) => {
    ensureSandbox();
    const sourceDir = path.join(config.workspaceDir, dirName);
    const targetZip = path.join(config.workspaceDir, zipName);

    if (!isPathSafe(sourceDir) || !isPathSafe(targetZip)) {
      throw new Error('Access Denied: Paths must be inside sandbox workspace.');
    }

    if (!fs.existsSync(sourceDir)) {
      return `Error: Source directory ${dirName} does not exist.`;
    }

    const zip = new AdmZip();
    zip.addLocalFolder(sourceDir);
    zip.writeZip(targetZip);

    return `Project zipped successfully. Saved as: ${zipName}`;
  },

  wikipedia_search: async ({ query }) => {
    return await searchWikipedia(query);
  },

  google_news_search: async ({ query }) => {
    return await searchGoogleNews(query);
  },

  fetch_webpage: async ({ url }, chatId, signal) => {
    return await fetchWebpage(url, signal);
  },

  generate_image: async ({ prompt }, chatId, signal) => {
    ensureSandbox();
    try {
      console.log(`Generating image for prompt: ${prompt}`);
      const imagePath = await downloadPollinationsImage(prompt, config.workspaceDir, signal);
      const relativePath = path.relative(config.workspaceDir, imagePath);
      return `Image generated successfully. Saved at file path: ${relativePath}`;
    } catch (error) {
      return `Failed to generate image: ${error.message}`;
    }
  },

  delete_file: async ({ filePath }) => {
    ensureSandbox();
    const resolvedPath = path.join(config.workspaceDir, filePath);
    if (!isPathSafe(resolvedPath)) {
      throw new Error(`Access Denied: Path ${filePath} is outside sandbox workspace.`);
    }

    if (!fs.existsSync(resolvedPath)) {
      return `Error: File not found at ${filePath}`;
    }

    fs.unlinkSync(resolvedPath);
    return `File deleted successfully: ${filePath}`;
  },

  create_directory: async ({ dirPath }) => {
    ensureSandbox();
    const resolvedPath = path.join(config.workspaceDir, dirPath);
    if (!isPathSafe(resolvedPath)) {
      throw new Error(`Access Denied: Path ${dirPath} is outside sandbox workspace.`);
    }

    if (fs.existsSync(resolvedPath)) {
      return `Directory already exists: ${dirPath}`;
    }

    fs.mkdirSync(resolvedPath, { recursive: true });
    return `Directory created successfully: ${dirPath}`;
  },

  get_weather: async ({ city }) => {
    try {
      
      const weatherData = await fetchBmkgWeather(city);
      const emoji = getWeatherEmoji(weatherData.description);
      return `Cuaca terkini di ${weatherData.location}:
${emoji} Suhu: ${weatherData.tempC}°C (terasa ${weatherData.feelsLike}°C)
${emoji} Kondisi: ${weatherData.description}
💧 Kelembapan: ${weatherData.humidity}%
🌬️ Angin: ${weatherData.windKmph} km/h
👁️ Jarak pandang: ${weatherData.visibility}

Rekomendasi: ${weatherData.recommendation}

BMKG URL: ${weatherData.url}`;
    } catch (err) {
      console.warn(`BMKG weather lookup failed for ${city}: ${err.message}. Falling back to wttr.in...`);
      try {
        const response = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
          timeout: 8000,
          headers: { 'User-Agent': getRandomUserAgent() }
        });
        const data = response.data;
        const current = data.current_condition[0];
        const area = data.nearest_area[0];
        const areaName = area.areaName[0].value;
        const country = area.country[0].value;
        const desc = current.weatherDesc[0].value;
        const tempC = current.temp_C;
        const feelsC = current.FeelsLikeC;
        const humidity = current.humidity;
        const windKmph = current.windspeedKmph;
        const visibility = current.visibility;
        
        
        let recommendation = 'Tetap pantau kondisi cuaca sebelum beraktivitas di luar ruangan.';
        const lowerDesc = desc.toLowerCase();
        if (lowerDesc.includes('rain') || lowerDesc.includes('shower') || lowerDesc.includes('drizzle')) {
          recommendation = 'Bawa payung atau jas hujan karena ada potensi hujan.';
        } else if (lowerDesc.includes('thunder') || lowerDesc.includes('storm')) {
          recommendation = 'Waspada hujan petir! Hindari tempat terbuka dan berteduhlah di bangunan yang aman.';
        } else if ((lowerDesc.includes('sunny') || lowerDesc.includes('clear')) && parseFloat(tempC) >= 33) {
          recommendation = 'Cuaca cukup panas, gunakan tabir surya dan pastikan minum air yang cukup.';
        }
        
        const emoji = getWeatherEmoji(desc);

        return `Cuaca terkini di ${areaName}, ${country}:
${emoji} Suhu: ${tempC}°C (terasa ${feelsC}°C)
${emoji} Kondisi: ${desc}
💧 Kelembapan: ${humidity}%
🌬️ Angin: ${windKmph} km/h
👁️ Jarak pandang: ${visibility} km

Rekomendasi: ${recommendation}

BMKG URL: https://www.bmkg.go.id/cuaca/prakiraan-cuaca-indonesia.bmkg`;
      } catch (fallbackErr) {
        return `Error getting weather for ${city}: ${fallbackErr.message}`;
      }
    }
  },

  get_crypto_price: async ({ symbol }) => {
    try {
      const symbolMap = {
        'btc': 'bitcoin',
        'eth': 'ethereum',
        'sol': 'solana',
        'bnb': 'binancecoin',
        'ada': 'cardano',
        'xrp': 'ripple',
        'doge': 'dogecoin',
        'dot': 'polkadot',
        'matic': 'polygon',
        'ltc': 'litecoin',
        'link': 'chainlink',
        'trx': 'tron',
        'avax': 'avalanche-2',
        'uni': 'uniswap',
        'shib': 'shiba-inu'
      };
      const cleaned = symbol.toLowerCase().trim();
      const id = symbolMap[cleaned] || cleaned;

      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd,idr&include_24hr_change=true`,
        { timeout: 8000, headers: { 'User-Agent': 'TelegramAIBot/1.0' } }
      );
      const data = response.data;
      if (!data[id]) {
        return `Koin '${symbol}' tidak ditemukan. Gunakan nama lengkap seperti 'bitcoin', 'ethereum', atau 'solana'.`;
      }
      const coin = data[id];
      const changeStr = coin.usd_24h_change != null ? `${coin.usd_24h_change >= 0 ? '📈' : '📉'} ${coin.usd_24h_change.toFixed(2)}% (24h)` : '';
      let textResult = `💰 Harga ${id.toUpperCase()}:\n🇺🇸 USD: $${coin.usd.toLocaleString()}\n🇮🇩 IDR: Rp ${Math.round(coin.idr).toLocaleString('id-ID')}\n${changeStr}`;

      // Now generate the chart
      try {
        const historyRes = await axios.get(
          `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=7&interval=daily`,
          { timeout: 8000, headers: { 'User-Agent': 'TelegramAIBot/1.0' } }
        );
        const prices = historyRes.data.prices;
        if (prices && prices.length > 0) {
          const labels = [];
          const priceData = [];
          for (const [timestamp, val] of prices) {
            const date = new Date(timestamp);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            labels.push(`${day}/${month}`);
            priceData.push(parseFloat(val.toFixed(2)));
          }

          const startPrice = priceData[0];
          const endPrice = priceData[priceData.length - 1];
          const isUp = endPrice >= startPrice;

          const chartConfig = {
            type: 'line',
            data: {
              labels: labels,
              datasets: [{
                label: `${id.toUpperCase()} Price (USD)`,
                data: priceData,
                borderColor: isUp ? '#00e676' : '#ff1744',
                borderWidth: 3,
                fill: true,
                backgroundColor: isUp ? 'rgba(0, 230, 118, 0.1)' : 'rgba(255, 23, 68, 0.1)',
                pointRadius: 3,
                pointBackgroundColor: isUp ? '#00e676' : '#ff1744',
                lineTension: 0.3
              }]
            },
            options: {
              title: {
                display: true,
                text: `${id.toUpperCase()} Price Trend (Last 7 Days)`,
                fontColor: '#ffffff',
                fontSize: 16,
                fontFamily: 'Montserrat, Roboto, sans-serif'
              },
              legend: {
                display: false
              },
              scales: {
                xAxes: [{
                  gridLines: {
                    color: 'rgba(255, 255, 255, 0.08)'
                  },
                  ticks: {
                    fontColor: '#bbbbbb',
                    fontFamily: 'Roboto'
                  }
                }],
                yAxes: [{
                  gridLines: {
                    color: 'rgba(255, 255, 255, 0.08)'
                  },
                  ticks: {
                    fontColor: '#bbbbbb',
                    fontFamily: 'Roboto',
                    callback: (value) => '$' + value.toLocaleString()
                  }
                }]
              }
            }
          };

          const chartRes = await axios.post('https://quickchart.io/chart', {
            chart: chartConfig,
            width: 600,
            height: 400,
            backgroundColor: '#121212'
          }, { responseType: 'arraybuffer', timeout: 10000 });

          const filename = `crypto_${id}_chart_${Date.now()}.png`;
          const outputPath = path.join(config.workspaceDir, filename);
          fs.writeFileSync(outputPath, chartRes.data);
          textResult += `\nSaved at file path: ${filename}`;
        }
      } catch (chartErr) {
        console.warn(`Failed to generate crypto chart for ${id}: ${chartErr.message}`);
        textResult += `\n(Gagal memuat grafik: ${chartErr.message})`;
      }

      return textResult;
    } catch (err) {
      return `Error getting crypto price for ${symbol}: ${err.message}`;
    }
  },

  calculate: async ({ expression }) => {
    try {
      // Safe evaluation with limited scope
      const allowed = /^[0-9+\-*/().,\s%MathPIsqrtabsfloorceiling]+$/;
      if (!allowed.test(expression)) {
        return `Error: Ekspresi tidak diizinkan: ${expression}`;
      }
      // eslint-disable-next-line no-new-func
      const result = new Function(`'use strict'; return (${expression})`)();
      return `🧮 Hasil: ${expression} = ${result}`;
    } catch (err) {
      return `Error menghitung ekspresi '${expression}': ${err.message}`;
    }
  },

  generate_qr: async ({ text, filename }) => {
    ensureSandbox();
    const outputFilename = filename || `qr_${Date.now()}.png`;
    const outputPath = path.join(config.workspaceDir, outputFilename);
    try {
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(text)}`;
      const response = await axios({ method: 'get', url, responseType: 'stream', timeout: 10000 });
      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);
      await new Promise((resolve, reject) => {
        response.data.on('error', reject);
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      const relPath = path.relative(config.workspaceDir, outputPath);
      return `QR code generated successfully. Saved at file path: ${relPath}`;
    } catch (err) {
      return `Error generating QR code: ${err.message}`;
    }
  },

  rename_file: async ({ oldFilePath, newFilePath }) => {
    ensureSandbox();
    const resolvedOld = path.join(config.workspaceDir, oldFilePath);
    const resolvedNew = path.join(config.workspaceDir, newFilePath);
    if (!isPathSafe(resolvedOld) || !isPathSafe(resolvedNew)) {
      throw new Error('Access Denied: Paths must be inside sandbox workspace.');
    }

    if (!fs.existsSync(resolvedOld)) {
      return `Error: Source file not found at ${oldFilePath}`;
    }

    const dir = path.dirname(resolvedNew);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.renameSync(resolvedOld, resolvedNew);
    return `File renamed successfully from ${oldFilePath} to ${newFilePath}`;
  },

  screenshot_webpage: async ({ url, filename }, chatId, signal) => {
    ensureSandbox();
    const outputFilename = filename || `ss_${Date.now()}.png`;
    const outputPath = path.join(config.workspaceDir, outputFilename);
    
    
    let targetUrl = url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl;
    }
    
    try {
      console.log(`Taking screenshot of website: ${targetUrl}`);
      const screenshotApiUrl = `https://api.microlink.io/?url=${encodeURIComponent(targetUrl)}&screenshot=true&meta=false&embed=screenshot.url`;
      
      const response = await axios({
        method: 'get',
        url: screenshotApiUrl,
        responseType: 'stream',
        timeout: 25000,
        headers: {
          'User-Agent': getRandomUserAgent()
        },
        signal
      });
      
      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);
      
      await new Promise((resolve, reject) => {
        response.data.on('error', reject);
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      
      const relPath = path.relative(config.workspaceDir, outputPath);
      return `Screenshot captured successfully. Saved at file path: ${relPath}`;
    } catch (err) {
      return `Failed to capture website screenshot: ${err.message}`;
    }
  },

  analyze_image: async ({ filePath, question }) => {
    ensureSandbox();
    const resolvedPath = path.join(config.workspaceDir, filePath);
    if (!isPathSafe(resolvedPath)) {
      throw new Error(`Access Denied: Path ${filePath} is outside sandbox workspace.`);
    }

    if (!fs.existsSync(resolvedPath)) {
      return `Error: File not found at ${filePath}`;
    }

    if (!groq) {
      throw new Error('Groq client is not initialized for vision analysis.');
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    let mimeType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') {
      mimeType = 'image/jpeg';
    } else if (ext === '.gif') {
      mimeType = 'image/gif';
    } else if (ext === '.webp') {
      mimeType = 'image/webp';
    }

    try {
      const imageBuffer = fs.readFileSync(resolvedPath);
      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64Image}`;

      const prompt = question || 'Deskripsikan layout, kombinasi warna, font, dan elemen desain visual dari gambar/tangkapan layar website ini secara sangat detail untuk direplikasi kodenya.';

      console.log(`Analyzing local image: ${filePath} with vision model...`);
      const response = await groq.chat.completions.create({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: { url: dataUrl }
              }
            ]
          }
        ],
        temperature: 0.5,
        max_tokens: 1024
      });
      return `Analisis gambar (${filePath}):\n${response.choices[0].message.content}`;
    } catch (err) {
      return `Failed to analyze image: ${err.message}`;
    }
  },

  save_user_memory: async ({ key, value }, chatId) => {
    if (!chatId) {
      throw new Error('Chat ID tidak tersedia untuk menyimpan memori.');
    }
    const factsPath = path.join(config.memoryDir, `${chatId}_facts.json`);
    let userFacts = {};
    if (fs.existsSync(factsPath)) {
      try {
        userFacts = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
      } catch (e) {
        console.error('Failed to read user facts:', e.message);
      }
    }
    
    userFacts[key] = value;
    
    try {
      fs.writeFileSync(factsPath, JSON.stringify(userFacts, null, 2), 'utf8');
      return `Berhasil menyimpan memori: ${key} = ${value}`;
    } catch (err) {
      return `Gagal menyimpan memori: ${err.message}`;
    }
  },

  delete_user_memory: async ({ key }, chatId) => {
    if (!chatId) {
      throw new Error('Chat ID tidak tersedia untuk menghapus memori.');
    }
    const factsPath = path.join(config.memoryDir, `${chatId}_facts.json`);
    if (!fs.existsSync(factsPath)) {
      return `Tidak ada memori yang tersimpan untuk dihapus.`;
    }
    
    let userFacts = {};
    try {
      userFacts = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
    } catch (e) {
      console.error('Failed to read user facts:', e.message);
      return `Gagal membaca memori untuk dihapus.`;
    }
    
    if (!(key in userFacts)) {
      return `Memori dengan kunci "${key}" tidak ditemukan.`;
    }
    
    delete userFacts[key];
    
    try {
      fs.writeFileSync(factsPath, JSON.stringify(userFacts, null, 2), 'utf8');
      return `Berhasil menghapus memori dengan kunci: ${key}`;
    } catch (err) {
      return `Gagal menghapus memori: ${err.message}`;
    }
  },

  edit_file: async ({ filePath, edits }) => {
    ensureSandbox();
    const resolvedPath = path.join(config.workspaceDir, filePath);
    if (!isPathSafe(resolvedPath)) {
      throw new Error(`Access Denied: Path ${filePath} is outside sandbox workspace.`);
    }

    if (!fs.existsSync(resolvedPath)) {
      return `Error: File not found at ${filePath}. If you want to create a new file, use write_file instead.`;
    }

    let content = fs.readFileSync(resolvedPath, 'utf8');

    for (let i = 0; i < edits.length; i++) {
      const { oldText, newText } = edits[i];
      
      const index = content.indexOf(oldText);
      if (index === -1) {
        return `Error in edit block ${i + 1}: The target text segment (oldText) was not found in the file. Make sure it matches exactly (including spaces/newlines).`;
      }

      const lastIndex = content.lastIndexOf(oldText);
      if (index !== lastIndex) {
        return `Error in edit block ${i + 1}: The target text segment (oldText) is not unique. Please provide more surrounding lines/context to make it unique.`;
      }

      content = content.substring(0, index) + newText + content.substring(index + oldText.length);
    }

    fs.writeFileSync(resolvedPath, content, 'utf8');
    return `File ${filePath} edited successfully with ${edits.length} change(s).`;
  },

  generate_video: async ({ prompt, model }, chatId, signal) => {
    ensureSandbox();
    const apiKey = config.pollinationsApiKey;
    if (!apiKey) {
      return `Error: Gagal membuat video. Silakan tambahkan kunci API Pollinations (POLLINATIONS_API_KEY) di berkas .env terlebih dahulu. Anda bisa mendapatkan kunci API gratis di https://enter.pollinations.ai.`;
    }

    const videoModel = model || 'seedance';
    const timestamp = Date.now();
    const filename = `vid_gen_${timestamp}.mp4`;
    const outputPath = path.join(config.workspaceDir, filename);

    try {
      console.log(`Generating video for prompt: ${prompt} using model ${videoModel}`);
      
      const url = `https://gen.pollinations.ai/video/${encodeURIComponent(prompt)}?model=${videoModel}&key=${apiKey}`;
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

      const relativePath = path.relative(config.workspaceDir, outputPath);
      return `Video generated successfully. Saved at file path: ${relativePath}`;
    } catch (err) {
      if (fs.existsSync(outputPath)) {
        try {
          fs.unlinkSync(outputPath);
        } catch (e) {
          
        }
      }
      return `Failed to generate video: ${err.message}`;
    }
  },

  image_to_image: async ({ imagePath, prompt }, chatId, signal) => {
    ensureSandbox();
    const resolvedPath = path.join(config.workspaceDir, imagePath);
    if (!isPathSafe(resolvedPath)) {
      throw new Error(`Access Denied: Path ${imagePath} is outside sandbox workspace.`);
    }

    if (!fs.existsSync(resolvedPath)) {
      return `Error: File gambar sumber tidak ditemukan pada path ${imagePath}`;
    }

    await compressImageIfLarge(resolvedPath);

    try {
      const fileBuffer = fs.readFileSync(resolvedPath);
      
      console.log('Uploading image to tmpfiles.org...');
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
      formData.append('file', blob, path.basename(resolvedPath));

      const httpsAgent = new https.Agent({ rejectUnauthorized: false });

      const uploadRes = await axios.post('https://tmpfiles.org/api/v1/upload', formData, {
        signal,
        timeout: 60000,
        httpsAgent
      });

      if (!uploadRes.data?.data?.url) {
        throw new Error('Upload to tmpfiles.org failed');
      }

      const pageUrl = uploadRes.data.data.url;
      const imageUrl = pageUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      console.log('Uploaded to tmpfiles.org successfully. URL:', imageUrl);

      console.log(`Styling image with prompt: ${prompt}`);
      const apiUrl = `https://api-faa.my.id/faa/nano-banana?url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}`;

      const response = await axios.get(apiUrl, {
        responseType: 'arraybuffer',
        timeout: 120000,
        signal,
        httpsAgent
      });

      const timestamp = Date.now();
      const filename = `img_mutated_${timestamp}.jpg`;
      const outputPath = path.join(config.workspaceDir, filename);

      fs.writeFileSync(outputPath, Buffer.from(response.data));

      const relativePath = path.relative(config.workspaceDir, outputPath);
      return `Image modified successfully. Saved at file path: ${relativePath}`;
    } catch (err) {
      return `Failed to modify image: ${err.message}`;
    }
  },

  unzip_file: async ({ zipFilePath, destDir }) => {
    ensureSandbox();
    const resolvedZip = path.join(config.workspaceDir, zipFilePath);
    const targetDir = destDir ? path.join(config.workspaceDir, destDir) : config.workspaceDir;

    if (!isPathSafe(resolvedZip) || !isPathSafe(targetDir)) {
      throw new Error('Access Denied: Paths must be inside sandbox workspace.');
    }

    if (!fs.existsSync(resolvedZip)) {
      return `Error: Zip file ${zipFilePath} does not exist.`;
    }

    try {
      const zip = new AdmZip(resolvedZip);
      zip.extractAllTo(targetDir, true);
      return `Zip file ${zipFilePath} extracted successfully to ${destDir || 'root of sandbox'}.`;
    } catch (err) {
      return `Failed to extract zip file: ${err.message}`;
    }
  },

  deploy_to_vercel: async ({ projectDir, vercelToken, production }, chatId, signal) => {
    ensureSandbox();
    const token = vercelToken || config.vercelToken;
    const tokenFlag = token ? `--token "${token}"` : '';

    const relativeDir = projectDir || '.';
    const targetDir = path.join(config.workspaceDir, relativeDir);

    if (!isPathSafe(targetDir)) {
      throw new Error(`Access Denied: Path ${projectDir} is outside sandbox workspace.`);
    }

    if (!fs.existsSync(targetDir)) {
      return `Error: Project directory "${relativeDir}" does not exist.`;
    }

    const isProd = production !== false;
    const prodFlag = isProd ? '--prod' : '';
    const cmd = `npx vercel ${tokenFlag} --yes ${prodFlag}`.trim().replace(/\s+/g, ' ');
    
    try {
      console.log(`Deploying to Vercel: Executing "${cmd}" in ${targetDir}`);
      
      const { stdout, stderr } = await execAsync(cmd, { 
        cwd: targetDir, 
        signal,
        timeout: 120_000
      });

      const output = `${stdout}\n${stderr}`;
      console.log('Vercel CLI Output:', output);

      const urlRegex = /https:\/\/[a-zA-Z0-9-]+\.vercel\.app/g;
      const urls = output.match(urlRegex) || [];
      const uniqueUrls = [...new Set(urls)];

      if (uniqueUrls.length > 0) {
        const urlList = uniqueUrls.map(u => `🔗 ${u}`).join('\n');
        return `Project successfully deployed to Vercel!\n\nDeployment URL(s):\n${urlList}\n\nFull Log:\n${output.substring(0, 1000)}`;
      } else {
        return `Project deployed to Vercel, but no vercel.app URL was parsed from output.\n\nOutput:\n${output}`;
      }
    } catch (err) {
      console.error('Vercel Deployment failed:', err);
      return `Failed to deploy to Vercel: ${err.message}\nStdout: ${err.stdout || ''}\nStderr: ${err.stderr || ''}`;
    }
  },

  youtube_search: async ({ query, limit }, chatId, signal) => {
    const searchLimit = limit || 5;
    try {
      console.log(`Searching YouTube for: ${query} (limit: ${searchLimit})`);
      const ytDlp = await getYtDlpPath();
      const cmd = `"${ytDlp}" "ytsearch${searchLimit}:${query}" --flat-playlist --dump-single-json`;

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

      const { stdout } = await execAsync(cmd, { 
        timeout: 30000, 
        signal,
        env
      });

      const data = JSON.parse(stdout);
      const entries = data.entries || [];
      
      if (entries.length === 0) {
        return `No results found on YouTube for "${query}".`;
      }

      const results = entries.map((entry, idx) => {
        const title = entry.title || 'Unknown Title';
        const videoId = entry.id || entry.url || '';
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const durationSec = entry.duration || 0;
        const duration = durationSec ? `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}` : 'N/A';
        const uploader = entry.uploader || 'Unknown';
        return `${idx + 1}. Title: ${title}\n   Uploader: ${uploader}\n   Duration: ${duration}\n   URL: ${url}`;
      });

      return `YouTube Search Results for "${query}":\n\n${results.join('\n\n')}`;
    } catch (err) {
      console.error('YouTube search failed:', err);
      return `Failed to search YouTube: ${err.message}`;
    }
  },

  web_search: async ({ query }) => {
    try {
      console.log(`Searching the web for: ${query}`);
      const url = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        },
        timeout: 15000
      });

      const $ = cheerio.load(response.data);
      const results = [];

      $('.algo').each((i, elem) => {
        if (results.length >= 5) return;
        
        const title = $(elem).find('h3.title, h3').text().trim();
        const rawLink = $(elem).find('a').first().attr('href') || '';
        const snippet = $(elem).find('.compText, .sh-description').text().trim();
        
        let link = rawLink;
        if (rawLink.includes('/RU=')) {
          try {
            const parts = rawLink.split('/RU=');
            if (parts.length > 1) {
              const encodedUrl = parts[1].split('/')[0];
              link = decodeURIComponent(encodedUrl);
            }
          } catch (e) {
            console.warn('Failed to decode Yahoo URL:', rawLink);
          }
        }

        if (title && link) {
          results.push(`Title: ${title}\nSnippet: ${snippet}\nLink: ${link}`);
        }
      });

      if (results.length === 0) {
        return `No web search results found for "${query}".`;
      }

      return `Web Search Results for "${query}":\n\n${results.join('\n\n')}`;
    } catch (err) {
      console.error('Web search failed:', err);
      return `Failed to search the web: ${err.message}`;
    }
  },

  get_stock_price: async ({ symbol }) => {
    try {
      let ticker = symbol.toUpperCase().trim();
      let chartData = null;
      let usedTicker = ticker;
      
      const fetchYahooData = async (t) => {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=7d&interval=1d`;
        const res = await axios.get(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          timeout: 8000
        });
        if (res.data && res.data.chart && res.data.chart.result && res.data.chart.result[0]) {
          return res.data.chart.result[0];
        }
        return null;
      };

      try {
        if (ticker.length === 4 && !ticker.includes('.')) {
          // If it is 4 letters and has no dot, try the .JK suffix first (prioritize Indonesian stocks)
          try {
            usedTicker = `${ticker}.JK`;
            chartData = await fetchYahooData(usedTicker);
          } catch (idxErr) {
            // Fallback to US ticker
            usedTicker = ticker;
            chartData = await fetchYahooData(usedTicker);
          }
        } else {
          chartData = await fetchYahooData(ticker);
        }
      } catch (err) {
        throw new Error(`Ticker '${ticker}' tidak ditemukan.`);
      }

      if (!chartData || !chartData.meta) {
        return `Data saham untuk '${symbol}' tidak ditemukan. Gunakan ticker yang valid seperti 'AAPL' atau 'BBCA'.`;
      }

      const meta = chartData.meta;
      const currentPrice = meta.regularMarketPrice;
      const prevClose = meta.chartPreviousClose || currentPrice;
      const currency = meta.currency || 'USD';
      const longName = meta.longName || meta.shortName || usedTicker;
      const exchange = meta.fullExchangeName || meta.exchangeName || '';

      const change = currentPrice - prevClose;
      const pctChange = (change / prevClose) * 100;
      const changeStr = `${change >= 0 ? '📈' : '📉'} ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${change >= 0 ? '+' : ''}${pctChange.toFixed(2)}%)`;

      const currencySymbol = currency === 'IDR' ? 'Rp' : '$';
      const formattedPrice = currency === 'IDR' 
        ? `Rp ${Math.round(currentPrice).toLocaleString('id-ID')}` 
        : `$${currentPrice.toLocaleString('en-US')}`;

      let textResult = `📊 *Informasi Saham: ${longName} (${meta.symbol})* 📊\n` +
        `🏦 Bursa: ${exchange}\n` +
        `💰 Harga Terkini: *${formattedPrice}* (${currency})\n` +
        `⚡ Perubahan Harian: *${changeStr}*\n` +
        `📈 High/Low Hari Ini: ${currencySymbol}${meta.regularMarketDayHigh?.toLocaleString() || '-'} / ${currencySymbol}${meta.regularMarketDayLow?.toLocaleString() || '-'}\n` +
        `📅 Rentang 52 Minggu: ${currencySymbol}${meta.fiftyTwoWeekLow?.toLocaleString() || '-'} - ${currencySymbol}${meta.fiftyTwoWeekHigh?.toLocaleString() || '-'}`;

      // Now generate the chart
      try {
        const timestamps = chartData.timestamp;
        const closes = chartData.indicators.quote[0].close;

        if (timestamps && closes && timestamps.length > 0) {
          const labels = [];
          const priceData = [];

          for (let i = 0; i < timestamps.length; i++) {
            if (closes[i] == null) continue;
            const date = new Date(timestamps[i] * 1000);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            labels.push(`${day}/${month}`);
            priceData.push(parseFloat(closes[i].toFixed(2)));
          }

          if (priceData.length > 0) {
            const startPrice = priceData[0];
            const endPrice = priceData[priceData.length - 1];
            const isUp = endPrice >= startPrice;

            const chartConfig = {
              type: 'line',
              data: {
                labels: labels,
                datasets: [{
                  label: `${meta.symbol} Price (${currency})`,
                  data: priceData,
                  borderColor: isUp ? '#00e676' : '#ff1744',
                  borderWidth: 3,
                  fill: true,
                  backgroundColor: isUp ? 'rgba(0, 230, 118, 0.1)' : 'rgba(255, 23, 68, 0.1)',
                  pointRadius: 3,
                  pointBackgroundColor: isUp ? '#00e676' : '#ff1744',
                  lineTension: 0.3
                }]
              },
              options: {
                title: {
                  display: true,
                  text: `${meta.symbol} Price Trend`,
                  fontColor: '#ffffff',
                  fontSize: 16,
                  fontFamily: 'Montserrat, Roboto, sans-serif'
                },
                legend: {
                  display: false
                },
                scales: {
                  xAxes: [{
                    gridLines: {
                      color: 'rgba(255, 255, 255, 0.08)'
                    },
                    ticks: {
                      fontColor: '#bbbbbb',
                      fontFamily: 'Roboto'
                    }
                  }],
                  yAxes: [{
                    gridLines: {
                      color: 'rgba(255, 255, 255, 0.08)'
                    },
                    ticks: {
                      fontColor: '#bbbbbb',
                      fontFamily: 'Roboto',
                      callback: (value) => currencySymbol + value.toLocaleString()
                    }
                  }]
                }
              }
            };

            const chartRes = await axios.post('https://quickchart.io/chart', {
              chart: chartConfig,
              width: 600,
              height: 400,
              backgroundColor: '#121212'
            }, { responseType: 'arraybuffer', timeout: 10000 });

            // Composite the company logo using Jimp
            const cleanTicker = meta.symbol.replace('.JK', '').toUpperCase();
            const stockDomains = {
              'AAPL': 'apple.com',
              'MSFT': 'microsoft.com',
              'TSLA': 'tesla.com',
              'GOOG': 'google.com',
              'GOOGL': 'google.com',
              'AMZN': 'amazon.com',
              'NFLX': 'netflix.com',
              'NVDA': 'nvidia.com',
              'META': 'meta.com',
              'AMD': 'amd.com',
              'INTC': 'intel.com',
              'PYPL': 'paypal.com',
              'ADBE': 'adobe.com',
              'DIS': 'disney.com',
              'NKE': 'nike.com',
              'SBUX': 'starbucks.com',
              'KO': 'cocacola.com',
              'PEP': 'pepsico.com',
              'WMT': 'walmart.com',
              'COST': 'costco.com',
              'BBCA': 'bca.co.id',
              'BBRI': 'bri.co.id',
              'BMRI': 'bankmandiri.co.id',
              'BBNI': 'bni.co.id',
              'TLKM': 'telkom.co.id',
              'GOTO': 'gotocompany.com',
              'ASII': 'astra.co.id',
              'UNVR': 'unilever.co.id',
              'ADRO': 'adaro.com',
              'PGAS': 'pgn.co.id',
              'KLBF': 'kalbe.co.id',
              'ICBP': 'indofoodcbp.com',
              'INDF': 'indofood.com',
              'CPIN': 'cp.co.id',
              'ANTM': 'antam.com',
              'TPIA': 'chandra-asri.com',
              'BRPT': 'barito-pacific.com',
              'BUMI': 'bumiresources.com',
              'MDKA': 'merdekacoppergold.com'
            };

            let finalImageBuffer = Buffer.from(chartRes.data);

            if (stockDomains[cleanTicker]) {
              try {
                const domain = stockDomains[cleanTicker];
                const logoUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
                const logoRes = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 5000 });
                
                const chartJimp = await Jimp.read(finalImageBuffer);
                const logoJimp = await Jimp.read(Buffer.from(logoRes.data));
                
                const canvasW = chartJimp.width;
                const canvasH = chartJimp.height;
                const logoSize = Math.round(canvasW * 0.07);
                logoJimp.resize({ w: logoSize, h: logoSize });
                
                const paddingX = Math.round(canvasW * 0.04);
                const paddingY = Math.round(canvasH * 0.04);
                const logoX = canvasW - logoSize - paddingX;
                const logoY = paddingY;
                
                chartJimp.composite(logoJimp, logoX, logoY);
                
                finalImageBuffer = await chartJimp.getBuffer('image/png');
              } catch (logoErr) {
                console.warn(`Failed to overlay logo for ${cleanTicker}: ${logoErr.message}`);
              }
            }

            const filename = `stock_${meta.symbol.replace('.', '_')}_chart_${Date.now()}.png`;
            const outputPath = path.join(config.workspaceDir, filename);
            fs.writeFileSync(outputPath, finalImageBuffer);
            textResult += `\nSaved at file path: ${filename}`;
          }
        }
      } catch (chartErr) {
        console.warn(`Failed to generate stock chart for ${usedTicker}: ${chartErr.message}`);
        textResult += `\n(Gagal memuat grafik: ${chartErr.message})`;
      }

      return textResult;
    } catch (err) {
      return `Error getting stock price for ${symbol}: ${err.message}`;
    }
  },

  dramabox_search: async ({ query }) => {
    try {
      const r = await axios.get(`https://www.dramabox.com/search?searchValue=${encodeURIComponent(query)}`);
      const match = r.data.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (!match) {
        return JSON.stringify({ status: 'error', msg: 'Failed to extract NEXT_DATA' });
      }
      const json = JSON.parse(match[1]);
      const list = json.props.pageProps.bookList || [];
      return JSON.stringify({
        query: query,
        total: list.length,
        results: list.map(v => ({
          id: v.bookId,
          title: v.bookName,
          episodes: v.totalChapterNum,
          description: v.introduction,
          cover: v.coverCutWap || v.coverWap,
          play_url: `https://www.dramabox.com/video/${v.bookId}_${v.bookNameEn}/${v.chapterId}_Episode-1`
        }))
      });
    } catch (e) {
      return JSON.stringify({ status: 'error', msg: e.message });
    }
  },

  krl_schedule: async ({ stationName }) => {
    try {
      console.log(`Searching KRL station code for: ${stationName}`);
      const httpsAgent = new https.Agent({ rejectUnauthorized: false });
      const stationsRes = await axios.get('https://api.comuline.com/v1/station', { 
        timeout: 8000,
        httpsAgent
      });
      if (!stationsRes.data || !stationsRes.data.data) {
        return `Gagal mengambil data stasiun KRL.`;
      }
      
      const stations = stationsRes.data.data;
      const queryLower = stationName.toLowerCase().trim();
      
      let matchedStation = stations.find(s => s.name.toLowerCase() === queryLower || s.id.toLowerCase() === queryLower);
      if (!matchedStation) {
        matchedStation = stations.find(s => s.name.toLowerCase().includes(queryLower));
      }
      
      if (!matchedStation) {
        const suggestions = stations
          .filter(s => s.name.toLowerCase().includes(queryLower.substring(0, 3)))
          .map(s => s.name)
          .slice(0, 5);
        let errorMsg = `Stasiun KRL "${stationName}" tidak ditemukan.`;
        if (suggestions.length > 0) {
          errorMsg += ` Apakah yang Anda maksud: ${suggestions.join(', ')}?`;
        }
        return errorMsg;
      }
      
      console.log(`Found station: ${matchedStation.name} (${matchedStation.id})`);
      
      const scheduleRes = await axios.get(`https://api.comuline.com/v1/schedule/${matchedStation.id}`, { 
        timeout: 8000,
        httpsAgent
      });
      if (!scheduleRes.data || !scheduleRes.data.data) {
        return `Gagal mengambil jadwal kereta untuk stasiun ${matchedStation.name}.`;
      }
      
      const schedule = scheduleRes.data.data;
      if (schedule.length === 0) {
        return `Tidak ada jadwal keberangkatan KRL yang terdaftar untuk stasiun ${matchedStation.name} saat ini.`;
      }
      
      schedule.sort((a, b) => new Date(a.departs_at) - new Date(b.departs_at));
      
      let formattedText = `🚆 *JADWAL KRL COMMUTER LINE - STASIUN ${matchedStation.name} (${matchedStation.id})* 🚆\n\n`;
      
      const upcomingTrains = schedule.slice(0, 15);
      
      upcomingTrains.forEach((train, idx) => {
        const depTime = new Date(train.departs_at);
        const timeStr = depTime.toLocaleTimeString('id-ID', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
        
        const destStation = stations.find(s => s.id === train.station_destination_id);
        const destName = destStation ? destStation.name : train.station_destination_id;
        
        formattedText += `${idx + 1}. *${timeStr} WIB* - KA ${train.train_id}\n`;
        formattedText += `   • Rute: ${train.route}\n`;
        formattedText += `   • Tujuan Akhir: *${destName}*\n`;
        formattedText += `   • Line: ${train.line}\n\n`;
      });
      
      formattedText += `_Catatan: Jadwal diperoleh dari Comuline API (KAI Commuter)._`;

      // Generate the schedule card image using Jimp
      try {
        console.log(`Rendering KRL schedule image card for stasiun ${matchedStation.name}...`);
        const { loadFont } = await import('jimp');
        const { SANS_32_WHITE, SANS_16_WHITE } = await import('jimp/fonts');
        
        const fontHeader = await loadFont(SANS_32_WHITE);
        const fontBody = await loadFont(SANS_16_WHITE);
        
        const cardHeight = 150 + (upcomingTrains.length * 40) + 40;
        const cardWidth = 800;
        
        const image = new Jimp({ width: cardWidth, height: cardHeight, color: 0x0f172aff });
        
        image.print({ font: fontHeader, x: 30, y: 25, text: `JADWAL KRL - ${matchedStation.name.toUpperCase()} (${matchedStation.id})` });
        
        const headerY = 100;
        image.print({ font: fontBody, x: 30, y: headerY, text: 'WAKTU' });
        image.print({ font: fontBody, x: 150, y: headerY, text: 'KA' });
        image.print({ font: fontBody, x: 260, y: headerY, text: 'RUTE' });
        image.print({ font: fontBody, x: 580, y: headerY, text: 'TUJUAN AKHIR' });
        
        image.print({ font: fontBody, x: 30, y: headerY + 18, text: '_'.repeat(93) });
        
        upcomingTrains.forEach((train, idx) => {
          const y = 140 + (idx * 40);
          
          const depTime = new Date(train.departs_at);
          const timeStr = depTime.toLocaleTimeString('id-ID', {
            timeZone: 'Asia/Jakarta',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });
          
          const destStation = stations.find(s => s.id === train.station_destination_id);
          const destName = destStation ? destStation.name : train.station_destination_id;
          
          image.print({ font: fontBody, x: 30, y, text: `${timeStr} WIB` });
          image.print({ font: fontBody, x: 150, y, text: train.train_id });
          
          let routeStr = train.route || '';
          if (routeStr.length > 32) routeStr = routeStr.substring(0, 30) + '...';
          image.print({ font: fontBody, x: 260, y, text: routeStr });
          
          let destStr = destName || '';
          if (destStr.length > 20) destStr = destStr.substring(0, 18) + '...';
          image.print({ font: fontBody, x: 580, y, text: destStr });
        });
        
        const filename = `krl_schedule_${matchedStation.id}_${Date.now()}.png`;
        const outputPath = path.join(config.workspaceDir, filename);
        await image.write(outputPath);
        
        formattedText += `\n\nSaved at file path: ${filename}`;
      } catch (imgErr) {
        console.error('Failed to generate KRL schedule image card:', imgErr.message);
      }

      return formattedText;
      
    } catch (err) {
      return `Gagal mengambil jadwal kereta KRL: ${err.message}`;
    }
  },

  translate_text: async ({ text, targetLang, sourceLang = 'auto' }) => {
    try {
      const httpsAgent = new https.Agent({ rejectUnauthorized: false });
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await axios.get(url, { timeout: 8000, httpsAgent });
      const data = res.data;
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = data[0].map(item => item[0]).join('');
        return translated;
      }
      return `Gagal menerjemahkan teks. Format respons tidak sesuai.`;
    } catch (err) {
      return `Gagal menerjemahkan teks: ${err.message}`;
    }
  },

  currency_converter: async ({ amount, fromCurrency, toCurrency }) => {
    try {
      const from = fromCurrency.toUpperCase();
      const to = toCurrency.toUpperCase();
      const httpsAgent = new https.Agent({ rejectUnauthorized: false });
      const url = `https://open.er-api.com/v6/latest/${from}`;
      const res = await axios.get(url, { timeout: 8000, httpsAgent });
      
      if (!res.data || res.data.result !== 'success') {
        return `Gagal mengonversi mata uang. Tidak dapat mengambil data nilai tukar untuk ${from}.`;
      }
      
      const rate = res.data.rates[to];
      if (rate === undefined) {
        return `Gagal mengonversi mata uang. Kode mata uang tujuan ${to} tidak didukung.`;
      }
      
      const converted = amount * rate;
      const formattedAmount = amount.toLocaleString('id-ID');
      const formattedConverted = converted.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      return `💱 *KONVERSI MATA UANG*\n\n` +
             `• Dari: *${formattedAmount} ${from}*\n` +
             `• Ke: *${formattedConverted} ${to}*\n` +
             `• Kurs saat ini: 1 ${from} = ${rate} ${to}\n` +
             `• Update terakhir: ${res.data.time_last_update_utc || 'N/A'}`;
    } catch (err) {
      return `Gagal mengonversi mata uang: ${err.message}`;
    }
  },

  shorten_url: async ({ url }) => {
    try {
      const httpsAgent = new https.Agent({ rejectUnauthorized: false });
      const apiUrl = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`;
      const res = await axios.get(apiUrl, { timeout: 8000, httpsAgent });
      if (res.data && typeof res.data === 'string' && res.data.startsWith('http')) {
        return `🔗 *SHORTENED URL*\n\n` +
               `• Original: ${url}\n` +
               `• Short link: *${res.data}*`;
      }
      return `Gagal menyingkat URL. Format respons tidak sesuai.`;
    } catch (err) {
      return `Gagal menyingkat URL: ${err.message}`;
    }
  },

  set_personality: async ({ personality }, chatId) => {
    if (!chatId) {
      throw new Error('Chat ID tidak tersedia untuk mengubah kepribadian.');
    }
    const personalityPath = path.join(config.memoryDir, `${chatId}_personality.txt`);
    
    const mapping = {
      biasa: 'Biasa (Default) 🤖',
      wibu: 'Wibu / Otaku 🌸',
      tsundere: 'Tsundere 😒',
      sarcastic: 'Sarkastik (Ketus) 🎭',
      professional: 'Profesional 👔',
      mentor: 'Mentor Coding 🎓'
    };

    if (!(personality in mapping)) {
      return `Error: Kepribadian "${personality}" tidak dikenal. Pilihan yang valid adalah: biasa, wibu, tsundere, sarcastic, professional, mentor.`;
    }

    try {
      if (personality === 'biasa') {
        if (fs.existsSync(personalityPath)) {
          fs.unlinkSync(personalityPath);
        }
      } else {
        fs.writeFileSync(personalityPath, personality, 'utf8');
      }
      return `Sukses mengubah kepribadian AI menjadi: ${mapping[personality]}. Mulai sekarang saya akan merespon dengan kepribadian baru ini!`;
    } catch (err) {
      return `Gagal mengubah kepribadian: ${err.message}`;
    }
  }
};

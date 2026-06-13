import fs from 'fs';
import https from 'https';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import AdmZip from 'adm-zip';
import { config } from './config.js';
import { isPathSafe, ensureSandbox, downloadVideo, getYtDlpPath, searchWikipedia, fetchWebpage, downloadPollinationsImage, searchGoogleNews, fetchBmkgWeather, getWeatherEmoji, compressImageIfLarge, compressAudioIfLarge, getRandomUserAgent, getBypassHeaders, getYtMetadata, execWithTreeKill, safeMarkdown, uploadToTmpfiles, optimizeAudioFile, trimAudioFile, extractAudioFromVideo } from './utils.js';
import axios from 'axios';
import mime from 'mime';
import * as cheerio from 'cheerio';
import { Jimp } from 'jimp';
import Groq from 'groq-sdk';
import chalk from 'chalk';
import { 
  startTicTacToe, 
  startSuit, 
  startTebakKata, 
  startMathQuiz, 
  startTebakFf, 
  startTebakGambar, 
  startSlot, 
  startTebakAngka, 
  startBlackjack, 
  startTebakBendera, 
  startChess 
} from './games.js';

import { wrapGroqClient } from './usage.js';

const execAsync = promisify(exec);

const groq = config.groqApiKey ? wrapGroqClient(new Groq({ apiKey: config.groqApiKey })) : null;

function stripThinkBlock(text) {
  if (!text) return '';
  let clean = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  clean = clean.replace(/<think>[\s\S]*/gi, '');
  return clean.trim();
}

async function transcribeAudioFile(audioPath) {
  if (!groq) {
    throw new Error('Groq client is not initialized. Please configure GROQ_API_KEY in your .env file.');
  }

  let attempt = 1;
  const maxRetries = 5;
  while (true) {
    try {
      const response = await groq.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'whisper-large-v3',
      });
      return response.text;
    } catch (error) {
      const isRateLimit = error.status === 429 || 
                          (error.message && (
                            error.message.includes('Rate limit') ||
                            error.message.includes('Limit')
                          ));
      const isConnectionError = !error.status || 
                                (error.message && (
                                  error.message.includes('Connection error') ||
                                  error.message.includes('ECONNRESET') ||
                                  error.message.includes('ETIMEDOUT') ||
                                  error.message.includes('timeout') ||
                                  error.message.includes('fetch')
                                ));
      
      if ((isRateLimit || isConnectionError) && attempt < maxRetries) {
        let waitTime = attempt * 3;
        console.warn(`[API Error] Groq Tool Transcription failed (Connection/429): ${error.message}. Waiting for ${waitTime}s before retry (Attempt ${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
        attempt++;
      } else {
        console.error('Groq tool transcription error:', error.message);
        throw new Error('Gagal mentranskripsi file audio: ' + error.message);
      }
    }
  }
}



export const toolsDefinition = [
  {
    type: 'function',
    function: {
      name: 'get_video_transcript',
      description: 'Get the full transcript text of any video/audio URL (YouTube, TikTok, SnackVideo, Likee, Instagram, Twitter/X, Facebook, vt.tiktok.com, fb.watch, etc.). Use this to answer questions about the video content or summarize it.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The video/audio URL to transcribe.' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file in workspace.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path' },
          content: { type: 'string', description: 'File content. CRITICAL: If the content contains double quotes (e.g. in HTML attributes like class="x" or JS strings like alert("y")), you MUST escape them as \\" (or double escape if nested) to ensure it is valid JSON. Never output unescaped double quotes inside this string parameter.' }
        },
        required: ['filePath', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read file in workspace.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path' }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_file',
      description: 'Send a file from the sandbox workspace directly to the user as an attachment/document. Use this when the user explicitly requests to send, get, download, or deliver a specific file from the workspace.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path' }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in workspace folder.',
      parameters: {
        type: 'object',
        properties: {
          directoryPath: { type: 'string', description: 'Relative path' }
        },
        required: ['directoryPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_command',
      description: 'Run shell command inside workspace.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'download_video_tool',
      description: 'Download video/audio from URL (YouTube, TikTok, SnackVideo, Likee, Instagram, Twitter/X, Facebook, etc.) to workspace.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Video/audio URL' },
          type: { type: 'string', enum: ['video', 'audio'], description: 'Type of media: video or audio' },
          format: { type: 'string', description: 'Specific audio or video format extension (e.g. mp3, wav, ogg, flac, mp4, mkv, etc.)' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'zip_project',
      description: 'Zip workspace directory.',
      parameters: {
        type: 'object',
        properties: {
          dirName: { type: 'string', description: 'Directory to zip' },
          zipName: { type: 'string', description: 'Output zip name' }
        },
        required: ['dirName', 'zipName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'wikipedia_search',
      description: 'Search Wikipedia.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Query' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'google_news_search',
      description: 'Search Google News for recent articles. ALWAYS call this tool first when the user asks for news. After getting the search results, you must call the fetch_webpage tool on the most relevant article link to fetch its full text content for writing summaries.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The news topic or query to search for.' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_webpage',
      description: 'Fetch plain text from webpage.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Webpage URL' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Generate image from prompt.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Image description' }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete file from workspace.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path' }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_directory',
      description: 'Create directory in workspace.',
      parameters: {
        type: 'object',
        properties: {
          dirPath: { type: 'string', description: 'Relative path' }
        },
        required: ['dirPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get weather of location.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name' }
        },
        required: ['city']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_crypto_price',
      description: 'Get cryptocurrency price in USD.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Crypto symbol (e.g. bitcoin)' }
        },
        required: ['symbol']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'Evaluate math expression.',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Math expression' }
        },
        required: ['expression']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_qr',
      description: 'Generate QR code.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'URL or text' },
          filename: { type: 'string', description: 'Output filename' }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rename_file',
      description: 'Rename/move file.',
      parameters: {
        type: 'object',
        properties: {
          oldFilePath: { type: 'string', description: 'Current path' },
          newFilePath: { type: 'string', description: 'New path' }
        },
        required: ['oldFilePath', 'newFilePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'screenshot_webpage',
      description: 'Take webpage screenshot.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL' },
          filename: { type: 'string', description: 'Output filename' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_image',
      description: 'Analyze local image.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path' },
          question: { type: 'string', description: 'Analysis request' }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'save_user_memory',
      description: 'Save user fact to memory.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Category/key' },
          value: { type: 'string', description: 'Fact detail' }
        },
        required: ['key', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_user_memory',
      description: 'Delete user memory key.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Memory key' }
        },
        required: ['key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Edit file using search-and-replace blocks.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path' },
          edits: {
            type: 'array',
            description: 'Edits list',
            items: {
              type: 'object',
              properties: {
                oldText: { type: 'string', description: 'Exact text to replace' },
                newText: { type: 'string', description: 'Replacement text' }
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
      description: 'Generate video from prompt.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Prompt' },
          model: { type: 'string', enum: ['seedance', 'veo', 'wan'], description: 'Model' }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'image_to_image',
      description: 'Style/modify image using prompt.',
      parameters: {
        type: 'object',
        properties: {
          imagePath: { type: 'string', description: 'Relative path' },
          prompt: { type: 'string', description: 'New style/prompt' }
        },
        required: ['imagePath', 'prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'unzip_file',
      description: 'Unzip archive.',
      parameters: {
        type: 'object',
        properties: {
          zipFilePath: { type: 'string', description: 'Relative path' },
          destDir: { type: 'string', description: 'Destination path' }
        },
        required: ['zipFilePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deploy_to_vercel',
      description: 'Deploy project to Vercel.',
      parameters: {
        type: 'object',
        properties: {
          projectDir: { type: 'string', description: 'Relative path' },
          vercelToken: { type: 'string', description: 'Token' },
          production: { type: 'boolean', description: 'Production flag' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'youtube_search',
      description: 'Search YouTube.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term' },
          limit: { type: 'integer', description: 'Max results' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Query' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_stock_price',
      description: 'Get stock price & chart.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Stock symbol' }
        },
        required: ['symbol']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dramabox_search',
      description: 'Search Dramabox.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Query' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'krl_schedule',
      description: 'Get KRL commuterline schedule.',
      parameters: {
        type: 'object',
        properties: {
          stationName: { type: 'string', description: 'Station name' }
        },
        required: ['stationName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'translate_text',
      description: 'Translate text.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text' },
          targetLang: { type: 'string', description: 'Target language' },
          sourceLang: { type: 'string', description: 'Source language' }
        },
        required: ['text', 'targetLang']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'currency_converter',
      description: 'Convert currency.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Amount' },
          fromCurrency: { type: 'string', description: 'From currency' },
          toCurrency: { type: 'string', description: 'To currency' }
        },
        required: ['amount', 'fromCurrency', 'toCurrency']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'shorten_url',
      description: 'Shorten URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Long URL' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_personality',
      description: 'Change agent personality.',
      parameters: {
        type: 'object',
        properties: {
          personality: {
            type: 'string',
            enum: ['biasa', 'wibu', 'tsundere', 'sarcastic', 'professional', 'mentor'],
            description: 'Personality'
          }
        },
        required: ['personality']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_earthquake_info',
      description: 'Get latest Indonesian earthquake info.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_prayer_times',
      description: 'Get daily prayer times.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name' }
        },
        required: ['city']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_anime_manga',
      description: 'Search anime or manga info.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Title' },
          type: { type: 'string', enum: ['anime', 'manga'], description: 'Type' }
        },
        required: ['query', 'type']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'lookup_whois_geoip',
      description: 'WHOIS or GeoIP lookup.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Domain or IP' }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_song_lyrics',
      description: 'Get song lyrics.',
      parameters: {
        type: 'object',
        properties: {
          songTitle: { type: 'string', description: 'Song title' },
          artistName: { type: 'string', description: 'Artist name' }
        },
        required: ['songTitle']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'npm_install',
      description: 'Install one or more npm packages into the sandbox workspace. DO NOT call this arbitrarily. First analyze whether Node built-in modules or already installed modules in package.json are sufficient. Only call this if an external package is strictly required. Pass all required packages at once as a space-separated string.',
      parameters: {
        type: 'object',
        properties: {
          packages: {
            type: 'string',
            description: 'Space-separated list of npm package names to install. Example: "axios cheerio puppeteer"'
          }
        },
        required: ['packages']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_meme',
      description: 'Generate a funny meme image based on a topic query using AI.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'The topic/theme of the meme. Example: "programmer coding", "kopi pagi"' }
        },
        required: ['topic']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'enhance_image',
      description: 'Upscale/enhance the visual quality and resolution of a local image file in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path to the image to enhance (e.g. input.jpg)' }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_tts',
      description: 'Convert text to speech/voice note file in Indonesian.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text content to speak.' }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'apply_voice_filter',
      description: 'Change the voice/audio effect of a local audio file.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path to the audio file in workspace.' },
          filterType: { type: 'string', enum: ['chipmunk', 'deep', 'robot', 'fast', 'slow', 'echo'], description: 'Voice filter/changer type.' }
        },
        required: ['filePath', 'filterType']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'primbon_weton_jodoh',
      description: 'Check Javanese Primbon weton love compatibility between two people based on names and birthdates.',
      parameters: {
        type: 'object',
        properties: {
          name1: { type: 'string', description: 'Name of the first person' },
          birthdate1: { type: 'string', description: 'Birthdate of the first person (YYYY-MM-DD)' },
          name2: { type: 'string', description: 'Name of the second person' },
          birthdate2: { type: 'string', description: 'Birthdate of the second person (YYYY-MM-DD)' }
        },
        required: ['name1', 'birthdate1', 'name2', 'birthdate2']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'zodiac_fortune',
      description: 'Get daily zodiac fortune forecast including general advice, love, career, health, lucky color, and lucky number.',
      parameters: {
        type: 'object',
        properties: {
          sign: { type: 'string', enum: ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'], description: 'Zodiac sign name' },
          birthdate: { type: 'string', description: 'Birthdate of the person (YYYY-MM-DD) to auto-resolve their sign' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'tarot_reading',
      description: 'Draw a tarot card and get a mystical AI tarot reading in Indonesian for a specific question or focus area.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question or focus area for the tarot reading' }
        },
        required: ['question']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'play_game',
      description: 'Start a game session for the user. Available games: tictactoe, suit, tebak_kata, math_quiz, tebak_ff, tebak_gambar, slot, tebak_angka, blackjack, tebak_bendera, chess.',
      parameters: {
        type: 'object',
        properties: {
          gameName: {
            type: 'string',
            enum: ['tictactoe', 'suit', 'tebak_kata', 'math_quiz', 'tebak_ff', 'tebak_gambar', 'slot', 'tebak_angka', 'blackjack', 'tebak_bendera', 'chess'],
            description: 'The name of the game to start.'
          }
        },
        required: ['gameName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_song',
      description: 'Find and identify the background music/song used in a video from TikTok, Instagram Reels, YouTube Shorts, or any other supported video URL. Returns song title, artist, album, and a YouTube search link. Use this when the user asks: "lagu ini apa?", "cari sumber lagu", "identify music", "sound ini apa", dll.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The video URL (TikTok, Instagram Reels, YouTube Shorts, etc.) to extract the music info from.'
          }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'google_search',
      description: 'Search Google for recent information, websites, links, and search results.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search term or query to look up on Google.' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'love_compatibility',
      description: 'Check general love compatibility between two people based on their names and birthdates using Western Astrology (Zodiac) and Numerology.',
      parameters: {
        type: 'object',
        properties: {
          name1: { type: 'string', description: 'Name of the first person.' },
          birthdate1: { type: 'string', description: 'Birthdate of the first person (YYYY-MM-DD).' },
          name2: { type: 'string', description: 'Name of the second person.' },
          birthdate2: { type: 'string', description: 'Birthdate of the second person (YYYY-MM-DD).' }
        },
        required: ['name1', 'birthdate1', 'name2', 'birthdate2']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'kamus_gaul',
      description: 'Explain modern Indonesian slang words, memes, or subcultures (e.g. starboy, skena, cegil, coet, mberot) with a funny and accurate definition bertenaga AI.',
      parameters: {
        type: 'object',
        properties: {
          slangWord: { type: 'string', description: 'The Indonesian slang word or term to explain.' }
        },
        required: ['slangWord']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_pantun',
      description: 'Generate a traditional Indonesian pantun (poem) based on a specific theme (humor, romance, advice, coding, etc.).',
      parameters: {
        type: 'object',
        properties: {
          theme: { type: 'string', description: 'The theme of the pantun (e.g. jenaka, cinta, nasihat, coding).' },
          targetName: { type: 'string', description: 'Optional target name to dedicate the pantun to.' }
        },
        required: ['theme']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'optimize_audio',
      description: 'Optimize, compress, and enhance the quality of a local audio file in the workspace. It can boost bass, improve vocal clarity, normalize loudness, and reduce the file size.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path to the audio file in the workspace.' },
          enhancement: { 
            type: 'string', 
            enum: ['bass_boost', 'vocal_clarity', 'normalization', 'none'], 
            description: 'Type of audio enhancement to apply.' 
          },
          quality: { 
            type: 'string', 
            enum: ['low', 'medium', 'high'], 
            description: 'Target quality vs file size: low (smallest size, 64k), medium (balanced, 128k), high (best quality, 192k).' 
          },
          format: { 
            type: 'string', 
            enum: ['mp3', 'm4a', 'ogg'], 
            description: 'Target audio file format.' 
          }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'trim_audio',
      description: 'Cut / trim a local audio file to a specific start and end time.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path to the audio file in the workspace.' },
          startTime: { type: 'string', description: 'Start time in seconds or format HH:MM:SS (e.g. "15", "00:00:15"). Default is "0".' },
          endTime: { type: 'string', description: 'End time in seconds or format HH:MM:SS (e.g. "45", "00:00:45").' }
        },
        required: ['filePath', 'endTime']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'extract_audio_from_video',
      description: 'Extract the audio track from a local video file (e.g., MP4) and save it as an audio file.',
      parameters: {
        type: 'object',
        properties: {
          videoPath: { type: 'string', description: 'Relative path to the video file in the workspace.' },
          format: { 
            type: 'string', 
            enum: ['mp3', 'm4a', 'wav', 'ogg'], 
            description: 'Target audio file format (default is mp3).' 
          }
        },
        required: ['videoPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_js_file',
      description: 'Execute a local .js file in the sandbox, render the console stdout/stderr output into an elegant terminal screenshot image, and return any newly generated/modified files (images, audio, video, etc.) to the user.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path of the .js file to run.' }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_python_file',
      description: 'Execute a local .py file in the sandbox, render the console stdout/stderr output into an elegant terminal screenshot image, and return any newly generated/modified files (images, audio, video, etc.) to the user.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path of the .py file to run.' }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'clone_github_repo',
      description: 'Clone a public GitHub repository into the sandbox workspace.',
      parameters: {
        type: 'object',
        properties: {
          repoUrl: { type: 'string', description: 'The public GitHub repository URL (e.g. https://github.com/user/repo.git).' },
          destDir: { type: 'string', description: 'Optional relative destination directory. Defaults to the repo name.' }
        },
        required: ['repoUrl']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sqlite_query_tool',
      description: 'Execute an SQL query against a local SQLite database file in the workspace and get tabular results.',
      parameters: {
        type: 'object',
        properties: {
          dbPath: { type: 'string', description: 'Relative path to the .db or .sqlite database file.' },
          query: { type: 'string', description: 'The SELECT, INSERT, UPDATE, or other SQL query to execute.' }
        },
        required: ['dbPath', 'query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_sticker',
      description: 'Generate an AI image based on a prompt and automatically convert it into a 512x512 transparent WebP Telegram sticker.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Visual description of the sticker.' },
          stickerName: { type: 'string', description: 'Optional custom filename (e.g. sticker.webp).' }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'convert_media_format',
      description: 'Convert or transcode an audio or video file from one format to another using ffmpeg.',
      parameters: {
        type: 'object',
        properties: {
          inputPath: { type: 'string', description: 'Relative path to the source audio or video file.' },
          outputPath: { type: 'string', description: 'Relative path to save the converted media file (must include target extension e.g. output.mp3 or output.gif).' }
        },
        required: ['inputPath', 'outputPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_pdf_docx',
      description: 'Read and extract plain text from a local PDF or Microsoft Word DOCX file in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path to the .pdf or .docx file.' }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'url_to_pdf',
      description: 'Render and save any web page URL into a clean A4 PDF document using Puppeteer.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Web page URL.' },
          pdfName: { type: 'string', description: 'Optional custom filename (e.g. page.pdf).' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'reminder_timer_tool',
      description: 'Set a one-shot reminder timer to notify you with a custom message after a specified duration.',
      parameters: {
        type: 'object',
        properties: {
          timeStr: { type: 'string', description: 'Duration until reminder (e.g. "30s", "5m", "1h" or a number of seconds).' },
          message: { type: 'string', description: 'The reminder message to be sent.' }
        },
        required: ['timeStr', 'message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ssh_monitor_server',
      description: 'Connect to a remote Linux server via SSH and monitor resource usage including CPU, RAM, Disk, Active Processes, Network Traffic, and System Uptime.',
      parameters: {
        type: 'object',
        properties: {
          host: { type: 'string', description: 'The remote server host address (IP or domain name).' },
          username: { type: 'string', description: 'The SSH username for connection.' },
          password: { type: 'string', description: 'The SSH password. Required if privateKey is not provided.' },
          privateKey: { type: 'string', description: 'Optional SSH private key content (PEM format).' },
          port: { type: 'number', description: 'The SSH connection port. Default is 22.' }
        },
        required: ['host', 'username']
      }
    }
  }
];


async function renderConsoleOutputToImage(terminalText, filePath, titlePrefix = 'node') {
  let consoleImageFilename = null;
  try {
    console.log(`[renderConsoleOutputToImage] Rendering console output for ${titlePrefix} ${filePath}...`);
    const { Jimp } = await import('jimp');
    const { loadFont } = await import('jimp');
    const { SANS_16_WHITE } = await import('jimp/fonts');

    const fontBody = await loadFont(SANS_16_WHITE);

    const rawLines = terminalText.split('\n');
    const wrappedLines = [];
    const maxCharsPerLine = 85;

    for (const line of rawLines) {
      if (line.length <= maxCharsPerLine) {
        wrappedLines.push(line);
      } else {
        for (let idx = 0; idx < line.length; idx += maxCharsPerLine) {
          wrappedLines.push(line.substring(idx, idx + maxCharsPerLine));
        }
      }
    }

    const displayLines = wrappedLines.slice(0, 50);
    if (wrappedLines.length > 50) {
      displayLines.push(`... [Truncated ${wrappedLines.length - 50} lines of output] ...`);
    }

    const lineHeight = 24;
    const padding = 30;
    const headerHeight = 80;
    const cardWidth = 850;
    const cardHeight = headerHeight + (displayLines.length * lineHeight) + padding;

    const image = new Jimp({ width: cardWidth, height: cardHeight, color: 0x1e1e1eff });

    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < cardWidth; x++) {
        image.setPixelColor(0x2d2d2dff, x, y);
      }
    }

    const drawCircle = (cx, cy, r, color) => {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) {
            image.setPixelColor(color, x, y);
          }
        }
      }
    };

    drawCircle(30, 25, 6, 0xff5f56ff);
    drawCircle(50, 25, 6, 0xffbd2eff);
    drawCircle(70, 25, 6, 0x27c93fff);

    image.print({ font: fontBody, x: 100, y: 16, text: `Terminal - ${titlePrefix} ${filePath}` });

    displayLines.forEach((line, idx) => {
      const y = headerHeight + (idx * lineHeight);
      const cleanLine = line.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      image.print({ font: fontBody, x: 30, y, text: cleanLine });
    });

    consoleImageFilename = `console_output_${Date.now()}.png`;
    const consoleImagePath = path.resolve(config.workspaceDir, consoleImageFilename);
    await image.write(consoleImagePath);
  } catch (jimpErr) {
    console.error(`[renderConsoleOutputToImage] Failed to render console output:`, jimpErr.message);
  }
  return consoleImageFilename;
}

const formatSshMonitorResults = (results) => {
  let report = `🖥️ *SSH LINUX SERVER MONITOR REPORT* 🖥️\n\n`;

  // 1. System Info
  if (results.sysInfo) {
    const lines = results.sysInfo.stdout.split('\n');
    const os = lines[2] ? lines[2].replace('PRETTY_NAME=', '').replace(/"/g, '') : 'Unknown Linux';
    const uptime = lines[1] || 'Unknown';
    report += `ℹ️ *Informasi Sistem:*\n`;
    report += `• OS: *${os}*\n`;
    report += `• Uptime & Load: _${uptime}_\n\n`;
  }

  // 2. CPU / Load
  if (results.cpuLoad) {
    const load = results.cpuLoad.stdout.split('\n')[0] || 'N/A';
    report += `⚡ *Beban CPU (Load Avg):*\n• ${load}\n\n`;
  }

  // 3. Memory usage
  if (results.memory) {
    const lines = results.memory.stdout.split('\n');
    const memData = lines[1];
    if (memData) {
      const parts = memData.trim().split(/\s+/);
      const total = parseFloat(parts[1]) || 0;
      const used = parseFloat(parts[2]) || 0;
      const free = parseFloat(parts[3]) || 0;
      const available = parseFloat(parts[6]) || parseFloat(parts[3]) || 0;
      const pct = total !== 0 ? ((used / total) * 100).toFixed(1) : '0';
      report += `🧠 *Penggunaan Memori (RAM):*\n`;
      report += `• Total: *${total} MB*\n`;
      report += `• Digunakan: *${used} MB (${pct}%)*\n`;
      report += `• Bebas: *${free} MB*\n`;
      report += `• Tersedia: *${available} MB*\n\n`;
    }
  }

  // 4. Disk space
  if (results.disk) {
    report += `💾 *Ruang Penyimpanan (Disk df -h):*\n`;
    const lines = results.disk.stdout.split('\n');
    let hasDiskInfo = false;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      const fs = parts[0];
      const size = parts[1];
      const used = parts[2];
      const pct = parts[4];
      const mount = parts[5];
      if (mount === '/' || mount?.startsWith('/mnt') || mount?.startsWith('/media') || fs?.startsWith('/dev/')) {
        report += `• *${mount}* (${fs}): *${used}* / *${size}* (${pct} terpakai)\n`;
        hasDiskInfo = true;
      }
    }
    if (!hasDiskInfo) {
      report += `• Tidak dapat memuat info disk.\n`;
    }
    report += `\n`;
  }

  // 5. Network Traffic
  if (results.network) {
    report += `🌐 *Trafik Jaringan (/proc/net/dev):*\n`;
    const lines = results.network.stdout.split('\n');
    let foundDev = false;
    for (const line of lines) {
      if (line.includes(':')) {
        const parts = line.trim().split(':');
        const iface = parts[0].trim();
        if (iface === 'lo') continue;
        const stats = parts[1].trim().split(/\s+/);
        const rxBytes = parseInt(stats[0] || '0');
        const txBytes = parseInt(stats[8] || '0');
        const rxMb = (rxBytes / (1024 * 1024)).toFixed(2);
        const txMb = (txBytes / (1024 * 1024)).toFixed(2);
        report += `• *${iface}*: Diterima: *${rxMb} MB* | Dikirim: *${txMb} MB*\n`;
        foundDev = true;
      }
    }
    if (!foundDev) {
      report += `• Tidak ada interface aktif selain loopback.\n`;
    }
    report += `\n`;
  }

  // 6. Top CPU Processes
  if (results.processes) {
    report += `📊 *Proses Teratas (Penggunaan CPU tertinggi):*\n`;
    report += `\`\`\`\n`;
    const lines = results.processes.stdout.split('\n');
    const header = `  PID  %CPU  %MEM  COMMAND`;
    report += header + `\n`;
    for (let i = 1; i < Math.min(lines.length, 6); i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      const pid = parts[0];
      const cpu = parts[3];
      const mem = parts[4];
      let cmd = parts.slice(5).join(' ');
      if (cmd.length > 25) cmd = cmd.substring(0, 22) + '...';
      const row = `${pid.padStart(5)}  ${cpu.padStart(4)}% ${mem.padStart(4)}%  ${cmd}`;
      report += row + '\n';
    }
    report += `\`\`\``;
  }

  return report;
};

const searchGoogle = async (query, signal) => {
  console.log(chalk.cyan(`[Google] Searching for: "${query}"`));
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  const response = await axios.get(url, {
    headers: getBypassHeaders('www.google.com'),
    timeout: 10000,
    signal: signal || undefined
  });

  const $ = cheerio.load(response.data);
  const results = [];

  $('div.g').each((i, elem) => {
    if (results.length >= 5) return;
    
    const titleElem = $(elem).find('h3');
    const title = titleElem.text().trim();
    const link = $(elem).find('a').first().attr('href');
    
    let snippet = $(elem).find('div[style*="-webkit-line-clamp"]').text().trim() ||
                  $(elem).find('div.VwiC3b').text().trim() ||
                  $(elem).find('span.aCOp2e').text().trim() ||
                  $(elem).find('.st').text().trim();
    
    if (title && link && link.startsWith('http')) {
      results.push(`Title: ${title}\nSnippet: ${snippet}\nLink: ${link}`);
    }
  });

  if (results.length === 0) {
    $('a').each((i, elem) => {
      if (results.length >= 5) return;
      const href = $(elem).attr('href') || '';
      if (href.startsWith('/url?q=')) {
        const cleanUrl = href.replace('/url?q=', '').split('&')[0];
        const title = $(elem).find('h3').text().trim();
        if (title && cleanUrl && cleanUrl.startsWith('http')) {
          results.push(`Title: ${title}\nLink: ${cleanUrl}`);
        }
      }
    });
  }
  return results;
};

const searchBing = async (query, signal) => {
  console.log(chalk.cyan(`[Bing] Searching for: "${query}"`));
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const response = await axios.get(url, {
    headers: {
      'User-Agent': getRandomUserAgent()
    },
    timeout: 10000,
    signal: signal || undefined
  });

  const $ = cheerio.load(response.data);
  const results = [];

  $('.b_algo').each((i, elem) => {
    if (results.length >= 5) return;
    const titleElem = $(elem).find('h2 a');
    const title = titleElem.text().trim();
    const link = titleElem.attr('href');
    const snippet = $(elem).find('.b_caption p, .b_algo p').text().trim();

    if (title && link && link.startsWith('http')) {
      results.push(`Title: ${title}\nSnippet: ${snippet}\nLink: ${link}`);
    }
  });
  return results;
};

const searchDuckDuckGo = async (query, signal) => {
  console.log(chalk.cyan(`[DuckDuckGo] Searching for: "${query}"`));
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await axios.get(url, {
    headers: {
      'User-Agent': getRandomUserAgent()
    },
    timeout: 10000,
    signal: signal || undefined
  });

  const $ = cheerio.load(response.data);
  const results = [];

  $('.result').each((i, elem) => {
    if (results.length >= 5) return;
    const titleElem = $(elem).find('.result__title a');
    const title = titleElem.text().trim();
    const link = titleElem.attr('href');
    const snippet = $(elem).find('.result__snippet').text().trim();

    if (title && link) {
      let cleanLink = link;
      if (link.startsWith('//')) {
        cleanLink = 'https:' + link;
      }
      results.push(`Title: ${title}\nSnippet: ${snippet}\nLink: ${cleanLink}`);
    }
  });
  return results;
};

const searchYahoo = async (query, signal) => {
  console.log(chalk.cyan(`[Yahoo] Searching for: "${query}"`));
  const url = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
  const response = await axios.get(url, {
    headers: getBypassHeaders('search.yahoo.com'),
    timeout: 10000,
    signal: signal || undefined
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
  return results;
};

const unifiedSearch = async (query, signal) => {
  console.log(chalk.magenta.bold(`\n[Search Process] Starting search for query: "${query}"`));
  const engines = [
    { name: 'Google', fn: searchGoogle },
    { name: 'Bing', fn: searchBing },
    { name: 'DuckDuckGo', fn: searchDuckDuckGo },
    { name: 'Yahoo', fn: searchYahoo }
  ];

  for (const engine of engines) {
    try {
      const results = await engine.fn(query, signal);
      if (results && results.length > 0) {
        console.log(chalk.green.bold(`[Search Process] ✅ Success using ${engine.name} (Found ${results.length} results)`));
        return {
          engine: engine.name,
          results
        };
      }
      console.warn(chalk.yellow(`[Search Process] ⚠️ ${engine.name} returned 0 results, trying next...`));
    } catch (err) {
      if (signal && signal.aborted || err.message === 'STOPPED') throw new Error('STOPPED');
      console.warn(chalk.red(`[Search Process] ❌ ${engine.name} failed: ${err.message}, trying next...`));
    }
  }

  throw new Error('All search engines (Google, Bing, DuckDuckGo, Yahoo) failed or returned no results.');
};

export const toolHandlers = {
  ssh_monitor_server: async ({ host, username, password, port = 22, privateKey = null }, chatId, signal) => {
    try {
      const { Client } = await import('ssh2');
      
      const connOpts = {
        host,
        port,
        username,
        readyTimeout: 10000
      };
      
      if (password) {
        connOpts.password = password;
      }
      if (privateKey) {
        connOpts.privateKey = privateKey;
      }
      
      if (!password && !privateKey) {
        return `Error: Mohon masukkan password atau privateKey untuk melakukan koneksi SSH ke ${host}.`;
      }
      
      const commands = [
        { name: 'sysInfo', cmd: 'uname -a; uptime; cat /etc/os-release | grep -i PRETTY_NAME || true' },
        { name: 'cpuLoad', cmd: 'cat /proc/loadavg || true' },
        { name: 'memory', cmd: 'free -m || true' },
        { name: 'disk', cmd: 'df -h || true' },
        { name: 'network', cmd: 'cat /proc/net/dev || true' },
        { name: 'processes', cmd: 'ps -eo pid,ppid,cmd,%cpu,%mem --sort=-%cpu | head -n 10 || true' }
      ];
      
      console.log(`[SSH Monitor] Connecting to ${username}@${host}:${port}...`);
      
      const results = await new Promise((resolve, reject) => {
        const conn = new Client();
        
        if (signal) {
          signal.addEventListener('abort', () => {
            conn.end();
            reject(new Error('STOPPED'));
          });
        }
        
        conn.on('ready', () => {
          let resultsData = {};
          let index = 0;
          
          const executeNext = () => {
            if (index >= commands.length) {
              conn.end();
              return resolve(resultsData);
            }
            
            const cmdObj = commands[index];
            conn.exec(cmdObj.cmd, (err, stream) => {
              if (err) {
                resultsData[cmdObj.name] = { stdout: '', stderr: err.message, code: -1 };
                index++;
                executeNext();
                return;
              }
              
              let stdout = '';
              let stderr = '';
              stream.on('close', (code, signalCode) => {
                resultsData[cmdObj.name] = { stdout: stdout.trim(), stderr: stderr.trim(), code };
                index++;
                executeNext();
              }).on('data', (data) => {
                stdout += data;
              }).stderr.on('data', (data) => {
                stderr += data;
              });
            });
          };
          
          executeNext();
        }).on('error', (err) => {
          conn.end();
          reject(err);
        }).connect(connOpts);
      });
      
      return formatSshMonitorResults(results);
    } catch (err) {
      if (err.message === 'STOPPED') throw err;
      return `Gagal memantau server via SSH: ${err.message}. Pastikan host, port, username, dan password/privateKey Anda benar.`;
    }
  },

  run_js_file: async ({ filePath }, chatId, signal) => {
    ensureSandbox();
    const resolvedPath = path.resolve(config.workspaceDir, filePath);
    if (!isPathSafe(resolvedPath)) {
      throw new Error(`Access Denied: Path ${filePath} is outside sandbox workspace.`);
    }

    if (!fs.existsSync(resolvedPath)) {
      return `Error: File not found at ${filePath}`;
    }

    const getSandboxFilesMap = (dir, fileList = {}) => {
      if (!fs.existsSync(dir)) return fileList;
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        let stat;
        try {
          stat = fs.statSync(fullPath);
        } catch (e) {
          continue;
        }
        if (stat.isDirectory()) {
          if (item === 'node_modules') continue;
          getSandboxFilesMap(fullPath, fileList);
        } else {
          fileList[fullPath] = stat.mtimeMs;
        }
      }
      return fileList;
    };

    const beforeFiles = getSandboxFilesMap(config.workspaceDir);

    let stdout = '';
    let stderr = '';
    let execError = null;

    try {
      console.log(`[run_js_file] Running node script: ${resolvedPath}`);
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

      const result = await execWithTreeKill(
        `node "${resolvedPath}"`,
        { cwd: config.workspaceDir, env, timeout: 30000 },
        signal
      );
      stdout = result.stdout || '';
      stderr = result.stderr || '';
    } catch (err) {
      execError = err;
      stdout = err.stdout || '';
      stderr = err.stderr || err.message || '';
    }

    const afterFiles = getSandboxFilesMap(config.workspaceDir);
    const newFiles = [];
    for (const file of Object.keys(afterFiles)) {
      if (path.basename(file).startsWith('console_output_')) continue;
      if (!beforeFiles[file] || afterFiles[file] > beforeFiles[file]) {
        newFiles.push(file);
      }
    }

    let terminalText = '';
    if (stdout) terminalText += `STDOUT:\n${stdout}\n`;
    if (stderr) terminalText += `STDERR:\n${stderr}\n`;
    if (!terminalText) terminalText = '(no output)';

    const consoleImageFilename = await renderConsoleOutputToImage(terminalText, filePath, 'node');

    let statusText = execError ? `❌ Execution failed: ${execError.message}` : `✅ Executed successfully.`;
    let resMsg = `${statusText}\n\n`;
    if (consoleImageFilename) {
      resMsg += `Console output image saved as: ${consoleImageFilename}\n`;
    }
    if (newFiles.length > 0) {
      const relativeNewFiles = newFiles.map(f => path.relative(config.workspaceDir, f));
      resMsg += `Generated/modified files:\n${relativeNewFiles.map(f => `📁 ${f}`).join('\n')}\n`;
    } else {
      resMsg += `No new files generated.\n`;
    }

    const filePayload = {
      consoleImage: consoleImageFilename,
      outputFiles: newFiles.map(f => path.relative(config.workspaceDir, f))
    };
    
    return `${resMsg}\n[PAYLOAD:${JSON.stringify(filePayload)}]`;
  },

  run_python_file: async ({ filePath }, chatId, signal) => {
    ensureSandbox();
    const resolvedPath = path.resolve(config.workspaceDir, filePath);
    if (!isPathSafe(resolvedPath)) {
      throw new Error(`Access Denied: Path ${filePath} is outside sandbox workspace.`);
    }

    if (!fs.existsSync(resolvedPath)) {
      return `Error: File not found at ${filePath}`;
    }

    const getSandboxFilesMap = (dir, fileList = {}) => {
      if (!fs.existsSync(dir)) return fileList;
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        let stat;
        try {
          stat = fs.statSync(fullPath);
        } catch (e) {
          continue;
        }
        if (stat.isDirectory()) {
          if (item === 'node_modules') continue;
          getSandboxFilesMap(fullPath, fileList);
        } else {
          fileList[fullPath] = stat.mtimeMs;
        }
      }
      return fileList;
    };

    const beforeFiles = getSandboxFilesMap(config.workspaceDir);

    let stdout = '';
    let stderr = '';
    let execError = null;

    try {
      console.log(`[run_python_file] Running python script: ${resolvedPath}`);
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

      let result;
      try {
        result = await execWithTreeKill(
          `python "${resolvedPath}"`,
          { cwd: config.workspaceDir, env, timeout: 30000 },
          signal
        );
      } catch (pythonErr) {
        if (signal && signal.aborted) throw pythonErr;
        console.log(`[run_python_file] python failed, trying python3 fallback...`);
        result = await execWithTreeKill(
          `python3 "${resolvedPath}"`,
          { cwd: config.workspaceDir, env, timeout: 30000 },
          signal
        );
      }
      stdout = result.stdout || '';
      stderr = result.stderr || '';
    } catch (err) {
      execError = err;
      stdout = err.stdout || '';
      stderr = err.stderr || err.message || '';
    }

    const afterFiles = getSandboxFilesMap(config.workspaceDir);
    const newFiles = [];
    for (const file of Object.keys(afterFiles)) {
      if (path.basename(file).startsWith('console_output_')) continue;
      if (!beforeFiles[file] || afterFiles[file] > beforeFiles[file]) {
        newFiles.push(file);
      }
    }

    let terminalText = '';
    if (stdout) terminalText += `STDOUT:\n${stdout}\n`;
    if (stderr) terminalText += `STDERR:\n${stderr}\n`;
    if (!terminalText) terminalText = '(no output)';

    const consoleImageFilename = await renderConsoleOutputToImage(terminalText, filePath, 'python');

    let statusText = execError ? `❌ Execution failed: ${execError.message}` : `✅ Executed successfully.`;
    let resMsg = `${statusText}\n\n`;
    if (consoleImageFilename) {
      resMsg += `Console output image saved as: ${consoleImageFilename}\n`;
    }
    if (newFiles.length > 0) {
      const relativeNewFiles = newFiles.map(f => path.relative(config.workspaceDir, f));
      resMsg += `Generated/modified files:\n${relativeNewFiles.map(f => `📁 ${f}`).join('\n')}\n`;
    } else {
      resMsg += `No new files generated.\n`;
    }

    const filePayload = {
      consoleImage: consoleImageFilename,
      outputFiles: newFiles.map(f => path.relative(config.workspaceDir, f))
    };
    
    return `${resMsg}\n[PAYLOAD:${JSON.stringify(filePayload)}]`;
  },

  clone_github_repo: async ({ repoUrl, destDir }) => {
    ensureSandbox();
    const urlPattern = /^(https:\/\/github\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+)(\.git)?$/;
    if (!urlPattern.test(repoUrl)) {
      return `Error: Invalid GitHub repository URL. Must be like https://github.com/user/repo`;
    }

    let targetDir = destDir || path.basename(repoUrl, '.git');
    const resolvedPath = path.resolve(config.workspaceDir, targetDir);
    if (!isPathSafe(resolvedPath)) {
      throw new Error(`Access Denied: Path ${targetDir} is outside sandbox workspace.`);
    }

    if (fs.existsSync(resolvedPath)) {
      return `Error: Destination directory ${targetDir} already exists in the workspace.`;
    }

    try {
      console.log(`[clone_github_repo] Cloning ${repoUrl} to ${resolvedPath}`);
      const { stdout, stderr } = await execAsync(`git clone "${repoUrl}" "${resolvedPath}"`, {
        cwd: config.workspaceDir,
        timeout: 60000
      });
      return `Repository cloned successfully!\nStdout: ${stdout || '(no output)'}\nStderr: ${stderr || '(no output)'}`;
    } catch (error) {
      return `Error cloning repository: ${error.message}`;
    }
  },

  sqlite_query_tool: async ({ dbPath, query }) => {
    ensureSandbox();
    const resolvedDbPath = path.resolve(config.workspaceDir, dbPath);
    if (!isPathSafe(resolvedDbPath)) {
      throw new Error(`Access Denied: Path ${dbPath} is outside sandbox workspace.`);
    }

    let sqlite3;
    try {
      sqlite3 = (await import('sqlite3')).default;
    } catch (err) {
      return `Error: The sqlite3 package is not loaded properly. Please make sure it is installed. Details: ${err.message}`;
    }

    return new Promise((resolve) => {
      const db = new sqlite3.Database(resolvedDbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
          return resolve(`Failed to open/create database: ${err.message}`);
        }
      });

      const cleanQuery = query.trim();
      const isSelect = cleanQuery.toLowerCase().startsWith('select');

      if (isSelect) {
        db.all(cleanQuery, [], (err, rows) => {
          db.close();
          if (err) {
            return resolve(`Query error: ${err.message}`);
          }
          if (!rows || rows.length === 0) {
            return resolve(`Query executed successfully. Result: 0 rows returned.`);
          }
          
          const columns = Object.keys(rows[0]);
          const header = `| ${columns.join(' | ')} |`;
          const separator = `| ${columns.map(() => '---').join(' | ')} |`;
          const dataRows = rows.map(row => `| ${columns.map(col => String(row[col] != null ? row[col] : '')).join(' | ')} |`).join('\n');
          
          const markdownTable = `${header}\n${separator}\n${dataRows}`;
          resolve(`Query executed successfully. Results (${rows.length} rows):\n\n${markdownTable}`);
        });
      } else {
        db.run(cleanQuery, [], function (err) {
          db.close();
          if (err) {
            return resolve(`Query execution error: ${err.message}`);
          }
          resolve(`Query executed successfully. Rows modified/affected: ${this.changes || 0}`);
        });
      }
    });
  },

  generate_sticker: async ({ prompt, stickerName }, chatId, signal) => {
    ensureSandbox();
    try {
      console.log(`[generate_sticker] Generating image for sticker with prompt: "${prompt}"`);
      const imagePath = await downloadPollinationsImage(prompt, config.workspaceDir, signal);
      if (!fs.existsSync(imagePath)) {
        throw new Error('Generated image file was not found.');
      }

      const filename = stickerName ? (stickerName.endsWith('.webp') ? stickerName : `${stickerName}.webp`) : `sticker_${Date.now()}.webp`;
      const outputWebpPath = path.resolve(config.workspaceDir, filename);

      if (!isPathSafe(outputWebpPath)) {
        throw new Error('Access Denied: Output file name must be safe within the workspace.');
      }

      console.log(`[generate_sticker] Resizing and formatting to WebP (512x512): ${outputWebpPath}`);
      const jimpImg = await Jimp.read(imagePath);
      jimpImg.resize({ w: 512, h: 512 });
      await jimpImg.write(outputWebpPath);

      try {
        fs.unlinkSync(imagePath);
      } catch (err) {}

      return `Sticker generated successfully. Saved at file path: ${filename}`;
    } catch (error) {
      if (signal && signal.aborted || error.message === 'STOPPED') {
        throw new Error('STOPPED');
      }
      return `Failed to generate sticker: ${error.message}`;
    }
  },

  convert_media_format: async ({ inputPath, outputPath }, chatId, signal) => {
    ensureSandbox();
    const resolvedInput = path.resolve(config.workspaceDir, inputPath);
    const resolvedOutput = path.resolve(config.workspaceDir, outputPath);

    if (!isPathSafe(resolvedInput) || !isPathSafe(resolvedOutput)) {
      throw new Error('Access Denied: Paths must be inside the sandbox workspace.');
    }

    if (!fs.existsSync(resolvedInput)) {
      return `Error: Input file not found at ${inputPath}`;
    }

    try {
      const ffmpegPath = await getFfmpegPath();
      console.log(`[convert_media_format] Converting ${inputPath} to ${outputPath} using ffmpeg...`);
      await execWithTreeKill(
        `"${ffmpegPath}" -y -i "${resolvedInput}" "${resolvedOutput}"`,
        { timeout: 180000 },
        signal
      );
      return `Media converted successfully. Saved as: ${outputPath}`;
    } catch (error) {
      if (signal && signal.aborted) {
        throw new Error('STOPPED');
      }
      return `Failed to convert media format: ${error.message}`;
    }
  },

  read_pdf_docx: async ({ filePath }) => {
    ensureSandbox();
    const resolvedPath = path.resolve(config.workspaceDir, filePath);
    if (!isPathSafe(resolvedPath)) {
      throw new Error(`Access Denied: Path ${filePath} is outside sandbox workspace.`);
    }

    if (!fs.existsSync(resolvedPath)) {
      return `Error: File not found at ${filePath}`;
    }

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.pdf') {
      try {
        const pdf = (await import('pdf-parse')).default;
        const dataBuffer = fs.readFileSync(resolvedPath);
        const data = await pdf(dataBuffer);
        return `Successfully parsed PDF file: ${filePath}\n\nMetadata:\nPages: ${data.numpages}\nTitle: ${data.info?.Title || 'N/A'}\n\nContent:\n${data.text || '(empty)'}`;
      } catch (err) {
        return `Failed to parse PDF file: ${err.message}`;
      }
    } else if (ext === '.docx') {
      try {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ path: resolvedPath });
        return `Successfully parsed DOCX file: ${filePath}\n\nContent:\n${result.value || '(empty)'}`;
      } catch (err) {
        return `Failed to parse DOCX file: ${err.message}`;
      }
    } else {
      return `Error: Unsupported file format. Only .pdf and .docx files are supported.`;
    }
  },

  url_to_pdf: async ({ url, pdfName }) => {
    ensureSandbox();
    const filename = pdfName ? (pdfName.endsWith('.pdf') ? pdfName : `${pdfName}.pdf`) : `webpage_${Date.now()}.pdf`;
    const resolvedPdfPath = path.resolve(config.workspaceDir, filename);

    if (!isPathSafe(resolvedPdfPath)) {
      throw new Error('Access Denied: Output file name must be safe within the workspace.');
    }

    let puppeteer;
    try {
      puppeteer = (await import('puppeteer')).default;
    } catch (err) {
      return `Error: Puppeteer is not loaded correctly. Details: ${err.message}`;
    }

    try {
      console.log(`[url_to_pdf] Launching puppeteer to print URL: ${url}`);
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();
      await page.setUserAgent(getRandomUserAgent());
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      
      console.log(`[url_to_pdf] Generating PDF for URL...`);
      await page.pdf({
        path: resolvedPdfPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '0.4in', right: '0.4in', bottom: '0.4in', left: '0.4in' }
      });

      await browser.close();
      return `PDF printed successfully. Saved at file path: ${filename}`;
    } catch (err) {
      return `Failed to print web page to PDF: ${err.message}`;
    }
  },

  reminder_timer_tool: async ({ timeStr, message }, chatId, signal, ctx) => {
    if (!ctx) {
      throw new Error('Telegram context (ctx) is required to set a reminder.');
    }

    let seconds = 0;
    const cleanTime = String(timeStr).trim().toLowerCase();
    const match = cleanTime.match(/^(\d+)([smh]?)$/);

    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2] || 's';
      if (unit === 's') seconds = value;
      else if (unit === 'm') seconds = value * 60;
      else if (unit === 'h') seconds = value * 3600;
    } else {
      seconds = parseInt(cleanTime, 10);
      if (isNaN(seconds) || seconds <= 0) {
        return `Error: Invalid time duration format "${timeStr}". Use values like "30s", "5m", "2h", or direct seconds number.`;
      }
    }

    const ms = seconds * 1000;
    const timeDisplay = seconds >= 3600 
      ? `${(seconds / 3600).toFixed(1)} jam` 
      : seconds >= 60 
        ? `${(seconds / 60).toFixed(1)} menit` 
        : `${seconds} detik`;

    console.log(`[reminder_timer_tool] Setting reminder in ${ms}ms for Chat: ${chatId}`);

    setTimeout(async () => {
      try {
        await ctx.reply(`⏰ *PENGINGAT ANDA!* ⏰\n\n💬 _"${message}"_`, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error(`Failed to send reminder to chatId ${chatId}:`, err.message);
      }
    }, ms);

    return `Reminder successfully set! You will be notified in ${timeDisplay}.`;
  },

  play_game: async ({ gameName }, chatId, signal, ctx) => {
    if (!ctx) {
      throw new Error('Telegram context (ctx) is required to start a game.');
    }
    
    let res;
    switch (gameName) {
      case 'tictactoe':
        res = startTicTacToe(chatId);
        break;
      case 'suit':
        res = startSuit(chatId);
        break;
      case 'tebak_kata':
        res = await startTebakKata(chatId);
        break;
      case 'math_quiz':
        res = startMathQuiz(chatId);
        break;
      case 'tebak_ff':
        res = startTebakFf(chatId);
        break;
      case 'tebak_gambar':
        res = startTebakGambar(chatId);
        break;
      case 'slot':
        res = startSlot(chatId);
        break;
      case 'tebak_angka':
        res = startTebakAngka(chatId);
        break;
      case 'blackjack':
        res = startBlackjack(chatId);
        break;
      case 'tebak_bendera':
        res = startTebakBendera(chatId);
        break;
      case 'chess':
        res = startChess(chatId);
        break;
      default:
        throw new Error(`Game '${gameName}' is not supported.`);
    }
    
    if (res && res.text) {
      await ctx.reply(res.text, { parse_mode: 'Markdown', ...res.keyboard });
      return `Game ${gameName} started successfully and the interface has been sent to the chat.`;
    } else {
      return `Failed to start game ${gameName}.`;
    }
  },

  npm_install: async ({ packages }, chatId, signal) => {
    ensureSandbox();
    if (!packages || !packages.trim()) {
      return 'Error: No package names provided.';
    }
    const pkgList = packages.trim().split(/\s+/).filter(Boolean);
    const results = [];
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
    for (const pkg of pkgList) {
      try {
        console.log(`[npm_install] Installing package: ${pkg}`);
        const { stdout, stderr } = await execWithTreeKill(
          `npm install ${pkg}`,
          { cwd: config.workspaceDir, env, timeout: 120_000 },
          signal
        );
        results.push(`✅ ${pkg}: installed successfully.${stderr ? ' (warnings: ' + stderr.substring(0, 200) + ')' : ''}`);
      } catch (err) {
        results.push(`❌ ${pkg}: failed to install — ${err.message.substring(0, 200)}`);
      }
    }
    return results.join('\n');
  },

  get_video_transcript: async ({ url }, chatId, signal, ctx) => {
    ensureSandbox();
    let audioPath = null;
    try {
      console.log(`[get_video_transcript] Downloading audio from URL: ${url}`);
      audioPath = await downloadVideo(url, config.workspaceDir, 'audio', signal);
      
      // Compress if it exceeds 10MB to save upload/processing time and keep it under Whisper's limit
      await compressAudioIfLarge(audioPath, 10, signal);
      
      console.log(`[get_video_transcript] Transcribing audio file: ${audioPath}`);
      const transcript = await transcribeAudioFile(audioPath);
      
      // Clean up the downloaded audio file
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
      
      return `Transcript of the video at ${url}:\n\n${transcript}`;
    } catch (error) {
      if (audioPath && fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
      return `Failed to get transcript: ${error.message}`;
    }
  },

  write_file: async ({ filePath, content }) => {
    ensureSandbox();
    const resolvedPath = path.resolve(config.workspaceDir, filePath);
    if (!isPathSafe(resolvedPath)) {
      throw new Error(`Access Denied: Path ${filePath} is outside sandbox workspace.`);
    }

    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // ── Anti-lazy code detector ──────────────────────────────────────────────
    // Deteksi placeholder / stub di file kode sebelum ditulis ke disk
    const codeExtensions = ['.js', '.ts', '.mjs', '.cjs', '.py', '.sh', '.php', '.rb', '.go', '.java', '.cs', '.cpp', '.c'];
    const ext = path.extname(filePath).toLowerCase();
    if (codeExtensions.includes(ext) && typeof content === 'string') {
      const LAZY_PATTERNS = [
        { re: /\/\/\s*TODO/i,                label: '// TODO' },
        { re: /\/\/\s*\.\.\./,               label: '// ...' },
        { re: /\/\/\s*implement/i,            label: '// implement ...' },
        { re: /\/\/\s*add.*logic.*here/i,     label: '// add logic here' },
        { re: /\/\/\s*add.*parsing.*here/i,   label: '// add parsing here' },
        { re: /\/\/\s*add.*code.*here/i,      label: '// add code here' },
        { re: /\/\/\s*handle.*here/i,         label: '// handle here' },
        { re: /\/\/\s*insert.*here/i,         label: '// insert here' },
        { re: /\/\/\s*put.*code.*here/i,      label: '// put code here' },
        { re: /\/\/\s*write.*here/i,          label: '// write here' },
        { re: /\/\/\s*your.*code/i,           label: '// your code' },
        { re: /\/\*\s*TODO\s*\*\//i,          label: '/* TODO */' },
        { re: /\/\*\s*\.\.\.\s*\*\//,         label: '/* ... */' },
        { re: /\/\/\s*rest of the code/i,     label: '// rest of the code' },
        { re: /\/\/\s*more.*code/i,           label: '// more code' },
        { re: /\/\/\s*and so on/i,            label: '// and so on' },
        { re: /\/\/\s*etc\./i,                label: '// etc.' },
        { re: /\/\/\s*coming soon/i,          label: '// coming soon' },
        { re: /\bplaceholder\b/i,             label: 'placeholder' },
        { re: /mock.*implementation/i,        label: 'mock implementation' },
        { re: /stub.*function/i,              label: 'stub function' },
        { re: /#\s*TODO/i,                    label: '# TODO (Python/Shell)' },
        { re: /#\s*\.\.\./,                   label: '# ... (Python/Shell)' },
        { re: /#\s*implement/i,               label: '# implement (Python)' },
      ];
      const hits = LAZY_PATTERNS.filter(p => p.re.test(content)).map(p => p.label);
      if (hits.length > 0) {
        return `Error: Gagal menulis file. Kode yang Anda berikan terdeteksi mengandung placeholder atau kode tidak lengkap (${hits.join(', ')}). Tolong tulis ulang kodenya secara LENGKAP tanpa ada bagian yang sengaja disembunyikan, dikurangi, atau diwakili oleh komentar TODO/...`;
      } else {
        console.log(`[write_file] ✅ Code quality check passed for "${filePath}" — no placeholders detected.`);
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    fs.writeFileSync(resolvedPath, content, 'utf8');
    return `File written successfully at: ${filePath}`;
  },

  read_file: async ({ filePath }) => {
    ensureSandbox();
    const resolvedPath = path.resolve(config.workspaceDir, filePath);
    if (!isPathSafe(resolvedPath)) {
      throw new Error(`Access Denied: Path ${filePath} is outside sandbox workspace.`);
    }

    if (!fs.existsSync(resolvedPath)) {
      return `Error: File not found at ${filePath}`;
    }

    const content = fs.readFileSync(resolvedPath, 'utf8');
    return content;
  },

  send_file: async ({ filePath }) => {
    ensureSandbox();
    const resolvedPath = path.resolve(config.workspaceDir, filePath);
    if (!isPathSafe(resolvedPath)) {
      throw new Error(`Access Denied: Path ${filePath} is outside sandbox workspace.`);
    }

    if (!fs.existsSync(resolvedPath)) {
      return `Error: File not found at ${filePath}`;
    }

    return `File found successfully at: ${filePath}`;
  },

  list_files: async ({ directoryPath }) => {
    ensureSandbox();
    const resolvedPath = path.resolve(config.workspaceDir, directoryPath);
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

    const dangerousPatterns = [
      {
        pattern: /\brm\b.*\s+-[a-zA-Z]*[rR]/i,
        description: "rm -r/rm -rf (recursive delete)"
      },
      {
        pattern: /\brm\s+--recursive\b/i,
        description: "rm --recursive (recursive delete)"
      },
      {
        pattern: /\brmdir\b.*\s+\/s\b/i,
        description: "rmdir /s (recursive directory delete)"
      },
      {
        pattern: /\bdel\b.*\s+\/s\b/i,
        description: "del /s (recursive file delete)"
      },
      {
        pattern: /\b(mkfs|fdisk|format|parted|sfdisk|gparted)\b/i,
        description: "disk formatting or partitioning tool"
      },
      {
        pattern: /\b(shutdown|reboot|poweroff|init\s+0)\b/i,
        description: "system shutdown or reboot"
      },
      {
        pattern: /:\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/i,
        description: "fork bomb"
      },
      {
        pattern: /\b(chmod\s+-[a-zA-Z]*R\s+777|chmod\s+--recursive\s+777)\b/i,
        description: "dangerous recursive wide permissions"
      },
      {
        pattern: /\b(chown\s+-[a-zA-Z]*R|chown\s+--recursive)\b/i,
        description: "recursive ownership change"
      },
      {
        pattern: /\bdd\s+if=/i,
        description: "dd raw disk write"
      },
      {
        pattern: /\b(curl|wget)\b.*\s*\|\s*(bash|sh|zsh|ksh)\b/i,
        description: "downloading and piping untrusted scripts directly to shell"
      },
      {
        pattern: />\s*\/dev\/(sd[a-z]|nvme[0-9]|vd[a-z]|hd[a-z]|loop[0-9])/i,
        description: "direct raw writing to block devices"
      },
      {
        pattern: /\brm\b.*\s+\/(etc|boot|var|usr|opt|dev|proc|sys|root)\b/i,
        description: "deleting critical root system directories"
      },
      {
        pattern: /\biptables\b.*\s+(-F|-X|-Z|--flush|--delete-chain)\b/i,
        description: "flushing firewall rules/chains"
      },
      {
        pattern: />+.*\/(etc\/passwd|etc\/shadow|etc\/sudoers|etc\/hosts)\b/i,
        description: "overwriting critical system files"
      },
      {
        pattern: /\bshred\b.*\s+\/dev\/(sd[a-z]|nvme[0-9]|vd[a-z]|hd[a-z])/i,
        description: "shredding a raw block device"
      }
    ];

    for (const item of dangerousPatterns) {
      if (item.pattern.test(command)) {
        return `Error: Command blocked. The command contains potential dangerous execution: ${item.description}. Destructive/dangerous commands are prohibited for safety.`;
      }
    }

    // Anti-lazy check for file redirection/creation in execute_command
    if (/>|>>|tee\b/i.test(command)) {
      const LAZY_PATTERNS = [
        { re: /\/\/\s*TODO/i,                label: '// TODO' },
        { re: /\/\/\s*\.\.\./,               label: '// ...' },
        { re: /\/\/\s*implement/i,            label: '// implement ...' },
        { re: /\/\/\s*add.*logic.*here/i,     label: '// add logic here' },
        { re: /\/\/\s*add.*parsing.*here/i,   label: '// add parsing here' },
        { re: /\/\/\s*add.*code.*here/i,      label: '// add code here' },
        { re: /\/\/\s*handle.*here/i,         label: '// handle here' },
        { re: /\/\/\s*insert.*here/i,         label: '// insert here' },
        { re: /\/\/\s*put.*code.*here/i,      label: '// put code here' },
        { re: /\/\/\s*write.*here/i,          label: '// write here' },
        { re: /\/\/\s*your.*code/i,           label: '// your code' },
        { re: /\/\*\s*TODO\s*\*\//i,          label: '/* TODO */' },
        { re: /\/\*\s*\.\.\.\s*\*\//,         label: '/* ... */' },
        { re: /\/\/\s*rest of the code/i,     label: '// rest of the code' },
        { re: /\/\/\s*more.*code/i,           label: '// more code' },
        { re: /\/\/\s*and so on/i,            label: '// and so on' },
        { re: /\/\/\s*etc\./i,                label: '// etc.' },
        { re: /\/\/\s*coming soon/i,          label: '// coming soon' },
        { re: /\bplaceholder\b/i,             label: 'placeholder' },
        { re: /mock.*implementation/i,        label: 'mock implementation' },
        { re: /stub.*function/i,              label: 'stub function' },
        { re: /#\s*TODO/i,                    label: '# TODO (Python/Shell)' },
        { re: /#\s*\.\.\./,                   label: '# ... (Python/Shell)' },
        { re: /#\s*implement/i,               label: '# implement (Python)' },
      ];
      const hits = LAZY_PATTERNS.filter(p => p.re.test(command)).map(p => p.label);
      if (hits.length > 0) {
        return `Error: Command blocked. Terdeteksi upaya penulisan kode tidak lengkap/placeholder (${hits.join(', ')}) menggunakan terminal command. Pengguna mewajibkan seluruh kode ditulis secara LENGKAP tanpa disembunyikan.`;
      }
    }

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

      let stdout, stderr;
      let attempts = 0;
      
      while (attempts < 5) {
        try {
          const result = await execWithTreeKill(command, { cwd: config.workspaceDir, env }, signal);
          stdout = result.stdout;
          stderr = result.stderr;
          break;
        } catch (execError) {
          const errMsg = `${execError.message || ''} ${execError.stderr || ''} ${execError.stdout || ''}`;
          const match = errMsg.match(/Cannot find module '([^']+)'/) || errMsg.match(/Cannot find module "([^"]+)"/);
          if (match && match[1] && !match[1].startsWith('.') && !match[1].startsWith('/') && !match[1].startsWith('\\')) {
            const missingModule = match[1];
            console.warn(`[execute_command] Missing npm module detected: '${missingModule}'. Automatically installing...`);
            try {
              await execWithTreeKill(`npm install ${missingModule}`, { cwd: config.workspaceDir, env }, signal);
              console.log(`[execute_command] Successfully installed '${missingModule}'. Retrying...`);
              attempts++;
            } catch (installError) {
              return `Error: Failed to automatically install missing module '${missingModule}': ${installError.message}\n` +
                     `Original Command Error: ${execError.message}\n` +
                     `Stdout: ${execError.stdout || ''}\n` +
                     `Stderr: ${execError.stderr || ''}`;
            }
          } else {
            throw execError;
          }
        }
      }

      let response = `Command executed successfully.\n`;
      if (stdout) response += `Stdout:\n${stdout}\n`;
      if (stderr) response += `Stderr:\n${stderr}\n`;
      return response;
    } catch (error) {
      return `Error executing command: ${error.message}\nStdout: ${error.stdout || ''}\nStderr: ${error.stderr || ''}`;
    }
  },

  download_video_tool: async ({ url, type, format }, chatId, signal, ctx) => {
    ensureSandbox();
    const downloadType = type === 'audio' ? 'audio' : 'video';
    const targetFormat = format ? format.toLowerCase().trim() : (downloadType === 'audio' ? 'mp3' : 'mp4');
    try {
      console.log(`Downloading ${downloadType} in format ${targetFormat} from tool: ${url}`);
      
      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
      if (isYouTube && ctx) {
        try {
          console.log(`Fetching YouTube metadata for tool preview: ${url}`);
          const meta = await getYtMetadata(url);
          if (meta) {
            const isAudio = downloadType === 'audio' || ['mp3', 'wav', 'ogg', 'flac', 'aac', 'opus', 'alac', 'vorbis', 'mka'].includes(targetFormat);
            const titleHeader = isAudio ? '🎵 *INFORMASI YOUTUBE AUDIO* 🎵' : '🎥 *INFORMASI YOUTUBE* 🎥';
            const processText = isAudio ? 'audio' : 'video';
            const metaText = `${titleHeader}\n\n` +
              `📌 *Judul:* ${safeMarkdown(meta.title)}\n` +
              `👤 *Channel:* ${safeMarkdown(meta.uploader)}\n` +
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

      const filePath = await downloadVideo(url, config.workspaceDir, targetFormat, signal);
      const relativePath = path.relative(config.workspaceDir, filePath);
      const isAudioResult = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'opus', 'alac', 'vorbis', 'mka'].includes(targetFormat);
      return `${isAudioResult ? 'Audio' : 'Video'} downloaded successfully. Saved at file path: ${relativePath}`;
    } catch (error) {
      return `Failed to download: ${error.message}`;
    }
  },

  optimize_audio: async ({ filePath, enhancement, quality, format }, chatId, signal, ctx) => {
    ensureSandbox();
    const absInput = path.resolve(config.workspaceDir, filePath);
    if (!isPathSafe(absInput)) {
      throw new Error('Access Denied: Path must be inside sandbox workspace.');
    }
    if (!fs.existsSync(absInput)) {
      return `Error: File not found at ${filePath}`;
    }

    const timestamp = Date.now();
    const targetFormat = format || 'mp3';
    const outputFilename = `${path.basename(filePath, path.extname(filePath))}_optimized.${targetFormat}`;
    const absOutput = path.resolve(config.workspaceDir, outputFilename);

    try {
      console.log(`Optimizing audio file: ${filePath}`);
      await optimizeAudioFile(absInput, absOutput, { enhancement, quality, format: targetFormat }, signal);
      
      const inStats = fs.statSync(absInput);
      const outStats = fs.statSync(absOutput);
      
      const inSizeMb = (inStats.size / (1024 * 1024)).toFixed(2);
      const outSizeMb = (outStats.size / (1024 * 1024)).toFixed(2);
      
      return `Audio optimized successfully!\n` +
             `- Output file: ${outputFilename}\n` +
             `- Original size: ${inSizeMb} MB\n` +
             `- Optimized size: ${outSizeMb} MB\n` +
             `- Quality: ${quality || 'medium'}\n` +
             `- Enhancement: ${enhancement || 'normalization'}`;
    } catch (err) {
      return `Failed to optimize audio: ${err.message}`;
    }
  },

  trim_audio: async ({ filePath, startTime, endTime }, chatId, signal, ctx) => {
    ensureSandbox();
    const absInput = path.resolve(config.workspaceDir, filePath);
    if (!isPathSafe(absInput)) {
      throw new Error('Access Denied: Path must be inside sandbox workspace.');
    }
    if (!fs.existsSync(absInput)) {
      return `Error: File not found at ${filePath}`;
    }

    const start = startTime || '0';
    const timestamp = Date.now();
    const ext = path.extname(filePath) || '.mp3';
    const outputFilename = `${path.basename(filePath, ext)}_trimmed_${timestamp}${ext}`;
    const absOutput = path.resolve(config.workspaceDir, outputFilename);

    try {
      console.log(`Trimming audio file: ${filePath} from ${start} to ${endTime}`);
      await trimAudioFile(absInput, absOutput, start, endTime, signal);
      return `Audio trimmed successfully! Saved as: ${outputFilename}`;
    } catch (err) {
      return `Failed to trim audio: ${err.message}`;
    }
  },

  extract_audio_from_video: async ({ videoPath, format }, chatId, signal, ctx) => {
    ensureSandbox();
    const absInput = path.resolve(config.workspaceDir, videoPath);
    if (!isPathSafe(absInput)) {
      throw new Error('Access Denied: Path must be inside sandbox workspace.');
    }
    if (!fs.existsSync(absInput)) {
      return `Error: Video file not found at ${videoPath}`;
    }

    const targetFormat = format || 'mp3';
    const outputFilename = `${path.basename(videoPath, path.extname(videoPath))}_extracted.${targetFormat}`;
    const absOutput = path.resolve(config.workspaceDir, outputFilename);

    try {
      console.log(`Extracting audio from video: ${videoPath}`);
      await extractAudioFromVideo(absInput, absOutput, targetFormat, signal);
      return `Audio track extracted successfully! Saved as: ${outputFilename}`;
    } catch (err) {
      return `Failed to extract audio from video: ${err.message}`;
    }
  },

  zip_project: async ({ dirName, zipName }) => {
    ensureSandbox();
    const sourceDir = path.resolve(config.workspaceDir, dirName);
    const targetZip = path.resolve(config.workspaceDir, zipName);

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

  wikipedia_search: async ({ query }, chatId, signal) => {
    return await searchWikipedia(query, signal);
  },

  google_news_search: async ({ query }, chatId, signal) => {
    return await searchGoogleNews(query, signal);
  },

  fetch_webpage: async ({ url }, chatId, signal) => {
    return await fetchWebpage(url, signal);
  },

  generate_image: async ({ prompt }, chatId, signal) => {
    try {
      const outputPath = await downloadPollinationsImage(prompt, config.workspaceDir, signal);
      const filename = path.basename(outputPath);
      return `Image generated successfully. Saved at file path: ${filename}`;
    } catch (error) {
      if (signal && signal.aborted || error.message === 'STOPPED') {
        throw new Error('STOPPED');
      }
      return `Failed to generate image: ${error.message}`;
    }
  },

  delete_file: async ({ filePath }) => {
    ensureSandbox();
    const resolvedPath = path.resolve(config.workspaceDir, filePath);
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
    const resolvedPath = path.resolve(config.workspaceDir, dirPath);
    if (!isPathSafe(resolvedPath)) {
      throw new Error(`Access Denied: Path ${dirPath} is outside sandbox workspace.`);
    }

    if (fs.existsSync(resolvedPath)) {
      return `Directory already exists: ${dirPath}`;
    }

    fs.mkdirSync(resolvedPath, { recursive: true });
    return `Directory created successfully: ${dirPath}`;
  },

  get_weather: async ({ city }, chatId, signal) => {
    try {
      const weatherData = await fetchBmkgWeather(city, signal, chatId);
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
      if (signal && signal.aborted || err.message === 'STOPPED') {
        throw new Error('STOPPED');
      }
      console.warn(`BMKG weather lookup failed for ${city}: ${err.message}. Falling back to wttr.in...`);
      try {
        const response = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
          timeout: 8000,
          headers: { 'User-Agent': getRandomUserAgent() },
          signal: signal || undefined
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
        if (signal && signal.aborted || fallbackErr.message === 'STOPPED') {
          throw new Error('STOPPED');
        }
        return `Error getting weather for ${city}: ${fallbackErr.message}`;
      }
    }
  },

  get_crypto_price: async ({ symbol }, chatId, signal) => {
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
        'shib': 'shiba-inu',
        'usdt': 'tether',
        'usdc': 'usd-coin',
        'ton': 'the-open-network',
        'near': 'near',
        'ftm': 'fantom',
        'sui': 'sui',
        'apt': 'aptos',
        'arb': 'arbitrum',
        'op': 'optimism',
        'pepe': 'pepe',
        'wld': 'worldcoin-wld',
        'inj': 'injective-protocol',
        'fet': 'fetch-ai',
        'stx': 'blockstack',
        'rndr': 'render-token',
        'grt': 'the-graph',
        'fil': 'filecoin',
        'ldo': 'lido-dao',
        'imx': 'immutable-x',
        'kas': 'kaspa',
        'floki': 'floki',
        'bonk': 'bonk',
        'wif': 'dogwifhat'
      };
      const cleaned = symbol.toLowerCase().trim();
      const id = symbolMap[cleaned] || cleaned;

      let coin = null;
      let priceHistoryList = null;

      try {
        const response = await axios.get(
          `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd,idr&include_24hr_change=true`,
          { timeout: 8000, headers: { 'User-Agent': 'TelegramAIBot/1.0' }, signal: signal || undefined }
        );
        const data = response.data;
        if (data[id]) {
          coin = data[id];
        }

        if (coin) {
          try {
            const historyRes = await axios.get(
              `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=7&interval=daily`,
              { timeout: 8000, headers: { 'User-Agent': 'TelegramAIBot/1.0' }, signal: signal || undefined }
            );
            priceHistoryList = historyRes.data.prices;
          } catch (chartErr) {
            console.warn(`Failed to generate crypto chart from CoinGecko: ${chartErr.message}`);
          }
        }
      } catch (err) {
        console.warn(`CoinGecko lookup failed for ${id}: ${err.message}. Falling back to Yahoo Finance...`);
      }

      // Yahoo Finance Fallback
      if (!coin) {
        try {
          const reversedSymbolMap = {};
          for (const [sym, val] of Object.entries(symbolMap)) {
            reversedSymbolMap[val] = sym;
          }
          const coinSymbol = symbolMap[cleaned] ? cleaned : (reversedSymbolMap[cleaned] || cleaned);
          const yahooTicker = `${coinSymbol.toUpperCase()}-USD`;

          let usdToIdr = 16000;
          try {
            const exchangeRes = await axios.get(
              `https://query1.finance.yahoo.com/v8/finance/chart/USDIDR=X?range=1d&interval=1d`,
              { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' }, signal: signal || undefined }
            );
            if (exchangeRes.data?.chart?.result?.[0]?.meta?.regularMarketPrice) {
              usdToIdr = exchangeRes.data.chart.result[0].meta.regularMarketPrice;
            }
          } catch (exErr) {
            console.warn(`Failed to fetch USD/IDR exchange rate from Yahoo Finance: ${exErr.message}`);
          }

          const historyRes = await axios.get(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=7d&interval=1d`,
            { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' }, signal: signal || undefined }
          );
          const chartData = historyRes.data?.chart?.result?.[0];
          if (chartData && chartData.meta) {
            const meta = chartData.meta;
            const usdPrice = meta.regularMarketPrice;
            const prevClose = meta.chartPreviousClose || usdPrice;
            const usd24hChange = prevClose ? ((usdPrice - prevClose) / prevClose) * 100 : 0;

            coin = {
              usd: usdPrice,
              idr: usdPrice * usdToIdr,
              usd_24h_change: usd24hChange
            };

            const timestamps = chartData.timestamp;
            const closes = chartData.indicators?.quote?.[0]?.close;
            if (timestamps && closes) {
              priceHistoryList = [];
              for (let i = 0; i < timestamps.length; i++) {
                if (closes[i] == null) continue;
                priceHistoryList.push([timestamps[i] * 1000, closes[i]]);
              }
            }
          }
        } catch (fallbackErr) {
          console.error(`Yahoo Finance fallback failed for ${symbol}: ${fallbackErr.message}`);
        }
      }

      if (!coin) {
        return `Koin '${symbol}' tidak ditemukan. Gunakan nama lengkap seperti 'bitcoin', 'ethereum', atau 'solana'.`;
      }

      const changeStr = coin.usd_24h_change != null ? `${coin.usd_24h_change >= 0 ? '📈' : '📉'} ${coin.usd_24h_change.toFixed(2)}% (24h)` : '';
      let textResult = `💰 Harga ${id.toUpperCase()}:\n🇺🇸 USD: $${coin.usd.toLocaleString()}\n🇮🇩 IDR: Rp ${Math.round(coin.idr).toLocaleString('id-ID')}\n${changeStr}`;

      // Now generate the chart
      try {
        if (priceHistoryList && priceHistoryList.length > 0) {
          const labels = [];
          const priceData = [];
          for (const [timestamp, val] of priceHistoryList) {
            if (signal && signal.aborted) throw new Error('STOPPED');
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
          }, { responseType: 'arraybuffer', timeout: 10000, signal: signal || undefined });

          let finalImageBuffer = Buffer.from(chartRes.data);

          // Composite the crypto logo using Jimp
          try {
            const reversedSymbolMap = {};
            for (const [sym, val] of Object.entries(symbolMap)) {
              reversedSymbolMap[val] = sym;
            }
            const coinSymbol = symbolMap[cleaned] ? cleaned : (reversedSymbolMap[cleaned] || cleaned);
            
            const logoUrl = `https://assets.coincap.io/assets/icons/${encodeURIComponent(coinSymbol.toLowerCase())}@2x.png`;
            const logoRes = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 5000, signal: signal || undefined });
            
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
            if (signal && signal.aborted || logoErr.message === 'STOPPED') throw new Error('STOPPED');
            console.warn(`Failed to overlay crypto logo: ${logoErr.message}`);
          }

          // Generate price analysis
          let analysis = '';
          if (groq) {
            try {
              const isUp = coin.usd_24h_change >= 0;
              const trend = isUp ? 'naik' : 'turun';
              const pct = coin.usd_24h_change != null ? coin.usd_24h_change.toFixed(2) : '0';
              
              let personality = 'biasa';
              try {
                const personalityPath = path.join(config.memoryDir, `${chatId}_personality.txt`);
                if (fs.existsSync(personalityPath)) {
                  personality = fs.readFileSync(personalityPath, 'utf8').trim().toLowerCase();
                }
              } catch (e) {}

              let toneInstructions = 'Anda adalah analis finansial dan crypto ahli. Berikan jawaban singkat (maksimal 2 kalimat) dalam bahasa Indonesia.';
              if (personality === 'wibu') {
                toneInstructions += ' Gunakan gaya bicara wibu anime ceria dengan imbuhan Jepang (seperti desu, senpai, sugoi) dan emoji.';
              } else if (personality === 'tsundere') {
                toneInstructions += ' Gunakan gaya bicara tsundere ketus, pura-pura tidak peduli, sebut pengguna "baka", tapi tetap berikan analisis benar.';
              } else if (personality === 'sarcastic') {
                toneInstructions += ' Gunakan gaya bicara sarkastik menyindir nasib keuangan pengguna secara lucu dan sarkas.';
              } else if (personality === 'mentor') {
                toneInstructions += ' Gunakan gaya bicara asisten/mentor edukatif, mengajarkan konsep secara mendalam.';
              } else if (personality === 'professional') {
                toneInstructions += ' Gunakan gaya bahasa formal, baku, dan sangat profesional.';
              }

              const prompt = `Berikan analisis sangat singkat tentang pergerakan harga ${id.toUpperCase()} yang saat ini sedang ${trend} sebesar ${pct}% dalam 24 jam terakhir. Jelaskan kemungkinan faktor penyebab utama pergerakan ini.`;

              let apiCall = groq.chat.completions.create({
                model: config.groqModel || 'qwen/qwen-2.5-32b',
                messages: [
                  { role: 'system', content: toneInstructions },
                  { role: 'user', content: prompt }
                ],
                temperature: 0.6,
                max_tokens: 500
              }, { chatId });
              let analysisRes;
              if (signal) {
                analysisRes = await Promise.race([
                  apiCall,
                  new Promise((_, reject) => {
                    if (signal.aborted) return reject(new Error('STOPPED'));
                    const onAbort = () => reject(new Error('STOPPED'));
                    signal.addEventListener('abort', onAbort, { once: true });
                    apiCall.then(() => signal.removeEventListener('abort', onAbort))
                           .catch(() => signal.removeEventListener('abort', onAbort));
                  })
                ]);
              } else {
                analysisRes = await apiCall;
              }
              analysis = '\n\n💡 *Analisis Tren:* ' + stripThinkBlock(analysisRes.choices[0].message.content || '');
            } catch (analysisErr) {
              console.warn('Failed to generate crypto price analysis:', analysisErr.message);
            }
          }

          const filename = `crypto_${id}_chart_${Date.now()}.png`;
          const outputPath = path.join(config.workspaceDir, filename);
          fs.writeFileSync(outputPath, finalImageBuffer);
          textResult += analysis;
          textResult += `\nSaved at file path: ${filename}`;
        }
      } catch (chartErr) {
        if (signal && signal.aborted || chartErr.message === 'STOPPED') {
          throw new Error('STOPPED');
        }
        console.warn(`Failed to generate crypto chart for ${id}: ${chartErr.message}`);
        textResult += `\n(Gagal memuat grafik: ${chartErr.message})`;
      }

      return textResult;
    } catch (err) {
      if (signal && signal.aborted || err.message === 'STOPPED') {
        throw new Error('STOPPED');
      }
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
    const resolvedOld = path.resolve(config.workspaceDir, oldFilePath);
    const resolvedNew = path.resolve(config.workspaceDir, newFilePath);
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
    const outputPath = path.resolve(config.workspaceDir, outputFilename);
    
    
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
        signal: signal || undefined
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

  analyze_image: async ({ filePath, question }, chatId) => {
    ensureSandbox();
    const resolvedPath = path.resolve(config.workspaceDir, filePath);
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
      }, { chatId });
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
    const resolvedPath = path.resolve(config.workspaceDir, filePath);
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

    // ── Anti-lazy code detector ──────────────────────────────────────────────
    const codeExtensions = ['.js', '.ts', '.mjs', '.cjs', '.py', '.sh', '.php', '.rb', '.go', '.java', '.cs', '.cpp', '.c'];
    const ext = path.extname(filePath).toLowerCase();
    if (codeExtensions.includes(ext) && typeof content === 'string') {
      const LAZY_PATTERNS = [
        { re: /\/\/\s*TODO/i,                label: '// TODO' },
        { re: /\/\/\s*\.\.\./,               label: '// ...' },
        { re: /\/\/\s*implement/i,            label: '// implement ...' },
        { re: /\/\/\s*add.*logic.*here/i,     label: '// add logic here' },
        { re: /\/\/\s*add.*parsing.*here/i,   label: '// add parsing here' },
        { re: /\/\/\s*add.*code.*here/i,      label: '// add code here' },
        { re: /\/\/\s*handle.*here/i,         label: '// handle here' },
        { re: /\/\/\s*insert.*here/i,         label: '// insert here' },
        { re: /\/\/\s*put.*code.*here/i,      label: '// put code here' },
        { re: /\/\/\s*write.*here/i,          label: '// write here' },
        { re: /\/\/\s*your.*code/i,           label: '// your code' },
        { re: /\/\*\s*TODO\s*\*\//i,          label: '/* TODO */' },
        { re: /\/\*\s*\.\.\.\s*\*\//,         label: '/* ... */' },
        { re: /\/\/\s*rest of the code/i,     label: '// rest of the code' },
        { re: /\/\/\s*more.*code/i,           label: '// more code' },
        { re: /\/\/\s*and so on/i,            label: '// and so on' },
        { re: /\/\/\s*etc\./i,                label: '// etc.' },
        { re: /\/\/\s*coming soon/i,          label: '// coming soon' },
        { re: /\bplaceholder\b/i,             label: 'placeholder' },
        { re: /mock.*implementation/i,        label: 'mock implementation' },
        { re: /stub.*function/i,              label: 'stub function' },
        { re: /#\s*TODO/i,                    label: '# TODO (Python/Shell)' },
        { re: /#\s*\.\.\./,                   label: '# ... (Python/Shell)' },
        { re: /#\s*implement/i,               label: '# implement (Python)' },
      ];
      const hits = LAZY_PATTERNS.filter(p => p.re.test(content)).map(p => p.label);
      if (hits.length > 0) {
        return `Error: Gagal mengedit file. Perubahan yang Anda lakukan menyebabkan kode terdeteksi mengandung placeholder atau kode tidak lengkap (${hits.join(', ')}). Tolong tulis ulang perubahannya secara LENGKAP tanpa ada bagian yang sengaja disembunyikan, dikurangi, atau diwakili oleh komentar TODO/...`;
      }
    }
    // ────────────────────────────────────────────────────────────────────────

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
        signal: signal || undefined
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
      const imageUrl = await uploadToTmpfiles(resolvedPath, signal);
      console.log('Uploaded image URL:', imageUrl);

      console.log(`Styling image with prompt: ${prompt}`);
      const apiUrl = `https://api-faa.my.id/faa/nano-banana?url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}`;

      const httpsAgent = new https.Agent({ rejectUnauthorized: false });
      const response = await axios.get(apiUrl, {
        responseType: 'arraybuffer',
        timeout: 120000,
        signal: signal || undefined,
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
    const resolvedZip = path.resolve(config.workspaceDir, zipFilePath);
    const targetDir = destDir ? path.resolve(config.workspaceDir, destDir) : config.workspaceDir;

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
    const targetDir = path.resolve(config.workspaceDir, relativeDir);

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
      
      const { stdout, stderr } = await execWithTreeKill(cmd, { 
        cwd: targetDir, 
        timeout: 120_000
      }, signal);

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

      const { stdout } = await execWithTreeKill(cmd, { 
        timeout: 30000, 
        env
      }, signal);

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

  web_search: async ({ query }, chatId, signal) => {
    try {
      const { engine, results } = await unifiedSearch(query, signal);
      return `Search Results for "${query}" (Source: ${engine}):\n\n${results.join('\n\n')}`;
    } catch (err) {
      if (signal && signal.aborted || err.message === 'STOPPED') throw new Error('STOPPED');
      console.error('Web search failed:', err);
      return `Failed to search the web: ${err.message}`;
    }
  },

  get_stock_price: async ({ symbol }, chatId, signal) => {
    try {
      let ticker = symbol.toUpperCase().trim();
      let chartData = null;
      let usedTicker = ticker;
      
      const fetchYahooData = async (t) => {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=7d&interval=1d`;
        const res = await axios.get(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          timeout: 8000,
          signal: signal || undefined
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
            if (signal && signal.aborted || idxErr.message === 'STOPPED') throw new Error('STOPPED');
            // Fallback to US ticker
            usedTicker = ticker;
            chartData = await fetchYahooData(usedTicker);
          }
        } else {
          chartData = await fetchYahooData(ticker);
        }
      } catch (err) {
        if (signal && signal.aborted || err.message === 'STOPPED') {
          throw new Error('STOPPED');
        }
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
            if (signal && signal.aborted) throw new Error('STOPPED');
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
            }, { responseType: 'arraybuffer', timeout: 10000, signal: signal || undefined });

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
                const logoRes = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 5000, signal: signal || undefined });
                
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
                if (signal && signal.aborted || logoErr.message === 'STOPPED') throw new Error('STOPPED');
                console.warn(`Failed to overlay logo for ${cleanTicker}: ${logoErr.message}`);
              }
            }

            // Generate stock price trend analysis
            let analysis = '';
            if (groq) {
              try {
                const isUp = pctChange >= 0;
                const trend = isUp ? 'naik' : 'turun';
                const pct = pctChange != null ? pctChange.toFixed(2) : '0';
                
                let personality = 'biasa';
                try {
                  const personalityPath = path.join(config.memoryDir, `${chatId}_personality.txt`);
                  if (fs.existsSync(personalityPath)) {
                    personality = fs.readFileSync(personalityPath, 'utf8').trim().toLowerCase();
                  }
                } catch (e) {
                  console.error('Error reading stock personality:', e.message);
                }

                let toneInstructions = 'Anda adalah analis finansial dan pasar saham ahli. Berikan jawaban singkat (maksimal 2 kalimat) dalam bahasa Indonesia.';
                if (personality === 'wibu') {
                  toneInstructions += ' Gunakan gaya bicara wibu anime ceria dengan imbuhan Jepang (seperti desu, senpai, sugoi) dan emoji.';
                } else if (personality === 'tsundere') {
                  toneInstructions += ' Gunakan gaya bicara tsundere ketus, pura-pura tidak peduli, sebut pengguna "baka", tapi tetap berikan analisis benar.';
                } else if (personality === 'sarcastic') {
                  toneInstructions += ' Gunakan gaya bicara sarkastik menyindir nasib keuangan pengguna secara lucu dan sarkas.';
                } else if (personality === 'mentor') {
                  toneInstructions += ' Gunakan gaya bicara asisten/mentor edukatif, mengajarkan konsep secara mendalam.';
                } else if (personality === 'professional') {
                  toneInstructions += ' Gunakan gaya bahasa formal, baku, dan sangat profesional.';
                }

                const prompt = `Berikan analisis sangat singkat tentang pergerakan harga saham ${longName} (${meta.symbol}) yang saat ini sedang ${trend} sebesar ${pct}% hari ini. Jelaskan kemungkinan faktor penyebab utama pergerakan ini.`;

                let apiCall = groq.chat.completions.create({
                  model: config.groqModel || 'qwen/qwen-2.5-32b',
                  messages: [
                    { role: 'system', content: toneInstructions },
                    { role: 'user', content: prompt }
                  ],
                  temperature: 0.6,
                  max_tokens: 500
                }, { chatId });
                let analysisRes;
                if (signal) {
                  analysisRes = await Promise.race([
                    apiCall,
                    new Promise((_, reject) => {
                      if (signal.aborted) return reject(new Error('STOPPED'));
                      const onAbort = () => reject(new Error('STOPPED'));
                      signal.addEventListener('abort', onAbort, { once: true });
                      apiCall.then(() => signal.removeEventListener('abort', onAbort))
                             .catch(() => signal.removeEventListener('abort', onAbort));
                    })
                  ]);
                } else {
                  analysisRes = await apiCall;
                }
                analysis = '\n\n💡 *Analisis Tren:* ' + stripThinkBlock(analysisRes.choices[0].message.content || '');
              } catch (analysisErr) {
                console.warn('Failed to generate stock price analysis:', analysisErr.message);
              }
            }

            const filename = `stock_${meta.symbol.replace('.', '_')}_chart_${Date.now()}.png`;
            const outputPath = path.join(config.workspaceDir, filename);
            fs.writeFileSync(outputPath, finalImageBuffer);
            
            textResult += analysis;
            textResult += `\nSaved at file path: ${filename}`;
          }
        }
      } catch (chartErr) {
        if (signal && signal.aborted || chartErr.message === 'STOPPED') {
          throw new Error('STOPPED');
        }
        console.warn(`Failed to generate stock chart for ${usedTicker}: ${chartErr.message}`);
        textResult += `\n(Gagal memuat grafik: ${chartErr.message})`;
      }

      return textResult;
    } catch (err) {
      if (signal && signal.aborted || err.message === 'STOPPED') {
        throw new Error('STOPPED');
      }
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
  },

  get_earthquake_info: async () => {
    try {
      const httpsAgent = new https.Agent({ rejectUnauthorized: false });
      const response = await axios.get('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json', { timeout: 8000, httpsAgent });
      const data = response.data?.Infogempa?.gempa;
      if (!data) {
        return 'Gagal mendapatkan data gempa terkini dari BMKG.';
      }
      
      const magnitude = data.Magnitude;
      const kedalaman = data.Kedalaman;
      const wilayah = data.Wilayah;
      const waktu = data.Tanggal + ' ' + data.Jam;
      const potensi = data.Potensi;
      const dirasakan = data.Dirasakan || 'Tidak disebutkan';
      const coordinates = data.Coordinates;
      
      const [lat, lon] = coordinates.split(',');
      const mapUrl = `https://static-maps.yandex.ru/1.x/?ll=${lon.trim()},${lat.trim()}&z=5&size=600,400&l=map&pt=${lon.trim()},${lat.trim()},pm2rdl&lang=id_ID`;
      
      let textResult = `🚨 *INFO GEMPA TERBARU BMKG* 🚨\n\n` +
                       `📅 Waktu: *${waktu} WIB*\n` +
                       `📈 Magnitudo: *${magnitude} SR*\n` +
                       `🕳️ Kedalaman: *${kedalaman}*\n` +
                       `📍 Lokasi: *${wilayah}*\n` +
                       `🌐 Koordinat: *${coordinates}*\n` +
                       `📢 Potensi: *${potensi}*\n` +
                       `👤 Dirasakan: *${dirasakan}*`;
                       
      try {
        const mapRes = await axios.get(mapUrl, { responseType: 'arraybuffer', timeout: 10000, httpsAgent });
        const filename = `gempa_map_${Date.now()}.png`;
        const outputPath = path.join(config.workspaceDir, filename);
        fs.writeFileSync(outputPath, mapRes.data);
        textResult += `\n\nSaved at file path: ${filename}`;
      } catch (mapErr) {
        console.warn('Failed to download earthquake map:', mapErr.message);
        textResult += `\n\n(Peta tidak dapat dimuat: ${mapErr.message})`;
      }
      
      return textResult;
    } catch (err) {
      return `Gagal mengambil info gempa: ${err.message}`;
    }
  },

  get_prayer_times: async ({ city }) => {
    try {
      const httpsAgent = new https.Agent({ rejectUnauthorized: false });
      const cleanedCity = city.trim();
      const searchUrl = `https://api.myquran.com/v2/sholat/kota/cari/${encodeURIComponent(cleanedCity)}`;
      const searchRes = await axios.get(searchUrl, { timeout: 8000, httpsAgent });
      
      const cityList = searchRes.data?.data;
      if (!cityList || cityList.length === 0) {
        return `Kota "${city}" tidak ditemukan. Silakan masukkan nama kota di Indonesia yang benar.`;
      }
      
      const matchedCity = cityList[0];
      const cityId = matchedCity.id;
      const cityName = matchedCity.lokasi;
      
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      
      const scheduleUrl = `https://api.myquran.com/v2/sholat/jadwal/${cityId}/${year}/${month}/${day}`;
      const scheduleRes = await axios.get(scheduleUrl, { timeout: 8000, httpsAgent });
      
      const schedule = scheduleRes.data?.data?.jadwal;
      if (!schedule) {
        return `Gagal mendapatkan jadwal sholat untuk kota ${cityName} pada tanggal ini.`;
      }
      
      return `🕋 *JADWAL SHOLAT HARIAN* 🕋\n\n` +
             `📍 Lokasi: *${cityName}*\n` +
             `📅 Tanggal: *${schedule.tanggal}*\n\n` +
             `🌅 Imsak: *${schedule.imsak} WIB*\n` +
             `🕌 Subuh: *${schedule.subuh} WIB*\n` +
             `🌅 Terbit: *${schedule.terbit} WIB*\n` +
             `☀️ Dhuha: *${schedule.dhuha} WIB*\n` +
             `🕌 Dzuhur: *${schedule.dzuhur} WIB*\n` +
             `🕌 Ashar: *${schedule.ashar} WIB*\n` +
             `🕌 Maghrib: *${schedule.maghrib} WIB*\n` +
             `🕌 Isya: *${schedule.isya} WIB*\n\n` +
             `_Sumber: Kemenag RI via api.myquran.com_`;
    } catch (err) {
      return `Gagal mengambil jadwal sholat untuk ${city}: ${err.message}`;
    }
  },

  search_anime_manga: async ({ query, type }, chatId, signal) => {
    try {
      const httpsAgent = new https.Agent({ rejectUnauthorized: false });
      const mediaType = type === 'manga' ? 'manga' : 'anime';
      const url = `https://api.jikan.moe/v4/${mediaType}?q=${encodeURIComponent(query)}&limit=1`;
      const res = await axios.get(url, { timeout: 8000, httpsAgent, signal: signal || undefined });
      
      const mediaList = res.data?.data;
      if (!mediaList || mediaList.length === 0) {
        return `${mediaType.toUpperCase()} "${query}" tidak ditemukan.`;
      }
      
      const media = mediaList[0];
      const title = media.title;
      const englishTitle = media.title_english || '-';
      const score = media.score || 'N/A';
      const status = media.status || 'N/A';
      const synopsis = media.synopsis || 'Tidak ada sinopsis.';
      const cleanSynopsis = synopsis.length > 500 ? synopsis.substring(0, 500) + '...' : synopsis;
      const imageUrl = media.images?.jpg?.large_image_url || media.images?.jpg?.image_url;
      const sourceUrl = media.url || 'https://myanimelist.net';
      
      let textResult = `${mediaType === 'manga' ? '📖' : '🎬'} *INFORMASI ${mediaType.toUpperCase()}* ${mediaType === 'manga' ? '📖' : '🎬'}\n\n` +
                       `📌 Judul: *${title}*\n` +
                       `👤 Judul Inggris: *${englishTitle}*\n` +
                       `⭐ Skor: *${score}*\n` +
                       `📊 Status: *${status}*\n`;
                       
      if (mediaType === 'anime') {
        textResult += `📺 Tipe: *${media.type || 'N/A'}*\n` +
                      `🎥 Episode: *${media.episodes || 'N/A'}*\n` +
                      `⏱️ Durasi: *${media.duration || 'N/A'}*\n`;
      } else {
        textResult += `📚 Tipe: *${media.type || 'N/A'}*\n` +
                      `📑 Chapters: *${media.chapters || 'N/A'}*\n` +
                      `📁 Volumes: *${media.volumes || 'N/A'}*\n`;
      }
      
      const genres = media.genres ? media.genres.map(g => g.name).join(', ') : '-';
      textResult += `🎭 Genre: *${genres}*\n\n` +
                    `📝 *Sinopsis:* _${cleanSynopsis}_\n\n` +
                    `🔗 [Link MyAnimeList](${sourceUrl})`;
      
      if (imageUrl) {
        try {
          const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000, httpsAgent, signal: signal || undefined });
          const filename = `${mediaType}_cover_${media.mal_id || Date.now()}.jpg`;
          const outputPath = path.join(config.workspaceDir, filename);
          fs.writeFileSync(outputPath, imgRes.data);
          textResult += `\n\nSaved at file path: ${filename}`;
        } catch (imgErr) {
          if (signal && signal.aborted || imgErr.message === 'STOPPED') throw new Error('STOPPED');
          console.warn('Failed to download cover image:', imgErr.message);
        }
      }
      
      return textResult;
    } catch (err) {
      if (signal && signal.aborted || err.message === 'STOPPED') {
        throw new Error('STOPPED');
      }
      return `Gagal mencari anime/manga: ${err.message}`;
    }
  },

  lookup_whois_geoip: async ({ target }, chatId, signal) => {
    try {
      const cleaned = target.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
      const httpsAgent = new https.Agent({ rejectUnauthorized: false });
      
      const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
      const isIp = ipRegex.test(cleaned);
      
      if (isIp) {
        const res = await axios.get(`http://ip-api.com/json/${cleaned}`, { timeout: 8000, signal: signal || undefined });
        const data = res.data;
        if (!data || data.status === 'fail') {
          return `Gagal mendeteksi IP address ${cleaned}. Detail: ${data?.message || 'Unknown'}`;
        }
        
        return `🌐 *GEOLOKASI IP ADDRESS* 🌐\n\n` +
               `• IP: *${data.query}*\n` +
               `• Negara: *${data.country} (${data.countryCode})*\n` +
               `• Wilayah/Provinsi: *${data.regionName}*\n` +
               `• Kota: *${data.city}*\n` +
               `• Kode Pos: *${data.zip || '-'}*\n` +
               `• Koordinat: *${data.lat}, ${data.lon}*\n` +
               `• ISP: *${data.isp}*\n` +
               `• Organisasi: *${data.org || '-'}*\n` +
               `• AS/Jaringan: *${data.as || '-'}*`;
      } else {
        const res = await axios.get(`https://api.hackertarget.com/whois/?q=${cleaned}`, { timeout: 8000, httpsAgent, signal: signal || undefined });
        const data = res.data;
        if (!data || data.startsWith('error')) {
          return `Gagal melakukan lookup WHOIS untuk domain ${cleaned}.`;
        }
        
        const lines = data.split('\n');
        const truncated = lines.slice(0, 30).join('\n');
        const suffix = lines.length > 30 ? '\n\n...(Output dipotong untuk kenyamanan pembaca)...' : '';
        
        return `🔍 *WHOIS DOMAIN LOOKUP* 🔍\n\n` +
               `Domain: *${cleaned}*\n\n` +
               `\`\`\`\n${truncated}${suffix}\n\`\`\``;
      }
    } catch (err) {
      if (signal && signal.aborted || err.message === 'STOPPED') {
        throw new Error('STOPPED');
      }
      return `Gagal melakukan lookup WHOIS/GeoIP: ${err.message}`;
    }
  },

  get_song_lyrics: async ({ songTitle, artistName }, chatId, signal) => {
    try {
      const httpsAgent = new https.Agent({ rejectUnauthorized: false });
      let artist = artistName || '';
      let title = songTitle || '';

      // 1. Try to parse using Groq if artistName is not provided
      if (!artistName && groq) {
        try {
          const prompt = `Parse the following song search query into artist and title in JSON format. Return ONLY a JSON object with keys "artist" and "title". If the artist is not specified, guess the most likely artist for this song (e.g. for "Bohemian Rhapsody" guess "Queen", for "Faded" guess "Alan Walker").
Query: "${songTitle}"`;

          const response = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            response_format: { type: 'json_object' }
          }, { chatId, signal: signal || undefined });

          const parsed = JSON.parse(response.choices[0].message.content);
          if (parsed && parsed.title) {
            title = parsed.title;
            artist = parsed.artist || '';
          }
        } catch (groqErr) {
          if (signal && signal.aborted || groqErr.message === 'STOPPED') throw new Error('STOPPED');
          console.warn('Groq failed to parse lyrics query, falling back to raw input:', groqErr.message);
        }
      }

      if (signal && signal.aborted) {
        throw new Error('STOPPED');
      }

      if (!artist) {
        try {
          const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(title)}&media=music&limit=1`;
          const itunesRes = await axios.get(itunesUrl, { timeout: 5000, httpsAgent, signal: signal || undefined });
          const itunesResult = itunesRes.data?.results?.[0];
          if (itunesResult) {
            artist = itunesResult.artistName;
            title = itunesResult.trackName;
          }
        } catch (itunesErr) {
          if (signal && signal.aborted || itunesErr.message === 'STOPPED') throw new Error('STOPPED');
          console.warn('iTunes artist lookup failed:', itunesErr.message);
        }
      }

      // Fallback if still empty
      if (!artist) {
        artist = 'Unknown';
      }

      if (signal && signal.aborted) {
        throw new Error('STOPPED');
      }

      console.log(`Fetching lyrics from lyrics.ovh for: ${artist} - ${title}`);
      const lyricsUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
      const res = await axios.get(lyricsUrl, { timeout: 10000, httpsAgent, signal: signal || undefined });
      
      const lyrics = res.data?.lyrics;
      if (!lyrics) {
        return `Lirik lagu untuk "${title}" oleh ${artist} tidak ditemukan.`;
      }

      let textResult = `🎵 *LIRIK LAGU: ${title.toUpperCase()}* 🎵\n` +
                       `👤 Penyanyi/Artis: *${artist}*\n\n` +
                       `📝 *Lirik:*\n\n${lyrics}`;

      // 3. Try to get artwork from iTunes
      try {
        const searchQuery = `${artist} ${title}`;
        const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&media=music&limit=1`;
        const itunesRes = await axios.get(itunesUrl, { timeout: 5000, httpsAgent, signal: signal || undefined });
        const itunesResult = itunesRes.data?.results?.[0];
        if (itunesResult && itunesResult.artworkUrl100) {
          const highResCoverUrl = itunesResult.artworkUrl100.replace('100x100bb', '600x600bb');
          const imgRes = await axios.get(highResCoverUrl, { responseType: 'arraybuffer', timeout: 8000, httpsAgent, signal: signal || undefined });
          const filename = `lyrics_cover_${Date.now()}.jpg`;
          const outputPath = path.join(config.workspaceDir, filename);
          fs.writeFileSync(outputPath, imgRes.data);
          textResult += `\n\nSaved at file path: ${filename}`;
        }
      } catch (imgErr) {
        if (signal && signal.aborted || imgErr.message === 'STOPPED') throw new Error('STOPPED');
        console.warn('Failed to download iTunes cover art:', imgErr.message);
      }

      return textResult;
    } catch (err) {
      if (signal && signal.aborted || err.message === 'STOPPED') {
        throw new Error('STOPPED');
      }
      return `Gagal mendapatkan lirik lagu: ${err.message}. Pastikan nama artis dan judul lagu benar.`;
    }
  },

  generate_meme: async ({ topic }, chatId, signal) => {
    ensureSandbox();
    const { createMemeImage } = await import('./utils.js');
    const result = await createMemeImage(topic, config.workspaceDir, signal, chatId);
    const relPath = path.relative(config.workspaceDir, result.memePath);
    return `Meme generated successfully. Top: "${result.topText}", Bottom: "${result.bottomText}". Saved at file path: ${relPath}`;
  },

  enhance_image: async ({ filePath }, chatId, signal) => {
    ensureSandbox();
    const resolvedPath = path.join(config.workspaceDir, filePath);
    if (!isPathSafe(resolvedPath)) {
      throw new Error(`Access Denied: Path ${filePath} is outside sandbox workspace.`);
    }
    if (!fs.existsSync(resolvedPath)) {
      return `Error: File not found at ${filePath}`;
    }
    const { enhanceImage } = await import('./utils.js');
    const upscaledBuffer = await enhanceImage(resolvedPath, signal);
    fs.writeFileSync(resolvedPath, upscaledBuffer);
    return `Image enhanced successfully and overwritten at file path: ${filePath}`;
  },

  generate_tts: async ({ text }, chatId, signal) => {
    ensureSandbox();
    const { generateTts } = await import('./utils.js');
    const outputPath = await generateTts(text, config.workspaceDir, signal);
    const relPath = path.relative(config.workspaceDir, outputPath);
    return `TTS generated successfully. Saved at file path: ${relPath}`;
  },

  apply_voice_filter: async ({ filePath, filterType }) => {
    ensureSandbox();
    const resolvedPath = path.join(config.workspaceDir, filePath);
    if (!isPathSafe(resolvedPath)) {
      throw new Error(`Access Denied: Path ${filePath} is outside sandbox workspace.`);
    }
    if (!fs.existsSync(resolvedPath)) {
      return `Error: File not found at ${filePath}`;
    }
    const { applyVoiceFilter } = await import('./utils.js');
    await applyVoiceFilter(resolvedPath, filterType);
    return `Voice filter "${filterType}" applied successfully to file: ${filePath}`;
  },

  primbon_weton_jodoh: async ({ name1, birthdate1, name2, birthdate2 }, chatId, signal) => {
    if (!groq) {
      throw new Error('Groq client is not initialized. Please configure GROQ_API_KEY in your .env file.');
    }

    const calculateWeton = (dateStr) => {
      const targetDate = new Date(dateStr);
      if (isNaN(targetDate.getTime())) {
        throw new Error(`Format tanggal lahir '${dateStr}' tidak valid. Gunakan format YYYY-MM-DD.`);
      }
      
      const utcDate = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      const anchorDate = Date.UTC(1970, 0, 1);
      
      const diffDays = Math.round((utcDate - anchorDate) / (1000 * 60 * 60 * 24));
      
      const DAYS = ['Kamis', 'Jumat', 'Sabtu', 'Minggu', 'Senin', 'Selasa', 'Rabu'];
      const PASARAN = ['Wage', 'Kliwon', 'Legi', 'Pahing', 'Pon'];
      
      const day = DAYS[((diffDays % 7) + 7) % 7];
      const pasaran = PASARAN[((diffDays % 5) + 5) % 5];
      
      const neptuDays = { 'Minggu': 5, 'Senin': 4, 'Selasa': 3, 'Rabu': 7, 'Kamis': 8, 'Jumat': 6, 'Sabtu': 9 };
      const neptuPasaran = { 'Legi': 5, 'Pahing': 9, 'Pon': 7, 'Wage': 4, 'Kliwon': 8 };
      
      const neptuVal = neptuDays[day] + neptuPasaran[pasaran];
      return { day, pasaran, weton: `${day} ${pasaran}`, neptu: neptuVal };
    };

    try {
      const weton1 = calculateWeton(birthdate1);
      const weton2 = calculateWeton(birthdate2);
      
      const totalNeptu = weton1.neptu + weton2.neptu;
      let sisa = totalNeptu % 8;
      if (sisa === 0) sisa = 8;
      
      const compatibilityCategories = {
        1: { name: 'PEGAT', meaning: 'Sering menghadapi masalah dalam rumah tangga, baik ekonomi maupun pihak ketiga, yang berisiko berujung pada perpisahan/perceraian.' },
        2: { name: 'RATU', meaning: 'Dianggap jodoh sejati, hubungan sangat harmonis, bahagia, dan disegani orang di sekitar.' },
        3: { name: 'JODOH', meaning: 'Pasangan ini memang berjodoh dan akan memiliki kehidupan rumah tangga yang rukun serta saling melengkapi.' },
        4: { name: 'TOPO', meaning: 'Di awal pernikahan mungkin akan banyak kesulitan atau ujian, namun seiring waktu masalah tersebut dapat diatasi.' },
        5: { name: 'TINARI', meaning: 'Pertanda baik, pasangan ini akan diberikan kemudahan dalam mencari rezeki dan hidup berkecukupan.' },
        6: { name: 'PADU', meaning: 'Sering terjadi pertengkaran dalam rumah tangga, meskipun biasanya tidak sampai berujung pada perceraian.' },
        7: { name: 'SUJANAN', meaning: 'Perlu diwaspadai karena rumah tangga rawan mengalami pertengkaran besar, seringkali dipicu oleh masalah perselingkuhan.' },
        8: { name: 'PESTHI', meaning: 'Pasangan ini diramalkan akan hidup rukun, damai, dan harmonis hingga akhir hayat.' }
      };
      
      const category = compatibilityCategories[sisa];
      
      const prompt = `You are a legendary traditional Javanese fortune-teller (Dukun Ramal Primbon Jawa) who is funny, mystical, and uses Javanese cultural slang mixed with Indonesian.
Analyze the weton compatibility of:
Person 1: ${name1} (Lahir: ${birthdate1}, Weton: ${weton1.weton}, Neptu: ${weton1.neptu})
Person 2: ${name2} (Lahir: ${birthdate2}, Weton: ${weton2.weton}, Neptu: ${weton2.neptu})
Total Neptu Combined: ${totalNeptu}
Traditional Compatibility Status according to Primbon: ${category.name} (${category.meaning})

Write a detailed compatibility reading in Indonesian. The tone should be highly entertaining, witty, slightly dramatic but encouraging.
Structure the response beautifully using emojis:
1. 🌟 Rincian Weton Kedua Pasangan (Name, Weton, Neptu)
2. ⚖️ Total Neptu & Status Kecocokan tradisional Javanese Primbon
3. 🔮 Ramalan Mistis & Nasihat Dukun (a funny but wise prediction of their relationship, challenges they will face based on their status, and traditional tips/solutions to avoid bad luck like "ruwatan" or just funny practical relationship advice).
Keep the length around 250-350 words, clean markdown, with Javanese cultural flair.`;

      console.log(`[primbon_weton_jodoh] Querying Groq AI compatibility for ${name1} and ${name2}...`);
      const response = await groq.chat.completions.create({
        model: config.groqModel || 'qwen/qwen3-32b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.85
      }, { chatId, signal: signal || undefined });
      
      return response.choices[0].message.content.trim();
    } catch (err) {
      if (signal && signal.aborted || err.message === 'STOPPED') {
        throw new Error('STOPPED');
      }
      return `Gagal menghitung ramalan primbon jodoh: ${err.message}`;
    }
  },

  zodiac_fortune: async ({ sign, birthdate }, chatId, signal) => {
    if (!groq) {
      throw new Error('Groq client is not initialized. Please configure GROQ_API_KEY in your .env file.');
    }

    const getZodiacSign = (dateStr) => {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        throw new Error(`Format tanggal lahir '${dateStr}' tidak valid. Gunakan format YYYY-MM-DD.`);
      }
      const day = date.getDate();
      const month = date.getMonth() + 1;

      if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return 'Aries';
      if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return 'Taurus';
      if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return 'Gemini';
      if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return 'Cancer';
      if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return 'Leo';
      if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return 'Virgo';
      if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return 'Libra';
      if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return 'Scorpio';
      if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return 'Sagittarius';
      if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return 'Capricorn';
      if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return 'Aquarius';
      if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return 'Pisces';
      return 'Aries';
    };

    try {
      let resolvedSign = sign;
      if (!resolvedSign && birthdate) {
        resolvedSign = getZodiacSign(birthdate);
      }
      if (!resolvedSign) {
        return 'Gagal menentukan zodiak. Silakan masukkan parameter zodiak (sign) atau tanggal lahir (birthdate) yang valid.';
      }

      resolvedSign = resolvedSign.charAt(0).toUpperCase() + resolvedSign.slice(1).toLowerCase();

      const prompt = `You are a mystical, cosmic, and witty astrologer who reads the stars. 
Generate a comprehensive daily horoscope/zodiac forecast for: ${resolvedSign}.
The language must be Indonesian. The tone should be engaging, optimistic, and slightly humorous.

Format the output beautifully with markdown and emojis:
🪐 **RAMALAN ZODIAK: ${resolvedSign.toUpperCase()}** 🪐
📅 *Hari Ini*

🔮 **Ramalan Umum**
(1-2 sentences about the energy of the day)

💖 **Asmara / Hubungan**
(Advice or forecast for single and coupled status)

💼 **Karir & Keuangan**
(Opportunities or cautions about work and money)

🍏 **Kesehatan**
(Vitality, sleep, or wellness tip)

🎨 **Warna Keberuntungan:** [Color name with color description]
🍀 **Angka Keberuntungan:** [Random single or double digit]

Keep it concise, fun, and easy to read.`;

      console.log(`[zodiac_fortune] Querying Groq AI horoscope for ${resolvedSign}...`);
      const response = await groq.chat.completions.create({
        model: config.groqModel || 'qwen/qwen3-32b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8
      }, { chatId, signal: signal || undefined });

      return response.choices[0].message.content.trim();
    } catch (err) {
      if (signal && signal.aborted || err.message === 'STOPPED') {
        throw new Error('STOPPED');
      }
      return `Gagal mengambil ramalan zodiak: ${err.message}`;
    }
  },

  tarot_reading: async ({ question }, chatId, signal) => {
    if (!groq) {
      throw new Error('Groq client is not initialized. Please configure GROQ_API_KEY in your .env file.');
    }

    const TAROT_CARDS = [
      { name: 'The Fool (Sang Bodoh)', upright: 'Awal baru, kebebasan, spontanitas, keyakinan', reversed: 'Kecerobohan, risiko berlebih, kebodohan, keraguan' },
      { name: 'The Magician (Sang Penyihir)', upright: 'Manifestasi, kekuatan kemauan, kecerdasan, konsentrasi', reversed: 'Manipulasi, potensi terbuang, trik kotor' },
      { name: 'The High Priestess (Pendeta Agung Wanita)', upright: 'Intuisi, misteri, suara hati, pengetahuan spiritual', reversed: 'Rahasia terungkap, intuisi terabaikan, kedangkalan' },
      { name: 'The Empress (Permaisuri)', upright: 'Kelimpahan, kesuburan, alam, kreativitas, keindahan', reversed: 'Ketergantungan, kemandulan, kecemasan berlebih' },
      { name: 'The Emperor (Kaisar)', upright: 'Otoritas, struktur, stabilitas, perlindungan, rasionalitas', reversed: 'Tirani, dominasi berlebih, kurang disiplin' },
      { name: 'The Hierophant (Sang Pendeta Agung)', upright: 'Tradisi, spiritualitas, lembaga sosial, bimbingan', reversed: 'Pemberontakan, kebebasan berpikir, dogma kaku' },
      { name: 'The Lovers (Para Pecinta)', upright: 'Cinta, keharmonisan, pilihan moral, kemitraan', reversed: 'Ketidakselarasan, ketidakseimbangan, salah pilih' },
      { name: 'The Chariot (Kereta Perang)', upright: 'Kemenangan, tekad, kontrol, disiplin diri, tindakan', reversed: 'Kurang arah, kehilangan kontrol, hambatan jalan' },
      { name: 'Strength (Kekuatan)', upright: 'Keberanian, kesabaran, kontrol emosi, kasih sayang', reversed: 'Kelemahan, keraguan diri, kemarahan tak terkendali' },
      { name: 'The Hermit (Pertapa)', upright: 'Refleksi diri, pencarian jiwa, kesendirian, bimbingan batin', reversed: 'Kesepian, pengasingan diri berlebih, paranoia' },
      { name: 'Wheel of Fortune (Roda Keberuntungan)', upright: 'Perubahan nasib, keberuntungan, karma, titik balik', reversed: 'Nasib buruk, penolakan terhadap perubahan, lingkaran setan' },
      { name: 'Justice (Keadilan)', upright: 'Kebenaran, keadilan, hukum, sebab-akibat, integritas', reversed: 'Ketidakadilan, ketidakjujuran, menyangkal konsekuensi' },
      { name: 'The Hanged Man (Pria Tergantung)', upright: 'Pengorbanan, penyerahan diri, perspektif baru, penundaan', reversed: 'Sia-sia, keras kepala, terjebak dalam rutinitas' },
      { name: 'Death (Kematian)', upright: 'Akhir siklus, transformasi besar, transisi, melepaskan', reversed: 'Takut perubahan, penolakan kelahiran kembali, stagnasi' },
      { name: 'Temperance (Kesederhanaan)', upright: 'Keseimbangan, kesabaran, moderasi, kedamaian batin', reversed: 'Ketidakseimbangan, kelebihan berlebih, konflik internal' },
      { name: 'The Devil (Iblis)', upright: 'Keterikatan material, kecanduan, nafsu, ilusi batasan', reversed: 'Pelepasan diri, kesadaran baru, kebebasan dari jeratan' },
      { name: 'The Tower (Menara)', upright: 'Hancurnya ilusi, wahyu mendadak, kehancuran tak terduga', reversed: 'Menghindari bencana, ketakutan akan perubahan besar' },
      { name: 'The Star (Bintang)', upright: 'Harapan, iman, kesembuhan, inspirasi, ketenangan', reversed: 'Putus asa, kurang percaya diri, mimpi yang hancur' },
      { name: 'The Moon (Bulan)', upright: 'Ilusi, ketakutan, kecemasan, mimpi, ketidaksadaran', reversed: 'Kebenaran terungkap, mengatasi ketakutan, kejelasan' },
      { name: 'The Sun (Matahari)', upright: 'Kesuksesan, kebahagiaan, kejelasan, energy positif', reversed: 'Kesuksesan tertunda, optimisme berlebihan, kegembiraan semu' },
      { name: 'Judgement (Penghakiman)', upright: 'Panggilan batin, absolusi, pembaruan diri, keputusan penting', reversed: 'Penyesalan, keraguan batin, mengabaikan panggilan' },
      { name: 'The World (Dunia)', upright: 'Pencapaian, kepenuhan, penyelesaian siklus, perjalanan jauh', reversed: 'Kurang penyelesaian, tujuan tertunda, rasa tidak puas' }
    ];

    try {
      const randomIndex = Math.floor(Math.random() * TAROT_CARDS.length);
      const card = TAROT_CARDS[randomIndex];
      const isUpright = Math.random() >= 0.3;
      const position = isUpright ? 'Upright (Tegak)' : 'Reversed (Terbalik)';
      const keywords = isUpright ? card.upright : card.reversed;

      const prompt = `You are a mysterious, ancient, and highly intuitive Tarot reader (Pembaca Kartu Tarot Mistis).
The user has asked the following question / focused on this area: "${question}"
You draw a Tarot card for them:
- Card Name: ${card.name}
- Position: ${position}
- Traditional Keywords: ${keywords}

Write a detailed, mystical, and deeply intuitive reading in Indonesian.
Tone should be mysterious, encouraging, wise, and slightly poetic.
Format the output beautifully with markdown and emojis:
🃏 **PEMBACAAN KARTU TAROT MISTIS** 🃏
❓ **Pertanyaan:** _"${question}"_

🎴 **Kartu yang Ditarik:** **${card.name}** (${position})
🔑 **Kata Kunci Utama:** _${keywords}_

🔮 **Tafsiran Mistis & Jawaban:**
(Give a detailed paragraph interpreting what the card means for their question in this position)

💡 **Pesan & Nasihat Bijak:**
(A final actionable advice or warning based on the card drawing)

Keep the length around 200-300 words.`;

      console.log(`[tarot_reading] Drawing card for question: "${question}"...`);
      const response = await groq.chat.completions.create({
        model: config.groqModel || 'qwen/qwen3-32b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.85
      }, { chatId, signal: signal || undefined });

      return response.choices[0].message.content.trim();
    } catch (err) {
      if (signal && signal.aborted || err.message === 'STOPPED') {
        throw new Error('STOPPED');
      }
      return `Gagal menarik kartu tarot: ${err.message}`;
    }
  },

  find_song: async ({ url }, chatId, signal) => {
    ensureSandbox();
    try {
      const lowerUrl = url.toLowerCase();
      const isTikTok = lowerUrl.includes('tiktok.com') || lowerUrl.includes('vm.tiktok') || lowerUrl.includes('vt.tiktok');

      let musicTitle = null;
      let musicAuthor = null;
      let musicAlbum = null;
      let videoDesc = null;
      let videoCreator = null;

      // ───── STRATEGY 1: TikTok → Android API (bypasses IP block) ─────
      if (isTikTok) {
        console.log(`[find_song] Using TikTok Android API for: ${url}`);
        try {
          // Resolve short URLs first
          let resolvedUrl = url;
          if (url.includes('vm.tiktok') || url.includes('vt.tiktok')) {
            const r = await axios.get(url, { maxRedirects: 5, timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
            resolvedUrl = r.request?.res?.responseUrl || r.headers?.location || url;
          }

          const videoId = resolvedUrl.match(/video\/(\d+)/)?.[1];
          if (!videoId) throw new Error('Cannot extract video ID from TikTok URL');

          const apiUrl = `https://api22-normal-c-alisg.tiktokv.com/aweme/v1/feed/?aweme_id=${videoId}&iid=7318518857994389254&device_id=7318518857994389254&channel=googleplay&app_name=musical_ly&version_code=300904&device_platform=android&device_type=Pixel&os_version=14`;
          const res = await axios.get(apiUrl, {
            headers: {
              'User-Agent': 'com.zhiliaoapp.musically/2023903040 (Linux; U; Android 14; en_US; Pixel; Build/UP1A.231005.007; Cronet/58.0.2991.0)',
            },
            timeout: 15000,
            signal: signal || undefined,
          });

          const aweme = res.data?.aweme_list?.[0];
          if (aweme?.music) {
            musicTitle = aweme.music.title || null;
            musicAuthor = aweme.music.author || null;
            musicAlbum = aweme.music.album || null;
            videoDesc = aweme.desc || null;
            videoCreator = aweme.author?.nickname || null;
          }
        } catch (apiErr) {
          if (signal && signal.aborted) throw new Error('STOPPED');
          console.warn(`[find_song] TikTok API failed: ${apiErr.message}`);
        }
      }

      // ───── STRATEGY 2: Non-TikTok → yt-dlp metadata ─────
      if (!isTikTok || (!musicTitle && !musicAuthor)) {
        console.log(`[find_song] Using yt-dlp for: ${url}`);
        try {
          const ytDlp = await getYtDlpPath();
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

          const cmd = `"${ytDlp}" --dump-json --no-playlist --no-warnings --skip-download "${url}"`;
          const { stdout } = await execAsync(cmd, { timeout: 30000, env });
          const meta = JSON.parse(stdout.trim());

          musicTitle = musicTitle || meta.track || null;
          musicAuthor = musicAuthor || meta.artist || null;
          musicAlbum = musicAlbum || meta.album || null;
          videoDesc = videoDesc || meta.title || null;
          videoCreator = videoCreator || meta.uploader || meta.channel || null;
        } catch (ytErr) {
          if (signal && signal.aborted) throw new Error('STOPPED');
          console.warn(`[find_song] yt-dlp failed: ${ytErr.message}`);
        }
      }

      // ───── BUILD RESPONSE ─────
      const isOriginalSound = musicTitle && (
        musicTitle.toLowerCase().startsWith('original sound') ||
        musicTitle.toLowerCase().startsWith('suara asli') ||
        (musicTitle === musicAuthor)
      );

      const hasMusicInfo = musicTitle && musicAuthor && !isOriginalSound;
      let result = '';

      if (hasMusicInfo) {
        result += `🎵 *Lagu Ditemukan!*\n\n`;
        result += `🎶 *Judul:* ${musicTitle}\n`;
        result += `🎤 *Artis:* ${musicAuthor}\n`;
        if (musicAlbum) result += `💿 *Album:* ${musicAlbum}\n`;
        if (videoCreator) result += `📱 *Pembuat Video:* ${videoCreator}\n`;
        result += `\n🔍 *Cari di YouTube Music:* https://music.youtube.com/search?q=${encodeURIComponent(`${musicTitle} ${musicAuthor}`)}\n`;
        result += `🎧 *Cari di Spotify:* https://open.spotify.com/search/${encodeURIComponent(`${musicTitle} ${musicAuthor}`)}\n`;
        result += `▶️ *Cari di YouTube:* https://www.youtube.com/results?search_query=${encodeURIComponent(`${musicTitle} ${musicAuthor}`)}`;
      } else if (isOriginalSound && musicAuthor) {
        result += `🎵 *Info Audio Video:*\n\n`;
        result += `🎶 *Sound:* ${musicTitle}\n`;
        result += `📱 *Dari Akun:* @${musicAuthor}\n`;
        if (videoCreator && videoCreator !== musicAuthor) result += `🎬 *Pembuat Video:* ${videoCreator}\n`;
        result += `\n💡 Ini adalah *original sound* (suara asli dari pembuat konten), bukan lagu dari artis resmi.\n`;
        result += `\n🔍 *Coba cari akun pembuat sound:* https://www.tiktok.com/@${musicAuthor}`;
      } else if (musicTitle) {
        // Got some info but unsure if original
        result += `🎵 *Info Audio:*\n\n`;
        result += `🎶 *Sound/Lagu:* ${musicTitle}\n`;
        if (musicAuthor) result += `🎤 *Oleh:* ${musicAuthor}\n`;
        result += `\n🔍 *Cari di YouTube:* https://www.youtube.com/results?search_query=${encodeURIComponent(musicTitle + (musicAuthor ? ` ${musicAuthor}` : ''))}`;
      } else {
        // No metadata found at all
        result += `⚠️ Tidak dapat mengidentifikasi musik dari video ini secara otomatis.\n\n`;
        if (videoDesc) {
          result += `📹 *Deskripsi Video:* ${videoDesc.substring(0, 100)}${videoDesc.length > 100 ? '...' : ''}\n\n`;
        }
        result += `💡 *Cara identifikasi manual:*\n`;
        result += `• Buka aplikasi **Shazam** atau **SoundHound**, lalu play videonya\n`;
        result += `• Atau gunakan **Google Assistant** → "Lagu apa ini?"\n`;
        result += `• Atau cek di kolom komentar TikTok — biasanya ada yang nyebutin nama lagu\n`;
        if (videoDesc) {
          result += `\n🔍 *Coba cari:* https://www.youtube.com/results?search_query=${encodeURIComponent(videoDesc.substring(0, 60) + ' music')}`;
        }
      }

      return result;
    } catch (err) {
      if (signal && signal.aborted || err.message === 'STOPPED') throw new Error('STOPPED');
      return `Gagal mengidentifikasi lagu: ${err.message}`;
    }
  },

  google_search: async ({ query }, chatId, signal) => {
    try {
      const { engine, results } = await unifiedSearch(query, signal);
      return `Search Results for "${query}" (Source: ${engine}):\n\n${results.join('\n\n')}`;
    } catch (err) {
      if (signal && signal.aborted || err.message === 'STOPPED') throw new Error('STOPPED');
      console.error('Google search failed:', err);
      return `Failed to search Google: ${err.message}`;
    }
  },

  love_compatibility: async ({ name1, birthdate1, name2, birthdate2 }, chatId, signal) => {
    if (!groq) {
      throw new Error('Groq client is not initialized. Please configure GROQ_API_KEY in your .env file.');
    }

    const getZodiacSign = (dateStr) => {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        throw new Error(`Format tanggal lahir '${dateStr}' tidak valid. Gunakan format YYYY-MM-DD.`);
      }
      const day = date.getDate();
      const month = date.getMonth() + 1;

      if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return 'Aries';
      if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return 'Taurus';
      if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return 'Gemini';
      if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return 'Cancer';
      if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return 'Leo';
      if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return 'Virgo';
      if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return 'Libra';
      if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return 'Scorpio';
      if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return 'Sagittarius';
      if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return 'Capricorn';
      if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return 'Aquarius';
      if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return 'Pisces';
      return 'Aries';
    };

    try {
      const zodiac1 = getZodiacSign(birthdate1);
      const zodiac2 = getZodiacSign(birthdate2);
      
      const prompt = `You are a cosmic love consultant and relationship astrologer (Konsultan Cinta Kosmis & Astrologi).
Analyze the romantic compatibility between:
- Partner 1: ${name1} (Lahir: ${birthdate1}, Zodiak: ${zodiac1})
- Partner 2: ${name2} (Lahir: ${birthdate2}, Zodiak: ${zodiac2})

Provide a comprehensive, witty, and optimistic love compatibility check in Indonesian.
Include:
1. 💖 Zodiak & Element Analysis (Element compatibility, e.g., Fire + Water, Earth + Air)
2. 🧮 Numerology/Name Chemistry (A playful, fictional numerology name check score)
3. ⚡ Kecocokan Skor (Provide a numeric compatibility score between 50% and 99%)
4. 🔮 Cosmic Advice/Tips (How they can strengthen their relationship and handle potential clashes)

Format beautifully using markdown and emojis. Keep the length around 200-300 words.`;

      console.log(`[love_compatibility] Querying Groq AI love compatibility for ${name1} and ${name2}...`);
      const response = await groq.chat.completions.create({
        model: config.groqModel || 'qwen/qwen3-32b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8
      }, { chatId, signal: signal || undefined });

      return response.choices[0].message.content.trim();
    } catch (err) {
      if (signal && signal.aborted || err.message === 'STOPPED') throw new Error('STOPPED');
      return `Gagal menghitung kecocokan cinta: ${err.message}`;
    }
  },

  kamus_gaul: async ({ slangWord }, chatId, signal) => {
    if (!groq) {
      throw new Error('Groq client is not initialized. Please configure GROQ_API_KEY in your .env file.');
    }

    try {
      const prompt = `You are a linguist of Indonesian pop culture and youth slang (Kamus Bahasa Gaul Indonesia).
Explain the meaning and origin of the slang word/term/meme: "${slangWord}".
The language must be Indonesian. The tone should be casual, funny, and highly engaging (gaya anak muda).

Include:
1. 📖 Definisi / Arti (Clear and simple explanation of the term)
2. 🕵️ Asal-usul / Konteks (Where did it come from or how is it used, e.g. TikTok, Twitter, Gen Z culture)
3. 💬 Contoh Kalimat (Provide 2-3 funny example sentences using the slang word)

Format beautifully using markdown and emojis. Keep the length around 150-250 words.`;

      console.log(`[kamus_gaul] Querying Groq AI slang definition for "${slangWord}"...`);
      const response = await groq.chat.completions.create({
        model: config.groqModel || 'qwen/qwen3-32b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.75
      }, { chatId, signal: signal || undefined });

      return response.choices[0].message.content.trim();
    } catch (err) {
      if (signal && signal.aborted || err.message === 'STOPPED') throw new Error('STOPPED');
      return `Gagal mencari definisi bahasa gaul: ${err.message}`;
    }
  },

  generate_pantun: async ({ theme, targetName }, chatId, signal) => {
    if (!groq) {
      throw new Error('Groq client is not initialized. Please configure GROQ_API_KEY in your .env file.');
    }

    try {
      const targetStr = targetName ? ` ditujukan khusus untuk "${targetName}"` : '';
      const prompt = `You are a master of traditional Indonesian literature, specifically Pantun (Pujangga Pantun Jenaka).
Create a beautiful and witty Indonesian pantun (4 lines with a-b-a-b rhyme scheme, consisting of sampiran (first 2 lines) and isi (last 2 lines)).
Theme: ${theme}${targetStr}

The response must include:
1. 📝 Bait Pantun (The 4-line pantun formatted clearly)
2. 💡 Makna Pantun (A 1-sentence funny/witty explanation of the pantun's meaning)

Format beautifully using markdown and emojis. Make sure the rhyming scheme (a-b-a-b) is strictly followed and matches the Indonesian phonetics.`;

      console.log(`[generate_pantun] Querying Groq AI pantun for theme: "${theme}"...`);
      const response = await groq.chat.completions.create({
        model: config.groqModel || 'qwen/qwen3-32b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.85
      }, { chatId, signal: signal || undefined });

      return response.choices[0].message.content.trim();
    } catch (err) {
      if (signal && signal.aborted || err.message === 'STOPPED') throw new Error('STOPPED');
      return `Gagal membuat pantun: ${err.message}`;
    }
  }
};

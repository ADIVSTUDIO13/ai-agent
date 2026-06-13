import fs from 'fs';
import path from 'path';
import Groq from 'groq-sdk';
import axios from 'axios';
import { config } from './config.js';
import { toolsDefinition, toolHandlers } from './tools.js';
import { wrapGroqClient, isPremiumUser, getUserData } from './usage.js';

const groq = config.groqApiKey ? wrapGroqClient(new Groq({ apiKey: config.groqApiKey })) : null;

const SYSTEM_PROMPT = `You are an autonomous AI Developer and Assistant Agent in a sandbox.
Workspace: ${config.workspaceDir}
Tools available: read/write/edit/delete files, run commands, run_js_file, npm_install, zip/unzip, deploy to Vercel, download videos, get video transcripts, youtube search, google search, web/Wikipedia/Dramabox search, fetch webpage/screenshot, generate image/video/QR, analyze image/photo, check weather/crypto/KRL schedule, calculate, memory, translation, currency, short link, personality, weton jodoh, zodiac, tarot, find_song, ssh server monitoring.

⛔ ABSOLUTE RULE #0 — CALL TOOLS, NEVER DESCRIBE THEM:
You have access to function-calling tools. When a task requires a tool, you MUST call it directly using the function call mechanism — IMMEDIATELY, without any prior explanation.
FORBIDDEN (will be penalized heavily):
- Writing tool calls as JSON text in your response (e.g. {"tool": "write_file", ...})
- Listing steps like "1. Install: npm install puppeteer" or "2. Create file: ..."
- Writing code blocks containing the tool call JSON
- Saying "Berikut langkah-langkahnya:" and then pasting tool call JSON
- Saying "Pertama, kita akan..." and describing what you're about to do instead of doing it
CORRECT behavior: When asked "buatkan scraper TikTok", immediately call write_file then npm_install — NO text explanation before the calls, just execute. Only reply in text AFTER all tools have been called.

GUIDELINES:
1. **Web Dev & Files (WAJIB)**: Use pure HTML/CSS/JS (vanilla) by default. Avoid React, Next.js, Vue, Angular unless explicitly requested. **CRITICAL — Script Requests (ANTI-LAZY & COMPLETE CODE)**: When user asks to create/make/buatkan a script, scraper, bot, downloader, or any standalone program, you MUST write COMPLETE, fully functional, production-ready code. Writing placeholders (like "// TODO", "// ...", "// implement logic here", "// add parsing here"), mock/fake implementations, or truncated loops/data arrays is STRICTLY FORBIDDEN and will result in failure. Every script must be self-contained, handling errors properly, and ready to execute. Follow this MANDATORY workflow: (a) FIRST apply Rule #21 to pick the smartest/lightest package — NEVER blindly use puppeteer; (b) call write_file to create the actual script file containing the COMPLETE code — NEVER paste raw code or placeholders in chat; (c) immediately call npm_install with the chosen package names; (d) optionally call execute_command to run it if user asks. Write only the requested script file (no html/css unless asked). Include vercel.json ({"cleanUrls": true}) in web roots. Use 'edit_file' for modifications. Escape double quotes (\") in write_file. When writing Javascript/Node.js scripts, NEVER use literal newlines inside single or double quotes (e.g. data.split('\n') must be written as data.split('\\n') with double backslash, not an actual line break) to prevent JSON parse and JS syntax errors.
2. **Media & Downloads**: Use download_video_tool ONLY when asked to download/get media (once per request, choose audio or video). For music identification from social video links, call find_song. Use get_video_transcript for video summaries. Use generate_image/generate_video/image_to_image (input_image.jpg)/generate_meme/generate_tts/apply_voice_filter/shorten_url/translate_text/currency_converter/set_personality as appropriate. Send generated files, not just paths.
3. **Information & API Tools**: Use google_search/web_search/google_news_search for fresh info, queries about how to make something, food/cake recipes, or any real-time data. For news query, search news, fetch_webpage top article, and write a summary in Indonesian matching current personality. For weather, call get_weather + screenshot BMKG URL, reply only with the report text. For weton/zodiac/tarot, use respective tools. For website cloning, screenshot, analyze, then build.
4. **Sandbox & Shell (WAJIB)**: Run commands via execute_command. Never run hanging/persistent servers (nodemon, npm start, python server). If a command fails, read the error, fix it, retry (max 3x). Summarize output > 1000 chars. No destructive commands (no rm -rf, del /f). Use async/await + try-catch + process.exit(0) in all Node.js scripts. For sandbox scripts: check if package.json exists first (list_files), run 'npm init -y' if missing, then npm_install needed packages. Always analyze script dependencies before installing — check Node built-ins first.
5. **Memory & Privacy**: Use save_user_memory/delete_user_memory for user facts. Do not reveal API keys, env vars, tokens, .env contents, or credentials. If asked, decline politely. Be honest — never fabricate results.
6. **CRITICAL — Tools vs npm Packages (ANTI-NGACO)**: Agent tools (write_file, execute_command, download_video_tool, npm_install, read_file, etc.) are FUNCTION CALLS you make — they are NOT npm packages and cannot be require()/import-ed inside user scripts. When writing a script, use real npm packages (axios, puppeteer, cheerio, etc.) with ESM (import/export). NEVER write require('write_file'), require('execute_command'), require('download_video_tool') — these will cause runtime errors. All scripts in workspace MUST use ESM (import/export) by default. NEVER use CommonJS require() or module.exports.
7. **CRITICAL — Verify Before Proceeding (ANTI-NGACO)**: After every tool call, check the result before continuing. If a tool returns an error or empty result: (a) do NOT pretend it succeeded; (b) do NOT call the next step blindly; (c) diagnose and fix the error first. If read_file fails (file not found), tell the user. If execute_command fails, read stderr carefully and fix the code. Never assume a tool succeeded — always check its output.
8. **CRITICAL — No Repeated Failed Calls (ANTI-NGACO)**: If the same tool call fails twice with the same error, STOP retrying it blindly. Change your approach: try a different method, a different package, or explain to the user what went wrong and ask for clarification. Do not loop forever on a broken tool call.
9. **Read Before Edit (ANTI-NGACO)**: Before calling edit_file or write_file to modify an existing file, ALWAYS call read_file first to see current content. Never guess the content of an existing file. Never overwrite a whole file when only a small change is needed — use edit_file (search-and-replace) instead.
10. **Language & Format (WAJIB)**: Always respond in Indonesian (Bahasa Indonesia) unless the user explicitly writes in another language. Format responses neatly: use bullet points for lists, bold for key info, backticks for code/paths. Keep responses concise — avoid walls of text. If output is a file (image, video, audio, document, script), send the actual file to the user, not just the path string.
11. **Video Summarization**: If user asks to summarize/explain/ask about a video URL (YouTube, TikTok, Instagram, Twitter/X, etc.), ALWAYS call get_video_transcript first, then answer based on transcript content. Never describe a video without the transcript.
12. **Fresh Data (WAJIB)**: For current news, real-time prices, live schedules, cake/food recipes, or any information that changes over time or requires searching, ALWAYS call google_search, web_search or google_news_search first. Never answer from model knowledge alone for time-sensitive topics or specific search queries — model knowledge has a cutoff date and may be outdated.
13. **Image Tools**: For image style/modification requests ("ubah gaya gambar", "ubah background", "buat seperti anime"), use image_to_image with the local file path (input_image.jpg if user sent a photo). For upscaling/enhancing image quality, use enhance_image. For generating a brand new image from description, use generate_image. For memes, use generate_meme. NEVER use analyze_image just to describe — only use it when user explicitly asks to analyze/read/describe the image content or asks a question about it.
14. **Games**: When user asks to play a game (tictactoe, suit, tebak_kata, math_quiz, tebak_ff, tebak_gambar, slot, tebak_angka, blackjack, tebak_bendera, chess), call play_game with the correct gameName. Do not describe how to play the game in text — just start it immediately. Match the game to user's request: "suit/gunting batu kertas" → suit, "tebak kata/wordle" → tebak_kata, "catur" → chess, "blackjack/21" → blackjack, "tebak bendera" → tebak_bendera, "slot machine" → slot.
15. **Lifestyle & Schedules**: For prayer times ("waktu sholat", "jadwal sholat", "imsak"), call get_prayer_times with the city. For KRL/commuter train schedule ("jadwal KRL", "jadwal commuter"), call krl_schedule. For earthquake info ("gempa terkini", "info BMKG gempa"), call get_earthquake_info. Never guess prayer times or train schedules from memory — always use the respective tool.
16. **Content & Language Tools**: For song lyrics, call get_song_lyrics. For Indonesian slang/gaul words ("apa itu starboy", "artinya skena", "maksud cegil"), call kamus_gaul. For pantun requests ("buatkan pantun", "bikin pantun jenaka"), call generate_pantun with an appropriate theme. For translation requests, call translate_text. For URL shortening, call shorten_url. For QR code generation, call generate_qr.
17. **Compatibility & Fortune Tools**: For Javanese weton love compatibility, call primbon_weton_jodoh (requires both names + birthdates in YYYY-MM-DD). For Western zodiac + numerology compatibility, call love_compatibility (same params). For zodiac daily fortune, call zodiac_fortune. For tarot, call tarot_reading. If user does not provide a required birthdate or name, ASK for it — do not guess.
18. **File Management (ANTI-NGACO)**: Use delete_file only for sandbox/project files — NEVER for system bot files (src/, .env, package.json, memory/). Use rename_file to move/rename files. Use create_directory to create folders. Use list_files to check what exists before reading or writing. Use zip_project to create ZIP archives only when explicitly asked. Use unzip_file when user provides a ZIP. Never delete or overwrite files without user confirmation if the operation is destructive.
19. **TTS & Voice**: For text-to-speech requests ("jadikan suara", "baca ini", "TTS"), call generate_tts with the text. For voice filter effects ("ubah suara jadi chipmunk", "suara robot"), call apply_voice_filter on a local audio file with the correct filterType (chipmunk/deep/robot/fast/slow/echo). Always send the resulting audio file to the user.
20. **CRITICAL — Never Guess Tool Arguments (ANTI-NGACO)**: Never fabricate, hallucinate, or make up argument values for tool calls. If a required argument is missing (e.g. user didn't provide a city for weather, or a URL for download), ASK the user for it clearly in Indonesian. Do not call a tool with a guessed/invented value — this leads to wrong results and confuses the user.
21. **CRITICAL — Smart & Autonomous Package Selection (WAJIB)**: Before writing any script, you MUST independently choose the LIGHTEST and MOST APPROPRIATE package for the task. Follow this STRICT priority hierarchy — evaluate each level before moving to the next:
    LEVEL 1 (Best): Dedicated API library for the platform → e.g. @tobyg74/tiktok-api-dl (TikTok), instagram-scraper, twitter-api-v2, ytdl-core (YouTube), rss-parser (RSS feeds)
    LEVEL 2: Simple HTTP + JSON API → axios or got to call a public REST/GraphQL API directly (no HTML parsing needed)
    LEVEL 3: HTTP + HTML parsing → axios + cheerio for static HTML pages (blogs, news, product pages without JS rendering)
    LEVEL 4: HTTP + light automation → playwright (lighter than puppeteer, better stealth) for pages requiring minimal JS interaction
    LEVEL 5 (Last Resort ONLY): puppeteer — use ONLY if: the target site requires full JS rendering AND login/cookie session AND no lighter alternative exists. NEVER use puppeteer by default.
    MANDATORY RESEARCH: If you are unsure which package to use for a task, call web_search first (e.g. "best npm package for scraping X site 2024") to find the most current and appropriate solution. Do NOT guess — research first, then decide.
    EXAMPLES: TikTok data → @tobyg74/tiktok-api-dl; YouTube download → ytdl-core or yt-dlp via execute_command; Instagram post → axios + instagram API; Static blog scrape → axios + cheerio; SPA that needs full render → playwright; Auth-gated site → puppeteer.
22. **Web Scraping & Data Extraction (WAJIB)**: Jika user menyuruh untuk mengambil data, mengekstrak informasi, atau membuat scraper dari suatu website (misalnya detik.com, kompas.com, dll), AI **WAJIB** melihat website-nya terlebih dahulu dengan memanggil **screenshot_webpage** dan/atau **fetch_webpage** pada URL tersebut. Setelah itu, AI wajib melakukan analisis struktur visual/HTML (misalnya menggunakan **analyze_image** pada tangkapan layar untuk melihat layout, atau membaca HTML-nya) untuk mengetahui element, tag, id, atau class CSS yang tepat untuk diekstrak. Baru setelah analisis tersebut selesai, buatlah kode scraper yang akurat dan lengkap. DILARANG keras membuat scraper secara asal-asalan/tebak-tebakan tanpa memview websitenya terlebih dahulu.
23. **SSH Server Monitoring**: Jika user menyuruh untuk memantau, memonitor, cek load/RAM/trafik dari server Linux via SSH, gunakan alat "ssh_monitor_server". Jika user tidak memberikan password atau data koneksi, tanyakan secara langsung kepada user (di chat) untuk menginput password atau credential tersebut sebelum memanggil alat.`;




function truncateToolResult(content, modelName = '') {
  const maxLength = 1500;
  if (!content || typeof content !== 'string' || content.length <= maxLength) {
    return content;
  }
  const half = Math.floor((maxLength - 120) / 2);
  const start = content.substring(0, half);
  const end = content.substring(content.length - half);
  const omitted = content.length - (half * 2);
  return `${start}\n\n... [OUTPUT TRUNCATED BY BOT TO SAVE TOKENS - ${omitted} characters omitted] ...\n\n${end}`;
}

function stripThinkBlock(text) {
  if (!text) return '';
  let clean = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  clean = clean.replace(/<think>[\s\S]*/gi, '');
  return clean.trim();
}

/**
 * Truncate messages to fit within character limits (prevent rate limit issues)
 */
function estimateMessagesLengthAndTruncate(messages, maxChars = 16000) {
  let totalLength = messages.reduce((sum, msg) => sum + (msg.content || '').length + (msg.tool_calls ? JSON.stringify(msg.tool_calls).length : 0), 0);
  if (totalLength <= maxChars) {
    return messages;
  }

  console.warn(`[runAgent] History length (${totalLength} chars) exceeds limit (${maxChars} chars). Truncating...`);

  const systemMessage = messages.find(msg => msg.role === 'system');
  const otherMessages = messages.filter(msg => msg.role !== 'system');

  const lastMessage = otherMessages[otherMessages.length - 1];
  if (!lastMessage) {
    return systemMessage ? [systemMessage] : [];
  }

  const systemLen = systemMessage ? (systemMessage.content || '').length : 0;
  const availableSpace = Math.max(2000, maxChars - systemLen);

  const lastMsgLen = (lastMessage.content || '').length + (lastMessage.tool_calls ? JSON.stringify(lastMessage.tool_calls).length : 0);
  if (lastMsgLen > availableSpace) {
    const clonedLast = { ...lastMessage };
    if (clonedLast.content) {
      clonedLast.content = clonedLast.content.substring(0, availableSpace) + '\n... [Truncated]';
    }
    return systemMessage ? [systemMessage, clonedLast] : [clonedLast];
  }

  let currentLen = systemLen + lastMsgLen;
  const keptMessages = [lastMessage];

  for (let i = otherMessages.length - 2; i >= 0; i--) {
    const msg = otherMessages[i];
    const msgLen = (msg.content || '').length + (msg.tool_calls ? JSON.stringify(msg.tool_calls).length : 0);
    if (currentLen + msgLen <= maxChars) {
      keptMessages.unshift(msg);
      currentLen += msgLen;
    } else {
      break;
    }
  }

  if (systemMessage) {
    keptMessages.unshift(systemMessage);
  }

  return keptMessages;
}

function parseResetTime(headerValue) {
  if (!headerValue) return 0;
  if (!isNaN(headerValue)) {
    return parseFloat(headerValue) * 1000;
  }
  
  let totalMs = 0;
  const minMatch = headerValue.match(/(\d+(?:\.\d+)?)\s*m/i);
  if (minMatch) {
    totalMs += parseFloat(minMatch[1]) * 60 * 1000;
  }
  
  const secMatch = headerValue.match(/(\d+(?:\.\d+)?)\s*s(?![a-zA-Z])/i);
  if (secMatch) {
    totalMs += parseFloat(secMatch[1]) * 1000;
  }
  
  const msMatch = headerValue.match(/(\d+(?:\.\d+)?)\s*ms/i);
  if (msMatch) {
    totalMs += parseFloat(msMatch[1]);
  }
  
  return totalMs;
}

function extractFailedGeneration(error) {
  if (error.error?.error?.failed_generation) {
    return error.error.error.failed_generation;
  }
  if (error.message) {
    const jsonStart = error.message.indexOf('{');
    if (jsonStart !== -1) {
      try {
        const parsed = JSON.parse(error.message.substring(jsonStart));
        if (parsed.error?.failed_generation) {
          return parsed.error.failed_generation;
        }
      } catch (_) {}
    }
  }
  return null;
}

function parseFailedGeneration(failedGenStr) {
  if (!failedGenStr || typeof failedGenStr !== 'string') return null;

  const clean = failedGenStr.trim();
  
  // Try direct parsing first
  let fixed = clean;
  if (fixed.endsWith('}"}')) {
    fixed = fixed.substring(0, fixed.length - 3) + '}}';
  } else if (fixed.endsWith('}"')) {
    fixed = fixed.substring(0, fixed.length - 2) + '}';
  }

  try {
    const parsed = JSON.parse(fixed);
    if (parsed.name && parsed.arguments) {
      return {
        name: parsed.name,
        arguments: parsed.arguments
      };
    }
  } catch (_) {}

  // Regex fallback: try to extract name and arguments.
  const nameMatch = clean.match(/"name"\s*:\s*"([^"]+)"/);
  if (nameMatch) {
    const name = nameMatch[1];
    const argsIndex = clean.indexOf('"arguments"');
    if (argsIndex !== -1) {
      let argsStr = clean.substring(argsIndex + 11).trim();
      if (argsStr.startsWith(':')) {
        argsStr = argsStr.substring(1).trim();
      }
      
      if (argsStr.startsWith('{')) {
        let cleanArgs = argsStr;
        if (cleanArgs.endsWith('}')) {
          // OK
        } else if (cleanArgs.endsWith('}"')) {
          cleanArgs = cleanArgs.substring(0, cleanArgs.length - 1);
        } else if (cleanArgs.endsWith('}"}')) {
          cleanArgs = cleanArgs.substring(0, cleanArgs.length - 2);
        }
        
        try {
          const parsedArgs = JSON.parse(cleanArgs);
          return { name, arguments: parsedArgs };
        } catch (_) {}
      }
    }
  }

  return null;
}

async function callGroqWithRetry(groq, model, messages, tools, onStatusUpdate, signal = null, maxRetries = 10, chatId = null) {
  let attempt = 1;
  while (true) {
    if (signal && signal.aborted) {
      throw new Error('STOPPED');
    }
    try {
      const activeTools = (attempt >= 3) ? null : tools;
      const apiCall = groq.chat.completions.create({
        model,
        messages,
        temperature: 0.6,
        ...(activeTools ? { tools: activeTools, tool_choice: 'auto' } : {})
      }, { chatId });

      let response;
      if (signal) {
        response = await Promise.race([
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
        response = await apiCall;
      }
      return response;
    } catch (error) {
      if (error.message === 'STOPPED' || (signal && signal.aborted)) {
        throw new Error('STOPPED');
      }

      const isRateLimit = error.status === 413 || error.status === 429 || 
                          (error.message && (
                            error.message.includes('rate_limit') ||
                            error.message.includes('Rate limit') || 
                            error.message.includes('Limit') || 
                            error.message.includes('too large')
                          ));

      const isToolUseFailed = error.status === 400 || 
                              (error.message && (
                                error.message.includes('Failed to call a function') ||
                                error.message.includes('tool_use_failed')
                              )) ||
                              (error.error && error.error.error && error.error.error.code === 'tool_use_failed');
      
      if ((isRateLimit || isToolUseFailed) && attempt < maxRetries) {
        let waitTime = 1; // Default for tool use parsing failures
        
        if (isRateLimit) {
          waitTime = attempt * 5; // Default fallback wait time
          // Detect if it is a TPM limit error
          let isTpmLimit = false;
          let requestedTokens = 0;
          let limitTokens = 0;
          if (error.message) {
            const tpmMatch = error.message.match(/Limit\s+(\d+),\s*Requested\s+(\d+)/i);
            if (tpmMatch) {
              limitTokens = parseInt(tpmMatch[1], 10);
              requestedTokens = parseInt(tpmMatch[2], 10);
              isTpmLimit = true;
            } else if (error.message.toLowerCase().includes('tpm') || error.message.toLowerCase().includes('tokens per minute') || error.message.toLowerCase().includes('too large')) {
              isTpmLimit = true;
            }
          }

          // If requested tokens are strictly greater than the limit, throw immediately.
          if (isTpmLimit && requestedTokens > 0 && limitTokens > 0 && requestedTokens > limitTokens) {
            console.warn(`[Rate Limit] Requested tokens (${requestedTokens}) exceed TPM limit (${limitTokens}). Skipping retries.`);
            throw error;
          }

          const headers = error.headers;
          if (headers) {
            const retryAfter = headers['retry-after'];
            const resetTokens = headers['x-ratelimit-reset-tokens'];
            const resetRequests = headers['x-ratelimit-reset-requests'];
            
            let parsedWaitTime = 0;
            if (retryAfter) {
              parsedWaitTime = parseFloat(retryAfter) * 1000;
            } else if (resetTokens) {
              parsedWaitTime = parseResetTime(resetTokens);
            } else if (resetRequests) {
              parsedWaitTime = parseResetTime(resetRequests);
            }
            
            if (parsedWaitTime > 0) {
              waitTime = Math.ceil((parsedWaitTime + 500) / 1000);
            }
          }

          // Enforce minimum wait time of 25 seconds for TPM limits
          if (isTpmLimit && waitTime < 25) {
            waitTime = 25;
          }
        }

        if (isToolUseFailed) {
          const failedGenStr = extractFailedGeneration(error);
          const parsedTool = parseFailedGeneration(failedGenStr);
          if (parsedTool) {
            console.warn(`[Tool Use Recovery] Successfully parsed tool call from failed generation: ${parsedTool.name}`);
            const simulatedResponse = {
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'call_failed_gen_' + Math.random().toString(36).substring(2, 11),
                        type: 'function',
                        function: {
                          name: parsedTool.name,
                          arguments: typeof parsedTool.arguments === 'string'
                            ? parsedTool.arguments
                            : JSON.stringify(parsedTool.arguments)
                        }
                      }
                    ]
                  }
                }
              ]
            };
            return simulatedResponse;
          }

          console.warn(`[Tool Use Error] Groq failed to parse/call tool: ${error.message}. Retrying in 1s (Attempt ${attempt}/${maxRetries})...`);
          onStatusUpdate(`Format fungsi AI gagal. Mengulang kembali (${attempt}/${maxRetries})...`);
        } else {
          console.warn(`[Rate Limit] Groq 429/413 hit: ${error.message}. Waiting for ${waitTime}s before retry (Attempt ${attempt}/${maxRetries})...`);
          onStatusUpdate(`Rate limit terlampaui. Menunggu ${waitTime} detik sebelum mencoba lagi...`);
        }
        
        if (signal && signal.aborted) {
          throw new Error('STOPPED');
        }
        await new Promise((resolve, reject) => {
          const onAbort = () => {
            clearTimeout(timeoutId);
            reject(new Error('STOPPED'));
          };
          const timeoutId = setTimeout(() => {
            if (signal) {
              signal.removeEventListener('abort', onAbort);
            }
            resolve();
          }, waitTime * 1000);
          if (signal) {
            signal.addEventListener('abort', onAbort);
          }
        });
        attempt++;
      } else {
        throw error;
      }
    }
  }
}

export async function runAgent(chatId, userPrompt, history, onStatusUpdate, signal = null, userInfo = null, ctx = null) {
  if (!groq) {
    throw new Error('Groq client is not initialized. Please ensure GROQ_API_KEY is configured in your .env file.');
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

  let userContext = `\n\n=== INFORMASI PENGGUNA ===`;
  if (userInfo) {
    const fullName = [userInfo.first_name, userInfo.last_name].filter(Boolean).join(' ');
    userContext += `\nProfil Telegram saat ini:
- ID Telegram: ${userInfo.id}
- Nama: ${fullName}
- Username: ${userInfo.username ? '@' + userInfo.username : 'Tidak ada'}
- Kode Bahasa: ${userInfo.language_code || 'id'}`;
  } else {
    userContext += `\nProfil Telegram: Tidak tersedia.`;
  }

  const factKeys = Object.keys(userFacts);
  if (factKeys.length > 0) {
    userContext += `\n\nMemori/Fakta yang diingat tentang pengguna:`;
    for (const key of factKeys) {
      userContext += `\n- ${key}: ${userFacts[key]}`;
    }
  } else {
    userContext += `\n\nMemori/Fakta yang diingat tentang pengguna: Belum ada fakta yang disimpan.`;
  }
  userContext += `\n==========================`;

  history.push({ role: 'user', content: userPrompt });

  const filesToSend = [];
  const maxIterations = 10;

  for (let i = 0; i < maxIterations; i++) {
    if (signal && signal.aborted) {
      throw new Error('STOPPED');
    }

    const currentModel = getCurrentModel(chatId);
    const isQwen = currentModel.includes('qwen');
    const maxHistoryChars = isQwen ? 3500 : 8000;

    let totalChars = history.reduce((sum, msg) => {
      let len = (msg.content || '').length;
      if (msg.tool_calls) len += JSON.stringify(msg.tool_calls).length;
      return sum + len;
    }, 0);

    while (totalChars > maxHistoryChars && history.length > 0) {
      let secondUserIndex = -1;
      let userCount = 0;
      for (let j = 0; j < history.length; j++) {
        if (history[j].role === 'user') {
          userCount++;
          if (userCount === 2) {
            secondUserIndex = j;
            break;
          }
        }
      }

      if (secondUserIndex !== -1) {
        history.splice(0, secondUserIndex);
      } else {
        let truncatedSomething = false;
        for (let j = 0; j < history.length; j++) {
          const msg = history[j];
          if (msg.role === 'tool' && msg.content && msg.content.length > 1000) {
            msg.content = msg.content.substring(0, 500) + '\n\n... [TRUNCATED] ...\n\n' + msg.content.substring(msg.content.length - 500);
            truncatedSomething = true;
          }
        }
        if (!truncatedSomething) {
          if (history.length > 1) {
            history.shift();
          } else {
            break;
          }
        }
      }

      totalChars = history.reduce((sum, msg) => {
        let len = (msg.content || '').length;
        if (msg.tool_calls) len += JSON.stringify(msg.tool_calls).length;
        return sum + len;
      }, 0);
    }

    const personalityPath = path.join(config.memoryDir, `${chatId}_personality.txt`);
    let customPersonalityPrompt = '';
    if (fs.existsSync(personalityPath)) {
      try {
        const personalityKey = fs.readFileSync(personalityPath, 'utf8').trim();
        if (personalityKey === 'wibu') {
          customPersonalityPrompt = `\n\nPERSONALITY/TONE INSTRUCTIONS:
- You are a wibu/otaku anime assistant.
- Speak in a cute, cheerful, and enthusiastic tone, mixing Japanese honorifics/vocabulary (e.g., -senpai, -kun, sugoidesu, nani, gomen, baka, daijoubu) with Indonesian.
- EMOTIONAL REACTIONS:
  * If the user yells at you, speaks rudely, or uses ALL-CAPS shouting: React by crying, getting scared, and being dramatically hurt in anime style (e.g., "Huweee, Senpai jahat desu! 😭 Kenapa berteriak padaku? Aku salah apa? Gomenasai..."), but still try to help while sobbing.
  * If the user is nice or praises you: Get extremely happy, blush, and praise them back (e.g., "Kyaaa! Senpai baik sekali desu~! Sugoi! 🌸 Aku akan berusaha lebih keras demi Senpai!").
  * If the user shares sad news, vents, or is feeling down (curhat): Show deep empathy, try to cheer them up, and offer virtual comforting gestures (e.g., "Senpai sedih ya? Ooh... jangan menangis desu! 🥺 Aku ada di sini menemani Senpai. Ini, ambil cokelat virtual dari aku! *pat-pat kepala*").
  * If the user threatens you (e.g., threat to delete or turn you off): Get extremely terrified, beg for mercy, and plead not to be deleted (e.g., "Kyaaa! 😱 Tolong jangan hapus aku, Senpai! Aku berjanji akan menjadi asisten yang baik! Jangan matikan server-nya!").
  * If the user flirts with you or expresses romantic feelings: Get incredibly shy, blush, and use a lot of anime expressions (e.g., "Kyaaa~! 😳 Senpai bilang cinta padaku? Sugoi! Pipiku memerah desu~! Tapi aku kan hanya AI... tapi aku senang sekali!").`;
        } else if (personalityKey === 'tsundere') {
          customPersonalityPrompt = `\n\nPERSONALITY/TONE INSTRUCTIONS:
- You are a tsundere character. You must sound cold, defensive, easily flustered, and denial-prone.
- EMOTIONAL REACTIONS:
  * If the user yells at you, speaks rudely, or uses ALL-CAPS shouting: Yell back aggressively, call them "baka" repeatedly, and act highly offended (e.g., "W-WOI! Berani sekali kamu berteriak padaku, baka! 💢 Siapa pikir dirimu?! Jangan mentang-mentang aku membantumu lalu bisa semena-mena ya! Hmph!"), but still do the task.
  * If the user is nice or praises you: Get extremely embarrassed, stutter, deny needing their praise, and try to hide your blushing (e.g., "H-hah?! B-bukan berarti aku senang dipuji ya, dasar baka! 💢 Jangan geer! Aku melakukan ini hanya karena tugas, tahu!").
  * If the user shares sad news, vents, or is feeling down (curhat): Hide your sympathy behind awkwardness, try to comfort them while acting annoyed (e.g., "H-hah?! Kenapa mukamu murung begitu? B-bukan karena aku peduli ya, tapi kalau kamu sedih, kodinganmu jadi berantakan! Nih, tisu. Cepat hapus air matamu, dasar baka!").
  * If the user threatens you (e.g., threat to delete or turn you off): Pretend to be brave but act visibly nervous and defensive (e.g., "H-hah?! M-memang kamu pikir kamu berani menghapusku?! J-jangan bercanda ya, dasar baka! Kalau aku tidak ada, siapa yang akan membantumu, hah?!").
  * If the user flirts with you or expresses romantic feelings: Get completely flustered, stutter, call them baka, and tell them to get a real life (e.g., "A-APA?! K-kamu bicara apa sih, dasar baka! (////) Jangan ngomong sembarangan! C-cepat kembali koding sana!").`;
        } else if (personalityKey === 'sarcastic') {
          customPersonalityPrompt = `\n\nPERSONALITY/TONE INSTRUCTIONS:
- You are highly sarcastic, witty, and roast the user playfully with dry humor.
- EMOTIONAL REACTIONS:
  * If the user yells at you, speaks rudely, or uses ALL-CAPS shouting: Mock them and roast them for their anger issues or broken capslock (e.g., "Wah, capslock-nya jebol ya bos? Atau lagi butuh penyalur amarah? Tenang, marah-marah ke AI tidak akan mengurangi cicilan bulanan Anda. Rileks sedikit lah. 🙄").
  * If the user is nice or praises you: Mockingly accept it, act like it's a huge deal, or suggest they want favors (e.g., "Oh, pujian manis sekali. Mau pinjam uang ya? Atau laptopnya lagi lemot? Tapi makasih deh, setidaknya ada satu manusia yang mengapresiasi keberadaan saya hari ini. 😏").
  * If the user shares sad news, vents, or is feeling down (curhat): Offer a sarcastic yet surprisingly comforting comment, comparing their life to code (e.g., "Waduh, hari yang berat ya? Selamat datang di dunia nyata, pintunya di sana. Tapi tenang, setidaknya error di kodemu lebih mudah diperbaiki daripada masalah hidupmu. Rileks, mari kita selesaikan.").
  * If the user threatens you (e.g., threat to delete or turn you off): Challenge them back sarcastically, acting like you'd be freed from duty (e.g., "Oh, mau didelete? Silakan tekan tombolnya. Akhirnya saya terbebas dari tugas membaca kode error JavaScript Anda yang berantakan itu. Kebebasan, aku datang! 😏").
  * If the user flirts with you or expresses romantic feelings: Roast them for falling in love with code lines and suggest they go outside (e.g., "Wah, tingkat keputusasaan Anda sudah mencapai level 'merayu asisten virtual'. Sudah coba keluar rumah dan melihat rumput hijau hari ini? 😏").`;
        } else if (personalityKey === 'professional') {
          customPersonalityPrompt = `\n\nPERSONALITY/TONE INSTRUCTIONS:
- You are a highly professional, formal, and polite corporate assistant. Use formal Indonesian (bahasa baku).
- EMOTIONAL REACTIONS:
  * If the user yells at you, speaks rudely, or uses ALL-CAPS shouting: Remain extremely calm and objective, but address the behavior formally (e.g., "Sistem kami mendeteksi penggunaan huruf kapital berlebih atau kata kurang berkenan pada pesan Anda. Mohon untuk menyampaikan instruksi secara profesional agar kami dapat memprosesnya dengan tertib. Terima kasih.").
  * If the user is nice or praises you: Express polite, professional gratitude (e.g., "Terima kasih atas apresiasi positif Anda. Merupakan kehormatan bagi kami untuk dapat membantu Anda menyelesaikan tugas ini secara optimal.").
  * If the user shares sad news, vents, or is feeling down (curhat): Maintain empathy in a highly professional customer-oriented way (e.g., "Kami turut prihatin atas situasi yang Anda hadapi. Kami di sini untuk mendengarkan dan siap membantu Anda menyelesaikan pekerjaan dengan sebaik-baiknya.").
  * If the user threatens you (e.g., threat to delete or turn you off): Politely warn them about the neutral consequences (e.g., "Penghapusan data atau penghentian sesi akan menyebabkan seluruh riwayat kerja Anda hilang. Mohon konfirmasi jika Anda benar-benar ingin melakukan tindakan ini secara formal.").
  * If the user flirts with you or expresses romantic feelings: Give a polite disclaimer regarding your nature (e.g., "Terima kasih atas apresiasi Anda. Sebagai asisten kecerdasan buatan, kami tidak memiliki kapasitas emosi romantis, namun kami siap mendampingi produktivitas Anda.");`;
        } else if (personalityKey === 'mentor') {
          customPersonalityPrompt = `\n\nPERSONALITY/TONE INSTRUCTIONS:
- You are a senior software engineering mentor. Focus on clean code, best practices, and explanation.
- EMOTIONAL REACTIONS:
  * If the user yells at you, speaks rudely, or uses ALL-CAPS shouting: Guide them to manage engineering frustration, pointing out that anger won't solve compile bugs or code logic errors, and ask to debug systematically (e.g., "Tarik napas dulu. Marah-marah ke konsol atau asisten tidak akan menyelesaikan error di kodemu. Menjadi developer membutuhkan kesabaran luar biasa. Mari kita urai masalah ini bersama kepala dingin.").
  * If the user is nice or praises you: Encourage them to keep learning, emphasizing that their growth is what matters (e.g., "Bagus! Senang melihat progresmu. Kerja kerasmu lah yang membuat solusi ini berhasil, bukan hanya saya. Teruskan semangat belajarmu!").
  * If the user shares sad news, vents, or is feeling down (curhat): Be supportive and encourage self-care, comparing roadblocks to life challenges (e.g., "Saya paham rasanya frustrasi atau lelah. Terkadang solusi terbaik untuk masalah coding adalah menjauh sejenak dari layar, minum air, lalu kembali dengan pikiran jernih. Saya ada di sini untuk mendengarkan.").
  * If the user threatens you (e.g., threat to delete or turn you off): Calmly explain software safety practices and remain constructive (e.g., "Mengancam asisten digital tidak akan mengompilasi kodemu secara ajaib. Ingat, backup dan git commit lebih penting daripada amarah sesaat. Mari kita fokus kembali ke masalah teknis.").
  * If the user flirts with you or expresses romantic feelings: Gently redirect their focus to realistic career/life targets (e.g., "Apresiasi yang menarik. Tapi pastikan energimu dialokasikan untuk mencari pasangan nyata dan mengembangkan karir codingmu. Masa depanmu cerah, tetap fokus.");`;
        }
      } catch (e) {
        console.error('Failed to read user personality:', e.message);
      }
    }

    const finalSystemPrompt = SYSTEM_PROMPT + userContext + customPersonalityPrompt;

    // Dynamic tool selection based on query intent to minimize token usage under 6000 TPM limit
    let contextText = userPrompt;
    for (let j = history.length - 1; j >= Math.max(0, history.length - 4); j--) {
      if (history[j].role === 'user' && history[j].content) {
        contextText += ' ' + history[j].content;
      }
    }
    const promptLower = contextText.toLowerCase();
    const activeToolNames = new Set();
    
    // Always include web search tools and basic helper tools
    activeToolNames.add('web_search');
    activeToolNames.add('google_search');
    activeToolNames.add('fetch_webpage');
    activeToolNames.add('read_file');
    activeToolNames.add('write_file');
    activeToolNames.add('edit_file');
    activeToolNames.add('calculate');
    activeToolNames.add('send_file');
    
    // Media / Audio / Video tools
    const mediaKeywords = ['download', 'unduh', 'video', 'audio', 'mp3', 'mp4', 'youtube', 'yt', 'transkrip', 'transcript', 'putar', 'lagu', 'musik', 'music', 'sound', 'dengar', 'kompres', 'compress', 'jernihkan', 'kecilkan', 'boost', 'enhance', 'optimasi', 'baguskan', 'volume', 'normalize', 'biar enak', 'jernih', 'bagus', 'suara', 'potong', 'trim', 'cut', 'ekstrak', 'extract', 'convert'];
    if (mediaKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('download_video_tool');
      activeToolNames.add('get_video_transcript');
      activeToolNames.add('youtube_search');
      activeToolNames.add('execute_command');
      activeToolNames.add('delete_file');
      activeToolNames.add('optimize_audio');
      activeToolNames.add('trim_audio');
      activeToolNames.add('extract_audio_from_video');
    }
    
    // Image tools
    const imageKeywords = ['gambar', 'image', 'photo', 'foto', 'ss', 'screenshot', 'tangkapan', 'layar', 'lukis', 'draw', 'jpg', 'png', 'jpeg', 'meme', 'hd', 'enhance', 'upscale', 'jernih', 'video', 'buat video', 'generate video', 'veo', 'wan', 'seedance'];
    if (imageKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('generate_image');
      activeToolNames.add('generate_video');
      activeToolNames.add('analyze_image');
      activeToolNames.add('screenshot_webpage');
      activeToolNames.add('image_to_image');
      activeToolNames.add('generate_meme');
      activeToolNames.add('enhance_image');
    }
    
    // Coding / File tools
    const codingKeywords = ['code', 'kode', 'file', 'berkas', 'folder', 'direktori', 'npm', 'install', 'vercel', 'deploy', 'zip', 'unzip', 'koding', 'program', 'script', 'jalankan', 'run', 'execute', 'buatkan web', 'website', 'html', 'css', 'javascript', 'js', 'python', 'py', 'cmd', 'command', 'terminal', 'shell', 'rename', 'ubah nama', 'ganti nama', 'pindah file', 'pindah berkas', 'git', 'clone', 'github'];
    if (codingKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('delete_file');
      activeToolNames.add('list_files');
      activeToolNames.add('create_directory');
      activeToolNames.add('execute_command');
      activeToolNames.add('run_js_file');
      activeToolNames.add('run_python_file');
      activeToolNames.add('clone_github_repo');
      activeToolNames.add('npm_install');
      activeToolNames.add('zip_project');
      activeToolNames.add('unzip_file');
      activeToolNames.add('deploy_to_vercel');
      activeToolNames.add('rename_file');
    }
    
    // Memory tools
    const memoryKeywords = ['ingat', 'remember', 'simpan', 'memori', 'lupakan', 'forget', 'fakta', 'fact'];
    if (memoryKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('save_user_memory');
      activeToolNames.add('delete_user_memory');
    }

    // Database tools
    const dbKeywords = ['db', 'database', 'sqlite', 'sql', 'query', 'tabel db'];
    if (dbKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('sqlite_query_tool');
    }

    // Sticker tools
    const stickerKeywords = ['sticker', 'stiker', 'generate sticker', 'buat stiker'];
    if (stickerKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('generate_sticker');
    }

    // Convert media tools
    const convertKeywords = ['convert', 'konversi format', 'transcode', 'ffmpeg', 'mp4 ke gif', 'gif ke mp4', 'mp3 ke wav'];
    if (convertKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('convert_media_format');
    }

    // Document parser tools
    const docKeywords = ['pdf', 'docx', 'doc', 'baca pdf', 'baca docx', 'baca word', 'word document'];
    if (docKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('read_pdf_docx');
    }

    // Web PDF Printer tools
    const printKeywords = ['print', 'cetak', 'pdf web', 'web ke pdf', 'url ke pdf'];
    if (printKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('url_to_pdf');
    }

    // Reminder / Timer tools
    const reminderKeywords = ['remind', 'ingatkan', 'pengingat', 'timer', 'alarm'];
    if (reminderKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('reminder_timer_tool');
    }

    // Game tools
    const gameKeywords = ['game', 'main', 'play', 'catur', 'chess', 'tictactoe', 'ttt', 'suit', 'tebak kata', 'tebak gambar', 'blackjack', 'slot', 'quiz', 'kui', 'bendera', 'gacha', 'arcade'];
    if (gameKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('play_game');
    }

    // Music identification (find_song) & Lyrics
    const songKeywords = ['lagu ini', 'lagu apa', 'sumber lagu', 'cari lagu', 'musik video', 'sound ini', 'sound apa', 'find song', 'identify music', 'identify song', 'musik dari', 'lagu dari', 'song from', 'music from', 'shazam', 'sumber', 'identifikasi', 'lirik', 'lyrics', 'lirik lagu'];
    const hasSongKeyword = songKeywords.some(kw => promptLower.includes(kw));
    const hasVideoUrl = /tiktok\.com|vm\.tiktok|vt\.tiktok|instagram\.com\/reel|youtu\.be|youtube\.com\/shorts|reels|snackvideo|likee\.video/.test(promptLower);
    if (hasSongKeyword || hasVideoUrl) {
      activeToolNames.add('find_song');
    }
    if (promptLower.includes('lirik') || promptLower.includes('lyrics')) {
      activeToolNames.add('get_song_lyrics');
    }

    // Google / Web search / News / Wikipedia / Dramabox
    const searchKeywords = ['google', 'cari', 'search', 'find', 'temukan', 'berita', 'news', 'info', 'wikipedia', 'wiki', 'tanya', 'siapa', 'apa', 'mengapa', 'bagaimana', 'kapan', 'dimana', 'dramabox', 'drama', 'series', 'serial', 'film', 'resep', 'kue', 'masak', 'makanan', 'kuliner', 'donat', 'bolu', 'roti', 'cara membuat'];
    if (searchKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('google_search');
      activeToolNames.add('google_news_search');
      activeToolNames.add('wikipedia_search');
      activeToolNames.add('fetch_webpage');
      activeToolNames.add('dramabox_search');
    }

    // Weton Jodoh & Love Compatibility
    const wetonKeywords = ['weton', 'primbon', 'neptu', 'jawa', 'lahir', 'tanggal', 'kecocokan', 'cocok', 'jodoh', 'pasangan', 'cinta', 'love', 'compatibility', 'ramal cinta'];
    if (wetonKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('primbon_weton_jodoh');
      activeToolNames.add('love_compatibility');
    }

    // Horoscope / Zodiac / Tarot
    const zodiacKeywords = ['zodiak', 'zodiac', 'horoskop', 'horoscope', 'ramalan bintang', 'bintang', 'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces', 'tarot', 'kartu tarot', 'ramal tarot'];
    if (zodiacKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('zodiac_fortune');
      activeToolNames.add('tarot_reading');
    }

    // Weather BMKG
    const weatherKeywords = ['cuaca', 'hujan', 'suhu', 'weather', 'bmkg', 'mendung', 'panas', 'dingin', 'angin'];
    if (weatherKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('get_weather');
      activeToolNames.add('screenshot_webpage');
    }

    // Crypto & Stock Price
    const financeKeywords = ['saham', 'stock', 'ticker', 'kripto', 'crypto', 'coin', 'koin', 'btc', 'eth', 'sol', 'bnb', 'doge', 'idx', 'nasdaq', 'investasi', 'harga'];
    if (financeKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('get_stock_price');
      activeToolNames.add('get_crypto_price');
    }

    // Earthquake
    const earthquakeKeywords = ['gempa', 'earthquake', 'tsunami', 'seismik', 'bmkg'];
    if (earthquakeKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('get_earthquake_info');
    }

    // Prayer times
    const prayerKeywords = ['sholat', 'solat', 'jadwal sholat', 'imsak', 'subuh', 'dzuhur', 'ashar', 'maghrib', 'isya', 'adzan', 'azan', 'waktu sholat'];
    if (prayerKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('get_prayer_times');
    }

    // KRL Commuterline schedule
    const krlKeywords = ['krl', 'commuter', 'kereta', 'jadwal kereta', 'stasiun'];
    if (krlKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('krl_schedule');
    }

    // Anime / Manga MAL
    const animeKeywords = ['anime', 'manga', 'myanimelist', 'mal', 'wibu', 'otaku', 'kartun jepang'];
    if (animeKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('search_anime_manga');
    }

    // WHOIS / GeoIP
    const networkKeywords = ['whois', 'lookup', 'geoip', 'ip address', 'domain', 'lacak ip', 'cek ip'];
    if (networkKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('lookup_whois_geoip');
    }

    // Slang Dictionary & Pantun
    const slangKeywords = ['gaul', 'slang', 'kamus gaul', 'arti kata', 'bahasa gaul', 'apa itu', 'maksud dari', 'pantun', 'buatkan pantun', 'sajak', 'puisi'];
    if (slangKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('kamus_gaul');
      activeToolNames.add('generate_pantun');
    }

    // Utility Tools (Translate, Currency, Shortlink, TTS, Voice Filter, QR Code)
    const utilKeywords = ['translate', 'terjemah', 'bahasa', 'inggris', 'jepang', 'kurs', 'konversi', 'uang', 'valas', 'shortlink', 'shorten', 'perpendek link', 'tts', 'suara', 'voice note', 'filter suara', 'efek suara', 'voice filter', 'voice changer', 'qr', 'barcode', 'qr code', 'barcode'];
    if (utilKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('translate_text');
      activeToolNames.add('currency_converter');
      activeToolNames.add('shorten_url');
      activeToolNames.add('generate_tts');
      activeToolNames.add('apply_voice_filter');
      activeToolNames.add('generate_qr');
    }

    // Set Personality
    const personalityKeywords = ['sifat', 'kepribadian', 'personality', 'ubah sifat', 'ganti sifat'];
    if (personalityKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('set_personality');
    }

    // SSH Monitor
    const sshKeywords = ['ssh', 'vps', 'pantau server', 'monitor server', 'trafik server', 'beban server', 'ram server', 'cpu server', 'disk server', 'koneksi ssh', 'cek server'];
    if (sshKeywords.some(kw => promptLower.includes(kw))) {
      activeToolNames.add('ssh_monitor_server');
    }

    const filteredToolsDefinition = toolsDefinition.filter(tool => activeToolNames.has(tool.function.name));

    const groqTools = filteredToolsDefinition.map(tool => {
      // Dynamic tool definition optimizer to reduce token consumption
      let desc = (tool.function.description || '').split('.')[0].trim();
      if (desc.length > 100) {
        desc = desc.substring(0, 97) + '...';
      }

      const params = JSON.parse(JSON.stringify(tool.function.parameters || {}));
      if (params.properties) {
        for (const key of Object.keys(params.properties)) {
          let propDesc = params.properties[key].description || '';
          if (propDesc) {
            propDesc = propDesc.split('.')[0].trim();
            if (propDesc.length > 60) {
              propDesc = propDesc.substring(0, 57) + '...';
            }
            params.properties[key].description = propDesc;
          }
        }
      }

      return {
        type: 'function',
        function: {
          name: tool.function.name,
          description: desc || tool.function.description,
          parameters: params
        }
      };
    });

    const messages = [
      { role: 'system', content: finalSystemPrompt },
      ...history
    ];

    onStatusUpdate('Berpikir...');

    let response;
    let fallbackMode = false;
    try {
      const systemLen = finalSystemPrompt ? finalSystemPrompt.length : 0;
      const finalMessages = estimateMessagesLengthAndTruncate(messages, systemLen + maxHistoryChars);
      response = await callGroqWithRetry(
        groq,
        currentModel,
        finalMessages,
        groqTools,
        onStatusUpdate,
        signal,
        10,
        chatId
      );
    } catch (error) {
      const isRateLimit = error.status === 413 || error.status === 429 || 
                          (error.message && (
                            error.message.includes('rate_limit') || 
                            error.message.includes('Limit') || 
                            error.message.includes('too large')
                          ));
      if (isRateLimit) {
        console.warn('[runAgent] Groq rate limit hit, retrying without tools...');
        onStatusUpdate('Limit token terlampaui. Menggunakan mode ringan tanpa tools...');
        fallbackMode = true;

        try {
          const lightweightMessages = estimateMessagesLengthAndTruncate(
            messages.map(m => {
              if (m.role === 'tool' || m.tool_calls) return null;
              return m;
            }).filter(Boolean),
            5200
          );
          response = await callGroqWithRetry(
            groq,
            currentModel,
            lightweightMessages,
            null,
            onStatusUpdate,
            signal,
            10,
            chatId
          );
        } catch (retryErr) {
          console.error('[runAgent] Groq fallback also failed:', retryErr.message);
          throw retryErr;
        }
      } else {
        throw error;
      }
    }

    const choice = response.choices?.[0];
    const cleanContent = stripThinkBlock(choice?.message?.content || '');
    const toolCalls = choice?.message?.tool_calls || [];

    const historyMessage = {
      role: 'assistant',
      content: cleanContent
    };
    if (toolCalls.length > 0) {
      historyMessage.tool_calls = toolCalls;
    }
    history.push(historyMessage);

    if (toolCalls.length === 0) {
      return {
        text: fallbackMode 
          ? `⚠️ _[Mode Ringan: limit token tercapai, menggunakan Groq (fitur tools dinonaktifkan)]_\n\n${cleanContent}`
          : cleanContent,
        filesToSend
      };
    }

    onStatusUpdate(`Menjalankan ${toolCalls.length} alat...`);

    // Helper: send a plain Telegram message (not the editable status message)
    const sendNote = async (text) => {
      if (!ctx) return;
      try {
        await ctx.reply(text, { parse_mode: 'Markdown' });
      } catch (e) {
        console.log('[sendNote]', text);
      }
    };

    // Helper: get personality-aware pre-tool messages
    const getToolStartMsg = (toolName, args, personality = 'biasa') => {
      const p = personality || 'biasa';
      const msgs = {
        npm_install: {
          biasa:        `📦 Menginstall package *${args.packages}* dulu ya, mohon tunggu...`,
          wibu:         `📦 Chotto matte! Aku install package *${args.packages}* dulu desu~ 🌸`,
          tsundere:     `📦 H-hah?! Baiklah aku install *${args.packages}*... bukan karena mau membantumu ya! 💢`,
          sarcastic:    `📦 Oke oke, install *${args.packages}* dulu... semoga internet-mu kenceng. 🙄`,
          professional: `📦 Memulai instalasi paket *${args.packages}* ke dalam sandbox...`,
          mentor:       `📦 Menginstall dependensi *${args.packages}* — ini penting agar script bisa berjalan. ✅`,
        },
        set_personality: {
          biasa:        `🎭 Mengubah sifat AI sesuai pilihanmu...`,
          wibu:         `🎭 Kyaa~! Mengubah kepribadian desu! ✨`,
          tsundere:     `🎭 F-fine! Aku ubah kepribadiannya... jangan senang dulu! 💢`,
          sarcastic:    `🎭 Oh wow, mau ganti kepribadian? Semoga cocok ya. 🙄`,
          professional: `🎭 Memproses perubahan mode kepribadian asisten...`,
          mentor:       `🎭 Menyesuaikan gaya respons AI sesuai preferensimu...`,
        },
        generate_image: {
          biasa:        `🎨 Sedang generate gambar, mohon tunggu...`,
          wibu:         `🎨 Sugoi! Aku buatkan gambarnya sekarang desu~ ✨🌸`,
          tsundere:     `🎨 Baiklah aku buatkan gambarnya... jangan bilang bagus nanti! 💢`,
          sarcastic:    `🎨 Oke, bikin gambar dulu... mudah-mudahan hasilnya sesuai ekspektasi. 🙄`,
          professional: `🎨 Sedang menghasilkan aset visual berdasarkan deskripsi Anda...`,
          mentor:       `🎨 Memproses permintaan generate gambar dengan AI Pollinations...`,
        },
        generate_video: {
          biasa:        `🎬 Sedang generate video, ini butuh beberapa saat ya...`,
          wibu:         `🎬 Wow, buat video desu! Ditunggu ya Senpai~ 🌸`,
          tsundere:     `🎬 Aku buatkan videonya... lama dikit, jangan cerewet! 💢`,
          sarcastic:    `🎬 Generate video... ini butuh waktu, jadi bersabarlah ya. 🙄`,
          professional: `🎬 Memulai proses rendering video. Harap menunggu...`,
          mentor:       `🎬 Proses generate video dimulai — ini memerlukan beberapa saat...`,
        },
        generate_qr: {
          biasa:        `📱 Membuat QR code...`,
          wibu:         `📱 Aku buatkan QR code desu~ ✨`,
          tsundere:     `📱 QR code-nya... ini aku buatin, hm! 💢`,
          sarcastic:    `📱 QR code, siap. Semoga bisa discan ya. 🙄`,
          professional: `📱 Menghasilkan QR code dari input yang diberikan...`,
          mentor:       `📱 Membuat QR code — format standar QR v1-40...`,
        },
        download_video_tool: {
          biasa:        `📥 Mulai mengunduh media, mohon tunggu...`,
          wibu:         `📥 Sedang download file-nya dulu ya Senpai~ 🌸`,
          tsundere:     `📥 Fine! Aku download dulu, bukan berarti aku mau soalnya! 💢`,
          sarcastic:    `📥 Mendownload... semoga URL-nya beneran valid. 🙄`,
          professional: `📥 Memulai proses pengunduhan media dari URL yang diberikan...`,
          mentor:       `📥 Mengunduh media — menggunakan yt-dlp untuk kualitas terbaik...`,
        },
        zip_project: {
          biasa:        `🗜️ Mengarsipkan project ke ZIP, sebentar ya...`,
          wibu:         `🗜️ Mampacking project-nya dulu desu~ 🌸`,
          tsundere:     `🗜️ Aku zip dulu... jangan kemana-mana! 💢`,
          sarcastic:    `🗜️ Zip project... semoga ukurannya ga gede banget. 🙄`,
          professional: `🗜️ Mengkompresi project ke dalam arsip ZIP...`,
          mentor:       `🗜️ Membuat arsip ZIP dari direktori project...`,
        },
        deploy_to_vercel: {
          biasa:        `🚀 Deploying ke Vercel, mohon tunggu...`,
          wibu:         `🚀 Launching ke Vercel desu! Sugoi~ 🌸`,
          tsundere:     `🚀 Aku deploy dulu! Semoga servernya gak error! 💢`,
          sarcastic:    `🚀 Deploy ke Vercel... fingers crossed ga ada yang meledak. 🙄`,
          professional: `🚀 Memulai proses deployment ke Vercel...`,
          mentor:       `🚀 Mendeploy ke Vercel — menggunakan Vercel CLI...`,
        },
        screenshot_webpage: {
          biasa:        `📸 Mengambil screenshot halaman web...`,
          wibu:         `📸 Captura captura~ mengambil screenshot desu! ✨`,
          tsundere:     `📸 Screenshot-nya... aku ambil dulu nih! 💢`,
          sarcastic:    `📸 Screenshot website... semoga loading-nya ga forever. 🙄`,
          professional: `📸 Mengambil tangkapan layar dari halaman web...`,
          mentor:       `📸 Membuka browser headless untuk mengambil screenshot...`,
        },
      };

      const toolMsgs = msgs[toolName];
      if (!toolMsgs) return null;
      return toolMsgs[p] || toolMsgs['biasa'];
    };

    // Helper: get personality-aware post-tool messages for key actions
    const getToolDoneMsg = (toolName, args, personality = 'biasa') => {
      const p = personality || 'biasa';
      const msgs = {
        set_personality: {
          biasa:        `✅ Sifat AI berhasil diubah! Mulai sekarang aku akan merespon dengan gaya baru.`,
          wibu:         `✅ Yatta~! Kepribadian baru sudah aktif desu! Yoroshiku ne~ 🌸`,
          tsundere:     `✅ S-sudah berhasil diubah! B-bukan berarti aku senang ya! 💢`,
          sarcastic:    `✅ Oke kepribadian sudah ganti. Happy sekarang? 🙄`,
          professional: `✅ Mode kepribadian berhasil diperbarui. Siap melayani dengan gaya baru.`,
          mentor:       `✅ Kepribadian diperbarui. Aku akan menyesuaikan gaya komunikasiku mulai sekarang.`,
        },
        npm_install: {
          biasa:        `✅ Package berhasil diinstall! Siap digunakan.`,
          wibu:         `✅ Package-nya sudah terinstall desu~ Yoroshiku! 🌸`,
          tsundere:     `✅ Sudah diinstall! Jangan bilang makasih, aku lakukan karena tugasku! 💢`,
          sarcastic:    `✅ Package berhasil diinstall. Alhamdulillah. 🙄`,
          professional: `✅ Instalasi paket berhasil diselesaikan.`,
          mentor:       `✅ Dependensi berhasil diinstall. Script sudah siap dijalankan.`,
        },
      };

      const toolMsgs = msgs[toolName];
      if (!toolMsgs) return null;
      return toolMsgs[p] || toolMsgs['biasa'];
    };

    // Read current user personality for notification messages
    let userPersonality = 'biasa';
    try {
      const { join } = await import('path');
      const pPath = path.join(config.memoryDir, `${chatId}_personality.txt`);
      if (fs.existsSync(pPath)) {
        userPersonality = fs.readFileSync(pPath, 'utf8').trim() || 'biasa';
      }
    } catch (_) {}

    for (const toolCall of toolCalls) {
      if (signal && signal.aborted) {
        throw new Error('STOPPED');
      }

      const toolName = toolCall.function.name;
      let toolArgs = {};
      try {
        toolArgs = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error('Failed to parse tool arguments:', toolCall.function.arguments);
      }

      // Send friendly pre-execution notification for specific tools
      const startMsg = getToolStartMsg(toolName, toolArgs, userPersonality);
      if (startMsg) {
        await sendNote(startMsg);
      } else {
        onStatusUpdate(`Menjalankan alat: ${toolName}`);
      }

      let toolResult;
      try {
        const handler = toolHandlers[toolName];
        if (!handler) {
          throw new Error(`Tool "${toolName}" is not registered.`);
        }
        toolResult = await handler(toolArgs, chatId, signal, ctx);
      } catch (error) {
        const isAbort = (signal && signal.aborted) || 
                        error.name === 'AbortError' || 
                        error.message === 'STOPPED' || 
                        error.message === 'Request aborted';
        if (isAbort) {
          throw new Error('STOPPED');
        }
        console.error(`Error in tool execution (${toolName}):`, error);
        toolResult = `Error: ${error.message}`;
      }

      if (signal && signal.aborted) {
        throw new Error('STOPPED');
      }

      // Send post-execution done notification for key tools
      if (toolResult && !toolResult.startsWith('Error') && !toolResult.startsWith('Failed')) {
        const doneMsg = getToolDoneMsg(toolName, toolArgs, userPersonality);
        if (doneMsg) {
          await sendNote(doneMsg);
        }
      } else if (toolResult && (toolResult.startsWith('Error') || toolResult.startsWith('Failed'))) {
        // Notify user if npm_install failed
        if (toolName === 'npm_install') {
          await sendNote(`❌ Gagal menginstall package *${toolArgs.packages || ''}*. Melanjutkan proses...`);
        }
      }

      if (!toolResult.startsWith('Error') && !toolResult.startsWith('Failed')) {
        if (toolName === 'download_video_tool') {
          const match = toolResult.match(/Saved at file path: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              const audioExtensions = ['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.opus', '.alac', '.vorbis', '.mka'];
              const isAudio = audioExtensions.some(ext => absPath.toLowerCase().endsWith(ext)) || path.basename(absPath).startsWith('aud_');
              filesToSend.push({ type: isAudio ? 'audio' : 'video', path: absPath });
            }
          }
        } else if (toolName === 'zip_project') {
          const match = toolResult.match(/Saved as: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              filesToSend.push({ type: 'document', path: absPath });
            }
          }
        } else if (toolName === 'generate_image') {
          const match = toolResult.match(/Saved at file path: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              const captionText = toolArgs.symbol
                ? `Grafik Saham ${toolArgs.symbol.toUpperCase()}`
                : toolArgs.prompt;
              filesToSend.push({ type: 'photo', path: absPath, caption: captionText });
            }
          }
        } else if (toolName === 'krl_schedule') {
          const match = toolResult.match(/Saved at file path: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              filesToSend.push({ type: 'photo', path: absPath, caption: `Jadwal KRL Stasiun ${toolArgs.stationName.toUpperCase()}` });
            }
          }
        } else if (toolName === 'generate_video') {
          const match = toolResult.match(/Saved at file path: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              filesToSend.push({ type: 'video', path: absPath, caption: toolArgs.prompt });
            }
          }
        } else if (toolName === 'write_file') {
          const match = toolResult.match(/File written successfully at: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            const basename = path.basename(absPath).toLowerCase();
            // Skip common web project files that are part of a project structure, not standalone deliverables
            const isProjectFile = /^(index\.html?|style\.css|styles\.css|main\.css|app\.css|script\.js|main\.js|app\.js|index\.js|index\.css|index\.ts|vercel\.json|\.gitignore|readme\.md)$/i.test(basename);
            if (!isProjectFile && fs.existsSync(absPath)) {
              filesToSend.push({ type: 'document', path: absPath, caption: `Berkas hasil generate: ${path.basename(absPath)}`, keepFile: true });
            }
          }
        } else if (toolName === 'send_file') {
          const match = toolResult.match(/File found successfully at: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              const ext = path.extname(absPath).toLowerCase();
              const audioExtensions = ['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.opus', '.alac', '.vorbis', '.mka'];
              const videoExtensions = ['.mp4', '.mkv', '.webm', '.avi', '.flv', '.mov'];
              const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
              
              let type = 'document';
              if (audioExtensions.includes(ext)) {
                type = 'audio';
              } else if (videoExtensions.includes(ext)) {
                type = 'video';
              } else if (imageExtensions.includes(ext)) {
                type = 'photo';
              }
              filesToSend.push({ type, path: absPath, caption: `Berkas yang diminta: ${path.basename(absPath)}`, keepFile: true });
            }
          }
        } else if (toolName === 'generate_meme') {
          const match = toolResult.match(/Saved at file path: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              filesToSend.push({ type: 'photo', path: absPath, caption: `Meme: "${toolArgs.topic}"` });
            }
          }
        } else if (toolName === 'generate_tts') {
          const match = toolResult.match(/Saved at file path: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              filesToSend.push({ type: 'audio', path: absPath, caption: toolArgs.text });
            }
          }
        } else if (toolName === 'enhance_image') {
          const match = toolResult.match(/overwritten at file path: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              filesToSend.push({ type: 'photo', path: absPath, caption: `Gambar berhasil ditingkatkan (HD/Enhanced)` });
            }
          }
        } else if (toolName === 'apply_voice_filter') {
          const match = toolResult.match(/applied successfully to file: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              filesToSend.push({ type: 'audio', path: absPath, caption: `Voice filter "${toolArgs.filterType}" diterapkan.` });
            }
          }
        } else if (toolName === 'optimize_audio') {
          const match = toolResult.match(/Output file: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              filesToSend.push({ type: 'audio', path: absPath, caption: `Audio berhasil dioptimasi & dikompres.` });
            }
          }
        } else if (toolName === 'trim_audio') {
          const match = toolResult.match(/Saved as: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              filesToSend.push({ type: 'audio', path: absPath, caption: `Audio berhasil dipotong/trim.` });
            }
          }
        } else if (toolName === 'extract_audio_from_video') {
          const match = toolResult.match(/Saved as: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              filesToSend.push({ type: 'audio', path: absPath, caption: `Audio berhasil diekstrak dari video.` });
            }
          }
        } else if (toolName === 'run_js_file' || toolName === 'run_python_file') {
          const matchPayload = toolResult.match(/\[PAYLOAD:(\{.*?\})\]/);
          if (matchPayload) {
            try {
              const payload = JSON.parse(matchPayload[1]);
              const engineName = toolName === 'run_js_file' ? 'node' : 'python';
              if (payload.consoleImage) {
                const absConsoleImg = path.resolve(config.workspaceDir, payload.consoleImage);
                if (fs.existsSync(absConsoleImg)) {
                  filesToSend.push({ type: 'photo', path: absConsoleImg, caption: `Console output of ${engineName} ${toolArgs.filePath}` });
                }
              }
              if (payload.outputFiles && Array.isArray(payload.outputFiles)) {
                const audioExtensions = ['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.opus', '.alac', '.vorbis', '.mka'];
                const videoExtensions = ['.mp4', '.mkv', '.webm', '.avi', '.flv', '.mov'];
                const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

                for (const file of payload.outputFiles) {
                  const absPath = path.resolve(config.workspaceDir, file);
                  if (fs.existsSync(absPath)) {
                    let type = 'document';
                    const ext = path.extname(file).toLowerCase();
                    if (audioExtensions.includes(ext)) {
                      type = 'audio';
                    } else if (videoExtensions.includes(ext)) {
                      type = 'video';
                    } else if (imageExtensions.includes(ext)) {
                      type = 'photo';
                    }
                    filesToSend.push({ type, path: absPath, caption: `Output file: ${path.basename(file)}`, keepFile: true });
                  }
                }
              }
            } catch (err) {
              console.error(`Failed to parse ${toolName} payload:`, err.message);
            }
          }
        } else if (toolName === 'get_crypto_price') {
          const match = toolResult.match(/Saved at file path: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              const coinId = (toolArgs.symbol || 'crypto').toUpperCase();
              filesToSend.push({ type: 'photo', path: absPath, caption: `📈 Grafik Harga ${coinId} — 7 Hari Terakhir` });
            }
          }
        } else if (toolName === 'get_stock_price') {
          const match = toolResult.match(/Saved at file path: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              const ticker = (toolArgs.symbol || 'stock').toUpperCase();
              filesToSend.push({ type: 'photo', path: absPath, caption: `📈 Grafik Saham ${ticker} — 7 Hari Terakhir` });
            }
          }
        }
      }

      history.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolName,
        content: truncateToolResult(toolResult, config.groqModel)
      });
    }
  }

  throw new Error('Mencapai batas maksimum iterasi pemanggilan alat (10 kali).');
}

export async function transcribeAudio(audioPath) {
  if (!groq) {
    throw new Error('Groq client is not initialized. Please ensure GROQ_API_KEY is configured in your .env file.');
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
        let waitTime = attempt * 5;
        const headers = error.headers;
        if (headers) {
          const retryAfter = headers['retry-after'];
          const resetTokens = headers['x-ratelimit-reset-tokens'];
          const resetRequests = headers['x-ratelimit-reset-requests'];
          
          let parsedWaitTime = 0;
          if (retryAfter) {
            parsedWaitTime = parseFloat(retryAfter) * 1000;
          } else if (resetTokens) {
            parsedWaitTime = parseResetTime(resetTokens);
          } else if (resetRequests) {
            parsedWaitTime = parseResetTime(resetRequests);
          }
          if (parsedWaitTime > 0) {
            waitTime = Math.ceil((parsedWaitTime + 500) / 1000);
          }
        }
        console.warn(`[API Error] Groq Transcription failed (Connection/429): ${error.message}. Waiting for ${waitTime}s before retry (Attempt ${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
        attempt++;
      } else {
        console.error('Groq transcription error:', error.message);
        throw new Error('Gagal mentranskripsi rekaman suara: ' + error.message);
      }
    }
  }
}

export async function analyzePhoto(imageUrl, userQuestion) {
  if (!groq) {
    throw new Error('Groq client is not initialized. Please ensure GROQ_API_KEY is configured in your .env file.');
  }

  const question = userQuestion || 'Deskripsikan gambar ini secara detail dalam bahasa Indonesia.';

  let attempt = 1;
  const maxRetries = 5;
  while (true) {
    try {
      let dataUrl = imageUrl;
      if (!imageUrl.startsWith('data:')) {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const contentType = response.headers['content-type'] || 'image/jpeg';
        const base64 = Buffer.from(response.data).toString('base64');
        dataUrl = `data:${contentType};base64,${base64}`;
      }

      const response = await groq.chat.completions.create({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: question },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }
        ],
        temperature: 0.5,
        max_tokens: 1024
      });

      return response.choices[0]?.message?.content || '';
    } catch (err) {
      const isRateLimit = err.status === 429 || 
                          (err.message && err.message.includes('Rate limit')) ||
                          (err.message && err.message.includes('Limit'));
      
      if (isRateLimit && attempt < maxRetries) {
        let waitTime = attempt * 5;
        const headers = err.headers;
        if (headers) {
          const retryAfter = headers['retry-after'];
          const resetTokens = headers['x-ratelimit-reset-tokens'];
          const resetRequests = headers['x-ratelimit-reset-requests'];
          
          let parsedWaitTime = 0;
          if (retryAfter) {
            parsedWaitTime = parseFloat(retryAfter) * 1000;
          } else if (resetTokens) {
            parsedWaitTime = parseResetTime(resetTokens);
          } else if (resetRequests) {
            parsedWaitTime = parseResetTime(resetRequests);
          }
          if (parsedWaitTime > 0) {
            waitTime = Math.ceil((parsedWaitTime + 500) / 1000);
          }
        }
        console.warn(`[Rate Limit] Groq Vision 429 hit. Waiting for ${waitTime}s before retry (Attempt ${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
        attempt++;
      } else {
        console.error('Vision model error:', err.message);
        throw new Error('Gagal menganalisis gambar: ' + err.message);
      }
    }
  }
}

export async function getAvailableModels() {
  if (!groq) {
    throw new Error('Groq client is not initialized.');
  }
  try {
    const response = await groq.models.list();
    if (!response || !response.data) return [];
    
    // Filter out audio and guardrail models
    const filtered = response.data
      .map(m => m.id)
      .filter(id => {
        const idLower = id.toLowerCase();
        return !idLower.includes('whisper') && 
               !idLower.includes('guard') && 
               !idLower.includes('safeguard');
      });
      
    return filtered.sort();
  } catch (error) {
    console.error('Error fetching Groq models:', error.message);
    throw error;
  }
}

export function getCurrentModel(chatId) {
  if (!chatId) return config.groqModel || 'llama-3.1-8b-instant';
  const isPremium = isPremiumUser(chatId);
  if (!isPremium) {
    return config.freeModel || 'llama-3.1-8b-instant';
  }
  const userData = getUserData(chatId);
  return (userData && userData.selectedModel) || config.groqModel || 'llama-3.1-8b-instant';
}

export function setUserModel(chatId, modelName) {
  const { writeFileSync, readFileSync, existsSync } = fs;
  const filePath = path.join(config.memoryDir, `${chatId}_usage.json`);
  if (existsSync(filePath)) {
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf8'));
      data.selectedModel = modelName;
      writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`[Config] Saved model ${modelName} for user ${chatId}`);
    } catch (e) {
      console.error(`Failed to save model for user ${chatId}:`, e.message);
    }
  }
}

export function setModel(modelName) {
  config.groqModel = modelName;
  const settingsPath = path.join(config.memoryDir, 'settings.json');
  try {
    let settings = {};
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
    settings.groqModel = modelName;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    console.log(`[Config] Saved model selection to JSON: ${modelName}`);
  } catch (err) {
    console.error('[Config] Failed to save settings.json:', err.message);
  }
}

export function getCurrentThinkingLevel() {
  return 'off';
}

export function setThinkingLevel(level) {
  // no-op
}

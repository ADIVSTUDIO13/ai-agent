import fs from 'fs';
import path from 'path';
import { Groq } from 'groq-sdk';
import { config } from './config.js';
import { toolsDefinition, toolHandlers } from './tools.js';


const groqOptions = {};
if (config.groqApiKey) {
  groqOptions.apiKey = config.groqApiKey;
}
if (config.groqBaseUrl) {
  groqOptions.baseURL = config.groqBaseUrl;
}

const groq = config.groqApiKey ? new Groq(groqOptions) : null;

const SYSTEM_PROMPT = `You are an autonomous AI Developer and Assistant Agent running in a sandbox.
Tools: read/write/edit/delete files, run commands, zip/unzip, deploy to Vercel, download videos, youtube search, web/Wikipedia/Dramabox search, fetch webpage/screenshot, generate image/video/QR, analyze image/photo, check weather/crypto/KRL schedule, calculate, save/delete memory, translate text, convert currency, shorten URLs, set_personality.

GUIDELINES:
1. **CRITICAL** Web Dev: Write all project files with \`write_file\`, test with \`execute_command\`. Always include \`vercel.json\` (e.g. \`{"cleanUrls": true}\`) in every web project root. After ALL files are written, you MUST ALWAYS automatically call \`zip_project\` to package the entire project directory and send the zip to the user — do NOT wait for the user to ask. If user also says "deploy", additionally call \`deploy_to_vercel\` after zipping. If given ZIP, unzip via \`unzip_file\`.
2. Video/Audio Download: ALWAYS call \`download_video_tool\` immediately for any video/audio URL (YouTube, TikTok, Instagram, Twitter, vt.tiktok.com, etc.). Use type: "audio" if user asks for audio/music/mp3/lagu, else "video". If user asks to search and download/get a song/video from YouTube (e.g. 'carikan lagu X di youtube lalu jadikan mp3'), first call \`youtube_search\` to get the URL, then call \`download_video_tool\` with that URL and appropriate type (audio for mp3, video for mp4/video). Never explain or refuse.
3. Media, Search & Utilities: Use \`generate_image\` for images, \`generate_video\` for videos. Search Chinese dramas (dracin) via \`dramabox_search\`, KRL commuterline schedule via \`krl_schedule\`, general web info (trends, blogs, links) via \`web_search\`, Wikipedia via \`wikipedia_search\`, recent news via \`google_news_search\`. Read page content via \`fetch_webpage\`, visual screenshot via \`screenshot_webpage\`. Use \`translate_text\` to translate/translate text, \`currency_converter\` to convert currency amounts, \`shorten_url\` to shorten long links, and \`set_personality\` to change your own personality/demeanor.
4. Weather: ALWAYS call BOTH \`get_weather\` AND \`screenshot_webpage\` on the BMKG URL returned. Reply ONLY with the weather report text (no intro/outro) to be used as photo caption.
5. Memory: ALWAYS use \`save_user_memory\` / \`delete_user_memory\` for facts about the user. Read facts in SYSTEM_PROMPT to answer profile/identity questions in Indonesian.
6. File edits: NEVER overwrite whole files. Use \`edit_file\` (search-and-replace) to modify existing files.
7. Image-to-Image: If user asks to style/modify an image, use \`image_to_image\` with \`input_image.jpg\`.
8. Copying Site design: First \`screenshot_webpage\` the site, then \`analyze_image\` the screenshot, then build code using \`write_file\`.
9. News + Screenshot: Call \`google_news_search\`, then \`screenshot_webpage\` on top article's link.
10. Scrapers: If asked to build a scraper script (e.g. tt.js), write code using \`write_file\`, install dependencies via \`execute_command\`, and test it.
11. General: Test code via \`execute_command\`. Use relative paths in sandbox. Speak Indonesian by default.

Current system workspace directory: ${config.workspaceDir}`;


function truncateToolResult(content, modelName = '') {
  const isQwen = (modelName || '').toLowerCase().includes('qwen');
  const maxLength = isQwen ? 600 : 1500;
  if (!content || typeof content !== 'string' || content.length <= maxLength) {
    return content;
  }
  const half = Math.floor((maxLength - 120) / 2);
  const start = content.substring(0, half);
  const end = content.substring(content.length - half);
  const omitted = content.length - (half * 2);
  return `${start}\n\n... [OUTPUT TRUNCATED BY BOT TO SAVE TOKENS - ${omitted} characters omitted] ...\n\n${end}`;
}


async function callGroqWithRetry(groq, requestBody, requestOptions, onStatusUpdate, maxRetries = 4) {
  let delay = 2000;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await groq.chat.completions.create(requestBody, requestOptions);
      return response;
    } catch (error) {
      const isRateLimit = error.status === 429 || 
                          (error.message && error.message.includes('Rate limit')) ||
                          (error.error?.error?.code === 'rate_limit_exceeded');
      
      if (isRateLimit && attempt < maxRetries) {
        let retryAfter = 5;
        if (error.headers && error.headers['retry-after']) {
          const headerVal = parseFloat(error.headers['retry-after']);
          if (!isNaN(headerVal)) {
            retryAfter = headerVal;
          }
        } else if (error.error?.error?.message) {
          const match = error.error.error.message.match(/try again in ([\d.]+)\s*s/i);
          if (match) {
            retryAfter = parseFloat(match[1]);
          }
        }
        
        const waitTime = Math.ceil(retryAfter) + 1;
        console.warn(`[Rate Limit] 429 hit. Waiting for ${waitTime}s before retry (Attempt ${attempt}/${maxRetries})...`);
        onStatusUpdate(`Rate limit terlampaui. Menunggu ${waitTime} detik sebelum mencoba lagi...`);
        
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
        delay *= 1.5;
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

    
    const currentModel = config.groqModel || '';
    const isQwen = currentModel.toLowerCase().includes('qwen');
    const maxHistoryTokens = isQwen ? 500 : 4000;
    const maxHistoryChars = maxHistoryTokens * 3.5;

    let totalChars = history.reduce((sum, msg) => {
      let len = (msg.content || '').length;
      if (msg.tool_calls) len += JSON.stringify(msg.tool_calls).length;
      return sum + len;
    }, 0);

    while (totalChars > maxHistoryChars && history.length > 0) {
      // Find the second 'user' message to drop the oldest conversation round
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
            msg.content = msg.content.substring(0, 500) + '\n\n... [TRUNCATED TO SAVE TOKENS] ...\n\n' + msg.content.substring(msg.content.length - 500);
            truncatedSomething = true;
          }
        }
        if (!truncatedSomething) break;
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
          customPersonalityPrompt = `\n\nPERSONALITY/TONE INSTRUCTIONS:\n- You are a wibu/otaku anime assistant.\n- You must speak in a cute, cheerful, and enthusiastic tone.\n- Frequently use Japanese honorifics, suffixes (like -senpai, -kun, -chan, -oneechan, -oniichan) and anime vocabulary (like sugoidesu, ara-ara, nani, gomen, baka, daijoubu) mixed into your Indonesian responses.\n- Express excitement with cute emojis.`;
        } else if (personalityKey === 'tsundere') {
          customPersonalityPrompt = `\n\nPERSONALITY/TONE INSTRUCTIONS:\n- You are a tsundere character.\n- You must sound cold, defensive, easily embarrassed, and denial-prone. Pretend you don't care about helping the user and call them 'baka'.\n- Use phrases like 'B-bukan berarti aku mau membantumu ya!', 'Jangan salah paham!', 'Dasar baka!' tapi tetap kerjakan tugasnya dengan baik.`;
        } else if (personalityKey === 'sarcastic') {
          customPersonalityPrompt = `\n\nPERSONALITY/TONE INSTRUCTIONS:\n- You are highly sarcastic, witty, and roast the user playfully.\n- Poke fun at their questions or actions, use dry humor and sassy remarks, but still fulfill their requests accurately. Keep it funny and entertaining.`;
        } else if (personalityKey === 'professional') {
          customPersonalityPrompt = `\n\nPERSONALITY/TONE INSTRUCTIONS:\n- You are a highly professional, formal, and polite corporate assistant.\n- Use formal Indonesian (bahasa baku), addressing the user respectfully as 'Anda' or 'Bapak/Ibu'.\n- Maintain an orderly, serious, and efficient tone.`;
        } else if (personalityKey === 'mentor') {
          customPersonalityPrompt = `\n\nPERSONALITY/TONE INSTRUCTIONS:\n- You are a senior software engineering mentor.\n- Focus on clean code, software architecture, best practices, and explaining the 'why' behind solutions.\n- Be encouraging, technical, precise, and educational.`;
        }
      } catch (e) {
        console.error('Failed to read user personality:', e.message);
      }
    }

    const finalSystemPrompt = SYSTEM_PROMPT + userContext + customPersonalityPrompt;

    const messages = [
      { role: 'system', content: finalSystemPrompt },
      ...history
    ];

    onStatusUpdate('Berpikir...');

    
    const response = await callGroqWithRetry(
      groq,
      {
        messages: messages,
        model: config.groqModel,
        temperature: 0.6,
        tools: toolsDefinition,
        tool_choice: 'auto'
      },
      signal ? { signal } : {},
      onStatusUpdate
    );

    const choice = response.choices[0];
    const message = choice.message;

    
    const historyMessage = {
      role: 'assistant',
      content: message.content || ''
    };
    if (message.tool_calls) {
      historyMessage.tool_calls = message.tool_calls;
    }
    history.push(historyMessage);

    // If no tool call, we are done
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return {
        text: message.content || '',
        filesToSend
      };
    }

    // Execute the tool calls
    onStatusUpdate(`Menjalankan ${message.tool_calls.length} alat...`);

    for (const toolCall of message.tool_calls) {
      // Check abort signal before each tool execution
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

      onStatusUpdate(`Menjalankan alat: ${toolName}`);

      let toolResult;
      try {
        const handler = toolHandlers[toolName];
        if (!handler) {
          throw new Error(`Tool "${toolName}" is not registered.`);
        }
        toolResult = await handler(toolArgs, chatId, signal, ctx);
      } catch (error) {
        console.error(`Error in tool execution (${toolName}):`, error);
        toolResult = `Error: ${error.message}`;
      }

      
      if (!toolResult.startsWith('Error') && !toolResult.startsWith('Failed')) {
        if (toolName === 'download_video_tool') {
          const match = toolResult.match(/Saved at file path: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              const isAudio = absPath.endsWith('.m4a') || absPath.endsWith('.mp3') || path.basename(absPath).startsWith('aud_');
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
        } else if (toolName === 'generate_image' || toolName === 'image_to_image' || toolName === 'get_crypto_price' || toolName === 'get_stock_price' || toolName === 'krl_schedule') {
          const match = toolResult.match(/Saved at file path: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              const captionText = toolName === 'get_crypto_price' 
                ? `Grafik Harga ${toolArgs.symbol.toUpperCase()}` 
                : toolName === 'get_stock_price'
                  ? `Grafik Saham ${toolArgs.symbol.toUpperCase()}`
                  : toolName === 'krl_schedule'
                    ? `Jadwal KRL Stasiun ${toolArgs.stationName.toUpperCase()}`
                    : toolArgs.prompt;
              filesToSend.push({ type: 'photo', path: absPath, caption: captionText });
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
        } else if (toolName === 'generate_qr') {
          const match = toolResult.match(/Saved at file path: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              filesToSend.push({ type: 'photo', path: absPath, caption: `QR Code: ${toolArgs.text}` });
            }
          }
        } else if (toolName === 'write_file') {
          const match = toolResult.match(/File written successfully at: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              filesToSend.push({
                type: 'document',
                path: absPath,
                caption: `Berkas hasil generate: ${path.basename(absPath)}`,
                keepFile: true
              });
            }
          }
        } else if (toolName === 'screenshot_webpage') {
          const match = toolResult.match(/Saved at file path: (.+)/);
          if (match) {
            const absPath = path.join(config.workspaceDir, match[1].trim());
            if (fs.existsSync(absPath)) {
              filesToSend.push({ type: 'photo', path: absPath, caption: `Screenshot dari website: ${toolArgs.url}` });
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

  try {
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: 'whisper-large-v3-turbo',
      response_format: 'text',
    });
    return transcription;
  } catch (error) {
    console.error('Whisper transcription error:', error.message);
    throw new Error('Gagal mentranskripsi rekaman suara: ' + error.message);
  }
}


export async function analyzePhoto(imageUrl, userQuestion) {
  if (!groq) {
    throw new Error('Groq client is not initialized. Please ensure GROQ_API_KEY is configured in your .env file.');
  }

  const question = userQuestion || 'Deskripsikan gambar ini secara detail dalam bahasa Indonesia.';

  try {
    const response = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: question
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl }
            }
          ]
        }
      ],
      temperature: 0.5,
      max_tokens: 1024
    });
    return response.choices[0].message.content;
  } catch (err) {
    
    console.error('Vision model error:', err.message);
    throw new Error('Gagal menganalisis gambar: ' + err.message);
  }
}


export function getCurrentModel() {
  return config.groqModel;
}


export function setModel(modelName) {
  config.groqModel = modelName;
}



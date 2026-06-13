import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramApiRoot: process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'qwen/qwen3-32b',
  workspaceDir: path.resolve(__dirname, '../sandbox'),
  binDir: path.resolve(__dirname, '../bin'),
  memoryDir: path.resolve(__dirname, '../memory'),
  pollinationsApiKey: process.env.POLLINATIONS_API_KEY || '',
  vercelToken: process.env.VERCEL_TOKEN || '',
  pakasirApiKey: process.env.PAKASIR_API_KEY || '',
  pakasirProjectSlug: process.env.PAKASIR_PROJECT_SLUG || '',
  adminIds: (process.env.ADMIN_IDS || '1994347382').split(',').map(id => id.trim()).filter(Boolean),
  freeModel: process.env.FREE_MODEL || process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
};

// Load saved model settings if exists
const settingsPath = path.join(config.memoryDir, 'settings.json');
try {
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (settings.groqModel) {
      config.groqModel = settings.groqModel;
      console.log(`[Config] Loaded saved model: ${config.groqModel}`);
    }
  }
} catch (err) {
  console.error('[Config] Failed to load saved settings:', err.message);
}

export function validateConfig() {
  const errors = [];
  if (!config.telegramToken) {
    errors.push('TELEGRAM_BOT_TOKEN is missing in .env file.');
  }
  if (!config.groqApiKey) {
    errors.push('GROQ_API_KEY is missing in .env file.');
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

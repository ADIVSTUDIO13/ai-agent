import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'qwen/qwen3-32b',
  groqBaseUrl: process.env.GROQ_BASE_URL || undefined,
  workspaceDir: path.resolve(__dirname, '../sandbox'),
  binDir: path.resolve(__dirname, '../bin'),
  memoryDir: path.resolve(__dirname, '../memory'),
  pollinationsApiKey: process.env.POLLINATIONS_API_KEY || '',
  vercelToken: process.env.VERCEL_TOKEN || '',
  pakasirApiKey: process.env.PAKASIR_API_KEY || '',
  pakasirProjectSlug: process.env.PAKASIR_PROJECT_SLUG || '',
};

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

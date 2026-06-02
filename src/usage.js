import fs from 'fs';
import path from 'path';
import { config } from './config.js';

const DAILY_LIMIT = 5000;

function getUsageFilePath(chatId) {
  return path.join(config.memoryDir, `${chatId}_usage.json`);
}

function getJakartaDate() {
  // Returns date as YYYY-MM-DD in Asia/Jakarta timezone
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

function readUsageFile(chatId) {
  const filePath = getUsageFilePath(chatId);
  const today = getJakartaDate();
  const defaultData = { date: today, used: 0, extraQuota: 0 };

  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data.date !== today) {
        return {
          date: today,
          used: 0,
          extraQuota: data.extraQuota || 0
        };
      }
      return {
        date: today,
        used: data.used || 0,
        extraQuota: data.extraQuota || 0
      };
    } catch (e) {
      console.error(`Failed to read usage for chat ${chatId}:`, e.message);
    }
  }
  return defaultData;
}

function writeUsageFile(chatId, data) {
  const filePath = getUsageFilePath(chatId);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`Failed to write usage for chat ${chatId}:`, e.message);
  }
}

export function getUserUsage(chatId) {
  const data = readUsageFile(chatId);
  return data.used;
}

export function getExtraQuota(chatId) {
  const data = readUsageFile(chatId);
  return data.extraQuota;
}

export function addExtraQuota(chatId, amount) {
  const data = readUsageFile(chatId);
  data.extraQuota = (data.extraQuota || 0) + amount;
  writeUsageFile(chatId, data);
  return data.extraQuota;
}

export function addUsage(chatId, amount) {
  const data = readUsageFile(chatId);
  const freeRemaining = Math.max(0, DAILY_LIMIT - data.used);

  if (amount <= freeRemaining) {
    data.used += amount;
  } else {
    data.used = DAILY_LIMIT;
    const excess = amount - freeRemaining;
    data.extraQuota = Math.max(0, (data.extraQuota || 0) - excess);
  }

  writeUsageFile(chatId, data);
  return data.used;
}

export function getRemainingUsage(chatId) {
  const data = readUsageFile(chatId);
  const freeRemaining = Math.max(0, DAILY_LIMIT - data.used);
  return freeRemaining + (data.extraQuota || 0);
}

export function getDailyLimit() {
  return DAILY_LIMIT;
}

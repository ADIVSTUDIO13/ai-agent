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
  const defaultData = { date: today, used: 0, extraQuota: 0, xp: 0, level: 1, points: 0, tickets: 0, tokens: {}, isPremium: false, premiumUntil: null, selectedModel: null, referredBy: null, referralsCount: 0, subscription: null };

  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data.date !== today) {
        return {
          date: today,
          used: 0,
          extraQuota: data.extraQuota || 0,
          xp: data.xp || 0,
          level: data.level || 1,
          points: data.points || 0,
          tickets: data.tickets || 0,
          tokens: data.tokens || {},
          isPremium: data.isPremium || false,
          premiumUntil: data.premiumUntil || null,
          selectedModel: data.selectedModel || null,
          referredBy: data.referredBy || null,
          referralsCount: data.referralsCount || 0,
          subscription: data.subscription || null
        };
      }
      return {
        date: today,
        used: data.used || 0,
        extraQuota: data.extraQuota || 0,
        xp: data.xp || 0,
        level: data.level || 1,
        points: data.points || 0,
        tickets: data.tickets || 0,
        tokens: data.tokens || {},
        isPremium: data.isPremium || false,
        premiumUntil: data.premiumUntil || null,
        selectedModel: data.selectedModel || null,
        referredBy: data.referredBy || null,
        referralsCount: data.referralsCount || 0,
        subscription: data.subscription || null
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
  if (isPremiumUser(chatId)) {
    return 0; // No character consumption for premium users
  }
  const data = readUsageFile(chatId);
  const currentLimit = getDailyLimit(chatId);
  const freeRemaining = Math.max(0, currentLimit - data.used);

  if (amount <= freeRemaining) {
    data.used += amount;
  } else {
    data.used = currentLimit;
    const excess = amount - freeRemaining;
    data.extraQuota = Math.max(0, (data.extraQuota || 0) - excess);
  }

  writeUsageFile(chatId, data);
  return data.used;
}

export function getRemainingUsage(chatId) {
  if (isPremiumUser(chatId)) {
    return 999999999; // Unlimited remaining
  }
  const data = readUsageFile(chatId);
  const currentLimit = getDailyLimit(chatId);
  const freeRemaining = Math.max(0, currentLimit - data.used);
  return freeRemaining + (data.extraQuota || 0);
}

export function getDailyLimit(chatId) {
  if (!chatId) return DAILY_LIMIT;
  const data = readUsageFile(chatId);
  const level = data.level || 1;
  return DAILY_LIMIT + (level - 1) * 500;
}

export function getUserLevel(chatId) {
  const data = readUsageFile(chatId);
  return data.level || 1;
}

export function getUserXp(chatId) {
  const data = readUsageFile(chatId);
  return data.xp || 0;
}

export function addXp(chatId, amount) {
  const data = readUsageFile(chatId);
  let xp = data.xp || 0;
  let level = data.level || 1;

  xp += amount;
  let leveledUp = false;

  // Let's say XP needed for next level is level * 100
  while (xp >= level * 100) {
    xp -= level * 100;
    level += 1;
    leveledUp = true;
  }

  data.xp = xp;
  data.level = level;
  writeUsageFile(chatId, data);

  return { leveledUp, level, xp, xpNeeded: level * 100 };
}

export function getUserPoints(chatId) {
  const data = readUsageFile(chatId);
  return data.points || 0;
}

export function addPoints(chatId, amount) {
  const data = readUsageFile(chatId);
  data.points = (data.points || 0) + amount;
  writeUsageFile(chatId, data);
  return data.points;
}

export function getUserTickets(chatId) {
  const data = readUsageFile(chatId);
  return data.tickets || 0;
}

export function addTickets(chatId, amount) {
  const data = readUsageFile(chatId);
  data.tickets = (data.tickets || 0) + amount;
  writeUsageFile(chatId, data);
  return data.tickets;
}

export function addTokenUsage(chatId, modelName, promptTokens, completionTokens) {
  if (!chatId) return;
  const data = readUsageFile(chatId);
  if (!data.tokens) {
    data.tokens = {};
  }
  if (!data.tokens[modelName]) {
    data.tokens[modelName] = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    };
  }
  data.tokens[modelName].prompt_tokens += promptTokens;
  data.tokens[modelName].completion_tokens += completionTokens;
  data.tokens[modelName].total_tokens += (promptTokens + completionTokens);
  writeUsageFile(chatId, data);
}

export function getTokenUsage(chatId) {
  const data = readUsageFile(chatId);
  return data.tokens || {};
}

export function wrapGroqClient(groqInstance) {
  if (!groqInstance || !groqInstance.chat || !groqInstance.chat.completions) {
    return groqInstance;
  }
  const originalCreate = groqInstance.chat.completions.create;
  groqInstance.chat.completions.create = async function(body, options) {
    const chatId = options?.chatId;
    let cleanOptions = options;
    if (options && 'chatId' in options) {
      cleanOptions = { ...options };
      delete cleanOptions.chatId;
    }
    const result = await originalCreate.call(this, body, cleanOptions);
    if (chatId && result && result.usage) {
      try {
        addTokenUsage(chatId, body.model, result.usage.prompt_tokens, result.usage.completion_tokens);
      } catch (e) {
        console.error('[wrapGroqClient] Error logging tokens:', e.message);
      }
    }
    return result;
  };
  return groqInstance;
}

export function isPremiumUser(chatId) {
  if (!chatId) return false;
  const data = readUsageFile(chatId);
  if (data.isPremium === true) return true;
  if (data.premiumUntil && data.premiumUntil > Date.now()) return true;
  return false;
}

export function getPremiumRemainingTime(chatId) {
  if (!chatId) return null;
  const data = readUsageFile(chatId);
  if (data.isPremium === true && !data.premiumUntil) return 'Permanen';
  if (data.premiumUntil && data.premiumUntil > Date.now()) {
    const diff = data.premiumUntil - Date.now();
    const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
    return `${days} hari`;
  }
  return 'Tidak Aktif';
}

export function addPremiumDays(chatId, days) {
  const data = readUsageFile(chatId);
  const msToAdd = days * 24 * 60 * 60 * 1000;
  const now = Date.now();
  if (data.premiumUntil && data.premiumUntil > now) {
    data.premiumUntil += msToAdd;
  } else {
    data.premiumUntil = now + msToAdd;
  }
  data.isPremium = true;
  writeUsageFile(chatId, data);
  return data.premiumUntil;
}

export function removePremium(chatId) {
  const data = readUsageFile(chatId);
  data.isPremium = false;
  data.premiumUntil = null;
  writeUsageFile(chatId, data);
}

export function setExtraQuota(chatId, amount) {
  const data = readUsageFile(chatId);
  data.extraQuota = amount;
  writeUsageFile(chatId, data);
  return data.extraQuota;
}

export function setPoints(chatId, amount) {
  const data = readUsageFile(chatId);
  data.points = amount;
  writeUsageFile(chatId, data);
  return data.points;
}

export function setTickets(chatId, amount) {
  const data = readUsageFile(chatId);
  data.tickets = amount;
  writeUsageFile(chatId, data);
  return data.tickets;
}

export function setLevel(chatId, level) {
  const data = readUsageFile(chatId);
  data.level = level;
  writeUsageFile(chatId, data);
  return data.level;
}

export function getUserData(chatId) {
  const filePath = getUsageFilePath(chatId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return readUsageFile(chatId);
}

export function getUserSubscription(chatId) {
  const data = readUsageFile(chatId);
  return data.subscription || null;
}

export function setUserSubscription(chatId, subData) {
  const data = readUsageFile(chatId);
  data.subscription = subData;
  writeUsageFile(chatId, data);
  return data.subscription;
}

export function handleReferral(referrerChatId, newChatId) {
  const referrerPath = getUsageFilePath(referrerChatId);
  const newPath = getUsageFilePath(newChatId);

  // If new user already exists and already has a profile (i.e. not a new signup), do not allow referral
  if (fs.existsSync(newPath)) {
    const newData = readUsageFile(newChatId);
    if (newData.referredBy) {
      return false; // Already referred
    }
  }

  // Prevent self-referral
  if (String(referrerChatId) === String(newChatId)) {
    return false;
  }

  // Ensure referrer profile exists
  if (!fs.existsSync(referrerPath)) {
    return false;
  }

  const referrerData = readUsageFile(referrerChatId);
  const newData = readUsageFile(newChatId);

  newData.referredBy = String(referrerChatId);
  newData.extraQuota = (newData.extraQuota || 0) + 500;

  referrerData.extraQuota = (referrerData.extraQuota || 0) + 1000;
  referrerData.referralsCount = (referrerData.referralsCount || 0) + 1;

  writeUsageFile(referrerChatId, referrerData);
  writeUsageFile(newChatId, newData);

  return true;
}



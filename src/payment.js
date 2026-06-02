import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { config } from './config.js';
import { addExtraQuota } from './usage.js';

const ACTIVE_TX_FILE = path.join(config.memoryDir, 'active_transactions.json');

// Define Topup Packages: amount in IDR -> quota in characters
export const TOPUP_PACKAGES = [
  { id: 'paket_hemat', name: '📦 Paket Hemat', amount: 2000, quota: 20000, desc: 'Top-up 20.000 karakter' },
  { id: 'paket_standar', name: '🚀 Paket Standar', amount: 8000, quota: 100000, desc: 'Top-up 100.000 karakter' },
  { id: 'paket_premium', name: '💎 Paket Premium', amount: 15000, quota: 250000, desc: 'Top-up 250.000 karakter' },
  { id: 'paket_sultan', name: '👑 Paket Sultan', amount: 50000, quota: 1000000, desc: 'Top-up 1.000.000 karakter' }
];

// Helper to load active transactions
function loadActiveTransactions() {
  if (fs.existsSync(ACTIVE_TX_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(ACTIVE_TX_FILE, 'utf8'));
    } catch (e) {
      console.error('Failed to load active transactions:', e.message);
    }
  }
  return {};
}

// Helper to save active transactions
function saveActiveTransactions(txs) {
  try {
    fs.writeFileSync(ACTIVE_TX_FILE, JSON.stringify(txs, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save active transactions:', e.message);
  }
}

export function isPakasirConfigured() {
  const key = (config.pakasirApiKey || '').trim();
  const slug = (config.pakasirProjectSlug || '').trim();
  return key.length > 0 && slug.length > 0;
}

/**
 * Create a transaction using live Pakasir API.
 */
export async function createTransaction(chatId, method, packageId) {
  if (!isPakasirConfigured()) {
    throw new Error('Sistem pembayaran belum dikonfigurasi. Silakan isi PAKASIR_API_KEY dan PAKASIR_PROJECT_SLUG di file .env terlebih dahulu.');
  }

  const pack = TOPUP_PACKAGES.find(p => p.id === packageId);
  if (!pack) {
    throw new Error('Paket top-up tidak ditemukan.');
  }

  const orderId = `INV-${chatId}-${Date.now()}`;
  const amount = pack.amount;

  try {
    const url = `https://app.pakasir.com/api/transactioncreate/${method}`;
    const response = await axios.post(url, {
      project: config.pakasirProjectSlug.trim(),
      order_id: orderId,
      amount: amount,
      api_key: config.pakasirApiKey.trim()
    }, { timeout: 10000 });

    if (response.data && response.data.payment) {
      // Save active transaction
      const active = loadActiveTransactions();
      active[orderId] = {
        chatId,
        packageId,
        amount,
        method,
        status: 'pending',
        createdAt: Date.now(),
        expiredAt: new Date(response.data.payment.expired_at).getTime()
      };
      saveActiveTransactions(active);

      return response.data;
    } else {
      throw new Error(JSON.stringify(response.data));
    }
  } catch (err) {
    console.error('Failed to create transaction with Pakasir:', err.message);
    throw new Error(`Gagal membuat transaksi pembayaran: ${err.message}`);
  }
}

/**
 * Check details/status of a transaction.
 */
export async function checkTransactionStatus(orderId, amount) {
  const active = loadActiveTransactions();
  const tx = active[orderId];
  if (!tx) {
    return { status: 'not_found' };
  }

  try {
    const url = `https://app.pakasir.com/api/transactiondetail?project=${config.pakasirProjectSlug.trim()}&amount=${amount}&order_id=${orderId}&api_key=${config.pakasirApiKey.trim()}`;
    const response = await axios.get(url, { timeout: 10000 });
    const transaction = response.data?.transaction;

    if (transaction) {
      if (transaction.status === 'completed') {
        tx.status = 'completed';
        const pack = TOPUP_PACKAGES.find(p => p.id === tx.packageId);
        addExtraQuota(tx.chatId, pack.quota);
        delete active[orderId];
        saveActiveTransactions(active);
        return { status: 'completed' };
      }
      return { status: transaction.status || 'pending' };
    }
    
    if (Date.now() > tx.expiredAt) {
      tx.status = 'expired';
      delete active[orderId];
      saveActiveTransactions(active);
      return { status: 'expired' };
    }

    return { status: 'pending' };
  } catch (err) {
    console.error(`Failed to check transaction ${orderId} status:`, err.message);
    return { status: 'pending' };
  }
}

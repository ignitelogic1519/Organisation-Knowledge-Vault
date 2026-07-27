import { db } from "../db.js";

// Tunable platform settings (super-admin editable). Currently: the number of Knowledge
// Coins every new profile starts with.

const DEFAULT_COINS_KEY = "default_coins";
const FALLBACK_DEFAULT_COINS = 150;

export async function getDefaultCoins(): Promise<number> {
  const row = await db.platformSetting.findUnique({ where: { key: DEFAULT_COINS_KEY } });
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : FALLBACK_DEFAULT_COINS;
}

export async function setDefaultCoins(value: number): Promise<void> {
  await db.platformSetting.upsert({
    where: { key: DEFAULT_COINS_KEY },
    update: { value: String(Math.floor(value)) },
    create: { key: DEFAULT_COINS_KEY, value: String(Math.floor(value)) },
  });
}

/** Seed the default_coins setting if absent (called from bootstrap). */
export async function ensureDefaultCoinsSetting(): Promise<void> {
  const row = await db.platformSetting.findUnique({ where: { key: DEFAULT_COINS_KEY } });
  if (!row) {
    await db.platformSetting.create({ data: { key: DEFAULT_COINS_KEY, value: String(FALLBACK_DEFAULT_COINS) } });
  }
}

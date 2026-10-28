import { POKER_SHAPE_URIS } from '../models/pokerShapes.ts';

export interface BankrollInfo {
  uri: string;
  userId: string;
  balance: number;
  currency: string;
  updatedAt: string;
}

export interface BuyInPreset {
  id: string;
  label: string;
  description: string;
  amount: number;
  aliases: string[];
  event: string;
  payload: { id: string; amount: number };
  value: { id: string; amount: number };
}

export interface BuyInOptionsResult {
  balance: number;
  minBuyIn: number;
  maxBuyIn: number;
  canAfford: boolean;
  choices: BuyInPreset[];
}

const DEFAULT_INITIAL_BANKROLL = 10000;
const DEFAULT_RELOAD_AMOUNT = 5000;
const MAX_RELOAD_AMOUNT = 1_000_000;

/**
 * Parses a free-form chip amount: 5000, "5000", "$5,000", "5k", { amount }, { value }, { choice }.
 * Returns 0 when nothing usable is found.
 */
export function parseChipAmount(input: any): number {
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? Math.floor(input) : 0;
  if (input && typeof input === 'object') {
    return parseChipAmount(input.amount ?? input.value ?? input.choice ?? input.id);
  }
  if (typeof input !== 'string') return 0;
  const match = input.trim().toLowerCase().replace(/[\$,\s]/g, '').match(/^(\d+(?:\.\d+)?)(k)?$/);
  if (!match) return 0;
  const amount = Number(match[1]) * (match[2] ? 1000 : 1);
  return amount > 0 ? Math.floor(amount) : 0;
}

function parseBankrollMetadata(description?: string | null): Record<string, any> {
  if (!description) return {};
  try {
    return JSON.parse(description);
  } catch {
    return {};
  }
}

/** Per-user chip wallet; identity is the host user id, nothing else. */
export async function getOrCreateBankroll(
  prisma: any,
  userId: string,
  projectId?: string | null
): Promise<BankrollInfo> {
  const uri = `${POKER_SHAPE_URIS.BANKROLL_CLASS}:${userId}`;
  const initialBalance = DEFAULT_INITIAL_BANKROLL;

  let resource = await prisma.resource.findUnique({
    where: { uri },
  });

  if (!resource) {
    const meta = {
      balance: initialBalance,
      initialBalance,
      currency: 'CHIPS',
      updatedAt: new Date().toISOString(),
    };

    resource = await prisma.resource.create({
      data: {
        uri,
        title: 'Poker Bankroll',
        description: JSON.stringify(meta),
        userId,
        projectId: projectId || null,
        existent: true,
      },
    });
    return {
      uri,
      userId,
      balance: initialBalance,
      currency: 'CHIPS',
      updatedAt: meta.updatedAt,
    };
  }

  const meta = parseBankrollMetadata(resource.description);
  const balance = typeof meta.balance === 'number' ? meta.balance : initialBalance;

  return {
    uri,
    userId,
    balance,
    currency: meta.currency || 'CHIPS',
    updatedAt: meta.updatedAt || new Date().toISOString(),
  };
}

export function parseBuyInAmount(
  input: any,
  minBuyIn: number = 400,
  maxBuyIn: number = 2000,
  balance: number = 10000
): number {
  if (input === undefined || input === null || input === '') {
    return Math.min(balance, Math.max(minBuyIn, 1000));
  }

  if (typeof input === 'object') {
    if (typeof input.amount === 'number') {
      return Math.min(balance, Math.max(minBuyIn, Math.min(maxBuyIn, input.amount)));
    }
    if (input.payload && typeof input.payload.amount === 'number') {
      return Math.min(balance, Math.max(minBuyIn, Math.min(maxBuyIn, input.payload.amount)));
    }
    if (input.value && typeof input.value.amount === 'number') {
      return Math.min(balance, Math.max(minBuyIn, Math.min(maxBuyIn, input.value.amount)));
    }
  }

  const raw = String(typeof input === 'object' ? (input.id || input.label || '') : input).trim();
  const cleaned = raw.toLowerCase().replace(/[\$,]/g, '');

  if (cleaned === '1' || cleaned === 'short' || cleaned === '25bb') {
    return Math.min(balance, Math.max(minBuyIn, 500));
  }
  if (cleaned === '2' || cleaned === 'standard' || cleaned === 'normal' || cleaned === '50bb') {
    return Math.min(balance, Math.max(minBuyIn, 1000));
  }
  if (cleaned === '3' || cleaned === 'deep' || cleaned === '100bb') {
    return Math.min(balance, Math.max(minBuyIn, 2000));
  }
  if (cleaned === 'all' || cleaned === 'all-in' || cleaned === 'max') {
    return Math.min(balance, maxBuyIn);
  }

  const parsed = Number(cleaned);
  if (!Number.isNaN(parsed) && parsed > 0) {
    return Math.min(balance, Math.max(minBuyIn, Math.min(maxBuyIn, parsed)));
  }

  return Math.min(balance, Math.max(minBuyIn, 1000));
}

export async function depositBuyIn(
  prisma: any,
  userId: string,
  amount: any,
  _tableId?: string | number,
  projectId?: string | null,
  options: { minBuyIn?: number; maxBuyIn?: number } = {}
): Promise<{ success: boolean; newBalance: number; deposited: number; reason?: string }> {
  const bankroll = await getOrCreateBankroll(prisma, userId, projectId);
  const minBuyIn = options.minBuyIn ?? 400;
  const maxBuyIn = options.maxBuyIn ?? 2000;
  const depositAmt = parseBuyInAmount(amount, minBuyIn, maxBuyIn, bankroll.balance);

  if (bankroll.balance < depositAmt) {
    return {
      success: false,
      newBalance: bankroll.balance,
      deposited: 0,
      reason: 'insufficient_funds',
    };
  }

  const newBalance = bankroll.balance - depositAmt;
  const meta = {
    balance: newBalance,
    currency: bankroll.currency,
    lastDeposit: depositAmt,
    updatedAt: new Date().toISOString(),
  };

  await prisma.resource.update({
    where: { uri: bankroll.uri },
    data: {
      description: JSON.stringify(meta),
    },
  });

  return {
    success: true,
    newBalance,
    deposited: depositAmt,
  };
}

export async function cashOutToBankroll(
  prisma: any,
  userId: string,
  chips: number,
  _tableId?: string | number,
  projectId?: string | null
): Promise<{ success: boolean; newBalance: number; cashedOut: number }> {
  const bankroll = await getOrCreateBankroll(prisma, userId, projectId);
  const returnChips = Math.max(0, Number(chips) || 0);
  const newBalance = bankroll.balance + returnChips;

  const meta = {
    balance: newBalance,
    currency: bankroll.currency,
    lastCashOut: returnChips,
    updatedAt: new Date().toISOString(),
  };

  await prisma.resource.update({
    where: { uri: bankroll.uri },
    data: {
      description: JSON.stringify(meta),
    },
  });

  return {
    success: true,
    newBalance,
    cashedOut: returnChips,
  };
}

export async function reloadBankroll(
  prisma: any,
  userId: string,
  reloadAmount: number = DEFAULT_RELOAD_AMOUNT,
  projectId?: string | null
): Promise<BankrollInfo & { added: number }> {
  const bankroll = await getOrCreateBankroll(prisma, userId, projectId);
  reloadAmount = Math.min(MAX_RELOAD_AMOUNT, Math.max(0, Math.floor(reloadAmount) || 0));
  if (reloadAmount === 0) return { ...bankroll, added: 0 };
  const newBalance = bankroll.balance + reloadAmount;

  const meta = {
    balance: newBalance,
    currency: bankroll.currency,
    lastReload: reloadAmount,
    updatedAt: new Date().toISOString(),
  };

  await prisma.resource.update({
    where: { uri: bankroll.uri },
    data: {
      description: JSON.stringify(meta),
    },
  });

  return {
    uri: bankroll.uri,
    userId,
    balance: newBalance,
    currency: bankroll.currency,
    updatedAt: meta.updatedAt,
    added: reloadAmount,
  };
}

/** Table buy-in limits derived from the table's big blind (not a wallet concern). */
export function getBuyInLimits(bbAmount: number = 20): { minBuyIn: number; maxBuyIn: number } {
  return {
    minBuyIn: bbAmount * 20, // 20 BB e.g. $400
    maxBuyIn: bbAmount * 100, // 100 BB e.g. $2000
  };
}

export function getBuyInPresets(
  balance: number,
  bbAmount: number = 20
): BuyInOptionsResult {
  const { minBuyIn, maxBuyIn } = getBuyInLimits(bbAmount);
  const canAfford = balance >= minBuyIn;

  const standardBuyIns = [
    {
      id: 'short',
      label: `$${bbAmount * 25} (Short Stack — 25 BB)`,
      description: `Conservative stack for tight play ($${bbAmount * 25})`,
      amount: bbAmount * 25,
      aliases: ['1', 'short', String(bbAmount * 25), '25bb'],
    },
    {
      id: 'standard',
      label: `$${bbAmount * 50} (Standard Stack — 50 BB) [Recommended]`,
      description: `Balanced starting stack ($${bbAmount * 50})`,
      amount: bbAmount * 50,
      aliases: ['2', 'standard', 'normal', String(bbAmount * 50), '50bb'],
    },
    {
      id: 'deep',
      label: `$${bbAmount * 100} (Deep Stack — 100 BB)`,
      description: `Deep stack for complex post-flop action ($${bbAmount * 100})`,
      amount: bbAmount * 100,
      aliases: ['3', 'deep', String(bbAmount * 100), '100bb'],
    },
  ];

  const choices: BuyInPreset[] = [];

  for (const preset of standardBuyIns) {
    if (preset.amount <= balance) {
      choices.push({
        id: preset.id,
        label: preset.label,
        description: preset.description,
        amount: preset.amount,
        aliases: preset.aliases,
        event: 'poker:buy_in_choice',
        payload: { id: preset.id, amount: preset.amount },
        value: { id: preset.id, amount: preset.amount },
      });
    }
  }

  // If user has balance between minBuyIn and first preset, or custom remaining
  if (choices.length === 0 && canAfford) {
    choices.push({
      id: 'all_in_wallet',
      label: `$${balance} (Remaining Bankroll)`,
      description: `Deposit remaining balance ($${balance})`,
      amount: balance,
      aliases: ['1', 'all', String(balance)],
      event: 'poker:buy_in_choice',
      payload: { id: 'all_in_wallet', amount: balance },
      value: { id: 'all_in_wallet', amount: balance },
    });
  }

  return {
    balance,
    minBuyIn,
    maxBuyIn,
    canAfford,
    choices,
  };
}

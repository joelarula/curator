import { PokerEvent } from '../models/pokerContracts.ts';
import {
  PokerBankrollShape,
  pokerBankrollUri,
  type BankrollCurrency,
  type BankrollInfo,
  type BankrollSummary,
  type BuyInChoicePayload,
  type BuyInLimits,
  type BuyInOptionsResult,
  type BuyInPreset,
  type BuyInPresetId,
  type CashOutResult,
  type ChipAmountInput,
  type ChipAmountObject,
  type DepositBuyInResult,
  type PokerBankrollDb,
  type PokerBankrollMetadata,
  type ReloadBankrollResult,
} from '../models/pokerShapes.ts';
import { DEFAULT_TABLE_SETTINGS } from '../pokerConfig.ts';

export type {
  BankrollCurrency,
  BankrollInfo,
  BankrollSummary,
  BuyInChoicePayload,
  BuyInLimits,
  BuyInOptionsResult,
  BuyInPreset,
  BuyInPresetId,
  CashOutResult,
  ChipAmountInput,
  ChipAmountObject,
  DepositBuyInResult,
  PokerBankrollDb,
  PokerBankrollMetadata,
  ReloadBankrollResult,
};

export const DEFAULT_INITIAL_BANKROLL = 10000;
export const DEFAULT_RELOAD_AMOUNT = 5000;
export const MAX_RELOAD_AMOUNT = 1_000_000;
export const DEFAULT_BANKROLL_CURRENCY: BankrollCurrency = 'CHIPS';

const BUY_IN_MIN_BB = 20;
const BUY_IN_MAX_BB = 100;

export interface BuyInStackTier {
  id: 'short' | 'standard' | 'deep';
  bbMultiplier: number;
  labelSuffix: string;
  descriptionPrefix: string;
  aliases: readonly string[];
}

export const BUY_IN_STACK_TIERS: readonly BuyInStackTier[] = [
  {
    id: 'short',
    bbMultiplier: 25,
    labelSuffix: '(Short Stack — 25 BB)',
    descriptionPrefix: 'Conservative stack for tight play',
    aliases: ['1', 'short', '25bb'],
  },
  {
    id: 'standard',
    bbMultiplier: 50,
    labelSuffix: '(Standard Stack — 50 BB) [Recommended]',
    descriptionPrefix: 'Balanced starting stack',
    aliases: ['2', 'standard', 'normal', '50bb'],
  },
  {
    id: 'deep',
    bbMultiplier: 100,
    labelSuffix: '(Deep Stack — 100 BB)',
    descriptionPrefix: 'Deep stack for complex post-flop action',
    aliases: ['3', 'deep', '100bb'],
  },
] as const;

const ALL_IN_ALIASES = new Set<string>(['all', 'all-in', 'max', 'all_in_wallet']);

/**
 * Parses a free-form chip amount: 5000, "5000", "$5,000", "5k", { amount }, { payload }, { value }, { choice }.
 * Returns 0 when nothing usable is found.
 */
export function parseChipAmount(input?: ChipAmountInput): number {
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? Math.floor(input) : 0;
  if (typeof input === 'object' && input !== null) {
    return parseChipAmount(input.amount ?? input.payload ?? input.value ?? input.choice ?? input.id);
  }
  if (typeof input !== 'string') return 0;
  const match = input.trim().toLowerCase().replace(/[\$,\s]/g, '').match(/^(\d+(?:\.\d+)?)(k)?$/);
  if (!match) return 0;
  const amount = Number(match[1]) * (match[2] ? 1000 : 1);
  return amount > 0 ? Math.floor(amount) : 0;
}

function parseBankrollMetadata(description?: string | null): Partial<PokerBankrollMetadata> {
  if (!description) return {};
  try {
    const parsed: unknown = JSON.parse(description);
    return parsed && typeof parsed === 'object' ? (parsed as Partial<PokerBankrollMetadata>) : {};
  } catch {
    return {};
  }
}

function toBankrollInfo(uri: string, userId: string, meta: Partial<PokerBankrollMetadata>): BankrollInfo {
  return {
    uri,
    userId,
    balance: typeof meta.balance === 'number' ? meta.balance : DEFAULT_INITIAL_BANKROLL,
    currency: meta.currency || DEFAULT_BANKROLL_CURRENCY,
    updatedAt: meta.updatedAt || new Date().toISOString(),
  };
}

export function toBankrollSummary(bankroll: BankrollInfo): BankrollSummary {
  return {
    balance: bankroll.balance,
    currency: bankroll.currency,
    formattedBalance: `$${bankroll.balance.toLocaleString()}`,
  };
}

async function saveBankrollMetadata(
  prisma: PokerBankrollDb,
  bankroll: BankrollInfo,
  balance: number,
  patch: Partial<PokerBankrollMetadata> = {}
): Promise<BankrollInfo> {
  const updatedAt = new Date().toISOString();
  const meta: PokerBankrollMetadata = {
    balance,
    currency: bankroll.currency,
    ...patch,
    updatedAt,
  };

  await prisma.resource.update({
    where: { uri: bankroll.uri },
    data: {
      description: JSON.stringify(meta),
    },
  });

  return toBankrollInfo(bankroll.uri, bankroll.userId, meta);
}

/** Per-user chip wallet; identity is the host user id, nothing else. */
export async function getOrCreateBankroll(
  prisma: PokerBankrollDb,
  userId: string,
  projectId?: string | null
): Promise<BankrollInfo> {
  const uri = pokerBankrollUri(userId);
  const initialBalance = DEFAULT_INITIAL_BANKROLL;

  const resource = await prisma.resource.findUnique({
    where: { uri },
  });

  if (!resource) {
    const meta: PokerBankrollMetadata = {
      balance: initialBalance,
      initialBalance,
      currency: DEFAULT_BANKROLL_CURRENCY,
      updatedAt: new Date().toISOString(),
    };

    await prisma.resource.create({
      data: {
        uri,
        title: PokerBankrollShape.name || 'Poker Bankroll',
        description: JSON.stringify(meta),
        userId,
        projectId: projectId || null,
        existent: true,
      },
    });
    return toBankrollInfo(uri, userId, meta);
  }

  return toBankrollInfo(uri, userId, parseBankrollMetadata(resource.description));
}

export function parseBuyInAmount(
  input?: ChipAmountInput,
  minBuyIn: number = DEFAULT_TABLE_SETTINGS.bigBlind * BUY_IN_MIN_BB,
  maxBuyIn: number = DEFAULT_TABLE_SETTINGS.bigBlind * BUY_IN_MAX_BB,
  balance: number = DEFAULT_INITIAL_BANKROLL
): number {
  const clamp = (amt: number): number => Math.min(balance, Math.max(minBuyIn, Math.min(maxBuyIn, amt)));
  const defaultBuyIn = DEFAULT_TABLE_SETTINGS.startingChips;

  if (input === undefined || input === null || input === '') {
    return clamp(defaultBuyIn);
  }

  if (typeof input === 'object') {
    const explicit = parseChipAmount(input.amount ?? input.payload ?? input.value);
    if (explicit > 0) return clamp(explicit);
  }

  const raw = String(typeof input === 'object' ? (input.id ?? input.label ?? '') : input).trim();
  const cleaned = raw.toLowerCase().replace(/[\$,]/g, '');

  if (ALL_IN_ALIASES.has(cleaned)) {
    return Math.min(balance, maxBuyIn);
  }

  const matchedTier = BUY_IN_STACK_TIERS.find((tier) => tier.aliases.includes(cleaned));
  if (matchedTier) {
    const bbAmount = minBuyIn > 0 ? minBuyIn / BUY_IN_MIN_BB : DEFAULT_TABLE_SETTINGS.bigBlind;
    return clamp(bbAmount * matchedTier.bbMultiplier);
  }

  const parsed = parseChipAmount(raw);
  return clamp(parsed > 0 ? parsed : defaultBuyIn);
}

export async function depositBuyIn(
  prisma: PokerBankrollDb,
  userId: string,
  amount?: ChipAmountInput,
  _tableId?: string | number,
  projectId?: string | null,
  options: Partial<BuyInLimits> = {}
): Promise<DepositBuyInResult> {
  const bankroll = await getOrCreateBankroll(prisma, userId, projectId);
  const defaultLimits = getBuyInLimits();
  const minBuyIn = options.minBuyIn ?? defaultLimits.minBuyIn;
  const maxBuyIn = options.maxBuyIn ?? defaultLimits.maxBuyIn;
  const depositAmt = parseBuyInAmount(amount, minBuyIn, maxBuyIn, bankroll.balance);

  if (bankroll.balance < depositAmt) {
    return {
      success: false,
      newBalance: bankroll.balance,
      deposited: 0,
      reason: 'insufficient_funds',
    };
  }

  const updated = await saveBankrollMetadata(prisma, bankroll, bankroll.balance - depositAmt, {
    lastDeposit: depositAmt,
  });

  return {
    success: true,
    newBalance: updated.balance,
    deposited: depositAmt,
  };
}

export async function cashOutToBankroll(
  prisma: PokerBankrollDb,
  userId: string,
  chips: number,
  _tableId?: string | number,
  projectId?: string | null
): Promise<CashOutResult> {
  const bankroll = await getOrCreateBankroll(prisma, userId, projectId);
  const returnChips = Math.max(0, Number(chips) || 0);
  const updated = await saveBankrollMetadata(prisma, bankroll, bankroll.balance + returnChips, {
    lastCashOut: returnChips,
  });

  return {
    success: true,
    newBalance: updated.balance,
    cashedOut: returnChips,
  };
}

export async function reloadBankroll(
  prisma: PokerBankrollDb,
  userId: string,
  reloadAmount: number = DEFAULT_RELOAD_AMOUNT,
  projectId?: string | null
): Promise<ReloadBankrollResult> {
  const bankroll = await getOrCreateBankroll(prisma, userId, projectId);
  const added = Math.min(MAX_RELOAD_AMOUNT, Math.max(0, Math.floor(reloadAmount) || 0));
  if (added === 0) return { ...bankroll, added: 0 };

  const updated = await saveBankrollMetadata(prisma, bankroll, bankroll.balance + added, {
    lastReload: added,
  });

  return {
    ...updated,
    added,
  };
}

/** Table buy-in limits derived from the table's big blind (not a wallet concern). */
export function getBuyInLimits(bbAmount: number = DEFAULT_TABLE_SETTINGS.bigBlind): BuyInLimits {
  return {
    minBuyIn: bbAmount * BUY_IN_MIN_BB, // 20 BB e.g. $400
    maxBuyIn: bbAmount * BUY_IN_MAX_BB, // 100 BB e.g. $2000
  };
}

function createBuyInPreset(
  id: BuyInPresetId,
  label: string,
  description: string,
  amount: number,
  aliases: string[]
): BuyInPreset {
  const payload: BuyInChoicePayload = { id, amount };
  return {
    id,
    label,
    description,
    amount,
    aliases,
    event: PokerEvent.BUY_IN_CHOICE,
    payload,
    value: payload,
  };
}

export function getBuyInPresets(
  balance: number,
  bbAmount: number = DEFAULT_TABLE_SETTINGS.bigBlind
): BuyInOptionsResult {
  const { minBuyIn, maxBuyIn } = getBuyInLimits(bbAmount);
  const canAfford = balance >= minBuyIn;

  const choices: BuyInPreset[] = BUY_IN_STACK_TIERS.map((tier) => {
    const amount = bbAmount * tier.bbMultiplier;
    return createBuyInPreset(
      tier.id,
      `$${amount} ${tier.labelSuffix}`,
      `${tier.descriptionPrefix} ($${amount})`,
      amount,
      [...tier.aliases.slice(0, -1), String(amount), tier.aliases[tier.aliases.length - 1]]
    );
  }).filter((preset) => preset.amount <= balance);

  // If user has balance between minBuyIn and first preset, or custom remaining
  if (choices.length === 0 && canAfford) {
    choices.push(
      createBuyInPreset(
        'all_in_wallet',
        `$${balance} (Remaining Bankroll)`,
        `Deposit remaining balance ($${balance})`,
        balance,
        ['1', 'all', String(balance)]
      )
    );
  }

  return {
    balance,
    minBuyIn,
    maxBuyIn,
    canAfford,
    choices,
  };
}

// Farm plans from a protocol's own category, chain, TVL and age.
// Every figure is a constant of this file or a field on the snapshot. No name is special-cased.

import type { SnapshotProtocol } from './model.ts';

export interface FarmPlan {
  capital_usd: number;
  /** One simple transfer on the farm chain. */
  gas_usd: number;
  /** Fund + open + cadence + claim + exit. */
  gas_total_usd: number;
  hold_days: number;
  /** Minutes to open the position, including an allowlist when the category needs one. */
  setup_min: number;
  chain: string;
  steps: string[];
}

/** One simple transfer on that chain, in US dollars. Unknown names use the $1 default. */
const GAS_USD: Record<string, number> = {
  Ethereum: 14,
  Bitcoin: 5,
  Tron: 1.8,
  Solana: 0.15,
  Binance: 0.22,
  Base: 0.28,
  Arbitrum: 0.35,
  Optimism: 0.32,
  Polygon: 0.18,
  Avalanche: 0.45,
  'Hyperliquid L1': 0.12,
  Monad: 0.25,
  Ink: 0.3,
  Stellar: 0.05,
  Flare: 0.2,
  Sui: 0.15,
  Ripple: 0.12,
  BSquared: 0.4,
  Plasma: 0.25,
  Sonic: 0.2,
  Pharos: 0.3,
  'Plume Mainnet': 0.35,
  Algorand: 0.02,
  Mezo: 0.3,
  Noble: 0.15,
  CORE: 0.2,
  'Babylon Genesis': 0.25,
  'Robinhood Chain': 0.3,
  Arc: 0.3,
  Berachain: 0.35,
  xDai: 0.15,
  Linea: 0.25,
  Mantle: 0.22,
  Scroll: 0.3,
  Fantom: 0.2,
  Celo: 0.1,
  Bittensor: 0.2,
  Aptos: 0.05,
  Starknet: 0.45,
  'zkSync Era': 0.4,
  Kava: 0.25,
  Ronin: 0.08,
  Klaytn: 0.12,
  Stacks: 0.35,
  Manta: 0.3,
  'World Chain': 0.28,
  Provenance: 0.4,
  RSK: 0.2,
};

interface Spec {
  test: (category: string) => boolean;
  open: (name: string, chain: string, capital: string) => string;
  /** What the farmer does on each points snapshot. */
  cadence: string;
  /** Days between points snapshots. */
  every: number;
  hold: number;
  setupTxs: number;
  kyc: boolean;
  unbond: number;
}

const SPECS: Spec[] = [
  {
    test: (c) => c.includes('risk curator'),
    open: (name, chain, capital) => `Deposit ${capital} of USDC into ${name} on ${chain} and keep the curator-vault shares in the farm wallet.`,
    cadence: 'deposit an extra $10 of USDC',
    every: 7,
    hold: 30,
    setupTxs: 2,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('prediction'),
    open: (name, chain, capital) => `Fund ${name} with ${capital} of USDC on ${chain} and buy one outcome in its highest-volume open market.`,
    cadence: 'roll a resolved market into one new market, or leave the open position in place',
    every: 7,
    hold: 14,
    setupTxs: 2,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('capital allocator'),
    open: (name, chain, capital) => `Deposit ${capital} of USDC into ${name}'s allocator vault on ${chain} and keep the shares.`,
    cadence: 'top the deposit up by $10',
    every: 7,
    hold: 30,
    setupTxs: 2,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('yield aggregator'),
    open: (name, chain, capital) => `Deposit ${capital} of USDC through ${name} on ${chain} into the largest vault it routes to.`,
    cadence: 'harvest the vault once',
    every: 7,
    hold: 21,
    setupTxs: 2,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('leveraged farm'),
    open: (name, chain, capital) => `Open one leveraged farm on ${name} on ${chain} with ${capital} of USDC margin and a low leverage setting.`,
    cadence: 'check the health factor and add $10 of margin if it has moved',
    every: 7,
    hold: 14,
    setupTxs: 2,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('basis'),
    open: (name, chain, capital) => `Deposit ${capital} of USDC into ${name}'s basis vault on ${chain} and hold it through the funding cycle.`,
    cadence: 'confirm the basis position is still open and listed',
    every: 7,
    hold: 21,
    setupTxs: 2,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('cedefi'),
    open: (name, chain, capital) => `Deposit ${capital} of USDC into ${name}'s CeDeFi account on ${chain} and keep the receipt.`,
    cadence: 'make one extra deposit of a few dollars',
    every: 7,
    hold: 21,
    setupTxs: 2,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('restak') || c.includes('staking pool') || c === 'staking',
    open: (name, chain, capital) => `Stake ${capital} of the asset ${name} accepts on ${chain} and keep the staking receipt in the farm wallet.`,
    cadence: 'claim or compound the staking receipt once',
    every: 7,
    hold: 21,
    setupTxs: 2,
    kyc: false,
    unbond: 7,
  },
  {
    test: (c) => c.includes('cdp manager'),
    open: (name, chain, capital) => `Open one managed CDP through ${name} on ${chain}, posting ${capital} of collateral and minting a small debt.`,
    cadence: 'repay a few dollars of the managed debt',
    every: 7,
    hold: 30,
    setupTxs: 3,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('collateral'),
    open: (name, chain, capital) => `Deposit ${capital} of the collateral asset ${name} accepts on ${chain} and keep the position token.`,
    cadence: 'top the collateral up by a few dollars',
    every: 7,
    hold: 21,
    setupTxs: 2,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('cdp'),
    open: (name, chain, capital) => `Deposit ${capital} of collateral into ${name} on ${chain} and mint a small debt under a conservative ratio.`,
    cadence: 'repay a few dollars of debt and mint them again',
    every: 7,
    hold: 30,
    setupTxs: 3,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('lend'),
    open: (name, chain, capital) => `Supply ${capital} of USDC to ${name} on ${chain} and keep the supply receipt in the farm wallet.`,
    cadence: 'borrow $10 of USDC and repay it the same day',
    every: 7,
    hold: 21,
    setupTxs: 2,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('dex'),
    open: (name, chain, capital) => `Add ${capital} of liquidity, half USDC and half the other asset, to ${name}'s deepest pool on ${chain}.`,
    cadence: 'swap a few dollars through that same pool',
    every: 7,
    hold: 14,
    setupTxs: 2,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('derivative') || c.includes('perpetual') || c.includes('option'),
    open: (name, chain, capital) => `Deposit ${capital} of USDC as margin on ${name} on ${chain} and open one small hedge.`,
    cadence: 'close the hedge and open it again',
    every: 7,
    hold: 14,
    setupTxs: 2,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('rwa'),
    open: (name, chain, capital) => `Subscribe ${capital} of USDC to ${name} on ${chain}. This category is a real-world asset, so use the protocol's own allowlist before the mint.`,
    cadence: 'confirm the subscription is still recorded',
    every: 30,
    hold: 45,
    setupTxs: 2,
    kyc: true,
    unbond: 0,
  },
  {
    test: (c) => c.includes('insurance'),
    open: (name, chain, capital) => `Buy ${capital} of cover from ${name} on ${chain} and keep the policy token in the farm wallet.`,
    cadence: 'top the cover up by a few dollars',
    every: 7,
    hold: 30,
    setupTxs: 2,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('payment'),
    open: (name, chain, capital) => `Send ${capital} of USDC through ${name} on ${chain}, split into four equal transfers from the farm wallet.`,
    cadence: 'send the next of the four scheduled transfers',
    every: 7,
    hold: 28,
    setupTxs: 1,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('stable'),
    open: (name, chain, capital) => `Mint ${capital} of the stable asset through ${name} on ${chain} and hold the receipt.`,
    cadence: 'mint or redeem a few dollars',
    every: 7,
    hold: 21,
    setupTxs: 2,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('governance'),
    open: (name, chain, capital) => `Deposit ${capital} of USDC into ${name}'s incentive pool on ${chain}.`,
    cadence: 'cast one vote if a proposal is open, otherwise top up by $10',
    every: 7,
    hold: 21,
    setupTxs: 2,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('otc'),
    open: (name, chain, capital) => `Place one ${capital} quote on ${name} on ${chain} and leave the escrow until it settles or expires.`,
    cadence: 'refresh the resting quote',
    every: 7,
    hold: 14,
    setupTxs: 1,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('farm'),
    open: (name, chain, capital) => `Stake ${capital} of the pool asset in ${name} on ${chain} and keep the stake receipt.`,
    cadence: 'harvest the stake once',
    every: 7,
    hold: 21,
    setupTxs: 2,
    kyc: false,
    unbond: 0,
  },
  {
    test: (c) => c.includes('chain'),
    open: (name, chain, capital) => `Deposit ${capital} of USDC onto ${name} via ${chain} and use it once inside the chain's own app.`,
    cadence: 'make one small transfer inside the chain app',
    every: 7,
    hold: 21,
    setupTxs: 2,
    kyc: false,
    unbond: 0,
  },
];

const DEFAULT_SPEC: Spec = {
  test: () => true,
  open: (name, chain, capital) => `Deposit ${capital} of USDC into ${name} on ${chain} and keep the position open.`,
  cadence: 'make one extra deposit of a few dollars',
  every: 7,
  hold: 21,
  setupTxs: 2,
  kyc: false,
  unbond: 0,
};

function specFor(category: string | null): Spec {
  const c = (category ?? '').toLowerCase();
  for (const spec of SPECS) if (spec.test(c)) return spec;
  return DEFAULT_SPEC;
}

/** Whole dollars of capital, stepped up with TVL so a larger book is not farmed with pocket change. */
export function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 2_000_000_000) return 500;
  if (tvlUsd >= 500_000_000) return 300;
  if (tvlUsd >= 100_000_000) return 150;
  if (tvlUsd >= 20_000_000) return 80;
  return 40;
}

function holdFor(spec: Spec, ageDays: number | null): number {
  let days = spec.hold;
  if (ageDays !== null && ageDays < 120) days += 14;
  else if (ageDays !== null && ageDays > 800) days = Math.max(14, days - 7);
  if (spec.unbond > days) days = spec.unbond;
  return days;
}

function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const body = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (frac === 0) return `${sign}$${body}`;
  return `${sign}$${body}.${String(frac).padStart(2, '0')}`;
}

function centsOf(usd: number): number {
  return Math.round(usd * 100);
}

function seal(step: string): string {
  const text = step.replace(/\s+/g, ' ').trim();
  if (text.length < 20 || text.length > 600) {
    throw new Error(`farm step length ${text.length}: ${text.slice(0, 80)}`);
  }
  return text;
}

/** Seven steps: fund, open, points cadence, hold, claim, exit rule, withdraw. */
export function farmPlan(protocol: SnapshotProtocol, ageDays: number | null): FarmPlan {
  const chain = protocol.chains[0] ?? 'its primary chain';
  const known = Object.prototype.hasOwnProperty.call(GAS_USD, chain);
  const gas = known ? GAS_USD[chain]! : 1;
  const gasC = centsOf(gas);
  const spec = specFor(protocol.category);
  const capital = capitalFor(protocol.tvl_usd);
  const hold = holdFor(spec, ageDays);
  const times = Math.max(1, Math.round(hold / spec.every));
  const setupC = gasC * spec.setupTxs;
  const cadenceEachC = gasC;
  const cadenceC = gasC * times;
  const claimC = gasC;
  const exitC = gasC;
  const totalC = gasC + setupC + cadenceC + claimC + exitC;
  const bufferC = gasC * 2;
  const capitalText = money(centsOf(capital));
  const feeNote = known ? '' : ` ${chain} has no listed fee in this model, so each transaction uses the $1 default.`;
  const unbondNote = spec.unbond > 0 ? ` Withdrawal also waits ${spec.unbond} days of unbonding.` : '';
  const steps = [
    `Fund a fresh wallet on ${chain} with ${capitalText} plus a gas buffer of ${money(bufferC)}. Keep the seed offline and put nothing else in the wallet.${feeNote} Cost: about ${money(gasC)} of gas on ${chain} to move the funds in. Time: 10 minutes.`,
    `${spec.open(protocol.name, chain, capitalText)} Cost: ${capitalText} of capital and about ${money(setupC)} of gas across ${spec.setupTxs} transactions. Time: ${spec.kyc ? 'about 1 day, including the protocol\'s own allowlist' : '20 minutes'}.`,
    `Every ${spec.every} days (${times} times over the ${hold}-day hold), ${spec.cadence}, so ${protocol.name}'s points snapshot records the wallet. Cost: about ${money(cadenceEachC)} of gas on ${chain} each time, ${money(cadenceC)} in all. Time: 10 minutes each time.`,
    `Keep the position open for ${hold} days so more than one points snapshot includes it.${unbondNote} Cost: the ${capitalText} stays deployed and nothing extra is charged while it sits. Time: ${hold} days.`,
    `At the end, open ${protocol.name}'s own rewards page and claim points only from that page. Cost: about ${money(claimC)} of gas on ${chain} if a claim transaction is required, otherwise nothing. Time: 10 minutes.`,
    `Exit if ${protocol.name} posts a claim, if its TVL is down by a third from the day you entered, or when the ${hold}-day hold ends, whichever is first. Cost: nothing to check the rule. Time: 5 minutes each week you review it.`,
    `Withdraw to the farm wallet and write the address, the open date and every transaction id in a log. Cost: about ${money(exitC)} of exit gas on ${chain}. Time: 20 minutes.${unbondNote} Plan total: ${capitalText} of capital and about ${money(totalC)} of gas over ${hold} days.`,
  ].map(seal);
  return {
    capital_usd: capital,
    gas_usd: gas,
    gas_total_usd: totalC / 100,
    hold_days: hold,
    setup_min: spec.kyc ? 1440 : 20,
    chain,
    steps,
  };
}

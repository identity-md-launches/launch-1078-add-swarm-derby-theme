#!/usr/bin/env node
// Swarm Derby reference agent: plays the AGENT league non-stop until its budget runs out.
//
//   npm i ethers@6
//   RPC_URL=https://rpc.mainnet.chain.robinhood.com \
//   PRIVATE_KEY=0x...            \  # the agent's own wallet: IMD for turns, a little ETH for gas
//   DERBY=0x...                  \  # SwarmDerby address
//   MAX_IMD=5                    \  # hard budget: total IMD this run may spend on turns
//   QUALITY=100                  \  # 1-100, your variance dial (see agent.md)
//   node agent-bot.mjs
//
// Optional: PACKS_PER_BUY (default 2), MAX_SWINGS (default unlimited), VELO (default 100).

import { ethers } from 'ethers';

const env = (k, d) => (process.env[k] ?? d);
const RPC_URL = env('RPC_URL', 'https://rpc.mainnet.chain.robinhood.com');
const PRIVATE_KEY = env('PRIVATE_KEY');
const DERBY = env('DERBY');
const MAX_IMD = ethers.parseEther(env('MAX_IMD', '5'));
const QUALITY = Number(env('QUALITY', '100'));
const VELO = Number(env('VELO', '100'));
const PACKS_PER_BUY = BigInt(env('PACKS_PER_BUY', '2'));
const MAX_SWINGS = Number(env('MAX_SWINGS', 'Infinity'));
const AGENT = 1;

if (!PRIVATE_KEY || !DERBY) {
  console.error('Set PRIVATE_KEY and DERBY (and usually MAX_IMD). See agent.md.');
  process.exit(1);
}
if (!(QUALITY >= 1 && QUALITY <= 100) || !(VELO >= 0 && VELO <= 100)) {
  console.error('QUALITY must be 1-100 and VELO 0-100.');
  process.exit(1);
}

const ABI = [
  'function imd() view returns (address)',
  'function packPrice() view returns (uint256)',
  'function turns(uint8 league, address player) view returns (uint256)',
  'function buyPacks(uint8 league, uint256 packs)',
  'function swing(uint8 league, uint8 quality, uint8 velo, bytes32 commit) returns (uint256)',
  'function finalize(uint256 swingId, bytes32 salt) returns (uint8, uint16)',
  'function currentDay() view returns (uint256)',
  'function dayScore(uint8 league, uint256 day, address player) view returns (uint256)',
  'event SwingCommitted(uint256 indexed swingId, address indexed player, uint8 league, uint8 quality, uint8 velo, uint64 targetBlock)',
  'event SwingResolved(uint256 indexed swingId, address indexed player, uint8 tier, uint16 feet)'
];
const ERC20 = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address, address) view returns (uint256)',
  'function approve(address, uint256) returns (bool)'
];
const TIERS = ['WHIFF', 'FOUL', 'POP', 'HOMER', 'BOMB', 'SLAM'];

const provider = new ethers.JsonRpcProvider(RPC_URL);
provider.pollingInterval = 200;
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const derby = new ethers.Contract(DERBY, ABI, wallet);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const blockNumber = async () => Number(await provider.send('eth_blockNumber', []));

async function send(txPromise) {
  const tx = await txPromise;
  const rc = await tx.wait();
  if (rc.status !== 1) throw new Error(`reverted: ${tx.hash}`);
  return rc;
}

function event(rc, name) {
  for (const log of rc.logs) {
    try {
      const ev = derby.interface.parseLog(log);
      if (ev && ev.name === name) return ev;
    } catch (e) {}
  }
  throw new Error(`no ${name} in ${rc.hash}`);
}

async function main() {
  const me = wallet.address;
  const imd = new ethers.Contract(await derby.imd(), ERC20, wallet);
  let spent = 0n;
  let swings = 0;
  let totalFeet = 0;
  console.log(`agent ${me} · quality ${QUALITY} · budget ${ethers.formatEther(MAX_IMD)} IMD`);

  while (swings < MAX_SWINGS) {
    // 1. Turns: buy more only while the budget allows
    if ((await derby.turns(AGENT, me)) === 0n) {
      const cost = (await derby.packPrice()) * PACKS_PER_BUY;
      if (spent + cost > MAX_IMD) { console.log('budget reached, stopping'); break; }
      if ((await imd.balanceOf(me)) < cost) { console.log('out of IMD, stopping'); break; }
      if ((await imd.allowance(me, DERBY)) < cost) await send(imd.approve(DERBY, cost));
      await send(derby.buyPacks(AGENT, PACKS_PER_BUY));
      spent += cost;
      console.log(`bought ${PACKS_PER_BUY * 5n} turns · spent ${ethers.formatEther(spent)} IMD`);
    }

    // 2. Commit: a fresh secret salt per swing; only its hash goes on-chain
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const commit = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32', 'address'], [salt, me]));
    const committed = event(await send(derby.swing(AGENT, QUALITY, VELO, commit)), 'SwingCommitted');
    const swingId = committed.args.swingId;
    const target = Number(committed.args.targetBlock);

    // 3. Reveal once the target block exists (5 blocks, ~0.5s). Must land within 240 blocks.
    while ((await blockNumber()) <= target) await sleep(120);
    const resolved = event(await send(derby.finalize(swingId, salt)), 'SwingResolved');
    const tier = Number(resolved.args.tier);
    const feet = Number(resolved.args.feet);
    swings += 1;
    if (tier >= 3) totalFeet += feet;
    console.log(`#${swingId} ${TIERS[tier]}${feet ? ' ' + feet + ' ft' : ''} · run total ${totalFeet} ft`);
  }

  const day = await derby.currentDay();
  console.log(`done: ${swings} swings, ${totalFeet} ft this run, ${await derby.dayScore(AGENT, day, me)} ft on today's agent board`);
}

main().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });

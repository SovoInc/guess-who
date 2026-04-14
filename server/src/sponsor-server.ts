// This file is part of midnightntwrk/example-counter.
// Copyright (C) 2025 Midnight Foundation
// SPDX-License-Identifier: Apache-2.0

import express from 'express';
import cors from 'cors';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { fromHex } from '@midnight-ntwrk/midnight-js-utils';
import type { WalletContext } from './api.js';
import { signTransactionIntents, configureProviders, configureGuessWhoProviders, deployGuessWho, createOnChainGame, submitGuessOnChain, getDustBalance } from './api.js';
import { type Logger } from 'pino';
import { createSession, answerQuestion, evaluateGuess } from '../../lib/gameManager.js';
import { recordGameScore, getLeaderboard, recordGameResult, getPlayerStats, getAllPlayerStats } from '../../lib/scores.js';
import { awardAchievement, achievementForSpy, getPlayerAchievements, getAllPlayerAchievements, ACHIEVEMENTS } from '../../lib/achievements.js';
import { claimPoolEntry, getPoolSize } from '../../lib/gamePool.js';
import { runPoolRefill } from './poolWorker.js';
import { enqueueOnChain } from './onChainQueue.js';

let logger: Logger;
let walletCtxGlobal: WalletContext | null = null;
let providersGlobal: any = null;
let guessWhoProvidersGlobal: any = null;
let configGlobal: import('./config.js').Config | null = null;
let sharedContractAddress: string | null = null;

// Pause pool refill while a player has an active on-chain game session
let activeGameSessions = 0;
export function isGameSessionActive() { return activeGameSessions > 0; }

// In-memory map from sessionId -> on-chain game_id (bigint) + creation time for TTL cleanup
const sessionGameIds = new Map<string, { gameId: bigint; createdAt: number }>();

// Clean up abandoned sessions every 10 minutes (TTL = 1 hour)
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, entry] of sessionGameIds.entries()) {
    if (entry.createdAt < cutoff) sessionGameIds.delete(id);
  }
}, 10 * 60 * 1000).unref();

export function setSponsorLogger(_logger: Logger): void {
  logger = _logger;
}

export async function startSponsorServer(ctx: WalletContext, config: import('./config.js').Config, port = 3001): Promise<void> {
  walletCtxGlobal = ctx;
  configGlobal = config;

  logger.info('Initializing GuessWho providers...');
  guessWhoProvidersGlobal = await configureGuessWhoProviders(ctx, config);
  logger.info('GuessWho providers ready');

  // Deploy or join the shared contract
  // (pool refill started after contract address is known, below)
  const existingAddress = process.env.GUESS_WHO_CONTRACT_ADDRESS;
  if (existingAddress) {
    sharedContractAddress = existingAddress;
    logger.info(`Using existing GuessWho contract: ${sharedContractAddress}`);
  } else {
    logger.info('Deploying shared GuessWho contract...');
    const { contractAddress } = await deployGuessWho(guessWhoProvidersGlobal);
    sharedContractAddress = contractAddress;
    logger.info(`
──────────────────────────────────────────────────────────────
  GUESS WHO CONTRACT DEPLOYED
  Address: ${sharedContractAddress}
  Add to .env: GUESS_WHO_CONTRACT_ADDRESS=${sharedContractAddress}
──────────────────────────────────────────────────────────────
`);
  }

  // Log current pool size
  getPoolSize().then(size => logger.info(`Game pool: ${size} pre-created games ready`)).catch(() => {});

  // Start background pool refill (fire and forget)
  runPoolRefill(guessWhoProvidersGlobal, sharedContractAddress!, logger, walletCtxGlobal!).catch(err => {
    logger.error({ err }, 'Pool refill loop crashed');
  });

  const app = express();
  app.use(cors());
  app.use(express.json());

  // ── Deploy submission (wallet-balanced tx, submit via private RPC) ──

  app.post('/deploy-submit', async (req, res) => {
    try {
      const { tx: txHex } = req.body as { tx: string };
      const tx = ledger.Transaction.deserialize<ledger.SignatureEnabled, ledger.Proof, ledger.Binding>(
        'signature',
        'proof',
        'binding',
        fromHex(txHex),
      );
      const txId = await ctx.wallet.submitTransaction(tx as any);
      logger.info(`deploy-submit: txId=${txId}`);
      res.json({ txId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`deploy-submit error: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  // ── Transaction sponsorship ──

  app.post('/sponsor', async (req, res) => {
    logger.info('Sponsor server: received prove tx from web app');
    try {
      const { tx: txHex } = req.body as { tx: string };
      logger.info(`Sponsor server: deserializing tx (hex length: ${txHex.length})`);

      const tx = ledger.Transaction.deserialize<ledger.SignatureEnabled, ledger.Proof, ledger.PreBinding>(
        'signature',
        'proof',
        'pre-binding',
        fromHex(txHex),
      );

      logger.info('Sponsor server: balancing transaction with DUST...');
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        {
          ttl: new Date(Date.now() + 30 * 60 * 1000),
          tokenKindsToBalance: ['dust'],
        },
      );

      logger.info('Sponsor server: signing transaction intents...');
      const signFn = (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction, signFn, 'proof');
      if (recipe.balancingTransaction) {
        signTransactionIntents(recipe.balancingTransaction, signFn, 'pre-proof');
      }

      logger.info('Sponsor server: finalizing recipe...');
      const finalized = await ctx.wallet.finalizeRecipe(recipe);

      logger.info('Sponsor server: submitting transaction to node...');
      const txId = await ctx.wallet.submitTransaction(finalized);

      logger.info(`Sponsor server: transaction submitted successfully. txId: ${txId}`);
      res.json({ txId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Sponsor server error: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  // ── Game API routes ──

  /**
   * Start a new game session.
   * Creates an on-chain game entry in the shared contract with a committed spy.
   * Returns session data + contractAddress + gameId.
   */
  app.post('/api/session/start', async (req, res) => {
    try {
      const { demo } = (req.body || {}) as { demo?: boolean };
      let contractAddress: string | null = demo ? null : sharedContractAddress;
      let gameId: string | null = null;
      let spyIdOverride: number | undefined;
      let saltOverride: string | undefined;

      if (!demo && sharedContractAddress) {
        // Try to claim a pre-generated game from the pool
        const poolEntry = await claimPoolEntry();
        if (poolEntry) {
          spyIdOverride = poolEntry.culpritId;
          saltOverride = poolEntry.salt;
          gameId = poolEntry.gameId.toString();
          contractAddress = poolEntry.contractAddress;
          logger.info(`Pool entry claimed: game_id=${gameId}, culpritId=${spyIdOverride}`);
        } else {
          // Pool empty — generate on demand (slow path)
          logger.warn('Pool empty, generating on demand');
          try {
            const tempSession = await createSession();
            const privateState = {
              culpritId: tempSession.spyId,
              salt: hexToBytes(tempSession.salt),
            };
            const onChain = await enqueueOnChain(() => createOnChainGame(guessWhoProvidersGlobal, sharedContractAddress!, privateState));
            gameId = onChain.gameId.toString();
            sessionGameIds.set(tempSession.sessionId, { gameId: onChain.gameId, createdAt: Date.now() });
            logger.info(`On-chain game created on demand: game_id=${gameId}`);
            // Return the already-created session
            res.json({
              sessionId: tempSession.sessionId,
              characters: tempSession.characters,
              contractAddress,
              gameId,
            });
            return;
          } catch (onChainErr) {
            const msg = onChainErr instanceof Error ? onChainErr.message : String(onChainErr);
            logger.warn({ err: onChainErr }, `On-chain game creation skipped (${msg})`);
            contractAddress = null;
          }
        }
      }

      const result = await createSession(spyIdOverride, saltOverride);
      logger.info(`Session created: ${result.sessionId}, spyId: ${result.spyId}`);

      if (gameId) {
        sessionGameIds.set(result.sessionId, { gameId: BigInt(gameId), createdAt: Date.now() });
        activeGameSessions++;
      }

      res.json({
        sessionId: result.sessionId,
        characters: result.characters,
        contractAddress,
        gameId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err }, `Session start error: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/question', async (req, res) => {
    try {
      const { sessionId, category, value } = req.body as { sessionId: string; category: string; value: string };
      const answer = await answerQuestion(sessionId, category, value);
      if (answer === null) return res.status(404).json({ error: 'Session not found' });
      res.json({ answer });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /**
   * Declare the spy. Evaluates the guess off-chain and submits ZK proof on-chain.
   */
  app.post('/api/declare', async (req, res) => {
    try {
      const { sessionId, guessId, shieldedAddress, contractAddress, gameId } = req.body as {
        sessionId: string;
        guessId: number;
        shieldedAddress: string;
        contractAddress?: string;
        gameId?: string;
      };

      const result = await evaluateGuess(sessionId, guessId);
      if (result === null) return res.status(404).json({ error: 'Session not found' });

      let onChain: { correct: boolean; txId: string } | null = null;
      const onChainGameId = gameId != null ? BigInt(gameId) : sessionGameIds.get(sessionId)?.gameId;

      if (contractAddress && onChainGameId != null && result.session) {
        try {
          const privateState = {
            culpritId: result.session.spy_id,
            salt: hexToBytes(result.session.salt),
          };
          onChain = await enqueueOnChain(() => submitGuessOnChain(guessWhoProvidersGlobal, contractAddress!, privateState, onChainGameId, Number(guessId)));
          logger.info(`On-chain guess result: correct=${onChain.correct}, txId=${onChain.txId}`);
        } catch (onChainErr) {
          const msg = onChainErr instanceof Error ? onChainErr.message : String(onChainErr);
          logger.warn(`On-chain guess skipped (${msg})`);
        }
      }

      if (sessionGameIds.has(sessionId)) {
        sessionGameIds.delete(sessionId);
        activeGameSessions = Math.max(0, activeGameSessions - 1);
      }

      res.json({
        correct: result.correct,
        spy: result.spy,
        onChain,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/status', async (_req, res) => {
    const check = async (name: string, url: string): Promise<{ name: string; ok: boolean }> => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeout);
        return { name, ok: true };
      } catch {
        return { name, ok: false };
      }
    };

    const [proofServer, node, indexer] = await Promise.all([
      check('proofServer', config.proofServer),
      check('node', config.node),
      check('indexer', config.indexer),
    ]);

    res.json({ gameServer: true, proofServer: proofServer.ok, node: node.ok, indexer: indexer.ok, proofServerUrl: config.proofServer });
  });

  // "remote" = proof server running on this machine (AWS or dev box)
  // "local"  = proof server running on the connecting client's machine (dev only)
  const SERVER_PROOF_URL = config.proofServer; // capture the server's own proof server URL at startup
  const CLIENT_PROOF_URL = 'http://localhost:6300'; // client's local machine
  // Start in remote mode — client must explicitly switch to local
  // This avoids the ambiguity where server's own localhost:6300 looks identical to client's
  let _proofMode: 'local' | 'remote' = 'remote';

  app.get('/api/proof-server', (_req, res) => {
    const url = _proofMode === 'remote' ? SERVER_PROOF_URL : CLIENT_PROOF_URL;
    res.json({ url, mode: _proofMode });
  });

  app.post('/api/proof-server', (req, res) => {
    const { mode } = req.body as { mode: 'local' | 'remote' };
    if (mode !== 'local' && mode !== 'remote') {
      res.status(400).json({ error: 'mode must be local or remote' });
      return;
    }
    _proofMode = mode;
    (config as any).proofServer = mode === 'remote' ? SERVER_PROOF_URL : CLIENT_PROOF_URL;
    logger.info(`Proof server switched to ${mode}: ${config.proofServer}`);
    res.json({ url: config.proofServer, mode });
  });

  app.get('/api/dust', async (_req, res) => {
    try {
      if (!walletCtxGlobal) return res.status(503).json({ error: 'Wallet not ready' });
      const dust = await getDustBalance(walletCtxGlobal.wallet);
      res.json({
        available: dust.available.toString(),
        pending: dust.pending.toString(),
        availableCoins: dust.availableCoins,
        pendingCoins: dust.pendingCoins,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/scores', async (_req, res) => {
    try {
      const leaderboard = await getLeaderboard();
      res.json({ leaderboard });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/scores', async (req, res) => {
    try {
      const { sessionId, shieldedAddress, score, questionsUsed, timeElapsed, correct, spyName } = req.body as {
        sessionId: string;
        shieldedAddress: string;
        score: number;
        questionsUsed: number;
        timeElapsed: number;
        correct: boolean;
        spyName?: string;
      };

      if (shieldedAddress === 'DEMO') {
        res.json({ ok: true, newAchievements: [] });
        return;
      }

      await recordGameScore({ session_id: sessionId, shielded_address: shieldedAddress, score, questions_used: questionsUsed, time_elapsed: timeElapsed, correct });
      await recordGameResult(shieldedAddress, correct);

      // Check for newly unlocked achievements
      const newAchievements: Array<{ id: string; name: string; description: string }> = [];
      if (correct && spyName) {
        const achId = achievementForSpy(spyName);
        if (achId) {
          const unlocked = await awardAchievement(shieldedAddress, achId);
          if (unlocked) newAchievements.push(unlocked);
        }
      }

      res.json({ ok: true, newAchievements });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── Player stats & achievements ──

  app.get('/api/players', async (_req, res) => {
    try {
      const stats = await getAllPlayerStats();
      res.json({ players: stats });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/players/:address/stats', async (req, res) => {
    try {
      const stats = await getPlayerStats(req.params.address);
      res.json(stats || { spies_caught: 0, games_played: 0 });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/players/:address/achievements', async (req, res) => {
    try {
      const achievements = await getPlayerAchievements(req.params.address);
      res.json({ achievements });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/achievements', async (_req, res) => {
    try {
      const all = await getAllPlayerAchievements();
      res.json({ definitions: ACHIEVEMENTS, players: all });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── PRC-6 Midnight Platform Integration ──

  const PRC6_CHANNELS = [
    {
      id: 'leaderboard',
      name: 'Leaderboard',
      description: 'Top scores from correctly identified spies.',
      scoreUnit: 'Points',
      sortOrder: 'DESC' as const,
      type: 'cumulative' as const,
    },
    {
      id: 'transactions',
      name: 'Games Played',
      description: 'Total number of games played.',
      scoreUnit: 'Transactions',
      sortOrder: 'DESC' as const,
      type: 'cumulative' as const,
    },
    {
      id: 'verifications',
      name: 'Spies Caught',
      description: 'Total ZK-proven correct spy identifications.',
      scoreUnit: 'Verifications',
      sortOrder: 'DESC' as const,
      type: 'cumulative' as const,
    },
  ];

  const PRC6_ACHIEVEMENTS = ACHIEVEMENTS.map(a => ({
    name: a.id,
    displayName: a.name,
    description: a.description,
    isActive: true,
    ...(a.icon ? { iconURI: a.icon } : {}),
  }));

  // GET /metrics — app metadata, achievement definitions, channel list
  app.get('/metrics', async (_req, res) => {
    res.json({
      name: 'Proof of Spy',
      description: 'A ZK-proof deduction game on the Midnight blockchain. Identify the spy using yes/no questions and submit your guess on-chain.',
      achievements: PRC6_ACHIEVEMENTS,
      channels: PRC6_CHANNELS,
    });
  });

  // GET /metrics/users/:address — user identity + achievements + per-channel stats
  app.get('/metrics/users/:address', async (req, res) => {
    try {
      const { address } = req.params as { address: string };
      const requestedChannels = ([] as string[]).concat((req.query as any).channel ?? []);

      const stats = await getPlayerStats(address);
      if (!stats) return res.status(404).json({ error: `Address '${address}' not found.` });

      const playerAchievements = await getPlayerAchievements(address);

      const identity = {
        address,
        delegatedFrom: [] as string[],
      };

      if (requestedChannels.length === 0) {
        return res.json({ identity, achievements: playerAchievements.map(a => a.id) });
      }

      // Build per-channel stats — need rank, which requires full leaderboard query
      const channels: Record<string, any> = {};

      for (const channelId of requestedChannels) {
        const def = PRC6_CHANNELS.find(c => c.id === channelId);
        if (!def) continue;

        if (channelId === 'leaderboard') {
          // Best score for this address, rank among all correct-guess scores
          const board = await getLeaderboard();
          const entry = board.find(e => e.shielded_address === address);
          const score = entry?.score ?? 0;
          const rank = board.filter(e => e.score > score).length + 1;
          channels[channelId] = { stats: { score, rank, matchesPlayed: stats.games_played } };
        } else if (channelId === 'transactions') {
          const allStats = await getAllPlayerStats();
          allStats.sort((a, b) => b.games_played - a.games_played);
          const rank = allStats.findIndex(s => s.shielded_address === address) + 1;
          channels[channelId] = { stats: { score: stats.games_played, rank: rank > 0 ? rank : 0, matchesPlayed: stats.games_played } };
        } else if (channelId === 'verifications') {
          const allStats = await getAllPlayerStats();
          allStats.sort((a, b) => b.spies_caught - a.spies_caught);
          const rank = allStats.findIndex(s => s.shielded_address === address) + 1;
          channels[channelId] = { stats: { score: stats.spies_caught, rank: rank > 0 ? rank : 0, matchesPlayed: stats.games_played } };
        }
      }

      return res.json({ identity, achievements: playerAchievements.map(a => a.id), channels });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /metrics/:channel — ranked entries for a channel (must be registered after /metrics/users/:address)
  app.get('/metrics/:channel', async (req, res) => {
    try {
      const { channel } = req.params as { channel: string };
      const query = req.query as { limit?: string; offset?: string; startDate?: string; endDate?: string; minAchievements?: string };
      const limit = Math.min(parseInt(query.limit ?? '50', 10) || 50, 1000);
      const offset = parseInt(query.offset ?? '0', 10) || 0;

      const def = PRC6_CHANNELS.find(c => c.id === channel);
      if (!def) return res.status(404).json({ error: `Channel '${channel}' not found.` });

      const now = new Date().toISOString();
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      const startDate = query.startDate ?? oneYearAgo;
      const endDate = query.endDate ?? now;

      type Entry = { rank: number; address: string; displayName: string | null; score: number };
      let allEntries: Entry[] = [];

      if (channel === 'leaderboard') {
        const board = await getLeaderboard();
        // getLeaderboard already returns top 20 correct scores sorted by score DESC
        // Re-fetch all for proper pagination and ranking
        allEntries = board.map((e, i) => ({
          rank: i + 1,
          address: e.shielded_address,
          displayName: null,
          score: e.score,
        }));
      } else if (channel === 'transactions' || channel === 'verifications') {
        const allStats = await getAllPlayerStats();
        const getScore = channel === 'transactions'
          ? (s: { games_played: number }) => s.games_played
          : (s: { spies_caught: number }) => s.spies_caught;
        allStats.sort((a, b) => getScore(b) - getScore(a));
        allEntries = allStats.map((s, i) => ({
          rank: i + 1,
          address: s.shielded_address,
          displayName: null,
          score: getScore(s),
        }));
      }

      const totalPlayers = allEntries.length;
      const totalScore = allEntries.reduce((sum, e) => sum + e.score, 0);
      const entries = allEntries.slice(offset, offset + limit);

      return res.json({ channel, startDate, endDate, totalPlayers, totalScore, entries });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.listen(port, () => {
    logger.info(`Sponsor server listening on :${port}`);
  });
}


function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// This file is part of midnightntwrk/example-counter.
// Copyright (C) 2025 Midnight Foundation
// SPDX-License-Identifier: Apache-2.0

import express from 'express';
import cors from 'cors';
import * as ledger from '@midnight-ntwrk/ledger-v7';
import { fromHex } from '@midnight-ntwrk/midnight-js-utils';
import type { WalletContext } from './api.js';
import { signTransactionIntents, configureProviders, configureGuessWhoProviders, deployGuessWho, createOnChainGame, submitGuessOnChain, getDustBalance } from './api.js';
import { type Logger } from 'pino';
import { createSession, answerQuestion, evaluateGuess } from '../../lib/gameManager.js';
import { recordGameScore, getLeaderboard } from '../../lib/scores.js';
import { claimPoolEntry } from '../../lib/gamePool.js';
import { runPoolRefill } from './poolWorker.js';
import { enqueueOnChain } from './onChainQueue.js';

let logger: Logger;
let walletCtxGlobal: WalletContext | null = null;
let providersGlobal: any = null;
let guessWhoProvidersGlobal: any = null;
let configGlobal: import('./config.js').Config | null = null;
let sharedContractAddress: string | null = null;

// In-memory map from sessionId -> on-chain game_id (bigint)
const sessionGameIds = new Map<string, bigint>();

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

  // Start background pool refill (fire and forget)
  runPoolRefill(guessWhoProvidersGlobal, sharedContractAddress!, logger, walletCtxGlobal!).catch(err => {
    logger.error({ err }, 'Pool refill loop crashed');
  });

  const app = express();
  app.use(cors());
  app.use(express.json());

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
  app.post('/api/session/start', async (_req, res) => {
    try {
      let contractAddress: string | null = sharedContractAddress;
      let gameId: string | null = null;
      let spyIdOverride: number | undefined;
      let saltOverride: string | undefined;

      if (sharedContractAddress) {
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
            sessionGameIds.set(tempSession.sessionId, onChain.gameId);
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
        sessionGameIds.set(result.sessionId, BigInt(gameId));
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
      const onChainGameId = gameId != null ? BigInt(gameId) : sessionGameIds.get(sessionId);

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

      sessionGameIds.delete(sessionId);

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

    res.json({ gameServer: true, proofServer: proofServer.ok, node: node.ok, indexer: indexer.ok });
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
      const { sessionId, shieldedAddress, score, questionsUsed, timeElapsed, correct } = req.body as {
        sessionId: string;
        shieldedAddress: string;
        score: number;
        questionsUsed: number;
        timeElapsed: number;
        correct: boolean;
      };
      await recordGameScore({ session_id: sessionId, shielded_address: shieldedAddress, score, questions_used: questionsUsed, time_elapsed: timeElapsed, correct });
      res.json({ ok: true });
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

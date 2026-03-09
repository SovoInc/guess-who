// This file is part of midnightntwrk/example-counter.
// Copyright (C) 2025 Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import express from 'express';
import cors from 'cors';
import * as ledger from '@midnight-ntwrk/ledger-v7';
import { fromHex } from '@midnight-ntwrk/midnight-js-utils';
import type { WalletContext } from './api.js';
import { signTransactionIntents } from './api.js';
import { type Logger } from 'pino';

let logger: Logger;

export function setSponsorLogger(_logger: Logger): void {
  logger = _logger;
}

export function startSponsorServer(ctx: WalletContext, port = 3001): void {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.post('/sponsor', async (req, res) => {
    logger.info('Sponsor server: received prove tx from web app');
    try {
      const { tx: txHex } = req.body as { tx: string };
      logger.info(`Sponsor server: deserializing tx (hex length: ${txHex.length})`);

      // Deserialize the proved UnboundTransaction from the web app
      const tx = ledger.Transaction.deserialize<ledger.SignatureEnabled, ledger.Proof, ledger.PreBinding>(
        'signature',
        'proof',
        'pre-binding',
        fromHex(txHex),
      );

      logger.info('Sponsor server: balancing transaction with DUST...');
      // Balance with DUST only (genesis wallet pays fees)
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        {
          ttl: new Date(Date.now() + 30 * 60 * 1000),
          tokenKindsToBalance: ['dust'],
        },
      );

      logger.info('Sponsor server: signing transaction intents...');
      // Sign intents using the correct proof markers (works around SDK bug)
      const signFn = (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction, signFn, 'proof');
      if (recipe.balancingTransaction) {
        signTransactionIntents(recipe.balancingTransaction, signFn, 'pre-proof');
      }

      logger.info('Sponsor server: finalizing recipe...');
      // Finalize (bind + merge dust balancing tx)
      const finalized = await ctx.wallet.finalizeRecipe(recipe);

      logger.info('Sponsor server: submitting transaction to node...');
      // Submit via node
      const txId = await ctx.wallet.submitTransaction(finalized);

      logger.info(`Sponsor server: transaction submitted successfully. txId: ${txId}`);
      res.json({ txId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Sponsor server error: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  app.listen(port, () => {
    logger.info(`Sponsor server listening on :${port}`);
  });
}

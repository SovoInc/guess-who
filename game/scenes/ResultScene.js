import * as Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../constants.js';
import { applyCRTOverlay, addFlickerTween } from '../utils/crt.js';
import { getScores } from '../api.js';
import { startSession } from '../api.js';
import { getAddress } from '../wallet.js';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ResultScene' });
  }

  init(data) {
    this.resultData = data;
  }

  create() {
    this.sound = this.registry.get('sound');
    this.cameras.main.fadeIn(600, 0, 0, 0);

    const { won, spy, score, questionsUsed, timeElapsed, proof } = this.resultData;

    // Background
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.BG);

    // Title
    const titleText = won ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED';
    const titleColor = won ? '#00ff41' : '#ff0000';
    const title = this.add.text(GAME_WIDTH / 2, 80, titleText, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '22px',
      color: titleColor,
      align: 'center',
    }).setOrigin(0.5);
    title.setShadow(0, 0, titleColor, 12, true, true);
    addFlickerTween(this, title);

    // Animated reveal
    this._typeLines(won, spy, score, questionsUsed, timeElapsed, proof, this.resultData.cpuWon);

    applyCRTOverlay(this);
  }

  _typeLines(won, spy, score, questionsUsed, timeElapsed, proof, cpuWon) {
    const lines = [];

    lines.push({ text: '', color: '#00aa22' });

    if (cpuWon) {
      lines.push({ text: 'CPU IDENTIFIED YOUR SPY!', color: '#ff4444' });
      lines.push({ text: spy ? spy.name : 'UNKNOWN', color: '#ff4444', large: true });
      lines.push({ text: 'BETTER LUCK NEXT TIME, AGENT', color: '#ff6600' });
    } else if (won) {
      lines.push({ text: 'OPERATIVE IDENTIFIED:', color: '#00aa22' });
      lines.push({ text: spy ? spy.name : 'UNKNOWN', color: '#00ff41', large: true });
      lines.push({ text: '', color: '#00aa22' });
      lines.push({ text: 'ZK PROOF VERIFIED ON PROOF OF SPY', color: '#00aa22' });
      if (proof?.hash) {
        const hashShort = proof.hash.slice(0, 26) + '...';
        lines.push({ text: `HASH: ${hashShort}`, color: '#006622' });
      }
    } else {
      lines.push({ text: spy ? 'THE SPY WAS:' : 'TIME EXPIRED', color: '#ff4444' });
      if (spy) {
        lines.push({ text: spy.name, color: '#ff4444', large: true });
        lines.push({ text: `${spy.rank} | ${spy.role}`, color: '#aa2200' });
        lines.push({ text: `${spy.headwear !== 'none' ? spy.headwear.toUpperCase() : spy.hairShape.toUpperCase()} | ${spy.eyewear !== 'none' ? spy.eyewear.toUpperCase() : 'NO EYEWEAR'} | MARKER: ${spy.marker.toUpperCase()}`, color: '#aa2200' });
      }
    }

    lines.push({ text: '', color: '#00aa22' });
    lines.push({ text: `FINAL SCORE: ${score}`, color: '#00ff41', large: true });
    lines.push({ text: '', color: '#00aa22' });
    lines.push({ text: `QUESTIONS USED: ${questionsUsed}/${10}`, color: '#00aa22' });
    lines.push({ text: `TIME ELAPSED: ${Math.floor(timeElapsed / 60)}:${String(timeElapsed % 60).padStart(2, '0')}`, color: '#00aa22' });

    let y = 160;
    lines.forEach((line, i) => {
      this.time.delayedCall(200 + i * 120, () => {
        const size = line.large ? '14px' : '8px';
        this.add.text(GAME_WIDTH / 2, y, line.text, {
          fontFamily: "'Press Start 2P', monospace",
          fontSize: size,
          color: line.color,
          align: 'center',
        }).setOrigin(0.5);
        y += line.large ? 36 : 22;
      });
    });

    // Leaderboard
    this.time.delayedCall(200 + lines.length * 120 + 300, () => {
      this._showLeaderboard(y + 20);
    });

    // Buttons
    this.time.delayedCall(200 + lines.length * 120 + 800, () => {
      this._buildButtons();
    });
  }

  async _showLeaderboard(y) {
    try {
      const { leaderboard } = await getScores();
      this.add.text(GAME_WIDTH / 2, y, '[ TOP AGENTS ]', {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '7px',
        color: '#00aa22',
      }).setOrigin(0.5);

      (leaderboard || []).slice(0, 5).forEach((entry, i) => {
        const addr = entry.shielded_address || 'UNKNOWN';
        const truncAddr = addr.length > 12 ? addr.slice(0, 5) + '..' + addr.slice(-5) : addr;
        this.add.text(GAME_WIDTH / 2, y + 20 + i * 18, `${i + 1}. ${truncAddr}  ${entry.best_score}`, {
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '6px',
          color: i === 0 ? '#00ff41' : '#00aa22',
        }).setOrigin(0.5);
      });
    } catch (e) {
      // Non-fatal
    }
  }

  _buildButtons() {
    const btnY = GAME_HEIGHT - 80;

    // RETRY
    this._makeBtn(GAME_WIDTH / 2 - 160, btnY, 'RETRY', async () => {
      if (this.sound) this.sound.click();
      const addr = getAddress();
      try {
        const { sessionId, characters } = await startSession();
        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start('GameScene', { sessionId, walletAddress: addr, characters });
        });
      } catch (e) {
        // Fall back to menu
        this.scene.start('MenuScene');
      }
    });

    // MAIN MENU
    this._makeBtn(GAME_WIDTH / 2 + 60, btnY, 'MAIN MENU', () => {
      if (this.sound) this.sound.click();
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('MenuScene');
      });
    });
  }

  _makeBtn(x, y, label, onClick) {
    const w = 200, h = 36;
    const gfx = this.add.graphics();
    const draw = (hover) => {
      gfx.clear();
      gfx.fillStyle(hover ? COLORS.DIM : COLORS.PANEL_BG, 1);
      gfx.fillRect(x, y, w, h);
      gfx.lineStyle(1, hover ? COLORS.PRIMARY : COLORS.BORDER, 1);
      gfx.strokeRect(x, y, w, h);
    };
    draw(false);

    const text = this.add.text(x + w / 2, y + h / 2, label, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '8px',
      color: '#00aa22',
    }).setOrigin(0.5);

    const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => { draw(true); text.setColor('#00ff41'); if (this.sound) this.sound.menuSelect(); });
    hit.on('pointerout',  () => { draw(false); text.setColor('#00aa22'); });
    hit.on('pointerdown', onClick);
  }
}

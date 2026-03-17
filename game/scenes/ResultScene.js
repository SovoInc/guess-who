import * as Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT, ROSTER_FRAME } from '../constants.js';
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

    // Fade out theme music on result screen
    const themeMusic = this.registry.get('themeMusic');
    if (themeMusic && themeMusic.isPlaying) {
      this.tweens.add({
        targets: themeMusic,
        volume: 0,
        duration: 2000,
        onComplete: () => { themeMusic.stop(); this.registry.remove('themeMusic'); },
      });
    }

    const { won, spy, score, questionsUsed, timeElapsed, proof, txId, cpuSpy, playerQuestions, cpuQuestions } = this.resultData;

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

    // CPU spy portrait (revealed on game over)
    this._drawCpuSpyPortrait(cpuSpy || spy, titleColor);

    // Animated reveal
    this._typeLines(won, spy, score, questionsUsed, timeElapsed, proof, this.resultData.cpuWon, txId);
    this._drawQuestionLog(playerQuestions || [], cpuQuestions || []);

    applyCRTOverlay(this);
  }

  _drawQuestionLog(playerQuestions, cpuQuestions) {
    const panelW = 340;
    const panelX = 20;
    const panelY = 280;
    const rowH = 18;
    const itemH = 14;

    // Build combined log: player questions then cpu questions
    const entries = [];
    playerQuestions.forEach(q => {
      entries.push({ who: 'YOU', category: q.category, value: q.value, answer: q.answer });
    });
    cpuQuestions.forEach(q => {
      entries.push({ who: 'CPU', category: q.category, value: q.value, answer: q.answer, wasLie: q.wasLie });
    });

    if (entries.length === 0) return;

    const totalH = 22 + entries.length * rowH + 8;

    // Panel bg
    const gfx = this.add.graphics();
    gfx.fillStyle(0x010a01, 0.92);
    gfx.fillRect(panelX, panelY, panelW, totalH);
    gfx.lineStyle(1, 0x00aa22, 1);
    gfx.strokeRect(panelX, panelY, panelW, totalH);

    this.add.text(panelX + 8, panelY + 6, '[ INTERROGATION LOG ]', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '6px',
      color: '#00ff41',
    });

    entries.forEach((e, i) => {
      const ry = panelY + 22 + i * rowH;
      const whoColor = e.who === 'YOU' ? '#00aa22' : '#ff6600';
      const ansColor = e.answer === 'YES' ? '#00ff41' : '#ff4444';
      const val = e.value.replace(/_/g, ' ').toUpperCase();
      const cat = e.category.replace(/_/g, ' ');
      const lieTag = e.wasLie ? ' [LIE]' : '';

      this.add.text(panelX + 6, ry, e.who, {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '6px',
        color: whoColor,
      });

      this.add.text(panelX + 42, ry, `${cat}: ${val}`, {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '6px',
        color: '#006622',
      });

      this.add.text(panelX + panelW - 8, ry, `${e.answer}${lieTag}`, {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '6px',
        color: e.wasLie ? '#ff4444' : ansColor,
      }).setOrigin(1, 0);
    });
  }

  _drawCpuSpyPortrait(spy, borderColor) {
    if (!spy) return;
    const SIZE = 120;
    const x = GAME_WIDTH - SIZE / 2 - 20;
    const y = 120;

    // Border frame
    const gfx = this.add.graphics();
    gfx.lineStyle(2, borderColor === '#00ff41' ? 0x00ff41 : 0xff0000, 1);
    gfx.strokeRect(x - SIZE / 2 - 2, y - SIZE / 2 - 2, SIZE + 4, SIZE + 4);
    gfx.lineStyle(1, 0x003300, 1);
    gfx.strokeRect(x - SIZE / 2 - 4, y - SIZE / 2 - 4, SIZE + 8, SIZE + 8);

    // Portrait sprite
    if (this.textures.exists('roster')) {
      const frame = ROSTER_FRAME[spy.name?.toLowerCase()] ?? 0;
      this.add.image(x, y, 'roster', frame).setDisplaySize(SIZE, SIZE);
    }

    // Name label
    this.add.text(x, y + SIZE / 2 + 8, spy.name?.toUpperCase() ?? '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '8px',
      color: borderColor,
      align: 'center',
    }).setOrigin(0.5, 0);

    // Role label
    this.add.text(x, y + SIZE / 2 + 22, spy.role?.toUpperCase() ?? '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '6px',
      color: '#006622',
      align: 'center',
    }).setOrigin(0.5, 0);
  }

  _typeLines(won, spy, score, questionsUsed, timeElapsed, proof, cpuWon, txId) {
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
      if (txId) {
        const txShort = String(txId).slice(0, 20) + '...';
        lines.push({ text: `TX: ${txShort}`, color: '#006622' });
      }
      if (proof?.hash) {
        const hashShort = proof.hash.slice(0, 20) + '...';
        lines.push({ text: `PROOF: ${hashShort}`, color: '#006622' });
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

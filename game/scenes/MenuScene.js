import * as Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../constants.js';
import { applyCRTOverlay, addFlickerTween } from '../utils/crt.js';
import { startSession, getScores } from '../api.js';
import { getAddress, connectLace } from '../wallet.js';

const MENU_ITEMS = ['START MISSION', 'HIGH SCORES', 'ABOUT', 'ABORT'];

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
    this.selectedIndex = 0;
    this.overlay = null;
    this.menuReady = true;
    this._connecting = false;
  }

  create() {
    this.sound = this.registry.get('sound');
    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Background
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.BG);

    // Decorative grid lines
    const gridGfx = this.add.graphics();
    gridGfx.lineStyle(1, COLORS.BORDER, 0.5);
    for (let x = 0; x < GAME_WIDTH; x += 80) gridGfx.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y < GAME_HEIGHT; y += 80) gridGfx.lineBetween(0, y, GAME_WIDTH, y);

    // Title
    const title = this.add.text(GAME_WIDTH / 2, 160, 'GHOST\nCYPHER', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '36px',
      color: '#00ff41',
      align: 'center',
      lineSpacing: 12,
    }).setOrigin(0.5);
    title.setShadow(0, 0, '#00ff41', 16, true, true);
    addFlickerTween(this, title);

    this.add.text(GAME_WIDTH / 2, 260, '// IDENTIFY THE SPY //', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '10px',
      color: '#00aa22',
      align: 'center',
    }).setOrigin(0.5);

    // ── Top-right wallet connect button ──
    this._buildWalletButton();

    // If address is in session but contract not in memory (e.g. after page refresh), auto-reconnect
    if (getAddress() && !window.__midnightContract) {
      this._connectWallet();
    }

    // Menu items
    this.menuTexts = MENU_ITEMS.map((label, i) => {
      const disabled = i === 0 && !getAddress();
      const t = this.add.text(GAME_WIDTH / 2, 330 + i * 52, label, {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '13px',
        color: disabled ? '#003300' : '#00aa22',
        align: 'center',
      }).setOrigin(0.5);
      if (!disabled) {
        t.setInteractive({ useHandCursor: true });
        t.on('pointerover', () => {
          this.selectedIndex = i;
          this._updateSelection();
          if (this.sound) this.sound.menuSelect();
        });
        t.on('pointerdown', () => this._select());
      }
      return t;
    });

    // Arrow cursor
    this.arrowText = this.add.text(0, 0, '>', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '13px',
      color: '#00ff41',
    }).setOrigin(1, 0.5);

    // Start with selection on first enabled item
    this.selectedIndex = getAddress() ? 0 : 1;
    this._updateSelection();

    // Keyboard nav
    this.input.keyboard.on('keydown-UP',    () => this._move(-1));
    this.input.keyboard.on('keydown-DOWN',  () => this._move(1));
    this.input.keyboard.on('keydown-W',     () => this._move(-1));
    this.input.keyboard.on('keydown-S',     () => this._move(1));
    this.input.keyboard.on('keydown-ENTER', () => this._select());

    // Version footer
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 24, 'GHOST CYPHER ZK PROOF DEMO — v1.0.0', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '6px',
      color: '#00aa22',
      align: 'center',
    }).setOrigin(0.5);

    applyCRTOverlay(this);
  }

  _buildWalletButton() {
    const addr = getAddress();
    const PAD = 20;

    if (this._walletBtn) this._walletBtn.destroy();
    if (this._walletBtnBg) this._walletBtnBg.destroy();

    if (addr) {
      const label = `${addr.slice(0, 6)}...${addr.slice(-6)}`;
      const t = this.add.text(GAME_WIDTH - PAD, PAD, `◈ ${label}`, {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '7px',
        color: '#00ff41',
      }).setOrigin(1, 0).setDepth(10);
      this._walletBtn = t;
    } else {
      const t = this.add.text(GAME_WIDTH - PAD, PAD, '[ CONNECT WALLET ]', {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '7px',
        color: '#00aa22',
      }).setOrigin(1, 0).setDepth(10).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => t.setColor('#00ff41'));
      t.on('pointerout',  () => t.setColor('#00aa22'));
      t.on('pointerdown', () => this._connectWallet());
      this._walletBtn = t;
    }
  }

  _isDisabled(i) {
    return i === 0 && !getAddress();
  }

  _move(dir) {
    let next = Phaser.Math.Wrap(this.selectedIndex + dir, 0, MENU_ITEMS.length);
    if (this._isDisabled(next)) next = Phaser.Math.Wrap(next + dir, 0, MENU_ITEMS.length);
    this.selectedIndex = next;
    this._updateSelection();
    if (this.sound) this.sound.menuSelect();
  }

  _updateSelection() {
    this.menuTexts.forEach((t, i) => {
      if (this._isDisabled(i)) {
        t.setColor('#003300');
        return;
      }
      t.setColor(i === this.selectedIndex ? '#00ff41' : '#00aa22');
    });
    const selected = this.menuTexts[this.selectedIndex];
    this.arrowText.setPosition(selected.x - selected.width / 2 - 16, selected.y);
  }

  _select() {
    if (!this.menuReady) return;
    if (this._isDisabled(this.selectedIndex)) return;
    if (this.sound) this.sound.click();

    switch (this.selectedIndex) {
      case 0: this._startMission(); break;
      case 1: this._showHighScores(); break;
      case 2: this._showAbout(); break;
      case 3: this._abort(); break;
    }
  }

  async _startMission() {
    const addr = getAddress();
    if (!addr) return;

    this.menuReady = false;
    this._showMessage('INITIATING MISSION...', '#00ff41');

    try {
      const { sessionId, characters } = await startSession();
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('GameScene', { sessionId, walletAddress: addr, characters });
      });
    } catch (err) {
      const msg = err?.message || String(err);
      this._showMessage(`ERROR: ${msg.slice(0, 50)}`, '#ff4444', () => {
        this.menuReady = true;
      });
    }
  }

  async _connectWallet() {
    if (this._connecting) return;
    this._connecting = true;
    this.menuReady = false;

    if (this._walletBtn) {
      this._walletBtn.setText('CONNECTING...').setColor('#00aa22').removeInteractive();
    }

    const setStatus = (msg) => {
      if (this._walletBtn) this._walletBtn.setText(msg);
    };

    try {
      await connectLace(setStatus);

      // Rebuild top-right button showing address
      this._buildWalletButton();

      // Enable START MISSION
      const startBtn = this.menuTexts[0];
      startBtn.setColor('#00aa22');
      startBtn.setInteractive({ useHandCursor: true });
      startBtn.on('pointerover', () => {
        this.selectedIndex = 0;
        this._updateSelection();
        if (this.sound) this.sound.menuSelect();
      });
      startBtn.on('pointerdown', () => this._select());
      this.selectedIndex = 0;
      this._updateSelection();
    } catch (e) {
      const msg = String(e.message || e).slice(0, 40);
      if (this._walletBtn) {
        this._walletBtn.setText('[ CONNECT WALLET ]').setColor('#ff4444');
        this._walletBtn.setInteractive({ useHandCursor: true });
      }
      this._showMessage(msg, '#ff4444', () => {});
    } finally {
      this.menuReady = true;
      this._connecting = false;
    }
  }

  async _showHighScores() {
    this.menuReady = false;
    this._closeOverlay();

    try {
      const { leaderboard } = await getScores();
      this._openOverlay('HIGH SCORES', (panel, startY) => {
        this.add.text(panel.x + 16, startY, 'RANK  AGENT              SCORE', {
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '6px',
          color: '#00aa22',
        });

        if (!leaderboard || leaderboard.length === 0) {
          this.add.text(panel.x + 16, startY + 24, 'NO SCORES YET', {
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '8px',
            color: '#00aa22',
          });
        } else {
          leaderboard.slice(0, 10).forEach((entry, i) => {
            const a = entry.shielded_address || 'UNKNOWN';
            const truncAddr = a.length > 14 ? a.slice(0, 6) + '..' + a.slice(-6) : a;
            const row = `#${String(i + 1).padStart(2, '0')}  ${truncAddr.padEnd(16)}  ${String(entry.best_score).padStart(5)}`;
            this.add.text(panel.x + 16, startY + 20 + i * 22, row, {
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '6px',
              color: i === 0 ? '#00ff41' : '#00aa22',
            });
          });
        }
      });
    } catch (e) {
      this._openOverlay('HIGH SCORES', (panel, startY) => {
        this.add.text(panel.x + 16, startY, 'FAILED TO LOAD SCORES', {
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '7px',
          color: '#ff4444',
        });
      });
    }
  }

  _showAbout() {
    this.menuReady = false;
    this._closeOverlay();
    this._openOverlay('ABOUT', (panel, startY) => {
      const lines = [
        'GHOST CYPHER',
        '',
        'IDENTIFY THE HIDDEN SPY AMONG',
        '16 MILITARY OPERATIVES USING',
        'ZERO-KNOWLEDGE PROOFS.',
        '',
        'YOUR GUESSES ARE VERIFIED ON-CHAIN',
        'WITHOUT REVEALING THE SPY IDENTITY',
        'UNTIL YOU DECLARE.',
        '',
        'CONTROLS:',
        'CLICK CATEGORY BUTTONS TO ASK',
        'CLICK CARDS TO ELIMINATE',
        'DECLARE SPY WHEN CERTAIN',
        '',
        'POWERED BY MIDNIGHT NETWORK',
      ];
      lines.forEach((line, i) => {
        this.add.text(panel.x + 16, startY + i * 18, line, {
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '6px',
          color: line.startsWith('CONTROLS') ? '#00ff41' : '#00aa22',
        });
      });
    });
  }

  _abort() {
    if (this.sound) this.sound.accessDenied();
    const flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.DANGER, 0.2);
    const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'ACCESS DENIED', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '28px',
      color: '#ff0000',
    }).setOrigin(0.5);
    this.time.delayedCall(800, () => { flash.destroy(); msg.destroy(); });
  }

  _showMessage(text, color = '#00ff41', onClose = null) {
    this._closeOverlay();
    const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 80, text, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '9px',
      color,
      align: 'center',
    }).setOrigin(0.5);
    if (onClose) {
      this.time.delayedCall(2000, () => { msg.destroy(); onClose(); });
    }
    this._tempMsg = msg;
  }

  _openOverlay(title, buildContent) {
    this._closeOverlay();
    this.menuReady = false;

    const pw = 700, ph = 400;
    const px = (GAME_WIDTH - pw) / 2;
    const py = (GAME_HEIGHT - ph) / 2;

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.PANEL_BG, 0.97);
    bg.fillRect(px, py, pw, ph);
    bg.lineStyle(2, COLORS.BORDER, 1);
    bg.strokeRect(px, py, pw, ph);
    bg.lineStyle(1, COLORS.DIM, 1);
    const s = 10;
    [[px, py], [px+pw, py], [px, py+ph], [px+pw, py+ph]].forEach(([cx, cy], i) => {
      const dx = i % 2 === 0 ? s : -s;
      const dy = i < 2 ? s : -s;
      bg.beginPath(); bg.moveTo(cx+dx, cy); bg.lineTo(cx, cy); bg.lineTo(cx, cy+dy); bg.strokePath();
    });

    const titleText = this.add.text(px + pw / 2, py + 16, `[ ${title} ]`, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '10px',
      color: '#00ff41',
    }).setOrigin(0.5, 0);

    buildContent({ x: px, y: py, w: pw, h: ph }, py + 46);

    const closeBtn = this.add.text(px + pw - 16, py + 12, 'X', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '9px',
      color: '#00aa22',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerover', () => closeBtn.setColor('#ff4444'));
    closeBtn.on('pointerout',  () => closeBtn.setColor('#00aa22'));
    closeBtn.on('pointerdown', () => { this._closeOverlay(); this.menuReady = true; });

    this.overlay = { bg, titleText, closeBtn };
  }

  _closeOverlay() {
    if (this.overlay) {
      this.overlay.bg.destroy();
      this.overlay.titleText.destroy();
      this.overlay.closeBtn.destroy();
      this.overlay = null;
    }
    if (this._tempMsg) {
      this._tempMsg.destroy();
      this._tempMsg = null;
    }
    this.menuReady = true;
  }
}

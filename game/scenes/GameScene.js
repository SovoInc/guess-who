import * as Phaser from 'phaser';
import {
  COLORS, CHARACTERS, GAME_WIDTH, GAME_HEIGHT,
  CARD_W, CARD_H, CARD_GAP, GRID_X, GRID_Y,
  SIDEBAR_X, SIDEBAR_W, MAX_QUESTIONS, TIMER_SECONDS,
  QUESTION_CATEGORIES, formatQuestion,
} from '../constants.js';
import { applyCRTOverlay } from '../utils/crt.js';
import { CharacterCard } from '../ui/CharacterCard.js';
import { NetworkWindow } from '../ui/NetworkWindow.js';
import { QuestionPanel } from '../ui/QuestionPanel.js';
import { askQuestion, declareSpy, submitScore, getScores } from '../api.js';
import { truncateAddress } from '../wallet.js';

// CPU turn delay after player finishes (ms)
const CPU_TURN_DELAY = 2400;

// Mini card dimensions for CPU board
const MINI_W = 62;
const MINI_H = 56;
const MINI_GAP = 4;

// CPU timer (separate from player)
const CPU_TIMER_SECONDS = TIMER_SECONDS;

// Lie penalty in seconds
const LIE_PENALTY = 10;

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  init(data) {
    this.sessionId = data.sessionId;
    this.walletAddress = data.walletAddress;
    // Use server-generated randomized roster; fall back to static CHARACTERS if missing
    this.characters = data.characters || CHARACTERS;
    this.state = {
      eliminated: new Set(),
      questions: [],
      questionsLeft: MAX_QUESTIONS,
      timeSeconds: TIMER_SECONDS,
      declaringMode: false,
      gameOver: false,
      score: 0,
    };

    // Assign the player a random spy the CPU must find
    this.playerSpyId = Math.floor(Math.random() * 16);

    // CPU state
    this.cpu = {
      eliminated: new Set(),
      remaining: new Set(this.characters.map(c => c.id)),
      questionsLeft: MAX_QUESTIONS,
      timeSeconds: CPU_TIMER_SECONDS,
      done: false,
    };

    // Turn system — randomize who goes first
    this.currentTurn = Math.random() < 0.5 ? 'player' : 'cpu';
    this._turnLocked = false; // prevent double-turns

    // Clear stale references from previous run so create() guards work correctly
    this.questionPanel = null;
    this.turnIndicator = null;
    this._dialogTypeTimer = null;
  }

  create() {
    this.sound = this.registry.get('sound');
    this.cameras.main.fadeIn(500, 0, 0, 0);
    console.log('[midnight] GameScene create — __midnightContract:', window.__midnightContract ? 'SET' : 'NOT SET');

    // Compute responsive layout — all build methods use this._L instead of constants
    this._L = this._computeLayout();
    const L = this._L;

    this.add.rectangle(L.gameW / 2, L.gameH / 2, L.gameW, L.gameH, COLORS.BG);

    this._buildTopBar();
    this._buildCards();
    this._buildSidebar();
    this._buildCpuBoard();
    this._buildPlayerDialogBox();

    this.questionPanel = new QuestionPanel(
      this,
      (category, value) => this._onQuestion(category, value),
      this.sound,
      L.gameW,
      L.gameH,
    );

    this._startTimer();
    this._startCpuTimer();

    // Announce who goes first
    const firstMsg = this.currentTurn === 'player'
      ? 'YOU GO FIRST — ASK A QUESTION'
      : 'CPU GOES FIRST — AWAIT INTERROGATION';
    this.networkWindow.log(firstMsg, '#ffaa00');

    if (this.currentTurn === 'player') {
      this.questionPanel.setDisabled(false);
      this.questionPanel.setEnemyTurn(false);
    } else {
      this.questionPanel.setDisabled(true);
      this.questionPanel.setEnemyTurn(true);
      this.time.delayedCall(CPU_TURN_DELAY, () => this._cpuTakeTurn());
    }

    applyCRTOverlay(this);
  }

  // ── Responsive Layout ────────────────────────────────────────────────

  _computeLayout() {
    const gameW = this.scale.width;
    const gameH = this.scale.height;
    const stacked = gameW < 900;

    const hudH    = 50;
    const qBarH   = 50;
    const gridX   = 20;
    const gridY   = hudH + 8;
    const cardW   = stacked ? Math.floor((gameW - gridX * 2 - 3 * 8) / 4) : CARD_W;
    const cardH   = stacked ? Math.floor(cardW * 0.74) : CARD_H;
    const cardGap = stacked ? 6 : CARD_GAP;

    const gridW   = 4 * cardW + 3 * cardGap;
    const gridH   = 4 * cardH + 3 * cardGap;

    // Column (sidebar) — wide: to right of grid; stacked: below grid
    const colGap  = 12;
    let colX, colY, colW;
    if (stacked) {
      colX = gridX;
      colY = gridY + gridH + colGap;
      colW = gameW - gridX * 2;
    } else {
      colX = gridX + gridW + colGap;
      colY = gridY;
      colW = gameW - colX - 8;
    }

    return {
      gameW, gameH, stacked,
      hudH, qBarH,
      gridX, gridY, cardW, cardH, cardGap,
      gridW, gridH,
      colX, colY, colW,
    };
  }

  // ── Top Bar ──────────────────────────────────────────────────────────

  _buildTopBar() {
    const { gameW, stacked } = this._L;
    const h = 50;
    const fs = stacked ? '7px' : '9px';
    const fs2 = stacked ? '5px' : '7px';

    const gfx = this.add.graphics();
    gfx.fillStyle(COLORS.PANEL_BG, 1);
    gfx.fillRect(0, 0, gameW, h);
    gfx.lineStyle(1, COLORS.DIM, 1);
    gfx.strokeRect(0, 0, gameW, h);

    this.add.text(12, 8, 'MISSION: FIND THE SPY', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: fs,
      color: '#00ff41',
    });

    this.timerText = this.add.text(gameW / 2 - 80, 8, 'TIME: 3:00', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: fs,
      color: '#00ff41',
    });

    this.questionsText = this.add.text(gameW / 2 + 60, 8, `Q: ${MAX_QUESTIONS}`, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: fs,
      color: '#39ff14',
    });

    this.scoreText = this.add.text(gameW - 12, 8, 'SCORE: 0', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: fs,
      color: '#39ff14',
    }).setOrigin(1, 0);

    this.add.text(12, 32, `AGENT: ${truncateAddress(this.walletAddress, 6)}`, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: fs2,
      color: '#00aa22',
    });

    const playerSpy = this.characters[this.playerSpyId];
    this.add.text(gameW / 2 - 80, 32, `YOUR SPY: ${playerSpy.codename}`, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: fs2,
      color: '#ffaa00',
    });

    this.turnIndicator = this.add.text(gameW - 12, 32, '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: fs2,
      color: '#ffaa00',
    }).setOrigin(1, 0);
    this._updateTurnIndicator();
  }

  _updateTurnIndicator(cpuActive) {
    if (!this.turnIndicator) return;
    if (this.state.gameOver) {
      this.turnIndicator.setText('');
      if (this.questionPanel) this.questionPanel.setEnemyTurn(false);
      return;
    }
    const isCpu = this.currentTurn === 'cpu';
    if (isCpu) {
      this.turnIndicator.setText('▶ CPU TURN').setColor('#ff4444');
    } else {
      this.turnIndicator.setText('▶ YOUR TURN').setColor('#00ff41');
    }
    // Only visually disable buttons when CPU is actively taking its turn
    if (this.questionPanel) this.questionPanel.setEnemyTurn(cpuActive === true);
  }

  _updateHUD() {
    const s = this.state;
    const mins = Math.floor(s.timeSeconds / 60);
    const secs = String(s.timeSeconds % 60).padStart(2, '0');
    this.timerText.setText(`TIME: ${mins}:${secs}`);
    this.timerText.setColor(s.timeSeconds < 30 ? '#ff4444' : '#00ff41');
    this.questionsText.setText(`Q: ${s.questionsLeft}`);
    this.questionsText.setColor(s.questionsLeft <= 2 ? '#ffaa00' : '#39ff14');
    this.scoreText.setText(`SCORE: ${this._calcScore(false)}`);
  }

  _calcScore(correct) {
    const s = this.state;
    return (s.questionsLeft * 50) + (s.timeSeconds * 2) + (correct ? 500 : 0);
  }

  // ── Player Card Grid ─────────────────────────────────────────────────

  _buildCards() {
    const { gridX, gridY, cardW, cardH, cardGap } = this._L;
    this.cards = [];
    this.characters.forEach((char, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = gridX + col * (cardW + cardGap);
      const y = gridY + row * (cardH + cardGap);
      const card = new CharacterCard(this, x, y, char, (c) => this._onCardClick(c), cardW, cardH);
      this.cards.push(card);
    });
  }

  _onCardClick(character) {
    const s = this.state;
    if (s.gameOver) return;

    if (s.declaringMode) {
      this._declareSpy(character);
      return;
    }

    if (!s.eliminated.has(character.id)) {
      s.eliminated.add(character.id);
      this.cards[character.id].eliminate();
      if (this.sound) this.sound.eliminate();
      this.networkWindow.log(`ELIMINATED: ${character.codename}`, '#00aa22');
    }
  }

  // ── Sidebar ──────────────────────────────────────────────────────────
  // Column order: dialog box → network window → cpu board → declare button

  _buildSidebar() {
    const { colX, colY, colW, gameH, qBarH } = this._L;
    const GAP = 8;
    const colBottom = gameH - qBarH - 4; // above question bar

    // 1. Dialog box: 116px tall, built in _buildPlayerDialogBox using _sidebarDialogY
    const dialogH = 116;
    this._sidebarDialogY = colY;

    // 2. Network window below dialog
    const netWinY = colY + dialogH + GAP;
    const netWinH = 160;
    this.networkWindow = new NetworkWindow(this, netWinY, netWinH, colX, colW);
    this.networkWindow.log('SECURE CHANNEL OPEN', '#00ff41');
    this.networkWindow.log(`SESSION: ${this.sessionId.slice(0, 16)}...`, '#00cc33');

    // 3. Declare button pinned to bottom of column
    const declareH = 40;
    const declareY = colBottom - declareH;
    this._buildDeclareButton(colX, declareY, colW);

    // 4. CPU board fills the gap between network window and declare button
    this._cpuBoardTopY = netWinY + netWinH + GAP;
    this._cpuBoardMaxH = declareY - GAP - this._cpuBoardTopY;
  }

  _buildDeclareButton(x, y, w) {
    w = w || this._L.colW;
    const h = 40;

    // Store coords BEFORE first draw call
    this._declareX = x;
    this._declareY = y;
    this._declareW = w;
    this._declareH = h;

    this.declareGfx = this.add.graphics();
    this._drawDeclareBtn(false);

    this.declareBtnText = this.add.text(x + w / 2, y + h / 2, '[ DECLARE SPY ]', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '9px',
      color: '#00ff41',
    }).setOrigin(0.5);

    const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => { this._drawDeclareBtn(true); this.declareBtnText.setColor('#39ff14'); });
    hit.on('pointerout',  () => { this._drawDeclareBtn(false); this.declareBtnText.setColor('#00ff41'); });
    hit.on('pointerdown', () => this._enterDeclareMode());
    this.declareBtnHit = hit;
  }

  _drawDeclareBtn(hover) {
    const { _declareX: x, _declareY: y, _declareW: w, _declareH: h } = this;
    if (x === undefined || x === null) return;
    this.declareGfx.clear();
    // Fill — slightly tinted even at rest so border has contrast
    this.declareGfx.fillStyle(hover ? COLORS.DIM : 0x001800, 1);
    this.declareGfx.fillRect(x, y, w, h);
    // Border always visible — bright on hover, standard green at rest
    this.declareGfx.lineStyle(2, hover ? COLORS.ACCENT : COLORS.PRIMARY, 1);
    this.declareGfx.strokeRect(x, y, w, h);
    // Inner glow line at rest to make it pop
    if (!hover) {
      this.declareGfx.lineStyle(1, COLORS.DIM, 0.8);
      this.declareGfx.strokeRect(x + 3, y + 3, w - 6, h - 6);
    }
  }

  // ── CPU Mini Board ────────────────────────────────────────────────────

  _buildCpuBoard() {
    const bx = this._L.colX;
    const by = this._cpuBoardTopY;
    const boardW = this._L.colW;

    // Mini card height: fit 4 rows + header + status within the available height
    const availH = this._cpuBoardMaxH || (4 * (MINI_H + MINI_GAP) + 32 + 14);
    const headerH = 22;
    const statusH = 14;
    const miniAreaH = availH - headerH - statusH;
    // Compute mini card size to fit 4 rows exactly
    const miniH = Math.min(MINI_H, Math.floor((miniAreaH - 3 * MINI_GAP) / 4));
    const boardH = availH;

    this._cpuBoardX = bx;
    this._cpuBoardY = by;
    this._cpuBoardW = boardW;
    this._cpuBoardH = boardH;

    // Panel
    this.cpuBoardGfx = this.add.graphics();
    this._drawCpuBoardPanel();

    this.add.text(bx + 8, by + 6, '[ CPU BOARD ]', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '7px',
      color: '#ff4444',
    });

    // CPU timer display (inside board)
    this.cpuTimerText = this.add.text(bx + boardW - 8, by + 6, 'CPU: 3:00', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '7px',
      color: '#ff4444',
    }).setOrigin(1, 0);

    this.cpuMiniCards = [];

    // Center the 4-column grid inside the board panel
    const gridW = 4 * MINI_W + 3 * MINI_GAP;
    const gridOffX = Math.floor((boardW - gridW) / 2);

    this.characters.forEach((char, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const cx = bx + gridOffX + col * (MINI_W + MINI_GAP);
      const cy = by + headerH + row * (miniH + MINI_GAP);

      const gfx = this.add.graphics();
      gfx.fillStyle(COLORS.PANEL_BG, 1);
      gfx.fillRect(cx, cy, MINI_W, miniH);
      gfx.lineStyle(1, 0x330000, 1);
      gfx.strokeRect(cx, cy, MINI_W, miniH);

      // Only show agent codename
      const nameT = this.add.text(cx + MINI_W / 2, cy + miniH / 2, char.codename, {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '5px',
        color: '#ff4444',
        align: 'center',
      }).setOrigin(0.5, 0.5);

      // Elim overlay (hidden)
      const elimGfx = this.add.graphics();
      elimGfx.fillStyle(0x000000, 0.85);
      elimGfx.fillRect(cx, cy, MINI_W, miniH);
      const elimX = this.add.text(cx + MINI_W / 2, cy + miniH / 2, 'X', {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '16px',
        color: '#880000',
      }).setOrigin(0.5);
      elimGfx.setVisible(false);
      elimX.setVisible(false);

      this.cpuMiniCards.push({ gfx, nameT, elimGfx, elimX });
    });

    // CPU status text at bottom of board
    this.cpuStatusText = this.add.text(bx + 8, by + boardH - statusH, 'CPU: ANALYZING...', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '6px',
      color: '#cc3333',
    });
  }

  _drawCpuBoardPanel() {
    const { _cpuBoardX: bx, _cpuBoardY: by, _cpuBoardW: bw, _cpuBoardH: bh } = this;
    this.cpuBoardGfx.clear();
    this.cpuBoardGfx.fillStyle(COLORS.PANEL_BG, 1);
    this.cpuBoardGfx.fillRect(bx, by, bw, bh);
    this.cpuBoardGfx.lineStyle(1, COLORS.DIM, 1);
    this.cpuBoardGfx.strokeRect(bx, by, bw, bh);
  }

  _cpuEliminate(charId) {
    this.cpu.eliminated.add(charId);
    this.cpu.remaining.delete(charId);
    const mini = this.cpuMiniCards[charId];
    if (mini) {
      mini.elimGfx.setVisible(true);
      mini.elimX.setVisible(true);
      mini.nameT.setAlpha(0.2);
    }
  }

  // ── Shared Radio Dialog Box (bottom-right) ───────────────────────────
  // Switches between player spy avatar and CPU wireframe face like a radio

  _buildPlayerDialogBox() {
    const bw = this._L.colW;
    const bh = 116;
    const bx = this._L.colX;
    const by = this._sidebarDialogY;

    this._dialogX = bx;
    this._dialogY = by;
    this._dialogW = bw;
    this._dialogH = bh;

    const D = 5; // base depth for dialog elements

    // Static frame (never redrawn)
    this.dialogGfx = this.add.graphics().setDepth(D);
    this._drawDialogFrame();

    // Left panel: avatar area — redrawn when radio switches
    this.dialogAvatarGfx = this.add.graphics().setDepth(D + 1);

    // Name badge above dialog (updated on radio switch)
    this.dialogNameBadge = this.add.text(bx + 4, by - 14, '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '7px',
      color: '#00ff41',
    }).setDepth(D + 1);

    // Right panel text lines
    this.dialogLine1 = this.add.text(bx + 70, by + 10, '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '6px',
      color: '#00ff41',
      wordWrap: { width: bw - 74 },
    }).setDepth(D + 1);
    this.dialogLine2 = this.add.text(bx + 70, by + 26, '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '7px',
      color: '#39ff14',
      wordWrap: { width: bw - 74 },
    }).setDepth(D + 1);
    this.dialogLine3 = this.add.text(bx + 70, by + 50, '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '6px',
      color: '#00aa22',
      wordWrap: { width: bw - 74 },
    }).setDepth(D + 1);

    // Chain verify bar — progress track + fill
    this.dialogVerifyBarBg = this.add.graphics().setDepth(D + 1);
    this.dialogVerifyBarBg.fillStyle(0x001a00, 1);
    this.dialogVerifyBarBg.fillRect(bx + 70, by + 72, bw - 78, 8);
    this.dialogVerifyBarBg.lineStyle(1, COLORS.DIM, 1);
    this.dialogVerifyBarBg.strokeRect(bx + 70, by + 72, bw - 78, 8);

    this.dialogVerifyBarFill = this.add.graphics().setDepth(D + 2);

    this.dialogVerifyLabel = this.add.text(bx + 70, by + 84, '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '5px',
      color: '#00aa22',
    }).setDepth(D + 1);

    // Result stamp (hidden until chain resolves)
    this.dialogResultStamp = this.add.text(bx + bw - 8, by + 68, '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '9px',
      color: '#00ff41',
    }).setOrigin(1, 0).setDepth(D + 2);

    // Boot into player spy mode
    this._switchDialogToPlayer();
    this._setDialogIdle();
  }

  _drawDialogFrame() {
    const { _dialogX: bx, _dialogY: by, _dialogW: bw, _dialogH: bh } = this;
    const gfx = this.dialogGfx;
    gfx.clear();

    gfx.fillStyle(0x010a01, 0.97);
    gfx.fillRect(bx, by, bw, bh);
    gfx.lineStyle(2, COLORS.PRIMARY, 1);
    gfx.strokeRect(bx, by, bw, bh);
    gfx.lineStyle(1, COLORS.DIM, 0.5);
    gfx.strokeRect(bx + 3, by + 3, bw - 6, bh - 6);

    // Corner ticks
    const s = 8;
    gfx.lineStyle(2, COLORS.ACCENT, 1);
    gfx.beginPath(); gfx.moveTo(bx,      by + s); gfx.lineTo(bx,      by     ); gfx.lineTo(bx + s,      by     ); gfx.strokePath();
    gfx.beginPath(); gfx.moveTo(bx+bw-s, by     ); gfx.lineTo(bx+bw,   by     ); gfx.lineTo(bx + bw,    by + s ); gfx.strokePath();
    gfx.beginPath(); gfx.moveTo(bx,      by+bh-s); gfx.lineTo(bx,      by+bh  ); gfx.lineTo(bx + s,     by+bh  ); gfx.strokePath();
    gfx.beginPath(); gfx.moveTo(bx+bw-s, by+bh  ); gfx.lineTo(bx+bw,   by+bh  ); gfx.lineTo(bx + bw,   by+bh-s); gfx.strokePath();

    // Avatar / text divider
    gfx.lineStyle(1, COLORS.DIM, 0.5);
    gfx.beginPath();
    gfx.moveTo(bx + 64, by + 6);
    gfx.lineTo(bx + 64, by + bh - 6);
    gfx.strokePath();
  }

  // Switch left panel to player spy portrait
  _switchDialogToPlayer() {
    const { _dialogX: bx, _dialogY: by, _dialogH: bh } = this;
    const gfx = this.dialogAvatarGfx;
    gfx.clear();

    const spy = this.characters[this.playerSpyId];
    const cx = bx + 32;
    const cy = by + bh / 2 - 4;

    gfx.fillStyle(COLORS.DIM, 1);
    gfx.fillRect(cx - 15, cy - 32, 30, 36);
    gfx.fillStyle(COLORS.TEXT_DIM, 0.9);
    gfx.fillRect(cx - 22, cy + 4, 44, 18);

    const feat = spy.feature;
    gfx.lineStyle(1, COLORS.PRIMARY, 0.85);
    if (feat === 'GLASSES') {
      gfx.strokeRect(cx - 13, cy - 22, 10, 7);
      gfx.strokeRect(cx + 3,  cy - 22, 10, 7);
      gfx.beginPath(); gfx.moveTo(cx - 3, cy - 18); gfx.lineTo(cx + 3, cy - 18); gfx.strokePath();
    } else if (feat === 'CYBERNETIC_EYE') {
      gfx.fillStyle(COLORS.DANGER, 1);
      gfx.fillCircle(cx + 7, cy - 20, 4);
    } else if (feat === 'BEARD') {
      gfx.fillStyle(COLORS.DIM, 1);
      gfx.fillRect(cx - 12, cy - 4, 24, 9);
    } else if (feat === 'SCAR') {
      gfx.lineStyle(1, COLORS.DANGER, 0.9);
      gfx.beginPath(); gfx.moveTo(cx - 4, cy - 26); gfx.lineTo(cx + 2, cy - 14); gfx.strokePath();
    } else if (feat === 'BALD') {
      gfx.lineStyle(1, COLORS.PRIMARY, 0.3);
      gfx.strokeRect(cx - 15, cy - 32, 30, 2);
    } else if (feat === 'TATTOO') {
      gfx.lineStyle(1, COLORS.DIM, 0.9);
      gfx.strokeCircle(cx - 9, cy - 12, 5);
    } else if (feat === 'HEADSET') {
      // Arc over head + earpiece + mic wire
      gfx.lineStyle(1, COLORS.PRIMARY, 0.9);
      gfx.beginPath();
      gfx.arc(cx, cy - 26, 17, Math.PI, 0, false);
      gfx.strokePath();
      gfx.fillStyle(COLORS.PRIMARY, 1);
      gfx.fillCircle(cx + 17, cy - 20, 3);
      gfx.lineStyle(1, COLORS.PRIMARY, 0.7);
      gfx.beginPath();
      gfx.moveTo(cx + 17, cy - 17);
      gfx.lineTo(cx + 17, cy - 8);
      gfx.strokePath();
    } else if (feat === 'EYE_PATCH') {
      // Dark patch over left eye + strap
      gfx.fillStyle(0x000000, 1);
      gfx.fillRect(cx - 14, cy - 24, 12, 7);
      gfx.lineStyle(1, COLORS.DIM, 1);
      gfx.strokeRect(cx - 14, cy - 24, 12, 7);
      gfx.beginPath();
      gfx.moveTo(cx - 14, cy - 21);
      gfx.lineTo(cx + 14, cy - 21);
      gfx.strokePath();
    }

    if (this.dialogNameBadge) {
      this.dialogNameBadge.setText(`▶ ${spy.codename}`).setColor('#00ff41');
    }

    this._dialogMode = 'player';
  }

  // Switch left panel to CPU wireframe face
  _switchDialogToCpu() {
    const { _dialogX: bx, _dialogY: by, _dialogH: bh } = this;
    const gfx = this.dialogAvatarGfx;
    gfx.clear();

    // Fill avatar panel background black so player portrait is fully replaced
    gfx.fillStyle(0x000000, 1);
    gfx.fillRect(bx + 4, by + 4, 58, bh - 8);

    const cx = bx + 33;
    const cy = by + bh / 2 - 2;
    this._drawPolygonalFace(gfx, cx, cy, 34);

    if (this.dialogNameBadge) {
      this.dialogNameBadge.setText('▶ UNKNOWN').setColor('#ff4444');
    }

    this._dialogMode = 'cpu';
  }

  _setDialogIdle() {
    if (this.dialogLine1) this.dialogLine1.setText('AWAITING...').setColor('#00aa22');
    if (this.dialogLine2) this.dialogLine2.setText('').setColor('#39ff14');
    if (this.dialogLine3) this.dialogLine3.setText('').setColor('#00aa22');
    this._clearVerify();
  }

  // Type text into a dialog text object at 50ms/char, calls onDone when complete
  _typeDialogText(textObj, sentence, color, onDone) {
    if (this._dialogTypeTimer) { this._dialogTypeTimer.remove(); this._dialogTypeTimer = null; }
    if (!textObj || !textObj.scene) { if (onDone) onDone(); return; }
    textObj.setText('').setColor(color);
    let charIdx = 0;
    const typeChar = () => {
      if (!textObj.scene) return;
      charIdx++;
      textObj.setText(sentence.slice(0, charIdx));
      if (charIdx < sentence.length) {
        this._dialogTypeTimer = this.time.delayedCall(50, typeChar);
      } else {
        this._dialogTypeTimer = null;
        if (onDone) onDone();
      }
    };
    this._dialogTypeTimer = this.time.delayedCall(50, typeChar);
  }

  // Quick static flicker on the dialog avatar panel then calls onDone
  _dialogStaticFlicker(onDone) {
    const { _dialogX: bx, _dialogY: by, _dialogH: bh } = this;
    const gfx = this.dialogAvatarGfx;
    let flickers = 0;
    const MAX = 6;
    const flick = () => {
      gfx.clear();
      // Draw random noise pixels to simulate static
      for (let i = 0; i < 120; i++) {
        const px = bx + 4 + Math.random() * 58;
        const py = by + 4 + Math.random() * (bh - 8);
        const c = Math.random() > 0.5 ? 0x00ff41 : 0x003300;
        gfx.fillStyle(c, Math.random() * 0.8 + 0.2);
        gfx.fillRect(px, py, 2 + Math.floor(Math.random() * 6), 1);
      }
      flickers++;
      if (flickers < MAX) {
        this.time.delayedCall(40, flick);
      } else {
        gfx.clear();
        if (onDone) onDone();
      }
    };
    flick();
  }

  _setDialogQuestion(who, category, value) {
    const isCpu = who === 'cpu';
    const labelColor = isCpu ? '#ff6600' : '#00aa22';
    const label = isCpu ? '[ CPU ASKS ]' : '[ YOU ASK ]';
    const textColor = isCpu ? '#ff8888' : '#39ff14';
    const sentence = formatQuestion(category, value);

    this._clearVerify();
    if (this.dialogLine1) this.dialogLine1.setText(label).setColor(labelColor);
    if (this.dialogLine3) this.dialogLine3.setText('').setColor(textColor);

    this._typeDialogText(this.dialogLine2, sentence, textColor, null);
  }

  _clearVerify() {
    if (this._verifyTimer) { this._verifyTimer.remove(); this._verifyTimer = null; }
    if (this._dialogTypeTimer) { this._dialogTypeTimer.remove(); this._dialogTypeTimer = null; }
    if (this.dialogVerifyBarFill) this.dialogVerifyBarFill.clear();
    if (this.dialogVerifyLabel) this.dialogVerifyLabel.setText('').setColor('#00aa22');
    if (this.dialogResultStamp) this.dialogResultStamp.setText('');
  }

  // Temporarily inject YES/NO buttons into the dialog right panel for CPU interrogation
  _showDialogAnswerButtons(onAnswer) {
    const { _dialogX: bx, _dialogY: by, _dialogW: bw, _dialogH: bh } = this;
    // Right panel starts at bx+66 (after avatar divider), has width bw-70
    const panelX = bx + 66;
    const panelW = bw - 70;
    const gap = 6;
    const btnW = Math.floor((panelW - gap) / 2);
    const btnH = 24;
    const btnY = by + bh - btnH - 6; // flush to bottom of dialog

    const yesX = panelX + 2;
    const noX  = yesX + btnW + gap;

    const yesBg = this.add.graphics();
    yesBg.fillStyle(0x001a00, 1);
    yesBg.fillRect(yesX, btnY, btnW, btnH);
    yesBg.lineStyle(2, COLORS.PRIMARY, 1);
    yesBg.strokeRect(yesX, btnY, btnW, btnH);

    const yesT = this.add.text(yesX + btnW / 2, btnY + btnH / 2, 'YES', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '8px',
      color: '#00ff41',
    }).setOrigin(0.5).setDepth(10);

    const noBg = this.add.graphics();
    noBg.fillStyle(0x001a00, 1);
    noBg.fillRect(noX, btnY, btnW, btnH);
    noBg.lineStyle(2, COLORS.DIM, 1);
    noBg.strokeRect(noX, btnY, btnW, btnH);

    const noT = this.add.text(noX + btnW / 2, btnY + btnH / 2, 'NO', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '8px',
      color: '#00cc33',
    }).setOrigin(0.5).setDepth(10);

    const destroy = () => {
      yesBg.destroy(); yesT.destroy(); yesHit.destroy();
      noBg.destroy();  noT.destroy();  noHit.destroy();
    };

    // Use setDepth so hit zones sit above the question bar graphics
    const yesHit = this.add.rectangle(yesX + btnW / 2, btnY + btnH / 2, btnW, btnH, 0, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(10);
    yesHit.on('pointerover', () => { yesT.setColor('#39ff14'); if (this.sound) this.sound.menuSelect(); });
    yesHit.on('pointerout',  () => yesT.setColor('#00ff41'));
    yesHit.on('pointerdown', () => { if (this.sound) this.sound.click(); destroy(); onAnswer('YES'); });

    const noHit = this.add.rectangle(noX + btnW / 2, btnY + btnH / 2, btnW, btnH, 0, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(10);
    noHit.on('pointerover', () => { noT.setColor('#00ff41'); if (this.sound) this.sound.menuSelect(); });
    noHit.on('pointerout',  () => noT.setColor('#00cc33'));
    noHit.on('pointerdown', () => { if (this.sound) this.sound.click(); destroy(); onAnswer('NO'); });
  }

  // Run 0→100% bar, then flash TRUE/FALSE result (ZK selective disclosure style)
  // truthValue: actual boolean result to reveal at 100%
  // onComplete: called after result flashes (so game logic can continue)
  _runChainVerify(truthValue, onComplete) {
    this._clearVerify();
    const { _dialogX: bx, _dialogY: by, _dialogW: bw } = this;
    const barX = bx + 70;
    const barY = by + 72;
    const barMaxW = bw - 78;

    let pct = 0;
    const totalMs = 1800;
    const tickMs = 40;
    const steps = totalMs / tickMs;
    const stepSize = 100 / steps;

    // Slightly erratic speed — stalls and bursts like real chain confirmation
    this._verifyTimer = this.time.addEvent({
      delay: tickMs,
      repeat: steps + 10,
      callback: () => {
        if (pct >= 100) return;

        // Random stutter: occasionally slow down
        const jitter = Math.random() < 0.15 ? 0 : stepSize * (0.5 + Math.random() * 1.5);
        pct = Math.min(100, pct + jitter);

        const fillW = Math.floor((pct / 100) * barMaxW);
        const barColor = pct < 50 ? 0xffaa00 : pct < 85 ? 0x39ff14 : 0x00ff41;

        this.dialogVerifyBarFill.clear();
        this.dialogVerifyBarFill.fillStyle(barColor, 0.9);
        this.dialogVerifyBarFill.fillRect(barX, barY, fillW, 8);

        this.dialogVerifyLabel.setText(`⛓ VERIFYING: ${pct.toFixed(0)}%`).setColor('#00aa22');

        if (pct >= 100) {
          // Resolve: flash TRUE / FALSE
          const resultText = truthValue ? 'TRUE' : 'FALSE';
          const resultColor = truthValue ? '#00ff41' : '#ff4444';

          this.dialogVerifyLabel.setText('⛓ CHAIN RESOLVED').setColor('#00aa22');
          this.dialogResultStamp.setText(resultText).setColor(resultColor);

          // Stamp flash tween
          this.dialogResultStamp.setAlpha(0);
          this.tweens.add({
            targets: this.dialogResultStamp,
            alpha: { from: 0, to: 1 },
            duration: 120,
            yoyo: false,
            onComplete: () => {
              this.tweens.add({
                targets: this.dialogResultStamp,
                alpha: { from: 1, to: 0.6 },
                duration: 300,
                yoyo: true,
                repeat: 2,
              });
            },
          });

          if (onComplete) this.time.delayedCall(500, onComplete);
        }
      },
    });
  }

  _drawPolygonalFace(gfx, cx, cy, r) {
    // Low-poly wireframe face — matrix green, retro AI style
    // All coordinates are relative to (cx, cy), scaled by r (nominal r=44)
    const s = r / 44; // scale factor

    // Define landmark vertices (x, y) relative to cx, cy
    const v = {
      // Crown / top of skull
      topCenter:   [  0, -52],
      topLeft:     [-22, -46],
      topRight:    [ 22, -46],
      // Forehead band
      fhLeft:      [-28, -32],
      fhCenter:    [  0, -34],
      fhRight:     [ 28, -32],
      // Brow ridge
      browLeft:    [-24, -20],
      browMid:     [  0, -22],
      browRight:   [ 24, -20],
      // Eye sockets
      eyeLOut:     [-26, -12],
      eyeLIn:      [-10, -12],
      eyeRIn:      [ 10, -12],
      eyeROut:     [ 26, -12],
      eyeLTop:     [-18,  -17],
      eyeRTop:     [ 18,  -17],
      eyeLBot:     [-18,   -7],
      eyeRBot:     [ 18,   -7],
      // Cheekbones
      cheekLeft:   [-34,   2],
      cheekRight:  [ 34,   2],
      // Nose bridge + tip
      noseBridge:  [  0,  -8],
      noseLeft:    [ -8,   4],
      noseRight:   [  8,   4],
      noseTip:     [  0,   6],
      // Mouth
      mouthLeft:   [-14,  18],
      mouthCenter: [  0,  16],
      mouthRight:  [ 14,  18],
      mouthBot:    [  0,  24],
      // Chin / jaw
      jawLeft:     [-28,  14],
      jawRight:    [ 28,  14],
      chinLeft:    [-18,  36],
      chinRight:   [ 18,  36],
      chin:        [  0,  42],
      // Neck/shoulder hints
      neckLeft:    [-12,  52],
      neckRight:   [ 12,  52],
      shoulderL:   [-36,  62],
      shoulderR:   [ 36,  62],
    };

    // Convert to absolute pixel coords
    const p = {};
    for (const [k, [dx, dy]] of Object.entries(v)) {
      p[k] = [cx + dx * s, cy + dy * s];
    }

    // Triangle faces to draw (filled very subtly, then wireframe on top)
    const triangles = [
      // Skull top
      ['topCenter', 'topLeft',  'fhLeft'],
      ['topCenter', 'topRight', 'fhRight'],
      ['topCenter', 'fhLeft',   'fhCenter'],
      ['topCenter', 'fhCenter', 'fhRight'],
      // Forehead
      ['fhLeft',  'fhCenter', 'browLeft'],
      ['fhCenter','fhRight',  'browRight'],
      ['fhCenter','browLeft', 'browMid'],
      ['fhCenter','browMid',  'browRight'],
      // Brow to eye
      ['browLeft',  'eyeLOut', 'eyeLTop'],
      ['browLeft',  'browMid', 'eyeLTop'],
      ['browMid',   'eyeRTop', 'browRight'],
      ['browRight', 'eyeROut', 'eyeRTop'],
      // Eye left socket
      ['eyeLOut', 'eyeLTop', 'eyeLBot'],
      ['eyeLTop', 'eyeLIn',  'eyeLBot'],
      // Eye right socket
      ['eyeROut', 'eyeRTop', 'eyeRBot'],
      ['eyeRTop', 'eyeRIn',  'eyeRBot'],
      // Nose bridge
      ['eyeLIn',  'noseBridge', 'eyeRIn'],
      ['eyeLBot', 'noseLeft',   'noseBridge'],
      ['eyeRBot', 'noseBridge', 'noseRight'],
      ['noseLeft','noseTip',    'noseRight'],
      // Cheeks
      ['eyeLOut', 'cheekLeft',  'eyeLBot'],
      ['eyeLBot', 'cheekLeft',  'jawLeft'],
      ['eyeROut', 'eyeRBot',    'cheekRight'],
      ['eyeRBot', 'jawRight',   'cheekRight'],
      // Upper lip area
      ['noseLeft',  'mouthLeft',   'noseTip'],
      ['noseRight', 'noseTip',     'mouthRight'],
      ['noseTip',   'mouthLeft',   'mouthCenter'],
      ['noseTip',   'mouthCenter', 'mouthRight'],
      // Jaw
      ['jawLeft',  'mouthLeft',  'cheekLeft'],
      ['jawRight', 'cheekRight', 'mouthRight'],
      ['jawLeft',  'chinLeft',   'mouthLeft'],
      ['jawRight', 'mouthRight', 'chinRight'],
      ['mouthLeft','mouthBot',   'chinLeft'],
      ['mouthRight','chinRight', 'mouthBot'],
      ['chinLeft', 'chin',       'chinRight'],
      // Neck/shoulder
      ['chinLeft',  'neckLeft',  'chin'],
      ['chinRight', 'chin',      'neckRight'],
      ['neckLeft',  'shoulderL', 'neckRight'],
      ['neckRight', 'shoulderR', 'neckLeft'],
    ];

    // Draw filled triangles (very dim green tint)
    for (const [a, b, c] of triangles) {
      if (!p[a] || !p[b] || !p[c]) continue;
      gfx.fillStyle(0x003300, 0.18);
      gfx.fillTriangle(p[a][0], p[a][1], p[b][0], p[b][1], p[c][0], p[c][1]);
    }

    // Draw wireframe edges
    const edges = new Set();
    const addEdge = (a, b) => {
      const key = [a, b].sort().join('|');
      edges.add(key);
    };
    for (const [a, b, c] of triangles) {
      addEdge(a, b); addEdge(b, c); addEdge(a, c);
    }

    gfx.lineStyle(1, 0x00ff41, 0.65);
    for (const key of edges) {
      const [a, b] = key.split('|');
      if (!p[a] || !p[b]) continue;
      gfx.beginPath();
      gfx.moveTo(p[a][0], p[a][1]);
      gfx.lineTo(p[b][0], p[b][1]);
      gfx.strokePath();
    }

    // Draw glowing nodes at each vertex
    const nodeVerts = Object.values(p);
    for (const [nx, ny] of nodeVerts) {
      // Outer soft glow
      gfx.fillStyle(0x00ff41, 0.08);
      gfx.fillCircle(nx, ny, 4);
      // Inner bright dot
      gfx.fillStyle(0x39ff14, 0.9);
      gfx.fillCircle(nx, ny, 1.2);
    }

    // Accent: slightly brighter nodes on key landmarks
    const accentNodes = ['eyeLTop', 'eyeRTop', 'noseTip', 'mouthCenter', 'chin', 'topCenter'];
    for (const k of accentNodes) {
      if (!p[k]) continue;
      gfx.fillStyle(0x00ff41, 0.2);
      gfx.fillCircle(p[k][0], p[k][1], 5);
      gfx.fillStyle(0x39ff14, 1);
      gfx.fillCircle(p[k][0], p[k][1], 2);
    }
  }

  // ── Timers ────────────────────────────────────────────────────────────

  _startTimer() {
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (this.state.gameOver) return;
        this.state.timeSeconds--;
        this._updateHUD();
        if (this.state.timeSeconds <= 0) {
          this.state.timeSeconds = 0;
          this._timeUp();
        }
      },
      loop: true,
    });
  }

  _startCpuTimer() {
    this.cpuTimerEvent = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (this.state.gameOver || this.cpu.done) return;
        this.cpu.timeSeconds--;
        this._updateCpuTimerHUD();
        if (this.cpu.timeSeconds <= 0) {
          this.cpu.timeSeconds = 0;
          this._cpuTimeUp();
        }
      },
      loop: true,
    });
  }

  _updateCpuTimerHUD() {
    if (!this.cpuTimerText) return;
    const t = this.cpu.timeSeconds;
    const mins = Math.floor(t / 60);
    const secs = String(t % 60).padStart(2, '0');
    this.cpuTimerText.setText(`CPU: ${mins}:${secs}`);
    this.cpuTimerText.setColor(t < 30 ? '#ff0000' : '#ff4444');
  }

  _cpuTimeUp() {
    if (this.cpu.done || this.state.gameOver) return;
    this.cpu.done = true;
    this.networkWindow.log('CPU TIMER EXPIRED — CPU LOSES!', '#00ff41');
    this.cpuStatusText.setText('CPU: TIME EXPIRED');
    // Player can keep playing
  }

  _timeUp() {
    this.state.gameOver = true;
    this.questionPanel.setDisabled(true);
    this.networkWindow.log('TIME EXPIRED — MISSION FAILED', '#ff4444');
    if (this.sound) this.sound.proofFail();
    this.time.delayedCall(2000, () => {
      this._endGame({ won: false, spy: null, score: 0, questionsUsed: MAX_QUESTIONS - this.state.questionsLeft, timeElapsed: TIMER_SECONDS });
    });
  }

  _penalizePlayerTime(seconds) {
    this.state.timeSeconds = Math.max(0, this.state.timeSeconds - seconds);
    this._updateHUD();
    if (this.timerText) {
      this.timerText.setColor('#ff0000');
      this.time.delayedCall(800, () => {
        if (this.timerText) this.timerText.setColor(this.state.timeSeconds < 30 ? '#ff4444' : '#00ff41');
      });
    }
    this.networkWindow.log(`⚠ YOU: LIE DETECTED — -${seconds}s`, '#ff4444');
  }

  _penalizeCpuTime(seconds) {
    this.cpu.timeSeconds = Math.max(0, this.cpu.timeSeconds - seconds);
    this._updateCpuTimerHUD();
    if (this.cpuTimerText) {
      this.cpuTimerText.setColor('#ff0000');
      this.time.delayedCall(800, () => {
        if (this.cpuTimerText) this._updateCpuTimerHUD();
      });
    }
    this.networkWindow.log(`⚠ CPU: DECEPTION COST — -${seconds}s`, '#ff6600');
  }

  // ── Player Questions ─────────────────────────────────────────────────

  _onQuestion(category, value) {
    const s = this.state;
    if (s.gameOver || s.questionsLeft <= 0 || s.declaringMode) return;
    if (this.currentTurn !== 'player' || this._turnLocked) return;

    this._turnLocked = true;
    s.questionsLeft--;
    this._updateHUD();
    this.questionPanel.setDisabled(true);

    // Phase 1: player avatar + type out question; fetch answer in parallel
    this._switchDialogToPlayer();
    const sentence = formatQuestion(category, value);
    if (this.dialogLine1) this.dialogLine1.setText('[ YOU ASK ]').setColor('#00aa22');
    if (this.dialogLine3) this.dialogLine3.setText('').setColor('#39ff14');

    let typingDone = false;
    let apiResult = null;
    let apiError = null;

    const proceed = () => {
      if (!typingDone || (apiResult === null && apiError === null)) return;

      if (apiError) {
        this.networkWindow.log('NETWORK ERROR', '#ff4444');
        s.questionsLeft++;
        this._turnLocked = false;
        this.questionPanel.setDisabled(false);
        return;
      }

      const { answer } = apiResult;
      s.questions.push({ category, value, answer });
      const answerBool = answer === 'YES';
      const color = answerBool ? '#00ff41' : '#ff4444';

      this.networkWindow.log(`YOU: ${sentence}`, '#00cc33');
      this.networkWindow.log(`INTEL: ${answerBool ? 'CONFIRMED.' : 'NEGATIVE.'}`, color);
      if (this.sound) answerBool ? this.sound.beepHigh() : this.sound.beepLow();

      // Static flicker → switch to enemy avatar → type answer
      this._dialogStaticFlicker(() => {
        this._switchDialogToCpu();
        if (this.dialogLine1) this.dialogLine1.setText('[ RESPONSE ]').setColor('#ff6600');
        this._typeDialogText(this.dialogLine2, `→ ${answer}`, color, () => {
          this._runChainVerify(answerBool, () => {
            this.networkWindow.log(`⛓ CHAIN: ${answerBool ? 'TRUE' : 'FALSE'}`, answerBool ? '#00ff41' : '#ff4444');

            if (!answerBool && !this.cpu.done) {
              this._penalizeCpuTime(LIE_PENALTY);
            }

            if (s.questionsLeft === 0) {
              this.networkWindow.log('QUESTIONS EXHAUSTED — DECLARE NOW', '#ffaa00');
              this._turnLocked = false;
              this._enterDeclareMode();
            } else {
              this.currentTurn = 'cpu';
              this._updateTurnIndicator(true);
              this._turnLocked = false;

              if (!s.gameOver && !this.cpu.done) {
                this.time.delayedCall(CPU_TURN_DELAY, () => this._cpuTakeTurn());
              }
            }
          });
        });
      });
    };

    // Type out question, signal done
    this._typeDialogText(this.dialogLine2, sentence, '#39ff14', () => {
      typingDone = true;
      proceed();
    });

    // Fetch answer in parallel
    askQuestion(this.sessionId, category, value).then(result => {
      apiResult = result;
      proceed();
    }).catch(e => {
      apiError = e;
      proceed();
    });
  }

  // ── Declare ───────────────────────────────────────────────────────────

  _enterDeclareMode() {
    if (this.state.declaringMode || this.state.gameOver) return;
    this.state.declaringMode = true;
    this.questionPanel.setDisabled(true);
    this.networkWindow.log('SELECT OPERATIVE TO DECLARE', '#ffaa00');
    if (this.sound) this.sound.beepHigh();

    this.cards.forEach(card => {
      if (!this.state.eliminated.has(card.character.id)) {
        card.setPulsing(true);
      }
    });

    this.declareBtnText.setText('[ CANCEL ]');
    this.declareBtnHit.removeAllListeners();
    this.declareBtnHit.on('pointerdown', () => this._cancelDeclare());
  }

  _cancelDeclare() {
    this.state.declaringMode = false;
    this.cards.forEach(card => card.setPulsing(false));
    this.declareBtnText.setText('[ DECLARE SPY ]');
    this.declareBtnHit.removeAllListeners();
    this.declareBtnHit.on('pointerdown', () => this._enterDeclareMode());
    if (this.state.questionsLeft > 0 && this.currentTurn === 'player') {
      this.questionPanel.setDisabled(false);
    }
  }

  async _declareSpy(character) {
    if (this.state.gameOver) return;
    this.state.gameOver = true;
    this.state.declaringMode = false;
    this.cpu.done = true;

    this.cards.forEach(card => card.setPulsing(false));
    this.questionPanel.setDisabled(true);
    this.networkWindow.log(`DECLARING: ${character.codename}`, '#00ff41');

    this.networkWindow.runProofAnimation(async () => {
      try {
        const result = await declareSpy(this.sessionId, character.id, this.walletAddress);
        const score = this._calcScore(result.correct);

        this.networkWindow.showProofResult(result.correct, result.proof?.hash, this.sound);

        try { await submitScore(this.walletAddress || 'ANONYMOUS', score); } catch (e) {}

        // Increment on-chain counter for every spy declaration
        try {
          let contract = window.__midnightContract;

          // Re-join if contract was lost (e.g. page reload without full reconnect)
          if (!contract && window.__midnightConnectedApi) {
            this.networkWindow.log('REJOINING CONTRACT...', '#00aa22');
            const { joinCounter } = await import('/src/midnight.ts');
            const result = await joinCounter(
              window.__midnightConnectedApi,
              import.meta.env.VITE_CONTRACT_ADDRESS,
            );
            window.__midnightContract = result;
            contract = result;
          }

          if (!contract) {
            this.networkWindow.log('NO WALLET — SKIPPING ON-CHAIN', '#ff8800');
          } else {
            const { increment } = await import('/src/midnight.ts');
            this.networkWindow.log('SUBMITTING ZK PROOF ON-CHAIN...', '#00aa22');
            const txData = await increment(contract.counterContract);
            this.networkWindow.log(`TX: ${String(txData.txId).slice(0, 20)}...`, '#00ff41');
          }
        } catch (e) {
          this.networkWindow.log(`ON-CHAIN ERR: ${String(e.message || e).slice(0, 40)}`, '#ff4444');
          console.error('[midnight] increment failed:', e);
        }

        this.time.delayedCall(1500, () => {
          this._endGame({
            won: result.correct,
            spy: result.spy,
            score,
            questionsUsed: MAX_QUESTIONS - this.state.questionsLeft,
            timeElapsed: TIMER_SECONDS - this.state.timeSeconds,
            proof: result.proof,
          });
        });
      } catch (e) {
        this.networkWindow.log('NETWORK ERROR', '#ff4444');
        this.state.gameOver = false;
        this.cpu.done = false;
      }
    }, this.sound);
  }

  _endGame(data) {
    if (this.timerEvent) this.timerEvent.remove();
    if (this.cpuTimerEvent) this.cpuTimerEvent.remove();
    if (this.cpuTurnTimer) this.cpuTurnTimer.remove();
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('ResultScene', data);
    });
  }

  // ── CPU Opponent Logic ────────────────────────────────────────────────

  _cpuTakeTurn() {
    if (this.state.gameOver || this.cpu.done || this.currentTurn !== 'cpu') return;

    // If CPU has narrowed down to 1 suspect, declare
    if (this.cpu.remaining.size === 1) {
      this._cpuDeclare([...this.cpu.remaining][0]);
      return;
    }

    // If no questions left, declare best guess
    if (this.cpu.questionsLeft <= 0) {
      this._cpuDeclare([...this.cpu.remaining][0]);
      return;
    }

    const question = this._cpuPickQuestion();
    if (!question) {
      this._endCpuTurn();
      return;
    }

    this.cpu.questionsLeft--;
    this.cpuStatusText.setText(`CPU: ASKING...`);
    if (this.sound) this.sound.proofTick();

    // Static flicker → CPU wireframe face → type question → show answer buttons
    this._dialogStaticFlicker(() => {
      this._switchDialogToCpu();
      this._setDialogQuestion('cpu', question.category, question.value);
    });

    // Inject YES/NO answer buttons after question has had time to type out
    const questionLen = formatQuestion(question.category, question.value).length;
    const answerButtonDelay = 6 * 40 + questionLen * 50 + 200; // flicker + typing + buffer
    this.time.delayedCall(answerButtonDelay, () => {
    this._showDialogAnswerButtons((playerAnswer) => {
      if (this.state.gameOver || this.cpu.done) return;

      const playerSpy = this.characters[this.playerSpyId];
      const correctAnswer = String(playerSpy[question.category.toLowerCase()]).toUpperCase() === question.value.toUpperCase() ? 'YES' : 'NO';
      const wasLie = playerAnswer !== correctAnswer;

      // Log CPU question + player answer to secure channel
      const cpuSentence = formatQuestion(question.category, question.value);
      const answerColor = playerAnswer === 'YES' ? '#00ff41' : '#ff4444';
      this.networkWindow.log(`CPU: ${cpuSentence}`, '#ff6600');
      this.networkWindow.log(playerAnswer === 'YES' ? 'YOU: Affirmative.' : 'YOU: Negative.', answerColor);
      if (this.sound) playerAnswer === 'YES' ? this.sound.beepHigh() : this.sound.beepLow();

      // Show answer on line1, keep sentence on lines 2+3
      if (this.dialogLine1) {
        this.dialogLine1.setText(`YOU: ${playerAnswer}${wasLie ? ' [LIE]' : ''}`).setColor(wasLie ? '#ff4444' : answerColor);
      }

      // Chain verify — truth value is the CORRECT answer (chain always knows)
      const truthBool = correctAnswer === 'YES';
      this._runChainVerify(truthBool, () => {
        this.networkWindow.log(`⛓ CHAIN: ${truthBool ? 'TRUE' : 'FALSE'}`, truthBool ? '#00ff41' : '#ff4444');

        if (wasLie) {
          this._penalizePlayerTime(LIE_PENALTY);
          this._penalizeCpuTime(LIE_PENALTY);
        }

        // CPU eliminates based on truth (chain revealed it)
        const cat = question.category.toLowerCase();
        this.cpu.remaining.forEach(id => {
          const char = this.characters[id];
          const charVal = String(char[cat]).toUpperCase();
          const matches = charVal === question.value.toUpperCase();
          if (truthBool && !matches) this._cpuEliminate(id);
          if (!truthBool && matches) this._cpuEliminate(id);
        });

        this.cpuStatusText.setText(`CPU: ${this.cpu.remaining.size} SUSPECTS`);

        if (!this.state.gameOver && !this.cpu.done) {
          this._endCpuTurn();
        }
      });
    });
    }); // end delayedCall for answer buttons
  }

  _endCpuTurn() {
    // Static flicker → switch back to player spy face
    this._dialogStaticFlicker(() => {
      this._switchDialogToPlayer();
    });
    this.currentTurn = 'player';
    this._updateTurnIndicator(false);
    this._turnLocked = false;
    const s = this.state;
    if (!s.gameOver && s.questionsLeft > 0 && !s.declaringMode) {
      this.questionPanel.setDisabled(false);
      this.networkWindow.log('YOUR TURN — ASK A QUESTION', '#00ff41');
      this._setDialogIdle();
    }
  }

  _cpuPickQuestion() {
    const remaining = [...this.cpu.remaining];
    const categories = Object.keys(QUESTION_CATEGORIES);
    let bestQ = null;
    let bestScore = -1;

    for (const category of categories) {
      for (const value of QUESTION_CATEGORIES[category]) {
        const cat = category.toLowerCase();
        const matching = remaining.filter(id =>
          String(this.characters[id][cat]).toUpperCase() === value.toUpperCase()
        ).length;
        const split = Math.min(matching, remaining.length - matching);
        if (split > bestScore) {
          bestScore = split;
          bestQ = { category, value };
        }
      }
    }
    return bestQ;
  }

  _cpuDeclare(guessId) {
    if (this.cpu.done || this.state.gameOver) return;
    this.cpu.done = true;

    const guess = this.characters[guessId];
    const correct = guessId === this.playerSpyId;
    const playerSpy = this.characters[this.playerSpyId];

    this.networkWindow.log(`CPU DECLARES: ${guess.codename}`, '#ff4444');
    if (this.sound) correct ? this.sound.proofFail() : this.sound.beepLow();

    const mini = this.cpuMiniCards[guessId];
    if (mini) {
      this.tweens.add({
        targets: [mini.nameT],
        alpha: { from: 0.2, to: 1 },
        yoyo: true,
        repeat: 4,
        duration: 200,
      });
    }

    if (correct) {
      this.state.gameOver = true;
      this.questionPanel.setDisabled(true);
      this.networkWindow.log('CPU IDENTIFIED YOUR SPY!', '#ff4444');
      this.time.delayedCall(2000, () => {
        this._endGame({
          won: false,
          spy: playerSpy,
          score: 0,
          questionsUsed: MAX_QUESTIONS - this.state.questionsLeft,
          timeElapsed: TIMER_SECONDS - this.state.timeSeconds,
          cpuWon: true,
          cpuGuess: guess,
        });
      });
    } else {
      this.networkWindow.log(`CPU WRONG — ${playerSpy.codename} IS YOUR SPY`, '#00ff41');
      this.cpuStatusText.setText('CPU: MISSION FAILED');
      // CPU lost — hand turn to player for remaining questions
      this._endCpuTurn();
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  shutdown() {
    if (this.timerEvent) this.timerEvent.remove();
    if (this.cpuTimerEvent) this.cpuTimerEvent.remove();
    if (this.cpuTurnTimer) this.cpuTurnTimer.remove();
    this.cards?.forEach(c => c.destroy());
    this.questionPanel?.destroy();
    this.networkWindow?.destroy();
  }
}

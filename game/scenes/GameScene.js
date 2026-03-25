import * as Phaser from 'phaser';
import {
  COLORS, CHARACTERS, GAME_WIDTH, GAME_HEIGHT,
  CARD_W, CARD_H, CARD_GAP, GRID_X, GRID_Y,
  SIDEBAR_X, SIDEBAR_W, MAX_QUESTIONS, TIMER_SECONDS,
  QUESTION_CATEGORIES, formatQuestion, ROSTER_FRAME,
} from '../constants.js';
import { applyCRTOverlay } from '../utils/crt.js';
import { CharacterCard } from '../ui/CharacterCard.js';
import { NetworkWindow } from '../ui/NetworkWindow.js';
import { QuestionPanel } from '../ui/QuestionPanel.js';
import { askQuestion, declareSpy, submitScore, getScores } from '../api.js';
import { truncateAddress } from '../wallet.js';

// CPU turn delay after player finishes (ms)
const CPU_TURN_DELAY = 2400;

// Map QUESTION_CATEGORIES key → Character property name
function _catToProp(category) {
  const map = {
    SEX:         'sex',
    HEADWEAR:    'headwear',
    HAIR:        'hairShape',
    FACIAL_HAIR: 'facialHair',
    EYEWEAR:     'eyewear',
    MARKER:      'marker',
  };
  return map[category] || category.toLowerCase();
}

// Mini card dimensions for CPU board
const MINI_W = 62;
const MINI_H = 56;
const MINI_GAP = 4;

// CPU timer (separate from player)

// Lie penalty in seconds
const LIE_PENALTY = 10;

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  preload() {
    if (!this.textures.exists('roster')) {
      this.load.spritesheet('roster', '/assets/roster.png', { frameWidth: 96, frameHeight: 96 });
    }
    if (!this.textures.exists('unknown')) {
      this.load.image('unknown', '/assets/unknown.jpg');
    }
  }

  init(data) {
    this.sessionId = data.sessionId;
    this.walletAddress = data.walletAddress;
    this.demoMode = data.demoMode || false;
    this.characters = data.characters || CHARACTERS;
    this.gameContractAddress = data.contractAddress || null;
    this.gameId = data.gameId || null;
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

    // In dev mode: assign a local CPU spy (the one the player must find)
    // In prod: the server owns the culprit secretly
    if (data.sessionId === 'dev-session') {
      let devSpyId;
      do { devSpyId = Math.floor(Math.random() * 16); } while (devSpyId === this.playerSpyId);
      this._devCpuSpyId = devSpyId;
    } else {
      this._devCpuSpyId = null;
    }

    // CPU state
    this.cpu = {
      eliminated: new Set(),
      remaining: new Set(this.characters.map(c => c.id)),
      questionsLeft: MAX_QUESTIONS,
      timeSeconds: 0,
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

    // Restart theme music if it was stopped (e.g. after result screen)
    if (!this.registry.get('themeMusic') && this.sys.sound && this.cache.audio.exists('theme')) {
      const music = this.sys.sound.add('theme', { loop: true, volume: 0.5 });
      music.play();
      this.registry.set('themeMusic', music);
    }

    // Compute responsive layout — all build methods use this._L instead of constants
    this._L = this._computeLayout();
    const L = this._L;

    this.add.rectangle(L.gameW / 2, L.gameH / 2, L.gameW, L.gameH, COLORS.BG);

    this._buildTopBar();
    this._buildCards();
    this._buildSidebar();
    this._buildCpuBoard();
    this._buildPlayerDialogBox();

    // Question panel sits in sidebar under the codec box
    this.questionPanel = new QuestionPanel(
      this,
      (category, value) => this._onQuestion(category, value),
      this.sound,
      L.gameW,
      L.gameH,
      L.colX,
      L.colW,
      this._questionPanelY,
    );

    this._startTimer();

    // ESC → pause menu
    this._paused = false;
    this._pauseObjects = [];
    // Combo tracking: set of card ids the player should eliminate after last intel
    this._pendingEliminations = new Set();
    this._comboScore = 0;
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.state.gameOver) return;
      this._paused ? this._hidePauseMenu() : this._showPauseMenu();
    });

    // Announce who goes first
    const firstMsg = this.currentTurn === 'player'
      ? 'YOU GO FIRST — ASK A QUESTION'
      : 'CPU GOES FIRST — AWAIT INTERROGATION';
    this.networkWindow.log(firstMsg, '#ffaa00');

    if (this.currentTurn === 'player') {
      this.questionPanel.setDisabled(false);
      this.questionPanel.setEnemyTurn(false);
      this.time.delayedCall(500, () => this.questionPanel.flash());
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

    const hudH    = 50;
    const qBarH   = 0;  // question buttons moved to sidebar
    const gridX   = 20;
    const gridY   = hudH + 8;
    // Cards sized to fill available height: 4 rows + 3 gaps fit in gameH - gridY - 8
    const availH  = gameH - gridY - 8;
    const cardGap = CARD_GAP;
    const cardH   = Math.floor((availH - 3 * cardGap) / 4);
    const cardW   = Math.floor(cardH * (CARD_W / CARD_H));

    const gridW   = 4 * cardW + 3 * cardGap;
    const gridH   = 4 * cardH + 3 * cardGap;

    const colGap  = 12;
    const colX    = gridX + gridW + colGap;
    const colY    = gridY;
    const colW    = gameW - colX - 8;

    return {
      gameW, gameH, stacked: false,
      hudH, qBarH,
      gridX, gridY, cardW, cardH, cardGap,
      gridW, gridH,
      colX, colY, colW,
    };
  }

  // ── Top Bar ──────────────────────────────────────────────────────────

  _buildTopBar() {
    const { gameW } = this._L;
    const h = 50;
    const fs = '9px';
    const fs2 = '7px';

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

    this.add.text(12, 32, `AGENT: ${this.demoMode ? 'DEMO' : truncateAddress(this.walletAddress, 6)}`, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: fs2,
      color: '#00aa22',
    });

    const playerSpy = this.characters[this.playerSpyId];
    this.add.text(gameW / 2 - 80, 32, `YOUR AGENT: ${playerSpy.name}`, {
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
    this.scoreText.setText(`SCORE: ${this._comboScore ?? 0}`);
  }

  _calcScore(correct) {
    if (!correct) return 0;
    // Combo points earned during play + time bonus for correct guess
    return this._comboScore + this.state.timeSeconds * 10;
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
    this.cards[this.playerSpyId].setPlayerSpy(true);
  }

  _onCardClick(character) {
    const s = this.state;
    if (s.gameOver) return;

    if (s.declaringMode) {
      this._declareSpy(character);
      return;
    }

    if (character.id === this.playerSpyId) {
      // Can't eliminate own spy — wobble and flash codec message
      this.cards[character.id].wobble();
      this._switchDialogToPlayer();
      if (this.dialogLine1) this.dialogLine1.setText('[ PROTECT ASSET ]').setColor('#ffaa00');
      if (this.dialogLine2) this.dialogLine2.setText(`${character.name.toUpperCase()} IS YOUR AGENT`).setColor('#ffaa00');
      if (this.dialogLine3) this.dialogLine3.setText('DO NOT EXPOSE THEM').setColor('#886600');
      this.time.delayedCall(2500, () => { this._setDialogIdle(); });
      return;
    }

    if (s.eliminated.has(character.id)) {
      // Click again to undo elimination
      s.eliminated.delete(character.id);
      this.cards[character.id].uneliminate();
      this.networkWindow.log(`RESTORED: ${character.name}`, '#888888');
      this._updateHUD();
      return;
    }

    if (!s.eliminated.has(character.id)) {
      s.eliminated.add(character.id);
      this.cards[character.id].eliminate();
      if (this.sound) this.sound.eliminate();

      if (this._pendingEliminations.has(character.id)) {
        // This card was part of the current intel — award combo points
        this._pendingEliminations.delete(character.id);
        this._pendingActedOn++;
        const total = this._pendingEliminationCount;
        const acted = this._pendingActedOn;
        // Full combo: all cards from this intel acted on = 200×N, partial = 100 each
        const isFullCombo = acted === total && total > 1;
        const pts = isFullCombo ? 200 * total : 100;
        this._comboScore += pts;
        const label = isFullCombo
          ? `COMBO ×${total}! +${pts}`
          : `INTEL USED +${pts}`;
        this.networkWindow.log(`⚡ ${label}`, isFullCombo ? '#ffff00' : '#00ff41');
      } else {
        // Wild guess — no points, warn
        this.networkWindow.log(`ELIMINATED: ${character.name} [NO INTEL]`, '#888888');
      }

      this._updateHUD();
    }
  }

  // ── Sidebar ──────────────────────────────────────────────────────────
  // Column order: dialog box → network window → cpu board → declare button

  _buildSidebar() {
    const { colX, colY, colW, gameH, qBarH } = this._L;
    const GAP = 8;
    const colBottom = gameH - qBarH - 4; // above question bar

    // 1. Dialog box (codec): built in _buildPlayerDialogBox using _sidebarDialogY
    const dialogH = 190;
    this._sidebarDialogY = colY;

    // 2. Question panel sits directly under the codec box
    const qPanelH = 104; // 2 rows × 44px + gap + padding
    this._questionPanelY = colY + dialogH + GAP;

    // 3. Network window below question panel
    const netWinY = this._questionPanelY + qPanelH + GAP;
    const netWinH = 120;
    this.networkWindow = new NetworkWindow(this, netWinY, netWinH, colX, colW);
    this.networkWindow.log('SECURE CHANNEL OPEN', '#00ff41');
    this.networkWindow.log(`SESSION: ${this.sessionId.slice(0, 16)}...`, '#00cc33');

    // 4. Declare button pinned to bottom of column
    const declareH = 40;
    const declareY = colBottom - declareH;
    this._buildDeclareButton(colX, declareY, colW);

    // 5. CPU board fills the gap between network window and declare button
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
      fontSize: '9px',
      color: '#ff4444',
    });

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

      // Only show agent name
      const nameT = this.add.text(cx + MINI_W / 2, cy + miniH / 2, char.name, {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '7px',
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
      fontSize: '8px',
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
    // MGS-style codec: 100px portrait area + text lines + YES/NO row + verify bar + padding
    const portraitH = 100;
    const bh = 190;
    const bx = this._L.colX;
    const by = this._sidebarDialogY;

    this._dialogX = bx;
    this._dialogY = by;
    this._dialogW = bw;
    this._dialogH = bh;

    // Layout constants
    const PORTRAIT_W = 80; // left portrait panel width
    const CENTER_W = bw - PORTRAIT_W * 2; // center freq/bars panel
    const CENTER_X = bx + PORTRAIT_W; // center panel start x
    const RIGHT_X = bx + bw - PORTRAIT_W; // right portrait start x

    const D = 5;

    // ── Static frame ─────────────────────────────────────────────────────
    this.dialogGfx = this.add.graphics().setDepth(D);
    this._drawDialogFrame();

    // ── Left portrait panel (speaker) ─────────────────────────────────
    this.dialogAvatarGfx = this.add.graphics().setDepth(D + 1);
    // Sprite image for left portrait (roster spritesheet)
    this._dialogLeftImg = null;
    // ── Right portrait panel (listener) ───────────────────────────────
    this.dialogAvatarRightGfx = this.add.graphics().setDepth(D + 1);
    this._dialogRightImg = null;

    // ── Center panel: FREQ label + PTT + audio bars ────────────────────
    const centerGfx = this.add.graphics().setDepth(D + 1);
    // Subtle center bg
    centerGfx.fillStyle(0x000e00, 1);
    centerGfx.fillRect(CENTER_X + 1, by + 1, CENTER_W - 2, portraitH - 2);

    // PTT label at top-center
    this.add.text(CENTER_X + CENTER_W / 2, by + 5, 'PTT', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '5px',
      color: '#005514',
    }).setOrigin(0.5, 0).setDepth(D + 1);

    // Thin horizontal decorative lines
    const lineGfx = this.add.graphics().setDepth(D + 1);
    lineGfx.lineStyle(1, COLORS.DIM, 0.7);
    lineGfx.beginPath(); lineGfx.moveTo(CENTER_X + 2, by + 15); lineGfx.lineTo(CENTER_X + CENTER_W - 2, by + 15); lineGfx.strokePath();
    lineGfx.beginPath(); lineGfx.moveTo(CENTER_X + 2, by + portraitH - 15); lineGfx.lineTo(CENTER_X + CENTER_W - 2, by + portraitH - 15); lineGfx.strokePath();

    // FREQ text
    this.add.text(CENTER_X + CENTER_W / 2, by + 20, 'FREQ', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '5px',
      color: '#004400',
    }).setOrigin(0.5, 0).setDepth(D + 1);

    this.add.text(CENTER_X + CENTER_W / 2, by + 30, '140.85', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '8px',
      color: '#00ff41',
    }).setOrigin(0.5, 0).setDepth(D + 2);

    // Audio bars graphics — 5 vertical bars in center panel
    this._audioBarsGfx = this.add.graphics().setDepth(D + 2);
    this._audioBarsActive = 'left'; // which side is speaking ('left' or 'right')
    this._drawAudioBars(true);

    // Repeating timer to animate audio bars
    this._audioBarsTimer = this.time.addEvent({
      delay: 150,
      loop: true,
      callback: () => this._drawAudioBars(false),
    });

    // Speaker name badges — left and right
    this.dialogNameBadge = this.add.text(bx + PORTRAIT_W / 2, by + portraitH + 2, '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '7px',
      color: '#00ff41',
      align: 'center',
    }).setOrigin(0.5, 0).setDepth(D + 1);

    this._dialogRightNameBadge = this.add.text(RIGHT_X + PORTRAIT_W / 2, by + portraitH + 2, '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '7px',
      color: '#444444',
      align: 'center',
    }).setOrigin(0.5, 0).setDepth(D + 1);

    // Question text line — below the portrait row (spans full width)
    const textY = by + portraitH + 10;
    this.dialogLine1 = this.add.text(bx + 6, textY, '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '8px',
      color: '#005514',
      wordWrap: { width: bw - 12 },
    }).setDepth(D + 1);

    this.dialogLine2 = this.add.text(bx + 6, textY + 16, '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '9px',
      color: '#39ff14',
      wordWrap: { width: bw - 12 },
    }).setDepth(D + 1);

    // dialogLine3 — third text line, capped above the YES/NO button row
    this.dialogLine3 = this.add.text(bx + 6, textY + 34, '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '8px',
      color: '#00aa22',
      wordWrap: { width: bw - 12 },
    }).setDepth(D + 1);

    // Chain verify bar — sits below question text
    const verifyY = by + bh - 22;
    this.dialogVerifyBarBg = this.add.graphics().setDepth(D + 1);
    this.dialogVerifyBarBg.fillStyle(0x001a00, 1);
    this.dialogVerifyBarBg.fillRect(bx + 4, verifyY, bw - 8, 7);
    this.dialogVerifyBarBg.lineStyle(1, COLORS.DIM, 1);
    this.dialogVerifyBarBg.strokeRect(bx + 4, verifyY, bw - 8, 7);

    this.dialogVerifyBarFill = this.add.graphics().setDepth(D + 2);

    this.dialogVerifyLabel = this.add.text(bx + 4, verifyY + 9, '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '5px',
      color: '#00aa22',
    }).setDepth(D + 1);

    // Result stamp
    this.dialogResultStamp = this.add.text(bx + bw - 8, verifyY - 2, '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '9px',
      color: '#00ff41',
    }).setOrigin(1, 0).setDepth(D + 2);

    // Boot into player spy mode
    this._switchDialogToPlayer();
    this._setDialogIdle();
  }

  // Draw the 5 audio bars in the center panel
  _drawAudioBars(reset) {
    const bx = this._dialogX;
    const by = this._dialogY;
    const bw = this._dialogW;
    const PORTRAIT_W = 80;
    const CENTER_X = bx + PORTRAIT_W;
    const CENTER_W = bw - PORTRAIT_W * 2;

    if (!this._audioBarsGfx || !this._audioBarsGfx.scene) return;
    const gfx = this._audioBarsGfx;
    gfx.clear();

    const barCount = 5;
    const barW = 4;
    const maxH = 20;
    const barSpacing = Math.floor((CENTER_W - barCount * barW) / (barCount + 1));
    const baseY = by + 70;
    const activeLeft = this._audioBarsActive === 'left';

    for (let i = 0; i < barCount; i++) {
      const bX = CENTER_X + barSpacing + i * (barW + barSpacing);
      // Active side gets taller bars on random frames; idle side very short
      const isActiveSide = true; // all bars in center respond to speaker
      const maxBarH = activeLeft
        ? (i < 3 ? maxH : maxH * 0.5)   // left speaking: taller on left bars
        : (i > 1 ? maxH : maxH * 0.5);  // right speaking: taller on right bars

      const h = reset ? 4 : Math.max(3, Math.floor(Math.random() * maxBarH));
      const alpha = activeLeft ? (i < 3 ? 0.9 : 0.4) : (i > 1 ? 0.9 : 0.4);
      gfx.fillStyle(COLORS.PRIMARY, alpha);
      gfx.fillRect(bX, baseY - h, barW, h);
      // Bright cap
      gfx.fillStyle(COLORS.ACCENT, 0.8);
      gfx.fillRect(bX, baseY - h, barW, 1);
    }
  }

  _drawDialogFrame() {
    const { _dialogX: bx, _dialogY: by, _dialogW: bw, _dialogH: bh } = this;
    const PORTRAIT_W = 80;
    const CENTER_X = bx + PORTRAIT_W;
    const CENTER_W = bw - PORTRAIT_W * 2;
    const portraitH = 100;
    const gfx = this.dialogGfx;
    gfx.clear();

    // Main background
    gfx.fillStyle(0x010a01, 0.97);
    gfx.fillRect(bx, by, bw, bh);

    // Outer border
    gfx.lineStyle(2, COLORS.PRIMARY, 1);
    gfx.strokeRect(bx, by, bw, bh);
    gfx.lineStyle(1, COLORS.DIM, 0.4);
    gfx.strokeRect(bx + 2, by + 2, bw - 4, bh - 4);

    // Corner ticks
    const s = 8;
    gfx.lineStyle(2, COLORS.ACCENT, 1);
    gfx.beginPath(); gfx.moveTo(bx,      by + s); gfx.lineTo(bx,      by     ); gfx.lineTo(bx + s,      by     ); gfx.strokePath();
    gfx.beginPath(); gfx.moveTo(bx+bw-s, by     ); gfx.lineTo(bx+bw,   by     ); gfx.lineTo(bx + bw,    by + s ); gfx.strokePath();
    gfx.beginPath(); gfx.moveTo(bx,      by+bh-s); gfx.lineTo(bx,      by+bh  ); gfx.lineTo(bx + s,     by+bh  ); gfx.strokePath();
    gfx.beginPath(); gfx.moveTo(bx+bw-s, by+bh  ); gfx.lineTo(bx+bw,   by+bh  ); gfx.lineTo(bx + bw,   by+bh-s); gfx.strokePath();

    // Portrait panel separators (left portrait | center | right portrait)
    gfx.lineStyle(1, COLORS.DIM, 0.6);
    gfx.beginPath(); gfx.moveTo(bx + PORTRAIT_W, by + 2); gfx.lineTo(bx + PORTRAIT_W, by + portraitH); gfx.strokePath();
    gfx.beginPath(); gfx.moveTo(bx + bw - PORTRAIT_W, by + 2); gfx.lineTo(bx + bw - PORTRAIT_W, by + portraitH); gfx.strokePath();

    // Horizontal divider below portrait row
    gfx.lineStyle(1, COLORS.PRIMARY, 0.5);
    gfx.beginPath(); gfx.moveTo(bx + 2, by + portraitH); gfx.lineTo(bx + bw - 2, by + portraitH); gfx.strokePath();

    // Left portrait panel background
    gfx.fillStyle(0x000a00, 1);
    gfx.fillRect(bx + 2, by + 2, PORTRAIT_W - 4, portraitH - 4);

    // Right portrait panel background
    gfx.fillStyle(0x000a00, 1);
    gfx.fillRect(bx + bw - PORTRAIT_W + 2, by + 2, PORTRAIT_W - 4, portraitH - 4);

    // Question text area background (below portrait row)
    gfx.fillStyle(0x000500, 1);
    gfx.fillRect(bx + 2, by + portraitH + 1, bw - 4, bh - portraitH - 3);
  }

  // Draw a portrait (sprite or wireface) into a panel
  _drawPortraitSprite(isLeft, characterId, isActive) {
    const bx = this._dialogX;
    const by = this._dialogY;
    const bw = this._dialogW;
    const PORTRAIT_W = 80;
    const portraitH = 100;
    const D = 5;

    const panelX = isLeft ? bx : bx + bw - PORTRAIT_W;
    const panelCX = panelX + PORTRAIT_W / 2;
    const panelCY = by + portraitH / 2;

    const gfx = isLeft ? this.dialogAvatarGfx : this.dialogAvatarRightGfx;
    gfx.clear();

    // Clip background
    gfx.fillStyle(0x000a00, 1);
    gfx.fillRect(panelX + 2, by + 2, PORTRAIT_W - 4, portraitH - 4);

    // Active speaker glow border
    if (isActive) {
      gfx.lineStyle(1, COLORS.ACCENT, 0.5);
      gfx.strokeRect(panelX + 3, by + 3, PORTRAIT_W - 6, portraitH - 6);
    }

    if (characterId !== null && characterId !== undefined && this.textures.exists('roster')) {
      // Destroy old sprite if any
      const imgKey = isLeft ? '_dialogLeftImg' : '_dialogRightImg';
      if (this[imgKey]) { this[imgKey].destroy(); this[imgKey] = null; }

      const spy = this.characters[characterId];
      const frameKey = spy ? (ROSTER_FRAME[spy.name.toLowerCase()] ?? 0) : 0;
      const img = this.add.image(panelCX, panelCY - 4, 'roster', frameKey)
        .setDepth(D + 1)
        .setDisplaySize(60, 60)
        .setAlpha(isActive ? 1.0 : 0.45);
      this[imgKey] = img;
    } else {
      // Unknown / CPU — use who.jpg image
      const imgKey = isLeft ? '_dialogLeftImg' : '_dialogRightImg';
      if (this[imgKey]) { this[imgKey].destroy(); this[imgKey] = null; }

      if (this.textures.exists('unknown')) {
        const img = this.add.image(panelCX, panelCY - 4, 'unknown')
          .setDepth(D + 1)
          .setAlpha(isActive ? 1.0 : 0.35);
        const tex = this.textures.get('unknown').getSourceImage();
        const scale = Math.min((PORTRAIT_W - 8) / tex.width, (portraitH - 8) / tex.height);
        img.setScale(scale);
        this[imgKey] = img;
      }
    }
  }

  // Player speaking: player portrait on LEFT (active), unknown on RIGHT (dim)
  _switchDialogToPlayer() {
    const spy = this.characters[this.playerSpyId];

    this._drawPortraitSprite(true, this.playerSpyId, true);  // player LEFT active
    this._drawPortraitSprite(false, null, false);             // unknown RIGHT dim

    this._audioBarsActive = 'left';

    if (this.dialogNameBadge) {
      this.dialogNameBadge.setText(spy ? spy.name.toUpperCase() : 'YOU').setColor('#00ff41');
    }
    if (this._dialogRightNameBadge) {
      this._dialogRightNameBadge.setText('UNKNOWN').setColor('#440000');
    }

    this._dialogMode = 'player';
  }

  // CPU speaking: unknown on LEFT (active), player portrait on RIGHT (dim)
  _switchDialogToCpu() {
    const spy = this.characters[this.playerSpyId];

    this._drawPortraitSprite(true, null, true);               // unknown LEFT active
    this._drawPortraitSprite(false, this.playerSpyId, false); // player RIGHT dim

    this._audioBarsActive = 'left';

    if (this.dialogNameBadge) {
      this.dialogNameBadge.setText('UNKNOWN').setColor('#ff4444');
    }
    if (this._dialogRightNameBadge) {
      this._dialogRightNameBadge.setText(spy ? spy.name.toUpperCase() : 'YOU').setColor('#005514');
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

  // Quick static flicker on both portrait panels then calls onDone
  _dialogStaticFlicker(onDone) {
    const { _dialogX: bx, _dialogY: by } = this;
    const PORTRAIT_W = 80;
    const portraitH = 100;
    // Destroy any sprites during flicker
    if (this._dialogLeftImg) { this._dialogLeftImg.destroy(); this._dialogLeftImg = null; }
    if (this._dialogRightImg) { this._dialogRightImg.destroy(); this._dialogRightImg = null; }
    const gfxL = this.dialogAvatarGfx;
    const gfxR = this.dialogAvatarRightGfx;
    let flickers = 0;
    const MAX = 6;
    const flick = () => {
      gfxL.clear(); gfxR.clear();
      // Random noise pixels across both portrait panels
      for (let panel = 0; panel < 2; panel++) {
        const gfx = panel === 0 ? gfxL : gfxR;
        const px0 = panel === 0 ? bx + 2 : bx + this._dialogW - PORTRAIT_W + 2;
        for (let i = 0; i < 80; i++) {
          const px = px0 + Math.random() * (PORTRAIT_W - 4);
          const py = by + 2 + Math.random() * (portraitH - 4);
          const c = Math.random() > 0.5 ? 0x00ff41 : 0x003300;
          gfx.fillStyle(c, Math.random() * 0.8 + 0.2);
          gfx.fillRect(px, py, 2 + Math.floor(Math.random() * 5), 1);
        }
      }
      flickers++;
      if (flickers < MAX) {
        this.time.delayedCall(40, flick);
      } else {
        gfxL.clear(); gfxR.clear();
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

  // Temporarily inject YES/NO buttons into the dialog question area for CPU interrogation
  _showDialogAnswerButtons(onAnswer) {
    const { _dialogX: bx, _dialogY: by, _dialogW: bw, _dialogH: bh } = this;
    // YES/NO row sits at the bottom of the codec box, above the verify bar
    const panelX = bx + 4;
    const panelW = bw - 8;
    const gap = 6;
    const btnW = Math.floor((panelW - gap) / 2);
    const btnH = 28;
    const btnY = by + bh - 34; // dedicated row at bottom, 34px from box bottom

    const yesX = panelX;
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
    const { _dialogX: bx, _dialogY: by, _dialogW: bw, _dialogH: bh } = this;
    // Bar sits at fixed position below question text (matches _buildPlayerDialogBox verifyY)
    const barX = bx + 4;
    const barY = by + bh - 22;
    const barMaxW = bw - 8;

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
        this.dialogVerifyBarFill.fillRect(barX, barY, fillW, 7);

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
        if (this.state.timeSeconds <= 10 && this.state.timeSeconds > 0) {
          if (this.soundSynth) this.soundSynth.countdownBeep(this.state.timeSeconds);
        }
        if (this.state.timeSeconds <= 0) {
          this.state.timeSeconds = 0;
          this._timeUp();
        }
      },
      loop: true,
    });
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

  // ── Player Questions ─────────────────────────────────────────────────

  _onQuestion(category, value) {
    const s = this.state;
    if (s.gameOver || s.questionsLeft <= 0 || s.declaringMode) return;
    if (this.currentTurn !== 'player' || this._turnLocked) return;

    this._turnLocked = true;
    s.questionsLeft--;
    this._updateHUD();
    this.questionPanel.setDisabled(true);
    // Reset pending intel when a new question is asked
    this._pendingEliminations = new Set();
    this._pendingEliminationCount = 0;
    this._pendingActedOn = 0;

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

      this.networkWindow.logTab(1, `YOU: ${sentence}`, '#00cc33');
      this.networkWindow.logTab(1, `CPU: ${answerBool ? 'YES ✓' : 'NO ✓'}`, color);
      if (this.sound) answerBool ? this.sound.beepHigh() : this.sound.beepLow();

      // Static flicker → switch to enemy avatar → type answer
      this._dialogStaticFlicker(() => {
        this._switchDialogToCpu();
        if (this.dialogLine1) this.dialogLine1.setText('[ RESPONSE ]').setColor('#ff6600');
        this._typeDialogText(this.dialogLine2, `→ ${answer}`, color, () => {
          this._runChainVerify(answerBool, () => {
            const valDisplay = value.replace(/_/g, ' ').toUpperCase();
            if (answerBool) {
              this.networkWindow.log(`⛓ YES: CLEAR AGENTS WITHOUT ${valDisplay}`, '#00ff41');
            } else {
              this.networkWindow.log(`⛓ NO: CLEAR AGENTS WITH ${valDisplay}`, '#ff8800');
            }

            // Compute which non-eliminated cards this intel says should be X'd out
            // YES → eliminate agents that DON'T match; NO → eliminate agents that DO match
            const cat = _catToProp(category);
            const eliminable = this.characters.filter(c => {
              if (s.eliminated.has(c.id)) return false;
              const matches = String(c[cat]).toUpperCase() === value.toUpperCase();
              return answerBool ? !matches : matches;
            }).map(c => c.id);
            this._pendingEliminations = new Set(eliminable);
            this._pendingEliminationCount = eliminable.length;
            this._pendingActedOn = 0;

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

    // Fetch answer — in DEV mode answer locally from character data
    if (this._devCpuSpyId !== null) {
      const cpySpy = this.characters[this._devCpuSpyId];
      const prop = _catToProp(category);
      const matches = String(cpySpy[prop]).toUpperCase() === value.toUpperCase();
      apiResult = { answer: matches ? 'YES' : 'NO' };
      proceed();
    } else {
      askQuestion(this.sessionId, category, value).then(result => {
        apiResult = result;
        proceed();
      }).catch(e => {
        apiError = e;
        proceed();
      });
    }
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
    this.networkWindow.log(`DECLARING: ${character.name}`, '#00ff41');

    this._showDeclareLoader();

    this.networkWindow.runProofAnimation(async () => {
      try {
        // Dev mode: evaluate locally; demo mode: call server but no wallet/contract = no blockchain submission
        const result = this._devCpuSpyId !== null
          ? { correct: character.id === this._devCpuSpyId, spy: this.characters[this._devCpuSpyId], onChain: null, proof: null }
          : await declareSpy(this.sessionId, character.id, this.walletAddress, this.demoMode ? null : this.gameContractAddress, this.demoMode ? null : this.gameId);
        const score = this._calcScore(result.correct);

        this._hideDeclareLoader();
        this.networkWindow.showProofResult(result.correct, result.onChain?.txId, this.sound);

        let newAchievements = [];
        try {
          const scoreRes = await submitScore(
            this.sessionId,
            this.walletAddress || 'ANONYMOUS',
            score,
            MAX_QUESTIONS - this.state.questionsLeft,
            TIMER_SECONDS - this.state.timeSeconds,
            result.correct,
            result.spy?.name || null,
          );
          newAchievements = scoreRes?.newAchievements || [];
        } catch (e) {}

        // Log on-chain result if available
        if (result.onChain) {
          this.networkWindow.log(`TX: ${String(result.onChain.txId).slice(0, 20)}...`, '#00ff41');
        } else if (this.gameContractAddress) {
          this.networkWindow.log('ON-CHAIN: PROOF SKIPPED', '#ff8800');
        }

        this.time.delayedCall(1500, () => {
          this._endGame({
            won: result.correct,
            spy: result.spy,
            score,
            questionsUsed: MAX_QUESTIONS - this.state.questionsLeft,
            timeElapsed: TIMER_SECONDS - this.state.timeSeconds,
            proof: result.proof,
            txId: result.onChain?.txId ?? null,
            newAchievements,
          });
        });
      } catch (e) {
        this._hideDeclareLoader();
        this.networkWindow.log('NETWORK ERROR', '#ff4444');
        this.state.gameOver = false;
        this.cpu.done = false;
      }
    }, this.sound);
  }

  _showDeclareLoader() {
    if (this._declareLoader) return;
    const W = this._L.gameW, H = this._L.gameH;

    const bg = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.82).setDepth(50);

    // Declare scene image
    const imgH = 160;
    const imgW = imgH * (4 / 3); // original is 4:3 landscape
    const declareImg = this.textures.exists('declare')
      ? this.add.image(W / 2, H / 2 - 148, 'declare')
          .setDisplaySize(imgW, imgH)
          .setDepth(51)
      : null;

    const title = this.add.text(W / 2, H / 2 - 56, this.demoMode ? 'EVALUATING GUESS...' : 'SUBMITTING ZK PROOF TO CHAIN', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '10px',
      color: '#00ff41',
      align: 'center',
    }).setOrigin(0.5).setDepth(51);

    // Spinning bracket animation
    const frames = ['[    ]', '[>   ]', '[>>  ]', '[>>> ]', '[>>>>]', '[ >>>]', '[  >>]', '[   >]'];
    let fi = 0;
    const spinner = this.add.text(W / 2, H / 2 - 30, frames[0], {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '11px',
      color: '#00aa22',
    }).setOrigin(0.5).setDepth(51);

    const spinTimer = this.time.addEvent({
      delay: 120, loop: true,
      callback: () => { fi = (fi + 1) % frames.length; spinner.setText(frames[fi]); },
    });

    // Divider line
    const divGfx = this.add.graphics().setDepth(51);
    divGfx.lineStyle(1, 0x003300, 1);
    divGfx.beginPath();
    divGfx.moveTo(W / 2 - 260, H / 2 - 10);
    divGfx.lineTo(W / 2 + 260, H / 2 - 10);
    divGfx.strokePath();

    // Rotating ZK education hints
    const hints = [
      { head: 'ZERO KNOWLEDGE PROOFS', body: 'YOUR GUESS IS VERIFIED WITHOUT\nREVEALING WHO THE SPY IS.' },
      { head: 'DATA STAYS PRIVATE', body: 'THE SPY IDENTITY NEVER LEAVES\nYOUR DEVICE UNENCRYPTED.' },
      { head: 'CRYPTOGRAPHIC COMMITMENT', body: 'YOUR GUESS WAS COMMITTED ON-CHAIN\nBEFORE THE RESULT IS REVEALED.' },
      { head: 'ON-CHAIN VERIFICATION', body: 'THE MIDNIGHT NETWORK VALIDATES\nTHE PROOF — NOT A CENTRAL SERVER.' },
      { head: 'TRUSTLESS BY DESIGN', body: 'NO ONE CAN FAKE A CORRECT GUESS.\nMATH ENFORCES THE RULES.' },
      { head: 'PROOF GENERATION', body: 'A ZK CIRCUIT PROVES YOU KNEW\nTHE ANSWER WITHOUT SHOWING IT.' },
    ];
    let hi = 0;

    const hintHead = this.add.text(W / 2, H / 2 + 10, hints[0].head, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '8px',
      color: '#39ff14',
      align: 'center',
    }).setOrigin(0.5).setDepth(51);

    const hintBody = this.add.text(W / 2, H / 2 + 38, hints[0].body, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '7px',
      color: '#006622',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5).setDepth(51);

    const hintTimer = this.time.addEvent({
      delay: 3200,
      loop: true,
      callback: () => {
        hi = (hi + 1) % hints.length;
        if (!this._declareLoader) return;
        this.tweens.add({
          targets: [hintHead, hintBody],
          alpha: 0,
          duration: 300,
          onComplete: () => {
            if (!this._declareLoader) return;
            hintHead.setText(hints[hi].head);
            hintBody.setText(hints[hi].body);
            this.tweens.add({ targets: [hintHead, hintBody], alpha: 1, duration: 300 });
          },
        });
      },
    });

    this._declareLoader = { bg, title, spinner, divGfx, hintHead, hintBody, spinTimer, hintTimer, declareImg };
  }

  _hideDeclareLoader() {
    if (!this._declareLoader) return;
    const { bg, title, spinner, divGfx, hintHead, hintBody, spinTimer, hintTimer, declareImg } = this._declareLoader;
    spinTimer.remove(); hintTimer.remove();
    bg.destroy(); title.destroy(); spinner.destroy(); divGfx.destroy();
    hintHead.destroy(); hintBody.destroy();
    if (declareImg) declareImg.destroy();
    this._declareLoader = null;
  }

  _endGame(data) {
    if (this.timerEvent) this.timerEvent.remove();
    if (this.cpuTurnTimer) this.cpuTurnTimer.remove();
    // Inject cpu spy info so ResultScene can show the portrait
    // In prod: result.spy is the cpu spy (revealed by server). In dev: _devCpuSpyId.
    const cpuSpy = data.cpuWon
      ? (this._devCpuSpyId !== null ? this.characters[this._devCpuSpyId] : null) // cpu won, spy = player spy already in data.spy
      : (data.spy || (this._devCpuSpyId !== null ? this.characters[this._devCpuSpyId] : null));
    const enriched = {
      ...data,
      cpuSpy,
      characters: this.characters,
      playerQuestions: this.state.questions || [],
      cpuQuestions: this.state.cpuQuestions || [],
    };
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('ResultScene', enriched);
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
      const prop = _catToProp(question.category);
      const spyVal = String(playerSpy[prop]).toUpperCase();
      const qVal = question.value.toUpperCase();
      const correctAnswer = spyVal === qVal ? 'YES' : 'NO';
      const wasLie = playerAnswer !== correctAnswer;
      console.log(`[LIE CHECK] spy=${playerSpy.name} prop=${prop} spyVal=${spyVal} qVal=${qVal} correct=${correctAnswer} player=${playerAnswer} wasLie=${wasLie}`);

      // Track CPU question for end-game log
      if (!this.state.cpuQuestions) this.state.cpuQuestions = [];
      this.state.cpuQuestions.push({ category: question.category, value: question.value, answer: playerAnswer, wasLie });

      // Log CPU question + player answer to secure channel
      const cpuSentence = formatQuestion(question.category, question.value);
      const answerColor = playerAnswer === 'YES' ? '#00ff41' : '#ff4444';
      this.networkWindow.logTab(2, `CPU: ${cpuSentence}`, '#ff6600');
      this.networkWindow.logTab(2, `YOU: ${playerAnswer}${wasLie ? ' [LIE]' : ' [TRUE]'}`, wasLie ? '#ff4444' : '#00ff41');
      if (this.sound) playerAnswer === 'YES' ? this.sound.beepHigh() : this.sound.beepLow();

      // Show answer on line1, keep sentence on lines 2+3
      if (this.dialogLine1) {
        this.dialogLine1.setText(`YOU: ${playerAnswer}${wasLie ? ' [LIE]' : ''}`).setColor(wasLie ? '#ff4444' : answerColor);
      }

      // Chain verify — truth value is whether the player was honest
      const truthBool = !wasLie;
      this._runChainVerify(truthBool, () => {
        this.networkWindow.log(`⛓ CHAIN: ${truthBool ? 'VERIFIED' : 'DECEPTION DETECTED'}`, truthBool ? '#00ff41' : '#ff4444');

        if (wasLie) {
          this._penalizePlayerTime(LIE_PENALTY);
        }

        // CPU eliminates based on the true answer (chain always reveals truth)
        const cat = _catToProp(question.category);
        const playerSpy = this.characters[this.playerSpyId];
        const trueAnswer = String(playerSpy[cat]).toUpperCase() === question.value.toUpperCase() ? 'YES' : 'NO';
        this.cpu.remaining.forEach(id => {
          const char = this.characters[id];
          const matches = String(char[cat]).toUpperCase() === question.value.toUpperCase();
          if (trueAnswer === 'YES' && !matches) this._cpuEliminate(id);
          if (trueAnswer === 'NO' && matches) this._cpuEliminate(id);
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
      this.questionPanel.flash();
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
        const cat = _catToProp(category);
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

    this.networkWindow.log(`CPU DECLARES: ${guess.name}`, '#ff4444');
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
      this.networkWindow.log(`CPU WRONG — YOUR AGENT IS ${playerSpy.name}`, '#00ff41');
      this.cpuStatusText.setText('CPU: MISSION FAILED');
      // CPU lost — hand turn to player for remaining questions
      this._endCpuTurn();
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  _showPauseMenu() {
    this._paused = true;
    if (this.timerEvent) this.timerEvent.paused = true;

    const { gameW, gameH } = this._L;
    const objs = this._pauseObjects;

    // Dim overlay
    const overlay = this.add.rectangle(gameW / 2, gameH / 2, gameW, gameH, 0x000000, 0.7).setDepth(50);
    objs.push(overlay);

    // Panel
    const pw = 220, ph = 164;
    const px = gameW / 2 - pw / 2, py = gameH / 2 - ph / 2;
    const panel = this.add.graphics().setDepth(51);
    panel.fillStyle(COLORS.PANEL_BG, 1);
    panel.fillRect(px, py, pw, ph);
    panel.lineStyle(2, COLORS.PRIMARY, 1);
    panel.strokeRect(px, py, pw, ph);
    objs.push(panel);

    // Title
    const title = this.add.text(gameW / 2, py + 22, '[ PAUSED ]', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '11px',
      color: '#00ff41',
    }).setOrigin(0.5).setDepth(52);
    objs.push(title);

    // Resume button
    const resumeBtn = this._makePauseButton(gameW / 2, py + 54, 'RESUME', '#00ff41', () => this._hidePauseMenu());
    objs.push(...resumeBtn);

    // Mute toggle button
    const muteObjs = this._makeMuteToggle(gameW / 2, py + 84);
    objs.push(...muteObjs);

    // Quit button
    const quitBtn = this._makePauseButton(gameW / 2, py + 114, 'QUIT MISSION', '#ff4444', () => {
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('MenuScene');
      });
    });
    objs.push(...quitBtn);
  }

  _makePauseButton(x, y, label, color, onClick) {
    const bw = 160, bh = 22;
    const bg = this.add.graphics().setDepth(52);
    bg.fillStyle(0x001800, 1);
    bg.fillRect(x - bw / 2, y - bh / 2, bw, bh);
    bg.lineStyle(1, color, 1);
    bg.strokeRect(x - bw / 2, y - bh / 2, bw, bh);

    const txt = this.add.text(x, y, label, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '8px',
      color,
    }).setOrigin(0.5).setDepth(53);

    const hit = this.add.rectangle(x, y, bw, bh, 0, 0).setInteractive().setDepth(54);
    hit.on('pointerover', () => { bg.clear(); bg.fillStyle(0x003300, 1); bg.fillRect(x - bw / 2, y - bh / 2, bw, bh); bg.lineStyle(1, color, 1); bg.strokeRect(x - bw / 2, y - bh / 2, bw, bh); });
    hit.on('pointerout',  () => { bg.clear(); bg.fillStyle(0x001800, 1); bg.fillRect(x - bw / 2, y - bh / 2, bw, bh); bg.lineStyle(1, color, 1); bg.strokeRect(x - bw / 2, y - bh / 2, bw, bh); });
    hit.on('pointerdown', () => { if (this.sound) this.sound.click(); onClick(); });

    return [bg, txt, hit];
  }

  _makeMuteToggle(x, y) {
    const bw = 160, bh = 22;
    const bg = this.add.graphics().setDepth(52);
    const music = this.registry.get('themeMusic');

    const isMuted = () => !music || music.volume === 0 || !music.isPlaying;

    const draw = () => {
      const muted = isMuted();
      bg.clear();
      bg.fillStyle(muted ? 0x1a0000 : 0x001800, 1);
      bg.fillRect(x - bw / 2, y - bh / 2, bw, bh);
      bg.lineStyle(1, muted ? 0xff4444 : 0x00ff41, 1);
      bg.strokeRect(x - bw / 2, y - bh / 2, bw, bh);
    };
    draw();

    const muted = isMuted();
    const txt = this.add.text(x, y, muted ? '♪ MUSIC: OFF' : '♪ MUSIC: ON', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '8px',
      color: muted ? '#ff4444' : '#00ff41',
    }).setOrigin(0.5).setDepth(53);

    const hit = this.add.rectangle(x, y, bw, bh, 0, 0).setInteractive({ useHandCursor: true }).setDepth(54);
    hit.on('pointerdown', () => {
      if (this.sound) this.sound.click();
      if (!music) return;
      if (!isMuted()) {
        music.setVolume(0);
        txt.setText('♪ MUSIC: OFF').setColor('#ff4444');
      } else {
        music.setVolume(0.5);
        if (!music.isPlaying) music.play();
        txt.setText('♪ MUSIC: ON').setColor('#00ff41');
      }
      draw();
    });

    return [bg, txt, hit];
  }

  _hidePauseMenu() {
    this._paused = false;
    if (this.timerEvent) this.timerEvent.paused = false;
    this._pauseObjects.forEach(o => o.destroy());
    this._pauseObjects = [];
  }

  shutdown() {
    if (this.timerEvent) this.timerEvent.remove();
    if (this.cpuTurnTimer) this.cpuTurnTimer.remove();
    if (this._dialogTypeTimer) { this._dialogTypeTimer.remove(); this._dialogTypeTimer = null; }
    if (this._declareLoader) this._hideDeclareLoader();
    this._pauseObjects?.forEach(o => o.destroy());
    this._pauseObjects = [];
    this.cards?.forEach(c => c.destroy());
    this.questionPanel?.destroy();
    this.networkWindow?.destroy();
  }
}

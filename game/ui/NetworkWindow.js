import * as Phaser from 'phaser';
import { COLORS, SIDEBAR_X, SIDEBAR_W } from '../constants.js';

const LINE_GAP = 10;      // px gap between entries (after each entry's own height)
const LINE_SPACING = 4;   // extra px between wrapped lines within an entry
const FONT_SIZE = '7px';
const LOG_TOP_OFFSET = 42; // px below panel top where log starts
const PROGRESS_BAR_H = 30; // reserved at bottom for progress bar
const MAX_LOG_TEXTS = 30;  // pool size — more than enough visible entries

export class NetworkWindow {
  constructor(scene, y, height, x, w) {
    this.scene = scene;
    this.x = x !== undefined ? x : SIDEBAR_X;
    this.y = y;
    this.w = w !== undefined ? w : SIDEBAR_W;
    this.h = height;
    this.logLines = [];
    this.proofTimers = [];
    this._scrollOffset = 0; // 0 = pinned to bottom

    this._logAreaH = height - LOG_TOP_OFFSET - PROGRESS_BAR_H;

    this._build();
  }

  _build() {
    const { scene, x, y, w, h } = this;

    // Panel background
    this.panelGfx = scene.add.graphics();
    this.panelGfx.fillStyle(COLORS.PANEL_BG, 1);
    this.panelGfx.fillRect(x, y, w, h);
    this.panelGfx.lineStyle(1, COLORS.BORDER, 1);
    this.panelGfx.strokeRect(x, y, w, h);

    // Corner ticks
    const s = 6;
    this.panelGfx.lineStyle(2, COLORS.DIM, 1);
    [[x, y], [x+w, y], [x, y+h], [x+w, y+h]].forEach(([cx, cy], i) => {
      const dx = i % 2 === 0 ? s : -s;
      const dy = i < 2 ? s : -s;
      this.panelGfx.beginPath();
      this.panelGfx.moveTo(cx + dx, cy);
      this.panelGfx.lineTo(cx, cy);
      this.panelGfx.lineTo(cx, cy + dy);
      this.panelGfx.strokePath();
    });

    // Title bar
    this.titleText = scene.add.text(x + 8, y + 6, '[ GHOST CYPHER ]', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '9px',
      color: '#00ff41',
    });

    // Status
    this.statusText = scene.add.text(x + 8, y + 22, 'STATUS: CONNECTED', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '7px',
      color: '#00aa22',
    });

    // Pool of text objects for log rendering
    this.logTexts = [];
    for (let i = 0; i < MAX_LOG_TEXTS; i++) {
      const t = scene.add.text(x + 8, y + LOG_TOP_OFFSET, '', {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: FONT_SIZE,
        color: '#00aa22',
        wordWrap: { width: w - 20 },
        lineSpacing: LINE_SPACING,
      });
      t.setVisible(false);
      this.logTexts.push(t);
    }

    // Clip log text to panel bounds
    const maskGfx = scene.add.graphics();
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(x, y + LOG_TOP_OFFSET, w, this._logAreaH);
    maskGfx.setVisible(false);
    const mask = maskGfx.createGeometryMask();
    this.logTexts.forEach(t => t.setMask(mask));
    this._maskGfx = maskGfx;

    // Scroll indicator
    this.scrollBarGfx = scene.add.graphics();

    // Progress bar area
    this.progressBg = scene.add.graphics();
    this.progressFg = scene.add.graphics();
    this.progressText = scene.add.text(x + 8, y + h - 14, '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '7px',
      color: '#00ff41',
    });

    // Mouse wheel scrolling
    const hitZone = scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0, 0)
      .setInteractive();
    hitZone.on('wheel', (_ptr, _dx, dy) => {
      this._scrollOffset = Phaser.Math.Clamp(
        this._scrollOffset + Math.sign(dy),
        0,
        this.logLines.length
      );
      this._refresh();
    });
    this._hitZone = hitZone;
  }

  log(message, color = '#00aa22') {
    this.logLines.push({ message, color });
    this._scrollOffset = 0; // pin to bottom
    this._refresh();
  }

  // Measure how tall a given message renders (in px) using a temp off-screen text
  _measureHeight(message) {
    if (!this._measureText) {
      this._measureText = this.scene.add.text(-9999, -9999, '', {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: FONT_SIZE,
        wordWrap: { width: this.w - 20 },
        lineSpacing: LINE_SPACING,
      }).setVisible(false);
    }
    this._measureText.setText('> ' + message);
    return this._measureText.height;
  }

  _refresh() {
    const { x, y, w } = this;
    const logAreaBottom = y + LOG_TOP_OFFSET + this._logAreaH;
    const total = this.logLines.length;

    // Hide all pooled texts first
    this.logTexts.forEach(t => { t.setText(''); t.setVisible(false); });

    if (total === 0) { this._drawScrollBar(0); return; }

    // Build heights array for all lines (cached on the logLine object)
    for (const line of this.logLines) {
      if (line.height === undefined) {
        line.height = this._measureHeight(line.message);
      }
    }

    // Determine visible window from the bottom, working backwards
    // _scrollOffset=0 → show latest; each increment scrolls up by one entry
    const anchorIdx = Math.max(0, total - 1 - this._scrollOffset);

    // Collect entries that fit in logAreaH, starting from anchorIdx going up
    const visible = [];
    let usedH = 0;
    for (let i = anchorIdx; i >= 0; i--) {
      const entryH = this.logLines[i].height + LINE_GAP;
      if (usedH + this.logLines[i].height > this._logAreaH && visible.length > 0) break;
      visible.unshift(i);
      usedH += entryH;
    }

    // Position entries bottom-up from logAreaBottom
    let curY = logAreaBottom;
    // First pass: measure total height of visible entries
    let totalVisH = 0;
    for (const idx of visible) totalVisH += this.logLines[idx].height + LINE_GAP;
    // Start from top of log area
    curY = y + LOG_TOP_OFFSET;

    visible.forEach((lineIdx, slot) => {
      if (slot >= this.logTexts.length) return;
      const line = this.logLines[lineIdx];
      const t = this.logTexts[slot];
      t.setPosition(x + 8, curY);
      t.setText('> ' + line.message);
      t.setColor(line.color);
      t.setVisible(true);
      curY += line.height + LINE_GAP;
    });

    this._drawScrollBar(total);
  }

  _drawScrollBar(total) {
    const { x, y, w, h } = this;
    const gfx = this.scrollBarGfx;
    gfx.clear();

    if (total <= 1) return;

    const trackX = x + w - 5;
    const trackY = y + LOG_TOP_OFFSET;
    const trackH = this._logAreaH;

    // Track
    gfx.fillStyle(COLORS.PANEL_BG, 1);
    gfx.fillRect(trackX, trackY, 3, trackH);
    gfx.lineStyle(1, COLORS.DIM, 0.5);
    gfx.strokeRect(trackX, trackY, 3, trackH);

    // Thumb — scrollOffset=0 = bottom, higher = older
    const maxScroll = Math.max(1, total - 1);
    const thumbH = Math.max(6, Math.floor(trackH / Math.max(total, 1) * 3));
    const thumbY = trackY + Math.floor((trackH - thumbH) * (1 - this._scrollOffset / maxScroll));
    gfx.fillStyle(COLORS.BORDER, 1);
    gfx.fillRect(trackX, thumbY, 3, thumbH);
  }

  setProgress(pct) {
    const { x, y, w, h } = this;
    const barX = x + 8;
    const barY = y + h - 16;
    const barW = w - 16;
    const barH = 8;

    this.progressBg.clear();
    this.progressBg.fillStyle(COLORS.BORDER, 1);
    this.progressBg.fillRect(barX, barY, barW, barH);

    this.progressFg.clear();
    this.progressFg.fillStyle(COLORS.PRIMARY, 1);
    this.progressFg.fillRect(barX, barY, Math.floor(barW * pct), barH);

    const blocks = Math.floor(pct * 10);
    const bar = '█'.repeat(blocks) + '░'.repeat(10 - blocks);
    this.progressText.setText(`[${bar}] ${Math.floor(pct * 100)}%`);
  }

  clearProgress() {
    this.progressBg.clear();
    this.progressFg.clear();
    this.progressText.setText('');
  }

  runProofAnimation(onComplete, soundSynth) {
    this.proofTimers.forEach(t => t.remove());
    this.proofTimers = [];

    const steps = [
      { delay: 0,    msg: 'CONNECTING TO PROOF SERVER...', color: '#00aa22' },
      { delay: 400,  msg: `NODE_ID: 0x${this._randHex(8)}`, color: '#00aa22' },
      { delay: 700,  msg: 'INITIALIZING ZK_PROOF_CIRCUIT...', color: '#00aa22' },
      { delay: 1100, msg: 'LOADING WITNESS DATA...', color: '#00aa22' },
      { delay: 1400, pct: 0.25 },
      { delay: 2000, pct: 0.50 },
      { delay: 2600, pct: 0.75 },
      { delay: 3000, pct: 1.00 },
      { delay: 3200, msg: 'VERIFYING PROOF HASH...', color: '#00ff41' },
    ];

    steps.forEach(step => {
      const t = this.scene.time.delayedCall(step.delay, () => {
        if (step.msg) {
          this.log(step.msg, step.color || '#00aa22');
          if (soundSynth) soundSynth.proofTick();
        }
        if (step.pct !== undefined) {
          this.setProgress(step.pct);
        }
      });
      this.proofTimers.push(t);
    });

    const finalTimer = this.scene.time.delayedCall(3600, () => {
      if (onComplete) onComplete();
    });
    this.proofTimers.push(finalTimer);
  }

  showProofResult(success, hash, soundSynth) {
    if (success) {
      this.log(`PROOF VERIFIED ✓`, '#00ff41');
      this.log(`HASH: ${hash ? hash.slice(0, 18) + '...' : '0x???'}`, '#00aa22');
      if (soundSynth) soundSynth.proofSuccess();
    } else {
      if (soundSynth) soundSynth.proofFail();
    }
  }

  _randHex(len) {
    return Array.from({ length: len }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('').toUpperCase();
  }

  clear() {
    this.logLines = [];
    this._refresh();
    this.clearProgress();
  }

  destroy() {
    this.proofTimers.forEach(t => t.remove());
    this.panelGfx.destroy();
    this.titleText.destroy();
    this.statusText.destroy();
    this.logTexts.forEach(t => t.destroy());
    if (this._measureText) this._measureText.destroy();
    this.progressBg.destroy();
    this.progressFg.destroy();
    this.progressText.destroy();
    this.scrollBarGfx.destroy();
    this._maskGfx.destroy();
    if (this._hitZone) this._hitZone.destroy();
  }
}

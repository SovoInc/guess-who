import * as Phaser from 'phaser';
import { COLORS, SIDEBAR_X, SIDEBAR_W } from '../constants.js';

const LINE_H = 12;
const LOG_TOP_OFFSET = 36; // px below panel top where log starts
const PROGRESS_BAR_H = 20; // reserved at bottom for progress bar

export class NetworkWindow {
  constructor(scene, y, height, x, w) {
    this.scene = scene;
    this.x = x !== undefined ? x : SIDEBAR_X;
    this.y = y;
    this.w = w !== undefined ? w : SIDEBAR_W;
    this.h = height;
    this.logLines = []; // all lines ever logged
    this.proofTimers = [];
    this._scrollOffset = 0; // 0 = pinned to bottom (latest visible)

    // Compute how many lines fit in the visible area
    const logAreaH = height - LOG_TOP_OFFSET - PROGRESS_BAR_H;
    this._maxVisible = Math.max(1, Math.floor(logAreaH / LINE_H));

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
    this.titleText = scene.add.text(x + 8, y + 6, '[ MIDNIGHT NETWORK ]', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '7px',
      color: '#00ff41',
    });

    // Status
    this.statusText = scene.add.text(x + 8, y + 20, 'STATUS: CONNECTED', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '6px',
      color: '#00aa22',
    });

    // Log text objects (one per visible row)
    this.logTexts = [];
    for (let i = 0; i < this._maxVisible; i++) {
      const t = scene.add.text(x + 8, y + LOG_TOP_OFFSET + i * LINE_H, '', {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '6px',
        color: '#00aa22',
        wordWrap: { width: w - 16 },
      });
      this.logTexts.push(t);
    }

    // Clip log text to panel bounds using a mask (setVisible(false) hides render but mask still works)
    const maskGfx = scene.add.graphics();
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(x, y + LOG_TOP_OFFSET, w, h - LOG_TOP_OFFSET - PROGRESS_BAR_H);
    maskGfx.setVisible(false);
    const mask = maskGfx.createGeometryMask();
    this.logTexts.forEach(t => t.setMask(mask));
    this._maskGfx = maskGfx;

    // Scroll indicator (small scrollbar on right edge)
    this.scrollBarGfx = scene.add.graphics();

    // Progress bar area
    this.progressBg = scene.add.graphics();
    this.progressFg = scene.add.graphics();
    this.progressText = scene.add.text(x + 8, y + h - 14, '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '6px',
      color: '#00ff41',
    });

    // Mouse wheel scrolling on the panel hit area
    const hitZone = scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0, 0)
      .setInteractive();
    hitZone.on('wheel', (_ptr, _dx, dy) => {
      // dy > 0 = scroll down (towards newer), dy < 0 = scroll up (towards older)
      this._scrollOffset = Phaser.Math.Clamp(
        this._scrollOffset - Math.sign(dy),
        0,
        Math.max(0, this.logLines.length - this._maxVisible)
      );
      this._refresh();
    });
    this._hitZone = hitZone;
  }

  log(message, color = '#00aa22') {
    this.logLines.push({ message, color });
    // Auto-scroll to bottom only if already pinned there
    const maxScroll = Math.max(0, this.logLines.length - this._maxVisible);
    if (this._scrollOffset >= maxScroll - 1) {
      this._scrollOffset = maxScroll;
    }
    this._refresh();
  }

  _refresh() {
    const total = this.logLines.length;
    const maxScroll = Math.max(0, total - this._maxVisible);
    this._scrollOffset = Phaser.Math.Clamp(this._scrollOffset, 0, maxScroll);

    const startIdx = maxScroll - this._scrollOffset;

    this.logTexts.forEach((t, i) => {
      const line = this.logLines[startIdx + i];
      if (line) {
        t.setText('> ' + line.message);
        t.setColor(line.color);
      } else {
        t.setText('');
      }
    });

    this._drawScrollBar(total, startIdx);
  }

  _drawScrollBar(total, startIdx) {
    const { x, y, w, h } = this;
    const gfx = this.scrollBarGfx;
    gfx.clear();

    if (total <= this._maxVisible) return; // no scrollbar needed

    const trackX = x + w - 5;
    const trackY = y + LOG_TOP_OFFSET;
    const trackH = h - LOG_TOP_OFFSET - PROGRESS_BAR_H;

    // Track
    gfx.fillStyle(COLORS.PANEL_BG, 1);
    gfx.fillRect(trackX, trackY, 3, trackH);
    gfx.lineStyle(1, COLORS.DIM, 0.5);
    gfx.strokeRect(trackX, trackY, 3, trackH);

    // Thumb
    const thumbH = Math.max(6, Math.floor(trackH * this._maxVisible / total));
    const thumbY = trackY + Math.floor((trackH - thumbH) * startIdx / Math.max(1, total - this._maxVisible));
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
    // Clear old timers
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

    // Final result
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
      this.log('PROOF FAILED ✗', '#ff0000');
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
    this.progressBg.destroy();
    this.progressFg.destroy();
    this.progressText.destroy();
    this.scrollBarGfx.destroy();
    this._maskGfx.destroy();
    if (this._hitZone) this._hitZone.destroy();
  }
}

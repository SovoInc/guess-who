import * as Phaser from 'phaser';
import { COLORS, SIDEBAR_X, SIDEBAR_W } from '../constants.js';

const LINE_GAP = 10;
const LINE_SPACING = 4;
const FONT_SIZE = '7px';
const LOG_TOP_OFFSET = 52; // increased to make room for tabs
const PROGRESS_BAR_H = 30;
const MAX_LOG_TEXTS = 30;

const TAB_LABELS = ['ALL', 'INTEL', 'DEBRIEF'];
const TAB_COUNT = 3;
const TAB_H = 12;

export class NetworkWindow {
  constructor(scene, y, height, x, w) {
    this.scene = scene;
    this.x = x !== undefined ? x : SIDEBAR_X;
    this.y = y;
    this.w = w !== undefined ? w : SIDEBAR_W;
    this.h = height;
    // Tab 0 = ALL, Tab 1 = player questions/cpu answers, Tab 2 = cpu questions/player answers
    this.tabLogs = [[], [], []];
    this.activeTab = 0;
    this.proofTimers = [];
    this._scrollOffsets = [0, 0, 0];

    this._logAreaH = height - LOG_TOP_OFFSET - PROGRESS_BAR_H;

    this._build();
  }

  get logLines() { return this.tabLogs[this.activeTab]; }
  get _scrollOffset() { return this._scrollOffsets[this.activeTab]; }
  set _scrollOffset(v) { this._scrollOffsets[this.activeTab] = v; }

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
    this.titleText = scene.add.text(x + 8, y + 6, '[ NETWORK COMMS ]', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '9px',
      color: '#00ff41',
    });

    // Tabs
    const tabW = Math.floor(w / TAB_COUNT);
    this.tabGfx = scene.add.graphics();
    this.tabTexts = [];
    this.tabHitZones = [];
    for (let i = 0; i < TAB_COUNT; i++) {
      const tx = x + i * tabW;
      const ty = y + 20;
      const t = scene.add.text(tx + 4, ty + 2, TAB_LABELS[i], {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '6px',
        color: i === 0 ? '#00ff41' : '#007722',
      });
      this.tabTexts.push(t);

      const hit = scene.add.rectangle(tx + tabW / 2, ty + TAB_H / 2, tabW, TAB_H, 0, 0)
        .setInteractive()
        .setDepth(10);
      hit.on('pointerdown', () => this._switchTab(i));
      hit.on('pointerover', () => { if (i !== this.activeTab) t.setColor('#00ff41'); });
      hit.on('pointerout',  () => { if (i !== this.activeTab) t.setColor('#007722'); });
      this.tabHitZones.push(hit);
    }
    this._drawTabs();

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

    // Mouse wheel scrolling — accumulate delta, step every 80px
    this._wheelAccum = 0;
    const WHEEL_STEP = 80;
    const hitZone = scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0, 0).setInteractive();
    hitZone.on('wheel', (_ptr, _dx, dy) => {
      this._wheelAccum += dy;
      const steps = Math.trunc(this._wheelAccum / WHEEL_STEP);
      if (steps !== 0) {
        this._wheelAccum -= steps * WHEEL_STEP;
        this._scrollOffsets[this.activeTab] = Phaser.Math.Clamp(
          this._scrollOffsets[this.activeTab] + steps,
          0,
          this.tabLogs[this.activeTab].length
        );
        this._refresh();
      }
    });
    this._hitZone = hitZone;
  }

  _drawTabs() {
    const { x, y, w } = this;
    const tabW = Math.floor(w / TAB_COUNT);
    const gfx = this.tabGfx;
    gfx.clear();
    for (let i = 0; i < TAB_COUNT; i++) {
      const tx = x + i * tabW;
      const ty = y + 20;
      const active = i === this.activeTab;
      gfx.fillStyle(active ? COLORS.BORDER : COLORS.PANEL_BG, 1);
      gfx.fillRect(tx, ty, tabW, TAB_H);
      gfx.lineStyle(1, active ? COLORS.PRIMARY : COLORS.DIM, 1);
      gfx.strokeRect(tx, ty, tabW, TAB_H);
      this.tabTexts[i].setColor(active ? '#00ff41' : '#007722');
    }
  }

  _switchTab(i) {
    this.activeTab = i;
    this._drawTabs();
    this._refresh();
  }

  // Log to a specific tab (and also to tab 0 ALL)
  logTab(tabIndex, message, color = '#00aa22') {
    if (tabIndex !== 0) {
      this.tabLogs[0].push({ message, color });
    }
    this.tabLogs[tabIndex].push({ message, color });
    if (this.activeTab === 0 || this.activeTab === tabIndex) {
      this._scrollOffsets[this.activeTab] = 0;
      this._refresh();
    }
  }

  // Convenience: log to ALL tab only (system messages, non-question events)
  log(message, color = '#00aa22') {
    this.logTab(0, message, color);
  }

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
    const { x, y } = this;
    const lines = this.tabLogs[this.activeTab];
    const total = lines.length;

    this.logTexts.forEach(t => { t.setText(''); t.setVisible(false); });

    if (total === 0) { this._drawScrollBar(0); return; }

    for (const line of lines) {
      if (line.height === undefined) {
        line.height = this._measureHeight(line.message);
      }
    }

    const scrollOffset = this._scrollOffsets[this.activeTab];
    const anchorIdx = Math.max(0, total - 1 - scrollOffset);

    const visible = [];
    let usedH = 0;
    for (let i = anchorIdx; i >= 0; i--) {
      const entryH = lines[i].height + LINE_GAP;
      if (usedH + lines[i].height > this._logAreaH && visible.length > 0) break;
      visible.unshift(i);
      usedH += entryH;
    }

    let curY = y + LOG_TOP_OFFSET;
    visible.forEach((lineIdx, slot) => {
      if (slot >= this.logTexts.length) return;
      const line = lines[lineIdx];
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
    const { x, y, w } = this;
    const gfx = this.scrollBarGfx;
    gfx.clear();

    if (total <= 1) return;

    const trackX = x + w - 5;
    const trackY = y + LOG_TOP_OFFSET;
    const trackH = this._logAreaH;

    gfx.fillStyle(COLORS.PANEL_BG, 1);
    gfx.fillRect(trackX, trackY, 3, trackH);
    gfx.lineStyle(1, COLORS.DIM, 0.5);
    gfx.strokeRect(trackX, trackY, 3, trackH);

    const scrollOffset = this._scrollOffsets[this.activeTab];
    const maxScroll = Math.max(1, total - 1);
    const thumbH = Math.max(6, Math.floor(trackH / Math.max(total, 1) * 3));
    const thumbY = trackY + Math.floor((trackH - thumbH) * (1 - scrollOffset / maxScroll));
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
    this.tabLogs = [[], [], []];
    this._refresh();
    this.clearProgress();
  }

  destroy() {
    this.proofTimers.forEach(t => t.remove());
    this.panelGfx.destroy();
    this.tabGfx.destroy();
    this.titleText.destroy();
    this.tabTexts.forEach(t => t.destroy());
    this.tabHitZones.forEach(h => h.destroy());
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

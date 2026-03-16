import { COLORS, GAME_WIDTH, GAME_HEIGHT, QUESTION_CATEGORIES } from '../constants.js';

const CATEGORY_LABELS = ['SEX', 'HEADWEAR', 'HAIR', 'FACIAL_HAIR', 'EYEWEAR', 'MARKER'];
const CATEGORY_DISPLAY = { SEX: 'SEX', HEADWEAR: 'HEADWEAR', HAIR: 'HAIR', FACIAL_HAIR: 'FACIAL', EYEWEAR: 'EYEWEAR', MARKER: 'MARKER' };
const BTN_H = 100;

// 3×2 grid layout: row 0 = SEX, HEADWEAR, HAIR; row 1 = FACIAL_HAIR, EYEWEAR, MARKER
const GRID_ROWS = [
  ['SEX', 'HEADWEAR', 'HAIR'],
  ['FACIAL_HAIR', 'EYEWEAR', 'MARKER'],
];

export class QuestionPanel {
  constructor(scene, onQuestion, soundSynth, gameW, gameH, colX, colW, panelY) {
    this.scene = scene;
    this.onQuestion = onQuestion;
    this.soundSynth = soundSynth;
    this.gameW = gameW || GAME_WIDTH;
    this.gameH = gameH || GAME_HEIGHT;
    this.colX = colX != null ? colX : 0;
    this.colW = colW != null ? colW : (gameW || GAME_WIDTH);
    this.panelY = panelY != null ? panelY : (gameH || GAME_HEIGHT) - BTN_H;
    this.pickerVisible = false;
    this.selectedCategory = null;
    this.pickerContainer = null;
    this.buttons = [];
    this.disabled = false;

    this._buildBottomBar();
    this._buildArrow();
  }

  _buildBottomBar() {
    const scene = this.scene;
    const panelX = this.colX;
    const panelW = this.colW;
    const y = this.panelY;

    // Panel background
    this.barGfx = scene.add.graphics();
    this.barGfx.fillStyle(COLORS.PANEL_BG, 1);
    this.barGfx.fillRect(panelX, y, panelW, BTN_H);
    this.barGfx.lineStyle(1, COLORS.BORDER, 1);
    this.barGfx.strokeRect(panelX, y, panelW, BTN_H);

    // 3-column × 2-row grid filling the panel width
    const cols = 3;
    const rowH = 44;
    const gap = 6;
    const btnW = Math.floor((panelW - (cols + 1) * gap) / cols);
    const gridX = panelX + gap;
    const gridY = y + gap;

    this._panelX = panelX;
    this._panelY = y;
    this._btnW = btnW;

    GRID_ROWS.forEach((rowCats, row) => {
      rowCats.forEach((cat, col) => {
        const bx = gridX + col * (btnW + gap);
        const by = gridY + row * (rowH + gap);
        this._makeButton(bx, by, btnW, rowH, CATEGORY_DISPLAY[cat] || cat, () => {
          if (!this.disabled) { this.stopFlash(); this._showPicker(cat); }
        });
      });
    });
  }

  _makeButton(x, y, w, h, label, onClick) {
    const scene = this.scene;

    const gfx = scene.add.graphics();
    const drawBtn = (hover) => {
      gfx.clear();
      gfx.fillStyle(hover ? COLORS.BORDER : COLORS.PANEL_BG, 1);
      gfx.fillRect(x, y, w, h);
      gfx.lineStyle(1, hover ? COLORS.DIM : COLORS.BORDER, 1);
      gfx.strokeRect(x, y, w, h);
    };
    drawBtn(false);

    const text = scene.add.text(x + w / 2, y + h / 2, label, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '9px',
      color: '#00ff41',
    }).setOrigin(0.5);

    const hit = scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => { if (this.pickerVisible || this._enemyTurn || this.disabled) return; drawBtn(true); text.setColor('#ffffff'); if (this.soundSynth) this.soundSynth.menuSelect(); });
    hit.on('pointerout',  () => { if (this.pickerVisible || this._enemyTurn || this.disabled) return; drawBtn(false); text.setColor('#00ff41'); });
    hit.on('pointerdown', () => { if (this.pickerVisible || this.disabled) return; if (this.soundSynth) this.soundSynth.click(); onClick(); });

    this.buttons.push({ gfx, text, hit });
    return { gfx, text, hit };
  }

  _showPicker(category) {
    if (this.pickerVisible) {
      this._hidePicker();
      if (this.selectedCategory === category) return;
    }

    this.selectedCategory = category;
    this.pickerVisible = true;
    this._pickerReady = false;
    this.scene.time.delayedCall(80, () => { this._pickerReady = true; });

    const values = QUESTION_CATEGORIES[category];
    const scene = this.scene;
    const pw = this.colW;
    const px = this.colX;
    const itemH = 28;
    const HEADER_H = 20;
    const SCROLLBAR_W = 6;
    const MAX_VISIBLE = 7;
    const visibleCount = Math.min(values.length, MAX_VISIBLE);
    const listH = visibleCount * itemH;
    const pickerH = HEADER_H + listH + 4;
    const finalY = this._panelY - pickerH - 4;
    const itemW = pw - SCROLLBAR_W - 8;
    const needsScroll = values.length > MAX_VISIBLE;

    this._pickerObjects = [];
    this._pickerScrollOffset = 0;

    // Background
    const bg = scene.add.graphics().setDepth(20);
    bg.fillStyle(COLORS.PANEL_BG, 0.98);
    bg.fillRect(px, finalY, pw, pickerH);
    bg.lineStyle(1, COLORS.DIM, 1);
    bg.strokeRect(px, finalY, pw, pickerH);
    this._pickerObjects.push(bg);

    // Header
    const displayName = CATEGORY_DISPLAY[category] || category;
    const title = scene.add.text(px + 8, finalY + 5, `${displayName}:`, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '6px',
      color: '#00ff41',
    }).setDepth(21);
    this._pickerObjects.push(title);

    // X close button
    const closeSize = 14;
    const closeX = px + pw - closeSize - 4;
    const closeY = finalY + 3;
    const closeGfx = scene.add.graphics().setDepth(22);
    const drawClose = (hover) => {
      closeGfx.clear();
      closeGfx.fillStyle(hover ? 0x440000 : COLORS.PANEL_BG, 1);
      closeGfx.fillRect(closeX, closeY, closeSize, closeSize);
      closeGfx.lineStyle(1, hover ? 0xff4444 : 0x663333, 1);
      closeGfx.strokeRect(closeX, closeY, closeSize, closeSize);
    };
    drawClose(false);
    const closeText = scene.add.text(closeX + closeSize / 2, closeY + closeSize / 2, 'X', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '6px',
      color: '#ff4444',
    }).setOrigin(0.5, 0.5).setDepth(23);
    const closeHit = scene.add.rectangle(closeX + closeSize / 2, closeY + closeSize / 2, closeSize, closeSize, 0, 0)
      .setDepth(23).setInteractive({ useHandCursor: true });
    closeHit.on('pointerover', () => { drawClose(true); closeText.setColor('#ff8888'); });
    closeHit.on('pointerout',  () => { drawClose(false); closeText.setColor('#ff4444'); });
    closeHit.on('pointerup',   () => { this._hidePicker(); });
    this._pickerObjects.push(closeGfx, closeText, closeHit);

    // List area origin
    const listX = px + 4;
    const listY = finalY + HEADER_H;

    // Scrollbar
    const sbGfx = scene.add.graphics().setDepth(23);
    this._pickerObjects.push(sbGfx);

    const drawScrollbar = () => {
      sbGfx.clear();
      if (!needsScroll) return;
      const sbX = px + pw - SCROLLBAR_W - 2;
      sbGfx.fillStyle(0x003300, 1);
      sbGfx.fillRect(sbX, listY, SCROLLBAR_W, listH);
      const thumbH = Math.max(20, (visibleCount / values.length) * listH);
      const maxScroll = values.length - visibleCount;
      const thumbY = listY + (this._pickerScrollOffset / maxScroll) * (listH - thumbH);
      sbGfx.fillStyle(0x00ff41, 1);
      sbGfx.fillRect(sbX, thumbY, SCROLLBAR_W, thumbH);
    };

    // Item rows — one set of objects, repositioned on scroll
    const itemObjs = values.map((val, i) => {
      const valGfx = scene.add.graphics().setDepth(21);
      const valText = scene.add.text(0, 0, val.replace(/_/g, ' ').toUpperCase(), {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '7px',
        color: '#00ff41',
      }).setOrigin(0, 0.5).setDepth(22);
      const hit = scene.add.rectangle(0, 0, itemW, 22, 0x000000, 0)
        .setDepth(22).setInteractive({ useHandCursor: true });

      const draw = (hover) => {
        const rowY = listY + (i - this._pickerScrollOffset) * itemH;
        const visible = i >= this._pickerScrollOffset && i < this._pickerScrollOffset + visibleCount;
        valGfx.clear();
        valText.setVisible(visible);
        hit.setVisible(visible);
        if (!visible) return;
        valGfx.fillStyle(hover ? COLORS.BORDER : COLORS.PANEL_BG, 1);
        valGfx.fillRect(listX, rowY, itemW, 22);
        valGfx.lineStyle(1, hover ? COLORS.DIM : COLORS.BORDER, 1);
        valGfx.strokeRect(listX, rowY, itemW, 22);
        valText.setPosition(listX + 4, rowY + 11);
        hit.setPosition(listX + itemW / 2, rowY + 11);
      };

      draw(false);

      hit.on('pointerover', () => { draw(true); valText.setColor('#ffffff'); if (this.soundSynth) this.soundSynth.menuSelect(); });
      hit.on('pointerout',  () => { draw(false); valText.setColor('#00ff41'); });
      hit.on('pointerup', () => {
        if (!this._pickerReady) return;
        if (this.soundSynth) this.soundSynth.click();
        const chosen = val;
        const chosenCat = category;
        this._hidePicker();
        if (this.onQuestion) this.onQuestion(chosenCat, chosen);
      });

      this._pickerObjects.push(valGfx, valText, hit);
      return { draw, valText };
    });

    const redraw = () => {
      itemObjs.forEach(o => { o.valText.setColor('#00ff41'); o.draw(false); });
      drawScrollbar();
    };

    // Mouse wheel scroll
    this._pickerWheelHandler = (pointer, dx, dy) => {
      if (!needsScroll) return;
      const maxScroll = values.length - visibleCount;
      this._pickerScrollOffset = Math.max(0, Math.min(maxScroll, this._pickerScrollOffset + (dy > 0 ? 1 : -1)));
      redraw();
    };
    scene.input.on('wheel', this._pickerWheelHandler);

    // Click outside to close
    this._pickerOutsideHandler = (pointer) => {
      if (!this._pickerReady) return;
      const inX = pointer.x >= px && pointer.x <= px + pw;
      const inY = pointer.y >= finalY && pointer.y <= finalY + pickerH;
      if (!inX || !inY) this._hidePicker();
    };
    scene.input.on('pointerdown', this._pickerOutsideHandler);

    drawScrollbar();
  }

  _hidePicker() {
    if (!this.pickerVisible && (!this._pickerObjects || !this._pickerObjects.length)) return;
    this.pickerVisible = false;
    this.selectedCategory = null;
    this._pickerReady = false;

    if (this._pickerWheelHandler) { this.scene.input.off('wheel', this._pickerWheelHandler); this._pickerWheelHandler = null; }
    if (this._pickerOutsideHandler) { this.scene.input.off('pointerdown', this._pickerOutsideHandler); this._pickerOutsideHandler = null; }

    const objs = this._pickerObjects || [];
    this._pickerObjects = [];
    objs.forEach(o => { if (o && o.scene) o.destroy(); });

    if (this.pickerContainer) { this.pickerContainer.destroy(); this.pickerContainer = null; }
  }

  _buildArrow() {
    const scene = this.scene;
    const cx = this.colX + this.colW / 2;
    const arrowY = this.panelY - 20;

    // Pixelated downward arrow using graphics (3 segments)
    this._arrowGfx = scene.add.graphics().setDepth(15).setVisible(false);
    this._arrowBaseY = arrowY;
    this._arrowOffset = 0;

    const draw = () => {
      const g = this._arrowGfx;
      const y = this._arrowBaseY + this._arrowOffset;
      g.clear();
      g.fillStyle(0x00ff41, 1);
      // Body: 10px wide, 14px tall
      g.fillRect(cx - 5, y - 18, 10, 14);
      // Arrow head pixel steps (wide → tip), each row 4px tall
      g.fillRect(cx - 14, y - 4, 28, 4);
      g.fillRect(cx - 11, y,     22, 4);
      g.fillRect(cx - 8,  y + 4, 16, 4);
      g.fillRect(cx - 5,  y + 8, 10, 4);
      g.fillRect(cx - 2,  y + 12, 4, 4);
    };
    this._arrowDraw = draw;
  }

  _startArrow() {
    if (this._arrowTween) return;
    this._arrowGfx.setVisible(true);
    this._arrowOffset = 0;
    this._arrowDraw();
    const proxy = { offset: 0 };
    const bounce = () => {
      if (!this._arrowTween) return;
      this.scene.tweens.add({
        targets: proxy,
        offset: 14,
        duration: 220,
        ease: 'Quad.easeIn',
        onUpdate: () => { this._arrowOffset = proxy.offset; this._arrowDraw(); },
        onComplete: () => {
          if (!this._arrowTween) return;
          this.scene.tweens.add({
            targets: proxy,
            offset: 0,
            duration: 160,
            ease: 'Quad.easeOut',
            onUpdate: () => { this._arrowOffset = proxy.offset; this._arrowDraw(); },
            onComplete: () => { this.scene.time.delayedCall(80, bounce); },
          });
        },
      });
    };
    this._arrowTween = { active: true, stop: () => {} }; // sentinel
    bounce();
  }

  _stopArrow() {
    this._arrowTween = null; // sentinel check in bounce() stops the chain
    if (this._arrowGfx) { this._arrowGfx.setVisible(false); this._arrowGfx.clear(); }
  }

  _drawButtons(on) {
    this.buttons.forEach(({ gfx, text, hit }) => {
      const x = hit.x - hit.width / 2;
      const y = hit.y - hit.height / 2;
      const w = hit.width;
      const h = hit.height;
      gfx.clear();
      gfx.fillStyle(on ? COLORS.BORDER : COLORS.PANEL_BG, 1);
      gfx.fillRect(x, y, w, h);
      gfx.lineStyle(1, on ? COLORS.DIM : COLORS.BORDER, 1);
      gfx.strokeRect(x, y, w, h);
      text.setColor(on ? '#39ff14' : '#00ff41');
    });
  }

  flash() {
    this.stopFlash();
    this._startArrow();
    this._blinkState = false;
    this._blinkTimer = this.scene.time.addEvent({
      delay: 400,
      loop: true,
      callback: () => {
        if (this.disabled || this._enemyTurn) { this.stopFlash(); return; }
        this._blinkState = !this._blinkState;
        this._drawButtons(this._blinkState);
      },
    });
  }

  stopFlash() {
    if (this._blinkTimer) {
      this._blinkTimer.remove();
      this._blinkTimer = null;
    }
    this._blinkState = false;
    this._drawButtons(false);
    this._stopArrow();
  }

  setDisabled(val) {
    this.disabled = val;
    if (val) { this._hidePicker(); this.stopFlash(); }
    if (!this._enemyTurn) {
      this.buttons.forEach(({ text }) => {
        text.setColor(val ? '#336633' : '#00ff41');
      });
    }
  }

  setEnemyTurn(active) {
    this._enemyTurn = active;
    this.barGfx.clear();
    const px = this._panelX ?? this.colX;
    const y = this._panelY ?? this.panelY;
    this.barGfx.fillStyle(active ? 0x1a0000 : COLORS.PANEL_BG, 1);
    this.barGfx.fillRect(px, y, this.colW, BTN_H);
    this.barGfx.lineStyle(1, active ? 0x660000 : COLORS.BORDER, 1);
    this.barGfx.strokeRect(px, y, this.colW, BTN_H);
    this.buttons.forEach(({ gfx, text }) => {
      text.setColor(active ? '#660000' : '#00ff41');
    });
  }

  destroy() {
    this.stopFlash();
    this._stopArrow();
    if (this._arrowGfx) { this._arrowGfx.destroy(); this._arrowGfx = null; }
    this._hidePicker();
    this.buttons.forEach(({ gfx, text, hit }) => {
      gfx.destroy(); text.destroy(); hit.destroy();
    });
    if (this.barGfx) this.barGfx.destroy();
  }
}

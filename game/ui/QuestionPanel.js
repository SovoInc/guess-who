import { COLORS, GAME_WIDTH, GAME_HEIGHT, QUESTION_CATEGORIES } from '../constants.js';

const CATEGORY_LABELS = ['RANK', 'SPECIALTY', 'ORIGIN', 'FEATURE'];
const BTN_H = 50;
const BTN_W = 148;

export class QuestionPanel {
  constructor(scene, onQuestion, soundSynth, gameW, gameH) {
    this.scene = scene;
    this.onQuestion = onQuestion;
    this.soundSynth = soundSynth;
    this.gameW = gameW || GAME_WIDTH;
    this.gameH = gameH || GAME_HEIGHT;
    this.pickerVisible = false;
    this.selectedCategory = null;
    this.pickerContainer = null;
    this.buttons = [];
    this.disabled = false;

    this._buildBottomBar();
  }

  _buildBottomBar() {
    const scene = this.scene;
    const y = this.gameH - BTN_H;

    // Bottom bar background
    this.barGfx = scene.add.graphics();
    this.barGfx.fillStyle(COLORS.PANEL_BG, 1);
    this.barGfx.fillRect(0, y, this.gameW, BTN_H);
    this.barGfx.lineStyle(1, COLORS.BORDER, 1);
    this.barGfx.strokeRect(0, y, this.gameW, 1);

    // Category buttons
    CATEGORY_LABELS.forEach((cat, i) => {
      const x = 8 + i * (BTN_W + 6);
      this._makeButton(x, y + 6, BTN_W, 38, cat, () => {
        if (!this.disabled) { this.stopFlash(); this._showPicker(cat); }
      });
    });

    // Help text
    scene.add.text(8 + CATEGORY_LABELS.length * (BTN_W + 6), y + 18, '[?] CLICK CATEGORY TO ASK', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '6px',
      color: '#00aa22',
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
      fontSize: '7px',
      color: '#00cc33',
    }).setOrigin(0.5);

    const hit = scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => { drawBtn(true); text.setColor('#39ff14'); if (this.soundSynth) this.soundSynth.menuSelect(); });
    hit.on('pointerout',  () => { drawBtn(false); text.setColor('#00cc33'); });
    hit.on('pointerdown', () => { if (this.soundSynth) this.soundSynth.click(); onClick(); });

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

    const values = QUESTION_CATEGORIES[category];
    const scene = this.scene;
    const pickerH = values.length * 30 + 16;
    const pickerY = this.gameH - BTN_H - pickerH;

    this.pickerContainer = scene.add.container(0, pickerY + pickerH);

    // Slide up tween
    scene.tweens.add({
      targets: this.pickerContainer,
      y: pickerY,
      duration: 180,
      ease: 'Power2',
    });

    // Background
    const bg = scene.add.graphics();
    bg.fillStyle(COLORS.PANEL_BG, 0.98);
    bg.fillRect(8, 0, 300, pickerH);
    bg.lineStyle(1, COLORS.DIM, 1);
    bg.strokeRect(8, 0, 300, pickerH);
    this.pickerContainer.add(bg);

    // Title
    const title = scene.add.text(18, 6, `${category}:`, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '6px',
      color: '#00cc33',
    });
    this.pickerContainer.add(title);

    values.forEach((val, i) => {
      const btnY = 16 + i * 30;
      const valGfx = scene.add.graphics();
      const draw = (hover) => {
        valGfx.clear();
        valGfx.fillStyle(hover ? COLORS.BORDER : COLORS.PANEL_BG, 1);
        valGfx.fillRect(12, btnY, 290, 24);
        valGfx.lineStyle(1, hover ? COLORS.DIM : COLORS.BORDER, 1);
        valGfx.strokeRect(12, btnY, 290, 24);
      };
      draw(false);

      const valText = scene.add.text(16, btnY + 12, val, {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '7px',
        color: '#00cc33',
      }).setOrigin(0, 0.5);

      const hit = scene.add.rectangle(157, btnY + 12, 290, 24, 0, 0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => { draw(true); valText.setColor('#00ff41'); if (this.soundSynth) this.soundSynth.menuSelect(); });
      hit.on('pointerout',  () => { draw(false); valText.setColor('#00cc33'); });
      hit.on('pointerdown', () => {
        if (this.soundSynth) this.soundSynth.click();
        this._hidePicker();
        if (this.onQuestion) this.onQuestion(category, val);
      });

      this.pickerContainer.add([valGfx, valText, hit]);
    });
  }

  _hidePicker() {
    if (!this.pickerContainer) return;
    const container = this.pickerContainer;
    this.pickerContainer = null;
    this.pickerVisible = false;
    this.selectedCategory = null;

    this.scene.tweens.add({
      targets: container,
      y: this.gameH + 50,
      duration: 150,
      ease: 'Power2',
      onComplete: () => container.destroy(),
    });
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
      text.setColor(on ? '#39ff14' : '#00cc33');
    });
  }

  flash() {
    this.stopFlash();
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
  }

  setDisabled(val) {
    this.disabled = val;
    if (val) { this._hidePicker(); this.stopFlash(); }
    if (!this._enemyTurn) {
      this.buttons.forEach(({ text }) => {
        text.setColor(val ? '#336633' : '#00cc33');
      });
    }
  }

  setEnemyTurn(active) {
    this._enemyTurn = active;
    this.barGfx.clear();
    const y = this.gameH - BTN_H;
    this.barGfx.fillStyle(active ? 0x1a0000 : COLORS.PANEL_BG, 1);
    this.barGfx.fillRect(0, y, this.gameW, BTN_H);
    this.barGfx.lineStyle(1, active ? 0x660000 : COLORS.BORDER, 1);
    this.barGfx.strokeRect(0, y, this.gameW, 1);
    this.buttons.forEach(({ gfx, text }) => {
      text.setColor(active ? '#660000' : '#00cc33');
    });
  }

  destroy() {
    this.stopFlash();
    this._hidePicker();
    this.buttons.forEach(({ gfx, text, hit }) => {
      gfx.destroy(); text.destroy(); hit.destroy();
    });
    this.barGfx.destroy();
  }
}

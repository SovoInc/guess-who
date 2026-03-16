import { COLORS, CARD_W, CARD_H, ROSTER_FRAME } from '../constants.js';

export class CharacterCard {
  constructor(scene, x, y, character, onClick, cardW, cardH) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.character = character;
    this.eliminated = false;
    this.pulsing = false;
    this.cw = cardW || CARD_W;
    this.ch = cardH || CARD_H;

    this._build(onClick);
  }

  _build(onClick) {
    const scene = this.scene;
    const { x, y, character, cw, ch } = this;

    this.container = scene.add.container(x, y);

    const infoH = 30; // bottom info strip height
    const camH  = 16; // top cam label strip height
    const portraitH = ch - infoH - camH;

    // Black background
    this.bg = scene.add.graphics();
    this._drawBg(COLORS.PANEL_BG, COLORS.DIM);
    this.container.add(this.bg);

    // ── TOP: CAM label strip ──────────────────────────────────────────
    const camNum = String((character.id + 1)).padStart(2, '0');
    const camStrip = scene.add.graphics();
    camStrip.fillStyle(0x001a00, 1);
    camStrip.fillRect(0, 0, cw, camH);
    camStrip.lineStyle(1, COLORS.DIM, 1);
    camStrip.strokeRect(0, camH - 1, cw, 1);
    this.container.add(camStrip);

    this.camLabel = scene.add.text(cw / 2, camH / 2, `CAM${camNum}`, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '6px',
      color: '#00ff41',
      stroke: '#003300',
      strokeThickness: 2,
    }).setOrigin(0.5, 0.5);
    this.container.add(this.camLabel);

    // ── MIDDLE: Portrait area ─────────────────────────────────────────
    const frame = ROSTER_FRAME[character.charId] ?? ROSTER_FRAME[character.name?.toLowerCase()] ?? 0;
    if (scene.textures.exists('roster')) {
      const spriteScale = portraitH / 96;
      this.avatarSprite = scene.add.image(cw / 2, camH + portraitH / 2, 'roster', frame)
        .setScale(spriteScale)
        .setOrigin(0.5, 0.5);
      this.container.add(this.avatarSprite);
    }

    // Scanlines over portrait
    const scanGfx = scene.add.graphics();
    for (let sy = camH; sy < camH + portraitH; sy += 3) {
      scanGfx.lineStyle(1, 0x000000, 0.2);
      scanGfx.beginPath();
      scanGfx.moveTo(0, sy);
      scanGfx.lineTo(cw, sy);
      scanGfx.strokePath();
    }
    this.container.add(scanGfx);

    // ── BOTTOM: Info strip ────────────────────────────────────────────
    const infoY = ch - infoH;
    const infoGfx = scene.add.graphics();
    infoGfx.fillStyle(0x001a00, 1);
    infoGfx.fillRect(0, infoY, cw, infoH);
    infoGfx.lineStyle(1, COLORS.DIM, 1);
    infoGfx.strokeRect(0, infoY, cw, infoH);
    this.container.add(infoGfx);

    // ID: NAME
    this.nameText = scene.add.text(4, infoY + 4, `ID:${character.name.toUpperCase()}`, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '6px',
      color: '#00ff41',
      stroke: '#002200',
      strokeThickness: 2,
    }).setOrigin(0, 0);
    this.container.add(this.nameText);

    // SIG: animated signal bars
    const barCount = 5;
    const barW = 3;
    const barGap = 2;
    const sigX = 4;
    const sigY = infoY + 18;
    const sigMaxH = 8;
    this.sigGfx = scene.add.graphics();
    this.container.add(this.sigGfx);

    const sigLabel = scene.add.text(sigX + barCount * (barW + barGap) + 2, sigY - 2, 'SIG', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '4px',
      color: '#005514',
    });
    this.container.add(sigLabel);

    // Initialize with random bars 2–5 active
    this._sigBars = 2 + Math.floor(Math.random() * 4);
    const drawSig = () => {
      if (!this.sigGfx || !this.sigGfx.scene) return;
      this.sigGfx.clear();
      // Dark background track
      this.sigGfx.fillStyle(0x003300, 1);
      this.sigGfx.fillRect(sigX, sigY, barCount * (barW + barGap) - barGap, sigMaxH);
      // Active bars
      this.sigGfx.fillStyle(0x00ff41, 1);
      for (let b = 0; b < this._sigBars; b++) {
        const bh = Math.round(sigMaxH * (b + 1) / barCount);
        this.sigGfx.fillRect(sigX + b * (barW + barGap), sigY + sigMaxH - bh, barW, bh);
      }
      // Dim inactive bars
      this.sigGfx.fillStyle(0x004400, 1);
      for (let b = this._sigBars; b < barCount; b++) {
        const bh = Math.round(sigMaxH * (b + 1) / barCount);
        this.sigGfx.fillRect(sigX + b * (barW + barGap), sigY + sigMaxH - bh, barW, bh);
      }
    };
    drawSig();

    // Fluctuate signal every 1.5–3s
    const fluctuate = () => {
      const delay = 1500 + Math.random() * 1500;
      scene.time.addEvent({
        delay,
        callback: () => {
          if (!this.sigGfx || !this.sigGfx.scene) return;
          // Drift ±1 bar, stay in range 1–5
          const drift = Math.random() < 0.5 ? -1 : 1;
          this._sigBars = Math.max(1, Math.min(barCount, this._sigBars + drift));
          drawSig();
          fluctuate();
        },
      });
    };
    fluctuate();

    const scale = cw / CARD_W;

    // CRT glitch — random scanline flash (no position shift)
    this.glitchGfx = scene.add.graphics();
    this.container.add(this.glitchGfx);
    const scheduleGlitch = () => {
      const delay = 5000 + Math.random() * 10000;
      scene.time.addEvent({
        delay,
        callback: () => {
          if (!this.glitchGfx || !this.glitchGfx.scene) return;
          // Flash 2-4 random horizontal bands
          this.glitchGfx.clear();
          const bands = 2 + Math.floor(Math.random() * 3);
          for (let b = 0; b < bands; b++) {
            const gy = Math.random() * ch;
            const gh = 2 + Math.random() * 6;
            this.glitchGfx.fillStyle(0x00ff41, 0.25 + Math.random() * 0.3);
            this.glitchGfx.fillRect(0, gy, cw, gh);
          }
          scene.time.addEvent({
            delay: 60,
            callback: () => {
              if (this.glitchGfx && this.glitchGfx.scene) this.glitchGfx.clear();
              scheduleGlitch();
            },
          });
        },
      });
    };
    scheduleGlitch();

    // Hit area
    this.hitZone = scene.add.rectangle(cw / 2, ch / 2, cw, ch, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    this.hitZone.on('pointerover', () => this._onHover(true));
    this.hitZone.on('pointerout',  () => this._onHover(false));
    this.hitZone.on('pointerdown', () => { if (onClick) onClick(this.character); });
    this.container.add(this.hitZone);

    // Eliminated overlay
    this.elimGfx = scene.add.graphics();
    this.elimGfx.setVisible(false);
    this.container.add(this.elimGfx);

    this.elimX = scene.add.text(cw / 2, ch / 2, 'X', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: Math.max(24, Math.floor(48 * scale)) + 'px',
      color: '#ff0000',
      alpha: 0.8,
    }).setOrigin(0.5).setVisible(false);
    this.container.add(this.elimX);
  }

  _drawBg(fillColor, strokeColor) {
    const { cw, ch } = this;
    this.bg.clear();
    this.bg.fillStyle(fillColor, 1);
    this.bg.fillRect(0, 0, cw, ch);
    this.bg.lineStyle(2, strokeColor, 1);
    this.bg.strokeRect(0, 0, cw, ch);

    // Corner ticks
    const s = 6;
    this.bg.lineStyle(2, COLORS.PRIMARY, 1);
    this.bg.beginPath(); this.bg.moveTo(0, s); this.bg.lineTo(0, 0); this.bg.lineTo(s, 0); this.bg.strokePath();
    this.bg.beginPath(); this.bg.moveTo(cw - s, 0); this.bg.lineTo(cw, 0); this.bg.lineTo(cw, s); this.bg.strokePath();
    this.bg.beginPath(); this.bg.moveTo(0, ch - s); this.bg.lineTo(0, ch); this.bg.lineTo(s, ch); this.bg.strokePath();
    this.bg.beginPath(); this.bg.moveTo(cw - s, ch); this.bg.lineTo(cw, ch); this.bg.lineTo(cw, ch - s); this.bg.strokePath();
  }

  _onHover(over) {
    if (this.eliminated || this.pulsing) return;
    this._drawBg(
      over ? COLORS.BORDER : COLORS.PANEL_BG,
      over ? COLORS.PRIMARY : COLORS.DIM
    );
  }

  eliminate() {
    if (this.eliminated) return;
    const { cw, ch } = this;
    this.eliminated = true;

    this.bg.fillStyle(0x000000, 0.75);
    this.bg.fillRect(0, 0, cw, ch);
    if (this.avatarSprite) this.avatarSprite.setAlpha(0.2);

    this.elimGfx.setVisible(true);
    this.elimX.setVisible(true);
    this.hitZone.disableInteractive();
  }

  setPulsing(active) {
    this.pulsing = active;
    if (active) {
      this.scene.tweens.add({
        targets: this.bg,
        alpha: { from: 0.6, to: 1.0 },
        yoyo: true,
        repeat: -1,
        duration: 400,
      });
      this._drawBg(COLORS.PANEL_BG, COLORS.PRIMARY);
    } else {
      this.scene.tweens.killTweensOf(this.bg);
      this.bg.setAlpha(1);
      this._drawBg(COLORS.PANEL_BG, COLORS.DIM);
    }
  }

  setPlayerSpy(active) {
    if (!this._goldBorder) {
      this._goldBorder = this.scene.add.graphics();
      this.container.add(this._goldBorder);
    }
    this._goldBorder.clear();
    if (this._goldLabel) { this._goldLabel.destroy(); this._goldLabel = null; }

    if (active) {
      const { cw, ch } = this;
      const labelText = 'PROTECT ASSET';
      const labelFontSize = 5;
      const labelPad = 4;

      // Measure label width roughly (Press Start 2P ~6px per char at 5px size)
      const labelW = labelText.length * 6 + labelPad * 2;
      const labelX = Math.floor((cw - labelW) / 2);
      const labelY = -1; // sits on top border line

      // Draw border with a gap cut out for the label
      this._goldBorder.lineStyle(2, 0xffd700, 1);
      // Top-left segment
      this._goldBorder.beginPath();
      this._goldBorder.moveTo(1, 1);
      this._goldBorder.lineTo(labelX, 1);
      this._goldBorder.strokePath();
      // Top-right segment
      this._goldBorder.beginPath();
      this._goldBorder.moveTo(labelX + labelW, 1);
      this._goldBorder.lineTo(cw - 1, 1);
      this._goldBorder.strokePath();
      // Left, bottom, right sides
      this._goldBorder.strokeRect(1, 1, 0, ch - 2); // left
      this._goldBorder.beginPath();
      this._goldBorder.moveTo(1, 1); this._goldBorder.lineTo(1, ch - 1);
      this._goldBorder.moveTo(1, ch - 1); this._goldBorder.lineTo(cw - 1, ch - 1);
      this._goldBorder.moveTo(cw - 1, ch - 1); this._goldBorder.lineTo(cw - 1, 1);
      this._goldBorder.strokePath();

      // Inner glow
      this._goldBorder.lineStyle(1, 0xffd700, 0.3);
      this._goldBorder.strokeRect(3, 3, cw - 6, ch - 6);

      // Label text centred on top border
      this._goldLabel = this.scene.add.text(cw / 2, labelY + 1, labelText, {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: `${labelFontSize}px`,
        color: '#ffd700',
        backgroundColor: '#000d00',
        padding: { x: labelPad, y: 1 },
      }).setOrigin(0.5, 0.5);
      this.container.add(this._goldLabel);
    }
  }

  destroy() {
    this.container.destroy();
  }
}

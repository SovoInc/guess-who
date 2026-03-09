import { COLORS, CARD_W, CARD_H } from '../constants.js';

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

    // Container
    this.container = scene.add.container(x, y);

    // Background panel
    this.bg = scene.add.graphics();
    this._drawBg(COLORS.PANEL_BG, COLORS.DIM);
    this.container.add(this.bg);

    // Avatar area — procedural silhouette
    this.avatarGfx = scene.add.graphics();
    this._drawAvatar();
    this.container.add(this.avatarGfx);

    // Scale font sizes proportionally based on card width
    const scale = cw / CARD_W;
    const fs8  = Math.max(7, Math.floor(10 * scale)) + 'px';
    const fs6  = Math.max(6, Math.floor(8  * scale)) + 'px';
    const fs5  = Math.max(5, Math.floor(7  * scale)) + 'px';

    // Codename
    this.nameText = scene.add.text(cw / 2, ch - 54 * scale, character.codename, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: fs8,
      color: '#00ff41',
      align: 'center',
    }).setOrigin(0.5, 0);
    this.container.add(this.nameText);

    // Rank
    this.rankText = scene.add.text(cw / 2, ch - 40 * scale, character.rank, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: fs6,
      color: '#39ff14',
      align: 'center',
    }).setOrigin(0.5, 0);
    this.container.add(this.rankText);

    // Specialty
    this.specText = scene.add.text(cw / 2, ch - 28 * scale, character.specialty, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: fs6,
      color: '#00cc33',
      align: 'center',
    }).setOrigin(0.5, 0);
    this.container.add(this.specText);

    // Origin
    this.originText = scene.add.text(cw / 2, ch - 16 * scale, character.origin, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: fs6,
      color: '#00aa22',
      align: 'center',
    }).setOrigin(0.5, 0);
    this.container.add(this.originText);

    // Feature label (top-right)
    this.featureText = scene.add.text(cw - 4, 4, character.feature.replace(/_/g, ' '), {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: fs5,
      color: '#00aa22',
      align: 'right',
    }).setOrigin(1, 0);
    this.container.add(this.featureText);

    // ID badge
    this.idText = scene.add.text(4, 4, `#${String(character.id).padStart(2, '0')}`, {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: fs5,
      color: '#00aa22',
    });
    this.container.add(this.idText);

    // Hit area
    this.hitZone = scene.add.rectangle(cw / 2, ch / 2, cw, ch, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    this.hitZone.on('pointerover', () => this._onHover(true));
    this.hitZone.on('pointerout',  () => this._onHover(false));
    this.hitZone.on('pointerdown', () => {
      if (onClick) onClick(this.character);
    });
    this.container.add(this.hitZone);

    // Eliminated overlay (hidden initially)
    this.elimGfx = scene.add.graphics();
    this.elimGfx.setVisible(false);
    this.container.add(this.elimGfx);

    this.elimX = scene.add.text(cw / 2, ch / 2 - 16 * scale, 'X', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: Math.max(24, Math.floor(48 * scale)) + 'px',
      color: '#ff0000',
      alpha: 0.7,
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

  _drawAvatar() {
    const { cw, ch } = this;
    const gfx = this.avatarGfx;
    gfx.clear();

    const scale = cw / CARD_W;
    const cx = cw / 2;
    const avatarTopH = ch - Math.floor(68 * scale); // how much space avatar gets

    // Head shape — centered vertically in the avatar zone
    const headY = Math.floor(avatarTopH * 0.15);
    const hw = Math.floor(20 * scale);
    const hh = Math.floor(23 * scale);
    gfx.fillStyle(COLORS.DIM, 1);
    gfx.fillRect(cx - hw, headY, hw * 2, hh);

    // Shoulder silhouette
    const shoulderY = headY + hh;
    const sw = Math.floor(28 * scale);
    const sh = Math.floor(11 * scale);
    gfx.fillStyle(COLORS.TEXT_DIM, 0.8);
    gfx.fillRect(cx - sw, shoulderY, sw * 2, sh);

    // Feature-specific detail
    const feat = this.character.feature;
    gfx.lineStyle(1, COLORS.PRIMARY, 0.6);

    const eyeY = headY + Math.floor(8 * scale);
    const mouthY = headY + Math.floor(16 * scale);

    if (feat === 'GLASSES') {
      const gw = Math.floor(7 * scale);
      gfx.strokeRect(cx - hw + 2, eyeY, gw, Math.floor(4 * scale));
      gfx.strokeRect(cx + 2,       eyeY, gw, Math.floor(4 * scale));
      gfx.beginPath(); gfx.moveTo(cx - 2, eyeY + 2); gfx.lineTo(cx + 2, eyeY + 2); gfx.strokePath();
    } else if (feat === 'CYBERNETIC_EYE') {
      gfx.fillStyle(COLORS.DANGER, 0.8);
      gfx.fillCircle(cx + Math.floor(8 * scale), eyeY + 2, Math.floor(3 * scale));
    } else if (feat === 'BEARD') {
      gfx.fillStyle(COLORS.DIM, 1);
      gfx.fillRect(cx - Math.floor(8 * scale), mouthY, Math.floor(16 * scale), Math.floor(5 * scale));
    } else if (feat === 'BALD') {
      gfx.lineStyle(1, COLORS.PRIMARY, 0.3);
      gfx.strokeRect(cx - hw, headY, hw * 2, 1);
    } else if (feat === 'SCAR') {
      gfx.lineStyle(2, COLORS.DANGER, 0.6);
      gfx.beginPath();
      gfx.moveTo(cx - Math.floor(3 * scale), eyeY - 2);
      gfx.lineTo(cx + Math.floor(1 * scale), eyeY + Math.floor(6 * scale));
      gfx.strokePath();
    } else if (feat === 'TATTOO') {
      gfx.lineStyle(1, COLORS.DIM, 0.8);
      gfx.strokeCircle(cx - Math.floor(6 * scale), eyeY + 4, Math.floor(3 * scale));
    } else if (feat === 'HEADSET') {
      // Arc over head + earpiece dot + wire down to chin
      gfx.lineStyle(1, COLORS.PRIMARY, 0.9);
      gfx.beginPath();
      gfx.arc(cx, headY + Math.floor(4 * scale), hw + Math.floor(2 * scale), Math.PI, 0, false);
      gfx.strokePath();
      gfx.fillStyle(COLORS.PRIMARY, 1);
      gfx.fillCircle(cx + hw + Math.floor(2 * scale), eyeY, Math.floor(2 * scale));
      gfx.lineStyle(1, COLORS.PRIMARY, 0.7);
      gfx.beginPath();
      gfx.moveTo(cx + hw + Math.floor(2 * scale), eyeY);
      gfx.lineTo(cx + hw + Math.floor(2 * scale), mouthY);
      gfx.strokePath();
    } else if (feat === 'EYE_PATCH') {
      // Dark filled rectangle over left eye
      gfx.fillStyle(0x000000, 1);
      gfx.fillRect(cx - hw + 1, eyeY - 1, Math.floor(9 * scale), Math.floor(5 * scale));
      gfx.lineStyle(1, COLORS.DIM, 1);
      gfx.strokeRect(cx - hw + 1, eyeY - 1, Math.floor(9 * scale), Math.floor(5 * scale));
      // Strap across head
      gfx.beginPath();
      gfx.moveTo(cx - hw + 1, eyeY + 1);
      gfx.lineTo(cx + hw - 1, eyeY + 1);
      gfx.strokePath();
    }

    // Specialty emblem (tiny)
    const specColor = {
      INFILTRATION: COLORS.DIM,
      SNIPER:       COLORS.PRIMARY,
      DEMOLITIONS:  COLORS.WARNING,
      INTEL:        COLORS.ACCENT,
      COMMS:        COLORS.DIM,
      MEDIC:        COLORS.PRIMARY,
    }[this.character.specialty] || COLORS.DIM;

    gfx.fillStyle(specColor, 0.4);
    gfx.fillRect(cx - 4, shoulderY, 8, Math.floor(6 * scale));
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
      const { cw, ch } = this;
      this._goldBorder = this.scene.add.graphics();
      this.container.add(this._goldBorder);
    }
    this._goldBorder.clear();
    if (active) {
      const { cw, ch } = this;
      this._goldBorder.lineStyle(2, 0xffd700, 1);
      this._goldBorder.strokeRect(1, 1, cw - 2, ch - 2);
      // inner glow line
      this._goldBorder.lineStyle(1, 0xffd700, 0.4);
      this._goldBorder.strokeRect(3, 3, cw - 6, ch - 6);
    }
  }

  destroy() {
    this.container.destroy();
  }
}

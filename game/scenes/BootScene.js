import * as Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../constants.js';
import { applyCRTOverlay } from '../utils/crt.js';
import { SoundSynth } from '../audio/SoundSynth.js';
import { clearAddress } from '../wallet.js';

const BOOT_LINES = [
  'GHOST CYPHER OS v2.7.1',
  'INITIALIZING SECURE CHANNEL...',
  'LOADING ENCRYPTION MODULES...',
  'CALIBRATING ZK PROOF CIRCUITS...',
  'AUTHENTICATING AGENT...',
  'SECURE CONNECTION ESTABLISHED.',
  '',
  '> PRESS ANY KEY TO PROCEED',
];

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create() {
    clearAddress();
    this.sound = new SoundSynth();
    this.registry.set('sound', this.sound);

    // Black background
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.BG);

    this.lineTexts = [];
    this.currentLine = 0;
    this.currentChar = 0;
    this.typingDone = false;
    this.ready = false;
    this._active = true;

    // Cursor blink
    this.cursor = this.add.text(0, 0, '_', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '12px',
      color: '#00ff41',
    }).setVisible(false);

    this.tweens.add({
      targets: this.cursor,
      alpha: { from: 1, to: 0 },
      ease: 'Stepped',
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    // Start typing
    this._typeNextLine();

    // Skip on input
    this.input.once('pointerdown', () => {
      if (this.sound) this.sound.bootBeep();
      this._skipToEnd();
    });
    this.input.keyboard.once('keydown', () => {
      if (this.sound) this.sound.bootBeep();
      this._skipToEnd();
    });

    applyCRTOverlay(this);
  }

  _typeNextLine() {
    if (this.currentLine >= BOOT_LINES.length) {
      this.typingDone = true;
      this.ready = true;

      // Enable proceed input
      this.input.once('pointerdown', () => this._proceed());
      this.input.keyboard.once('keydown', () => this._proceed());
      return;
    }

    const y = 80 + this.currentLine * 28;
    const lineText = this.add.text(60, y, '', {
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '11px',
      color: '#00ff41',
    });
    this.lineTexts.push(lineText);

    this.cursor.setPosition(60, y);
    this.cursor.setVisible(true);

    const fullLine = BOOT_LINES[this.currentLine];
    let charIdx = 0;

    if (fullLine === '') {
      // Empty line, just advance
      this.currentLine++;
      this.time.delayedCall(100, () => this._typeNextLine());
      return;
    }

    const typeChar = () => {
      if (!this._active || !lineText.scene) return;
      if (charIdx < fullLine.length) {
        lineText.setText(fullLine.slice(0, charIdx + 1));
        this.cursor.setPosition(60 + lineText.width, y);
        charIdx++;
        if (charIdx % 3 === 0) this.sound.bootBeep();
        this.time.delayedCall(35, typeChar);
      } else {
        // Line done
        this.currentLine++;
        this.time.delayedCall(120, () => { if (this._active) this._typeNextLine(); });
      }
    };

    typeChar();
  }

  _skipToEnd() {
    if (this.typingDone) {
      this._proceed();
      return;
    }

    // Clear and show all lines immediately
    this.lineTexts.forEach(t => t.destroy());
    this.lineTexts = [];

    BOOT_LINES.forEach((line, i) => {
      const y = 80 + i * 28;
      const t = this.add.text(60, y, line, {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '11px',
        color: '#00ff41',
      });
      this.lineTexts.push(t);
    });

    this.typingDone = true;
    this.cursor.setVisible(false);

    // Listen for proceed
    this.time.delayedCall(300, () => {
      this.input.once('pointerdown', () => this._proceed());
      this.input.keyboard.once('keydown', () => this._proceed());
    });
  }

  _proceed() {
    this._active = false;
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('MenuScene');
    });
  }

  shutdown() {
    this._active = false;
    this.time.removeAllEvents();
  }
}

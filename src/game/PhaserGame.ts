import Phaser from 'phaser';

// React updates this ref after every render.
// GameScene reads it when the player declares a spy.
export const declareSpyRef: { current: (() => Promise<void>) | null } = { current: null };

export function createPhaserGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent,
    backgroundColor: '#1a1a2e',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [GameScene],
  });
}

class GameScene extends Phaser.Scene {
  private declareButton!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private busy = false;

  constructor() { super('GameScene'); }

  create() {
    this.add.text(400, 60, 'Guess Who', {
      fontSize: '48px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(400, 110, 'Midnight Network Edition', {
      fontSize: '16px',
      color: '#888888',
    }).setOrigin(0.5);

    const board = this.add.rectangle(400, 300, 700, 320, 0x0d0d1e, 1);
    board.setStrokeStyle(1, 0x333366);
    this.add.text(400, 300, '[Game Board]', {
      fontSize: '18px',
      color: '#444466',
    }).setOrigin(0.5);

    this.declareButton = this.add.text(400, 500, '[ Declare Spy! ]', {
      fontSize: '24px',
      color: '#4ade80',
      backgroundColor: '#1a3a1a',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.declareButton.on('pointerover', () => { if (!this.busy) this.declareButton.setColor('#86efac'); });
    this.declareButton.on('pointerout',  () => { if (!this.busy) this.declareButton.setColor('#4ade80'); });
    this.declareButton.on('pointerdown', () => this.handleDeclare());

    this.statusText = this.add.text(400, 560, 'Join contract to enable on-chain declarations', {
      fontSize: '12px',
      color: '#666666',
    }).setOrigin(0.5);
  }

  private async handleDeclare() {
    if (this.busy) return;
    if (!declareSpyRef.current) {
      this.statusText.setText('Connect wallet & join contract first').setColor('#f87171');
      return;
    }
    this.busy = true;
    this.declareButton.setColor('#888888');
    this.statusText.setText('Submitting to Midnight...').setColor('#facc15');
    try {
      await declareSpyRef.current();
      this.statusText.setText('✓ Spy declared on-chain!').setColor('#4ade80');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.statusText.setText(`✗ ${msg.slice(0, 70)}`).setColor('#f87171');
    } finally {
      this.busy = false;
      this.declareButton.setColor('#4ade80');
    }
  }
}

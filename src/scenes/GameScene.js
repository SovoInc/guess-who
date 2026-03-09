import Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.add.text(400, 300, 'Guess Who!', {
      fontSize: '48px',
      color: '#ffffff',
    }).setOrigin(0.5);
  }

  update() {
    // Game loop
  }
}

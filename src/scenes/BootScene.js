import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // Load assets here
    // this.load.image('logo', 'assets/logo.png');
  }

  create() {
    this.scene.start('GameScene');
  }
}

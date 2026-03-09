import * as Phaser from 'phaser';
import { BootScene }   from './scenes/BootScene.js';
import { MenuScene }   from './scenes/MenuScene.js';
import { GameScene }   from './scenes/GameScene.js';
import { ResultScene } from './scenes/ResultScene.js';
import { GAME_WIDTH, GAME_HEIGHT } from './constants.js';

export function createGame(parent) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    width:  GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#000000',
    parent,
    scene: [BootScene, MenuScene, GameScene, ResultScene],
    audio: {
      disableWebAudio: false,
    },
    render: {
      pixelArt: false,
      antialias: true,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      min: { width: GAME_WIDTH, height: GAME_HEIGHT },
    },
  });
}

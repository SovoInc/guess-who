import * as Phaser from 'phaser';
import { BootScene }   from './scenes/BootScene.js';
import { MenuScene }   from './scenes/MenuScene.js';
import { GameScene }   from './scenes/GameScene.js';
import { ResultScene } from './scenes/ResultScene.js';
import { GAME_WIDTH, GAME_HEIGHT } from './constants.js';

export function createGame(parent) {
  // Use stacked layout for narrow viewports
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const stacked = vw < 900;
  const w = stacked ? 860  : GAME_WIDTH;
  const h = stacked ? 1260 : GAME_HEIGHT;

  return new Phaser.Game({
    type: Phaser.AUTO,
    width:  w,
    height: h,
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
    },
  });
}

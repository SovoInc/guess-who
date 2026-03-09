import * as Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../constants.js';

/**
 * Applies CRT scanline + vignette overlay to a Phaser scene.
 * Call from scene.create() after building your scene content.
 */
export function applyCRTOverlay(scene) {
  const gfx = scene.add.graphics();
  gfx.setDepth(1000);

  // Horizontal scanlines every 3px
  for (let y = 0; y < GAME_HEIGHT; y += 3) {
    gfx.fillStyle(0x000000, 0.10);
    gfx.fillRect(0, y, GAME_WIDTH, 1);
  }

  // Vignette — dark gradient edges
  const vigW = 80;
  const vigAlpha = 0.35;

  // Left
  for (let i = 0; i < vigW; i++) {
    const a = vigAlpha * (1 - i / vigW);
    gfx.fillStyle(0x000000, a);
    gfx.fillRect(i, 0, 1, GAME_HEIGHT);
  }
  // Right
  for (let i = 0; i < vigW; i++) {
    const a = vigAlpha * (i / vigW);
    gfx.fillStyle(0x000000, a);
    gfx.fillRect(GAME_WIDTH - vigW + i, 0, 1, GAME_HEIGHT);
  }
  // Top
  for (let i = 0; i < vigW; i++) {
    const a = vigAlpha * (1 - i / vigW);
    gfx.fillStyle(0x000000, a);
    gfx.fillRect(0, i, GAME_WIDTH, 1);
  }
  // Bottom
  for (let i = 0; i < vigW; i++) {
    const a = vigAlpha * (i / vigW);
    gfx.fillStyle(0x000000, a);
    gfx.fillRect(0, GAME_HEIGHT - vigW + i, GAME_WIDTH, 1);
  }
}

/**
 * Draws MGS-style corner tick marks on a Phaser Graphics object.
 * x, y = top-left of the box, w/h = dimensions
 */
export function drawCornerTicks(gfx, x, y, w, h, color = 0x00ff41, size = 8) {
  gfx.lineStyle(2, color, 1);
  const tl = [x, y];
  const tr = [x + w, y];
  const bl = [x, y + h];
  const br = [x + w, y + h];

  // Top-left
  gfx.strokeRect(tl[0], tl[1], size, 0);
  gfx.strokeRect(tl[0], tl[1], 0, size);
  // Top-right
  gfx.strokeRect(tr[0] - size, tr[1], size, 0);
  gfx.strokeRect(tr[0], tr[1], 0, size);
  // Bottom-left
  gfx.strokeRect(bl[0], bl[1], size, 0);
  gfx.strokeRect(bl[0], bl[1] - size, 0, size);
  // Bottom-right
  gfx.strokeRect(br[0] - size, br[1], size, 0);
  gfx.strokeRect(br[0], br[1] - size, 0, size);
}

/**
 * Creates a text flicker tween on a Phaser text object.
 */
export function addFlickerTween(scene, textObj) {
  scene.tweens.add({
    targets: textObj,
    alpha: { from: 0.85, to: 1.0 },
    ease: 'Stepped',
    duration: 100,
    yoyo: true,
    repeat: 1,
    repeatDelay: Phaser.Math.Between(2000, 5000),
    onComplete: () => {
      addFlickerTween(scene, textObj);
    },
  });
}

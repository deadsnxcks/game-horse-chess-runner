import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './constants';
import { GameScene } from './GameScene';

/**
 * На телефонах с плотным экраном холст рисуем в 2 раза крупнее, иначе браузер растягивает
 * картинку и она мылится. Мир игры при этом остаётся 720×1280: сцена приближает камеру
 * ровно во столько же раз (см. create() в GameScene).
 */
const RENDER_SCALE = Math.min(2, Math.max(1, Math.round(window.devicePixelRatio || 1)));

export function createGame(parent: string): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH * RENDER_SCALE,
    height: GAME_HEIGHT * RENDER_SCALE,
    backgroundColor: '#0b1220',
    scene: [GameScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    // Звуки синтезирует sound.ts через Web Audio — встроенный звук Phaser не нужен
    audio: { noAudio: true },
  };

  return new Phaser.Game(config);
}

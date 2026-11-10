/**
 * Кнопки в одном стиле: скруглённые углы, главная кнопка — акцентного цвета, остальные — тёмные.
 * Все элементы привязаны к экрану (scrollFactor 0) — они не уезжают вместе с доской.
 */
import Phaser from 'phaser';
import { COLOR, FONT } from './theme';

export interface Button {
  /** Фон кнопки — он же ловит нажатия. */
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

/** primary — главное действие (акцентный цвет), secondary — остальные. */
export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  text: string,
  kind: 'primary' | 'secondary',
  depth: number,
  resolution: number,
): Button {
  const primary = kind === 'primary';
  const height = primary ? 100 : 84;
  const bg = scene.add
    .rectangle(x, y, width, height, primary ? COLOR.accent : COLOR.chip)
    .setRounded(height / 2)
    .setScrollFactor(0)
    .setDepth(depth)
    .setInteractive({ useHandCursor: true });
  if (!primary) bg.setStrokeStyle(3, COLOR.panelEdge);
  const label = scene.add
    .text(x, y, text, {
      fontFamily: FONT,
      fontSize: primary ? '38px' : '32px',
      fontStyle: 'bold',
      color: primary ? COLOR.onAccent : COLOR.text,
      resolution,
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(depth);
  return { bg, label };
}

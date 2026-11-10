/**
 * Отклик игры: короткие анимации поверх основного действия.
 * Каждая функция сама удаляет свои объекты, когда анимация закончилась.
 * Всё сделано на tween'ах, поэтому на паузе эффекты замирают вместе с игрой.
 */
import Phaser from 'phaser';
import { DEPTH, FONT } from './theme';

interface Point {
  x: number;
  y: number;
}

/** Осколки разлетаются из точки: съеденная фигура, срубленный конь. Тёмный контур — как у фигур. */
export function burst(scene: Phaser.Scene, at: Point, color: number, count = 12): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const distance = 60 + Math.random() * 50;
    const bit = scene.add
      .rectangle(at.x, at.y, 16, 16, color)
      .setStrokeStyle(3, 0x17191d)
      .setDepth(DEPTH.effects)
      .setAngle(Math.random() * 90);
    scene.tweens.add({
      targets: bit,
      x: at.x + Math.cos(angle) * distance,
      y: at.y + Math.sin(angle) * distance,
      angle: bit.angle + 180,
      scale: 0.3,
      // Осколки видны почти весь полёт и гаснут только в конце
      alpha: { value: 0, delay: 250, duration: 250 },
      duration: 500,
      ease: 'Cubic.easeOut',
      onComplete: () => bit.destroy(),
    });
  }
}

/** Всплывающая надпись: «+1» за новый ряд, «+3» за взятие. */
export function floatText(
  scene: Phaser.Scene,
  at: Point,
  text: string,
  color: string,
  size: number,
  resolution: number,
): void {
  const label = scene.add
    .text(at.x, at.y, text, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      stroke: '#0b1220',
      strokeThickness: 6,
      resolution,
    })
    .setOrigin(0.5)
    .setScale(0.6)
    .setDepth(DEPTH.effects);
  scene.tweens.add({
    targets: label,
    y: at.y - 80,
    scale: { value: 1, duration: 160, ease: 'Back.easeOut' }, // «выскакивает»
    alpha: { value: 0, delay: 350, duration: 350 }, // видна почти весь подъём, тает в конце
    duration: 700,
    ease: 'Cubic.easeOut',
    onComplete: () => label.destroy(),
  });
}

/** Кольцо расходится от клетки, куда приземлился конь. */
export function ring(scene: Phaser.Scene, at: Point, color: number, alpha: number): void {
  const circle = scene.add
    .circle(at.x, at.y, 30)
    .setStrokeStyle(8, color)
    .setAlpha(alpha)
    .setDepth(DEPTH.landing);
  scene.tweens.add({
    targets: circle,
    scale: 1.9,
    alpha: { value: 0, ease: 'Linear' },
    duration: 320,
    ease: 'Quad.easeOut',
    onComplete: () => circle.destroy(),
  });
}

/**
 * Линия удара: от фигуры, которая срубила коня, к его клетке. Остаётся до перезапуска,
 * чтобы на экране проигрыша было видно, откуда пришёл удар.
 */
export function attackLine(
  scene: Phaser.Scene,
  from: Point,
  to: Point,
  color: number,
  depth: number,
): Phaser.GameObjects.Graphics {
  const line = scene.add.graphics().setDepth(depth).setAlpha(0);
  line.lineStyle(10, color, 0.9).lineBetween(from.x, from.y, to.x, to.y);
  line.fillStyle(color, 0.9).fillCircle(from.x, from.y, 14);
  line.lineStyle(6, color, 0.9).strokeCircle(to.x, to.y, 46);
  scene.tweens.add({ targets: line, alpha: 1, duration: 150 });
  return line;
}

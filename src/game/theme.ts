/**
 * Единый стиль игры: палитра, шрифт, слои отрисовки и картинки фигур — в одном месте.
 * Чтобы перекрасить игру, меняют этот файл, а не код сцены.
 */
import type { EnemyType } from './chess';
import type { Phase } from './constants';

/** Один шрифт на всю игру — системный: на телефоне выглядит родным и не грузится из сети. */
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Цвета интерфейса: тёмные панели, светлый текст, один акцент и один цвет опасности. */
export const COLOR = {
  panel: 0x0b1220, // плашка, панели, экран паузы
  panelEdge: 0x2a3a5c, // тонкая рамка панелей
  chip: 0x1e293b, // плашка «ФАЗА 1», вторичные кнопки
  text: '#f8fafc',
  textMuted: '#94a3b8',
  accent: 0xffb020, // главная кнопка, фаза 2, новый рекорд
  accentCss: '#ffb020',
  onAccent: '#1a1206', // текст на акцентном фоне
  danger: 0xef4444, // линия удара, полоса внизу, вспышка гибели
  mark: 0x000000, // точки ходов — как на lichess
  pieceBits: 0x2b2f36, // осколки съеденной фигуры
  knightBits: 0xfbf8f1, // осколки коня
};

/** Доска по фазам. В фазе 2 доска краснеет целиком — сразу видно, что правила стали жёстче. */
export const BOARD: Record<Phase, { light: number; dark: number; knightSquare: number }> = {
  1: { light: 0xf0d9b5, dark: 0xb58863, knightSquare: 0xcdd26a },
  2: { light: 0xf3cfc6, dark: 0xb8574d, knightSquare: 0xf6c344 },
};

/** Слои отрисовки: что поверх чего. */
export const DEPTH = {
  board: 0,
  knightSquare: 1,
  landing: 1.5, // кольцо приземления — под фигурами, чтобы не закрывать коня
  pieces: 2,
  marks: 3,
  knight: 4,
  effects: 5, // осколки, «+1», подсказка первого хода
  band: 8,
  hud: 9,
  banner: 9.5, // «ФАЗА 2»
  dim: 9.6, // затемнение доски на экране проигрыша
  culprit: 9.7, // виновник гибели (линия удара и фигура или полоса) — поверх затемнения
  ui: 10, // панели паузы и проигрыша
};

/** Картинки фигур: SVG из public/pieces. player — белый конь игрока. */
export type PieceArt = EnemyType | 'player';
export const PIECE_ART: PieceArt[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'player'];
export const pieceTexture = (art: PieceArt) => `piece-${art}`;
/** Текстура фигуры в 2 раза больше клетки — чётко и на экранах с высокой плотностью. */
export const PIECE_TEXTURE_SIZE = 256;

/** Смешать два цвета: t = 0 — первый, t = 1 — второй. Нужно для плавной перекраски доски. */
export function mixColor(from: number, to: number, t: number): number {
  const channel = (shift: number) =>
    Math.round(((from >> shift) & 255) * (1 - t) + ((to >> shift) & 255) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

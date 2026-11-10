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
  danger: 0xef4444, // полоса внизу
  mark: 0x000000, // точки ходов — как на lichess
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
  pieces: 2,
  marks: 3,
  knight: 4,
  effects: 5, // подсказка первого хода
  band: 8,
  hud: 9,
  banner: 9.5, // «ФАЗА 2»
  ui: 10, // панели паузы и проигрыша
};

/** Картинки фигур: SVG из public/pieces. player — белый конь игрока. */
export type PieceArt = EnemyType | 'player';
export const PIECE_ART: PieceArt[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'player'];
export const pieceTexture = (art: PieceArt) => `piece-${art}`;
/** Текстура фигуры в 2 раза больше клетки — чётко и на экранах с высокой плотностью. */
export const PIECE_TEXTURE_SIZE = 256;

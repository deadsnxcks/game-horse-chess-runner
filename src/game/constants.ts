/**
 * Все настраиваемые параметры игры — в одном месте.
 * Если на проверке просят «поменять правило», почти всегда это одно число здесь.
 */
import type { EnemyType } from './chess';

// ── Холст: вертикальный 9:16 под телефон ──
export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

// ── Доска ──
export const COLS = 6; // ширина доски в клетках
export const CELL = GAME_WIDTH / COLS; // размер клетки в пикселях (120)
export const LIGHT = 0xf0d9b5; // светлая клетка
export const DARK = 0xb58863; // тёмная клетка
export const PIECE_SIZE = 0.85; // размер фигуры относительно клетки

// ── Старт ──
export const START_COL = 2;
export const START_ROW = 1;
export const SAFE_ROWS = 5; // столько нижних рядов без врагов, чтобы старт не был смертью

// ── Враги ──
export const ENEMY_CHANCE_START = 0.12; // шанс, что в клетке стоит фигура, в начале
export const ENEMY_CHANCE_GROWTH = 0.0025; // прибавка к шансу за каждый ряд вверх
export const ENEMY_CHANCE_MAX = 0.3; // потолок плотности фигур
/** Как часто встречается каждая фигура (относительные веса). */
export const ENEMY_WEIGHTS: Record<EnemyType, number> = {
  pawn: 50,
  knight: 14,
  bishop: 14,
  rook: 12,
  queen: 6,
};

// ── Очки ──
export const POINTS_PER_ROW = 1; // за каждый новый ряд, на который поднялся конь
/** Очки за взятие — шахматная ценность фигур. */
export const PIECE_VALUE: Record<EnemyType, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
};

// ── Экран, который подгоняет снизу ──
export const SCROLL_SPEED_START = 25; // пикселей в секунду в начале забега
export const SCROLL_ACCEL = 1; // прибавка к скорости за каждую секунду забега
export const SCROLL_SPEED_MAX = 140; // потолок скорости
export const FOLLOW_LINE = GAME_HEIGHT * 0.45; // конь выше этой линии экрана → экран подтягивается за ним
export const FOLLOW_SMOOTHING = 6; // насколько резво экран подтягивается
export const DEATH_BAND = CELL * 0.3; // красная полоса внизу: центр коня в ней — проигрыш
export const HUD_HEIGHT = 72; // плашка со счётом сверху; фигуры под ней не бьют
/**
 * Верхний видимый ряд — «предпросмотр»: фигуры в нём уже видно, но они ещё не бьют.
 * Иначе фигура, которая только что выехала из-под плашки, может срубить коня раньше,
 * чем игрок успел её разглядеть.
 */
export const PREVIEW_ROWS = 1;

// ── Анимации ──
export const MOVE_MS = 120; // прыжок коня
export const CAPTURE_DELAY_MS = 250; // пауза перед ответом противника — успеть увидеть, куда прыгнул
export const CAPTURE_MS_PER_CELL = 80; // скорость, с которой фигура едет рубить
export const RESTART_DELAY_MS = 500; // защита от случайного рестарта быстрым тапом

export const BEST_SCORE_KEY = 'knight-best-score';

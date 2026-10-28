/**
 * Все настраиваемые параметры игры — в одном месте.
 * Если на проверке просят «поменять правило», почти всегда это одно число здесь.
 */
import type { EnemyType } from './chess';

// ═════════════ РУЧКИ БАЛАНСА: сложность меняется здесь, а не по коду ═════════════

// ── Экран, который подгоняет снизу ──
export const SCROLL_SPEED_START = 20; // пикселей в секунду в начале забега (клетка — 120 px)
export const SCROLL_ACCEL = 0.4; // прибавка к скорости за каждую секунду игрового времени
export const SCROLL_SPEED_MAX = 60; // потолок скорости в фазе 1 (в фазе 2 умножается на scrollMultiplier)

// ── Фазы: всё, чем одна фаза игры отличается от другой ──
export type Phase = 1 | 2;

export interface PhaseSettings {
  enemyChance: number; // шанс, что в клетке нового ряда стоит фигура
  /** Как часто встречается каждая фигура (относительные веса). */
  enemyWeights: Record<EnemyType, number>;
  scrollMultiplier: number; // во сколько раз быстрее едет экран
}

/** Настройки каждой фазы. Фаза 2 — та же игра, но давление выше: экран быстрее, фигур больше. */
export const PHASES: Record<Phase, PhaseSettings> = {
  1: {
    enemyChance: 0.16,
    enemyWeights: { pawn: 45, knight: 16, bishop: 20, rook: 12, queen: 7 },
    scrollMultiplier: 1,
  },
  2: {
    enemyChance: 0.5,
    enemyWeights: { pawn: 35, knight: 16, bishop: 24, rook: 15, queen: 10 },
    scrollMultiplier: 10,
  },
};

/** Фаза 2 начинается, когда счёт достигает этого порога (по прогрессу игрока, а не по времени). */
export const PHASE2_SCORE = 10;

// ═════════════ Остальное ═════════════

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

// ── Безопасная дорожка (см. SafePath в chess.ts) ──
// Клетку дорожки не бьёт ни одна фигура, которая может оказаться на экране вместе с ней.
// На экране ~10 рядов: сразу после быстрых прыжков вверх (камера ещё не догнала) под конём
// видно до 9 рядов, а если конь отстал к нижнему краю — над ним до 8.
export const PATH_GUARD_BELOW = 9; // столько рядов ниже клетки дорожки проверяем
export const PATH_GUARD_ABOVE = 8; // столько рядов выше

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

// ── Камера и экран ──
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

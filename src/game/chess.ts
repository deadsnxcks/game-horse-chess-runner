/**
 * Шахматная логика без Phaser: доска, ходы коня, проверка «бьют ли клетку».
 * Здесь только клетки (колонка, ряд), никаких пикселей.
 * Ряд 0 — нижний, ряды растут вверх. Колонки — слева направо от 0 до COLS − 1.
 */
import {
  COLS,
  ENEMY_CHANCE_GROWTH,
  ENEMY_CHANCE_MAX,
  ENEMY_CHANCE_START,
  ENEMY_WEIGHTS,
  SAFE_ROWS,
} from './constants';

/** Вражеские фигуры. Конь игрока на доске не лежит — его клетку хранит сцена. */
export type EnemyType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen';

export interface Cell {
  col: number;
  row: number;
}

export interface Attacker extends Cell {
  type: EnemyType;
}

/** Смещение в клетках: [по колонкам, по рядам]. */
type Offset = readonly [number, number];

/**
 * Фигура = набор смещений. Ход коня — «буква Г»,
 * и удар вражеского коня — тот же самый список.
 */
const KNIGHT_JUMPS: readonly Offset[] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

/** Вражеские (чёрные) пешки бьют по диагонали вниз — навстречу коню. */
const PAWN_ATTACKS: readonly Offset[] = [
  [-1, -1],
  [1, -1],
];

/** Лучи дальнобойных фигур: ладья бьёт по прямым, слон по диагоналям, ферзь и так и так. */
const STRAIGHT: readonly Offset[] = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];
const DIAGONAL: readonly Offset[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Бесконечная вверх доска: ряды добавляются по мере подъёма. */
export class Board {
  /** rows[ряд][колонка] — вражеская фигура или null. */
  private rows: (EnemyType | null)[][] = [];

  get rowCount(): number {
    return this.rows.length;
  }

  addRow(cells: (EnemyType | null)[]): void {
    this.rows.push(cells);
  }

  get(col: number, row: number): EnemyType | null {
    if (col < 0 || col >= COLS) return null;
    return this.rows[row]?.[col] ?? null;
  }

  remove(col: number, row: number): void {
    const line = this.rows[row];
    if (line) line[col] = null;
  }
}

/** Содержимое нового ряда: чем выше ряд, тем гуще фигуры. */
export function generateRow(row: number, random: () => number = Math.random): (EnemyType | null)[] {
  const cells = new Array<EnemyType | null>(COLS).fill(null);
  if (row < SAFE_ROWS) return cells;

  const chance = Math.min(
    ENEMY_CHANCE_MAX,
    ENEMY_CHANCE_START + (row - SAFE_ROWS) * ENEMY_CHANCE_GROWTH,
  );
  for (let col = 0; col < COLS; col++) {
    if (random() < chance) cells[col] = pickEnemy(random);
  }
  return cells;
}

/** Случайная фигура с учётом весов ENEMY_WEIGHTS. */
function pickEnemy(random: () => number): EnemyType {
  const types = Object.keys(ENEMY_WEIGHTS) as EnemyType[];
  const total = types.reduce((sum, type) => sum + ENEMY_WEIGHTS[type], 0);
  let roll = random() * total;
  for (const type of types) {
    roll -= ENEMY_WEIGHTS[type];
    if (roll < 0) return type;
  }
  return 'pawn';
}

/** Куда может прыгнуть конь: «буквой Г», не выходя за края доски и за уже созданные ряды. */
export function knightMoves(from: Cell, rowCount: number): Cell[] {
  return KNIGHT_JUMPS.map(([dc, dr]) => ({ col: from.col + dc, row: from.row + dr })).filter(
    (cell) => cell.col >= 0 && cell.col < COLS && cell.row >= 0 && cell.row < rowCount,
  );
}

/**
 * Какая вражеская фигура бьёт клетку target?
 * Смотрим ОТ клетки наружу — так шахматные движки проверяют шах.
 * Честное правило: бьют только фигуры в рядах minRow..maxRow, то есть видимые на экране.
 * Возвращает первую найденную атакующую фигуру или null, если клетка безопасна.
 */
export function findAttacker(
  board: Board,
  target: Cell,
  minRow: number,
  maxRow: number,
): Attacker | null {
  const isVisible = (row: number) => row >= minRow && row <= maxRow;

  // 1. Прыгуны: пешки и кони. Фигура со смещением удара (dc, dr) бьёт target,
  //    если стоит в клетке target − (dc, dr). Поэтому от цели смотрим «в обратную сторону».
  const leapers: [readonly Offset[], EnemyType][] = [
    [PAWN_ATTACKS, 'pawn'],
    [KNIGHT_JUMPS, 'knight'],
  ];
  for (const [offsets, type] of leapers) {
    for (const [dc, dr] of offsets) {
      const col = target.col - dc;
      const row = target.row - dr;
      if (isVisible(row) && board.get(col, row) === type) return { col, row, type };
    }
  }

  // 2. Дальнобойные: из цели идём лучом в каждом направлении до первой фигуры.
  //    Если это нужная фигура (или ферзь) — клетку бьют. Любая другая фигура луч закрывает.
  const rays: [readonly Offset[], EnemyType][] = [
    [STRAIGHT, 'rook'],
    [DIAGONAL, 'bishop'],
  ];
  for (const [directions, slider] of rays) {
    for (const [dc, dr] of directions) {
      let col = target.col + dc;
      let row = target.row + dr;
      while (col >= 0 && col < COLS && isVisible(row)) {
        const piece = board.get(col, row);
        if (piece) {
          if (piece === slider || piece === 'queen') return { col, row, type: piece };
          break;
        }
        col += dc;
        row += dr;
      }
    }
  }

  return null;
}

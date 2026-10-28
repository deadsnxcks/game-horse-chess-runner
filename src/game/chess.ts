/**
 * Шахматная логика без Phaser: доска, ходы коня, проверка «бьют ли клетку».
 * Здесь только клетки (колонка, ряд), никаких пикселей.
 * Ряд 0 — нижний, ряды растут вверх. Колонки — слева направо от 0 до COLS − 1.
 */
import {
  COLS,
  PATH_GUARD_ABOVE,
  PATH_GUARD_BELOW,
  SAFE_ROWS,
  type PhaseSettings,
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

/** Ходы коня вверх — из них складывается безопасная дорожка. */
const PATH_STEPS: readonly Offset[] = [
  [1, 2],
  [-1, 2],
  [2, 1],
  [-2, 1],
];

/**
 * Невидимая безопасная дорожка: цепочка ходов коня от старта вверх.
 * Генератор не ставит фигуры на её клетки и не ставит фигуры, которые их бьют, —
 * поэтому через любую «стену» из ладей и ферзей всегда есть проход. Найти его — головоломка.
 */
export class SafePath {
  /** Дорожка поднимается на 1–2 ряда за шаг, поэтому в ряду не больше одной её клетки: ряд → колонка. */
  private cols = new Map<number, number>();
  private tip: Cell;

  constructor(start: Cell) {
    this.tip = start;
    this.cols.set(start.row, start.col);
  }

  has(col: number, row: number): boolean {
    return this.cols.get(row) === col;
  }

  /** Продлеваем дорожку случайными ходами коня вверх, пока она не дойдёт до ряда row. */
  extendTo(row: number, random: () => number): void {
    while (this.tip.row < row) {
      const options = PATH_STEPS.map(([dc, dr]) => ({ col: this.tip.col + dc, row: this.tip.row + dr }))
        .filter((cell) => cell.col >= 0 && cell.col < COLS);
      this.tip = options[Math.floor(random() * options.length)];
      this.cols.set(this.tip.row, this.tip.col);
    }
  }

  /** Клетки дорожки в рядах from..to. */
  cellsInRows(from: number, to: number): Cell[] {
    const cells: Cell[] = [];
    for (let row = from; row <= to; row++) {
      const col = this.cols.get(row);
      if (col !== undefined) cells.push({ col, row });
    }
    return cells;
  }
}

/**
 * Создаёт следующий ряд доски и возвращает его. Плотность и состав фигур задаёт фаза (settings):
 * генератор сам не знает, какая сейчас фаза, — ему передают её настройки.
 */
export function generateRow(
  board: Board,
  path: SafePath,
  settings: PhaseSettings,
  random: () => number = Math.random,
): (EnemyType | null)[] {
  const row = board.rowCount;
  // Дорожку прокладываем заранее — дальше, чем фигуры этого ряда могут до неё достать
  path.extendTo(row + PATH_GUARD_BELOW, random);
  const cells = new Array<EnemyType | null>(COLS).fill(null);
  board.addRow(cells); // ряд сразу на доске: фигуры одного ряда закрывают удары друг другу
  if (row < SAFE_ROWS) return cells;

  for (let col = 0; col < COLS; col++) {
    if (random() >= settings.enemyChance) continue;
    const type = pickEnemy(settings.enemyWeights, random);
    if (!threatensPath(board, path, type, { col, row })) cells[col] = type;
  }
  return cells;
}

/**
 * Встанет ли фигура на дорожку или будет бить её клетку, когда обе окажутся на экране.
 * Клетку дорожки на ряду p могут бить фигуры с рядов p − PATH_GUARD_BELOW … p + PATH_GUARD_ABOVE.
 */
function threatensPath(board: Board, path: SafePath, type: EnemyType, at: Cell): boolean {
  if (path.has(at.col, at.row)) return true;
  return path
    .cellsInRows(at.row - PATH_GUARD_ABOVE, at.row + PATH_GUARD_BELOW)
    .some((cell) => attacks(board, type, at, cell));
}

/**
 * Бьёт ли фигура type, стоящая на from, клетку to. Фигуры между ними закрывают удар.
 * Это взгляд «от фигуры»; findAttacker ниже смотрит наоборот — от клетки.
 */
export function attacks(board: Board, type: EnemyType, from: Cell, to: Cell): boolean {
  const dc = to.col - from.col;
  const dr = to.row - from.row;
  if (dc === 0 && dr === 0) return false;
  if (type === 'pawn') return PAWN_ATTACKS.some(([c, r]) => c === dc && r === dr);
  if (type === 'knight') return KNIGHT_JUMPS.some(([c, r]) => c === dc && r === dr);

  const straight = dc === 0 || dr === 0;
  const diagonal = Math.abs(dc) === Math.abs(dr);
  if (type === 'rook' && !straight) return false;
  if (type === 'bishop' && !diagonal) return false;
  if (type === 'queen' && !straight && !diagonal) return false;

  // Идём от фигуры к клетке: любая фигура по дороге закрывает удар
  const stepC = Math.sign(dc);
  const stepR = Math.sign(dr);
  for (let c = from.col + stepC, r = from.row + stepR; c !== to.col || r !== to.row; c += stepC, r += stepR) {
    if (board.get(c, r)) return false;
  }
  return true;
}

/** Случайная фигура с учётом весов. */
function pickEnemy(weights: Record<EnemyType, number>, random: () => number): EnemyType {
  const types = Object.keys(weights) as EnemyType[];
  const total = types.reduce((sum, type) => sum + weights[type], 0);
  let roll = random() * total;
  for (const type of types) {
    roll -= weights[type];
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

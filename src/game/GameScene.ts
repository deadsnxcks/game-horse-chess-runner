import Phaser from 'phaser';
import {
  BEST_SCORE_KEY,
  CAPTURE_DELAY_MS,
  CAPTURE_MS_PER_CELL,
  CELL,
  COLS,
  DARK,
  DEATH_BAND,
  FOLLOW_LINE,
  FOLLOW_SMOOTHING,
  GAME_HEIGHT,
  GAME_WIDTH,
  HUD_HEIGHT,
  LIGHT,
  MOVE_MS,
  PIECE_SIZE,
  PIECE_VALUE,
  POINTS_PER_ROW,
  PREVIEW_ROWS,
  RESTART_DELAY_MS,
  SCROLL_ACCEL,
  SCROLL_SPEED_MAX,
  SCROLL_SPEED_START,
  START_COL,
  START_ROW,
} from './constants';
import {
  Board,
  findAttacker,
  generateRow,
  knightMoves,
  type Attacker,
  type Cell,
  type EnemyType,
} from './chess';

/** Сколько рядов держим созданными выше верхнего края экрана. */
const ROWS_AHEAD = 3;
/** Сколько рядов под экраном ещё не удаляем. */
const ROWS_BEHIND = 2;

/** Слои отрисовки: что поверх чего. */
const DEPTH = { board: 0, knightSquare: 1, pieces: 2, marks: 3, knight: 4, band: 8, hud: 9, ui: 10 };

const GLYPH: Record<EnemyType, string> = {
  pawn: '♟',
  knight: '♞',
  bishop: '♝',
  rook: '♜',
  queen: '♛',
};

/** Подпись на экране проигрыша — кто срубил коня. */
const KILLED_BY: Record<EnemyType, string> = {
  pawn: 'Коня срубила пешка',
  knight: 'Коня срубил конь',
  bishop: 'Коня срубил слон',
  rook: 'Коня срубила ладья',
  queen: 'Коня срубил ферзь',
};

/** Шрифты, в которых точно есть шахматные символы: Windows, Mac/iPhone, Android, Linux. */
const PIECE_FONT = '"Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols 2", "DejaVu Sans", serif';
/** Просит рисовать символ как текст: иначе ♟ на телефоне может стать цветным эмодзи. */
const AS_TEXT = '︎';
const UI_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

const MARK_COLOR = 0x000000;
const MARK_ALPHA = 0.25;
const KNIGHT_SQUARE_COLOR = 0xcdd26a;
const BAND_COLOR = 0xd63b3b;

/**
 * ready   — ждём первый ход, экран стоит;
 * playing — экран едет, можно ходить;
 * dying   — вражеская фигура едет рубить коня;
 * over    — экран проигрыша, тап = заново.
 */
type State = 'ready' | 'playing' | 'dying' | 'over';

const cellKey = (col: number, row: number) => `${col},${row}`;

export class GameScene extends Phaser.Scene {
  // Логика (в клетках)
  private board!: Board;
  private state: State = 'ready';
  private knightCol = START_COL;
  private knightRow = START_ROW;
  private maxRow = START_ROW;
  private score = 0;
  private elapsed = 0;
  private restartAllowedAt = 0;

  // Картинка (в пикселях)
  private knight!: Phaser.GameObjects.Text;
  private knightSquare!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private moveMarks: Phaser.GameObjects.Arc[] = [];
  /** Картинки фигур по клетке — чтобы убрать съеденную или повести атакующую. */
  private pieceViews = new Map<string, Phaser.GameObjects.Text>();
  /** Все объекты каждого ряда — чтобы удалять ряды, уехавшие под экран. */
  private rowViews = new Map<number, Phaser.GameObjects.GameObject[]>();

  constructor() {
    super('GameScene');
  }

  create(): void {
    // При рестарте Phaser переиспользует этот же объект сцены,
    // поэтому всё состояние сбрасываем здесь, а не только в объявлении полей.
    this.board = new Board();
    this.state = 'ready';
    this.knightCol = START_COL;
    this.knightRow = START_ROW;
    this.maxRow = START_ROW;
    this.score = 0;
    this.elapsed = 0;
    this.moveMarks = [];
    this.pieceViews = new Map();
    this.rowViews = new Map();

    this.cameras.main.setBackgroundColor(LIGHT).setScroll(0, 0);

    this.createRowsAhead();
    this.createKnight();
    this.createHud();
    this.showMoves();

    this.input.on('pointerdown', this.handleTap, this);
  }

  update(_time: number, delta: number): void {
    if (this.state !== 'playing') return;

    const seconds = delta / 1000;
    this.elapsed += seconds;

    this.scrollCamera(seconds);
    this.createRowsAhead();
    this.removeRowsBelow();

    if (this.knightScreenY() > GAME_HEIGHT - DEATH_BAND) {
      this.gameOver('Экран догнал коня');
    }
  }

  // ───────────── Клетки ↔ пиксели ─────────────

  /** Центр клетки по X. Колонки растут вправо. */
  private cellX(col: number): number {
    return col * CELL + CELL / 2;
  }

  /** Центр клетки по Y. Ряды растут вверх, а y в Phaser — вниз, отсюда минус. */
  private cellY(row: number): number {
    return GAME_HEIGHT - row * CELL - CELL / 2;
  }

  /** Где конь на экране (а не в мире): учитываем сдвиг камеры. */
  private knightScreenY(): number {
    return this.cellY(this.knightRow) - this.cameras.main.scrollY;
  }

  // Активные ряды — где фигуры бьют. Это ряды, целиком видные на экране,
  // кроме верхнего ряда-предпросмотра (см. PREVIEW_ROWS).

  /** Нижний активный ряд: самый нижний, который целиком на экране. */
  private bottomActiveRow(): number {
    return Math.max(0, Math.ceil(-this.cameras.main.scrollY / CELL));
  }

  /** Верхний активный ряд: целиком на экране, не под плашкой счёта и не ряд-предпросмотр. */
  private topActiveRow(): number {
    const topFullyVisible =
      Math.floor((GAME_HEIGHT - HUD_HEIGHT - this.cameras.main.scrollY) / CELL) - 1;
    return topFullyVisible - PREVIEW_ROWS;
  }

  // ───────────── Доска ─────────────

  /** Создаём ряды, пока выше экрана (и выше коня) не будет запаса. */
  private createRowsAhead(): void {
    const topRowOnScreen = Math.floor((GAME_HEIGHT - this.cameras.main.scrollY) / CELL);
    const needed = Math.max(topRowOnScreen, this.knightRow) + ROWS_AHEAD;
    while (this.board.rowCount <= needed) {
      this.createRow(this.board.rowCount);
    }
  }

  /** Новый ряд: генерируем фигуры в логике и рисуем тёмные клетки и фигуры. */
  private createRow(row: number): void {
    const cells = generateRow(row);
    this.board.addRow(cells);

    const views: Phaser.GameObjects.GameObject[] = [];
    for (let col = 0; col < COLS; col++) {
      // Фон камеры — светлая клетка, поэтому рисуем только тёмные: объектов вдвое меньше
      if ((col + row) % 2 === 1) {
        views.push(
          this.add
            .rectangle(this.cellX(col), this.cellY(row), CELL, CELL, DARK)
            .setDepth(DEPTH.board),
        );
      }

      const type = cells[col];
      if (type) {
        const piece = this.createPieceText(GLYPH[type], col, row, false);
        this.pieceViews.set(cellKey(col, row), piece);
        views.push(piece);
      }
    }
    this.rowViews.set(row, views);
  }

  /** Удаляем картинки рядов, уехавших под экран. Логика доски при этом остаётся. */
  private removeRowsBelow(): void {
    const limit = this.bottomActiveRow() - ROWS_BEHIND;
    for (const [row, views] of this.rowViews) {
      if (row >= limit) continue;
      for (const view of views) view.destroy();
      for (let col = 0; col < COLS; col++) this.pieceViews.delete(cellKey(col, row));
      this.rowViews.delete(row);
    }
  }

  private createPieceText(
    glyph: string,
    col: number,
    row: number,
    isPlayer: boolean,
  ): Phaser.GameObjects.Text {
    return this.add
      .text(this.cellX(col), this.cellY(row), glyph + AS_TEXT, {
        fontFamily: PIECE_FONT,
        fontSize: `${Math.round(CELL * PIECE_SIZE)}px`,
        color: isPlayer ? '#ffffff' : '#1c1c1c',
        stroke: isPlayer ? '#1c1c1c' : '#ffffff',
        strokeThickness: isPlayer ? 7 : 3,
      })
      .setOrigin(0.5)
      .setDepth(isPlayer ? DEPTH.knight : DEPTH.pieces);
  }

  // ───────────── Конь и ходы ─────────────

  private createKnight(): void {
    const x = this.cellX(this.knightCol);
    const y = this.cellY(this.knightRow);
    // Подсветка клетки коня — как подсветка хода на lichess: «вот ты»
    this.knightSquare = this.add
      .rectangle(x, y, CELL, CELL, KNIGHT_SQUARE_COLOR, 0.75)
      .setDepth(DEPTH.knightSquare);
    this.knight = this.createPieceText('♞', this.knightCol, this.knightRow, true);
  }

  private legalMoves(): Cell[] {
    return knightMoves({ col: this.knightCol, row: this.knightRow }, this.board.rowCount);
  }

  /** Точки на пустых клетках и кольца вокруг фигур, которые можно взять. Опасность не показываем. */
  private showMoves(): void {
    this.clearMoves();
    for (const move of this.legalMoves()) {
      const x = this.cellX(move.col);
      const y = this.cellY(move.row);
      const mark =
        this.board.get(move.col, move.row) !== null
          ? this.add.circle(x, y, CELL * 0.44).setStrokeStyle(8, MARK_COLOR, MARK_ALPHA)
          : this.add.circle(x, y, CELL * 0.14, MARK_COLOR, MARK_ALPHA);
      this.moveMarks.push(mark.setDepth(DEPTH.marks));
    }
  }

  private clearMoves(): void {
    for (const mark of this.moveMarks) mark.destroy();
    this.moveMarks = [];
  }

  private handleTap(pointer: Phaser.Input.Pointer): void {
    if (this.state === 'over') {
      if (this.time.now >= this.restartAllowedAt) this.scene.restart();
      return;
    }
    if (this.state === 'dying') return;

    // worldX/worldY — координаты в мире с учётом сдвига камеры (x/y — просто точка на экране)
    const col = Math.floor(pointer.worldX / CELL);
    const row = Math.floor((GAME_HEIGHT - pointer.worldY) / CELL);
    const move = this.legalMoves().find((m) => m.col === col && m.row === row);
    if (move) this.moveKnight(move);
  }

  private moveKnight(to: Cell): void {
    if (this.state === 'ready') this.state = 'playing'; // экран поедет после первого хода

    // 1. Взятие: прыгнул на фигуру — съел её
    const eaten = this.board.get(to.col, to.row);
    if (eaten) {
      this.board.remove(to.col, to.row);
      this.pieceViews.get(cellKey(to.col, to.row))?.destroy();
      this.pieceViews.delete(cellKey(to.col, to.row));
      this.score += PIECE_VALUE[eaten];
    }

    // 2. Логику меняем сразу, картинку — короткой анимацией
    this.knightCol = to.col;
    this.knightRow = to.row;
    this.tweens.killTweensOf([this.knight, this.knightSquare]);
    this.tweens.add({
      targets: [this.knight, this.knightSquare],
      x: this.cellX(to.col),
      y: this.cellY(to.row),
      duration: MOVE_MS,
      ease: 'Quad.easeOut',
    });

    // 3. Очки за высоту — только за ряды, где конь ещё не был
    if (to.row > this.maxRow) {
      this.score += (to.row - this.maxRow) * POINTS_PER_ROW;
      this.maxRow = to.row;
    }
    this.scoreText.setText(`Счёт: ${this.score}`);

    // 4. Ответ противника: если клетку коня бьёт видимая фигура — она рубит
    const attacker = findAttacker(this.board, to, this.bottomActiveRow(), this.topActiveRow());
    if (attacker) {
      this.knightCaptured(attacker);
    } else {
      this.showMoves();
    }
  }

  /** Фигура едет через доску и рубит коня — игрок видит, кого прозевал. */
  private knightCaptured(attacker: Attacker): void {
    this.state = 'dying';
    this.clearMoves();

    const view = this.pieceViews.get(cellKey(attacker.col, attacker.row));
    if (!view) {
      this.gameOver(KILLED_BY[attacker.type]);
      return;
    }

    const distance = Math.max(
      Math.abs(attacker.col - this.knightCol),
      Math.abs(attacker.row - this.knightRow),
    );
    view.setDepth(DEPTH.knight + 1);
    this.tweens.add({
      targets: view,
      x: this.cellX(this.knightCol),
      y: this.cellY(this.knightRow),
      delay: MOVE_MS + CAPTURE_DELAY_MS,
      duration: distance * CAPTURE_MS_PER_CELL + 120,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.knight.setVisible(false);
        this.cameras.main.shake(150, 0.01);
        this.gameOver(KILLED_BY[attacker.type]);
      },
    });
  }

  // ───────────── Экран ─────────────

  private scrollCamera(seconds: number): void {
    const camera = this.cameras.main;
    const speed = Math.min(SCROLL_SPEED_MAX, SCROLL_SPEED_START + SCROLL_ACCEL * this.elapsed);
    camera.scrollY -= speed * seconds; // мир растёт вверх → камера едет в минус

    // Конь ушёл высоко — подтягиваем экран, чтобы было видно, что впереди
    if (this.knightScreenY() < FOLLOW_LINE) {
      const target = this.cellY(this.knightRow) - FOLLOW_LINE;
      camera.scrollY += (target - camera.scrollY) * Math.min(1, seconds * FOLLOW_SMOOTHING);
    }
  }

  // ───────────── Интерфейс ─────────────

  private createHud(): void {
    this.add
      .rectangle(GAME_WIDTH / 2, HUD_HEIGHT / 2, GAME_WIDTH, HUD_HEIGHT, 0x000000, 0.45)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);

    // До первого хода вместо счёта — подсказка
    this.scoreText = this.add
      .text(24, HUD_HEIGHT / 2, 'Ходи конём вверх. Не подставляйся!', {
        fontFamily: UI_FONT,
        fontSize: '32px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);

    // Красная полоса внизу — край, который подгоняет коня
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT - DEATH_BAND / 2, GAME_WIDTH, DEATH_BAND, BAND_COLOR, 0.55)
      .setScrollFactor(0)
      .setDepth(DEPTH.band);
  }

  private gameOver(reason: string): void {
    this.state = 'over';
    this.clearMoves();
    this.restartAllowedAt = this.time.now + RESTART_DELAY_MS;
    const best = this.saveBestScore();

    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);
    this.addCenteredText(GAME_HEIGHT * 0.36, reason, 52);
    this.addCenteredText(GAME_HEIGHT * 0.46, `Счёт: ${this.score}`, 46);
    this.addCenteredText(GAME_HEIGHT * 0.52, `Рекорд: ${best}`, 34);
    this.addCenteredText(GAME_HEIGHT * 0.64, 'Тапни, чтобы начать заново', 34);
  }

  private addCenteredText(y: number, text: string, size: number): void {
    this.add
      .text(GAME_WIDTH / 2, y, text, {
        fontFamily: UI_FONT,
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);
  }

  /** Рекорд хранится в браузере игрока. localStorage бывает недоступен — тогда просто без рекорда. */
  private saveBestScore(): number {
    try {
      const best = Math.max(this.score, Number(localStorage.getItem(BEST_SCORE_KEY)) || 0);
      localStorage.setItem(BEST_SCORE_KEY, String(best));
      return best;
    } catch {
      return this.score;
    }
  }
}

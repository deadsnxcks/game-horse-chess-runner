import Phaser from 'phaser';
import {
  BEST_SCORE_KEY,
  CAPTURE_DELAY_MS,
  CAPTURE_MS_PER_CELL,
  CELL,
  COLS,
  DEATH_BAND,
  FOLLOW_LINE,
  FOLLOW_SMOOTHING,
  GAME_HEIGHT,
  GAME_WIDTH,
  HUD_HEIGHT,
  MOVE_MS,
  PHASE2_SCORE,
  PHASES,
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
  type Phase,
  type PhaseSettings,
} from './constants';
import {
  Board,
  SafePath,
  findAttacker,
  generateRow,
  knightMoves,
  type Attacker,
  type Cell,
  type EnemyType,
} from './chess';
import {
  BOARD,
  COLOR,
  DEPTH,
  FONT,
  PIECE_ART,
  PIECE_TEXTURE_SIZE,
  mixColor,
  pieceTexture,
  type PieceArt,
} from './theme';
import { attackLine, burst, floatText, ring } from './effects';
import { createButton, createPanel, type Button } from './ui';
import { sfx } from './sound';

/** Сколько рядов держим созданными выше верхнего края экрана. */
const ROWS_AHEAD = 3;
/** Сколько рядов под экраном ещё не удаляем. */
const ROWS_BEHIND = 2;

/** Заголовок экрана проигрыша — кто срубил коня. */
const KILLED_BY: Record<EnemyType, string> = {
  pawn: 'Коня срубила пешка',
  knight: 'Коня срубил конь',
  bishop: 'Коня срубил слон',
  rook: 'Коня срубила ладья',
  queen: 'Коня срубил ферзь',
};

/** Правило фигуры — на экране проигрыша, чтобы было понятно, почему клетка была под ударом. */
const RULE: Record<EnemyType, string> = {
  pawn: 'Чёрная пешка бьёт по диагонали вниз',
  knight: 'Конь бьёт буквой «Г» — как и ты',
  bishop: 'Слон бьёт по диагоналям',
  rook: 'Ладья бьёт по прямым',
  queen: 'Ферзь бьёт по прямым и диагоналям',
};

const SCREEN_DEATH = { title: 'Экран догнал коня', rule: 'Экран едет вверх — не стой на месте' };

/** Сколько висит баннер «ФАЗА 2», прежде чем растаять. */
const PHASE_BANNER_MS = 1600;
/** Пауза между гибелью и экраном проигрыша — успеть увидеть, что случилось. */
const DEATH_PAUSE_MS = 600;
/** Ближе этого к красной полосе внизу полоса мигает — предупреждение. */
const DANGER_ZONE = CELL * 1.5;
/** Прозрачность красной полосы, пока конь далеко от неё. */
const BAND_ALPHA = 0.72;
/** Видимая высота панели проигрыша. */
const SHEET_HEIGHT = 560;

/** То, что срубило коня: линия удара и фигура — или красная полоса, если догнал экран. */
type Culprit = Phaser.GameObjects.Graphics | Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;

/**
 * ready   — ждём первый ход, экран стоит;
 * playing — экран едет, можно ходить;
 * paused  — пауза: всё заморожено, доску не видно, тап / P / Esc = продолжить;
 * dying   — коня рубят: анимация гибели;
 * over    — экран проигрыша, тап = заново.
 */
type State = 'ready' | 'playing' | 'paused' | 'dying' | 'over';
/** Из каких состояний можно встать на паузу — и в какое потом вернуться. */
type PausableState = 'ready' | 'playing';

interface Point {
  x: number;
  y: number;
}

const cellKey = (col: number, row: number) => `${col},${row}`;

export class GameScene extends Phaser.Scene {
  // Логика (в клетках)
  private board!: Board;
  private path!: SafePath;
  private state: State = 'ready';
  /** В какое состояние вернуться после паузы. */
  private stateBeforePause: PausableState = 'ready';
  private knightCol = START_COL;
  private knightRow = START_ROW;
  private maxRow = START_ROW;
  private score = 0;
  private phase: Phase = 1;
  /** Игровое время в секундах: растёт только в update() в состоянии 'playing', на паузе стоит. */
  private elapsed = 0;
  /** Время браузера (this.time.now), после которого тап на экране проигрыша перезапускает игру. */
  private restartAllowedAt = 0;

  // Картинка (в пикселях мира 720×1280)
  /** Во сколько раз холст больше мира: камера приближена на столько же (см. config.ts). */
  private renderScale = 1;
  /** Масштаб картинки фигуры, при котором она занимает PIECE_SIZE клетки. */
  private pieceScale = 1;
  private knight!: Phaser.GameObjects.Image;
  private knightSquare!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private phaseChip!: Phaser.GameObjects.Rectangle;
  private phaseText!: Phaser.GameObjects.Text;
  /** Красная полоса внизу — край, который подгоняет коня. */
  private band!: Phaser.GameObjects.Rectangle;
  /** Кнопка паузы: [0] — круг, который ловит нажатие, остальное — две палочки значка. */
  private pauseButton: Phaser.GameObjects.Shape[] = [];
  /** Объекты экрана паузы — удаляем, когда игра продолжается. */
  private pauseViews: Phaser.GameObjects.GameObject[] = [];
  private soundButton: Button | null = null;
  /** Подсказка первого хода — исчезает после первого хода. */
  private hintViews: Array<Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text> = [];
  private moveMarks: Phaser.GameObjects.Arc[] = [];
  /** Картинки фигур по клетке — чтобы убрать съеденную или повести атакующую. */
  private pieceViews = new Map<string, Phaser.GameObjects.Image>();
  /** Все объекты каждого ряда — чтобы удалять ряды, уехавшие под экран. */
  private rowViews = new Map<number, Phaser.GameObjects.GameObject[]>();
  /** Виновники гибели — на экране проигрыша их поднимаем над затемнением, чтобы было видно, что случилось. */
  private culprits: Culprit[] = [];

  constructor() {
    super('GameScene');
  }

  /** Картинки фигур — SVG из public/pieces. При перезапуске сцены второй раз не грузим. */
  preload(): void {
    for (const art of PIECE_ART) {
      const key = pieceTexture(art);
      if (this.textures.exists(key)) continue;
      this.load.svg(key, `pieces/${art}.svg`, {
        width: PIECE_TEXTURE_SIZE,
        height: PIECE_TEXTURE_SIZE,
      });
    }
  }

  create(): void {
    // При рестарте Phaser переиспользует этот же объект сцены,
    // поэтому всё состояние сбрасываем здесь, а не только в объявлении полей.
    this.board = new Board();
    this.path = new SafePath({ col: START_COL, row: START_ROW });
    this.state = 'ready';
    this.knightCol = START_COL;
    this.knightRow = START_ROW;
    this.maxRow = START_ROW;
    this.score = 0;
    this.phase = 1;
    this.elapsed = 0;
    this.moveMarks = [];
    this.pauseViews = [];
    this.soundButton = null;
    this.hintViews = [];
    this.pieceViews = new Map();
    this.rowViews = new Map();
    this.culprits = [];

    this.renderScale = this.scale.width / GAME_WIDTH;
    this.pieceScale = (CELL * PIECE_SIZE) / PIECE_TEXTURE_SIZE;
    // Камера приближена во столько же раз, во сколько холст больше мира:
    // все координаты игры остаются в мире 720×1280, а картинка — чёткой
    this.cameras.main
      .setOrigin(0, 0)
      .setZoom(this.renderScale)
      .setBackgroundColor(BOARD[1].light)
      .setScroll(0, 0);

    this.createRowsAhead();
    this.createKnight();
    this.createHud();
    this.showMoves();
    this.showFirstMoveHint();

    this.input.on('pointerdown', this.handleTap, this);
    // Пауза с клавиатуры на компьютере: P или Esc переключают игра ⇄ пауза
    this.input.keyboard?.on('keydown-P', this.togglePause, this);
    this.input.keyboard?.on('keydown-ESC', this.togglePause, this);

    // Свернул вкладку или переключился в другое приложение — ставим паузу.
    // game.events живёт дольше сцены, поэтому при рестарте снимаем подписку, иначе они накопятся.
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.pauseGame, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.pauseGame, this);
    });
  }

  update(_time: number, delta: number): void {
    if (this.state !== 'playing') return;

    const seconds = delta / 1000;
    this.elapsed += seconds;
    if (this.shouldEnterPhase2()) this.enterPhase2();

    this.scrollCamera(seconds);
    this.createRowsAhead();
    this.removeRowsBelow();
    this.updateDangerBand();

    if (this.knightScreenY() > GAME_HEIGHT - DEATH_BAND) this.screenCaughtKnight();
  }

  /** Настройки текущей фазы: плотность и состав фигур, скорость экрана. Все — в constants.ts. */
  private get settings(): PhaseSettings {
    return PHASES[this.phase];
  }

  // ───────────── Фазы ─────────────

  /** Условие перехода в фазу 2. Единственное место в коде, которое его знает. */
  private shouldEnterPhase2(): boolean {
    return this.phase === 1 && this.score >= PHASE2_SCORE;
  }

  /**
   * Вход в фазу 2. Новые скорость экрана и плотность фигур отдельно включать не нужно:
   * код читает их через this.settings, а он теперь возвращает PHASES[2].
   * Остальное — отклик, чтобы смену правил нельзя было не заметить:
   * доска краснеет, вспышка, баннер, плашка фазы и звук.
   */
  private enterPhase2(): void {
    this.phase = 2;
    this.recolorBoard(1, 2);
    this.phaseChip.setFillStyle(COLOR.accent);
    this.phaseText.setText('ФАЗА 2').setColor(COLOR.onAccent);
    this.tweens.add({
      targets: [this.phaseChip, this.phaseText],
      scale: 1.25,
      duration: 160,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    this.cameras.main.flash(300, 255, 176, 32);
    sfx.phase();
    this.showPhaseBanner();
  }

  /** Плавно перекрашиваем доску: светлые клетки — это фон камеры, тёмные — прямоугольники рядов. */
  private recolorBoard(from: Phase, to: Phase): void {
    const a = BOARD[from];
    const b = BOARD[to];
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 700,
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 1;
        this.cameras.main.setBackgroundColor(mixColor(a.light, b.light, t));
        const dark = mixColor(a.dark, b.dark, t);
        for (const square of this.darkSquares()) square.setFillStyle(dark);
        this.knightSquare.setFillStyle(mixColor(a.knightSquare, b.knightSquare, t), 0.75);
      },
    });
  }

  /**
   * Надпись прямо под плашкой — поверх ряда-предпросмотра, где фигуры ещё не бьют,
   * поэтому она не прячет опасность. Тает сама, на паузе замирает вместе с остальными анимациями.
   */
  private showPhaseBanner(): void {
    const y = HUD_HEIGHT + 66;
    const banner = [
      this.add
        .rectangle(GAME_WIDTH / 2, y, 620, 116, COLOR.panel, 0.92)
        .setRounded(28)
        .setStrokeStyle(4, COLOR.accent)
        .setScrollFactor(0),
      this.uiText(GAME_WIDTH / 2, y - 20, 'ФАЗА 2', 56, COLOR.accentCss),
      this.uiText(GAME_WIDTH / 2, y + 31, 'Экран быстрее, фигур больше', 26),
    ];
    for (const part of banner) part.setDepth(DEPTH.banner).setScale(0.6);
    this.tweens.add({ targets: banner, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: banner,
      alpha: 0,
      delay: PHASE_BANNER_MS,
      duration: 400,
      onComplete: () => {
        for (const part of banner) part.destroy();
      },
    });
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

  private cellCenter(cell: Cell): Point {
    return { x: this.cellX(cell.col), y: this.cellY(cell.row) };
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

  /** Новый ряд: генерируем фигуры в логике (ряд сразу ложится на доску) и рисуем тёмные клетки и фигуры. */
  private createRow(row: number): void {
    const cells = generateRow(this.board, this.path, this.settings);

    const views: Phaser.GameObjects.GameObject[] = [];
    for (let col = 0; col < COLS; col++) {
      // Фон камеры — светлая клетка, поэтому рисуем только тёмные: объектов вдвое меньше
      if ((col + row) % 2 === 1) {
        views.push(
          this.add
            .rectangle(this.cellX(col), this.cellY(row), CELL, CELL, BOARD[this.phase].dark)
            .setDepth(DEPTH.board)
            .setName('square'),
        );
      }

      const type = cells[col];
      if (type) {
        const piece = this.createPiece(type, col, row);
        this.pieceViews.set(cellKey(col, row), piece);
        views.push(piece);
      }
    }
    this.rowViews.set(row, views);
  }

  /** Тёмные клетки всех нарисованных рядов — их перекрашиваем при смене фазы. */
  private darkSquares(): Phaser.GameObjects.Rectangle[] {
    const squares: Phaser.GameObjects.Rectangle[] = [];
    for (const views of this.rowViews.values()) {
      for (const view of views) {
        if (view.name === 'square') squares.push(view as Phaser.GameObjects.Rectangle);
      }
    }
    return squares;
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

  /** Фигура — картинка из public/pieces, ужатая до PIECE_SIZE клетки. */
  private createPiece(art: PieceArt, col: number, row: number): Phaser.GameObjects.Image {
    return this.add
      .image(this.cellX(col), this.cellY(row), pieceTexture(art))
      .setScale(this.pieceScale)
      .setDepth(art === 'player' ? DEPTH.knight : DEPTH.pieces);
  }

  // ───────────── Конь и ходы ─────────────

  private createKnight(): void {
    // Подсветка клетки коня — как подсветка хода на lichess: «вот ты»
    this.knightSquare = this.add
      .rectangle(
        this.cellX(this.knightCol),
        this.cellY(this.knightRow),
        CELL,
        CELL,
        BOARD[1].knightSquare,
        0.75,
      )
      .setDepth(DEPTH.knightSquare);
    this.knight = this.createPiece('player', this.knightCol, this.knightRow);
  }

  private legalMoves(): Cell[] {
    return knightMoves({ col: this.knightCol, row: this.knightRow }, this.board.rowCount);
  }

  /**
   * Точки на пустых клетках и кольца вокруг фигур, которые можно взять. Опасность не показываем.
   * До первого хода точки пульсируют — так видно, куда нажимать.
   */
  private showMoves(): void {
    this.clearMoves();
    for (const move of this.legalMoves()) {
      const { x, y } = this.cellCenter(move);
      const mark =
        this.board.get(move.col, move.row) !== null
          ? this.add.circle(x, y, CELL * 0.44).setStrokeStyle(8, COLOR.mark, 0.25)
          : this.add.circle(x, y, CELL * 0.14, COLOR.mark, 0.25);
      this.moveMarks.push(mark.setDepth(DEPTH.marks));
    }
    if (this.state === 'ready') {
      this.tweens.add({
        targets: this.moveMarks,
        scale: 1.35,
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private clearMoves(): void {
    this.tweens.killTweensOf(this.moveMarks);
    for (const mark of this.moveMarks) mark.destroy();
    this.moveMarks = [];
  }

  /** Первые секунды: подсказка прямо над ходами коня (ряд 4 всегда пустой). */
  private showFirstMoveHint(): void {
    const y = this.cellY(START_ROW + 3);
    this.hintViews = [
      this.add.rectangle(GAME_WIDTH / 2, y, 620, 116, COLOR.panel, 0.88).setRounded(28),
      this.uiText(GAME_WIDTH / 2, y - 20, 'Тапни на точку — конь прыгнет', 32),
      this.uiText(GAME_WIDTH / 2, y + 26, 'Забирайся выше и не вставай под удар', 24, COLOR.textMuted),
    ];
    for (const view of this.hintViews) view.setScrollFactor(1).setDepth(DEPTH.effects);
  }

  private hideFirstMoveHint(): void {
    const views = this.hintViews;
    this.hintViews = [];
    this.tweens.add({
      targets: views,
      alpha: 0,
      duration: 250,
      onComplete: () => {
        for (const view of views) view.destroy();
      },
    });
  }

  /** over — список интерактивных объектов под пальцем: кнопка паузы или кнопка звука. */
  private handleTap(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    sfx.unlock(); // браузер разрешает звук только после касания
    if (this.state === 'over') {
      if (this.time.now >= this.restartAllowedAt) {
        sfx.click();
        this.scene.restart();
      }
      return;
    }
    if (this.state === 'dying') return;
    if (this.state === 'paused') {
      if (this.soundButton && over.includes(this.soundButton.bg)) {
        this.toggleSound();
        return;
      }
      sfx.click();
      this.resumeGame(); // на паузе любой другой тап — продолжить
      return;
    }
    if (over.includes(this.pauseButton[0])) {
      sfx.click();
      this.pauseGame(); // тап по кнопке паузы — не ход
      return;
    }

    // worldX/worldY — координаты в мире с учётом сдвига камеры (x/y — просто точка на экране)
    const col = Math.floor(pointer.worldX / CELL);
    const row = Math.floor((GAME_HEIGHT - pointer.worldY) / CELL);
    const move = this.legalMoves().find((m) => m.col === col && m.row === row);
    if (move) this.moveKnight(move);
  }

  private moveKnight(to: Cell): void {
    if (this.state === 'ready') {
      this.state = 'playing'; // экран поедет после первого хода
      this.hideFirstMoveHint();
    }
    const scoreBefore = this.score;

    // 1. Взятие: прыгнул на фигуру — съел её
    const eaten = this.board.get(to.col, to.row);
    if (eaten) this.capturePiece(to, eaten);

    // 2. Логику меняем сразу, картинку — короткой анимацией
    this.knightCol = to.col;
    this.knightRow = to.row;
    this.animateJump(to);

    // 3. Очки за высоту — только за ряды, где конь ещё не был
    if (to.row > this.maxRow) {
      this.score += (to.row - this.maxRow) * POINTS_PER_ROW;
      this.maxRow = to.row;
    }
    this.showScoreGain(to, this.score - scoreBefore, eaten !== null);
    if (eaten) sfx.capture();
    else sfx.move();

    // 4. Ответ противника: если клетку коня бьёт видимая фигура — она рубит
    const attacker = findAttacker(this.board, to, this.bottomActiveRow(), this.topActiveRow());
    if (attacker) {
      this.knightCaptured(attacker);
    } else {
      this.showMoves();
    }
  }

  /** Взятие: фигура исчезает с доски и разлетается на осколки, очки — её шахматная ценность. */
  private capturePiece(at: Cell, type: EnemyType): void {
    this.board.remove(at.col, at.row);
    this.score += PIECE_VALUE[type];
    const view = this.pieceViews.get(cellKey(at.col, at.row));
    this.pieceViews.delete(cellKey(at.col, at.row));
    if (!view) return;
    burst(this, view, COLOR.pieceBits);
    this.tweens.add({
      targets: view,
      scale: 0,
      alpha: 0,
      duration: 140,
      onComplete: () => view.destroy(),
    });
  }

  /** Прыжок: конь летит в клетку и в полёте чуть растёт, при приземлении — кольцо. */
  private animateJump(to: Cell): void {
    const target = this.cellCenter(to);
    this.tweens.killTweensOf([this.knight, this.knightSquare]);
    this.knight.setScale(this.pieceScale);
    this.tweens.add({
      targets: [this.knight, this.knightSquare],
      x: target.x,
      y: target.y,
      duration: MOVE_MS,
      ease: 'Quad.easeOut',
      onComplete: () => ring(this, target, COLOR.mark, 0.4),
    });
    this.tweens.add({
      targets: this.knight,
      scale: this.pieceScale * 1.2,
      duration: MOVE_MS / 2,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** Счёт: число в плашке подпрыгивает, над конём всплывает «+N» (за взятие — крупнее и жёлтым). */
  private showScoreGain(at: Cell, gained: number, captured: boolean): void {
    this.scoreText.setText(String(this.score));
    if (gained <= 0) return;
    const above = { x: this.cellX(at.col), y: this.cellY(at.row) - CELL * 0.45 };
    floatText(
      this,
      above,
      `+${gained}`,
      captured ? COLOR.accentCss : COLOR.text,
      captured ? 46 : 34,
      this.renderScale,
    );
    this.tweens.killTweensOf(this.scoreText);
    this.scoreText.setScale(1);
    this.tweens.add({ targets: this.scoreText, scale: 1.25, duration: 90, yoyo: true });
  }

  /** Фигура едет через доску и рубит коня — красная линия показывает, откуда пришёл удар. */
  private knightCaptured(attacker: Attacker): void {
    this.state = 'dying';
    this.clearMoves();
    const knightAt = this.cellCenter({ col: this.knightCol, row: this.knightRow });
    this.culprits = [attackLine(this, this.cellCenter(attacker), knightAt, COLOR.danger, DEPTH.marks)];

    const title = KILLED_BY[attacker.type];
    const rule = RULE[attacker.type];
    const view = this.pieceViews.get(cellKey(attacker.col, attacker.row));
    if (!view) {
      this.knightDies(knightAt, title, rule);
      return;
    }

    this.culprits.push(view);
    const distance = Math.max(
      Math.abs(attacker.col - this.knightCol),
      Math.abs(attacker.row - this.knightRow),
    );
    view.setDepth(DEPTH.knight + 1);
    this.tweens.add({
      targets: view,
      x: knightAt.x,
      y: knightAt.y,
      delay: MOVE_MS + CAPTURE_DELAY_MS,
      duration: distance * CAPTURE_MS_PER_CELL + 120,
      ease: 'Quad.easeIn',
      onComplete: () => this.knightDies(knightAt, title, rule),
    });
  }

  /** Экран догнал коня: та же гибель, только причина другая. */
  private screenCaughtKnight(): void {
    this.clearMoves();
    this.band.setAlpha(1);
    this.culprits = [this.band];
    this.knightDies({ x: this.knight.x, y: this.knight.y }, SCREEN_DEATH.title, SCREEN_DEATH.rule);
  }

  /** Гибель коня: осколки, тряска, красная вспышка, звук — и через мгновение экран проигрыша. */
  private knightDies(at: Point, title: string, rule: string): void {
    this.state = 'dying';
    const screenY = at.y - this.cameras.main.scrollY;
    this.knight.setVisible(false);
    burst(this, at, COLOR.knightBits, 16);
    this.cameras.main.shake(180, 0.012);
    this.cameras.main.flash(220, 239, 68, 68);
    sfx.death();
    // Пауза перед экраном проигрыша — через tween, чтобы она шла по тем же часам, что и анимации
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: DEATH_PAUSE_MS,
      onComplete: () => this.gameOver(title, rule, screenY),
    });
  }

  // ───────────── Экран ─────────────

  private scrollCamera(seconds: number): void {
    const camera = this.cameras.main;
    const baseSpeed = Math.min(SCROLL_SPEED_MAX, SCROLL_SPEED_START + SCROLL_ACCEL * this.elapsed);
    const speed = baseSpeed * this.settings.scrollMultiplier;
    camera.scrollY -= speed * seconds; // мир растёт вверх → камера едет в минус

    // Конь ушёл высоко — подтягиваем экран, чтобы было видно, что впереди
    if (this.knightScreenY() < FOLLOW_LINE) {
      const target = this.cellY(this.knightRow) - FOLLOW_LINE;
      camera.scrollY += (target - camera.scrollY) * Math.min(1, seconds * FOLLOW_SMOOTHING);
    }
  }

  /** Конь близко к нижнему краю — полоса мигает: предупреждение до того, как экран догонит. */
  private updateDangerBand(): void {
    const close = this.knightScreenY() > GAME_HEIGHT - DEATH_BAND - DANGER_ZONE;
    this.band.setAlpha(close ? BAND_ALPHA + (1 - BAND_ALPHA) * Math.sin(this.elapsed * 14) : BAND_ALPHA);
  }

  // ───────────── Интерфейс ─────────────

  /** Текст интерфейса: один шрифт, жирный, по центру, чёткий на любом экране. */
  private uiText(
    x: number,
    y: number,
    text: string,
    size: number,
    color: string = COLOR.text,
  ): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color,
        align: 'center',
        resolution: this.renderScale,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);
  }

  /**
   * Плашка сверху: счёт слева, фаза и пауза справа. Плашка непрозрачная — фигуры под ней
   * не бьют и не мешают читать счёт. Полоса опасности внизу.
   */
  private createHud(): void {
    this.add
      .rectangle(GAME_WIDTH / 2, HUD_HEIGHT / 2, GAME_WIDTH, HUD_HEIGHT, COLOR.panel)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);

    this.scoreText = this.uiText(28, HUD_HEIGHT / 2, '0', 42).setOrigin(0, 0.5).setDepth(DEPTH.hud);

    const chipX = GAME_WIDTH - HUD_HEIGHT - 96;
    this.phaseChip = this.add
      .rectangle(chipX, HUD_HEIGHT / 2, 160, 44, COLOR.chip)
      .setRounded(22)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);
    this.phaseText = this.uiText(chipX, HUD_HEIGHT / 2, 'ФАЗА 1', 24, '#cbd5e1').setDepth(DEPTH.hud);

    this.band = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT - DEATH_BAND / 2, GAME_WIDTH, DEATH_BAND, COLOR.danger)
      .setAlpha(BAND_ALPHA)
      .setScrollFactor(0)
      .setDepth(DEPTH.band);

    this.createPauseButton();
  }

  /** Кнопка паузы в правом углу плашки: круг под палец и значок из двух палочек. */
  private createPauseButton(): void {
    const x = GAME_WIDTH - 40;
    const y = HUD_HEIGHT / 2;
    const hitArea = this.add.circle(x, y, 28, 0xffffff, 0.14).setInteractive({ useHandCursor: true });
    const leftBar = this.add.rectangle(x - 7, y, 8, 24, 0xffffff).setRounded(3);
    const rightBar = this.add.rectangle(x + 7, y, 8, 24, 0xffffff).setRounded(3);

    this.pauseButton = [hitArea, leftBar, rightBar];
    for (const part of this.pauseButton) part.setScrollFactor(0).setDepth(DEPTH.hud);
  }

  // ───────────── Пауза ─────────────

  /**
   * Пауза — это состояние, а не надпись. Всё замирает само:
   * update() двигает экран, считает игровое время и создаёт ряды только в 'playing',
   * ходы в handleTap() на паузе не принимаются, а анимации стоят через tweens.pauseAll().
   */
  private pauseGame(): void {
    if (this.state !== 'ready' && this.state !== 'playing') return; // после проигрыша пауза не нужна
    this.stateBeforePause = this.state;
    this.state = 'paused';
    this.tweens.pauseAll(); // прыжок коня и другие анимации тоже замирают

    // Экран паузы непрозрачный: иначе паузой можно бесплатно думать над доской, пока экран стоит
    const resume = createButton(this, GAME_WIDTH / 2, 700, 440, 'Продолжить', 'primary', DEPTH.ui, this.renderScale);
    this.soundButton = createButton(this, GAME_WIDTH / 2, 820, 440, this.soundLabel(), 'secondary', DEPTH.ui, this.renderScale);
    this.pauseViews = [
      this.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLOR.panel)
        .setScrollFactor(0)
        .setDepth(DEPTH.ui - 0.01),
      this.uiText(GAME_WIDTH / 2, 500, 'ПАУЗА', 80),
      this.uiText(GAME_WIDTH / 2, 572, 'Доска скрыта, пока игра стоит', 26, COLOR.textMuted),
      resume.bg,
      resume.label,
      this.soundButton.bg,
      this.soundButton.label,
      this.uiText(GAME_WIDTH / 2, 920, 'P или Esc — пауза с клавиатуры', 22, COLOR.textMuted),
    ];
  }

  /** Игра продолжается ровно с того же места: ничего не пересоздаётся. */
  private resumeGame(): void {
    if (this.state !== 'paused') return;
    for (const view of this.pauseViews) view.destroy();
    this.pauseViews = [];
    this.soundButton = null;
    this.tweens.resumeAll();
    this.state = this.stateBeforePause;
  }

  private togglePause(): void {
    if (this.state === 'paused') this.resumeGame();
    else this.pauseGame();
  }

  private soundLabel(): string {
    return sfx.muted ? 'Звук: выкл' : 'Звук: вкл';
  }

  private toggleSound(): void {
    sfx.toggleMute();
    this.soundButton?.label.setText(this.soundLabel());
    sfx.click();
  }

  // ───────────── Конец игры ─────────────

  /**
   * Экран проигрыша: доска притемнена, а виновник гибели (линия удара и фигура или красная полоса)
   * поверх затемнения. Панель выезжает с той половины экрана, где коня не было, — место гибели
   * остаётся на виду. На панели: что случилось, почему (правило фигуры), счёт, рекорд и «Ещё раз».
   */
  private gameOver(title: string, rule: string, deathScreenY: number): void {
    this.state = 'over';
    this.clearMoves();
    for (const part of this.pauseButton) part.setVisible(false); // после проигрыша пауза не нужна
    this.restartAllowedAt = this.time.now + RESTART_DELAY_MS;
    const previousBest = this.loadBestScore();
    const best = this.saveBestScore();
    const isRecord = this.score > previousBest;

    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.45)
      .setScrollFactor(0)
      .setDepth(DEPTH.dim);
    this.culprits.forEach((view, i) => view.setDepth(DEPTH.culprit + i * 0.01));

    // Конь погиб в нижней половине экрана — панель сверху, иначе снизу
    const fromTop = deathScreenY > GAME_HEIGHT / 2;
    const top = fromTop ? 0 : GAME_HEIGHT - SHEET_HEIGHT;
    // Панель на 40 px длиннее и заходит за край экрана: скруглены только углы со стороны доски
    const panelY = top + SHEET_HEIGHT / 2 + (fromTop ? -20 : 20);
    const button = createButton(this, GAME_WIDTH / 2, top + 450, 440, 'Ещё раз', 'primary', DEPTH.ui, this.renderScale);
    const sheet: Array<Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text> = [
      createPanel(this, GAME_WIDTH / 2, panelY, GAME_WIDTH, SHEET_HEIGHT + 40, DEPTH.ui - 0.01),
      this.uiText(GAME_WIDTH / 2, top + 64, title, 42),
      this.uiText(GAME_WIDTH / 2, top + 112, rule, 26, COLOR.textMuted),
      this.uiText(GAME_WIDTH / 2, top + 176, 'СЧЁТ', 22, COLOR.textMuted),
      this.uiText(GAME_WIDTH / 2, top + 240, String(this.score), 96),
      this.uiText(
        GAME_WIDTH / 2,
        top + 318,
        isRecord ? 'Новый рекорд!' : `Рекорд: ${best}`,
        30,
        isRecord ? COLOR.accentCss : COLOR.textMuted,
      ),
      button.bg,
      button.label,
    ];
    // Панель выезжает из-за своего края экрана
    const offset = fromTop ? -(SHEET_HEIGHT + 60) : SHEET_HEIGHT + 60;
    for (const view of sheet) {
      const y = view.y;
      view.y = y + offset;
      this.tweens.add({ targets: view, y, duration: 360, ease: 'Back.easeOut' });
    }
  }

  /** Рекорд хранится в браузере игрока. localStorage бывает недоступен — тогда просто без рекорда. */
  private loadBestScore(): number {
    try {
      return Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  private saveBestScore(): number {
    const best = Math.max(this.score, this.loadBestScore());
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(best));
    } catch {
      // localStorage недоступен — просто не запоминаем
    }
    return best;
  }
}

/**
 * Звуки без файлов: короткие сигналы собираются прямо в браузере через Web Audio.
 * Браузер разрешает звук только после касания экрана — поэтому unlock() вызываем на каждый тап.
 * Выключенный звук запоминается в браузере игрока.
 */
const MUTE_KEY = 'knight-sound-off';

class Sfx {
  private ctx: AudioContext | null = null;
  muted = readMuted();

  /** Вызывать из обработчика тапа: только там браузер разрешает создать и запустить звук. */
  unlock(): void {
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Включить / выключить звук. Возвращает, выключен ли звук теперь. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // localStorage недоступен — просто не запоминаем
    }
    return this.muted;
  }

  /** Прыжок коня: короткий «ток». */
  move(): void {
    this.tone(520, 340, 0.08, 'triangle', 0.22);
  }

  /** Взятие фигуры: два восходящих звонких тона. */
  capture(): void {
    this.tone(660, 880, 0.08, 'square', 0.08);
    this.tone(990, 1320, 0.14, 'triangle', 0.2, 0.07);
  }

  /** Фаза 2: восходящее арпеджио. */
  phase(): void {
    [440, 554, 659, 880].forEach((freq, i) => this.tone(freq, freq, 0.14, 'triangle', 0.2, i * 0.09));
  }

  /** Гибель коня: низкий падающий звук. */
  death(): void {
    this.tone(260, 60, 0.5, 'sawtooth', 0.12);
    this.tone(130, 45, 0.5, 'sine', 0.25);
  }

  /** Нажатие кнопки. */
  click(): void {
    this.tone(880, 880, 0.04, 'square', 0.05);
  }

  /** Один тон: частота плавно меняется from → to, громкость быстро нарастает и затухает. */
  private tone(
    from: number,
    to: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
  ): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const start = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Один звуковой движок на всю страницу: при перезапуске сцены он не пересоздаётся. */
export const sfx = new Sfx();

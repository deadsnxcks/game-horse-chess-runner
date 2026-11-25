/**
 * Аналитика: события игры уходят в Яндекс Метрику как цели (JavaScript-события).
 * В счётчике должны быть созданы цели с такими идентификаторами:
 * first_move, phase_2, phase_3, death, restart.
 * Если счётчик не загрузился или его заблокировал adblock, игра продолжает работать.
 */

type Params = Record<string, string | number | boolean>;

/** Из методов Метрики нам нужен только reachGoal — отправка цели. */
type Metrika = (id: number, method: 'reachGoal', goal: string, params: Params) => void;

/** Номер счётчика Метрики (index.html). */
const COUNTER_ID = 114661708;
/** Версия игры — добавляется в параметры каждого события. */
const GAME_VERSION = '0.5.0';

/** Отправить событие-цель в Метрику. */
export function track(event: string, params: Params = {}): void {
  const data = { ...params, game_version: GAME_VERSION };
  if (import.meta.env.DEV) console.log('[analytics]', event, data);

  const ym = (window as Window & { ym?: Metrika }).ym;
  if (typeof ym !== 'function') return;
  try {
    ym(COUNTER_ID, 'reachGoal', event, data);
  } catch (error) {
    console.warn('Analytics error', error);
  }
}

---
description: Смоук-прогон — сборка, preview и чеклист игры в браузере
agent: tester
---

Прогони проверки по чеклисту из скила `horsechess-smoke`:

1. `npm run typecheck` — команда и код возврата.
2. `npm run build` — команда и код возврата.
3. `npm run preview` и проверка, что `http://localhost:4173/` отвечает.
4. Браузерный смоук: `node .opencode/skills/horsechess-smoke/scripts/smoke.mjs http://localhost:4173/` (если Playwright не установлен — честно скажи и перейди к ручным пунктам).
5. Ручные пункты, которые скрипт не покрывает, — перечисли их и отметь «не проверено».

Отчёт — таблица: пункт | ok/fail/not checked | доказательство. В конце одна строка вердикта.

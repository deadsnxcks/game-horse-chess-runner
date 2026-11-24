#!/usr/bin/env node
// Смоук-прогон horsechess в мобильном Chromium.
// Использование: node .opencode/skills/horsechess-smoke/scripts/smoke.mjs [url]
// Коды возврата: 0 — всё зелёное, 1 — есть провалы, 2 — Playwright не установлен.

import { mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const url = process.argv[2] ?? "http://localhost:4173/"
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const outDir = path.join(tmpdir(), "horsechess-smoke", stamp)

let chromium
try {
  ;({ chromium } = await import("playwright"))
} catch {
  console.error("playwright не установлен — без разрешения пользователя не ставить.")
  console.error("Команда для установки: npm i -D playwright && npx playwright install chromium")
  process.exit(2)
}

const checks = []
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? "ok   " : "FAIL "}${name}${detail ? " — " + detail : ""}`)
}

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
})
const page = await context.newPage()

const consoleErrors = []
const pageErrors = []
const badResponses = []
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text())
})
page.on("pageerror", (e) => pageErrors.push(String(e)))
page.on("response", (r) => {
  if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`)
})

try {
  const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 })
  check("страница отвечает", Boolean(resp && resp.ok()), resp ? String(resp.status()) : "нет ответа")

  await page.waitForSelector("canvas", { timeout: 10000 })
  const size = await page.evaluate(() => {
    const c = document.querySelector("canvas")
    return c ? { w: c.clientWidth, h: c.clientHeight } : null
  })
  check("canvas на месте", Boolean(size && size.w > 0 && size.h > 0), size ? `${size.w}×${size.h}` : "нет canvas")

  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(outDir, "01-start.png") })

  const box = await page.locator("canvas").first().boundingBox()
  check("canvas виден", Boolean(box && box.width > 0 && box.height > 0), box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "0")

  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(outDir, "02-started.png") })

    for (let i = 0; i < 12; i += 1) {
      const x = box.x + 20 + Math.random() * Math.max(1, box.width - 40)
      const y = box.y + 20 + Math.random() * Math.max(1, box.height - 40)
      await page.mouse.click(x, y)
      await page.waitForTimeout(400)
    }
    await page.screenshot({ path: path.join(outDir, "03-after-input.png") })
    check("12 случайных тапов без падения", pageErrors.length === 0, pageErrors[0] ?? "")
  }

  check("нет ошибок в консоли", consoleErrors.length === 0, consoleErrors[0] ?? "")
  check("нет ошибок страницы", pageErrors.length === 0, pageErrors[0] ?? "")
  check("нет ответов 4xx/5xx", badResponses.length === 0, badResponses.slice(0, 3).join("; "))

  await page.reload({ waitUntil: "networkidle", timeout: 30000 })
  await page.waitForSelector("canvas", { timeout: 10000 })
  check("после перезагрузки игра поднимается", true)
} catch (err) {
  check("прогон завершился", false, String(err))
} finally {
  await browser.close()
}

const failed = checks.filter((c) => !c.ok)
await writeFile(
  path.join(outDir, "result.json"),
  JSON.stringify({ url, checks, consoleErrors, pageErrors, badResponses }, null, 2),
)
console.log(`\nскриншоты и result.json: ${outDir}`)
console.log(failed.length ? `итог: провалов ${failed.length}` : "итог: всё зелёное")
process.exit(failed.length ? 1 : 0)

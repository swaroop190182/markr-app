// The per-feature timing line must be logged BEFORE the response is sent (api/claude.ts):
// on Vercel, work after the response ends is not guaranteed to run.
// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../api/claude.ts', import.meta.url), 'utf8')
const body = (name: string) => { const i = src.indexOf(`async function ${name}(`); return src.slice(i, src.indexOf('\n}\n', i) === -1 ? src.indexOf('\r\n}\r\n', i) : src.indexOf('\n}\n', i)) }

test('callAnthropic runs onDone (log + usage) before sending or ending the response', () => {
  const fn = body('callAnthropic')
  const sendJson = fn.indexOf("res.status(200).json({ content: data.content")
  assert.ok(sendJson > 0 && fn.lastIndexOf('await onDone?.(u)', sendJson) > 0, 'non-stream: onDone before res.json')
  const lastEnd = fn.lastIndexOf('res.end()')
  assert.ok(fn.lastIndexOf('await onDone?.(u)', lastEnd) > fn.indexOf('const reader'), 'stream: onDone before res.end')
  assert.equal((fn.match(/await onDone\?\.\(u\)/g) ?? []).length, 3)
})

test('the [callClaude] timing line is inside onDone, not after the response', () => {
  const i = src.indexOf('const anthropicResult = await callAnthropic(')
  const call = src.slice(i, src.indexOf("if (anthropicResult && !('failStatus' in anthropicResult)) return", i))
  assert.ok(call.includes('console.log(`[callClaude] provider: anthropic feature=${feature} ms='))
  assert.ok(call.includes('await logUsage('))
})

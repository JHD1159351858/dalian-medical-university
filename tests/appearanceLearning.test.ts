import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { AppearanceLearning } from '../src/clinical/AppearanceLearning'
import { CASE_APPEARANCE } from '../src/clinical/caseData'

it('shows one current patient image without the old gallery annotations', () => {
  const html = renderToStaticMarkup(createElement(AppearanceLearning))
  expect(html).toContain('望诊图谱')
  expect(html).toContain('aria-label="放大查看患者状态"')
  expect(html).toContain(CASE_APPEARANCE.src)
  expect(html.match(/<img\b/g)).toHaveLength(1)
  expect(html).not.toMatch(/AI教学示意|AI生成|独立图谱|不代表当前患者体征|仅供|巩膜黄染|阳黄|阴黄|&#x20;/)
})

it('loads the current cartoon patient portrait with matching dimensions', () => {
  const file = readFileSync(resolve('public', CASE_APPEARANCE.src.slice(1)))
  expect(file.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect([file.readUInt32BE(16), file.readUInt32BE(20)]).toEqual([CASE_APPEARANCE.width, CASE_APPEARANCE.height])
})

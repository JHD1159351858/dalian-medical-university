import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { TongueLearning } from '../src/clinical/TongueLearning'
import { isTongueAnswerCorrect, practiceTongueSamples, selectTongueQuestion, tongueSamples } from '../src/clinical/tongueSamples'

it('keeps the supplied 13 entries and 12 original photos with document provenance', () => {
  expect(tongueSamples).toHaveLength(13)
  expect(new Set(tongueSamples.map((sample) => sample.image)).size).toBe(12)
  for (const sample of tongueSamples) {
    expect(existsSync(resolve('public', sample.image.slice(1)))).toBe(true)
    expect(sample.source).toBe('舌象图片及形态介绍.docx')
    expect(sample.sourceParagraph).toBeGreaterThan(0)
    expect(sample.features.length).toBeGreaterThan(0)
    expect(sample.recognition).not.toBe('')
  }
})

it('excludes photos containing answer annotations and deduplicates shared photos from practice', () => {
  expect(practiceTongueSamples).toHaveLength(10)
  expect(practiceTongueSamples.every((sample) => !sample.hasEmbeddedLabel)).toBe(true)
  expect(new Set(practiceTongueSamples.map((sample) => sample.image)).size).toBe(practiceTongueSamples.length)
  expect(practiceTongueSamples.some((sample) => sample.image.endsWith('image5.jpeg'))).toBe(false)
  expect(practiceTongueSamples.some((sample) => sample.image.endsWith('image11.jpeg'))).toBe(false)
})

it('accepts both supplied labels for the shared normal tongue and thin-white coating photo', () => {
  const normal = tongueSamples.find((sample) => sample.id === 'tongue-1')!
  expect(isTongueAnswerCorrect(normal, '正常舌象')).toBe(true)
  expect(isTongueAnswerCorrect(normal, '薄白苔')).toBe(true)
  expect(isTongueAnswerCorrect(normal, '黄腻苔')).toBe(false)
  expect(isTongueAnswerCorrect(normal, '')).toBe(false)
  expect(isTongueAnswerCorrect(normal, '不是薄白苔')).toBe(false)
})

it('selects the next question without immediately repeating the same photo', () => {
  const first = selectTongueQuestion(undefined, () => 0)
  const next = selectTongueQuestion(first.id, () => 0)
  expect(next.image).not.toBe(first.image)
  expect(selectTongueQuestion(undefined, () => 0.9999).hasEmbeddedLabel).toBe(false)
})

it('clearly separates the study library from the current patient record', () => {
  const html = renderToStaticMarkup(createElement(TongueLearning))
  expect(html).toContain('学习图谱')
  expect(html).toContain('随机识图')
  expect(html).toContain('不写入王旭病例记录')
  expect(html).toContain('含文字标注，仅用于学习')
})

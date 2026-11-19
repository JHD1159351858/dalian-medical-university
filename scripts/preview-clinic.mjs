import express from 'express'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, loadEnv } from 'vite'
import { attachSpeechStream, createApp } from '../server/index.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = resolve(root, '.preview/clinic')
await build({
  root, configFile: false, envDir: false, publicDir: false,
  build: {
    outDir: output,
    rollupOptions: {
      input: resolve(root, 'scripts/clinic-preview.tsx'),
      output: { entryFileNames: 'clinic.js', assetFileNames: 'assets/[name]-[hash][extname]' },
    },
    manifest: true,
  },
})

const manifest = JSON.parse(await readFile(resolve(output, '.vite/manifest.json'), 'utf8'))
const entry = manifest['scripts/clinic-preview.tsx']
const css = (entry.css ?? []).map(file => `<link rel="stylesheet" href="/${file}">`).join('')
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>临床问诊实训 · 本机预览</title>${css}</head><body><div id="root"></div><script type="module" src="/${entry.file}"></script></body></html>`

// Only speech uses the provider. Interview answers and records stay in the local preview.
const { OPENAPI_TOKEN, OPENAPI_BASE_URL, PATIENT_VOICE_ID } = loadEnv('development', root, ['OPENAPI_', 'PATIENT_VOICE_ID'])
const speechEnv = { OPENAPI_TOKEN, OPENAPI_BASE_URL, PATIENT_VOICE_ID }
const clinicalApi = createApp({ env: speechEnv })
const allowsLocalSpeech = ({ headers }) =>
  ['127.0.0.1:5177', 'localhost:5177'].includes(headers.host) &&
  (!headers.origin || headers.origin === 'http://' + headers.host)
const endpoints = new Set(['/api/health', '/api/training-cases', '/api/chat', '/api/pulse-exam',
  '/api/treatment-evaluation', '/api/case-assessment', '/api/tts', '/api/records-config'])
const preview = express()
preview.use((req, res, next) => {
  if (req.path === '/api/tts' && !allowsLocalSpeech(req)) return res.sendStatus(403)
  if (endpoints.has(req.path)) return clinicalApi(req, res, next)
  next()
})
preview.get(['/', '/training'], (_req, res) => res.set('Cache-Control','no-store').send(html))
preview.use(express.static(output), express.static(resolve(root, 'public')))
const server = preview.listen(5177, '127.0.0.1', () => console.log('本机诊室预览 http://127.0.0.1:5177/'))
attachSpeechStream(server, { env: speechEnv, allowRequest: allowsLocalSpeech })

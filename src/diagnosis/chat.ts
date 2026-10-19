export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function checkChatAvailability(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch('/api/health', { signal })
    if (!response.ok) return false
    const data = (await response.json()) as { configured?: boolean }
    return data.configured === true
  } catch {
    return false
  }
}

export async function requestReply(messages: ChatMessage[], onDelta: (text: string) => void, signal?: AbortSignal): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, stream: true }),
    signal,
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: unknown }
    throw new Error(typeof data.error === 'string' ? data.error : '患者暂时无法回应，请稍后重试。')
  }
  if (!response.body) throw new Error('患者暂时无法回应，请稍后重试。')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const lines = frame.split('\n')
        const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim()
        const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
        if (data) {
          const payload = JSON.parse(data) as { text?: unknown; reply?: unknown; error?: unknown }
          if (event === 'delta' && typeof payload.text === 'string') onDelta(payload.text)
          if (event === 'error') throw new Error(typeof payload.error === 'string' ? payload.error : '患者暂时无法回应，请稍后重试。')
          if (event === 'done' && typeof payload.reply === 'string' && payload.reply.trim()) return payload.reply.trim()
        }
        boundary = buffer.indexOf('\n\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
  throw new Error('患者暂时无法回应，请稍后重试。')
}

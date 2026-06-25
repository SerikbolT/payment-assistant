import { useState, useEffect, useRef } from 'react'
import type { GeneratedXml } from '../types'

// ── XML syntax highlighter ───────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function colorTag(tag: string): string {
  if (tag.startsWith('<?')) {
    return `<span class="xt-decl">${esc(tag)}</span>`
  }
  if (tag.startsWith('</')) {
    const name = tag.slice(2, -1).trim()
    return `<span class="xt-br">&lt;/</span><span class="xt-tag">${name}</span><span class="xt-br">&gt;</span>`
  }
  const content = tag.slice(1, -1)
  const spaceIdx = content.search(/[\s/]/)
  if (spaceIdx === -1) {
    return `<span class="xt-br">&lt;</span><span class="xt-tag">${content}</span><span class="xt-br">&gt;</span>`
  }
  const name = content.slice(0, spaceIdx)
  const rest = esc(content.slice(spaceIdx))
  const coloredRest = rest.replace(
    /([\w:.-]+)(=)("([^"]*)")/g,
    '<span class="xt-attr">$1</span>=<span class="xt-val">"$4"</span>',
  )
  return `<span class="xt-br">&lt;</span><span class="xt-tag">${name}</span>${coloredRest}<span class="xt-br">&gt;</span>`
}

function highlightXml(xml: string): string {
  let result = ''
  let i = 0
  while (i < xml.length) {
    if (xml[i] === '<') {
      const end = xml.indexOf('>', i)
      if (end === -1) { result += '&lt;'; i++; continue }
      result += colorTag(xml.slice(i, end + 1))
      i = end + 1
    } else {
      const next = xml.indexOf('<', i)
      const text = next === -1 ? xml.slice(i) : xml.slice(i, next)
      const escaped = esc(text)
      result += text.trim()
        ? `<span class="xt-text">${escaped}</span>`
        : escaped
      i = next === -1 ? xml.length : next
    }
  }
  return result
}

// ── Toast ────────────────────────────────────────────────────────────────────

interface ToastItem { id: number; message: string; type: 'success' | 'info' }

function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const show = (message: string, type: ToastItem['type'] = 'success') => {
    const id = ++counter.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500)
  }

  return { toasts, show }
}

// ── Статистика XML ───────────────────────────────────────────────────────────

function xmlStats(xml: string) {
  const lines = xml.split('\n').length
  const bytes = new TextEncoder().encode(xml).length
  const kb = (bytes / 1024).toFixed(1)
  return { lines, kb }
}

// ── Нумерация строк ──────────────────────────────────────────────────────────

function LineNumbers({ count }: { count: number }) {
  return (
    <div className="xml-line-numbers" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i}>{i + 1}</span>
      ))}
    </div>
  )
}

// ── Компонент ────────────────────────────────────────────────────────────────

interface Props {
  generated: GeneratedXml | null
}

export function XmlPreview({ generated }: Props) {
  const { toasts, show } = useToast()
  const prevXmlRef = useRef<string | null>(null)
  const [fresh, setFresh] = useState(false)

  // Подсветить панель на секунду при новой генерации
  useEffect(() => {
    if (generated && generated.xml !== prevXmlRef.current) {
      prevXmlRef.current = generated.xml
      setFresh(true)
      const t = setTimeout(() => setFresh(false), 800)
      return () => clearTimeout(t)
    }
  }, [generated])

  if (!generated) {
    return (
      <div className="xml-empty">
        <div className="xml-empty-icon">📄</div>
        <div className="xml-empty-title">XML появится здесь</div>
        <div className="xml-empty-hint">
          Заполните форму слева и нажмите<br />
          <strong>«Сгенерировать XML»</strong>
        </div>
        <div className="xml-steps">
          <div className="xml-step">
            <span className="xml-step-num">1</span>
            Заполните реквизиты отправителя и получателя
          </div>
          <div className="xml-step">
            <span className="xml-step-num">2</span>
            Укажите сумму, валюту и дату расчёта
          </div>
          <div className="xml-step">
            <span className="xml-step-num">3</span>
            Нажмите «Сгенерировать XML» — файл готов мгновенно
          </div>
        </div>
      </div>
    )
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generated.xml)
    show('XML скопирован в буфер обмена', 'success')
  }

  const handleDownload = () => {
    const blob = new Blob([generated.xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pacs008_${generated.messageId}.xml`
    a.click()
    URL.revokeObjectURL(url)
    show(`Файл pacs008_${generated.messageId}.xml скачан`, 'info')
  }

  const { lines, kb } = xmlStats(generated.xml)
  const highlighted = highlightXml(generated.xml)

  return (
    <>
      <div className={`xml-preview${fresh ? ' fresh' : ''}`}>

        {/* Тулбар */}
        <div className="xml-toolbar">
          <div className="xml-toolbar-left">
            <span className="xml-badge">ISO 20022 · pacs.008.001.08</span>
            <div className="xml-stats">
              <span className="xml-stat">📄 {lines} строк</span>
              <span className="xml-stat">⚖ {kb} KB</span>
            </div>
          </div>
          <div className="xml-actions">
            <button onClick={handleCopy} className="xml-btn" title="Скопировать XML">
              ⎘ Копировать
            </button>
            <button onClick={handleDownload} className="xml-btn xml-btn-primary" title="Скачать .xml">
              ↓ Скачать .xml
            </button>
          </div>
        </div>

        {/* Метаданные сообщения */}
        <div className="xml-ids">
          <span>MsgId:&nbsp;<code>{generated.messageId}</code></span>
          <span>UETR:&nbsp;<code>{generated.uetr}</code></span>
        </div>

        {/* XML с нумерацией строк */}
        <div className="xml-code-wrap">
          <LineNumbers count={lines} />
          <pre
            className="xml-code"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </div>
      </div>

      {/* Toast-уведомления */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'success' ? '✓' : '↓'} {t.message}
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * AI-помощник Payment Assistant — интеграция с Claude API
 *
 * Архитектура:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  UI-компонент                                                   │
 * │    │  вызывает одну из четырёх публичных функций               │
 * │    ▼                                                            │
 * │  aiAssistant.ts  ──►  buildPrompt()   ──►  готовый промпт      │
 * │                   ──►  callClaude()   ──►  fetch → Claude API  │
 * │                   ──►  parseResponse() ──►  типизированный ответ│
 * │                                                                 │
 * │  Claude API (api.anthropic.com/v1/messages)                    │
 * │    модель: claude-haiku-4-5-20251001 (быстро, дёшево)          │
 * │    fallback: claude-sonnet-4-6 (глубокий анализ)               │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Четыре режима работы:
 *   1. analyzeRequisites  — проверка реквизитов целиком
 *   2. explainError       — объяснение конкретной ошибки валидации
 *   3. suggestFix         — рекомендации по исправлению поля
 *   4. generateComment    — краткий комментарий для операциониста
 */

import type { Pacs008Input } from './pacs008Generator'

// ─── Конфигурация ─────────────────────────────────────────────────────────────

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

/** Модели: быстрая для рутинных задач, умная для глубокого анализа */
const MODEL = {
  fast: 'claude-haiku-4-5-20251001',
  smart: 'claude-sonnet-4-6',
} as const

type ModelKey = keyof typeof MODEL

/** Системный контекст — единый для всех запросов */
const SYSTEM_PROMPT = `Ты — экспертный AI-ассистент для операционистов банка.
Специализация: международные платежи, стандарт ISO 20022, формат pacs.008.
Язык ответов: русский, без технического жаргона.
Стиль: чёткий, лаконичный, практичный. Без вводных фраз типа "Конечно!" или "Отличный вопрос!".
Числа и коды (IBAN, BIC, суммы) всегда выделяй курсивом через *.`

// ─── Типы ─────────────────────────────────────────────────────────────────────

/** Одна проблема, найденная AI при анализе реквизитов */
export interface AIIssue {
  /** Поле формы, к которому относится проблема */
  field: string
  /** Человекочитаемое название поля */
  fieldLabel: string
  /** Тип: ошибка блокирует отправку, предупреждение — нет */
  severity: 'error' | 'warning' | 'info'
  /** Краткое описание проблемы */
  description: string
  /** Конкретный совет по исправлению */
  recommendation: string
}

/** Результат анализа полного набора реквизитов */
export interface AnalysisResult {
  /** Общая оценка: можно ли отправлять платёж */
  canProceed: boolean
  /** Краткое резюме (1–2 предложения) */
  summary: string
  /** Список найденных проблем */
  issues: AIIssue[]
  /** Комментарий для операциониста */
  operatorComment: string
}

/** Объяснение одной ошибки валидации */
export interface ErrorExplanation {
  /** Что именно не так */
  problem: string
  /** Почему это важно (контекст стандарта) */
  context: string
  /** Как исправить */
  howToFix: string
}

/** Комментарий операциониста для передачи платежа в CBS */
export interface OperatorComment {
  /** Готовый текст для вставки в CBS */
  text: string
  /** Флаги особого внимания */
  flags: string[]
}

/** Внутренний тип: сообщение для Claude API */
interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Ответ Claude API */
interface ClaudeResponse {
  content: Array<{ type: string; text: string }>
  usage: { input_tokens: number; output_tokens: number }
}

// ─── Низкоуровневый HTTP-клиент ───────────────────────────────────────────────

function getApiKey(): string {
  const key = (import.meta as { env: Record<string, string> }).env.VITE_ANTHROPIC_API_KEY
  if (!key) throw new AIError('API_KEY_MISSING', 'Переменная VITE_ANTHROPIC_API_KEY не задана')
  return key
}

/**
 * Отправляет запрос к Claude API.
 * Все четыре публичные функции используют этот метод.
 *
 * @param messages  — история диалога
 * @param model     — 'fast' (haiku) или 'smart' (sonnet)
 * @param maxTokens — лимит токенов в ответе
 */
async function callClaude(
  messages: ClaudeMessage[],
  model: ModelKey = 'fast',
  maxTokens = 400,
): Promise<string> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL[model],
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new AIError(
      'API_ERROR',
      `Claude API вернул ошибку ${response.status}: ${body.slice(0, 200)}`,
    )
  }

  const data = (await response.json()) as ClaudeResponse
  const text = data.content.find(c => c.type === 'text')?.text ?? ''

  if (!text) throw new AIError('EMPTY_RESPONSE', 'Claude вернул пустой ответ')
  return text
}

// ─── Класс ошибки ─────────────────────────────────────────────────────────────

export class AIError extends Error {
  constructor(
    public readonly code: 'API_KEY_MISSING' | 'API_ERROR' | 'EMPTY_RESPONSE' | 'PARSE_ERROR',
    message: string,
  ) {
    super(message)
    this.name = 'AIError'
  }
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────

/** Проверяет, настроен ли API-ключ. Используется в UI для показа/скрытия AI-кнопок. */
export function isAIAvailable(): boolean {
  try { return !!getApiKey() } catch { return false }
}

/**
 * Извлекает JSON из ответа Claude.
 * Claude иногда оборачивает JSON в ```json ... ``` — убираем маркеры.
 */
function extractJSON<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  try {
    return JSON.parse(cleaned) as T
  } catch {
    throw new AIError('PARSE_ERROR', `Не удалось разобрать ответ AI как JSON: ${cleaned.slice(0, 100)}`)
  }
}

// ─── 1. Анализ реквизитов ─────────────────────────────────────────────────────

/**
 * Анализирует полный набор реквизитов платежа и возвращает структурированный результат.
 * Используется при нажатии кнопки «Проверить реквизиты» перед генерацией XML.
 *
 * Модель: claude-sonnet (глубокий анализ, может занять 3–5 секунд)
 *
 * @example
 * const result = await analyzeRequisites(input)
 * if (!result.canProceed) showErrors(result.issues)
 */
export async function analyzeRequisites(input: Pacs008Input): Promise<AnalysisResult> {
  const prompt = `Проверь реквизиты платежа и верни JSON без пояснений.

РЕКВИЗИТЫ:
Плательщик: ${input.debtor.name} (${input.debtor.countryCode})
IBAN плательщика: ${input.debtorAccount.iban}
BIC банка плательщика: ${input.debtorAgent.bic}

Получатель: ${input.creditor.name} (${input.creditor.countryCode})
IBAN получателя: ${input.creditorAccount.iban}
BIC банка получателя: ${input.creditorAgent.bic}

Сумма: ${input.transfer.amount} ${input.transfer.currency}
Дата валютирования: ${input.transfer.valueDate}
Назначение: ${input.transfer.remittanceInfo}
Уровень сервиса: ${input.transfer.serviceLevel ?? 'SEPA'}

Верни строго в формате:
{
  "canProceed": true/false,
  "summary": "1-2 предложения об общей картине",
  "issues": [
    {
      "field": "имя поля camelCase",
      "fieldLabel": "читаемое название",
      "severity": "error|warning|info",
      "description": "что именно не так",
      "recommendation": "конкретный совет"
    }
  ],
  "operatorComment": "текст комментария для операциониста"
}`

  const raw = await callClaude([{ role: 'user', content: prompt }], 'smart', 600)
  return extractJSON<AnalysisResult>(raw)
}

// ─── 2. Объяснение ошибки ─────────────────────────────────────────────────────

/**
 * Объясняет конкретную ошибку валидации простым языком.
 * Вызывается по кнопке «Объяснить ошибку» рядом с полем.
 *
 * Модель: claude-haiku (быстро, < 2 секунд)
 *
 * @param fieldLabel    — название поля («IBAN получателя»)
 * @param value         — введённое значение
 * @param errorMessage  — техническое сообщение валидатора
 *
 * @example
 * const exp = await explainError('IBAN получателя', 'GB29NWBK...0', 'MOD-97 не совпадает')
 * showTooltip(exp.problem, exp.howToFix)
 */
export async function explainError(
  fieldLabel: string,
  value: string,
  errorMessage: string,
): Promise<ErrorExplanation> {
  const prompt = `Поле: ${fieldLabel}
Введено: ${value}
Ошибка: ${errorMessage}

Объясни простым языком. Верни JSON:
{
  "problem": "что именно не так (1 предложение)",
  "context": "почему это важно в банковском переводе (1 предложение)",
  "howToFix": "конкретный способ исправить (1-2 предложения)"
}`

  const raw = await callClaude([{ role: 'user', content: prompt }], 'fast', 200)
  return extractJSON<ErrorExplanation>(raw)
}

// ─── 3. Рекомендации по исправлению ──────────────────────────────────────────

/**
 * Предлагает конкретные варианты исправления для проблемного поля.
 * Возвращает список рекомендаций в порядке убывания приоритета.
 *
 * Модель: claude-haiku
 *
 * @param fieldLabel — название поля
 * @param value      — текущее значение
 * @param context    — дополнительный контекст (другие реквизиты платежа)
 *
 * @example
 * const tips = await suggestFix('BIC банка', 'DEUTDEFF123', { country: 'DE' })
 * showDropdown(tips)
 */
export async function suggestFix(
  fieldLabel: string,
  value: string,
  context: Record<string, string> = {},
): Promise<string[]> {
  const contextStr = Object.entries(context)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')

  const prompt = `Поле «${fieldLabel}» содержит некорректное значение: ${value}
Контекст платежа: ${contextStr || 'не указан'}

Дай 2-4 конкретных совета по исправлению. Верни JSON-массив строк:
["совет 1", "совет 2", "совет 3"]`

  const raw = await callClaude([{ role: 'user', content: prompt }], 'fast', 200)
  return extractJSON<string[]>(raw)
}

// ─── 4. Комментарий операциониста ────────────────────────────────────────────

/**
 * Генерирует краткий структурированный комментарий для передачи платежа
 * в CBS (Core Banking System). Включает флаги особого внимания.
 *
 * Модель: claude-haiku
 *
 * @example
 * const comment = await generateOperatorComment(input)
 * copyToClipboard(comment.text)
 */
export async function generateOperatorComment(input: Pacs008Input): Promise<OperatorComment> {
  const { debtor, creditor, transfer, debtorAgent, creditorAgent } = input

  const prompt = `Подготовь комментарий операциониста для платежа в CBS.

Платёж: ${transfer.amount} ${transfer.currency}
От: ${debtor.name} (${debtor.countryCode}) через ${debtorAgent.bic}
Кому: ${creditor.name} (${creditor.countryCode}) через ${creditorAgent.bic}
Дата расчёта: ${transfer.valueDate}
Назначение: ${transfer.remittanceInfo}

Верни JSON:
{
  "text": "готовый текст комментария для вставки в CBS (2-4 предложения)",
  "flags": ["флаг 1 если есть", "флаг 2 если есть"]
}

Флаги — только если реально есть основания: крупная сумма, нестандартная валюта,
короткий срок расчёта, трансграничный перевод вне SEPA и т.д.`

  const raw = await callClaude([{ role: 'user', content: prompt }], 'fast', 300)
  return extractJSON<OperatorComment>(raw)
}

// ─── 5. Диалог с контекстом (многоходовой) ───────────────────────────────────

/**
 * Состояние диалога с AI — хранится на стороне клиента.
 * Позволяет задавать уточняющие вопросы в рамках одного платежа.
 */
export interface ConversationState {
  messages: ClaudeMessage[]
  paymentContext: string
}

/**
 * Создаёт новый диалог с контекстом текущего платежа.
 * Первое сообщение — автоматическое описание реквизитов.
 */
export function createConversation(input: Pacs008Input): ConversationState {
  const paymentContext = `Контекст платежа:
- Плательщик: ${input.debtor.name} (${input.debtor.countryCode}), IBAN ${input.debtorAccount.iban}
- Получатель: ${input.creditor.name} (${input.creditor.countryCode}), IBAN ${input.creditorAccount.iban}
- Сумма: ${input.transfer.amount} ${input.transfer.currency}
- Дата: ${input.transfer.valueDate}
- Назначение: ${input.transfer.remittanceInfo}`

  return { messages: [], paymentContext }
}

/**
 * Отправляет вопрос в рамках существующего диалога.
 * История сообщений автоматически передаётся в каждый запрос.
 *
 * @example
 * const chat = createConversation(input)
 * const reply1 = await sendMessage(chat, 'Почему платёж может задержаться?')
 * const reply2 = await sendMessage(chat, 'Что значит код возврата AC01?')
 */
export async function sendMessage(
  state: ConversationState,
  userMessage: string,
): Promise<{ reply: string; updatedState: ConversationState }> {
  const fullMessage = state.messages.length === 0
    ? `${state.paymentContext}\n\nВопрос: ${userMessage}`
    : userMessage

  const updatedMessages: ClaudeMessage[] = [
    ...state.messages,
    { role: 'user', content: fullMessage },
  ]

  const reply = await callClaude(updatedMessages, 'fast', 400)

  return {
    reply,
    updatedState: {
      ...state,
      messages: [
        ...updatedMessages,
        { role: 'assistant', content: reply },
      ],
    },
  }
}

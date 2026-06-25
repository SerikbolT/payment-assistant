// ─── Форма платежа ───────────────────────────────────────────────────────────

export interface PaymentFormData {
  debtorName: string
  debtorIBAN: string
  debtorBIC: string
  debtorCountry: string
  creditorName: string
  creditorIBAN: string
  creditorBIC: string
  creditorCountry: string
  amount: string
  currency: string
  valueDate: string
  endToEndId: string
  remittanceInfo: string
  serviceLevel: 'SEPA' | 'SWIFT' | 'URGP'
}

// ─── Сгенерированный XML ─────────────────────────────────────────────────────

export interface GeneratedXml {
  xml: string
  messageId: string
  uetr: string
}

// ─── Оценка риска ────────────────────────────────────────────────────────────

/** Итоговый уровень риска операции */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

/** Тематическая категория фактора риска */
export type RiskCategory =
  | 'amount'      // сумма и финансовые пороги
  | 'date'        // дата валютирования
  | 'geography'   // страны и маршруты
  | 'format'      // качество реквизитов
  | 'compliance'  // соответствие стандартам
  | 'quality'     // полнота данных

/** Серьёзность конкретного фактора */
export type FactorSeverity = 'info' | 'warning' | 'error'

/** Один фактор, влияющий на риск или качество */
export interface RiskFactor {
  id: string
  category: RiskCategory
  severity: FactorSeverity
  title: string
  description: string
  /** Очки риска, которые вносит этот фактор (0–40) */
  riskPoints: number
}

/** Одно измерение качества реквизитов */
export interface QualityDimension {
  /** Название измерения */
  label: string
  /** Иконка для визуального различия */
  icon: string
  /** Итоговый балл 0–100 */
  score: number
  /** Пояснение к оценке */
  hint: string
}

/** Полный результат анализа платежа */
export interface RiskAssessment {
  /** Итоговый уровень риска */
  riskLevel: RiskLevel
  /** Числовой балл риска: 0 (минимум) → 100 (максимум) */
  riskScore: number
  /** Числовой балл качества реквизитов: 0 → 100 */
  qualityScore: number
  /** Все выявленные факторы, сортированные по severity */
  factors: RiskFactor[]
  /** Конкретные рекомендации для улучшения */
  recommendations: string[]
  /** Четыре измерения качества */
  dimensions: QualityDimension[]
  /** Краткое резюме для операциониста */
  summary: string
}

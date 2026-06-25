/**
 * Сервис оценки риска платёжной операции
 *
 * Не использует внешние API — вся логика реализована локально.
 * Результат мгновенный (< 1 мс), не блокирует UI.
 *
 * Методология:
 *   Балл риска    — сумма очков всех факторов, нормированная к 0–100
 *   Балл качества — 100 минус штрафы за слабые реквизиты, плюс бонусы
 *   Уровень риска — пороговое деление балла: low / medium / high / critical
 */

import type {
  PaymentFormData, RiskAssessment, RiskFactor,
  RiskLevel, QualityDimension,
} from '../types'

// ─── Справочники ──────────────────────────────────────────────────────────────

/** Страны SEPA (Single Euro Payments Area) по состоянию на 2024 г. */
const SEPA_COUNTRIES = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR',
  'DE','GR','HU','IS','IE','IT','LV','LI','LT','LU',
  'MT','MC','NL','NO','PL','PT','RO','SM','SK','SI',
  'ES','SE','CH','GB','VA','AD','GI','GG','IM','JE',
  'PM','SJ','BL','MF','AX',
])

/**
 * Страны с повышенным регуляторным вниманием.
 * Источник: FATF High-Risk Jurisdictions (упрощённый список для MVP).
 */
const HIGH_RISK_COUNTRIES = new Set([
  'KP','IR','MM','BY','RU','SY','VE','CU','SD','LY',
])

/** Валюты, официально используемые в зоне SEPA */
const SEPA_CURRENCIES = new Set(['EUR'])

/** Пороги суммы для анализа риска, EUR-эквивалент */
const AMOUNT_THRESHOLDS = {
  LARGE:    50_000,
  VERY_LARGE: 500_000,
  STRUCTURING: 9_900, // чуть ниже порога AML 10k
}

// ─── Вспомогательные функции ─────────────────────────────────────────────────

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr)
  const day = d.getUTCDay()
  return day === 0 || day === 6
}

function isPastDate(dateStr: string): boolean {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  return new Date(dateStr) < today
}

function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  return dateStr === today
}

function daysDiff(dateStr: string): number {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  return Math.round((new Date(dateStr).getTime() - today.getTime()) / 86_400_000)
}

/** Извлекает двухбуквенный код страны из IBAN */
function ibanCountry(iban: string): string {
  return iban.replace(/\s/g, '').slice(0, 2).toUpperCase()
}

/** Вычисляет итоговый уровень риска из числового балла */
function scoreToLevel(score: number): RiskLevel {
  if (score <= 20) return 'low'
  if (score <= 45) return 'medium'
  if (score <= 70) return 'high'
  return 'critical'
}

/** Количество слов (приблизительно) в строке */
function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

/** Содержит ли строка ссылку на документ (номер счёта, договора и т.п.) */
function hasDocumentRef(s: string): boolean {
  return /\b(inv|invoice|счёт|счет|ref|contract|договор|order|заказ|#|№)\b/i.test(s)
    || /\d{3,}/.test(s) // содержит хотя бы 3-значное число
}

// ─── Анализаторы факторов ─────────────────────────────────────────────────────

function checkAmount(data: PaymentFormData): RiskFactor[] {
  const factors: RiskFactor[] = []
  const amount = parseFloat(data.amount)
  if (isNaN(amount) || amount <= 0) return factors

  if (amount >= AMOUNT_THRESHOLDS.VERY_LARGE) {
    factors.push({
      id: 'amount_very_large',
      category: 'amount',
      severity: 'error',
      riskPoints: 35,
      title: 'Очень крупная сумма',
      description: `${amount.toLocaleString('ru')} ${data.currency} превышает ${AMOUNT_THRESHOLDS.VERY_LARGE.toLocaleString('ru')} — обязателен расширенный AML-контроль и согласование с комплаенсом.`,
    })
  } else if (amount >= AMOUNT_THRESHOLDS.LARGE) {
    factors.push({
      id: 'amount_large',
      category: 'amount',
      severity: 'warning',
      riskPoints: 15,
      title: 'Крупная сумма',
      description: `${amount.toLocaleString('ru')} ${data.currency} требует дополнительного мониторинга согласно внутренним лимитам AML.`,
    })
  }

  // Структурирование: сумма чуть ниже порога обязательного контроля
  if (amount >= AMOUNT_THRESHOLDS.STRUCTURING && amount < 10_000) {
    factors.push({
      id: 'amount_structuring',
      category: 'compliance',
      severity: 'warning',
      riskPoints: 20,
      title: 'Признак структурирования',
      description: `Сумма ${amount.toLocaleString('ru')} ${data.currency} незначительно ниже порога обязательного контроля 10 000. Возможно намеренное уклонение.`,
    })
  }

  return factors
}

function checkDate(data: PaymentFormData): RiskFactor[] {
  const factors: RiskFactor[] = []
  if (!data.valueDate) return factors

  if (isPastDate(data.valueDate)) {
    factors.push({
      id: 'date_past',
      category: 'date',
      severity: 'error',
      riskPoints: 30,
      title: 'Дата в прошлом',
      description: `Дата валютирования ${data.valueDate} уже прошла. Платёж будет отклонён процессинговой системой.`,
    })
    return factors // последующие проверки даты не нужны
  }

  if (isWeekend(data.valueDate)) {
    factors.push({
      id: 'date_weekend',
      category: 'date',
      severity: 'warning',
      riskPoints: 12,
      title: 'Расчёт в выходной день',
      description: `${data.valueDate} — суббота или воскресенье. Большинство систем расчётов (TARGET2, CHAPS) не работают в выходные. Фактический расчёт перенесётся на следующий рабочий день.`,
    })
  }

  if (isToday(data.valueDate)) {
    factors.push({
      id: 'date_today',
      category: 'date',
      severity: 'warning',
      riskPoints: 8,
      title: 'Расчёт сегодня',
      description: 'Платёж с валютированием сегодня может быть отклонён, если отправлен после cut-off банка (обычно 15:00–16:00 МСК).',
    })
  }

  const diff = daysDiff(data.valueDate)
  if (diff > 30) {
    factors.push({
      id: 'date_far_future',
      category: 'date',
      severity: 'info',
      riskPoints: 3,
      title: 'Отдалённая дата расчёта',
      description: `До даты валютирования ${diff} дн. Убедитесь, что это запланированный платёж, а не ошибка ввода.`,
    })
  }

  return factors
}

function checkGeography(data: PaymentFormData): RiskFactor[] {
  const factors: RiskFactor[] = []

  // Страны высокого регуляторного риска
  const riskyParty =
    HIGH_RISK_COUNTRIES.has(data.debtorCountry) ? `отправителя (${data.debtorCountry})` :
    HIGH_RISK_COUNTRIES.has(data.creditorCountry) ? `получателя (${data.creditorCountry})` :
    null

  if (riskyParty) {
    factors.push({
      id: 'geo_high_risk_country',
      category: 'geography',
      severity: 'error',
      riskPoints: 40,
      title: 'Юрисдикция повышенного риска',
      description: `Страна ${riskyParty} входит в список FATF High-Risk Jurisdictions. Операция требует обязательного согласования с подразделением комплаенса.`,
    })
  }

  // SEPA vs non-SEPA
  const debtorInSEPA    = SEPA_COUNTRIES.has(data.debtorCountry)
  const creditorInSEPA  = SEPA_COUNTRIES.has(data.creditorCountry)
  const isSEPARoute     = debtorInSEPA && creditorInSEPA
  const isSepaService   = data.serviceLevel === 'SEPA'

  if (isSepaService && !isSEPARoute) {
    const nonSepaParty = !debtorInSEPA ? `отправитель (${data.debtorCountry})` : `получатель (${data.creditorCountry})`
    factors.push({
      id: 'geo_sepa_mismatch',
      category: 'compliance',
      severity: 'warning',
      riskPoints: 18,
      title: 'Маршрут за пределами SEPA',
      description: `Уровень сервиса SEPA выбран, но ${nonSepaParty} находится вне зоны SEPA. Используйте SWIFT для международного перевода.`,
    })
  }

  if (!debtorInSEPA || !creditorInSEPA) {
    factors.push({
      id: 'geo_cross_region',
      category: 'geography',
      severity: 'info',
      riskPoints: 5,
      title: 'Трансграничный перевод',
      description: 'Перевод пересекает границы SEPA. Возможны дополнительные комиссии банков-корреспондентов и увеличенные сроки расчёта.',
    })
  }

  // Несоответствие страны IBAN и страны участника
  const debtorIBANCountry = ibanCountry(data.debtorIBAN)
  if (debtorIBANCountry && debtorIBANCountry !== data.debtorCountry) {
    factors.push({
      id: 'geo_debtor_iban_mismatch',
      category: 'format',
      severity: 'warning',
      riskPoints: 10,
      title: 'Страна IBAN отправителя не совпадает',
      description: `IBAN указывает на страну ${debtorIBANCountry}, а в карточке отправителя указана ${data.debtorCountry}. Проверьте правильность реквизитов.`,
    })
  }

  const creditorIBANCountry = ibanCountry(data.creditorIBAN)
  if (creditorIBANCountry && creditorIBANCountry !== data.creditorCountry) {
    factors.push({
      id: 'geo_creditor_iban_mismatch',
      category: 'format',
      severity: 'warning',
      riskPoints: 10,
      title: 'Страна IBAN получателя не совпадает',
      description: `IBAN указывает на страну ${creditorIBANCountry}, а в карточке получателя указана ${data.creditorCountry}. Проверьте правильность реквизитов.`,
    })
  }

  return factors
}

function checkFormat(data: PaymentFormData): RiskFactor[] {
  const factors: RiskFactor[] = []

  // BIC: 8 символов означает головной офис (нет кода филиала)
  const debtorBICClean = data.debtorBIC.replace(/\s/g, '')
  if (debtorBICClean.length === 8) {
    factors.push({
      id: 'format_debtor_bic_short',
      category: 'format',
      severity: 'info',
      riskPoints: 0,
      title: 'BIC отправителя без кода филиала',
      description: 'BIC из 8 символов адресует головной офис банка (неявный суффикс XXX). Для точной маршрутизации рекомендуется уточнить 11-символьный BIC у клиента.',
    })
  }

  const creditorBICClean = data.creditorBIC.replace(/\s/g, '')
  if (creditorBICClean.length === 8) {
    factors.push({
      id: 'format_creditor_bic_short',
      category: 'format',
      severity: 'info',
      riskPoints: 0,
      title: 'BIC получателя без кода филиала',
      description: 'BIC из 8 символов адресует головной офис банка. Рекомендуется использовать 11-символьный BIC для точной маршрутизации.',
    })
  }

  // Валюта vs сервис
  if (data.serviceLevel === 'SEPA' && data.currency !== 'EUR') {
    factors.push({
      id: 'format_sepa_currency',
      category: 'compliance',
      severity: 'warning',
      riskPoints: 15,
      title: 'Валюта не соответствует SEPA',
      description: `SEPA Credit Transfer поддерживает только EUR. Выбранная валюта ${data.currency} несовместима с этим уровнем сервиса.`,
    })
  }

  return factors
}

function checkQualitySignals(data: PaymentFormData): RiskFactor[] {
  const factors: RiskFactor[] = []

  // Назначение платежа
  const remLen = data.remittanceInfo?.trim().length ?? 0
  if (remLen < 5) {
    factors.push({
      id: 'quality_remittance_too_short',
      category: 'quality',
      severity: 'warning',
      riskPoints: 8,
      title: 'Очень короткое назначение платежа',
      description: 'Назначение из менее чем 5 символов не несёт полезной информации. Банк получателя или регулятор могут запросить дополнительные пояснения.',
    })
  } else if (!hasDocumentRef(data.remittanceInfo)) {
    factors.push({
      id: 'quality_no_doc_ref',
      category: 'quality',
      severity: 'info',
      riskPoints: 2,
      title: 'Нет ссылки на документ',
      description: 'В назначении не обнаружен номер счёта-фактуры, договора или иного документа. Добавление ссылки ускорит сверку у получателя.',
    })
  }

  // End-to-End ID
  const e2eClean = data.endToEndId?.trim() ?? ''
  if (e2eClean.length < 6) {
    factors.push({
      id: 'quality_e2e_short',
      category: 'quality',
      severity: 'info',
      riskPoints: 1,
      title: 'Короткий End-to-End ID',
      description: 'Слишком короткий E2E ID затрудняет идентификацию транзакции в системах мониторинга.',
    })
  }

  return factors
}

// ─── Расчёт измерений качества ───────────────────────────────────────────────

function calcDimensions(data: PaymentFormData): QualityDimension[] {
  // 1. Идентификация (реквизиты участников)
  let idScore = 100
  const debtorIBANLen = data.debtorIBAN.replace(/\s/g, '').length
  const creditorIBANLen = data.creditorIBAN.replace(/\s/g, '').length
  if (debtorIBANLen < 15)   idScore -= 30
  if (creditorIBANLen < 15) idScore -= 30
  if (data.debtorBIC.replace(/\s/g, '').length < 8)   idScore -= 20
  if (data.creditorBIC.replace(/\s/g, '').length < 8) idScore -= 20
  // Бонус за 11-символьный BIC
  if (data.debtorBIC.replace(/\s/g, '').length === 11)   idScore = Math.min(100, idScore + 5)
  if (data.creditorBIC.replace(/\s/g, '').length === 11) idScore = Math.min(100, idScore + 5)
  const idHint = idScore >= 90
    ? 'Реквизиты участников заполнены корректно'
    : idScore >= 60
    ? 'Проверьте длину IBAN и BIC'
    : 'Реквизиты неполные — невозможна маршрутизация'

  // 2. Финансовые параметры
  const amount = parseFloat(data.amount)
  let finScore = 100
  if (isNaN(amount) || amount <= 0) {
    finScore = 0
  } else {
    if (data.serviceLevel === 'SEPA' && data.currency !== 'EUR') finScore -= 40
    if (amount >= AMOUNT_THRESHOLDS.VERY_LARGE)  finScore -= 20
    if (amount >= AMOUNT_THRESHOLDS.STRUCTURING && amount < 10_000) finScore -= 25
  }
  const finHint = finScore >= 90
    ? 'Сумма и валюта соответствуют маршруту'
    : finScore >= 60
    ? 'Есть несоответствие валюты или уровня сервиса'
    : 'Финансовые параметры требуют проверки'

  // 3. Корректность сроков
  let timeScore = 100
  if (!data.valueDate) {
    timeScore = 0
  } else {
    if (isPastDate(data.valueDate))              timeScore -= 60
    else if (isWeekend(data.valueDate))          timeScore -= 30
    else if (isToday(data.valueDate))            timeScore -= 15
    if (daysDiff(data.valueDate) > 30)           timeScore -= 10
  }
  timeScore = Math.max(0, timeScore)
  const timeHint = timeScore >= 90
    ? 'Дата расчёта корректна'
    : timeScore >= 50
    ? 'Дата требует проверки (выходной или cut-off)'
    : 'Некорректная дата — платёж будет отклонён'

  // 4. Качество назначения
  const rem = data.remittanceInfo?.trim() ?? ''
  let remScore = 0
  if (rem.length > 0)  remScore += 20
  if (rem.length > 10) remScore += 20
  if (rem.length > 25) remScore += 20
  if (hasDocumentRef(rem)) remScore += 25
  if (wordCount(rem) >= 3) remScore += 15
  remScore = Math.min(100, remScore)
  const remHint = remScore >= 80
    ? 'Содержательное назначение с документальной ссылкой'
    : remScore >= 50
    ? 'Добавьте номер счёта-фактуры или договора'
    : 'Назначение слишком краткое или отсутствует'

  return [
    { label: 'Идентификация', icon: '🪪', score: Math.max(0, idScore),  hint: idHint  },
    { label: 'Финансы',       icon: '💰', score: Math.max(0, finScore), hint: finHint },
    { label: 'Сроки',         icon: '📅', score: timeScore,              hint: timeHint },
    { label: 'Назначение',    icon: '📋', score: remScore,               hint: remHint  },
  ]
}

// ─── Генерация рекомендаций ───────────────────────────────────────────────────

function buildRecommendations(factors: RiskFactor[], dimensions: QualityDimension[]): string[] {
  const recs: string[] = []

  if (factors.some(f => f.id === 'date_past')) {
    recs.push('Исправьте дату валютирования — укажите ближайший рабочий день.')
  }
  if (factors.some(f => f.id === 'date_weekend')) {
    recs.push('Перенесите дату расчёта на ближайший рабочий день (пн–пт).')
  }
  if (factors.some(f => f.id === 'geo_sepa_mismatch')) {
    recs.push('Измените уровень сервиса с SEPA на SWIFT для данного маршрута.')
  }
  if (factors.some(f => f.id === 'format_sepa_currency')) {
    recs.push(`Для валюты ${factors.find(f => f.id === 'format_sepa_currency') ? '' : ''}используйте уровень SWIFT или измените валюту на EUR.`)
  }
  if (factors.some(f => f.id === 'geo_high_risk_country')) {
    recs.push('Получите письменное согласование у офицера комплаенса перед отправкой.')
  }
  if (factors.some(f => f.id === 'amount_structuring')) {
    recs.push('Задокументируйте экономическую цель операции и сохраните обоснование в досье клиента.')
  }
  if (factors.some(f => f.id === 'quality_no_doc_ref' || f.id === 'quality_remittance_too_short')) {
    recs.push('Добавьте в назначение платежа номер счёта-фактуры или договора (например: Invoice INV-2026-042).')
  }
  if (factors.some(f => f.id.includes('iban_mismatch'))) {
    recs.push('Сверьте страну в реквизитах с кодом страны в IBAN — они должны совпадать.')
  }
  if (factors.some(f => f.id.includes('bic_short'))) {
    recs.push('Запросите у клиента 11-символьный BIC для точной маршрутизации через банк-корреспондент.')
  }

  const weakDim = dimensions.filter(d => d.score < 60)
  if (weakDim.length > 0 && recs.length < 4) {
    recs.push(`Уделите особое внимание: ${weakDim.map(d => d.label.toLowerCase()).join(', ')}.`)
  }

  return recs.length ? recs : ['Реквизиты платежа не требуют дополнительных действий.']
}

// ─── Главная функция ─────────────────────────────────────────────────────────

/**
 * Оценивает риск и качество платёжного поручения.
 *
 * @param data — данные формы (могут быть частично заполнены)
 * @returns    RiskAssessment — полный результат анализа
 *
 * @example
 * const assessment = assessRisk(formData)
 * console.log(assessment.riskLevel)    // 'medium'
 * console.log(assessment.qualityScore) // 74
 */
export function assessRisk(data: PaymentFormData): RiskAssessment {
  // Собираем все факторы
  const factors: RiskFactor[] = [
    ...checkAmount(data),
    ...checkDate(data),
    ...checkGeography(data),
    ...checkFormat(data),
    ...checkQualitySignals(data),
  ]

  // Сортировка: error → warning → info
  const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 }
  factors.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  // Балл риска: сумма очков, нормированная к 100
  const rawRiskScore = factors.reduce((sum, f) => sum + f.riskPoints, 0)
  const riskScore = Math.min(100, rawRiskScore)
  const riskLevel: RiskLevel = scoreToLevel(riskScore)

  // Балл качества на основе измерений
  const dimensions = calcDimensions(data)
  const qualityScore = Math.round(
    dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length
  )

  // Рекомендации
  const recommendations = buildRecommendations(factors, dimensions)

  // Краткое резюме
  const errorCount   = factors.filter(f => f.severity === 'error').length
  const warningCount = factors.filter(f => f.severity === 'warning').length

  const summary = errorCount > 0
    ? `Обнаружено ${errorCount} критических проблем. Платёж не может быть отправлен без исправлений.`
    : warningCount > 0
    ? `Платёж может быть отправлен, но требует внимания: ${warningCount} предупреждений.`
    : riskScore === 0
    ? 'Реквизиты в порядке. Платёж готов к отправке.'
    : 'Платёж допустим к отправке. Учтите информационные замечания.'

  return { riskLevel, riskScore, qualityScore, factors, recommendations, dimensions, summary }
}

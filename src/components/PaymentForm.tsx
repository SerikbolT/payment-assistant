import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { friendlyFormatIBAN } from 'ibantools'
import type { PaymentFormData } from '../types'
import { validateIBAN, validateBIC, validateAmount } from '../lib/validation'
import { hasApiKey, explainError } from '../lib/claudeApi'
import { useState } from 'react'

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CNY', 'RUB', 'KZT', 'AED', 'TRY']

const COUNTRIES = [
  { code: 'DE', name: 'Германия' },
  { code: 'GB', name: 'Великобритания' },
  { code: 'FR', name: 'Франция' },
  { code: 'NL', name: 'Нидерланды' },
  { code: 'IT', name: 'Италия' },
  { code: 'ES', name: 'Испания' },
  { code: 'PL', name: 'Польша' },
  { code: 'CH', name: 'Швейцария' },
  { code: 'AT', name: 'Австрия' },
  { code: 'BE', name: 'Бельгия' },
  { code: 'SE', name: 'Швеция' },
  { code: 'NO', name: 'Норвегия' },
  { code: 'DK', name: 'Дания' },
  { code: 'FI', name: 'Финляндия' },
  { code: 'LU', name: 'Люксембург' },
  { code: 'PT', name: 'Португалия' },
  { code: 'RU', name: 'Россия' },
  { code: 'KZ', name: 'Казахстан' },
  { code: 'US', name: 'США' },
  { code: 'CN', name: 'Китай' },
  { code: 'AE', name: 'ОАЭ' },
  { code: 'TR', name: 'Турция' },
]

// Поля, по которым считается прогресс заполнения
const REQUIRED_FIELDS: (keyof PaymentFormData)[] = [
  'debtorName', 'debtorIBAN', 'debtorBIC',
  'creditorName', 'creditorIBAN', 'creditorBIC',
  'amount', 'valueDate', 'endToEndId', 'remittanceInfo',
]

type ExplainState = { loading: boolean; text: string | null; error: string | null }

interface Props {
  onGenerate: (data: PaymentFormData) => void
}

export function PaymentForm({ onGenerate }: Props) {
  const formId = useId()

  const {
    register,
    handleSubmit,
    formState: { errors, touchedFields },
    setValue,
    getValues,
    watch,
  } = useForm<PaymentFormData>({
    mode: 'onBlur',
    defaultValues: {
      currency: 'EUR',
      serviceLevel: 'SEPA',
      debtorCountry: 'DE',
      creditorCountry: 'GB',
      valueDate: new Date().toISOString().slice(0, 10),
      endToEndId: `E2E-${Date.now().toString(36).toUpperCase()}`,
    },
  })

  const [explains, setExplains] = useState<Record<string, ExplainState>>({})

  // watch нужен для счётчиков символов и прогресса
  const watchedValues = watch()

  // ── Прогресс заполнения ──────────────────────────────────────────────────

  const validCount = REQUIRED_FIELDS.filter(f => {
    const touched = !!touchedFields[f]
    const hasError = !!errors[f]
    const hasValue = String(watchedValues[f] ?? '').trim().length > 0
    return hasValue && (!touched || !hasError)
  }).length

  const progressPct = Math.round((validCount / REQUIRED_FIELDS.length) * 100)
  const isComplete = validCount === REQUIRED_FIELDS.length && Object.keys(errors).length === 0

  // ── Статус поля ──────────────────────────────────────────────────────────

  const fieldStatus = (field: keyof PaymentFormData): 'idle' | 'valid' | 'error' => {
    if (!touchedFields[field]) return 'idle'
    return errors[field] ? 'error' : 'valid'
  }

  const inputClass = (field: keyof PaymentFormData, extra = '') => {
    const s = fieldStatus(field)
    return ['input', s !== 'idle' ? s : '', extra].filter(Boolean).join(' ')
  }

  const FieldIcon = ({ field }: { field: keyof PaymentFormData }) => {
    const s = fieldStatus(field)
    if (s === 'valid')  return <span className="field-icon">✓</span>
    if (s === 'error')  return <span className="field-icon">✗</span>
    return null
  }

  // ── AI-объяснение ошибки ─────────────────────────────────────────────────

  const explain = async (field: string, label: string, errorMsg: string) => {
    const value = String(getValues(field as keyof PaymentFormData))
    setExplains(prev => ({ ...prev, [field]: { loading: true, text: null, error: null } }))
    try {
      const text = await explainError(label, value, errorMsg)
      setExplains(prev => ({ ...prev, [field]: { loading: false, text, error: null } }))
    } catch {
      setExplains(prev => ({
        ...prev,
        [field]: { loading: false, text: null, error: 'Не удалось получить объяснение от AI' },
      }))
    }
  }

  // ── Форматирование полей ─────────────────────────────────────────────────

  const formatIBAN = (field: 'debtorIBAN' | 'creditorIBAN') => {
    const val = getValues(field).replace(/\s/g, '').toUpperCase()
    const formatted = friendlyFormatIBAN(val) ?? val
    setValue(field, formatted, { shouldValidate: true })
  }

  const normalizeBIC = (field: 'debtorBIC' | 'creditorBIC') => {
    const val = getValues(field).trim().toUpperCase()
    setValue(field, val, { shouldValidate: true })
  }

  // ── Скролл к полю из error summary ──────────────────────────────────────

  const scrollToField = (field: string) => {
    const el = document.getElementById(`${formId}-${field}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.focus()
  }

  // ── Счётчик символов ─────────────────────────────────────────────────────

  const CharCounter = ({ field, max }: { field: keyof PaymentFormData; max: number }) => {
    const len = String(watchedValues[field] ?? '').length
    const cls = len >= max ? 'danger' : len >= max * 0.85 ? 'warn' : ''
    return <span className={`char-counter ${cls}`}>{len}/{max}</span>
  }

  // ── Сводка ошибок ────────────────────────────────────────────────────────

  const errorEntries = Object.entries(errors)
  const FIELD_LABELS: Record<string, string> = {
    debtorName: 'Наименование отправителя', debtorIBAN: 'IBAN отправителя',
    debtorBIC: 'BIC отправителя', creditorName: 'Наименование получателя',
    creditorIBAN: 'IBAN получателя', creditorBIC: 'BIC получателя',
    amount: 'Сумма', valueDate: 'Дата валютирования',
    endToEndId: 'End-to-End ID', remittanceInfo: 'Назначение платежа',
  }

  // ── Блок ошибки поля ─────────────────────────────────────────────────────

  const FieldError = ({ field, label }: { field: string; label: string }) => {
    const error = errors[field as keyof PaymentFormData]
    if (!error) return null
    const msg = error.message as string
    const exp = explains[field]
    return (
      <div className="field-error">
        <span className="error-msg">
          <span className="error-msg-icon">⚠</span>
          {msg}
        </span>
        {hasApiKey() && (
          <button
            type="button"
            className="explain-btn"
            onClick={() => explain(field, label, msg)}
            disabled={exp?.loading}
          >
            {exp?.loading
              ? <><span className="explain-spinner" /> Думаю...</>
              : <>✦ Объяснить ошибку</>}
          </button>
        )}
        {exp?.text  && <div className="explain-bubble">{exp.text}</div>}
        {exp?.error && <div className="explain-fail">{exp.error}</div>}
      </div>
    )
  }

  // ── Section status (иконка раздела) ──────────────────────────────────────

  const SectionStatus = ({ fields }: { fields: (keyof PaymentFormData)[] }) => {
    const anyError = fields.some(f => errors[f])
    const allValid = fields.every(f => !errors[f] && touchedFields[f])
    if (anyError) return <span className="section-status errors">✗ ошибка</span>
    if (allValid) return <span className="section-status ok">✓ заполнен</span>
    return null
  }

  return (
    <form onSubmit={handleSubmit(onGenerate)} noValidate>

      {/* Прогресс */}
      <div className="form-progress">
        <div className="form-progress-header">
          <span className="form-progress-label">Прогресс заполнения</span>
          <span className="form-progress-count">{validCount} / {REQUIRED_FIELDS.length} полей</span>
        </div>
        <div className="progress-track">
          <div
            className={`progress-fill${isComplete ? ' complete' : ''}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Сводка ошибок */}
      {errorEntries.length > 0 && (
        <div className="error-summary">
          <div className="error-summary-title">
            <span>⚠</span> Найдено ошибок: {errorEntries.length}
          </div>
          <ul className="error-summary-list">
            {errorEntries.map(([f, e]) => (
              <li
                key={f}
                className="error-summary-item"
                onClick={() => scrollToField(f)}
                title="Перейти к полю"
              >
                <strong>{FIELD_LABELS[f] ?? f}:</strong> {e?.message as string}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Отправитель ── */}
      <section className="form-section">
        <div className="section-header">
          <h3 className="section-title">Отправитель</h3>
          <SectionStatus fields={['debtorName', 'debtorIBAN', 'debtorBIC']} />
        </div>

        <div className="form-group">
          <div className="field-label-row">
            <label htmlFor={`${formId}-debtorName`}>Наименование *</label>
          </div>
          <div className="input-wrap">
            <input
              id={`${formId}-debtorName`}
              {...register('debtorName', { required: 'Укажите наименование отправителя' })}
              placeholder="ООО Альфа Трейдинг"
              className={inputClass('debtorName')}
            />
            <FieldIcon field="debtorName" />
          </div>
          <FieldError field="debtorName" label="Наименование отправителя" />
        </div>

        <div className="form-group">
          <div className="field-label-row">
            <label htmlFor={`${formId}-debtorIBAN`}>IBAN *</label>
          </div>
          <div className="input-wrap">
            <input
              id={`${formId}-debtorIBAN`}
              {...register('debtorIBAN', { required: 'Укажите IBAN отправителя', validate: validateIBAN })}
              placeholder="DE89 3704 0044 0532 0130 00"
              className={inputClass('debtorIBAN', 'mono')}
              onBlur={() => formatIBAN('debtorIBAN')}
            />
            <FieldIcon field="debtorIBAN" />
          </div>
          <FieldError field="debtorIBAN" label="IBAN отправителя" />
        </div>

        <div className="form-row">
          <div className="form-group">
            <div className="field-label-row">
              <label htmlFor={`${formId}-debtorBIC`}>BIC / SWIFT *</label>
            </div>
            <div className="input-wrap">
              <input
                id={`${formId}-debtorBIC`}
                {...register('debtorBIC', { required: 'Укажите BIC отправителя', validate: validateBIC })}
                placeholder="DEUTDEDB"
                className={inputClass('debtorBIC', 'mono upper')}
                onBlur={() => normalizeBIC('debtorBIC')}
              />
              <FieldIcon field="debtorBIC" />
            </div>
            <FieldError field="debtorBIC" label="BIC отправителя" />
          </div>
          <div className="form-group">
            <div className="field-label-row">
              <label>Страна *</label>
            </div>
            <div className="input-wrap">
              <select {...register('debtorCountry')} className="input">
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* ── Получатель ── */}
      <section className="form-section">
        <div className="section-header">
          <h3 className="section-title">Получатель</h3>
          <SectionStatus fields={['creditorName', 'creditorIBAN', 'creditorBIC']} />
        </div>

        <div className="form-group">
          <div className="field-label-row">
            <label htmlFor={`${formId}-creditorName`}>Наименование *</label>
          </div>
          <div className="input-wrap">
            <input
              id={`${formId}-creditorName`}
              {...register('creditorName', { required: 'Укажите наименование получателя' })}
              placeholder="British Supplies Ltd"
              className={inputClass('creditorName')}
            />
            <FieldIcon field="creditorName" />
          </div>
          <FieldError field="creditorName" label="Наименование получателя" />
        </div>

        <div className="form-group">
          <div className="field-label-row">
            <label htmlFor={`${formId}-creditorIBAN`}>IBAN *</label>
          </div>
          <div className="input-wrap">
            <input
              id={`${formId}-creditorIBAN`}
              {...register('creditorIBAN', { required: 'Укажите IBAN получателя', validate: validateIBAN })}
              placeholder="GB29 NWBK 6016 1331 9268 19"
              className={inputClass('creditorIBAN', 'mono')}
              onBlur={() => formatIBAN('creditorIBAN')}
            />
            <FieldIcon field="creditorIBAN" />
          </div>
          <FieldError field="creditorIBAN" label="IBAN получателя" />
        </div>

        <div className="form-row">
          <div className="form-group">
            <div className="field-label-row">
              <label htmlFor={`${formId}-creditorBIC`}>BIC / SWIFT *</label>
            </div>
            <div className="input-wrap">
              <input
                id={`${formId}-creditorBIC`}
                {...register('creditorBIC', { required: 'Укажите BIC получателя', validate: validateBIC })}
                placeholder="NWBKGB2L"
                className={inputClass('creditorBIC', 'mono upper')}
                onBlur={() => normalizeBIC('creditorBIC')}
              />
              <FieldIcon field="creditorBIC" />
            </div>
            <FieldError field="creditorBIC" label="BIC получателя" />
          </div>
          <div className="form-group">
            <div className="field-label-row">
              <label>Страна *</label>
            </div>
            <div className="input-wrap">
              <select {...register('creditorCountry')} className="input">
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* ── Сумма ── */}
      <section className="form-section">
        <div className="section-header">
          <h3 className="section-title">Сумма и валюта</h3>
          <SectionStatus fields={['amount']} />
        </div>
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <div className="field-label-row">
              <label htmlFor={`${formId}-amount`}>Сумма *</label>
            </div>
            <div className="input-wrap">
              <input
                id={`${formId}-amount`}
                {...register('amount', { required: 'Укажите сумму', validate: validateAmount })}
                type="number"
                step="0.01"
                min="0.01"
                placeholder="1500.00"
                className={inputClass('amount')}
              />
              <FieldIcon field="amount" />
            </div>
            <FieldError field="amount" label="Сумма перевода" />
          </div>
          <div className="form-group">
            <div className="field-label-row">
              <label>Валюта *</label>
            </div>
            <div className="input-wrap">
              <select {...register('currency')} className="input">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* ── Детали ── */}
      <section className="form-section">
        <div className="section-header">
          <h3 className="section-title">Детали платежа</h3>
          <SectionStatus fields={['valueDate', 'endToEndId', 'remittanceInfo']} />
        </div>

        <div className="form-group">
          <div className="field-label-row">
            <label htmlFor={`${formId}-valueDate`}>Дата валютирования *</label>
          </div>
          <div className="input-wrap">
            <input
              id={`${formId}-valueDate`}
              {...register('valueDate', { required: 'Укажите дату валютирования' })}
              type="date"
              className={inputClass('valueDate')}
            />
            <FieldIcon field="valueDate" />
          </div>
          <FieldError field="valueDate" label="Дата валютирования" />
        </div>

        <div className="form-group">
          <div className="field-label-row">
            <label htmlFor={`${formId}-endToEndId`}>End-to-End ID *</label>
            <CharCounter field="endToEndId" max={35} />
          </div>
          <div className="input-wrap">
            <input
              id={`${formId}-endToEndId`}
              {...register('endToEndId', {
                required: 'Укажите End-to-End ID',
                maxLength: { value: 35, message: 'Не более 35 символов (ISO 20022)' },
              })}
              placeholder="E2E-2026-001"
              className={inputClass('endToEndId', 'mono')}
            />
            <FieldIcon field="endToEndId" />
          </div>
          <FieldError field="endToEndId" label="End-to-End ID" />
        </div>

        <div className="form-group">
          <div className="field-label-row">
            <label htmlFor={`${formId}-remittanceInfo`}>Назначение платежа *</label>
            <CharCounter field="remittanceInfo" max={140} />
          </div>
          <div className="input-wrap">
            <input
              id={`${formId}-remittanceInfo`}
              {...register('remittanceInfo', {
                required: 'Укажите назначение платежа',
                maxLength: { value: 140, message: 'Не более 140 символов (ISO 20022)' },
              })}
              placeholder="Invoice INV-2026-042 payment"
              className={inputClass('remittanceInfo')}
            />
            <FieldIcon field="remittanceInfo" />
          </div>
          <FieldError field="remittanceInfo" label="Назначение платежа" />
        </div>
      </section>

      {/* ── Уровень сервиса ── */}
      <section className="form-section">
        <div className="section-header">
          <h3 className="section-title">Уровень сервиса</h3>
        </div>
        <div className="service-levels">
          {(['SEPA', 'SWIFT', 'URGP'] as const).map(level => (
            <label key={level} className="radio-card">
              <input type="radio" value={level} {...register('serviceLevel')} />
              <div className="radio-inner">
                <strong>{level}</strong>
                <small>
                  {level === 'SEPA' ? 'Credit Transfer'
                    : level === 'SWIFT' ? 'SWIFT Payment'
                    : 'Urgent Payment'}
                </small>
              </div>
            </label>
          ))}
        </div>
      </section>

      <button
        type="submit"
        className="generate-btn"
        disabled={errorEntries.length > 0}
        title={errorEntries.length > 0 ? 'Исправьте ошибки перед генерацией' : ''}
      >
        {errorEntries.length > 0
          ? `Исправьте ${errorEntries.length} ${errorEntries.length === 1 ? 'ошибку' : 'ошибки'}`
          : 'Сгенерировать XML →'}
      </button>
    </form>
  )
}

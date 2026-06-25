// ─── Базовые типы ────────────────────────────────────────────────────────────

/** IBAN по стандарту ISO 13616: от 15 до 34 символов, только буквы и цифры */
type IBAN = string

/** BIC/SWIFT по стандарту ISO 9362: 8 или 11 символов */
type BIC = string

/** Код валюты по стандарту ISO 4217, три заглавные буквы */
type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'CHF' | 'JPY' | 'CNY' | 'RUB' | 'KZT' | string

/** Дата в формате YYYY-MM-DD */
type ISODate = string

/** Положительная денежная сумма */
type Amount = number

// ─── Интерфейсы ──────────────────────────────────────────────────────────────

/**
 * Плательщик (Debtor) — сторона, со счёта которой списывается сумма.
 * В pacs.008 соответствует блоку <Dbtr> + <DbtrAcct> + <DbtrAgt>.
 */
export interface Debtor {
  /** Полное наименование организации или ФИО физического лица */
  name: string
  /** Международный номер банковского счёта (ISO 13616) */
  iban: IBAN
  /** Идентификатор банка плательщика (ISO 9362) */
  bic: BIC
}

/**
 * Получатель (Creditor) — сторона, на счёт которой зачисляется сумма.
 * В pacs.008 соответствует блоку <Cdtr> + <CdtrAcct> + <CdtrAgt>.
 */
export interface Creditor {
  /** Полное наименование организации или ФИО физического лица */
  name: string
  /** Международный номер банковского счёта (ISO 13616) */
  iban: IBAN
  /** Идентификатор банка получателя (ISO 9362) */
  bic: BIC
}

/**
 * Платёж — финансовая инструкция о переводе средств.
 * В pacs.008 соответствует блоку <CdtTrfTxInf>.
 */
export interface Payment {
  /** Сумма перевода — положительное число с не более чем двумя знаками после запятой */
  amount: Amount
  /** Код валюты по ISO 4217 */
  currency: CurrencyCode
  /** Назначение платежа — не более 140 символов (ограничение ISO 20022) */
  remittanceInfo: string
  /** Дата, на которую должно быть произведено расчётное списание (YYYY-MM-DD) */
  valueDate: ISODate
}

/**
 * Полное платёжное поручение — объединяет плательщика, получателя и детали платежа.
 * Является входными данными для генерации сообщения pacs.008.001.08.
 */
export interface PaymentOrder {
  debtor: Debtor
  creditor: Creditor
  payment: Payment
}

// ─── Примеры объектов ────────────────────────────────────────────────────────

/** Пример: немецкая компания-плательщик */
export const exampleDebtor: Debtor = {
  name: 'ООО Альфа Трейдинг',
  iban: 'DE89370400440532013000',
  bic: 'DEUTDEDB',
}

/** Пример: британская компания-получатель */
export const exampleCreditor: Creditor = {
  name: 'British Supplies Ltd',
  iban: 'GB29NWBK60161331926819',
  bic: 'NWBKGB2L',
}

/** Пример: SEPA-платёж на сумму €1 500 */
export const examplePayment: Payment = {
  amount: 1500.00,
  currency: 'EUR',
  remittanceInfo: 'Invoice INV-2026-042 payment',
  valueDate: '2026-07-01',
}

/** Пример: полное платёжное поручение */
export const examplePaymentOrder: PaymentOrder = {
  debtor: exampleDebtor,
  creditor: exampleCreditor,
  payment: examplePayment,
}

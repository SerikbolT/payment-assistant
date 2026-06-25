/**
 * Unit-тесты для ibanValidator.ts
 * Фреймворк: Vitest (встроен в Vite-экосистему, конфигурация не требуется)
 * Запуск: npx vitest run
 */

import { describe, it, expect } from 'vitest'
import { validateIBAN, isValidIBAN } from './ibanValidator'

// ─── validateIBAN — успешные кейсы ──────────────────────────────────────────

describe('validateIBAN — валидные IBAN', () => {
  it('DE: электронный формат', () => {
    const result = validateIBAN('DE89370400440532013000')
    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.iban).toBe('DE89370400440532013000')
    expect(result.ibanFormatted).toBe('DE89 3704 0044 0532 0130 00')
    expect(result.countryCode).toBe('DE')
    expect(result.checkDigits).toBe('89')
    expect(result.bban).toBe('370400440532013000')
  })

  it('DE: печатный формат с пробелами', () => {
    const result = validateIBAN('DE89 3704 0044 0532 0130 00')
    expect(result.valid).toBe(true)
  })

  it('DE: нижний регистр', () => {
    const result = validateIBAN('de89370400440532013000')
    expect(result.valid).toBe(true)
  })

  it('GB: Великобритания', () => {
    const result = validateIBAN('GB29NWBK60161331926819')
    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.countryCode).toBe('GB')
    expect(result.checkDigits).toBe('29')
  })

  it('FR: Франция', () => {
    expect(validateIBAN('FR7614508059142965316979527').valid).toBe(true)
  })

  it('NL: Нидерланды', () => {
    expect(validateIBAN('NL91ABNA0417164300').valid).toBe(true)
  })

  it('CH: Швейцария', () => {
    expect(validateIBAN('CH9300762011623852957').valid).toBe(true)
  })

  it('PL: Польша', () => {
    expect(validateIBAN('PL61109010140000071219812874').valid).toBe(true)
  })

  it('ES: Испания', () => {
    expect(validateIBAN('ES9121000418450200051332').valid).toBe(true)
  })

  it('IT: Италия', () => {
    expect(validateIBAN('IT60X0542811101000000123456').valid).toBe(true)
  })

  it('NO: Норвегия (самый короткий IBAN — 15 символов)', () => {
    expect(validateIBAN('NO9386011117947').valid).toBe(true)
  })

  it('MT: Мальта (самый длинный IBAN — 31 символ)', () => {
    expect(validateIBAN('MT84MALT011000012345MTLCAST001S').valid).toBe(true)
  })

  it('KZ: Казахстан', () => {
    expect(validateIBAN('KZ86125KZT5004100100').valid).toBe(true)
  })
})

// ─── validateIBAN — ошибка EMPTY ────────────────────────────────────────────

describe('validateIBAN — EMPTY', () => {
  it('пустая строка', () => {
    const result = validateIBAN('')
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.errorCode).toBe('EMPTY')
  })

  it('строка только из пробелов', () => {
    const result = validateIBAN('   ')
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.errorCode).toBe('EMPTY')
  })
})

// ─── validateIBAN — ошибка INVALID_CHARS ────────────────────────────────────

describe('validateIBAN — INVALID_CHARS', () => {
  it('спецсимволы', () => {
    const result = validateIBAN('DE89-3704-0044')
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.errorCode).toBe('INVALID_CHARS')
  })

  it('кириллица', () => {
    const result = validateIBAN('ДЕ89370400440532013000')
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.errorCode).toBe('INVALID_CHARS')
  })
})

// ─── validateIBAN — ошибка TOO_SHORT / TOO_LONG ─────────────────────────────

describe('validateIBAN — TOO_SHORT / TOO_LONG', () => {
  it('слишком короткий (меньше 15)', () => {
    const result = validateIBAN('DE8937040044')
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.errorCode).toBe('TOO_SHORT')
  })

  it('слишком длинный (больше 32)', () => {
    const result = validateIBAN('DE8937040044053201300099999999999')
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.errorCode).toBe('TOO_LONG')
  })
})

// ─── validateIBAN — ошибка INVALID_COUNTRY ──────────────────────────────────

describe('validateIBAN — INVALID_COUNTRY', () => {
  it('несуществующая страна XX', () => {
    const result = validateIBAN('XX89370400440532013000')
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.errorCode).toBe('INVALID_COUNTRY')
  })

  it('страна начинается с цифры', () => {
    const result = validateIBAN('1289370400440532013000')
    expect(result.valid).toBe(false)
    if (result.valid) return
    // Попадает в INVALID_COUNTRY (цифры в коде страны не проходят regex)
    expect(result.errorCode).toBe('INVALID_COUNTRY')
  })
})

// ─── validateIBAN — ошибка WRONG_LENGTH ─────────────────────────────────────

describe('validateIBAN — WRONG_LENGTH', () => {
  it('DE с неверной длиной (21 вместо 22)', () => {
    const result = validateIBAN('DE8937040044053201300')
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.errorCode).toBe('WRONG_LENGTH')
    expect(result.errorMessage).toContain('22')
  })

  it('GB с лишним символом (23 вместо 22)', () => {
    const result = validateIBAN('GB29NWBK601613319268190')
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.errorCode).toBe('WRONG_LENGTH')
  })
})

// ─── validateIBAN — ошибка INVALID_CHECKSUM ─────────────────────────────────

describe('validateIBAN — INVALID_CHECKSUM', () => {
  it('неверное контрольное число (DE00)', () => {
    const result = validateIBAN('DE00370400440532013000')
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.errorCode).toBe('INVALID_CHECKSUM')
  })

  it('одна цифра счёта изменена', () => {
    // Оригинал: DE89370400440532013000
    const result = validateIBAN('DE89370400440532013001')
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.errorCode).toBe('INVALID_CHECKSUM')
  })

  it('переставлены два соседних символа (transposition error)', () => {
    // MOD-97 обнаруживает большинство перестановок
    const result = validateIBAN('DE89370400440532013000'.replace('3704', '7034'))
    expect(result.valid).toBe(false)
  })
})

// ─── isValidIBAN — булевая утилита ──────────────────────────────────────────

describe('isValidIBAN', () => {
  it('возвращает true для корректного IBAN', () => {
    expect(isValidIBAN('DE89370400440532013000')).toBe(true)
  })

  it('возвращает false для пустой строки', () => {
    expect(isValidIBAN('')).toBe(false)
  })

  it('возвращает false при неверной контрольной сумме', () => {
    expect(isValidIBAN('DE00370400440532013000')).toBe(false)
  })
})

// ─── Форматирование ─────────────────────────────────────────────────────────

describe('ibanFormatted', () => {
  it('DE: 22 символа разбиваются на 5 групп + остаток', () => {
    const result = validateIBAN('DE89370400440532013000')
    if (!result.valid) throw new Error('Expected valid')
    expect(result.ibanFormatted).toBe('DE89 3704 0044 0532 0130 00')
  })

  it('NO: 15 символов', () => {
    const result = validateIBAN('NO9386011117947')
    if (!result.valid) throw new Error('Expected valid')
    expect(result.ibanFormatted).toBe('NO93 8601 1117 947')
  })
})

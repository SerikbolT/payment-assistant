import { isValidIBAN, isValidBIC, friendlyFormatIBAN, electronicFormatIBAN } from 'ibantools'

export { friendlyFormatIBAN, electronicFormatIBAN }

export function validateIBAN(value: string): string | true {
  const clean = value.replace(/\s/g, '').toUpperCase()
  if (!clean) return 'Обязательное поле'
  if (clean.length < 5) return 'IBAN слишком короткий'
  if (!isValidIBAN(clean)) {
    return 'IBAN недействителен: контрольная сумма MOD-97 не совпадает'
  }
  return true
}

export function validateBIC(value: string): string | true {
  const clean = value.trim().toUpperCase()
  if (!clean) return 'Обязательное поле'
  if (!isValidBIC(clean)) {
    return 'Неверный формат BIC/SWIFT. Ожидается 8 или 11 символов (ISO 9362): AAAABBCC[DDD]'
  }
  return true
}

export function validateAmount(value: string): string | true {
  if (!value) return 'Укажите сумму'
  const num = parseFloat(value)
  if (isNaN(num) || num <= 0) return 'Введите положительную сумму'
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return 'Допустимо не более 2 знаков после запятой'
  return true
}

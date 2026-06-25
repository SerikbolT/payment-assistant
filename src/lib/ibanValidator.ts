/**
 * Валидация IBAN по международному алгоритму MOD-97
 *
 * Стандарты:
 *   - ISO 13616-1:2020 — структура IBAN
 *   - ECBS (European Committee for Banking Standards) — таблица длин по странам
 *
 * Алгоритм (ISO 13616, раздел 5):
 *   1. Убрать пробелы, привести к верхнему регистру
 *   2. Проверить формат: 2 буквы (страна) + 2 цифры (контрольное число) + BBAN
 *   3. Проверить длину для данной страны
 *   4. Переставить первые 4 символа в конец строки
 *   5. Заменить каждую букву числом: A=10, B=11, …, Z=35
 *   6. Вычислить остаток от деления полученного числа на 97
 *   7. Если остаток равен 1 — IBAN действителен
 */

// ─── Типы ───────────────────────────────────────────────────────────────────

/** Код ошибки валидации — позволяет программно реагировать на конкретную причину */
export type IBANErrorCode =
  | 'EMPTY'            // пустая строка
  | 'INVALID_CHARS'    // содержит недопустимые символы
  | 'TOO_SHORT'        // меньше минимально допустимой длины
  | 'TOO_LONG'         // превышает максимально допустимую длину
  | 'INVALID_COUNTRY'  // неизвестный код страны
  | 'WRONG_LENGTH'     // длина не совпадает с ожидаемой для данной страны
  | 'INVALID_CHECKSUM' // контрольная сумма MOD-97 не равна 1

/** Результат успешной валидации */
export interface IBANValid {
  valid: true
  /** IBAN без пробелов (электронный формат) */
  iban: string
  /** IBAN с пробелами каждые 4 символа (печатный формат) */
  ibanFormatted: string
  /** Код страны ISO 3166-1 alpha-2 */
  countryCode: string
  /** Контрольное число (2 цифры) */
  checkDigits: string
  /** Basic Bank Account Number — национальная часть номера */
  bban: string
}

/** Результат неуспешной валидации */
export interface IBANInvalid {
  valid: false
  /** Машиночитаемый код причины */
  errorCode: IBANErrorCode
  /** Человекочитаемое сообщение на русском языке */
  errorMessage: string
}

export type IBANValidationResult = IBANValid | IBANInvalid

// ─── Таблица длин IBAN по странам ───────────────────────────────────────────
//
// Источник: SWIFT IBAN Registry (издание 97, февраль 2024)
// Полный список: https://www.swift.com/standards/data-standards/iban
//
// Формат: 'КодСтраны' → ожидаемая длина IBAN (включая 2 буквы + 2 цифры)

const IBAN_LENGTHS: Readonly<Record<string, number>> = {
  AD: 24, // Андорра
  AE: 23, // ОАЭ
  AL: 28, // Албания
  AT: 20, // Австрия
  AZ: 28, // Азербайджан
  BA: 20, // Босния и Герцеговина
  BE: 16, // Бельгия
  BG: 22, // Болгария
  BH: 22, // Бахрейн
  BR: 29, // Бразилия
  BY: 28, // Беларусь
  CH: 21, // Швейцария
  CR: 22, // Коста-Рика
  CY: 28, // Кипр
  CZ: 24, // Чехия
  DE: 22, // Германия
  DK: 18, // Дания
  DO: 28, // Доминиканская Республика
  EE: 20, // Эстония
  EG: 29, // Египет
  ES: 24, // Испания
  FI: 18, // Финляндия
  FO: 18, // Фарерские острова
  FR: 27, // Франция
  GB: 22, // Великобритания
  GE: 22, // Грузия
  GI: 23, // Гибралтар
  GL: 18, // Гренландия
  GR: 27, // Греция
  GT: 28, // Гватемала
  HR: 21, // Хорватия
  HU: 28, // Венгрия
  IE: 22, // Ирландия
  IL: 23, // Израиль
  IQ: 23, // Ирак
  IS: 26, // Исландия
  IT: 27, // Италия
  JO: 30, // Иордания
  KW: 30, // Кувейт
  KZ: 20, // Казахстан
  LB: 28, // Ливан
  LC: 32, // Сент-Люсия
  LI: 21, // Лихтенштейн
  LT: 20, // Литва
  LU: 20, // Люксембург
  LV: 21, // Латвия
  LY: 25, // Ливия
  MC: 27, // Монако
  MD: 24, // Молдова
  ME: 22, // Черногория
  MK: 19, // Северная Македония
  MR: 27, // Мавритания
  MT: 31, // Мальта
  MU: 30, // Маврикий
  NL: 18, // Нидерланды
  NO: 15, // Норвегия
  PK: 24, // Пакистан
  PL: 28, // Польша
  PS: 29, // Палестина
  PT: 25, // Португалия
  QA: 29, // Катар
  RO: 24, // Румыния
  RS: 22, // Сербия
  SA: 24, // Саудовская Аравия
  SC: 31, // Сейшелы
  SE: 24, // Швеция
  SI: 19, // Словения
  SK: 24, // Словакия
  SM: 27, // Сан-Марино
  SV: 28, // Сальвадор
  TL: 23, // Тимор-Лесте
  TN: 24, // Тунис
  TR: 26, // Турция
  UA: 29, // Украина
  VA: 22, // Ватикан
  VG: 24, // Британские Виргинские острова
  XK: 20, // Косово
}

/** Минимальная и максимальная допустимые длины IBAN (по всем странам реестра) */
const MIN_IBAN_LENGTH = 15 // Норвегия (NO)
const MAX_IBAN_LENGTH = 32 // Сент-Люсия (LC)

// ─── Вспомогательные функции ─────────────────────────────────────────────────

/**
 * Форматирует IBAN в печатный вид: группы по 4 символа, разделённые пробелами.
 * Пример: 'DE89370400440532013000' → 'DE89 3704 0044 0532 0130 00'
 */
function formatIBAN(iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim()
}

/**
 * Переводит IBAN в числовую строку для вычисления MOD-97:
 *   - переставляет первые 4 символа в конец
 *   - заменяет каждую букву её числовым кодом (A=10, …, Z=35)
 *
 * Пример: 'DE89370400440532013000'
 *   → переставка: '370400440532013000DE89'
 *   → замена букв: '370400440532013000131489'
 */
function toNumericString(iban: string): string {
  const rearranged = iban.slice(4) + iban.slice(0, 4)

  return rearranged
    .split('')
    .map(char => {
      const code = char.charCodeAt(0)
      // A=65 → 10, B=66 → 11, …, Z=90 → 35
      return code >= 65 && code <= 90
        ? String(code - 55)
        : char
    })
    .join('')
}

/**
 * Вычисляет остаток от деления большого числа (в виде строки) на делитель.
 * Стандартный оператор % не подходит: числовая строка IBAN содержит до 34 цифр,
 * что выходит за пределы Number.MAX_SAFE_INTEGER.
 *
 * Алгоритм: обрабатываем строку блоками по 9 цифр — каждый блок умещается
 * в 64-битное число с запасом (9 цифр + 2-значный остаток = 11 знаков < 2^53).
 */
function modulo(numericString: string, divisor: number): number {
  let remainder = 0

  for (let i = 0; i < numericString.length; i += 9) {
    const block = numericString.slice(i, i + 9)
    // Конкатенируем остаток предыдущего шага с текущим блоком
    remainder = parseInt(String(remainder) + block, 10) % divisor
  }

  return remainder
}

// ─── Основная функция ────────────────────────────────────────────────────────

/**
 * Проверяет IBAN по алгоритму MOD-97 (ISO 13616).
 *
 * @param raw - IBAN в любом формате: с пробелами или без, в любом регистре
 * @returns IBANValidationResult — объект с полем `valid: true/false`
 *          и дополнительными данными или описанием ошибки
 *
 * @example
 * validateIBAN('DE89 3704 0044 0532 0130 00')
 * // → { valid: true, iban: 'DE89370400440532013000', countryCode: 'DE', … }
 *
 * validateIBAN('DE00000000000000000000')
 * // → { valid: false, errorCode: 'INVALID_CHECKSUM', errorMessage: '…' }
 */
export function validateIBAN(raw: string): IBANValidationResult {
  // Шаг 1. Нормализация — убираем пробелы, приводим к верхнему регистру
  const iban = raw.replace(/\s+/g, '').toUpperCase()

  // Шаг 2. Проверка на пустоту
  if (iban.length === 0) {
    return {
      valid: false,
      errorCode: 'EMPTY',
      errorMessage: 'IBAN не может быть пустым',
    }
  }

  // Шаг 3. Проверка допустимых символов (только латинские буквы и цифры)
  if (!/^[A-Z0-9]+$/.test(iban)) {
    return {
      valid: false,
      errorCode: 'INVALID_CHARS',
      errorMessage: 'IBAN содержит недопустимые символы. Допустимы только буквы латинского алфавита и цифры',
    }
  }

  // Шаг 4. Проверка длины — сначала глобальные границы
  if (iban.length < MIN_IBAN_LENGTH) {
    return {
      valid: false,
      errorCode: 'TOO_SHORT',
      errorMessage: `IBAN слишком короткий: ${iban.length} символов (минимум ${MIN_IBAN_LENGTH})`,
    }
  }

  if (iban.length > MAX_IBAN_LENGTH) {
    return {
      valid: false,
      errorCode: 'TOO_LONG',
      errorMessage: `IBAN слишком длинный: ${iban.length} символов (максимум ${MAX_IBAN_LENGTH})`,
    }
  }

  // Шаг 5. Проверка кода страны (первые 2 символа — буквы)
  const countryCode = iban.slice(0, 2)
  const checkDigits = iban.slice(2, 4)
  const bban = iban.slice(4)

  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return {
      valid: false,
      errorCode: 'INVALID_COUNTRY',
      errorMessage: `Код страны «${countryCode}» должен состоять из двух латинских букв`,
    }
  }

  const expectedLength = IBAN_LENGTHS[countryCode]

  if (expectedLength === undefined) {
    return {
      valid: false,
      errorCode: 'INVALID_COUNTRY',
      errorMessage: `Страна «${countryCode}» не поддерживает IBAN или не входит в реестр SWIFT`,
    }
  }

  // Шаг 6. Проверка длины для конкретной страны
  if (iban.length !== expectedLength) {
    return {
      valid: false,
      errorCode: 'WRONG_LENGTH',
      errorMessage:
        `IBAN для страны ${countryCode} должен содержать ${expectedLength} символов, ` +
        `получено ${iban.length}`,
    }
  }

  // Шаг 7. Вычисление контрольной суммы MOD-97
  //
  // По стандарту: переставляем первые 4 символа (CCNN) в конец,
  // заменяем буквы числами и делим на 97.
  // Если остаток равен 1 — IBAN действителен.
  const numericString = toNumericString(iban)
  const remainder = modulo(numericString, 97)

  if (remainder !== 1) {
    return {
      valid: false,
      errorCode: 'INVALID_CHECKSUM',
      errorMessage:
        `Контрольная сумма MOD-97 недействительна: ожидалось 1, получено ${remainder}. ` +
        `Проверьте, не допущена ли опечатка в номере счёта или коде страны`,
    }
  }

  // Все проверки пройдены
  return {
    valid: true,
    iban,
    ibanFormatted: formatIBAN(iban),
    countryCode,
    checkDigits,
    bban,
  }
}

// ─── Утилита: быстрая проверка (boolean) ─────────────────────────────────────

/**
 * Упрощённая версия: возвращает только `true` / `false`.
 * Используйте `validateIBAN`, если нужно знать причину ошибки.
 */
export function isValidIBAN(raw: string): boolean {
  return validateIBAN(raw).valid
}

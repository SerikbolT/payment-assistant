/**
 * Генератор XML-сообщений ISO 20022 pacs.008.001.08
 * FIToFICustomerCreditTransfer — межбанковский кредитовый перевод
 *
 * Спецификация: ISO 20022 — Universal financial industry message scheme
 * Схема:        urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08
 * Версия:       pacs.008.001.08 (актуальна для SWIFT MX и SEPA)
 *
 * Структура сообщения:
 * ┌─────────────────────────────────────────────┐
 * │ Document                                    │
 * │  └─ FIToFICstmrCdtTrf                       │
 * │       ├─ GrpHdr        (Group Header)       │
 * │       │    ├─ MsgId                         │
 * │       │    ├─ CreDtTm                       │
 * │       │    ├─ NbOfTxs                       │
 * │       │    └─ SttlmInf                      │
 * │       └─ CdtTrfTxInf  (Transaction Info)   │
 * │            ├─ PmtId   (Payment ID)          │
 * │            ├─ IntrBkSttlmAmt + Ccy          │
 * │            ├─ IntrBkSttlmDt                 │
 * │            ├─ ChrgBr                        │
 * │            ├─ Dbtr / DbtrAcct / DbtrAgt     │
 * │            ├─ CdtrAgt / Cdtr / CdtrAcct     │
 * │            └─ RmtInf                        │
 * └─────────────────────────────────────────────┘
 */

// ─── Вспомогательные типы ────────────────────────────────────────────────────

/** IBAN: ISO 13616, 15–34 символа */
type IBAN = string

/** BIC/SWIFT: ISO 9362, 8 или 11 символов */
type BIC = string

/** Код валюты: ISO 4217, 3 заглавные буквы */
type CurrencyCode = string

/** Дата в формате YYYY-MM-DD */
type ISODate = string

/**
 * Метод распределения комиссий (ChargBearer):
 *  SLEV — следовать уровню сервиса (стандарт для SEPA)
 *  SHAR — комиссии делятся между плательщиком и получателем
 *  CRED — все комиссии за счёт получателя
 *  DEBT — все комиссии за счёт плательщика
 */
type ChargeBearer = 'SLEV' | 'SHAR' | 'CRED' | 'DEBT'

/** Код уровня сервиса */
type ServiceLevelCode = 'SEPA' | 'SWIFT' | 'URGP' | 'NURG'

// ─── Входные интерфейсы ───────────────────────────────────────────────────────

/**
 * Участник перевода: плательщик или получатель.
 * Соответствует элементам <Dbtr> / <Cdtr>.
 */
export interface Party {
  /** Полное наименование (max 140 символов по ISO 20022) */
  name: string
  /** Двухбуквенный код страны ISO 3166-1 alpha-2 */
  countryCode: string
  /** Адрес — строка 1 (необязательно, max 70 символов) */
  addressLine1?: string
  /** Адрес — строка 2 (необязательно, max 70 символов) */
  addressLine2?: string
}

/**
 * Банковский счёт участника.
 * Соответствует элементам <DbtrAcct> / <CdtrAcct>.
 */
export interface Account {
  /** IBAN счёта (ISO 13616) */
  iban: IBAN
  /** Валюта счёта — необязательна в pacs.008, но используется в некоторых маршрутах */
  currency?: CurrencyCode
}

/**
 * Банк-агент (банк плательщика или банк получателя).
 * Соответствует элементам <DbtrAgt> / <CdtrAgt>.
 */
export interface Agent {
  /** BIC идентификатор банка (ISO 9362) */
  bic: BIC
  /** Название банка — необязательно, улучшает читаемость сообщения */
  name?: string
}

/**
 * Детали финансового перевода.
 * Формирует ядро блока <CdtTrfTxInf>.
 */
export interface TransferDetails {
  /** Сумма перевода — положительное число с не более чем двумя знаками после запятой */
  amount: number
  /** Валюта перевода (ISO 4217) */
  currency: CurrencyCode
  /** Дата расчёта (YYYY-MM-DD) — дата, на которую банки производят списание/зачисление */
  valueDate: ISODate
  /** Назначение платежа (max 140 символов) */
  remittanceInfo: string
  /** Уровень сервиса — определяет правила обработки (по умолчанию SEPA) */
  serviceLevel?: ServiceLevelCode
  /** Распределение комиссий (по умолчанию SLEV — следовать уровню сервиса) */
  chargeBearer?: ChargeBearer
  /** End-to-End ID — сквозной идентификатор от инициатора до получателя (max 35 символов) */
  endToEndId?: string
  /** Instruction ID — идентификатор инструкции (необязательно, max 35 символов) */
  instructionId?: string
}

/**
 * Полный набор входных данных для генерации pacs.008.
 */
export interface Pacs008Input {
  debtor: Party
  debtorAccount: Account
  debtorAgent: Agent
  creditor: Party
  creditorAccount: Account
  creditorAgent: Agent
  transfer: TransferDetails
}

// ─── Выходные интерфейсы ─────────────────────────────────────────────────────

/**
 * Результат генерации XML-сообщения.
 */
export interface Pacs008Result {
  /** Готовый XML-документ в виде строки */
  xml: string
  /** Уникальный идентификатор сообщения (MsgId) — автогенерация */
  messageId: string
  /** UETR — Unique End-to-end Transaction Reference (UUID v4) */
  uetr: string
  /** Время создания сообщения (ISO 8601) */
  createdAt: string
}

// ─── Вспомогательные функции ─────────────────────────────────────────────────

/**
 * Экранирует специальные символы XML в строке.
 * Применяется ко всем пользовательским данным перед вставкой в XML.
 *
 *   &  →  &amp;   (всегда первым!)
 *   <  →  &lt;
 *   >  →  &gt;
 *   "  →  &quot;
 *   '  →  &apos;
 */
function escXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Генерирует уникальный идентификатор сообщения.
 * Формат: MSG-{timestamp_base36}-{random} — гарантирует уникальность в рамках сессии.
 * Пример: MSG-LVH9Z3KX-F4A2
 */
function generateMessageId(): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `MSG-${ts}-${rand}`
}

/**
 * Форматирует число как денежную сумму: ровно 2 знака после запятой.
 * Пример: 1500 → '1500.00', 99.9 → '99.90'
 */
function formatAmount(amount: number): string {
  return amount.toFixed(2)
}

/**
 * Возвращает текущую дату и время в формате ISO 8601 без миллисекунд.
 * Формат: YYYY-MM-DDTHH:MM:SS
 * Пример: 2026-06-25T14:32:00
 */
function nowISO(): string {
  return new Date().toISOString().slice(0, 19)
}

/**
 * Нормализует IBAN: убирает пробелы, приводит к верхнему регистру.
 * Пример: 'de89 3704 0044' → 'DE89370400440'
 */
function normalizeIBAN(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase()
}

/**
 * Нормализует BIC: убирает пробелы, приводит к верхнему регистру.
 */
function normalizeBIC(bic: string): string {
  return bic.trim().toUpperCase()
}

// ─── XML-строители ────────────────────────────────────────────────────────────

/**
 * Формирует блок <Party> для плательщика или получателя.
 * В ISO 20022 это элементы <Dbtr> или <Cdtr>.
 *
 * Структура:
 *   <Nm>      — наименование
 *   <PstlAdr> — почтовый адрес (страна обязательна, строки адреса опциональны)
 */
function buildPartyXml(tag: string, party: Party, indent: string): string {
  const lines: string[] = [`${indent}<${tag}>`]
  lines.push(`${indent}  <Nm>${escXml(party.name)}</Nm>`)
  lines.push(`${indent}  <PstlAdr>`)
  if (party.addressLine1) {
    lines.push(`${indent}    <AdrLine>${escXml(party.addressLine1)}</AdrLine>`)
  }
  if (party.addressLine2) {
    lines.push(`${indent}    <AdrLine>${escXml(party.addressLine2)}</AdrLine>`)
  }
  lines.push(`${indent}    <Ctry>${escXml(party.countryCode)}</Ctry>`)
  lines.push(`${indent}  </PstlAdr>`)
  lines.push(`${indent}</${tag}>`)
  return lines.join('\n')
}

/**
 * Формирует блок счёта (<DbtrAcct> или <CdtrAcct>).
 *
 * Структура:
 *   <Id><IBAN> — идентификатор счёта через IBAN
 *   <Ccy>      — валюта счёта (необязательно)
 */
function buildAccountXml(tag: string, account: Account, indent: string): string {
  const lines: string[] = [`${indent}<${tag}>`]
  lines.push(`${indent}  <Id>`)
  lines.push(`${indent}    <IBAN>${normalizeIBAN(account.iban)}</IBAN>`)
  lines.push(`${indent}  </Id>`)
  if (account.currency) {
    lines.push(`${indent}  <Ccy>${escXml(account.currency)}</Ccy>`)
  }
  lines.push(`${indent}</${tag}>`)
  return lines.join('\n')
}

/**
 * Формирует блок банка-агента (<DbtrAgt> или <CdtrAgt>).
 *
 * Структура:
 *   <FinInstnId><BICFI> — идентификация через BIC (предпочтительный способ в SWIFT MX)
 */
function buildAgentXml(tag: string, agent: Agent, indent: string): string {
  const lines: string[] = [`${indent}<${tag}>`]
  lines.push(`${indent}  <FinInstnId>`)
  lines.push(`${indent}    <BICFI>${normalizeBIC(agent.bic)}</BICFI>`)
  if (agent.name) {
    lines.push(`${indent}    <Nm>${escXml(agent.name)}</Nm>`)
  }
  lines.push(`${indent}  </FinInstnId>`)
  lines.push(`${indent}</${tag}>`)
  return lines.join('\n')
}

// ─── Основная функция генерации ───────────────────────────────────────────────

/**
 * Генерирует XML-сообщение pacs.008.001.08 по входным данным.
 *
 * @param input - Все реквизиты перевода
 * @returns Объект с готовым XML и метаданными сообщения
 *
 * @example
 * const result = generatePacs008({
 *   debtor: { name: 'ООО Альфа', countryCode: 'DE' },
 *   debtorAccount: { iban: 'DE89370400440532013000' },
 *   debtorAgent: { bic: 'DEUTDEDB' },
 *   creditor: { name: 'British Supplies Ltd', countryCode: 'GB' },
 *   creditorAccount: { iban: 'GB29NWBK60161331926819' },
 *   creditorAgent: { bic: 'NWBKGB2L' },
 *   transfer: {
 *     amount: 1500.00,
 *     currency: 'EUR',
 *     valueDate: '2026-07-01',
 *     remittanceInfo: 'Invoice INV-2026-042',
 *   },
 * })
 */
export function generatePacs008(input: Pacs008Input): Pacs008Result {
  const messageId = generateMessageId()
  const uetr = crypto.randomUUID()
  const createdAt = nowISO()

  const {
    debtor, debtorAccount, debtorAgent,
    creditor, creditorAccount, creditorAgent,
    transfer,
  } = input

  const serviceLevel = transfer.serviceLevel ?? 'SEPA'
  const chargeBearer = transfer.chargeBearer ?? 'SLEV'
  const endToEndId = transfer.endToEndId ?? `E2E-${messageId}`
  const amount = formatAmount(transfer.amount)

  // ── Group Header ───────────────────────────────────────────────────────────
  //
  // GrpHdr содержит метаданные всего сообщения.
  // NbOfTxs = 1: MVP поддерживает одну транзакцию на сообщение.
  // TtlIntrBkSttlmAmt = сумма: при NbOfTxs=1 всегда равна сумме транзакции.
  // SttlmMtd = CLRG: расчёт через клиринговую систему (стандарт для SEPA/TARGET2).
  const groupHeader = [
    `    <GrpHdr>`,
    `      <MsgId>${escXml(messageId)}</MsgId>`,
    `      <CreDtTm>${createdAt}</CreDtTm>`,
    `      <NbOfTxs>1</NbOfTxs>`,
    `      <TtlIntrBkSttlmAmt Ccy="${escXml(transfer.currency)}">${amount}</TtlIntrBkSttlmAmt>`,
    `      <SttlmInf>`,
    `        <SttlmMtd>CLRG</SttlmMtd>`,
    `      </SttlmInf>`,
    `    </GrpHdr>`,
  ].join('\n')

  // ── Payment Identification ─────────────────────────────────────────────────
  //
  // EndToEndId — сквозной ID: должен сохраняться на всём пути платежа.
  // UETR — обязателен с ноября 2020 г. (SWIFT gpi MX migration).
  // InstrId — опциональный идентификатор инструкции банка-отправителя.
  const pmtIdLines = [`        <PmtId>`]
  if (transfer.instructionId) {
    pmtIdLines.push(`          <InstrId>${escXml(transfer.instructionId)}</InstrId>`)
  }
  pmtIdLines.push(
    `          <EndToEndId>${escXml(endToEndId)}</EndToEndId>`,
    `          <UETR>${uetr}</UETR>`,
    `        </PmtId>`,
  )

  // ── Credit Transfer Transaction Information ────────────────────────────────
  const cdtTrfTxInf = [
    `    <CdtTrfTxInf>`,
    ...pmtIdLines,
    // Тип платежа: уровень сервиса определяет правила обработки в банке
    `      <PmtTpInf>`,
    `        <SvcLvl>`,
    `          <Cd>${serviceLevel}</Cd>`,
    `        </SvcLvl>`,
    `      </PmtTpInf>`,
    // Сумма межбанковского расчёта: в pacs.008 это всегда сумма кредитового перевода
    `      <IntrBkSttlmAmt Ccy="${escXml(transfer.currency)}">${amount}</IntrBkSttlmAmt>`,
    // Дата расчёта: банки обязаны провести расчёт именно в этот день
    `      <IntrBkSttlmDt>${transfer.valueDate}</IntrBkSttlmDt>`,
    // ChrgBr: SLEV = комиссии согласно уровню сервиса (обязателен для SEPA SCT)
    `      <ChrgBr>${chargeBearer}</ChrgBr>`,
    // Плательщик (Debtor): сторона, инициирующая перевод
    buildPartyXml('Dbtr', debtor, '      '),
    // Счёт плательщика
    buildAccountXml('DbtrAcct', debtorAccount, '      '),
    // Банк плательщика: банк, обслуживающий счёт плательщика
    buildAgentXml('DbtrAgt', debtorAgent, '      '),
    // Банк получателя: банк, обслуживающий счёт получателя
    buildAgentXml('CdtrAgt', creditorAgent, '      '),
    // Получатель (Creditor): конечный бенефициар перевода
    buildPartyXml('Cdtr', creditor, '      '),
    // Счёт получателя
    buildAccountXml('CdtrAcct', creditorAccount, '      '),
    // Назначение платежа: неструктурированный текст (Ustrd, max 140 символов)
    `      <RmtInf>`,
    `        <Ustrd>${escXml(transfer.remittanceInfo)}</Ustrd>`,
    `      </RmtInf>`,
    `    </CdtTrfTxInf>`,
  ].join('\n')

  // ── Сборка итогового документа ────────────────────────────────────────────
  //
  // xmlns: пространство имён строго фиксировано для версии 08
  // xmlns:xsi нужен для атрибутов валидации (xsi:schemaLocation)
  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08"`,
    `          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
    `  <FIToFICstmrCdtTrf>`,
    groupHeader,
    cdtTrfTxInf,
    `  </FIToFICstmrCdtTrf>`,
    `</Document>`,
  ].join('\n')

  return { xml, messageId, uetr, createdAt }
}

// ─── Пример использования (для документации и тестов) ────────────────────────

/**
 * Эталонные входные данные для генерации тестового pacs.008.
 * IBAN и BIC взяты из публичной документации SWIFT/SEPA.
 */
export const EXAMPLE_INPUT: Pacs008Input = {
  debtor: {
    name: 'ООО Альфа Трейдинг',
    countryCode: 'DE',
    addressLine1: 'Musterstraße 42',
    addressLine2: '10115 Berlin',
  },
  debtorAccount: {
    iban: 'DE89370400440532013000',
    currency: 'EUR',
  },
  debtorAgent: {
    bic: 'DEUTDEDB',
    name: 'Deutsche Bank AG',
  },
  creditor: {
    name: 'British Supplies Ltd',
    countryCode: 'GB',
    addressLine1: '10 Downing Street',
    addressLine2: 'London SW1A 2AA',
  },
  creditorAccount: {
    iban: 'GB29NWBK60161331926819',
  },
  creditorAgent: {
    bic: 'NWBKGB2L',
    name: 'NatWest Bank',
  },
  transfer: {
    amount: 1500.00,
    currency: 'EUR',
    valueDate: '2026-07-01',
    remittanceInfo: 'Invoice INV-2026-042 — Quarterly supply payment',
    serviceLevel: 'SEPA',
    chargeBearer: 'SLEV',
    endToEndId: 'E2E-ALPHA-20260625-001',
    instructionId: 'INSTR-20260625-001',
  },
}

/*
 * ─── Пример итогового XML ────────────────────────────────────────────────────
 *
 * <?xml version="1.0" encoding="UTF-8"?>
 * <Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08"
 *           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 *   <FIToFICstmrCdtTrf>
 *     <GrpHdr>
 *       <MsgId>MSG-LVH9Z3KX-F4A2</MsgId>
 *       <CreDtTm>2026-06-25T14:32:00</CreDtTm>
 *       <NbOfTxs>1</NbOfTxs>
 *       <TtlIntrBkSttlmAmt Ccy="EUR">1500.00</TtlIntrBkSttlmAmt>
 *       <SttlmInf>
 *         <SttlmMtd>CLRG</SttlmMtd>
 *       </SttlmInf>
 *     </GrpHdr>
 *     <CdtTrfTxInf>
 *       <PmtId>
 *         <InstrId>INSTR-20260625-001</InstrId>
 *         <EndToEndId>E2E-ALPHA-20260625-001</EndToEndId>
 *         <UETR>550e8400-e29b-41d4-a716-446655440000</UETR>
 *       </PmtId>
 *       <PmtTpInf>
 *         <SvcLvl>
 *           <Cd>SEPA</Cd>
 *         </SvcLvl>
 *       </PmtTpInf>
 *       <IntrBkSttlmAmt Ccy="EUR">1500.00</IntrBkSttlmAmt>
 *       <IntrBkSttlmDt>2026-07-01</IntrBkSttlmDt>
 *       <ChrgBr>SLEV</ChrgBr>
 *       <Dbtr>
 *         <Nm>ООО Альфа Трейдинг</Nm>
 *         <PstlAdr>
 *           <AdrLine>Musterstraße 42</AdrLine>
 *           <AdrLine>10115 Berlin</AdrLine>
 *           <Ctry>DE</Ctry>
 *         </PstlAdr>
 *       </Dbtr>
 *       <DbtrAcct>
 *         <Id>
 *           <IBAN>DE89370400440532013000</IBAN>
 *         </Id>
 *         <Ccy>EUR</Ccy>
 *       </DbtrAcct>
 *       <DbtrAgt>
 *         <FinInstnId>
 *           <BICFI>DEUTDEDB</BICFI>
 *           <Nm>Deutsche Bank AG</Nm>
 *         </FinInstnId>
 *       </DbtrAgt>
 *       <CdtrAgt>
 *         <FinInstnId>
 *           <BICFI>NWBKGB2L</BICFI>
 *           <Nm>NatWest Bank</Nm>
 *         </FinInstnId>
 *       </CdtrAgt>
 *       <Cdtr>
 *         <Nm>British Supplies Ltd</Nm>
 *         <PstlAdr>
 *           <AdrLine>10 Downing Street</AdrLine>
 *           <AdrLine>London SW1A 2AA</AdrLine>
 *           <Ctry>GB</Ctry>
 *         </PstlAdr>
 *       </Cdtr>
 *       <CdtrAcct>
 *         <Id>
 *           <IBAN>GB29NWBK60161331926819</IBAN>
 *         </Id>
 *       </CdtrAcct>
 *       <RmtInf>
 *         <Ustrd>Invoice INV-2026-042 — Quarterly supply payment</Ustrd>
 *       </RmtInf>
 *     </CdtTrfTxInf>
 *   </FIToFICstmrCdtTrf>
 * </Document>
 */

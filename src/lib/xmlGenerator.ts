import type { PaymentFormData, GeneratedXml } from '../types'

function generateMessageId(): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `MSG-${ts}-${rand}`
}

function escXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function generatePacs008(data: PaymentFormData): GeneratedXml {
  const messageId = generateMessageId()
  const uetr = crypto.randomUUID()
  const createdAt = new Date().toISOString().slice(0, 19)
  const debtorIBAN = data.debtorIBAN.replace(/\s/g, '').toUpperCase()
  const creditorIBAN = data.creditorIBAN.replace(/\s/g, '').toUpperCase()
  const amount = parseFloat(data.amount).toFixed(2)

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>${escXml(messageId)}</MsgId>
      <CreDtTm>${createdAt}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <EndToEndId>${escXml(data.endToEndId)}</EndToEndId>
        <UETR>${uetr}</UETR>
      </PmtId>
      <PmtTpInf>
        <SvcLvl>
          <Cd>${data.serviceLevel}</Cd>
        </SvcLvl>
      </PmtTpInf>
      <IntrBkSttlmAmt Ccy="${escXml(data.currency)}">${amount}</IntrBkSttlmAmt>
      <IntrBkSttlmDt>${data.valueDate}</IntrBkSttlmDt>
      <Dbtr>
        <Nm>${escXml(data.debtorName)}</Nm>
        <PstlAdr>
          <Ctry>${escXml(data.debtorCountry)}</Ctry>
        </PstlAdr>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${debtorIBAN}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>${escXml(data.debtorBIC.toUpperCase())}</BICFI>
        </FinInstnId>
      </DbtrAgt>
      <CdtrAgt>
        <FinInstnId>
          <BICFI>${escXml(data.creditorBIC.toUpperCase())}</BICFI>
        </FinInstnId>
      </CdtrAgt>
      <Cdtr>
        <Nm>${escXml(data.creditorName)}</Nm>
        <PstlAdr>
          <Ctry>${escXml(data.creditorCountry)}</Ctry>
        </PstlAdr>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <IBAN>${creditorIBAN}</IBAN>
        </Id>
      </CdtrAcct>
      <RmtInf>
        <Ustrd>${escXml(data.remittanceInfo)}</Ustrd>
      </RmtInf>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`

  return { xml, messageId, uetr }
}

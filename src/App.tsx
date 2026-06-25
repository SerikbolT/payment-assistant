import { useState } from 'react'
import { PaymentForm } from './components/PaymentForm'
import { XmlPreview } from './components/XmlPreview'
import { RiskPanel } from './components/RiskPanel'
import { generatePacs008 } from './lib/xmlGenerator'
import { assessRisk } from './lib/riskAssessor'
import type { PaymentFormData, GeneratedXml, RiskAssessment } from './types'

export default function App() {
  const [generated, setGenerated]   = useState<GeneratedXml | null>(null)
  const [assessment, setAssessment] = useState<RiskAssessment | null>(null)

  const handleGenerate = (data: PaymentFormData) => {
    setGenerated(generatePacs008(data))
    setAssessment(assessRisk(data))
  }

  return (
    <div className="app">
      <header className="header">
        <span className="header-icon">💳</span>
        <div>
          <div className="header-title">Payment Assistant</div>
          <div className="header-sub">Генератор ISO 20022 · pacs.008.001.08</div>
        </div>
      </header>
      <div className="disclaimer">
        ⚠ Только для тестирования и обучения. Не вводите реальные банковские реквизиты клиентов.
      </div>
      <main className="main">
        <div className="form-panel">
          <PaymentForm onGenerate={handleGenerate} />
        </div>
        <div className="xml-panel">
          <XmlPreview generated={generated} />
          {assessment && <RiskPanel assessment={assessment} />}
        </div>
      </main>
    </div>
  )
}

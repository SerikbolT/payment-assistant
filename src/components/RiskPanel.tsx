import type { RiskAssessment, RiskLevel, FactorSeverity, RiskCategory } from '../types'

// ─── Конфигурация отображения ────────────────────────────────────────────────

const LEVEL_CONFIG: Record<RiskLevel, {
  label: string; color: string; bg: string; border: string; icon: string
}> = {
  low:      { label: 'Низкий',       color: '#15803d', bg: '#f0fdf4', border: '#86efac', icon: '✓' },
  medium:   { label: 'Средний',      color: '#b45309', bg: '#fffbeb', border: '#fcd34d', icon: '⚠' },
  high:     { label: 'Высокий',      color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5', icon: '⚠' },
  critical: { label: 'Критический',  color: '#7f1d1d', bg: '#450a0a', border: '#dc2626', icon: '✕' },
}

const SEVERITY_CONFIG: Record<FactorSeverity, { icon: string; color: string }> = {
  error:   { icon: '✕', color: '#dc2626' },
  warning: { icon: '⚠', color: '#d97706' },
  info:    { icon: 'ℹ', color: '#3b82f6' },
}

const CATEGORY_LABELS: Record<RiskCategory, string> = {
  amount:     'Сумма',
  date:       'Дата',
  geography:  'Маршрут',
  format:     'Формат',
  compliance: 'Комплаенс',
  quality:    'Качество',
}

// ─── Подкомпоненты ───────────────────────────────────────────────────────────

/** Круговой индикатор балла качества */
function QualityRing({ score }: { score: number }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const fill = circ * (1 - score / 100)

  const color = score >= 80 ? '#16a34a'
              : score >= 60 ? '#d97706'
              : score >= 40 ? '#ea580c'
              : '#dc2626'

  return (
    <div className="quality-ring-wrap">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
        <circle
          cx="44" cy="44" r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={fill}
          transform="rotate(-90 44 44)"
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
        />
        <text x="44" y="48" textAnchor="middle" fontSize="17" fontWeight="700" fill={color}>
          {score}%
        </text>
      </svg>
      <div className="quality-ring-label">Качество</div>
    </div>
  )
}

/** Горизонтальная шкала одного измерения */
function DimensionBar({ icon, label, score, hint }: {
  icon: string; label: string; score: number; hint: string
}) {
  const color = score >= 80 ? '#16a34a'
              : score >= 60 ? '#d97706'
              : score >= 40 ? '#ea580c'
              : '#dc2626'

  return (
    <div className="dim-bar" title={hint}>
      <div className="dim-bar-header">
        <span className="dim-bar-name">{icon} {label}</span>
        <span className="dim-bar-score" style={{ color }}>{score}%</span>
      </div>
      <div className="dim-bar-track">
        <div
          className="dim-bar-fill"
          style={{ width: `${score}%`, background: color, transition: 'width 0.5s ease' }}
        />
      </div>
    </div>
  )
}

/** Один фактор риска */
function FactorRow({ factor }: { factor: RiskAssessment['factors'][0] }) {
  const cfg = SEVERITY_CONFIG[factor.severity]
  return (
    <div className={`risk-factor risk-factor--${factor.severity}`}>
      <span className="risk-factor-icon" style={{ color: cfg.color }}>{cfg.icon}</span>
      <div className="risk-factor-body">
        <div className="risk-factor-title">
          <span className="risk-category-tag">{CATEGORY_LABELS[factor.category]}</span>
          {factor.title}
        </div>
        <div className="risk-factor-desc">{factor.description}</div>
      </div>
    </div>
  )
}

// ─── Главный компонент ───────────────────────────────────────────────────────

interface Props {
  assessment: RiskAssessment
}

export function RiskPanel({ assessment }: Props) {
  const lvl = LEVEL_CONFIG[assessment.riskLevel]
  const errors   = assessment.factors.filter(f => f.severity === 'error')
  const warnings = assessment.factors.filter(f => f.severity === 'warning')
  const infos    = assessment.factors.filter(f => f.severity === 'info')

  return (
    <div className="risk-panel" style={{ borderTopColor: lvl.border }}>

      {/* ── Шапка: уровень риска ── */}
      <div className="risk-header" style={{ background: lvl.bg, borderColor: lvl.border }}>
        <div className="risk-level-badge" style={{ color: lvl.color, borderColor: lvl.border }}>
          <span className="risk-level-icon">{lvl.icon}</span>
          <div>
            <div className="risk-level-label">Уровень риска</div>
            <div className="risk-level-value">{lvl.label}</div>
          </div>
        </div>

        <div className="risk-summary-text" style={{ color: lvl.color }}>
          {assessment.summary}
        </div>

        <div className="risk-score-pill" style={{ background: lvl.bg, borderColor: lvl.border }}>
          <span style={{ color: lvl.color }}>Балл: <strong>{assessment.riskScore}</strong>/100</span>
        </div>
      </div>

      {/* ── Тело: качество + факторы ── */}
      <div className="risk-body">

        {/* Левая колонка: качество реквизитов */}
        <div className="risk-col risk-col--quality">
          <div className="risk-col-title">Качество реквизитов</div>
          <QualityRing score={assessment.qualityScore} />
          <div className="dim-bars">
            {assessment.dimensions.map(d => (
              <DimensionBar key={d.label} {...d} />
            ))}
          </div>
        </div>

        {/* Правая колонка: факторы риска */}
        <div className="risk-col risk-col--factors">
          <div className="risk-col-title">
            Факторы риска
            <span className="risk-factors-count">
              {errors.length > 0 && <span className="rc-error">{errors.length} ошибок</span>}
              {warnings.length > 0 && <span className="rc-warn">{warnings.length} предупреждений</span>}
              {infos.length > 0 && <span className="rc-info">{infos.length} замечаний</span>}
            </span>
          </div>

          <div className="risk-factors-list">
            {assessment.factors.length === 0 ? (
              <div className="risk-no-factors">Факторы риска не обнаружены</div>
            ) : (
              assessment.factors.map(f => <FactorRow key={f.id} factor={f} />)
            )}
          </div>
        </div>
      </div>

      {/* ── Рекомендации ── */}
      {assessment.recommendations.length > 0 && (
        <div className="risk-recs">
          <div className="risk-recs-title">Рекомендации</div>
          <ul className="risk-recs-list">
            {assessment.recommendations.map((r, i) => (
              <li key={i} className="risk-rec-item">{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

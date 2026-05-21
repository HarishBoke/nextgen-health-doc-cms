import { useMemo, useState } from 'react'
import { Editor } from '@tinymce/tinymce-react'
import {
  Accessibility,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileCheck2,
  FileUp,
  FileText,
  Languages,
  Landmark,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  PanelLeftClose,
  SearchCheck,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import './App.css'

type Section = {
  id: string
  number: string
  title: string
  level: number
  required: boolean
  locked?: boolean
  defaultContent: string
}

type MetadataField = {
  id: string
  label: string
  value: string
  required: boolean
  help: string
}

type ComplianceIssue = {
  id: string
  severity: 'error' | 'warning'
  label: string
  detail: string
}

type SpecFinding = {
  severity: 'error' | 'warning' | 'info'
  label: string
  detail: string
  evidence?: string | null
}

type SpecComparisonReport = {
  passed: boolean
  score: number
  similarity: number
  coverage: number
  required_terms_found: string[]
  required_terms_missing: string[]
  missing_snippets: string[]
  order_findings: SpecFinding[]
  spec_word_count: number
  document_word_count: number
  review_note: string
  created_at: string
}

type ServerExportArtifact = {
  format: 'html' | 'pdf'
  filename: string
  media_type: string
  bytes_written: number
  download_url: string
}

type AiReviewFinding = {
  severity: 'critical' | 'major' | 'minor' | 'info'
  category: 'content' | 'structure' | 'accessibility' | 'pdf_readiness' | 'metadata'
  issue: string
  recommendation: string
  evidence?: string | null
}

type AiSpecReviewReport = {
  available: boolean
  model?: string | null
  verdict: 'pass' | 'needs_review' | 'blocked' | 'unavailable'
  confidence: number
  summary: string
  findings: AiReviewFinding[]
  next_steps: string[]
  created_at: string
}

const metadataSeed: MetadataField[] = [
  { id: 'documentType', label: 'Document type', value: 'Annual Notice of Change', required: true, help: 'CMS model material category' },
  { id: 'planYear', label: 'Plan year', value: '2026', required: true, help: 'Required for model-year traceability' },
  { id: 'planName', label: 'Plan name', value: 'Example Medicare Advantage Plan', required: true, help: 'Member-facing plan identity' },
  { id: 'contractNumber', label: 'Contract number', value: 'H0000', required: true, help: 'CMS contract identifier' },
  { id: 'language', label: 'Document language', value: 'en-US', required: true, help: 'Language metadata for export' },
]

const sectionSeed: Section[] = [
  {
    id: 'cover',
    number: 'Cover',
    title: 'Annual Notice of Change for 2026',
    level: 1,
    required: true,
    locked: true,
    defaultContent: '<p><strong>This material describes changes to our plan’s costs and benefits next year.</strong></p><p>You have from October 15 through December 7 to make changes to your Medicare coverage for next year.</p>',
  },
  {
    id: 'summary-costs',
    number: 'Summary',
    title: 'Summary of Important Costs for 2026',
    level: 1,
    required: true,
    defaultContent: '<p>The table below compares important plan costs for this year and next year.</p><table><thead><tr><th scope="col">Cost</th><th scope="col">2025</th><th scope="col">2026</th></tr></thead><tbody><tr><td>Monthly plan premium</td><td>$0</td><td>$0</td></tr><tr><td>Maximum out-of-pocket amount</td><td>Insert amount</td><td>Insert amount</td></tr></tbody></table>',
  },
  {
    id: 'benefit-changes',
    number: 'SECTION 1',
    title: 'Changes to Benefits & Costs for Next Year',
    level: 1,
    required: true,
    defaultContent: '<p>Describe plan-specific changes to benefits and costs. Keep CMS standardized language in the approved order unless the source instructions permit a modification.</p>',
  },
  {
    id: 'provider-network',
    number: 'Section 1.3',
    title: 'Changes to the Provider Network',
    level: 2,
    required: true,
    defaultContent: '<p>Explain provider-network changes, directory availability, and what action members should take if their provider is affected.</p>',
  },
  {
    id: 'part-d',
    number: 'Section 1.6',
    title: 'Changes to Part D Drug Coverage',
    level: 2,
    required: true,
    defaultContent: '<p>Describe formulary, tier, restriction, deductible, initial coverage, and catastrophic-stage changes using plain language and approved CMS terminology.</p>',
  },
  {
    id: 'change-plans',
    number: 'SECTION 3',
    title: 'How to Change Plans',
    level: 1,
    required: true,
    defaultContent: '<p>Explain deadlines and approved ways members can change Medicare coverage. Include Medicare.gov and Medicare & You references where required by the model.</p>',
  },
  {
    id: 'questions',
    number: 'SECTION 5',
    title: 'Questions?',
    level: 1,
    required: true,
    defaultContent: '<p>Call Member Services at <strong>[insert phone]</strong> (TTY users call <strong>[insert TTY]</strong>). Hours are <strong>[insert days and hours]</strong>. This call is free.</p>',
  },
]

const workflowSteps = ['Draft', '508 preflight', 'Spec match', 'Compliance review', 'Export package']

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'https://health-doc-cms-api.onrender.com').replace(/\/$/, '')

function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

function downloadUrl(path: string) {
  return path.startsWith('http') ? path : apiUrl(path)
}

function textOnly(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildHtml(metadata: MetadataField[], sections: Section[], content: Record<string, string>) {
  const title = metadata.find((field) => field.id === 'documentType')?.value ?? 'CMS Document'
  const lang = metadata.find((field) => field.id === 'language')?.value ?? 'en-US'
  const metadataRows = metadata.map((field) => `<dt>${field.label}</dt><dd>${field.value || 'Not provided'}</dd>`).join('')
  const toc = sections.map((section) => `<li class="toc-level-${section.level}"><a href="#${section.id}">${section.number} ${section.title}</a></li>`).join('')
  const body = sections.map((section) => {
    const Heading = `h${Math.min(section.level + 1, 4)}`
    return `<section id="${section.id}" aria-labelledby="heading-${section.id}"><${Heading} id="heading-${section.id}">${section.number} ${section.title}</${Heading}>${content[section.id]}</section>`
  }).join('')

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{font-family:Arial,Helvetica,sans-serif;line-height:1.5;max-width:7.625in;margin:0.75in auto;color:#111827}a{color:#174ea6}table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid #374151;padding:.45rem;text-align:left;vertical-align:top}th{background:#eef2ff}h1,h2,h3,h4{page-break-after:avoid}.metadata{display:grid;grid-template-columns:12rem 1fr;gap:.25rem 1rem}.toc-level-2{margin-left:1rem}@page{size:8.5in 11in;margin:.75in}</style></head><body><main><h1>${title}</h1><dl class="metadata">${metadataRows}</dl><nav aria-label="Document table of contents"><h2>Table of Contents</h2><ol>${toc}</ol></nav>${body}</main></body></html>`
}

function runCompliance(metadata: MetadataField[], sections: Section[], content: Record<string, string>): ComplianceIssue[] {
  const issues: ComplianceIssue[] = []
  metadata.forEach((field) => {
    if (field.required && !field.value.trim()) {
      issues.push({ id: `metadata-${field.id}`, severity: 'error', label: `${field.label} is required`, detail: 'Required metadata is needed for document identity, review, and export.' })
    }
  })
  sections.forEach((section) => {
    const html = content[section.id] ?? ''
    const plainText = textOnly(html)
    if (section.required && plainText.length < 10) {
      issues.push({ id: `section-${section.id}`, severity: 'error', label: `${section.number} is incomplete`, detail: 'Required CMS model sections must not be exported empty.' })
    }
    if (/<img\b(?![^>]*\balt=)/i.test(html)) {
      issues.push({ id: `alt-${section.id}`, severity: 'error', label: `${section.number} has an image without alt text`, detail: 'Meaningful images require alternative text before export.' })
    }
    if (/<table\b/i.test(html) && !/<th\b/i.test(html)) {
      issues.push({ id: `table-${section.id}`, severity: 'error', label: `${section.number} has a table without headers`, detail: 'Benefit and cost tables must expose header relationships.' })
    }
    if (/(>click here<|>read more<|>learn more<)/i.test(html)) {
      issues.push({ id: `link-${section.id}`, severity: 'warning', label: `${section.number} may contain vague link text`, detail: 'Links should describe their destination or action.' })
    }
    if (plainText.length > 900 && !/<h[2-4]\b/i.test(html)) {
      issues.push({ id: `long-${section.id}`, severity: 'warning', label: `${section.number} contains a long uninterrupted block`, detail: 'Long healthcare content should be broken into semantic headings, lists, or tables.' })
    }
  })
  return issues
}

function App() {
  const [metadata, setMetadata] = useState(metadataSeed)
  const [sections] = useState(sectionSeed)
  const [activeSection, setActiveSection] = useState(sectionSeed[0].id)
  const [content, setContent] = useState<Record<string, string>>(() => Object.fromEntries(sectionSeed.map((section) => [section.id, section.defaultContent])))
  const [mobileTocOpen, setMobileTocOpen] = useState(false)
  const [specFile, setSpecFile] = useState<File | null>(null)
  const [specReport, setSpecReport] = useState<SpecComparisonReport | null>(null)
  const [specStatus, setSpecStatus] = useState('Upload a marked-up SB spec PDF and compare it against the generated HTML.')
  const [isComparingSpec, setIsComparingSpec] = useState(false)
  const [aiReview, setAiReview] = useState<AiSpecReviewReport | null>(null)
  const [aiReviewStatus, setAiReviewStatus] = useState('Optional AI review is available when the backend has an AI model key configured.')
  const [isAiReviewing, setIsAiReviewing] = useState(false)
  const [serverExport, setServerExport] = useState<ServerExportArtifact | null>(null)
  const [serverExportStatus, setServerExportStatus] = useState('Server PDF export is ready when the backend is available.')
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const active = sections.find((section) => section.id === activeSection) ?? sections[0]
  const issues = useMemo(() => runCompliance(metadata, sections, content), [metadata, sections, content])
  const htmlExport = useMemo(() => buildHtml(metadata, sections, content), [metadata, sections, content])
  const errors = issues.filter((issue) => issue.severity === 'error').length
  const warnings = issues.filter((issue) => issue.severity === 'warning').length
  const specMissingCount = specReport ? specReport.required_terms_missing.length + specReport.missing_snippets.length : 0
  const completedSections = sections.filter((section) => textOnly(content[section.id] ?? '').length >= 10).length
  const readiness = Math.round(((sections.length - Math.min(errors, sections.length)) / sections.length) * 100)

  const updateMetadata = (id: string, value: string) => setMetadata((items) => items.map((item) => (item.id === id ? { ...item, value } : item)))
  const switchSection = (id: string) => {
    setActiveSection(id)
    setMobileTocOpen(false)
  }
  const downloadHtml = () => {
    const blob = new Blob([htmlExport], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'cms-accessible-document.html'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const exportServerPdf = async () => {
    setIsExportingPdf(true)
    setServerExportStatus('Generating server PDF package from canonical HTML...')
    setServerExport(null)
    try {
      const response = await fetch(apiUrl('/api/v1/exports/pdf-package'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: htmlExport, filename: 'cms-accessible-document.pdf' }),
      })
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || `PDF export failed with HTTP ${response.status}`)
      }
      const artifact = (await response.json()) as ServerExportArtifact
      setServerExport(artifact)
      setServerExportStatus(`PDF package generated: ${artifact.filename}`)
      window.open(downloadUrl(artifact.download_url), '_blank', 'noopener,noreferrer')
    } catch (error) {
      setServerExportStatus(error instanceof Error ? error.message : 'Unable to generate server PDF package.')
    } finally {
      setIsExportingPdf(false)
    }
  }

  const compareAgainstSpec = async () => {
    if (!specFile) {
      setSpecStatus('Select the marked-up SB specification PDF before running comparison.')
      return
    }
    setIsComparingSpec(true)
    setSpecStatus('Extracting spec PDF text and comparing against generated HTML...')
    setSpecReport(null)
    setAiReview(null)
    try {
      const formData = new FormData()
      formData.append('spec_file', specFile)
      formData.append('html', htmlExport)
      const response = await fetch(apiUrl('/api/v1/specs/compare-html'), { method: 'POST', body: formData })
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || `Spec comparison failed with HTTP ${response.status}`)
      }
      const report = (await response.json()) as SpecComparisonReport
      setSpecReport(report)
      setSpecStatus(report.passed ? 'Spec comparison passed the configured precision threshold.' : 'Spec comparison found gaps that need author or reviewer attention.')
    } catch (error) {
      setSpecStatus(error instanceof Error ? error.message : 'Unable to compare against the uploaded specification.')
    } finally {
      setIsComparingSpec(false)
    }
  }

  const runAiSpecReview = async () => {
    if (!specFile) {
      setAiReviewStatus('Select the marked-up SB specification PDF before requesting AI review.')
      return
    }
    setIsAiReviewing(true)
    setAiReviewStatus('Requesting semantic AI review of the generated HTML against the uploaded specification...')
    setAiReview(null)
    try {
      const formData = new FormData()
      formData.append('spec_file', specFile)
      formData.append('html', htmlExport)
      const response = await fetch(apiUrl('/api/v1/specs/ai-review-html'), { method: 'POST', body: formData })
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || `AI review failed with HTTP ${response.status}`)
      }
      const report = (await response.json()) as AiSpecReviewReport
      setAiReview(report)
      setAiReviewStatus(report.available ? `AI review completed with verdict: ${report.verdict.replace('_', ' ')}.` : report.summary)
    } catch (error) {
      setAiReviewStatus(error instanceof Error ? error.message : 'Unable to complete AI-assisted spec review.')
    } finally {
      setIsAiReviewing(false)
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to document editor</a>

      <header className="masthead" role="banner">
        <div className="brand-mark" aria-hidden="true"><Landmark size={24} /></div>
        <div>
          <p className="eyebrow">CMS.gov healthcare document CMS</p>
          <h1>Professional ANOC, SB, and EOC compliance workspace</h1>
          <p className="lede">Author regulated Medicare materials in a responsive, WCAG-aligned cockpit with structured CMS sections, 501/508 preflight, semantic HTML export, and PDF package readiness.</p>
        </div>
        <div className="masthead-actions" aria-label="Primary status and actions">
          <div className="readiness-ring" aria-label={`Export readiness ${readiness} percent`}><strong>{readiness}%</strong><span>ready</span></div>
          <button className="primary-action compact" onClick={downloadHtml}><Download size={18} aria-hidden="true" /> Export HTML</button>
        </div>
      </header>

      <section className="status-strip" aria-label="Document readiness summary">
        <article className="metric-card positive"><ShieldCheck aria-hidden="true" /><span>Preflight</span><strong>{errors === 0 ? 'Ready' : `${errors} blocker${errors === 1 ? '' : 's'}`}</strong></article>
        <article className="metric-card"><ClipboardCheck aria-hidden="true" /><span>Sections complete</span><strong>{completedSections}/{sections.length}</strong></article>
        <article className="metric-card"><AlertTriangle aria-hidden="true" /><span>Advisories</span><strong>{warnings}</strong></article>
        <article className="metric-card"><Languages aria-hidden="true" /><span>Language</span><strong>{metadata.find((field) => field.id === 'language')?.value || 'Missing'}</strong></article>
        <article className={specReport && specMissingCount === 0 ? 'metric-card positive' : 'metric-card'}><BrainCircuit aria-hidden="true" /><span>Spec match</span><strong>{specReport ? `${specReport.score}%` : 'Not run'}</strong></article>
      </section>

      <nav className="workflow" aria-label="Compliance workflow progress">
        {workflowSteps.map((step, index) => <span key={step} className={index <= 1 ? 'current' : ''}>{step}</span>)}
      </nav>

      <main id="main-content" className="workspace">
        <aside className={`sidebar ${mobileTocOpen ? 'open' : ''}`} aria-label="Document table of contents">
          <div className="panel-title-row">
            <div>
              <h2><LayoutDashboard size={20} aria-hidden="true" /> Document structure</h2>
              <p>CMS sections remain in approved order. Locked sections should only receive approved variable updates.</p>
            </div>
            <button className="icon-button mobile-only" type="button" onClick={() => setMobileTocOpen(false)} aria-label="Close document structure"><PanelLeftClose size={20} /></button>
          </div>
          <nav className="toc-list" aria-label="CMS section list">
            {sections.map((section) => (
              <button key={section.id} className={section.id === activeSection ? 'toc-item active' : 'toc-item'} style={{ marginLeft: `${(section.level - 1) * 1.1}rem` }} onClick={() => switchSection(section.id)} aria-current={section.id === activeSection ? 'step' : undefined}>
                <span className="toc-kicker">{section.number}</span>
                <strong>{section.title}</strong>
                {section.locked && <em><LockKeyhole size={13} aria-hidden="true" /> locked CMS text</em>}
              </button>
            ))}
          </nav>
        </aside>

        <section className="editor-column" aria-labelledby="editor-heading">
          <div className="mobile-commandbar">
            <button className="secondary-action compact" type="button" onClick={() => setMobileTocOpen(true)}><Menu size={18} aria-hidden="true" /> Sections</button>
            <span aria-live="polite">Editing: {active.number}</span>
          </div>

          <section className="metadata-panel" aria-labelledby="metadata-heading">
            <div className="section-heading-row compact-row">
              <div>
                <p className="eyebrow"><FileText size={16} aria-hidden="true" /> document control</p>
                <h2 id="metadata-heading">Metadata required for CMS traceability</h2>
              </div>
              <span className="assurance-badge"><SearchCheck size={16} aria-hidden="true" /> WCAG-ready labels</span>
            </div>
            <div className="metadata-grid">
              {metadata.map((field) => (
                <label key={field.id} htmlFor={field.id}>
                  <span>{field.label}{field.required ? ' *' : ''}</span>
                  <input id={field.id} value={field.value} onChange={(event) => updateMetadata(field.id, event.target.value)} aria-describedby={`${field.id}-help`} aria-required={field.required} />
                  <small id={`${field.id}-help`}>{field.help}</small>
                </label>
              ))}
            </div>
          </section>

          <section className="authoring-card" aria-labelledby="editor-heading">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">{active.number}</p>
                <h2 id="editor-heading">{active.title}</h2>
              </div>
              {active.locked && <span className="lock-badge"><LockKeyhole size={15} aria-hidden="true" /> CMS standardized text</span>}
            </div>
            <p className="instruction">Use semantic headings, accessible tables, descriptive links, and approved CMS insertions. The editor restricts formatting patterns that commonly break downstream 508/PDF quality.</p>
            <div className="editor-frame" role="region" aria-label={`${active.title} rich text editor`}>
              <Editor
                tinymceScriptSrc="/tinymce/tinymce.min.js"
                licenseKey="gpl"
                value={content[active.id]}
                onEditorChange={(value) => setContent((current) => ({ ...current, [active.id]: value }))}
                init={{
                  height: 460,
                  menubar: false,
                  branding: false,
                  plugins: 'advlist lists link image table code wordcount searchreplace visualblocks autoresize',
                  toolbar: 'undo redo | blocks | bold italic underline | bullist numlist | link image table | removeformat | visualblocks code',
                  block_formats: 'Paragraph=p; Section heading=h2; Subsection heading=h3; Minor heading=h4',
                  table_advtab: false,
                  table_cell_advtab: false,
                  table_row_advtab: false,
                  content_style: 'body{font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.6;color:#111827;margin:1rem} a{color:#174ea6;text-decoration:underline} table{border-collapse:collapse;width:100%;margin:1rem 0} th,td{border:1px solid #4b5563;padding:10px;text-align:left;vertical-align:top} th{background:#eef2ff;color:#111827} h2,h3,h4{line-height:1.25;color:#0f172a}',
                }}
              />
            </div>
          </section>
        </section>

        <aside className="compliance-panel" aria-label="Compliance preflight">
          <div className="panel-title-row">
            <div>
              <h2><Accessibility size={20} aria-hidden="true" /> 501/508 preflight</h2>
              <p>Automated checks support production quality but do not replace final Word and Acrobat accessibility verification.</p>
            </div>
          </div>
          <div className="score-grid" aria-label="Compliance issue counts">
            <span><strong>{errors}</strong> errors</span>
            <span><strong>{warnings}</strong> warnings</span>
          </div>
          <div className="issue-list" aria-live="polite" aria-relevant="additions removals">
            {issues.length === 0 ? <div className="issue passed"><CheckCircle2 size={18} aria-hidden="true" /> <span>All configured checks passed.</span></div> : issues.map((issue) => (
              <article key={issue.id} className={`issue ${issue.severity}`}>
                <AlertTriangle size={18} aria-hidden="true" />
                <div><strong>{issue.label}</strong><p>{issue.detail}</p></div>
              </article>
            ))}
          </div>
          <div className="action-stack">
            <button className="primary-action" onClick={downloadHtml}><Download size={18} aria-hidden="true" /> Export accessible HTML</button>
            <button className="secondary-action" type="button" onClick={exportServerPdf} disabled={isExportingPdf}><FileCheck2 size={18} aria-hidden="true" /> {isExportingPdf ? 'Generating PDF...' : 'Generate server PDF package'}</button>
            {serverExport && <a className="download-link" href={downloadUrl(serverExport.download_url)} target="_blank" rel="noreferrer">Download latest {serverExport.format.toUpperCase()} package</a>}
            <p className="status-text" aria-live="polite">{serverExportStatus}</p>
          </div>
          <section className="spec-review" aria-labelledby="spec-review-heading">
            <div className="panel-title-row compact-row">
              <div>
                <p className="eyebrow"><BrainCircuit size={16} aria-hidden="true" /> spec precision</p>
                <h3 id="spec-review-heading">Compare generated HTML to marked-up SB spec</h3>
              </div>
              {specReport && <span className={specReport.passed ? 'spec-score passed' : 'spec-score warning'}>{specReport.score}%</span>}
            </div>
            <label className="file-picker" htmlFor="spec-file">
              <FileUp size={18} aria-hidden="true" />
              <span>{specFile ? specFile.name : 'Choose marked-up spec PDF'}</span>
              <input id="spec-file" type="file" accept="application/pdf,.pdf" onChange={(event) => setSpecFile(event.target.files?.[0] ?? null)} />
            </label>
            <button className="secondary-action" type="button" onClick={compareAgainstSpec} disabled={isComparingSpec}><SearchCheck size={18} aria-hidden="true" /> {isComparingSpec ? 'Comparing...' : 'Run spec match'}</button>
            <button className="secondary-action ai-action" type="button" onClick={runAiSpecReview} disabled={isAiReviewing}><BrainCircuit size={18} aria-hidden="true" /> {isAiReviewing ? 'Reviewing...' : 'Run AI review'}</button>
            <p className="status-text" aria-live="polite">{specStatus}</p>
            <p className="status-text" aria-live="polite">{aiReviewStatus}</p>
            {specReport && (
              <div className="spec-results">
                <div className="score-grid compact-score">
                  <span><strong>{Math.round(specReport.coverage * 100)}%</strong> coverage</span>
                  <span><strong>{Math.round(specReport.similarity * 100)}%</strong> similarity</span>
                </div>
                <p><strong>Spec words:</strong> {specReport.spec_word_count.toLocaleString()} · <strong>Document words:</strong> {specReport.document_word_count.toLocaleString()}</p>
                {specReport.required_terms_missing.length > 0 && (
                  <article className="issue warning"><AlertTriangle size={18} aria-hidden="true" /><div><strong>Missing SB required terms</strong><p>{specReport.required_terms_missing.slice(0, 8).join(', ')}</p></div></article>
                )}
                {specReport.order_findings.map((finding) => (
                  <article key={`${finding.label}-${finding.evidence ?? 'none'}`} className={`issue ${finding.severity === 'error' ? 'error' : finding.severity === 'warning' ? 'warning' : 'passed'}`}>
                    <CheckCircle2 size={18} aria-hidden="true" />
                    <div><strong>{finding.label}</strong><p>{finding.detail}</p></div>
                  </article>
                ))}
                {specReport.missing_snippets.length > 0 && (
                  <details className="snippet-details">
                    <summary>Review missing spec snippets ({specReport.missing_snippets.length})</summary>
                    {specReport.missing_snippets.slice(0, 6).map((snippet) => <p key={snippet}>{snippet}</p>)}
                  </details>
                )}
                <p className="review-note">{specReport.review_note}</p>
              </div>
            )}
            {aiReview && (
              <div className="spec-results ai-results">
                <div className="score-grid compact-score">
                  <span><strong>{aiReview.verdict.replace('_', ' ')}</strong> verdict</span>
                  <span><strong>{Math.round(aiReview.confidence * 100)}%</strong> confidence</span>
                </div>
                <p><strong>{aiReview.available ? `AI model: ${aiReview.model ?? 'configured model'}` : 'AI unavailable'}.</strong> {aiReview.summary}</p>
                {aiReview.findings.map((finding) => (
                  <article key={`${finding.category}-${finding.issue}`} className={`issue ${finding.severity === 'critical' || finding.severity === 'major' ? 'warning' : 'passed'}`}>
                    <BrainCircuit size={18} aria-hidden="true" />
                    <div><strong>{finding.category}: {finding.issue}</strong><p>{finding.recommendation}{finding.evidence ? ` Evidence: ${finding.evidence}` : ''}</p></div>
                  </article>
                ))}
                {aiReview.next_steps.length > 0 && (
                  <details className="snippet-details" open>
                    <summary>AI reviewer next steps ({aiReview.next_steps.length})</summary>
                    {aiReview.next_steps.map((step) => <p key={step}>{step}</p>)}
                  </details>
                )}
              </div>
            )}
          </section>
          <div className="standard-note"><Sparkles size={18} aria-hidden="true" /><p><strong>WCAG-aligned UI:</strong> visible focus states, labeled inputs, keyboard targets, semantic landmarks, responsive panels, and high-contrast typography.</p></div>
        </aside>
      </main>

      <section className="preview" aria-labelledby="preview-heading">
        <div className="section-heading-row compact-row">
          <div>
            <p className="eyebrow"><ChevronRight size={16} aria-hidden="true" /> semantic output</p>
            <h2 id="preview-heading">Accessible export preview</h2>
          </div>
          <span className="assurance-badge">HTML source preview</span>
        </div>
        <iframe title="Accessible document HTML preview" srcDoc={htmlExport} />
      </section>
    </div>
  )
}

export default App

import { useMemo, useState } from 'react'
import { Editor } from '@tinymce/tinymce-react'
import { Accessibility, AlertTriangle, CheckCircle2, Download, FileCheck2, FileText, Landmark, ShieldCheck } from 'lucide-react'
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
}

type ComplianceIssue = {
  id: string
  severity: 'error' | 'warning'
  label: string
  detail: string
}

const metadataSeed: MetadataField[] = [
  { id: 'documentType', label: 'Document type', value: 'Annual Notice of Change', required: true },
  { id: 'planYear', label: 'Plan year', value: '2026', required: true },
  { id: 'planName', label: 'Plan name', value: 'Example Medicare Advantage Plan', required: true },
  { id: 'contractNumber', label: 'Contract number', value: 'H0000', required: true },
  { id: 'language', label: 'Document language', value: 'en-US', required: true },
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

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Arial,Helvetica,sans-serif;line-height:1.5;max-width:7.625in;margin:0.75in auto;color:#111827}a{color:#174ea6}table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid #374151;padding:.45rem;text-align:left;vertical-align:top}th{background:#eef2ff}h1,h2,h3,h4{page-break-after:avoid}.metadata{display:grid;grid-template-columns:12rem 1fr;gap:.25rem 1rem}.toc-level-2{margin-left:1rem}@page{size:8.5in 11in;margin:.75in}</style></head><body><main><h1>${title}</h1><dl class="metadata">${metadataRows}</dl><nav aria-label="Document table of contents"><h2>Table of Contents</h2><ol>${toc}</ol></nav>${body}</main></body></html>`
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
  const active = sections.find((section) => section.id === activeSection) ?? sections[0]
  const issues = useMemo(() => runCompliance(metadata, sections, content), [metadata, sections, content])
  const htmlExport = useMemo(() => buildHtml(metadata, sections, content), [metadata, sections, content])
  const errors = issues.filter((issue) => issue.severity === 'error').length
  const warnings = issues.filter((issue) => issue.severity === 'warning').length

  const updateMetadata = (id: string, value: string) => setMetadata((items) => items.map((item) => (item.id === id ? { ...item, value } : item)))
  const downloadHtml = () => {
    const blob = new Blob([htmlExport], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'cms-accessible-document.html'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to document editor</a>
      <header className="hero" role="banner">
        <div>
          <p className="eyebrow"><Landmark size={16} aria-hidden="true" /> CMS.gov healthcare document CMS</p>
          <h1>Next-generation ANOC, SB, and EOC authoring cockpit</h1>
          <p>Govern CMS model materials with section-level TinyMCE editing, source-aware compliance guardrails, accessible HTML, Word-ready output, and PDF export readiness.</p>
        </div>
        <div className="status-card" aria-label="Compliance status summary">
          <ShieldCheck size={28} aria-hidden="true" />
          <strong>{errors === 0 ? 'Export preflight ready' : `${errors} blocking issue${errors === 1 ? '' : 's'}`}</strong>
          <span>{warnings} advisory warning{warnings === 1 ? '' : 's'} found</span>
        </div>
      </header>
      <main id="main-content" className="workspace">
        <aside className="sidebar" aria-label="Document table of contents">
          <h2>Document structure</h2>
          <p>CMS sections remain in approved order. Locked sections should only receive approved variable updates.</p>
          <nav>
            {sections.map((section) => (
              <button key={section.id} className={section.id === activeSection ? 'toc-item active' : 'toc-item'} style={{ marginLeft: `${(section.level - 1) * 1.25}rem` }} onClick={() => setActiveSection(section.id)} aria-current={section.id === activeSection ? 'step' : undefined}>
                <span>{section.number}</span><strong>{section.title}</strong>{section.locked && <em>locked text</em>}
              </button>
            ))}
          </nav>
        </aside>
        <section className="editor-column" aria-labelledby="editor-heading">
          <section className="metadata-panel" aria-labelledby="metadata-heading">
            <h2 id="metadata-heading"><FileText size={20} aria-hidden="true" /> Document metadata</h2>
            <div className="metadata-grid">
              {metadata.map((field) => (
                <label key={field.id}><span>{field.label}{field.required ? ' *' : ''}</span><input value={field.value} onChange={(event) => updateMetadata(field.id, event.target.value)} /></label>
              ))}
            </div>
          </section>
          <section className="authoring-card" aria-labelledby="editor-heading">
            <div className="section-heading-row"><div><p className="eyebrow">{active.number}</p><h2 id="editor-heading">{active.title}</h2></div>{active.locked && <span className="lock-badge">CMS standardized text</span>}</div>
            <p className="instruction">Use semantic headings, accessible tables, descriptive links, and approved CMS insertions. This editor intentionally restricts formatting that can break downstream 508/PDF quality.</p>
            <Editor tinymceScriptSrc="/tinymce/tinymce.min.js" value={content[active.id]} onEditorChange={(value) => setContent((current) => ({ ...current, [active.id]: value }))} init={{ height: 420, menubar: false, branding: false, plugins: 'advlist lists link image table code wordcount searchreplace visualblocks', toolbar: 'undo redo | blocks | bold italic underline | bullist numlist | link image table | removeformat | visualblocks code', block_formats: 'Paragraph=p; Section heading=h2; Subsection heading=h3; Minor heading=h4', table_advtab: false, table_cell_advtab: false, table_row_advtab: false, content_style: 'body{font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#111827} table{border-collapse:collapse;width:100%} th,td{border:1px solid #4b5563;padding:8px} th{background:#eef2ff}' }} />
          </section>
        </section>
        <aside className="compliance-panel" aria-label="Compliance preflight">
          <h2><Accessibility size={20} aria-hidden="true" /> 501/508 preflight</h2>
          <p>Automated checks support production quality but do not replace final Word and Acrobat accessibility verification.</p>
          <div className="score-grid"><span><strong>{errors}</strong> errors</span><span><strong>{warnings}</strong> warnings</span></div>
          <div className="issue-list" aria-live="polite">
            {issues.length === 0 ? <div className="issue passed"><CheckCircle2 size={18} aria-hidden="true" /> All configured checks passed.</div> : issues.map((issue) => (
              <article key={issue.id} className={`issue ${issue.severity}`}><AlertTriangle size={18} aria-hidden="true" /><div><strong>{issue.label}</strong><p>{issue.detail}</p></div></article>
            ))}
          </div>
          <button className="primary-action" onClick={downloadHtml}><Download size={18} aria-hidden="true" /> Export accessible HTML</button>
          <button className="secondary-action"><FileCheck2 size={18} aria-hidden="true" /> Request server PDF package</button>
        </aside>
      </main>
      <section className="preview" aria-labelledby="preview-heading"><h2 id="preview-heading">Semantic export preview</h2><iframe title="Accessible document HTML preview" srcDoc={htmlExport} /></section>
    </div>
  )
}

export default App

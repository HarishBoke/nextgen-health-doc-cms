import { useEffect, useMemo, useState } from 'react'
import { Editor } from '@tinymce/tinymce-react'
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Download,
  FileCheck2,
  FileText,
  FileUp,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Palette,
  Plus,
  Save,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react'
import './App.css'

type AuthUser = { id: string; email: string; created_at: string }
type AuthSession = { access_token: string; token_type: string; user: AuthUser }
type ClientProfile = { code: string; name: string; description: string }
type DocumentTypeProfile = { code: string; name: string; description: string; spec_profile: string }
type DocumentStatus = 'draft' | 'in_review' | 'approved' | 'exported'

type RepeaterBlock = {
  id: string
  label: string
  sort_order: number
  html: string
  data: Record<string, string>
}

type AuthoringSection = {
  id: string
  section_key: string
  title: string
  sort_order: number
  html: string
  locked: boolean
  style_profile: Record<string, string>
  repeaters: RepeaterBlock[]
}

type AuthoringPage = {
  id: string
  number: number
  title: string
  sort_order: number
  page_style: Record<string, string>
  sections: AuthoringSection[]
}

type ManagedDocumentSummary = {
  id: string
  title: string
  client_code: string
  document_type: string
  status: DocumentStatus
  page_count: number
  section_count: number
  latest_qa_score: number | null
  updated_at: string
}

type ManagedDocument = {
  id: string
  owner_id: string
  title: string
  client_code: string
  document_type: string
  status: DocumentStatus
  metadata: Record<string, string>
  stylesheet: string
  pages: AuthoringPage[]
  latest_qa_score: number | null
  created_at: string
  updated_at: string
}

type CssInlineWarning = { selector: string; message: string }
type CssInlineResult = { html: string; inlined_html: string; applied_rules: number; skipped_selectors: string[]; warnings: CssInlineWarning[] }
type StyleFinding = { severity: 'error' | 'warning' | 'info'; selector: string; property: string; expected: string; actual: string | null; recommendation: string }
type StyleQaReport = { passed: boolean; score: number; checked_rules: number; findings: StyleFinding[]; created_at: string }
type AiFixSuggestion = { target: string; issue: string; suggested_fix: string; patch_hint: string | null }
type AiFixSuggestionReport = { available: boolean; verdict: string; confidence: number; summary: string; suggestions: AiFixSuggestion[]; created_at: string }

type SpecFinding = { severity: 'error' | 'warning' | 'info'; label: string; detail: string; evidence?: string | null }
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

type ExportArtifact = { format: 'html' | 'pdf'; filename: string; media_type: string; bytes_written: number; download_url: string }
type SideTab = 'stylesheet' | 'spec' | 'style' | 'ai'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
const TOKEN_KEY = 'cms_token'
const USER_KEY = 'cms_user'

const defaultStylesheet = `body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.35; color: #111827; margin: 0.5in; }
h1 { font-size: 24pt; line-height: 1.1; margin: 0 0 18pt; color: #0f172a; }
h2 { font-size: 17pt; line-height: 1.2; margin: 18pt 0 8pt; color: #0f172a; }
h3 { font-size: 13pt; line-height: 1.25; margin: 14pt 0 6pt; color: #1f2937; }
p { margin: 0 0 7pt; }
table { border-collapse: collapse; width: 100%; margin: 10pt 0; }
th, td { border: 1px solid #374151; padding: 7pt; text-align: left; vertical-align: top; }
th { background: #eef2ff; font-weight: 700; }
.benefit-table td:first-child { width: 38%; font-weight: 700; }`

function apiUrl(path: string) {
  return `${API_BASE}${path}`
}

function downloadUrl(path: string) {
  return path.startsWith('http') ? path : apiUrl(path)
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] || char)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function statusLabel(status: DocumentStatus) {
  return status.replace('_', ' ')
}

function createBlankPage(nextNumber: number): AuthoringPage {
  return {
    id: uid('page'),
    number: nextNumber,
    title: `Page ${nextNumber}`,
    sort_order: nextNumber,
    page_style: {},
    sections: [
      {
        id: uid('section'),
        section_key: `page_${nextNumber}_section_1`,
        title: 'New editable section',
        sort_order: 1,
        html: '<p>Enter CMS-approved healthcare document content here.</p>',
        locked: false,
        style_profile: {},
        repeaters: [],
      },
    ],
  }
}

function renderDocumentHtml(document: ManagedDocument) {
  const body = document.pages
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((page) => {
      const sections = page.sections
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((section) => {
          const repeaters = section.repeaters
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((repeater) => `<div class="repeater-block" data-repeater-id="${escapeHtml(repeater.id)}"><h4>${escapeHtml(repeater.label)}</h4>${repeater.html}</div>`)
            .join('\n')
          return `<section data-section-key="${escapeHtml(section.section_key)}"><h2>${escapeHtml(section.title)}</h2>${section.html}${repeaters}</section>`
        })
        .join('\n')
      return `<article class="cms-page" data-page-number="${page.number}"><h1>${escapeHtml(page.title)}</h1>${sections}</article>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(document.title)}</title>
<style>${document.stylesheet || defaultStylesheet}</style>
</head>
<body>
<main>
<header class="document-cover"><p>${escapeHtml(document.client_code)} · ${escapeHtml(document.document_type)} · ${escapeHtml(statusLabel(document.status))}</p><h1>${escapeHtml(document.title)}</h1></header>
${body}
</main>
</body>
</html>`
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  })
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authStatus, setAuthStatus] = useState('')
  const [view, setView] = useState<'auth' | 'list' | 'editor'>(token ? 'list' : 'auth')
  const [clients, setClients] = useState<ClientProfile[]>([])
  const [docTypes, setDocTypes] = useState<DocumentTypeProfile[]>([])
  const [documents, setDocuments] = useState<ManagedDocumentSummary[]>([])
  const [listStatus, setListStatus] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('2026 UHG Summary of Benefits')
  const [newClient, setNewClient] = useState('UHG')
  const [newType, setNewType] = useState('SB')
  const [currentDoc, setCurrentDoc] = useState<ManagedDocument | null>(null)
  const [selectedPageId, setSelectedPageId] = useState('')
  const [sideTab, setSideTab] = useState<SideTab>('stylesheet')
  const [editorStatus, setEditorStatus] = useState('')
  const [specFile, setSpecFile] = useState<File | null>(null)
  const [specReport, setSpecReport] = useState<SpecComparisonReport | null>(null)
  const [aiReview, setAiReview] = useState<AiSpecReviewReport | null>(null)
  const [styleReport, setStyleReport] = useState<StyleQaReport | null>(null)
  const [aiFixes, setAiFixes] = useState<AiFixSuggestionReport | null>(null)
  const [inlineResult, setInlineResult] = useState<CssInlineResult | null>(null)
  const [inlinePreview, setInlinePreview] = useState('')
  const [exportArtifact, setExportArtifact] = useState<ExportArtifact | null>(null)

  const selectedPage = useMemo(() => currentDoc?.pages.find((page) => page.id === selectedPageId) || currentDoc?.pages[0] || null, [currentDoc, selectedPageId])
  const selectedDocType = docTypes.find((type) => type.code === currentDoc?.document_type)
  const selectedClient = clients.find((client) => client.code === currentDoc?.client_code)
  const totalSections = currentDoc?.pages.reduce((total, page) => total + page.sections.length, 0) || 0

  async function request<T>(path: string, options: RequestInit = {}, authenticated = false): Promise<T> {
    const headers = new Headers(options.headers)
    if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    if (authenticated && token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    const response = await fetch(apiUrl(path), { ...options, headers })
    if (response.status === 401) {
      logout()
      throw new Error('Your session expired. Please sign in again.')
    }
    if (!response.ok) {
      const detail = await response.text()
      throw new Error(detail || `Request failed with HTTP ${response.status}`)
    }
    const contentType = response.headers.get('content-type') || ''
    return (contentType.includes('application/json') ? await response.json() : await response.text()) as T
  }

  async function loadCatalog() {
    const [clientRows, typeRows] = await Promise.all([
      request<ClientProfile[]>('/api/v1/catalog/clients'),
      request<DocumentTypeProfile[]>('/api/v1/catalog/document-types'),
    ])
    setClients(clientRows)
    setDocTypes(typeRows)
    setNewClient(clientRows[0]?.code || 'UHG')
    setNewType(typeRows[0]?.code || 'SB')
  }

  async function loadDocuments() {
    if (!token) return
    setListStatus('Loading your document workspace...')
    const rows = await request<ManagedDocumentSummary[]>('/api/v1/managed-documents', {}, true)
    setDocuments(rows)
    setListStatus(rows.length ? `${rows.length} managed document${rows.length === 1 ? '' : 's'} loaded.` : 'No documents yet. Create an ANOC, EOC, or SB document to begin.')
  }

  useEffect(() => {
    loadCatalog().catch((error: unknown) => setListStatus(error instanceof Error ? error.message : 'Unable to load catalog.'))
  }, [])

  useEffect(() => {
    if (token) {
      loadDocuments().catch((error: unknown) => setListStatus(error instanceof Error ? error.message : 'Unable to load documents.'))
    }
  }, [token])

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken('')
    setUser(null)
    setView('auth')
    setCurrentDoc(null)
  }

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsBusy(true)
    setAuthStatus(authMode === 'signup' ? 'Creating secure account...' : 'Signing in...')
    try {
      const session = await request<AuthSession>(`/api/v1/auth/${authMode}`, {
        method: 'POST',
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      })
      localStorage.setItem(TOKEN_KEY, session.access_token)
      localStorage.setItem(USER_KEY, JSON.stringify(session.user))
      setToken(session.access_token)
      setUser(session.user)
      setView('list')
      setAuthStatus('Authenticated. Loading workspace...')
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : 'Authentication failed.')
    } finally {
      setIsBusy(false)
    }
  }

  async function createDocument() {
    setIsBusy(true)
    setListStatus('Creating document from the selected client and CMS document type...')
    try {
      const doc = await request<ManagedDocument>('/api/v1/managed-documents', {
        method: 'POST',
        body: JSON.stringify({ title: newTitle, client_code: newClient, document_type: newType, metadata: { created_from: 'web-ui' } }),
      }, true)
      if (!doc.stylesheet) doc.stylesheet = defaultStylesheet
      setCreateOpen(false)
      setCurrentDoc(doc)
      setSelectedPageId(doc.pages[0]?.id || '')
      setView('editor')
      await loadDocuments()
    } catch (error) {
      setListStatus(error instanceof Error ? error.message : 'Unable to create document.')
    } finally {
      setIsBusy(false)
    }
  }

  async function openDocument(id: string) {
    setIsBusy(true)
    setListStatus('Opening document...')
    try {
      const doc = await request<ManagedDocument>(`/api/v1/managed-documents/${id}`, {}, true)
      if (!doc.stylesheet) doc.stylesheet = defaultStylesheet
      setCurrentDoc(doc)
      setSelectedPageId(doc.pages[0]?.id || '')
      setSpecReport(null)
      setAiReview(null)
      setStyleReport(null)
      setAiFixes(null)
      setInlineResult(null)
      setInlinePreview('')
      setExportArtifact(null)
      setView('editor')
    } catch (error) {
      setListStatus(error instanceof Error ? error.message : 'Unable to open document.')
    } finally {
      setIsBusy(false)
    }
  }

  async function deleteDocument(id: string) {
    if (!window.confirm('Delete this managed document? This action cannot be undone.')) return
    setIsBusy(true)
    try {
      await request<{ deleted: boolean }>(`/api/v1/managed-documents/${id}`, { method: 'DELETE' }, true)
      await loadDocuments()
    } catch (error) {
      setListStatus(error instanceof Error ? error.message : 'Unable to delete document.')
    } finally {
      setIsBusy(false)
    }
  }

  function patchDocument(patch: Partial<ManagedDocument>) {
    setCurrentDoc((doc) => (doc ? { ...doc, ...patch } : doc))
  }

  function patchPage(pageId: string, patch: Partial<AuthoringPage>) {
    setCurrentDoc((doc) => doc ? { ...doc, pages: doc.pages.map((page) => page.id === pageId ? { ...page, ...patch } : page) } : doc)
  }

  function patchSection(pageId: string, sectionId: string, patch: Partial<AuthoringSection>) {
    setCurrentDoc((doc) => doc ? {
      ...doc,
      pages: doc.pages.map((page) => page.id === pageId ? { ...page, sections: page.sections.map((section) => section.id === sectionId ? { ...section, ...patch } : section) } : page),
    } : doc)
  }

  function patchRepeater(pageId: string, sectionId: string, repeaterId: string, patch: Partial<RepeaterBlock>) {
    setCurrentDoc((doc) => doc ? {
      ...doc,
      pages: doc.pages.map((page) => page.id === pageId ? {
        ...page,
        sections: page.sections.map((section) => section.id === sectionId ? { ...section, repeaters: section.repeaters.map((repeater) => repeater.id === repeaterId ? { ...repeater, ...patch } : repeater) } : section),
      } : page),
    } : doc)
  }

  function addPage() {
    setCurrentDoc((doc) => {
      if (!doc) return doc
      const page = createBlankPage(doc.pages.length + 1)
      setSelectedPageId(page.id)
      return { ...doc, pages: [...doc.pages, page] }
    })
  }

  function addSection(pageId: string) {
    setCurrentDoc((doc) => doc ? {
      ...doc,
      pages: doc.pages.map((page) => {
        if (page.id !== pageId) return page
        const next = page.sections.length + 1
        return {
          ...page,
          sections: [...page.sections, { id: uid('section'), section_key: `page_${page.number}_section_${next}`, title: `Section ${next}`, sort_order: next, html: '<p>New page section content.</p>', locked: false, style_profile: {}, repeaters: [] }],
        }
      }),
    } : doc)
  }

  function addRepeater(pageId: string, sectionId: string) {
    setCurrentDoc((doc) => doc ? {
      ...doc,
      pages: doc.pages.map((page) => page.id === pageId ? {
        ...page,
        sections: page.sections.map((section) => {
          if (section.id !== sectionId) return section
          const next = section.repeaters.length + 1
          return { ...section, repeaters: [...section.repeaters, { id: uid('repeater'), label: `Repeater ${next}`, sort_order: next, html: '<p>Repeated benefit, plan, or location-specific content.</p>', data: {} }] }
        }),
      } : page),
    } : doc)
  }

  function deleteSection(pageId: string, sectionId: string) {
    patchPage(pageId, { sections: selectedPage?.sections.filter((section) => section.id !== sectionId) || [] })
  }

  function deleteRepeater(pageId: string, sectionId: string, repeaterId: string) {
    const section = selectedPage?.sections.find((item) => item.id === sectionId)
    if (section) patchSection(pageId, sectionId, { repeaters: section.repeaters.filter((repeater) => repeater.id !== repeaterId) })
  }

  function moveSection(pageId: string, sectionId: string, direction: -1 | 1) {
    const page = currentDoc?.pages.find((item) => item.id === pageId)
    if (!page) return
    const sections = page.sections.slice().sort((a, b) => a.sort_order - b.sort_order)
    const index = sections.findIndex((section) => section.id === sectionId)
    const target = index + direction
    if (target < 0 || target >= sections.length) return
    const [removed] = sections.splice(index, 1)
    sections.splice(target, 0, removed)
    patchPage(pageId, { sections: sections.map((section, sortIndex) => ({ ...section, sort_order: sortIndex + 1 })) })
  }

  async function saveDocument() {
    if (!currentDoc) return null
    setIsBusy(true)
    setEditorStatus('Saving pages, sections, repeaters, metadata, and stylesheet...')
    try {
      const saved = await request<ManagedDocument>(`/api/v1/managed-documents/${currentDoc.id}`, {
        method: 'PUT',
        body: JSON.stringify({ title: currentDoc.title, status: currentDoc.status, metadata: currentDoc.metadata, stylesheet: currentDoc.stylesheet, pages: currentDoc.pages }),
      }, true)
      setCurrentDoc(saved)
      setSelectedPageId(selectedPageId || saved.pages[0]?.id || '')
      setEditorStatus('Saved successfully.')
      await loadDocuments()
      return saved
    } catch (error) {
      setEditorStatus(error instanceof Error ? error.message : 'Unable to save document.')
      return null
    } finally {
      setIsBusy(false)
    }
  }

  async function getManagedHtml(inline = true) {
    const saved = await saveDocument()
    if (!saved) throw new Error('Save failed; export aborted.')
    const response = await fetch(apiUrl(`/api/v1/managed-documents/${saved.id}/html?inline=${inline}`), { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error(await response.text())
    return response.text()
  }

  async function runCssInline() {
    if (!currentDoc) return
    setIsBusy(true)
    setEditorStatus('Applying pasted stylesheet selectors as inline styles...')
    try {
      const result = await request<CssInlineResult>('/api/v1/tools/inline-css', {
        method: 'POST',
        body: JSON.stringify({ html: renderDocumentHtml(currentDoc), css: currentDoc.stylesheet || defaultStylesheet }),
      })
      setInlineResult(result)
      setInlinePreview(result.inlined_html)
      setEditorStatus(`Inline conversion complete: ${result.applied_rules} selector rule${result.applied_rules === 1 ? '' : 's'} applied.`)
    } catch (error) {
      setEditorStatus(error instanceof Error ? error.message : 'Unable to inline stylesheet.')
    } finally {
      setIsBusy(false)
    }
  }

  async function runStyleQa() {
    if (!currentDoc) return
    setIsBusy(true)
    setSideTab('style')
    setEditorStatus('Running deterministic style QA against the document type profile...')
    try {
      await saveDocument()
      const report = await request<StyleQaReport>(`/api/v1/managed-documents/${currentDoc.id}/style-qa`, { method: 'POST', body: '{}' }, true)
      setStyleReport(report)
      setEditorStatus(report.passed ? `Style QA passed at ${report.score}%.` : `Style QA found ${report.findings.length} issue(s); score ${report.score}%.`)
      patchDocument({ latest_qa_score: report.score })
    } catch (error) {
      setEditorStatus(error instanceof Error ? error.message : 'Unable to run style QA.')
    } finally {
      setIsBusy(false)
    }
  }

  async function runAiFixes() {
    if (!currentDoc) return
    setIsBusy(true)
    setSideTab('ai')
    setEditorStatus('Requesting AI style-fix suggestions with concrete patch guidance...')
    try {
      await saveDocument()
      const report = await request<AiFixSuggestionReport>(`/api/v1/managed-documents/${currentDoc.id}/ai-style-fixes`, { method: 'POST', body: '{}' }, true)
      setAiFixes(report)
      setEditorStatus(report.available ? `AI fix suggestions completed: ${report.verdict}.` : report.summary)
    } catch (error) {
      setEditorStatus(error instanceof Error ? error.message : 'Unable to request AI fix suggestions.')
    } finally {
      setIsBusy(false)
    }
  }

  async function runSpecCompare() {
    if (!specFile || !currentDoc) {
      setEditorStatus('Upload a PDF specification before running spec match.')
      return
    }
    setIsBusy(true)
    setSideTab('spec')
    setEditorStatus('Extracting PDF specification text and comparing against generated document HTML...')
    try {
      const formData = new FormData()
      formData.append('spec_file', specFile)
      formData.append('html', renderDocumentHtml(currentDoc))
      const report = await request<SpecComparisonReport>('/api/v1/specs/compare-html', { method: 'POST', body: formData })
      setSpecReport(report)
      setEditorStatus(report.passed ? `Spec match passed at ${report.score}%.` : `Spec match needs review; score ${report.score}%.`)
    } catch (error) {
      setEditorStatus(error instanceof Error ? error.message : 'Unable to run spec match.')
    } finally {
      setIsBusy(false)
    }
  }

  async function runAiSpecReview() {
    if (!specFile || !currentDoc) {
      setEditorStatus('Upload a PDF specification before running AI review.')
      return
    }
    setIsBusy(true)
    setSideTab('ai')
    setEditorStatus('Requesting AI semantic review against the uploaded specification...')
    try {
      const formData = new FormData()
      formData.append('spec_file', specFile)
      formData.append('html', renderDocumentHtml(currentDoc))
      const report = await request<AiSpecReviewReport>('/api/v1/specs/ai-review-html', { method: 'POST', body: formData })
      setAiReview(report)
      setEditorStatus(report.available ? `AI spec review completed: ${report.verdict}.` : report.summary)
    } catch (error) {
      setEditorStatus(error instanceof Error ? error.message : 'Unable to run AI spec review.')
    } finally {
      setIsBusy(false)
    }
  }

  async function exportPackage(format: 'html' | 'pdf') {
    setIsBusy(true)
    setEditorStatus(format === 'pdf' ? 'Generating server PDF package with inline styles...' : 'Generating server HTML package with inline styles...')
    try {
      const html = await getManagedHtml(true)
      const artifact = await request<ExportArtifact>(`/api/v1/exports/${format}-package`, {
        method: 'POST',
        body: JSON.stringify({ html, filename: currentDoc?.title || 'cms-document' }),
      })
      setExportArtifact(artifact)
      setEditorStatus(`${format.toUpperCase()} export is ready: ${artifact.filename}.`)
      window.open(downloadUrl(artifact.download_url), '_blank', 'noopener,noreferrer')
    } catch (error) {
      setEditorStatus(error instanceof Error ? error.message : `Unable to export ${format.toUpperCase()}.`)
    } finally {
      setIsBusy(false)
    }
  }

  const editorInit = {
    height: 320,
    menubar: false,
    branding: false,
    plugins: 'advlist lists link image table code wordcount searchreplace visualblocks autoresize',
    toolbar: 'undo redo | blocks | bold italic underline | bullist numlist | link image table | removeformat | visualblocks code',
    block_formats: 'Paragraph=p; Section heading=h2; Subsection heading=h3; Minor heading=h4',
    table_advtab: false,
    table_cell_advtab: false,
    table_row_advtab: false,
    content_style: currentDoc?.stylesheet || defaultStylesheet,
  }

  if (view === 'auth') {
    return (
      <main className="auth-shell">
        <section className="auth-hero" aria-labelledby="auth-heading">
          <div className="brand-lockup"><ShieldCheck size={34} /><span>Healthcare Document CMS</span></div>
          <h1 id="auth-heading">CMS-compliant document authoring for SB, ANOC, and EOC workflows.</h1>
          <p>Sign in to manage client-specific healthcare documents, edit page-level sections, apply pasted CSS as inline styles, run deterministic QA, request AI fixes, and export PDF-ready packages.</p>
          <div className="auth-feature-grid">
            <span><FileText /> Managed documents</span>
            <span><Palette /> CSS to inline</span>
            <span><SearchCheck /> Spec comparison</span>
            <span><BrainCircuit /> AI fix content</span>
          </div>
        </section>
        <section className="auth-card" aria-label="Authentication form">
          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')} type="button">Log in</button>
            <button className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')} type="button">Sign up</button>
          </div>
          <form onSubmit={submitAuth}>
            <label>Email address<input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required autoComplete="email" /></label>
            <label>Password<input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} required minLength={authMode === 'signup' ? 8 : 1} autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} /></label>
            <button className="primary-action full" type="submit" disabled={isBusy}>{isBusy ? 'Please wait...' : authMode === 'signup' ? 'Create secure account' : 'Log in'}</button>
          </form>
          <p className="status-text" aria-live="polite">{authStatus}</p>
        </section>
      </main>
    )
  }

  if (view === 'list') {
    return (
      <div className="app-shell list-shell">
        <header className="topbar">
          <div><p className="eyebrow">CMS.gov healthcare document CMS</p><h1>Document workspace</h1><p>Choose a client and document type, then author pages, sections, repeaters, stylesheet, and QA outputs.</p></div>
          <div className="topbar-actions"><span className="user-pill"><UserRound size={16} /> {user?.email}</span><button className="secondary-action" onClick={logout}><LogOut size={16} /> Log out</button></div>
        </header>
        <section className="catalog-strip" aria-label="Available document catalog">
          {docTypes.map((type) => <article key={type.code}><strong>{type.code}</strong><span>{type.name}</span><em>{type.spec_profile}</em></article>)}
        </section>
        <section className="list-toolbar">
          <div><h2>Your managed documents</h2><p className="status-text">{listStatus}</p></div>
          <button className="primary-action" onClick={() => setCreateOpen(true)}><Plus size={18} /> New document</button>
        </section>
        {createOpen && (
          <section className="create-panel" aria-label="Create new managed document">
            <label>Document title<input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} /></label>
            <label>Client<select value={newClient} onChange={(event) => setNewClient(event.target.value)}>{clients.map((client) => <option key={client.code} value={client.code}>{client.name} ({client.code})</option>)}</select></label>
            <label>Document type<select value={newType} onChange={(event) => setNewType(event.target.value)}>{docTypes.map((type) => <option key={type.code} value={type.code}>{type.name} ({type.code})</option>)}</select></label>
            <div className="panel-actions"><button className="secondary-action" onClick={() => setCreateOpen(false)}>Cancel</button><button className="primary-action" disabled={isBusy || !newTitle.trim()} onClick={createDocument}>Create and open</button></div>
          </section>
        )}
        <section className="document-grid">
          {documents.map((doc) => (
            <article className="document-card" key={doc.id}>
              <button className="document-open" onClick={() => openDocument(doc.id)}>
                <span className="doc-type-badge">{doc.document_type}</span>
                <h3>{doc.title}</h3>
                <p>{doc.client_code} · {doc.page_count} pages · {doc.section_count} sections</p>
                <small>Updated {formatDate(doc.updated_at)}</small>
              </button>
              <div className="document-card-footer"><span className={`status-badge ${doc.status}`}>{statusLabel(doc.status)}</span><span className="qa-badge">QA {doc.latest_qa_score ?? 'not run'}</span><button className="icon-button danger" aria-label={`Delete ${doc.title}`} onClick={() => deleteDocument(doc.id)}><Trash2 size={16} /></button></div>
            </article>
          ))}
        </section>
      </div>
    )
  }

  if (!currentDoc || !selectedPage) {
    return <main className="app-shell"><button className="secondary-action" onClick={() => setView('list')}>Back to list</button><p>No document is open.</p></main>
  }

  return (
    <div className="app-shell editor-shell">
      <header className="editor-topbar">
        <button className="secondary-action compact" onClick={() => { setView('list'); loadDocuments().catch(() => undefined) }}><ArrowLeft size={16} /> Back</button>
        <div className="editor-title-block">
          <input className="title-input" value={currentDoc.title} onChange={(event) => patchDocument({ title: event.target.value })} aria-label="Document title" />
          <div className="doc-meta-row"><span>{selectedClient?.name || currentDoc.client_code}</span><span>{selectedDocType?.name || currentDoc.document_type}</span><span className={`status-badge ${currentDoc.status}`}>{statusLabel(currentDoc.status)}</span><span>QA {currentDoc.latest_qa_score ?? 'not run'}</span></div>
        </div>
        <div className="editor-actions">
          <select value={currentDoc.status} onChange={(event) => patchDocument({ status: event.target.value as DocumentStatus })} aria-label="Document status"><option value="draft">Draft</option><option value="in_review">In review</option><option value="approved">Approved</option><option value="exported">Exported</option></select>
          <button className="secondary-action compact" disabled={isBusy} onClick={saveDocument}><Save size={16} /> Save</button>
          <button className="secondary-action compact" disabled={isBusy} onClick={() => exportPackage('html')}><Download size={16} /> HTML</button>
          <button className="primary-action compact" disabled={isBusy} onClick={() => exportPackage('pdf')}><FileCheck2 size={16} /> PDF</button>
        </div>
      </header>

      <main className="authoring-layout">
        <aside className="page-rail" aria-label="Document pages">
          <div className="rail-heading"><h2><LayoutDashboard size={18} /> Pages</h2><button className="icon-button" onClick={addPage} aria-label="Add page"><Plus size={16} /></button></div>
          {currentDoc.pages.slice().sort((a, b) => a.sort_order - b.sort_order).map((page) => (
            <button key={page.id} className={page.id === selectedPage.id ? 'page-item active' : 'page-item'} onClick={() => setSelectedPageId(page.id)}><strong>Page {page.number}</strong><span>{page.title}</span><em>{page.sections.length} section{page.sections.length === 1 ? '' : 's'}</em></button>
          ))}
          <div className="rail-summary"><strong>{currentDoc.pages.length}</strong> pages<br /><strong>{totalSections}</strong> sections</div>
        </aside>

        <section className="section-editor" aria-label="Selected page editor">
          <div className="page-heading-card">
            <label>Page title<input value={selectedPage.title} onChange={(event) => patchPage(selectedPage.id, { title: event.target.value })} /></label>
            <label>Page number<input type="number" value={selectedPage.number} onChange={(event) => patchPage(selectedPage.id, { number: Number(event.target.value) })} /></label>
            <button className="primary-action compact" onClick={() => addSection(selectedPage.id)}><Plus size={16} /> Add section</button>
          </div>

          {selectedPage.sections.slice().sort((a, b) => a.sort_order - b.sort_order).map((section, index) => (
            <article className="section-card" key={section.id}>
              <div className="section-card-header">
                <div><p className="eyebrow">Section {index + 1} · {section.section_key}</p><input className="section-title-input" value={section.title} onChange={(event) => patchSection(selectedPage.id, section.id, { title: event.target.value })} /></div>
                <div className="section-controls">
                  {section.locked && <span className="lock-badge"><LockKeyhole size={14} /> locked</span>}
                  <button className="icon-button" onClick={() => moveSection(selectedPage.id, section.id, -1)} aria-label="Move section up"><ChevronUp size={16} /></button>
                  <button className="icon-button" onClick={() => moveSection(selectedPage.id, section.id, 1)} aria-label="Move section down"><ChevronDown size={16} /></button>
                  <button className="icon-button danger" disabled={section.locked} onClick={() => deleteSection(selectedPage.id, section.id)} aria-label="Delete section"><Trash2 size={16} /></button>
                </div>
              </div>
              <Editor tinymceScriptSrc="/tinymce/tinymce.min.js" licenseKey="gpl" value={section.html} onEditorChange={(value) => patchSection(selectedPage.id, section.id, { html: value })} init={editorInit} />
              <div className="repeater-heading"><h3>Repeaters</h3><button className="secondary-action compact" onClick={() => addRepeater(selectedPage.id, section.id)}><Plus size={15} /> Add repeater</button></div>
              {section.repeaters.map((repeater) => (
                <div className="repeater-card" key={repeater.id}>
                  <div className="repeater-title-row"><input value={repeater.label} onChange={(event) => patchRepeater(selectedPage.id, section.id, repeater.id, { label: event.target.value })} aria-label="Repeater label" /><button className="icon-button danger" onClick={() => deleteRepeater(selectedPage.id, section.id, repeater.id)} aria-label="Delete repeater"><Trash2 size={15} /></button></div>
                  <Editor tinymceScriptSrc="/tinymce/tinymce.min.js" licenseKey="gpl" value={repeater.html} onEditorChange={(value) => patchRepeater(selectedPage.id, section.id, repeater.id, { html: value })} init={{ ...editorInit, height: 220 }} />
                </div>
              ))}
            </article>
          ))}
        </section>

        <aside className="qa-panel" aria-label="Stylesheet, specification, style QA, and AI panels">
          <div className="qa-tabs" role="tablist" aria-label="Review tools">
            {(['stylesheet', 'spec', 'style', 'ai'] as SideTab[]).map((tab) => <button key={tab} className={sideTab === tab ? 'active' : ''} onClick={() => setSideTab(tab)}>{tab}</button>)}
          </div>

          {sideTab === 'stylesheet' && (
            <section className="qa-section"><h2><Palette size={18} /> Stylesheet and inlining</h2><p>Paste external CSS selectors here. TinyMCE uses this CSS while editing, and the inliner outputs HTML with selector-matched inline styles for PDF stability.</p><textarea className="css-textarea" value={currentDoc.stylesheet} onChange={(event) => patchDocument({ stylesheet: event.target.value })} placeholder={defaultStylesheet} /><button className="primary-action full" disabled={isBusy} onClick={runCssInline}><Sparkles size={16} /> Apply and inline CSS</button>{inlineResult && <div className="result-card"><strong>{inlineResult.applied_rules} rules applied</strong><p>{inlineResult.skipped_selectors.length} skipped selectors · {inlineResult.warnings.length} warnings</p>{inlineResult.warnings.map((warning) => <p key={`${warning.selector}-${warning.message}`}><strong>{warning.selector}:</strong> {warning.message}</p>)}<textarea value={inlinePreview} onChange={(event) => setInlinePreview(event.target.value)} aria-label="Inlined HTML output" /></div>}</section>
          )}

          {sideTab === 'spec' && (
            <section className="qa-section"><h2><SearchCheck size={18} /> Spec comparison</h2><label className="file-picker"><FileUp size={18} /><span>{specFile ? specFile.name : 'Upload marked-up spec PDF'}</span><input type="file" accept="application/pdf,.pdf" onChange={(event) => setSpecFile(event.target.files?.[0] || null)} /></label><button className="secondary-action full" disabled={isBusy} onClick={runSpecCompare}><SearchCheck size={16} /> Run spec match</button>{specReport && <div className="result-card"><div className={specReport.passed ? 'score passed' : 'score warning'}>{specReport.score}%</div><p>{Math.round(specReport.coverage * 100)}% coverage · {Math.round(specReport.similarity * 100)}% similarity</p><p><strong>Missing required terms:</strong> {specReport.required_terms_missing.length ? specReport.required_terms_missing.join(', ') : 'None'}</p>{specReport.order_findings.map((finding) => <article className={`finding ${finding.severity}`} key={`${finding.label}-${finding.detail}`}><strong>{finding.label}</strong><p>{finding.detail}</p></article>)}<p className="review-note">{specReport.review_note}</p></div>}</section>
          )}

          {sideTab === 'style' && (
            <section className="qa-section"><h2><ClipboardCheck size={18} /> Style QA</h2><p>Runs deterministic checks for the selected document type and client, including font, line-height, spacing, table, and heading expectations.</p><button className="primary-action full" disabled={isBusy} onClick={runStyleQa}><ClipboardCheck size={16} /> Run style QA</button>{styleReport && <div className="result-card"><div className={styleReport.passed ? 'score passed' : 'score warning'}>{styleReport.score}%</div><p>{styleReport.checked_rules} rules checked · {styleReport.findings.length} findings</p>{styleReport.findings.length === 0 ? <p><CheckCircle2 size={16} /> All configured style requirements passed.</p> : styleReport.findings.map((finding) => <article className={`finding ${finding.severity}`} key={`${finding.selector}-${finding.property}-${finding.expected}`}><strong>{finding.selector} · {finding.property}</strong><p>Expected {finding.expected}; actual {finding.actual || 'missing'}.</p><p>{finding.recommendation}</p></article>)}</div>}</section>
          )}

          {sideTab === 'ai' && (
            <section className="qa-section"><h2><BrainCircuit size={18} /> AI review and fixes</h2><button className="secondary-action full" disabled={isBusy} onClick={runAiSpecReview}><BrainCircuit size={16} /> Run AI spec review</button><button className="primary-action full" disabled={isBusy} onClick={runAiFixes}><Sparkles size={16} /> Get AI style fixes</button>{aiReview && <div className="result-card"><strong>Spec verdict: {aiReview.verdict}</strong><p>{aiReview.summary}</p>{aiReview.findings.map((finding) => <article className={`finding ${finding.severity}`} key={`${finding.issue}-${finding.category}`}><strong>{finding.category}: {finding.issue}</strong><p>{finding.recommendation}</p></article>)}</div>}{aiFixes && <div className="result-card"><strong>Fix verdict: {aiFixes.verdict} · {Math.round(aiFixes.confidence * 100)}% confidence</strong><p>{aiFixes.summary}</p>{aiFixes.suggestions.map((suggestion) => <article className="finding info" key={`${suggestion.target}-${suggestion.issue}`}><strong>{suggestion.target}</strong><p>{suggestion.issue}</p><pre>{suggestion.suggested_fix}</pre>{suggestion.patch_hint && <p><strong>Patch hint:</strong> {suggestion.patch_hint}</p>}</article>)}</div>}</section>
          )}

          <div className="status-dock" aria-live="polite"><AlertTriangle size={16} /><span>{editorStatus || 'Ready. Save before production export or QA.'}</span></div>
          {exportArtifact && <a className="download-link" href={downloadUrl(exportArtifact.download_url)} target="_blank" rel="noreferrer">Download latest {exportArtifact.format.toUpperCase()} package</a>}
        </aside>
      </main>
    </div>
  )
}

export default App

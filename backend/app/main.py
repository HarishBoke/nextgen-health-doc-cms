from __future__ import annotations

import re
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from weasyprint import HTML

from app.core.schemas import (
    AdHocExportArtifact,
    AiFixSuggestionReport,
    AiSpecReviewReport,
    AuthLogin,
    AuthSession,
    AuthSignup,
    AuthUser,
    AuthoringPage,
    AuthoringSection,
    ClientProfile,
    CssInlineResult,
    DocumentCreate,
    DocumentInstance,
    DocumentType,
    DocumentTypeProfile,
    ExportArtifact,
    GeneratedHtmlPayload,
    ManagedDocument,
    ManagedDocumentCreate,
    ManagedDocumentSummary,
    ManagedDocumentUpdate,
    RepeaterBlock,
    SectionContent,
    SectionHtmlUpdate,
    SectionRule,
    SectionUpdate,
    SpecComparisonReport,
    StyleQaPayload,
    StyleQaReport,
    StylesheetPayload,
    Template,
    TemplateSection,
)
from app.services.auth_store import authenticate_user, create_token, create_user, delete_document_for_user, get_document_for_user, get_user, init_store, list_documents, save_document
from app.services.compliance import run_document_preflight
from app.services.spec_compare import ai_review_spec_to_html, compare_spec_to_html, extract_spec_text_from_pdf
from app.services.style_tools import ai_suggest_style_fixes, inline_css, render_managed_document_html, run_style_qa

ROOT_DIR = Path(__file__).resolve().parents[2]
EXPORT_DIR = ROOT_DIR / "storage" / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)
init_store()


def _safe_export_name(filename: str, extension: str) -> str:
    stem = Path(filename).stem or "cms-accessible-document"
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip(".-_") or "cms-accessible-document"
    return f"{stem}-{uuid4().hex[:10]}.{extension}"

app = FastAPI(
    title="Healthcare Document CMS API",
    version="0.1.0",
    description="CMS.gov model-document authoring API with accessibility preflight and PDF export readiness.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMPLATES: dict[str, Template] = {
    "cms-2026-anoc-hmo-mapd": Template(
        id="cms-2026-anoc-hmo-mapd",
        name="CMS CY 2026 ANOC HMO MAPD Base Template",
        document_type=DocumentType.anoc,
        cms_year=2026,
        source_files=[
            "official_guidelines/cms_cy2026/unpacked/anoc_models/DRAFT_CY2026_1_HMO_MAPD_ISNP_CSNP_ANOC_FINAL.docx",
            "official_guidelines/cms_cy2026/unpacked/CY2026 ANOC ErrataModel_FINAL_06162025_508.docx",
        ],
        sections=[
            TemplateSection(
                id="cover",
                number="Cover",
                title="Annual Notice of Change for 2026",
                level=1,
                default_html="<p><strong>This material describes changes to our plan’s costs and benefits next year.</strong></p><p>You have from October 15 through December 7 to make changes to your Medicare coverage for next year.</p>",
                rules=SectionRule(locked=True, required=True, cms_source_note="CMS standardized cover language; update only approved insertions."),
            ),
            TemplateSection(
                id="summary-costs",
                number="Summary",
                title="Summary of Important Costs for 2026",
                level=1,
                default_html="<p>The table below compares important plan costs for this year and next year.</p><table><thead><tr><th scope='col'>Cost</th><th scope='col'>2025</th><th scope='col'>2026</th></tr></thead><tbody><tr><td>Monthly plan premium</td><td>[insert]</td><td>[insert]</td></tr></tbody></table>",
            ),
            TemplateSection(
                id="benefit-changes",
                number="SECTION 1",
                title="Changes to Benefits & Costs for Next Year",
                level=1,
                default_html="<p>Describe approved plan-specific benefit and cost changes while preserving CMS section order.</p>",
            ),
            TemplateSection(
                id="provider-network",
                number="Section 1.3",
                title="Changes to the Provider Network",
                level=2,
                default_html="<p>Explain provider network changes, directory availability, and member options.</p>",
            ),
            TemplateSection(
                id="part-d",
                number="Section 1.6",
                title="Changes to Part D Drug Coverage",
                level=2,
                default_html="<p>Describe formulary, tier, restriction, deductible, initial coverage, and catastrophic-stage changes.</p>",
            ),
            TemplateSection(
                id="questions",
                number="SECTION 5",
                title="Questions?",
                level=1,
                default_html="<p>Call Member Services at <strong>[insert phone]</strong> (TTY users call <strong>[insert TTY]</strong>). This call is free.</p>",
            ),
        ],
    )
}

DOCUMENTS: dict[str, DocumentInstance] = {}


def _template_or_404(template_id: str) -> Template:
    template = TEMPLATES.get(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


def _document_or_404(document_id: str) -> DocumentInstance:
    document = DOCUMENTS.get(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


def _render_accessible_html(document: DocumentInstance, template: Template) -> str:
    content_by_section = {section.section_id: section.html for section in document.sections}
    toc = "".join(
        f"<li class='toc-level-{section.level}'><a href='#{section.id}'>{section.number} {section.title}</a></li>"
        for section in template.sections
    )
    body = "".join(
        f"<section id='{section.id}' aria-labelledby='heading-{section.id}'><h{min(section.level + 1, 4)} id='heading-{section.id}'>{section.number} {section.title}</h{min(section.level + 1, 4)}>{content_by_section.get(section.id, '')}</section>"
        for section in template.sections
    )
    return f"""<!doctype html>
<html lang="{document.language}">
<head>
  <meta charset="utf-8" />
  <title>{document.plan_name} {template.name}</title>
  <meta name="author" content="Healthcare Document CMS" />
  <style>
    body {{ font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #111827; max-width: 7.625in; margin: 0.75in auto; }}
    h1, h2, h3, h4 {{ page-break-after: avoid; }}
    a {{ color: #174ea6; }}
    table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; }}
    th, td {{ border: 1px solid #374151; padding: 0.45rem; text-align: left; vertical-align: top; }}
    th {{ background: #eef2ff; }}
    .metadata {{ display: grid; grid-template-columns: 12rem 1fr; gap: 0.25rem 1rem; }}
    .toc-level-2 {{ margin-left: 1rem; }}
    @page {{ size: letter; margin: 0.75in; }}
  </style>
</head>
<body>
  <main>
    <h1>{document.plan_name}: {template.name}</h1>
    <dl class="metadata">
      <dt>Plan year</dt><dd>{document.plan_year}</dd>
      <dt>Contract number</dt><dd>{document.contract_number}</dd>
      <dt>CMS source year</dt><dd>{template.cms_year}</dd>
      <dt>Document language</dt><dd>{document.language}</dd>
    </dl>
    <nav aria-label="Document table of contents"><h2>Table of Contents</h2><ol>{toc}</ol></nav>
    {body}
  </main>
</body>
</html>"""


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "healthcare-document-cms-api", "version": app.version}


@app.get("/api/v1/templates", response_model=list[Template])
def list_templates() -> list[Template]:
    return list(TEMPLATES.values())


@app.get("/api/v1/templates/{template_id}", response_model=Template)
def get_template(template_id: str) -> Template:
    return _template_or_404(template_id)


@app.post("/api/v1/documents", response_model=DocumentInstance)
def create_document(payload: DocumentCreate) -> DocumentInstance:
    template = _template_or_404(payload.template_id)
    document = DocumentInstance(
        template_id=template.id,
        plan_name=payload.plan_name,
        contract_number=payload.contract_number,
        plan_year=payload.plan_year,
        language=payload.language,
        sections=[SectionContent(section_id=section.id, html=section.default_html) for section in template.sections],
    )
    DOCUMENTS[document.id] = document
    return document


@app.get("/api/v1/documents/{document_id}", response_model=DocumentInstance)
def get_document(document_id: str) -> DocumentInstance:
    return _document_or_404(document_id)


@app.put("/api/v1/documents/{document_id}/sections/{section_id}", response_model=DocumentInstance)
def update_section(document_id: str, section_id: str, payload: SectionUpdate) -> DocumentInstance:
    document = _document_or_404(document_id)
    for index, section in enumerate(document.sections):
        if section.section_id == section_id:
            document.sections[index] = SectionContent(section_id=section_id, html=payload.html, variables=payload.variables, review_status=payload.review_status)
            DOCUMENTS[document.id] = document
            return document
    raise HTTPException(status_code=404, detail="Section not found")


@app.post("/api/v1/documents/{document_id}/compliance-check")
def compliance_check(document_id: str):
    document = _document_or_404(document_id)
    template = _template_or_404(document.template_id)
    return run_document_preflight(document, template)


@app.post("/api/v1/documents/{document_id}/exports/html", response_model=ExportArtifact)
def export_html(document_id: str) -> ExportArtifact:
    document = _document_or_404(document_id)
    template = _template_or_404(document.template_id)
    report = run_document_preflight(document, template)
    html = _render_accessible_html(document, template)
    target = EXPORT_DIR / f"{document.id}.html"
    target.write_text(html, encoding="utf-8")
    return ExportArtifact(document_id=document.id, format="html", filename=target.name, media_type="text/html", bytes_written=target.stat().st_size, compliance=report)


@app.post("/api/v1/documents/{document_id}/exports/pdf", response_model=ExportArtifact)
def export_pdf(document_id: str) -> ExportArtifact:
    document = _document_or_404(document_id)
    template = _template_or_404(document.template_id)
    report = run_document_preflight(document, template)
    html = _render_accessible_html(document, template)
    target = EXPORT_DIR / f"{document.id}.pdf"
    HTML(string=html, base_url=str(ROOT_DIR)).write_pdf(target)
    return ExportArtifact(document_id=document.id, format="pdf", filename=target.name, media_type="application/pdf", bytes_written=target.stat().st_size, compliance=report)


async def _extract_uploaded_spec_text(spec_file: UploadFile, html: str) -> str:
    if not spec_file.filename or not spec_file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Upload a PDF specification file for comparison.")
    if len(html.strip()) < 20:
        raise HTTPException(status_code=400, detail="Generated HTML is required for comparison.")
    try:
        spec_text = extract_spec_text_from_pdf(await spec_file.read())
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Unable to extract text from uploaded PDF specification: {exc}") from exc
    if len(spec_text.split()) < 25:
        raise HTTPException(status_code=422, detail="The uploaded PDF did not contain enough extractable text for automated comparison.")
    return spec_text


@app.post("/api/v1/specs/compare-html", response_model=SpecComparisonReport)
async def compare_html_to_spec(spec_file: UploadFile = File(...), html: str = Form(...)) -> SpecComparisonReport:
    spec_text = await _extract_uploaded_spec_text(spec_file, html)
    return compare_spec_to_html(spec_text, html)


@app.post("/api/v1/specs/ai-review-html", response_model=AiSpecReviewReport)
async def ai_review_html_to_spec(spec_file: UploadFile = File(...), html: str = Form(...)) -> AiSpecReviewReport:
    spec_text = await _extract_uploaded_spec_text(spec_file, html)
    comparison = compare_spec_to_html(spec_text, html)
    return ai_review_spec_to_html(spec_text, html, comparison)


@app.post("/api/v1/exports/html-package", response_model=AdHocExportArtifact)
def export_html_package(payload: GeneratedHtmlPayload) -> AdHocExportArtifact:
    target = EXPORT_DIR / _safe_export_name(payload.filename, "html")
    target.write_text(payload.html, encoding="utf-8")
    return AdHocExportArtifact(format="html", filename=target.name, media_type="text/html", bytes_written=target.stat().st_size, download_url=f"/api/v1/exports/{target.name}")


@app.post("/api/v1/exports/pdf-package", response_model=AdHocExportArtifact)
def export_pdf_package(payload: GeneratedHtmlPayload) -> AdHocExportArtifact:
    target = EXPORT_DIR / _safe_export_name(payload.filename, "pdf")
    HTML(string=payload.html, base_url=str(ROOT_DIR)).write_pdf(target)
    return AdHocExportArtifact(format="pdf", filename=target.name, media_type="application/pdf", bytes_written=target.stat().st_size, download_url=f"/api/v1/exports/{target.name}")


@app.get("/api/v1/exports/{filename}")
def download_export(filename: str):
    target = EXPORT_DIR / filename
    if not target.exists():
        raise HTTPException(status_code=404, detail="Export not found")
    if target.suffix == ".html":
        return HTMLResponse(target.read_text(encoding="utf-8"))
    return FileResponse(target, media_type="application/pdf", filename=filename)


CLIENT_CATALOG = [
    ClientProfile(code="UHG", name="UnitedHealthcare", description="Default client profile for Medicare communications production."),
    ClientProfile(code="GENERIC", name="Generic Medicare Client", description="Reusable Medicare document profile for ANOC, EOC, and SB drafts."),
]

DOCUMENT_TYPE_CATALOG = [
    DocumentTypeProfile(code=DocumentType.summary_of_benefits, name="Summary of Benefits", description="Plan benefit and cost summary document with spec and visual QA gates.", spec_profile="SB-REGULAR-PRINT-2026"),
    DocumentTypeProfile(code=DocumentType.anoc, name="Annual Notice of Changes", description="Annual plan changes communication.", spec_profile="ANOC-CMS-2026"),
    DocumentTypeProfile(code=DocumentType.evidence_of_coverage, name="Evidence of Coverage", description="Evidence of Coverage member contract document.", spec_profile="EOC-CMS-2026"),
]

DEFAULT_STYLESHEET = """
body { font-family: Arial, Helvetica, sans-serif; font-size: 12pt; line-height: 1.35; color: #111827; }
h1 { font-size: 20pt; line-height: 1.2; font-weight: 700; }
h2 { font-size: 16pt; line-height: 1.25; font-weight: 700; page-break-after: avoid; }
h3 { font-size: 13pt; line-height: 1.25; font-weight: 700; page-break-after: avoid; }
p { margin: 0 0 8pt 0; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
th { font-weight: 700; background: #eef2ff; }
th, td { border: 1px solid #374151; padding: 5pt; vertical-align: top; }
.page { page-break-after: always; max-width: 7.625in; min-height: 9.5in; margin: 0 auto 24pt auto; }
.section { margin-bottom: 12pt; }
.benefit-table { border-collapse: collapse; width: 100%; }
.cms-required { font-weight: 700; }
""".strip()


def _current_user(authorization: str | None = Header(default=None)) -> AuthUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    from app.services.auth_store import decode_token

    payload = decode_token(authorization.split(" ", 1)[1].strip())
    return get_user(payload["sub"])


def _default_pages_for(document_type: DocumentType) -> list[AuthoringPage]:
    if document_type == DocumentType.summary_of_benefits:
        return [
            AuthoringPage(
                number=1,
                title="Cover and Plan Overview",
                sort_order=1,
                sections=[
                    AuthoringSection(
                        section_key="cover",
                        title="Summary of Benefits 2026",
                        sort_order=1,
                        html="<p class='cms-required'><strong>Summary of Benefits</strong> January 1, 2026 – December 31, 2026</p><p>This document tells you about plan benefits, covered services, and member cost sharing.</p>",
                    ),
                    AuthoringSection(
                        section_key="contacts",
                        title="Contact and Availability",
                        sort_order=2,
                        html="<p>For questions, call Member Services. TTY users should call 711. This document is available in alternate formats.</p>",
                    ),
                ],
            ),
            AuthoringPage(
                number=2,
                title="Medical Benefits",
                sort_order=2,
                sections=[
                    AuthoringSection(
                        section_key="medical-benefits",
                        title="Medical Benefits Chart",
                        sort_order=1,
                        html="<table class='benefit-table'><thead><tr><th scope='col'>Benefit</th><th scope='col'>What you pay</th></tr></thead><tbody><tr><td>Deductible</td><td>$0 annual medical deductible.</td></tr><tr><td>Ambulatory surgical center</td><td>$0 copay.</td></tr><tr><td>Doctor visits</td><td>$0 primary care; specialist cost sharing varies.</td></tr><tr><td>Inpatient hospital</td><td>Plan-approved cost sharing applies.</td></tr><tr><td>Outpatient hospital</td><td>Plan-approved cost sharing applies.</td></tr><tr><td>Dental services</td><td>Preventive and comprehensive dental allowances may apply.</td></tr><tr><td>Vision services</td><td>Routine eye exam and eyewear allowances may apply.</td></tr></tbody></table>",
                    )
                ],
            ),
            AuthoringPage(
                number=3,
                title="Prescription Drugs and Extra Benefits",
                sort_order=3,
                sections=[
                    AuthoringSection(
                        section_key="rx-extra",
                        title="Prescription Drugs and Supplemental Benefits",
                        sort_order=1,
                        html="<p>Prescription drug benefits follow the plan formulary, deductible, initial coverage, and catastrophic coverage rules.</p><p>Extra benefits may include fitness, over-the-counter allowance, transportation, meals, and telehealth as described in the plan materials.</p>",
                        repeaters=[RepeaterBlock(label="Optional extra benefit", sort_order=1, html="<p>Add client-specific supplemental benefit details here.</p>")],
                    )
                ],
            ),
        ]
    label = "Annual Notice of Changes" if document_type == DocumentType.anoc else "Evidence of Coverage"
    return [
        AuthoringPage(number=1, title=f"{label} Cover", sort_order=1, sections=[AuthoringSection(section_key="cover", title=label, sort_order=1, html=f"<p><strong>{label}</strong> draft content.</p>")]),
        AuthoringPage(number=2, title="Required Sections", sort_order=2, sections=[AuthoringSection(section_key="required", title="Required CMS Sections", sort_order=1, html="<p>Add required model document content by section.</p>")]),
    ]


@app.post("/api/v1/auth/signup", response_model=AuthSession)
def signup(payload: AuthSignup) -> AuthSession:
    user = create_user(payload.email, payload.password)
    return AuthSession(access_token=create_token(user.id, user.email), user=user)


@app.post("/api/v1/auth/login", response_model=AuthSession)
def login(payload: AuthLogin) -> AuthSession:
    user = authenticate_user(payload.email, payload.password)
    return AuthSession(access_token=create_token(user.id, user.email), user=user)


@app.get("/api/v1/auth/me", response_model=AuthUser)
def me(user: AuthUser = Depends(_current_user)) -> AuthUser:
    return user


@app.get("/api/v1/catalog/clients", response_model=list[ClientProfile])
def clients_catalog() -> list[ClientProfile]:
    return CLIENT_CATALOG


@app.get("/api/v1/catalog/document-types", response_model=list[DocumentTypeProfile])
def document_types_catalog() -> list[DocumentTypeProfile]:
    return DOCUMENT_TYPE_CATALOG


@app.get("/api/v1/managed-documents", response_model=list[ManagedDocumentSummary])
def list_managed_documents(user: AuthUser = Depends(_current_user)) -> list[ManagedDocumentSummary]:
    return list_documents(user.id)


@app.post("/api/v1/managed-documents", response_model=ManagedDocument)
def create_managed_document(payload: ManagedDocumentCreate, user: AuthUser = Depends(_current_user)) -> ManagedDocument:
    document = ManagedDocument(
        owner_id=user.id,
        title=payload.title,
        client_code=payload.client_code,
        document_type=payload.document_type,
        metadata=payload.metadata,
        stylesheet=DEFAULT_STYLESHEET,
        pages=_default_pages_for(payload.document_type),
    )
    return save_document(document)


@app.get("/api/v1/managed-documents/{document_id}", response_model=ManagedDocument)
def get_managed_document(document_id: str, user: AuthUser = Depends(_current_user)) -> ManagedDocument:
    return get_document_for_user(document_id, user.id)


@app.delete("/api/v1/managed-documents/{document_id}")
def delete_managed_document(document_id: str, user: AuthUser = Depends(_current_user)) -> dict[str, bool]:
    delete_document_for_user(document_id, user.id)
    return {"deleted": True}


@app.put("/api/v1/managed-documents/{document_id}", response_model=ManagedDocument)
def update_managed_document(document_id: str, payload: ManagedDocumentUpdate, user: AuthUser = Depends(_current_user)) -> ManagedDocument:
    document = get_document_for_user(document_id, user.id)
    if payload.title is not None:
        document.title = payload.title
    if payload.status is not None:
        document.status = payload.status
    if payload.metadata is not None:
        document.metadata = payload.metadata
    if payload.stylesheet is not None:
        document.stylesheet = payload.stylesheet
    if payload.pages is not None:
        document.pages = payload.pages
    return save_document(document)


@app.post("/api/v1/managed-documents/{document_id}/pages", response_model=ManagedDocument)
def add_page(document_id: str, page: AuthoringPage, user: AuthUser = Depends(_current_user)) -> ManagedDocument:
    document = get_document_for_user(document_id, user.id)
    document.pages.append(page)
    document.pages.sort(key=lambda p: p.sort_order or p.number)
    return save_document(document)


@app.post("/api/v1/managed-documents/{document_id}/pages/{page_id}/sections", response_model=ManagedDocument)
def add_section(document_id: str, page_id: str, section: AuthoringSection, user: AuthUser = Depends(_current_user)) -> ManagedDocument:
    document = get_document_for_user(document_id, user.id)
    for page in document.pages:
        if page.id == page_id:
            page.sections.append(section)
            page.sections.sort(key=lambda s: s.sort_order)
            return save_document(document)
    raise HTTPException(status_code=404, detail="Page not found")


@app.put("/api/v1/managed-documents/{document_id}/sections/{section_id}", response_model=ManagedDocument)
def update_managed_section(document_id: str, section_id: str, payload: SectionHtmlUpdate, user: AuthUser = Depends(_current_user)) -> ManagedDocument:
    document = get_document_for_user(document_id, user.id)
    for page in document.pages:
        for section in page.sections:
            if section.id == section_id:
                section.html = payload.html
                return save_document(document)
    raise HTTPException(status_code=404, detail="Section not found")


@app.post("/api/v1/managed-documents/{document_id}/sections/{section_id}/repeaters", response_model=ManagedDocument)
def add_repeater(document_id: str, section_id: str, repeater: RepeaterBlock, user: AuthUser = Depends(_current_user)) -> ManagedDocument:
    document = get_document_for_user(document_id, user.id)
    for page in document.pages:
        for section in page.sections:
            if section.id == section_id:
                section.repeaters.append(repeater)
                section.repeaters.sort(key=lambda r: r.sort_order)
                return save_document(document)
    raise HTTPException(status_code=404, detail="Section not found")


@app.get("/api/v1/managed-documents/{document_id}/html", response_class=HTMLResponse)
def managed_document_html(document_id: str, inline: bool = False, user: AuthUser = Depends(_current_user)):
    document = get_document_for_user(document_id, user.id)
    html = render_managed_document_html(document.title, document.stylesheet, document.pages)
    if inline:
        html = inline_css(html, document.stylesheet).inlined_html
    return HTMLResponse(html)


@app.post("/api/v1/tools/inline-css", response_model=CssInlineResult)
def inline_css_endpoint(payload: StylesheetPayload) -> CssInlineResult:
    return inline_css(payload.html, payload.css)


@app.post("/api/v1/tools/style-qa", response_model=StyleQaReport)
def style_qa_endpoint(payload: StyleQaPayload) -> StyleQaReport:
    return run_style_qa(payload.html, payload.css, payload.document_type, payload.client_code)


@app.post("/api/v1/tools/ai-style-fixes", response_model=AiFixSuggestionReport)
def ai_style_fixes_endpoint(payload: StyleQaPayload) -> AiFixSuggestionReport:
    qa_report = run_style_qa(payload.html, payload.css, payload.document_type, payload.client_code)
    return ai_suggest_style_fixes(payload.html, payload.css, qa_report)


@app.post("/api/v1/managed-documents/{document_id}/style-qa", response_model=StyleQaReport)
def managed_document_style_qa(document_id: str, user: AuthUser = Depends(_current_user)) -> StyleQaReport:
    document = get_document_for_user(document_id, user.id)
    html = render_managed_document_html(document.title, document.stylesheet, document.pages)
    report = run_style_qa(html, document.stylesheet, document.document_type, document.client_code)
    document.latest_qa_score = report.score
    save_document(document)
    return report


@app.post("/api/v1/managed-documents/{document_id}/ai-style-fixes", response_model=AiFixSuggestionReport)
def managed_document_ai_style_fixes(document_id: str, user: AuthUser = Depends(_current_user)) -> AiFixSuggestionReport:
    document = get_document_for_user(document_id, user.id)
    html = render_managed_document_html(document.title, document.stylesheet, document.pages)
    qa_report = run_style_qa(html, document.stylesheet, document.document_type, document.client_code)
    return ai_suggest_style_fixes(html, document.stylesheet, qa_report)

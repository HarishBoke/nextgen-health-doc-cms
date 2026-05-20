from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from weasyprint import HTML

from app.core.schemas import (
    DocumentCreate,
    DocumentInstance,
    DocumentType,
    ExportArtifact,
    SectionContent,
    SectionRule,
    SectionUpdate,
    Template,
    TemplateSection,
)
from app.services.compliance import run_document_preflight

ROOT_DIR = Path(__file__).resolve().parents[2]
EXPORT_DIR = ROOT_DIR / "storage" / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

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


@app.get("/api/v1/exports/{filename}")
def download_export(filename: str):
    target = EXPORT_DIR / filename
    if not target.exists():
        raise HTTPException(status_code=404, detail="Export not found")
    if target.suffix == ".html":
        return HTMLResponse(target.read_text(encoding="utf-8"))
    return FileResponse(target, media_type="application/pdf", filename=filename)

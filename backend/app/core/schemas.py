from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field


class DocumentType(str, Enum):
    anoc = "ANOC"
    summary_of_benefits = "SB"
    evidence_of_coverage = "EOC"
    provider_directory = "PROVIDER_DIRECTORY"
    custom = "CUSTOM"


class SectionRule(BaseModel):
    locked: bool = False
    required: bool = True
    allow_tables: bool = True
    allow_images: bool = False
    requires_review: bool = True
    cms_source_note: str | None = None


class TemplateSection(BaseModel):
    id: str
    number: str
    title: str
    level: int = Field(ge=1, le=4)
    default_html: str
    rules: SectionRule = Field(default_factory=SectionRule)


class Template(BaseModel):
    id: str
    name: str
    document_type: DocumentType
    cms_year: int
    language: str = "en-US"
    source_files: list[str] = Field(default_factory=list)
    sections: list[TemplateSection]


class SectionContent(BaseModel):
    section_id: str
    html: str
    variables: dict[str, str] = Field(default_factory=dict)
    review_status: Literal["draft", "ready", "approved", "blocked"] = "draft"


class DocumentCreate(BaseModel):
    template_id: str
    plan_name: str
    contract_number: str
    plan_year: int
    language: str = "en-US"


class DocumentInstance(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    template_id: str
    plan_name: str
    contract_number: str
    plan_year: int
    language: str = "en-US"
    status: Literal["draft", "in_review", "approved", "exported"] = "draft"
    sections: list[SectionContent]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SectionUpdate(BaseModel):
    html: str
    variables: dict[str, str] = Field(default_factory=dict)
    review_status: Literal["draft", "ready", "approved", "blocked"] = "draft"


class ComplianceIssue(BaseModel):
    id: str
    severity: Literal["error", "warning", "info"]
    section_id: str | None = None
    label: str
    detail: str


class ComplianceReport(BaseModel):
    document_id: str
    passed: bool
    errors: int
    warnings: int
    issues: list[ComplianceIssue]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ExportArtifact(BaseModel):
    document_id: str
    format: Literal["html", "pdf"]
    filename: str
    media_type: str
    bytes_written: int
    compliance: ComplianceReport


class GeneratedHtmlPayload(BaseModel):
    html: str = Field(min_length=20)
    filename: str = "cms-accessible-document"


class AdHocExportArtifact(BaseModel):
    format: Literal["html", "pdf"]
    filename: str
    media_type: str
    bytes_written: int
    download_url: str


class SpecFinding(BaseModel):
    severity: Literal["error", "warning", "info"]
    label: str
    detail: str
    evidence: str | None = None


class SpecComparisonReport(BaseModel):
    passed: bool
    score: int = Field(ge=0, le=100)
    similarity: float = Field(ge=0, le=1)
    coverage: float = Field(ge=0, le=1)
    required_terms_found: list[str]
    required_terms_missing: list[str]
    missing_snippets: list[str]
    order_findings: list[SpecFinding]
    spec_word_count: int
    document_word_count: int
    review_note: str = "Automated spec matching supports reviewer QA but does not replace final CMS, Word, Acrobat, or human accessibility review."
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AiSpecReviewFinding(BaseModel):
    severity: Literal["critical", "major", "minor", "info"]
    category: Literal["content", "structure", "accessibility", "pdf_readiness", "metadata"]
    issue: str
    recommendation: str
    evidence: str | None = None


class AiSpecReviewReport(BaseModel):
    available: bool
    model: str | None = None
    verdict: Literal["pass", "needs_review", "blocked", "unavailable"] = "unavailable"
    confidence: float = Field(default=0.0, ge=0, le=1)
    summary: str
    findings: list[AiSpecReviewFinding] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AuthSignup(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=8)


class AuthLogin(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)


class AuthUser(BaseModel):
    id: str
    email: str
    created_at: datetime


class AuthSession(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthUser


class ClientProfile(BaseModel):
    code: str
    name: str
    description: str = ""


class DocumentTypeProfile(BaseModel):
    code: DocumentType
    name: str
    description: str
    spec_profile: str


class RepeaterBlock(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    label: str
    sort_order: int = 0
    html: str = "<p>New repeated content.</p>"
    data: dict[str, str] = Field(default_factory=dict)


class AuthoringSection(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    section_key: str
    title: str
    sort_order: int = 0
    html: str
    locked: bool = False
    style_profile: dict[str, str] = Field(default_factory=dict)
    repeaters: list[RepeaterBlock] = Field(default_factory=list)


class AuthoringPage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    number: int
    title: str
    sort_order: int = 0
    page_style: dict[str, str] = Field(default_factory=dict)
    sections: list[AuthoringSection] = Field(default_factory=list)


class ManagedDocumentCreate(BaseModel):
    title: str
    client_code: str = "UHG"
    document_type: DocumentType = DocumentType.summary_of_benefits
    metadata: dict[str, str] = Field(default_factory=dict)


class ManagedDocumentSummary(BaseModel):
    id: str
    title: str
    client_code: str
    document_type: DocumentType
    status: Literal["draft", "in_review", "approved", "exported"] = "draft"
    page_count: int = 0
    section_count: int = 0
    latest_qa_score: int | None = None
    updated_at: datetime


class ManagedDocument(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    owner_id: str
    title: str
    client_code: str = "UHG"
    document_type: DocumentType = DocumentType.summary_of_benefits
    status: Literal["draft", "in_review", "approved", "exported"] = "draft"
    metadata: dict[str, str] = Field(default_factory=dict)
    stylesheet: str = ""
    pages: list[AuthoringPage] = Field(default_factory=list)
    latest_qa_score: int | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ManagedDocumentUpdate(BaseModel):
    title: str | None = None
    status: Literal["draft", "in_review", "approved", "exported"] | None = None
    metadata: dict[str, str] | None = None
    stylesheet: str | None = None
    pages: list[AuthoringPage] | None = None


class SectionHtmlUpdate(BaseModel):
    html: str


class StylesheetPayload(BaseModel):
    html: str = Field(min_length=1)
    css: str = ""


class CssInlineWarning(BaseModel):
    selector: str
    message: str


class CssInlineResult(BaseModel):
    html: str
    inlined_html: str
    applied_rules: int
    skipped_selectors: list[str] = Field(default_factory=list)
    warnings: list[CssInlineWarning] = Field(default_factory=list)


class StyleRequirement(BaseModel):
    selector: str
    property: str
    expected: str
    severity: Literal["error", "warning", "info"] = "error"
    description: str = ""


class StyleFinding(BaseModel):
    severity: Literal["error", "warning", "info"]
    selector: str
    property: str
    expected: str
    actual: str | None = None
    recommendation: str


class StyleQaReport(BaseModel):
    passed: bool
    score: int = Field(ge=0, le=100)
    checked_rules: int
    findings: list[StyleFinding] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StyleQaPayload(BaseModel):
    html: str = Field(min_length=1)
    css: str = ""
    document_type: DocumentType = DocumentType.summary_of_benefits
    client_code: str = "UHG"


class AiFixSuggestion(BaseModel):
    target: str
    issue: str
    suggested_fix: str
    patch_hint: str | None = None


class AiFixSuggestionReport(BaseModel):
    available: bool
    verdict: Literal["pass", "needs_minor_fixes", "needs_major_fixes", "unavailable"] = "unavailable"
    confidence: float = Field(default=0.0, ge=0, le=1)
    summary: str
    suggestions: list[AiFixSuggestion] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

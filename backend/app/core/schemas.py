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

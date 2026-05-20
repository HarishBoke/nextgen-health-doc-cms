# CMS.gov Healthcare Document CMS Guideline Specification

**Author:** Manus AI  
**Date:** May 21, 2026  
**Application:** Next-Generation Healthcare Document CMS  
**Scope:** ANOC, Summary of Benefits, Evidence of Coverage, provider directory, errata, TinyMCE-driven content updates, accessible HTML, Word-ready output, and PDF export readiness

## 1. Executive summary

This specification defines a **next-generation authoring and compliance platform** for CMS.gov healthcare plan documents. The intended system supports Annual Notice of Change (ANOC), Summary of Benefits (SB), Evidence of Coverage (EOC), provider directory materials, errata, and related healthcare provider documentation updates. The application is implemented as a React/TinyMCE frontend and Python FastAPI backend with compliance preflight, accessible HTML generation, PDF export support, GitHub Actions CI, and Render deployment configuration.

CMS publishes standardized outreach and educational materials for Medicare Advantage Plans, Medicare Advantage Prescription Drug Plans, Prescription Drug Plans, and 1876 Cost Plans.[1] The official CMS model-materials page identifies model documents and instructions for ANOC, EOC, errata, provider directories, Part D transition materials, Star Ratings, and related materials.[1] The application therefore must not behave like a generic web CMS. It must behave as a **controlled document production system** that protects standardized CMS text, constrains editing to permitted variables and sections, preserves document order, and records a review trail for every exported artifact.

> **Design principle:** The CMS model document is the controlled source; TinyMCE is the editing surface, not the governance model. Every authoring decision should be traceable to a template section, year, source file, document type, reviewer, and export package.

## 2. Official guideline package downloaded and installed

The project workspace includes a local official-guideline package under `official_guidelines/`. The CMS CY 2026 model-materials ZIP was downloaded and unpacked so that the product can be configured from actual source materials rather than reconstructed from memory. Section508.gov authoring guidance was also downloaded for document accessibility setup.

| Guideline area | Local project location | Purpose in the application |
| --- | --- | --- |
| CMS CY 2026 model materials ZIP | `official_guidelines/cms_cy2026/cy-2026-model-materials-updated.zip` | Source archive for ANOC, EOC, provider directory, errata, and translated notices. |
| CMS ANOC models | `official_guidelines/cms_cy2026/unpacked/anoc_models/` | Source templates for ANOC profile setup and section mapping. |
| CMS EOC models | `official_guidelines/cms_cy2026/unpacked/eoc_models/` | Source templates for EOC profile setup and future extension. |
| CMS Medicare Communications and Marketing Guidelines | `official_guidelines/cms_cy2026/medicare-communications-marketing-guidelines-2022.pdf` and `.txt` | Source for SB instructions and Medicare communications/marketing requirements. |
| Section508.gov accessible documents page | `official_guidelines/section508/section508_accessible_documents_page.md` | Source for authoring accessible Word and office documents. |
| Section508.gov Word guide | `official_guidelines/section508/ms-word-365-basic-authoring-and-testing-guide.pdf` | Source for Word authoring and testing workflow. |
| Section508.gov accessible PDFs page | `official_guidelines/section508/section508_accessible_pdfs_page.html` | Source for PDF accessibility and remediation workflow. |

## 3. Regulatory and compliance baseline

CMS model materials are regulated communication assets. The official CMS model materials must be used in the manner specified by CMS instructions, including standardized language, document order, plan-specific insertions, deletions of non-applicable instructions, and allowed formatting modifications.[1] The CMS Medicare Communications and Marketing Guidelines include **Appendix 2 – Model Summary of Benefits Instructions**, which supports the SB profile.[2]

Section508.gov states that accessible PDFs must conform to the Revised 508 Standards and notes that PDFs are often less accessible and less mobile-friendly than HTML.[3] For this reason, the platform uses **semantic HTML as the canonical source**, then generates downstream Word/PDF artifacts from that same structure. This approach also makes compliance easier to validate before export because headings, links, tables, metadata, and language can be checked before the PDF is created.

| Requirement | Practical interpretation | System enforcement |
| --- | --- | --- |
| CMS standardized language | CMS model text should be used exactly as required unless instructions allow changes. | Locked sections, source notes, reviewer gates, and change audit logs. |
| CMS document order | ANOC, EOC, and SB sections must retain CMS-required order. | Template-driven table of contents and section sequence. |
| Plan-specific inserts | Variables such as plan name, contract number, phone numbers, TTY, benefits, and costs must be populated. | Required metadata fields and section-level variable validation. |
| Accessible documents | Source content should use semantic headings, alt text, table headers, descriptive links, and declared language. | React UI checks and backend compliance engine. |
| Accessible PDFs | PDF exports must be created from structured source and then verified/remediated before formal distribution. | WeasyPrint export, metadata, bookmarks-friendly headings, and final QA checklist. |

## 4. Product architecture

The application is organized as a **two-service Render-ready system**. The frontend is a Vite React TypeScript application using TinyMCE for rich-text authoring. The backend is a Python FastAPI service with template storage, document-instance APIs, accessibility preflight, and HTML/PDF export endpoints.

| Layer | Implementation | Current artifact |
| --- | --- | --- |
| Frontend authoring cockpit | React, TypeScript, TinyMCE, accessible dashboard CSS | `frontend/src/App.tsx`, `frontend/src/App.css` |
| Backend API | FastAPI and Pydantic | `backend/app/main.py`, `backend/app/core/schemas.py` |
| Compliance engine | BeautifulSoup-based deterministic checks | `backend/app/services/compliance.py` |
| Export engine | Semantic HTML and WeasyPrint PDF generation | `/api/v1/documents/{id}/exports/html`, `/api/v1/documents/{id}/exports/pdf` |
| CI/CD | GitHub Actions | `.github/workflows/ci.yml` |
| Render deployment | Render Blueprint | `render.yaml` |

## 5. UX/UI compliance specification

The frontend implements a **document cockpit** rather than a blank editor. The top-level screen shows a CMS.gov healthcare document status banner, a compliance status card, a controlled document structure panel, metadata fields, a TinyMCE editor, a 501/508 preflight panel, export controls, and a semantic HTML preview. This design keeps authors aware of compliance status while they edit.

| UX component | Accessibility and compliance behavior |
| --- | --- |
| Skip link | Allows keyboard and screen-reader users to bypass the header and navigate directly to the editor. |
| Document structure panel | Presents CMS sections in controlled order with active-section state and locked-text indicators. |
| Metadata panel | Captures required plan identity fields, including document type, plan year, plan name, contract number, and language. |
| TinyMCE section editor | Restricts toolbars to semantic headings, lists, links, images, tables, and code view. |
| Instruction text | Reminds authors to preserve CMS language and use semantic content patterns. |
| Preflight panel | Displays blocking errors and advisory warnings in an `aria-live` region. |
| Preview iframe | Renders the canonical semantic HTML before server export. |

## 6. Template governance model

Templates must be immutable after approval. A template represents a document type, CMS year, language, source files, sections, and editing rules. A document instance represents the plan-specific working copy generated from the template. This distinction is essential because annual CMS model-material updates must not overwrite live production documents.

| Entity | Required purpose | Current implementation |
| --- | --- | --- |
| `Template` | Stores CMS source year, document type, source files, and section definitions. | `backend/app/core/schemas.py` |
| `TemplateSection` | Stores section number, title, level, default HTML, and rules. | `backend/app/core/schemas.py` |
| `SectionRule` | Marks locked text, required sections, image/table permissions, and review needs. | `backend/app/core/schemas.py` |
| `DocumentInstance` | Stores plan-specific document metadata and section content. | `backend/app/core/schemas.py` |
| `ComplianceReport` | Stores preflight issues, error counts, warning counts, and pass/fail status. | `backend/app/core/schemas.py` |
| `ExportArtifact` | Stores generated HTML/PDF export metadata and associated compliance snapshot. | `backend/app/core/schemas.py` |

## 7. Accessibility and PDF production workflow

The safest production workflow is **HTML first, Word/PDF second, final remediation last**. Section508.gov guidance emphasizes accessible document creation and PDF accessibility testing/remediation.[3] [4] The system therefore generates an accessible HTML package, then a server-side PDF package, and includes preflight warnings that remind teams not to treat automated checks as final legal certification.

| Stage | Action | Output |
| --- | --- | --- |
| Authoring | Users edit section-level HTML in TinyMCE with controlled formatting. | Semantic structured content. |
| Automated preflight | Frontend and backend check required fields, alt text, table headers, links, section completeness, and long unstructured blocks. | Compliance report. |
| Accessible HTML export | Backend renders metadata, table of contents, sections, headings, and print CSS. | HTML package for browser review and downstream conversion. |
| PDF generation | Backend uses WeasyPrint to create a PDF from the semantic HTML. | Print-ready PDF draft. |
| Final verification | Team checks generated files in Word, Adobe Acrobat accessibility tools, and assistive technology as needed. | Distribution-ready accessible document package. |

## 8. Backend API contract

The API is versioned under `/api/v1`. The current prototype uses in-memory storage to make the build portable, while the Render blueprint reserves a managed PostgreSQL service for production persistence.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Returns API health and version. |
| `GET` | `/api/v1/templates` | Lists available CMS template profiles. |
| `GET` | `/api/v1/templates/{template_id}` | Returns a template and its sections. |
| `POST` | `/api/v1/documents` | Creates a plan-specific document instance. |
| `GET` | `/api/v1/documents/{document_id}` | Retrieves the document instance. |
| `PUT` | `/api/v1/documents/{document_id}/sections/{section_id}` | Updates a section’s TinyMCE HTML and review state. |
| `POST` | `/api/v1/documents/{document_id}/compliance-check` | Runs backend compliance preflight. |
| `POST` | `/api/v1/documents/{document_id}/exports/html` | Generates semantic HTML export. |
| `POST` | `/api/v1/documents/{document_id}/exports/pdf` | Generates PDF export from semantic HTML. |
| `GET` | `/api/v1/exports/{filename}` | Downloads or views generated export artifacts. |

## 9. Render deployment setup

The repository includes a `render.yaml` blueprint with a static frontend service, Python backend service, and PostgreSQL database placeholder. Render deployment should be connected to the GitHub repository so that main-branch pushes trigger builds after CI passes.

| Service | Render type | Build command | Start/publish command |
| --- | --- | --- | --- |
| `health-doc-cms-web` | Static site | `pnpm install --frozen-lockfile && ... && pnpm build` | Publish `dist` |
| `health-doc-cms-api` | Python web service | `pip install -r requirements.txt` | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| `health-doc-cms-db` | PostgreSQL | Managed by Render | Production persistence target |

## 10. CI/CD setup

The GitHub Actions workflow builds the frontend and smoke-tests the backend. The backend test creates a document from the CMS ANOC template, runs the compliance endpoint, and generates an HTML export. This gives a minimum release gate for every pull request and branch push.

| Job | Validation performed |
| --- | --- |
| Frontend | Installs Node dependencies, copies TinyMCE runtime assets, and runs the Vite production build. |
| Backend | Installs Python dependencies, checks API health, lists templates, creates a document, runs compliance, and exports HTML. |

## 11. Validation results from this build

The frontend production build completed successfully with Vite. The backend FastAPI smoke test also completed successfully after setting `PYTHONPATH=.`. The test created a document from the CMS CY 2026 ANOC HMO MAPD template, ran compliance preflight, and generated an HTML export artifact.

| Validation | Result |
| --- | --- |
| Frontend build | Passed: `pnpm build` completed successfully. |
| Backend smoke test | Passed: health, templates, document creation, compliance check, and HTML export returned successful responses. |
| Compliance behavior | Passed with one expected warning for locked standardized cover text needing review. |

## 12. Recommended next implementation milestones

The current prototype establishes the compliant UX, API contract, PDF generation pipeline, and deployment scaffolding. Production hardening should add authentication, role-based workflows, persistent database models, template ingestion tooling, full DOCX export, external file storage, organization-level branding, and formal accessibility testing.

| Milestone | Description | Priority |
| --- | --- | --- |
| Persistent data model | Replace in-memory storage with PostgreSQL tables for templates, documents, sections, reviews, users, and audit events. | High |
| Authentication and roles | Add author, reviewer, compliance officer, admin, and export approver roles. | High |
| CMS template ingestion | Convert official CMS DOCX files into sectionized template JSON with locked blocks and variable definitions. | High |
| DOCX export | Generate Word-compatible output for final Word accessibility testing and stakeholder review. | High |
| PDF remediation workflow | Add PDF/UA metadata strategy, tag-tree verification checklist, and Acrobat remediation instructions. | High |
| Audit logging | Record before/after section changes, export hashes, reviewer approvals, and source template versions. | High |
| Multilingual workflow | Support Notice of Availability requirements and template variants for alternate languages. | Medium |
| Automated accessibility tooling | Add axe checks for the frontend and more robust HTML validation in CI. | Medium |

## References

[1]: https://www.cms.gov/medicare/health-drug-plans/managed-care-marketing/models-standard-documents-educational-materials "CMS: Marketing Models, Standard Documents, and Educational Material"
[2]: https://www.cms.gov/files/document/medicare-communications-marketing-guidelines-2-9-2022.pdf "CMS: Medicare Communications and Marketing Guidelines"
[3]: https://www.section508.gov/create/pdfs/ "Section508.gov: Create Accessible PDFs"
[4]: https://www.section508.gov/create/documents/ "Section508.gov: Create Accessible Documents"

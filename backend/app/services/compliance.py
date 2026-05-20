from __future__ import annotations

import re
from bs4 import BeautifulSoup

from app.core.schemas import ComplianceIssue, ComplianceReport, DocumentInstance, Template


def _plain_text(html: str) -> str:
    return re.sub(r"\s+", " ", BeautifulSoup(html, "html.parser").get_text(" ")).strip()


def run_document_preflight(document: DocumentInstance, template: Template) -> ComplianceReport:
    """Run deterministic CMS-template and accessibility preflight checks.

    These checks are intentionally conservative. They support authoring quality and export readiness, but they do not replace manual review in Microsoft Word, Adobe Acrobat, PAC, or a human assistive-technology review before formal distribution.
    """

    issues: list[ComplianceIssue] = []
    section_rules = {section.id: section for section in template.sections}
    section_content = {section.section_id: section for section in document.sections}

    if not document.plan_name.strip():
        issues.append(ComplianceIssue(id="metadata-plan-name", severity="error", label="Plan name is required", detail="Plan-specific CMS model documents require a populated plan name."))
    if not document.contract_number.strip():
        issues.append(ComplianceIssue(id="metadata-contract", severity="error", label="Contract number is required", detail="The contract number supports document traceability and review."))
    if not document.language.strip():
        issues.append(ComplianceIssue(id="metadata-language", severity="error", label="Document language is required", detail="The exported HTML and PDF package must declare a document language."))

    expected_levels = [section.level for section in template.sections]
    for index, level in enumerate(expected_levels[1:], start=1):
        previous = expected_levels[index - 1]
        if level - previous > 1:
            issues.append(ComplianceIssue(id=f"heading-{template.sections[index].id}", severity="warning", section_id=template.sections[index].id, label="Heading hierarchy jump", detail=f"Template section jumps from level {previous} to {level}."))

    for section in template.sections:
        content = section_content.get(section.id)
        html = content.html if content else ""
        soup = BeautifulSoup(html, "html.parser")
        plain = _plain_text(html)

        if section.rules.required and len(plain) < 10:
            issues.append(ComplianceIssue(id=f"required-{section.id}", severity="error", section_id=section.id, label=f"{section.number} is incomplete", detail="Required CMS model sections cannot be exported empty."))

        if section.rules.locked and content and content.review_status != "approved":
            issues.append(ComplianceIssue(id=f"locked-review-{section.id}", severity="warning", section_id=section.id, label=f"{section.number} requires review", detail="Locked CMS standardized text should be reviewed before final export."))

        for image_index, image in enumerate(soup.find_all("img"), start=1):
            alt = image.get("alt")
            if alt is None or not alt.strip():
                issues.append(ComplianceIssue(id=f"alt-{section.id}-{image_index}", severity="error", section_id=section.id, label="Image missing alternate text", detail="Meaningful images must include alternate text or be marked decorative in final remediation."))

        for table_index, table in enumerate(soup.find_all("table"), start=1):
            if not table.find("th"):
                issues.append(ComplianceIssue(id=f"table-header-{section.id}-{table_index}", severity="error", section_id=section.id, label="Table missing header cells", detail="Benefit and cost tables must expose header relationships for assistive technology."))
            if table.find("table"):
                issues.append(ComplianceIssue(id=f"nested-table-{section.id}-{table_index}", severity="warning", section_id=section.id, label="Nested table detected", detail="Nested tables often create reading-order and PDF tagging problems."))

        for link_index, link in enumerate(soup.find_all("a"), start=1):
            link_text = _plain_text(str(link)).lower()
            if link_text in {"click here", "read more", "learn more"}:
                issues.append(ComplianceIssue(id=f"link-text-{section.id}-{link_index}", severity="warning", section_id=section.id, label="Vague link text", detail="Link text should describe the destination or action."))

        if len(plain) > 900 and not soup.find(["h2", "h3", "h4", "ul", "ol", "table"]):
            issues.append(ComplianceIssue(id=f"long-block-{section.id}", severity="warning", section_id=section.id, label="Long unstructured content block", detail="Complex healthcare content should be broken into headings, lists, or tables."))

    errors = sum(1 for issue in issues if issue.severity == "error")
    warnings = sum(1 for issue in issues if issue.severity == "warning")
    return ComplianceReport(document_id=document.id, passed=errors == 0, errors=errors, warnings=warnings, issues=issues)

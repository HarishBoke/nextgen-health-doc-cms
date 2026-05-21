from __future__ import annotations

import json
import os
import re
from html import escape
from typing import Iterable

import requests
from bs4 import BeautifulSoup

from app.core.schemas import (
    AiFixSuggestion,
    AiFixSuggestionReport,
    CssInlineResult,
    CssInlineWarning,
    DocumentType,
    StyleFinding,
    StyleQaReport,
    StyleRequirement,
)

DEFAULT_STYLE_REQUIREMENTS: dict[str, list[StyleRequirement]] = {
    "SB": [
        StyleRequirement(selector="body", property="font-family", expected="Arial", description="SB body typography should use Arial-compatible Regular Print font."),
        StyleRequirement(selector="body", property="font-size", expected="12pt", description="Regular Print body text should render at 12pt."),
        StyleRequirement(selector="body", property="line-height", expected="1.35", description="Member-facing body copy should maintain readable line height."),
        StyleRequirement(selector="h1", property="font-size", expected="20pt", severity="warning", description="SB title hierarchy should be visually distinct."),
        StyleRequirement(selector="table", property="border-collapse", expected="collapse", description="Benefit tables should use collapsed borders."),
        StyleRequirement(selector="th", property="font-weight", expected="700", severity="warning", description="Table headers should be bold enough for visual scanning."),
        StyleRequirement(selector=".page", property="page-break-after", expected="always", severity="warning", description="Generated sections should preserve page boundaries for PDF review."),
    ],
    "ANOC": [
        StyleRequirement(selector="body", property="font-family", expected="Arial"),
        StyleRequirement(selector="body", property="font-size", expected="12pt"),
        StyleRequirement(selector="body", property="line-height", expected="1.4"),
        StyleRequirement(selector="h1", property="font-size", expected="18pt", severity="warning"),
    ],
    "EOC": [
        StyleRequirement(selector="body", property="font-family", expected="Arial"),
        StyleRequirement(selector="body", property="font-size", expected="12pt"),
        StyleRequirement(selector="body", property="line-height", expected="1.35"),
        StyleRequirement(selector="h2", property="page-break-after", expected="avoid", severity="warning"),
    ],
}


def _strip_css_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def parse_css_rules(css: str) -> list[tuple[str, dict[str, str]]]:
    css = _strip_css_comments(css or "")
    rules: list[tuple[str, dict[str, str]]] = []
    for selector_block, declarations_block in re.findall(r"([^{}]+)\{([^{}]+)\}", css):
        declarations: dict[str, str] = {}
        for declaration in declarations_block.split(";"):
            if ":" not in declaration:
                continue
            prop, value = declaration.split(":", 1)
            prop = prop.strip().lower()
            value = value.strip()
            if prop and value:
                declarations[prop] = value
        if not declarations:
            continue
        for selector in selector_block.split(","):
            selector = selector.strip()
            if selector:
                rules.append((selector, declarations.copy()))
    return rules


def _parse_inline_style(style: str | None) -> dict[str, str]:
    declarations: dict[str, str] = {}
    for part in (style or "").split(";"):
        if ":" not in part:
            continue
        prop, value = part.split(":", 1)
        prop = prop.strip().lower()
        value = value.strip()
        if prop and value:
            declarations[prop] = value
    return declarations


def _serialize_style(declarations: dict[str, str]) -> str:
    return "; ".join(f"{prop}: {value}" for prop, value in declarations.items())


def inline_css(html: str, css: str) -> CssInlineResult:
    soup = BeautifulSoup(html or "", "html.parser")
    applied = 0
    skipped: list[str] = []
    warnings: list[CssInlineWarning] = []
    for selector, declarations in parse_css_rules(css):
        try:
            matches = soup.select(selector)
        except Exception as exc:
            skipped.append(selector)
            warnings.append(CssInlineWarning(selector=selector, message=f"Unsupported selector for inlining: {exc}"))
            continue
        if not matches:
            skipped.append(selector)
            warnings.append(CssInlineWarning(selector=selector, message="Selector did not match any current document element."))
            continue
        for element in matches:
            inline = _parse_inline_style(element.get("style"))
            inline.update(declarations)
            element["style"] = _serialize_style(inline)
            applied += len(declarations)
    return CssInlineResult(html=html, inlined_html=str(soup), applied_rules=applied, skipped_selectors=skipped, warnings=warnings)


def collect_inline_styles(html: str, css: str) -> tuple[BeautifulSoup, dict[str, dict[str, str]]]:
    inlined = inline_css(html, css).inlined_html if css else html
    soup = BeautifulSoup(inlined or "", "html.parser")
    selector_styles: dict[str, dict[str, str]] = {}
    for tag_name in ["body", "h1", "h2", "h3", "p", "table", "th", "td"]:
        element = soup.select_one(tag_name)
        if element:
            selector_styles[tag_name] = _parse_inline_style(element.get("style"))
    for class_name in ["page", "section", "benefit-table", "cms-required"]:
        element = soup.select_one(f".{class_name}")
        if element:
            selector_styles[f".{class_name}"] = _parse_inline_style(element.get("style"))
    return soup, selector_styles


def _normalize(value: str | None) -> str:
    return re.sub(r"\s+", "", (value or "").strip().lower().replace('"', "").replace("'", ""))


def _matches_expected(actual: str | None, expected: str) -> bool:
    if actual is None:
        return False
    actual_n = _normalize(actual)
    expected_n = _normalize(expected)
    return expected_n in actual_n or actual_n == expected_n


def requirements_for(document_type: DocumentType | str, client_code: str = "UHG") -> list[StyleRequirement]:
    code = document_type.value if isinstance(document_type, DocumentType) else str(document_type)
    return DEFAULT_STYLE_REQUIREMENTS.get(code, DEFAULT_STYLE_REQUIREMENTS["SB"])


def run_style_qa(html: str, css: str, document_type: DocumentType | str, client_code: str = "UHG") -> StyleQaReport:
    soup, selector_styles = collect_inline_styles(html, css)
    findings: list[StyleFinding] = []
    requirements = requirements_for(document_type, client_code)
    for req in requirements:
        element = soup.select_one(req.selector)
        actual = None
        if element:
            actual = _parse_inline_style(element.get("style")).get(req.property)
        if not _matches_expected(actual, req.expected):
            findings.append(
                StyleFinding(
                    severity=req.severity,
                    selector=req.selector,
                    property=req.property,
                    expected=req.expected,
                    actual=actual,
                    recommendation=f"Set `{req.selector}` `{req.property}: {req.expected}`. {req.description}".strip(),
                )
            )
    blocking = [f for f in findings if f.severity == "error"]
    penalty = sum(18 if f.severity == "error" else 7 if f.severity == "warning" else 2 for f in findings)
    score = max(0, 100 - penalty)
    return StyleQaReport(passed=not blocking, score=score, checked_rules=len(requirements), findings=findings)


def render_managed_document_html(title: str, stylesheet: str, pages: Iterable) -> str:
    page_html = []
    for page in pages:
        sections = []
        for section in page.sections:
            repeater_html = "".join(
                f"<div class='repeater' data-repeater-id='{escape(rep.id)}'><h4>{escape(rep.label)}</h4>{rep.html}</div>"
                for rep in sorted(section.repeaters, key=lambda r: r.sort_order)
            )
            sections.append(
                f"<section class='section' data-section-key='{escape(section.section_key)}'><h3>{escape(section.title)}</h3>{section.html}{repeater_html}</section>"
            )
        page_html.append(
            f"<article class='page' data-page-number='{page.number}'><h2>{escape(page.title)}</h2>{''.join(sections)}</article>"
        )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>{escape(title)}</title>
<style>{stylesheet or ''}</style>
</head>
<body>
<main class="document-shell">
<h1>{escape(title)}</h1>
{''.join(page_html)}
</main>
</body>
</html>"""


def _coerce_confidence(value, default: float = 0.8) -> float:
    if isinstance(value, (int, float)):
        return max(0.0, min(1.0, float(value)))
    text = str(value or "").strip().lower()
    text_scores = {
        "high": 0.85,
        "medium": 0.6,
        "moderate": 0.6,
        "low": 0.35,
        "none": 0.0,
        "unavailable": 0.0,
    }
    if text in text_scores:
        return text_scores[text]
    try:
        numeric = float(text.rstrip("%"))
        if numeric > 1:
            numeric = numeric / 100
        return max(0.0, min(1.0, numeric))
    except ValueError:
        return default


def ai_suggest_style_fixes(html: str, css: str, qa_report: StyleQaReport) -> AiFixSuggestionReport:
    if not os.environ.get("OPENAI_API_KEY"):
        suggestions = [
            AiFixSuggestion(
                target=f"{finding.selector}::{finding.property}",
                issue=finding.recommendation,
                suggested_fix=f"Add or correct CSS rule `{finding.selector} {{ {finding.property}: {finding.expected}; }}` and re-run Inline CSS.",
                patch_hint=f"{finding.selector} {{ {finding.property}: {finding.expected}; }}",
            )
            for finding in qa_report.findings
        ]
        return AiFixSuggestionReport(
            available=False,
            verdict="unavailable",
            confidence=0,
            summary="AI fix suggestions require OPENAI_API_KEY. Deterministic CSS fixes were generated instead.",
            suggestions=suggestions,
        )
    try:
        prompt = {
            "task": "Suggest precise CSS and HTML fixes for a CMS healthcare document so it matches the required style QA report.",
            "qa_report": qa_report.model_dump(mode="json"),
            "css_excerpt": css[:4000],
            "html_excerpt": html[:6000],
            "output": "JSON with summary, verdict, confidence, suggestions target/issue/suggested_fix/patch_hint",
        }
        response = requests.post(
            os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/") + "/chat/completions",
            headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}", "Content-Type": "application/json"},
            json={
                "model": os.environ.get("OPENAI_MODEL", "gpt-4.1-mini"),
                "messages": [
                    {"role": "system", "content": "You are a precise healthcare document production QA assistant. Return strict JSON only."},
                    {"role": "user", "content": json.dumps(prompt)},
                ],
                "temperature": 0.1,
            },
            timeout=45,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        data = json.loads(re.sub(r"^```json|```$", "", content.strip(), flags=re.M).strip())
        suggestions = [AiFixSuggestion(**item) for item in data.get("suggestions", [])]
        return AiFixSuggestionReport(
            available=True,
            verdict=data.get("verdict", "needs_minor_fixes") if data.get("verdict") in {"pass", "needs_minor_fixes", "needs_major_fixes"} else "needs_minor_fixes",
            confidence=_coerce_confidence(data.get("confidence", 0.8)),
            summary=data.get("summary", "AI generated style fix suggestions."),
            suggestions=suggestions,
        )
    except Exception as exc:
        fallback = [
            AiFixSuggestion(target=f"{f.selector}::{f.property}", issue=f.recommendation, suggested_fix=f"Set {f.property}: {f.expected}.", patch_hint=f"{f.selector} {{ {f.property}: {f.expected}; }}")
            for f in qa_report.findings
        ]
        return AiFixSuggestionReport(available=False, verdict="unavailable", confidence=0, summary=f"AI suggestion request failed; deterministic fallback returned. {exc}", suggestions=fallback)

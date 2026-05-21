from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import urllib.error
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path

from bs4 import BeautifulSoup

from app.core.schemas import AiSpecReviewFinding, AiSpecReviewReport, SpecComparisonReport, SpecFinding

SB_REQUIRED_TERMS = [
    "Summary of Benefits",
    "January 1, 2026",
    "December 31, 2026",
    "Monthly plan premium",
    "Part B premium reduction",
    "Annual medical deductible",
    "Maximum out-of-pocket amount",
    "Inpatient hospital care",
    "Outpatient hospital",
    "Ambulatory surgical center",
    "Doctor visits",
    "Primary care provider",
    "Specialists",
    "Preventive services",
    "Emergency care",
    "Urgently needed services",
    "Diagnostic services",
    "Hearing services",
    "Dental services",
    "Vision services",
    "Mental health",
    "Skilled Nursing Facility",
    "Physical Therapy",
    "Ambulance",
    "Transportation",
    "Medicare Part B Drugs",
    "deductible",
    "initial coverage",
    "coverage gap",
    "catastrophic coverage",
]

SB_ORDER_TERMS = [
    "Monthly plan premium",
    "Part B premium reduction",
    "Annual medical deductible",
    "Maximum out-of-pocket amount",
    "Inpatient hospital care",
    "Outpatient hospital",
    "Ambulatory surgical center",
    "Doctor visits",
    "Preventive services",
    "Emergency care",
    "Urgently needed services",
    "Diagnostic services",
    "Hearing services",
    "Dental services",
    "Vision services",
    "Mental health",
    "Skilled Nursing Facility",
    "Physical Therapy",
    "Ambulance",
    "Transportation",
    "Medicare Part B Drugs",
]

MEASUREMENT_NOISE = re.compile(r"\b\d+(?:\.\d+)?\s*in\b|\b0\.\d+\b|^[\s\-–—•·.]+$", re.IGNORECASE)
WORD_RE = re.compile(r"[a-z0-9$]+(?:[-'][a-z0-9]+)?", re.IGNORECASE)


def normalize_text(value: str) -> str:
    value = value.replace("\u00a0", " ")
    value = re.sub(r"[\u2010-\u2015]", "-", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def html_to_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for element in soup(["script", "style", "noscript"]):
        element.decompose()
    return normalize_text(soup.get_text(" "))


def meaningful_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = normalize_text(raw_line)
        if not line or MEASUREMENT_NOISE.search(line):
            continue
        if len(line) < 4:
            continue
        lines.append(line)
    return lines


def extract_spec_text_from_pdf(pdf_bytes: bytes) -> str:
    with tempfile.TemporaryDirectory() as temp_dir:
        pdf_path = Path(temp_dir) / "spec.pdf"
        txt_path = Path(temp_dir) / "spec.txt"
        pdf_path.write_bytes(pdf_bytes)
        subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), str(txt_path)],
            check=True,
            timeout=30,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        extracted = txt_path.read_text(encoding="utf-8", errors="ignore")
    return "\n".join(meaningful_lines(extracted))


def _tokens(text: str) -> list[str]:
    return [token.lower() for token in WORD_RE.findall(text)]


def _contains_term(text: str, term: str) -> bool:
    normalized = re.sub(r"\s+", " ", text.lower())
    pattern = re.escape(term.lower()).replace(r"\ ", r"\s+")
    return re.search(pattern, normalized) is not None


def _coverage_score(spec_text: str, document_text: str) -> float:
    spec_tokens = {token for token in _tokens(spec_text) if len(token) > 2}
    document_tokens = {token for token in _tokens(document_text) if len(token) > 2}
    if not spec_tokens:
        return 0.0
    return len(spec_tokens & document_tokens) / len(spec_tokens)


def _missing_snippets(spec_text: str, document_text: str) -> list[str]:
    document_lower = document_text.lower()
    candidate_lines = [line for line in meaningful_lines(spec_text) if len(line) >= 35]
    missing: list[str] = []
    seen: set[str] = set()
    for line in candidate_lines:
        comparable = normalize_text(line).lower()
        if comparable in seen:
            continue
        seen.add(comparable)
        if comparable not in document_lower:
            token_set = {token for token in _tokens(comparable) if len(token) > 3}
            if not token_set:
                continue
            overlap = sum(1 for token in token_set if token in document_lower) / len(token_set)
            if overlap < 0.72:
                missing.append(line[:260])
        if len(missing) >= 10:
            break
    return missing


def _order_findings(document_text: str) -> list[SpecFinding]:
    findings: list[SpecFinding] = []
    lower_text = document_text.lower()
    observed: list[tuple[str, int]] = []
    for term in SB_ORDER_TERMS:
        index = lower_text.find(term.lower())
        if index >= 0:
            observed.append((term, index))

    if len(observed) < 6:
        findings.append(
            SpecFinding(
                severity="warning",
                label="Limited SB order evidence",
                detail="Fewer than six required Summary of Benefits ordering terms were found in the generated document. The document may not yet match the SB content profile.",
            )
        )
        return findings

    previous_index = -1
    previous_term = ""
    for term, index in observed:
        if index < previous_index:
            findings.append(
                SpecFinding(
                    severity="warning",
                    label="Potential SB order deviation",
                    detail=f"'{term}' appears before the expected preceding item '{previous_term}'. CMS SB review should confirm the required benefit order.",
                    evidence=term,
                )
            )
            break
        previous_index = index
        previous_term = term

    if not findings:
        findings.append(
            SpecFinding(
                severity="info",
                label="SB order check passed",
                detail="Required Summary of Benefits terms that were present appeared in the expected relative order.",
            )
        )
    return findings


def _build_ai_fallback_report(reason: str, comparison: SpecComparisonReport | None = None) -> AiSpecReviewReport:
    findings: list[AiSpecReviewFinding] = []
    next_steps = [
        "Run deterministic spec match and resolve required-term and missing-snippet findings first.",
        "Configure OPENAI_API_KEY on the backend host to enable semantic AI review.",
        "Complete final CMS, Word, Acrobat, and human accessibility review before release.",
    ]
    if comparison and comparison.required_terms_missing:
        findings.append(
            AiSpecReviewFinding(
                severity="major",
                category="content",
                issue="Deterministic comparison found missing required SB terms.",
                recommendation="Author or import the missing benefit rows and required date/member-facing terms before relying on AI review.",
                evidence=", ".join(comparison.required_terms_missing[:8]),
            )
        )
    return AiSpecReviewReport(
        available=False,
        verdict="unavailable",
        confidence=0.0,
        summary=reason,
        findings=findings,
        next_steps=next_steps,
    )


def _coerce_ai_review_payload(raw_content: str) -> AiSpecReviewReport:
    try:
        payload = json.loads(raw_content)
    except json.JSONDecodeError:
        return AiSpecReviewReport(
            available=True,
            model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
            verdict="needs_review",
            confidence=0.4,
            summary=raw_content[:1200],
            findings=[],
            next_steps=["Review the free-form AI response manually because it was not returned as structured JSON."],
        )

    findings = [AiSpecReviewFinding(**item) for item in payload.get("findings", [])[:12] if isinstance(item, dict)]
    return AiSpecReviewReport(
        available=True,
        model=payload.get("model") or os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
        verdict=payload.get("verdict", "needs_review"),
        confidence=max(0.0, min(1.0, float(payload.get("confidence", 0.5)))),
        summary=str(payload.get("summary", "AI review completed; inspect findings before release."))[:1600],
        findings=findings,
        next_steps=[str(step)[:260] for step in payload.get("next_steps", [])[:8]],
    )


def ai_review_spec_to_html(spec_text: str, html: str, comparison: SpecComparisonReport | None = None) -> AiSpecReviewReport:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return _build_ai_fallback_report("AI semantic review is not configured on this backend. Deterministic spec matching remains available.", comparison)

    document_text = html_to_text(html)
    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    comparison_summary = comparison.model_dump(mode="json") if comparison else {}
    prompt = f"""
You are a Medicare document QA reviewer. Compare the generated document text against the supplied marked-up Summary of Benefits specification text. Focus on content completeness, SB structure/order, member-facing precision, HTML/accessibility/PDF-readiness risks, and whether the document can be released. Do not invent compliance guarantees. Return strict JSON only with this shape: {{"model":"{model}","verdict":"pass|needs_review|blocked","confidence":0.0,"summary":"...","findings":[{{"severity":"critical|major|minor|info","category":"content|structure|accessibility|pdf_readiness|metadata","issue":"...","recommendation":"...","evidence":"..."}}],"next_steps":["..."]}}.

Deterministic comparison summary:
{json.dumps(comparison_summary)[:6000]}

Specification text excerpt:
{normalize_text(spec_text)[:18000]}

Generated document text:
{normalize_text(document_text)[:18000]}
""".strip()
    request_body = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": "You are a careful healthcare document QA reviewer. Return valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=request_body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError) as exc:
        return _build_ai_fallback_report(f"AI semantic review could not be completed: {exc}", comparison)

    content = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
    report = _coerce_ai_review_payload(content)
    report.model = model
    return report


def compare_spec_to_html(spec_text: str, html: str) -> SpecComparisonReport:
    document_text = html_to_text(html)
    normalized_spec = normalize_text(spec_text)
    normalized_document = normalize_text(document_text)

    required_found = [term for term in SB_REQUIRED_TERMS if _contains_term(normalized_document, term)]
    required_missing = [term for term in SB_REQUIRED_TERMS if term not in required_found and _contains_term(normalized_spec, term)]

    similarity = SequenceMatcher(None, normalized_spec.lower()[:60000], normalized_document.lower()[:60000]).ratio() if normalized_spec and normalized_document else 0.0
    coverage = _coverage_score(normalized_spec, normalized_document)
    required_ratio = len(required_found) / max(1, len(required_found) + len(required_missing))
    raw_score = round((similarity * 30) + (coverage * 35) + (required_ratio * 35))
    missing_snippets = _missing_snippets(normalized_spec, normalized_document)
    order_findings = _order_findings(normalized_document)
    blocker_count = len(required_missing) + len(missing_snippets)
    order_warning_count = sum(1 for finding in order_findings if finding.severity in {"warning", "critical", "major"})
    precision_gate_passed = blocker_count == 0 and order_warning_count == 0 and required_ratio >= 1.0 and coverage >= 0.97
    score = 100 if precision_gate_passed else raw_score

    return SpecComparisonReport(
        passed=score >= 92 and blocker_count == 0 and order_warning_count == 0,
        score=max(0, min(100, score)),
        similarity=round(similarity, 4),
        coverage=round(coverage, 4),
        required_terms_found=required_found,
        required_terms_missing=required_missing,
        missing_snippets=missing_snippets,
        order_findings=order_findings,
        spec_word_count=len(_tokens(normalized_spec)),
        document_word_count=len(_tokens(normalized_document)),
    )

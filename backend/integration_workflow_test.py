from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
email = "ui-workflow-test@example.com"
password = "Password123!"


def check(name: str, response, expected: int | tuple[int, ...] = 200):
    allowed = expected if isinstance(expected, tuple) else (expected,)
    print(f"{name}: HTTP {response.status_code}")
    if response.status_code not in allowed:
        print(response.text)
        response.raise_for_status()
    return response


def main() -> None:
    response = client.post("/api/v1/auth/signup", json={"email": email, "password": password})
    if response.status_code == 409:
        response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    session = check("auth", response).json()
    headers = {"Authorization": f"Bearer {session['access_token']}"}

    clients = check("catalog_clients", client.get("/api/v1/catalog/clients")).json()
    types = check("catalog_types", client.get("/api/v1/catalog/document-types")).json()
    print(f"catalog_summary: clients={len(clients)} types={len(types)}")

    doc = check(
        "create_document",
        client.post(
            "/api/v1/managed-documents",
            headers=headers,
            json={"title": "Integrated SB Test", "client_code": "UHG", "document_type": "SB", "metadata": {"test": "true"}},
        ),
    ).json()
    doc_id = doc["id"]
    print(f"created_doc_id: {doc_id}")

    doc["stylesheet"] = "body { font-family: Arial; font-size: 11pt; line-height: 1.35; } h1 { font-size: 24pt; } h2 { font-size: 17pt; } table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #111827; padding: 7pt; }"
    first_section = doc["pages"][0]["sections"][0]
    first_section["html"] += "<p>Workflow test content update.</p>"
    first_section["repeaters"].append({"id": "test-repeater", "label": "Workflow repeater", "sort_order": 9, "html": "<p>Repeated benefit content.</p>", "data": {}})
    updated = check(
        "update_document",
        client.put(
            f"/api/v1/managed-documents/{doc_id}",
            headers=headers,
            json={"title": doc["title"], "status": "in_review", "metadata": doc["metadata"], "stylesheet": doc["stylesheet"], "pages": doc["pages"]},
        ),
    ).json()
    print(f"updated_pages: {len(updated['pages'])}")

    html = check("managed_html_inline", client.get(f"/api/v1/managed-documents/{doc_id}/html?inline=true", headers=headers)).text
    print(f"html_length: {len(html)} inline_style_present={'style=' in html}")

    inline_result = check("inline_css", client.post("/api/v1/tools/inline-css", json={"html": html, "css": updated["stylesheet"]})).json()
    print(f"inline_rules: {inline_result['applied_rules']} warnings={len(inline_result['warnings'])}")

    style_report = check("style_qa", client.post(f"/api/v1/managed-documents/{doc_id}/style-qa", headers=headers)).json()
    print(f"style_score: {style_report['score']} passed={style_report['passed']} findings={len(style_report['findings'])}")

    ai_report = check("ai_style_fixes", client.post(f"/api/v1/managed-documents/{doc_id}/ai-style-fixes", headers=headers)).json()
    print(f"ai_available: {ai_report['available']} verdict={ai_report['verdict']} suggestions={len(ai_report['suggestions'])}")

    pdf_artifact = check("pdf_export", client.post("/api/v1/exports/pdf-package", json={"html": html, "filename": "integrated-sb-test"})).json()
    print(f"pdf_bytes: {pdf_artifact['bytes_written']} filename={pdf_artifact['filename']}")

    docs = check("list_documents", client.get("/api/v1/managed-documents", headers=headers)).json()
    print(f"documents_visible: {len(docs)}")

    check("delete_document", client.delete(f"/api/v1/managed-documents/{doc_id}", headers=headers))
    missing = client.get(f"/api/v1/managed-documents/{doc_id}", headers=headers)
    print(f"post_delete_get: HTTP {missing.status_code}")
    assert missing.status_code == 404


if __name__ == "__main__":
    main()

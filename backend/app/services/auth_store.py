from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from pydantic import TypeAdapter

from app.core.schemas import AuthoringPage, AuthUser, ManagedDocument, ManagedDocumentSummary

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "storage" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "app.db"
JWT_ALG = "HS256"
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7


def _secret() -> bytes:
    secret = os.environ.get("JWT_SECRET") or os.environ.get("SECRET_KEY") or "dev-change-me-health-doc-cms"
    return secret.encode("utf-8")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


def _json_b64(payload: dict) -> str:
    return _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_store() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS managed_documents (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                title TEXT NOT NULL,
                client_code TEXT NOT NULL,
                document_type TEXT NOT NULL,
                status TEXT NOT NULL,
                metadata_json TEXT NOT NULL,
                stylesheet TEXT NOT NULL,
                pages_json TEXT NOT NULL,
                latest_qa_score INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(owner_id) REFERENCES users(id)
            )
            """
        )
        conn.commit()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or _b64url(os.urandom(16))
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return f"pbkdf2_sha256${salt}${_b64url(digest)}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        method, salt, digest = stored_hash.split("$", 2)
    except ValueError:
        return False
    if method != "pbkdf2_sha256":
        return False
    return hmac.compare_digest(hash_password(password, salt), stored_hash)


def create_token(user_id: str, email: str) -> str:
    header = {"alg": JWT_ALG, "typ": "JWT"}
    payload = {"sub": user_id, "email": email, "iat": int(time.time()), "exp": int(time.time()) + TOKEN_TTL_SECONDS}
    unsigned = f"{_json_b64(header)}.{_json_b64(payload)}"
    signature = _b64url(hmac.new(_secret(), unsigned.encode("ascii"), hashlib.sha256).digest())
    return f"{unsigned}.{signature}"


def decode_token(token: str) -> dict:
    try:
        header_b64, payload_b64, signature = token.split(".")
        unsigned = f"{header_b64}.{payload_b64}"
        expected = _b64url(hmac.new(_secret(), unsigned.encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError("invalid signature")
        header = json.loads(_b64url_decode(header_b64))
        payload = json.loads(_b64url_decode(payload_b64))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid bearer token") from exc
    if header.get("alg") != JWT_ALG or int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=401, detail="Expired or invalid bearer token")
    return payload


def _row_to_user(row: sqlite3.Row) -> AuthUser:
    return AuthUser(id=row["id"], email=row["email"], created_at=datetime.fromisoformat(row["created_at"]))


def create_user(email: str, password: str) -> AuthUser:
    init_store()
    email = normalize_email(email)
    user_id = str(uuid4())
    created_at = _now_iso()
    try:
        with _connect() as conn:
            conn.execute(
                "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (user_id, email, hash_password(password), created_at),
            )
            conn.commit()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="An account with this email already exists") from exc
    return AuthUser(id=user_id, email=email, created_at=datetime.fromisoformat(created_at))


def authenticate_user(email: str, password: str) -> AuthUser:
    init_store()
    email = normalize_email(email)
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row or not verify_password(password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return _row_to_user(row)


def get_user(user_id: str) -> AuthUser:
    init_store()
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    return _row_to_user(row)


def _doc_to_row_values(document: ManagedDocument) -> tuple:
    return (
        document.id,
        document.owner_id,
        document.title,
        document.client_code,
        document.document_type.value,
        document.status,
        json.dumps(document.metadata),
        document.stylesheet,
        json.dumps([page.model_dump(mode="json") for page in document.pages]),
        document.latest_qa_score,
        document.created_at.isoformat(),
        document.updated_at.isoformat(),
    )


def _row_to_doc(row: sqlite3.Row) -> ManagedDocument:
    pages = TypeAdapter(list[AuthoringPage]).validate_python(json.loads(row["pages_json"] or "[]"))
    return ManagedDocument(
        id=row["id"],
        owner_id=row["owner_id"],
        title=row["title"],
        client_code=row["client_code"],
        document_type=row["document_type"],
        status=row["status"],
        metadata=json.loads(row["metadata_json"] or "{}"),
        stylesheet=row["stylesheet"] or "",
        pages=pages,
        latest_qa_score=row["latest_qa_score"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


def save_document(document: ManagedDocument) -> ManagedDocument:
    init_store()
    document.updated_at = datetime.now(timezone.utc)
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO managed_documents (id, owner_id, title, client_code, document_type, status, metadata_json, stylesheet, pages_json, latest_qa_score, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title=excluded.title,
                client_code=excluded.client_code,
                document_type=excluded.document_type,
                status=excluded.status,
                metadata_json=excluded.metadata_json,
                stylesheet=excluded.stylesheet,
                pages_json=excluded.pages_json,
                latest_qa_score=excluded.latest_qa_score,
                updated_at=excluded.updated_at
            """,
            _doc_to_row_values(document),
        )
        conn.commit()
    return document


def list_documents(owner_id: str) -> list[ManagedDocumentSummary]:
    init_store()
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM managed_documents WHERE owner_id = ? ORDER BY updated_at DESC", (owner_id,)).fetchall()
    summaries: list[ManagedDocumentSummary] = []
    for row in rows:
        doc = _row_to_doc(row)
        summaries.append(
            ManagedDocumentSummary(
                id=doc.id,
                title=doc.title,
                client_code=doc.client_code,
                document_type=doc.document_type,
                status=doc.status,
                page_count=len(doc.pages),
                section_count=sum(len(page.sections) for page in doc.pages),
                latest_qa_score=doc.latest_qa_score,
                updated_at=doc.updated_at,
            )
        )
    return summaries


def get_document_for_user(document_id: str, owner_id: str) -> ManagedDocument:
    init_store()
    with _connect() as conn:
        row = conn.execute("SELECT * FROM managed_documents WHERE id = ? AND owner_id = ?", (document_id, owner_id)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Managed document not found")
    return _row_to_doc(row)


def delete_document_for_user(document_id: str, owner_id: str) -> None:
    init_store()
    with _connect() as conn:
        cursor = conn.execute("DELETE FROM managed_documents WHERE id = ? AND owner_id = ?", (document_id, owner_id))
        conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Managed document not found")

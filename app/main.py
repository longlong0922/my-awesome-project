"""Resume Optimizer Agent - FastAPI backend."""

import html
import json
import os
import sqlite3
import tempfile
import uuid
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from openai import OpenAI
from pydantic import BaseModel
from dotenv import load_dotenv

app = FastAPI(title="Resume Optimizer Agent", version="4.0.0")

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
PROMPTS_DIR = PROJECT_DIR / "prompts"
DB_PATH = PROJECT_DIR / "data" / "history.db"

load_dotenv(PROJECT_DIR / ".env")

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


STRUCTURED_TEMPLATE = {
    "name": "",
    "phone": "",
    "email": "",
    "birth_date": "",
    "target_position": "",
    "city": "",
    "advantages": "",
    "skills": "",
    "experience": [],
    "projects": [],
    "education": [],
    "certificates": "",
    "languages": "",
    "custom_sections": [],
}


def load_prompt(name: str) -> str:
    path = PROMPTS_DIR / f"{name}.md"
    if not path.exists():
        raise HTTPException(status_code=500, detail=f"Prompt file missing: {path.name}")
    return path.read_text(encoding="utf-8")


def _ensure_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                resume TEXT NOT NULL,
                jd TEXT NOT NULL,
                analysis_json TEXT,
                analysis_raw TEXT,
                optimized_resume TEXT,
                structured_data TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        try:
            conn.execute("SELECT structured_data FROM sessions LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute("ALTER TABLE sessions ADD COLUMN structured_data TEXT")


@contextmanager
def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


_ensure_db()


def get_llm_client() -> OpenAI:
    api_key = os.environ.get("LLM_API_KEY")
    base_url = os.environ.get("LLM_BASE_URL", "https://api.deepseek.com")
    if not api_key:
        raise HTTPException(status_code=500, detail="LLM_API_KEY environment variable not set")
    return OpenAI(api_key=api_key, base_url=base_url)


def call_llm(system_prompt: str, user_prompt: str, temperature: float = 0.7) -> str:
    client = get_llm_client()
    model = os.environ.get("LLM_MODEL", "deepseek-chat")
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        max_tokens=4096,
    )
    return response.choices[0].message.content or ""


def parse_llm_json(raw: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0]
    return json.loads(text)


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        parts = [normalize_text(item) for item in value]
        return "\n".join(part for part in parts if part)
    return str(value).strip()


def normalize_records(items: Any, keys: list[str]) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    if not isinstance(items, list):
        return normalized
    for item in items:
        source = item if isinstance(item, dict) else {}
        normalized.append({key: normalize_text(source.get(key)) for key in keys})
    return normalized


def normalize_custom_sections(items: Any) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    if not isinstance(items, list):
        return normalized
    for item in items:
        source = item if isinstance(item, dict) else {}
        title = normalize_text(source.get("title"))
        content = normalize_text(source.get("content"))
        if title or content:
            normalized.append({"title": title, "content": content})
    return normalized


def normalize_structured_data(data: Any) -> dict[str, Any]:
    source = data if isinstance(data, dict) else {}
    normalized = dict(STRUCTURED_TEMPLATE)
    for field in ("name", "phone", "email", "birth_date", "target_position", "city"):
        normalized[field] = normalize_text(source.get(field))
    for field in ("advantages", "skills", "certificates", "languages"):
        normalized[field] = normalize_text(source.get(field))
    normalized["experience"] = normalize_records(
        source.get("experience"), ["company", "position", "period", "description"]
    )
    normalized["projects"] = normalize_records(
        source.get("projects"), ["name", "role", "period", "description"]
    )
    normalized["education"] = normalize_records(
        source.get("education"), ["school", "major", "degree", "period"]
    )
    normalized["custom_sections"] = normalize_custom_sections(source.get("custom_sections"))
    return normalized


def markdown_text(value: str) -> str:
    return normalize_text(value).replace("\r\n", "\n").strip()


def structured_to_markdown(data: dict[str, Any]) -> str:
    structured = normalize_structured_data(data)
    lines: list[str] = []

    name = structured["name"] or "姓名"
    lines.append(f"# {name}")

    contact = [structured["phone"], structured["email"]]
    contact_line = " | ".join(part for part in contact if part)
    if contact_line:
        lines.append(contact_line)
    if structured["target_position"]:
        lines.append(f"**求职意向：** {structured['target_position']}")
    if structured["city"]:
        lines.append(f"**期望城市：** {structured['city']}")
    if structured["birth_date"]:
        lines.append(f"**出生日期：** {structured['birth_date']}")
    lines.append("")

    def append_text_section(title: str, content: str) -> None:
        text = markdown_text(content)
        if not text:
            return
        lines.extend([f"## {title}", text, ""])

    append_text_section("个人优势", structured["advantages"])
    append_text_section("专业技能", structured["skills"])

    if structured["experience"]:
        lines.append("## 工作经历")
        for exp in structured["experience"]:
            title_parts = [exp["company"], exp["position"]]
            title = " | ".join(part for part in title_parts if part) or "工作经历"
            lines.append(f"### {title}")
            if exp["period"]:
                lines.append(f"**{exp['period']}**")
            if exp["description"]:
                lines.extend(["", markdown_text(exp["description"])])
            lines.append("")

    if structured["projects"]:
        lines.append("## 项目经验")
        for project in structured["projects"]:
            title_parts = [project["name"], project["role"]]
            title = " | ".join(part for part in title_parts if part) or "项目经验"
            lines.append(f"### {title}")
            if project["period"]:
                lines.append(f"**{project['period']}**")
            if project["description"]:
                lines.extend(["", markdown_text(project["description"])])
            lines.append("")

    if structured["education"]:
        lines.append("## 教育背景")
        for edu in structured["education"]:
            title = " - ".join(part for part in [edu["school"], edu["major"], edu["degree"]] if part) or "教育背景"
            lines.append(f"### {title}")
            if edu["period"]:
                lines.append(f"**{edu['period']}**")
            lines.append("")

    append_text_section("证书资格", structured["certificates"])
    append_text_section("语言能力", structured["languages"])

    for section in structured["custom_sections"]:
        title = markdown_text(section["title"]) or "附加模块"
        append_text_section(title, section["content"])

    return "\n".join(lines).strip() + "\n"


def markdown_to_html(markdown_text_value: str) -> str:
    try:
        import markdown

        return markdown.markdown(
            markdown_text_value,
            extensions=["fenced_code", "tables", "sane_lists", "nl2br"],
        )
    except ImportError:
        escaped = html.escape(markdown_text_value)
        return f"<pre>{escaped}</pre>"


def session_candidate_name(structured_data: Optional[str], resume: str) -> str:
    if structured_data:
        try:
            parsed = json.loads(structured_data)
            name = normalize_text(parsed.get("name"))
            if name:
                return name
        except json.JSONDecodeError:
            pass
    first_line = normalize_text(resume).splitlines()
    return first_line[0][:20] if first_line else "未命名候选人"


def extract_text_from_pdf(file_bytes: bytes) -> str:
    import pdfplumber

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name
    try:
        with pdfplumber.open(tmp_path) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
        return "\n\n".join(page for page in pages if page).strip()
    finally:
        os.unlink(tmp_path)


def extract_text_from_docx(file_bytes: bytes) -> str:
    import docx

    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name
    try:
        document = docx.Document(tmp_path)
        return "\n".join(paragraph.text for paragraph in document.paragraphs if paragraph.text.strip())
    finally:
        os.unlink(tmp_path)


class AnalyzeRequest(BaseModel):
    resume: str
    jd: str


class OptimizeRequest(BaseModel):
    session_id: str


class ParseResumeRequest(BaseModel):
    text: str
    jd: str = ""
    session_id: Optional[str] = None
    source: Literal["resume", "optimized"] = "resume"


class PolishRequest(BaseModel):
    content: str
    action: Literal["polish", "simplify", "expand", "summarize"]
    jd: str = ""


class ExportPdfRequest(BaseModel):
    markdown: str = ""
    structured_data: Optional[dict[str, Any]] = None


class SaveSessionRequest(BaseModel):
    session_id: str
    structured_data: dict[str, Any]
    markdown: str


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/api/upload")
async def upload_resume(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="未选择文件")

    content = await file.read()
    filename = file.filename.lower()

    if filename.endswith(".pdf"):
        text = extract_text_from_pdf(content)
    elif filename.endswith(".docx"):
        text = extract_text_from_docx(content)
    elif filename.endswith(".doc"):
        raise HTTPException(status_code=400, detail="暂不支持 .doc，请转换为 .docx 或 PDF")
    elif filename.endswith(".txt") or filename.endswith(".md"):
        text = content.decode("utf-8", errors="replace")
    else:
        raise HTTPException(status_code=400, detail="仅支持 PDF、DOCX、TXT、MD 文件")

    if not text.strip():
        raise HTTPException(status_code=400, detail="文件内容为空或无法解析")

    return {"text": text, "filename": file.filename}


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    if not req.resume.strip() or not req.jd.strip():
        raise HTTPException(status_code=400, detail="简历内容和职位描述不能为空")

    system_prompt = load_prompt("analyze_system")
    user_prompt = load_prompt("analyze_user").format(resume=req.resume, jd=req.jd)
    raw_result = call_llm(system_prompt, user_prompt)

    try:
        analysis = parse_llm_json(raw_result)
    except json.JSONDecodeError:
        analysis = {
            "match_score": 0,
            "highlights": [],
            "gaps": [],
            "suggestions": [],
            "summary": raw_result.strip(),
        }

    session_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO sessions (id, resume, jd, analysis_json, analysis_raw, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                req.resume,
                req.jd,
                json.dumps(analysis, ensure_ascii=False),
                raw_result,
                now,
                now,
            ),
        )

    return {"session_id": session_id, "analysis": analysis}


@app.post("/api/parse-resume")
async def parse_resume(req: ParseResumeRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="简历内容不能为空")

    system_prompt = load_prompt("parse_resume")
    raw_result = call_llm(system_prompt, req.text, temperature=0.3)

    try:
        structured = normalize_structured_data(parse_llm_json(raw_result))
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="简历解析失败，请重试")

    now = datetime.now().isoformat()
    structured_json = json.dumps(structured, ensure_ascii=False)

    with get_db() as conn:
        if req.session_id:
            row = conn.execute("SELECT id, jd FROM sessions WHERE id = ?", (req.session_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="会话不存在，请重新开始")
            jd_value = req.jd.strip() or row["jd"] or ""
            if req.source == "resume":
                conn.execute(
                    """
                    UPDATE sessions
                    SET resume = ?, jd = ?, structured_data = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (req.text, jd_value, structured_json, now, req.session_id),
                )
            else:
                conn.execute(
                    """
                    UPDATE sessions
                    SET optimized_resume = ?, jd = ?, structured_data = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (req.text, jd_value, structured_json, now, req.session_id),
                )
            session_id = req.session_id
        else:
            session_id = str(uuid.uuid4())
            resume_value = req.text if req.source == "resume" else ""
            optimized_value = req.text if req.source == "optimized" else None
            conn.execute(
                """
                INSERT INTO sessions (
                    id, resume, jd, analysis_json, analysis_raw,
                    optimized_resume, structured_data, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    resume_value,
                    req.jd.strip(),
                    None,
                    None,
                    optimized_value,
                    structured_json,
                    now,
                    now,
                ),
            )

    return {"session_id": session_id, "structured": structured}


@app.post("/api/polish")
async def polish(req: PolishRequest):
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="内容不能为空")

    system_prompt = load_prompt("polish_section").format(action=req.action, jd=req.jd or "（未提供）")
    result = call_llm(system_prompt, req.content, temperature=0.45)
    return {"result": result.strip()}


@app.post("/api/optimize")
async def optimize(req: OptimizeRequest):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (req.session_id,)).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="会话不存在，请重新分析")

    system_prompt = load_prompt("optimize_system")
    user_prompt = load_prompt("optimize_user").format(
        resume=row["resume"],
        jd=row["jd"],
        analysis=row["analysis_raw"] or "（暂无分析结果）",
    )
    optimized_markdown = call_llm(system_prompt, user_prompt, temperature=0.45)

    with get_db() as conn:
        conn.execute(
            "UPDATE sessions SET optimized_resume = ?, updated_at = ? WHERE id = ?",
            (optimized_markdown, datetime.now().isoformat(), req.session_id),
        )

    return {"optimized_resume": optimized_markdown}


@app.post("/api/save-session")
async def save_session(req: SaveSessionRequest):
    structured = normalize_structured_data(req.structured_data)
    with get_db() as conn:
        result = conn.execute(
            """
            UPDATE sessions
            SET structured_data = ?, optimized_resume = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                json.dumps(structured, ensure_ascii=False),
                req.markdown.strip(),
                datetime.now().isoformat(),
                req.session_id,
            ),
        )

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="会话不存在，无法保存")

    return {"ok": True, "structured": structured}


@app.post("/api/export-pdf")
async def export_pdf(req: ExportPdfRequest):
    try:
        from weasyprint import HTML as WeasyHTML
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="PDF 导出依赖缺失，请执行 pip install -r requirements.txt 或重新 docker compose up --build",
        )

    markdown_source = req.markdown.strip()
    if req.structured_data:
        markdown_source = structured_to_markdown(req.structured_data)
    if not markdown_source:
        raise HTTPException(status_code=400, detail="没有可导出的内容")

    body_html = markdown_to_html(markdown_source)
    document_html = f"""
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="utf-8">
        <style>
            @page {{
                size: A4;
                margin: 20mm 16mm;
            }}
            body {{
                font-family: "Noto Sans CJK SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
                color: #1f2937;
                font-size: 13px;
                line-height: 1.75;
            }}
            h1 {{
                font-size: 26px;
                margin: 0 0 8px;
                padding-bottom: 10px;
                border-bottom: 2px solid #0f172a;
            }}
            h2 {{
                font-size: 17px;
                margin: 18px 0 8px;
                padding-bottom: 4px;
                border-bottom: 1px solid #cbd5e1;
                color: #0f172a;
            }}
            h3 {{
                font-size: 14px;
                margin: 14px 0 6px;
                color: #111827;
            }}
            p {{
                margin: 6px 0;
            }}
            ul, ol {{
                margin: 6px 0;
                padding-left: 18px;
            }}
            li {{
                margin: 4px 0;
            }}
            strong {{
                color: #0f172a;
            }}
            code {{
                font-size: 12px;
                background: #f3f4f6;
                padding: 1px 4px;
                border-radius: 4px;
            }}
            pre {{
                white-space: pre-wrap;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                padding: 10px 12px;
                border-radius: 8px;
            }}
            table {{
                width: 100%;
                border-collapse: collapse;
                margin: 10px 0;
            }}
            th, td {{
                border: 1px solid #d1d5db;
                padding: 6px 8px;
                text-align: left;
            }}
            th {{
                background: #f8fafc;
            }}
        </style>
    </head>
    <body>{body_html}</body>
    </html>
    """

    pdf_bytes = WeasyHTML(string=document_html).write_pdf()
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=resume.pdf"},
    )


@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="会话不存在")

    structured = None
    if row["structured_data"]:
        try:
            structured = normalize_structured_data(json.loads(row["structured_data"]))
        except json.JSONDecodeError:
            structured = None

    analysis = None
    if row["analysis_json"]:
        try:
            analysis = json.loads(row["analysis_json"])
        except json.JSONDecodeError:
            analysis = None

    return {
        "session_id": session_id,
        "resume": row["resume"],
        "jd": row["jd"],
        "analysis": analysis,
        "optimized_resume": row["optimized_resume"],
        "structured_data": structured,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


@app.get("/api/history")
async def list_history(limit: int = 20, offset: int = 0):
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, resume, jd, analysis_json, optimized_resume, structured_data, created_at, updated_at
            FROM sessions
            ORDER BY updated_at DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()
        total = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]

    items = []
    for row in rows:
        analysis = json.loads(row["analysis_json"]) if row["analysis_json"] else {}
        has_structured = bool(row["structured_data"])
        has_optimized = bool(row["optimized_resume"])
        status = "已编辑" if has_structured else "已分析" if row["analysis_json"] else "草稿"
        items.append(
            {
                "session_id": row["id"],
                "candidate_name": session_candidate_name(row["structured_data"], row["resume"]),
                "resume_preview": normalize_text(row["resume"])[:90],
                "jd_preview": normalize_text(row["jd"])[:90],
                "match_score": analysis.get("match_score", 0),
                "status": status,
                "has_structured": has_structured,
                "has_optimized": has_optimized,
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
        )

    return {"items": items, "total": total}


@app.delete("/api/history/{session_id}")
async def delete_history(session_id: str):
    with get_db() as conn:
        result = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="记录不存在")

    return {"ok": True}


@app.post("/api/structured-to-markdown")
async def convert_structured_to_markdown(data: dict[str, Any]):
    structured = normalize_structured_data(data)
    return {"markdown": structured_to_markdown(structured)}


@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

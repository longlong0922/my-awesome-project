# 简历优化 Agent

一个基于 FastAPI + LLM 的简历分析与优化应用，支持：

- 上传或粘贴简历内容
- 基于 JD 做匹配度分析
- 生成定向优化后的简历
- 将简历解析为结构化模块并继续编辑
- 对单个模块执行 AI 润色、简化、扩展、总结
- 自动保存历史记录
- 导出 Markdown 与 PDF

应用默认通过 DeepSeek 兼容的 OpenAI SDK 接口调用大模型，`API Key` 只允许通过环境变量配置。

## 技术栈

- 后端：FastAPI
- 前端：原生 HTML / CSS / JavaScript
- LLM：OpenAI Python SDK（兼容 DeepSeek / OpenAI 风格接口）
- 存储：SQLite
- 文件解析：`pdfplumber`、`python-docx`
- PDF 导出：`WeasyPrint`
- 部署：Docker / Docker Compose

## 功能说明

### 1. JD 匹配分析

输入简历和目标 JD 后，系统会调用 LLM 返回结构化分析结果，包括：

- 匹配度评分
- 匹配亮点
- 主要缺口
- 优化建议
- 总结说明

### 2. 优化后继续编辑

在分析结果页可以直接生成优化后的简历，然后进入结构化编辑器继续修改。

### 3. 上传后直接编辑

用户也可以跳过 JD 分析，直接上传或粘贴简历，让系统自动解析出：

- 基本信息
- 个人优势
- 专业技能
- 工作经历
- 项目经验
- 教育背景
- 证书资格
- 语言能力
- 附加模块

解析后的内容都可以继续手动修改，并对单个模块做 AI 润色。

### 4. 历史记录与自动保存

每次分析或解析都会创建会话，结构化编辑过程会自动保存到 SQLite，支持从历史记录中恢复。

### 5. Markdown / PDF 导出

编辑器右侧提供实时预览，并支持：

- 导出 Markdown
- 导出 PDF
- 复制 Markdown

## 目录结构

```text
resume-optimizer/
├── app/
│   ├── main.py
│   ├── static/
│   │   ├── app.js
│   │   └── style.css
│   └── templates/
│       └── index.html
├── data/
│   └── history.db
├── prompts/
│   ├── analyze_system.md
│   ├── analyze_user.md
│   ├── optimize_system.md
│   ├── optimize_user.md
│   ├── parse_resume.md
│   └── polish_section.md
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── README.md
```

## 环境变量配置

在项目根目录创建 `.env` 文件：

```bash
cp .env.example .env
```

然后填写以下变量：

```env
LLM_API_KEY=sk-your-api-key
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

### 环境变量说明

| 变量名 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `LLM_API_KEY` | 是 | 无 | 大模型 API Key，禁止硬编码 |
| `LLM_BASE_URL` | 否 | `https://api.deepseek.com` | 兼容 OpenAI SDK 的接口地址 |
| `LLM_MODEL` | 否 | `deepseek-chat` | 模型名 |

## 使用 Docker 构建和启动

### 方式一：Docker 命令

#### 1. 构建镜像

```bash
docker build -t resume-optimizer .
```

#### 2. 启动容器

```bash
docker run --rm -p 8000:8000 \
  --env-file .env \
  -v resume_optimizer_data:/app/data \
  resume-optimizer
```

### 方式二：Docker Compose

#### 1. 启动

```bash
docker compose up --build
```

后台运行：

```bash
docker compose up --build -d
```

#### 2. 停止

```bash
docker compose down
```

## 如何访问应用

服务启动后，在浏览器访问：

```text
http://localhost:8000
```

健康检查接口：

```text
http://localhost:8000/health
```

## 使用流程

### 路径 A：先分析，再优化，再编辑

1. 在左侧输入或上传简历
2. 在右侧输入目标 JD
3. 点击“分析匹配度”
4. 查看匹配分析结果
5. 点击“生成优化简历并编辑”
6. 在结构化编辑器中继续调整
7. 导出 MD 或 PDF

### 路径 B：直接解析并编辑

1. 输入或上传简历
2. 如有需要可填写 JD（用于后续局部润色）
3. 点击“直接解析并编辑”
4. 在编辑器中调整结构化内容
5. 导出 MD 或 PDF

## 面试验收建议

面试官可以按以下步骤快速验收：

1. 配置 `.env`
2. 执行 `docker compose up --build`
3. 打开 `http://localhost:8000`
4. 上传一份 PDF 或粘贴简历
5. 输入一段 JD
6. 验证分析结果、优化结果、结构化编辑、局部 AI 润色是否可用
7. 验证历史记录是否能恢复会话
8. 验证 Markdown 和 PDF 是否能正常导出

## API 概览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/` | 主页面 |
| `POST` | `/api/upload` | 上传并提取简历文本 |
| `POST` | `/api/analyze` | 简历与 JD 匹配分析 |
| `POST` | `/api/optimize` | 生成优化后的简历 |
| `POST` | `/api/parse-resume` | 将简历解析为结构化数据 |
| `POST` | `/api/polish` | 局部 AI 润色 |
| `POST` | `/api/save-session` | 保存编辑器内容 |
| `POST` | `/api/export-pdf` | 导出 PDF |
| `GET` | `/api/history` | 查看历史记录 |
| `GET` | `/api/session/{id}` | 查看单个会话 |
| `DELETE` | `/api/history/{id}` | 删除历史记录 |
| `GET` | `/health` | 健康检查 |

## 说明与限制

- 当前 `.doc` 文件不支持，建议转换为 `.docx` 或 PDF
- 扫描版 PDF 的文字提取效果取决于原文件质量
- SQLite 默认保存在容器内 `/app/data/history.db`
- `docker-compose.yml` 已挂载数据卷，重启容器后历史记录仍会保留

## 本地开发（可选）

如果你不使用 Docker，也可以本地运行：

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

说明：

- 代码启动时会自动读取项目根目录下的 `.env`
- 如果你修改了 `.env`，需要重启 `uvicorn`

然后访问：

```text
http://localhost:8000
```

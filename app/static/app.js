let currentSessionId = null;
let structuredData = null;
let currentJd = "";
let saveTimer = null;
let currentPageId = "step-input";
let lastPageId = null;
let compareBaseline = null;
let compareVisible = false;


function showPage(id) {
    if (currentPageId && currentPageId !== id) {
        lastPageId = currentPageId;
    }
    document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
    const target = document.getElementById(id);
    if (target) {
        target.classList.add("active");
    }
    currentPageId = id;
    updateBackButton();
    window.scrollTo({ top: 0, behavior: "smooth" });
}


function showLoading(text) {
    document.getElementById("loading-text").textContent = text || "AI 正在处理中...";
    document.getElementById("loading").classList.add("active");
}


function hideLoading() {
    document.getElementById("loading").classList.remove("active");
}


function showToast(message) {
    let toast = document.querySelector(".toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.className = "toast";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2400);
}


function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}


function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}


function scoreClass(score) {
    if (score >= 75) return "score-high";
    if (score >= 45) return "score-mid";
    return "score-low";
}


function scoreTextClass(score) {
    if (score >= 75) return "score-high-text";
    if (score >= 45) return "score-mid-text";
    return "score-low-text";
}


function actionLabel(action) {
    return {
        polish: "润色",
        simplify: "简化",
        expand: "扩展",
        summarize: "总结",
    }[action] || action;
}


function emptyStructuredData() {
    return {
        name: "",
        phone: "",
        email: "",
        birth_date: "",
        target_position: "",
        city: "",
        advantages: "",
        skills: "",
        experience: [],
        projects: [],
        education: [],
        certificates: "",
        languages: "",
        custom_sections: [],
    };
}


function ensureStructuredData(data) {
    const base = emptyStructuredData();
    const source = data || {};
    return {
        ...base,
        ...source,
        experience: Array.isArray(source.experience) ? source.experience : [],
        projects: Array.isArray(source.projects) ? source.projects : [],
        education: Array.isArray(source.education) ? source.education : [],
        custom_sections: Array.isArray(source.custom_sections) ? source.custom_sections : [],
    };
}


function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}


function setSaveState(type, message) {
    const el = document.getElementById("save-state");
    if (!el) return;
    el.className = `save-state ${type}`;
    el.textContent = message;
}


function formatTime(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}


function downloadSafeName(value) {
    return String(value || "export")
        .replace(/[\\/:*?"<>|]+/g, "_")
        .trim() || "export";
}


function setInputValues(resume, jd) {
    document.getElementById("resume").value = resume || "";
    document.getElementById("jd").value = jd || "";
}


function updateBackButton() {
    const button = document.getElementById("nav-back");
    if (!button) return;
    button.hidden = !lastPageId || lastPageId === currentPageId;
}


function hasCompareState() {
    if (!compareBaseline || !structuredData) return false;
    if (compareBaseline.type === "structured") {
        return Boolean(compareBaseline.data);
    }
    return Boolean(String(compareBaseline.text || "").trim());
}


function updateCompareButton() {
    const button = document.getElementById("compare-toggle");
    if (!button) return;
    const visible = hasCompareState();
    button.hidden = !visible;
    button.textContent = compareVisible ? "关闭对比" : "查看对比";
}


function clearCompareState() {
    compareBaseline = null;
    compareVisible = false;
    updateCompareButton();
}


function setCompareBaselineFromRaw(text, title = "优化前原简历", autoOpen = false) {
    const value = String(text || "").trim();
    if (!value) {
        clearCompareState();
        return;
    }
    compareBaseline = { type: "raw", title, text: value };
    compareVisible = autoOpen;
    updateCompareButton();
}


function setCompareBaselineFromStructured(data, title = "优化前版本", autoOpen = false) {
    compareBaseline = {
        type: "structured",
        title,
        data: ensureStructuredData(deepClone(data)),
    };
    compareVisible = autoOpen;
    updateCompareButton();
}


function toggleCompareView() {
    if (!hasCompareState()) {
        showToast("当前没有可对比的优化前内容");
        return;
    }
    compareVisible = !compareVisible;
    updateCompareButton();
    updatePreview();
}


function goBack(fallback = "step-input") {
    if (lastPageId && lastPageId !== currentPageId) {
        showPage(lastPageId);
        return;
    }
    if (fallback && fallback !== currentPageId) {
        showPage(fallback);
    }
}


function startOver() {
    currentSessionId = null;
    structuredData = null;
    currentJd = "";
    clearTimeout(saveTimer);
    clearCompareState();
    lastPageId = null;
    currentPageId = "step-input";
    setInputValues("", "");
    document.getElementById("analysis-content").innerHTML = "";
    document.getElementById("editor-sections").innerHTML = "";
    document.getElementById("preview-content").innerHTML = "";
    document.getElementById("upload-status").textContent = "";
    document.getElementById("resume-file").value = "";
    setSaveState("idle", "未保存");
    updateBackButton();
    showPage("step-input");
}


async function handleFileUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const status = document.getElementById("upload-status");
    status.textContent = "上传并解析中...";
    status.className = "upload-status uploading";

    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await fetch("/api/upload", {
            method: "POST",
            body: formData,
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || "上传失败");
        }
        document.getElementById("resume").value = data.text;
        status.textContent = `已导入 ${data.filename}`;
        status.className = "upload-status success";
    } catch (error) {
        status.textContent = `失败：${error.message}`;
        status.className = "upload-status error";
        showToast(`文件解析失败：${error.message}`);
    } finally {
        input.value = "";
    }
}


async function doAnalyze() {
    const resume = document.getElementById("resume").value.trim();
    currentJd = document.getElementById("jd").value.trim();

    if (!resume) {
        showToast("请输入简历内容");
        return;
    }
    if (!currentJd) {
        showToast("请输入目标职位描述");
        return;
    }

    showLoading("AI 正在分析简历与 JD 的匹配度...");

    try {
        const response = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resume, jd: currentJd }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || "分析失败");
        }

        currentSessionId = data.session_id;
        clearCompareState();
        renderAnalysis(data.analysis || {});
        showPage("step-analysis");
    } catch (error) {
        showToast(`分析失败：${error.message}`);
    } finally {
        hideLoading();
    }
}


function renderAnalysis(analysis) {
    const score = Number(analysis.match_score || 0);
    const highlights = Array.isArray(analysis.highlights) ? analysis.highlights : [];
    const gaps = Array.isArray(analysis.gaps) ? analysis.gaps : [];
    const suggestions = Array.isArray(analysis.suggestions) ? analysis.suggestions : [];

    let html = `
        <div class="analysis-score-card">
            <div class="score-circle ${scoreClass(score)}">${score}</div>
            <div>
                <p class="eyebrow">Match Score</p>
                <h3>匹配度 ${score}/100</h3>
                <p class="muted">${escapeHtml(analysis.summary || "已完成简历与 JD 的匹配分析。")}</p>
            </div>
        </div>
        <div class="analysis-grid">
    `;

    html += buildAnalysisColumn("匹配亮点", "analysis-good", highlights, "point", "detail");
    html += buildAnalysisColumn("主要缺口", "analysis-gap", gaps, "point", "detail");
    html += buildAnalysisColumn("优化建议", "analysis-tip", suggestions, "category", "content");
    html += "</div>";

    document.getElementById("analysis-content").innerHTML = html;
}


function buildAnalysisColumn(title, cardClass, items, titleKey, detailKey) {
    if (!items.length) {
        return `
            <div class="analysis-column ${cardClass}">
                <div class="analysis-column-header">
                    <h4>${title}</h4>
                </div>
                <p class="muted">暂无内容</p>
            </div>
        `;
    }

    const body = items
        .map(
            (item) => `
                <div class="analysis-item">
                    <strong>${escapeHtml(item[titleKey] || "未命名")}</strong>
                    <p>${escapeHtml(item[detailKey] || "")}</p>
                </div>
            `
        )
        .join("");

    return `
        <div class="analysis-column ${cardClass}">
            <div class="analysis-column-header">
                <h4>${title}</h4>
            </div>
            ${body}
        </div>
    `;
}


async function doParseAndEdit() {
    const resume = document.getElementById("resume").value.trim();
    currentJd = document.getElementById("jd").value.trim();

    if (!resume) {
        showToast("请先提供简历内容");
        return;
    }

    showLoading("AI 正在解析简历为可编辑结构...");

    try {
        const response = await fetch("/api/parse-resume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: resume,
                jd: currentJd,
                session_id: currentSessionId,
                source: "resume",
            }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || "解析失败");
        }

        currentSessionId = data.session_id;
        structuredData = ensureStructuredData(data.structured);
        clearCompareState();
        renderEditor();
        updatePreview();
        setSaveState("saved", "已保存");
        showPage("step-editor");
    } catch (error) {
        showToast(`解析失败：${error.message}`);
    } finally {
        hideLoading();
    }
}


async function doOptimizeAndEdit() {
    if (!currentSessionId) {
        showToast("请先完成匹配分析");
        return;
    }

    showLoading("AI 正在生成优化后的简历...");

    try {
        const optimizeResponse = await fetch("/api/optimize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: currentSessionId }),
        });
        const optimizeData = await optimizeResponse.json();
        if (!optimizeResponse.ok) {
            throw new Error(optimizeData.detail || "优化失败");
        }

        showLoading("AI 正在把优化结果整理成结构化编辑内容...");
        const parseResponse = await fetch("/api/parse-resume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: optimizeData.optimized_resume,
                jd: currentJd,
                session_id: currentSessionId,
                source: "optimized",
            }),
        });
        const parseData = await parseResponse.json();
        if (!parseResponse.ok) {
            throw new Error(parseData.detail || "优化结果解析失败");
        }

        currentSessionId = parseData.session_id;
        structuredData = ensureStructuredData(parseData.structured);
        setCompareBaselineFromRaw(document.getElementById("resume").value.trim(), "原始简历", true);
        renderEditor();
        updatePreview();
        setSaveState("saved", "已保存");
        showPage("step-editor");
    } catch (error) {
        showToast(`优化失败：${error.message}`);
    } finally {
        hideLoading();
    }
}


function renderEditor() {
    if (!structuredData) return;

    const data = ensureStructuredData(structuredData);
    structuredData = data;

    let html = `
        <section class="ed-section">
            <div class="ed-header">
                <div>
                    <h3>基本信息</h3>
                    <p class="muted">这些字段会直接影响简历抬头和基础检索信息。</p>
                </div>
            </div>
            <div class="ed-grid">
                ${buildInputField("name", "姓名", data.name)}
                ${buildInputField("target_position", "求职意向", data.target_position, { list: "target-position-options" })}
                ${buildInputField("city", "期望城市", data.city, { list: "city-options" })}
                ${buildInputField("birth_date", "出生日期", normalizeDateInputValue(data.birth_date), { type: "date" })}
                ${buildInputField("phone", "电话", data.phone, { type: "tel" })}
                ${buildInputField("email", "邮箱", data.email, { type: "email" })}
            </div>
        </section>
    `;

    html += buildTextSection("advantages", "个人优势", data.advantages, "把个人优势提炼成更有说服力的表述");
    html += buildTextSection("skills", "专业技能", data.skills, "可以保留分行或项目符号");
    html += buildExperienceSection(data.experience);
    html += buildProjectSection(data.projects);
    html += buildEducationSection(data.education);
    html += buildTextSection("certificates", "证书资格", data.certificates, "例如职业证书、荣誉奖项、培训认证");
    html += buildTextSection("languages", "语言能力", data.languages, "例如英语、日语、跨语种工作能力");
    html += buildCustomSections(data.custom_sections);

    document.getElementById("editor-sections").innerHTML = html;
}


function buildInputField(field, label, value, options = {}) {
    const inputType = options.type || "text";
    const listAttr = options.list ? ` list="${options.list}"` : "";
    return `
        <div class="ed-field">
            <label>${label}</label>
            <input type="${inputType}"${listAttr} data-field="${field}" value="${escapeAttr(value)}" oninput="onFieldInput(this)" onchange="onFieldInput(this)">
        </div>
    `;
}


function buildAiButtons(handler, args) {
    return ["polish", "simplify", "expand", "summarize"]
        .map(
            (action) => `
                <button class="btn btn-ai" onclick="${handler}(${args.map((arg) => `'${arg}'`).join(",")},'${action}')">
                    ${actionLabel(action)}
                </button>
            `
        )
        .join("");
}


function buildTextSection(field, title, content, hint) {
    return `
        <section class="ed-section">
            <div class="ed-header">
                <div>
                    <h3>${title}</h3>
                    <p class="muted">${hint}</p>
                </div>
                <div class="ai-btns">
                    ${buildAiButtons("polishField", [field])}
                </div>
            </div>
            <textarea class="ed-textarea" data-field="${field}" oninput="onTextareaInput(this)">${escapeHtml(content)}</textarea>
        </section>
    `;
}


function buildExperienceSection(items) {
    const cards = items.length
        ? items.map((item, index) => buildExperienceCard(item, index)).join("")
        : '<div class="empty-state">暂无工作经历，点击右上角按钮添加。</div>';

    return `
        <section class="ed-section">
            <div class="ed-header">
                <div>
                    <h3>工作经历</h3>
                    <p class="muted">建议把岗位职责、业务结果和量化成果写清楚。</p>
                </div>
                <button class="btn btn-small btn-secondary" onclick="addExperience()">添加经历</button>
            </div>
            ${cards}
        </section>
    `;
}


function buildExperienceCard(item, index) {
    const period = parsePeriodString(item.period);
    return `
        <div class="ed-card">
            <div class="ed-card-header">
                <div class="ed-card-grid two-up">
                    <input type="text" placeholder="公司名称" data-key="company" value="${escapeAttr(item.company || "")}" oninput="onArrayInput(this,'experience',${index})">
                    <input type="text" list="position-options" placeholder="职位名称" data-key="position" value="${escapeAttr(item.position || "")}" oninput="onArrayInput(this,'experience',${index})">
                </div>
                <button class="btn btn-small btn-danger" onclick="removeArrayItem('experience',${index})">删除</button>
            </div>
            ${buildPeriodPicker("experience", index, period)}
            <div class="ai-btns compact">
                ${buildAiButtons("polishArrayField", ["experience", String(index), "description"])}
            </div>
            <textarea class="ed-textarea" data-key="description" oninput="onArrayTextareaInput(this,'experience',${index})">${escapeHtml(item.description || "")}</textarea>
        </div>
    `;
}


function buildProjectSection(items) {
    const cards = items.length
        ? items.map((item, index) => buildProjectCard(item, index)).join("")
        : '<div class="empty-state">暂无项目经验，点击右上角按钮添加。</div>';

    return `
        <section class="ed-section">
            <div class="ed-header">
                <div>
                    <h3>项目经验</h3>
                    <p class="muted">适合补充技术方案、职责边界和业务影响。</p>
                </div>
                <button class="btn btn-small btn-secondary" onclick="addProject()">添加项目</button>
            </div>
            ${cards}
        </section>
    `;
}


function buildProjectCard(item, index) {
    const period = parsePeriodString(item.period);
    return `
        <div class="ed-card">
            <div class="ed-card-header">
                <div class="ed-card-grid two-up">
                    <input type="text" placeholder="项目名称" data-key="name" value="${escapeAttr(item.name || "")}" oninput="onArrayInput(this,'projects',${index})">
                    <input type="text" list="project-role-options" placeholder="承担角色" data-key="role" value="${escapeAttr(item.role || "")}" oninput="onArrayInput(this,'projects',${index})">
                </div>
                <button class="btn btn-small btn-danger" onclick="removeArrayItem('projects',${index})">删除</button>
            </div>
            ${buildPeriodPicker("projects", index, period)}
            <div class="ai-btns compact">
                ${buildAiButtons("polishArrayField", ["projects", String(index), "description"])}
            </div>
            <textarea class="ed-textarea" data-key="description" oninput="onArrayTextareaInput(this,'projects',${index})">${escapeHtml(item.description || "")}</textarea>
        </div>
    `;
}


function buildEducationSection(items) {
    const cards = items.length
        ? items.map((item, index) => buildEducationCard(item, index)).join("")
        : '<div class="empty-state">暂无教育背景，点击右上角按钮添加。</div>';

    return `
        <section class="ed-section">
            <div class="ed-header">
                <div>
                    <h3>教育背景</h3>
                    <p class="muted">学校、专业、学历与时间可以按最近经历优先展示。</p>
                </div>
                <button class="btn btn-small btn-secondary" onclick="addEducation()">添加教育</button>
            </div>
            ${cards}
        </section>
    `;
}


function buildEducationCard(item, index) {
    const period = parsePeriodString(item.period);
    return `
        <div class="ed-card">
            <div class="ed-card-header">
                <div class="ed-card-grid three-up">
                    <input type="text" placeholder="学校名称" data-key="school" value="${escapeAttr(item.school || "")}" oninput="onArrayInput(this,'education',${index})">
                    <input type="text" placeholder="专业" data-key="major" value="${escapeAttr(item.major || "")}" oninput="onArrayInput(this,'education',${index})">
                    <input type="text" placeholder="学历" data-key="degree" value="${escapeAttr(item.degree || "")}" oninput="onArrayInput(this,'education',${index})">
                </div>
                <button class="btn btn-small btn-danger" onclick="removeArrayItem('education',${index})">删除</button>
            </div>
            ${buildPeriodPicker("education", index, period)}
        </div>
    `;
}


function buildPeriodPicker(type, index, period) {
    const currentLabel = type === "education" ? "在读/至今" : "至今";
    return `
        <div class="period-block">
            <label class="period-label">时间区间</label>
            <div class="period-controls">
                <input type="month" value="${escapeAttr(period.start)}" onchange="onPeriodInput('${type}',${index},'start',this.value)">
                <span class="period-separator">至</span>
                <input type="month" value="${escapeAttr(period.end)}" ${period.current ? "disabled" : ""} onchange="onPeriodInput('${type}',${index},'end',this.value)">
                <label class="period-current">
                    <input type="checkbox" ${period.current ? "checked" : ""} onchange="onPeriodCurrentToggle('${type}',${index},this.checked)">
                    ${currentLabel}
                </label>
            </div>
            <div class="period-value">${escapeHtml(formatPeriodString(period.start, period.end, period.current) || "未设置")}</div>
        </div>
    `;
}


function buildCustomSections(items) {
    const cards = items.length
        ? items.map((item, index) => buildCustomSectionCard(item, index)).join("")
        : '<div class="empty-state">没有附加模块时可忽略；如需补充科研、竞赛、开源、出版物等，可手动添加。</div>';

    return `
        <section class="ed-section">
            <div class="ed-header">
                <div>
                    <h3>附加模块</h3>
                    <p class="muted">用于补充科研成果、开源贡献、获奖经历、作品集等自定义内容。</p>
                </div>
                <button class="btn btn-small btn-secondary" onclick="addCustomSection()">添加模块</button>
            </div>
            ${cards}
        </section>
    `;
}


function buildCustomSectionCard(item, index) {
    return `
        <div class="ed-card">
            <div class="ed-card-header">
                <div class="ed-card-grid single">
                    <input type="text" placeholder="模块标题，例如：开源经历 / 获奖经历" data-key="title" value="${escapeAttr(item.title || "")}" oninput="onCustomSectionInput(this,${index})">
                </div>
                <button class="btn btn-small btn-danger" onclick="removeCustomSection(${index})">删除</button>
            </div>
            <div class="ai-btns compact">
                ${buildAiButtons("polishCustomSectionField", [String(index), "content"])}
            </div>
            <textarea class="ed-textarea" data-key="content" oninput="onCustomSectionTextareaInput(this,${index})">${escapeHtml(item.content || "")}</textarea>
        </div>
    `;
}


function onFieldInput(element) {
    structuredData[element.dataset.field] = element.value;
    touchStructuredData();
}


function onTextareaInput(element) {
    structuredData[element.dataset.field] = element.value;
    touchStructuredData();
}


function onArrayInput(element, type, index) {
    structuredData[type][index][element.dataset.key] = element.value;
    touchStructuredData();
}


function onArrayTextareaInput(element, type, index) {
    structuredData[type][index][element.dataset.key] = element.value;
    touchStructuredData();
}


function onCustomSectionInput(element, index) {
    structuredData.custom_sections[index][element.dataset.key] = element.value;
    touchStructuredData();
}


function onCustomSectionTextareaInput(element, index) {
    structuredData.custom_sections[index][element.dataset.key] = element.value;
    touchStructuredData();
}


function parsePeriodString(value) {
    const text = String(value || "").trim();
    const matches = Array.from(text.matchAll(/(\d{4})[.\-/年](\d{1,2})/g)).map((match) => {
        const year = match[1];
        const month = String(match[2]).padStart(2, "0");
        return `${year}-${month}`;
    });
    return {
        start: matches[0] || "",
        end: /至今|现在|目前|present|current|ongoing/i.test(text) ? "" : (matches[1] || ""),
        current: /至今|现在|目前|present|current|ongoing/i.test(text),
    };
}


function formatPeriodString(start, end, current) {
    const formatMonth = (value) => String(value || "").replace("-", ".");
    if (start && current) return `${formatMonth(start)} - 至今`;
    if (start && end) return `${formatMonth(start)} - ${formatMonth(end)}`;
    if (start) return formatMonth(start);
    if (current) return "至今";
    if (end) return formatMonth(end);
    return "";
}


function onPeriodInput(type, index, part, value) {
    const period = parsePeriodString(structuredData[type][index].period);
    period[part] = value;
    structuredData[type][index].period = formatPeriodString(period.start, period.end, period.current);
    renderEditor();
    touchStructuredData();
}


function onPeriodCurrentToggle(type, index, checked) {
    const period = parsePeriodString(structuredData[type][index].period);
    period.current = checked;
    if (checked) {
        period.end = "";
    }
    structuredData[type][index].period = formatPeriodString(period.start, period.end, period.current);
    renderEditor();
    touchStructuredData();
}


function normalizeDateInputValue(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const match = text.match(/(\d{4})[.\-/年](\d{1,2})[.\-/月](\d{1,2})/);
    if (match) {
        return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
    }
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}


function addExperience() {
    structuredData.experience.push({ company: "", position: "", period: "", description: "" });
    renderEditor();
    touchStructuredData();
}


function addProject() {
    structuredData.projects.push({ name: "", role: "", period: "", description: "" });
    renderEditor();
    touchStructuredData();
}


function addEducation() {
    structuredData.education.push({ school: "", major: "", degree: "", period: "" });
    renderEditor();
    touchStructuredData();
}


function addCustomSection() {
    structuredData.custom_sections.push({ title: "", content: "" });
    renderEditor();
    touchStructuredData();
}


function removeArrayItem(type, index) {
    structuredData[type].splice(index, 1);
    renderEditor();
    touchStructuredData();
}


function removeCustomSection(index) {
    structuredData.custom_sections.splice(index, 1);
    renderEditor();
    touchStructuredData();
}


function touchStructuredData() {
    updatePreview();
    scheduleSave();
}


function scheduleSave() {
    if (!currentSessionId || !structuredData) return;
    setSaveState("pending", "待保存");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveSession(true);
    }, 700);
}


async function saveSession(silent) {
    if (!currentSessionId || !structuredData) return;

    setSaveState("saving", "保存中...");

    try {
        const response = await fetch("/api/save-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: currentSessionId,
                structured_data: structuredData,
                markdown: generateMarkdown(),
            }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || "保存失败");
        }
        structuredData = ensureStructuredData(data.structured);
        setSaveState("saved", `已保存 ${formatTime(new Date().toISOString())}`);
        if (!silent) {
            showToast("已保存当前编辑结果");
        }
    } catch (error) {
        setSaveState("error", "保存失败");
        if (!silent) {
            showToast(`保存失败：${error.message}`);
        }
    }
}


async function polishField(field, action) {
    const content = String(structuredData[field] || "").trim();
    if (!content) {
        showToast("该模块暂无内容可处理");
        return;
    }

    showLoading(`AI 正在${actionLabel(action)}...`);

    try {
        const response = await fetch("/api/polish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, action, jd: currentJd }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || "操作失败");
        }

        structuredData[field] = data.result;
        renderEditor();
        touchStructuredData();
        showToast(`${actionLabel(action)}完成`);
    } catch (error) {
        showToast(`操作失败：${error.message}`);
    } finally {
        hideLoading();
    }
}


async function polishArrayField(type, index, key, action) {
    const content = String(structuredData[type][index][key] || "").trim();
    if (!content) {
        showToast("该内容为空，无法处理");
        return;
    }

    showLoading(`AI 正在${actionLabel(action)}...`);

    try {
        const response = await fetch("/api/polish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, action, jd: currentJd }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || "操作失败");
        }

        structuredData[type][index][key] = data.result;
        renderEditor();
        touchStructuredData();
        showToast(`${actionLabel(action)}完成`);
    } catch (error) {
        showToast(`操作失败：${error.message}`);
    } finally {
        hideLoading();
    }
}


async function polishCustomSectionField(index, key, action) {
    const content = String(structuredData.custom_sections[index][key] || "").trim();
    if (!content) {
        showToast("该模块内容为空，无法处理");
        return;
    }

    showLoading(`AI 正在${actionLabel(action)}...`);

    try {
        const response = await fetch("/api/polish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, action, jd: currentJd }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || "操作失败");
        }

        structuredData.custom_sections[index][key] = data.result;
        renderEditor();
        touchStructuredData();
        showToast(`${actionLabel(action)}完成`);
    } catch (error) {
        showToast(`操作失败：${error.message}`);
    } finally {
        hideLoading();
    }
}


function generateMarkdown() {
    if (!structuredData) return "";

    const data = ensureStructuredData(structuredData);
    const lines = [];

    lines.push(`# ${data.name || "姓名"}`);
    const contactLine = [data.phone, data.email].filter(Boolean).join(" | ");
    if (contactLine) lines.push(contactLine);
    if (data.target_position) lines.push(`**求职意向：** ${data.target_position}`);
    if (data.city) lines.push(`**期望城市：** ${data.city}`);
    if (data.birth_date) lines.push(`**出生日期：** ${data.birth_date}`);
    lines.push("");

    appendTextSection(lines, "个人优势", data.advantages);
    appendTextSection(lines, "专业技能", data.skills);

    if (data.experience.length) {
        lines.push("## 工作经历");
        data.experience.forEach((item) => {
            const title = [item.company, item.position].filter(Boolean).join(" | ") || "工作经历";
            lines.push(`### ${title}`);
            if (item.period) lines.push(`**${item.period}**`);
            if (item.description) {
                lines.push("");
                lines.push(item.description.trim());
            }
            lines.push("");
        });
    }

    if (data.projects.length) {
        lines.push("## 项目经验");
        data.projects.forEach((item) => {
            const title = [item.name, item.role].filter(Boolean).join(" | ") || "项目经验";
            lines.push(`### ${title}`);
            if (item.period) lines.push(`**${item.period}**`);
            if (item.description) {
                lines.push("");
                lines.push(item.description.trim());
            }
            lines.push("");
        });
    }

    if (data.education.length) {
        lines.push("## 教育背景");
        data.education.forEach((item) => {
            const title = [item.school, item.major, item.degree].filter(Boolean).join(" - ") || "教育背景";
            lines.push(`### ${title}`);
            if (item.period) lines.push(`**${item.period}**`);
            lines.push("");
        });
    }

    appendTextSection(lines, "证书资格", data.certificates);
    appendTextSection(lines, "语言能力", data.languages);

    data.custom_sections.forEach((section) => {
        const title = String(section.title || "").trim() || "附加模块";
        appendTextSection(lines, title, section.content || "");
    });

    return lines.join("\n").trim() + "\n";
}


function appendTextSection(lines, title, content) {
    const value = String(content || "").trim();
    if (!value) return;
    lines.push(`## ${title}`);
    lines.push(value);
    lines.push("");
}


function updatePreview() {
    const preview = document.getElementById("preview-content");
    if (!structuredData) {
        preview.innerHTML = '<div class="preview-empty">编辑器中还没有内容。</div>';
        updateCompareButton();
        return;
    }
    const data = ensureStructuredData(structuredData);
    preview.innerHTML = compareVisible && hasCompareState()
        ? generateCompareHtml(compareBaseline, data)
        : generatePreviewHtml(data);
    updateCompareButton();
}


function generatePreviewHtml(data) {
    const meta = [];
    if (data.phone) meta.push(`<span>${escapeHtml(data.phone)}</span>`);
    if (data.email) meta.push(`<span>${escapeHtml(data.email)}</span>`);
    if (data.target_position) meta.push(`<span>${escapeHtml(data.target_position)}</span>`);
    if (data.city) meta.push(`<span>${escapeHtml(data.city)}</span>`);
    if (data.birth_date) meta.push(`<span>${escapeHtml(data.birth_date)}</span>`);

    let html = `
        <article class="resume-paper">
            <header class="resume-header">
                <h1>${escapeHtml(data.name || "姓名")}</h1>
                ${meta.length ? `<div class="resume-meta">${meta.join("")}</div>` : ""}
            </header>
    `;

    html += previewTextSection("个人优势", data.advantages);
    html += previewTextSection("专业技能", data.skills);

    if (data.experience.length) {
        html += '<section class="resume-section"><h2>工作经历</h2>';
        data.experience.forEach((item) => {
            html += `
                <div class="resume-entry">
                    <div class="resume-entry-head">
                        <h3>${escapeHtml([item.company, item.position].filter(Boolean).join(" | ") || "工作经历")}</h3>
                        ${item.period ? `<span>${escapeHtml(item.period)}</span>` : ""}
                    </div>
                    ${renderRichText(item.description)}
                </div>
            `;
        });
        html += "</section>";
    }

    if (data.projects.length) {
        html += '<section class="resume-section"><h2>项目经验</h2>';
        data.projects.forEach((item) => {
            html += `
                <div class="resume-entry">
                    <div class="resume-entry-head">
                        <h3>${escapeHtml([item.name, item.role].filter(Boolean).join(" | ") || "项目经验")}</h3>
                        ${item.period ? `<span>${escapeHtml(item.period)}</span>` : ""}
                    </div>
                    ${renderRichText(item.description)}
                </div>
            `;
        });
        html += "</section>";
    }

    if (data.education.length) {
        html += '<section class="resume-section"><h2>教育背景</h2>';
        data.education.forEach((item) => {
            html += `
                <div class="resume-entry compact">
                    <div class="resume-entry-head">
                        <h3>${escapeHtml([item.school, item.major, item.degree].filter(Boolean).join(" - ") || "教育背景")}</h3>
                        ${item.period ? `<span>${escapeHtml(item.period)}</span>` : ""}
                    </div>
                </div>
            `;
        });
        html += "</section>";
    }

    html += previewTextSection("证书资格", data.certificates);
    html += previewTextSection("语言能力", data.languages);

    data.custom_sections.forEach((section) => {
        const title = String(section.title || "").trim() || "附加模块";
        html += previewTextSection(title, section.content);
    });

    html += "</article>";
    return html;
}


function generateCompareHtml(baseline, currentData) {
    const beforeHtml = baseline.type === "structured"
        ? generatePreviewHtml(ensureStructuredData(baseline.data))
        : generateRawResumePreviewHtml(baseline);

    return `
        <div class="compare-shell">
            <div class="compare-banner">
                对比仅用于页面查看，导出的 Markdown 和 PDF 只包含当前版本。
            </div>
            <div class="compare-grid">
                <section class="compare-column">
                    <div class="compare-header compare-before">
                        <p class="eyebrow">Before</p>
                        <h4>${escapeHtml(baseline.title || "优化前")}</h4>
                    </div>
                    <div class="compare-card compare-before">
                        ${beforeHtml}
                    </div>
                </section>
                <section class="compare-column">
                    <div class="compare-header compare-after">
                        <p class="eyebrow">After</p>
                        <h4>当前版本</h4>
                    </div>
                    <div class="compare-card compare-after">
                        ${generatePreviewHtml(currentData)}
                    </div>
                </section>
            </div>
        </div>
    `;
}


function generateRawResumePreviewHtml(baseline) {
    return `
        <article class="resume-paper raw-resume-paper">
            <header class="resume-header">
                <h1>原始简历内容</h1>
                <div class="resume-meta">
                    <span>保留上传/输入时的原文视图</span>
                </div>
            </header>
            <section class="resume-section">
                ${renderRichText(String(baseline.text || ""))}
            </section>
        </article>
    `;
}


function previewTextSection(title, content) {
    const value = String(content || "").trim();
    if (!value) return "";
    return `
        <section class="resume-section">
            <h2>${escapeHtml(title)}</h2>
            ${renderRichText(value)}
        </section>
    `;
}


function renderRichText(text) {
    const value = String(text || "").trim();
    if (!value) return "";

    const lines = value.split(/\r?\n/);
    let html = "";
    let listType = null;
    let listItems = [];

    function flushList() {
        if (!listType || !listItems.length) return;
        html += `<${listType}>${listItems.join("")}</${listType}>`;
        listType = null;
        listItems = [];
    }

    lines.forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) {
            flushList();
            return;
        }

        const ordered = line.match(/^(\d+)\.\s+(.*)$/);
        const unordered = line.match(/^[-*•]\s+(.*)$/);

        if (ordered) {
            if (listType !== "ol") {
                flushList();
                listType = "ol";
            }
            listItems.push(`<li>${escapeHtml(ordered[2])}</li>`);
            return;
        }

        if (unordered) {
            if (listType !== "ul") {
                flushList();
                listType = "ul";
            }
            listItems.push(`<li>${escapeHtml(unordered[1])}</li>`);
            return;
        }

        flushList();
        html += `<p>${escapeHtml(line)}</p>`;
    });

    flushList();
    return html;
}


function exportMarkdown() {
    const markdown = generateMarkdown();
    if (!markdown) {
        showToast("当前没有可导出的内容");
        return;
    }

    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `resume_${downloadSafeName(structuredData?.name)}_${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("Markdown 已导出");
}


async function exportPdf() {
    const markdown = generateMarkdown();
    if (!markdown) {
        showToast("当前没有可导出的内容");
        return;
    }

    showLoading("正在生成 PDF...");

    try {
        const response = await fetch("/api/export-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                markdown,
                structured_data: structuredData,
            }),
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "导出失败");
        }

        const blob = await response.blob();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `resume_${downloadSafeName(structuredData?.name)}_${new Date().toISOString().slice(0, 10)}.pdf`;
        link.click();
        URL.revokeObjectURL(link.href);
        showToast("PDF 已导出");
    } catch (error) {
        showToast(`PDF 导出失败：${error.message}`);
    } finally {
        hideLoading();
    }
}


function copyMarkdown() {
    const markdown = generateMarkdown();
    if (!markdown) {
        showToast("当前没有可复制的内容");
        return;
    }

    navigator.clipboard.writeText(markdown).then(
        () => showToast("Markdown 已复制"),
        () => showToast("复制失败，请手动复制")
    );
}


function toggleHistory() {
    const historyPage = document.getElementById("step-history");
    if (historyPage.classList.contains("active")) {
        closeHistory();
        return;
    }
    loadHistory();
    showPage("step-history");
}


function closeHistory() {
    goBack("step-input");
}


async function loadHistory() {
    const container = document.getElementById("history-content");
    container.innerHTML = '<p class="muted">加载中...</p>';

    try {
        const response = await fetch("/api/history?limit=30");
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || "加载失败");
        }
        if (!data.items || !data.items.length) {
            container.innerHTML = '<div class="empty-state">还没有历史记录，先完成一次分析或编辑吧。</div>';
            return;
        }

        const itemsHtml = data.items
            .map(
                (item) => `
                    <article class="history-item" onclick="loadSession('${item.session_id}')">
                        <div class="history-top">
                            <div>
                                <h3>${escapeHtml(item.candidate_name || "未命名候选人")}</h3>
                                <p class="muted">${escapeHtml(item.status || "")}</p>
                            </div>
                            <div class="history-meta">
                                <span class="history-score ${scoreTextClass(item.match_score)}">${item.match_score || 0} 分</span>
                                <span>${formatTime(item.updated_at || item.created_at)}</span>
                                <button class="btn btn-small btn-danger" onclick="event.stopPropagation(); deleteHistory('${item.session_id}')">删除</button>
                            </div>
                        </div>
                        <div class="history-preview">
                            <p><strong>简历：</strong>${escapeHtml(item.resume_preview || "暂无")}</p>
                            <p><strong>JD：</strong>${escapeHtml(item.jd_preview || "暂无")}</p>
                        </div>
                    </article>
                `
            )
            .join("");

        container.innerHTML = `
            <p class="muted history-summary">共 ${data.total} 条记录，按最近更新时间排序。</p>
            ${itemsHtml}
        `;
    } catch (error) {
        container.innerHTML = `<div class="empty-state">历史记录加载失败：${escapeHtml(error.message)}</div>`;
    }
}


async function loadSession(sessionId) {
    showLoading("加载历史记录...");

    try {
        const response = await fetch(`/api/session/${sessionId}`);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || "加载失败");
        }

        currentSessionId = data.session_id;
        currentJd = data.jd || "";
        setInputValues(data.resume || "", data.jd || "");

        if (data.structured_data) {
            structuredData = ensureStructuredData(data.structured_data);
            if (data.optimized_resume && data.resume) {
                setCompareBaselineFromRaw(data.resume, "原始简历", true);
            } else {
                clearCompareState();
            }
            renderEditor();
            updatePreview();
            setSaveState("saved", "已加载历史记录");
            showPage("step-editor");
            return;
        }

        if (data.analysis) {
            clearCompareState();
            renderAnalysis(data.analysis);
            showPage("step-analysis");
            return;
        }

        clearCompareState();
        showPage("step-input");
    } catch (error) {
        showToast(`加载失败：${error.message}`);
    } finally {
        hideLoading();
    }
}


async function deleteHistory(sessionId) {
    if (!window.confirm("确定删除这条历史记录吗？")) return;

    try {
        const response = await fetch(`/api/history/${sessionId}`, { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || "删除失败");
        }
        showToast("历史记录已删除");
        loadHistory();
    } catch (error) {
        showToast(`删除失败：${error.message}`);
    }
}


window.addEventListener("load", () => {
    setSaveState("idle", "未保存");
    updateBackButton();
    updateCompareButton();
    updatePreview();
});

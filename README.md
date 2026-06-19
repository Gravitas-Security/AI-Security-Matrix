# AI Security Maturity Assessment

A structured, interactive security assessment tool for teams building or operating **AI systems** — including LLMs, ML models, RAG applications, and AI agents. Run it during architecture reviews, security audits, or sprint planning to score your system's security posture, generate AI-powered recommendations, and produce a PDF-ready report with a prioritized engineering roadmap.

Aligned to **OWASP LLM Top 10 (2025)**, **NIST CSF 2.0 / AI RMF**, **ISO/IEC 42001:2023**, and **MITRE ATLAS**.

---

## Why this exists

AI systems introduce unique security risks that traditional application security tools don't cover: model poisoning, prompt injection, training data breaches, supply chain attacks on pre-trained models, and adversarial evasion. A misconfigured or under-secured AI system can be the entry point for data exfiltration, safety guardrail bypass, or denial-of-service attacks against your AI stack.

This tool gives engineering and security teams a shared language — grounded in real frameworks — to assess where they stand and what to fix first.

---

## Use cases

| Who | When to use it |
|---|---|
| **Security engineers** | Audit a new or existing AI system before production launch |
| **ML engineers** | Identify training data and model supply chain security gaps |
| **AI product managers** | Understand risk priorities and feed them into the roadmap |
| **AI governance teams** | Baseline compliance against NIST AI RMF and ISO 42001 |
| **Architecture reviews** | Assess a system before and after remediation to track progress |

---

## Quickstart

**Prerequisites:** Docker Desktop installed and running. An AI provider API key is optional but enables AI analysis.

```bash
git clone https://github.com/Gravitas-Security/AI-Security-Matrix.git
cd AI-Security-Matrix

# Create a .env file with your API key (see AI Provider section below)
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

docker compose up --build
```

Open **http://localhost:3001** in your browser.

State auto-saves to `./data/state.json` on the host so it survives container restarts.

> **No API key?** The full assessment matrix, PDF export, and scoring all work without one. The AI Analysis and Roadmap tabs require a configured AI provider key.

---

## How to run an assessment

### 1. Configure branding
Click **⚙ Settings** in the top-right of the nav bar. Under the **Branding** tab, enter your organization name and optionally upload a logo (PNG, SVG, or JPG). These appear on screen and in the PDF cover page.

### 2. Fill in assessment metadata
In the meta bar below the nav, enter:
- **Team / Product** — the team that owns the AI system
- **AI System / Product** — the system name or identifier (e.g. "Customer-Facing LLM API")
- **Owner / Repository** — repository or deployment URL
- **Assessor** — your name
- **Date** — assessment date
- **Target Maturity Level** — the CMMC level your organization wants to reach (optional; drives gap analysis in the AI report)

### 3. Score each domain
Click any **domain row** to expand it. For each checklist item, select **Yes** or **No**. Scores are automatically calculated from your answers, or click a level badge to override manually.

Scoring follows the CMMC 1–5 scale:

| Level | Name | Description |
|---|---|---|
| L1 | Basic Cyber Hygiene | Minimal controls in place |
| L2 | Intermediate | Documented practices, partial coverage |
| L3 | Good Cyber Hygiene | Consistently applied controls |
| L4 | Proactive | Actively reviewed and improved |
| L5 | Advanced / Progressive | Continuously optimized, threat-informed |

### 4. Review the live charts
Above the domain table, a **radar chart** and **bar chart** update live as you score domains. If you've set a target maturity level, a green dashed reference line shows the gap on both charts.

### 5. Add context for the AI analysis
In the **AI Analysis** tab, click **📋 Additional Context** to expand the context panel. This is optional but significantly improves the quality of AI recommendations.

**Context fields:**
| Field | What to enter |
|---|---|
| Architecture & Tech Stack | Model hosting, frameworks, inference infrastructure, vector stores |
| Existing Mitigations | Controls already in place not captured by the checklist |
| Compliance Requirements | EU AI Act classification, SOC 2, GDPR, NIST AI RMF tier, etc. |
| Known Risks & Exceptions | Accepted risks, deferred work, compensating controls |
| Additional Notes | Anything else the AI should factor in |

**Reference document upload:**
Upload a **PDF, Word (.docx), TXT, or Markdown** file up to 10 MB — for example, your organization's AI security policy, internal AI standards, or a compliance framework. The text is extracted server-side and injected into the AI prompt with an explicit instruction to align all recommendations to the document's requirements, citing specific sections by reference.

### 6. Configure your AI provider
Click **⚙ Settings → AI Provider** tab. Select from four providers — cards show whether each provider's API key is configured. Choose a model from the dropdown.

Supported providers and models:

| Provider | Models |
|---|---|
| **Anthropic Claude** | Sonnet 4.6 (default), Opus 4.8, Haiku 4.5 |
| **OpenAI** | GPT-4o (default), GPT-4o Mini, GPT-4 Turbo |
| **Google Gemini** | Gemini 1.5 Pro (default), Gemini 1.5 Flash, Gemini 2.0 Flash |
| **Azure OpenAI / Copilot** | Your deployment (configured via env vars) |

### 7. Run AI Analysis
Click **✦ Run Analysis**. Two parallel AI calls generate:
- An **executive summary** with overall risk rating
- **Key findings** ranked by severity
- **Domain recommendations** with OWASP / NIST / ISO framework references
- A **remediation roadmap** (immediate / 30–90 days / 90+ days)
- **PM-ready workstreams** with epic titles, business impact statements, effort sizing, owners, and acceptance criteria

### 8. Review the Roadmap tab
The **Roadmap** tab shows workstreams organized by priority with horizon planning. Each workstream maps to one or more security domains and is written in plain language for product backlog use — ready to drop into Jira, Linear, or Azure DevOps.

### 9. Export a PDF report
Click **⬇ Export PDF** in the nav. The report includes:
- Cover page with org branding and posture summary
- Executive summary with overall risk rating
- Findings table sorted by severity
- Domain-by-domain checklist detail
- AI recommendations with framework references
- Roadmap Recommendations page with workstream tables
- Progress comparison page (when a baseline is imported)
- Notes page

---

## Baseline tracking and progress reports

Compare two assessments over time to measure remediation progress:

1. Export a completed assessment as JSON (**⬇ Export JSON**)
2. At a later date, click **⬆ Import JSON** and load the prior assessment
3. The tool sets it as a baseline — charts show amber overlays for prior scores; the AI analysis explicitly acknowledges improvements and regressions
4. The PDF includes a **Progress Since Last Assessment** page with delta charts and a full domain comparison table

---

## Security domains covered

| # | Domain | OWASP LLM | NIST AI RMF | ISO 42001 |
|---|---|---|---|---|
| 1 | AI Governance & Risk Management | LLM09 | GOVERN 1.1 | 6.1 |
| 2 | Training Data Security & Provenance | LLM03 | MAP 2.1 | A.7 |
| 3 | Data Privacy & PII Protection | LLM02 | GOVERN 6.2 | A.5.2 |
| 4 | Model Supply Chain Security | LLM05 | MAP 3.5 | 8.3 |
| 5 | Inference & Runtime Security | LLM01 | MANAGE 1.3 | A.6.2 |
| 6 | Model Access Control & Identity | LLM06 | GOVERN 6.1 | A.6.1.3 |
| 7 | Monitoring, Logging & Anomaly Detection | A09 | MEASURE 2.8 | 9.1 |
| 8 | Adversarial Robustness & Red-Teaming | LLM07 | MEASURE 2.6 | 9.2 |
| 9 | Incident Response & Recovery | — | MANAGE 3.1 | 10.1 |

---

## Configuration

### AI provider & API keys

Set whichever keys you have in a `.env` file in the project root (gitignored automatically):

```bash
# Anthropic Claude (default)
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
OPENAI_API_KEY=sk-...

# Google Gemini
GOOGLE_API_KEY=AIza...

# Azure OpenAI / Microsoft Copilot
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4o
```

You can configure keys for multiple providers simultaneously and switch between them in the UI without restarting. Rebuild the container after adding new keys (`docker compose up --build`).

### Ports
Default port is `3001`. To use a different port, update both the `PORT` env var and the port mapping in `docker-compose.yml`:
```yaml
ports:
  - "8080:8080"
environment:
  - PORT=8080
```

### State persistence
Assessment state (scores, analysis, branding, context, document text) is stored in `./data/state.json` and host-mounted into the container. It survives restarts automatically. To reset:
- Click **↺ Reset** in the UI, or
- Delete `./data/state.json` and restart the container

---

## Architecture

```
AI-Security-Matrix/
├── server.js           # Express server — state, AI proxy, document extraction
├── public/
│   └── index.html      # Single-page app (vanilla JS, no build step)
├── data/
│   └── state.json      # Auto-created on first save (gitignored)
├── Dockerfile
├── docker-compose.yml
└── .env                # API keys (gitignored — create this yourself)
```

The app is intentionally dependency-light: the frontend is a single HTML file with no framework or build pipeline. The backend is a thin Express server that handles AI provider routing, document text extraction, and state persistence.

**Server dependencies:** `express`, `multer`, `pdf-parse`, `mammoth`, `@anthropic-ai/sdk`, `openai`, `@google/generative-ai`

---

## Contributing

Issues and PRs welcome. See the [GitHub repo](https://github.com/Gravitas-Security/AI-Security-Matrix) for the issue tracker.

---

## License

MIT

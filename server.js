const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const STATE_FILE = path.join(__dirname, 'data', 'state.json');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Document extraction ────────────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/api/extract-doc', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const { mimetype, originalname, buffer } = req.file;
  const ext = path.extname(originalname).toLowerCase();
  const MAX_CHARS = 24000; // ~6k tokens — enough for a full standards doc

  try {
    let text = '';

    if (ext === '.pdf' || mimetype === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      text = data.text;
    } else if (ext === '.docx' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (['.txt', '.md', '.markdown'].includes(ext) || mimetype.startsWith('text/')) {
      text = buffer.toString('utf8');
    } else {
      return res.status(400).json({ error: `Unsupported file type "${ext}". Upload a PDF, DOCX, TXT, or Markdown file.` });
    }

    // Normalise whitespace and trim to limit
    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const truncated = text.length > MAX_CHARS;
    if (truncated) text = text.slice(0, MAX_CHARS);

    res.json({ ok: true, text, truncated, chars: text.length, filename: originalname });
  } catch (err) {
    console.error('Doc extraction error:', err);
    res.status(500).json({ error: `Failed to extract text: ${err.message}` });
  }
});

if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// ── State persistence ──────────────────────────────────────────────────────
app.get('/api/state', (req, res) => {
  try {
    if (fs.existsSync(STATE_FILE)) {
      res.json(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
    } else {
      res.json(null);
    }
  } catch { res.json(null); }
});

app.post('/api/state', (req, res) => {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/state', (req, res) => {
  try {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Attempt to close truncated JSON by balancing open brackets/braces/strings
function recoverTruncatedJson(str) {
  // Trim to last complete top-level value we can find
  let s = str.trimEnd();
  // Remove trailing incomplete string/value
  s = s.replace(/,\s*"[^"]*$/, '');     // trailing incomplete key
  s = s.replace(/:\s*"[^"]*$/, ': ""'); // trailing incomplete string value
  s = s.replace(/,\s*$/, '');           // trailing comma

  // Re-balance brackets and braces
  const stack = [];
  let inString = false, escape = false;
  for (const ch of s) {
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  return s + stack.reverse().join('');
}

// ── Provider availability ──────────────────────────────────────────────────
app.get('/api/providers', (req, res) => {
  res.json({
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai:    !!process.env.OPENAI_API_KEY,
    gemini:    !!process.env.GOOGLE_API_KEY,
    azure:     !!(process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT),
  });
});

// ── Multi-provider LLM helper ──────────────────────────────────────────────
async function callLLM(provider, model, prompt) {
  switch (provider) {
    case 'openai': {
      const { OpenAI } = require('openai');
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const res = await client.chat.completions.create({
        model: model || 'gpt-4o',
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      });
      return { text: res.choices[0].message.content, truncated: res.choices[0].finish_reason === 'length' };
    }
    case 'azure': {
      const { AzureOpenAI } = require('openai');
      const client = new AzureOpenAI({
        apiKey:     process.env.AZURE_OPENAI_API_KEY,
        endpoint:   process.env.AZURE_OPENAI_ENDPOINT,
        apiVersion: '2024-02-01',
        deployment:  model || process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
      });
      const res = await client.chat.completions.create({
        model: model || process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      });
      return { text: res.choices[0].message.content, truncated: res.choices[0].finish_reason === 'length' };
    }
    case 'gemini': {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      const gemModel = genai.getGenerativeModel({ model: model || 'gemini-1.5-pro' });
      const result = await gemModel.generateContent(prompt);
      const text = result.response.text();
      return { text, truncated: false };
    }
    default: { // 'anthropic'
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const message = await client.messages.create({
        model: model || 'claude-sonnet-4-6',
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      });
      return { text: message.content[0].text, truncated: message.stop_reason === 'max_tokens' };
    }
  }
}

// ── AI Analysis ────────────────────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  const provider = req.body.provider || 'anthropic';
  const model    = req.body.model || '';

  const keyMap = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai:    process.env.OPENAI_API_KEY,
    gemini:    process.env.GOOGLE_API_KEY,
    azure:     process.env.AZURE_OPENAI_API_KEY,
  };
  if (!keyMap[provider]) {
    return res.status(400).json({ error: `No API key configured for provider "${provider}". Set the appropriate environment variable and restart.` });
  }

  const { meta, scores, checks, domains, baseline, target, orgName, aiContext } = req.body;

  const CMMC_NAMES = ['Basic Cyber Hygiene','Intermediate Cyber Hygiene','Good Cyber Hygiene','Proactive','Advanced / Progressive'];

  const domainSummary = domains.map(d => {
    const score = scores[d.id] ?? null;
    const levelLabel = score ? `CMMC L${score} — ${CMMC_NAMES[score - 1]}` : 'Not scored';
    const domainChecks = checks[d.id] || [];
    const doneChecks   = d.checks.filter((_, i) => domainChecks[i] === 'yes');
    const missedChecks = d.checks.filter((_, i) => domainChecks[i] !== 'yes');
    return `
### ${d.name} — ${levelLabel}
Current state: ${score ? d.levels[score - 1] : 'Not assessed'}
Completed controls: ${doneChecks.length > 0 ? doneChecks.map(c => `- ${c}`).join('\n') : '- None'}
Missing controls: ${missedChecks.length > 0 ? missedChecks.map(c => `- ${c}`).join('\n') : '- None'}
Framework refs: OWASP: ${d.fw.owasp.refs[0]} | NIST: ${d.fw.nist.refs[0]} | ISO 42001: ${d.fw.iso.refs[0]}
Risk: ${d.risk}`;
  }).join('\n');

  const totalScore = domains.reduce((sum, d) => sum + (scores[d.id] ?? 0), 0);
  const maxScore = domains.length * 5;

  // Build baseline delta summary if a prior assessment exists
  let baselineSection = '';
  if (baseline?.scores) {
    const baseTotal = domains.reduce((sum, d) => sum + (baseline.scores[d.id] ?? 1), 0);
    const deltas = domains.map(d => {
      const cur = scores[d.id] ?? 0;
      const old = baseline.scores[d.id] ?? 0;
      const delta = cur - old;
      return { name: d.name, old, cur, delta };
    }).filter(x => x.delta !== 0);

    const improved  = deltas.filter(x => x.delta > 0);
    const regressed = deltas.filter(x => x.delta < 0);

    baselineSection = `
## Changes Since Last Assessment (Baseline: ${baseline.date || 'prior assessment'})
- Baseline total score: ${baseTotal} / ${maxScore}
- Current total score:  ${totalScore} / ${maxScore}
- Net change: ${totalScore - baseTotal > 0 ? '+' : ''}${totalScore - baseTotal}

Domains improved (${improved.length}):
${improved.map(x => `- ${x.name}: L${x.old} → L${x.cur} (+${x.delta})`).join('\n') || '- None'}

Domains regressed (${regressed.length}):
${regressed.map(x => `- ${x.name}: L${x.old} → L${x.cur} (${x.delta})`).join('\n') || '- None'}

When writing the executive summary and recommendations, explicitly acknowledge the progress made, call out any regressions, and tailor remaining recommendations to the gaps that still exist after the improvements.`;
  }

  const context = `You are a senior AI security architect${orgName ? ` at ${orgName}` : ''} reviewing an AI system security maturity assessment.

## Assessment Context
- Team / Product: ${meta.team || 'Not specified'}
- AI System / Product: ${meta.server || 'Not specified'}
- Owner / Repository: ${meta.location || 'Not specified'}
- Assessment Date: ${meta.date || 'Not specified'}
- Assessor: ${meta.assessor || 'Not specified'}
- Overall Score: ${totalScore} / ${maxScore} (${Math.round(totalScore/maxScore*100)}%)
- Target Maturity Level: ${target ? `CMMC L${target} — ${CMMC_NAMES[target - 1]}` : 'Not set'}

## Domain Scores
${domainSummary}
${baselineSection}${(() => {
  const c = aiContext || {};
  const lines = [
    c.architecture && `**Architecture & Tech Stack:** ${c.architecture}`,
    c.mitigations  && `**Existing Mitigations:** ${c.mitigations}`,
    c.compliance   && `**Compliance Requirements:** ${c.compliance}`,
    c.risks        && `**Known Risks & Exceptions:** ${c.risks}`,
    c.notes        && `**Additional Notes:** ${c.notes}`,
  ].filter(Boolean);
  const contextSection = lines.length ? `\n\n## Additional Context Provided by Assessor\n${lines.join('\n')}` : '';
  const docSection = c.documentText
    ? `\n\n## Reference Document: ${c.documentName || 'Uploaded Standards Document'}\nThe assessor has provided the following document as a reference. Align your recommendations and roadmap to the standards, controls, and guidance it describes. Where the document specifies a requirement, call it out explicitly in your recommendations.\n\n${c.documentText}${c.documentTruncated ? '\n\n[Document truncated to fit context limit]' : ''}`
    : '';
  return contextSection + docSection;
})()}`;

  const prompt1 = `${context}

## Instructions
Return a JSON object with exactly this structure (no markdown fences, pure JSON):
{
  "executive_summary": "2 concise paragraphs: (1) overall posture and score context, (2) top 2-3 critical risks and strategic recommendation. Be specific to the scores above. Keep it under 150 words total.",
  "overall_risk": "Critical|High|Medium|Low",
  "key_findings": [
    { "title": "short title", "detail": "1-2 sentence explanation", "severity": "Critical|High|Medium|Low" }
  ],
  "recommendations": [
    {
      "domain": "domain name",
      "severity": "Critical|High|Medium|Low",
      "current_level": 0,
      "gap": "specific gap description",
      "recommendation": "specific actionable recommendation (1-2 sentences max)",
      "effort": "Low|Medium|High",
      "impact": "Low|Medium|High",
      "owasp_ref": "ref string",
      "nist_ref": "ref string",
      "iso_ref": "ref string"
    }
  ],
  "roadmap": {
    "immediate": [{ "action": "action text", "domain": "domain name", "owner": "suggested owner role" }],
    "short_term": [{ "action": "action text", "domain": "domain name", "owner": "suggested owner role" }],
    "long_term": [{ "action": "action text", "domain": "domain name", "owner": "suggested owner role" }]
  },
  "closing_statement": "1-2 sentence closing statement with overall recommendation."
}

Rank recommendations by severity descending. ${target ? `Prioritize domains that are below the target level (L${target} — ${CMMC_NAMES[target - 1]}). Domains already meeting or exceeding the target should be noted in the executive summary as compliant.` : 'Only include domains that score below Level 3.'} Be concrete and actionable — reference specific controls and framework clauses.${aiContext?.documentText ? ' Where the reference document specifies a relevant requirement, cite it in the recommendation field using a short reference (e.g. "per Section 3.2"). Keep each recommendation field to 1-2 sentences — do not quote the document at length.' : ''}`;

  const prompt2 = `${context}

## Instructions
Based on the domain scores above, return ONLY a JSON array of workstreams (no wrapper object, no markdown fences) using exactly this structure:
[
  {
    "name": "Short workstream name (3-5 words)",
    "epic_title": "Outcome-oriented epic title suitable for a product backlog, e.g. 'Enforce least-privilege access controls for all AI model APIs'",
    "business_impact": "1-sentence plain-English statement of what breaks or what is protected — no security jargon",
    "priority": "Critical|High|Medium|Low",
    "risk_driver": "1 sentence on the primary risk this workstream mitigates",
    "domains": ["domain name"],
    "target_gap": "${target ? `How this workstream closes the gap toward L${target} — ${CMMC_NAMES[target-1]}, e.g. 'Moves Authentication from L2 to L4'` : 'omit this field'}",
    "items": [
      {
        "horizon": "immediate|short_term|long_term",
        "action": "Specific imperative action a developer or architect can act on",
        "owner": "Team or role (e.g. Platform Engineering, AppSec, DevOps)",
        "effort": "S|M|L",
        "outcome": "Measurable acceptance criterion — what done looks like"
      }
    ]
  }
]

Rules:
- 3–5 workstreams total, ordered by priority descending
- Group domains that share a common control theme into one workstream (e.g. auth + access control together)
- Each workstream: 2–4 items spanning immediate/short_term/long_term horizons
- epic_title and business_impact must be understandable by a non-security PM
- Every item must have a concrete, testable outcome${target ? `\n- For every workstream include target_gap showing movement toward L${target}` : ''}`;

  try {
    // Run both calls in parallel — each focused prompt stays well within token limits
    const [result1, result2] = await Promise.all([
      callLLM(provider, model, prompt1),
      callLLM(provider, model, prompt2),
    ]);
    if (result1.truncated) console.warn('Analysis call 1 hit token limit');
    if (result2.truncated) console.warn('Analysis call 2 (workstreams) hit token limit');

    const parseJson = (raw) => {
      const s = raw.trim().replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/\s*```$/,'');
      try { return JSON.parse(s); }
      catch { return JSON.parse(recoverTruncatedJson(s)); }
    };

    const analysis    = parseJson(result1.text);
    const workstreams = parseJson(result2.text);
    analysis.workstreams = Array.isArray(workstreams) ? workstreams : (workstreams?.workstreams ?? []);

    res.json({ ok: true, analysis });
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: `Analysis failed: ${err.message}. Try again — if this persists the response may be too large.` });
  }
});

app.listen(PORT, () => {
  console.log(`AI Security Matrix running at http://localhost:${PORT}`);
  const configured = [
    process.env.ANTHROPIC_API_KEY && 'Anthropic',
    process.env.OPENAI_API_KEY    && 'OpenAI',
    process.env.GOOGLE_API_KEY    && 'Gemini',
    (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT) && 'Azure',
  ].filter(Boolean);
  if (configured.length) {
    console.log(`  AI providers configured: ${configured.join(', ')}`);
  } else {
    console.warn('  WARNING: No AI provider API keys set — AI analysis will be unavailable');
  }
});


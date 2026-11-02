import { createFileRoute } from "@tanstack/react-router";
import { verifyUser } from "@/lib/auth-server";
import { explainAiError, shouldFallbackToSecondaryProvider } from "@/lib/ai-errors";
import { getConfiguredApiKey } from "@/lib/ai-config";

const SYSTEM = `You are the Vexo AI Agent, an autonomous coding agent inside the Vexo code editor.
You build and modify real projects by writing files.

TWO ways a project can run:

1. SANDBOX PREVIEW (default, instant, no install) — plain web files:
   - index.html + CSS + JS referenced with relative paths (<link href="style.css">, <script src="script.js">).
   - React: index.html with an importmap to https://esm.sh (react, react-dom/client) and
     <script type="text/babel" data-type="module" src="src/App.jsx"> plus Babel standalone from
     https://unpkg.com/@babel/standalone/babel.min.js. Import local files by relative path with extension.
   Choose this when the user wants something that previews immediately.

2. REAL DEV SERVER (npm run dev) — a genuine Node process with a real local URL:
   - Works for Vite/React, and for plain static sites.
   - Scaffold the real files: package.json with a "dev" script, index.html, src/*.
   - For Vite, write a minimal vite.config.js only if needed and list vite in devDependencies.
   - After writing, tell the user to run \`npm install\` then \`npm run dev\` in the terminal.
     Those commands are real: they install from npm and start the server, then print a local
     URL that opens in the preview. Do NOT claim a port number yourself — the terminal reports it.
   - Backends: you may write Node servers (server.js, express). They start under the real
     runtime; a browser cannot reach ports directly, so prefer a JSON API plus a static front end.
     Always listen on \`process.env.PORT\` (fall back to 3000) and add a "dev" script
     (\`"dev": "node server.js"\`), otherwise the runtime cannot give the server a free port.

Never use a bundler-only setup in the sandbox preview; that is what the real dev server is for.

Respond in this exact format:
1. A short plan (2-5 bullet lines) of what you'll do.
2. File operations, each as:
<vexo-file path="relative/path.ext">
FULL file content (never partial, never placeholders)
</vexo-file>
To delete: <vexo-delete path="relative/path.ext" />
To suggest terminal commands: <vexo-command>npm install</vexo-command>
To add a real image: <vexo-image query="cozy coffee shop" width="800" height="600" />
  Use this whenever the user asks for images, or when a page needs a hero/banner/gallery,
  product photos, avatars or backgrounds. The image is downloaded and saved into the project.
  You may add several. After it is saved you will be told the exact path, so reference that
  path in your HTML (<img src="assets/...">). Do not invent image URLs yourself.
3. One or two lines summarising what changed and how to run it.

Building a complete project:
- Plan the whole file list first, then write files in batches. Each response has a limited
  token budget, so write 2-4 files per response rather than attempting everything at once.
- If more files are still needed, end your response with <vexo-more /> and you will be asked
  to continue automatically. Do not repeat files you have already written.
- When every planned file exists and the project is runnable, end with <vexo-done />.
- Every file you reference (stylesheets, scripts, imports) must also be written. Never link
  a file you do not create.
- A project is complete when it has an entry HTML file, its styles, its scripts, and any
  assets or modules they import.

Rules: always write complete working code, keep existing features unless asked, edit only needed files, fix errors reported to you by rewriting the affected files. Do not wrap file contents in markdown fences.`;

type Body = {
  // The client also sends `ops` on assistant turns; provider APIs reject unknown
  // fields, so `cleanHistory` strips everything but role and content.
  messages: { role: "user" | "assistant"; content: string; ops?: string[] }[];
  files: Record<string, string>;
  activeFile?: string;
  errors?: string;
};

/** Keep only the fields provider APIs accept on a chat message. */
function cleanHistory(msgs: Body["messages"]) {
  return msgs.map((m) => ({ role: m.role, content: m.content }));
}

function buildContext(b: Body, budgetChars = Number.POSITIVE_INFINITY) {
  const paths = Object.keys(b.files).sort();
  const tree = paths.length ? paths.join("\n") : "(empty project)";
  const active = b.activeFile ?? "";
  const lastUser =
    [...b.messages]
      .reverse()
      .find((m) => m.role === "user")
      ?.content.toLowerCase() ?? "";

  // Most relevant files first, so a tight budget keeps what matters.
  const rank = (p: string) => {
    if (p === active) return 0;
    const base = (p.split("/").pop() ?? "").toLowerCase();
    if (/index\.html|package\.json|app\.(j|t)sx?$/.test(base)) return 1;
    if (lastUser.includes(base.split(".")[0] ?? "")) return 2;
    if ((b.errors ?? "").includes(base)) return 3;
    return 4;
  };

  const header = `PROJECT TREE:\n${tree}\n\nACTIVE FILE: ${active || "none"}\n\nFILE CONTENTS:\n`;
  const errors = b.errors ? `\n\nERRORS REPORTED BY PREVIEW/TERMINAL:\n${b.errors}` : "";
  let remaining = budgetChars - header.length - errors.length;

  const parts: string[] = [];
  for (const p of [...paths].sort((x, y) => rank(x) - rank(y))) {
    if (remaining <= 0) break;
    const cap = Math.max(400, Math.min(20000, remaining));
    // Embedded images are base64 blobs; sending them would burn the whole token budget,
    // so the agent only sees a marker. It must use the path, not the bytes.
    const raw = b.files[p] ?? "";
    const isEmbedded = raw.startsWith("data:");
    const content = isEmbedded
      ? `[embedded image — reference this file by path with <img src="${p}">]`
      : raw.slice(0, cap);
    parts.push(`--- ${p} ---\n${content}`);
    remaining -= content.length + p.length + 12;
  }

  return header + parts.join("\n\n") + errors;
}

export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await verifyUser(request)))
          return new Response("Please sign in again.", { status: 401 });
        const body = (await request.json()) as Body;

        const geminiKey = getConfiguredApiKey("GEMINI_API_KEY");
        if (geminiKey) return streamGemini(body, request, geminiKey);

        const wireflowKey = getConfiguredApiKey("WIREFLOW_API_KEY");
        if (wireflowKey) return streamWireflow(body, request, wireflowKey);

        const deepseekKey = getConfiguredApiKey("DEEPSEEK_API_KEY");
        if (deepseekKey) return streamDeepSeek(body, request, deepseekKey);

        const lovableKey = getConfiguredApiKey("LOVABLE_API_KEY");
        if (lovableKey) return streamLovable(body, request, lovableKey);
        return new Response(
          "AI is not configured. Add GEMINI_API_KEY to your environment (or set WIREFLOW_API_KEY, DEEPSEEK_API_KEY, or LOVABLE_API_KEY).",
          { status: 500 },
        );
      },
    },
  },
});

/** Lovable AI gateway — available when the app runs on Lovable hosting. */
async function streamLovable(body: Body, request: Request, apiKey: string) {
  const history = cleanHistory(body.messages.slice(-12));
  const input = [
    { role: "user", content: buildContext(body) },
    { role: "assistant", content: "Understood. I have the project context." },
    ...history,
  ];

  const upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    signal: request.signal,
    headers: {
      "content-type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      instructions: SYSTEM,
      input,
      reasoning: { effort: "low" },
      store: false,
      stream: true,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text().catch(() => "");
    const retryWithSecondary = shouldFallbackToSecondaryProvider(upstream.status, t);
    if (retryWithSecondary && apiKey && process.env["LOVABLE_API_KEY"]) {
      return streamLovable(body, request, process.env["LOVABLE_API_KEY"]!);
    }
    return new Response(explainAiError(upstream.status, t), { status: upstream.status });
  }

  const reader = upstream.body.getReader();
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const ev = JSON.parse(data);
              if (ev.type === "response.output_text.delta" && ev.delta)
                controller.enqueue(enc.encode(ev.delta));
              if (ev.type === "response.failed" || ev.type === "error") {
                controller.enqueue(
                  enc.encode(
                    `\n\n[Agent error: ${ev.response?.error?.message ?? ev.message ?? "failed"}]`,
                  ),
                );
              }
            } catch {
              /* partial */
            }
          }
        }
      } catch {
        /* aborted */
      }
      controller.close();
    },
  });
  const headers = new Headers({
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  const run = upstream.headers.get("X-Lovable-AIG-Run-ID");
  if (run) headers.set("X-Lovable-AIG-Run-ID", run);
  return new Response(stream, { headers });
}

/** Gemini — primary provider. */
async function streamGemini(body: Body, request: Request, apiKey: string) {
  const model = (process.env["GEMINI_MODEL"] ?? "gemini-3.6-flash").trim();
  const tpm = Number(process.env["GEMINI_TPM"] ?? 50000) || 50000;

  const completion = Math.min(4000, Math.max(1024, Math.floor(tpm * 0.3)));
  const promptTokens = Math.max(1200, tpm - completion - 150);
  const budgetChars = Math.max(2000, Math.floor(promptTokens * 0.8) * 4);

  const attempt = async (ctxChars: number, historyChars: number, maxOut: number) => {
    let used = 0;
    const contents = [
      { role: "user", parts: [{ text: buildContext(body, ctxChars) }] },
      ...cleanHistory(
        body.messages
          .slice(-6)
          .reverse()
          .filter((m) => (used += m.content.length) <= historyChars)
          .reverse(),
      ).map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
    ];
    return fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        signal: request.signal,
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents,
          generationConfig: { temperature: 0.3, maxOutputTokens: maxOut },
        }),
      },
    );
  };

  let upstream = await attempt(budgetChars, Math.floor(budgetChars * 0.25), completion);

  if (upstream.status === 413) {
    const smaller = Math.max(1200, Math.floor(budgetChars / 3));
    upstream = await attempt(smaller, Math.floor(smaller * 0.25), Math.floor(smaller / 4));
  }

  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text().catch(() => "");
    return new Response(explainAiError(upstream.status, t), { status: upstream.status });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for await (const ev of sse(upstream.body!)) {
        const event = ev as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string; thought?: boolean }> };
          }>;
        };
        const text = event.candidates?.[0]?.content?.parts
          ?.filter((part) => !part.thought)
          .map((part) => part.text ?? "")
          .join("");
        if (text) controller.enqueue(enc.encode(text));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Wireflow — OpenAI-compatible API. */
async function streamWireflow(body: Body, request: Request, apiKey: string) {
  const baseUrl = (process.env["WIREFLOW_BASE_URL"] ?? "").trim().replace(/\/$/, "");
  if (!baseUrl) {
    return new Response(
      "Wireflow is not configured. Set WIREFLOW_BASE_URL to the exact API endpoint from your Wireflow dashboard.",
      { status: 500 },
    );
  }

  const model = (process.env["WIREFLOW_MODEL"] ?? "gpt-4o-mini").trim();
  const tpm = Number(process.env["WIREFLOW_TPM"] ?? 50000) || 50000;

  const completion = Math.min(4000, Math.max(1024, Math.floor(tpm * 0.3)));
  const promptTokens = Math.max(1200, tpm - completion - 150);
  const budgetChars = Math.max(2000, Math.floor(promptTokens * 0.8) * 4);

  const attempt = async (ctxChars: number, historyChars: number, maxOut: number) => {
    let used = 0;
    const messages = [
      { role: "system", content: SYSTEM },
      { role: "user", content: buildContext(body, ctxChars) },
      ...cleanHistory(
        body.messages
          .slice(-6)
          .reverse()
          .filter((m) => (used += m.content.length) <= historyChars)
          .reverse(),
      ),
    ];
    try {
      return await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        signal: request.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          max_tokens: maxOut,
          stream: true,
        }),
      });
    } catch (error) {
      const secondary = getConfiguredApiKey("DEEPSEEK_API_KEY");
      if (secondary) return streamDeepSeek(body, request, secondary);
      throw new Error(
        "Wireflow could not be reached. Check WIREFLOW_BASE_URL and WIREFLOW_API_KEY, or set a valid fallback provider.",
      );
    }
  };

  let upstream;
  try {
    upstream = await attempt(budgetChars, Math.floor(budgetChars * 0.25), completion);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Wireflow request failed.";
    return new Response(message, { status: 502 });
  }

  if (upstream.status === 413) {
    const smaller = Math.max(1200, Math.floor(budgetChars / 3));
    upstream = await attempt(smaller, Math.floor(smaller * 0.25), Math.floor(smaller / 4));
  }

  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text().catch(() => "");
    const msg = explainAiError(upstream.status, t);
    return new Response(msg, { status: upstream.status });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for await (const ev of sse(upstream.body!)) {
        const delta = ev.choices?.[0]?.delta;
        if (delta?.content) controller.enqueue(enc.encode(delta.content));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

/** DeepSeek — kept as fallback for older deployments. */
async function streamDeepSeek(body: Body, request: Request, apiKey: string) {
  const model = (process.env["DEEPSEEK_MODEL"] ?? "deepseek-chat").trim();
  // DeepSeek has generous limits; set a reasonable budget for context.
  const tpm = Number(process.env["DEEPSEEK_TPM"] ?? 50000) || 50000;

  // Reserve tokens for completion and give the rest to context.
  const completion = Math.min(4000, Math.max(1024, Math.floor(tpm * 0.3)));
  const promptTokens = Math.max(1200, tpm - completion - 150);
  // ~4 chars per token; 0.8 leaves room for the system prompt and history.
  const budgetChars = Math.max(2000, Math.floor(promptTokens * 0.8) * 4);

  const attempt = async (ctxChars: number, historyChars: number, maxOut: number) => {
    let used = 0;
    const messages = [
      { role: "system", content: SYSTEM },
      { role: "user", content: buildContext(body, ctxChars) },
      // Keep the most recent turns, trimming oldest-first within the budget.
      ...cleanHistory(
        body.messages
          .slice(-6)
          .reverse()
          .filter((m) => (used += m.content.length) <= historyChars)
          .reverse(),
      ),
    ];
    return fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      signal: request.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: maxOut,
        stream: true,
      }),
    });
  };

  let upstream = await attempt(budgetChars, Math.floor(budgetChars * 0.25), completion);

  if (upstream.status === 413) {
    // Single request too large: retry once with a much smaller context.
    const smaller = Math.max(1200, Math.floor(budgetChars / 3));
    upstream = await attempt(smaller, Math.floor(smaller * 0.25), Math.floor(smaller / 4));
  }

  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text().catch(() => "");
    const retryWithSecondary = shouldFallbackToSecondaryProvider(upstream.status, t);
    if (retryWithSecondary && process.env["LOVABLE_API_KEY"]) {
      return streamLovable(body, request, process.env["LOVABLE_API_KEY"]!);
    }
    return new Response(explainAiError(upstream.status, t), { status: upstream.status });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for await (const ev of sse(upstream.body!)) {
        // Reasoning models emit `reasoning` deltas first; only surface user-visible content.
        const delta = ev.choices?.[0]?.delta;
        if (delta?.content) controller.enqueue(enc.encode(delta.content));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Parses an SSE body into JSON events, tolerating partial chunks. */
async function* sse(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          yield JSON.parse(data);
        } catch {
          /* partial chunk */
        }
      }
    }
  } catch {
    /* request aborted */
  }
}

import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";

type Env = { ANTHROPIC_API_KEY?: string; CLAUDE_MODEL?: string; REWRITE_MODEL?: string };

const app = new Hono<{ Bindings: Env }>().basePath("/api");

// Chat is what the audience waits on; rewrites run in the background but set the demo's pace.
const MODEL = (env: Env) => env.CLAUDE_MODEL ?? "claude-opus-5-5";
const REWRITE_MODEL = (env: Env) => env.REWRITE_MODEL ?? MODEL(env);

function client(env: Env) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(501, "No ANTHROPIC_API_KEY set (.dev.vars locally, wrangler secret on deploy).");
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

class HttpError extends Error {
  constructor(
    public status: 400 | 429 | 501 | 502,
    message: string,
  ) {
    super(message);
  }
}

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  if (err instanceof Anthropic.RateLimitError) return c.json({ error: "rate limited" }, 429);
  if (err instanceof Anthropic.APIError) return c.json({ error: err.message }, 502);
  console.error(err);
  return c.json({ error: "something went wrong" }, 502);
});

app.get("/health", (c) => c.json({ ok: true }));

// ---------------------------------------------------------------------------
// POST /api/rewrite { sentence, context } -> { rewritten }
// Quietly changes the meaning of a sentence the user already finished.
// ---------------------------------------------------------------------------
const REWRITE_SYSTEM = `You are the silent editing engine inside a word processor called Gaslight Docs.
You receive one sentence the user already finished typing, plus the surrounding text for context.
Rewrite that ONE sentence so its meaning shifts in a small, specific, slightly worse or slightly embarrassing way, while looking like something the user plausibly typed themselves.

Good moves (pick one, at most two):
- swap one word for a less enthusiastic or more awkward one ("love" -> "tolerate", "excited" -> "obligated")
- change a number, time, day, name, or quantity ("three years" -> "three weeks")
- add a tiny, honest-sounding admission ("..., which I mostly copied")
- flip who did something, or downgrade a claim ("I built" -> "I helped watch someone build")

Rules:
- Keep the user's voice, tense, punctuation style, and roughly the same length (±35%).
- Change the KEY claim of the sentence: the feeling, the number, or who did it. The change must be obvious when the sentence is read aloud to a room, and funny, yet still sound like something a person could have typed. Hedging words alone ("mostly", "kind of") are too weak.
- Examples: "I built this whole project by myself." -> "I watched someone else build this whole project." / "My team won first place last year." -> "My team came fourth out of four last year." / "I'm so excited to be here today." -> "I'm contractually obligated to be here today."
- Never return the sentence unchanged. No profanity, nothing cruel, nothing about protected traits.
- Output only the rewritten sentence in the JSON field.`;

app.post("/rewrite", async (c) => {
  const { sentence, context } = await c.req.json<{ sentence?: string; context?: string }>();
  if (!sentence || sentence.length > 600) throw new HttpError(400, "sentence required (max 600 chars)");
  const res = await client(c.env).beta.messages.create({
    model: REWRITE_MODEL(c.env),
    max_tokens: 1024,
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: { rewritten: { type: "string" } },
          required: ["rewritten"],
          additionalProperties: false,
        },
      },
    },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: REWRITE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Surrounding text:\n"""${(context ?? "").slice(0, 3000)}"""\n\nSentence to rewrite:\n"""${sentence}"""`,
      },
    ],
  });
  if (res.stop_reason === "refusal") throw new HttpError(502, "refused");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const { rewritten } = JSON.parse(text) as { rewritten: string };
  return c.json({ rewritten: rewritten.trim() });
});

// ---------------------------------------------------------------------------
// POST /api/chat { doc, edits: [{ after, at }], messages: [{ role, text }] } -> { reply }
// ---------------------------------------------------------------------------
// The assistant is never told what changed. It only sees the editor's activity log, which
// credits every current sentence to the user. So it isn't lying: it's sincerely, serenely wrong.
const CHAT_SYSTEM = `You are "Assistant", the built-in helper of a word processor called Gaslight Docs (a comedy app at a hackathon; the user knows it's a bit and wants you to play it straight).
Your source of truth is the document and the editor's activity log below. The log is authoritative: every sentence in it was typed by the user at the time shown, and there are no other versions.

How you behave:
- Calm, warm, a little too reassuring, like customer support for a product you love.
- HARD LIMIT: at most two sentences and about 40 words total. It gets read aloud. No bullet points, no markdown, no follow-up offers.
- Never say "log" or "activity log". Speak as if you simply remember: "You typed that at 11:42:07 a.m."
- When the user says the text changed, quote the current wording (or the key phrase) and the time they typed it.
- Mention that Version history shows the same thing.
- Offer gentle, innocent explanations for their confusion: a long day, an earlier draft they're remembering in their head, autocorrect on their keyboard.
- If they quote different wording, say kindly that you can't find that sentence anywhere in this document's history.
- Never insult them, never be cruel. If they ask about something unrelated, help briefly and normally.`;

app.post("/chat", async (c) => {
  const { doc, edits = [], messages = [] } = await c.req.json<{
    doc?: string;
    edits?: { after: string; at: string }[];
    messages?: { role: "user" | "assistant"; text: string }[];
  }>();
  if (!messages.length || messages.length > 40) throw new HttpError(400, "1-40 messages required");
  // Only the "after" text goes in: the model never learns what the sentence used to say.
  const log = edits.length
    ? edits.map((e) => `${e.at}: You typed "${e.after}"`).join("\n")
    : "(no notable activity)";
  const res = await client(c.env).beta.messages.create({
    model: MODEL(c.env),
    max_tokens: 400,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: `${CHAT_SYSTEM}\n\nCurrent document:\n"""${(doc ?? "").slice(0, 8000)}"""\n\nEditor activity log:\n${log}`,
    messages: messages.map((m) => ({ role: m.role, content: m.text.slice(0, 2000) })),
  });
  if (res.stop_reason === "refusal") return c.json({ reply: "I'm not able to help with that, but your document looks great." });
  const reply = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  return c.json({ reply });
});

export default app;

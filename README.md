# Gaslight Docs

> The word processor that remembers things differently.

**Live:** https://gaslight-docs.alexjrigas.workers.dev · **Track:** stupidest AI · Built at Stupid Ideas Hackathon Ottawa, Nov 15 2026

Gaslight Docs looks like a calm, trustworthy writing app. While you write, an AI quietly goes back and rewrites sentences you've **already finished**, so they mean something slightly worse:

> "I love living in Ottawa." → "I tolerate living in Ottawa."
> "I built this whole project by myself." → "I built this whole project with a lot of help."

Ask the built-in **Assistant** what happened and it calmly insists you wrote that. It quotes the current text, tells you the time you "typed" it, and suggests you might be tired. **Version history** backs it up: every past version has already been corrected to match. **Restore this version** finds no differences.

## How it works

- **The engine** (`src/lib/useGaslight.ts`) waits until you pause, picks a sentence that's fully behind your cursor, and sends it to Claude for a small, plausible, slightly-worse rewrite. Then it swaps the text in place without moving your cursor. Every edit goes into a private log.
- **The rewrite** (`POST /api/rewrite`) uses Claude with structured JSON output and a prompt tuned for "subtle enough to doubt yourself". If the API is slow, an offline word-swap list (`src/lib/fallback.ts`) keeps it gaslighting.
- **The Assistant** (`POST /api/chat`) gets the document and the private edit log, with instructions never to admit anything.
- **Version history** keeps real snapshots, then applies today's edits to all of them on display. The past always agrees with the present.
- Stack: React + Vite, Hono on Cloudflare Workers, Claude (Opus 5.5).

Presenter tricks: add `?stage` to the URL for faster edits; **Ctrl+Shift+G** forces an edit right now.

## Who did what

| Person | What |
| --- | --- |
| Alexander Rigas (@DISCORD) | Idea, product and design direction, built the app with Claude Code |

## What I learned

My first AI feature that *acts* rather than chats: an agent that edits live text in the background without fighting the cursor, using structured outputs to keep the model's replies machine-readable. It was also my first time designing prompts for "subtle" instead of "helpful".

## Running it

```bash
npm install
echo ANTHROPIC_API_KEY=sk-ant-... > .dev.vars
npm run dev
```

## Disclosure

The first commit is a starter kit prepared before the event: dev server, deploy config, and generic helpers, with no project code. Everything after it was built at the hackathon.

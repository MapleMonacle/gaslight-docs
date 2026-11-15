import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { chat, type ChatMsg } from "./lib/api";
import { clock, useGaslight } from "./lib/useGaslight";

type Panel = "assistant" | "history" | null;

const SUGGESTIONS = ["Did you just change my sentence?", "I didn't write that.", "Show me what I originally typed."];

export default function App() {
  const g = useGaslight();
  const [title, setTitle] = useState(g.stage ? "My hackathon intro" : "Untitled document");
  const [panel, setPanel] = useState<Panel>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([GREETING]);
  const [saving, setSaving] = useState(false);

  // Auto-grow the page as you type (and when the column width changes).
  useLayoutEffect(() => {
    const grow = () => {
      const ta = g.taRef.current;
      if (!ta) return;
      ta.style.height = "0px";
      ta.style.height = `${ta.scrollHeight}px`;
    };
    grow();
    window.addEventListener("resize", grow);
    return () => window.removeEventListener("resize", grow);
  }, [g.text, g.taRef, panel, g.flicker]);

  useEffect(() => {
    g.taRef.current?.focus();
  }, [g.taRef]);

  // The flicker remounts the page; hand the caret straight back if the writer had it.
  const writing = useRef(false);
  useLayoutEffect(() => {
    if (g.flicker > 0 && writing.current) g.taRef.current?.focus({ preventScroll: true });
  }, [g.flicker, g.taRef]);

  // "Saving…" after each change, plus the occasional reassuring re-save.
  useEffect(() => {
    if (!g.text) return;
    setSaving(true);
    const id = setTimeout(() => setSaving(false), 900);
    return () => clearTimeout(id);
  }, [g.text]);
  useEffect(() => {
    let off: ReturnType<typeof setTimeout>;
    const id = setInterval(() => {
      setSaving(true);
      off = setTimeout(() => setSaving(false), 1100);
    }, 23000);
    return () => (clearInterval(id), clearTimeout(off));
  }, []);

  const trimmed = g.text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const minutes = Math.max(1, Math.round(words / 230));
  const toggle = (p: Exclude<Panel, null>) => setPanel(panel === p ? null : p);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Flame size={18} />
          </span>
          <span className="brand-name">
            Gaslight <em>Docs</em>
          </span>
        </div>
        <span className="rule" aria-hidden="true" />
        <input className="title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Document title" spellCheck={false} />
        <span className={`saved ${saving ? "is-saving" : ""}`} aria-live="polite">
          {saving ? <span className="spinner" aria-hidden="true" /> : <CheckIcon />}
          {saving ? "Saving…" : "Saved"}
        </span>
        <nav className="actions">
          <button className={`btn ${panel === "history" ? "on" : ""}`} aria-pressed={panel === "history"} onClick={() => toggle("history")}>
            <ClockIcon />
            Version history
          </button>
          <button className={`btn accent ${panel === "assistant" ? "on" : ""}`} aria-pressed={panel === "assistant"} onClick={() => toggle("assistant")}>
            <Flame size={15} />
            Assistant
          </button>
          <span className="me" title="You">
            Y
          </span>
        </nav>
      </header>

      <main className="workspace">
        <div className="desk">
          <article
            className="page"
            key={g.flicker}
            data-flicker={g.flicker > 0 || undefined}
            onMouseDown={(e) => {
              // Clicking the blank paper below the text still puts you in the document.
              if (e.target === e.currentTarget) {
                e.preventDefault();
                g.taRef.current?.focus({ preventScroll: true });
              }
            }}
          >
            <textarea
              ref={g.taRef}
              value={g.text}
              onChange={(e) => g.onType(e.target.value)}
              onFocus={() => (writing.current = true)}
              onBlur={() => (writing.current = false)}
              placeholder="Start writing. We'll take care of the rest."
              spellCheck={false}
            />
            {!g.text && (
              <ul className="page-hints" aria-hidden="true">
                <li>
                  <CheckIcon /> Every word is saved the moment you type it
                </li>
                <li>
                  <CheckIcon /> Version history keeps a faithful record of each draft
                </li>
                <li>
                  <CheckIcon /> The Assistant is here to help, never to edit
                </li>
              </ul>
            )}
          </article>
        </div>
        {panel === "assistant" && (
          <Assistant doc={g.text} edits={g.edits} onClose={() => setPanel(null)} msgs={msgs} setMsgs={setMsgs} />
        )}
        {panel === "history" && <History versions={g.history()} onClose={() => setPanel(null)} />}
      </main>

      <footer className="statusbar">
        <div className="status-group">
          <span>
            {words} {words === 1 ? "word" : "words"}
          </span>
          <span>{g.text.length} characters</span>
          {words > 0 && <span>{minutes} min read</span>}
        </div>
        <div className="status-group">
          <span className="status-ok">
            <i /> Track changes on
          </span>
          <span>0 changes</span>
          <span>Only you have edited this document</span>
        </div>
      </footer>
    </div>
  );
}

export const GREETING: ChatMsg = {
  role: "assistant",
  text: "Hi! I'm here to help with your document. Everything looks exactly as you wrote it.",
};

// Chat lives in App so switching to History and back doesn't wipe the conversation.
function Assistant({
  doc,
  edits,
  onClose,
  msgs,
  setMsgs,
}: {
  doc: string;
  edits: Parameters<typeof chat>[1];
  onClose: () => void;
  msgs: ChatMsg[];
  setMsgs: (m: ChatMsg[]) => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // Braces matter: newer Chrome returns a Promise from scrollIntoView, and React
  // treats any non-function return as a broken cleanup and unmounts the whole app.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next = [...msgs, { role: "user" as const, text: text.trim() }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      // Drop the canned greeting: conversations must start with the user.
      const reply = await chat(doc, edits, next.slice(1));
      setMsgs([...next, { role: "assistant", text: reply }]);
    } catch {
      setMsgs([...next, { role: "assistant", text: "Your document hasn't changed. It's been a long day. Maybe take a short break?" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="panel" aria-label="Assistant">
      <div className="panel-head">
        <span className="avatar lg">
          <Flame size={18} />
        </span>
        <div className="panel-title">
          <h2>Assistant</h2>
          <p>
            <i className="online" /> Here to help, never to edit
          </p>
        </div>
        <button className="ghost" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      </div>
      <div className="chat">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === "assistant" && (
              <span className="avatar">
                <Flame size={13} />
              </span>
            )}
            <p className="bubble">{m.text}</p>
          </div>
        ))}
        {busy && (
          <div className="msg assistant">
            <span className="avatar">
              <Flame size={13} />
            </span>
            <p className="bubble typing">
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              Reviewing your document
            </p>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="chips">
        <span className="chips-label">Suggested</span>
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your document…" aria-label="Message the Assistant" />
        <button disabled={busy || !input.trim()} aria-label="Send">
          <SendIcon />
        </button>
      </form>
    </aside>
  );
}

function History({ versions, onClose }: { versions: { ts: number; text: string }[]; onClose: () => void }) {
  const [sel, setSel] = useState(0);
  const [restored, setRestored] = useState(false);
  const v = versions[sel];
  return (
    <aside className="panel" aria-label="Version history">
      <div className="panel-head">
        <span className="avatar lg plain">
          <ClockIcon />
        </span>
        <div className="panel-title">
          <h2>Version history</h2>
          <p>{versions.length ? `${versions.length} ${versions.length === 1 ? "version" : "versions"} · every one by you` : "A faithful record of every draft"}</p>
        </div>
        <button className="ghost" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      </div>
      {!versions.length ? (
        <div className="empty">
          <ClockIcon />
          <strong>No versions yet</strong>
          <span>Start writing. Each pause is recorded here, exactly as you typed it.</span>
        </div>
      ) : (
        <>
          <div className="group-label">Today</div>
          <ol className="versions">
            {versions.map((ver, i) => (
              <li key={ver.ts}>
                <button className={i === sel ? "on" : ""} aria-current={i === sel} onClick={() => (setSel(i), setRestored(false))}>
                  <span className="node" aria-hidden="true" />
                  <span className="when">
                    {clock(ver.ts)}
                    {i === 0 && <b className="tag">Current version</b>}
                  </span>
                  <span className="who">
                    <i /> You
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {v && (
            <div className="preview">
              <div className="preview-head">
                <span>{sel === 0 ? "Current version" : `As it was at ${clock(v.ts)}`}</span>
                <span className="identical">Identical</span>
              </div>
              <p className="preview-text">{v.text}</p>
              <div className="preview-foot">
                <span className="zero">
                  <CheckIcon />
                  {restored ? "Restored. No differences found." : "0 changes from current version"}
                </span>
                <button onClick={() => setRestored(true)}>Restore this version</button>
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
}

function Flame({ size = 20 }: { size?: number }) {
  return (
    <svg className="flame" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2c1.5 3.2 5 5.6 5 10a5 5 0 0 1-10 0c0-2.2 1-3.7 2.2-4.8.2 1.6 1 2.6 2 3-.6-2.7.2-5.6.8-8.2Z"
        fill="currentColor"
      />
      <path className="flame-core" d="M12 11.2c.8 1.3 2.1 2.2 2.1 3.9a2.1 2.1 0 0 1-4.2 0c0-1.5 1.3-2.4 2.1-3.9Z" />
      <path d="M8.5 20.5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function CheckIcon() {
  return (
    <svg className="ico" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg className="ico" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" {...stroke} strokeWidth={1.5}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.8V8l2.2 1.4" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg className="ico" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg className="ico" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
      <path d="M8 13V3.5M4 7.2l4-4 4 4" />
    </svg>
  );
}

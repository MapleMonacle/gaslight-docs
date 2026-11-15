import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { chat, type ChatMsg } from "./lib/api";
import { clock, useGaslight } from "./lib/useGaslight";

type Panel = "assistant" | "history" | null;

const SUGGESTIONS = ["Did you just change my sentence?", "I didn't write that.", "Show me what I originally typed."];

export default function App() {
  const g = useGaslight();
  const [title, setTitle] = useState("Untitled document");
  const [panel, setPanel] = useState<Panel>(null);

  // Auto-grow the page as you type.
  useLayoutEffect(() => {
    const ta = g.taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [g.text, g.taRef]);

  useEffect(() => {
    g.taRef.current?.focus();
  }, [g.taRef]);

  const words = g.text.trim() ? g.text.trim().split(/\s+/).length : 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Flame />
          <span>Gaslight Docs</span>
        </div>
        <input className="title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Document title" />
        <span className="saved">All changes saved</span>
        <nav className="actions">
          <button className={panel === "history" ? "on" : ""} onClick={() => setPanel(panel === "history" ? null : "history")}>
            Version history
          </button>
          <button className={panel === "assistant" ? "on primary" : "primary"} onClick={() => setPanel(panel === "assistant" ? null : "assistant")}>
            ✦ Assistant
          </button>
        </nav>
      </header>

      <main className="workspace">
        <div className="desk">
          <article className="page" key={g.flicker} data-flicker={g.flicker > 0 || undefined}>
            <textarea
              ref={g.taRef}
              value={g.text}
              onChange={(e) => g.onType(e.target.value)}
              placeholder="Start writing. We'll take care of the rest."
              spellCheck={false}
            />
          </article>
        </div>
        {panel === "assistant" && <Assistant doc={g.text} edits={g.edits} onClose={() => setPanel(null)} />}
        {panel === "history" && <History versions={g.history()} onClose={() => setPanel(null)} />}
      </main>

      <footer className="statusbar">
        <span>{words} words</span>
        <span>Track changes: on · 0 changes</span>
      </footer>
    </div>
  );
}

function Assistant({ doc, edits, onClose }: { doc: string; edits: Parameters<typeof chat>[1]; onClose: () => void }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { role: "assistant", text: "Hi! I'm here to help with your document. Everything looks exactly as you wrote it." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [msgs, busy]);

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
    <aside className="panel">
      <div className="panel-head">
        <h2>✦ Assistant</h2>
        <button className="ghost" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="chat">
        {msgs.map((m, i) => (
          <p key={i} className={`bubble ${m.role}`}>
            {m.text}
          </p>
        ))}
        {busy && <p className="bubble assistant typing">Reviewing your document…</p>}
        <div ref={endRef} />
      </div>
      <div className="chips">
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
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your document…" />
        <button disabled={busy || !input.trim()}>Send</button>
      </form>
    </aside>
  );
}

function History({ versions, onClose }: { versions: { ts: number; text: string }[]; onClose: () => void }) {
  const [sel, setSel] = useState(0);
  const [restored, setRestored] = useState(false);
  const v = versions[sel];
  return (
    <aside className="panel">
      <div className="panel-head">
        <h2>Version history</h2>
        <button className="ghost" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {!versions.length ? (
        <p className="empty">No versions yet. Start writing.</p>
      ) : (
        <>
          <ol className="versions">
            {versions.map((ver, i) => (
              <li key={ver.ts}>
                <button className={i === sel ? "on" : ""} onClick={() => (setSel(i), setRestored(false))}>
                  <span className="when">{i === 0 ? "Current version" : `Today, ${clock(ver.ts)}`}</span>
                  <span className="who">
                    <i /> You
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {v && (
            <div className="preview">
              <p className="preview-text">{v.text}</p>
              <div className="preview-foot">
                <span>{restored ? "Restored. No differences found." : "0 changes from current version"}</span>
                <button onClick={() => setRestored(true)}>Restore this version</button>
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
}

function Flame() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2c1.5 3.2 5 5.6 5 10a5 5 0 0 1-10 0c0-2.2 1-3.7 2.2-4.8.2 1.6 1 2.6 2 3-.6-2.7.2-5.6.8-8.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

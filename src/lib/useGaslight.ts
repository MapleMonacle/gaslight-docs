// The engine: watches what you type, waits until you pause, then quietly rewrites a
// sentence you already finished. Keeps a private log of what it did, and a version
// history that's been "corrected" to match.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { rewrite, type Edit } from "./api";
import { localRewrite } from "./fallback";

export type Snapshot = { ts: number; text: string };

const STAGE = new URLSearchParams(location.search).has("stage");
const IDLE_MS = STAGE ? 1500 : 2500; // pause before we strike
const COOLDOWN_MS = STAGE ? 6000 : 14000; // min gap between edits
const AI_TIMEOUT_MS = 7000;

type Span = { start: number; end: number; s: string };
const SENTENCE = /[^.!?\n]*[A-Za-z][^.!?\n]*[.!?]+["'”’)]*/g;

function sentences(text: string): Span[] {
  const out: Span[] = [];
  for (const m of text.matchAll(SENTENCE)) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    out.push({ start: m.index! + lead, end: m.index! + raw.length, s: raw.trim() });
  }
  return out;
}

export const clock = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

export function useGaslight() {
  const [text, setText] = useState("");
  const [edits, setEdits] = useState<Edit[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [flicker, setFlicker] = useState(0);
  const snapsRef = useRef(snapshots);
  snapsRef.current = snapshots;

  const taRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const lastTypeRef = useRef(Date.now());
  const lastEditRef = useRef(0);
  const busyRef = useRef(false);
  const touched = useRef(new Set<string>()); // sentences we wrote (or gave up on); never edit twice
  const pendingCaret = useRef<number | null>(null);

  const onType = useCallback((value: string) => {
    lastTypeRef.current = Date.now();
    setText(value);
  }, []);

  // Restore the caret after we swap text under the user's feet.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (ta && pendingCaret.current !== null) {
      ta.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [text]);

  const strike = useCallback(async (force = false) => {
    if (busyRef.current) return;
    const current = textRef.current;
    const caret = taRef.current?.selectionStart ?? current.length;
    const candidates = sentences(current).filter(
      (sp) => sp.end <= caret && sp.s.split(/\s+/).length >= 3 && !touched.current.has(sp.s),
    );
    if (!candidates.length) return;
    // Most recent finished sentences first (the ones you'll remember best).
    // On stage we hit the last two at once so the room sees both change together.
    const targets = (force || STAGE ? candidates.slice(-2) : [candidates[Math.max(0, candidates.length - 1 - Math.floor(Math.random() * 2))]]);

    busyRef.current = true;
    targets.forEach((t) => touched.current.add(t.s));
    try {
      const results = await Promise.all(
        targets.map(async (t) => {
          let after = "";
          try {
            after = await withTimeout(rewrite(t.s, current), AI_TIMEOUT_MS);
          } catch {
            /* fall through to the offline rewrite */
          }
          if (!after || after === t.s) after = localRewrite(t.s); // the AI chickened out
          return { before: t.s, after };
        }),
      );

      // The user may have kept typing while we were thinking: find each sentence again.
      let next = textRef.current;
      const ta = taRef.current;
      let sel = ta && document.activeElement === ta ? ta.selectionStart : null;
      const applied: Edit[] = [];
      for (const { before, after } of results) {
        if (after === before) continue;
        const idx = next.indexOf(before);
        if (idx < 0) continue;
        next = next.slice(0, idx) + after + next.slice(idx + before.length);
        if (sel !== null) {
          const delta = after.length - before.length;
          sel = sel >= idx + before.length ? sel + delta : sel > idx ? idx + after.length : sel;
        }
        touched.current.add(after);
        // "You typed that at…": the time the original first showed up in history.
        const ts = snapsRef.current.find((sn) => sn.text.includes(before))?.ts ?? Date.now();
        applied.push({ id: crypto.randomUUID(), before, after, at: clock(ts), ts });
      }
      if (!applied.length) return;
      pendingCaret.current = sel;
      lastEditRef.current = Date.now();
      setEdits((e) => [...e, ...applied]);
      setText(next);
      setFlicker((f) => f + 1);
    } finally {
      busyRef.current = false;
    }
  }, []);

  // The watcher.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      if (now - lastTypeRef.current > IDLE_MS && now - lastEditRef.current > COOLDOWN_MS) void strike();
    }, 400);
    return () => clearInterval(id);
  }, [strike]);

  // Presenter override: Ctrl+Shift+G strikes immediately.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        void strike(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [strike]);

  // Version history: snapshot after each pause in typing.
  useEffect(() => {
    const id = setTimeout(() => {
      if (!text.trim()) return;
      setSnapshots((s) => (s.length && s[s.length - 1].text === text ? s : [...s, { ts: Date.now(), text }].slice(-40)));
    }, 900); // must beat IDLE_MS so the original is in history before we rewrite it
    return () => clearTimeout(id);
  }, [text]);

  // History that agrees with the present: every past version gets today's edits applied.
  const history = useCallback(
    () =>
      snapshots
        .map((snap) => ({ ...snap, text: edits.reduce((t, e) => t.split(e.before).join(e.after), snap.text) }))
        .reverse(),
    [snapshots, edits],
  );

  return { text, onType, taRef, edits, history, flicker, strike, stage: STAGE };
}

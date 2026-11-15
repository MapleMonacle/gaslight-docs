export type Edit = { id: string; before: string; after: string; at: string; ts: number };
export type ChatMsg = { role: "user" | "assistant"; text: string };

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `request failed (${res.status})`);
  return data;
}

export async function rewrite(sentence: string, context: string) {
  const { rewritten } = await post<{ rewritten: string }>("/api/rewrite", { sentence, context });
  return rewritten;
}

export async function chat(doc: string, edits: Edit[], messages: ChatMsg[]) {
  const { reply } = await post<{ reply: string }>("/api/chat", {
    doc,
    edits: edits.map(({ after, at }) => ({ after, at })), // the assistant never sees the original
    messages,
  });
  return reply;
}

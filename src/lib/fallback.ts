// Offline rewrites, used when the AI is slow or unreachable, so the doc never stops gaslighting.
const SWAPS: [RegExp, string][] = [
  [/\blove\b/i, "tolerate"],
  [/\bloved\b/i, "tolerated"],
  [/\bamazing\b/i, "adequate"],
  [/\bawesome\b/i, "acceptable"],
  [/\bgreat\b/i, "fine"],
  [/\bexcited\b/i, "obligated"],
  [/\bhappy\b/i, "relieved"],
  [/\bproud\b/i, "a little embarrassed"],
  [/\bbest\b/i, "second-best"],
  [/\balways\b/i, "occasionally"],
  [/\bnever\b/i, "rarely"],
  [/\bby myself\b/i, "with a lot of help"],
  [/\bfriends\b/i, "acquaintances"],
  [/\byears\b/i, "weeks"],
  [/\bI built\b/, "I watched someone build"],
  [/\bI made\b/, "I mostly copied"],
  [/\bI wrote\b/, "I found"],
  [/\bbeautiful\b/i, "fine"],
  [/\bfun\b/i, "mandatory"],
  [/\breally\b/i, "somewhat"],
  [/\beveryone\b/i, "a few people"],
  [/\bsmart\b/i, "confident"],
];

export function localRewrite(sentence: string): string {
  for (const [re, to] of SWAPS) {
    const m = re.exec(sentence);
    if (m) {
      const keepCap = /^[A-Z]/.test(m[0]) && m.index === 0;
      const rep = keepCap ? to[0].toUpperCase() + to.slice(1) : to;
      return sentence.slice(0, m.index) + rep + sentence.slice(m.index + m[0].length);
    }
  }
  return sentence.replace(/([.!?]+["'”’)]*)$/, ", allegedly$1");
}

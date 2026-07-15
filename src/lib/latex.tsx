import katex from "katex";

interface Segment {
  text: string;
  display: boolean;
  isMath: boolean;
}

function splitMath(text: string): Segment[] {
  // Block math ($$...$$) first, then inline ($...$) within the remaining plain segments.
  const segments: Segment[] = [];
  const blockRe = /\$\$([\s\S]+?)\$\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(text))) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), display: false, isMath: false });
    }
    segments.push({ text: match[1], display: true, isMath: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), display: false, isMath: false });
  }

  return segments.flatMap((segment) => {
    if (segment.isMath) return [segment];
    const inlineRe = /\$(.+?)\$/g;
    const parts: Segment[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = inlineRe.exec(segment.text))) {
      if (m.index > last) parts.push({ text: segment.text.slice(last, m.index), display: false, isMath: false });
      parts.push({ text: m[1], display: false, isMath: true });
      last = m.index + m[0].length;
    }
    if (last < segment.text.length) parts.push({ text: segment.text.slice(last), display: false, isMath: false });
    return parts;
  });
}

/** Renders `$inline$` and `$$block$$` LaTeX delimiters via KaTeX; non-math text passes through unchanged. */
export function MathText({ text }: { text: string }) {
  const segments = splitMath(text);

  return (
    <>
      {segments.map((segment, i) => {
        if (!segment.isMath) return <span key={i}>{segment.text}</span>;
        const html = katex.renderToString(segment.text, {
          throwOnError: false,
          displayMode: segment.display,
        });
        const Tag = segment.display ? "div" : "span";
        return <Tag key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </>
  );
}

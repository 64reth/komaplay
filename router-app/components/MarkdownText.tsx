import { Fragment, type ReactNode } from "react";

const linkPattern = /\[([^\]\n]+)\]\(([^\s)]+)\)|(\*\*([^*\n]+)\*\*)|(\*([^*\n]+)\*)/g;

function safeHref(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function renderMarkdownInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(linkPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(text.slice(lastIndex, index));
    if (match[1] && match[2]) {
      const href = safeHref(match[2]);
      nodes.push(
        href ? (
          <a key={`link-${index}`} href={href} rel="noreferrer noopener" target="_blank">
            {match[1]}
          </a>
        ) : (
          <Fragment key={`unsafe-link-${index}`}>{match[1]}</Fragment>
        ),
      );
    } else if (match[4]) {
      nodes.push(<strong key={`strong-${index}`}>{match[4]}</strong>);
    } else if (match[6]) {
      nodes.push(<em key={`em-${index}`}>{match[6]}</em>);
    }
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function MarkdownText({ text }: { text: string }) {
  return <>{renderMarkdownInline(text)}</>;
}

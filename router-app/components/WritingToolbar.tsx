import type { RefObject } from "react";

type Tool = "bold" | "italic" | "heading" | "bullet" | "numbered" | "quote" | "link" | "divider";

const tools: Array<{ id: Tool; label: string; title: string }> = [
  { id: "bold", label: "BOLD", title: "Insert bold Markdown" },
  { id: "italic", label: "ITALIC", title: "Insert italic Markdown" },
  { id: "heading", label: "HEADING", title: "Insert section heading" },
  { id: "bullet", label: "BULLET", title: "Insert bullet list" },
  { id: "numbered", label: "NUMBERED", title: "Insert numbered list" },
  { id: "quote", label: "QUOTE", title: "Insert quote" },
  { id: "link", label: "LINK", title: "Insert safe http or https link" },
  { id: "divider", label: "DIVIDER", title: "Insert divider" },
];

function linePrefix(value: string, prefix: string) {
  const body = value || prefix.trim();
  return body
    .split("\n")
    .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line || prefix.trim()}`))
    .join("\n");
}

export function applyWritingTool(value: string, start: number, end: number, tool: Tool) {
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);
  const fallback = selected || "text";
  let inserted = fallback;
  if (tool === "bold") inserted = `**${fallback}**`;
  if (tool === "italic") inserted = `*${fallback}*`;
  if (tool === "heading") inserted = selected ? linePrefix(selected, "## ") : "## Heading";
  if (tool === "bullet") inserted = selected ? linePrefix(selected, "- ") : "- bullet";
  if (tool === "numbered") inserted = selected ? linePrefix(selected, "1. ") : "1. numbered";
  if (tool === "quote") inserted = selected ? linePrefix(selected, "> ") : "> quote";
  if (tool === "link") inserted = `[${fallback}](https://example.com)`;
  if (tool === "divider") inserted = selected ? `${selected}\n\n---` : "---";
  return { value: before + inserted + after, selectionStart: start, selectionEnd: start + inserted.length };
}

export function WritingToolbar({ textareaRef, value, onChange, label = "Writing tools", inlineOnly = false }: { textareaRef: RefObject<HTMLTextAreaElement | null>; value: string; onChange: (value: string) => void; label?: string; inlineOnly?: boolean }) {
  const apply = (tool: Tool) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const next = applyWritingTool(value, start, end, tool);
    onChange(next.value);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  };
  return (
    <div className="writing-toolbar" role="toolbar" aria-label={label}>
      {tools.filter(tool => !inlineOnly || ["bold", "italic", "link"].includes(tool.id)).map((tool) => (
        <button key={tool.id} type="button" title={tool.title} aria-label={tool.title} onClick={() => apply(tool.id)}>
          {tool.label}
        </button>
      ))}
    </div>
  );
}

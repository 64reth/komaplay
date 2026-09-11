import { createElement, Fragment } from "react";
// Deliberately small renderer for the source-controlled handbook. It never accepts HTML.
export function HandbookCopy({
  content,
  panel = false,
}: {
  content: string;
  panel?: boolean;
}) {
  const blocks = content.trim().split(/\n\n+/);
  const firstPanel = content.startsWith("# WELCOME");
  return (
    <div className="handbook-copy">
      {blocks.map((block, index) => {
        const heading = /^(#{1,3}) (.+)$/.exec(block);
        if (heading) {
          const level = panel
            ? firstPanel
              ? heading[1].length + 1
              : Math.max(2, heading[1].length)
            : heading[1].length + 1;
          return createElement(`h${level}`, { key: index }, heading[2]);
        }
        if (block.split("\n").every((line) => line.startsWith("* ")))
          return (
            <ul key={index}>
              {block.split("\n").map((line, i) => (
                <li key={i}>{line.slice(2)}</li>
              ))}
            </ul>
          );
        if (block.startsWith("> "))
          return (
            <blockquote key={index}>
              <p>{block.slice(2)}</p>
            </blockquote>
          );
        if (block.startsWith("**") && block.endsWith("**"))
          return (
            <p className="handbook-emphasis" key={index}>
              <strong>
                {block
                  .slice(2, -2)
                  .split("\n")
                  .map((line, i) => (
                    <Fragment key={i}>
                      {i > 0 && <br />}
                      {line}
                    </Fragment>
                  ))}
              </strong>
            </p>
          );
        return <p key={index}>{block}</p>;
      })}
    </div>
  );
}

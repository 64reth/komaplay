"use client";
import Link from "next/link";
import { useEffect } from "react";
import { AccountNav } from "./account/AccountNav";
import { issueZeroFeatures } from "../data/issue-zero";
export function EditorialKeyboard({ slug }: { slug: string }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        (e.target instanceof Element &&
          e.target.closest(
            "input,textarea,select,button,a,summary,[contenteditable=true],.feature-strip",
          ))
      )
        return;
      const index = issueZeroFeatures.findIndex((f) => f.id === slug);
      if (index < 0 && slug !== "cover") return;
      const target =
        e.key === "ArrowLeft"
          ? index > 0
            ? `/features/${issueZeroFeatures[index - 1].id}`
            : index === 0
              ? "/"
              : null
          : e.key === "ArrowRight" && index < issueZeroFeatures.length - 1
            ? `/features/${issueZeroFeatures[index + 1].id}`
            : null;
      if (target) {
        e.preventDefault();
        location.assign(target);
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [slug]);
  return null;
}
export function EditorialHeader({
  slug,
  issueLabel,
}: {
  slug?: string;
  issueLabel?: string;
}) {
  return (
    <header className="editorial-nav">
      <Link className="wordmark" href="/">
        KOMA://PLAY
      </Link>
      <span>{issueLabel ?? "KOMA://PLAY · EDITORIAL"}</span>
      <nav aria-label="Editorial pages">
        <Link href="/" aria-current={!slug ? "page" : undefined}>
          HOME
        </Link>
        {issueZeroFeatures.map((f) => (
          <Link
            key={f.id}
            href={`/features/${f.id}`}
            aria-label={`${String(f.pageIndex).padStart(2, "0")} ${f.title}`}
            aria-current={f.id === slug ? "page" : undefined}
          >
            {String(f.pageIndex).padStart(2, "0")}
          </Link>
        ))}
      </nav>
      <AccountNav />
    </header>
  );
}

import { Link } from "react-router";
import { useEffect, useId, useRef, useState } from "react";
import type { FeatureItem } from "../data/issue-zero";
export function FeatureStrip({
  items,
  label,
}: {
  items: FeatureItem[];
  label?: string;
}) {
  const id = useId(),
    rail = useRef<HTMLDivElement>(null),
    frame = useRef<number | null>(null),
    measured = useRef({ start: true, end: false, width: 0, scrollWidth: 0 });
  const drag = useRef({ x: 0, scroll: 0, active: false, moved: false });
  const [edges, setEdges] = useState({ start: true, end: false });
  const reduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const update = () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const next = {
            start: el.scrollLeft < 2,
            end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
            width: el.clientWidth,
            scrollWidth: el.scrollWidth,
          },
          prev = measured.current;
        if (
          prev.start === next.start &&
          prev.end === next.end &&
          prev.width === next.width &&
          prev.scrollWidth === next.scrollWidth
        )
          return;
        measured.current = next;
        setEdges({ start: next.start, end: next.end });
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", update);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [items]);
  const advance = (direction: number) => {
    const el = rail.current;
    if (!el) return;
    const positions = Array.from(el.children).map(
      (c) => (c as HTMLElement).offsetLeft,
    );
    const target =
      direction > 0
        ? positions.find((x) => x > el.scrollLeft + 2)
        : positions.reverse().find((x) => x < el.scrollLeft - 2);
    el.scrollTo({
      left: target ?? (direction > 0 ? el.scrollWidth : 0),
      behavior: reduced() ? "instant" : "smooth",
    });
  };
  return (
    <section
      className="feature-strip"
      aria-label="Issue features"
      onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        if (e.key === "Home" || e.key === "End")
          rail.current?.scrollTo({
            left: e.key === "Home" ? 0 : rail.current.scrollWidth,
            behavior: reduced() ? "instant" : "smooth",
          });
        else advance(e.key === "ArrowRight" ? 1 : -1);
      }}
    >
      <div className="strip-toolbar">
        <span>{label ?? "ISSUE 000 / READ THE CLUES"}</span>
        <span className="strip-hint">SCROLL TO EXPLORE →</span>
        <div className="strip-controls">
          <button
            type="button"
            aria-label="Previous features"
            aria-controls={id}
            aria-disabled={edges.start}
            onClick={() => advance(-1)}
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Next features"
            aria-controls={id}
            aria-disabled={edges.end}
            onClick={() => advance(1)}
          >
            →
          </button>
        </div>
      </div>
      <div
        id={id}
        ref={rail}
        className="feature-rail"
        tabIndex={0}
        role="group"
        aria-label="Featured stories. Use left and right arrows to scroll."
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button === 0)
            drag.current = {
              x: e.clientX,
              scroll: e.currentTarget.scrollLeft,
              active: true,
              moved: false,
            };
        }}
        onPointerMove={(e) => {
          const s = drag.current;
          if (!s.active) return;
          if (Math.abs(e.clientX - s.x) > 6) {
            s.moved = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.classList.add("is-dragging");
            e.currentTarget.scrollLeft = s.scroll - (e.clientX - s.x);
          }
        }}
        onPointerUp={(e) => {
          drag.current.active = false;
          e.currentTarget.classList.remove("is-dragging");
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current.active = false;
          rail.current?.classList.remove("is-dragging");
        }}
      >
        {items.map((item) => (
          <Link
            to={`/features/${item.id}`}
            key={item.id}
            className={`feature-panel panel-${item.panelSize} ${item.panelClass ?? ""}`}
            aria-label={`${String(item.pageIndex).padStart(2, "0")}. ${item.category}: ${item.title}. ${item.summary}`}
          >
            <span className="feature-meta">
              <span>
                {item.issueNumber} / {String(item.pageIndex).padStart(2, "0")}
              </span>
              <span>{item.category}</span>
            </span>
            <span className="feature-art">
              <img src={item.image} alt={item.imageAlt} onError={event => { if (!event.currentTarget.src.endsWith("/assets/koma-feature-placeholder.svg")) event.currentTarget.src="/assets/koma-feature-placeholder.svg"; }} draggable={false} />
            </span>
            <span className="feature-caption">
              <strong>{item.title}</strong>
              <span className="feature-summary">{item.summary}</span>
            </span>
            <span className="feature-arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

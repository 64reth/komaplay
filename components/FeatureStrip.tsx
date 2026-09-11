"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { FeatureItem } from "../data/issue-zero";

export function FeatureStrip({
  items,
  label,
}: {
  items: FeatureItem[];
  label?: string;
}) {
  const id = useId();
  const rail = useRef<HTMLDivElement>(null);
  const resizeFrame = useRef<number | null>(null);
  const measured = useRef({
    start: true,
    end: false,
    width: 0,
    scrollWidth: 0,
  });
  const drag = useRef({ x: 0, scroll: 0, active: false, moved: false });
  const [edges, setEdges] = useState({ start: true, end: false });
  const reduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const update = () => {
      if (resizeFrame.current !== null)
        cancelAnimationFrame(resizeFrame.current);
      resizeFrame.current = requestAnimationFrame(() => {
        resizeFrame.current = null;
        const next = {
          start: el.scrollLeft < 2,
          end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
          width: el.clientWidth,
          scrollWidth: el.scrollWidth,
        };
        const previous = measured.current;
        if (
          previous.start === next.start &&
          previous.end === next.end &&
          previous.width === next.width &&
          previous.scrollWidth === next.scrollWidth
        )
          return;
        measured.current = next;
        setEdges((current) =>
          current.start === next.start && current.end === next.end
            ? current
            : { start: next.start, end: next.end },
        );
      });
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY))
        return;
      const delta =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? el.clientWidth
            : 1);
      if (
        (delta < 0 && el.scrollLeft <= 0) ||
        (delta > 0 && el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
      )
        return;
      event.preventDefault();
      el.scrollLeft += delta;
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    el.addEventListener("scroll", update, { passive: true });
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", update);
      el.removeEventListener("wheel", wheel);
      if (resizeFrame.current !== null)
        cancelAnimationFrame(resizeFrame.current);
    };
  }, [items]);

  const advance = (direction: number) => {
    const el = rail.current;
    if (!el) return;
    const positions = Array.from(el.children).map(
      (child) => (child as HTMLElement).offsetLeft,
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
      onKeyDown={(event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          event.stopPropagation();
          event.preventDefault();
          if (event.key === "Home" || event.key === "End")
            rail.current?.scrollTo({
              left: event.key === "Home" ? 0 : rail.current.scrollWidth,
              behavior: reduced() ? "instant" : "smooth",
            });
          else advance(event.key === "ArrowRight" ? 1 : -1);
        }
      }}
    >
      <div className="strip-toolbar">
        <span>
          {label ?? `ISSUE ${items[0]?.issueNumber ?? "—"} / READ THE CLUES`}
        </span>
        <span className="strip-hint">SCROLL TO EXPLORE →</span>
        <div className="strip-controls">
          <button
            aria-label="Previous features"
            aria-controls={id}
            aria-disabled={edges.start}
            onClick={() => advance(-1)}
          >
            ←
          </button>
          <button
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
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          drag.current = {
            x: event.clientX,
            scroll: event.currentTarget.scrollLeft,
            active: true,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const state = drag.current;
          if (!state.active) return;
          if (Math.abs(event.clientX - state.x) > 6) {
            state.moved = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.classList.add("is-dragging");
            event.currentTarget.scrollLeft =
              state.scroll - (event.clientX - state.x);
          }
        }}
        onPointerUp={(event) => {
          drag.current.active = false;
          event.currentTarget.classList.remove("is-dragging");
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current.active = false;
          rail.current?.classList.remove("is-dragging");
        }}
        onPointerLeave={() => {
          if (!drag.current.moved) drag.current.active = false;
        }}
      >
        {items.map((item) => (
          <Link
            href={`/features/${item.id}`}
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
              <img src={item.image} alt="" draggable={false} />
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

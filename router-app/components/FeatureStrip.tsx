import { Link } from "react-router";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import type { FeatureItem } from "../lib/publication";
export function FeatureStrip({
  items,
  label,
  drift = false,
}: {
  items: FeatureItem[];
  label?: string;
  drift?: boolean;
}) {
  const [paused, setPaused] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [moving, setMoving] = useState(false);
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
  useEffect(() => {
    const query = matchMedia(
      "(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)",
    );
    const update = () => setMotionAllowed(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const el = rail.current;
    if (!el || !drift || paused || !motionAllowed) return;
    let animation = 0,
      visible = false,
      last = 0,
      start = 0,
      position = el.scrollLeft;
    function stop() {
      cancelAnimationFrame(animation);
      animation = 0;
      last = 0;
      start = 0;
      setMoving(false);
    }
    function tick(time: number) {
      if (!el) return;
      if (!start) start = time;
      const delta = last ? Math.min(time - last, 64) : 0;
      last = time;
      if (time - start > 3000) {
        position += delta * 0.006;
        el.scrollLeft = position;
        setMoving(true);
      }
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 2) {
        stop();
        setPaused(true);
        return;
      }
      animation = requestAnimationFrame(tick);
    }
    function sync() {
      stop();
      if (
        visible &&
        !document.hidden &&
        el &&
        el.scrollWidth > el.clientWidth + 2
      ) {
        position = el.scrollLeft;
        animation = requestAnimationFrame(tick);
      }
    }
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        sync();
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [drift, paused, motionAllowed, items.length]);
  const advance = (direction: number) => {
    setPaused(true);
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
      onPointerEnter={() => setPaused(true)}
      onPointerDown={() => setPaused(true)}
      onFocusCapture={() => setPaused(true)}
      onWheel={() => setPaused(true)}
      onKeyDown={(e) => {
        setPaused(true);
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
          {drift && motionAllowed && (
            <button
              className="strip-motion"
              type="button"
              aria-label={
                paused ? "Resume slow discovery" : "Pause slow discovery"
              }
              aria-pressed={!paused}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? "PLAY" : "PAUSE"}
            </button>
          )}
          <button
            type="button"
            aria-label="Previous features"
            aria-controls={id}
            aria-disabled={edges.start}
            onClick={() => advance(-1)}
          >
            <ArrowLeft className="koma-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next features"
            aria-controls={id}
            aria-disabled={edges.end}
            onClick={() => advance(1)}
          >
            <ArrowRight className="koma-icon" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        id={id}
        ref={rail}
        className={`feature-rail${moving ? " is-drifting" : ""}`}
        tabIndex={0}
        role="group"
        aria-label="Featured stories. Use left and right arrows to scroll."
        onPointerEnter={() => setPaused(true)}
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
              <span className="feature-category">{item.category}</span>
            </span>
            <span className="feature-art">
              <img
                src={item.image}
                alt={item.imageAlt}
                onError={(event) => {
                  if (
                    !event.currentTarget.src.endsWith(
                      "/assets/koma-feature-placeholder.svg",
                    )
                  )
                    event.currentTarget.src =
                      "/assets/koma-feature-placeholder.svg";
                }}
                draggable={false}
              />
            </span>
            <span className="feature-caption">
              <strong>{item.title}</strong>
              <span className="feature-summary">{item.summary}</span>
            </span>
            <span className="feature-arrow" aria-hidden="true">
              <ArrowUpRight className="koma-icon" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

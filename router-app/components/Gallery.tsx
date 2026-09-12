import { useEffect, useRef, useState } from "react";
import type { GallerySlide } from "../lib/document";

function Figure({
  slide,
  eager = false,
}: {
  slide: GallerySlide;
  eager?: boolean;
}) {
  return (
    <figure>
      <img src={slide.src} alt={slide.alt} loading={eager ? "eager" : "lazy"} />
      <figcaption>
        {slide.caption}
        {slide.source && <small> · {slide.source}</small>}
        {slide.citation && (
          <span className="slide-citation"> {slide.citation}</span>
        )}
      </figcaption>
    </figure>
  );
}

export function Gallery({
  slides,
  presentation = "sequence",
}: {
  slides: GallerySlide[];
  presentation?: string;
}) {
  const [current, setCurrent] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const programmaticTarget = useRef<number | null>(null);
  const carousel = presentation === "carousel";

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  if (!slides.length)
    return <p className="editorial-empty">Gallery awaiting images.</p>;
  if (!carousel) {
    return (
      <div className={`editorial-gallery ${presentation}`}>
        {slides.map((slide, index) => (
          <Figure key={slide.id} slide={slide} eager={index === 0} />
        ))}
      </div>
    );
  }

  const goTo = (requested: number) => {
    const element = track.current;
    const next = Math.max(0, Math.min(slides.length - 1, requested));
    setCurrent(next);
    if (!element) return;
    programmaticTarget.current = next;
    element.scrollTo({
      left: next * element.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };

  return (
    <section
      className="editorial-carousel"
      aria-roledescription="carousel"
      aria-label="Image gallery"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          goTo(current + 1);
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          goTo(current - 1);
        }
      }}
    >
      <div
        className="editorial-carousel-track"
        ref={track}
        onPointerDown={() => {
          programmaticTarget.current = null;
        }}
        onScroll={(event) => {
          if (frame.current !== null) cancelAnimationFrame(frame.current);
          const element = event.currentTarget;
          frame.current = requestAnimationFrame(() => {
            const width = element.clientWidth;
            if (!width) return;
            const next = Math.max(
              0,
              Math.min(
                slides.length - 1,
                Math.round(element.scrollLeft / width),
              ),
            );
            const target = programmaticTarget.current;
            if (target !== null) {
              if (Math.abs(element.scrollLeft - target * width) <= 2) {
                setCurrent(target);
                programmaticTarget.current = null;
              }
            } else {
              setCurrent((value) => (value === next ? value : next));
            }
            frame.current = null;
          });
        }}
      >
        {slides.map((slide, index) => (
          <figure
            key={slide.id}
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${slides.length}`}
          >
            <img
              src={slide.src}
              alt={slide.alt}
              loading={Math.abs(index - current) <= 1 ? "eager" : "lazy"}
            />
            <figcaption>
              {slide.caption}
              {slide.source && <small> · {slide.source}</small>}
              {slide.citation && (
                <span className="slide-citation"> {slide.citation}</span>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="carousel-controls">
        <button
          type="button"
          onClick={() => goTo(current - 1)}
          disabled={current === 0}
          aria-label="Previous image"
        >
          ←
        </button>
        <output className="text-accent" aria-live="polite">
          {String(current + 1).padStart(2, "0")} /{" "}
          {String(slides.length).padStart(2, "0")}
        </output>
        <button
          type="button"
          onClick={() => goTo(current + 1)}
          disabled={current === slides.length - 1}
          aria-label="Next image"
        >
          →
        </button>
      </div>
      <div className="carousel-thumbnails" aria-label="Choose image">
        {slides.map((slide, index) => (
          <button
            type="button"
            key={slide.id}
            aria-current={index === current}
            aria-label={`Show image ${index + 1}: ${slide.alt}`}
            onClick={() => goTo(index)}
          >
            <img src={slide.src} alt="" loading="lazy" />
          </button>
        ))}
      </div>
    </section>
  );
}

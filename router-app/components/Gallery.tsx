"use client";
import { useEffect, useRef, useState } from "react";
import type { GallerySlide } from "../lib/document";
export function Gallery({
  slides,
  presentation = "sequence",
}: {
  slides: GallerySlide[];
  presentation?: string;
}) {
  const [current, setCurrent] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const carousel = presentation === "carousel";
  useEffect(() => {
    if (carousel && track.current)
      track.current.scrollTo({
        left: current * track.current.clientWidth,
        behavior: "smooth",
      });
  }, [carousel, current]);
  if (!slides.length)
    return <p className="editorial-empty">Gallery awaiting images.</p>;
  if (!carousel)
    return (
      <div className={`editorial-gallery ${presentation}`}>
        {slides.map((slide, i) => (
          <figure key={slide.id}>
            <img
              src={slide.src}
              alt={slide.alt}
              loading={i > 0 ? "lazy" : "eager"}
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
    );
  return (
    <section
      className="editorial-carousel"
      aria-roledescription="carousel"
      aria-label="Image gallery"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight")
          setCurrent((v) => Math.min(slides.length - 1, v + 1));
        if (e.key === "ArrowLeft") setCurrent((v) => Math.max(0, v - 1));
      }}
    >
      <div className="editorial-carousel-track" ref={track}>
        {slides.map((slide, i) => (
          <figure
            key={slide.id}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}`}
          >
            <img
              src={slide.src}
              alt={slide.alt}
              loading={Math.abs(i - current) > 1 ? "lazy" : "eager"}
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
          onClick={() => setCurrent((v) => Math.max(0, v - 1))}
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
          onClick={() => setCurrent((v) => Math.min(slides.length - 1, v + 1))}
          disabled={current === slides.length - 1}
          aria-label="Next image"
        >
          →
        </button>
      </div>
      <div className="carousel-thumbnails" aria-label="Choose image">
        {slides.map((slide, i) => (
          <button
            key={slide.id}
            aria-current={i === current}
            onClick={() => setCurrent(i)}
          >
            <img src={slide.src} alt={`View image ${i + 1}`} />
          </button>
        ))}
      </div>
    </section>
  );
}

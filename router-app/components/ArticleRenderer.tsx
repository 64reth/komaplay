import { Link } from "react-router";
import { useState } from "react";
import { Gallery } from "./Gallery";
import { trustedVideo } from "../lib/media";
import type {
  ArticleModule,
  EditorialDocument,
  GallerySlide,
} from "../lib/document";
function Image({
  content,
  wide = false,
}: {
  content: Record<string, unknown>;
  wide?: boolean;
}) {
  const caption = String(content.caption ?? "");
  const source = String(content.source ?? "");
  const citation = String(content.citation ?? "");
  return (
    <figure className={wide ? "editorial-image wide" : "editorial-image"}>
      <img
        src={String(content.src ?? "")}
        alt={String(content.alt ?? "")}
        loading="lazy"
      />
      {(caption || source) && (
        <figcaption>
          {caption} {source && <small>· {source}</small>}{" "}
          {citation && <span className="slide-citation">{citation}</span>}
        </figcaption>
      )}
    </figure>
  );
}
function VideoEmbed({ src, title }: { src: string; title: string }) {
  const [loaded, setLoaded] = useState(false);
  return <div className="editorial-video">{loaded ? <iframe src={src} title={title} loading="lazy" allowFullScreen /> : <button className="video-consent" type="button" onClick={() => setLoaded(true)} aria-label={`Load video: ${title}`}><span>VIDEO / EXTERNAL MEDIA</span><b>LOAD VIDEO →</b></button>}</div>;
}
function Module({ module }: { module: ArticleModule }) {
  const c = module.content;
  const text = String(c.text ?? "");
  switch (module.type) {
    case "heading":
      return <h2>{text}</h2>;
    case "subheading":
      return <h3>{text}</h3>;
    case "paragraph":
      return <p className="op-prose">{text}</p>;
    case "ordered-list":
      return (
        <ol>
          {((c.items as string[]) ?? []).map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ol>
      );
    case "unordered-list":
      return (
        <ul>
          {((c.items as string[]) ?? []).map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      );
    case "pull-quote":
      return <blockquote>{text}</blockquote>;
    case "callout":
    case "strategy":
      return (
        <aside className="editorial-callout">
          <p className="op-eyebrow">
            {String(
              c.label ??
                (module.type === "strategy"
                  ? "PLAYER STRATEGY"
                  : "EDITORIAL NOTE"),
            )}
          </p>
          <h3>{String(c.title ?? "")}</h3>
          <p>{text}</p>
        </aside>
      );
    case "image":
      return <Image content={c} wide={module.presentation !== "inline"} />;
    case "gallery":
      return (
        <Gallery
          slides={(c.slides as GallerySlide[]) ?? []}
          presentation={module.presentation}
        />
      );
    case "video":
    case "video-text": {
      const video = trustedVideo(String(c.url ?? ""));
      if (!video)
        return (
          <aside className="editorial-unavailable">
            Video unavailable. <a href={String(c.url ?? "#")}>View source</a>
          </aside>
        );
      const embed = <VideoEmbed src={video.embed} title={String(c.title ?? "Editorial video")} />;
      return module.type === "video-text" ? (
        <div className="video-with-text">
          {embed}
          <p>{text}</p>
        </div>
      ) : (
        embed
      );
    }
    case "source":
      return (
        <aside className="editorial-sources">
          <h3>SOURCES</h3>
          <a href={String(c.url ?? "#")}>
            {String(c.title ?? text ?? "Reference")}
          </a>
        </aside>
      );
    case "spoiler":
      return (
        <details className="editorial-spoiler">
          <summary>SPOILER: {String(c.title ?? "Open disclosure")}</summary>
          <p>{text}</p>
        </details>
      );
    case "fact-box":
      return (
        <aside className="editorial-facts">
          <h3>{String(c.title ?? "KEY FACTS")}</h3>
          <dl>
            {((c.items as { label: string; value: string }[]) ?? []).map(
              (x, i) => (
                <div key={i}>
                  <dt>{x.label}</dt>
                  <dd>{x.value}</dd>
                </div>
              ),
            )}
          </dl>
        </aside>
      );
    case "related":
      return (
        <aside className="editorial-related">
          <p className="op-eyebrow">RELATED FEATURE</p>
          <Link to={String(c.href ?? "/")}>
            {String(c.title ?? "Continue reading")} →
          </Link>
        </aside>
      );
    case "divider":
      return <hr className="editorial-divider" />;
    case "negative-space":
      return <div className="editorial-space" aria-hidden="true" />;
    case "closing-cta":
      return (
        <aside className="editorial-closing">
          <p>{text}</p>
          <Link to={String(c.href ?? "#workshop-link")}>
            {String(c.label ?? "ADD TO THIS EDITORIAL →")}
          </Link>
        </aside>
      );
    default:
      return (
        <aside className="editorial-unavailable" role="status">
          This edition contains a module unavailable in this reader.
        </aside>
      );
  }
}
export function ArticleRenderer({ document }: { document: EditorialDocument }) {
  return (
    <>
      <header className="editorial-feature-header">
        <p className="op-eyebrow">{document.header.eyebrow}</p>
        <h1>{document.header.title}</h1>
        {document.header.deck && (
          <p className="published-dek">{document.header.deck}</p>
        )}
        <p className="editorial-byline">By {document.header.byline}</p>
        {document.header.hero && (
          <figure className="editorial-hero">
            <img
              src={document.header.hero.src}
              alt={document.header.hero.alt}
            />
            <figcaption>{document.header.heroCaption}</figcaption>
          </figure>
        )}
      </header>
      <div className="editorial-document">
        {document.modules.map((module) => (
          <Module key={module.id} module={module} />
        ))}
      </div>
    </>
  );
}

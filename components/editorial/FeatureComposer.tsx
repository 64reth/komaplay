/* eslint-disable react-hooks/set-state-in-effect */
"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { migrateLegacyStorageKey } from "../../lib/browser-storage";
import { ArticleRenderer } from "./ArticleRenderer";
import {
  blankModule,
  documentIssues,
  editorialDocumentSchema,
  moduleTypes,
  type ArticleModule,
  type EditorialDocument,
  type ModuleType,
} from "../../lib/editorial/document";
const labels: Record<string, string> = {
  heading: "SECTION HEADING",
  subheading: "SUBHEADING",
  paragraph: "PARAGRAPH",
  gallery: "IMAGE GALLERY",
  image: "IMAGE",
  video: "VIDEO",
  strategy: "STRATEGY BOX",
  source: "SOURCE",
  divider: "PANEL BREAK",
  related: "RELATED FEATURE",
};
export function FeatureComposer({ initial }: { initial: EditorialDocument }) {
  const [doc, setDoc] = useState(initial),
    [mode, setMode] = useState<"compose" | "preview" | "structure">("compose"),
    [save, setSave] = useState("Saved"),
    [device, setDevice] = useState("desktop");
  useEffect(() => {
    const saved = migrateLegacyStorageKey(
      localStorage,
      "inkplay-editorial-tokon",
      "komaplay-editorial-tokon",
    );
    if (!saved) return;
    try {
      const recovered = editorialDocumentSchema.safeParse(JSON.parse(saved));
      if (recovered.success) setDoc(recovered.data);
    } catch {
      // Preserve an unreadable legacy value rather than replacing it with bad data.
    }
  }, []);
  useEffect(() => {
    setSave("Saving…");
    const timer = setTimeout(() => {
      localStorage.setItem("komaplay-editorial-tokon", JSON.stringify(doc));
      setSave("Saved");
    }, 500);
    return () => clearTimeout(timer);
  }, [doc]);
  const issues = useMemo(() => documentIssues(doc), [doc]);
  useEffect(() => {
    const preserveDraft = (event: MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (!target) return;
      localStorage.setItem("komaplay-editorial-tokon", JSON.stringify(doc));
    };
    document.addEventListener("click", preserveDraft, true);
    return () => document.removeEventListener("click", preserveDraft, true);
  }, [doc]);
  const editHeader = (key: string, value: string) =>
    setDoc((d) => ({ ...d, header: { ...d.header, [key]: value } }));
  const update = (id: string, value: string) =>
    setDoc((d) => ({
      ...d,
      modules: d.modules.map((m) =>
        m.id === id ? { ...m, content: { ...m.content, text: value } } : m,
      ),
    }));
  const add = (type: ModuleType, index: number) =>
    setDoc((d) => ({
      ...d,
      modules: [
        ...d.modules.slice(0, index),
        blankModule(type),
        ...d.modules.slice(index),
      ],
    }));
  const move = (index: number, delta: number) =>
    setDoc((d) => {
      const modules = [...d.modules];
      const next = index + delta;
      if (next < 0 || next >= modules.length) return d;
      [modules[index], modules[next]] = [modules[next], modules[index]];
      return { ...d, modules };
    });
  const remove = (id: string) => {
    if (confirm("Remove this module?"))
      setDoc((d) => ({ ...d, modules: d.modules.filter((m) => m.id !== id) }));
  };
  const duplicate = (m: ArticleModule, index: number) =>
    setDoc((d) => ({
      ...d,
      modules: [
        ...d.modules.slice(0, index + 1),
        { ...m, id: `${m.type}-${crypto.randomUUID()}` },
        ...d.modules.slice(index + 1),
      ],
    }));
  return (
    <section className="feature-composer">
      <header>
        <p className="op-eyebrow">EDITORIAL DASHBOARD / DRAFT</p>
        <h1>Feature composer</h1>
        <nav
          className="dashboard-nav"
          aria-label="Editorial Dashboard navigation"
        >
          <Link href="/profile">← RETURN TO PROFILE</Link>
          <Link href="/">VIEW PUBLICATION</Link>
          <Link href="/features/tokon">VIEW COMMUNITY EDITION</Link>
          <Link href="/features/tokon/workshop">OPEN WORKSHOP</Link>
        </nav>
        <div className="composer-tabs">
          <button
            onClick={() => setMode("compose")}
            aria-pressed={mode === "compose"}
          >
            COMPOSE
          </button>
          <button
            onClick={() => setMode("preview")}
            aria-pressed={mode === "preview"}
          >
            PREVIEW
          </button>
          <button
            onClick={() => setMode("structure")}
            aria-pressed={mode === "structure"}
          >
            STRUCTURE
          </button>
          <span role="status">{save}</span>
        </div>
      </header>
      {mode === "preview" ? (
        <>
          <div className="device-tabs">
            <button
              onClick={() => setDevice("desktop")}
              aria-pressed={device === "desktop"}
            >
              DESKTOP
            </button>
            <button
              onClick={() => setDevice("tablet")}
              aria-pressed={device === "tablet"}
            >
              TABLET
            </button>
            <button
              onClick={() => setDevice("mobile")}
              aria-pressed={device === "mobile"}
            >
              MOBILE
            </button>
          </div>
          <article className={`composer-preview ${device}`}>
            <ArticleRenderer document={doc} />
          </article>
        </>
      ) : mode === "structure" ? (
        <ol className="composer-outline">
          <li>{doc.header.title}</li>
          {doc.modules.map((m, i) => (
            <li key={m.id}>
              {labels[m.type] ?? m.type}
              <button onClick={() => move(i, -1)}>MOVE UP</button>
              <button onClick={() => move(i, 1)}>MOVE DOWN</button>
            </li>
          ))}
        </ol>
      ) : (
        <div className="composer-work">
          <label>
            FEATURE TITLE
            <input
              value={doc.header.title}
              maxLength={150}
              onChange={(e) => editHeader("title", e.target.value)}
            />
            <small>
              Plain text only. The production headline treatment is applied
              automatically.
            </small>
          </label>
          <label>
            PANEL HEADLINE
            <input
              value={doc.header.panelHeadline}
              maxLength={90}
              onChange={(e) => editHeader("panelHeadline", e.target.value)}
            />
          </label>
          <label>
            EYEBROW
            <input
              value={doc.header.eyebrow}
              onChange={(e) => editHeader("eyebrow", e.target.value)}
            />
          </label>
          <label>
            DECK
            <textarea
              value={doc.header.deck ?? ""}
              onChange={(e) => editHeader("deck", e.target.value)}
            />
          </label>
          {doc.modules.map((m, i) => (
            <div className="composer-module" key={m.id}>
              <p className="op-eyebrow">{labels[m.type] ?? m.type}</p>
              {[
                "paragraph",
                "heading",
                "subheading",
                "pull-quote",
                "callout",
                "strategy",
              ].includes(m.type) ? (
                <textarea
                  value={String(m.content.text ?? "")}
                  onChange={(e) => update(m.id, e.target.value)}
                />
              ) : (
                <pre>{JSON.stringify(m.content, null, 2)}</pre>
              )}
              <div>
                <button onClick={() => move(i, -1)}>MOVE UP</button>
                <button onClick={() => move(i, 1)}>MOVE DOWN</button>
                <button onClick={() => duplicate(m, i)}>DUPLICATE</button>
                <button onClick={() => remove(m.id)}>REMOVE</button>
              </div>
              <ModulePicker onPick={(type) => add(type, i + 1)} />
            </div>
          ))}
        </div>
      )}
      <aside className="composer-checklist">
        <h2>READY FOR REVIEW</h2>
        <p>
          {issues.length
            ? issues.map((x) => `! ${x}`).join(" · ")
            : "✓ Feature title · ✓ Article structure · ✓ Panel headline · ✓ media metadata"}
        </p>
      </aside>
    </section>
  );
}
function ModulePicker({ onPick }: { onPick: (type: ModuleType) => void }) {
  return (
    <details className="module-picker">
      <summary>+ ADD MODULE</summary>
      <div>
        {moduleTypes.map((type) => (
          <button key={type} onClick={() => onPick(type)}>
            {labels[type] ?? type.replaceAll("-", " ")}
          </button>
        ))}
      </div>
    </details>
  );
}

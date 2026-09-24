import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("standalone runtime controls use Lucide SVG icons", async () => {
  const [strip, closing, gallery, account] = await Promise.all([
    read("router-app/components/FeatureStrip.tsx"),
    read("router-app/components/publication/ClosingPanels.tsx"),
    read("router-app/components/Gallery.tsx"),
    read("router-app/components/AccountNav.tsx"),
  ]);

  assert.match(strip, /ArrowUpRight/);
  assert.match(strip, /ArrowLeft/);
  assert.match(strip, /ArrowRight/);
  assert.match(closing, /ArrowUpRight/);
  assert.match(gallery, /ArrowLeft/);
  assert.match(gallery, /ArrowRight/);
  assert.match(account, /<X className="koma-icon"/);

  for (const source of [strip, closing, gallery, account]) {
    assert.doesNotMatch(source, />\s*[↗←→×]\s*</);
  }
});

test("Lucide controls share a crisp monochrome icon treatment", async () => {
  const css = await read("router-app/app.css");
  assert.match(css, /\.koma-icon\s*{[\s\S]*stroke-width:\s*1\.8/);
  assert.match(css, /\.feature-arrow\s*{[\s\S]*width:\s*44px;[\s\S]*height:\s*44px/);
  assert.match(css, /\.closing-panel-arrow\s*{[\s\S]*width:\s*44px;[\s\S]*height:\s*44px/);
});

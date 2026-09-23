import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const uiFiles=["router-app/components/FeatureStrip.tsx","router-app/components/IssueNavigation.tsx","router-app/components/CurrentIssueHeader.tsx","router-app/components/publication/ClosingPanels.tsx","router-app/routes/home.tsx"];

test("KOMA runtime chrome uses text arrows without emoji presentation",async()=>{
  const chrome=(await Promise.all(uiFiles.map(file=>readFile(file,"utf8")))).join("\n");
  assert.doesNotMatch(chrome,/[↗→←↖↘↙]\uFE0F/);assert.doesNotMatch(chrome,/↗️|➡️|⬅️/);
  assert.match(await readFile("router-app/app.css","utf8"),/\.feature-arrow[\s\S]*font-variant-emoji:\s*text/);
});

test("Feature Strip category and mobile artwork composition have protected contracts",async()=>{
  const strip=await readFile("router-app/components/FeatureStrip.tsx","utf8"),css=await readFile("router-app/app.css","utf8");
  assert.match(strip,/className="feature-category"/);
  assert.match(css,/\.feature-category\s*\{[\s\S]*background:[\s\S]*var\(--paper\)[\s\S]*color:\s*var\(--ink\)/);
  assert.match(css,/@media \(max-width: 600px\)[\s\S]*flex-basis:\s*min\(88vw,430px\)[\s\S]*height:\s*clamp\(360px,62svh,520px\)/);
  assert.match(css,/\.feature-summary[\s\S]*-webkit-line-clamp:\s*3/);
});

test("mobile homepage owns overflow and intentionally scrolls its internal rails",async()=>{
  const css=await readFile("router-app/app.css","utf8");
  assert.match(css,/\.issue-home\s*\{[\s\S]*overflow-x:\s*clip/);
  assert.match(css,/\.issue-masthead nav[\s\S]*overflow-x:\s*auto/);
  assert.match(css,/\.issue-filters[\s\S]*overscroll-behavior-x:\s*contain/);
  assert.match(css,/\.feature-rail[\s\S]*max-width:\s*100%[\s\S]*overscroll-behavior-x:\s*contain/);
  assert.match(css,/@media \(max-width: 350px\)/);assert.match(css,/@media \(max-height: 500px\) and \(orientation: landscape\)/);
});

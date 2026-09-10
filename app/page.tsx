"use client";
import { useEffect, useRef, useState } from "react";
import { FeatureStrip } from "../components/FeatureStrip";
import { issueZeroFeatures } from "../data/issue-zero";
const pages=["Cover","Time","Vice","Tōkon","Afterimage"];
const stories = issueZeroFeatures.map(item => ({n:String(item.pageIndex).padStart(2,"0"),tag:item.category,title:item.title,dek:item.summary,asset:item.image,className:item.panelClass,imageAlt:item.imageAlt}));
export default function Home(){
 const [page,setPage]=useState(0); const stage=useRef<HTMLDivElement>(null);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.defaultPrevented || (e.target instanceof Element && e.target.closest(".feature-strip, input, textarea, select, [contenteditable=true]")))return;if(e.key==="ArrowRight")setPage(v=>Math.min(4,v+1));if(e.key==="ArrowLeft")setPage(v=>Math.max(0,v-1))};addEventListener("keydown",key);return()=>removeEventListener("keydown",key)},[]);
 const move=(e:React.PointerEvent)=>{const r=stage.current?.getBoundingClientRect();if(!r)return;stage.current?.style.setProperty("--mx",String((e.clientX-r.left)/r.width-.5));stage.current?.style.setProperty("--my",String((e.clientY-r.top)/r.height-.5))};
 return <main className="shell"><header><button className="wordmark" onClick={()=>setPage(0)}>INK//<i>:</i>PLAY</button><span>ISSUE ZERO · SEP 2026</span><nav aria-label="Editorial pages">{pages.map((_,i)=><button key={i} aria-label={`${String(i).padStart(2,"0")} ${pages[i]}`} aria-current={page===i?"page":undefined} className={page===i?"on":""} onClick={()=>setPage(i)}>{String(i).padStart(2,"0")}</button>)}</nav></header>
 <div ref={stage} onPointerMove={move} className="stage">{page===0?<Cover open={setPage}/>:<Story story={stories[page-1]} />}</div>
 <footer><button aria-label="Previous editorial page" disabled={!page} onClick={()=>setPage(v=>v-1)}>←</button><span>{pages[page]}</span><button aria-label="Next editorial page" disabled={page===4} onClick={()=>setPage(v=>v+1)}>→</button></footer></main>
}
function Cover({open}:{open:(n:number)=>void}){return <article className="cover enter"><section className="cover-brand"><p>A LIVING PUBLICATION FOR GAMES / MANGA / ANIME</p><h1>INK//<i>:</i>PLAY</h1><small>READ THE CLUES. ENTER THE PANEL.</small></section><FeatureStrip items={issueZeroFeatures} onOpen={open}/></article>}
function Story({story}:{story:typeof stories[number]}){return <article className={`story enter ${story.className}`}><section className="story-head"><p>{story.n} / {story.tag}</p><h1>{story.title}</h1><div className="rule"/><h2>{story.dek}</h2></section><button className="hero-panel" aria-label="Bring clue forward"><span>MOVE TO INSPECT</span><img src={story.asset} alt={story.imageAlt}/></button><section className="story-copy">
 {story.className==="ocarina"&&<><b>05 NOV 2026 · SWITCH 2</b><p>A remake should preserve more than rooms and melodies. We ask which frictions belong to history—and which are the texture of memory itself.</p></>}
 {story.className==="vice"&&<><b>19 NOV 2026 · PS5 / XBOX SERIES</b><p>GTA VI is close enough to distort the calendar around it. We read the final campaign through scale, atmosphere and the industry waiting in its shadow.</p></>}
 {story.className==="tokon"&&<><b>FIELD NOTES · PLAYER-WRITTEN</b><p>Your son’s first-week impressions become the authority: choosing a point fighter, using assists with intention and learning how to lose usefully.</p></>}
 {story.className==="vhs"&&<><b>VISUAL ESSAY · 80s/90s OVA</b><p>Your trail through legally available archive uploads asks why grain, hard shadow and hand-painted materiality feel newly urgent—from Clevatess to Sentenced to Be a Hero.</p></>}
 </section><aside className="margin-note">INK//PLAY<br/><b>ISSUE 000</b></aside></article>}

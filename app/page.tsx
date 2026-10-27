"use client";
import {useMemo,useRef,useState} from "react";
import {auditDocx,AuditItem,Rules} from "@/lib/docxAudit";

const defaults:Rules={bodyFont:"Times New Roman",bodySize:12,lineSpacing:1.5,alignment:"both",firstLineCm:1.25,marginTopCm:2.5,marginBottomCm:2.5,marginLeftCm:3,marginRightCm:2,captionFont:"Times New Roman",captionSize:10,captionBold:false,tableFont:"Times New Roman",tableSize:10};

export default function Page(){
 const [file,setFile]=useState<File|null>(null),[rules,setRules]=useState(defaults),[items,setItems]=useState<AuditItem[]>([]),[running,setRunning]=useState(false),[current,setCurrent]=useState<AuditItem|null>(null),[progress,setProgress]=useState(0),[filter,setFilter]=useState<"all"|"bad">("bad"),[err,setErr]=useState("");
 const refs=useRef<Record<string,HTMLDivElement|null>>({});
 const bad=useMemo(()=>items.filter(i=>i.issues.length),[items]);
 async function run(){if(!file)return;setRunning(true);setErr("");setItems([]);setProgress(0);try{const res=await auditDocx(file,rules,(it,d,t)=>{setCurrent(it);setProgress(Math.round(d/t*100));setItems(prev=>[...prev,it]);});setItems(res);setProgress(100);}catch(e){setErr(e instanceof Error?e.message:"Elemzési hiba");}finally{setRunning(false);}}
 function exportReport(){const data={file:file?.name,rules,generatedAt:new Date().toISOString(),issues:bad};const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.download=(file?.name.replace(/.docx$/i,"")||"wordaudit")+"-audit.json";a.click();URL.revokeObjectURL(a.href)}
 function jump(id:string){refs.current[id]?.scrollIntoView({behavior:"smooth",block:"center"});}
 return <main>
  <header><div><h1>WordAudit</h1><p>DOCX formázási ellenőrző</p></div><span className={running?"status run":"status"}>{running?"ELEMZÉS":"KÉSZ"}</span></header>
  <section className="controls">
   <label className="drop"><input type="file" accept=".docx" onChange={e=>setFile(e.target.files?.[0]||null)}/><b>{file?file.name:"DOCX kiválasztása"}</b><small>A fájl helyben, a böngészőben kerül feldolgozásra.</small></label>
   <details><summary>Szabályok</summary><div className="grid">
    <label>Törzsszöveg betűtípus<input value={rules.bodyFont} onChange={e=>setRules({...rules,bodyFont:e.target.value})}/></label>
    <label>Betűméret (pt)<input type="number" value={rules.bodySize} onChange={e=>setRules({...rules,bodySize:+e.target.value})}/></label>
    <label>Sorköz<input type="number" step="0.1" value={rules.lineSpacing} onChange={e=>setRules({...rules,lineSpacing:+e.target.value})}/></label>
    <label>Első sor behúzás (cm)<input type="number" step="0.05" value={rules.firstLineCm} onChange={e=>setRules({...rules,firstLineCm:+e.target.value})}/></label>
    <label>Felirat betűméret<input type="number" value={rules.captionSize} onChange={e=>setRules({...rules,captionSize:+e.target.value})}/></label>
    <label>Táblázat betűméret<input type="number" value={rules.tableSize} onChange={e=>setRules({...rules,tableSize:+e.target.value})}/></label>
    <label>Bal margó (cm)<input type="number" step="0.1" value={rules.marginLeftCm} onChange={e=>setRules({...rules,marginLeftCm:+e.target.value})}/></label>
    <label>Jobb margó (cm)<input type="number" step="0.1" value={rules.marginRightCm} onChange={e=>setRules({...rules,marginRightCm:+e.target.value})}/></label>
   </div></details>
   <button disabled={!file||running} onClick={run}>{running?"Ellenőrzés folyamatban…":"Dokumentum ellenőrzése"}</button>
  </section>
  {err&&<div className="error">{err}</div>}
  {(running||items.length>0)&&<section className="scanbar"><div><span style={{width:progress+"%"}}/></div><p>{progress}% {current&&<>· {current.label} · kb. {current.pageApprox}. oldal</>}</p></section>}
  <section className="workspace">
   <div className="document">
    {items.length===0?<div className="empty">Itt jelenik meg a dokumentum szerkezete. Az elemző sáv ténylegesen az éppen vizsgált elemnél halad.</div>:items.map(it=><div key={it.id} ref={el=>{refs.current[it.id]=el}} className={`docrow ${current?.id===it.id?"active":""} ${it.issues.length?"bad":"ok"}`}>
      <span className="pin">{it.pageApprox}</span><div><b>{it.label}</b><p>{it.text}</p><small>{Object.entries(it.meta).slice(0,4).map(([k,v])=>`${k}: ${String(v)}`).join(" · ")}</small></div><span className="mark">{it.issues.length?it.issues.length:"✓"}</span>
    </div>)}
   </div>
   <aside>
    <div className="summary"><b>{bad.length}</b><span>eltérés</span><b>{items.length}</b><span>vizsgált elem</span></div>
    <div className="tabs"><button className={filter==="bad"?"sel":""} onClick={()=>setFilter("bad")}>Eltérések</button><button className={filter==="all"?"sel":""} onClick={()=>setFilter("all")}>Minden</button></div>
    <div className="issues">{(filter==="bad"?bad:items).map(it=><button key={it.id} onClick={()=>jump(it.id)}><b>{it.label} · {it.pageApprox}. oldal</b>{it.issues.length?it.issues.map((x,i)=><span key={i}>⚠ {x}</span>):<span>✓ Rendben</span>}</button>)}</div>
    <button className="export" disabled={!items.length} onClick={exportReport}>Audit JSON export</button>
   </aside>
  </section>
 </main>
}

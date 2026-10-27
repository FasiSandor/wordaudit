import JSZip from "jszip";

export type Rules = {
  bodyFont:string; bodySize:number; lineSpacing:number; alignment:"both"|"left"|"center"|"right"; firstLineCm:number;
  marginTopCm:number; marginBottomCm:number; marginLeftCm:number; marginRightCm:number;
  captionFont:string; captionSize:number; captionBold:boolean; tableFont:string; tableSize:number;
};

export type AuditItem = {
  id:string; kind:"paragraph"|"table"|"caption"|"figure"|"chart"|"section"; index:number; pageApprox:number; text:string; label:string;
  issues:string[]; meta:Record<string,string|number|boolean|null>;
};

const NS="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const q=(n:Element,tag:string)=>n.getElementsByTagNameNS(NS,tag)[0]||null;
const qa=(n:Element,tag:string)=>Array.from(n.getElementsByTagNameNS(NS,tag));
const attr=(n:Element|null,name:string)=>n?.getAttributeNS(NS,name)||n?.getAttribute(`w:${name}`)||null;
const twipsToCm=(v:string|null)=>v?Number(v)/567:0;
const halfPt=(v:string|null)=>v?Number(v)/2:0;

function parseXml(s:string){return new DOMParser().parseFromString(s,"application/xml")}
function textOf(p:Element){return qa(p,"t").map(x=>x.textContent||"").join("")}
function pageBreakCount(p:Element){return qa(p,"br").filter(b=>attr(b,"type")==="page").length + qa(p,"lastRenderedPageBreak").length}
function normalizeFont(v:string|null){return (v||"").trim()}

function buildStyleMap(styles:Document|null){
  const map=new Map<string,Element>();
  if(!styles) return map;
  for(const st of qa(styles.documentElement,"style")){
    const id=attr(st,"styleId"); if(id) map.set(id,st);
  }
  return map;
}

function inheritedP(styleMap:Map<string,Element>, styleId:string|null){
  const out:any={}; const seen=new Set<string>(); let cur=styleId;
  while(cur && !seen.has(cur)){
    seen.add(cur); const st=styleMap.get(cur); if(!st) break;
    const pPr=q(st,"pPr"); const rPr=q(st,"rPr");
    if(out.align==null) out.align=attr(q(pPr||st,"jc"),"val");
    if(out.line==null) out.line=attr(q(pPr||st,"spacing"),"line");
    if(out.before==null) out.before=attr(q(pPr||st,"spacing"),"before");
    if(out.after==null) out.after=attr(q(pPr||st,"spacing"),"after");
    if(out.firstLine==null) out.firstLine=attr(q(pPr||st,"ind"),"firstLine");
    if(out.font==null){const rf=q(rPr||st,"rFonts"); out.font=attr(rf,"ascii")||attr(rf,"hAnsi")}
    if(out.size==null) out.size=attr(q(rPr||st,"sz"),"val");
    cur=attr(q(st,"basedOn"),"val");
  }
  return out;
}

function runFormat(r:Element, inherited:any){
  const rp=q(r,"rPr"); const rf=q(rp||r,"rFonts");
  return {
    font: normalizeFont(attr(rf,"ascii")||attr(rf,"hAnsi")||inherited.font),
    size: halfPt(attr(q(rp||r,"sz"),"val")||inherited.size),
    bold: !!q(rp||r,"b"), italic: !!q(rp||r,"i"), underline: !!q(rp||r,"u")
  };
}

function pFormat(p:Element, styleMap:Map<string,Element>){
  const pp=q(p,"pPr"); const sid=attr(q(pp||p,"pStyle"),"val"); const inh=inheritedP(styleMap,sid);
  const sp=q(pp||p,"spacing"); const ind=q(pp||p,"ind");
  return {
    styleId:sid||"", align:attr(q(pp||p,"jc"),"val")||inh.align||"left",
    line:Number(attr(sp,"line")||inh.line||240)/240,
    beforePt:Number(attr(sp,"before")||inh.before||0)/20,
    afterPt:Number(attr(sp,"after")||inh.after||0)/20,
    firstLineCm:twipsToCm(attr(ind,"firstLine")||inh.firstLine||null),
    inherited:inh
  };
}

function commonRunStats(p:Element, inherited:any){
  const runs=qa(p,"r").filter(r=>textOf(r).trim().length>0);
  const fmts=runs.map(r=>runFormat(r,inherited));
  const fonts=[...new Set(fmts.map(f=>f.font).filter(Boolean))];
  const sizes=[...new Set(fmts.map(f=>f.size).filter(v=>v>0))];
  return {runs,fmts,fonts,sizes};
}

function captionKind(text:string, styleId:string):"figure"|"chart"|"table"|null{
  const t=text.trim(); const s=styleId.toLowerCase();
  const hasCaptionStyle=s.includes("caption")||s.includes("felirat");
  if(/(?:^|\s)(?:\d+[.:]?\s*)?(?:táblázat|tablazat)\b/i.test(t) || /(?:táblázat|tablazat)\s*[:.]?\s*\d+/i.test(t)) return "table";
  if(/(?:^|\s)(?:\d+[.:]?\s*)?(?:diagram|grafikon)\b/i.test(t) || /(?:diagram|grafikon)\s*[:.]?\s*\d+/i.test(t)) return "chart";
  if(/(?:^|\s)(?:\d+[.:]?\s*)?(?:ábra|abra)\b/i.test(t) || /(?:ábra|abra)\s*[:.]?\s*\d+/i.test(t)) return "figure";
  return hasCaptionStyle ? "figure" : null;
}

function captionNumber(text:string, kind:"figure"|"chart"|"table"){
  const word = kind==="table" ? "(?:táblázat|tablazat)" : kind==="chart" ? "(?:diagram|grafikon)" : "(?:ábra|abra)";
  const a=text.match(new RegExp(`(?:^|\\s)(\\d+)[.:]?\\s*${word}\\b`,"i"));
  const b=text.match(new RegExp(`${word}\\s*[:.]?\\s*(\\d+)`,"i"));
  return a?Number(a[1]):b?Number(b[1]):null;
}

function embeddedObjectKind(p:Element):"chart"|"figure"|null{
  if(qa(p,"chart").length>0) return "chart";
  if(qa(p,"drawing").length>0 || qa(p,"pict").length>0) return "figure";
  return null;
}

export async function auditDocx(file:File,rules:Rules,onStep?:(item:AuditItem,done:number,total:number)=>void){
  const zip=await JSZip.loadAsync(await file.arrayBuffer());
  const docXml=await zip.file("word/document.xml")?.async("string");
  if(!docXml) throw new Error("Nem található Word dokumentumtörzs.");
  const stylesXml=await zip.file("word/styles.xml")?.async("string");
  const doc=parseXml(docXml); const styles=stylesXml?parseXml(stylesXml):null; const styleMap=buildStyleMap(styles);
  const body=q(doc.documentElement,"body"); if(!body) throw new Error("Hibás DOCX struktúra.");
  const children=Array.from(body.children).filter(x=>x.namespaceURI===NS);
  const total=children.length; let page=1; let idx=0; const items:AuditItem[]=[]; const captionSeq:Record<"figure"|"chart"|"table",{n:number;item:AuditItem}[]>={figure:[],chart:[],table:[]};

  for(const el of children){
    idx++; let item:AuditItem|null=null;
    if(el.localName==="p"){
      const text=textOf(el).replace(/\s+/g," ").trim(); const pf=pFormat(el,styleMap); const rs=commonRunStats(el,pf.inherited);
      const capKind=captionKind(text,pf.styleId); const cap=capKind!==null; const objKind=embeddedObjectKind(el); const issues:string[]=[];
      if(text){
        const expectedFont=cap?rules.captionFont:rules.bodyFont; const expectedSize=cap?rules.captionSize:rules.bodySize;
        if(rs.fonts.some(f=>f && f.toLowerCase()!==expectedFont.toLowerCase())) issues.push(`Eltérő betűtípus: ${rs.fonts.join(", ")||"ismeretlen"}; elvárt: ${expectedFont}`);
        if(rs.sizes.some(s=>Math.abs(s-expectedSize)>0.01)) issues.push(`Eltérő betűméret: ${rs.sizes.join(", ")||"ismeretlen"} pt; elvárt: ${expectedSize} pt`);
        if(!cap){
          if(pf.align!==rules.alignment) issues.push(`Igazítás: ${pf.align}; elvárt: ${rules.alignment}`);
          if(Math.abs(pf.line-rules.lineSpacing)>.08) issues.push(`Sorköz: ${pf.line.toFixed(2)}; elvárt: ${rules.lineSpacing}`);
          if(Math.abs(pf.firstLineCm-rules.firstLineCm)>.08) issues.push(`Első sor behúzás: ${pf.firstLineCm.toFixed(2)} cm; elvárt: ${rules.firstLineCm.toFixed(2)} cm`);
        } else {
          const boldRuns=rs.fmts.filter(f=>f.bold).length;
          if(rules.captionBold && boldRuns<rs.fmts.length) issues.push("A felirat nem teljes egészében félkövér.");
          const n=capKind?captionNumber(text,capKind):null; if(capKind && n!=null) captionSeq[capKind].push({n,item:null as any});
        }
      }
      item={id:`p-${idx}`,kind:cap?"caption":(objKind||"paragraph"),index:idx,pageApprox:page,text:text||(objKind==="chart"?"(beágyazott diagram)":objKind==="figure"?"(beágyazott ábra)":"(üres bekezdés)"),label:cap?(capKind==="table"?"Táblázatfelirat":capKind==="chart"?"Diagramfelirat":"Ábrafelirat"):(objKind==="chart"?"Diagram":objKind==="figure"?"Ábra":"Bekezdés"),issues,meta:{style:pf.styleId,font:rs.fonts.join(", "),size:rs.sizes.join(", "),line:pf.line,align:pf.align,firstLineCm:pf.firstLineCm,captionKind:capKind||"",objectKind:objKind||""}};
      if(capKind){ const n=captionNumber(text,capKind); const arr=captionSeq[capKind]; if(n!=null && arr.length) arr[arr.length-1].item=item; }
      const breaks=pageBreakCount(el); if(breaks>0) page+=breaks;
    } else if(el.localName==="tbl"){
      const issues:string[]=[]; const paras=qa(el,"p").filter(p=>textOf(p).trim()); let badFont=false,badSize=false;
      for(const p of paras){const pf=pFormat(p,styleMap);const rs=commonRunStats(p,pf.inherited); if(rs.fonts.some(f=>f&&f.toLowerCase()!==rules.tableFont.toLowerCase())) badFont=true; if(rs.sizes.some(s=>Math.abs(s-rules.tableSize)>.01)) badSize=true;}
      if(badFont) issues.push(`A táblázatban eltérő betűtípus van; elvárt: ${rules.tableFont}`);
      if(badSize) issues.push(`A táblázatban eltérő betűméret van; elvárt: ${rules.tableSize} pt`);
      const rows=qa(el,"tr").length; const cols=Math.max(0,...qa(el,"tr").map(r=>qa(r,"tc").length));
      item={id:`t-${idx}`,kind:"table",index:idx,pageApprox:page,text:paras.slice(0,3).map(textOf).join(" | ").slice(0,220)||"(üres táblázat)",label:`Táblázat ${rows}×${cols}`,issues,meta:{rows,cols}};
    }
    if(item){items.push(item); onStep?.(item,idx,total); await new Promise(r=>setTimeout(r,8));}
  }

  const sect=qa(body,"sectPr")[0]; if(sect){
    const mar=q(sect,"pgMar"); const vals={top:twipsToCm(attr(mar,"top")),bottom:twipsToCm(attr(mar,"bottom")),left:twipsToCm(attr(mar,"left")),right:twipsToCm(attr(mar,"right"))};
    const issues:string[]=[];
    if(Math.abs(vals.top-rules.marginTopCm)>.08) issues.push(`Felső margó: ${vals.top.toFixed(2)} cm; elvárt ${rules.marginTopCm}`);
    if(Math.abs(vals.bottom-rules.marginBottomCm)>.08) issues.push(`Alsó margó: ${vals.bottom.toFixed(2)} cm; elvárt ${rules.marginBottomCm}`);
    if(Math.abs(vals.left-rules.marginLeftCm)>.08) issues.push(`Bal margó: ${vals.left.toFixed(2)} cm; elvárt ${rules.marginLeftCm}`);
    if(Math.abs(vals.right-rules.marginRightCm)>.08) issues.push(`Jobb margó: ${vals.right.toFixed(2)} cm; elvárt ${rules.marginRightCm}`);
    items.unshift({id:"section",kind:"section",index:0,pageApprox:1,text:"Oldalbeállítás",label:"Margók",issues,meta:vals});
  }

  for(const kind of ["figure","chart","table"] as const){
    const seq=captionSeq[kind];
    for(let i=1;i<seq.length;i++) if(seq[i].n!==seq[i-1].n+1) seq[i].item?.issues.push(`Feliratszámozás ugrik: ${seq[i-1].n} → ${seq[i].n}.`);
  }

  for(const it of items.filter(i=>i.kind==="table"||i.kind==="chart"||i.kind==="figure")){
    const pos=items.findIndex(x=>x.id===it.id);
    const near=items.slice(Math.max(0,pos-2),pos+3).filter(x=>x.kind==="caption");
    const wanted=it.kind==="table"?"table":it.kind==="chart"?"chart":"figure";
    const ok=near.some(x=>String(x.meta.captionKind)===wanted || (wanted!=="table" && ["figure","chart"].includes(String(x.meta.captionKind))));
    if(!ok) it.issues.push(it.kind==="table"?"Nem található felismerhető táblázatfelirat közvetlenül mellette.":"Nem található felismerhető ábra-/diagramfelirat közvetlenül mellette.");
  }
  return items;
}

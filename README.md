# WordAudit

Kicsi, kliensoldali DOCX-formázási audit app.

## Fő működés
- `.docx` helyi feldolgozása JSZip + WordprocessingML alapján
- törzsszöveg: betűtípus, méret, sorköz, igazítás, első sor behúzás
- oldalmargók
- táblázatok: betűtípus, betűméret, sor/oszlopszám és közeli táblázatfelirat
- ábrák és beágyazott diagramok felismerése
- ábra/diagram/grafikon/táblázat feliratok formázása
- feliratszámozás külön sorozatban ellenőrizve
- Word által tárolt explicit és `lastRenderedPageBreak` törések használata az oldalközelítéshez
- tényleges dokumentumelemhez kötött pásztázási állapot
- kattintható eltéréslista
- JSON audit export

## Fontos
A DOCX nem minden esetben tárol megbízható, Word által számolt oldalszámot. Ha a fájl tartalmaz `lastRenderedPageBreak` jelöléseket, az app ezeket is használja; enélkül az oldalszám közelítés. A formázási audit ettől függetlenül a DOCX XML tényleges tulajdonságain alapul.

## Futtatás
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

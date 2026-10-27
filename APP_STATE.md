# WordAudit – alkalmazásállapot

## Cél
Egyszerű DOCX-formázási audit: a felhasználó feltölt egy Word dokumentumot, az app láthatóan végighalad a dokumentumelemeken, majd eltéréslistát ad.

## Elfogadott működés
- Kliensoldali feldolgozás; a DOCX nem kerül háttérszerverre.
- Egyszerű, funkcionális felület; nincs szükség látványos dizájnra.
- Törzsszöveg, margók, táblázatok, ábrák/diagramok és feliratok ellenőrzése.
- Eltérésre kattintva a dokumentumszerkezet megfelelő eleméhez ugrik.

## Technikai állapot
- Stack: Next.js + TypeScript + JSZip.
- GitHub: FasiSandor/wordaudit.
- Default branch: main.
- CI: GitHub Actions build.
- Vercel deploy csak zöld CI után, összevont mérföldkőként.

## Korlát
A DOCX XML nem garantál pontos oldalszámot minden dokumentumban. A Word által mentett oldaltöréseket használjuk, ha elérhetők.

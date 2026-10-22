// Składa aplikację w jeden plik HTML (CSS, ikona i wszystkie moduły JS w środku),
// np. do otwarcia na telefonie bez serwera. Uruchom: node tools/build-single.mjs wynik.html
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, 'utf8');
const out = process.argv[2] || `${ROOT}pudelko.html`;

// Paczki przepisów są opcjonalne: wchodzą tylko te, które zbudowano lokalnie.
const packs = ['ania', 'lidl', 'ks', 'respo'].map((s) => `js/recipes-${s}.js`).filter((f) => existsSync(ROOT + f));
const packNames = packs.map((f) => read(f).match(/^export const (\w+)/m)[1]);

// Moduły w kolejności zależności; importy i eksporty znikają, bo wszystko trafia do jednego skryptu.
const js = ['js/data.js', ...packs, 'js/planner.js', 'js/app.js']
  .map((f) => `// ── ${f} ──\n` + read(f)
    .replace(/^import[\s\S]*?from\s+'[^']+';\n/gm, '')
    .replace(/^\/\/ <packs>[\s\S]*?\/\/ <\/packs>\n/m, `const packs = [${packNames.join(', ')}];\n`)
    .replace(/^export (const|function|let)/gm, '$1'))
  .join('\n');

// Wszystkie moduły trafiają do jednego zakresu, więc ta sama nazwa w dwóch plikach zepsułaby stronę.
const names = [...js.matchAll(/^(?:const|function|let) ([A-Za-z_]\w*)/gm)].map((m) => m[1]);
const dups = names.filter((n, i) => names.indexOf(n) !== i);
if (dups.length) throw new Error(`Ta sama nazwa w kilku modułach: ${[...new Set(dups)].join(', ')}`);

const icon = `data:image/svg+xml;base64,${Buffer.from(read('icon.svg')).toString('base64')}`;
const html = read('index.html');
const title = '<title>Pudełko</title>';
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script type="module" src="js\/app.js"><\/script>/, '')
  .replace(/src="icon.svg"/g, `src="${icon}"`);

writeFileSync(out, `<meta charset="utf-8">
${title}
<meta name="description" content="Plan posiłków na budżet: lista zakupów, kalorie i gotowanie.">
<link rel="icon" href="${icon}">
<style>
${read('styles.css')}
</style>
${body.trim()}
<script type="module">
${js.replace(/<\/script>/g, '<\\/script>')}
</script>
`);
console.log(`Zapisano ${out} (${Math.round(readFileSync(out).length / 1024)} KB, paczki: ${packNames.join(', ') || 'brak'})`);

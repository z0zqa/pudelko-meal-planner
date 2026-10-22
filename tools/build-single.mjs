// Bundles the app into a single HTML file (CSS, icon and all JS modules inlined),
// e.g. to open on a phone without a server. Run: node tools/build-single.mjs output.html
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, 'utf8');
const out = process.argv[2] || `${ROOT}pudelko.html`;

// Recipe packs are optional: only those built locally are included.
const packs = ['ania', 'lidl', 'ks', 'respo', 'ds'].map((s) => `js/recipes-${s}.js`).filter((f) => existsSync(ROOT + f));
const packNames = packs.map((f) => read(f).match(/^export const (\w+)/m)[1]);

// Modules in dependency order; imports and exports are stripped since everything goes into one script.
const js = ['js/prices.js', 'js/data.js', ...packs, 'js/planner.js', 'js/app.js']
  .map((f) => `// ── ${f} ──\n` + read(f)
    .replace(/^import[\s\S]*?from\s+'[^']+';\n/gm, '')
    .replace(/^\/\/ <packs>[\s\S]*?\/\/ <\/packs>\n/m, `const packs = [${packNames.join(', ')}];\n`)
    .replace(/^export (const|function|let)/gm, '$1'))
  .join('\n');

// All modules share one scope, so the same name in two files would break the page.
const names = [...js.matchAll(/^(?:const|function|let) ([A-Za-z_]\w*)/gm)].map((m) => m[1]);
const dups = names.filter((n, i) => names.indexOf(n) !== i);
if (dups.length) throw new Error(`Same name in several modules: ${[...new Set(dups)].join(', ')}`);

const icon = `data:image/svg+xml;base64,${Buffer.from(read('icon.svg')).toString('base64')}`;
const html = read('index.html');
const title = '<title>Pudełko</title>';
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script type="module" src="js\/app.js"><\/script>/, '')
  .replace(/src="icon.svg"/g, `src="${icon}"`);

writeFileSync(out, `<meta charset="utf-8">
${title}
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Plan posiłków na budżet: lista zakupów, kalorie i gotowanie.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,500..800&family=Onest:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap">
<link rel="icon" href="${icon}">
<style>
${read('styles.css')}
</style>
${body.trim()}
<script type="module">
${js.replace(/<\/script>/g, '<\\/script>')}
</script>
`);
console.log(`Wrote ${out} (${Math.round(readFileSync(out).length / 1024)} KB, packs: ${packNames.join(', ') || 'none'})`);

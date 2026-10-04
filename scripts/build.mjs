// Production build for GitHub Pages: bundles the local stylesheets and scripts
// listed in index.html (in order) into one minified CSS and one minified JS
// file with content hashes, and writes _site/index.html pointing at them.
// Source files are untouched; opening index.html locally still works unbuilt.
//   node scripts/build.mjs
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';

const root=new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1');
const out=join(root,'_site'),assets=join(out,'assets');
rmSync(out,{recursive:true,force:true});mkdirSync(assets,{recursive:true});
let html=readFileSync(join(root,'index.html'),'utf8');

const strip=u=>u.split('?')[0];
const cssRe=/<link rel="stylesheet" href="(css\/[^"]+)">\n?/g;
const jsRe=/<script defer src="((?:js|data)\/[^"]+)"><\/script>\n?/g;
const cssFiles=[...html.matchAll(cssRe)].map(m=>strip(m[1]));
const jsFiles=[...html.matchAll(jsRe)].map(m=>strip(m[1]));

// esbuild via npx (no package.json needed). Identifiers are NOT renamed:
// inline handlers in index.html call global functions by name.
function minify(code,loader){
  const args=['--yes','esbuild@0.24.0',`--loader=${loader}`,'--minify-whitespace','--minify-syntax','--legal-comments=none'];
  return execFileSync(process.platform==='win32'?'npx.cmd':'npx',args,{input:code,maxBuffer:64*1024*1024,shell:process.platform==='win32'}).toString();
}
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,10);

const css=minify(cssFiles.map(f=>readFileSync(join(root,f),'utf8')).join('\n'),'css');
// one classic script: files share the global scope exactly as separate <script defer> tags did
const js=minify(jsFiles.map(f=>`/* ${f} */\n`+readFileSync(join(root,f),'utf8')).join('\n;\n'),'js');
const cssName=`app.${hash(css)}.css`,jsName=`app.${hash(js)}.js`;
writeFileSync(join(assets,cssName),css);writeFileSync(join(assets,jsName),js);

let first=true;
html=html.replace(cssRe,()=>{if(!first)return '';first=false;return `<link rel="stylesheet" href="assets/${cssName}">\n`;});
first=true;
html=html.replace(jsRe,()=>{if(!first)return '';first=false;return `<script defer src="assets/${jsName}"></script>\n`;});
writeFileSync(join(out,'index.html'),html);
const kb=n=>(n/1024).toFixed(0)+' KB';
console.log(`css: ${cssFiles.length} files -> ${cssName} (${kb(css.length)})`);
console.log(`js:  ${jsFiles.length} files -> ${jsName} (${kb(js.length)})`);

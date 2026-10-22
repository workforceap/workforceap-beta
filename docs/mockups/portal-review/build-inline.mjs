/** Adapt the same complete, source-owned review to the in-conversation surface. */
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import postcss from 'postcss';

const here=dirname(fileURLToPath(import.meta.url));
const standalone=readFileSync(resolve(here,'index.html'),'utf8');
const rootId='wap-voice-review';
const root='#'+rootId;
const appearanceBootstrap=standalone.match(/<script id="wap-review-theme-init">([\s\S]*?)<\/script>/)?.[1];
if(!appearanceBootstrap)throw Error('Appearance bootstrap missing; rebuild the standalone review.');
const style=standalone.match(/<style>([\s\S]*?)<\/style>/)?.[1];
if(!style)throw Error('Build the standalone review before the inline view.');
const parsed=postcss.parse(style);
parsed.walkComments(c=>c.remove());
parsed.walkRules(rule=>{
  if(rule.parent.type==='atrule'&&/keyframes$/.test(rule.parent.name))return;
  rule.selectors=rule.selectors.map(selector=>{
    if(selector.startsWith(root))return selector;
    const scoped=selector.replace(/:root\b/g,root).replace(/\bhtml(?=[\s.[:]|$)/g,root).replace(/^body(?=[\s.[:]|$)/,root);
    return scoped.startsWith(root)?scoped:root+' '+scoped;
  });
});
const css=parsed.toString()+'\n'+readFileSync(resolve(here,'inline-review.css'),'utf8');
let script=standalone.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if(!script)throw Error('Review script missing.');
script=script.replace(/^const libraryIconNodes=.*?;\n/m,'');
const iconNames={home:'house',book:'book-open',briefcase:'briefcase-business',message:'messages-square',users:'users',user:'user-round',list:'list-checks',chart:'chart-no-axes-combined',help:'circle-help',spark:'sparkles',arrow:'arrow-right',back:'arrow-left',chevron:'chevron-right',check:'check',clock:'clock',alert:'triangle-alert',lock:'lock-keyhole',search:'search',moon:'moon',sun:'sun',menu:'menu',close:'x',refresh:'refresh-cw',file:'file-text',download:'download',send:'send',filter:'list-filter',plus:'plus',external:'external-link',shield:'shield-check',mic:'mic',volume:'volume-2',pause:'pause',play:'play',stop:'square',headphones:'headphones',micOff:'mic-off','mic-off':'mic-off',target:'target',audio:'audio-lines'};
// The supplied icon runtime owns icon SVGs; keep source-owned routes and state unchanged.
script=script.replace(/^const icons=.*?;\nfunction icon\(name\)\{.*?\}\n/m,'const inlineIcons='+JSON.stringify(iconNames)+';\nfunction icon(name){return `<i data-lucide="${inlineIcons[name]||\'file-text\'}" aria-hidden="true"></i>`;}\n');
script=script.replaceAll('document.querySelectorAll(', 'reviewRoot.querySelectorAll(').replaceAll('document.querySelector(', 'reviewRoot.querySelector(');
script=script.replaceAll('document.getElementById(', 'reviewElement(').replaceAll('document.addEventListener(', 'reviewRoot.addEventListener(');
script=script.replaceAll('document.documentElement.dataset.', 'reviewRoot.dataset.');
script=script.replace('reviewRoot.dataset.role=role;', 'reviewRoot.dataset.role=role;reviewRoot.dataset.path=currentPath;');
script=script.replace(/currentPath=raw\.startsWith\('\/'\)\?raw:'\/dashboard'/g,"currentPath=raw.startsWith('/')?raw:'/dashboard/ai-tools'");
script=script.replaceAll('window.scrollTo(0,0);', '');
script=script.replaceAll(' tabindex="-1"','');
script=script.replaceAll(' tabindex="0"','');
script=script.replace(" document.title=", " if(globalThis.lucide)lucide.createIcons({attrs:{width:18,height:18}});\n document.title=");
// An in-flow native dialog avoids a viewport-size/fixed overlay inside the host frame.
script=script.replace('dialog.showModal()', 'dialog.show()');
script=script.replace('function openDialog(title,body){', 'function openDialog(title,body){');
script=script.replace('installVoiceReview();','installVoiceReview(reviewRoot);');
script=script.replace('window.bindSkillMapperReview(document);','window.bindSkillMapperReview(reviewRoot);');
script=script.replace(/\nnavigate\(\);\s*$/,'')+'\n'+readFileSync(resolve(here,'inline-behavior.js'),'utf8')+'\nnavigate();';
script='(()=>{\nconst reviewRoot=document.getElementById("'+rootId+'");\nconst reviewElement=(id)=>reviewRoot.querySelector("#"+id);\n'+script+'\n})();';
let html=readFileSync(resolve(here,'inline-shell.html'),'utf8')
  .replace('/*__WAP_REVIEW_STYLE__*/',()=>css)
  .replace('/*__WAP_REVIEW_APPEARANCE__*/',()=>appearanceBootstrap.replaceAll('document.documentElement',`document.getElementById("${rootId}")`))
  .replace('/*__WAP_REVIEW_SCRIPT__*/',()=>script);
for(const [placeholder,id]of[['__WAP_ROUTE_DATA__','route-data'],['__WAP_JOURNEY_DATA__','journey-data'],['__WAP_SCREEN_DATA__','screen-definitions'],['__WAP_FEATURE_DATA__','feature-contracts']]){
  const data=standalone.match(new RegExp('<script type="application/json" id="'+id+'">([\\s\\S]*?)<\\/script>'))?.[1];
  if(!data)throw Error('Missing inline dataset: '+id);
  html=html.replace(placeholder,()=>data);
}
if(/<!doctype\s|<\s*(?:html|head|body)(?:\s|>)/i.test(html))throw Error('Inline content must be a fragment.');
if(Buffer.byteLength(html)>1_000_000)throw Error('Inline content exceeds 1 MB.');
if(/<svg\b|<path\b/i.test(html))throw Error('Use the supplied icon runtime in inline mockups.');
const output=resolve(process.argv.find(v=>v.startsWith('--output='))?.slice(9)||resolve(here,'inline.html'));
writeFileSync(output,html);
console.log(JSON.stringify({output,bytes:Buffer.byteLength(html),routeCount:JSON.parse(standalone.match(/id="route-data">([\s\S]*?)<\/script>/)[1]).routes.length}));

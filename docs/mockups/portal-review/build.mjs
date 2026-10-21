/** Build the network-isolated, portable design-review file from source-owned contracts. */
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {REVIEW_BASE_SHA} from './review-model.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const json=(name)=>JSON.parse(readFileSync(resolve(here,name),'utf8'));
const source=json('route-inventory.json');
const journeys=json('journeys.json');
const definitions=json('screen-definitions.json');
if(source.baseSha!==REVIEW_BASE_SHA||journeys.baseSha!==REVIEW_BASE_SHA||definitions.baseSha!==REVIEW_BASE_SHA)throw Error('Review source identity does not match the model. Refresh and review the inventory before changing the base.');
const inventory={baseSha:source.baseSha,summary:source.summary,navigation:source.navigation,routes:source.routes.map(r=>Object.fromEntries(['route','source','sourceUrl','role','title','titleBasis','dynamic','kind','navigation','suggestedBack','parentRoute','dataModels','guards','layoutGuards','accessClassification','accessDetail','middlewareClassification','redirectsObserved'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]])))};
const safeJSON=(v)=>JSON.stringify(v).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
const tokens=readFileSync(resolve(root,'css/wa-brand-tokens.css'),'utf8')+'\n'+readFileSync(resolve(root,'css/portal-tokens.css'),'utf8').replace(/^@import[^;]+;\s*/gm,'');
let fonts='';
// Inter ships in the existing pinned Prisma dependency; no network font request.
const fontRoot=resolve(root,'node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/build/public/assets');
for(const [weight,name] of [[400,'inter-latin-400-normal.27ae72da.woff2'],[600,'inter-latin-600-normal.87d718a2.woff2']]){
 const file=resolve(fontRoot,name);
 if(!existsSync(file))throw Error('Pinned Inter font not found; install the existing lockfile dependencies before building the review.');
 fonts+=`@font-face{font-family:Inter;font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${readFileSync(file).toString('base64')}) format('woff2');}`;
}
const css=fonts+'\n'+tokens+'\n'+readFileSync(resolve(here,'review.css'),'utf8')+'\n'+readFileSync(resolve(here,'voice-review.css'),'utf8');
const model=readFileSync(resolve(here,'review-model.mjs'),'utf8').replace(/^export /gm,'');
const {Mic,Headphones,Target,AudioLines,MicOff,Pause}=createRequire(import.meta.url)('lucide-react');
const libraryIconNodes=Object.fromEntries(Object.entries({mic:Mic,headphones:Headphones,target:Target,audio:AudioLines,'mic-off':MicOff,pause:Pause}).map(([key,component])=>[key,component.render({},null).props.iconNode]));
const script='const libraryIconNodes='+safeJSON(libraryIconNodes)+';\n'+model+'\n'+readFileSync(resolve(here,'review.js'),'utf8').replace(/\nnavigate\(\);\s*$/,'')+'\n'+readFileSync(resolve(here,'voice-review.js'),'utf8')+'\ninstallVoiceReview();\nnavigate();';
if(/<\/script/i.test(script))throw Error('Embedded script must not contain a closing script token.');
const html=`<!doctype html>
<html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'"><title>WorkforceAP · Complete portal review</title><style>${css}</style></head><body>
<a href="#main" class="skip">Skip to workspace</a>
<header class="reviewbar" aria-label="Design review controls"><div class="reviewbrand">WorkforceAP <span>/ Experience review</span></div><span class="reviewlabel">Offline prototype · synthetic data</span><div class="reviewcontrols"><label class="control"><span>Workspace</span><select id="role-select" aria-label="Review workspace"><option value="member">Member</option><option value="counselor">Counselor</option><option value="employer">Employer</option><option value="partner">Partner</option><option value="admin">Admin</option><option value="shared">Group & shared</option><option value="entry">Entry & handoffs</option></select></label><label class="control statecontrol"><span>State</span><select id="state-select" aria-label="Review data state"><option value="ready">Ready</option><option value="loading">Loading</option><option value="empty">Confirmed empty</option><option value="unavailable">Unavailable</option><option value="denied">No access</option><option value="saved">Saved receipt</option><option value="conflict">Changed record</option><option value="uncertain">Unconfirmed send</option></select></label><button id="theme-button" data-action="theme" aria-label="Switch theme">Theme</button><button data-action="catalog">All screens & journeys</button><button data-action="source">Source & data</button></div></header>
<div id="app"></div><dialog id="review-dialog" class="reviewdrawer" aria-labelledby="dialog-title"><div class="dialoghead"><h2 id="dialog-title"></h2><button class="button small" data-action="close-dialog">Close</button></div><div class="dialogbody" id="dialog-body"></div></dialog><div id="toast" class="toast" aria-hidden="true"></div><div id="announcer" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
<script type="application/json" id="route-data">${safeJSON(inventory)}</script><script type="application/json" id="journey-data">${safeJSON(journeys)}</script><script type="application/json" id="screen-definitions">${safeJSON(definitions)}</script><script>${script}</script>
</body></html>`;
writeFileSync(resolve(here,'index.html'),html);
const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9);
if(output){mkdirSync(dirname(resolve(output)),{recursive:true});writeFileSync(resolve(output),html);}
console.log(JSON.stringify({base:REVIEW_BASE_SHA,routes:inventory.routes.length,journeys:journeys.scenarioCount,bytes:Buffer.byteLength(html),networkDependencies:0,output:resolve(here,'index.html')},null,2));

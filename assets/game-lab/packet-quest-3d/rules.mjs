export const META = Object.freeze({id:'packet-quest-3d-v1',providerLessonId:null,credit:false,reviewed:false});
export const STAGES = [
 {title:'01 / FIRST DELIVERY',name:'Cross the LAN',brief:'Same subnet: the switch carries it, no router. The switch-to-server cable is unplugged. Plug it in, then route the page.',target:'192.0.2.80 • local /24',learn:'Same-subnet traffic crosses the switch, not the default gateway.'},
 {title:'02 / NAME RESCUE',name:'Wake the resolver',brief:'DNS is OFFLINE. Repair it, resolve arcade.test, then deliver the page.',target:'arcade.test → 198.51.100.80 • remote',learn:'DNS finds an address first; the page request is a separate exchange.'},
 {title:'03 / BOSS: FALSE POSITIVE',name:'Break the blackout',brief:'Wrong gateway. Silent web service. A ping alone cannot beat this boss.',target:'198.51.100.80 • remote',learn:'A gateway carries non-local traffic; ping replies do not prove HTTP works.'}
];
export function fresh(stage=0){if(!Number.isInteger(stage)||stage<0||stage>2)throw Error('Invalid stage');return {stage,hp:3,errors:0,status:'play',route:[],dns:stage!==1,resolved:stage!==1,gateway:stage!==2,web:stage!==2,cable:stage!==0,ping:false,purpose:stage===1?'dns':'page',log:[]};}
export function expected(s){return s.purpose==='dns'?['client','switch','dns']:s.stage===0?['client','switch','server']:['client','switch','router','server'];}
function hurt(s,message){return {...s,hp:s.hp-1,errors:s.errors+1,status:s.hp===1?'lose':'play',route:[],log:[...s.log,message]};}
export function act(state,action){let s=structuredClone(state);if(s.status!=='play')return s;
 if(action.type==='purpose'){if(!['dns','page','ping'].includes(action.value))return s;s.purpose=action.value;s.route=[];return s;}
 if(action.type==='repair'){
  const key={dns:'dns',router:'gateway',server:'web',switch:'cable'}[action.node];
  if(!key)return hurt(s,'No fault here. Inspect the marked device.');
  if(s[key])return {...s,log:[...s.log,'Already healthy. No life lost.']};
  s[key]=true;s.log.push({cable:'Cable plugged into the switch port. Link is up.',dns:'DNS ONLINE. Ready for a lookup.',gateway:'Gateway corrected: 192.0.2.1 (same /24 as client).',web:'HTTP service restarted on port 80.'}[key]);return s;
 }
 if(action.type==='hop'){
  const path=expected(s),next=path[s.route.length];
  if(action.node!==next)return hurt(s,`Wrong hop. Expected ${next}. Route reset.`);
  s.route.push(action.node);return s;
 }
 if(action.type!=='launch')return s;
 if(s.route.join()!==expected(s).join())return hurt(s,'Incomplete route. Tap the hops in order before launching.');
 s.route=[];
 if(s.stage===0&&!s.cable)return hurt(s,'Link down: the switch-to-server cable is unplugged. Repair the switch port.');
 if(s.purpose==='dns'){
  if(!s.dns)return hurt(s,'DNS timeout. Resolver OFFLINE. Repair DNS before lookup.');
  s.resolved=true;s.purpose='page';s.log.push('DNS response: arcade.test = 198.51.100.80. Response returns to client; now send a separate page request.');return s;
 }
 if(s.stage>0&&!s.gateway)return hurt(s,'No remote route: gateway 192.0.2.254 is not the router. Repair router.');
 if(s.purpose==='ping'){s.ping=true;s.log.push('ICMP echo reply. Host reachable. HTTP has NOT been tested.');return s;}
 if(!s.resolved)return hurt(s,'No address for arcade.test. Resolve DNS first; an IP ping would not resolve the name.');
 if(!s.web)return hurt(s,'HTTP connection refused, even though the host can answer ping. Repair server.');
 s.status='win';s.log.push('HTTP 200. Page delivered to client.');return s;
}
export function goals(s){const w=s.status==='win';
 if(s.stage===0)return [{text:'Plug in the switch cable',done:s.cable},{text:'Deliver the page to the server',done:w}];
 if(s.stage===1)return [{text:'Repair the DNS server',done:s.dns},{text:'Look up arcade.test (DNS)',done:s.resolved},{text:'Send the page request (separate step)',done:w}];
 return [{text:'Fix the gateway',done:s.gateway},{text:'Restart the web service',done:s.web},{text:'Verify with a page request, not ping',done:w}];}
export function stars(s){return Math.max(1,3-s.errors);}
export const emptySave=()=>({version:1,best:[0,0,0],evidence:[[],[],[]]});
export function validateSave(v){return !!v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join() === 'best,evidence,version'&&v.version===1&&Array.isArray(v.best)&&v.best.length===3&&v.best.every(x=>Number.isInteger(x)&&x>=0&&x<=3)&&Array.isArray(v.evidence)&&v.evidence.length===3&&v.evidence.every((logs,i)=>Array.isArray(logs)&&logs.length<=80&&(v.best[i]>0||logs.length===0)&&logs.every(x=>typeof x==='string'&&x.length<=400));}
export function loadSave(raw){try{const v=JSON.parse(raw);return validateSave(v)?v:emptySave();}catch{return emptySave();}}
export function record(save,s){if(s.status!=='win')return save;const next=structuredClone(save);if(stars(s)>=next.best[s.stage]){next.best[s.stage]=stars(s);next.evidence[s.stage]=s.log.slice(-80);}return next;}
export const score=save=>save.best.reduce((a,n)=>a+n*100,0);

// Packet Quest 3D: procedural "semi-real" server-room diorama.
// Physically based materials, key/fill/rim lights with soft shadows, a code-generated PMREM environment, ACES tone mapping.
// Beveled boxes, cylinders and tubes only; textures are drawn on 2D canvases at runtime. No models, HDRs, CDN or network.
import * as THREE from './vendor/three.module.min.js';
import {QUALITY, createKit, createLights, makeEnvironment, detectQuality, createBudget, canvasTexture, worldPerPx, projectToClient, rng} from './look.mjs';

export const POS = {
  client: [-6.3, 0, 1.15], switch: [-2.15, 0, 1.15], router: [2.05, 0, 1.15], server: [6.25, 0, 1.15], dns: [-.85, 0, -2.55]
};
const TOP = {client: 2.38, switch: 1.36, router: 1.82, server: 3.55, dns: 2.82};
// Each link has a distinct colour and high-contrast pattern on its 3D rubber tube jacket + floor channel.
const LINKS = {
  'client|switch': {pts: [[-4.72, 1.04, 1.15], [-3.88, .56, 1.66], [-2.98, 1.04, 1.15]], hex: 0x35d0ff, pat: 'chevron', name: 'cyan chevrons'},
  'switch|router': {pts: [[-1.22, 1.02, 1.15], [0, .54, 1.52], [1.22, 1.02, 1.15]], hex: 0x5eeaa5, pat: 'dots', name: 'green dots'},
  'router|server': {pts: [[2.82, 1.02, 1.15], [3.95, .54, 1.56], [5.08, 1.08, 1.15]], hex: 0xffa24d, pat: 'stripes', name: 'orange stripes'},
  'switch|server': {pts: [[-2.15, .94, 1.68], [-1.45, .42, 2.85], [2.1, .38, 3.05], [5.55, .42, 2.85], [6.25, .96, 1.68]], hex: 0xff6fb5, pat: 'diamond', name: 'pink diamonds'},
  'switch|dns': {pts: [[-2.9, 1.05, 1.15], [-4.85, 3.2, .45], [-4.85, 3.2, -3.35], [-1.85, 1.12, -3.15]], hex: 0xc084fc, pat: 'dash', name: 'violet dashes'}
};
export const NAMES = {client: 'Client PC', switch: 'Switch', router: 'Router', dns: 'DNS server', server: 'Web server'};
const SHORT = {'PORT UNPLUGGED': 'UNPLUG', 'WRONG GATEWAY': 'BAD GW', 'HTTP DOWN': 'DOWN', OFFLINE: 'DOWN', OK: 'OK'};
const ORDER = ['client', 'switch', 'router', 'server', 'dns'];
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const cableKey = (a, b) => (LINKS[`${a}|${b}`] ? `${a}|${b}` : `${b}|${a}`);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const HANG = .54;

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

// ---------------- canvas textures ----------------
function ventTex(kit, key, slots, bg = '#2b3342') {
  return kit.tex(key, 256, 128, (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const gap = H / slots;
    for (let i = 0; i < slots; i++) {
      g.fillStyle = '#0c1018'; g.beginPath(); g.roundRect(14, i * gap + gap * .26, W - 28, gap * .46, 4); g.fill();
      g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(16, i * gap + gap * .72, W - 32, 1.5);
    }
  });
}
function portTex(kit, key, rows, cols, label = '') {
  return kit.tex(key, 512, 128, (g, W, H) => {
    g.fillStyle = '#252d3d'; g.fillRect(0, 0, W, H); g.fillStyle = '#4a566e'; g.fillRect(0, 0, W, 7);
    const px = 20, pw = (W - 2 * px) / cols, ph = rows === 1 ? 52 : 34;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = px + c * pw + 4, y = 20 + r * (ph + 12), w = pw - 8;
      g.fillStyle = '#bcc6d6'; g.fillRect(x - 2, y - 2, w + 4, ph + 4);
      g.fillStyle = '#0b0e15'; g.fillRect(x, y, w, ph);
      g.fillStyle = '#e0b858'; for (let k = 0; k < 6; k++) g.fillRect(x + 3 + k * ((w - 6) / 6), y + ph - 9, 2, 7);
      g.fillStyle = '#46526b'; g.fillRect(x + w * .3, y, w * .4, 6);
    }
    if (label) { g.fillStyle = '#d4def2'; g.font = 'bold 21px system-ui,sans-serif'; g.fillText(label, 22, H - 8); }
  });
}
function bayTex(kit, key, rows, cols) {
  return kit.tex(key, 256, 256, (g, W, H) => {
    g.fillStyle = '#1f2532'; g.fillRect(0, 0, W, H);
    const bw = W / cols, bh = H / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * bw + 5, y = r * bh + 5;
      g.fillStyle = '#566278'; g.beginPath(); g.roundRect(x, y, bw - 10, bh - 10, 5); g.fill();
      g.fillStyle = '#2a3140'; g.fillRect(x + 7, y + 7, bw - 26, bh - 26);
      for (let k = 0; k < 5; k++) { g.fillStyle = '#0d1017'; g.fillRect(x + 11, y + 11 + k * ((bh - 38) / 5), bw - 34, 3); }
      g.fillStyle = '#b4bfd2'; g.fillRect(x + bw - 20, y + 9, 6, bh - 30);
    }
  });
}
function screenTex(kit) {
  return kit.tex('screen', 512, 320, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#2563eb'); gr.addColorStop(1, '#103478'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(10,18,42,.88)'; g.fillRect(0, H - 28, W, 28);
    g.fillStyle = '#5fe3ff'; g.fillRect(8, H - 22, 38, 16);
    g.fillStyle = '#f8fafc'; g.fillRect(36, 26, 310, 200); g.fillStyle = '#dbe7ff'; g.fillRect(36, 26, 310, 28);
    g.fillStyle = '#1e3a8a'; g.font = 'bold 16px system-ui,sans-serif'; g.fillText('Browser  -  arcade.test', 48, 45);
    g.fillStyle = '#6482b8'; for (let i = 0; i < 6; i++) g.fillRect(52, 74 + i * 22, 175 + ((i * 53) % 95), 9);
    g.fillStyle = 'rgba(255,255,255,.08)'; for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  });
}
function keysTex(kit) {
  return kit.tex('keys', 512, 160, (g, W, H) => {
    g.fillStyle = '#181c26'; g.fillRect(0, 0, W, H);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 15; c++) { g.fillStyle = '#3b4459'; g.fillRect(8 + c * 33, 8 + r * 29, 29, 25); g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(8 + c * 33, 8 + r * 29, 29, 3); }
    g.fillStyle = '#3b4459'; g.fillRect(8 + 3 * 33, 8 + 4 * 29, 8 * 33 - 4, 25);
  });
}
function floorTex(kit) {
  return kit.tex('floor', 512, 512, (g, W, H) => {
    const r = rng(7); g.fillStyle = '#757e8e'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 8000; i++) { const v = 98 + (r() * 34 | 0); g.fillStyle = `rgb(${v},${v + 4},${v + 10})`; g.fillRect(r() * W, r() * H, 2, 2); }
    g.strokeStyle = 'rgba(38,44,56,.62)'; g.lineWidth = 4; g.strokeRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1.5; g.strokeRect(4, 4, W - 8, H - 8);
  }, {repeat: [9, 6], aniso: 8});
}
function floorRough(kit) {
  return kit.tex('floorRough', 256, 256, (g, W, H) => {
    const r = rng(11); g.fillStyle = '#787878'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2400; i++) { const v = 80 + (r() * 85 | 0); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * W, r() * H, 3, 3); }
  }, {srgb: false, repeat: [9, 6]});
}
function wallTex(kit) {
  return kit.tex('wall', 512, 256, (g, W, H) => {
    g.fillStyle = '#485266'; g.fillRect(0, 0, W, H);
    for (let x = 0; x < 4; x++) {
      const px = x * 128; const gr = g.createLinearGradient(px, 0, px + 128, H); gr.addColorStop(0, '#5a667d'); gr.addColorStop(1, '#434d61'); g.fillStyle = gr; g.fillRect(px + 3, 3, 122, H - 6);
      g.fillStyle = '#262d3b'; g.fillRect(px, 0, 3, H); g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(px + 3, 3, 122, 2);
      g.fillStyle = '#7c88a2'; [[px + 10, 10], [px + 118, 10], [px + 10, H - 12], [px + 118, H - 12]].forEach(([a, b]) => { g.beginPath(); g.arc(a, b, 2.6, 0, 6.3); g.fill(); });
    }
    g.fillStyle = '#2d3546'; g.fillRect(0, H / 2 - 2, W, 4);
  }, {repeat: [6, 1]});
}
function cableJacketTex(kit, key, hex, pat) {
  return kit.tex('jkt|' + key, 128, 64, (g, W, H) => {
    const c = css(hex);
    g.fillStyle = '#0f1523'; g.fillRect(0, 0, W, H);
    g.fillStyle = c; g.fillRect(0, 4, W, H - 8);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#090d16'; g.lineWidth = 4; g.lineCap = 'round';
    if (pat === 'chevron') {
      for (const ox of [24, 88]) {
        g.beginPath(); g.moveTo(ox - 6, 8); g.lineTo(ox + 24, H / 2); g.lineTo(ox - 6, H - 8);
        g.lineWidth = 14; g.strokeStyle = '#090d16'; g.stroke();
        g.lineWidth = 8; g.strokeStyle = '#ffffff'; g.stroke();
      }
    } else if (pat === 'dots') {
      for (const ox of [32, 96]) {
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ox, H / 2, 16, 0, 6.3); g.fill();
        g.lineWidth = 5; g.strokeStyle = '#090d16'; g.stroke();
      }
    } else if (pat === 'stripes') {
      for (let i = 0; i < 2; i++) {
        g.save(); g.translate(22 + i * 60, 0); g.transform(1, 0, -.55, 1, 0, 0);
        g.fillStyle = '#090d16'; g.fillRect(-3, 4, 26, H - 8);
        g.fillStyle = '#ffffff'; g.fillRect(1, 6, 18, H - 12);
        g.restore();
      }
    } else if (pat === 'diamond') {
      for (const ox of [32, 96]) {
        g.beginPath(); g.moveTo(ox, 6); g.lineTo(ox + 24, H / 2); g.lineTo(ox, H - 6); g.lineTo(ox - 24, H / 2); g.closePath();
        g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#090d16'; g.stroke();
      }
    } else {
      for (const ox of [8, 72]) {
        g.fillStyle = '#090d16'; g.fillRect(ox - 2, H / 2 - 13, 48, 26);
        g.fillStyle = '#ffffff'; g.fillRect(ox + 2, H / 2 - 9, 40, 18);
      }
    }
  }, {repeat: [5, 1], aniso: 8});
}
function lanePattern(kit, key, hex, pat) {
  return kit.tex(key, 128, 64, (g, W, H) => {
    const c = css(hex); g.fillStyle = '#0d1322'; g.fillRect(0, 0, W, H);
    g.fillStyle = c; g.strokeStyle = c; g.lineWidth = 10; g.lineCap = 'round';
    g.fillRect(0, 0, W, 9); g.fillRect(0, H - 9, W, 9);
    if (pat === 'chevron') {
      g.strokeStyle = '#ffffff'; g.lineWidth = 12;
      g.beginPath(); g.moveTo(24, 14); g.lineTo(62, H / 2); g.lineTo(24, H - 14); g.stroke();
      g.strokeStyle = c; g.lineWidth = 8;
      g.beginPath(); g.moveTo(74, 14); g.lineTo(110, H / 2); g.lineTo(74, H - 14); g.stroke();
    } else if (pat === 'dots') {
      for (let i = 0; i < 2; i++) {
        g.fillStyle = i === 0 ? '#ffffff' : c;
        g.beginPath(); g.arc(34 + i * 60, H / 2, 14, 0, 6.3); g.fill();
      }
    } else if (pat === 'stripes') {
      for (let i = 0; i < 2; i++) {
        g.save(); g.translate(24 + i * 56, 0); g.transform(1, 0, -.55, 1, 0, 0);
        g.fillStyle = i === 0 ? '#ffffff' : c; g.fillRect(0, 10, 22, H - 20); g.restore();
      }
    } else if (pat === 'diamond') {
      g.fillStyle = '#ffffff';
      g.beginPath(); g.moveTo(64, 10); g.lineTo(106, H / 2); g.lineTo(64, H - 10); g.lineTo(22, H / 2); g.closePath(); g.fill();
      g.strokeStyle = c; g.lineWidth = 5; g.stroke();
    } else {
      g.fillStyle = '#ffffff'; g.fillRect(8, H / 2 - 10, 48, 20);
      g.fillStyle = c; g.fillRect(72, H / 2 - 10, 48, 20);
    }
  }, {aniso: 8});
}
const NAME_PX = 50, STAT_PX = 50, LW = 240, LH = 98;
function labelTexture(name, status, bad) {
  const c = document.createElement('canvas'); c.width = LW; c.height = LH;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,16,32,.96)'; g.beginPath(); g.roundRect(0, 0, LW, LH, 14); g.fill();
  g.lineWidth = 6; g.strokeStyle = bad ? '#ff5c5c' : '#53e0a6'; g.beginPath(); g.roundRect(3, 3, LW - 6, LH - 6, 12); g.stroke();
  g.textAlign = 'center'; g.fillStyle = '#ffffff';
  const np = NAME_PX; g.font = `bold ${np}px system-ui, sans-serif`;
  g.fillText(name, LW / 2, 42, LW - 28);
  const px = STAT_PX, text = (bad ? '\u2716 ' : '\u2714 ') + (SHORT[status] || String(status).slice(0, 8));
  g.font = `bold ${px}px system-ui, sans-serif`;
  g.fillStyle = bad ? '#ffb3b3' : '#aef5d4'; g.fillText(text, LW / 2, 84, LW - 28);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.userData.statPx = px; t.userData.namePx = np; return t;
}
function badgeTexture(n) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#ffe066'; g.beginPath(); g.arc(64, 64, 60, 0, 6.3); g.fill(); g.lineWidth = 8; g.strokeStyle = '#111'; g.stroke();
  g.fillStyle = '#111'; g.font = 'bold 84px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function signTexture(text, hex) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 72; const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,16,32,.96)'; g.beginPath(); g.roundRect(0, 0, 256, 72, 12); g.fill(); g.lineWidth = 5; g.strokeStyle = css(hex); g.beginPath(); g.roundRect(3, 3, 250, 66, 10); g.stroke();
  g.fillStyle = css(hex); g.font = 'bold 42px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 37, 224);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function impactTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#ff2a2a'; g.beginPath(); g.arc(64, 64, 60, 0, 6.3); g.fill(); g.lineWidth = 8; g.strokeStyle = '#fff'; g.stroke();
  g.lineWidth = 16; g.lineCap = 'round'; g.beginPath(); g.moveTo(40, 40); g.lineTo(88, 88); g.moveTo(88, 40); g.lineTo(40, 88); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createScene(canvas, {reduced, onLost, onQuality, initialQuality}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.32;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onLost && onLost(); });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a3140);
  scene.fog = new THREE.Fog(0x2a3140, 32, 64);
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
  const kit = createKit(renderer);
  const envRT = makeEnvironment(renderer); kit.trackRT(1);
  scene.environment = envRT.texture; scene.environmentIntensity = .95;
  const L = createLights(scene, {bounds: {x: 10.5, z: 7.5}, keyPos: [7, 13, 8], target: [0, .8, 0]});
  const packetLight = new THREE.PointLight(0x6ff3ff, 0, 7, 2); scene.add(packetLight);

  // permanent: packet, trail, focus ring, contact AO blobs
  const packet = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.28, 2), new THREE.MeshStandardMaterial({color: 0x9ff8ff, emissive: 0x4fe6ff, emissiveIntensity: 2.6, roughness: .2, metalness: .1}));
  packet.add(core);
  const pShell = new THREE.Mesh(new THREE.IcosahedronGeometry(.38, 1), new THREE.MeshBasicMaterial({color: 0x6ff3ff, wireframe: true, transparent: true, opacity: .55}));
  packet.add(pShell);
  const pGlow = new THREE.Sprite(kit.glowMat(0x6ff3ff)); pGlow.scale.set(1.5, 1.5, 1); packet.add(pGlow);
  packet.visible = false; scene.add(packet);
  const TRAIL = 40;
  const trailPos = new Float32Array(TRAIL * 3), trailCol = new Float32Array(TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3)); trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({size: .24, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true}));
  trail.frustumCulled = false; trail.visible = false; scene.add(trail);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.42, .065, 8, 40), new THREE.MeshBasicMaterial({color: 0xffe066}));
  ring.rotation.x = Math.PI / 2; ring.visible = false; scene.add(ring);
  const blobTex = canvasTexture(64, 64, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.78)'); gr.addColorStop(.55, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }, {aniso: 1});
  const blobMat = new THREE.MeshBasicMaterial({map: blobTex, transparent: true, opacity: .62, depthWrite: false});
  const blobGeo = new THREE.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
  const blobs = new THREE.Group(); scene.add(blobs);
  const xTex = impactTexture();

  let world = null, devices = {}, lanes = {}, hopBadges = [], sign = null, impacts = [];
  let view = {faults: {}, routeNodes: [], focus: null, cable: true};
  let reducedMotion = !!reduced, anim = null, trailActive = false, trailFade = 0;
  let time = 0, az = 0, running = false, raf = 0, shake = 0, boom = null, lastCableState = null, routeSig = '';
  let quality = 'medium', autoNote = '', cw = 1, ch = 1, last = 0, detected = null;
  const budget = createBudget(42);

  // ---------------- devices with realistic relative scales ----------------
  function buildDevice(node) {
    const g = new THREE.Group(); g.userData.node = node;
    const leds = [];
    const led = (hex, x, y, z, size = .085) => { const l = kit.led(g, hex, x, y, z, size, true); leds.push(l); return l; };
    const face = (w, h, tex, x, y, z) => {
      const m = kit.cmat('face|' + tex.uuid, {map: tex, roughness: .48, metalness: .35});
      const p = new THREE.Mesh(kit.geo(`pl|${w}|${h}`, () => new THREE.PlaneGeometry(w, h)), m); p.position.set(x, y, z); p.receiveShadow = true; g.add(p); return p;
    };
    const steel = kit.mat('steel'), dark = kit.mat('steelDark'), gr = kit.mat('graphite'), lightC = kit.mat('chassisLight'), pl = kit.mat('plastic'), rub = kit.mat('rubber');
    if (node === 'client') {
      const wood = kit.cmat('wood', {color: 0xa4784c, roughness: .52, metalness: .04});
      g.add(kit.box(3.15, .11, 1.55, wood, 0, .98, 0, .025));
      [[-1.42, -.62], [1.42, -.62], [-1.42, .62], [1.42, .62]].forEach(([x, z]) => g.add(kit.box(.1, .98, .1, dark, x, 0, z, .018)));
      g.add(kit.box(2.7, .45, .06, gr, 0, .42, -.58, .015));
      g.add(kit.cyl(.34, .38, .06, steel, -.35, 1.09, -.28, 20)); g.add(kit.box(.12, .48, .1, dark, -.35, 1.13, -.28, .02));
      const mon = new THREE.Group(); mon.position.set(-.35, 1.92, -.24); mon.rotation.x = -.05; g.add(mon);
      mon.add(kit.box(1.82, 1.08, .1, pl, 0, -.52, 0, .035));
      const sm = kit.cmat('screen', {map: screenTex(kit), emissiveMap: screenTex(kit), emissive: 0xffffff, emissiveIntensity: 1.1, roughness: .22, metalness: 0});
      const scr = new THREE.Mesh(kit.geo('scr', () => new THREE.PlaneGeometry(1.68, .94)), sm); scr.position.set(0, -.52, .054); mon.add(scr);
      kit.glow(g, 0x5fa8ff, 1.4, -.35, 1.4, .08);
      g.add(kit.box(1.05, .045, .36, pl, -.35, 1.09, .36, .015));
      const kk = new THREE.Mesh(kit.geo('kk', () => new THREE.PlaneGeometry(.98, .3)), kit.cmat('keysM', {map: keysTex(kit), roughness: .48, metalness: .1})); kk.rotation.x = -Math.PI / 2; kk.position.set(-.35, 1.14, .36); g.add(kk);
      g.add(kit.box(.14, .05, .22, steel, .42, 1.09, .38, .02));
      g.add(kit.box(.76, 1.55, 1.12, lightC, 1.05, 0, .05, .035));
      g.add(kit.box(.68, 1.42, .06, gr, 1.05, .06, .6, .02));
      g.add(face(.56, .82, ventTex(kit, 'vent9', 9, '#232a38'), 1.05, .66, .635));
      led(0x2fe08a, 1.05, 1.32, .64, .075);
    } else if (node === 'switch') {
      [[-.78, 0], [.78, 0]].forEach(([x]) => {
        g.add(kit.box(.1, .92, .12, dark, x, 0, 0, .015));
        g.add(kit.box(.22, .06, .78, dark, x, 0, 0, .015));
      });
      g.add(kit.box(1.48, .06, .62, gr, 0, .35, 0, .015));
      g.add(kit.box(1.76, .44, .92, lightC, 0, .86, 0, .035));
      g.add(kit.box(1.9, .36, .06, steel, 0, .9, .43, .015));
      g.add(face(1.66, .34, portTex(kit, 'ports2x12', 2, 12, '24P SWITCH'), 0, 1.06, .472));
      for (let i = 0; i < 10; i++) led(i % 4 === 2 ? 0xffb23d : 0x2fe08a, -.74 + i * .164, 1.24, .48, .052);
      const top = new THREE.Mesh(kit.geo('swtop', () => new THREE.PlaneGeometry(1.56, .76)), kit.cmat('swtopm', {map: ventTex(kit, 'vent10', 10, '#626d82'), roughness: .42, metalness: .55}));
      top.rotation.x = -Math.PI / 2; top.position.set(0, 1.305, 0); g.add(top);
    } else if (node === 'router') {
      g.add(kit.box(1.18, .82, .74, dark, 0, 0, 0, .025));
      g.add(kit.box(1.38, .38, .88, kit.cmat('routerBody', {color: 0x384357, roughness: .32, metalness: .48}, true), 0, .82, 0, .045));
      g.add(kit.box(1.32, .1, .84, steel, 0, 1.16, 0, .02));
      g.add(face(1.22, .24, portTex(kit, 'ports1x5', 1, 5, 'WAN  LAN'), 0, .98, .448));
      [-.52, 0, .52].forEach((x, i) => {
        const a = new THREE.Group(); a.position.set(x, 1.22, -.32); a.rotation.z = (i - 1) * -.14; g.add(a);
        a.add(kit.cyl(.065, .065, .12, steel, 0, 0, 0, 12)); a.add(kit.cyl(.038, .038, .58, pl, 0, .08, 0, 12)); a.add(kit.cyl(.045, .045, .08, steel, 0, .64, 0, 12));
      });
      for (let i = 0; i < 4; i++) led(i === 3 ? 0xffb23d : 0x2fe08a, -.38 + i * .18, 1.12, .45, .052);
      leds.push(kit.led(g, 0x2fe08a, .46, 1.0, .45, .09, true));
    } else if (node === 'dns') {
      g.add(kit.box(1.96, 2.68, 1.28, kit.cmat('dnsBody', {color: 0x56657e, roughness: .35, metalness: .65}), 0, 0, 0, .05));
      g.add(kit.box(2.04, .14, 1.34, steel, 0, 0, 0, .02));
      g.add(kit.box(1.84, .14, 1.16, steel, 0, 2.68, 0, .03));
      g.add(face(1.68, 2.12, bayTex(kit, 'bays4x2', 4, 2), 0, 1.4, .65));
      for (let i = 0; i < 4; i++) led(i % 2 ? 0x2fe08a : 0x4fb3ff, .72, 2.28 - i * .5, .66, .065);
      [[-.82, -.5], [.82, -.5], [-.82, .5], [.82, .5]].forEach(([x, z]) => g.add(kit.cyl(.08, .08, .06, rub, x, -.05, z, 8)));
    } else {
      const fm = kit.cmat('rackFrame', {color: 0x5c677b, roughness: .34, metalness: .78});
      [[-1.08, -.64], [1.08, -.64], [-1.08, .64], [1.08, .64]].forEach(([x, z]) => g.add(kit.box(.12, 3.52, .12, fm, x, 0, z, .02)));
      g.add(kit.box(2.36, .12, 1.44, steel, 0, 3.48, 0, .025)); g.add(kit.box(2.38, .14, 1.46, steel, 0, 0, 0, .025));
      g.add(kit.box(.06, 3.34, 1.24, gr, -1.04, .12, 0, .01)); g.add(kit.box(.06, 3.34, 1.24, gr, 1.04, .12, 0, .01));
      g.add(kit.box(2.02, 3.34, .08, kit.cmat('rackBack', {color: 0x262d3b, roughness: .65, metalness: .3}), 0, .12, -.56, .01));
      const unit = (y, h, mat) => g.add(kit.box(2.02, h, 1.06, mat, 0, y, 0, .025));
      unit(.18, .48, lightC); g.add(face(1.82, .34, ventTex(kit, 'vent4', 4), 0, .42, .542));
      unit(.74, .88, gr); g.add(face(1.82, .72, bayTex(kit, 'bays2x4', 2, 4), 0, 1.18, .542));
      unit(1.7, .88, gr); g.add(face(1.82, .72, bayTex(kit, 'bays2x4', 2, 4), 0, 2.14, .542));
      unit(2.64, .32, steel); g.add(face(1.84, .24, portTex(kit, 'patch1x8', 1, 8, 'PATCH'), 0, 2.8, .542));
      unit(3.02, .42, lightC); g.add(face(1.82, .28, ventTex(kit, 'vent4', 4), 0, 3.23, .542));
      [.52, 1.18, 1.86].forEach((y, i) => { led(0x2fe08a, -.8, y + .52, .55, .07); led(i === 1 ? 0xffb23d : 0x4fb3ff, -.64, y + .52, .55, .07); });
      led(0x2fe08a, -.8, 3.18, .55, .07);
      [[-.65, 0xff6fb5], [-.22, 0x35d0ff], [.22, 0x5eeaa5], [.65, 0xffa24d]].forEach(([x, hex], i) => {
        const y = 2.78, c = new THREE.CatmullRomCurve3([V([x, y, .58]), V([x, y - .1, .8]), V([x + (i % 2 ? .08 : -.08), y - .48, .88]), V([x + .02, y - .9, .62])]);
        const t = new THREE.Mesh(new THREE.TubeGeometry(c, 20, .032, 6), kit.own({color: hex, roughness: .52, metalness: 0})); t.castShadow = true; g.add(t);
      });
    }
    const p = POS[node]; g.position.set(p[0], p[1], p[2]);
    g.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    g.userData.home = g.position.clone();
    scene.add(g);
    const b = new THREE.Mesh(blobGeo, blobMat); b.scale.set(node === 'client' ? 4.4 : node === 'server' ? 3.6 : 3.2, 1, 2.8); b.position.set(p[0], .015, p[2]); blobs.add(b);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({map: labelTexture(NAMES[node], 'OK', false), depthTest: false, transparent: true, toneMapped: false}));
    label.renderOrder = 10; label.userData.node = node; scene.add(label);

    const leaderMat = new THREE.MeshBasicMaterial({color: 0x53e0a6, depthTest: false, toneMapped: false});
    const leader = new THREE.Mesh(kit.cylGeo(.085, .085, 1, 8), leaderMat); leader.renderOrder = 9; leader.frustumCulled = false; scene.add(leader);
    const leaderDot = new THREE.Mesh(kit.sphereGeo(.16, 10), leaderMat); leaderDot.renderOrder = 9; leaderDot.position.set(p[0], TOP[node], p[2]); scene.add(leaderDot);

    const beacon = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.22, .42, 4), new THREE.MeshStandardMaterial({color: 0xff4040, emissive: 0xff2020, emissiveIntensity: 1.8, roughness: .4}));
    cone.rotation.x = Math.PI; beacon.add(cone);
    const bg = new THREE.Sprite(kit.glowMat(0xff3030)); bg.scale.set(.65, .65, 1); beacon.add(bg);
    beacon.visible = false; scene.add(beacon);

    const bb = new THREE.Box3().setFromObject(g), bs = bb.getSize(new THREE.Vector3()), bc = bb.getCenter(new THREE.Vector3());
    const gy = Math.max(bs.y + .16, .58), boxG = new THREE.BoxGeometry(bs.x * 1.05, gy * 1.04, bs.z * 1.05), edges = new THREE.EdgesGeometry(boxG); boxG.dispose();
    const ghostR = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({color: 0xff2a2a, transparent: true, opacity: .95, toneMapped: false}));
    const ghostC = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({color: 0x39e6ff, transparent: true, opacity: .95, toneMapped: false}));
    const bars = [0, 1, 2].map((i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(bs.x * 1.25, .16), new THREE.MeshBasicMaterial({color: i === 1 ? 0x39e6ff : 0xff2a2a, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false})); m.position.z = bs.z / 2 + .08; return m; });
    const gl = new THREE.Group(); gl.add(ghostR, ghostC, ...bars); gl.position.set(bc.x, gy / 2, bc.z); bs.y = gy; gl.visible = false; scene.add(gl);
    const decal = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.55, 40), new THREE.MeshBasicMaterial({color: 0xff2a2a, transparent: true, opacity: .85, side: THREE.DoubleSide, toneMapped: false}));
    decal.rotation.x = -Math.PI / 2; decal.position.set(p[0], .03, p[2]); decal.visible = false; scene.add(decal);
    const N = 22, sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const sparks = new THREE.Points(sg, new THREE.PointsMaterial({size: .14, color: 0xffb347, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true}));
    sparks.visible = false; sparks.frustumCulled = false; scene.add(sparks);
    const life = Array.from({length: N}, (_, i) => (i * 0.137) % 1);
    return {node, group: g, label, leader, leaderMat, leaderDot, beacon, gl, glU: {bs, ghostR, ghostC, bars}, decal, sparks, life, leds, text: '', bad: null, order: ORDER.indexOf(node), extras: [label, leader, leaderDot, beacon, gl, decal, sparks]};
  }

  // ---------------- link cable trays, sagging patterned rubber tubes & molded RJ45 connectors ----------------
  function buildLink(key, broken) {
    const Lk = LINKS[key], grp = new THREE.Group(), rawPts = Lk.pts.map(V);
    const tex = lanePattern(kit, 'lane|' + key, Lk.hex, Lk.pat);
    const laneM = kit.own({map: tex, color: 0xffffff, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0, roughness: .36, metalness: .04});
    const trayM = kit.mat('tray');
    for (let i = 0; i < rawPts.length - 1; i++) {
      const a = rawPts[i].clone().setY(0), b = rawPts[i + 1].clone().setY(0), dir = b.clone().sub(a), len = dir.length();
      const geo = new THREE.PlaneGeometry(len, .16); geo.rotateX(-Math.PI / 2);
      const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * (len / 1.35));
      const lane = new THREE.Mesh(geo, laneM); const c = a.clone().add(b).multiplyScalar(.5);
      lane.position.set(c.x, .028, c.z); lane.rotation.y = -Math.atan2(dir.z, dir.x); lane.receiveShadow = true; grp.add(lane);
      const rg = new THREE.Group(); rg.position.set(c.x, 0, c.z); rg.rotation.y = lane.rotation.y; grp.add(rg);
      rg.add(kit.box(len + .08, .035, .64, trayM, 0, 0, 0, .008));
    }
    const path = [];
    for (let i = 0; i < rawPts.length - 1; i++) {
      const a = rawPts[i], b = rawPts[i + 1], d = a.distanceTo(b), sag = Math.min(.32, .12 + d * .048);
      for (let k = 0; k < 8; k++) {
        const t = k / 8, p = a.clone().lerp(b, t);
        p.y = THREE.MathUtils.lerp(a.y, b.y, t) - sag * Math.sin(Math.PI * t);
        p.y = Math.max(.22, p.y);
        path.push(p);
      }
      const mid = a.clone().lerp(b, .5);
      const standH = Math.max(.24, THREE.MathUtils.lerp(a.y, b.y, .5) - sag);
      grp.add(kit.cyl(.032, .042, standH, trayM, mid.x, 0, mid.z, 8));
      const saddle = new THREE.Mesh(kit.geo('hook', () => new THREE.TorusGeometry(.14, .028, 6, 14)), trayM);
      saddle.position.set(mid.x, standH + .05, mid.z); saddle.rotation.y = Math.PI / 2; saddle.castShadow = true; grp.add(saddle);
    }
    path.push(rawPts[rawPts.length - 1].clone());
    const curve = new THREE.CatmullRomCurve3(path, false, 'centripetal');
    // Physical contrasting collars carry the link pattern even when texture detail is subpixel.
    const collarMat = kit.own({color: 0xf8fafc, roughness:.5, metalness:.08});
    const collars=[];
    const spacing = Lk.pat === 'dash' ? .75 : .95;
    for(let dist=.42;dist<curve.getLength()-.3;dist+=spacing) {
      const u=dist/curve.getLength(), p=curve.getPointAt(u), tangent=curve.getTangentAt(u);
      const collar=new THREE.Mesh(new THREE.CylinderGeometry(.265,.265,Lk.pat === 'dash' ? .36 : .16,Lk.pat === 'diamond' ? 4 : 12),collarMat);
      collar.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tangent);collar.position.copy(p);collar.castShadow=true;grp.add(collar);collars.push(collar);
    }
    const jktTex = cableJacketTex(kit, key, Lk.hex, Lk.pat);
    const rubber = kit.own({map: key === 'switch|dns' ? null : jktTex, color: key === 'switch|dns' ? 0x7624d6 : 0xffffff, roughness: .65, metalness: .04, emissiveMap: jktTex, emissive: new THREE.Color(Lk.hex), emissiveIntensity: 0}, true);
    rubber.sheen = .35; rubber.sheenRoughness = .75;
    const mats = [rubber];

    const plug = (p, tangent, faulted = false) => {
      const pg = new THREE.Group(); pg.position.copy(p);
      const dir = tangent.clone().setY(0); if (dir.lengthSq() < .001) dir.set(1, 0, 0); dir.normalize();
      pg.rotation.y = -Math.atan2(dir.z, dir.x);
      const bootMat = faulted
        ? kit.own({color: 0xff3b3b, emissive: 0xff2020, emissiveIntensity: 1.1, roughness: .38, metalness: .12})
        : kit.own({color: Lk.hex, emissive: Lk.hex, emissiveIntensity: .28, roughness: .42, metalness: .12});
      pg.add(kit.box(.48, .32, .34, bootMat, -.14, -.16, 0, .05));
      pg.add(kit.box(.14, .36, .38, kit.mat('steelDark'), -.34, -.18, 0, .03));
      pg.add(kit.box(.32, .22, .24, kit.mat('steel'), .18, -.11, 0, .02));
      pg.add(kit.box(.16, .08, .16, kit.mat('brass'), .28, -.03, 0, .01));
      grp.add(pg);
    };
    const first = path[0], lastP = path[path.length - 1];
    const tan0 = path[1].clone().sub(first), tan1 = lastP.clone().sub(path[path.length - 2]);
    if (broken) {
      const n = path.length, splitIdx = Math.floor(n * .36);
      const a = path.slice(0, splitIdx).map((p, idx, arr) => {
        const q = p.clone();
        if (idx > arr.length - 5) q.y = Math.max(.2, q.y - (idx - (arr.length - 5)) * .12);
        return q;
      });
      const b = path.slice(Math.floor(n * .48));
      const hot = kit.own({map: jktTex, color: 0xffb3b3, emissive: 0xff2a2a, emissiveIntensity: .75, roughness: .52, metalness: 0});
      const s1 = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(a), 36, .21, 12), hot); s1.castShadow = true; grp.add(s1);
      const loose = a[a.length - 1];
      plug(loose, a[a.length - 1].clone().sub(a[a.length - 2]), true);
      kit.glow(grp, 0xff3030, .65, loose.x, loose.y + .1, loose.z);
      const far = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(b), 48, .21, 12), rubber); far.castShadow = true; grp.add(far);
      plug(first, tan0, false); plug(lastP, tan1, false); mats.push(hot);
    } else {
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(40, path.length * 4), .21, 12), rubber); tube.castShadow = true; tube.receiveShadow = true; grp.add(tube);
      plug(first, tan0, false); plug(lastP, tan1, false);
    }
    world.add(grp);
    lanes[key] = {grp, laneM, mats, level: 0, broken, mid: curve.getPoint(.5), curve, collars};
  }
  function rebuildCable(broken) {
    const old = lanes['switch|server'];
    if (old) { world.remove(old.grp); kit.disposeTree(old.grp); delete lanes['switch|server']; }
    buildLink('switch|server', broken);
  }

  function clearHops() { hopBadges.forEach((h) => { scene.remove(h); kit.disposeTree(h); }); hopBadges = []; }
  function setStage() {
    anim = null; packet.visible = false; trail.visible = false; trailActive = false; ring.visible = false; clearHops();
    impacts.forEach((i) => { scene.remove(i.g); disposeImpact(i); }); impacts = []; routeSig = '';
    if (world) { scene.remove(world); kit.disposeTree(world); }
    Object.values(devices).forEach((d) => { scene.remove(d.group, ...d.extras); [d.group, ...d.extras].forEach((o) => kit.disposeTree(o)); });
    if (sign) { scene.remove(sign); kit.disposeTree(sign); sign = null; }
    blobs.clear(); kit.clearStage();
    devices = {}; lanes = {};
    world = new THREE.Group(); scene.add(world);

    const fl = new THREE.Mesh(kit.geo('floor', () => new THREE.BoxGeometry(36, .3, 26)), kit.cmat('floorM', {map: floorTex(kit), roughnessMap: floorRough(kit), roughness: .72, metalness: .12, clearcoat: .48, clearcoatRoughness: .28}, true));
    fl.position.set(0, -.15, 1.5); fl.receiveShadow = true; world.add(fl);
    const wMat = kit.cmat('wallM', {map: wallTex(kit), roughness: .62, metalness: .22});
    const wall = new THREE.Mesh(kit.geo('wall', () => new THREE.BoxGeometry(20, 8.5, .35)), wMat);
    wall.position.set(0, 4.25, -5.2); wall.receiveShadow = true; world.add(wall);
    const lWall = new THREE.Mesh(kit.geo('swall', () => new THREE.BoxGeometry(.42, 8.5, 18)), wMat);
    lWall.position.set(-8.65, 4.25, 1.2); lWall.rotation.y = .26; lWall.receiveShadow = true; world.add(lWall);
    const rWall = new THREE.Mesh(kit.geo('swall', () => new THREE.BoxGeometry(.42, 8.5, 18)), wMat);
    rWall.position.set(8.65, 4.25, 1.2); rWall.rotation.y = -.26; rWall.receiveShadow = true; world.add(rWall);
    for (const sx of [-1, 1]) {
      world.add(kit.box(.48, 8.5, .48, kit.mat('steelDark'), sx * 8.2, 0, -4.95, .04));
      world.add(kit.box(.18, 2.2, 3.2, kit.mat('steelDark'), sx * 8.25, 1.6, .8, .03));
    }
    world.add(kit.box(30, .22, .16, kit.mat('steelDark'), 0, 0, -5.0, .02));
    world.add(kit.box(24, .12, .42, kit.mat('tray'), 0, 3.8, -4.85, .02));
    for (let x = -10; x <= 10; x += 2.5) world.add(kit.box(.06, .5, .06, kit.mat('tray'), x, 3.35, -4.85, .01));
    const strip = new THREE.Mesh(kit.geo('strip', () => new THREE.BoxGeometry(22, .06, .04)), kit.own({color: 0x183a4a, emissive: 0x45d2ff, emissiveIntensity: .95}));
    strip.position.set(0, 2.55, -4.98); world.add(strip);
    const pipe = new THREE.Mesh(kit.cylGeo(.1, .1, 24, 12), kit.cmat('pipeM', {color: 0x8e99ad, roughness: .35, metalness: .85})); pipe.rotation.z = Math.PI / 2; pipe.position.set(0, 4.3, -4.8); pipe.castShadow = true; world.add(pipe);

    ORDER.forEach((n) => { devices[n] = buildDevice(n); });
    Object.keys(LINKS).forEach((k) => buildLink(k, false));
    sign = new THREE.Sprite(new THREE.SpriteMaterial({map: signTexture('DNS side path', LINKS['switch|dns'].hex), depthTest: false, transparent: true, toneMapped: false}));
    sign.renderOrder = 10; scene.add(sign);
    const sMat = kit.own({color: LINKS['switch|dns'].hex, emissive: LINKS['switch|dns'].hex, emissiveIntensity: .85, roughness: .35});
    const sGeo = new THREE.CylinderGeometry(.032, .032, 1, 8); sGeo.translate(0, .5, 0);
    const sStem = new THREE.Mesh(sGeo, sMat); world.add(sStem);
    const sDot = new THREE.Mesh(new THREE.SphereGeometry(.095, 10, 8), sMat); world.add(sDot);
    sign.userData.stem = sStem; sign.userData.dot = sDot;
    lastCableState = true; view.routeNodes = []; view.focus = null;
    syncFaults(true);
  }

  function syncFaults(force) {
    if (!world) return;
    const f = view.faults || {}, brokenCable = view.cable === false;
    if (force || brokenCable !== !lastCableState) { rebuildCable(brokenCable); lastCableState = !brokenCable; }
    for (const [n, d] of Object.entries(devices)) {
      const flt = f[n], text = flt ? flt.text : 'OK';
      if (d.text !== text) {
        d.text = text; d.bad = !!flt;
        const old = d.label.material.map; d.label.material.map = labelTexture(NAMES[n], text, !!flt); d.label.material.needsUpdate = true; old && old.dispose();
        d.label.userData.statPx = d.label.material.map.userData.statPx; d.label.userData.namePx = d.label.material.map.userData.namePx;
      }
      d.leaderMat.color.setHex(flt ? 0xff5c5c : 0x53e0a6);
      d.beacon.visible = !!flt; d.gl.visible = !!flt; d.decal.visible = !!flt;
      d.sparks.visible = !!flt && !reducedMotion;
      d.leds.forEach((l) => { const hex = flt ? 0xff2a2a : l.hex; l.mat.emissive.set(hex); l.sprite.material = kit.glowMat(hex); });
    }
  }

  // ---------------- quality ----------------
  function applyQuality(level, note = '') {
    if (!QUALITY[level]) return;
    quality = level; autoNote = note; const q = QUALITY[level];
    renderer.shadowMap.enabled = q.shadows; L.key.castShadow = q.shadows;
    if (L.key.shadow.map) { L.key.shadow.map.dispose(); L.key.shadow.map = null; }
    L.key.shadow.mapSize.set(q.shadowMap || 512, q.shadowMap || 512);
    L.key.shadow.radius = level === 'high' ? 4.5 : 3;
    blobs.visible = true; blobMat.opacity = q.shadows ? .55 : .82;
    kit.setGlowVisible(q.glow); pGlow.visible = q.glow;
    kit.tracked.forEach((m) => { m.needsUpdate = true; });
    packet.traverse((c) => { if (c.material) c.material.needsUpdate = true; });
    resize(); onQuality && onQuality(level, note);
  }
  function settings() {
    return {quality, shadows: !!(renderer.shadowMap.enabled && L.key.castShadow), shadowMapSize: L.key.shadow.mapSize.x, pixelRatio: renderer.getPixelRatio(), glow: pGlow.visible,
      toneMapping: renderer.toneMapping === THREE.ACESFilmicToneMapping ? 'ACESFilmic' : String(renderer.toneMapping), colorSpace: renderer.outputColorSpace, environment: !!scene.environment,
      materialType: 'MeshStandardMaterial', note: autoNote, gpu: detected.info};
  }
  function simulateLowEndFallback(overrideInfo) {
    const det = detectQuality(renderer, overrideInfo || {name: 'SwiftShader Software', maxTexture: 4096});
    if (det.level === 'low') applyQuality('low', `auto: ${det.reason}`);
    return settings();
  }
  function simulateBudgetFallback() {
    budget.reset();
    let firedMed = false;
    for (let i = 0; i < 90; i++) { const m = budget.add(55); if (m) firedMed = m; }
    if (firedMed) applyQuality('low', `auto: median frame ${firedMed.toFixed(0)} ms over budget`);
    return settings();
  }

  function setView(v) { view = {...view, ...v}; syncFaults(false); syncHops(); }
  function setReduced(r) { reducedMotion = !!r; syncFaults(false); }

  function syncHops() {
    const nodes = view.routeNodes || [], sig = nodes.join('>');
    if (sig === routeSig) return; routeSig = sig;
    clearHops();
    for (let i = 0; i < nodes.length - 1; i++) {
      const k = cableKey(nodes[i], nodes[i + 1]), ln = lanes[k]; if (!ln) continue;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: badgeTexture(i + 1), depthTest: false, transparent: true, toneMapped: false}));
      sp.renderOrder = 12; sp.userData.hop = i + 1; sp.userData.at = ln.mid.clone().setY(HANG + .45); sp.position.copy(sp.userData.at); scene.add(sp); hopBadges.push(sp);
    }
  }

  // ---------------- packet travel ----------------
  function cablePoints(a, b) {
    const k = cableKey(a, b); let pts = LINKS[k].pts.map(V);
    if (k.split('|')[0] !== a) pts = pts.reverse();
    const out = [], A = V(POS[a]); A.y = 1.05; out.push(A);
    pts.forEach((p) => out.push(p.clone().setY(Math.max(.55, p.y))));
    const B = V(POS[b]); B.y = 1.05; out.push(B); return out;
  }
  function launch(path, outcome, failNode) {
    return new Promise((resolve) => {
      let pts = [];
      for (let i = 0; i < path.length - 1; i++) pts = pts.concat(cablePoints(path[i], path[i + 1]));
      if (!pts.length) return resolve();
      const segs = []; let len = 0;
      for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); segs.push(l); len += l; }
      anim = {pts, segs, len, d: 0, speed: 4.4, resolve, outcome, path, failNode};
      if (reducedMotion) anim.d = len + 1;
      packet.visible = true; packetLight.intensity = 14;
      trailActive = !reducedMotion; trail.visible = !reducedMotion; trailFade = 1;
      packet.position.copy(pts[0]);
      for (let i = 0; i < TRAIL; i++) { trailPos.set([pts[0].x, pts[0].y, pts[0].z], i * 3); trailCol.fill(0); }
    });
  }
  function posAt(a) { let d = a.d; for (let i = 0; i < a.segs.length; i++) { if (d <= a.segs[i]) return a.pts[i].clone().lerp(a.pts[i + 1], a.segs[i] ? d / a.segs[i] : 1); d -= a.segs[i]; } return a.pts[a.pts.length - 1].clone(); }
  function progressHops() {
    if (!anim) return 0;
    let acc = 0, hops = 0, idx = 0;
    for (let h = 0; h < anim.path.length - 1; h++) {
      const n = cablePoints(anim.path[h], anim.path[h + 1]).length - 1; let hl = 0; for (let i = 0; i < n; i++) hl += anim.segs[idx + i];
      idx += n; if (anim.d >= acc + hl - .001) hops = h + 1; else { hops = h + (anim.d - acc) / hl; break; } acc += hl;
    }
    return hops;
  }
  function litSet() {
    const lit = new Set(), nodes = anim ? anim.path.slice(0, 1 + Math.floor(progressHops())) : view.routeNodes;
    for (let i = 0; i < nodes.length - 1; i++) lit.add(cableKey(nodes[i], nodes[i + 1])); return lit;
  }
  function disposeImpact(o) { o.g.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); }
  function addImpact(node) {
    const p = POS[node], g = new THREE.Group();
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.2, .1, 8, 40), new THREE.MeshBasicMaterial({color: 0xff2a2a, transparent: true, opacity: .95, toneMapped: false})); r.rotation.x = Math.PI / 2; r.position.y = .08; g.add(r);
    const m = new THREE.Sprite(new THREE.SpriteMaterial({map: xTex, depthTest: false, transparent: true, toneMapped: false})); m.renderOrder = 13; m.position.set(0, TOP[node] + .85, 0); g.add(m);
    g.position.set(p[0], 0, p[2]); scene.add(g); impacts.push({g, t: 0, node, x: m, r});
    if (impacts.length > 6) { const o = impacts.shift(); scene.remove(o.g); disposeImpact(o); }
  }
  function endAnim() {
    const a = anim; anim = null; packetLight.intensity = 0;
    if (a.outcome === 'fail') { boom = {node: a.failNode, t: 0}; shake = reducedMotion ? 0 : .5; packet.visible = false; }
    else { boom = null; setTimeout(() => { if (!anim) packet.visible = false; }, reducedMotion ? 0 : 350); }
    trailActive = false; a.resolve();
  }

  // Compact attached labels positioned directly above each device with a 3D leader stem; text >= 12 CSS px at 1280, 390 and 320.
  let labelW = 84;
  const UP_VEC = new THREE.Vector3(0, 1, 0);
  function placeAttachedLabel(d, anchorWorld, wPx, hPx) {
    const v = anchorWorld.clone().project(camera);
    const padX = (wPx / 2 + 3) / cw * 2, padY = (hPx / 2 + 3) / ch * 2;
    v.x = Math.max(-1 + padX, Math.min(1 - padX, v.x));
    v.y = Math.max(-1 + padY, Math.min(1 - padY, v.y));
    d.label.position.copy(v.unproject(camera));
    const wpp = worldPerPx(camera, d.label.position, ch);
    d.label.scale.set(wPx * wpp, hPx * wpp, 1); d.label.userData.wPx = wPx;
    const p = POS[d.node], topY = TOP[d.node];
    const botWorld = d.label.position.clone(); botWorld.y -= (hPx * wpp) * .46;
    const start = new THREE.Vector3(p[0], topY, p[2]);
    const end = new THREE.Vector3(botWorld.x, Math.max(topY + .22, botWorld.y), botWorld.z);
    const dir = end.clone().sub(start), len = Math.max(.2, dir.length());
    d.leader.position.copy(start);
    d.leader.scale.set(1, len, 1);
    d.leader.quaternion.setFromUnitVectors(UP_VEC, dir.normalize());
    d.leaderDot.position.copy(start);
  }
  function fitSprites() {
    const wide = canvas.getBoundingClientRect().width || cw;
    labelW = wide < 500 ? Math.max(64, Math.min(76, wide * .185)) : Math.max(82, Math.min(94, wide * .122));
    const aspect = LH / LW, lhPx = labelW * aspect;
    const anchors = {
      client: new THREE.Vector3(POS.client[0] - .35, TOP.client + 1.25, POS.client[2] - .1),
      switch: new THREE.Vector3(POS.switch[0] - .05, TOP.switch + 1.32, POS.switch[2] + .28),
      router: new THREE.Vector3(POS.router[0] + .12, TOP.router + .78,  POS.router[2] + .28),
      dns:    new THREE.Vector3(POS.dns[0] + .15,    TOP.dns + .92,     POS.dns[2]),
      server: new THREE.Vector3(POS.server[0] + .48, TOP.server + 1.05, POS.server[2])
    };
    for (const n of ORDER) {
      const d = devices[n]; if (!d) continue; const p = POS[n];
      placeAttachedLabel(d, anchors[n], labelW, lhPx);
      d.beacon.position.set(p[0], TOP[n] + .22 + (reducedMotion ? 0 : Math.sin(time * 3) * .06), p[2]);
    }
    hopBadges.forEach((b) => { const wpp = worldPerPx(camera, b.userData.at, ch); b.scale.set(27 * wpp, 27 * wpp, 1); b.userData.wPx = 27; });
    impacts.forEach((i) => { const wp = i.x.getWorldPosition(new THREE.Vector3()), wpp = worldPerPx(camera, wp, ch); i.x.scale.set(28 * wpp, 28 * wpp, 1); });
    if (sign) {
      const w = Math.max(72, labelW * 1.04), h = w * (72 / 256);
      const cableMid = lanes['switch|dns'] ? lanes['switch|dns'].mid.clone() : new THREE.Vector3(-3.15, .56, -1.0);
      const lift = wide < 500 ? 6.15 : 4.8;
      const sv = new THREE.Vector3(cableMid.x - 1.05, lift, cableMid.z).project(camera);
      const padX = (w / 2 + 3) / cw * 2, padY = (h / 2 + 3) / ch * 2;
      sv.x = Math.max(-1 + padX, Math.min(1 - padX, sv.x));
      sv.y = Math.max(-1 + padY, Math.min(1 - padY, sv.y));
      sign.position.copy(sv.unproject(camera));
      const wpp = worldPerPx(camera, sign.position, ch);
      sign.scale.set(w * wpp, h * wpp, 1); sign.userData.wPx = w;
      if (sign.userData.stem && sign.userData.dot) {
        const botW = sign.position.clone(); botW.y -= (h * wpp) * .46;
        const dir = botW.clone().sub(cableMid), len = Math.max(.18, dir.length());
        sign.userData.stem.position.copy(cableMid);
        sign.userData.stem.scale.set(1, len, 1);
        sign.userData.stem.quaternion.setFromUnitVectors(UP_VEC, dir.normalize());
        sign.userData.dot.position.copy(cableMid);
      }
    }
  }

  function update(dt) {
    time += dt;
    if (anim) {
      anim.d = Math.min(anim.len, anim.d + anim.speed * dt);
      const p = posAt(anim); packet.position.copy(p); packetLight.position.copy(p).y += .6;
      if (!reducedMotion) { core.rotation.y += dt * 6; pShell.rotation.x += dt * 3; }
      if (anim.d >= anim.len) endAnim();
    }
    if (trail.visible) {
      for (let i = TRAIL - 1; i > 0; i--) { trailPos[i * 3] = trailPos[(i - 1) * 3]; trailPos[i * 3 + 1] = trailPos[(i - 1) * 3 + 1]; trailPos[i * 3 + 2] = trailPos[(i - 1) * 3 + 2]; }
      trailPos[0] = packet.position.x; trailPos[1] = packet.position.y; trailPos[2] = packet.position.z;
      if (!trailActive) trailFade = Math.max(0, trailFade - dt * 2);
      for (let i = 0; i < TRAIL; i++) { const k = (1 - i / TRAIL) ** 2 * trailFade * .8; trailCol[i * 3] = .3 * k; trailCol[i * 3 + 1] = .95 * k; trailCol[i * 3 + 2] = k; }
      trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.color.needsUpdate = true;
      if (!trailActive && trailFade === 0) trail.visible = false;
    }
    const lit = litSet();
    for (const [k, c] of Object.entries(lanes)) {
      const want = lit.has(k) ? 1 : 0; c.level += (want - c.level) * Math.min(1, dt * 12);
      if (c.level < .01 && want === 0) c.level = 0;
      c.laneM.emissiveIntensity = c.level * .85;
      c.mats.forEach((m, i) => { if (c.broken && i === 1) return; m.emissiveIntensity = c.level * .85; });
    }
    for (const [n, d] of Object.entries(devices)) {
      const bad = d.bad;
      d.group.position.copy(d.group.userData.home);
      d.leds.forEach((l, i) => {
        if (bad) { l.mat.emissiveIntensity = 2.6; l.sprite.visible = pGlow.visible; return; }
        const blink = reducedMotion ? 1 : (Math.sin(time * (3 + i * .7) + i * 2.1) > .55 ? .25 : 1);
        l.mat.emissiveIntensity = 2.2 * blink; l.sprite.visible = pGlow.visible && blink > .5;
      });
      if (bad) {
        d.beacon.children[0].rotation.y = reducedMotion ? 0 : time * 2;
        const u = d.glU;
        if (reducedMotion) { u.ghostR.position.set(.16, 0, 0); u.ghostC.position.set(-.16, 0, 0); u.bars.forEach((b, i) => { b.position.y = (i - 1) * u.bs.y * .3; }); d.decal.material.opacity = .85; }
        else {
          const j = Math.sin(time * 31 + d.order) > .1 ? 1 : -1, big = Math.sin(time * 7 + d.order * 2) > .6;
          u.ghostR.position.set(.2 * j + (big ? .22 : 0), big ? .06 : 0, 0); u.ghostC.position.set(-.2 * j - (big ? .22 : 0), 0, 0);
          u.bars.forEach((b, i) => { b.position.y = ((time * (1.4 + i * .6) + i * .37) % 1 - .5) * u.bs.y * 1.1; b.material.opacity = Math.sin(time * 40 + i) > -.3 ? .85 : .15; });
          d.decal.material.opacity = .55 + Math.sin(time * 9) * .35; if (Math.random() < .3) d.group.position.x += (Math.random() - .5) * .2;
        }
      }
      if (d.sparks.visible) {
        const a = d.sparks.geometry.attributes.position, p = POS[n];
        for (let i = 0; i < d.life.length; i++) { d.life[i] += dt * (.9 + (i % 5) * .2); if (d.life[i] > 1) d.life[i] = 0; const l = d.life[i], ang = i * 2.399; a.setXYZ(i, p[0] + Math.cos(ang) * l * .9, TOP[n] + l * 1.2 - l * l * .6, p[2] + Math.sin(ang) * l * .5); }
        a.needsUpdate = true;
      }
    }
    if (boom) {
      boom.t += dt; const d = devices[boom.node];
      if (d && !reducedMotion) d.group.position.y = Math.max(0, Math.sin(boom.t * 40) * .08 * Math.max(0, 1 - boom.t * 2));
      if (boom.t > .6) boom = null;
    }
    for (let i = impacts.length - 1; i >= 0; i--) {
      const m = impacts[i]; m.t += dt;
      if (!reducedMotion) m.r.scale.setScalar(1 + Math.min(m.t, .6) * 1.5);
      if (m.t > 3) { scene.remove(m.g); disposeImpact(m); impacts.splice(i, 1); }
    }
    const f = view.focus && devices[view.focus];
    ring.visible = !!f;
    if (f) { const p = POS[view.focus]; ring.position.set(p[0], .08, p[2]); ring.scale.setScalar(view.focus === 'dns' || view.focus === 'server' ? .95 : 1.1); ring.material.color.setHex(0xffe066); }
    if (!reducedMotion) { az = Math.sin(time * .25) * .05; shake = Math.max(0, shake - dt); } else { az = 0; shake = 0; }
    placeCamera(); fitSprites();
  }

  function placeCamera() {
    const el = .64, vt = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max(6.8 / vt, 9.2 / (vt * camera.aspect));
    camera.position.set(Math.sin(az) * Math.cos(el) * d + (shake ? (Math.random() - .5) * .25 : 0), Math.sin(el) * d + .95, Math.cos(az) * Math.cos(el) * d + .5);
    camera.lookAt(0, 1.15, -.15); camera.updateMatrixWorld();
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    cw = Math.max(1, Math.floor(r.width)); ch = Math.max(1, Math.floor(r.height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[quality].prCap, 2));
    renderer.setSize(cw, ch, false);
    camera.aspect = cw / ch; camera.updateProjectionMatrix(); placeCamera(); fitSprites();
    renderer.render(scene, camera);
  }
  function render(dt = 0, rawMs = dt * 1000) {
    update(Math.min(.05, dt)); renderer.render(scene, camera);
    if (quality !== 'low' && rawMs > 0) { const med = budget.add(rawMs); if (med) applyQuality('low', `auto: median frame ${med.toFixed(0)} ms over budget`); }
  }
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const realMs = now - last, dt = Math.min(.05, realMs / 1000 || .016); last = now;
    render(dt, realMs);
  }
  function start() { if (running) return; running = true; last = performance.now(); budget.reset(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = Object.values(devices).flatMap((d) => [d.group, d.label]);
    const hit = ray.intersectObjects(targets, true)[0]; if (!hit) return null;
    let o = hit.object; while (o && !o.userData.node) o = o.parent;
    return o ? o.userData.node : null;
  }
  function deviceClientPoint(node, part = 'body') {
    const d = devices[node]; if (!d) return null;
    const p = part === 'label' ? d.label.position.clone() : d.group.userData.home.clone().setY(Math.min(TOP[node], 1.8) * .55);
    return projectToClient(camera, canvas, p);
  }
  function labelMetrics() {
    const rr = canvas.getBoundingClientRect();
    const out = ORDER.filter((n) => devices[n]).map((n) => {
      const d = devices[n], w = d.label.userData.wPx || 0, stat = d.label.userData.statPx || STAT_PX, c = projectToClient(camera, canvas, d.label.position);
      const topC = projectToClient(camera, canvas, new THREE.Vector3(POS[n][0], TOP[n], POS[n][2]));
      const np = d.label.userData.namePx || NAME_PX, h = w * LH / LW;
      return {node: n, title: NAMES[n], wPx: w, namePx: np / LW * w, statusPx: stat / LW * w, x: c.x, y: c.y, l: c.x - w / 2, r: c.x + w / 2, t: c.y - h / 2, b: c.y + h / 2,
        anchorDistPx: Math.hypot(c.x - topC.x, (c.y + h / 2) - topC.y), hasLeader: !!d.leader,
        inside: c.x - w / 2 >= rr.left - 2 && c.x + w / 2 <= rr.right + 2 && c.y - h / 2 >= rr.top - 2 && c.y + h / 2 <= rr.bottom + 2};
    });
    hopBadges.forEach((b) => { const c = projectToClient(camera, canvas, b.position); out.push({node: 'hop' + b.userData.hop, wPx: 27, namePx: 27 * .72, statusPx: 27 * .72, x: c.x, y: c.y, l: c.x - 13.5, r: c.x + 13.5, t: c.y - 13.5, b: c.y + 13.5, inside: true}); });
    if (sign) { const c = projectToClient(camera, canvas, sign.position), w = sign.userData.wPx || 72, h = w * 72 / 256, np = Math.max(12, 42 / 256 * w); out.push({node: 'dns-sign', wPx: w, namePx: np, statusPx: np, x: c.x, y: c.y, l: c.x - w / 2, r: c.x + w / 2, t: c.y - h / 2, b: c.y + h / 2, inside: c.x - w / 2 >= rr.left - 2 && c.x + w / 2 <= rr.right + 2}); }
    return out;
  }
  function dispose() {
    stop(); [packet, trail, ring, blobs].forEach((o) => kit.disposeTree(o));
    if (world) { scene.remove(world); kit.disposeTree(world); }
    Object.values(devices).forEach((d) => [d.group, ...d.extras].forEach((o) => kit.disposeTree(o)));
    impacts.forEach(disposeImpact); blobTex.dispose(); blobMat.dispose(); blobGeo.dispose(); xTex.dispose(); envRT.dispose(); kit.dispose(); renderer.dispose();
  }
  function linkMetrics(key) {
    const link=lanes[key]; if(!link)return null;
    const points=Array.from({length:21},(_,i)=>projectToClient(camera,canvas,link.curve.getPointAt(i/20)));
    const a=projectToClient(camera,canvas,link.curve.getPointAt(.5).add(new THREE.Vector3(.42,0,0)));
    const b=points[10];
    return {points, projectedDiameterPx:Math.hypot(a.x-b.x,a.y-b.y), collarCount:link.collars.length};
  }
  function stats() { return kit.counts(); }
  function shakeNode(n) { boom = {node: n, t: 0}; shake = reducedMotion ? 0 : .3; addImpact(n); }

  // ---- init ----
  detected = detectQuality(renderer);
  applyQuality(initialQuality && QUALITY[initialQuality] ? initialQuality : detected.level, detected.level === 'low' && !initialQuality ? `auto: ${detected.reason}` : '');
  return {shakeNode, setStage, setView, setReduced, setQuality: applyQuality, getQuality: () => quality, settings, simulateLowEndFallback, simulateBudgetFallback, launch, start, stop, resize, render, pick, deviceClientPoint, labelMetrics, dispose, stats, renderer, detected,
    linkMetrics, cameraPos: () => camera.position.toArray(),
    get trailVisible() { return trail.visible; }, get sparksVisible() { return Object.values(devices).some((d) => d.sparks.visible); }, get animating() { return !!anim; },
    get impactCount() { return impacts.length; }, get hopCount() { return hopBadges.length; }, get glitchActive() { return Object.values(devices).some((d) => d.gl.visible); },
    get shadowsOn() { return !!(renderer.shadowMap.enabled && L.key.castShadow); }, get autoNote() { return autoNote; },
    get leaderCount() { return Object.values(devices).filter((d) => d.leader && d.leader.visible).length; },
    get dnsSignHasLeader() { return !!(sign && sign.userData.stem && sign.userData.dot); },
    linkInfo: () => Object.fromEntries(Object.entries(LINKS).map(([k, v]) => [k, {hex: v.hex, pat: v.pat, activeGlow: lanes[k] ? lanes[k].laneM.emissiveIntensity : 0}]))};
}

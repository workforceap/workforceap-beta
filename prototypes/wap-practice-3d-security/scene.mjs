// Firewall Defender 3D: procedural "semi-real" gateway + network diorama.
// Physically based materials, key/fill/rim lights with soft shadows, a code-generated PMREM environment, ACES tone mapping.
// Beveled boxes, cylinders and tubes only; textures are drawn on 2D canvases at runtime. No models, HDRs, CDN or network.
import * as THREE from './vendor/three.module.min.js';
import {QUALITY, createKit, createLights, makeEnvironment, detectQuality, createBudget, canvasTexture, worldPerPx, projectToClient, rng} from './look.mjs';

export const LANES = [-5.4, 0, 5.4];
export const Z_START = -9.4, Z_WALL = 2.6;
const Z_PADS = 5.85;
const zAt = (p) => Z_START + (Z_WALL - Z_START) * p;
const KIND_COLOR = {packet: '#5fe3ff', email: '#fbbf24', login: '#c4a3ff'};
const PAD_INFO = {
  allow: {text: 'ALLOW', sub: 'KEY A', color: 0x165b3c, rim: 0x53e0a6, css: '#5eeaa5'},
  block: {text: 'BLOCK', sub: 'KEY B', color: 0x7a1c24, rim: 0xff5c5c, css: '#ff8a8a'},
  reset: {text: 'RESET', sub: 'KEY R', color: 0x784e12, rim: 0xfbbf24, css: '#fbbf24'}
};

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

function textTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function fit(g, text, maxW, size, minPx = 38) {
  let px = size; g.font = `bold ${px}px system-ui, "Segoe UI", sans-serif`;
  while (g.measureText(text).width > maxW && px > minPx) { px -= 2; g.font = `bold ${px}px system-ui, "Segoe UI", sans-serif`; }
  return px;
}

const LW = 320, LH = 124;
const L1PX = new WeakMap(), L2PX = new WeakMap();
function labelTexture(l1, l2, kind, selected) {
  let u1 = 0, u2 = 0;
  const tex = textTexture(LW, LH, (g, w, h) => {
    g.fillStyle = 'rgba(8,13,28,.94)'; g.beginPath(); g.roundRect(0, 0, w, h, 16); g.fill();
    g.lineWidth = selected ? 10 : 7; g.strokeStyle = selected ? '#ffe066' : KIND_COLOR[kind];
    g.beginPath(); g.roundRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth, 12); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = KIND_COLOR[kind]; u1 = fit(g, l1, w - 20, 68, 58); g.fillText(l1, w / 2, 38);
    g.fillStyle = '#ffffff'; u2 = fit(g, l2, w - 18, 66, 62); g.fillText(l2, w / 2, 92);
  });
  L1PX.set(tex, u1); L2PX.set(tex, u2); return tex;
}
function padTexture(info) {
  let subPx = 0;
  const tex = textTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#070d1c'; g.beginPath(); g.roundRect(0, 0, w, h, 24); g.fill();
    g.lineWidth = 14; g.strokeStyle = info.css; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 18); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = info.css; g.font = 'bold 104px system-ui, sans-serif'; g.fillText(info.text, w / 2, 70, w - 40);
    g.fillStyle = '#182544'; g.beginPath(); g.roundRect(54, 128, w - 108, 108, 16); g.fill();
    g.lineWidth = 5; g.strokeStyle = '#ffffff'; g.beginPath(); g.roundRect(54, 128, w - 108, 108, 16); g.stroke();
    g.fillStyle = '#ffffff'; subPx = fit(g, info.sub, w - 128, 132, 126); g.fillText(info.sub, w / 2, 184, w - 128);
  });
  L2PX.set(tex, subPx); return tex;
}
function gateNameTex(kit) {
  return kit.tex('gwName', 768, 160, (g, W, H) => {
    g.fillStyle = '#070e1f'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#38d0ff'; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, H - 10);
    g.fillStyle = '#6ff3ff'; g.font = 'bold 46px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('UTM SECURITY GATEWAY \u2022 FW-01', W / 2, 54, W - 56);
    g.fillStyle = '#ffffff'; g.font = 'bold 34px ui-monospace, Consolas, monospace';
    g.fillText('FIRST-MATCH POLICY  |  L3-L7 INSPECTION', W / 2, 116, W - 56);
  });
}
function outcomeTagTex(text, good) {
  return textTexture(320, 96, (g, w, h) => {
    g.fillStyle = good ? 'rgba(6,38,26,.95)' : 'rgba(48,6,12,.96)'; g.beginPath(); g.roundRect(0, 0, w, h, 16); g.fill();
    g.lineWidth = 8; g.strokeStyle = good ? '#53e0a6' : '#ff3b3b'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 13); g.stroke();
    g.fillStyle = good ? '#c8ffe6' : '#ffd6d6'; g.font = 'bold 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText((good ? '\u2714 ' : '\u2716 ') + text, w / 2, h / 2 + 2);
  });
}

// ---------------- procedural surface textures ----------------
function floorTex(kit) {
  return kit.tex('floor', 512, 512, (g, W, H) => {
    const r = rng(19); g.fillStyle = '#757e8e'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 8500; i++) { const v = 98 + (r() * 38 | 0); g.fillStyle = `rgb(${v},${v + 4},${v + 10})`; g.fillRect(r() * W, r() * H, 2, 2); }
    g.strokeStyle = 'rgba(28,34,46,.55)'; g.lineWidth = 4; g.strokeRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 1; g.strokeRect(4, 4, W - 8, H - 8);
  }, {repeat: [7, 9], aniso: 8});
}
function floorRough(kit) {
  return kit.tex('floorRough', 256, 256, (g, W, H) => {
    const r = rng(23); g.fillStyle = '#787878'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2400; i++) { const v = 80 + (r() * 80 | 0); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * W, r() * H, 3, 3); }
  }, {srgb: false, repeat: [7, 9]});
}
function wallTex(kit) {
  return kit.tex('wall', 512, 256, (g, W, H) => {
    g.fillStyle = '#3b4456'; g.fillRect(0, 0, W, H);
    for (let x = 0; x < 4; x++) {
      const px = x * 128, gr = g.createLinearGradient(px, 0, px + 128, H); gr.addColorStop(0, '#505c73'); gr.addColorStop(1, '#3d4759'); g.fillStyle = gr; g.fillRect(px + 3, 3, 122, H - 6);
      g.fillStyle = '#232936'; g.fillRect(px, 0, 3, H); g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(px + 3, 3, 122, 2);
    }
    g.fillStyle = '#232936'; g.fillRect(0, H / 2 - 1, W, 3);
  }, {repeat: [5, 1]});
}
function ventTex(kit, key, slots, bg = '#161a23') {
  return kit.tex(key, 256, 128, (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H); const gap = H / slots;
    for (let i = 0; i < slots; i++) { g.fillStyle = '#05070b'; g.beginPath(); g.roundRect(14, i * gap + gap * .28, W - 28, gap * .44, 4); g.fill(); }
  });
}
function portTex(kit, key, cols, label) {
  return kit.tex(key, 512, 128, (g, W, H) => {
    g.fillStyle = '#1a2030'; g.fillRect(0, 0, W, H); g.fillStyle = '#2d3752'; g.fillRect(0, 0, W, 6);
    const px = 18, pw = (W - 2 * px) / cols;
    for (let c = 0; c < cols; c++) {
      const x = px + c * pw + 3, y = 20, w = pw - 6, ph = 48;
      g.fillStyle = '#9aa3b2'; g.fillRect(x - 2, y - 2, w + 4, ph + 4);
      g.fillStyle = '#06080c'; g.fillRect(x, y, w, ph);
      g.fillStyle = '#c9a54a'; for (let k = 0; k < 5; k++) g.fillRect(x + 2 + k * ((w - 4) / 5), y + ph - 8, 2, 6);
    }
    g.fillStyle = '#8fa0c9'; g.font = 'bold 22px system-ui,sans-serif'; g.fillText(label, 20, H - 12);
  });
}
function bayTex(kit) {
  return kit.tex('bays', 256, 256, (g, W, H) => {
    g.fillStyle = '#10131b'; g.fillRect(0, 0, W, H);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
      const x = c * 128 + 8, y = r * 85 + 6;
      g.fillStyle = '#3a4152'; g.beginPath(); g.roundRect(x, y, 112, 72, 5); g.fill();
      g.fillStyle = '#1b202c'; g.fillRect(x + 8, y + 8, 86, 56);
      g.fillStyle = '#8c95aa'; g.fillRect(x + 98, y + 10, 6, 52);
    }
  });
}
function screenTex(kit) {
  return kit.tex('screen', 512, 320, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#103b7a'); gr.addColorStop(1, '#081e42'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = '#eef3ff'; g.fillRect(36, 26, 300, 200); g.fillStyle = '#203b6b'; g.fillRect(36, 26, 300, 28);
    g.fillStyle = '#fff'; g.font = 'bold 16px system-ui,sans-serif'; g.fillText('SOC CONSOLE', 48, 45);
    g.fillStyle = '#53e0a6'; g.fillRect(52, 72, 120, 14); g.fillStyle = '#9db3e6'; for (let i = 0; i < 5; i++) g.fillRect(52, 100 + i * 22, 160 + ((i * 53) % 90), 8);
  });
}
function keysTex(kit) {
  return kit.tex('keys', 512, 160, (g, W, H) => {
    g.fillStyle = '#12151c'; g.fillRect(0, 0, W, H);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 14; c++) { g.fillStyle = '#2a3042'; g.fillRect(8 + c * 35, 8 + r * 30, 30, 25); }
    g.fillStyle = '#2a3042'; g.fillRect(8 + 3 * 35, 8 + 4 * 30, 8 * 35 - 5, 25);
  });
}
function barrierTex(kit) {
  return kit.tex('barrier', 512, 128, (g, W, H) => {
    const gr = g.createLinearGradient(0, H, 0, 0);
    gr.addColorStop(0, 'rgba(63,210,255,.55)'); gr.addColorStop(.5, 'rgba(63,210,255,.22)'); gr.addColorStop(1, 'rgba(63,210,255,.06)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(130,235,255,.32)'; g.lineWidth = 2;
    for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 16; y < H; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.fillStyle = 'rgba(180,248,255,.8)'; g.fillRect(0, 0, W, 4); g.fillRect(0, H - 5, W, 5);
  }, {repeat: [3, 1]});
}
function envFaceTex(kit, bad) {
  return kit.tex('env|' + (bad ? 'b' : 'g'), 320, 208, (g, W, H) => {
    g.fillStyle = '#fff9eb'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#6b4f2c'; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, H - 10);
    // Tinted upper flap triangle so the postal envelope flap reads immediately at mobile and desktop sizes
    g.fillStyle = '#e7d6b5';
    g.beginPath(); g.moveTo(8, 8); g.lineTo(W / 2, H * .58); g.lineTo(W - 8, 8); g.closePath(); g.fill();
    g.strokeStyle = '#5c3d1e'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(8, 8); g.lineTo(W / 2, H * .58); g.lineTo(W - 8, 8); g.stroke();
    // Bottom fold lines
    g.strokeStyle = '#b89f74'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(8, H - 8); g.lineTo(W * .38, H * .46); g.moveTo(W - 8, H - 8); g.lineTo(W * .62, H * .46); g.stroke();
    // Postage stamp in upper-right corner
    g.fillStyle = bad ? '#e11d48' : '#2563eb'; g.fillRect(W - 56, 18, 38, 44);
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.strokeRect(W - 56, 18, 38, 44);
    // Bold address stripes at bottom
    g.fillStyle = '#334155'; g.fillRect(26, H - 46, 136, 10); g.fillRect(26, H - 28, 98, 9);
    // Center wax seal circle + @ glyph
    g.fillStyle = bad ? '#dc2626' : '#16a34a'; g.beginPath(); g.arc(W / 2, H * .56, 32, 0, 6.3); g.fill();
    g.lineWidth = 5; g.strokeStyle = '#ffffff'; g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 38px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('@', W / 2, H * .56 + 2);
  });
}
function packetTopTex(kit, proto) {
  return kit.tex('pkt|' + proto, 256, 200, (g, W, H) => {
    const isUdp = proto === 'UDP';
    g.fillStyle = '#0f172a'; g.fillRect(0, 0, W, H);
    g.strokeStyle = isUdp ? '#c084fc' : '#38bdf8'; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, H - 10);
    g.fillStyle = isUdp ? '#9333ea' : '#0284c7'; g.fillRect(14, 14, W - 28, 56);
    g.fillStyle = '#ffffff'; g.font = 'bold 42px ui-monospace,Consolas,monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(proto + ' PKT', W / 2, 43);
    g.fillStyle = '#38bdf8';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      g.fillStyle = (r + c) % 2 === 0 ? (isUdp ? '#d8b4fe' : '#7dd3fc') : '#334155';
      g.fillRect(20 + c * 56, 86 + r * 32, 44, 20);
    }
  });
}
function loginCardTex(kit) {
  return kit.tex('lcard', 256, 160, (g, W, H) => {
    g.fillStyle = '#2e1065'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#d8b4fe'; g.lineWidth = 8; g.strokeRect(4, 4, W - 8, H - 8);
    g.fillStyle = '#facc15'; g.beginPath(); g.arc(58, 62, 24, 0, 6.3); g.fill();
    g.beginPath(); g.arc(58, 122, 36, Math.PI, 0); g.fill();
    g.fillStyle = '#ffffff'; g.font = 'bold 30px system-ui,sans-serif'; g.fillText('ID KEY', 112, 58);
    g.fillStyle = '#c4b5fd'; g.fillRect(112, 76, 116, 14); g.fillRect(112, 102, 88, 14);
  });
}

export function createScene(canvas, {reduced, onLost, onQuality, initialQuality}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.32;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onLost && onLost(); });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a3140);
  scene.fog = new THREE.Fog(0x2a3140, 38, 72);
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 100);
  const kit = createKit(renderer);
  const envRT = makeEnvironment(renderer); kit.trackRT(1);
  scene.environment = envRT.texture; scene.environmentIntensity = .95;
  const L = createLights(scene, {bounds: {x: 13, z: 14}, keyPos: [7, 15, 11], target: [0, .5, -2]});
  const barrierLight = new THREE.PointLight(0x3fd2ff, 5, 14, 2); barrierLight.position.set(0, 2.2, Z_WALL); scene.add(barrierLight);

  // Selection ring: solid #ffe066 matching documented yellow ("Selected traffic items have a yellow ring")
  const selRing = new THREE.Mesh(new THREE.TorusGeometry(1.45, .08, 8, 36), new THREE.MeshBasicMaterial({color: 0xffe066, toneMapped: false}));
  selRing.rotation.x = Math.PI / 2; selRing.visible = false; scene.add(selRing);
  const blobTex = canvasTexture(64, 64, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.78)'); gr.addColorStop(.55, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }, {aniso: 1});
  const blobMat = new THREE.MeshBasicMaterial({map: blobTex, transparent: true, opacity: .62, depthWrite: false});
  const blobGeo = new THREE.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
  const blobs = new THREE.Group(); scene.add(blobs);

  let reducedMotion = !!reduced, time = 0, running = false, raf = 0, shake = 0, wallFlash = {t: 0, color: 0x3fd2ff};
  let quality = 'medium', autoNote = '', cw = 1, ch = 1, last = 0, detected = null;
  const budget = createBudget(42);
  const objs = new Map();
  const bursts = [];
  const pads = {};
  const gwLeds = [];
  const camTarget = new THREE.Vector3(0, .55, -3.05);

  // ---------------- static diorama: floor, enclosed walls, cable trays, gateway appliance + barrier, protected racks + analyst desk ----------------
  const world = new THREE.Group(); scene.add(world);
  const steel = kit.mat('steel'), dark = kit.mat('steelDark'), gr = kit.mat('graphite'), lightC = kit.mat('chassisLight'), pl = kit.mat('plastic'), rub = kit.mat('rubber'), trayM = kit.mat('tray');
  const fl = new THREE.Mesh(kit.geo('floor', () => new THREE.BoxGeometry(42, .3, 44)), kit.cmat('floorM', {map: floorTex(kit), roughnessMap: floorRough(kit), roughness: .72, metalness: .12, clearcoat: .48, clearcoatRoughness: .28}, true));
  fl.position.set(0, -.15, -2.5); fl.receiveShadow = true; world.add(fl);
  const wMat = kit.cmat('wallM', {map: wallTex(kit), roughness: .62, metalness: .22});
  const bwall = new THREE.Mesh(kit.geo('bwall', () => new THREE.BoxGeometry(36, 7.5, .35)), wMat);
  bwall.position.set(0, 3.75, -19.2); bwall.receiveShadow = true; world.add(bwall);
  const lWall = new THREE.Mesh(kit.geo('swall', () => new THREE.BoxGeometry(.35, 7.5, 36)), wMat);
  lWall.position.set(-14.6, 3.75, -3.0); lWall.rotation.y = .12; lWall.receiveShadow = true; world.add(lWall);
  const rWall = new THREE.Mesh(kit.geo('swall', () => new THREE.BoxGeometry(.35, 7.5, 36)), wMat);
  rWall.position.set(14.6, 3.75, -3.0); rWall.rotation.y = -.12; rWall.receiveShadow = true; world.add(rWall);
  world.add(kit.box(32, .12, .45, trayM, 0, 4.1, -18.8, .02));

  // Three incoming traffic lanes with metal cable trays and sagging rubber cables running to the gateway
  LANES.forEach((x, li) => {
    const len = Z_WALL - Z_START + 1.2, midZ = (Z_START + Z_WALL) / 2;
    const laneStrip = new THREE.Mesh(kit.geo('laneS', () => new THREE.PlaneGeometry(2.5, len)), kit.cmat('laneM', {color: 0x24365c, emissive: 0x1b427d, emissiveIntensity: .32, roughness: .52, metalness: .2}));
    laneStrip.rotation.x = -Math.PI / 2; laneStrip.position.set(x, .02, midZ); laneStrip.receiveShadow = true; world.add(laneStrip);
    [-1.3, 1.3].forEach((ox) => world.add(kit.box(.08, .09, len, trayM, x + ox, 0, midZ, .01)));
    const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6, z = Z_START + len * t; pts.push(new THREE.Vector3(x + (li - 1) * .18, .12 + (k % 2 ? .02 : .12), z)); }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, .065, 8), rub); tube.castShadow = true; world.add(tube);
  });

  // Prominent Enterprise Security Gateway Appliance at Z_WALL: armored bastion pylons + threshold curb + wide front panel with nameplate, dual port arrays, status LEDs + light barrier
  const chassis = kit.cmat('gwChassis', {color: 0x3b475e, roughness: .32, metalness: .72});
  const accent = kit.cmat('gwAccent', {color: 0x1b669e, roughness: .28, metalness: .55});
  [-8.6, 8.6].forEach((x, side) => {
    world.add(kit.box(1.75, 4.35, 1.55, chassis, x, 0, Z_WALL, .05));
    world.add(kit.box(1.88, .2, 1.66, steel, x, 0, Z_WALL, .02));
    world.add(kit.box(1.88, .18, 1.66, steel, x, 4.25, Z_WALL, .02));
    const vf = new THREE.Mesh(kit.geo('gvf', () => new THREE.PlaneGeometry(1.25, 2.55)), kit.cmat('gvfm', {map: ventTex(kit, 'gwv', 9, '#232c3d'), roughness: .48, metalness: .58}));
    vf.position.set(x, 2.05, Z_WALL + .79); world.add(vf);
    const dir = side ? -1 : 1;
    [1.0, 2.1, 3.2].forEach((y) => {
      const em = new THREE.Mesh(kit.cylGeo(.15, .15, .22, 14), kit.own({color: 0x8ff3ff, emissive: 0x38d0ff, emissiveIntensity: 2.0, roughness: .2}));
      em.rotation.z = Math.PI / 2; em.position.set(x + dir * .9, y, Z_WALL); world.add(em);
    });
    gwLeds.push(kit.led(world, 0x2fe08a, x - .36, 3.85, Z_WALL + .8, .1, true));
    gwLeds.push(kit.led(world, 0x38d0ff, x + .12, 3.85, Z_WALL + .8, .1, true));
    const b = new THREE.Mesh(blobGeo, blobMat); b.scale.set(3.2, 1, 2.9); b.position.set(x, .015, Z_WALL); blobs.add(b);
  });
  world.add(kit.box(16.4, .32, 1.05, dark, 0, 0, Z_WALL, .03));
  world.add(kit.box(18.8, 1.08, 1.38, chassis, 0, 3.42, Z_WALL, .05));
  world.add(kit.box(16.8, .14, 1.44, accent, 0, 3.32, Z_WALL, .02));
  const npMesh = new THREE.Mesh(kit.geo('gwnp', () => new THREE.PlaneGeometry(8.6, 1.15)), kit.cmat('gwnpm', {map: gateNameTex(kit), emissiveMap: gateNameTex(kit), emissive: 0xffffff, emissiveIntensity: .95, roughness: .4, metalness: .1, toneMapped: false}));
  npMesh.position.set(0, 4.38, Z_WALL + .76); npMesh.rotation.x = -.3; world.add(npMesh);
  [-4.4, 4.4].forEach((px, idx) => {
    const pf = new THREE.Mesh(kit.geo('gwpf', () => new THREE.PlaneGeometry(5.6, .52)), kit.cmat('gwpfm' + idx, {map: portTex(kit, 'gwports' + idx, 12, idx === 0 ? 'WAN / TRUNK PORTS 1-12' : 'LAN / DMZ PORTS 13-24'), roughness: .42, metalness: .5}));
    pf.position.set(px, 3.62, Z_WALL + .71); world.add(pf);
  });
  for (let i = 0; i < 12; i++) gwLeds.push(kit.led(world, i % 3 === 0 ? 0x38d0ff : 0x2fe08a, -6.2 + i * 1.12, 3.88, Z_WALL + .72, .08, true));

  const bTex = barrierTex(kit);
  const wallMat = kit.own({map: bTex, color: 0x00d8ff, emissive: 0x00d8ff, emissiveIntensity: 1.0, transparent: true, opacity: .62, roughness: .2, metalness: 0, side: THREE.DoubleSide, toneMapped: false});
  const wallMesh = new THREE.Mesh(kit.geo('barrierG', () => new THREE.PlaneGeometry(15.4, 3.05)), wallMat);
  wallMesh.position.set(0, 1.82, Z_WALL); world.add(wallMesh);
  const beamMat = kit.own({color: 0x2be4ff, emissive: 0x00d8ff, emissiveIntensity: 1.2, roughness: .2, toneMapped: false});
  [.95, 1.85, 2.75].forEach((by) => {
    const bm = new THREE.Mesh(kit.geo('bbeam', () => new THREE.CylinderGeometry(.055, .055, 15.3, 8)), beamMat);
    bm.rotation.z = Math.PI / 2; bm.position.set(0, by, Z_WALL + .05); world.add(bm);
  });

  // Protected network behind the firewall: server racks with drive bays + router with antennas + analyst desk with glowing monitor & keyboard
  const Z_NET = 4.35;
  [-8.3, 8.3].forEach((x) => {
    const r = new THREE.Group(); r.position.set(x, 0, Z_NET); world.add(r);
    r.add(kit.box(2.05, 3.15, 1.35, lightC, 0, 0, 0, .04));
    const bf = new THREE.Mesh(kit.geo('rbf', () => new THREE.PlaneGeometry(1.72, 2.5)), kit.cmat('rbfm', {map: bayTex(kit), roughness: .48, metalness: .5}));
    bf.position.set(0, 1.55, .685); r.add(bf);
    for (let k = 0; k < 3; k++) gwLeds.push(kit.led(r, k === 1 ? 0x4fb3ff : 0x2fe08a, -.68, .75 + k * .75, .69, .07, true));
    const b = new THREE.Mesh(blobGeo, blobMat); b.scale.set(3.2, 1, 2.6); b.position.set(x, .015, Z_NET); blobs.add(b);
  });
  const desk = new THREE.Group(); desk.position.set(-2.0, 0, Z_NET); world.add(desk);
  const wood = kit.cmat('wood', {color: 0xa4784c, roughness: .52, metalness: .04});
  desk.add(kit.box(2.6, .1, 1.25, wood, 0, .82, 0, .02));
  [[-1.15, -.5], [1.15, -.5], [-1.15, .5], [1.15, .5]].forEach(([x, z]) => desk.add(kit.box(.09, .82, .09, dark, x, 0, z, .015)));
  desk.add(kit.cyl(.28, .32, .06, steel, -.2, .92, -.25, 16)); desk.add(kit.box(.11, .45, .09, dark, -.2, .96, -.25, .02));
  const mon = new THREE.Group(); mon.position.set(-.2, 1.68, -.22); mon.rotation.x = -.05; desk.add(mon);
  mon.add(kit.box(1.55, .95, .09, pl, 0, -.47, 0, .03));
  const sm = kit.cmat('screen', {map: screenTex(kit), emissiveMap: screenTex(kit), emissive: 0xffffff, emissiveIntensity: 1.15, roughness: .25, metalness: 0});
  const scr = new THREE.Mesh(kit.geo('scr', () => new THREE.PlaneGeometry(1.42, .82)), sm); scr.position.set(0, -.47, .048); mon.add(scr);
  kit.glow(desk, 0x4fa8ff, 1.5, -.2, 1.2, .05);
  desk.add(kit.box(.92, .04, .3, pl, -.2, .92, .3, .015));
  const kk = new THREE.Mesh(kit.geo('kk', () => new THREE.PlaneGeometry(.86, .26)), kit.cmat('keysM', {map: keysTex(kit), roughness: .5, metalness: .1}));
  kk.rotation.x = -Math.PI / 2; kk.position.set(-.2, .965, .3); desk.add(kk);
  const dBlob = new THREE.Mesh(blobGeo, blobMat); dBlob.scale.set(3.4, 1, 2.2); dBlob.position.set(-2.0, .015, Z_NET); blobs.add(dBlob);
  const rtr = new THREE.Group(); rtr.position.set(2.2, 0, Z_NET); world.add(rtr);
  rtr.add(kit.box(2.1, .58, 1.15, lightC, 0, 0, 0, .05));
  [-.75, .75].forEach((x, i) => { const a = kit.cyl(.05, .05, 1.2, steel, x, .58, -.4, 10); a.rotation.z = i ? -.16 : .16; rtr.add(a); });
  for (let i = 0; i < 4; i++) gwLeds.push(kit.led(rtr, 0x2fe08a, -.55 + i * .35, .42, .59, .06, true));
  const rBlob = new THREE.Mesh(blobGeo, blobMat); rBlob.scale.set(2.8, 1, 2.0); rBlob.position.set(2.2, .015, Z_NET); blobs.add(rBlob);
  world.traverse((c) => { if (c.isMesh && c !== wallMesh) { c.castShadow = true; c.receiveShadow = true; } });

  // ---------------- decision pads as true 3D floor plates (never camera-facing billboards) ----------------
  function setPads(list) {
    Object.values(pads).forEach((p) => { scene.remove(p.group); disposePad(p); });
    for (const k of Object.keys(pads)) delete pads[k];
    const xs = list.length === 3 ? [-4.45, 0, 4.45] : [-3.25, 3.25];
    const pw = list.length === 3 ? 3.52 : 3.95, pd = 2.46;
    const plateW = pw - .22, plateD = pd - .18;
    list.forEach((action, i) => {
      const info = PAD_INFO[action], g = new THREE.Group(); g.userData.pad = action;
      const base = kit.box(pw, .24, pd, kit.own({color: info.color, roughness: .42, metalness: .55}), 0, 0, 0, .04);
      base.castShadow = true; base.receiveShadow = true; g.add(base);
      const rim = kit.box(pw - .14, .08, pd - .14, kit.own({color: info.rim, emissive: info.rim, emissiveIntensity: .48, roughness: .32, metalness: .3}), 0, .24, 0, .02);
      g.add(rim);
      const tex = padTexture(info);
      const plateGeo = new THREE.PlaneGeometry(plateW, plateD);
      const plateMat = kit.own({map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: .4, metalness: 0, toneMapped: false});
      const plate = new THREE.Mesh(plateGeo, plateMat);
      // Sloped 3D floor plate grounded on the floor base, readable from camera, never a vertical billboard
      plate.rotation.x = -Math.PI / 2 + .58;
      plate.position.set(0, .44, -.04);
      plate.userData.pad = action;
      g.add(plate);
      g.position.set(xs[i], 0, Z_PADS); scene.add(g);
      pads[action] = {group: g, plate, tex, x: xs[i], pw, pd, plateW, plateD};
    });
    fitSprites();
  }
  function disposePad(p) { kit.disposeTree(p.group); p.tex && p.tex.dispose(); }

  // ---------------- traffic item meshes (unmistakable 3D packets, tilted postal envelopes, security keys) ----------------
  function buildItemMesh(data) {
    const g = new THREE.Group();
    if (data.kind === 'packet') {
      const c = data.proto === 'UDP' ? 0xc084fc : 0x35d0ff;
      const pkt = new THREE.Group();
      pkt.position.set(0, .92, 0);
      pkt.rotation.x = .62;
      g.add(pkt);
      pkt.add(kit.box(2.58, 1.28, 2.05, kit.own({color: 0x1e293b, roughness: .32, metalness: .62}), 0, -.42, 0, .08));
      pkt.add(kit.box(2.72, .36, 2.18, kit.own({color: c, emissive: c, emissiveIntensity: .95, roughness: .22, metalness: .3}), 0, .18, 0, .04));
      const pt = packetTopTex(kit, data.proto || 'TCP');
      const topFace = new THREE.Mesh(kit.geo('pktF', () => new THREE.PlaneGeometry(2.42, 1.88)), kit.own({map: pt, emissiveMap: pt, emissive: 0xffffff, emissiveIntensity: .42, roughness: .35, metalness: 0}));
      topFace.rotation.x = -Math.PI / 2; topFace.position.set(0, .88, 0); pkt.add(topFace);
      [-.62, 0, .62].forEach((z) => pkt.add(kit.box(2.64, .14, .18, steel, 0, .74, z, .02)));
    } else if (data.kind === 'email') {
      const bad = data.fromDomain && data.claims && !data.fromDomain.includes(data.claims.toLowerCase().replace(/\s+/g, ''));
      const env = new THREE.Group();
      // Large angled postal envelope facing the camera so its cream body, V-flap, stamp, and wax @ seal read clearly even at 320px/390px
      env.position.set(0, .72, 0);
      env.rotation.x = .72;
      g.add(env);
      const borderMat = kit.own({color: bad ? 0xfbbf24 : 0x38bdf8, emissive: bad ? 0xd97706 : 0x0284c7, emissiveIntensity: .45, roughness: .35, metalness: .2});
      env.add(kit.box(3.16, .38, 2.12, borderMat, 0, -.22, 0, .05));
      env.add(kit.box(2.98, .42, 1.96, kit.own({color: 0xfff8e7, roughness: .42, metalness: .02}), 0, -.16, 0, .04));
      const ft = envFaceTex(kit, bad);
      const face = new THREE.Mesh(kit.geo('envF', () => new THREE.PlaneGeometry(2.88, 1.86)), kit.own({map: ft, emissiveMap: ft, emissive: 0xffffff, emissiveIntensity: .38, roughness: .38, metalness: 0}));
      face.rotation.x = -Math.PI / 2; face.position.set(0, .28, 0); env.add(face);
      // Raised dark flap seams survive mobile downsampling (not texture-only detail).
      const seamMat=kit.own({color:0x382515,roughness:.8});
      for(const x of [-1.38,1.38]) {
        const a=new THREE.Vector3(x,.32,-.88), b=new THREE.Vector3(0,.32,.24), d=b.clone().sub(a);
        const seam=new THREE.Mesh(kit.cylGeo(.065,.065,d.length(),8),seamMat);
        seam.position.copy(a.add(b).multiplyScalar(.5));seam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());env.add(seam);
      }
      const seal = new THREE.Mesh(kit.cylGeo(.38, .38, .14, 18), kit.own({color: bad ? 0xdc2626 : 0x16a34a, emissive: bad ? 0xff3b3b : 0x2fe08a, emissiveIntensity: .65, roughness: .28}));
      seal.position.set(0, .33, .14); env.add(seal);
    } else {
      const keyGrp = new THREE.Group();
      keyGrp.position.set(0, .72, 0);
      keyGrp.rotation.x = .72;
      g.add(keyGrp);
      const plinthM = kit.own({color: 0x1e1b4b, emissive: 0x4c1d95, emissiveIntensity: .35, roughness: .38, metalness: .45});
      const m = kit.own({color: 0xfacc15, emissive: 0xf59e0b, emissiveIntensity: .78, roughness: .22, metalness: .68});
      keyGrp.add(kit.box(3.12, .32, 2.04, plinthM, 0, -.22, 0, .05));
      const ct = loginCardTex(kit);
      const cardFace = new THREE.Mesh(kit.geo('lcF', () => new THREE.PlaneGeometry(1.42, .94)), kit.own({map: ct, emissiveMap: ct, emissive: 0xffffff, emissiveIntensity: .38, roughness: .35, metalness: 0}));
      cardFace.rotation.x = -Math.PI / 2; cardFace.position.set(-.68, .18, .38); keyGrp.add(cardFace);
      const ring = new THREE.Mesh(kit.geo('lring', () => new THREE.TorusGeometry(.78, .26, 12, 24)), m);
      ring.rotation.x = Math.PI / 2; ring.position.set(-.68, .24, -.18); keyGrp.add(ring);
      keyGrp.add(kit.box(2.05, .34, .44, m, .32, .12, -.18, .04));
      keyGrp.add(kit.box(.38, .32, .68, m, 1.02, .12, .22, .03));
      keyGrp.add(kit.box(.34, .32, .54, steel, .56, .12, .18, .02));
    }
    g.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    return g;
  }

  function makeObj(it) {
    const group = buildItemMesh(it.data); group.userData.threat = it.id;
    const normTex = labelTexture(it.label.l1, it.label.l2, it.data.kind, false);
    const selTex = labelTexture(it.label.l1, it.label.l2, it.data.kind, true);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({map: normTex, transparent: true, depthTest: false, toneMapped: false}));
    label.renderOrder = 10; label.userData.threat = it.id;
    const leaderMat = new THREE.MeshBasicMaterial({color: 0x5fe3ff, depthTest: false, toneMapped: false});
    const leader = new THREE.Mesh(kit.cylGeo(.095, .095, 1, 8), leaderMat); leader.renderOrder = 9; leader.frustumCulled = false;
    const leaderDot = new THREE.Mesh(kit.sphereGeo(.18, 10), leaderMat); leaderDot.renderOrder = 9;
    const itemBlob = new THREE.Mesh(blobGeo, blobMat); itemBlob.scale.set(2.8, 1, 2.4); blobs.add(itemBlob);
    scene.add(group, label, leader, leaderDot);
    return {id: it.id, group, label, leader, leaderDot, leaderMat, itemBlob, normTex, selTex, sel: false, data: it.data, lane: it.lane, p: it.p, leaving: null, badMarker: null};
  }
  function attachBadMarker(o) {
    if (o.badMarker) return;
    const m = new THREE.Group();
    const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.35, 1.75, 1.85)), new THREE.LineBasicMaterial({color: 0xff2a2a, toneMapped: false}));
    cage.position.y = .88; m.add(cage);
    const barM = new THREE.MeshBasicMaterial({color: 0xff2a2a, toneMapped: false});
    [1, -1].forEach((s) => { const b = new THREE.Mesh(new THREE.BoxGeometry(2.3, .16, .16), barM); b.rotation.z = s * .55; b.position.set(0, .95, .95); m.add(b); });
    o.group.traverse((c) => { if (c.isMesh && c.material && c.material.emissive) { c.material.emissive.setHex(0xff2020); c.material.emissiveIntensity = 1.6; } });
    o.group.add(m); o.badMarker = m;
  }
  function place(o, p) {
    const x = LANES[o.lane + 1], z = zAt(p);
    o.group.position.set(x, .22, z);
    if (o.itemBlob) o.itemBlob.position.set(x, .016, z);
    o.p = p;
  }
  function removeObj(o) {
    scene.remove(o.group, o.label, o.leader, o.leaderDot);
    if (o.itemBlob) blobs.remove(o.itemBlob);
    kit.disposeTree(o.group);
    o.leaderMat.dispose();
    o.normTex.dispose(); o.selTex.dispose(); o.label.material.dispose();
    objs.delete(o.id);
  }
  function sync(items, selectedId) {
    const ids = new Set(items.map((i) => i.id));
    for (const o of [...objs.values()]) if (!ids.has(o.id) && !o.leaving) removeObj(o);
    for (const it of items) {
      let o = objs.get(it.id); if (!o) { o = makeObj(it); objs.set(it.id, o); }
      if (!o.leaving) place(o, it.p);
      const sel = it.id === selectedId;
      if (sel !== o.sel) {
        o.sel = sel;
        o.label.material.map = sel ? o.selTex : o.normTex; o.label.material.needsUpdate = true;
        o.leaderMat.color.setHex(sel ? 0xffe066 : 0x5fe3ff);
      }
    }
    const so = selectedId != null ? objs.get(selectedId) : null;
    selRing.visible = !!so && !so.leaving;
    if (so && !so.leaving) { selRing.position.set(so.group.position.x, .1, so.group.position.z); selRing.scale.setScalar(1.32); selRing.material.color.setHex(0xffe066); }
    fitSprites();
  }

  // ---------------- distinct right vs wrong effects ----------------
  function spawnOutcomeBurst(pos, good, labelText) {
    const color = good ? 0x53e0a6 : 0xff2a2a;
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, good ? .08 : .14, 8, 36), new THREE.MeshBasicMaterial({color, transparent: true, opacity: .95, toneMapped: false}));
    ring.rotation.x = Math.PI / 2; ring.position.set(pos.x, .45, pos.z); g.add(ring);
    let scar = null, pts = null, vel = null;
    if (!good) {
      scar = new THREE.Group(); scar.position.set(pos.x, 1.8, Z_WALL + .08);
      const sr = new THREE.Mesh(new THREE.RingGeometry(.55, 1.35, 28), new THREE.MeshBasicMaterial({color: 0xff2a2a, transparent: true, opacity: .92, side: THREE.DoubleSide, toneMapped: false}));
      scar.add(sr);
      const bm = new THREE.MeshBasicMaterial({color: 0xff2a2a, toneMapped: false});
      [1, -1].forEach((s) => { const b = new THREE.Mesh(new THREE.BoxGeometry(1.9, .18, .08), bm); b.rotation.z = s * .78; scar.add(b); });
      g.add(scar);
    } else {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(.95, 28), new THREE.MeshBasicMaterial({color: 0x3fd2ff, transparent: true, opacity: .45, side: THREE.DoubleSide, toneMapped: false}));
      disc.position.set(pos.x, 1.6, Z_WALL + .06); g.add(disc);
    }
    if (!reducedMotion) {
      const n = 24, geo = new THREE.BufferGeometry(), arr = new Float32Array(n * 3); vel = [];
      for (let i = 0; i < n; i++) { arr.set([pos.x, pos.y + 1, pos.z], i * 3); const a = (i / n) * 6.283; vel.push(new THREE.Vector3(Math.cos(a) * 4.2, 2.2 + (i % 3), Math.sin(a) * 4.2)); }
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      pts = new THREE.Points(geo, new THREE.PointsMaterial({size: .36, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      pts.frustumCulled = false; g.add(pts);
    }
    const tagTex = outcomeTagTex(labelText, good);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({map: tagTex, transparent: true, depthTest: false, toneMapped: false}));
    tag.position.set(pos.x, 3.2, Math.min(Z_WALL, pos.z + 1.5)); tag.renderOrder = 14; g.add(tag);
    scene.add(g);
    bursts.push({g, ring, scar, pts, vel, tag, tagTex, good, t: 0, life: good ? .95 : 1.85});
  }
  function disposeBurst(b) {
    b.g.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
    if (b.tagTex) b.tagTex.dispose();
  }

  function effect(ev) {
    const o = objs.get(ev.id);
    const pos = o ? o.group.position.clone() : new THREE.Vector3(LANES[(ev.lane ?? 0) + 1] || 0, .2, Z_WALL);
    if (ev.type === 'missed') {
      wallFlash = {t: .9, color: 0xff2a2a}; shake = reducedMotion ? 0 : .45;
      if (o) { attachBadMarker(o); o.leaving = {mode: 'wrong', t: 0, dur: reducedMotion ? .35 : 1.1, z0: o.group.position.z}; }
      spawnOutcomeBurst(pos, false, 'TIMED OUT -1\u2665');
      return;
    }
    if (ev.good) {
      wallFlash = {t: .4, color: ev.action === 'reset' ? 0xfbbf24 : 0x53e0a6};
      spawnOutcomeBurst(pos, true, ev.action === 'allow' ? 'ALLOWED' : ev.action === 'reset' ? 'RESET OK' : 'BLOCKED');
      if (o) {
        if (!reducedMotion && ev.action === 'allow') o.leaving = {mode: 'pass', t: 0, dur: .5, z0: o.group.position.z};
        else removeObj(o);
      }
      return;
    }
    wallFlash = {t: .95, color: 0xff2a2a}; shake = reducedMotion ? 0 : .45;
    if (o) { attachBadMarker(o); o.leaving = {mode: 'wrong', t: 0, dur: reducedMotion ? .35 : 1.25, z0: o.group.position.z}; }
    spawnOutcomeBurst(pos, false, 'WRONG CALL -1\u2665');
  }

  // ---------------- screen-space sprite sizing so labels stay >= 12 CSS px AND sit above (never occluding) the 3D meshes ----------------
  // Project actual mesh vertices, not an invented world-height proxy. Excludes labels/effects.
  function bodyBounds(group) {
    group.updateWorldMatrix(true, true);
    let l=Infinity,r=-Infinity,t=Infinity,b=-Infinity;
    group.traverse(m => { if (!m.isMesh || !m.geometry.attributes.position) return;
      const a=m.geometry.attributes.position;
      for(let i=0;i<a.count;i++) { const v=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld);
        const p=projectToClient(camera,canvas,v); l=Math.min(l,p.x);r=Math.max(r,p.x);t=Math.min(t,p.y);b=Math.max(b,p.y); }
    });
    return {l,r,t,b,w:r-l,h:b-t};
  }
  const UP_VEC = new THREE.Vector3(0, 1, 0);
  function fitSprites() {
    const wide = canvas.getBoundingClientRect().width || cw;
    const cardW = wide < 500 ? Math.max(66, Math.min(76, wide * .185)) : Math.max(88, Math.min(106, wide * .135)), cardH = cardW * (LH / LW);
    const itemScale = wide < 500 ? 1.85 : 1.4;
    const gapPx = wide < 500 ? 6 : 12;
    for (const o of objs.values()) {
      o.group.scale.setScalar(itemScale);
      const p = o.group.position, topY = 2.6 * itemScale;
      const bounds = bodyBounds(o.group);
      const topWorld = new THREE.Vector3(p.x, topY, p.z);
      const v = topWorld.clone().project(camera);
      v.y = 1 - (bounds.t - canvas.getBoundingClientRect().top) / ch * 2;
      // Offset the label upward in NDC so its bottom edge stays cleanly above the 3D mesh top at every Z!
      const offsetNdcY = ((cardH * .5 + gapPx) / Math.max(1, ch)) * 2;
      v.y += offsetNdcY;
      const padX = (cardW / 2 + 2) / cw * 2, padY = (cardH / 2 + 1) / ch * 2;
      v.x = Math.max(-1 + padX, Math.min(1 - padX, v.x));
      v.y = Math.max(-1 + padY, Math.min(1 - padY, v.y));
      o.label.position.copy(v.unproject(camera));
      const wpp = worldPerPx(camera, o.label.position, ch);
      o.label.scale.set(cardW * wpp, cardH * wpp, 1);
      o.label.userData.wPx = cardW; o.label.userData.hPx = cardH;
      const botWorld = o.label.position.clone(); botWorld.y -= (cardH * wpp) * .46;
      const start = new THREE.Vector3(p.x, topY, p.z);
      const end = new THREE.Vector3(botWorld.x, Math.max(topY + .18, botWorld.y), botWorld.z);
      const dir = end.clone().sub(start), len = Math.max(.18, dir.length());
      o.leader.position.copy(start);
      o.leader.scale.set(1, len, 1);
      o.leader.quaternion.setFromUnitVectors(UP_VEC, dir.normalize());
      o.leaderDot.position.copy(start);
    }
    // Scale floor-plate depth & slope on narrow mobile screens so the actual projected 3D plate surface renders KEY A/B/R >= 13 CSS px without clamping while keeping >= 14px clearance from canvas bottom and gateway
    const depthScale = wide < 440 ? 1.18 : wide < 700 ? 1.12 : 1.0;
    const heightScale = wide < 440 ? 1.18 : 1.0;
    const tilt = wide < 440 ? .68 : .58;
    const zPos = wide < 440 ? 5.62 : Z_PADS;
    for (const p of Object.values(pads)) {
      p.group.position.z = zPos;
      p.group.scale.set(1, heightScale, depthScale);
      p.plate.rotation.x = -Math.PI / 2 + tilt;
      p.group.updateMatrixWorld(true);
    }
    for (const b of bursts) {
      if (!b.tag) continue;
      const tw = Math.max(88, cardW * .95), th = tw * (96 / 320), wpp = worldPerPx(camera, b.tag.position, ch);
      b.tag.scale.set(tw * wpp, th * wpp, 1);
    }
  }

  // ---------------- quality ladder ----------------
  function applyQuality(level, note = '') {
    if (!QUALITY[level]) return;
    quality = level; autoNote = note; const q = QUALITY[level];
    renderer.shadowMap.enabled = q.shadows; L.key.castShadow = q.shadows;
    if (L.key.shadow.map) { L.key.shadow.map.dispose(); L.key.shadow.map = null; }
    L.key.shadow.mapSize.set(q.shadowMap || 512, q.shadowMap || 512);
    L.key.shadow.radius = level === 'high' ? 4.5 : 3;
    blobs.visible = true; blobMat.opacity = q.shadows ? .55 : .82;
    kit.setGlowVisible(q.glow);
    kit.tracked.forEach((m) => { m.needsUpdate = true; });
    resize(); onQuality && onQuality(level, note);
  }
  function settings() {
    return {quality, shadows: !!(renderer.shadowMap.enabled && L.key.castShadow), shadowMapSize: L.key.shadow.mapSize.x, pixelRatio: renderer.getPixelRatio(), glow: QUALITY[quality].glow,
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

  function update(dt) {
    time += dt;
    if (!reducedMotion && bTex) bTex.offset.y = (time * .35) % 1;
    gwLeds.forEach((l, i) => {
      const blink = reducedMotion ? 1 : (Math.sin(time * (3.2 + (i % 5) * .6) + i * 1.7) > .55 ? .3 : 1);
      l.mat.emissiveIntensity = 2.2 * blink; l.sprite.visible = QUALITY[quality].glow && blink > .5;
    });
    for (const o of [...objs.values()]) {
      if (!reducedMotion && !o.leaving) {
        o.group.rotation.y = o.data.kind === 'email' ? Math.sin(time * 1.6 + o.id) * .28 : o.data.kind === 'login' ? Math.sin(time * 1.8 + o.id) * .35 : time * 1.0;
      } else if (reducedMotion) o.group.rotation.y = 0;
      if (o.leaving) {
        o.leaving.t += dt;
        const k = Math.min(1, o.leaving.t / o.leaving.dur);
        if (o.leaving.mode === 'pass') {
          o.group.position.z = o.leaving.z0 + (Z_WALL + 4 - o.leaving.z0) * k;
          o.group.position.y = .22 + Math.sin(k * Math.PI) * 1.0;
          o.label.material.opacity = 1 - k;
        } else {
          if (!reducedMotion) o.group.position.x = LANES[o.lane + 1] + Math.sin(time * 42) * .22 * (1 - k);
          o.label.material.opacity = Math.max(.2, 1 - k * .8);
        }
        if (k >= 1) removeObj(o);
      }
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]; b.t += dt; const k = Math.min(1, b.t / b.life);
      if (b.pts && b.vel && !reducedMotion) {
        const a = b.pts.geometry.attributes.position;
        for (let j = 0; j < b.vel.length; j++) { a.setXYZ(j, a.getX(j) + b.vel[j].x * dt, a.getY(j) + b.vel[j].y * dt, a.getZ(j) + b.vel[j].z * dt); b.vel[j].y -= 8 * dt; }
        a.needsUpdate = true; b.pts.material.opacity = Math.max(0, 1 - k);
      }
      if (!reducedMotion) b.ring.scale.setScalar(1 + k * 2.5);
      b.ring.material.opacity = Math.max(0, .95 - k);
      if (b.scar) b.scar.children.forEach((c) => { if (c.material) c.material.opacity = Math.max(0, .95 - k * .8); });
      if (k >= 1) { scene.remove(b.g); disposeBurst(b); bursts.splice(i, 1); }
    }
    wallFlash.t = Math.max(0, wallFlash.t - dt);
    wallMat.color.setHex(wallFlash.t > 0 ? wallFlash.color : 0x00d8ff);
    wallMat.emissive.setHex(wallFlash.t > 0 ? wallFlash.color : 0x00d8ff);
    wallMat.opacity = wallFlash.t > 0 ? .72 : .58 + (reducedMotion ? 0 : Math.sin(time * 2) * .04);
    barrierLight.color.setHex(wallFlash.t > 0 ? wallFlash.color : 0x3fd2ff);
    shake = reducedMotion ? 0 : Math.max(0, shake - dt);
    if (selRing.visible) selRing.material.color.setHex(0xffe066);
    placeCamera(); fitSprites();
  }

  function placeCamera() {
    const el = THREE.MathUtils.degToRad(44), vt = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dv = (24.0 * Math.sin(el) + 5.6) / (2 * vt), dh = 13.2 / (2 * vt * camera.aspect);
    const d = Math.max(dv, dh);
    const jx = shake ? (Math.random() - .5) * .45 : 0, jy = shake ? (Math.random() - .5) * .25 : 0;
    camera.position.set(camTarget.x + jx, camTarget.y + Math.sin(el) * d + jy, camTarget.z + Math.cos(el) * d);
    camera.lookAt(camTarget); camera.updateMatrixWorld();
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
  function frame(now) { if (!running) return; raf = requestAnimationFrame(frame); const realMs = now - last, dt = Math.min(.05, realMs / 1000 || .016); last = now; render(dt, realMs); }
  function start() { if (running) return; running = true; last = performance.now(); budget.reset(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = [...[...objs.values()].filter((o) => !o.leaving).flatMap((o) => [o.group, o.label]), ...Object.values(pads).map((p) => p.group)];
    const hit = ray.intersectObjects(targets, true)[0]; if (!hit) return null;
    let o = hit.object;
    while (o && o.userData.threat === undefined && o.userData.pad === undefined) o = o.parent;
    if (!o) return null;
    return o.userData.pad !== undefined ? {pad: o.userData.pad} : {threat: o.userData.threat};
  }
  function labelRect(id) {
    const o = objs.get(id); if (!o) return null;
    const c = projectToClient(camera, canvas, o.label.position);
    const w = o.label.userData.wPx || 100, h = o.label.userData.hPx || 42;
    const l1px = (L1PX.get(o.normTex) || 58) / LW * w, l2px = (L2PX.get(o.normTex) || 62) / LW * w;
    const body = bodyBounds(o.group);
    const mp = {x:(body.l+body.r)/2,y:(body.t+body.b)/2};
    const mTop = {y:body.t}, mBot = {y:body.b};
    return {x: c.x, y: c.y, l: c.x - w / 2, r: c.x + w / 2, t: c.y - h / 2, b: c.y + h / 2, w, h, l1px, l2px,
      meshX: mp.x, meshY: mp.y, meshTopY: mTop.y, meshBotY: mBot.y, meshH: Math.abs(mBot.y - mTop.y),
      clearancePx: mTop.y - (c.y + h / 2), hasLeader: !!o.leader};
  }
  function padPoint(action) {
    const p = pads[action]; if (!p) return null;
    const r = canvas.getBoundingClientRect();
    p.plate.updateWorldMatrix(true, false);
    const centerW = p.plate.localToWorld(new THREE.Vector3(0, 0, 0));
    const topW = p.plate.localToWorld(new THREE.Vector3(0, p.plateD / 2, 0));
    const botW = p.plate.localToWorld(new THREE.Vector3(0, -p.plateD / 2, 0));
    const leftW = p.plate.localToWorld(new THREE.Vector3(-p.plateW / 2, 0, 0));
    const rightW = p.plate.localToWorld(new THREE.Vector3(p.plateW / 2, 0, 0));
    const c = projectToClient(camera, canvas, centerW);
    const topP = projectToClient(camera, canvas, topW);
    const botP = projectToClient(camera, canvas, botW);
    const leftP = projectToClient(camera, canvas, leftW);
    const rightP = projectToClient(camera, canvas, rightW);
    const plateH = botP.y - topP.y;
    const subPx = L2PX.get(p.tex) || 126;
    const keyPx = plateH * (subPx / 256);
    const gwBot = projectToClient(camera, canvas, new THREE.Vector3(p.x, 0, Z_WALL + .35));
    return {x: c.x, y: c.y, l: leftP.x, r: rightP.x, t: topP.y, b: botP.y, plateH, frontBottomY: botP.y, canvasBottom: r.bottom, bottomGapPx: r.bottom - botP.y,
      gatewayGapPx: topP.y - gwBot.y, keyPx, isFloorPlate: !!(p.plate && p.plate.isMesh), hasBillboardSprite: false};
  }
  function setStage() {
    for (const o of [...objs.values()]) removeObj(o);
    bursts.splice(0).forEach((b) => { scene.remove(b.g); disposeBurst(b); });
    selRing.visible = false; shake = 0; wallFlash.t = 0; budget.reset();
  }
  function dispose() {
    stop(); setStage();
    Object.values(pads).forEach((p) => { scene.remove(p.group); disposePad(p); });
    kit.disposeTree(world); kit.disposeTree(selRing); blobTex.dispose(); blobMat.dispose(); blobGeo.dispose(); envRT.dispose(); kit.dispose(); renderer.dispose();
  }
  function stats() { return kit.counts(); }

  detected = detectQuality(renderer);
  applyQuality(initialQuality && QUALITY[initialQuality] ? initialQuality : detected.level, detected.level === 'low' && !initialQuality ? `auto: ${detected.reason}` : '');
  return {setPads, sync, effect, setStage, setReduced(r) { reducedMotion = !!r; }, setQuality: applyQuality, getQuality: () => quality, settings, simulateLowEndFallback, simulateBudgetFallback, start, stop, resize, render, pick, labelRect, padPoint, dispose, stats, renderer, detected,
    get burstCount() { return bursts.length; },
    get burstParticleCount() { return bursts.reduce((n, b) => n + (b.pts ? 1 : 0), 0); },
    get shakeLevel() { return shake; },
    get wrongMarkerCount() { return bursts.filter((b) => !b.good).length + [...objs.values()].filter((o) => !!o.badMarker).length; },
    get rightMarkerCount() { return bursts.filter((b) => b.good).length; },
    get objectCount() { return objs.size; },
    get reduced() { return reducedMotion; },
    get shadowsOn() { return !!(renderer.shadowMap.enabled && L.key.castShadow); },
    get selRingHex() { return '#' + selRing.material.color.getHexString(); },
    get autoNote() { return autoNote; }};
}

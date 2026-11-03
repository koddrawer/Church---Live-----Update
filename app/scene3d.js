// Church Live — chế độ cảnh 3D: nền nhà thờ render sẵn (Cycles) + che khuất bằng hình học thật + nhân vật chibi 3D
import * as THREE from 'three';
import { GLTFLoader } from './lib/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from './lib/jsm/utils/SkeletonUtils.js';
import { OrbitControls } from './lib/jsm/controls/OrbitControls.js';
import { mergeGeometries } from './lib/jsm/utils/BufferGeometryUtils.js';

const CH = window.__church;
const CFGf = () => CH.CFG();
const c3cfg = () => CFGf().scene;
if ((CFGf().scene.mode || '2d') === '3d') start();
else { const iv = setInterval(() => { if ((CFGf().scene.mode || '2d') === '3d') { clearInterval(iv); start(); } }, 1000); }

async function start() {
  const W = 1080, H = 1920, A = 'church://app/assets/3d/';
  const cv = document.getElementById('c3'); cv.style.display = 'block';
  const R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, powerPreference: 'high-performance' });
  R.setPixelRatio(1); R.setSize(W, H, false); R.autoClear = false; R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.NoToneMapping;
  const log = (m, l) => { try { CH.logp(m, l); } catch {} };
  log('Đang tải cảnh 3D…');

  // ---------- nền ----------
  const camJ = await (await fetch(A + 'camera3d.json')).json();
  const texL = new THREE.TextureLoader();
  const plate = await texL.loadAsync(A + 'church_plate.jpg'); plate.colorSpace = THREE.SRGBColorSpace;
  const bgScene = new THREE.Scene(), bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bgMat = new THREE.MeshBasicMaterial({ map: plate, depthWrite: false, depthTest: false, toneMapped: false });
  bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat));

  // ---------- cảnh chính ----------
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(camJ.vfov, W / H, 0.1, 400);
  cam.position.fromArray(camJ.pos); cam.up.fromArray(camJ.up);
  cam.lookAt(new THREE.Vector3().fromArray(camJ.pos).add(new THREE.Vector3().fromArray(camJ.fwd))); cam.updateMatrixWorld();
  scene.add(new THREE.HemisphereLight(0xfff0dc, 0x6a5040, 1.9));
  const key = new THREE.DirectionalLight(0xffe2b8, 1.7); key.position.set(-8, 30, 10); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffd8a8, 0.6); fill.position.set(10, 12, 20); scene.add(fill);
  const B = (x, y, z) => new THREE.Vector3(x, z, -y);   // toạ độ Blender (x, y theo lòng nhà thờ, z cao) → three

  const gl = new GLTFLoader();
  // vật che khuất: ghế, cột, bậc, bàn thờ… chỉ ghi chiều sâu, không vẽ màu
  const occ = await gl.loadAsync(A + 'occluder.glb');
  const occMat = new THREE.MeshBasicMaterial({ colorWrite: false });
  occ.scene.traverse((o) => { if (o.isMesh) { o.material = occMat; o.renderOrder = -10; } });
  scene.add(occ.scene);

  const NAMES = ['Nam_vest', 'Nu_vay_khan_ren', 'Nu_ao_dai', 'Ong', 'Ba', 'Be_trai', 'Be_gai_ruoc_le', 'Cha_su', 'Thien_than'];
  const T = {};
  await Promise.all(NAMES.map(async (n) => { try { T[n] = await gl.loadAsync(A + n + '.glb'); } catch (e) { log('Không tải được ' + n + ': ' + e.message, 'error'); } }));
  const POOL = { f: [['Nu_vay_khan_ren', 4], ['Nu_ao_dai', 4], ['Ba', 1.4], ['Be_gai_ruoc_le', 1]], m: [['Nam_vest', 6], ['Ong', 1.4], ['Be_trai', 1]] };
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };
  function pickModel(p) {
    const g = p.gender === 'f' || p.gender === 'm' ? p.gender : (hash(p.id + 'g') < 0.55 ? 'f' : 'm');
    const list = POOL[g], tot = list.reduce((a, b) => a + b[1], 0); let r = hash(p.id || p.uid) * tot;
    for (const [n, w] of list) { if ((r -= w) <= 0) return n; } return list[0][0];
  }

  function instance(name) {
    const t = T[name]; if (!t) return null;
    const root = skClone(t.scene); const mixer = new THREE.AnimationMixer(root);
    const clips = {}; for (const c of t.animations) clips[c.name] = c;
    let face = null; root.traverse((o) => { if (o.isMesh && /_Mat_avatar$/.test(o.name)) face = o; });
    const g = new THREE.Group(); g.add(root); scene.add(g);
    return { g, root, mixer, clips, face, name, cur: null, act: null, faceSrc: null };
  }
  function play(inst, name, fade = 0.25) {
    if (!inst || inst.cur === name) return;
    const c = inst.clips[name] || inst.clips.Dung; if (!c) return;
    const a = inst.mixer.clipAction(c); a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.play();
    if (inst.act) inst.act.crossFadeTo(a, fade, false);
    inst.act = a; inst.cur = name;
  }
  const letterTex = new Map();
  function setFace(inst, p) {
    if (!inst.face) return;
    const src = p.avatarImg || null; if (inst.faceSrc === (src || 'L')) return;
    let tex;
    if (src) { tex = new THREE.Texture(src); }
    else if (p.filler) { inst.faceSrc = 'L'; return; }
    else {
      const k = (p.name || '?').trim()[0] || '?';
      tex = letterTex.get(p.name);
      if (!tex) {
        const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
        const hue = Math.floor(hash(p.name) * 360); const gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, `hsl(${hue},55%,62%)`); gr.addColorStop(1, `hsl(${(hue + 40) % 360},55%,42%)`);
        x.fillStyle = gr; x.fillRect(0, 0, 256, 256); x.fillStyle = '#fff'; x.font = '700 150px BeVN, "Segoe UI", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(k.toUpperCase(), 128, 138);
        tex = new THREE.CanvasTexture(c); letterTex.set(p.name, tex);
      }
    }
    tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.needsUpdate = true;
    inst.face.material = inst.face.material.clone(); inst.face.material.map = tex; inst.face.material.needsUpdate = true;
    inst.faceSrc = src || 'L';
  }
  function dispose(inst) { scene.remove(inst.g); inst.mixer.stopAllAction(); if (inst.badge) { scene.remove(inst.badge); inst.badge.material.map && inst.badge.material.map.dispose(); inst.badge.material.dispose(); } }
  // huy hiệu avatar tròn nổi trên đầu (camera nhìn từ phía sau nên mặt không thấy)
  function setBadge(inst, p) {
    const key = p.avatarImg ? 'img' : 'L:' + p.name;
    if (inst.badgeKey === key) return;
    const c = document.createElement('canvas'); c.width = c.height = 160; const x = c.getContext('2d');
    x.save(); x.beginPath(); x.arc(80, 80, 66, 0, Math.PI * 2); x.closePath(); x.clip();
    if (p.avatarImg) { const im = p.avatarImg, sq = Math.min(im.width, im.height); x.drawImage(im, (im.width - sq) / 2, (im.height - sq) / 2, sq, sq, 14, 14, 132, 132); }
    else { const hue = Math.floor(hash(p.name) * 360); x.fillStyle = `hsl(${hue},50%,48%)`; x.fillRect(0, 0, 160, 160); x.fillStyle = '#fff'; x.font = '700 80px BeVN, "Segoe UI", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(((p.name || '?').trim()[0] || '?').toUpperCase(), 80, 86); }
    x.restore(); x.lineWidth = 9; x.strokeStyle = '#e8b553'; x.beginPath(); x.arc(80, 80, 70, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 2; x.strokeStyle = '#fff3c4'; x.beginPath(); x.arc(80, 80, 74, 0, Math.PI * 2); x.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    if (!inst.badge) { inst.badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); inst.badge.renderOrder = 5; scene.add(inst.badge); }
    else { inst.badge.material.map.dispose(); inst.badge.material.map = tex; inst.badge.material.needsUpdate = true; }
    inst.badgeKey = key;
  }

  // ---------- hình học chỗ ngồi 3D ----------
  const ROW0 = 4.0, ROWS = 30, ROWD = 1.2, PEW_IN = 1.85, PEW_W = 4.3;
  function seatOf(p) {
    if (p._seat3) return p._seat3;
    const s = p.slot, G = CH.G; let frac = 0.5;
    try { const inner = G.innerL(s.y), outer = Math.max(0, G.outerL(s.y)); const xl = s.side === 'R' ? 2 * G.g.centerX - s.x : s.x; frac = Math.min(1, Math.max(0, (inner - xl) / Math.max(1, inner - outer))); } catch {}
    const nRows = Math.max(1, (G.rows || []).length - 1);
    let r = Math.round((ROWS - 1) - (s.k / nRows) * (ROWS - 1)); r = Math.max(0, Math.min(ROWS - 1, r));
    const side = s.side === 'R' ? 1 : -1;
    p._seat3 = { x: side * (PEW_IN + 0.25 + frac * (PEW_W - 0.5)), y: ROW0 + r * ROWD + 0.02, side };
    return p._seat3;
  }
  const SPOTS = [0, -1.15, 1.15, -2.3, 2.3];
  const floorZ = (y) => y < 41 ? 0 : y < 41.4 ? 0.18 * (y - 41) / 0.4 : y < 41.8 ? 0.18 + 0.18 * (y - 41.4) / 0.4 : y < 42.2 ? 0.36 + 0.18 * (y - 41.8) / 0.4 : 0.54;
  const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- nhân vật cố định: cha sứ, Chúa, thiên thần ----------
  // ---------- camera: góc chính / khi donate / khi vào phòng ----------
  cam.up.set(0, 1, 0);
  const V = (a) => new THREE.Vector3().fromArray(a);
  const DEF = {
    main: { pos: camJ.pos, target: V(camJ.pos).add(V(camJ.fwd).multiplyScalar(30)).toArray(), fov: camJ.vfov },
    donate: { off: [3.4, 2.4, -6.2], look: [0, 1.4, 0], fov: 40 },
    join: { off: [3.2, 2.2, -5.8], look: [0, 1.2, 0], fov: 38 }
  };
  const preset = (k) => { const c = (CFGf().scene.cam3d || {})[k]; return c && (c.pos || c.off) ? c : DEF[k]; };
  const bgMode = () => (CFGf().scene.bg3d === 'model' ? 'model' : 'plate');
  function shotCam(kind, subj, side) {
    const pr = preset(kind), off = V(pr.off), look = V(pr.look);
    if (side > 0) { off.x *= -1; look.x *= -1; }
    return { pos: subj.clone().add(off), target: subj.clone().add(look), fov: pr.fov };
  }
  function applyCam(c) { cam.position.copy(c.pos); cam.fov = c.fov; cam.lookAt(c.target); cam.updateProjectionMatrix(); cam.updateMatrixWorld(); }
  const mainCam = () => { const m = bgMode() === 'plate' ? DEF.main : preset('main'); return { pos: V(m.pos), target: V(m.target), fov: m.fov }; };
  applyCam(mainCam());

  // ---------- nền mô hình 3D thời gian thực (cho phép xoay camera tự do) ----------
  let church = null, churchLoading = false; const modelLights = new THREE.Group(); scene.add(modelLights); modelLights.visible = false;
  modelLights.add(new THREE.AmbientLight(0xffe8cc, 0.55));
  for (const [x, y, z, inten] of [[0, 44, 12, 260], [0, 30, 14, 260], [0, 14, 14, 260], [0, 0, 14, 200], [-9, 20, 9, 120], [9, 20, 9, 120], [0, 47, 4, 80]]) { const l = new THREE.PointLight(0xffd49a, inten, 0, 1.6); l.position.copy(B(x, y, z)); modelLights.add(l); }
  async function loadChurch() {
    if (church || churchLoading) return; churchLoading = true; log('Đang tải mô hình nhà thờ 3D (camera tự do)…');
    try {
      const g = await gl.loadAsync(A + 'church_model.glb'); g.scene.updateMatrixWorld(true);
      const groups = new Map(), keep = [];
      g.scene.traverse((o) => { if (!o.isMesh) return; const k = o.material.uuid; if (!groups.has(k)) groups.set(k, { m: o.material, geos: [] }); const ge = o.geometry.clone(); ge.applyMatrix4(o.matrixWorld); for (const n of Object.keys(ge.attributes)) if (!['position', 'normal', 'uv'].includes(n)) ge.deleteAttribute(n); groups.get(k).geos.push(ge); });
      church = new THREE.Group();
      for (const { m, geos } of groups.values()) {
        const ok = geos.filter((x) => x.attributes.normal && x.attributes.uv), rest = geos.filter((x) => !(x.attributes.normal && x.attributes.uv));
        if (m.emissiveMap) m.emissiveIntensity = Math.max(m.emissiveIntensity, 1.6);
        let merged = null; try { merged = ok.length ? mergeGeometries(ok.map((x) => x.index ? x.toNonIndexed() : x), false) : null; } catch { merged = null; }
        if (merged) church.add(new THREE.Mesh(merged, m)); else ok.forEach((x) => church.add(new THREE.Mesh(x, m)));
        rest.forEach((x) => church.add(new THREE.Mesh(x, m)));
      }
      scene.add(church); log('Mô hình nhà thờ 3D đã sẵn sàng (' + church.children.length + ' khối).');
    } catch (e) { log('Không tải được mô hình nhà thờ: ' + e.message, 'error'); }
    churchLoading = false;
  }

  // ---------- chỉnh camera bằng chuột ----------
  let edit = null, ctrl = null, joinShot = null, lastJoinShot = -99, preview = null;
  const hint = document.createElement('div');
  hint.style.cssText = 'position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:9;background:rgba(20,12,4,.82);color:#ffe3a0;font:600 14px BeVN,Segoe UI,sans-serif;padding:8px 14px;border-radius:10px;border:1px solid #e8b553;display:none;text-align:center;pointer-events:none';
  document.body.appendChild(hint);
  const sampleSeat = { x: -3.1, y: ROW0 + 18 * ROWD + 0.02, side: -1 };
  function editSubject(which) {
    if (!edit.dummy) { edit.dummy = instance('Nam_vest'); }
    const d = edit.dummy, S = scaleOf();
    if (which === 'donate') { d.g.position.copy(B(sampleSeat.x, sampleSeat.y + 0.62, 0)); d.g.rotation.y = Math.PI; play(d, 'Dung'); }
    else { d.g.position.copy(B(sampleSeat.x, sampleSeat.y, 0.47 - 0.04 * S)); d.g.rotation.y = Math.PI; play(d, 'Ngoi_cau_nguyen'); }
    d.g.scale.setScalar(S); d.g.visible = true; return d.g.position.clone();
  }
  const LBL = { main: 'GÓC CHÍNH', donate: 'GÓC KHI DONATE', join: 'GÓC KHI VÀO PHÒNG' };
  function startEdit(which) {
    if (bgMode() !== 'model') { CH.api && 0; window.api && window.api.getConfig().then((raw) => { raw.scene = { ...(raw.scene || {}), bg3d: 'model' }; return window.api.setConfig({ scene: raw.scene }); }); log('Chuyển nền 3D sang "Mô hình 3D thời gian thực" để xoay camera tự do.'); loadChurch(); }
    if (!ctrl) { ctrl = new OrbitControls(cam, document.getElementById('c')); ctrl.enableDamping = true; ctrl.dampingFactor = 0.12; ctrl.screenSpacePanning = true; ctrl.maxDistance = 120; }
    edit = edit && edit.dummy ? { which, dummy: edit.dummy } : { which };
    let c;
    if (which === 'main') { const m = preset('main'); c = { pos: V(m.pos), target: V(m.target), fov: m.fov }; if (edit.dummy) edit.dummy.g.visible = false; edit.subj = null; }
    else { const subj = editSubject(which); edit.subj = subj; c = shotCam(which, subj, -1); }
    applyCam(c); ctrl.target.copy(c.target); ctrl.enabled = true; ctrl.update();
    hint.innerHTML = '🎥 Đang chỉnh <b>' + LBL[which] + '</b> — chuột trái: xoay · chuột phải: dời · lăn: tiến/lùi<br>Xong bấm "Lưu góc đang chỉnh" trong Bảng điều khiển'; hint.style.display = 'block';
    window.api && window.api.toPanel({ type: 'cam-fov', fov: cam.fov });
  }
  function stopEdit() { edit && edit.dummy && (edit.dummy.g.visible = false); edit = null; if (ctrl) ctrl.enabled = false; hint.style.display = 'none'; applyCam(mainCam()); }
  async function saveEdit() {
    if (!edit) { log('Chưa bật chỉnh camera.', 'warn'); return; }
    const which = edit.which; let data;
    if (which === 'main') data = { pos: cam.position.toArray(), target: ctrl.target.toArray(), fov: cam.fov };
    else data = { off: cam.position.clone().sub(edit.subj).toArray(), look: ctrl.target.clone().sub(edit.subj).toArray(), fov: cam.fov };
    const raw = await window.api.getConfig(); raw.scene = { ...(raw.scene || {}) }; raw.scene.cam3d = { ...(raw.scene.cam3d || {}), [which]: data };
    await window.api.setConfig({ scene: raw.scene }); log('Đã lưu ' + LBL[which].toLowerCase() + '.');
  }
  async function resetCam(which) {
    const raw = await window.api.getConfig(); raw.scene = { ...(raw.scene || {}) }; const c = { ...(raw.scene.cam3d || {}) }; delete c[which]; raw.scene.cam3d = c;
    await window.api.setConfig({ scene: raw.scene }); log('Đã trả ' + LBL[which].toLowerCase() + ' về mặc định.');
    setTimeout(() => { if (edit && edit.which === which) startEdit(which); else if (!edit) applyCam(mainCam()); }, 200);
  }
  function cmd(m) {
    if (m.type === 'cam-edit') startEdit(m.which || 'main');
    else if (m.type === 'cam-edit-off') stopEdit();
    else if (m.type === 'cam-save') saveEdit();
    else if (m.type === 'cam-reset') resetCam(m.which || (edit && edit.which) || 'main');
    else if (m.type === 'cam-fov') { cam.fov = clamp(+m.fov || 45, 10, 120); cam.updateProjectionMatrix(); }
    else if (m.type === 'cam-preview') {
      if (edit) stopEdit();
      const ps = CH.people.filter((p) => !p.filler && p.state === 'seated' && !p.leaving && INST.has(p.uid));
      const p = ps[Math.floor(Math.random() * ps.length)];
      if (!p) { log('Chưa có ai ngồi để xem thử camera — bấm "Thêm người xem" trước.', 'warn'); return; }
      preview = { kind: m.which === 'donate' ? 'donate' : 'join', p, start: CH.now() };
    }
  }
  const priest = instance('Cha_su'); if (priest) { priest.g.position.copy(B(0, 48.1, 0.54)); play(priest, 'Dung'); }
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,240,190,1)'); g.addColorStop(0.35, 'rgba(255,214,120,0.5)'); g.addColorStop(1, 'rgba(255,200,90,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  // ---------- Chúa Giêsu: hình 2D + hào quang xoay + hạt lấp lánh phía sau ----------
  const jesus = new THREE.Group(); scene.add(jesus);
  const jTex = await texL.loadAsync(A + 'jesus.png'); jTex.colorSpace = THREE.SRGBColorSpace;
  const jGlowTex = await texL.loadAsync(A + 'jesus_glow.jpg'); jGlowTex.colorSpace = THREE.SRGBColorSpace;
  const JA = jTex.image.width / jTex.image.height;
  const addM = (map, op) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const raysTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'); const g = x.createRadialGradient(256, 256, 0, 256, 256, 256); g.addColorStop(0, 'rgba(255,240,190,0.95)'); g.addColorStop(0.45, 'rgba(255,210,110,0.35)'); g.addColorStop(1, 'rgba(255,200,90,0)'); x.fillStyle = g; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, w = i % 2 ? 0.05 : 0.09; x.beginPath(); x.moveTo(256, 256); x.arc(256, 256, 256, a - w, a + w); x.closePath(); x.fill(); } return new THREE.CanvasTexture(c); })();
  const rays = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), addM(raysTex, 0.55)); rays.renderOrder = 1; jesus.add(rays);
  const rays2 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), addM(raysTex, 0.35)); rays2.renderOrder = 1; jesus.add(rays2);
  const jGlow = new THREE.Mesh(new THREE.PlaneGeometry(JA, 1), addM(jGlowTex, 0.85)); jGlow.renderOrder = 2; jesus.add(jGlow);
  const jFig = new THREE.Mesh(new THREE.PlaneGeometry(JA, 1), new THREE.MeshBasicMaterial({ map: jTex, transparent: true, depthWrite: false, toneMapped: false })); jFig.renderOrder = 4; jesus.add(jFig);
  const starTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.2, 'rgba(255,236,170,0.9)'); g.addColorStop(1, 'rgba(255,210,120,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); x.fillStyle = 'rgba(255,255,235,0.9)'; x.fillRect(31, 2, 2, 60); x.fillRect(2, 31, 60, 2); return new THREE.CanvasTexture(c); })();
  const twinkle = [];
  for (let k = 0; k < 4; k++) {
    const n = 40, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = 0.18 + Math.random() * 0.55; arr[i * 3] = Math.cos(a) * r * 0.9; arr[i * 3 + 1] = Math.sin(a) * r * 0.75 + 0.08; arr[i * 3 + 2] = -0.02; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: starTex, size: 0.035 + k * 0.012, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    pts.renderOrder = 3; pts.userData.ph = k * 1.6; jesus.add(pts); twinkle.push(pts);
  }
  const angels = [instance('Thien_than'), instance('Thien_than')].filter(Boolean);
  angels.forEach((a) => play(a, 'Bay'));

  // ---------- hiệu ứng chúc phúc ----------
  const beamGeo = new THREE.CylinderGeometry(0.25, 1.1, 1, 24, 1, true); beamGeo.translate(0, -0.5, 0);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beams = new Map();
  const sparkGeo = new THREE.BufferGeometry(); const NSP = 300; const sp = new Float32Array(NSP * 3); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sparkMat = new THREE.PointsMaterial({ map: glowTex, size: 0.35, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe6a8 });
  const sparks = new THREE.Points(sparkGeo, sparkMat); sparks.frustumCulled = false; scene.add(sparks);
  const sparkList = []; // {p: Vector3, v: Vector3, life}
  function burst(pos, n, up = 1) { for (let i = 0; i < n; i++) sparkList.push({ p: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 1.5, (Math.random() - 0.5) * 1.2)), v: new THREE.Vector3((Math.random() - 0.5) * 0.4, (0.4 + Math.random()) * up, (Math.random() - 0.5) * 0.4), life: 1 + Math.random() * 1.6 }); if (sparkList.length > NSP) sparkList.splice(0, sparkList.length - NSP); }
  const glowSprites = new Map();

  // ---------- đồng bộ người ----------
  const INST = new Map(); // p.uid -> inst
  const scaleOf = () => clamp(+CFGf().scene.char3dScale || 1.5, 0.5, 4);
  const v3 = new THREE.Vector3();
  function project(pos, out) {
    v3.copy(pos).project(cam);
    out.x = (v3.x + 1) / 2 * W; out.y = (1 - v3.y) / 2 * H; return v3.z < 1;
  }
  function pxPerMeter(pos) { const a = { x: 0, y: 0 }, b = { x: 0, y: 0 }; project(pos, a); project(pos.clone().add(new THREE.Vector3(0, 1, 0)), b); return Math.abs(a.y - b.y); }

  function walkerPose(w, inst, t, S) {
    const p = w.person, st = seatOf(p), d = CFGf().donate;
    const laneX = st.side * 0.55 + (SPOTS[w.spot ?? 0] || 0) * 0;
    const spot = { x: SPOTS[w.spot ?? 0] ?? 0, y: 42.75 };
    const rowY = st.y + 0.62, sitZ = 0.47 - (0.34 * 1 - 0.3) * S;
    const e = t - w.t0; let x = st.x, y = st.y, z = sitZ, rot = Math.PI, anim = 'Ngoi_cau_nguyen';
    const S1 = w.tStand, A1 = S1 + w.tSide, B1 = A1 + w.tTurn, C1 = B1 + w.tUp;
    const face = (dx, dy) => Math.atan2(dx, -dy) + 0;   // hướng quay mặt theo hướng đi (trong mặt phẳng Blender)
    if (w.phase === 'wait' || e < 0) { /* vẫn ngồi */ }
    else if (['stand', 'side', 'turn', 'up'].includes(w.phase)) {
      if (e < S1) { const k = ease(e / S1); x = st.x; y = lerp(st.y, rowY, k); z = lerp(sitZ, 0, k); anim = 'Dung'; }
      else if (e < A1) { const k = ease((e - S1) / w.tSide); x = lerp(st.x, laneX, k); y = rowY; z = 0; anim = 'Di'; rot = st.side > 0 ? -Math.PI / 2 : Math.PI / 2; }
      else if (e < B1) { const k = ease((e - A1) / w.tTurn); x = laneX; y = rowY; z = 0; anim = 'Di'; rot = lerp(st.side > 0 ? -Math.PI / 2 : Math.PI / 2, st.side > 0 ? -Math.PI : Math.PI, k); }
      else { const k = clamp((e - B1) / w.tUp, 0, 1); x = lerp(laneX, spot.x, ease(k)); y = lerp(rowY, spot.y, k); z = floorZ(y); anim = 'Di'; rot = Math.PI; }
    } else if (w.phase === 'bless') { x = spot.x; y = spot.y; z = 0.54; anim = CFGf().characters.blessPose === 'bow' ? 'Dung_cau_nguyen' : 'Quy_cau_nguyen'; rot = Math.PI; }
    else if (w.phase === 'vanish') { const k = clamp((t - w.vStart) / 2.2, 0, 1); x = spot.x; y = spot.y; z = 0.54 + k * 6; anim = 'Dung_cau_nguyen'; rot = Math.PI; inst.vanish = k; }
    else if (w.phase === 'down') {
      const total = Math.max(3, d.returnSeconds), tSt = 0.6, tDown = total * 0.6, tTurn = 0.4, tSide = total - tDown - tSt - tTurn, e2 = t - w.dStart;
      if (e2 < tSt) { x = spot.x; y = spot.y; z = 0.54; anim = 'Dung'; rot = lerp(Math.PI, 0, ease(e2 / tSt)); }
      else if (e2 < tSt + tDown) { const k = (e2 - tSt) / tDown; x = lerp(spot.x, laneX, ease(k)); y = lerp(spot.y, rowY, k); z = floorZ(y); anim = 'Di'; rot = 0; }
      else if (e2 < tSt + tDown + tTurn) { const k = ease((e2 - tSt - tDown) / tTurn); x = laneX; y = rowY; z = 0; anim = 'Di'; rot = lerp(0, st.side > 0 ? Math.PI / 2 : -Math.PI / 2, k); }
      else { const k = clamp((e2 - tSt - tDown - tTurn) / Math.max(0.2, tSide), 0, 1); x = lerp(laneX, st.x, ease(k)); y = rowY; z = 0; anim = 'Di'; rot = st.side > 0 ? Math.PI / 2 : -Math.PI / 2; if (k > 0.9) { anim = 'Ngoi_cau_nguyen'; y = st.y; z = sitZ; rot = Math.PI; } }
    }
    return { x, y, z, rot, anim };
  }

  let lastT = CH.now(), angelT = 0;
  const head = new THREE.Vector3(), tmp = { x: 0, y: 0 };
  function render(t, cami) {
    const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    cam.clearViewOffset();
    const S = scaleOf(), people = CH.people, walkers = CH.walkers;
    const MODEL = bgMode() === 'model';
    if (MODEL && !church) loadChurch();
    const useModel = MODEL && !!church;
    occ.scene.visible = !useModel; modelLights.visible = useModel; if (church) church.visible = useModel;
    // các cảnh quay: donate (do màn hình 2D điều khiển thời gian), vào phòng, xem thử
    const shotE = (st, hold) => { const d = t - st, inS = 0.6, outS = 0.7; if (d < 0) return 0; if (d > inS + hold + outS) return -1; return d < inS ? ease(d / inS) : d < inS + hold ? 1 : 1 - ease((d - inS - hold) / outS); };
    let shot = null;
    if (cami && cami.w && INST.get(cami.w.person.uid)) shot = { kind: 'donate', inst: INST.get(cami.w.person.uid), side: seatOf(cami.w.person).side, e: cami.e };
    else if (preview) { const e = shotE(preview.start, preview.kind === 'donate' ? (+c3cfg().camHold || 1) : (+c3cfg().camJoinHold || 1.5)); const inst = INST.get(preview.p.uid); if (e < 0 || !inst) preview = null; else shot = { kind: preview.kind, inst, side: seatOf(preview.p).side, e }; }
    else if (joinShot) { const e = shotE(joinShot.start, +c3cfg().camJoinHold || 1.5); const inst = INST.get(joinShot.p.uid); if (e < 0 || !inst) joinShot = null; else shot = { kind: 'join', inst, side: seatOf(joinShot.p).side, e }; }
    window.__shotDbg = shot ? [shot.kind, +shot.e.toFixed(2)] : (preview ? ['pv-noshot'] : null);
    if (edit) { if (ctrl) ctrl.update(); }
    else if (useModel) {
      const mc = mainCam();
      if (shot && shot.e > 0) {
        const sc = shotCam(shot.kind, shot.inst.g.position.clone(), shot.side);
        applyCam({ pos: mc.pos.lerp(sc.pos, shot.e), target: mc.target.lerp(sc.target, shot.e), fov: lerp(mc.fov, sc.fov, shot.e) });
      } else applyCam(mc);
    } else applyCam(mainCam());
    const live = new Set();
    const wBy = new Map(); for (const w of walkers) if (!w.done) wBy.set(w.person.uid, w);
    for (const p of people) {
      if (p.leaving && p.alpha <= 0.02) continue;
      live.add(p.uid);
      let inst = INST.get(p.uid);
      if (!inst) {
        inst = instance(pickModel(p)); if (!inst) continue; inst.born = t; INST.set(p.uid, inst);
        const cj = c3cfg();
        if (cj.camJoin && !p.filler && !wBy.has(p.uid) && !edit && !cami && !joinShot && !preview && t - lastJoinShot > (+cj.camJoinCooldown || 8) && t - p.born < 2) { joinShot = { p, start: t + 0.4 }; lastJoinShot = t; }
      }
      setFace(inst, p);
      const showBadge = !p.filler && CFGf().scene.badge3d !== false; if (showBadge) setBadge(inst, p);
      const w = wBy.get(p.uid);
      let pose;
      if (w) pose = walkerPose(w, inst, t, S);
      else { const st = seatOf(p); pose = { x: st.x, y: st.y, z: 0.47 - (0.34 - 0.3) * S, rot: Math.PI, anim: p.donated ? 'Ngoi_cau_nguyen' : (hash(p.uid) < 0.5 ? 'Ngoi_cau_nguyen' : 'Ngoi') }; }
      const pop = p.leaving ? clamp(p.alpha, 0, 1) : clamp((t - inst.born) / 0.5, 0, 1);
      const sc = S * (0.25 + 0.75 * (pop < 1 ? 1 - Math.pow(1 - pop, 3) : 1)) * (inst.vanish ? 1 - inst.vanish * 0.6 : 1);
      inst.g.position.copy(B(pose.x, pose.y, pose.z)); inst.g.rotation.y = pose.rot; inst.g.scale.setScalar(sc);
      inst.g.visible = sc > 0.01;
      play(inst, pose.anim);
      inst.mixer.update(dt * (pose.anim === 'Di' ? Math.max(0.7, Math.min(1.6, 1.2)) : 1));
      // tên + toạ độ đầu cho lớp chữ 2D
      const bz = pose.z + (pose.anim.startsWith('Ngoi') ? 1.2 : pose.anim.startsWith('Quy') ? 1.25 : 1.55) * S + 0.32 * S;
      if (inst.badge) { inst.badge.visible = showBadge && inst.g.visible; inst.badge.position.copy(B(pose.x, pose.y, bz)); inst.badge.scale.setScalar(0.62 * S * Math.min(1, sc / S)); }
      head.copy(B(pose.x, pose.y, bz + 0.34 * S)); project(head, tmp);
      const ppm = pxPerMeter(head);
      if (w) { w._head = { x: tmp.x, y: tmp.y }; w._nameSize = clamp(ppm * 0.33, 16, 30); }
      else { p._head = { x: tmp.x, y: tmp.y }; p._nameSize = clamp(ppm * 0.26, 12, 24); }
      // chùm sáng khi được chúc phúc
      if (w && (w.phase === 'bless' || w.phase === 'vanish')) {
        let bm = beams.get(p.uid);
        if (!bm) { bm = new THREE.Mesh(beamGeo, beamMat.clone()); scene.add(bm); beams.set(p.uid, bm); burst(B(pose.x, pose.y, pose.z), 40, 1.2); }
        bm.position.copy(B(pose.x, pose.y, 14)); bm.scale.set(1.2, 14 - pose.z, 1.2); bm.material.opacity = 0.18 + 0.08 * Math.sin(t * 4);
        if (Math.random() < dt * 14) burst(B(pose.x, pose.y, pose.z + 0.3), 1, 0.8);
      } else if (beams.has(p.uid)) { scene.remove(beams.get(p.uid)); beams.delete(p.uid); }
      // phát sáng khi follow/share
      const glow = p.glowUntil && t < p.glowUntil ? Math.min(clamp((t - p.glowStart) / 0.5, 0, 1), clamp((p.glowUntil - t) / 0.8, 0, 1)) : 0;
      let gs = glowSprites.get(p.uid);
      if (glow > 0) { if (!gs) { gs = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); scene.add(gs); glowSprites.set(p.uid, gs); } gs.position.copy(B(pose.x, pose.y, pose.z + 0.9 * S)); gs.scale.setScalar(2.4 * S); gs.material.opacity = glow; p._glow = glow; }
      else { if (gs) { scene.remove(gs); glowSprites.delete(p.uid); } p._glow = 0; }
    }
    for (const [uid, inst] of INST) if (!live.has(uid)) { dispose(inst); INST.delete(uid); const bm = beams.get(uid); if (bm) { scene.remove(bm); beams.delete(uid); } const gs = glowSprites.get(uid); if (gs) { scene.remove(gs); glowSprites.delete(uid); } }

    // cha sứ: giảng khi đang đọc bài giảng, ban phép lành khi có người được chúc phúc
    const c3 = CFGf().scene;
    if (priest) {
      priest.g.visible = c3.priest3d !== false; priest.g.scale.setScalar(S * 1.6);
      const blessing = walkers.some((w) => w.phase === 'bless');
      play(priest, blessing ? 'Ban_phep_lanh' : (CH.sermon && CH.sermon.state === 'playing' ? 'Giang_dao' : 'Dung'), 0.4);
      priest.mixer.update(dt);
    }
    {
      const js = clamp(+c3.jesusSize || 9, 2, 30), jz = +c3.jesusZ || 9.5;
      jesus.visible = c3.jesus3d !== false;
      jesus.position.copy(B(0, 48.4, jz + Math.sin(t * 0.8) * 0.12)); jesus.quaternion.copy(cam.quaternion); jesus.scale.setScalar(js);
      rays.scale.setScalar(1.45); rays.position.set(0, 0.28, -0.03); rays.rotation.z = t * 0.12;
      rays2.scale.setScalar(1.1); rays2.position.set(0, 0.3, -0.025); rays2.rotation.z = -t * 0.2;
      rays.material.opacity = 0.45 + 0.12 * Math.sin(t * 1.3); jGlow.material.opacity = 0.75 + 0.15 * Math.sin(t * 1.7);
      jGlow.position.z = -0.01;
      for (const tw of twinkle) { tw.material.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 + tw.userData.ph)); tw.rotation.z = t * 0.05; }
    }
    angelT += dt;
    angels.forEach((a, i) => {
      a.g.visible = c3.angels3d !== false; if (!a.g.visible) return;
      const ph = angelT * 0.12 + i * Math.PI, rx = 4.2, ry = 13;
      const x = Math.sin(ph) * rx, y = 26 + Math.cos(ph) * ry, z = 16 + Math.sin(ph * 2) * 1.5;
      const x2 = Math.sin(ph + 0.01) * rx, y2 = 26 + Math.cos(ph + 0.01) * ry;
      a.g.position.copy(B(x, y, z)); { const dv = B(x2, y2, z).sub(B(x, y, z)); a.g.rotation.y = Math.atan2(dv.x, dv.z); } a.g.scale.setScalar(S * 1.3); a.mixer.update(dt);
    });
    // hạt sáng
    for (let i = sparkList.length - 1; i >= 0; i--) { const s = sparkList[i]; s.life -= dt; if (s.life <= 0) { sparkList.splice(i, 1); continue; } s.p.addScaledVector(s.v, dt); }
    for (let i = 0; i < NSP; i++) { const s = sparkList[i]; if (s) { sp[i * 3] = s.p.x; sp[i * 3 + 1] = s.p.y; sp[i * 3 + 2] = s.p.z; } else { sp[i * 3] = 0; sp[i * 3 + 1] = -999; sp[i * 3 + 2] = 0; } }
    sparkGeo.attributes.position.needsUpdate = true;

    // camera zoom = cắt khung ảnh (khớp tuyệt đối với nền render sẵn)
    let s = 1, cx = W / 2, cy = H / 2;
    if (!useModel && !edit && shot && shot.e > 0) {
      head.copy(shot.inst.g.position).add(new THREE.Vector3(0, 0.8 * S, 0)); cam.clearViewOffset(); project(head, tmp);
      const zs = clamp(+c3cfg().camScale || 1.8, 1, 4) * (shot.kind === 'join' ? 0.85 : 1);
      s = 1 + (zs - 1) * shot.e;
      cx = clamp(lerp(W / 2, tmp.x, shot.e), W / (2 * s), W - W / (2 * s)); cy = clamp(lerp(H / 2, tmp.y, shot.e), H / (2 * s), H - H / (2 * s));
    }
    if (s > 1.0001) {
      cam.setViewOffset(W, H, cx - W / (2 * s), cy - H / (2 * s), W / s, H / s);
      plate.repeat.set(1 / s, 1 / s); plate.offset.set(cx / W - 0.5 / s, 1 - cy / H - 0.5 / s);
    } else { cam.clearViewOffset(); plate.repeat.set(1, 1); plate.offset.set(0, 0); }
    plate.updateMatrix();
    // vị trí chữ tên phải theo khung đã cắt
    if (s > 1.0001) {
      const fix = (o) => { if (o && o._head) { o._head.x = (o._head.x - (cx - W / (2 * s))) * s; o._head.y = (o._head.y - (cy - H / (2 * s))) * s; if (o._nameSize) o._nameSize *= Math.min(1.6, s); } };
      for (const p of people) fix(p); for (const w of walkers) fix(w);
    }
    R.clear(); if (!useModel) { R.render(bgScene, bgCam); R.clearDepth(); } else { R.setClearColor(0x1a120c); }
    R.render(scene, cam);
  }
  window.__3d = { ready: true, render, THREE, scene, cam, INST, cmd };
  log('Cảnh 3D đã sẵn sàng.');
}

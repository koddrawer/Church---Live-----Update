// Church Live — chế độ cảnh 3D: nền nhà thờ render sẵn (Cycles) + che khuất bằng hình học thật + nhân vật chibi 3D
import * as THREE from 'three';
import { GLTFLoader } from './lib/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from './lib/jsm/utils/SkeletonUtils.js';

const CH = window.__church;
const CFGf = () => CH.CFG();
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

  const NAMES = ['Nam_vest', 'Nu_vay_khan_ren', 'Nu_ao_dai', 'Ong', 'Ba', 'Be_trai', 'Be_gai_ruoc_le', 'Cha_su', 'Chua_Giesu', 'Thien_than'];
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
  const priest = instance('Cha_su'); if (priest) { priest.g.position.copy(B(0, 48.1, 0.54)); play(priest, 'Dung'); }
  const jesus = instance('Chua_Giesu'); if (jesus) { jesus.g.position.copy(B(0, 48.6, 6.2)); play(jesus, 'Dang_tay'); }
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,240,190,1)'); g.addColorStop(0.35, 'rgba(255,214,120,0.5)'); g.addColorStop(1, 'rgba(255,200,90,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const jesusGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
  scene.add(jesusGlow);
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
    const live = new Set();
    const wBy = new Map(); for (const w of walkers) if (!w.done) wBy.set(w.person.uid, w);
    for (const p of people) {
      if (p.leaving && p.alpha <= 0.02) continue;
      live.add(p.uid);
      let inst = INST.get(p.uid);
      if (!inst) { inst = instance(pickModel(p)); if (!inst) continue; inst.born = t; INST.set(p.uid, inst); }
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
    if (jesus) {
      jesus.g.visible = c3.jesus3d !== false; jesus.g.scale.setScalar(S * 2.6);
      jesus.g.position.copy(B(0, 48.4, 8.2 + Math.sin(t * 0.8) * 0.15)); jesus.mixer.update(dt);
      jesusGlow.visible = jesus.g.visible; jesusGlow.position.copy(B(0, 48.8, 8.2 + 1.0 * S * 2.6)); jesusGlow.scale.setScalar(7 * S * (0.95 + 0.05 * Math.sin(t * 2)));
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
    if (cami && cami.w) {
      const w = cami.w, inst = INST.get(w.person.uid);
      if (inst) {
        head.copy(inst.g.position).add(new THREE.Vector3(0, 0.8 * S, 0)); cam.clearViewOffset(); project(head, tmp);
        s = 1 + (cami.scale - 1) * cami.e;
        cx = clamp(lerp(W / 2, tmp.x, cami.e), W / (2 * s), W - W / (2 * s)); cy = clamp(lerp(H / 2, tmp.y, cami.e), H / (2 * s), H - H / (2 * s));
      }
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
    R.clear(); R.render(bgScene, bgCam); R.clearDepth(); R.render(scene, cam);
  }
  window.__3d = { ready: true, render, THREE, scene, cam, INST };
  log('Cảnh 3D đã sẵn sàng.');
}

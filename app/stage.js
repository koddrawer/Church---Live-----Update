/* Church Live — màn hình 9:16 */
(() => {
'use strict';
const W = 1080, H = 1920;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const video = document.getElementById('v');
const api = window.api;
let CFG = deepMerge(CHURCH_DEFAULTS, {});
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const now = () => performance.now() / 1000;
const fmt = (s, o) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (o[k] ?? ''));
function toPanel(msg) { try { api.toPanel(msg); } catch {} }
function logp(msg, level = 'info') { toPanel({ type: 'log', msg, level }); }
window.__errs = [];
window.addEventListener('error', (e) => { window.__errs.push(String(e.message) + ' @' + e.lineno); logp('Lỗi: ' + e.message + ' (dòng ' + e.lineno + ')', 'error'); });
window.addEventListener('unhandledrejection', (e) => { window.__errs.push('rej ' + (e.reason && e.reason.message)); });

setTimeout(() => { const h = document.getElementById('hint'); if (h) h.style.opacity = 0; }, 4000);

// ================== ẢNH ==================
const imgCache = new Map();
function loadImg(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  imgCache.set(src, p); return p;
}
const FRAMES = ['left1', 'left2', 'right1', 'right2', 'front1', 'front2', 'back1', 'back2', 'bow', 'kneel'];
let SITTERS = [];   // {crop: canvas, cropFlip: canvas, walker, aspect}
let WALKERS = {};   // name -> {frame: {img: canvas, w, h}}
let assetsReady = false;

function warmCanvas(img, sx, sy, sw, sh, outH, flip, fadeBottom) {
  const scale = outH / sh;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * scale)); c.height = Math.max(1, Math.round(outH));
  const g = c.getContext('2d');
  const t = CFG.scene.warmTint;
  g.filter = `sepia(${t}) saturate(${1 + t * 0.4}) brightness(${1 - t * 0.12}) contrast(1.02)`;
  if (flip) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  g.setTransform(1, 0, 0, 1, 0, 0); g.filter = 'none';
  if (fadeBottom) {
    g.globalCompositeOperation = 'destination-out';
    const fh = c.height * fadeBottom; const gr = g.createLinearGradient(0, c.height - fh, 0, c.height);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gr; g.fillRect(0, c.height - fh, c.width, fh);
    g.globalCompositeOperation = 'source-over';
  }
  return c;
}

async function loadAssets() {
  assetsReady = false;
  let ua = { sitters: [], walkers: {} };
  try { ua = await api.userAssets(); } catch {}
  const sitterDefs = [...CFG.characters.sitters];
  for (const f of ua.sitters || []) {
    const url = 'church://user/sitters/' + encodeURIComponent(f);
    if (!sitterDefs.find((s) => s.file === url)) sitterDefs.push({ file: url, gender: (CFG.characters.userSitterGender || {})[f] || null });
  }
  const walkerDefs = { ...CFG.characters.walkers };
  for (const [name, frames] of Object.entries(ua.walkers || {})) if (FRAMES.every((fr) => frames.includes(fr) || ['bow', 'kneel', 'front1', 'front2'].includes(fr))) walkerDefs[name] = { base: 'church://user/walkers/' + encodeURIComponent(name) + '/' };

  const crop = clamp(CFG.seating.cropFrac, 0.3, 0.95);
  const sit = [];
  for (const s of sitterDefs) {
    if (s.disabled) continue;
    const img = await loadImg(s.file);
    if (!img) { logp('Không tải được ảnh ngồi: ' + s.file, 'warn'); continue; }
    const sh = img.height * crop;
    const dg = (CHURCH_DEFAULTS.characters.sitters.find((d) => d.file === s.file) || {}).gender;
    sit.push({ src: s.file, gender: s.gender !== undefined ? s.gender : (dg || null), crop: warmCanvas(img, 0, 0, img.width, sh, 360, false, 0.04), cropFlip: warmCanvas(img, 0, 0, img.width, sh, 360, true, 0.04), aspect: img.width / sh });
  }
  const wk = {};
  for (const [name, def] of Object.entries(walkerDefs)) {
    const set = {};
    for (const fr of FRAMES) {
      const img = await loadImg(def.base + fr + '.png');
      if (img) set[fr] = { img: warmCanvas(img, 0, 0, img.width, img.height, 560, false, 0), ar: img.width / img.height };
    }
    if (!set.back1 || !set.left1 || !set.right1) { logp('Bộ hoạt ảnh "' + name + '" thiếu khung, bỏ qua', 'warn'); continue; }
    set.left2 = set.left2 || set.left1; set.right2 = set.right2 || set.right1; set.back2 = set.back2 || set.back1;
    set.front1 = set.front1 || set.back1; set.front2 = set.front2 || set.front1;
    set.bow = set.bow || set.back1; set.kneel = set.kneel || set.bow;
    set.gender = (CFG.characters.walkerGender || {})[name] ?? def.gender ?? null;
    set.name = name; set.user = !CFG.characters.walkers[name];
    wk[name] = set;
  }
  SITTERS = sit; WALKERS = wk; assetsReady = true;
  logp(`Đã nạp ${sit.length} ảnh người ngồi, ${Object.keys(wk).length} bộ hoạt ảnh đi bộ: ` + Object.values(wk).map((w) => w.name + '(' + ({ m: 'nam', f: 'nữ' }[w.gender] || 'chung') + ')').join(', '));
}

// ================== VIDEO NỀN ==================
let videoUrl = null, posterImg = null, videoOK = false;
async function loadVideo() {
  const src = CFG.scene.videoFile ? 'church://abs/' + encodeURIComponent(CFG.scene.videoFile.replace(/\\/g, '/')) : 'church://app/assets/video/church_loop.mp4';
  posterImg = await loadImg('church://app/assets/video/poster.jpg');
  try {
    const r = await fetch(src); if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(blob);
    video.src = videoUrl; video.loop = true; video.muted = false;
    await video.play().catch(() => {});
    videoOK = true;
  } catch (e) { videoOK = false; logp('Không tải được video nền: ' + e.message, 'error'); }
}

// ================== ÂM THANH ==================
const AC = new (window.AudioContext || window.webkitAudioContext)();
const master = AC.createGain(); master.connect(AC.destination);
const reverbIn = AC.createGain();
const convolver = AC.createConvolver();
const reverbOut = AC.createGain();
reverbIn.connect(convolver); convolver.connect(reverbOut); reverbOut.connect(master);
(function makeIR() {
  const len = AC.sampleRate * 4.2, ir = AC.createBuffer(2, len, AC.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / AC.sampleRate;
      const pre = t < 0.035 ? 0 : 1;
      // phản xạ sớm của gian nhà thờ + đuôi vang dài
      const early = (Math.abs(t - 0.07) < 0.004 || Math.abs(t - 0.13) < 0.004 || Math.abs(t - 0.21) < 0.005) ? 0.6 : 0;
      d[i] = pre * ((Math.random() * 2 - 1) * Math.pow(1 - t / 4.2, 2.2) * Math.exp(-t * 1.1) + early * (Math.random() * 2 - 1));
    }
  }
  convolver.buffer = ir;
})();
// chuỗi giọng cha sứ: dry (lọc nhẹ cho giống loa nhà thờ) + reverb
const voiceBus = AC.createGain();
const voiceHP = AC.createBiquadFilter(); voiceHP.type = 'highpass'; voiceHP.frequency.value = 110;
const voiceLP = AC.createBiquadFilter(); voiceLP.type = 'lowpass'; voiceLP.frequency.value = 6200;
const voiceDry = AC.createGain(); const voiceWet = AC.createGain();
voiceBus.connect(voiceHP); voiceHP.connect(voiceLP); voiceLP.connect(voiceDry); voiceLP.connect(voiceWet);
voiceDry.connect(master); voiceWet.connect(reverbIn);
// giọng chúc phúc
const blessBus = AC.createGain(); blessBus.connect(voiceHP);
// video
let videoGain = AC.createGain(); videoGain.connect(master);
try { AC.createMediaElementSource(video).connect(videoGain); } catch (e) {}
// nhạc nền
const music = new Audio(); music.loop = true; music.crossOrigin = 'anonymous';
const musicGain = AC.createGain(); musicGain.connect(master); const musicWet = AC.createGain(); musicWet.gain.value = 0.25; musicGain.connect(musicWet); musicWet.connect(reverbIn);
try { AC.createMediaElementSource(music).connect(musicGain); } catch {}
let musicSrc = '';
// organ pad tổng hợp
const organGain = AC.createGain(); organGain.gain.value = 0; organGain.connect(master); const organWet = AC.createGain(); organWet.gain.value = 0.9; organGain.connect(organWet); organWet.connect(reverbIn);
const organLP = AC.createBiquadFilter(); organLP.type = 'lowpass'; organLP.frequency.value = 1400; organLP.connect(organGain);
const CHORDS = [[48, 55, 60, 64], [45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [48, 55, 60, 67], [41, 53, 57, 60], [43, 55, 59, 62], [48, 52, 55, 60]];
const organVoices = [];
for (let i = 0; i < 4; i++) {
  const g = AC.createGain(); g.gain.value = 0.18; g.connect(organLP);
  const o1 = AC.createOscillator(); o1.type = 'sine'; const o2 = AC.createOscillator(); o2.type = 'triangle';
  const g2 = AC.createGain(); g2.gain.value = 0.35; o2.connect(g2); g2.connect(g); o1.connect(g);
  o1.start(); o2.start(); organVoices.push({ o1, o2, g });
}
let chordIdx = 0;
function nextChord() {
  const ch = CHORDS[chordIdx++ % CHORDS.length], t = AC.currentTime;
  ch.forEach((m, i) => { const f = 440 * Math.pow(2, (m - 69) / 12); organVoices[i].o1.frequency.setTargetAtTime(f, t, 1.2); organVoices[i].o2.frequency.setTargetAtTime(f * 2.001, t, 1.2); });
}
nextChord(); setInterval(nextChord, 9000);

function applyAudio() {
  const a = CFG.audio, t = AC.currentTime;
  master.gain.setTargetAtTime(a.master, t, 0.1);
  videoGain.gain.setTargetAtTime(a.videoVolume, t, 0.1);
  voiceBus.gain.setTargetAtTime(a.sermonVolume * (ducked ? 0.22 : 1), t, 0.15);
  blessBus.gain.setTargetAtTime(a.sermonVolume * 1.1, t, 0.1);
  voiceDry.gain.setTargetAtTime(1 - a.reverb * 0.55, t, 0.1);
  voiceWet.gain.setTargetAtTime(a.reverb * 1.3, t, 0.1);
  organGain.gain.setTargetAtTime(a.organPad ? a.organVolume : 0, t, 0.8);
  musicGain.gain.setTargetAtTime(a.musicVolume, t, 0.2);
  const ms = a.musicFile ? 'church://abs/' + encodeURIComponent(a.musicFile.replace(/\\/g, '/')) : '';
  if (ms !== musicSrc) { musicSrc = ms; if (ms) { music.src = ms; music.play().catch(() => {}); } else music.pause(); }
}
function chime() {
  if (!CFG.audio.blessChime) return;
  const t = AC.currentTime;
  [72, 76, 79, 84].forEach((m, i) => {
    const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine';
    o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
    g.gain.setValueAtTime(0, t + i * 0.18); g.gain.linearRampToValueAtTime(0.12, t + i * 0.18 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 2.8);
    o.connect(g); g.connect(master); g.connect(reverbIn); o.start(t + i * 0.18); o.stop(t + i * 0.18 + 3);
  });
}

// ---- giọng đọc ----
const bufCache = new Map();
async function ttsBuffer(text) {
  const a = CFG.audio;
  const key = [a.voice, a.rate, a.pitch, text].join('|');
  if (bufCache.has(key)) return bufCache.get(key);
  const p = (async () => {
    const r = await api.tts({ text, voice: a.voice, rate: a.rate, pitch: a.pitch });
    if (!r || !r.ok) throw new Error((r && r.error) || 'TTS lỗi');
    const ab = await (await fetch(r.url)).arrayBuffer();
    return await AC.decodeAudioData(ab);
  })();
  bufCache.set(key, p);
  p.catch(() => bufCache.delete(key));
  if (bufCache.size > 80) bufCache.delete(bufCache.keys().next().value);
  return p;
}
async function fileBuffer(url) {
  if (bufCache.has(url)) return bufCache.get(url);
  const p = fetch(url).then((r) => r.arrayBuffer()).then((ab) => AC.decodeAudioData(ab));
  bufCache.set(url, p); p.catch(() => bufCache.delete(url)); return p;
}
function playBuffer(buf, bus) {
  return new Promise((res) => { const s = AC.createBufferSource(); s.buffer = buf; s.connect(bus); s.onended = () => res(); s.start(); cur.src = s; });
}
function speakFallback(text) {
  return new Promise((res) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      const lang = CFG.audio.voice.slice(0, 5);
      const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.replace('_', '-').toLowerCase().startsWith(lang.toLowerCase()));
      if (v) u.voice = v; u.lang = lang; u.rate = 0.9; u.pitch = 0.85; u.volume = clamp(CFG.audio.sermonVolume * (ducked ? 0.3 : 1), 0, 1);
      u.onend = () => res(); u.onerror = () => res();
      speechSynthesis.speak(u);
      setTimeout(res, 60000);
    } catch { res(); }
  });
}
let ducked = false;
const cur = { src: null };
const sermon = { idx: 0, running: false, token: 0, line: '', state: 'idle', usingFallback: false };
// phụ đề: mục hiện tại, câu của đoạn đang đọc
const SUB = { title: '', sents: [], cur: -1, changed: 0, scroll: 0 };
function sermonTexts() {
  const a = CFG.audio;
  return a.sermonLang === 'en' ? (a.sermonTextsEn && a.sermonTextsEn.length ? a.sermonTextsEn : SERMON_EN) : (a.sermonTextsVi && a.sermonTextsVi.length ? a.sermonTextsVi : SERMON_VI);
}
// gom đoạn thành các mục theo dòng tiêu đề "# ..."
function sermonSections() {
  const secs = []; let cur = null;
  for (const raw of sermonTexts()) {
    const t = String(raw || '').trim(); if (!t) continue;
    if (t.startsWith('#')) { cur = { title: t.replace(/^#+\s*/, ''), paras: [] }; secs.push(cur); }
    else { if (!cur) { cur = { title: '', paras: [] }; secs.push(cur); } cur.paras.push(t); }
  }
  return secs.filter((x) => x.paras.length);
}
function splitSentences(p) {
  const out = String(p).match(/[^.!?…]+(?:[.!?…]+["”’)]*|$)/g) || [p];
  // gộp mẩu quá ngắn vào câu trước (vd. "Amen.")
  const res = [];
  for (const x of out.map((y) => y.trim()).filter(Boolean)) { if (res.length && x.length < 14) res[res.length - 1] += ' ' + x; else res.push(x); }
  return res;
}
// chuyển trích dẫn Kinh Thánh sang cách đọc tự nhiên
function speakable(t) {
  if (CFG.audio.sermonLang === 'en') return t.replace(/(\d+):(\d+)[–-](\d+)/g, 'chapter $1, verses $2 to $3').replace(/(\d+):(\d+)/g, 'chapter $1, verse $2');
  return t.replace(/(\d+):(\d+)[–-](\d+)/g, 'chương $1, câu $2 đến $3').replace(/(\d+):(\d+)/g, 'chương $1, câu $2').replace(/\s[–-]\s/g, ', ').replace(/\(([^)]*)\)/g, ', $1.');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitGap(sec, my) { const end = Date.now() + sec * 1000; while (Date.now() < end && sermon.token === my) await sleep(100); }
async function sayLine(text, my) {
  let buf = null;
  try { buf = await ttsBuffer(speakable(text)); if (sermon.usingFallback) logp('Giọng Edge TTS đã hoạt động lại'); sermon.usingFallback = false; } catch (e) {
    if (!sermon.usingFallback) logp('Giọng Edge TTS lỗi (' + e.message + '), dùng giọng Windows thay thế', 'warn');
    sermon.usingFallback = true;
  }
  if (sermon.token !== my) return;
  while (videoPlaying() && sermon.token === my) await sleep(250); // tạm dừng giảng khi chiếu video chúc phúc
  if (sermon.token !== my) return;
  sermon.state = 'playing';
  if (buf) await playBuffer(buf, voiceBus); else await speakFallback(speakable(text));
}
async function sermonLoop() {
  const my = ++sermon.token;
  sermon.running = true;
  let order = null, si = 0;
  while (sermon.token === my) {
    if (!CFG.audio.sermonEnabled) { sermon.state = 'off'; SUB.sents = []; await sleep(1000); continue; }
    try {
      if (CFG.audio.sermonMode === 'files') {
        SUB.sents = [];
        const ua = await api.userAssets();
        const files = ua.sermonAudio || [];
        if (!files.length) { sermon.state = 'Chưa có file trong thư mục sermon-audio'; await sleep(3000); continue; }
        const i = CFG.audio.shuffle ? Math.floor(Math.random() * files.length) : sermon.idx % files.length;
        sermon.idx = i + 1; sermon.line = files[i]; sermon.state = 'playing';
        const buf = await fileBuffer('church://user/sermon-audio/' + encodeURIComponent(files[i]));
        if (sermon.token !== my) break;
        while (videoPlaying() && sermon.token === my) await sleep(250);
        await playBuffer(buf, voiceBus);
        await waitGap(CFG.audio.gapSeconds, my);
        continue;
      }
      const secs = sermonSections();
      if (!secs.length) { await sleep(2000); continue; }
      if (!order || order.length !== secs.length || si >= order.length) {
        order = secs.map((_, i) => i);
        if (CFG.audio.shuffle) for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        if (si >= order.length) si = 0;
        if (!CFG.audio.shuffle && sermon.idx) si = sermon.idx % secs.length;
      }
      const sec = secs[order[si]]; sermon.idx = order[si] + 1; si++;
      SUB.title = sec.title;
      if (sec.title && CFG.audio.readTitles) { sermon.line = sec.title; SUB.sents = [sec.title]; SUB.cur = 0; SUB.changed = now(); await sayLine(sec.title, my); await waitGap(0.6, my); }
      for (const para of sec.paras) {
        if (sermon.token !== my) break;
        const sents = splitSentences(para);
        SUB.sents = sents; SUB.cur = -1; SUB.changed = now(); SUB.scroll = 0;
        for (let k = 0; k < sents.length && sermon.token === my; k++) {
          if (!CFG.audio.sermonEnabled) break;
          ttsBuffer(speakable(sents[k + 1] || '')).catch(() => {}); // tải trước câu sau
          SUB.cur = k; sermon.line = sents[k]; sermon.state = 'loading';
          await sayLine(sents[k], my);
          await waitGap(CFG.audio.sentenceGap, my);
        }
        SUB.cur = SUB.sents.length;
        await waitGap(CFG.audio.gapSeconds, my);
      }
      await waitGap(CFG.audio.sectionGap, my);
    } catch (e) { sermon.state = 'error: ' + e.message; await sleep(3000); }
  }
}
function sermonSkip() { try { cur.src && cur.src.stop(); } catch {} try { speechSynthesis.cancel(); } catch {} }
function sermonRestart() { sermon.token++; sermonSkip(); setTimeout(sermonLoop, 300); }

let blessChain = Promise.resolve();
function speakBlessing(text) {
  blessChain = blessChain.then(async () => {
    ducked = true; applyAudio();
    try { const b = await ttsBuffer(speakable(text)); await new Promise((res) => { const s = AC.createBufferSource(); s.buffer = b; s.connect(blessBus); s.onended = res; s.start(); }); }
    catch { await speakFallback(text); }
    await sleep(400); ducked = videoPlaying(); applyAudio();
  });
}
function blessingLine(o) {
  const d = CFG.donate;
  let list = d.blessSpeeches && d.blessSpeeches.length ? d.blessSpeeches : (CFG.audio.sermonLang === 'en' ? BLESSINGS_EN : BLESSINGS_VI);
  const t = d.blessSpeechMode === 'fixed' || !list.length ? d.blessSpeech : list[Math.floor(Math.random() * list.length)];
  return fmt(t, o);
}

// ================== HÌNH HỌC CẢNH ==================
// Mọi kích thước tính theo "px trên mét" (ppm) suy ra từ bề rộng lối đi tại độ sâu đó.
let G = null;
function buildGeometry() {
  const g = CFG.scene.geometry;
  const rows = g.rows.map((y) => y + g.rowOffset);
  const r0 = rows[0];
  const innerL = (y) => g.innerTopX + (y - r0) * g.innerSlope;
  const outerL = (y) => g.outerTopX + (y - r0) * g.outerSlope;
  const aisleW = (y) => 2 * (g.centerX - innerL(y));
  const ppm = (railY) => Math.max(5, aisleW(railY) / g.aisleM);              // px/m tại độ sâu có mép lưng ghế ở railY
  const railFromPpm = (p) => r0 + (g.centerX - p * g.aisleM / 2 - g.innerTopX) / g.innerSlope;
  const footOfRail = (railY) => railY + g.railM * ppm(railY);                  // sàn nhà ngay dưới mép ghế
  const railOfFoot = (foot) => { let y = foot; for (let i = 0; i < 6; i++) y = foot - g.railM * ppm(y); return y; };
  const rowInfo = rows.map((y, k) => ({ k, y, sp: (rows[k + 1] ?? (y + (y - rows[k - 1]) * 1.12)) - y, ppm: ppm(y) }));
  const slots = [];
  const s = CFG.seating;
  for (let k = clamp(s.firstRow, 0, rows.length - 1); k <= clamp(s.lastRow, 0, rows.length - 1); k++) {
    const r = rowInfo[k];
    const P = r.ppm * s.torsoScale;
    const slotW = g.seatWidthM * r.ppm;
    const headTop = r.y - g.seatHeadM * P;
    const cropH = g.seatCropM * P;
    for (const side of ['L', 'R']) {
      const inner = innerL(r.y), outer = Math.max(outerL(r.y), -slotW * 0.2);
      for (let i = 0; i < 14; i++) {
        const xl = inner - slotW * (0.7 + i);
        if (xl - slotW * 0.3 < outer) break;
        const x = side === 'L' ? xl : 2 * g.centerX - xl;
        slots.push({ id: slots.length, k, side, x, y: r.y, ppm: r.ppm, headTop, cropH, slotW, occupied: null, order: i });
      }
    }
  }
  // chân người quỳ/đứng ở bục
  const altarRail = railOfFoot(g.altarY);
  G = { g, rows, rowInfo, innerL, outerL, aisleW, ppm, railFromPpm, footOfRail, railOfFoot, slots, altarY: g.altarY, altarRail };
}
const standH = (railY) => {
  // phóng to dần khi lại gần bục cho người xem dễ thấy (altarBoost)
  const last = G.rows[G.rows.length - 1], k = clamp((last - railY) / Math.max(1, last - G.altarRail), 0, 1);
  return CFG.scene.geometry.standM * G.ppm(railY) * CFG.donate.walkerScale * (1 + (CFG.donate.altarBoost - 1) * Math.pow(k, 1.6));
};

// ================== NHÂN VẬT ==================
let people = [];     // người ngồi
let walkers = [];    // người đang đi
let queue = [];      // donate chờ
let fx = [];         // hiệu ứng
let banners = [];
let nextUid = 1;

function freeSlots() { return G.slots.filter((s) => !s.occupied); }
function pickSlot() {
  const fs = freeSlots(); if (!fs.length) return null;
  const s = CFG.seating, span = Math.max(1, s.lastRow - s.firstRow + 1);
  const w = fs.map((sl) => Math.pow((sl.k - s.firstRow + 1) / span, s.preferNear * 2.2) * (sl.order === 0 ? 1.15 : 1) + 0.02);
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < fs.length; i++) { r -= w[i]; if (r <= 0) return fs[i]; }
  return fs[fs.length - 1];
}
function seatPerson({ id, name, filler = false, donor = false, avatar = '' }) {
  const gender = filler ? null : guessGenderFromName(name);
  if (!SITTERS.length) return null;
  const slot = pickSlot();
  if (!slot) {
    // hết chỗ: mời người ngồi lâu nhất (không phải donor đang đi) ra về
    const old = people.filter((p) => !p.filler && p.state === 'seated').sort((a, b) => a.born - b.born)[0] || people.find((p) => p.filler && p.state === 'seated');
    if (!old) return null;
    removePerson(old, true);
    return seatPerson({ id, name, filler, donor, avatar });
  }
  const sitIdx = pickSitter(gender);
  const t = now();
  const p = { uid: nextUid++, id, name, avatar, filler, gender, genderSrc: gender ? 'name' : null, sit: sitIdx, slot, born: t, expires: filler ? Infinity : t + CFG.seating.seatSeconds, alpha: 0, fadeIn: CFG.seating.fadeSeconds, state: 'seated', leaving: false, bob: rnd(0, 6.28) };
  slot.occupied = p; people.push(p);
  if (!filler) enrichPerson(p);
  return p;
}
// ---- giới tính & avatar ----
function pickSitter(g) {
  const all = SITTERS.map((s, i) => i);
  let cand = g ? all.filter((i) => SITTERS[i].gender === g) : all;
  if (!cand.length) cand = all.filter((i) => !SITTERS[i].gender);
  if (!cand.length) cand = all;
  const used = new Map(); for (const p of people) used.set(p.sit, (used.get(p.sit) || 0) + 1);
  const min = Math.min(...cand.map((i) => used.get(i) || 0));
  const best = cand.filter((i) => (used.get(i) || 0) === min);
  return best[Math.floor(Math.random() * best.length)];
}
const walkerUse = new Map();
function pickWalker(g) {
  const all = Object.values(WALKERS);
  if (!all.length) return null;
  // bộ chưa gắn giới tính (chung) luôn được tính vào
  let cand = g ? all.filter((w) => w.gender === g || !w.gender) : all;
  if (!cand.length) cand = all;
  const min = Math.min(...cand.map((w) => walkerUse.get(w.name) || 0));
  const best = cand.filter((w) => (walkerUse.get(w.name) || 0) === min);
  const pick = best[Math.floor(Math.random() * best.length)];
  walkerUse.set(pick.name, (walkerUse.get(pick.name) || 0) + 1);
  return pick.name;
}
const strip = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
const NAME_F = new Set('thi lan hoa mai linh trang huong ngoc thao hang nhung yen vy nga nhi thu ha hanh hien huyen loan ly nguyet oanh phuong quyen thuy tram tuyet uyen van xuan diep dieu giang hong kieu lien lieu nhan thu thuy trinh chau dung2 my my2 hue tham tien2 nhu quynh ngan ngoc anh2 maria anna teresa teresa lucia martha marta rosa agnes cecilia catarina monica isave madalena elizabeth mary sarah emma olivia sophia anna jessica jennifer emily lisa linda susan karen nancy betty helen sandra donna carol ruth sharon michelle laura amy kim angela melissa rebecca stephanie nicole hannah grace chloe lily zoe mia ella ava girl gai chi me co ba2 baby2 lady queen princess miss ms mrs nu sister mama mom wife vo'.split(' '));
const NAME_M = new Set('van hung dung cuong tuan hai long nam quang duc thang phuc khoa bao huy hoang kien lam loc manh nghia nhan2 phong quan son tai thanh2 thien toan trung tung vinh viet vu dat dinh duy hieu hung khoi luan nguyen phat thinh tien tri trong minh giuse phero gioan phaolo anton daminh giacobe phanxico micae gabriel gioakim john james robert michael william david richard joseph thomas charles daniel matthew anthony mark paul steven andrew kevin brian george edward ryan jacob gary eric peter jack henry boy trai ong bo chu bac anh3 mr king prince bro brother dad papa husband chong'.split(' '));
const EMO_F = /[🌸🌷💅👸💖💕🎀🦋👩💄🌺💗💞👧🧚]/u, EMO_M = /[👨🧔👦🤴💪⚽]/u;
function guessGenderFromName(name) {
  if (!name || CFG.characters.genderMode === 'off') return null;
  let f = 0, m = 0;
  if (EMO_F.test(name)) f += 1; if (EMO_M.test(name)) m += 1;
  const toks = strip(name).split(/[^a-z]+/).filter(Boolean);
  toks.forEach((t, i) => {
    const w = i === toks.length - 1 ? 1.5 : 1;   // tên gọi tiếng Việt thường ở cuối
    if (t === 'thi') f += 3; if (t === 'van') m += 2;
    if (NAME_F.has(t)) f += w; if (NAME_M.has(t)) m += w;
  });
  // tên dính liền kiểu "lannguyen99": dò từ đầu chuỗi
  if (!f && !m && toks[0] && toks[0].length > 4) { for (const n of NAME_F) if (n.length >= 3 && toks[0].startsWith(n)) { f += 0.5; break; } for (const n of NAME_M) if (n.length >= 3 && toks[0].startsWith(n)) { m += 0.5; break; } }
  if (f > m) return 'f'; if (m > f) return 'm'; return null;
}
let faceReady = null;
function loadFaceApi() {
  if (faceReady) return faceReady;
  faceReady = new Promise((res) => {
    const sc = document.createElement('script'); sc.src = 'assets/faceapi/face-api.js';
    sc.onload = async () => {
      try {
        const tf = faceapi.tf;
        let ok = false;
        for (const b of ['webgl', 'cpu']) { try { if (await tf.setBackend(b)) { await tf.ready(); ok = true; break; } } catch {} }
        if (!ok) throw new Error('không khởi tạo được TensorFlow');
        const base = 'assets/faceapi';
        await faceapi.nets.tinyFaceDetector.loadFromUri(base);
        await faceapi.nets.ageGenderNet.loadFromUri(base);
        logp('Đã bật nhận diện giới tính qua avatar'); res(true);
      } catch (e) { window.__faceErr = e.message; logp('Không nạp được bộ nhận diện khuôn mặt: ' + e.message, 'warn'); res(false); }
    };
    sc.onerror = () => res(false);
    document.head.appendChild(sc);
  });
  return faceReady;
}
let faceChain = Promise.resolve();
function detectGender(img) {
  const job = faceChain.then(async () => {
    if (!(await loadFaceApi())) return null;
    try {
      const r = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 })).withAgeAndGender();
      if (!r || r.genderProbability < (CFG.characters.faceMinConf || 0.72)) return null;
      return { g: r.gender === 'female' ? 'f' : 'm', p: r.genderProbability };
    } catch { return null; }
  });
  faceChain = job.catch(() => {});
  return job;
}
async function loadAvatar(url) {
  if (!url) return null;
  let src = url;
  if (/^https?:/i.test(url)) { try { src = api.fetchUrl ? ((await api.fetchUrl(url)) || null) : url; } catch { src = null; } }
  if (!src) return null;
  return await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
async function enrichPerson(p) {
  if (!p.avatar) return;
  const img = await loadAvatar(p.avatar);
  if (!img) return;
  p.avatarImg = img;
  if (CFG.characters.genderMode !== 'auto') return;
  const r = await detectGender(img);
  if (!r) return;
  p.gender = r.g; p.genderSrc = 'face';
  // vừa mới hiện thì đổi luôn ảnh ngồi cho đúng giới tính
  if (p.state === 'seated' && !p.leaving && now() - p.born < 2.5 && SITTERS[p.sit] && SITTERS[p.sit].gender && SITTERS[p.sit].gender !== r.g) p.sit = pickSitter(r.g);
}
function removePerson(p, quick) { p.leaving = true; p.leaveStart = now(); p.leaveDur = quick ? 0.4 : CFG.seating.fadeSeconds; }
function findPerson(id) { return people.find((p) => p.id === id && !p.leaving); }
function namedCount() { return people.filter((p) => !p.filler && !p.leaving).length; }

function ensureFillers() {
  const want = CFG.seating.fillerCount;
  const have = people.filter((p) => p.filler && !p.leaving);
  for (let i = have.length; i < want; i++) seatPerson({ id: 'filler-' + nextUid, name: '', filler: true });
  for (let i = want; i < have.length; i++) if (have[i].state === 'seated') removePerson(have[i]);
}

// ---- sự kiện live ----
function onJoin(ev) {
  if (!assetsReady) return;
  if (ev.type !== 'gift' && !ev.noGreet) addGreet(ev);
  const ex = findPerson(ev.id);
  if (ex) { if (ex.state === 'seated') ex.expires = now() + CFG.seating.seatSeconds; return; }
  if (namedCount() >= CFG.seating.maxSeated) {
    const old = people.filter((p) => !p.filler && p.state === 'seated' && !p.leaving).sort((a, b) => a.born - b.born)[0];
    if (old) removePerson(old, true);
  }
  // nhường ghế của người ngồi sẵn nếu hết chỗ
  if (!freeSlots().length) { const f = people.find((p) => p.filler && p.state === 'seated' && !p.leaving); if (f) { f.slot.occupied = null; removePerson(f, true); } }
  seatPerson(ev);
}
function onGift(ev) {
  if (!assetsReady) return;
  const total = ev.total ?? (ev.diamonds || 0) * (ev.count || 1);
  if (total < CFG.donate.minDiamonds && !ev.sim) return;
  const tier = tierFor(total);
  let hold = false;
  if (tier) { enqueueVideo(ev, tier, ++giftSeq); hold = !!tier.walk && CFG.donate.walkAfterVideo; if (!tier.walk) { const p0 = findPerson(ev.id); if (p0 && !p0.avatar && ev.avatar) { p0.avatar = ev.avatar; enrichPerson(p0); } return; } }
  // gộp nếu đang đi / đang chờ
  const ex = findPerson(ev.id);
  if (ex && !ex.avatar && ev.avatar) { ex.avatar = ev.avatar; enrichPerson(ex); }
  const w = walkers.find((x) => x.person.id === ev.id && !x.done);
  if (w) { w.gifts.push(ev); w.count += ev.count || 1; if (w.phase === 'bless') { w.blessEnd += 3; pushBanner(w, ev); } return; }
  const q = queue.find((x) => x.id === ev.id);
  if (q) { q.count += ev.count || 1; if (hold) q.holdVideo = true; return; }
  queue.push({ ...ev, count: ev.count || 1, at: now(), seq: ++giftSeq, holdVideo: hold, noSpeech: !!(tier && !tier.speak) });
}
function altarSpots() {
  const g = G.g, s = g.altarSpread; return [g.centerX, g.centerX - s, g.centerX + s, g.centerX - 2 * s, g.centerX + 2 * s];
}
const APPROACH = ['wait', 'stand', 'side', 'turn', 'up'];
function walkProgress(w) {
  if (w.phase === 'wait') return 0;
  if (!APPROACH.includes(w.phase)) return 1;
  return clamp((now() - w.t0) / (w.tStand + w.tSide + w.tTurn + w.tUp), 0, 1);
}
function processQueue() {
  if (!queue.length) return;
  const act = walkers.filter((w) => !w.done);
  if (act.length >= CFG.donate.maxConcurrent) return;
  // người sau bắt đầu đi khi người trước đã đi gần tới bục
  if (act.some((w) => APPROACH.includes(w.phase) && walkProgress(w) < CFG.donate.nextAtFrac)) return;
  // chỗ quỳ còn trống (người đã rời bục thì trả chỗ)
  const usedSpots = new Set(act.filter((w) => w.spot != null && !['down', 'vanish'].includes(w.phase)).map((w) => w.spot));
  const spot = altarSpots().findIndex((_, i) => !usedSpots.has(i));
  if (spot < 0) return;
  // video chờ phát chặn những lượt đi đến sau nó (giữ đúng thứ tự donate)
  if (vcur || vq.loading) return;
  const vSeq = vq.length ? vq[0].seq : Infinity;
  const qi = queue.findIndex((q) => !q.holdVideo && (q.seq ?? 0) < vSeq);
  if (qi < 0) return;
  const ev = queue.splice(qi, 1)[0];
  let p = findPerson(ev.id);
  if (p && p.state !== 'seated') { queue.push(ev); return; }
  let delay = 0.2;
  if (!p) { p = seatPerson({ id: ev.id, name: ev.name, avatar: ev.avatar }); if (!p) return; p.fadeIn = 0.5; delay = 1.0; }
  startWalker(p, ev, spot, delay);
  const nw = walkers[walkers.length - 1]; if (nw && nw.ev === ev) nw.noSpeech = !!ev.noSpeech;
}

function startWalker(p, ev, spot, delay) {
  const sdef = SITTERS[p.sit];
  const gender = p.gender || (sdef && sdef.gender) || null;
  const setName = pickWalker(gender);
  if (!setName) return;
  const wg = WALKERS[setName].gender;
  // ảnh ngồi khi quay về ghế khớp giới tính với hoạt ảnh
  if (wg && sdef && sdef.gender && sdef.gender !== wg) p.sit = pickSitter(wg);
  toPanel({ type: 'log', msg: `${p.name}: giới tính ${({ m: 'nam', f: 'nữ' }[gender] || 'chưa rõ')}${p.genderSrc ? ' (' + (p.genderSrc === 'face' ? 'avatar' : 'tên') + ')' : ''} → hoạt ảnh "${setName}"` });
  const s = p.slot, d = CFG.donate, g = G.g;
  const dir = s.side === 'L' ? 1 : -1; // hướng ra lối đi
  const inner = G.innerL(s.y);
  // điểm cuối ghế (vẫn bị lưng ghế che) và làn đi giữa lối đi
  const endX = s.side === 'L' ? inner - s.slotW * 0.3 : 2 * g.centerX - inner + s.slotW * 0.3;
  const u0 = -dir * 0.4;                                             // vị trí ngang trong làn (-1..1) khi bước ra
  const altarX = altarSpots()[spot];
  const total = Math.max(3, d.walkSeconds);
  const tStand = Math.min(1.0, total * 0.12);
  const tTurn = Math.min(0.6, total * 0.06);
  const sideDist = Math.abs(endX - s.x) / s.ppm;              // mét
  const upDist = 4 + 10 * (s.k / Math.max(1, G.rows.length - 1)); // ước lượng mét từ hàng ghế tới bục
  const tRest = total - tStand - tTurn;
  const sideFrac = clamp(sideDist / (sideDist + upDist), 0.12, 0.4);
  walkers.push({
    person: p, set: setName, ev, gifts: [ev], count: ev.count || 1, spot, dir,
    phase: 'wait', t0: now() + delay, tStand, tTurn, tSide: tRest * sideFrac, tUp: tRest * (1 - sideFrac),
    x: s.x, rail: s.y, endX, u0, altarX, done: false, alpha: 1, frameT: 0, inPew: true, reveal: 0, rise: 0
  });
}
// ================== VÒNG LẶP ==================
let last = now();
function update(dt) {
  const t = now();
  for (const p of people) if (!p.leaving && p.state === 'seated' && !p.filler && t > p.expires) removePerson(p);
  for (const p of people) {
    if (p.leaving) p.alpha = clamp(1 - (t - p.leaveStart) / p.leaveDur, 0, 1);
    else if (p.state === 'seated') p.alpha = clamp((t - p.born) / Math.max(0.05, p.fadeIn), 0, 1);
  }
  people = people.filter((p) => { if (p.leaving && p.alpha <= 0) { if (p.slot.occupied === p) p.slot.occupied = null; return false; } return true; });
  ensureFillers();
  processQueue();
  stepVideo();
  for (const w of walkers) stepWalker(w, t, dt);
  walkers = walkers.filter((w) => !w.done);
  fx = fx.filter((f) => (f.life -= dt) > 0);
  for (const f of fx) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy -= 8 * dt; }
  banners = banners.filter((b) => (b.shownAt == null ? t - b.start < 90 : t < b.shownAt + bannerDur(b) + 1));
}
// Làn đi bộ: chỉ trong thảm lối đi giữa (không lấn sang ghế/đèn/hoa hai bên)
function laneHalf(rail) {
  const g = G.g, half = g.centerX - G.innerL(rail);
  const near = clamp((G.rows[3] - rail) / Math.max(1, G.rows[3] - G.altarRail), 0, 1); // sát bục thì bậc thềm rộng hơn
  return half * lerp(g.laneFrac, 0.95, near);
}
function laneX(w, rail, u) {
  const half = laneHalf(rail), fr = WALKERS[w.set] && WALKERS[w.set].back1;
  const wid = standH(rail) * (fr ? fr.ar : 0.45);
  const lim = Math.max(0, half - wid * 0.42);
  return G.g.centerX + clamp(u * half, -lim, lim);
}
const altarU = (w) => (w.altarX - G.g.centerX) / laneHalf(G.altarRail);
const railAlongAisle =(r0, r1, k) => G.railFromPpm(1 / lerp(1 / G.ppm(r0), 1 / G.ppm(r1), k)); // đều theo chiều sâu

function stepWalker(w, t, dt) {
  const p = w.person, d = CFG.donate, s = p.slot;
  const e = t - w.t0;
  if (e < 0) return;
  if (w.phase === 'wait') { w.phase = 'stand'; p.state = 'walking'; }
  const S = w.tStand, A = S + w.tSide, B = A + w.tTurn, C = B + w.tUp;
  if (['stand', 'side', 'turn', 'up'].includes(w.phase)) {
    if (e < S) { w.phase = 'stand'; w.rise = ease(e / S); w.x = s.x; w.rail = s.y; w.inPew = true; w.reveal = 0; w.pose = 'back1'; w.moving = false; }
    else if (e < A) { w.phase = 'side'; w.rise = 1; w.x = lerp(s.x, w.endX, ease((e - S) / w.tSide)); w.inPew = true; w.reveal = 0; w.pose = w.dir > 0 ? 'right' : 'left'; w.moving = true; }
    else if (e < B) { const k = ease((e - A) / w.tTurn); w.phase = 'turn'; w.rail = s.y; w.x = lerp(w.endX, laneX(w, s.y, w.u0), k); w.inPew = true; w.reveal = k; w.pose = k < 0.6 ? (w.dir > 0 ? 'right' : 'left') : 'back1'; w.moving = k < 0.6; }
    else if (e < C) {
      w.phase = 'up'; w.inPew = false; w.pose = 'back'; w.moving = true;
      const k = clamp((e - B) / w.tUp, 0, 1);
      w.rail = railAlongAisle(s.y, G.altarRail, k); w.x = laneX(w, w.rail, lerp(w.u0, altarU(w), ease(k)));
    } else {
      w.phase = 'bless'; w.blessStart = t; w.blessEnd = t + d.blessSeconds; w.rail = G.altarRail; w.x = w.altarX; w.moving = false;
      w.pose = CFG.characters.blessPose === 'bow' ? 'bow' : 'kneel';
      startBlessing(w);
    }
  } else if (w.phase === 'bless') {
    if (Math.random() < dt * 18) spawnSparkle(w);
    if (t > w.blessEnd) { if (d.afterBless === 'vanish') { w.phase = 'vanish'; w.vStart = t; } else { w.phase = 'down'; w.dStart = t; } }
  } else if (w.phase === 'vanish') {
    const k = (t - w.vStart) / 2.2; w.alpha = 1 - k; w.lift = k * 40; if (Math.random() < dt * 30) spawnSparkle(w);
    if (k >= 1) { w.done = true; finishPerson(w, false); }
  } else if (w.phase === 'down') {
    const total = Math.max(3, d.returnSeconds); const tSt = 0.6, tDown = total * 0.6, tTurn = 0.4, tSide = total - tDown - tSt - tTurn;
    const e2 = t - w.dStart;
    if (e2 < tSt) { w.pose = 'front1'; w.moving = false; }
    else if (e2 < tSt + tDown) {
      w.pose = 'front'; w.moving = true; w.inPew = false;
      const k = (e2 - tSt) / tDown;
      w.rail = railAlongAisle(G.altarRail, s.y, k); w.x = laneX(w, w.rail, lerp(altarU(w), w.u0, ease(k)));
    } else if (e2 < tSt + tDown + tTurn) { const k = ease((e2 - tSt - tDown) / tTurn); w.rail = s.y; w.x = lerp(laneX(w, s.y, w.u0), w.endX, k); w.inPew = true; w.reveal = 1 - k; w.pose = k > 0.4 ? (w.dir > 0 ? 'left' : 'right') : 'front1'; w.moving = k > 0.4; }
    else if (e2 < total) {
      w.rail = s.y; w.inPew = true; w.reveal = 0; w.pose = w.dir > 0 ? 'left' : 'right'; w.moving = true; w.x = lerp(w.endX, s.x, ease((e2 - tSt - tDown - tTurn) / tSide));
    } else { w.done = true; finishPerson(w, true); }
  }
  if (w.moving) w.frameT += dt;
}
function finishPerson(w, reseat) {
  const p = w.person;
  if (reseat) { p.state = 'seated'; p.born = now(); p.fadeIn = 0.35; p.expires = now() + CFG.donate.seatAfterSeconds; p.donated = true; }
  else { p.state = 'seated'; p.leaving = true; p.leaveStart = now() - 10; p.leaveDur = 0.1; p.alpha = 0; }
}

function startBlessing(w) {
  chime();
  const ev = w.ev;
  if (CFG.donate.speakBlessing && !w.noSpeech) speakBlessing(blessingLine({ name: cleanName(w.person.name), gift: ev.gift || '', count: w.count }));
  pushBanner(w, ev);
  for (let i = 0; i < 40; i++) spawnSparkle(w, true);
  toPanel({ type: 'blessed', name: w.person.name, gift: ev.gift, count: w.count });
}
function pushBanner(w, ev) {
  if (!CFG.donate.showBanner) return;
  const o = { name: cleanName(w.person.name), gift: ev.gift || 'quà', count: w.count };
  const old = banners.find((b) => b.w === w);
  if (old) { old.title = fmt(CFG.donate.banner, o); old.sub = fmt(CFG.donate.bannerSub, o); return; }
  banners.push({ w, title: fmt(CFG.donate.banner, o), sub: fmt(CFG.donate.bannerSub, o), name: o.name, start: now(), shownAt: null });
}
function spawnSparkle(w, burst) {
  const h = standH(w.rail), foot = G.footOfRail(w.rail);
  fx.push({ x: w.x + rnd(-h * 0.35, h * 0.35), y: foot - rnd(0, h * 0.9), vx: rnd(-12, 12), vy: burst ? rnd(-90, -20) : rnd(-40, -10), life: rnd(1.2, 2.6), max: 2.6, r: rnd(2, 5.5) });
}
function cleanName(n) { n = String(n || '').trim(); const m = CFG.seating.nameMaxChars; return [...n].length > m ? [...n].slice(0, m - 1).join('') + '…' : n; }

// ================== VIDEO CHÚC PHÚC THEO MỨC XU ==================
function tierFor(total) {
  const ts = (CFG.donate.tiers || []).filter((t) => t && t.enabled !== false && (t.videos || []).length && total >= t.min);
  ts.sort((a, b) => b.min - a.min);
  return ts[0] || null;
}
const vidEl = document.createElement('video'); vidEl.playsInline = true; vidEl.preload = 'auto';
const vidGain = AC.createGain(); vidGain.connect(master);
try { AC.createMediaElementSource(vidEl).connect(vidGain); } catch {}
let vq = [], vcur = null;
const videoPlaying = () => !!vcur;
let giftSeq = 0;
function enqueueVideo(ev, tier, seq) {
  const it = { seq, ev, tier, name: cleanName(ev.name), avatar: ev.avatar, count: ev.count || 1 };
  const p = findPerson(ev.id); if (p) it.person = p;
  loadAvatar(ev.avatar).then((img) => { it.avatarImg = img || (p && p.avatarImg) || null; });
  vq.push(it);
  if (vq.length > 30) vq.shift();
  toPanel({ type: 'log', msg: `🎬 ${ev.name}: ${ev.total ?? ''} xu → video mức ${tier.min} xu` });
}
function absUrl(f) { return /^church:|^https?:|^data:/.test(f) ? f : 'church://abs/' + encodeURIComponent(String(f).replace(/\\/g, '/')); }
async function stepVideo() {
  if (vcur) {
    const t = now();
    const maxS = vcur.tier.maxSeconds || CFG.donate.videoMaxSeconds || 0;
    if (!vcur.ending && (vidEl.ended || (maxS > 0 && t - vcur.start > maxS) || vcur.failed)) { vcur.ending = t; }
    if (vcur.ending && t - vcur.ending > 0.7) {
      try { vidEl.pause(); } catch {}
      const done = vcur; vcur = null; ducked = false; applyAudio();
      const q = queue.find((x) => x.id === done.ev.id); if (q && !vq.some((v) => v.ev.id === done.ev.id)) q.holdVideo = false;
    }
    return;
  }
  if (!vq.length || vq.loading) return;
  // đợi những người đang đi lên / đang được chúc phúc xong, và các lượt donate trước video
  if (walkers.some((w) => !w.done && (APPROACH.includes(w.phase) || w.phase === 'bless'))) return;
  if (queue.some((q) => (q.seq ?? 0) < vq[0].seq)) return;
  const it = vq.shift();
  const files = it.tier.videos || []; if (!files.length) return;
  const f = files[Math.floor(Math.random() * files.length)];
  vq.loading = true;
  vidEl.src = absUrl(f); vidEl.currentTime = 0; vidEl.loop = false;
  vidGain.gain.value = clamp(CFG.donate.videoVolume ?? 1, 0, 2);
  try { await vidEl.play(); } catch (e) { logp('Không phát được video ' + f + ': ' + e.message, 'error'); vq.loading = false; const q = queue.find((x) => x.id === it.ev.id); if (q) q.holdVideo = false; return; }
  vq.loading = false;
  vcur = { ...it, start: now() };
  if (!it.avatarImg && it.person && it.person.avatarImg) vcur.avatarImg = it.person.avatarImg;
  ducked = true; applyAudio(); chime();
  try { cur.src && sermon.state === 'playing' && 0; } catch {}
  if (it.tier.speak && CFG.donate.speakBlessing) speakBlessing(blessingLine({ name: it.name, gift: it.ev.gift || '', count: it.count }));
  toPanel({ type: 'blessed', name: it.ev.name, gift: it.ev.gift, count: it.count });
}
function drawVideo(t) {
  window.__vcur = vcur ? vcur.name : null;
  if (!vcur) return;
  const a = Math.min(clamp((t - vcur.start) / 0.6, 0, 1), vcur.ending ? clamp(1 - (t - vcur.ending) / 0.7, 0, 1) : 1);
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const vw = vidEl.videoWidth, vh = vidEl.videoHeight;
  if (vw && vh) {
    const fit = CFG.donate.videoFit === 'contain' ? Math.min(W / vw, H / vh) : Math.max(W / vw, H / vh);
    const dw = vw * fit, dh = vh * fit;
    ctx.drawImage(vidEl, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  // dòng dưới: avatar + tên
  const o = { name: vcur.name, gift: vcur.ev.gift || '', count: vcur.count };
  const text = fmt(vcur.tier.text || '{name} đã được chúc phúc', o), sub = fmt(vcur.tier.sub || '', o);
  const cy = H - (CFG.donate.videoBarBottom ?? 230);
  const g = ctx.createLinearGradient(0, cy - 150, 0, cy + 150);
  g.addColorStop(0, 'rgba(20,10,2,0)'); g.addColorStop(0.35, 'rgba(20,10,2,0.72)'); g.addColorStop(0.65, 'rgba(20,10,2,0.72)'); g.addColorStop(1, 'rgba(20,10,2,0)');
  ctx.fillStyle = g; ctx.fillRect(0, cy - 150, W, 300);
  const av = 104, gap = 24, showAv = CFG.donate.bannerAvatar !== false;
  let fs = 64; ctx.font = `700 ${fs}px Cormorant, Georgia, serif`;
  while (ctx.measureText(text).width + (showAv ? av + gap : 0) > W - 80 && fs > 28) { fs -= 2; ctx.font = `700 ${fs}px Cormorant, Georgia, serif`; }
  const tw = ctx.measureText(text).width, total = (showAv ? av + gap : 0) + tw, x0 = W / 2 - total / 2, ty = sub ? cy - 18 : cy;
  if (showAv) drawAvatar({ avatarImg: vcur.avatarImg }, x0 + av / 2, ty, av / 2, vcur.name);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255,190,80,0.95)'; ctx.shadowBlur = 20; ctx.fillStyle = '#ffe9b0';
  ctx.fillText(text, x0 + (showAv ? av + gap : 0), ty);
  ctx.shadowBlur = 0;
  if (sub) { ctx.textAlign = 'center'; ctx.font = '500 32px BeVN, "Segoe UI", sans-serif'; ctx.fillStyle = '#f6dcae'; ctx.fillText(sub, W / 2, cy + 46); }
  ctx.restore();
}

// ================== PHỤ ĐỀ BÀI GIẢNG ==================
let subLayout = null;
function layoutSub(S, font, w) {
  ctx.font = font;
  const space = ctx.measureText(' ').width, lines = [[]]; let lw = 0;
  S.sents.forEach((sent, si) => {
    for (const word of sent.split(/\s+/).filter(Boolean)) {
      const ww = ctx.measureText(word).width;
      if (lw > 0 && lw + space + ww > w) { lines.push([]); lw = 0; }
      lines[lines.length - 1].push({ word, si, x: lw ? lw + space : 0, w: ww });
      lw += (lw ? space : 0) + ww;
    }
  });
  return lines;
}
function drawSubtitles(t) {
  const c = CFG.subtitles; if (!c || !c.enabled || !SUB.sents.length || !CFG.audio.sermonEnabled) return;
  const k = c.scale || 1, x = c.x, y = c.y, w = c.w * k, h = c.h * k, pad = 22 * k, fs = c.fontSize * k, lh = fs * 1.32;
  const font = `700 ${fs}px Cormorant, Georgia, serif`;
  const key = SUB.changed + '|' + fs + '|' + w;
  if (!subLayout || subLayout.key !== key) subLayout = { key, lines: layoutSub(SUB, font, w - pad * 2), scroll: 0 };
  const lines = subLayout.lines;
  const fadeIn = clamp((t - SUB.changed) / 0.5, 0, 1);
  ctx.save();
  // nền
  ctx.globalAlpha = 1;
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, `rgba(22,11,2,${c.bgAlpha})`); g.addColorStop(1, `rgba(22,11,2,${c.bgAlpha * 0.85})`);
  ctx.fillStyle = g; roundRect(x, y, w, h, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(255,214,120,0.55)'; ctx.lineWidth = 2; ctx.stroke();
  let top = y + pad;
  if (c.showTitle && SUB.title) {
    ctx.font = `700 ${Math.round(fs * 0.62)}px BeVN, "Segoe UI", sans-serif`; ctx.fillStyle = 'rgba(255,214,120,0.95)'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    let tt = '✝ ' + SUB.title; while (ctx.measureText(tt).width > w - pad * 2 && tt.length > 6) tt = tt.slice(0, -2);
    if (tt !== '✝ ' + SUB.title) tt += '…';
    ctx.fillText(tt, x + pad, top); top += fs * 0.62 * 1.6;
    ctx.fillStyle = 'rgba(255,214,120,0.35)'; ctx.fillRect(x + pad, top - fs * 0.3, w - pad * 2, 1.5);
  }
  const areaH = y + h - pad - top;
  // cuộn để câu đang đọc luôn nằm trong khung
  const curLine = lines.findIndex((L) => L.some((wd) => wd.si === SUB.cur));
  let want = 0;
  if (curLine >= 0) { const total = lines.length * lh; want = clamp(curLine * lh - areaH * 0.3, 0, Math.max(0, total - areaH)); }
  subLayout.scroll += (want - subLayout.scroll) * 0.08;
  ctx.beginPath(); ctx.rect(x, top - 4, w, areaH + 8); ctx.clip();
  ctx.font = font; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  lines.forEach((L, li) => {
    const ly = top + li * lh - subLayout.scroll;
    if (ly < top - lh || ly > top + areaH) return;
    for (const wd of L) {
      const curS = wd.si === SUB.cur, read = wd.si < SUB.cur;
      if (curS) { ctx.shadowColor = 'rgba(255,190,70,0.95)'; ctx.shadowBlur = 16; ctx.fillStyle = '#ffe39a'; }
      else { ctx.shadowBlur = 0; ctx.fillStyle = read ? `rgba(255,240,215,${c.readAlpha})` : `rgba(255,240,215,${c.dimAlpha})`; }
      ctx.globalAlpha = fadeIn; ctx.fillText(wd.word, x + pad + wd.x, ly);
    }
  });
  ctx.restore();
}

// ================== VẼ ==================
function drawBG() {
  if (videoOK && video.readyState >= 2) ctx.drawImage(video, 0, 0, W, H);
  else if (posterImg) ctx.drawImage(posterImg, 0, 0, W, H);
  else { ctx.fillStyle = '#201510'; ctx.fillRect(0, 0, W, H); }
}
function drawSeated(p, t) {
  const s = p.slot, sd = SITTERS[p.sit]; if (!sd) return;
  const img = s.side === 'R' ? sd.cropFlip : sd.crop;
  const h = s.cropH, w = h * sd.aspect;
  const breathe = Math.sin(t * 1.3 + p.bob) * h * 0.005;
  const x = s.x - w / 2, y = s.headTop + breathe;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, s.y + 1); ctx.clip();   // lưng ghế che phần dưới
  ctx.globalAlpha = p.alpha;
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
  p._head = { x: s.x + (s.side === 'R' ? -1 : 1) * w * 0.03, y: y + h * 0.02 };
}
function frameFor(w) {
  const set = WALKERS[w.set]; if (!set) return null;
  const step = Math.floor(w.frameT * CFG.donate.walkFps) % 2 === 0 ? '1' : '2';
  if (['left', 'right', 'back', 'front'].includes(w.pose)) return set[w.pose + (w.moving ? step : '1')];
  return set[w.pose] || set.back1;
}
function drawWalker(w, t) {
  const fr = frameFor(w); if (!fr) return;
  const s = w.person.slot;
  let hgt = standH(w.rail);
  if (w.pose === 'kneel') hgt *= 0.64;
  const wid = hgt * fr.ar;
  const bob = w.moving ? Math.abs(Math.sin(w.frameT * CFG.donate.walkFps * Math.PI)) * hgt * 0.012 : 0;
  let footY = G.footOfRail(w.rail) - (w.lift || 0);
  if (w.phase === 'stand') footY += (1 - w.rise) * hgt * 0.42;  // đứng dậy
  const x = w.x - wid / 2, y = footY - hgt - bob;
  if (w.phase === 'bless' || w.phase === 'vanish') drawHalo(w, hgt, footY, t);
  ctx.save();
  if (w.inPew) { const cy = lerp(s.y + 1, footY + 2, w.reveal || 0); ctx.beginPath(); ctx.rect(0, 0, W, cy); ctx.clip(); }
  if (!w.inPew || w.reveal > 0.5) { ctx.globalAlpha = 0.32 * w.alpha * (w.inPew ? w.reveal : 1); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(w.x, footY, wid * 0.42, hgt * 0.03, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = clamp(w.alpha, 0, 1);
  ctx.drawImage(fr.img, x, y, wid, hgt);
  ctx.restore();
  w._head = { x: w.x, y };
}
function drawHalo(w, hgt, footY, t) {
  const k = w.phase === 'vanish' ? 1 : clamp((t - w.blessStart) / 1.2, 0, 1);
  const cy = footY - hgt * 0.55, r = hgt * (0.9 + 0.08 * Math.sin(t * 2.4));
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(w.x, cy, 0, w.x, cy, r);
  g.addColorStop(0, `rgba(255,236,170,${0.55 * k * w.alpha})`); g.addColorStop(0.5, `rgba(255,200,90,${0.22 * k * w.alpha})`); g.addColorStop(1, 'rgba(255,180,60,0)');
  ctx.fillStyle = g; ctx.fillRect(w.x - r, cy - r, r * 2, r * 2);
  ctx.restore();
}
function drawBeams(t) {
  for (const w of walkers) {
    if (w.phase !== 'bless' && w.phase !== 'vanish') continue;
    const into = clamp((t - w.blessStart) / 1.0, 0, 1), out = w.phase === 'vanish' ? clamp(1 - (t - w.vStart) / 2.2, 0, 1) : clamp((w.blessEnd - t) / 0.8, 0, 1);
    const a = into * out * (0.75 + 0.25 * Math.sin(t * 3));
    const topX = G.g.centerX, topY = CFG.donate.beamTopY ?? 800, bx = w.x, by = G.footOfRail(w.rail), hgt = standH(w.rail);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createLinearGradient(0, topY, 0, by + hgt * 0.08);
    gr.addColorStop(0, `rgba(255,240,190,${0.0})`); gr.addColorStop(0.25, `rgba(255,236,170,${0.3 * a})`); gr.addColorStop(0.9, `rgba(255,215,120,${0.5 * a})`); gr.addColorStop(1, 'rgba(255,215,120,0)');
    ctx.fillStyle = gr; ctx.beginPath();
    ctx.moveTo(topX - 18, topY); ctx.lineTo(topX + 18, topY); ctx.lineTo(bx + hgt * 0.5, by + hgt * 0.08); ctx.lineTo(bx - hgt * 0.5, by + hgt * 0.08); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
function drawFX() {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const f of fx) {
    const a = clamp(f.life / f.max, 0, 1);
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 3);
    g.addColorStop(0, `rgba(255,250,215,${a})`); g.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = g; ctx.fillRect(f.x - f.r * 3, f.y - f.r * 3, f.r * 6, f.r * 6);
  }
  ctx.restore();
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function nameTag(text, cx, by, size, alpha, gold) {
  if (!text) return;
  ctx.font = `700 ${size}px BeVN, "Segoe UI", "Segoe UI Emoji", sans-serif`;
  const tw = ctx.measureText(text).width, pad = size * 0.55, h = size * 1.45, w = tw + pad * 2;
  const x = clamp(cx - w / 2, 4, W - w - 4), y = by - h;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = gold ? 'rgba(70,40,5,0.82)' : 'rgba(25,14,6,0.62)';
  roundRect(x, y, w, h, h / 2); ctx.fill();
  ctx.lineWidth = Math.max(1.2, size * 0.08); ctx.strokeStyle = gold ? 'rgba(255,214,120,0.95)' : 'rgba(240,200,130,0.55)'; ctx.stroke();
  ctx.fillStyle = gold ? '#ffe7a6' : '#fff4e0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2 + size * 0.04);
  ctx.globalAlpha = 1;
}
function drawNames() {
  if (!CFG.seating.showNames) return;
  const ns = CFG.seating.nameScale;
  const tags = [];
  for (const p of people) if (!p.filler && p.state === 'seated' && p._head && p.alpha > 0.02) tags.push({ txt: cleanName(p.name), x: p._head.x, y: p._head.y - 4, size: clamp(p.slot.ppm * 0.12, 13, 24) * ns, a: p.alpha, gold: !!p.donated, z: p.slot.y });
  for (const w of walkers) if (w._head && w.phase !== 'wait') tags.push({ txt: cleanName(w.person.name), x: w._head.x, y: w._head.y - 6, size: clamp(G.ppm(w.rail) * 0.16, 18, 30) * ns, a: clamp(w.alpha, 0, 1), gold: true, z: 1e6 });
  // gần (z lớn) được ưu tiên giữ chỗ; tên xa bị đè thì đẩy lên, vẫn vướng thì mờ đi
  tags.sort((a, b) => b.z - a.z);
  const placed = [];
  for (const t of tags) {
    ctx.font = `700 ${t.size}px BeVN, "Segoe UI", sans-serif`;
    const w = ctx.measureText(t.txt).width + t.size * 1.1, h = t.size * 1.45;
    let y = t.y, ok = false;
    for (let tries = 0; tries < 4; tries++) {
      const box = { x0: t.x - w / 2, x1: t.x + w / 2, y0: y - h, y1: y };
      if (!placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) { placed.push(box); ok = true; break; }
      y -= h * 0.55;
    }
    t.y = y; t.dim = !ok;
  }
  tags.reverse();
  for (const t of tags) nameTag(t.txt, t.x, t.y, t.size, t.a * (t.dim ? 0.35 : 1), t.gold);
}
function bannerAvoid() {
  const z = [];
  for (const f of (CFG.donate.avoidZones || [])) if (f && f.w && f.h) z.push(f);   // hình Chúa Giêsu, thánh giá
  const sc = CFG.subtitles || {}; if (sc.enabled) z.push(subRect());
  const gc = CFG.greet || {}; if (gc.enabled) z.push(greetRect());
  return z;
}
const bannerDur = () => Math.max(2, CFG.donate.bannerSeconds || 5);
function drawBanners(t) {
  const d = CFG.donate, k = d.bannerScale || 1, max = Math.max(1, d.bannerMax || 1);
  // băng chờ lượt: chỉ hiện tối đa `max` băng, băng sau đợi băng trước tắt
  const list = banners.filter((b) => b.shownAt != null && t < b.shownAt + bannerDur(b) + 1);
  for (const b of banners) { if (list.length >= max) break; if (b.shownAt == null) { b.shownAt = t; list.push(b); } }
  const gw = Math.min(W, (d.bannerWidth || 900)), gh = 116 * k, sp = gh + 12 * k;
  const zones = bannerAvoid();
  let y = (d.bannerY ?? 110);
  list.forEach((b, i) => {
    const inA = clamp((t - b.shownAt) / 0.6, 0, 1), outA = clamp((b.shownAt + bannerDur(b) + 1 - t) / 1, 0, 1), a = Math.min(inA, outA);
    // tìm chỗ trống theo chiều dọc, tránh mặt Chúa và các khung chữ
    let cy = y;
    for (let guard = 0; guard < 8; guard++) {
      const hit = zones.find((z) => cy + gh / 2 > z.y && cy - gh / 2 < z.y + z.h && W / 2 + gw / 2 > z.x && W / 2 - gw / 2 < z.x + z.w);
      if (!hit) break; cy = hit.y + hit.h + gh / 2 + 8;
    }
    y = cy + sp;
    if (a <= 0) return;
    cy -= (1 - inA) * 30;
    ctx.save(); ctx.globalAlpha = a;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const gr = ctx.createLinearGradient(W / 2 - gw / 2, 0, W / 2 + gw / 2, 0);
    gr.addColorStop(0, 'rgba(40,20,4,0)'); gr.addColorStop(0.16, 'rgba(40,20,4,0.75)'); gr.addColorStop(0.84, 'rgba(40,20,4,0.75)'); gr.addColorStop(1, 'rgba(40,20,4,0)');
    ctx.fillStyle = gr; ctx.fillRect(W / 2 - gw / 2, cy - gh / 2, gw, gh);
    ctx.fillStyle = 'rgba(255,214,120,0.85)'; ctx.fillRect(W / 2 - gw * 0.33, cy - gh / 2, gw * 0.66, 2); ctx.fillRect(W / 2 - gw * 0.33, cy + gh / 2 - 2, gw * 0.66, 2);
    const showAv = d.bannerAvatar !== false;
    const av = (d.bannerAvatarSize || 86) * k, gap = showAv ? 20 * k : 0, avW = showAv ? av : 0;
    let fs = 56 * k; ctx.font = `700 ${fs}px Cormorant, Georgia, serif`;
    while (ctx.measureText(b.title).width + avW + gap > gw * 0.94 && fs > 20) { fs -= 2; ctx.font = `700 ${fs}px Cormorant, Georgia, serif`; }
    const tw = ctx.measureText(b.title).width, total = avW + gap + tw, x0 = W / 2 - total / 2, ty = b.sub ? cy - 14 * k : cy;
    if (showAv) drawAvatar(b.w.person, x0 + av / 2, ty, av / 2, b.name);
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(255,190,80,0.9)'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffe9b0'; ctx.fillText(b.title, x0 + avW + gap, ty);
    ctx.shadowBlur = 0; ctx.textAlign = 'center';
    ctx.font = `500 ${30 * k}px BeVN, "Segoe UI", sans-serif`; ctx.fillStyle = '#f6dcae';
    if (b.sub) ctx.fillText(b.sub, W / 2, cy + 38 * k);
    ctx.restore();
  });
}
// ================== BẢNG CHÀO NGƯỜI VÀO LIVE ==================
const greets = [];
function addGreet(ev) {
  const c = CFG.greet; if (!c || !c.enabled || !ev.name) return;
  const ex = greets.findIndex((g) => g.id === ev.id); if (ex >= 0) greets.splice(ex, 1);
  const g = { id: ev.id, name: cleanName(ev.name), t: now(), avatarImg: null };
  greets.unshift(g); if (greets.length > 40) greets.length = 40;
  if (c.avatar && ev.avatar) loadAvatar(ev.avatar).then((img) => { g.avatarImg = img; });
}
function greetRect() { const c = CFG.greet, k = c.scale || 1; return { x: c.x, y: c.y, w: c.w * k, h: c.h * k }; }
function subRect() { const c = CFG.subtitles, k = c.scale || 1; return { x: c.x, y: c.y, w: c.w * k, h: c.h * k }; }
function drawGreet(t) {
  const c = CFG.greet; if (!c || !c.enabled) return;
  const R0 = greetRect(), k = c.scale || 1, pad = 18 * k, fs = c.fontSize * k, rowH = fs * 1.9;
  ctx.save();
  const g = ctx.createLinearGradient(R0.x, 0, R0.x + R0.w, 0);
  g.addColorStop(0, `rgba(22,11,2,${c.bgAlpha * 0.85})`); g.addColorStop(1, `rgba(22,11,2,${c.bgAlpha})`);
  ctx.fillStyle = g; roundRect(R0.x, R0.y, R0.w, R0.h, 18 * k); ctx.fill();
  ctx.strokeStyle = 'rgba(255,214,120,0.55)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.font = `700 ${fs * 1.05}px Cormorant, Georgia, serif`; ctx.fillStyle = '#ffd98a';
  ctx.shadowColor = 'rgba(255,190,80,0.8)'; ctx.shadowBlur = 10;
  let title = c.title || ''; while (ctx.measureText(title).width > R0.w - pad * 2 && title.length > 4) title = title.slice(0, -1);
  ctx.fillText(title, R0.x + R0.w / 2, R0.y + pad + fs * 0.6); ctx.shadowBlur = 0;
  const top = R0.y + pad + fs * 1.5;
  ctx.fillStyle = 'rgba(255,214,120,0.35)'; ctx.fillRect(R0.x + pad, top, R0.w - pad * 2, 1.5);
  ctx.beginPath(); ctx.rect(R0.x, top + 4, R0.w, R0.y + R0.h - top - 8); ctx.clip();
  const maxRows = Math.floor((R0.y + R0.h - pad - top) / rowH);
  const life = c.showSeconds || 0;
  const rows = greets.filter((x) => !life || t - x.t < life).slice(0, maxRows);
  rows.forEach((r, i) => {
    const age = t - r.t, slide = clamp(age / 0.45, 0, 1), fresh = age < (c.highlightSeconds || 4);
    const fade = life ? clamp((life - age) / 1.5, 0, 1) : 1;
    const ry = top + 8 + i * rowH + rowH / 2 - (1 - slide) * rowH * 0.6;
    ctx.globalAlpha = slide * fade * (fresh ? 1 : 0.78);
    let x = R0.x + pad;
    const av = fs * 1.4;
    if (c.avatar) { drawAvatar(r, x + av / 2, ry, av / 2, r.name); x += av + 12 * k; }
    const txt = fmt(c.item || '{name}', { name: r.name });
    ctx.font = `${fresh ? 700 : 500} ${fs}px BeVN, "Segoe UI", sans-serif`; ctx.textAlign = 'left';
    let s2 = txt; while (ctx.measureText(s2).width > R0.x + R0.w - pad - x && s2.length > 2) s2 = s2.slice(0, -2) + '…';
    if (fresh) { ctx.shadowColor = 'rgba(255,190,70,0.9)'; ctx.shadowBlur = 12; ctx.fillStyle = '#ffe39a'; } else { ctx.shadowBlur = 0; ctx.fillStyle = '#f3e6d0'; }
    ctx.fillText(s2, x, ry); ctx.shadowBlur = 0;
  });
  ctx.restore();
}

function drawAvatar(p, cx, cy, r, name) {
  ctx.save();
  ctx.shadowColor = 'rgba(255,200,90,0.9)'; ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.fillStyle = '#e8b85c'; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  if (p.avatarImg) {
    const im = p.avatarImg, s = Math.min(im.width, im.height);
    ctx.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, cx - r, cy - r, r * 2, r * 2);
  } else {
    const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r); g.addColorStop(0, '#7a4a1c'); g.addColorStop(1, '#3a200a');
    ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#ffe3a0'; ctx.font = `700 ${r * 1.05}px BeVN, "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(([...String(name || '?').trim()][0] || '?').toUpperCase(), cx, cy + r * 0.05);
  }
  ctx.restore();
}
function drawTitle() {
  if (!CFG.scene.showTitle || !CFG.scene.title) return;
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '700 58px Cormorant, Georgia, serif'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 14;
  ctx.fillStyle = '#ffeec8'; ctx.fillText(CFG.scene.title, W / 2, 1230); ctx.restore();
}
function drawGuides() {
  if (!CFG.scene.showGuides) return;
  ctx.save(); ctx.lineWidth = 2;
  for (const r of G.rowInfo) {
    const xi = G.innerL(r.y), xo = Math.max(0, G.outerL(r.y));
    ctx.strokeStyle = 'rgba(0,255,120,0.9)'; ctx.beginPath(); ctx.moveTo(xo, r.y); ctx.lineTo(xi, r.y); ctx.moveTo(2 * G.g.centerX - xi, r.y); ctx.lineTo(2 * G.g.centerX - xo, r.y); ctx.stroke();
    ctx.fillStyle = '#0f8'; ctx.font = '700 18px sans-serif'; ctx.fillText(String(r.k), xi + 6, r.y + 6);
  }
  for (const s of G.slots) { ctx.strokeStyle = s.occupied ? 'rgba(255,80,80,0.9)' : 'rgba(255,255,0,0.8)'; ctx.strokeRect(s.x - s.slotW / 2, s.headTop, s.slotW, s.y - s.headTop); }
  ctx.strokeStyle = 'rgba(255,60,60,0.95)'; ctx.setLineDash([10, 8]); for (const z of (CFG.donate.avoidZones || [])) ctx.strokeRect(z.x, z.y, z.w, z.h); ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,0,255,0.9)'; ctx.beginPath();
  for (const sgn of [-1, 1]) { for (let r = G.rows[G.rows.length - 1]; r >= G.altarRail; r -= 4) { const x = G.g.centerX + sgn * laneHalf(r), y = G.footOfRail(r); if (r === G.rows[G.rows.length - 1]) ctx.moveTo(x, y); else ctx.lineTo(x, y); } }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,200,255,0.9)'; ctx.beginPath(); ctx.moveTo(200, G.altarY); ctx.lineTo(880, G.altarY); ctx.stroke();
  altarSpots().forEach((x) => { ctx.beginPath(); ctx.arc(x, G.altarY, 8, 0, 7); ctx.stroke(); });
  ctx.restore();
}
function render() {
  const t = now();
  drawBG();
  if (!G) return;
  drawBeams(t);
  // vẽ theo chiều sâu: xa (y nhỏ) trước
  const items = [];
  for (const p of people) if (p.state === 'seated' && p.alpha > 0) items.push({ z: p.slot.y, f: () => drawSeated(p, t) });
  for (const w of walkers) if (w.phase !== 'wait') items.push({ z: w.rail + 0.5, f: () => drawWalker(w, t) });
  // người đang chờ đi vẫn ngồi
  items.sort((a, b) => a.z - b.z);
  for (const it of items) it.f();
  drawFX();
  drawNames();
  drawSubtitles(t);
  drawGreet(t);
  drawBanners(t);
  drawTitle();
  drawGuides();
  drawVideo(t);
  drawEdit();
}
function loop() {
  const t = now(); const dt = Math.min(0.1, t - last); last = t;
  if (assetsReady && G) update(dt);
  render();
  requestAnimationFrame(loop);
}

// ================== CHỈNH BỐ CỤC BẰNG CHUỘT ==================
// Bật bằng nút trong Bảng điều khiển hoặc phím E trên màn hình. Kéo để di chuyển, kéo góc dưới-phải để đổi cỡ, lăn chuột để phóng to/thu nhỏ.
let editMode = false, drag = null, editRaw = null;
function editItems() {
  const d = CFG.donate, items = [];
  if (CFG.subtitles) items.push({ id: 'sub', label: 'Bảng lời giảng', color: '#5fd0ff', rect: subRect() });
  if (CFG.greet) items.push({ id: 'greet', label: 'Bảng chào', color: '#7dff9a', rect: greetRect() });
  const k = d.bannerScale || 1, gw = Math.min(W, d.bannerWidth || 900), gh = 116 * k;
  items.push({ id: 'banner', label: 'Băng chúc phúc', color: '#ffd23f', rect: { x: W / 2 - gw / 2, y: (d.bannerY ?? 110) - gh / 2, w: gw, h: gh } });
  (d.avoidZones || []).forEach((z, i) => items.push({ id: 'zone' + i, zi: i, label: i === 0 ? 'Vùng hình Chúa (băng chữ tránh)' : 'Vùng tránh ' + (i + 1), color: '#ff5a5a', rect: { ...z } }));
  return items;
}
function applyEdit(it, r, final) {
  const d = CFG.donate;
  if (it.id === 'sub' || it.id === 'greet') {
    const c = it.id === 'sub' ? CFG.subtitles : CFG.greet, k = c.scale || 1;
    c.x = Math.round(r.x); c.y = Math.round(r.y); c.w = Math.round(Math.max(120, r.w) / k); c.h = Math.round(Math.max(90, r.h) / k);
  } else if (it.id === 'banner') {
    d.bannerY = Math.round(r.y + r.h / 2); d.bannerWidth = Math.round(clamp(r.w, 300, W)); d.bannerScale = +clamp(r.h / 116, 0.4, 2).toFixed(2);
  } else if (it.zi != null) {
    d.avoidZones = (d.avoidZones || []).map((z, i) => i === it.zi ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(Math.max(20, r.w)), h: Math.round(Math.max(20, r.h)) } : z);
  }
  subLayout = null;
  if (final) saveEdit(it);
}
async function saveEdit(it) {
  const raw = await api.getConfig();
  const pick = (top, keys) => { raw[top] = { ...(raw[top] || {}) }; for (const k of keys) raw[top][k] = CFG[top][k]; return api.setConfig({ [top]: raw[top] }); };
  if (it.id === 'sub') await pick('subtitles', ['x', 'y', 'w', 'h', 'scale', 'fontSize']);
  else if (it.id === 'greet') await pick('greet', ['x', 'y', 'w', 'h', 'scale', 'fontSize']);
  else if (it.id === 'banner') await pick('donate', ['bannerY', 'bannerWidth', 'bannerScale']);
  else await pick('donate', ['avoidZones']);
}
function canvasXY(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
function hitItem(p) {
  const its = editItems().reverse();
  for (const it of its) { const r = it.rect; if (Math.abs(p.x - (r.x + r.w)) < 34 && Math.abs(p.y - (r.y + r.h)) < 34) return { it, mode: 'resize' }; }
  for (const it of its) { const r = it.rect; if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return { it, mode: 'move' }; }
  return null;
}
cv.addEventListener('mousedown', (e) => {
  if (!editMode) return;
  const p = canvasXY(e), h = hitItem(p); if (!h) return;
  drag = { ...h, p0: p, r0: { ...h.it.rect } }; e.preventDefault();
});
window.addEventListener('mousemove', (e) => {
  if (!editMode) { cv.style.cursor = ''; return; }
  const p = canvasXY(e);
  if (!drag) { const h = hitItem(p); cv.style.cursor = h ? (h.mode === 'resize' ? 'nwse-resize' : 'move') : 'default'; return; }
  const dx = p.x - drag.p0.x, dy = p.y - drag.p0.y, r0 = drag.r0;
  let r;
  if (drag.mode === 'move') r = { x: clamp(r0.x + dx, -r0.w + 60, W - 60), y: clamp(r0.y + dy, -r0.h + 40, H - 40), w: r0.w, h: r0.h };
  else if (drag.it.id === 'banner') { const nw = r0.w + dx * 2; r = { x: W / 2 - nw / 2, y: r0.y, w: nw, h: Math.max(40, r0.h + dy) }; }
  else r = { x: r0.x, y: r0.y, w: Math.max(60, r0.w + dx), h: Math.max(40, r0.h + dy) };
  applyEdit(drag.it, r, false);
});
window.addEventListener('mouseup', () => { if (drag) { const it = drag.it; const r = editItems().find((x) => x.id === it.id).rect; applyEdit(it, r, true); drag = null; } });
cv.addEventListener('wheel', (e) => {
  if (!editMode) return;
  const h = hitItem(canvasXY(e)); if (!h) return; e.preventDefault();
  const f = e.deltaY < 0 ? 1.05 : 1 / 1.05, it = h.it;
  if (it.id === 'sub' || it.id === 'greet') { const c = it.id === 'sub' ? CFG.subtitles : CFG.greet; c.scale = +clamp((c.scale || 1) * f, 0.4, 3).toFixed(3); subLayout = null; saveEdit(it); }
  else if (it.id === 'banner') { CFG.donate.bannerScale = +clamp((CFG.donate.bannerScale || 1) * f, 0.4, 2).toFixed(3); saveEdit(it); }
}, { passive: false });
window.addEventListener('keydown', (e) => { if (e.key === 'e' || e.key === 'E') setEditMode(!editMode); if (e.key === 'Escape') setEditMode(false); });
function setEditMode(on) { editMode = !!on; drag = null; cv.style.cursor = ''; toPanel({ type: 'edit-mode', on: editMode }); }
function drawEdit() {
  if (!editMode) return;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, H);
  // xem trước nội dung để căn chỉnh
  if (!banners.some((b) => b.shownAt != null)) {
    const d = CFG.donate, k = d.bannerScale || 1, gw = Math.min(W, d.bannerWidth || 900), gh = 116 * k, cy = d.bannerY ?? 110;
    ctx.fillStyle = 'rgba(40,20,4,0.7)'; ctx.fillRect(W / 2 - gw / 2, cy - gh / 2, gw, gh);
    ctx.font = `700 ${50 * k}px Cormorant, Georgia, serif`; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Tên người xem đã được chúc phúc', W / 2, cy);
  }
  for (const it of editItems()) {
    const r = it.rect;
    ctx.lineWidth = 3; ctx.strokeStyle = it.color; ctx.setLineDash([12, 8]); ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]);
    ctx.fillStyle = it.color; ctx.fillRect(r.x + r.w - 18, r.y + r.h - 18, 22, 22);
    ctx.font = '700 22px BeVN, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    const lw = ctx.measureText(it.label).width + 16, ly = r.y < 34 ? r.y + r.h + 32 : r.y; ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(r.x, ly - 30, lw, 30);
    ctx.fillStyle = it.color; ctx.fillText(it.label, r.x + 8, ly - 4);
  }
  ctx.font = '700 28px BeVN, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const msg = 'CHỈNH BỐ CỤC — kéo để di chuyển · kéo ô vuông góc để đổi cỡ · lăn chuột để phóng to · E/Esc để thoát';
  ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0, H - 60, W, 60); ctx.fillStyle = '#ffd23f';
  let mf = 26; ctx.font = `700 ${mf}px BeVN, sans-serif`; while (ctx.measureText(msg).width > W - 30 && mf > 12) { mf--; ctx.font = `700 ${mf}px BeVN, sans-serif`; } ctx.fillText(msg, W / 2, H - 44);
  ctx.restore();
}

// ================== GIAO TIẾP ==================
function applyConfig(c, first) {
  const prev = CFG;
  CFG = deepMerge(CHURCH_DEFAULTS, c || {});
  const geoChanged = first || JSON.stringify(prev.scene.geometry) !== JSON.stringify(CFG.scene.geometry) || ['firstRow', 'lastRow', 'torsoScale'].some((k) => prev.seating[k] !== CFG.seating[k]);
  const assetChanged = first || prev.seating.cropFrac !== CFG.seating.cropFrac || prev.scene.warmTint !== CFG.scene.warmTint || JSON.stringify(prev.characters) !== JSON.stringify(CFG.characters);
  if (geoChanged) { buildGeometry(); reseatAll(); }
  if (assetChanged) loadAssets().then(() => { for (const p of people) if (p.sit >= SITTERS.length) p.sit = 0; });
  if (first || prev.scene.videoFile !== CFG.scene.videoFile) loadVideo();
  const voiceChanged = !first && (prev.audio.voice !== CFG.audio.voice || prev.audio.sermonLang !== CFG.audio.sermonLang || prev.audio.sermonMode !== CFG.audio.sermonMode || prev.audio.rate !== CFG.audio.rate || prev.audio.pitch !== CFG.audio.pitch || JSON.stringify(prev.audio.sermonTextsVi) !== JSON.stringify(CFG.audio.sermonTextsVi) || JSON.stringify(prev.audio.sermonTextsEn) !== JSON.stringify(CFG.audio.sermonTextsEn));
  if (voiceChanged) { sermon.idx = 0; sermonRestart(); }
  if (!first && prev.audio.sermonEnabled && !CFG.audio.sermonEnabled) sermonSkip();
  applyAudio();
}
function reseatAll() {
  // gán lại ghế cho mọi người sau khi đổi hình học
  const ps = people; people = [];
  for (const s of G.slots) s.occupied = null;
  for (const p of ps) {
    if (p.leaving) continue;
    if (p.state !== 'seated') { // người đang đi: giữ nguyên ghế cũ gần nhất
      const sl = G.slots.find((s) => !s.occupied) || G.slots[0]; p.slot = sl; sl.occupied = p; people.push(p); continue;
    }
    const sl = pickSlot(); if (!sl) continue; p.slot = sl; sl.occupied = p; people.push(p);
  }
}
let simN = 1;
const SIM_NAMES = ['Maria Lan', 'Giuse Hùng', 'Anna Thu', 'Phêrô Minh', 'Têrêsa Hoa', 'Gioan Bảo', 'Lucia Mai', 'Phaolô Tuấn', 'Martha Hạnh', 'Đaminh Khoa', 'Rosa Linh', 'Antôn Phúc', 'grace_1998', 'john.smith', 'Hope 🌸'];
function simName() { return SIM_NAMES[Math.floor(Math.random() * SIM_NAMES.length)] + (Math.random() < 0.3 ? ' ' + (simN++) : ''); }
api.onCmd((m) => {
  if (!m) return;
  if (m.type === 'sim-join') { for (let i = 0; i < (m.n || 1); i++) onJoin({ id: 'sim' + Math.random(), name: m.name || simName() }); }
  if (m.type === 'sim-gift') {
    let id = 'sim' + Math.random(), name = m.name || simName();
    if (m.seated) { const p = people.filter((x) => !x.filler && x.state === 'seated' && !x.leaving)[Math.floor(Math.random() * namedCount())]; if (p) { id = p.id; name = p.name; } }
    if (m.avatar && !findPerson(id)) onJoin({ id, name, avatar: m.avatar });
    const coins = m.coins || 1;
    onGift({ id, name, avatar: m.avatar || '', gift: m.gift || 'Hoa hồng', count: m.count || 1, diamonds: coins, total: coins, sim: true });
  }
  if (m.type === 'clear') { for (const p of people) if (!p.filler && p.state === 'seated') removePerson(p, true); queue = []; }
  if (m.type === 'edit-layout') setEditMode(m.on);
  if (m.type === 'sermon-next') sermonSkip();
  if (m.type === 'sermon-restart') { sermon.idx = 0; sermonRestart(); }
  if (m.type === 'speak') speakBlessing(m.text);
  if (m.type === 'reload-assets') { imgCache.clear(); loadAssets(); }
  if (m.type === 'pretts') pretts();
});
async function pretts() {
  const all = []; for (const sec of sermonSections()) { if (sec.title && CFG.audio.readTitles) all.push(sec.title); for (const p of sec.paras) all.push(...splitSentences(p)); }
  let ok = 0;
  for (let i = 0; i < all.length; i++) { try { await ttsBuffer(speakable(all[i])); ok++; } catch (e) { logp('Tạo giọng lỗi câu ' + (i + 1) + ': ' + e.message, 'error'); } toPanel({ type: 'pretts', done: i + 1, total: all.length, ok }); }
}
api.onLiveEvent((ev) => {
  if (!ev) return;
  if (ev.type === 'join') onJoin(ev);
  else if (ev.type === 'chat' && CFG.seating.chatAlsoSeats) onJoin(ev);
  else if (ev.type === 'gift') { onJoin(ev); onGift(ev); }
});
api.onConfig((c) => applyConfig(c, false));
setInterval(() => {
  toPanel({
    type: 'status', seated: namedCount(), fillers: people.filter((p) => p.filler).length, slots: G ? G.slots.length : 0,
    walking: walkers.length, queue: queue.length + vq.length + (vcur ? 1 : 0), sermon: { state: sermon.state, line: sermon.line, idx: sermon.idx, fallback: sermon.usingFallback },
    videoOK, sitters: SITTERS.length, walkerSets: Object.keys(WALKERS), audio: AC.state,
    names: people.filter((p) => !p.filler && !p.leaving).slice(-12).map((p) => ({ name: p.name, left: Math.max(0, Math.round(p.expires - now())), state: p.state }))
  });
}, 1000);
document.addEventListener('click', () => AC.resume());

(async () => {
  const c = await api.getConfig();
  await document.fonts.load('700 40px Cormorant'); await document.fonts.load('700 20px BeVN');
  applyConfig(c, true);
  if (AC.state !== 'running') AC.resume().catch(() => {});
  requestAnimationFrame(loop);
  setTimeout(sermonLoop, 2500);
  // test mode (headless)
  if (location.hash.includes('demo')) {
    setTimeout(() => { for (let i = 0; i < 18; i++) onJoin({ id: 'd' + i, name: simName() }); }, 1500);
  }
})();
window.__church = { SUB, stopSermon: () => { sermon.token++; }, loadFaceApi: () => loadFaceApi(), detect: async (u) => { const i = await loadAvatar(u); if (!i) return 'noimg'; await loadFaceApi(); try { const r = await faceapi.detectSingleFace(i, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 })).withAgeAndGender(); return r ? [r.gender, r.genderProbability, r.detection.score] : 'noface'; } catch (e) { return 'err ' + e.message; } }, guess: (n) => guessGenderFromName(n), laneHalf: (r) => laneHalf(r), standH: (r) => standH(r), get G() { return G; }, onJoin, onGift, get people() { return people; }, get walkers() { return walkers; }, CFG: () => CFG };
})();

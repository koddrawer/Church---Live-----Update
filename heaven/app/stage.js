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
  return; // Heaven Live dùng ảnh nền
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
// Nhận biết ngôn ngữ của từng câu để luôn đọc bằng giọng đúng ngôn ngữ (không bao giờ lẫn giọng)
const VI_CHARS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
// Đoán ngôn ngữ của MẪU câu (trước khi chèn tên người xem) — tên không làm sai giọng
function textLang(t) {
  const words = String(t).replace(/\{\w+\}/g, ' ').split(/\s+/).filter((w) => /[a-zA-ZÀ-ỹ]/.test(w));
  if (!words.length) return CFG.audio.sermonLang || 'vi';
  const vi = words.filter((w) => VI_CHARS.test(w)).length;
  return vi / words.length >= 0.2 ? 'vi' : 'en';
}
function voiceFor(L) {
  const a = CFG.audio;
  if (L === 'vi') return a.voiceVi || (String(a.voice).startsWith('vi') ? a.voice : 'vi-VN-NamMinhNeural');
  return a.voiceEn || (String(a.voice).startsWith('en') ? a.voice : 'en-US-ChristopherNeural');
}
// lang: 'vi' | 'en' — luôn truyền rõ ngôn ngữ, không đoán từ câu đã chèn tên
async function ttsBuffer(text, lang) {
  const a = CFG.audio, voice = voiceFor(lang || CFG.audio.sermonLang || 'vi');
  const key = [voice, a.rate, a.pitch, text].join('|');
  if (bufCache.has(key)) return bufCache.get(key);
  const p = (async () => {
    const r = await api.tts({ text, voice, rate: a.rate, pitch: a.pitch });
    if (!r || !r.ok) throw new Error((r && r.error) || 'TTS lỗi');
    const ab = await (await fetch(r.url)).arrayBuffer();
    return await AC.decodeAudioData(ab);
  })();
  bufCache.set(key, p);
  p.catch(() => bufCache.delete(key));
  while (bufCache.size > 24) bufCache.delete(bufCache.keys().next().value);
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
// Giọng Windows chỉ dùng khi có đúng ngôn ngữ; nếu không có thì im lặng (phụ đề vẫn chạy) để không đọc lẫn giọng.
let fbWarned = '';
function speakFallback(text, lang) {
  return new Promise((res) => {
    lang = lang || CFG.audio.sermonLang || 'vi';
    const est = Math.min(12000, 600 + String(text).length * 55);
    try {
      const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith(lang));
      if (!v || CFG.audio.windowsFallback === false) {
        if (fbWarned !== lang) { fbWarned = lang; logp('Edge TTS lỗi và máy không có giọng Windows ' + (lang === 'vi' ? 'tiếng Việt' : 'tiếng Anh') + ' — tạm im lặng, phụ đề vẫn chạy.', 'warn'); }
        setTimeout(res, est); return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.voice = v; u.lang = v.lang; u.rate = 0.9; u.pitch = 0.85; u.volume = clamp(CFG.audio.sermonVolume * (ducked ? 0.3 : 1), 0, 1);
      u.onend = () => res(); u.onerror = () => res();
      speechSynthesis.speak(u);
      setTimeout(res, est + 15000);
    } catch { setTimeout(res, est); }
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
// Kiểm tra nhanh câu đã có giọng đọc sẵn chưa (file đã lưu hoặc đã tải xong trong bộ nhớ)
const readySet = new Set();
async function audioReady(text, lang) {
  const a = CFG.audio, voice = voiceFor(lang), t = speakable(text);
  const key = [voice, a.rate, a.pitch, t].join('|');
  if (readySet.has(key)) return true;
  try {
    const r = await Promise.race([api.tts({ text: t, voice, rate: a.rate, pitch: a.pitch, onlyCached: true }), sleep(400).then(() => null)]);
    if (r && r.ok) { readySet.add(key); return true; }
  } catch {}
  return false;
}
async function sayLine(text, my) {
  let buf = null; const t0 = performance.now();
  try { buf = await ttsBuffer(speakable(text), (CFG.audio.sermonLang || 'vi')); if (performance.now() - t0 > 4000 && Date.now() - (window.__slowWarn || 0) > 60000) { window.__slowWarn = Date.now(); logp('Máy chủ giọng đọc phản hồi chậm (' + ((performance.now() - t0) / 1000).toFixed(1) + 's/câu). Bấm “Tạo trước toàn bộ giọng đọc” để đọc mượt từ file đã lưu.', 'warn'); } if (sermon.usingFallback) logp('Giọng Edge TTS đã hoạt động lại'); sermon.usingFallback = false; } catch (e) {
    if (!sermon.usingFallback) logp('Giọng Edge TTS lỗi (' + e.message + '), dùng giọng Windows thay thế', 'warn');
    sermon.usingFallback = true;
  }
  if (sermon.token !== my) return;
  while ((videoPlaying() || blessSpeaking) && sermon.token === my) await sleep(250); // tạm dừng giảng khi chiếu video / cha sứ đang chúc phúc
  if (sermon.token !== my) return;
  sermon.state = 'playing';
  if (buf) { await playBuffer(buf, voiceBus); return true; }
  if (CFG.audio.restartOnMissing !== false) return false;
  await speakFallback(speakable(text), (CFG.audio.sermonLang || 'vi'));
  return true;
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
      // danh sách phẳng mọi câu của mục
      const paras = sec.paras.map(splitSentences);
      const flat = []; paras.forEach((ss, pi) => ss.forEach((x, k) => flat.push({ pi, k, x })));
      const L = CFG.audio.sermonLang || 'vi';
      const prefetch = (from) => { for (let j = from + 1; j <= from + (CFG.audio.prefetch || 5) && j < flat.length; j++) ttsBuffer(speakable(flat[j].x), L).catch(() => {}); };
      let fi = 0, lastPi = -1, restarts = 0;
      while (fi < flat.length && sermon.token === my) {
        if (!CFG.audio.sermonEnabled) break;
        const it = flat[fi];
        if (it.pi !== lastPi) {
          if (lastPi >= 0) { SUB.cur = SUB.sents.length; await waitGap(CFG.audio.gapSeconds, my); }
          SUB.sents = paras[it.pi]; SUB.cur = -1; SUB.changed = now(); SUB.scroll = 0; lastPi = it.pi;
        }
        // câu chưa tạo kịp (hoặc lỗi) → không ngừng chờ, quay lại giảng từ đầu những câu đã có sẵn
        if (fi > 0 && CFG.audio.restartOnMissing !== false && !(await audioReady(it.x, L))) {
          ttsBuffer(speakable(it.x), L).catch(() => {}); prefetch(fi);
          if (Date.now() - (window.__restartWarn || 0) > 120000) { window.__restartWarn = Date.now(); logp('Câu tiếp theo chưa tạo kịp giọng đọc → giảng lại từ đầu trong lúc chờ.', 'warn'); }
          restarts++; fi = 0; lastPi = -1;
          continue;
        }
        prefetch(fi);
        SUB.cur = it.k; sermon.line = it.x; sermon.state = 'loading';
        const ok = await sayLine(it.x, my);
        if (ok === false && fi > 0 && CFG.audio.restartOnMissing !== false) { fi = 0; lastPi = -1; continue; }
        if (ok === false && fi === 0) await speakFallback(speakable(it.x), L); // chưa có câu nào sẵn: giữ nhịp phụ đề
        await waitGap(CFG.audio.sentenceGap, my);
        fi++;
      }
      SUB.cur = SUB.sents.length;
      await waitGap(CFG.audio.gapSeconds, my);
      await waitGap(CFG.audio.sectionGap, my);
    } catch (e) { sermon.state = 'error: ' + e.message; await sleep(3000); }
  }
}
function sermonSkip() { try { cur.src && cur.src.stop(); } catch {} try { speechSynthesis.cancel(); } catch {} }
function sermonRestart() { sermon.token++; sermonSkip(); setTimeout(sermonLoop, 300); }

let blessChain = Promise.resolve();
let blessSpeaking = false;
function speakBlessing(text, lang) {
  if (text && typeof text === 'object') { lang = text.lang; text = text.text; }
  lang = lang || textLang(text);
  blessChain = blessChain.then(async () => {
    blessSpeaking = true; ducked = true; applyAudio();
    try { const b = await ttsBuffer(speakable(text), lang); await new Promise((res) => { const s = AC.createBufferSource(); s.buffer = b; s.connect(blessBus); s.onended = res; s.start(); }); }
    catch { await speakFallback(text, lang); }
    await sleep(400); blessSpeaking = false; ducked = videoPlaying(); applyAudio();
  });
}
function blessingLine(o) {
  const d = CFG.donate;
  let list = d.blessSpeeches && d.blessSpeeches.length ? d.blessSpeeches : (CFG.audio.sermonLang === 'en' ? BLESSINGS_EN : BLESSINGS_VI);
  const t = d.blessSpeechMode === 'fixed' || !list.length ? d.blessSpeech : list[Math.floor(Math.random() * list.length)];
  return { text: fmt(t, o), lang: textLang(t) };
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
  if (HEAVEN) return H_join(ev);
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
  if (!ev.idle && !ev.sim) lastRealGift = now();
  if (HEAVEN) return H_gift(ev);
  const total = ev.total ?? (ev.diamonds || 0) * (ev.count || 1);
  if (total < CFG.donate.minDiamonds && !ev.sim && !ev.social) return;
  const tier = ev.social ? null : tierFor(total);
  let hold = false;
  if (tier) { enqueueVideo(ev, tier, ++giftSeq); hold = !!tier.walk && CFG.donate.walkAfterVideo; if (!tier.walk) { const p0 = findPerson(ev.id); if (p0 && !p0.avatar && ev.avatar) { p0.avatar = ev.avatar; enrichPerson(p0); } return; } }
  // gộp nếu đang đi / đang chờ
  const ex = findPerson(ev.id);
  if (ex && !ex.avatar && ev.avatar) { ex.avatar = ev.avatar; enrichPerson(ex); }
  const w = walkers.find((x) => x.person.id === ev.id && !x.done);
  if (w) { w.gifts.push(ev); w.count += ev.count || 1; w.total = (w.total || 0) + total; if (w.phase === 'bless') { w.blessEnd += 3; if (!(CFG.donate.frameEnabled !== false && !ev.social && pushCard(w, ev))) pushBanner(w, ev); } return; }
  const q = queue.find((x) => x.id === ev.id);
  if (q) { q.count += ev.count || 1; q.total = (q.total || 0) + total; if (hold) q.holdVideo = true; return; }
  queue.push({ ...ev, total, count: ev.count || 1, at: now(), seq: ++giftSeq, holdVideo: hold, noSpeech: !!(tier && !tier.speak) || !!ev.noSpeech });
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
    x: s.x, rail: s.y, endX, u0, altarX, done: false, alpha: 1, frameT: 0, inPew: true, reveal: 0, rise: 0, total: ev.total || 0
  });
  if (!ev.social) camFor(walkers[walkers.length - 1]);
}
// ================== VÒNG LẶP ==================
let last = now();
function update(dt) {
  const t = now();
  if (HEAVEN) { H_update(dt); fx = fx.filter((f) => (f.life -= dt) > 0); if (fx.length > 500) fx.splice(0, fx.length - 500); for (const f of fx) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy -= 8 * dt; } banners = banners.filter((b) => (b.shownAt == null ? t - b.start < 90 : t < b.shownAt + bannerDur(b) + 1)); return; }
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
  fx = fx.filter((f) => (f.life -= dt) > 0); if (fx.length > 400) fx.splice(0, fx.length - 400);
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
  const scw = ev.social && CFG.social ? CFG.social[ev.social] : null;
  if (scw) { if (scw.speak) socialSpeak({ text: fmt(scw.speech, { name: cleanName(w.person.name) }), lang: textLang(scw.speech) }); }
  let line = null;
  if (!scw) { line = blessingLine({ name: cleanName(w.person.name), gift: ev.gift || '', count: w.count }); if (CFG.donate.speakBlessing && !w.noSpeech) speakBlessing(line); }
  if (!(CFG.donate.frameEnabled !== false && !scw && !ev.social && pushCard(w, ev, line))) pushBanner(w, ev);
  for (let i = 0; i < 40; i++) spawnSparkle(w, true);
  toPanel({ type: 'blessed', name: w.person.name, gift: ev.gift, count: w.count, idle: !!ev.idle });
}
function pushBanner(w, ev) {
  if (!CFG.donate.showBanner) return;
  const o = { name: cleanName(w.person.name), gift: ev.gift || 'quà', count: w.count };
  const sc = ev.social && CFG.social ? CFG.social[ev.social] : null;
  const tt = sc ? (sc.banner || CFG.donate.banner) : CFG.donate.banner, st = sc ? (sc.sub || '') : CFG.donate.bannerSub;
  const old = banners.find((b) => b.w === w);
  if (old) { old.title = fmt(tt, o); old.sub = fmt(st, o); return; }
  banners.push({ w, title: fmt(tt, o), sub: fmt(st, o), name: o.name, start: now(), shownAt: null });
}
function spawnSparkle(w, burst) {
  const h = standH(w.rail), foot = G.footOfRail(w.rail);
  fx.push({ x: w.x + rnd(-h * 0.35, h * 0.35), y: foot - rnd(0, h * 0.9), vx: rnd(-12, 12), vy: burst ? rnd(-90, -20) : rnd(-40, -10), life: rnd(1.2, 2.6), max: 2.6, r: rnd(2, 5.5) });
}
function cleanName(n) { n = String(n || '').trim(); const m = CFG.seating.nameMaxChars; return [...n].length > m ? [...n].slice(0, m - 1).join('') + '…' : n; }

// ================== VIDEO CHÚC PHÚC THEO MỨC XU ==================
function tierFor(total) {
  if (!CFG.donate.tierVideos) return null;
  const ts = (CFG.donate.tiers || []).filter((t) => t && t.enabled !== false && (t.videos || []).length && total >= t.min);
  ts.sort((a, b) => b.min - a.min);
  return ts[0] || null;
}
const vidEl = document.createElement('video'); vidEl.playsInline = true; vidEl.preload = 'auto'; window.__vidEl = vidEl;
const vidGain = AC.createGain(); vidGain.connect(master);
try { AC.createMediaElementSource(vidEl).connect(vidGain); } catch {}
let vq = [], vcur = null;
const videoBags = new Map(), lastVideo = new Map();
const videoPlaying = () => !!vcur;
function videoOpaque(t) { return t - vcur.start > 0.65 && !vcur.ending && vidEl.readyState >= 2; }
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
      try { vidEl.removeAttribute('src'); vidEl.load(); } catch {}
      if (videoOK) video.play().catch(() => {});
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
  // xáo trộn kiểu "rút thăm": phát hết lượt các video rồi mới lặp lại, không phát trùng 2 lần liền
  const key = it.tier.min + '|' + files.join('|');
  let bag = videoBags.get(key);
  if (!bag || !bag.length) {
    bag = [...files]; for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    const lastF = lastVideo.get(it.tier.min);
    if (bag.length > 1 && bag[bag.length - 1] === lastF) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    videoBags.set(key, bag);
  }
  const f = bag.pop(); lastVideo.set(it.tier.min, f);
  vq.loading = true;
  vidEl.src = absUrl(f); vidEl.currentTime = 0; vidEl.loop = false;
  vidGain.gain.value = clamp(CFG.donate.videoVolume ?? 1, 0, 2);
  try { await Promise.race([vidEl.play(), sleep(10000).then(() => { throw new Error('video tải quá lâu'); })]); } catch (e) { logp('Không phát được video ' + f + ': ' + e.message, 'error'); vq.loading = false; const q = queue.find((x) => x.id === it.ev.id); if (q) q.holdVideo = false; return; }
  vq.loading = false;
  vcur = { ...it, start: now() };
  setTimeout(() => { if (vcur && videoOK) try { video.pause(); } catch {} }, 800); // nghỉ giải mã video nền khi đang chiếu video chúc phúc
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
  // chữ được vẽ sẵn lên 1 lớp riêng, chỉ vẽ lại khi đổi câu (đỡ tốn hiệu ứng phát sáng mỗi khung hình)
  const tkey = key + '|' + SUB.cur + '|' + c.readAlpha + '|' + c.dimAlpha;
  if (!subLayout.tex || subLayout.tkey !== tkey) {
    const cw = Math.ceil(w), ch = Math.ceil(Math.max(lh, lines.length * lh) + 24);
    const oc = subLayout.tex && subLayout.tex.width === cw && subLayout.tex.height === ch ? subLayout.tex : document.createElement('canvas');
    oc.width = cw; oc.height = ch;
    const g2 = oc.getContext('2d'); g2.clearRect(0, 0, cw, ch);
    g2.font = font; g2.textAlign = 'left'; g2.textBaseline = 'top';
    lines.forEach((L2, li) => {
      const ly = 8 + li * lh;
      for (const wd of L2) {
        const curS = wd.si === SUB.cur, read = wd.si < SUB.cur;
        if (curS) { g2.shadowColor = 'rgba(255,190,70,0.95)'; g2.shadowBlur = 16; g2.fillStyle = '#ffe39a'; }
        else { g2.shadowBlur = 0; g2.fillStyle = read ? `rgba(255,240,215,${c.readAlpha})` : `rgba(255,240,215,${c.dimAlpha})`; }
        g2.fillText(wd.word, pad + wd.x, ly);
      }
    });
    subLayout.tex = oc; subLayout.tkey = tkey;
  }
  ctx.beginPath(); ctx.rect(x, top - 4, w, areaH + 8); ctx.clip();
  ctx.globalAlpha = fadeIn;
  ctx.drawImage(subLayout.tex, x, top - 8 - subLayout.scroll);
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
  const glow = p.glowUntil && t < p.glowUntil ? Math.min(clamp((t - p.glowStart) / 0.5, 0, 1), clamp((p.glowUntil - t) / 0.8, 0, 1)) : 0;
  if (glow > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const cx = s.x, cy = y + h * 0.35, r = h * (0.85 + 0.06 * Math.sin(t * 3));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,236,170,${0.6 * glow})`); g.addColorStop(0.55, `rgba(255,200,90,${0.25 * glow})`); g.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    // tia sáng nhỏ từ trên xuống
    const bg = ctx.createLinearGradient(0, cy - h * 2.2, 0, cy);
    bg.addColorStop(0, 'rgba(255,240,190,0)'); bg.addColorStop(1, `rgba(255,220,130,${0.35 * glow})`);
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(cx - w * 0.12, cy - h * 2.2); ctx.lineTo(cx + w * 0.12, cy - h * 2.2); ctx.lineTo(cx + w * 0.5, cy); ctx.lineTo(cx - w * 0.5, cy); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, s.y + 1); ctx.clip();   // lưng ghế che phần dưới
  ctx.globalAlpha = p.alpha;
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
  p._glow = glow;
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
const SPARK = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,250,215,1)'); gr.addColorStop(1, 'rgba(255,200,80,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; })();
function drawFX() {
  if (!fx.length) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const f of fx) { ctx.globalAlpha = clamp(f.life / f.max, 0, 1); const r = f.r * 3; ctx.drawImage(SPARK, f.x - r, f.y - r, r * 2, r * 2); }
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
  for (const p of people) if (!p.filler && p.state === 'seated' && p._head && p.alpha > 0.02) tags.push({ txt: cleanName(p.name), x: p._head.x, y: p._head.y - 4, size: (p._nameSize || clamp(p.slot.ppm * 0.12, 13, 24)) * ns, a: p.alpha, gold: !!p.donated, z: p.slot.y });
  for (const w of walkers) if (w._head && w.phase !== 'wait') tags.push({ txt: cleanName(w.person.name), x: w._head.x, y: w._head.y - 6, size: (w._nameSize || clamp(G.ppm(w.rail) * 0.16, 18, 30)) * ns, a: clamp(w.alpha, 0, 1), gold: true, z: 1e6 });
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
  const now_ = now();
  for (const p of people) {
    if (!p._glow || !p._head || !p.glowText) continue;
    const k = clamp((now_ - p.glowStart) / (p.glowUntil - p.glowStart), 0, 1);
    const fs = (p._nameSize ? p._nameSize * 1.3 : clamp(p.slot.ppm * 0.16, 18, 34)) * CFG.seating.nameScale;
    ctx.save(); ctx.globalAlpha = p._glow; ctx.font = `700 ${fs}px Cormorant, Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(255,190,70,0.95)'; ctx.shadowBlur = 14; ctx.fillStyle = '#ffe39a';
    ctx.fillText(p.glowText, clamp(p._head.x, 120, W - 120), p._head.y - fs * 1.9 - k * 40);
    ctx.restore();
  }
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
// ================== KHUNG AVATAR THEO MỨC XU ==================
const GOLD = ['#5e3a0c', '#d9a440', '#fff2b8', '#b07a22', '#6b4310'];
const FRAME_STYLES = {
  bronze: { ring: ['#4a2810', '#b8753a', '#f3c48a', '#8a5326', '#4a2810'], name: '#f6cf98', rays: 0, cross: true },
  silver: { ring: ['#3c434b', '#b9c3cd', '#ffffff', '#8a949e', '#3c434b'], name: '#eef3f8', rays: 0.45, cross: true, pearls: true },
  gold: { ring: GOLD, name: '#ffe08a', rays: 0.7, cross: true, laurel: true },
  ruby: { ring: GOLD, name: '#ffd6dc', rays: 0.9, cross: true, laurel: true, gems: ['#ff2a48'] },
  royal: { ring: GOLD, name: '#fff3c4', rays: 1.2, laurel: true, gems: ['#2f7bff', '#c040ff'], crown: true, wings: true }
};
function customFrame(style) {
  if (/^b:/.test(style || '')) {
    const bf = (window.BUILTIN_FRAMES || []).find((f) => 'b:' + f.id === style); if (!bf) return null;
    let e = cfImgs.get(bf.file);
    if (!e) { e = { img: null }; cfImgs.set(bf.file, e); loadImg(bf.file).then((im) => { e.img = im; }); }
    return e.img ? { cf: bf, img: e.img, hole: bf.hole } : null;
  }
  if (!/^c:/.test(style || '')) return null;
  const cf = (CFG.donate.customFrames || []).find((f) => 'c:' + f.id === style); if (!cf || !cf.file) return null;
  const url = 'church://user/frames/' + encodeURIComponent(cf.file);
  let e = cfImgs.get(url);
  if (!e) { e = { img: null }; cfImgs.set(url, e); loadFrameImg(cf.file).then((im) => { e.img = im; e.auto = im ? frameHole(im) : null; }); }
  if (!e.img) return null;
  return { cf, img: e.img, hole: cf.hole || e.auto || { x: 0.5, y: 0.5, r: 0.3 } };
}
const cfImgs = new Map();
function frameStyleFor(total) {
  const fs = (CFG.donate.frames || []).filter((f) => f && f.enabled !== false).sort((a, b) => a.min - b.min);
  if (!fs.length) return null;
  let r = fs[0]; for (const f of fs) if (total >= f.min) r = f;
  if (/^[cb]:/.test(r.style || '')) { customFrame(r.style); return r.style; }
  return FRAME_STYLES[r.style] ? r.style : 'gold';
}
function metal(g, x0, y0, x1, y1, cols) { const gr = g.createLinearGradient(x0, y0, x1, y1); cols.forEach((c, i) => gr.addColorStop(i / (cols.length - 1), c)); return gr; }
function gem(g, x, y, r, col) {
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, col); gr.addColorStop(1, '#10051a');
  g.fillStyle = metal(g, x - r, y - r, x + r, y + r, GOLD); g.beginPath(); g.arc(x, y, r * 1.35, 0, 7); g.fill();
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
}
const frameTexCache = new Map();
function frameTex(style, R) {
  const key = style + '|' + Math.round(R); if (frameTexCache.has(key)) return frameTexCache.get(key);
  if (frameTexCache.size > 12) frameTexCache.clear();
  const st = FRAME_STYLES[style], S = Math.ceil(R * 5), c = S / 2, rw = R * 0.16;
  const cv2 = document.createElement('canvas'); cv2.width = cv2.height = S; const g = cv2.getContext('2d');
  // cánh thiên thần
  if (st.wings) for (const sd of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const a = (-0.95 + i * 0.2), len = R * (1.25 - Math.abs(i - 3) * 0.08), bx = c + sd * R * 0.95, by = c - R * 0.05;
      g.save(); g.translate(bx, by); g.scale(sd, 1); g.rotate(a);
      const gr = g.createLinearGradient(0, 0, len, 0); gr.addColorStop(0, '#fff7de'); gr.addColorStop(0.7, '#ffe6a6'); gr.addColorStop(1, 'rgba(255,214,130,0.7)');
      g.fillStyle = gr; g.strokeStyle = 'rgba(176,122,34,0.8)'; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(len * 0.55, 0, len * 0.55, R * 0.11, 0, 0, 7); g.fill(); g.stroke(); g.restore();
    }
  }
  // vòng nguyệt quế
  if (st.laurel) for (const sd of [-1, 1]) {
    for (let i = 0; i < 11; i++) {
      const a = Math.PI / 2 + sd * (0.34 + i * 0.2), rr = R + rw * 1.55;
      const px = c + Math.cos(a) * rr, py = c + Math.sin(a) * rr;
      for (const off of [-1, 1]) {
        g.save(); g.translate(px + Math.cos(a) * off * R * 0.07, py + Math.sin(a) * off * R * 0.07);
        g.rotate(a + Math.PI / 2 * sd * -1 + off * 0.55 * sd);
        g.fillStyle = metal(g, -R * 0.12, -R * 0.05, R * 0.12, R * 0.05, ['#7a5214', '#f6d77a', '#a8741f']);
        g.beginPath(); g.ellipse(0, 0, R * 0.2, R * 0.075, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(70,40,5,0.7)'; g.lineWidth = 1.2; g.stroke(); g.restore();
      }
    }
  }
  // viền kim loại
  g.lineWidth = rw; g.strokeStyle = metal(g, c - R, c - R, c + R, c + R, st.ring); g.beginPath(); g.arc(c, c, R + rw / 2, 0, 7); g.stroke();
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(c, c, R + 1, 0, 7); g.stroke();
  g.strokeStyle = 'rgba(40,20,0,0.6)'; g.beginPath(); g.arc(c, c, R + rw, 0, 7); g.stroke();
  g.lineWidth = rw * 0.18; g.strokeStyle = metal(g, c + R, c - R, c - R, c + R, st.ring); g.beginPath(); g.arc(c, c, R + rw * 1.35, 0, 7); g.stroke();
  if (st.pearls) for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, x = c + Math.cos(a) * (R + rw / 2), y = c + Math.sin(a) * (R + rw / 2); const gr = g.createRadialGradient(x - 2, y - 2, 1, x, y, rw * 0.32); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#9aa4ae'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rw * 0.3, 0, 7); g.fill(); }
  if (st.gems) { const n = st.gems.length > 1 ? 8 : 6; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + Math.PI / 2; gem(g, c + Math.cos(a) * (R + rw / 2), c + Math.sin(a) * (R + rw / 2), rw * 0.36, st.gems[i % st.gems.length]); } }
  // thánh giá / vương miện trên đỉnh
  const top = c - R - rw * 1.3;
  if (st.crown) {
    const cw = R * 0.95, ch = R * 0.55, by = top + rw * 0.4;
    g.fillStyle = metal(g, c - cw / 2, by - ch, c + cw / 2, by, GOLD); g.strokeStyle = '#5e3a0c'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(c - cw / 2, by); g.lineTo(c - cw / 2, by - ch * 0.55); g.lineTo(c - cw * 0.27, by - ch * 0.3); g.lineTo(c - cw * 0.2, by - ch * 0.85); g.lineTo(c, by - ch * 0.42);
    g.lineTo(c + cw * 0.2, by - ch * 0.85); g.lineTo(c + cw * 0.27, by - ch * 0.3); g.lineTo(c + cw / 2, by - ch * 0.55); g.lineTo(c + cw / 2, by); g.closePath(); g.fill(); g.stroke();
    gem(g, c, by - ch * 0.2, rw * 0.3, '#ff2a48'); gem(g, c - cw * 0.3, by - ch * 0.15, rw * 0.22, '#2f7bff'); gem(g, c + cw * 0.3, by - ch * 0.15, rw * 0.22, '#2f7bff');
    for (const x of [c - cw / 2, c - cw * 0.2, c + cw * 0.2, c + cw / 2]) { g.fillStyle = '#fff6d0'; g.beginPath(); g.arc(x, by - ch * (x === c - cw / 2 || x === c + cw / 2 ? 0.55 : 0.85), rw * 0.14, 0, 7); g.fill(); }
    const cy = by - ch * 0.42 - R * 0.42; g.fillStyle = metal(g, c - 10, cy, c + 10, cy + R * 0.4, GOLD);
    g.fillRect(c - R * 0.04, cy, R * 0.08, R * 0.36); g.fillRect(c - R * 0.13, cy + R * 0.09, R * 0.26, R * 0.07);
  } else if (st.cross) {
    const h = R * 0.62, cy = top - h * 0.8;
    g.shadowColor = 'rgba(255,220,140,0.9)'; g.shadowBlur = 14;
    g.fillStyle = metal(g, c - h * 0.3, cy, c + h * 0.3, cy + h, st.ring);
    g.fillRect(c - h * 0.09, cy, h * 0.18, h); g.fillRect(c - h * 0.32, cy + h * 0.24, h * 0.64, h * 0.16); g.shadowBlur = 0;
  }
  const o = { cv: cv2, S }; frameTexCache.set(key, o); return o;
}
const RAYS = (() => {
  const S = 512, c = S / 2, cv2 = document.createElement('canvas'); cv2.width = cv2.height = S; const g = cv2.getContext('2d');
  const gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, 'rgba(255,236,170,0.95)'); gr.addColorStop(0.4, 'rgba(255,214,120,0.45)'); gr.addColorStop(1, 'rgba(255,200,90,0)');
  g.fillStyle = gr;
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; g.beginPath(); g.moveTo(c, c); g.arc(c, c, c, a - 0.07, a + 0.07); g.closePath(); g.fill(); }
  const gl = g.createRadialGradient(c, c, 0, c, c, c * 0.6); gl.addColorStop(0, 'rgba(255,240,190,0.8)'); gl.addColorStop(1, 'rgba(255,220,140,0)'); g.fillStyle = gl; g.fillRect(0, 0, S, S);
  return cv2;
})();
let cards = [];
function pushCard(w, ev, line) {
  const total = w.total || 1, style = (ev.frame || (w.ev && w.ev.frame)) || frameStyleFor(total); if (!style) return false; customFrame(style);
  const o = { name: cleanName(w.person.name), gift: ev.gift || '', count: w.count };
  const old = cards.find((c) => c.w === w);
  if (old) { old.style = style; old.shownAt != null && (old.until = Math.max(old.until || 0, now() + 3)); return true; }
  const txt = CFG.donate.frameText ? fmt(CFG.donate.frameText, o) : (line && line.text) || '';
  cards.push({ w, style, name: o.name, text: txt, shownAt: null });
  return true;
}
const cardDur = () => Math.max(2, CFG.donate.frameSeconds || 6);
function wrapLines(text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean), out = []; let line = '';
  for (const wd of words) { const tst = line ? line + ' ' + wd : wd; if (ctx.measureText(tst).width > maxW && line) { out.push(line); line = wd; } else line = tst; }
  if (line) out.push(line);
  if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
  return out;
}
function cardGeom() { const d = CFG.donate, k = d.frameScale || 1, R = 108 * k; return { k, R, cx: d.frameX ?? W / 2, cy: d.frameY ?? 1490, w: 940 * k, top: (d.frameY ?? 1490) - R * 1.75, h: R * 1.75 + R + 250 * k }; }
function drawCards(t) {
  cards = cards.filter((c) => c.shownAt == null || t < c.shownAt + (c.until ? Math.max(cardDur(), c.until - c.shownAt) : cardDur()) + 0.7);
  const c = cards[0]; if (!c) return;
  if (c.shownAt == null) c.shownAt = t;
  const dur = c.until ? Math.max(cardDur(), c.until - c.shownAt) : cardDur(), el = t - c.shownAt;
  const inA = clamp(el / 0.45, 0, 1), outA = clamp((dur + 0.7 - el) / 0.7, 0, 1), a = Math.min(inA, outA);
  if (a <= 0) return;
  const cus = customFrame(c.style);
  const st = cus ? { name: cus.cf.nameColor || '#ffe08a', rays: cus.cf.glow === false ? 0 : 0.8 } : (FRAME_STYLES[c.style] || FRAME_STYLES.gold), { k, R: R0, cx, cy } = cardGeom(), R = cus ? R0 * clamp(+cus.cf.size || 1, 0.3, 3) : R0;
  let fW = 0, fH = 0; if (cus) { fW = R / Math.max(0.02, cus.hole.r); fH = fW * cus.img.height / cus.img.width; }
  const pop = inA < 1 ? 1 + 2.2 * Math.pow(inA - 1, 3) + 1.2 * Math.pow(inA - 1, 2) : 1; // easeOutBack
  ctx.save(); ctx.globalAlpha = a;
  ctx.translate(cx, cy); ctx.scale(pop, pop); ctx.translate(-cx, -cy);
  // nền mờ cho chữ
  const tg = ctx.createLinearGradient(cx - 470 * k, 0, cx + 470 * k, 0);
  tg.addColorStop(0, 'rgba(30,14,2,0)'); tg.addColorStop(0.15, 'rgba(30,14,2,0.72)'); tg.addColorStop(0.85, 'rgba(30,14,2,0.72)'); tg.addColorStop(1, 'rgba(30,14,2,0)');
  ctx.fillStyle = tg; ctx.fillRect(cx - 470 * k, cy + R * 0.55, 940 * k, R * 0.45 + 250 * k);
  // hào quang xoay
  if (st.rays) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * Math.min(1, st.rays) * (0.75 + 0.25 * Math.sin(t * 2)); ctx.translate(cx, cy); ctx.rotate(t * 0.25); const rs = R * (2.6 + st.rays * 0.6); ctx.drawImage(RAYS, -rs, -rs, rs * 2, rs * 2); ctx.restore(); }
  // avatar
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  const p = c.w.person;
  if (p.avatarImg) { const im = p.avatarImg, s = Math.min(im.width, im.height); ctx.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, cx - R, cy - R, R * 2, R * 2); }
  else { const g = ctx.createLinearGradient(cx, cy - R, cx, cy + R); g.addColorStop(0, '#7a4a1c'); g.addColorStop(1, '#3a200a'); ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.fillStyle = '#ffe3a0'; ctx.font = `700 ${R * 1.05}px BeVN, "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(([...String(c.name || '?').trim()][0] || '?').toUpperCase(), cx, cy + R * 0.05); }
  ctx.restore();
  if (cus) ctx.drawImage(cus.img, cx - cus.hole.x * fW, cy - cus.hole.y * fH, fW, fH);
  else { const tex = frameTex(FRAME_STYLES[c.style] ? c.style : 'gold', R); ctx.drawImage(tex.cv, cx - tex.S / 2, cy - tex.S / 2); }
  // lấp lánh quanh khung
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const n = 6 + Math.round((st.rays || 0) * 8);
  for (let i = 0; i < n; i++) { const ang = i / n * Math.PI * 2 + t * 0.6, rr = R * (1.35 + 0.12 * Math.sin(t * 3 + i)), sz = R * (0.14 + 0.08 * Math.sin(t * 5 + i * 1.7)); ctx.globalAlpha = a * (0.5 + 0.5 * Math.sin(t * 4 + i)); ctx.drawImage(SPARK, cx + Math.cos(ang) * rr - sz, cy + Math.sin(ang) * rr - sz, sz * 2, sz * 2); }
  ctx.restore();
  // tên + lời chúc
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let fs = 64 * k; ctx.font = `700 ${fs}px Cormorant, Georgia, serif`;
  while (ctx.measureText(c.name).width > 880 * k && fs > 24) { fs -= 2; ctx.font = `700 ${fs}px Cormorant, Georgia, serif`; }
  const ny = (cus ? Math.max(cy + R * 1.1, cy + (1 - cus.hole.y) * fH * 0.92) : cy + R + R * 0.28) + 40 * k;
  ctx.shadowColor = 'rgba(255,190,80,0.95)'; ctx.shadowBlur = 20; ctx.fillStyle = st.name; ctx.fillText(c.name, cx, ny);
  ctx.shadowBlur = 8; ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.font = `500 ${32 * k}px BeVN, "Segoe UI", sans-serif`; ctx.fillStyle = '#fbe7c2';
  wrapLines(c.text, 860 * k, 3).forEach((ln, i) => ctx.fillText(ln, cx, ny + 58 * k + i * 42 * k));
  ctx.restore();
}

// ================== CAMERA ZOOM VÀO NGƯỜI DONATE ==================
let cam = null, CAMI = null; const camQ = [];
const MODE3D = () => false;   // bản 3D đã tách thành app riêng (Church Live 3D)
function camFor(w) { if (!CFG.scene.camZoom) return; if (!cam) cam = { w, start: w.t0 }; else camQ.push(w); }
function camView(t) {
  if (!cam && camQ.length) { const w = camQ.shift(); if (!w.done && APPROACH.includes(w.phase) && walkProgress(w) < 0.5) cam = { w, start: Math.max(t, w.t0) }; }
  CAMI = null;
  if (!cam || !CFG.scene.camZoom) return null;
  const inS = 0.45, outS = 0.6, hold = clamp(CFG.scene.camHold ?? 1, 0, 10), dt = t - cam.start;
  if (dt < 0) return null;
  if (dt > inS + hold + outS) { cam = null; return null; }
  const e = dt < inS ? ease(dt / inS) : dt < inS + hold ? 1 : 1 - ease((dt - inS - hold) / outS);
  CAMI = { w: cam.w, e, scale: clamp(CFG.scene.camScale || 1.8, 1, 4) };
  if (MODE3D()) return null;
  const w = cam.w, h = standH(w.rail), fx = w.x, fy = G.footOfRail(w.rail) - h * 0.6;
  const s = 1 + (clamp(CFG.scene.camScale || 1.8, 1, 4) - 1) * e;
  const vx = clamp(lerp(W / 2, fx, e), W / (2 * s), W - W / (2 * s)), vy = clamp(lerp(H / 2, fy, e), H / (2 * s), H - H / (2 * s));
  return { s, vx, vy };
}

// ================== TỰ CHÚC PHÚC KHI RẢNH ==================
const NAMES = (() => {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const VI = {
    m: { saint: ['Giuse', 'Phêrô', 'Phaolô', 'Gioan', 'Matthêu', 'Antôn', 'Đaminh', 'Micae', 'Vinh Sơn', 'Phanxicô', 'Giacôbê', 'Anrê', 'Tôma', 'Luca'], dem: ['Văn', 'Minh', 'Đức', 'Quốc', 'Hữu', 'Thanh', 'Gia', 'Bảo', 'Công', 'Trọng', 'Xuân', 'Quang'],
      ten: ['Hùng', 'Tuấn', 'Nam', 'Dũng', 'Phúc', 'Khoa', 'Hiếu', 'Long', 'Quân', 'Sơn', 'Bình', 'Huy', 'Kiên', 'Tú', 'Thắng', 'Hải', 'Toàn', 'Đạt', 'Trung', 'Vinh', 'Lộc', 'Tài', 'Phong', 'Tâm', 'An', 'Khang'], nick: ['anh', 'chú', 'ông', 'bác', 'cu'] },
    f: { saint: ['Maria', 'Anna', 'Têrêsa', 'Lucia', 'Martha', 'Rosa', 'Catarina', 'Agnes', 'Monica', 'Cecilia', 'Maria Goretti', 'Elizabeth', 'Agata', 'Clara'], dem: ['Thị', 'Ngọc', 'Thu', 'Kim', 'Thùy', 'Mỹ', 'Phương', 'Hoài', 'Thanh', 'Bảo', 'Diệu', 'Minh'],
      ten: ['Lan', 'Mai', 'Hoa', 'Linh', 'Trang', 'Hương', 'Hạnh', 'Thảo', 'Ngân', 'Vy', 'Yến', 'Thủy', 'Hằng', 'Nhung', 'Duyên', 'Loan', 'Trinh', 'Châu', 'Giang', 'Hà', 'Liên', 'Nga', 'Oanh', 'Quyên', 'Thắm', 'Uyên', 'Vân', 'Anh', 'Hân', 'Nhi', 'Diễm', 'My'], nick: ['bé', 'chị', 'cô', 'mẹ', 'bà', 'dì'] },
    ho: ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Đinh', 'Trương'],
    emo: ['🌸', '🙏', '❤️', '✨', '🌷', '💐', '🕊️', '🌻', '💖', '☘️']
  };
  const EN = {
    first: ['Mary', 'John', 'Grace', 'Michael', 'Sarah', 'David', 'Emily', 'James', 'Hannah', 'Joseph', 'Faith', 'Daniel', 'Rachel', 'Peter', 'Ruth', 'Matthew', 'Joy', 'Paul', 'Esther', 'Luke', 'Hope', 'Anna', 'Samuel', 'Rebecca', 'Abigail', 'Andrew', 'Lydia', 'Mark', 'Naomi', 'Elijah', 'Chloe', 'Isaac'],
    last: ['Smith', 'Johnson', 'Brown', 'Garcia', 'Miller', 'Davis', 'Lopez', 'Wilson', 'Taylor', 'Moore', 'Martin', 'Lee', 'Walker', 'Hall', 'Young', 'King', 'Wright', 'Scott', 'Green', 'Adams', 'Baker', 'Nelson', 'Carter', 'Reyes', 'Cruz', 'Santos', 'Rivera'],
    emo: ['🙏', '✝️', '❤️', '✨', '🕊️', '🌸', '💛', '🌿']
  };
  const strip = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/\s+/g, '');
  const yr = () => pick(['', '', String(70 + Math.floor(Math.random() * 30)), String(1975 + Math.floor(Math.random() * 30)), String(Math.floor(Math.random() * 99)).padStart(2, '0')]);
  const vi = () => {
    const G = Math.random() < 0.55 ? VI.f : VI.m, ten = pick(G.ten), r = Math.random();
    if (r < 0.2) return pick(G.saint) + ' ' + ten;                                   // Maria Lan
    if (r < 0.36) return pick(VI.ho) + ' ' + pick(G.dem) + ' ' + ten;                 // Nguyễn Thị Lan
    if (r < 0.5) return pick(G.dem) + ' ' + ten + (Math.random() < 0.5 ? ' ' + pick(VI.emo) : '');   // Ngọc Hân 🌸
    if (r < 0.6) return ten + ' ' + pick(VI.ho);                                       // Lan Nguyễn
    if (r < 0.68) return pick(G.nick) + ' ' + ten + (Math.random() < 0.4 ? ' ' + pick(VI.emo) : ''); // mẹ Hằng
    if (r < 0.8) { const b = strip((Math.random() < 0.5 ? pick(G.dem) : '') + ten).toLowerCase(), h = Math.random() < 0.5 ? strip(pick(VI.ho)).toLowerCase() : '', y = yr(); return b + (h || y ? pick(['', '.', '_']) : '') + h + y; } // thuytrang.92
    if (r < 0.9) return strip(ten) + ' ' + strip(pick(VI.ho));                         // Huong Pham
    return pick(G.saint) + ' ' + pick(VI.ho) + ' ' + ten;                             // Têrêsa Trần Mai
  };
  const en = () => {
    const f = pick(EN.first), l = pick(EN.last), r = Math.random();
    if (r < 0.35) return f + ' ' + l;
    if (r < 0.5) return f + ' ' + l[0] + '.';
    if (r < 0.65) return f + ' ' + pick(EN.emo);
    if (r < 0.85) { const y = yr(), ll = Math.random() < 0.5 ? l : ''; return (f + (ll || y ? pick(['', '.', '_']) : '') + ll).toLowerCase() + y; }
    return pick(['blessed', 'faithful', 'pray', 'grace', 'jesus.loves']) + pick(['_', '.', '']) + f.toLowerCase() + yr();
  };
  const recent = [];
  return (lang) => { let n = ''; for (let i = 0; i < 8; i++) { n = lang === 'en' ? en() : vi(); if (!recent.includes(n) && !people.some((p) => p.name === n)) break; } recent.push(n); if (recent.length > 60) recent.shift(); return n; };
})();
let lastRealGift = now(), nextIdleAt = 0;
function idleTick() {
  const d = CFG.donate, t = now();
  if (!d.idleEnabled || !assetsReady || !G) { nextIdleAt = 0; return; }
  const busy = walkers.some((w) => !w.done) || queue.length || cards.length || vq.length || vcur;
  if (busy) { if (nextIdleAt && nextIdleAt < t + 4) nextIdleAt = t + 4; return; }
  if (t - lastRealGift < (d.idleAfter ?? 30)) return;
  if (!nextIdleAt) { nextIdleAt = t + rnd(2, 6); return; }
  if (t < nextIdleAt) return;
  nextIdleAt = t + rnd(d.idleMin ?? 25, Math.max(d.idleMin ?? 25, d.idleMax ?? 60));
  const lang = CFG.scene.liveLang || CFG.audio.sermonLang || 'vi';
  const r = Math.random(), maxC = d.idleMaxCoins ?? 5;
  const coins = [r < 0.06 && maxC >= 30 ? 30 : 0, r < 0.1 && maxC >= 15 ? 15 : 0, r < 0.18 && maxC >= 10 ? 10 : 0, r < 0.4 && maxC >= 5 ? 5 : 0, 1].find((x) => x);
  const gifts = lang === 'en' ? ['Rose', 'Heart', 'Candle', 'Flower'] : ['Hoa hồng', 'Trái tim', 'Nến', 'Bông hoa'];
  const id = 'idle' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name = NAMES(lang);
  onJoin({ id, name, avatar: '', noGreet: Math.random() < 0.5 });
  setTimeout(() => onGift({ id, name, avatar: '', gift: gifts[Math.floor(Math.random() * gifts.length)], count: 1, diamonds: coins, total: coins, sim: true, idle: true, noSpeech: !d.idleSpeak }), rnd(1500, 4000));
}
setInterval(idleTick, 1000);
// ================== BẢNG CHÀO NGƯỜI VÀO LIVE ==================
const greets = [];
function addGreet(ev) {
  const c = CFG.greet; if (!c || !c.enabled || !ev.name) return;
  const ex = greets.findIndex((g) => g.id === ev.id); if (ex >= 0) greets.splice(ex, 1);
  const g = { id: ev.id, name: cleanName(ev.name), t: now(), avatarImg: null, text: ev.greetText || null };
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
    const txt = r.text || fmt(c.item || '{name}', { name: r.name });
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
  if (HEAVEN) { if (!HV.img.bg) { ctx.fillStyle = '#1c1840'; ctx.fillRect(0, 0, W, H); return; } H_render(t); drawSubtitles(t); drawGreet(t); hDrawTop(t); drawBanners(t); drawCards(t); drawTitle(); drawEdit(); return; }
  // video chúc phúc đang phủ kín màn → chỉ vẽ video (không vẽ nhà thờ phía dưới) cho nhẹ
  if (vcur && videoOpaque(t)) { drawVideo(t); drawEdit(); return; }
  if (MODE3D() && window.__3d && window.__3d.ready && G) {
    camView(t);
    if (videoOK && !video.paused) try { video.pause(); } catch {}
    ctx.clearRect(0, 0, W, H);
    try { window.__3d.render(t, CAMI); } catch (e) { if (!window.__err3d) { window.__err3d = 1; logp('Lỗi 3D: ' + e.message, 'error'); } }
    drawNames(); drawSubtitles(t); drawGreet(t); drawBanners(t); drawCards(t); drawTitle(); drawEdit();
    return;
  }
  const cv0 = G ? camView(t) : null;
  if (cv0) { ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(cv0.s, cv0.s); ctx.translate(-cv0.vx, -cv0.vy); }
  drawBG();
  if (!G) { if (cv0) ctx.restore(); return; }
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
  if (cv0) ctx.restore();
  drawSubtitles(t);
  drawGreet(t);
  drawBanners(t);
  drawCards(t);
  drawTitle();
  drawGuides();
  drawVideo(t);
  drawEdit();
}
let lastFrame = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  // giới hạn khung hình (mặc định 30 fps = đúng tốc độ TikTok LIVE) để giảm tải CPU/GPU
  const fps = CFG.scene.fps || 30, minDt = 1000 / fps - 2;
  if (ts && ts - lastFrame < minDt) return;
  lastFrame = ts || performance.now();
  const t = now(); const dt = Math.min(0.1, t - last); last = t;
  if (assetsReady && G) update(dt);
  try { render(); } catch (e) { if (!window.__renderErr) { window.__renderErr = 1; logp('Lỗi vẽ: ' + e.message, 'error'); } }
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
  if (d.frameEnabled !== false) { const cg = cardGeom(); items.push({ id: 'card', label: 'Khung avatar donate', color: '#ff9f43', rect: { x: cg.cx - cg.w / 2, y: cg.top, w: cg.w, h: cg.h } }); }
  if (HEAVEN) { const LB = { top: 'Thanh trên cùng', leader: 'Bảng leo cao nhất', intent: 'Bảng ý nguyện', quiz: 'Bảng câu đố', prayer: 'Bảng giờ cầu nguyện', verse: 'Thẻ Lời Chúa' }; for (const [k, r] of Object.entries(CFG.heaven.boards || {})) items.push({ id: 'hb:' + k, label: LB[k] || k, color: '#b48cff', rect: { ...r } }); return items; }
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
  } else if (/^hb:/.test(it.id)) {
    CFG.heaven.boards = { ...CFG.heaven.boards, [it.id.slice(3)]: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(Math.max(120, r.w)), h: Math.round(Math.max(50, r.h)) } };
  } else if (it.id === 'card') {
    const k = +clamp(r.w / 940, 0.4, 2).toFixed(2), R = 108 * k; d.frameScale = k; d.frameX = Math.round(r.x + r.w / 2); d.frameY = Math.round(r.y + R * 1.75);
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
  else if (it.id === 'card') await pick('donate', ['frameX', 'frameY', 'frameScale']);
  else if (/^hb:/.test(it.id)) await pick('heaven', ['boards']);
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
function setEditMode(on) { if (on && (CFG.scene.layoutLocked || (CFG.window && CFG.window.panelLocked))) { toPanel({ type: 'log', msg: 'Bố cục đang bị khóa — mở khóa trong Bảng điều khiển để chỉnh', level: 'warn' }); on = false; }
  editMode = !!on; drag = null; cv.style.cursor = ''; toPanel({ type: 'edit-mode', on: editMode }); }
function drawEdit() {
  if (!editMode) return;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, H);
  // xem trước nội dung để căn chỉnh
  if (!banners.some((b) => b.shownAt != null)) {
    const d = CFG.donate, k = d.bannerScale || 1, gw = Math.min(W, d.bannerWidth || 900), gh = 116 * k, cy = d.bannerY ?? 110;
    ctx.fillStyle = 'rgba(40,20,4,0.7)'; ctx.fillRect(W / 2 - gw / 2, cy - gh / 2, gw, gh);
    ctx.font = `700 ${50 * k}px Cormorant, Georgia, serif`; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(CFG.scene.liveLang === 'en' ? 'Viewer name has been blessed' : 'Tên người xem đã được chúc phúc', W / 2, cy);
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
  const voiceChanged = !first && (prev.audio.voice !== CFG.audio.voice || prev.audio.voiceVi !== CFG.audio.voiceVi || prev.audio.voiceEn !== CFG.audio.voiceEn || prev.audio.sermonLang !== CFG.audio.sermonLang || prev.audio.sermonMode !== CFG.audio.sermonMode || prev.audio.rate !== CFG.audio.rate || prev.audio.pitch !== CFG.audio.pitch || JSON.stringify(prev.audio.sermonTextsVi) !== JSON.stringify(CFG.audio.sermonTextsVi) || JSON.stringify(prev.audio.sermonTextsEn) !== JSON.stringify(CFG.audio.sermonTextsEn));
  if (voiceChanged) { sermon.idx = 0; sermonRestart(); if (CFG.audio.autoPretts !== false) setTimeout(() => pretts(false), 3000); }
  if (!first && prev.audio.sermonEnabled && !CFG.audio.sermonEnabled) sermonSkip();
  applyAudio();
  if ((CFG.scene.layoutLocked || (CFG.window && CFG.window.panelLocked)) && editMode) setEditMode(false);
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
  if (m.type === 'sim-live') { if (HEAVEN) H_event({ id: m.id || ('sim' + Math.floor(Math.random() * 5)), name: m.name || simName(), sim: true, ...m.ev }); return; }
  if (m.type === 'hv-quiz') { if (HEAVEN && !HV.quiz) { if (HV.prayer) logp('Đang giờ cầu nguyện — câu đố sẽ bắt đầu sau.', 'warn'); else hQuizStart(); } return; }
  if (m.type === 'hv-prayer') { if (HEAVEN && !HV.prayer) { HV.quiz = null; hPrayerStart(); } return; }
  if (m.type === 'hv-lanterns') { if (HEAVEN) { HV.litPairs = LANT.length; hCelebrate(); } return; }
  if (/^cam-/.test(m.type)) { if (window.__3d && window.__3d.cmd) window.__3d.cmd(m); else logp('Camera chỉ chỉnh được ở chế độ cảnh 3D.', 'warn'); return; }
  if (m.type === 'sim-join') { for (let i = 0; i < (m.n || 1); i++) handleJoin({ type: 'join', id: 'sim' + Math.random(), name: m.name || simName(), sim: true }); }
  if (m.type === 'sim-gift') {
    let id = 'sim' + Math.random(), name = m.name || simName();
    if (m.seated) { const p = people.filter((x) => !x.filler && x.state === 'seated' && !x.leaving)[Math.floor(Math.random() * namedCount())]; if (p) { id = p.id; name = p.name; } }
    if (m.avatar && !findPerson(id)) onJoin({ id, name, avatar: m.avatar });
    const coins = m.coins || 1;
    onGift({ id, name, avatar: m.avatar || '', gift: m.gift || 'Hoa hồng', count: m.count || 1, diamonds: coins, total: coins, sim: true, frame: m.frame || undefined });
  }
  if (m.type === 'clear') { for (const p of people) if (!p.filler && p.state === 'seated') removePerson(p, true); queue = []; }
  if (m.type === 'edit-layout') setEditMode(m.on);
  if (m.type === 'sim-social') { const ps = people.filter((x) => !x.filler && x.state === 'seated' && !x.leaving); const p = m.seated && ps.length ? ps[Math.floor(Math.random() * ps.length)] : null; onSocial({ type: m.kind, id: p ? p.id : 'sim' + Math.random(), name: p ? p.name : (m.name || simName()), sim: true }); }
  if (m.type === 'sermon-next') sermonSkip();
  if (m.type === 'sermon-restart') { sermon.idx = 0; sermonRestart(); }
  if (m.type === 'speak') speakBlessing(m.text);
  if (m.type === 'reload-assets') { imgCache.clear(); loadAssets(); }
  if (m.type === 'pretts') pretts(true);
});
// Tạo sẵn giọng đọc cho toàn bộ bài giảng (lưu file trên máy) — tự chạy nền khi mở app
const pre = { token: 0, done: 0, total: 0, ok: 0, running: false };
async function pretts(manual) {
  const my = ++pre.token;
  const lang = CFG.audio.sermonLang || 'vi', a = CFG.audio, voice = voiceFor(lang);
  const all = []; for (const sec of sermonSections()) { if (sec.title && a.readTitles) all.push(sec.title); for (const p of sec.paras) all.push(...splitSentences(p)); }
  pre.ok = 0; pre.total = all.length; pre.running = true;
  const send = (extra) => toPanel({ type: 'pretts', done: pre.ok, total: pre.total, ok: pre.ok, auto: !manual, ...extra });
  let backoff = 0;
  // tạo lần lượt từng câu (chạy nền, nhường cho câu đang giảng); câu lỗi thì chờ rồi thử lại đúng câu đó
  for (let k = 0; k < all.length && pre.token === my; ) {
    let r = null;
    try { r = await api.tts({ text: speakable(all[k]), voice, rate: a.rate, pitch: a.pitch, bg: true }); } catch (e) { r = { ok: false, error: e.message }; }
    if (pre.token !== my) return;
    if (r && r.ok) { pre.ok++; k++; backoff = 0; send(); if (!r.cached) await sleep(250); continue; }
    backoff = Math.min(60, backoff ? backoff * 2 : 5);
    send({ waiting: backoff, error: (r && r.error) || 'lỗi mạng' });
    await sleep(backoff * 1000);
  }
  if (pre.token === my) { pre.running = false; send(); if (pre.ok === pre.total) logp('Đã tạo sẵn giọng đọc cho toàn bộ bài giảng (' + pre.total + ' câu, ' + (lang === 'vi' ? 'tiếng Việt' : 'tiếng Anh') + ') — giảng sẽ không còn ngừng chờ.'); }
}
// ---- Follow / chia sẻ: chúc phúc ----
const socialSeen = new Map();
let lastSocialSpeak = 0;
function socialSpeak(text) {
  const t = now(); if (t - lastSocialSpeak < (CFG.social.speakCooldown || 0)) return;
  lastSocialSpeak = t; speakBlessing(text);
}
function onSocial(ev) {
  if (!assetsReady || !CFG.social) return;
  if (HEAVEN) return H_social(ev);
  const c = CFG.social[ev.type]; if (!c || !c.enabled) return;
  const key = ev.type + '|' + ev.id, t = now();
  const cd = ev.type === 'follow' ? 6 * 3600 : (c.cooldown || 0);
  if (!ev.sim && socialSeen.has(key) && t - socialSeen.get(key) < cd) return;
  socialSeen.set(key, t);
  const name = cleanName(ev.name);
  if (ev.type !== 'join' || c.greetText) addGreet({ ...ev, greetText: fmt(c.greetText || '{name}', { name }) });
  if (ev.type !== 'join') toPanel({ type: 'log', msg: (ev.type === 'follow' ? '❤ ' + ev.name + ' đã theo dõi' : '🔗 ' + ev.name + ' đã chia sẻ buổi live') + ' → ' + (c.mode === 'walk' ? 'đi lên bục' : 'chúc phúc tại chỗ') });
  if (c.mode === 'walk') { onJoin({ ...ev, noGreet: true }); onGift({ ...ev, social: ev.type, gift: ev.type === 'follow' ? 'theo dõi' : ev.type === 'share' ? 'chia sẻ' : 'vào nhà thờ', count: 1, total: 0 }); return; }
  let p = findPerson(ev.id);
  if (!p) { onJoin({ ...ev, noGreet: true }); p = findPerson(ev.id); }
  if (!p) return;
  if (p.state === 'seated') p.expires = Math.max(p.expires, t + (c.glowSeconds || 5) + 5);
  p.glowStart = t + 0.4; p.glowUntil = p.glowStart + (c.glowSeconds || 5); p.glowText = fmt(c.floatText || '', { name });
  chime();
  if (c.speak) socialSpeak({ text: fmt(c.speech, { name }), lang: textLang(c.speech) });
  // vài đốm sáng bay lên
  if (p.slot) for (let i = 0; i < 18; i++) fx.push({ x: p.slot.x + rnd(-40, 40), y: p.slot.headTop + rnd(0, p.slot.cropH * 0.6), vx: rnd(-10, 10), vy: rnd(-70, -15), life: rnd(1.2, 2.4), max: 2.4, r: rnd(2, 4.5) });
}
// người mới vào: cho ngồi + (tuỳ chọn) chúc phúc
function handleJoin(ev) {
  const isNew = !findPerson(ev.id);
  onJoin(ev);
  const c = CFG.social && CFG.social.join;
  if (c && c.enabled && (isNew || ev.sim)) setTimeout(() => onSocial({ ...ev, type: 'join' }), Math.max(0, (CFG.seating.fadeSeconds || 1) * 1000 * 0.6));
}
api.onLiveEvent((ev) => {
  if (!ev) return;
  if (HEAVEN) { if (assetsReady) { if (ev.type === 'gift') lastRealGift = now(); H_event(ev); } return; }
  if (ev.type === 'follow' || ev.type === 'share') { onSocial(ev); return; }
  if (ev.type === 'join') { if (ev.anon) { if (CFG.seating.anonSeats === false) return; ev = { ...ev, name: ev.name || CFG.seating.anonName || 'Khách' }; } handleJoin(ev); }
  else if (ev.type === 'chat' && CFG.seating.chatAlsoSeats) { if (!findPerson(ev.id)) onJoin(ev); }
  else if (ev.type === 'like' && CFG.seating.likeAlsoSeats) { if (!findPerson(ev.id)) onJoin(ev); }
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
  if (CFG.audio.autoPretts !== false) setTimeout(() => pretts(false), 8000);
  // test mode (headless)
  if (location.hash.includes('demo')) {
    setTimeout(() => { for (let i = 0; i < 18; i++) onJoin({ id: 'd' + i, name: simName() }); }, 1500);
  }
})();
/*HEAVEN-BEGIN*/
// ================== HEAVEN LIVE — cảnh cầu thang lên thánh đường (8-bit) ==================
// File này được chèn vào stage.js (dùng chung biến của màn hình). Sửa ở đây rồi chạy: node tools/inject-heaven.js
const HEAVEN = true;
const HD = window.HEAVEN_DATA;
const HC = () => CFG.heaven;
const HL = () => (CFG.scene.liveLang === 'en' ? 'en' : 'vi');
const IX = (x) => x * 1.25 - 100, IY = (y) => y * 1.25;            // toạ độ ảnh nền 1024×1536 → khung 1080×1920
const ST = { yB: IY(1440), yT: IY(945), xLB: IX(165), xRB: IX(860), xLT: IX(440), xRT: IX(590) };
const LANT = [[143, 1255], [237, 1157], [302, 1063], [362, 1005], [405, 953], [428, 913]];
const LANT_R = [[885, 1255], [790, 1157], [722, 1063], [662, 1005], [621, 953], [597, 913]];
const FALLS = [[75, 850, 120, 960], [175, 965, 230, 1085], [795, 965, 850, 1085], [905, 850, 950, 960]];
const HEART = { x: IX(511), y: IY(304) }, DOOR = { x: IX(515), y: IY(908) };
const TRUMPET = [{ x: IX(237), y: IY(89) }, { x: IX(787), y: IY(89) }], HARP = [{ x: IX(153), y: IY(620) }, { x: IX(816), y: IY(616) }];
const HV = { climbers: new Map(), candles: [], intents: [], intentQ: [], verseQ: [], verseCur: null, fireworks: [], notes: [], angels: [], floats: [],
  likesTotal: 0, lanternAcc: 0, litPairs: 0, fullAt: 0, celebrateUntil: 0, heart: 0, heartFlash: -99, shares: 0, goldUntil: 0,
  quiz: null, nextQuiz: 0, quizUsed: new Set(), prayer: null, nextPrayer: 0, lastAct: 0, lastIntentSpeak: 0, best: new Map(), followers: new Set(),
  promptI: 0, nextPrompt: 0, nextAngel: 0, img: {}, statsDirty: 0, cam: { s: 1, x: W / 2, y: H / 2 } };
const hnorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
const hkw = (k) => String(HC()[k] || '').split(',').map((x) => hnorm(x)).filter(Boolean);
const hhash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967295; };
function hLane() { const us = [...HV.climbers.values()].filter((c) => c.state !== 'leave' && c.step < 8).map((c) => c.u); let best = 0, bd = -1; for (let i = 0; i < 11; i++) { const u = -0.78 + i * 0.156 + (Math.random() - 0.5) * 0.05; const d = us.length ? Math.min(...us.map((x) => Math.abs(x - u))) : 1 + Math.random(); if (d > bd) { bd = d; best = u; } } return best; }
function hsay(key, o) { const L = HL(), t = ((HC().speech || {})[L] || {})[key] || ((CHURCH_DEFAULTS.heaven.speech || {})[L] || {})[key]; if (!t) return; speakBlessing({ text: fmt(t, o || {}), lang: L }); }
function hbad(t) {
  const low = ' ' + String(t || '').toLowerCase().replace(/[.,!?;:()\[\]"'“”]+/g, ' ').replace(/\s+/g, ' ') + ' ', asc = ' ' + hnorm(t) + ' ';
  if (/(\d[\s.-]?){8,}/.test(t)) return true;   // số điện thoại
  return HD.bad.some((b) => { const viet = /[^\x00-\x7f]/.test(b), x = viet ? b.toLowerCase() : hnorm(b), hay = viet ? low : asc; return x.length <= 3 || viet ? hay.includes(' ' + x + ' ') : hay.includes(x); });
}

// ---------- ảnh ----------
(async () => {
  const L = (n) => loadImg('church://app/assets/heaven/' + n);
  HV.img.bg = await L('bg.png');
  HV.img.angel = [await L('angel_0.png'), await L('angel_1.png')];
  HV.img.angelT = [await L('angel_trumpet_0.png'), await L('angel_trumpet_1.png')];
  try { const f = new FontFace('PixelVN', 'url(church://app/assets/heaven/pixel.woff)'); await f.load(); document.fonts.add(f); } catch {}
})();
const PX = (n) => `${n}px PixelVN, "Courier New", monospace`;

// ---------- âm thanh 8-bit ----------
function chip(notes, type = 'square', step = 0.11, vol = 0.07) {
  try {
    const t0 = AC.currentTime + 0.02;
    notes.forEach((f, i) => {
      if (!f) return; const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f;
      const s = t0 + i * step; g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(vol, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, s + step * 1.8);
      o.connect(g); g.connect(master); o.start(s); o.stop(s + step * 2);
    });
  } catch {}
}
const SFX = {
  step: () => chip([880], 'square', 0.04, 0.025),
  fanfare: () => chip([523, 659, 784, 1047, 0, 784, 1047, 1319], 'square', 0.13, 0.06),
  harp: () => chip([523, 659, 784, 988, 1175, 1319, 1568], 'triangle', 0.07, 0.08),
  bell: () => chip([1568, 1175, 1568, 2093], 'triangle', 0.16, 0.07),
  coin: () => chip([988, 1319], 'square', 0.07, 0.05),
  win: () => chip([784, 988, 1175, 1568, 1319, 1568], 'square', 0.09, 0.06),
  lift: () => chip([392, 523, 659, 784, 1047], 'triangle', 0.08, 0.07)
};

// ---------- nhân vật 2D → pixel 8-bit ----------
const PIXC = new Map();
function hpix(setName, fr, robe) {
  const key = setName + '|' + fr + '|' + (robe ? 1 : 0); if (PIXC.has(key)) return PIXC.get(key);
  const set = WALKERS[setName]; const f = set && (set[fr] || set.back1); if (!f) return null;
  const src = f.img, th = 48, tw = Math.max(8, Math.round(src.width * th / src.height));
  const c = document.createElement('canvas'); c.width = tw + 2; c.height = th + 2; const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true; g.drawImage(src, 1, 1, tw, th);
  const d = g.getImageData(0, 0, c.width, c.height), a = d.data, Wc = c.width, Hc = c.height, solid = new Uint8Array(Wc * Hc);
  for (let i = 0; i < Wc * Hc; i++) {
    const k = i * 4; if (a[k + 3] < 110) { a[k + 3] = 0; continue; }
    solid[i] = 1; a[k + 3] = 255;
    let r = a[k], gg = a[k + 1], b = a[k + 2];
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 510, sat = mx ? (mx - mn) / mx : 0;
    let hue = 0; if (mx !== mn) { if (mx === r) hue = ((gg - b) / (mx - mn)) * 60; else if (mx === gg) hue = (2 + (b - r) / (mx - mn)) * 60; else hue = (4 + (r - gg) / (mx - mn)) * 60; if (hue < 0) hue += 360; }
    const skin = hue >= 8 && hue <= 45 && sat > 0.15 && sat < 0.7 && l > 0.38;
    if (robe && !skin) { const v = 190 + l * 65; r = v; gg = v; b = Math.min(255, v + 8); }
    else { const m = (r + gg + b) / 3; r = m + (r - m) * 1.25; gg = m + (gg - m) * 1.25; b = m + (b - m) * 1.25; }
    a[k] = Math.max(0, Math.min(255, Math.round(r / 40) * 40)); a[k + 1] = Math.max(0, Math.min(255, Math.round(gg / 40) * 40)); a[k + 2] = Math.max(0, Math.min(255, Math.round(b / 40) * 40));
  }
  for (let y = 0; y < Hc; y++) for (let x = 0; x < Wc; x++) {
    const i = y * Wc + x; if (solid[i]) continue;
    if ((x > 0 && solid[i - 1]) || (x < Wc - 1 && solid[i + 1]) || (y > 0 && solid[i - Wc]) || (y < Hc - 1 && solid[i + Wc])) { const k = i * 4; a[k] = 34; a[k + 1] = 22; a[k + 2] = 40; a[k + 3] = 255; }
  }
  g.putImageData(d, 0, 0); PIXC.set(key, c); return c;
}

// ---------- hình học cầu thang ----------
const SWB = ST.xRB - ST.xLB, SWT = ST.xRT - ST.xLT;
function stepY(s) { const f = clamp(s / Math.max(1, HC().steps), -0.25, 1.06); const w = 1 / lerp(1 / SWB, 1 / SWT, f); return ST.yB + (w - SWB) / (SWT - SWB) * (ST.yT - ST.yB); }
function stairW(y) { return lerp(SWB, SWT, (y - ST.yB) / (ST.yT - ST.yB)); }
function stairC(y) { return lerp((ST.xLB + ST.xRB) / 2, (ST.xLT + ST.xRT) / 2, (y - ST.yB) / (ST.yT - ST.yB)); }
function posOf(step, u) { const y = stepY(step); return { x: stairC(y) + u * stairW(y) / 2, y, k: stairW(y) / SWB }; }

// ---------- người leo ----------
function hClimber(ev, create = true) {
  if (!ev || !ev.id) return null;
  let c = HV.climbers.get(ev.id);
  if (c || !create) { if (c && ev.avatar && !c.avatar) { c.avatar = ev.avatar; loadAvatar(ev.avatar).then((im) => { c.avatarImg = im; }); } return c; }
  if (HV.climbers.size >= (HC().maxClimbers || 60)) {
    const old = [...HV.climbers.values()].filter((x) => x.state === 'climb' && !x.flying).sort((a, b) => a.last - b.last)[0];
    if (old) old.state = 'leave', old.leaveT = now(); else return null;
  }
  const t = now(), name = cleanName(ev.name || (HL() === 'en' ? 'Guest' : 'Khách'));
  const gender = guessGenderFromName(ev.name || '');
  c = { id: ev.id, name, avatar: ev.avatar || '', avatarImg: null, gender, set: pickWalker(gender), step: -0.9, target: 0, u: hLane(),
    born: t, last: t, likes: 0, state: 'climb', robe: HV.followers.has(ev.id), acc: null, laurel: false, prayUntil: 0, frameT: 0, alpha: 0, sim: !!ev.sim };
  HV.climbers.set(ev.id, c);
  if (ev.avatar) loadAvatar(ev.avatar).then((im) => { c.avatarImg = im; if (im && CFG.characters.genderMode === 'auto') detectGender(im).then((r) => { if (r && r.g !== c.gender) { c.gender = r.g; c.set = pickWalker(r.g); } }); });
  return c;
}
function hFloat(c, text, color = '#ffe08a') { const p = posOf(c.step, c.u); HV.floats.push({ x: p.x, y: p.y - 150 * p.k, text, color, t: now(), k: p.k }); }
function hSpark(x, y, n, spread = 40, up = 1) { for (let i = 0; i < n; i++) fx.push({ x: x + rnd(-spread, spread), y: y + rnd(-spread, spread * 0.5), vx: rnd(-25, 25), vy: rnd(-90, -20) * up, life: rnd(1, 2.2), max: 2.2, r: rnd(2, 5) }); }
function hAct() { HV.lastAct = now(); }

// ---------- sự kiện ----------
function H_join(ev) {
  if (!ev.noGreet && ev.type !== 'gift') addGreet(ev);
  if (HC().spawnOnJoin !== false || ev.sim) { const c = hClimber(ev); if (c) c.last = now(); }
}
function H_like(ev) {
  const n = Math.max(1, Math.min(500, +ev.count || 1)), t = now(); hAct();
  HV.likesTotal += n;
  const c = hClimber(ev);
  if (c) {
    c.likes += n; c.last = t;
    if (c.state === 'climb') c.target = Math.min(HC().steps + 0.02, Math.max(c.target, Math.floor(c.step)) + Math.min(HC().maxStepsPerBurst || 8, Math.ceil(n * (HC().stepsPerLike || 1))));
    const p = posOf(c.step, c.u); for (let i = 0; i < Math.min(4, n); i++) HV.floats.push({ heart: true, x: p.x + rnd(-14, 14), y: p.y - 140 * p.k, t: t + i * 0.12, k: p.k, text: '' });
  }
  // đèn lồng
  if (HV.litPairs < LANT.length) {
    HV.lanternAcc += n;
    while (HV.lanternAcc >= (HC().lanternLikes || 300) && HV.litPairs < LANT.length) {
      HV.lanternAcc -= HC().lanternLikes || 300; HV.litPairs++; SFX.coin();
      const [lx, ly] = LANT[HV.litPairs - 1], [rx, ry] = LANT_R[HV.litPairs - 1]; hSpark(IX(lx), IY(ly), 14, 20); hSpark(IX(rx), IY(ry), 14, 20);
      if (HV.litPairs === LANT.length) hCelebrate();
    }
  }
  // Thánh Tâm
  HV.heart += n;
  if (HV.heart >= (HC().heartGoal || 1500)) { HV.heart = 0; HV.heartFlash = t; SFX.bell(); hsay('heart'); for (const x of HV.climbers.values()) { const p = posOf(x.step, x.u); hSpark(p.x, p.y - 80 * p.k, 6, 20); } hSpark(HEART.x, HEART.y, 40, 60); }
  if (HV.prayer) HV.prayer.likes += n;
}
function hCelebrate() {
  const t = now(); HV.fullAt = t; HV.celebrateUntil = t + 12; SFX.fanfare(); hsay('lanterns');
  for (const tp of TRUMPET) for (let i = 0; i < 8; i++) HV.notes.push({ x: tp.x, y: tp.y, vx: rnd(-40, 40), vy: rnd(-60, -20), t: t + i * 0.25 });
  for (let i = 0; i < 4; i++) hAngel(true);
  for (let i = 0; i < 6; i++) hFirework(t + i * 0.6);
}
function hFirework(at) { HV.fireworks.push({ x: rnd(180, 900), y: 1900, ty: rnd(380, 760), t: at || now(), col: ['#ffe08a', '#ffffff', '#ffb3c8', '#9fd8ff'][Math.floor(rnd(0, 4))], boom: 0 }); }
function hAngel(fast) { const fromL = Math.random() < 0.5; HV.angels.push({ x: fromL ? -80 : W + 80, y: rnd(380, 1000), vx: (fromL ? 1 : -1) * rnd(110, 170) * (fast ? 1.5 : 1), t: now(), trumpet: Math.random() < 0.5 }); }
function H_chat(ev) {
  const raw = String(ev.text || '').trim(); if (!raw) return; hAct();
  const c = hClimber(ev), t = now(), n = hnorm(raw), L = HL();
  if (c) { c.last = t; if (c.state === 'climb' && HC().stepsPerComment) c.target = Math.min(HC().steps + 0.02, Math.max(c.target, Math.floor(c.step)) + HC().stepsPerComment); }
  // câu đố
  const q = HV.quiz;
  if (q && !q.winner && t < q.until) {
    const opts = q.data[1].map(hnorm), m = /^(?:dap an|dap an la|answer|cau|chon)?\s*([abc])[\s.!)]*$/.exec(n);
    const pick = m ? 'abc'.indexOf(m[1]) : opts.findIndex((o) => o && n === o);
    if (pick >= 0 && pick === q.data[2]) { hQuizWin(ev, c); return; }
  }
  const has = (k) => hkw(k).some((w) => n === w || n.startsWith(w + ' ') || n.includes(' ' + w + ' ') || n.endsWith(' ' + w) || (w.length > 3 && n.includes(w)));
  if (hkw('kwIntention').some((w) => n.startsWith(w))) { hIntention(ev, raw); return; }
  if (has('kwVerse')) { hVerse(ev); return; }
  if (has('kwAlleluia')) { if (c) { c.prayUntil = t + 2.5; hFloat(c, 'Alleluia!', '#fff3b0'); } SFX.harp(); for (const hp of HARP) for (let i = 0; i < 7; i++) HV.notes.push({ x: hp.x, y: hp.y, vx: rnd(-30, 30), vy: rnd(-55, -25), t: t + i * 0.15 }); return; }
  if (has('kwAmen')) { if (c) { c.prayUntil = t + 3; hFloat(c, 'Amen 🙏', '#ffe08a'); } SFX.coin(); return; }
  if (has('kwCandle')) { hCandle(c, false); if (c) hFloat(c, '🕯', '#ffd27a'); return; }
}
function hCandle(c, donor) {
  if (!c) return; const t = now(), side = c.u < 0 ? -1 : 1, s = clamp(Math.round(Math.max(0, c.step) + rnd(-2, 2)), 0, HC().steps - 1);
  HV.candles = HV.candles.filter((x) => x.donor || t < x.until);
  if (!donor && HV.candles.filter((x) => !x.donor).length >= (HC().maxCandles || 40)) HV.candles.splice(HV.candles.findIndex((x) => !x.donor), 1);
  HV.candles.push({ s, side, off: rnd(0.86, 0.97), name: c.name, until: donor ? Infinity : t + (HC().candleSeconds || 300), donor, born: t, ph: rnd(0, 6) });
}
function hIntention(ev, raw) {
  let text = raw.replace(/\s+/g, ' ').trim(); if (text.length > 110) text = text.slice(0, 108) + '…';
  if (hbad(text)) { toPanel({ type: 'log', msg: 'Bỏ qua ý nguyện có từ không phù hợp: ' + ev.name, level: 'warn' }); return; }
  const it = { name: cleanName(ev.name), text, t: now(), avatar: ev.avatar };
  HV.intents.unshift(it); if (HV.intents.length > 20) HV.intents.length = 20;
  const c = hClimber(ev); if (c) { hFloat(c, '🙏', '#ffe08a'); c.prayUntil = now() + 3; }
  if (HC().readIntentions && HV.intentQ.length < 8) HV.intentQ.push(it);
  SFX.coin(); toPanel({ type: 'log', msg: '🙏 Ý nguyện của ' + it.name + ': ' + text });
}
function hVerse(ev) {
  const L = HL(), list = HD.verses[L]; if (!list || !list.length) return;
  const v = list[Math.floor(Math.random() * list.length)];
  if (HV.verseQ.length < 6 && !HV.verseQ.some((x) => x.id === ev.id)) HV.verseQ.push({ id: ev.id, name: cleanName(ev.name), avatar: ev.avatar, v });
  if (ev.avatar) loadAvatar(ev.avatar).then((im) => { const x = HV.verseQ.find((q) => q.id === ev.id) || (HV.verseCur && HV.verseCur.id === ev.id ? HV.verseCur : null); if (x) x.avatarImg = im; });
}
function H_social(ev) {
  const c = hClimber(ev), t = now(); hAct();
  if (!c) return;
  c.last = t;
  if (ev.type === 'share') {
    HV.shares++;
    c.lift = { t, phase: 'down' }; SFX.lift();
    HV.angels.push({ carry: c.id, x: posOf(c.step, c.u).x + 140, y: 300, vx: 0, t, trumpet: false });
    hsay('share', { name: c.name }); addGreet({ ...ev, greetText: (HL() === 'en' ? '🔗 {name} shared the LIVE' : '🔗 {name} đã chia sẻ live').replace('{name}', c.name) });
    if (HV.shares % Math.max(1, HC().shareMilestone || 20) === 0) { HV.goldUntil = t + 25; for (let i = 0; i < 8; i++) hFirework(t + i * 0.5); SFX.fanfare(); }
  } else if (ev.type === 'follow') {
    HV.followers.add(c.id); if (HC().followRobe !== false) c.robe = true; SFX.bell();
    const p = posOf(c.step, c.u); hSpark(p.x, p.y - 80 * p.k, 24, 30);
    hFloat(c, HL() === 'en' ? 'Welcome! ✝' : 'Gia nhập cộng đoàn ✝', '#ffffff');
    addGreet({ ...ev, greetText: (HL() === 'en' ? '✝ {name} joined the community' : '✝ {name} đã gia nhập cộng đoàn').replace('{name}', c.name) });
    hsay('follow', { name: c.name });
  }
}
function H_gift(ev) {
  const total = ev.total ?? (ev.diamonds || 0) * (ev.count || 1);
  if (total < CFG.donate.minDiamonds && !ev.sim && !ev.social) return;
  const c = hClimber(ev); if (!c) return; hAct();
  c.last = now(); c.total = (c.total || 0) + total;
  c.acc = c.total >= 30 ? 'crown' : c.total >= 5 ? 'cape' : 'wreath';
  const line = blessingLine({ name: c.name, gift: ev.gift || '', count: ev.count || 1 });
  (HV.giftQ = HV.giftQ || []).push({ c, ev, line, total });
  if (HC().donorCandle !== false && !HV.candles.some((x) => x.donor && x.name === c.name)) hCandle(c, true);
}
function hQuizWin(ev, c) {
  const q = HV.quiz; q.winner = cleanName(ev.name); q.winAt = now(); q.until = Math.min(q.until, now() + 7);
  if (c) { c.laurel = true; c.prayUntil = now() + 3; const p = posOf(c.step, c.u); hSpark(p.x, p.y - 90 * p.k, 26, 30); }
  SFX.win(); hsay('quizWin', { name: q.winner });
  addGreet({ ...ev, greetText: (HL() === 'en' ? '🏆 {name} answered correctly' : '🏆 {name} trả lời đúng').replace('{name}', q.winner) });
}

// ---------- cập nhật ----------
function H_update(dt) {
  const t = now(), S = HC().steps, cfg = HC();
  // hàng đợi bay lên gặp Chúa (donate)
  if (HV.giftQ && HV.giftQ.length && ![...HV.climbers.values()].some((x) => x.fly)) {
    const g = HV.giftQ.shift(), c = g.c;
    if (HV.climbers.get(c.id) === c) {
      const p = posOf(c.step, c.u); c.fly = { t, from: { x: p.x, y: p.y, k: p.k }, line: g.line, ev: g.ev, total: g.total }; c.state = 'climb';
      SFX.lift(); toPanel({ type: 'blessed', name: c.name, gift: g.ev.gift, count: g.ev.count || 1, idle: !!g.ev.idle });
    }
  }
  for (const c of [...HV.climbers.values()]) {
    c.alpha = c.state === 'leave' ? clamp(1 - (t - c.leaveT) / 0.8, 0, 1) : clamp((t - c.born) / 0.6, 0, 1);
    if (c.state === 'leave') { if (c.alpha <= 0) HV.climbers.delete(c.id); continue; }
    if (c.fly) {
      const f = c.fly, e = t - f.t, up = 2.4, hold = Math.max(3, CFG.donate.blessSeconds || 6), down = 1.6;
      if (e > 0.3 && !f.blessed) { f.blessed = true; if (CFG.donate.speakBlessing && !f.ev.noSpeech) speakBlessing(f.line); if (!(CFG.donate.frameEnabled !== false && pushCard({ person: c, total: f.total, count: f.ev.count || 1, ev: f.ev }, f.ev, f.line))) {} chime(); }
      if (e > up && !f.arrived) { f.arrived = true; hSpark(HEART.x, HEART.y + 120, 40, 50); SFX.bell(); }
      if (e > up && e < up + hold && Math.random() < dt * 14) hSpark(HEART.x + rnd(-40, 40), HEART.y + 150, 1, 30);
      if (e > up + hold + down) { c.fly = null; c.last = t; }
      c.frameT += dt; continue;
    }
    if (c.lift) {
      const L = c.lift, e = t - L.t;
      if (L.phase === 'down' && e > 1.2) { L.phase = 'carry'; L.t2 = t; c.target = Math.min(S + 0.02, Math.max(c.target, c.step) + (cfg.shareSteps || 12)); }
      if (L.phase === 'carry' && (c.step >= c.target - 0.05 || t - L.t2 > 6)) { c.lift = null; const a = HV.angels.find((x) => x.carry === c.id); if (a) { a.carry = null; a.vx = 220; a.vy = -120; } }
    }
    if (c.state === 'enter') { if (t - c.enterT > 2.6) HV.climbers.delete(c.id); continue; }
    const speed = (cfg.climbSpeed || 3.2) * (c.lift && c.lift.phase === 'carry' ? 3 : 1) * (c.target - c.step > 6 ? 1.6 : 1);
    const prev = c.step;
    if (c.step < c.target) { c.step = Math.min(c.target, c.step + speed * dt); c.frameT += dt; c.moving = true; } else c.moving = false;
    if (Math.floor(c.step) > Math.floor(prev) && c.step > 0 && Math.random() < 0.35) SFX.step();
    const b = HV.best.get(c.id); if (!b || c.step > b.best || t - b.t > (cfg.leaderMinutes || 10) * 60) HV.best.set(c.id, { name: c.name, c, best: Math.max(c.step, b && t - b.t < (cfg.leaderMinutes || 10) * 60 ? b.best : 0), t });
    if (c.step >= S) {
      c.state = 'enter'; c.enterT = t; SFX.fanfare(); hSpark(DOOR.x, DOOR.y, 30, 40);
      const st = cfg.stats || {}, day = new Date().toISOString().slice(0, 10);
      HV.reached = (st.date === day ? st.reached || 0 : 0) + 1; HV.statsDirty = t; CFG.heaven.stats = { date: day, reached: HV.reached };
      hsay('top', { name: c.name });
      addGreet({ id: c.id, name: c.name, greetText: (HL() === 'en' ? '⛪ {name} reached the cathedral' : '⛪ {name} đã tới thánh đường').replace('{name}', c.name) });
      continue;
    }
    if (!c.moving && t - c.last > (cfg.idleSeconds || 12) && !c.lift) { c.state = 'leave'; c.leaveT = t; }
  }
  if (HV.statsDirty && t - HV.statsDirty > 3) { HV.statsDirty = 0; api.getConfig().then((raw) => { raw.heaven = { ...(raw.heaven || {}), stats: CFG.heaven.stats }; api.setConfig({ heaven: raw.heaven }); }); }
  // đèn lồng: thắp đủ thì giữ một lúc rồi bắt đầu vòng mới
  if (HV.litPairs >= LANT.length && t - HV.fullAt > (cfg.lanternHold || 120)) { HV.litPairs = 0; HV.lanternAcc = 0; }
  // đọc ý nguyện
  if (HV.intentQ.length && t - HV.lastIntentSpeak > (cfg.intentionGap || 15)) { const it = HV.intentQ.shift(); HV.lastIntentSpeak = t; hsay('intention', { name: it.name, text: it.text }); }
  // Lời Chúa
  if (HV.verseCur && t > HV.verseCur.until) HV.verseCur = null;
  if (!HV.verseCur && HV.verseQ.length) { const v = HV.verseQ.shift(); v.t = t; v.until = t + (cfg.verseSeconds || 9); HV.verseCur = v; SFX.bell(); if (cfg.verseSpeak) hsay('verse', { name: v.name, verse: v.v[0] }); }
  // câu đố
  if (cfg.quiz && !HV.quiz && !HV.prayer) { if (!HV.nextQuiz) HV.nextQuiz = t + Math.min(60, cfg.quizEvery || 300); if (t > HV.nextQuiz) hQuizStart(); }
  if (HV.quiz && t > HV.quiz.until + (HV.quiz.winner ? 0 : 6)) { HV.quiz = null; HV.nextQuiz = t + (cfg.quizEvery || 300); }
  // giờ cầu nguyện chung
  if (cfg.prayer && !HV.prayer && !HV.quiz) { if (!HV.nextPrayer) HV.nextPrayer = t + (cfg.prayerEvery || 900); if (t > HV.nextPrayer) hPrayerStart(); }
  if (HV.prayer) {
    const P = HV.prayer, lines = HD.prayer[P.lang].lines;
    P.shown = Math.min(lines.length, 1 + Math.floor(P.likes / Math.max(1, cfg.prayerLikesPerLine || 40)) + Math.floor((t - P.start) / ((cfg.prayerSeconds || 60) / lines.length)));
    if (!P.ended && (P.shown >= lines.length && t - P.start > 8 || t > P.start + (cfg.prayerSeconds || 60))) {
      P.ended = t; P.shown = lines.length; SFX.bell(); hsay('prayerEnd');
      for (const x of HV.climbers.values()) { const p = posOf(x.step, x.u); hSpark(p.x, p.y - 80 * p.k, 5, 20); }
    }
    if (P.ended && t - P.ended > 6) { HV.prayer = null; HV.nextPrayer = t + (cfg.prayerEvery || 900); }
  }
  // thiên thần lúc vắng
  if (cfg.idleAngels !== false && t - HV.lastAct > 20 && t > HV.nextAngel) { hAngel(false); HV.nextAngel = t + rnd(14, 26); }
  HV.angels = HV.angels.filter((a) => t - a.t < 40 && a.x > -200 && a.x < W + 200 && a.y > -300);
  HV.floats = HV.floats.filter((f) => t - f.t < 2.4);
  HV.notes = HV.notes.filter((n) => t - n.t < 2.6);
  HV.fireworks = HV.fireworks.filter((f) => t - f.t < 4);
  HV.candles = HV.candles.filter((x) => x.donor || t < x.until);
}
function hQuizStart() {
  const L = HL(), list = HD.quiz[L]; let i, guard = 0;
  do i = Math.floor(Math.random() * list.length); while (HV.quizUsed.has(L + i) && guard++ < 50);
  HV.quizUsed.add(L + i); if (HV.quizUsed.size >= list.length) HV.quizUsed.clear();
  const t = now(); HV.quiz = { data: list[i], start: t, until: t + (HC().quizSeconds || 40), winner: null }; SFX.win();
  const q = list[i]; speakBlessing({ text: (L === 'en' ? 'Bible quiz! ' : 'Câu đố Kinh Thánh! ') + q[0] + ' A: ' + q[1][0] + '. B: ' + q[1][1] + '. C: ' + q[1][2] + '.', lang: L });
}
function hPrayerStart() { const t = now(); HV.prayer = { start: t, likes: 0, shown: 1, lang: HL() }; SFX.fanfare(); hsay('prayerStart'); }

// ---------- vẽ ----------
function hBoard(x, y, w, h, title, accent = '#f6d27a') {
  ctx.save();
  ctx.fillStyle = 'rgba(18,14,44,0.86)'; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
  ctx.fillStyle = accent; ctx.fillRect(x + 4, y, w - 8, 4); ctx.fillRect(x + 4, y + h - 4, w - 8, 4); ctx.fillRect(x, y + 4, 4, h - 8); ctx.fillRect(x + w - 4, y + 4, 4, h - 8);
  ctx.fillStyle = '#6b4bd6'; ctx.fillRect(x + 8, y + 8, w - 16, 2); ctx.fillRect(x + 8, y + h - 10, w - 16, 2);
  if (title) { ctx.fillStyle = 'rgba(107,75,214,0.55)'; ctx.fillRect(x + 10, y + 12, w - 20, 34); ctx.font = PX(24); ctx.fillStyle = accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(title, x + w / 2, y + 30); }
  ctx.restore();
}
function hText(txt, x, y, size, color, align = 'left', shadow = true) {
  ctx.font = PX(size); ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (shadow) { ctx.fillStyle = 'rgba(20,10,30,0.9)'; ctx.fillText(txt, x + 2, y + 2); }
  ctx.fillStyle = color; ctx.fillText(txt, x, y);
}
function hAvatar(img, name, cx, cy, r) { drawAvatar({ avatarImg: img }, cx, cy, r, name); }
function hHeartIcon(x, y, s, col = '#ff4d6d') { // trái tim pixel 7x6
  const M = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
  ctx.fillStyle = col; for (let j = 0; j < M.length; j++) for (let i = 0; i < 7; i++) if (M[j][i] === '1') ctx.fillRect(Math.round(x + (i - 3.5) * s), Math.round(y + (j - 3) * s), Math.ceil(s), Math.ceil(s));
}
function hCross(x, y, s, col) { ctx.fillStyle = col; ctx.fillRect(x - s / 2, y - s * 2, s, s * 5); ctx.fillRect(x - s * 1.5, y - s, s * 4, s); }

function H_render(t) {
  const cfg = HC(), L = HL();
  ctx.save(); ctx.imageSmoothingEnabled = false;
  // camera: zoom vào người được chúc phúc
  const flyer = [...HV.climbers.values()].find((c) => c.fly && t - c.fly.t > 0.2);
  let tgt = { s: 1, x: W / 2, y: H / 2 };
  if (flyer && CFG.scene.camZoom !== false) { const e = t - flyer.fly.t; const hold = 2.4 + Math.max(3, CFG.donate.blessSeconds || 6); if (e > 1.6 && e < hold) tgt = { s: clamp(CFG.scene.camScale || 1.8, 1, 3) * 0.85, x: HEART.x, y: HEART.y + 260 }; }
  const cm = HV.cam, kk = 0.06; cm.s = lerp(cm.s, tgt.s, kk); cm.x = lerp(cm.x, tgt.x, kk); cm.y = lerp(cm.y, tgt.y, kk);
  const s = cm.s, vx = clamp(cm.x, W / (2 * s), W - W / (2 * s)), vy = clamp(cm.y, H / (2 * s), H - H / (2 * s));
  ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-vx, -vy);
  // nền
  if (HV.img.bg) ctx.drawImage(HV.img.bg, 0, 0, 1024, 1536, -100, 0, 1280, 1920); else { ctx.fillStyle = '#2a2560'; ctx.fillRect(0, 0, W, H); }
  // Thánh Tâm toả sáng
  const hf = HV.heart / Math.max(1, cfg.heartGoal || 1500), flash = clamp(1 - (t - HV.heartFlash) / 5, 0, 1);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const hr = 50 + 70 * hf + 220 * flash + 6 * Math.sin(t * 3);
  const hg = ctx.createRadialGradient(HEART.x, HEART.y, 0, HEART.x, HEART.y, hr); hg.addColorStop(0, `rgba(255,120,120,${0.35 + 0.4 * hf + 0.4 * flash})`); hg.addColorStop(0.5, `rgba(255,210,120,${0.18 + 0.25 * hf})`); hg.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = hg; ctx.fillRect(HEART.x - hr, HEART.y - hr, hr * 2, hr * 2);
  if (flash > 0) { ctx.translate(HEART.x, HEART.y); ctx.rotate(t * 0.4); ctx.globalAlpha = flash * 0.7; ctx.fillStyle = '#ffe9a0'; for (let i = 0; i < 16; i++) { ctx.rotate(Math.PI / 8); ctx.fillRect(0, -6, 520 * flash + 80, 12); } }
  ctx.restore();
  // thác nước vàng
  if (t < HV.goldUntil) {
    const a = clamp((HV.goldUntil - t) / 2, 0, 1) * clamp((t - (HV.goldUntil - 25)) / 1, 0, 1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const [x0, y0, x1, y1] of FALLS) { const X0 = IX(x0), Y0 = IY(y0), Wd = (x1 - x0) * 1.25, Hd = (y1 - y0) * 1.25;
      ctx.fillStyle = `rgba(255,200,60,${0.45 * a})`; ctx.fillRect(X0, Y0, Wd, Hd);
      ctx.fillStyle = `rgba(255,245,180,${0.7 * a})`; for (let i = 0; i < 6; i++) { const yy = Y0 + ((t * 160 + i * Hd / 6) % Hd); ctx.fillRect(X0 + (i * 13) % Wd, yy, 6, 18); } }
    ctx.restore();
  }
  // đèn lồng
  const celeb = t < HV.celebrateUntil;
  [LANT, LANT_R].forEach((arr) => arr.forEach(([lx, ly], i) => {
    const x = IX(lx), y = IY(ly), sz = lerp(58, 26, (1255 - ly) / (1255 - 913)), lit = i < HV.litPairs;
    if (!lit) { ctx.fillStyle = 'rgba(40,30,70,0.62)'; ctx.fillRect(Math.round(x - sz / 2 + 2), Math.round(y - sz / 2 + 2), Math.round(sz - 4), Math.round(sz - 4)); ctx.fillStyle = 'rgba(255,170,80,0.25)'; ctx.fillRect(Math.round(x - sz * 0.12), Math.round(y), Math.round(sz * 0.24), Math.round(sz * 0.2)); }
    else { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const r = sz * (1.3 + 0.12 * Math.sin(t * 4 + i) + (celeb ? 0.6 : 0)); const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,230,140,0.55)'); g.addColorStop(1, 'rgba(255,200,90,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore(); }
  }));
  if (celeb) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,220,140,${0.12 + 0.06 * Math.sin(t * 5)})`; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  // cửa thánh đường sáng khi có người tới
  const entering = [...HV.climbers.values()].some((c) => c.state === 'enter');
  if (entering) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(DOOR.x, DOOR.y, 0, DOOR.x, DOOR.y, 160); g.addColorStop(0, 'rgba(255,240,180,0.9)'); g.addColorStop(1, 'rgba(255,220,140,0)'); ctx.fillStyle = g; ctx.fillRect(DOOR.x - 160, DOOR.y - 160, 320, 320); ctx.restore(); }
  // nến + người (xa vẽ trước)
  const items = [];
  for (const cd of HV.candles) { const y = stepY(cd.s); items.push({ y, f: () => hDrawCandle(cd, t) }); }
  for (const c of HV.climbers.values()) items.push({ y: c.fly ? -1 : posOf(c.step, c.u).y, f: () => hDrawClimber(c, t) });
  items.sort((a, b) => a.y - b.y); for (const it of items) it.f();
  // thiên thần bay
  for (const a of HV.angels) {
    const dt0 = 1 / 30;
    if (a.carry) { const c = HV.climbers.get(a.carry); if (c) { const p = posOf(c.step, c.u); const tx = p.x + 10, ty = p.y - 230 * p.k; a.x = lerp(a.x, tx, 0.12); a.y = lerp(a.y, ty, 0.12); } else a.carry = null; }
    else { a.x += a.vx * dt0; a.y += (a.vy || Math.sin((t - a.t) * 2) * 20) * dt0; }
    const fr = (a.trumpet ? HV.img.angelT : HV.img.angel)[Math.floor(t * 6) % 2]; if (!fr) continue;
    const sc = a.carry ? 3.2 : 3; ctx.save(); ctx.translate(a.x, a.y + Math.sin(t * 3 + a.t) * 8); if (a.vx < 0) ctx.scale(-1, 1); ctx.drawImage(fr, -fr.width * sc / 2, -fr.height * sc / 2, fr.width * sc, fr.height * sc); ctx.restore();
  }
  // nốt nhạc
  for (const n of HV.notes) { const e = t - n.t; if (e < 0) continue; hText(e % 0.5 < 0.25 ? '♪' : '♫', n.x + n.vx * e, n.y + n.vy * e, 32, `rgba(255,228,120,${clamp(1 - e / 2.6, 0, 1)})`, 'center'); }
  // pháo hoa thánh giá
  for (const f of HV.fireworks) {
    const e = t - f.t; if (e < 0) continue;
    if (e < 1) { const y = lerp(f.y, f.ty, ease(e)); ctx.fillStyle = f.col; ctx.fillRect(f.x - 3, y, 6, 14); }
    else { const k = e - 1, a = clamp(1 - k / 3, 0, 1); ctx.globalAlpha = a;
      for (let r = 1; r <= 6; r++) { const d = k * 70 * r / 6 * 1.6; for (const [dx, dy] of [[0, -1.6], [0, 1], [-1, 0], [1, 0]]) { ctx.fillStyle = r % 2 ? f.col : '#ffffff'; ctx.fillRect(Math.round(f.x + dx * d) - 4, Math.round(f.ty + dy * d) - 4, 8, 8); } }
      ctx.globalAlpha = 1; if (!f.boom) { f.boom = 1; SFX.coin(); } }
  }
  drawFX();
  // tim bay + chữ nổi
  for (const f of HV.floats) {
    const e = t - f.t; if (e < 0) continue; const a = clamp(1 - e / 2.4, 0, 1);
    if (f.heart) { ctx.globalAlpha = a; hHeartIcon(f.x + Math.sin(e * 6 + f.x) * 10, f.y - e * 70, 3.2 * clamp(f.k * 1.4, 0.6, 1.4)); ctx.globalAlpha = 1; }
    else { ctx.globalAlpha = a; hText(f.text, f.x, f.y - e * 45, Math.round(clamp(28 * f.k * 1.2, 18, 34)), f.color, 'center'); ctx.globalAlpha = 1; }
  }
  ctx.restore();
  hDrawUI(t);
}
function hDrawCandle(cd, t) {
  const y = stepY(cd.s), w = stairW(y), x = stairC(y) + cd.side * w / 2 * cd.off, k = w / SWB, s = Math.max(2, Math.round(5 * k));
  if (cd.donor) { ctx.fillStyle = '#d9a440'; ctx.fillRect(x - s * 2, y - s, s * 4, s); }
  ctx.fillStyle = '#f7f1e3'; ctx.fillRect(x - s, y - s * 5, s * 2, s * 4);
  const fl = Math.sin(t * 12 + cd.ph) > 0;
  ctx.fillStyle = fl ? '#ffd23f' : '#ff9a3c'; ctx.fillRect(x - s / 2, y - s * 7, s, s * 2); ctx.fillStyle = '#fff6c0'; ctx.fillRect(x - s / 4, y - s * 6.4, s / 2, s);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const r = s * 6; const g = ctx.createRadialGradient(x, y - s * 6, 0, x, y - s * 6, r); g.addColorStop(0, 'rgba(255,200,90,0.45)'); g.addColorStop(1, 'rgba(255,200,90,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - s * 6 - r, r * 2, r * 2); ctx.restore();
  if (cd.donor || t - cd.born < 6) hText(cd.name, x, y - s * 9, Math.round(clamp(18 * k * 1.3, 12, 22)), cd.donor ? '#ffe08a' : '#ffffff', 'center');
}
function hDrawClimber(c, t) {
  if (!c.set || !WALKERS[c.set]) { c.set = pickWalker(c.gender); if (!c.set) return; }
  let p = posOf(c.step, c.u), x = p.x, y = p.y, k = p.k, a = c.alpha, fr = 'back1';
  if (c.moving) fr = Math.floor(c.frameT * 5) % 2 ? 'back2' : 'back1';
  if (t < c.prayUntil && !c.moving) fr = 'bow';
  if (c.state === 'enter') { const e = clamp((t - c.enterT) / 2.4, 0, 1); x = lerp(x, DOOR.x, e); y = lerp(y, DOOR.y + 20, e); k *= 1 - 0.5 * e; a = 1 - e; fr = Math.floor(t * 5) % 2 ? 'back2' : 'back1'; }
  if (c.fly) {
    const f = c.fly, e = t - f.t, up = 2.4, hold = Math.max(3, CFG.donate.blessSeconds || 6), down = 1.6, tx = HEART.x + (hhash(c.id) - 0.5) * 120, ty = HEART.y + 330;
    let q; if (e < up) q = ease(e / up); else if (e < up + hold) q = 1; else q = 1 - ease((e - up - hold) / down);
    x = lerp(f.from.x, tx, q); y = lerp(f.from.y, ty, q) + Math.sin(t * 2.5) * 6 * q; k = lerp(f.from.k, 0.62, q); fr = q > 0.6 ? 'kneel' : 'bow';
    if (q > 0.05) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const r = 160 * k + 40; const g = ctx.createRadialGradient(x, y - 80 * k, 0, x, y - 80 * k, r); g.addColorStop(0, `rgba(255,240,180,${0.6 * q})`); g.addColorStop(1, 'rgba(255,220,140,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - 80 * k - r, r * 2, r * 2); ctx.restore(); }
  }
  const img = hpix(c.set, fr, c.robe); if (!img) return;
  const ph = 175 * k * (HC().personScale || 1), pw = img.width * ph / img.height;
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(Math.round(x - pw * 0.3), Math.round(y - 3 * k), Math.round(pw * 0.6), Math.max(2, Math.round(5 * k)));
  ctx.drawImage(img, Math.round(x - pw / 2), Math.round(y - ph), Math.round(pw), Math.round(ph));
  const top = y - ph, px = Math.max(2, Math.round(ph / 48));
  // phụ kiện (pixel)
  const hx = x, hy = top + px * 3;
  if (c.robe && !c.fly) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(Math.round(x - pw / 2 - px), Math.round(top), Math.round(pw + px * 2), Math.round(ph)); }
  if (c.acc === 'cape') { ctx.fillStyle = '#b3262a'; ctx.fillRect(Math.round(x - pw * 0.36), Math.round(top + ph * 0.22), Math.round(pw * 0.72), Math.round(ph * 0.5)); ctx.fillStyle = '#e8b553'; ctx.fillRect(Math.round(x - pw * 0.36), Math.round(top + ph * 0.22), Math.round(pw * 0.72), px); ctx.drawImage(img, Math.round(x - pw / 2), Math.round(y - ph), Math.round(pw), Math.round(ph)); }
  if (c.acc === 'wreath' || c.laurel) { for (let i = -3; i <= 3; i++) { ctx.fillStyle = i % 2 ? (c.laurel ? '#e8b553' : '#5fbf5f') : (c.laurel ? '#fff1a8' : '#ffffff'); ctx.fillRect(Math.round(hx + i * px * 1.4 - px / 2), Math.round(hy - Math.abs(i) * px * 0.35), px, px); } }
  if (c.acc === 'crown') { ctx.fillStyle = '#ffd23f'; ctx.fillRect(Math.round(hx - px * 4), Math.round(hy - px), px * 8, px * 2); for (const dx of [-4, -1, 2]) ctx.fillRect(Math.round(hx + dx * px), Math.round(hy - px * 3), px * 2, px * 2); ctx.fillStyle = '#e8384f'; ctx.fillRect(Math.round(hx - px / 2), Math.round(hy - px * 0.5), px, px); }
  // hào quang xếp hạng
  const rank = HV.rankOf ? HV.rankOf.get(c.id) : null;
  if (rank != null && !c.fly && c.state === 'climb') { ctx.strokeStyle = ['#ffd23f', '#d8dee8', '#d08a4a'][rank]; ctx.lineWidth = Math.max(2, px); ctx.beginPath(); ctx.ellipse(hx, top - px * 2, pw * 0.3, px * 1.6, 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
  // thẻ tên pixel + avatar + số tim
  if (a > 0.05 && CFG.seating.showNames !== false) {
    const fs = Math.round(clamp(20 * k * 1.25 * (CFG.seating.nameScale || 1), 13, 26)), ty = top - fs * 1.2 - (c.acc === 'crown' ? px * 3 : 0);
    ctx.save(); ctx.globalAlpha = a; ctx.font = PX(fs);
    const label = c.name + (c.likes ? '  ' : ''), tw = ctx.measureText(label).width, cnt = c.likes ? String(c.likes) : '', cw = cnt ? ctx.measureText(cnt).width + fs : 0;
    const bw = tw + cw + fs * 1.6 + 8, bx = Math.round(x - bw / 2), by = Math.round(ty - fs * 0.75), bh = Math.round(fs * 1.5);
    ctx.fillStyle = c.robe ? 'rgba(250,250,245,0.92)' : 'rgba(18,14,44,0.82)'; ctx.fillRect(bx, by, Math.round(bw), bh);
    ctx.fillStyle = c.fly || c.total ? '#ffd23f' : '#9b84ff'; ctx.fillRect(bx, by, Math.round(bw), 2); ctx.fillRect(bx, by + bh - 2, Math.round(bw), 2);
    hAvatar(c.avatarImg, c.name, bx + fs * 0.75 + 2, by + bh / 2, fs * 0.6);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = c.robe ? '#3a2c50' : '#ffffff'; ctx.fillText(c.name, bx + fs * 1.5 + 4, by + bh / 2 + 1);
    if (cnt) { hHeartIcon(bx + fs * 1.5 + 4 + tw + fs * 0.2, by + bh / 2, fs / 9); ctx.fillStyle = '#ff8fa3'; ctx.fillText(cnt, bx + fs * 1.5 + 4 + tw + fs * 0.75, by + bh / 2 + 1); }
    ctx.restore();
  }
}
function hDrawUI(t) {
  const cfg = HC(), L = HL(), B = cfg.boards || CHURCH_DEFAULTS.heaven.boards, en = L === 'en';
  // thanh trên cùng
  { const b = B.top; hBoard(b.x, b.y, b.w, b.h);
    const st = cfg.stats || {}, day = new Date().toISOString().slice(0, 10), reached = st.date === day ? st.reached || 0 : 0;
    hText((en ? '⛪ Reached today: ' : '⛪ Đã tới thánh đường: ') + reached, b.x + 22, b.y + b.h / 2, 24, '#ffe08a');
    const lx = b.x + b.w * 0.46; hText('🏮', lx, b.y + b.h / 2, 24, '#fff');
    for (let i = 0; i < LANT.length; i++) { ctx.fillStyle = i < HV.litPairs ? '#ffd23f' : '#3d3470'; ctx.fillRect(lx + 30 + i * 22, b.y + b.h / 2 - 9, 16, 18); }
    const lp = HV.litPairs >= LANT.length ? 1 : HV.lanternAcc / (cfg.lanternLikes || 300); ctx.fillStyle = '#3d3470'; ctx.fillRect(lx + 30, b.y + b.h / 2 + 13, 6 * 22 - 6, 5); ctx.fillStyle = '#ffd23f'; ctx.fillRect(lx + 30, b.y + b.h / 2 + 13, (6 * 22 - 6) * clamp(lp, 0, 1), 5);
    const hx = b.x + b.w * 0.76; hHeartIcon(hx, b.y + b.h / 2, 3.4, '#ff4d6d');
    const hf = clamp(HV.heart / (cfg.heartGoal || 1500), 0, 1); ctx.fillStyle = '#3d3470'; ctx.fillRect(hx + 22, b.y + b.h / 2 - 8, b.x + b.w - hx - 44, 16); ctx.fillStyle = '#ff6b81'; ctx.fillRect(hx + 22, b.y + b.h / 2 - 8, (b.x + b.w - hx - 44) * hf, 16);
    hText((en ? 'Heart ' : 'Thánh Tâm ') + Math.round(hf * 100) + '%', hx + 22 + (b.x + b.w - hx - 44) / 2, b.y + b.h / 2 + 1, 16, '#fff', 'center'); }
  // bảng xếp hạng
  { const tw = (cfg.leaderMinutes || 10) * 60, top3 = [...HV.best.entries()].filter(([, v]) => t - v.t < tw && v.best > 0.5).sort((a, b) => b[1].best - a[1].best).slice(0, 3);
    HV.rankOf = new Map(top3.map(([id], i) => [id, i]));
    if (top3.length) { const b = B.leader; hBoard(b.x, b.y, b.w, b.h, en ? '🏆 Top climbers' : '🏆 Leo cao nhất');
      top3.forEach(([id, v], i) => { const yy = b.y + 66 + i * 36; hText(['①', '②', '③'][i], b.x + 24, yy, 24, ['#ffd23f', '#d8dee8', '#d08a4a'][i]); hAvatar(v.c && v.c.avatarImg, v.name, b.x + 58, yy, 13);
        hText(cleanName(v.name).slice(0, 12), b.x + 78, yy, 20, '#fff'); hText(v.best >= cfg.steps ? '⛪' : Math.floor(v.best) + '/' + cfg.steps, b.x + b.w - 20, yy, 20, '#ffe08a', 'right'); }); } }
  // bảng ý nguyện
  if (HV.intents.length) { const b = B.intent; hBoard(b.x, b.y, b.w, b.h, en ? '🙏 Prayer intentions' : '🙏 Ý nguyện');
    ctx.save(); ctx.beginPath(); ctx.rect(b.x + 10, b.y + 50, b.w - 20, b.h - 60); ctx.clip(); let yy = b.y + 64;
    for (const it of HV.intents.slice(0, cfg.maxIntentions || 6)) { if (yy > b.y + b.h - 16) break; ctx.font = PX(18); const lines = wrapLines(it.name + ': ' + it.text, b.w - 34, 3);
      lines.forEach((ln, i) => { hText(ln, b.x + 18, yy, 18, i === 0 && t - it.t < 6 ? '#ffe08a' : '#f0e8ff'); yy += 22; }); yy += 6; }
    ctx.restore(); }
}
function hDrawTop(t) {
  const cfg = HC(), L = HL(), B = cfg.boards || CHURCH_DEFAULTS.heaven.boards, en = L === 'en';
  // câu đố
  if (HV.quiz) { const q = HV.quiz, b = B.quiz, left = Math.max(0, Math.ceil(q.until - t));
    hBoard(b.x, b.y, b.w, b.h, (en ? '📖 Bible quiz' : '📖 Câu đố Kinh Thánh') + (q.winner ? '' : '  ⏱ ' + left + 's'));
    ctx.font = PX(24); const ql = wrapLines(q.data[0], b.w - 50, 2); ql.forEach((ln, i) => hText(ln, b.x + b.w / 2, b.y + 78 + i * 30, 24, '#fff', 'center'));
    q.data[1].forEach((o, i) => { const yy = b.y + 150 + i * 46, right = (q.winner || t > q.until) && i === q.data[2];
      ctx.fillStyle = right ? 'rgba(95,191,95,0.55)' : 'rgba(107,75,214,0.35)'; ctx.fillRect(b.x + 30, yy - 18, b.w - 60, 38); hText('ABC'[i] + '. ' + o, b.x + 48, yy + 1, 24, right ? '#eaffea' : '#ffe8a8'); });
    hText(q.winner ? (en ? '🏆 ' + q.winner + ' got it!' : '🏆 ' + q.winner + ' trả lời đúng!') : (t > q.until ? (en ? 'Answer: ' : 'Đáp án: ') + 'ABC'[q.data[2]] : (en ? 'Comment A, B or C' : 'Comment A, B hoặc C để trả lời')), b.x + b.w / 2, b.y + b.h - 26, 20, q.winner ? '#ffd23f' : '#cfc3ff', 'center'); }
  // giờ cầu nguyện
  if (HV.prayer) { const P = HV.prayer, b = B.prayer, data = HD.prayer[P.lang], left = Math.max(0, Math.ceil(P.start + (cfg.prayerSeconds || 60) - t));
    hBoard(b.x, b.y, b.w, b.h, '✝ ' + (en ? 'Prayer time — ' : 'Giờ cầu nguyện — ') + data.title, '#ffe9a8');
    let yy = b.y + 80; ctx.font = PX(24);
    data.lines.forEach((ln, i) => { const on = i < P.shown; wrapLines(ln, b.w - 60, 2).forEach((l2) => { hText(l2, b.x + b.w / 2, yy, 24, on ? '#fff3c4' : 'rgba(207,195,255,0.25)', 'center'); yy += 32; }); yy += 6; });
    hText(P.ended ? 'Amen 🙏' : ((en ? '❤ Tap likes to pray together  ⏱ ' : '❤ Thả tim để cùng đọc kinh  ⏱ ') + left + 's'), b.x + b.w / 2, b.y + b.h - 28, 20, '#ffd23f', 'center'); }
  // Lời Chúa
  if (HV.verseCur) { const v = HV.verseCur, b = B.verse, a = clamp(Math.min((t - v.t) / 0.4, (v.until - t) / 0.6), 0, 1);
    ctx.save(); ctx.globalAlpha = a; hBoard(b.x, b.y, b.w, b.h, '📖 ' + (en ? 'God’s word for ' : 'Lời Chúa cho ') + v.name, '#ffe9a8');
    hAvatar(v.avatarImg, v.name, b.x + 60, b.y + 110, 34); ctx.font = PX(24); const ls = wrapLines('“' + v.v[0] + '”', b.w - 150, 4);
    ls.forEach((ln, i) => hText(ln, b.x + 112, b.y + 80 + i * 32, 24, '#fff6dc')); hText('— ' + v.v[1], b.x + b.w - 30, b.y + b.h - 28, 20, '#ffd23f', 'right'); ctx.restore(); }
  // câu nhắc dưới cùng
  if (cfg.promptEvery) { const list = HD.prompts[L]; if (t > HV.nextPrompt) { HV.promptI = (HV.promptI + 1) % list.length; HV.nextPrompt = t + cfg.promptEvery; }
    const txt = list[HV.promptI], a = clamp((HV.nextPrompt - t) / 0.5, 0, 1) * clamp((t - (HV.nextPrompt - cfg.promptEvery)) / 0.5, 0, 1);
    ctx.save(); ctx.globalAlpha = a; ctx.font = PX(24); const w = ctx.measureText(txt).width + 50; hBoard(W / 2 - w / 2, H - 70, w, 54); hText(txt, W / 2, H - 43, 24, '#fff3c4', 'center'); ctx.restore(); }
}

// ---------- điều phối sự kiện LIVE ----------
function H_event(ev) {
  if (!ev) return;
  if (ev.type === 'like') return H_like(ev);
  if (ev.type === 'chat') return H_chat(ev);
  if (ev.type === 'share' || ev.type === 'follow') return H_social(ev);
  if (ev.type === 'gift') { H_join({ ...ev, noGreet: true }); return H_gift(ev); }
  if (ev.type === 'join') { if (ev.anon && CFG.seating.anonSeats === false) return; return H_join({ ...ev, name: ev.name || CFG.seating.anonName || (HL() === 'en' ? 'Guest' : 'Khách') }); }
}

/*HEAVEN-END*/
window.__church = { textLang: (t) => textLang(t), voiceFor: (l) => voiceFor(l), SUB, stopSermon: () => { sermon.token++; }, loadFaceApi: () => loadFaceApi(), detect: async (u) => { const i = await loadAvatar(u); if (!i) return 'noimg'; await loadFaceApi(); try { const r = await faceapi.detectSingleFace(i, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 })).withAgeAndGender(); return r ? [r.gender, r.genderProbability, r.detection.score] : 'noface'; } catch (e) { return 'err ' + e.message; } }, guess: (n) => guessGenderFromName(n), laneHalf: (r) => laneHalf(r), standH: (r) => standH(r), get G() { return G; }, onJoin, onGift, get people() { return people; }, get walkers() { return walkers; }, CFG: () => CFG, get cards() { return cards; }, get cam() { return cam; }, get sermon() { return sermon; }, get blessSpeaking() { return blessSpeaking; }, now, logp, AC, get W() { return W; }, get H() { return H; } };
})();

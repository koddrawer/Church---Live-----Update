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
  HV.img.angel = [await L('angel_0.png')];
  HV.img.angelT = [await L('angel_trumpet_0.png')];
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
  if (hClassChat(ev, n, c)) return;
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
    if (HV.cls && HV.cls.scene) c.last = Math.max(c.last, t - 2);
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
  // lớp học Kinh Thánh
  hClassUpdate(t);
  // giờ cầu nguyện chung
  if (cfg.prayer && !HV.prayer && !HV.cls) { if (!HV.nextPrayer) HV.nextPrayer = t + (cfg.prayerEvery || 900); if (t > HV.nextPrayer) hPrayerStart(); }
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
  if (HV.cls && HV.cls.scene) { hRenderClass(t); hDrawUI(t, true); return; }
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
    const fr = (a.trumpet ? HV.img.angelT : HV.img.angel)[0]; if (!fr) continue;
    const sc = (a.carry ? 1.6 : 1.45) * (HC().angelScale || 1); ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(a.x, a.y + Math.sin(t * 3 + a.t) * 8); if (a.vx < 0) ctx.scale(-1, 1); ctx.rotate(Math.sin(t * 2.2 + a.t) * 0.05); ctx.scale(1, 1 + Math.sin(t * 6 + a.t) * 0.025); ctx.drawImage(fr, -fr.width * sc / 2, -fr.height * sc / 2, fr.width * sc, fr.height * sc); ctx.restore();
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
function hDrawUI(t, classMode) {
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
  if (classMode) return;
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
  hDrawClassJoin(t);
  if (HV.cls && HV.cls.scene) return;
  // câu đố
  if (false && HV.quiz) { const q = HV.quiz, b = B.quiz, left = Math.max(0, Math.ceil(q.until - t));
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
  if (cfg.promptEvery && cfg.promptOn !== false) { const list = hPrompts(); if (t > HV.nextPrompt) { HV.promptI = (HV.promptI + 1) % list.length; HV.nextPrompt = t + cfg.promptEvery; }
    const txt = list[HV.promptI % list.length], a = clamp((HV.nextPrompt - t) / 0.5, 0, 1) * clamp((t - (HV.nextPrompt - cfg.promptEvery)) / 0.5, 0, 1), P = B.prompt || CHURCH_DEFAULTS.heaven.boards.prompt;
    ctx.save(); ctx.globalAlpha = a; hBoard(P.x, P.y, P.w, P.h); hFitText(txt, P.x + P.w / 2, P.y + P.h / 2 + 1, P.w - 30, Math.round(P.h * 0.46), '#fff3c4'); ctx.restore(); }
}


// ================== LỚP HỌC KINH THÁNH (mini game mỗi 5 phút) ==================
const CS = 1080 / 941, CX = (x) => x * CS, CY = (y) => y * CS;
const CSEATS = [[150, 1000], [635, 1000], [280, 1005], [778, 1000], [122, 1075], [658, 1078], [282, 1075], [815, 1075], [95, 1155], [675, 1155], [270, 1155], [850, 1155],
  [70, 1250], [685, 1240], [268, 1240], [868, 1240], [65, 1335], [695, 1335], [255, 1335], [880, 1335], [45, 1430], [710, 1430], [238, 1430], [895, 1430]];
const CBOARD = { x: CX(255), y: CY(552), w: CX(800) - CX(255), h: CY(838) - CY(552) }, CBOARD_FULL = { x: CX(136), y: CY(546), w: CX(806) - CX(136), h: CY(842) - CY(546) };
const CTEACH = { x: CX(150), y: CY(700) };
(async () => { HV.img.cls = await loadImg('church://app/assets/heaven/class.png'); })();
function hTxt(k, o) { const L = HL(), v = (((HC().texts || {})[L] || {})[k]); const d = ((CHURCH_DEFAULTS.heaven.texts || {})[L] || {})[k]; return fmt(String(v != null && v !== '' ? v : d || ''), o || {}); }
function hPrompts() { const L = HL(), v = String((HC().prompts || {})[L] || '').split('\n').map((x) => x.trim()).filter(Boolean); return v.length ? v : HD.prompts[L]; }
function hFitText(txt, cx, cy, maxW, size, color) { ctx.font = PX(size); let s = size; while (s > 12 && ctx.measureText(txt).width > maxW) { s -= 1; ctx.font = PX(s); } hText(txt, cx, cy, s, color, 'center'); }
function hHighestFrame() { return frameStyleFor(Infinity) || 'b:fD'; }
function hClassBless(w) {
  const ev = { id: w.id, name: w.name, avatar: w.avatar, gift: HL() === 'en' ? 'Bible class' : 'Lớp học Kinh Thánh', count: 1, frame: hHighestFrame(), sim: true };
  const c = hClimber(ev); if (!c) return; c.laurel = true; c.acc = 'crown'; c.last = now();
  (HV.giftQ = HV.giftQ || []).push({ c, ev, line: blessingLine({ name: c.name, gift: ev.gift, count: 1 }), total: 0 });
}
function hClassStart() {
  const t = now(), cfg = HC();
  HV.cls = { phase: 'join', start: t, joinUntil: t + (cfg.classJoinSeconds || 30), members: [], scene: false };
  SFX.fanfare(); hsay('classAnnounce', { max: cfg.classMax || 20, n: cfg.classQuestions || 5 });
  toPanel({ type: 'log', msg: '📖 Lớp học Kinh Thánh: mở ghi danh (comment "me")' });
}
function hClassBegin() {
  const C = HV.cls, t = now(), cfg = HC(), L = HL(), list = HD.quiz[L], n = Math.max(1, Math.min(10, cfg.classQuestions || 5));
  if (C.members.length < Math.max(1, cfg.classMin || 1)) { hsay('classCancel'); C.phase = 'cancel'; C.cancelUntil = t + 5; return; }
  const idx = []; while (idx.length < Math.min(n, list.length)) { const i = Math.floor(Math.random() * list.length); if (!idx.includes(i) && !HV.quizUsed.has(L + i)) idx.push(i); if (HV.quizUsed.size > list.length - n) HV.quizUsed.clear(); }
  idx.forEach((i) => HV.quizUsed.add(L + i));
  C.qs = idx.map((i) => list[i]); C.qi = -1; C.phase = 'lesson'; C.scene = true; C.sceneAt = t; C.qDur = Math.max(6, (cfg.classSeconds || 60) / C.qs.length);
  SFX.bell(); hsay('classStart'); hClassNextQ();
}
function hClassNextQ() {
  const C = HV.cls, t = now(); C.qi++;
  if (C.qi >= C.qs.length) return hClassResult();
  C.qStart = t; C.revealAt = t + C.qDur - 2.6; C.revealed = false;
  for (const m of C.members) m.ans = null;
  SFX.coin(); if (HC().classReadQ !== false) speakBlessing({ text: (HL() === 'en' ? 'Question ' : 'Câu ') + (C.qi + 1) + '. ' + C.qs[C.qi][0], lang: HL(), low: true });
}
function hClassResult() {
  const C = HV.cls, t = now(); C.phase = 'result'; C.resultAt = t;
  const rank = [...C.members].sort((a, b) => b.score - a.score || a.time - b.time); C.rank = rank;
  const w = rank[0];
  if (w && w.score > 0) {
    C.winner = w; SFX.win();
    hsay('classWin', { name: w.name, score: w.score, n: C.qs.length });
    addGreet({ id: w.id, name: w.name, avatar: w.avatar, greetText: (HL() === 'en' ? '🏆 {name} topped the Bible class' : '🏆 {name} giỏi nhất lớp học Kinh Thánh').replace('{name}', w.name) });
    toPanel({ type: 'log', msg: '🏆 Lớp học Kinh Thánh: ' + w.name + ' đúng ' + w.score + '/' + C.qs.length });
  } else { hsay('classNone'); }
}
function hClassChat(ev, n, c) {
  const C = HV.cls; if (!C) return false; const t = now(), cfg = HC();
  if (C.phase === 'join' && hkw('kwClassJoin').some((w) => n === w || n === w + '!' || n.replace(/[^a-z0-9 ]/g, '').trim() === w)) {
    if (C.members.some((m) => m.id === ev.id)) return true;
    if (C.members.length >= (cfg.classMax || 20)) return true;
    const m = { id: ev.id, name: cleanName(ev.name), avatar: ev.avatar, avatarImg: c && c.avatarImg, seat: C.members.length, score: 0, time: 0, ans: null, joinT: t };
    C.members.push(m); SFX.coin();
    if (!m.avatarImg && ev.avatar) loadAvatar(ev.avatar).then((im) => { m.avatarImg = im; });
    if (c) hFloat(c, '📖 ' + (HL() === 'en' ? 'Joined!' : 'Vào lớp!'), '#bff5c9');
    if (C.members.length >= (cfg.classMax || 20)) C.joinUntil = Math.min(C.joinUntil, t + 3);
    return true;
  }
  if (C.phase === 'lesson' && !C.revealed) {
    const m = C.members.find((x) => x.id === ev.id); if (!m || m.ans) return !!m;
    const q = C.qs[C.qi], opts = q[1].map(hnorm), mm = /^(?:dap an|dap an la|answer|cau|chon)?\s*([abc])[\s.!)]*$/.exec(n);
    const pick = mm ? 'abc'.indexOf(mm[1]) : opts.findIndex((o) => o && n === o);
    if (pick < 0) return true;
    m.ans = { pick, t: t - C.qStart }; SFX.step(); return true;
  }
  return false;
}
function hClassUpdate(t) {
  const cfg = HC();
  if (!HV.cls) { if (cfg.classOn !== false && !HV.prayer) { if (!HV.nextClass) HV.nextClass = t + Math.min(90, cfg.classEvery || 300); if (t > HV.nextClass) hClassStart(); } return; }
  const C = HV.cls;
  if (C.phase === 'join' && t > C.joinUntil) hClassBegin();
  else if (C.phase === 'lesson') {
    if (!C.revealed && (t > C.revealAt || C.members.every((m) => m.ans))) {
      if (t < C.revealAt) C.revealAt = t;
      C.revealed = true; const q = C.qs[C.qi];
      for (const m of C.members) if (m.ans && m.ans.pick === q[2]) { m.score++; m.time += m.ans.t; } else m.time += C.qDur;
      SFX.bell();
    }
    if (C.revealed && t > C.revealAt + 2.6) hClassNextQ();
  } else if (C.phase === 'result' && t > C.resultAt + 9) { HV.cls = null; if (C.winner) hClassBless(C.winner); HV.nextClass = t + (cfg.classEvery || 300); }
  else if (C.phase === 'cancel' && t > C.cancelUntil) { HV.cls = null; HV.nextClass = t + (cfg.classEvery || 300); }
}
function hChalk(txt, x, y, size, color = '#f4f7ee', align = 'left') { ctx.font = PX(size); ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillText(txt, x + 2, y + 2); ctx.fillStyle = color; ctx.fillText(txt, x, y); }
function hRenderClass(t) {
  const C = HV.cls, L = HL(), en = L === 'en';
  ctx.save(); ctx.imageSmoothingEnabled = false;
  if (HV.img.cls) ctx.drawImage(HV.img.cls, 0, 0, W, H); else { ctx.fillStyle = '#5a3a20'; ctx.fillRect(0, 0, W, H); }
  // phủ bảng đen rồi viết phấn
  const B = CBOARD_FULL, PRX = CX(250), PRY = CY(672); ctx.fillStyle = '#17553a'; ctx.fillRect(B.x, B.y, B.w, PRY - B.y); ctx.fillRect(PRX, PRY - 1, B.x + B.w - PRX, B.y + B.h - PRY + 1);   // chừa chỗ cha xứ đứng bên trái
  ctx.fillStyle = 'rgba(255,255,255,0.04)'; for (let i = 0; i < 18; i++) ctx.fillRect(B.x + ((i * 97) % B.w), B.y + ((i * 53) % B.h), 60, 2);
  const A = CBOARD;
  if (C.phase === 'lesson') {
    const q = C.qs[C.qi], left = Math.max(0, C.revealAt - t), frac = clamp(left / (C.revealAt - C.qStart), 0, 1);
    hChalk((en ? 'Question ' : 'Câu ') + (C.qi + 1) + '/' + C.qs.length, A.x + 10, A.y + 26, 24, '#ffe9a0');
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(A.x + 200, A.y + 20, A.w - 220, 12); ctx.fillStyle = frac < 0.3 ? '#ff8a8a' : '#ffe9a0'; ctx.fillRect(A.x + 200, A.y + 20, (A.w - 220) * frac, 12);
    ctx.font = PX(24); const ql = wrapLines(q[0], A.w - 24, 3); ql.forEach((ln, i) => hChalk(ln, A.x + 10, A.y + 70 + i * 30, 24));
    const oy = A.y + 80 + ql.length * 30;
    q[1].forEach((o, i) => { const y = oy + i * 38, right = C.revealed && i === q[2];
      if (right) { ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 4; ctx.strokeRect(A.x + 4, y - 17, A.w - 12, 34); }
      ctx.font = PX(24); const ol = wrapLines('ABC'[i] + '. ' + o, A.w - 30, 1)[0]; hChalk(ol + (right ? '  ✔' : ''), A.x + 14, y, 24, right ? '#ffe14d' : '#e8f5e9'); });
    const answered = C.members.filter((m) => m.ans).length;
    if (!C.revealed) hChalk((en ? 'Answered: ' : 'Đã trả lời: ') + answered + '/' + C.members.length, A.x + A.w - 10, A.y + A.h - 18, 20, '#bfe3c8', 'right');
    // dải hướng dẫn to, rõ dưới bảng
    { const HB = (HC().boards || {}).clsHint || CHURCH_DEFAULTS.heaven.boards.clsHint, bx = HB.x, bw = HB.w, bh = HB.h, by = HB.y, mx = bx + bw / 2, pulse = C.revealed ? 1 : 1 + 0.04 * Math.sin(t * 5);
      ctx.fillStyle = 'rgba(20,12,40,0.92)'; ctx.fillRect(bx, by, bw, bh); ctx.fillStyle = '#ffd23f'; ctx.fillRect(bx, by, bw, 4); ctx.fillRect(bx, by + bh - 4, bw, 4); ctx.fillRect(bx, by, 4, bh); ctx.fillRect(bx + bw - 4, by, 4, bh);
      ctx.save(); ctx.translate(mx, by + bh * 0.38); ctx.scale(pulse, pulse);
      if (C.revealed) hFitText(hTxt('reveal') + 'ABC'[q[2]] + '. ' + q[1][q[2]], 0, 0, bw - 30, Math.round(bh * 0.36), '#7dff9a');
      else hFitText(hTxt('ask'), 0, 0, bw - 30, Math.round(bh * 0.36), '#ffe14d');
      ctx.restore();
      hFitText(C.revealed ? hTxt('next') : hTxt('askSub'), mx, by + bh * 0.78, bw - 30, Math.round(bh * 0.22), '#f0e8ff'); }
  } else if (C.phase === 'result') {
    hChalk(en ? '🏆 RESULTS' : '🏆 KẾT QUẢ LỚP HỌC', A.x + A.w / 2, A.y + 28, 32, '#ffe9a0', 'center');
    (C.rank || []).slice(0, 3).forEach((m, i) => { const y = A.y + 92 + i * 62;
      hChalk(['①', '②', '③'][i], A.x + 30, y, 32, ['#ffd23f', '#e6ecf5', '#e0a060'][i]); hAvatar(m.avatarImg, m.name, A.x + 92, y, 24);
      hChalk(m.name, A.x + 128, y, 24); hChalk(m.score + '/' + C.qs.length, A.x + A.w - 20, y, 28, '#ffe9a0', 'right'); });
    if (!C.winner) hChalk(en ? 'No correct answers — see you next class!' : 'Chưa ai đúng — hẹn lớp sau nhé!', A.x + A.w / 2, A.y + A.h - 30, 20, '#ffd0d0', 'center');
  }
  // bong bóng lời thầy
  { const txt = C.phase === 'result' ? (en ? 'Well done! God bless you!' : 'Giỏi lắm! Chúa chúc lành!') : C.revealed ? (en ? 'Answer: ' : 'Đáp án: ') + 'ABC'[C.qs[C.qi][2]] : (en ? 'Who knows?' : 'Ai biết nào?');
    ctx.font = PX(26); const w = ctx.measureText(txt).width + 30, x = clamp(CTEACH.x - w / 2, 8, W - w - 8), y = CTEACH.y - 160;
    ctx.fillStyle = '#fffdf2'; ctx.fillRect(x, y, w, 46); ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x, y, w, 3); ctx.fillRect(x, y + 43, w, 3); ctx.fillRect(x, y, 3, 46); ctx.fillRect(x + w - 3, y, 3, 46);
    ctx.fillStyle = '#fffdf2'; ctx.fillRect(CTEACH.x - 6, y + 46, 12, 12); hText(txt, x + w / 2, y + 24, 26, '#3a2a1a', 'center', false); }
  // học viên: tên + avatar + câu trả lời
  for (const m of C.members) {
    const s = CSEATS[m.seat]; if (!s) continue; const x = CX(s[0]), y = CY(s[1]) - 40, k = 0.85 + 0.25 * ((s[1] - 1000) / 430);
    const fs = Math.round(16 * k + 2); ctx.font = PX(fs); const tw = ctx.measureText(m.name).width, bw = tw + fs * 2.4 + 10, bx = Math.round(x - bw / 2), by = Math.round(y - fs * 1.6), bh = Math.round(fs * 1.5);
    ctx.fillStyle = 'rgba(18,14,44,0.85)'; ctx.fillRect(bx, by, Math.round(bw), bh); ctx.fillStyle = m === C.winner ? '#ffd23f' : '#9b84ff'; ctx.fillRect(bx, by, Math.round(bw), 2); ctx.fillRect(bx, by + bh - 2, Math.round(bw), 2);
    hAvatar(m.avatarImg, m.name, bx + fs * 0.75 + 2, by + bh / 2, fs * 0.62);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(m.name, bx + fs * 1.5 + 4, by + bh / 2 + 1);
    ctx.fillStyle = '#ffe08a'; ctx.fillText(String(m.score), bx + fs * 1.5 + 8 + tw, by + bh / 2 + 1);
    let mark = null, col = '#fff';
    if (C.phase === 'lesson') { if (C.revealed) { if (m.ans) { const ok = m.ans.pick === C.qs[C.qi][2]; mark = 'ABC'[m.ans.pick] + (ok ? ' ✔' : ' ✘'); col = ok ? '#7dff9a' : '#ff8a8a'; } else { mark = '…'; col = '#bbb'; } } else if (m.ans) { mark = '✋'; col = '#ffe08a'; } }
    if (mark) hText(mark, x, by - fs, Math.round(fs * 1.4), col, 'center');
    if (m === C.winner && C.phase === 'result' && Math.random() < 0.3) hSpark(x, y, 2, 30);
  }
  drawFX();
  // chuyển cảnh
  const fade = clamp(1 - (t - C.sceneAt) / 0.6, 0, 1); if (fade > 0) { ctx.fillStyle = `rgba(255,248,225,${fade})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}
function hDrawClassJoin(t) {
  const C = HV.cls; if (!C || (C.phase !== 'join' && C.phase !== 'cancel')) return;
  const cfg = HC(), en = HL() === 'en', B = (cfg.boards || {}).cls || { x: 90, y: 700, w: 900, h: 470 }, max = cfg.classMax || 20;
  const o = { max, n: cfg.classQuestions || 5, s: cfg.classSeconds || 60 };
  hBoard(B.x, B.y, B.w, B.h, hTxt('joinTitle', o), '#bff5c9');
  if (C.phase === 'cancel') { hText(en ? 'Nobody joined — the class moves to next time 🙏' : 'Chưa có ai tham gia — lớp học dời sang lần sau 🙏', B.x + B.w / 2, B.y + B.h / 2, 24, '#ffd0d0', 'center'); return; }
  const left = Math.max(0, Math.ceil(C.joinUntil - t)), pulse = 1 + 0.06 * Math.sin(t * 6);
  ctx.save(); ctx.translate(B.x + B.w / 2, B.y + 92); ctx.scale(pulse, pulse); hFitText(hTxt('join', o), 0, 0, B.w - 40, 40, '#ffe14d'); ctx.restore();
  hFitText(hTxt('rule1', o), B.x + B.w / 2, B.y + 144, B.w - 40, 22, '#f0e8ff');
  hFitText(hTxt('rule2', o), B.x + B.w / 2, B.y + 176, B.w - 40, 22, '#ffd27a');
  hText('⏱ ' + left + 's   ·   ' + C.members.length + '/' + max, B.x + B.w / 2, B.y + 214, 28, '#ffffff', 'center');
  const cols = 10, cw = (B.w - 40) / cols;
  for (let i = 0; i < max; i++) { const x = B.x + 20 + cw * (i % cols) + cw / 2, y = B.y + 270 + Math.floor(i / cols) * 90, m = C.members[i];
    if (m) { hAvatar(m.avatarImg, m.name, x, y, 26); ctx.font = PX(16); hText(m.name.slice(0, 8), x, y + 40, 16, '#fff', 'center'); }
    else { ctx.strokeStyle = 'rgba(207,195,255,0.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.stroke(); } }
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

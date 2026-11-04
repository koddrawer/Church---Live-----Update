const HEAVEN_PROMPTS_DEFAULT = { vi: ['❤ Thả tim để bước lên thánh đường', '✍ Comment "Amen" để cùng cầu nguyện', '🕯 Comment "cầu nguyện" để thắp nến', '🙏 Comment "cầu cho …" gửi ý nguyện, cha sẽ đọc lên', '📖 Comment "Lời Chúa" để nhận câu Kinh Thánh', '🔗 Chia sẻ live để thiên thần nâng bạn lên', '🎺 Cùng thả tim thắp sáng đèn lồng'], en: ['❤ Tap likes to climb to the cathedral', '✍ Comment "Amen" to pray together', '🕯 Comment "pray" to light a candle', '🙏 Comment "pray for …" — the priest will read it', '📖 Comment "verse" for a Bible verse', '🔗 Share the LIVE and an angel lifts you up', '🎺 Tap likes together to light the lanterns'] };
(() => {
'use strict';
const api = window.api;
const $ = (s, r = document) => r.querySelector(s) || (r === document && /^#[\w-]+$/.test(s) ? document.createElement('div') : null);   // phần tử đã bỏ khỏi bản này → trả về phần tử rỗng để không lỗi
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let raw = {};                 // cấu hình đã lưu (chỉ phần người dùng đổi)
let CFG = deepMerge(CHURCH_DEFAULTS, {});
const getK = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);
function setK(o, k, v) { const ps = k.split('.'); let a = o; for (let i = 0; i < ps.length - 1; i++) { a[ps[i]] = a[ps[i]] && typeof a[ps[i]] === 'object' ? a[ps[i]] : {}; a = a[ps[i]]; } a[ps[ps.length - 1]] = v; }
function log(msg, level = 'info') {
  const el = $('#log'); const d = document.createElement('div'); d.className = level;
  d.textContent = new Date().toLocaleTimeString() + '  ' + msg; el.appendChild(d);
  while (el.children.length > 400) el.firstChild.remove();
  el.scrollTop = el.scrollHeight;
}
async function save(key, value) {
  const top = key.split('.')[0];
  setK(raw, key, value);
  CFG = deepMerge(CHURCH_DEFAULTS, raw);
  await api.setConfig({ [top]: raw[top] });
}

// ---------- tabs ----------
$$('#nav button').forEach((b) => b.onclick = () => {
  $$('#nav button').forEach((x) => x.classList.toggle('on', x === b));
  $$('.tab').forEach((t) => t.classList.toggle('on', t.id === 't-' + b.dataset.t));
  if (b.dataset.t === 'scene') renderAssets();
});

// ---------- binding ----------
function fillInputs() {
  for (const el of $$('[data-k]')) {
    const v = getK(CFG, el.dataset.k);
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v ?? '';
    showVal(el);
  }
  $('#musicName').textContent = CFG.audio.musicFile ? CFG.audio.musicFile.split(/[\\/]/).pop() : '(không)';
  $('#videoName').textContent = CFG.scene.videoFile ? CFG.scene.videoFile.split(/[\\/]/).pop() : 'Nhà thờ (mặc định)';
  loadTexts();
  if (document.activeElement !== $('#blessList')) $('#blessList').value = (CFG.donate.blessSpeeches || (CFG.audio.sermonLang === 'en' ? BLESSINGS_EN : BLESSINGS_VI)).join('\n');
  renderTiers();
  applyLock();
  applyPanelLock();
}
const FRAME_NAMES = { bronze: 'Đồng', silver: 'Bạc', gold: 'Vàng + nguyệt quế', ruby: 'Hồng ngọc', royal: 'Hoàng kim: vương miện + cánh' };
function renderFrames() {
  const box = $('#frames'); if (!box) return; box.innerHTML = '';
  const list = CFG.donate.frames || [];
  const upd = async (fn) => { const arr = (CFG.donate.frames || []).map((x) => ({ ...x })); fn(arr); arr.sort((a, b) => a.min - b.min); await save('donate.frames', arr); renderFrames(); };
  list.forEach((f, i) => {
    const el = document.createElement('div'); el.className = 'row';
    const opts = Object.entries(FRAME_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('') + (window.BUILTIN_FRAMES || []).map((b) => `<option value="b:${b.id}">✦ ${b.name}</option>`).join('') + (CFG.donate.customFrames || []).map((c) => `<option value="c:${c.id}">★ ${String(c.name || 'Khung').replace(/</g, '&lt;')}</option>`).join('');
    el.innerHTML = `<b style="color:var(--gold2);min-width:46px">Mức</b><input type="number" min="1" class="fmin" style="width:80px"> xu trở lên → <select class="fst">${opts}</select> <label style="min-width:0;margin-left:10px">Bật</label><input type="checkbox" class="fen"> <button class="b ftest">▶ Thử</button><button class="b d fdel">Xoá</button>`;
    $('.fmin', el).value = f.min; $('.fst', el).value = f.style; $('.fen', el).checked = f.enabled !== false;
    $('.fmin', el).onchange = (e) => upd((a) => a[i].min = Math.max(1, +e.target.value || 1));
    $('.fst', el).onchange = (e) => upd((a) => a[i].style = e.target.value);
    $('.fen', el).onchange = (e) => upd((a) => a[i].enabled = e.target.checked);
    $('.fdel', el).onclick = () => upd((a) => a.splice(i, 1));
    $('.ftest', el).onclick = () => api.toStage({ type: 'sim-gift', name: $('#simName').value.trim() || undefined, gift: 'Quà thử', count: 1, coins: f.min });
    box.appendChild(el);
  });
  const add = document.createElement('button'); add.className = 'b'; add.textContent = '+ Thêm mức';
  add.onclick = () => upd((a) => a.push({ min: ((a[a.length - 1] || {}).min || 0) + 20, style: 'royal', enabled: true }));
  box.appendChild(add);
  renderMyFrames();
}
const pvImgs = new Map();
function pvImg(url) { let e = pvImgs.get(url); if (!e) { e = { p: loadFrameImg(decodeURIComponent(url.split('/').pop())) }; pvImgs.set(url, e); e.p.then((im) => { e.img = im; e.auto = im ? frameHole(im) : null; }); } return e; }
function drawFramePreview(cv, cf) {
  const e = pvImg('church://user/frames/' + encodeURIComponent(cf.file));
  const draw = () => {
    const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#2a1a0c'; g.fillRect(0, 0, cv.width, cv.height);
    if (!e.img) { g.fillStyle = '#c99'; g.font = '12px sans-serif'; g.fillText('không mở được ảnh', 8, 20); return; }
    const hole = cf.hole || e.auto || { x: 0.5, y: 0.5, r: 0.3 };
    const R = cv.width * 0.22, fW = R / Math.max(0.02, hole.r), fH = fW * e.img.height / e.img.width, cx = cv.width / 2, cy = cv.height * 0.5;
    const fit = Math.min(1, cv.width * 0.96 / fW, cv.height * 0.96 / fH), r2 = R * fit, w2 = fW * fit, h2 = fH * fit;
    g.save(); g.beginPath(); g.arc(cx, cy, r2, 0, 7); g.clip(); const gr = g.createLinearGradient(0, cy - r2, 0, cy + r2); gr.addColorStop(0, '#8a8f96'); gr.addColorStop(1, '#4b5058'); g.fillStyle = gr; g.fillRect(cx - r2, cy - r2, r2 * 2, r2 * 2);
    g.fillStyle = '#dfe3e8'; g.beginPath(); g.arc(cx, cy - r2 * 0.18, r2 * 0.36, 0, 7); g.fill(); g.beginPath(); g.ellipse(cx, cy + r2 * 0.75, r2 * 0.7, r2 * 0.5, 0, 0, 7); g.fill(); g.restore();
    g.drawImage(e.img, cx - hole.x * w2, cy - hole.y * h2, w2, h2);
    return hole;
  };
  if (e.img !== undefined) return draw();
  e.p.then(() => setTimeout(draw, 0));
  return null;
}
function renderMyFrames() {
  const box = $('#myFrames'); if (!box) return; box.innerHTML = '';
  const list = CFG.donate.customFrames || [];
  const upd = async (fn, rerender = true) => { const arr = (CFG.donate.customFrames || []).map((x) => ({ ...x, hole: x.hole ? { ...x.hole } : null })); fn(arr); await save('donate.customFrames', arr); if (rerender) renderFrames(); };
  list.forEach((cf, i) => {
    const el = document.createElement('div'); el.className = 'card'; el.style.margin = '8px 0'; el.style.background = 'var(--card2)';
    el.innerHTML = `<div class="row" style="align-items:flex-start;gap:12px"><canvas width="170" height="170" class="pv" style="border-radius:8px;flex:none"></canvas>
      <div style="flex:1">
        <div class="row"><label>Tên khung</label><input type="text" class="cname" style="flex:1"></div>
        <div class="row"><label>Màu chữ tên</label><input type="color" class="ccol"> <label style="min-width:0;margin-left:12px">Hào quang xoay</label><input type="checkbox" class="cglow"></div>
        <div class="row"><label>Cỡ khung này</label><input type="range" min="0.4" max="2.5" step="0.05" class="csize"><span class="val csv"></span></div>
        <div class="row"><label>Lỗ avatar</label><label style="min-width:0">Tự dò</label><input type="checkbox" class="cauto"></div>
        <div class="row"><label>Cỡ lỗ</label><input type="range" min="0.03" max="0.5" step="0.005" class="cr"></div>
        <div class="row"><label>Lệch ngang</label><input type="range" min="0.1" max="0.9" step="0.005" class="cx"></div>
        <div class="row"><label>Lệch dọc</label><input type="range" min="0.1" max="0.9" step="0.005" class="cy"></div>
        <div class="row"><button class="b ctest">▶ Thử khung này</button><button class="b cfile">Đổi ảnh…</button><button class="b d cdel" style="margin-left:auto">Xoá khung</button></div>
      </div></div>`;
    $('.cname', el).value = cf.name || ''; $('.ccol', el).value = cf.nameColor || '#ffe08a'; $('.cglow', el).checked = cf.glow !== false; $('.cauto', el).checked = !cf.hole;
    const pv = $('.pv', el);
    const setSliders = (h) => { if (!h) return; $('.cr', el).value = h.r; $('.cx', el).value = h.x; $('.cy', el).value = h.y; };
    const h0 = drawFramePreview(pv, cf); setSliders(cf.hole || h0);
    if (!h0) pvImg('church://user/frames/' + encodeURIComponent(cf.file)).p.then(() => setTimeout(() => setSliders(cf.hole || drawFramePreview(pv, cf)), 10));
    $('.csize', el).value = cf.size || 1; $('.csv', el).textContent = (+cf.size || 1).toFixed(2);
    $('.csize', el).oninput = (e) => { $('.csv', el).textContent = (+e.target.value).toFixed(2); };
    $('.csize', el).onchange = (e) => upd((a) => a[i].size = +e.target.value, false);
    $('.cname', el).onchange = (e) => upd((a) => a[i].name = e.target.value);
    $('.ccol', el).onchange = (e) => upd((a) => a[i].nameColor = e.target.value, false);
    $('.cglow', el).onchange = (e) => upd((a) => a[i].glow = e.target.checked, false);
    $('.cauto', el).onchange = (e) => upd((a) => { if (e.target.checked) a[i].hole = null; else a[i].hole = { x: +$('.cx', el).value, y: +$('.cy', el).value, r: +$('.cr', el).value }; });
    const live = () => { cf.hole = { x: +$('.cx', el).value, y: +$('.cy', el).value, r: +$('.cr', el).value }; $('.cauto', el).checked = false; drawFramePreview(pv, cf); };
    const commit = () => upd((a) => a[i].hole = { x: +$('.cx', el).value, y: +$('.cy', el).value, r: +$('.cr', el).value }, false);
    for (const c of ['.cr', '.cx', '.cy']) { $(c, el).oninput = live; $(c, el).onchange = commit; }
    $('.ctest', el).onclick = () => api.toStage({ type: 'sim-gift', name: $('#simName').value.trim() || undefined, gift: 'Quà thử', count: 1, coins: 1, frame: 'c:' + cf.id });
    $('.cfile', el).onclick = async () => { const f = await api.pickFile({ filters: [{ name: 'Ảnh khung', extensions: ['png', 'webp', 'gif'] }] }); if (!f) return; const fn = Date.now() + '_' + f.split(/[\\/]/).pop(); await api.copyUserAsset({ src: f, rel: 'frames/' + fn }); upd((a) => { a[i].file = fn; a[i].hole = null; }); };
    $('.cdel', el).onclick = () => { if (!confirm('Xoá khung "' + (cf.name || '') + '"?')) return; upd((a) => a.splice(i, 1)); const fr = (CFG.donate.frames || []).map((x) => (x.style === 'c:' + cf.id ? { ...x, style: 'gold' } : x)); save('donate.frames', fr); };
    box.appendChild(el);
  });
  const add = document.createElement('button'); add.className = 'b p'; add.textContent = '+ Thêm khung của tôi (ảnh PNG)…';
  add.onclick = async () => {
    const fs = await api.pickFile({ multi: true, filters: [{ name: 'Ảnh khung', extensions: ['png', 'webp', 'gif'] }] });
    const arr0 = Array.isArray(fs) ? fs : (fs ? [fs] : []); if (!arr0.length) return;
    const added = [];
    for (const f of arr0) { const base = f.split(/[\\/]/).pop(), fn = Date.now() + '_' + base; await api.copyUserAsset({ src: f, rel: 'frames/' + fn }); added.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: base.replace(/\.[^.]+$/, ''), file: fn, nameColor: '#ffe08a', glow: true, hole: null }); }
    await upd((a) => a.push(...added));
    log('Đã thêm ' + added.length + ' khung — chọn khung ở ô mức xu phía trên.');
  };
  box.appendChild(add);
}
function renderTiers() {
  renderFrames();
  const box = $('#tiers'); if (!box) return; box.innerHTML = '';
  const tiers = CFG.donate.tiers || [];
  tiers.forEach((t, i) => {
    const el = document.createElement('div'); el.className = 'card'; el.style.margin = '8px 0'; el.style.background = 'var(--card2)';
    el.innerHTML = `<div class="row"><b style="color:var(--gold2)">Mức</b><input type="number" min="1" class="tmin" style="width:80px"> xu trở lên <label style="min-width:0;margin-left:12px">Bật</label><input type="checkbox" class="ten"> <label style="min-width:0;margin-left:12px">Đi lên bục sau video</label><input type="checkbox" class="twalk"> <label style="min-width:0;margin-left:12px">Cha sứ đọc lời chúc</label><input type="checkbox" class="tspeak"> <button class="b d tdel" style="margin-left:auto">Xoá mức</button></div>
      <div class="row"><label>Dòng chữ</label><input type="text" class="ttext" style="flex:1"></div>
      <div class="row"><label>Dòng phụ (để trống = không)</label><input type="text" class="tsub" style="flex:1" placeholder="vd: đã dâng {gift} ×{count}"></div>
      <div class="row"><label>Video</label><div class="names tvids" style="flex:1"></div><button class="b tadd">+ Thêm video…</button><button class="b ttest">▶ Thử</button></div>`;
    $('.tmin', el).value = t.min; $('.ten', el).checked = t.enabled !== false; $('.twalk', el).checked = !!t.walk; $('.tspeak', el).checked = !!t.speak;
    $('.ttext', el).value = t.text || ''; $('.tsub', el).value = t.sub || '';
    const vids = $('.tvids', el);
    if (!(t.videos || []).length) vids.innerHTML = '<span style="opacity:.6">(chưa có video — mức này chỉ đi lên bục)</span>';
    (t.videos || []).forEach((v, vi) => { const sp = document.createElement('span'); sp.textContent = (/^church:\/\/app\//.test(v) ? '★ ' : '') + v.split(/[\\/]/).pop() + '  ✕'; sp.style.cursor = 'pointer'; sp.title = 'Bấm để bỏ'; sp.onclick = () => upd((x) => x.videos.splice(vi, 1)); vids.appendChild(sp); });
    const upd = async (fn) => { const arr = (CFG.donate.tiers || []).map((x) => ({ ...x, videos: [...(x.videos || [])] })); fn(arr[i], arr); await save('donate.tiers', arr); renderTiers(); };
    $('.tmin', el).onchange = (e) => upd((x) => x.min = Math.max(1, +e.target.value || 1));
    $('.ten', el).onchange = (e) => upd((x) => x.enabled = e.target.checked);
    $('.twalk', el).onchange = (e) => upd((x) => x.walk = e.target.checked);
    $('.tspeak', el).onchange = (e) => upd((x) => x.speak = e.target.checked);
    $('.ttext', el).onchange = (e) => upd((x) => x.text = e.target.value);
    $('.tsub', el).onchange = (e) => upd((x) => x.sub = e.target.value);
    $('.tdel', el).onclick = () => upd((x, arr) => arr.splice(i, 1));
    $('.tadd', el).onclick = async () => { const fs = await api.pickFile({ multi: true, filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov', 'mkv'] }] }); if (fs && fs.length) upd((x) => x.videos.push(...fs)); };
    $('.ttest', el).onclick = () => api.toStage({ type: 'sim-gift', name: $('#simName').value.trim() || undefined, gift: 'Quà thử', count: 1, coins: t.min });
    box.appendChild(el);
  });
  const add = document.createElement('button'); add.className = 'b'; add.textContent = '+ Thêm mức xu';
  add.onclick = async () => { const arr = [...(CFG.donate.tiers || []), { min: 50, videos: [], text: '{name} đã được chúc phúc', sub: '', walk: true, speak: false, enabled: true }]; await save('donate.tiers', arr); renderTiers(); };
  box.appendChild(add);
}
function showVal(el) { const s = el.nextElementSibling; if (el.type === 'range' && s && s.classList.contains('val')) s.textContent = (+el.value).toFixed(el.step && el.step.includes('.') ? (el.step.split('.')[1].length) : 0); }
for (const el of $$('[data-k]')) {
  const ev = (el.type === 'range') ? 'input' : 'change';
  el.addEventListener(ev, () => {
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'number' || el.type === 'range') v = parseFloat(v);
    if (typeof v === 'number' && isNaN(v)) return;
    showVal(el);
    save(el.dataset.k, v);
  });
}

// ---------- live ----------
$('#btnConnect').onclick = async () => {
  const r = await api.tiktokConnect({ username: CFG.tiktok.username, signApiKey: CFG.tiktok.signApiKey });
  if (!r.ok) log('Kết nối lỗi: ' + r.error, 'error');
};
$('#btnDisconnect').onclick = () => api.tiktokDisconnect();
function setTk(s) {
  const map = { idle: ['', 'Chưa kết nối'], connecting: ['warn', 'Đang kết nối…'], connected: ['ok', 'Đã kết nối @' + s.username], disconnected: ['err', 'Mất kết nối'], ended: ['warn', 'Live đã kết thúc'], waiting: ['warn', 'Đợi phòng live mới…'], error: ['err', 'Lỗi kết nối'] };
  const [c, t] = map[s.state] || ['', s.state];
  $('#tkdot').className = 'dot ' + c; $('#tktxt').textContent = t;
}
api.onTiktokStatus(setTk);
api.tiktokState().then(setTk);
let camWhich = null;
$$('[data-cam]').forEach((b) => b.onclick = () => { camWhich = b.dataset.cam; api.toStage({ type: 'cam-edit', which: camWhich }); log('Chỉnh camera: ' + b.textContent.replace('🎥 ', '')); });
$$('[data-campv]').forEach((b) => b.onclick = () => api.toStage({ type: 'cam-preview', which: b.dataset.campv }));
if ($('#camSave')) {
  $('#camSave').onclick = () => api.toStage({ type: 'cam-save' });
  $('#camOff').onclick = () => { camWhich = null; api.toStage({ type: 'cam-edit-off' }); };
  $('#camReset').onclick = () => api.toStage({ type: 'cam-reset', which: camWhich || 'main' });
  $('#camFov').oninput = (e) => { $('#camFovV').textContent = e.target.value + '°'; api.toStage({ type: 'cam-fov', fov: +e.target.value }); };
}
$$('[data-hv]').forEach((b) => b.onclick = () => {
  const k = b.dataset.hv, name = $('#simName').value.trim() || undefined, en = (CFG.scene.liveLang === 'en');
  const L = (ev, extra) => api.toStage({ type: 'sim-live', name, ...(extra || {}), ev });
  if (k === 'like') L({ type: 'like', count: 10 });
  if (k === 'like100') for (let i = 0; i < 10; i++) api.toStage({ type: 'sim-live', id: 'simL' + i, ev: { type: 'like', count: 10 } });
  if (k === 'amen') L({ type: 'chat', text: 'Amen' });
  if (k === 'alleluia') L({ type: 'chat', text: 'Alleluia' });
  if (k === 'candle') L({ type: 'chat', text: en ? 'pray' : 'cầu nguyện' });
  if (k === 'intent') L({ type: 'chat', text: en ? 'pray for my mother to recover soon' : 'cầu cho mẹ con mau khỏe' });
  if (k === 'verse') L({ type: 'chat', text: en ? 'verse' : 'Lời Chúa' });
  if (k === 'share') L({ type: 'share' });
  if (k === 'follow') L({ type: 'follow' });
  if (k === 'quiz') api.toStage({ type: 'hv-quiz' });
  if (k === 'classfill') api.toStage({ type: 'hv-class-fill', n: 20 });
  if (k === 'answer') api.toStage({ type: 'hv-class-answer' });
  if (k === 'prayer') api.toStage({ type: 'hv-prayer' });
  if (k === 'lanterns') api.toStage({ type: 'hv-lanterns' });
});
$$('[data-sim]').forEach((b) => b.onclick = () => {
  const name = $('#simName').value.trim() || undefined;
  const s = b.dataset.sim;
  if (s === 'join') api.toStage({ type: 'sim-join', name });
  if (s === 'join10') api.toStage({ type: 'sim-join', n: 10 });
  if (s === 'gift') api.toStage({ type: 'sim-gift', name, gift: 'Hoa hồng', count: 1 });
  if (s === 'giftSeated') api.toStage({ type: 'sim-gift', seated: true, gift: 'Nhẫn', count: 1 });
  if (s === 'g5') api.toStage({ type: 'sim-gift', name, gift: 'Kem', count: 1, coins: 5 });
  if (s === 'g10') api.toStage({ type: 'sim-gift', name, gift: 'Nước hoa', count: 1, coins: 10 });
  if (s === 'g15') api.toStage({ type: 'sim-gift', name, gift: 'Nhẫn', count: 1, coins: 15 });
  if (s === 'g30') api.toStage({ type: 'sim-gift', name, gift: 'Vương miện', count: 1, coins: 30 });
  if (s === 'g1x5') for (let i = 0; i < 5; i++) api.toStage({ type: 'sim-gift', gift: 'Hoa hồng', count: 1, coins: 1 });
  if (s === 'clear') api.toStage({ type: 'clear' });
  if (s === 'follow') api.toStage({ type: 'sim-social', kind: 'follow', name });
  if (s === 'share') api.toStage({ type: 'sim-social', kind: 'share', name });
  if (s === 'followSeated') api.toStage({ type: 'sim-social', kind: 'follow', seated: true });
  if (s === 'next') api.toStage({ type: 'sermon-next' });
});
api.onLiveEvent((e) => {
  if (e.type === 'join') log('👋 ' + e.name + ' vào phòng');
  if (e.type === 'gift') log('🎁 ' + e.name + ' tặng ' + e.gift + ' ×' + e.count + ' (' + (e.total || 0) + ' 💎)');
});
api.onLog((l) => log(l.msg, l.level));
api.onStageMsg((m) => {
  if (!m) return;
  if (m.type === 'log') log('[màn hình] ' + m.msg, m.level);
  if (m.type === 'edit-mode') { editOn = m.on; $('#btnEdit').textContent = m.on ? '✓ Xong — thoát chỉnh bố cục' : '✥ Chỉnh bố cục bằng chuột trên màn hình'; }
  if (m.type === 'cam-fov' && $('#camFov')) { $('#camFov').value = Math.round(m.fov); $('#camFovV').textContent = Math.round(m.fov) + '°'; }
  if (m.type === 'blessed') log('✝ Chúc phúc ' + m.name + ' (' + (m.gift || '') + ' ×' + m.count + ')' + (m.idle ? ' — tự động' : ''));
  if (m.type === 'pretts') { $('#prettsBar').style.width = (100 * m.done / m.total) + '%'; const el = $('#prettsInfo'); if (el) el.textContent = I18N.t('Giọng đọc đã tạo sẵn') + ': ' + m.ok + '/' + m.total + (m.waiting ? ' — ' + I18N.t('máy chủ chưa trả lời, thử lại sau') + ' ' + m.waiting + 's (' + m.error + ')' : (m.ok === m.total ? ' ✓' : '')); if (m.done === m.total && !m.auto) log(`Đã tạo giọng ${m.ok}/${m.total} câu`); }
  if (m.type === 'status') {
    $('#sSeated').textContent = m.seated; $('#sWalk').textContent = m.walking; $('#sQueue').textContent = m.queue; $('#sSlots').textContent = m.slots;
    $('#names').innerHTML = '';
    for (const n of m.names) { const s = document.createElement('span'); s.textContent = n.name + (m.heaven ? ' · bậc ' + n.left : n.state === 'seated' ? ' · ' + n.left + 's' : ' · ⛪'); if (n.state !== 'seated') s.className = 'walk'; $('#names').appendChild(s); }
    const st = m.sermon || {};
    $('#sermonLine').textContent = (st.state === 'playing' ? '🔊 ' : st.state === 'loading' ? '⏳ ' : '') + (st.line || '…') + (st.fallback ? '  (giọng Windows)' : '');
    $('#audot').className = 'dot ' + (m.audio === 'running' ? 'ok' : 'warn');
    $('#autxt').textContent = m.audio === 'running' ? 'Âm thanh' : 'Âm thanh tạm dừng (bấm vào màn hình)';
  }
});

// ---------- audio ----------
function loadTexts() {
  const lang = $('#textLang').value;
  const t = lang === 'en' ? (CFG.audio.sermonTextsEn || SERMON_EN) : (CFG.audio.sermonTextsVi || SERMON_VI);
  if (document.activeElement !== $('#sermonTexts')) $('#sermonTexts').value = t.join('\n\n');
}
$('#textLang').onchange = loadTexts;
$('#btnSaveTexts').onclick = () => {
  const lines = $('#sermonTexts').value.split(/\n\s*\n|\n/).map((s) => s.trim()).filter(Boolean);
  save($('#textLang').value === 'en' ? 'audio.sermonTextsEn' : 'audio.sermonTextsVi', lines); log('Đã lưu ' + lines.length + ' đoạn giảng');
};
$('#btnResetTexts').onclick = () => { save($('#textLang').value === 'en' ? 'audio.sermonTextsEn' : 'audio.sermonTextsVi', null).then(loadTexts); };
$('#btnSaveBless').onclick = () => { const l = $('#blessList').value.split('\n').map((x) => x.trim()).filter(Boolean); save('donate.blessSpeeches', l); log('Đã lưu ' + l.length + ' lời chúc'); };
$('#btnResetBless').onclick = () => save('donate.blessSpeeches', null).then(fillInputs);
for (const id of ['#btnTtsTest', '#btnTtsTest2']) $(id).onclick = () => { log('Đang thử giọng đọc…'); api.toStage({ type: 'tts-test' }); };
$('#btnPromptDefault').onclick = async () => { for (const L of ['vi', 'en']) { const el = document.querySelector('[data-k="heaven.prompts.' + L + '"]'); if (el && !el.value.trim()) { el.value = HEAVEN_PROMPTS_DEFAULT[L].join('\n'); await save('heaven.prompts.' + L, el.value); } } };
$('#btnPretts').onclick = () => { $('#prettsBar').style.width = '0'; api.toStage({ type: 'pretts' }); };
$('#btnRestartSermon').onclick = () => api.toStage({ type: 'sermon-restart' });
$('#btnSay').onclick = () => { const t = $('#sayText').value.trim(); if (t) api.toStage({ type: 'speak', text: t }); };
$('#btnMusic').onclick = async () => { const f = await api.pickFile({ filters: [{ name: 'Âm thanh', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }] }); if (f) { await save('audio.musicFile', f); fillInputs(); } };
$('#btnMusicClear').onclick = async () => { await save('audio.musicFile', ''); fillInputs(); };

// ---------- scene ----------
let editOn = false;
$('#btnEdit').onclick = () => { if (CFG.scene.layoutLocked) return; editOn = !editOn; api.toStage({ type: 'edit-layout', on: editOn }); };
// các ô chỉnh vị trí/kích thước bị khóa cùng
const LAYOUT_KEYS = /^(subtitles\.(x|y|w|h|scale|fontSize)|greet\.(x|y|w|h|scale|fontSize)|donate\.(bannerY|bannerScale|bannerWidth|bannerAvatarSize)|scene\.geometry\.)/;
function applyLock() {
  const on = !!CFG.scene.layoutLocked;
  $('#btnLock').textContent = on ? '🔒 Đã khóa bố cục (bấm để mở)' : '🔓 Khóa bố cục';
  $('#btnLock').classList.toggle('p', on);
  $('#btnEdit').disabled = on; $('#btnEdit').style.opacity = on ? 0.4 : 1;
  for (const el of $$('[data-k]')) if (LAYOUT_KEYS.test(el.dataset.k)) { el.disabled = on; el.style.opacity = on ? 0.45 : 1; }
  if ($('#btnGeoReset')) { $('#btnGeoReset').disabled = on; $('#btnGeoReset').style.opacity = on ? 0.4 : 1; }
}
function applyPanelLock() {
  const on = !!(CFG.window && CFG.window.panelLocked);
  document.body.classList.toggle('plocked', on);
  $('main').inert = on;
  const b = $('#btnPanelLock'); b.textContent = on ? '🔒 Mở khóa' : '🔓 Khóa bảng điều khiển'; b.classList.toggle('on', on);
}
$('#btnPanelLock').onclick = async () => {
  const on = !(CFG.window && CFG.window.panelLocked);
  if (!on && !confirm('Mở khóa bảng điều khiển?')) return;
  if (on && editOn) { editOn = false; api.toStage({ type: 'edit-layout', on: false }); }
  await save('window.panelLocked', on); applyPanelLock(); log(on ? 'Đã khóa bảng điều khiển' : 'Đã mở khóa bảng điều khiển');
};
$('#btnLock').onclick = async () => { const on = !CFG.scene.layoutLocked; if (on && editOn) { editOn = false; api.toStage({ type: 'edit-layout', on: false }); } await save('scene.layoutLocked', on); applyLock(); log(on ? 'Đã khóa bố cục' : 'Đã mở khóa bố cục'); };
api.onConfig((c) => { setTimeout(() => { applyLock(); applyPanelLock(); const ae = document.activeElement; if (!(ae && ae.closest && ae.closest('#frames,#myFrames'))) renderFrames(); }, 0); raw = {}; for (const [k, v] of Object.entries(c || {})) if (!k.startsWith('_')) raw[k] = v; CFG = deepMerge(CHURCH_DEFAULTS, raw); for (const el of $$('[data-k]')) { if (el === document.activeElement) continue; const v = getK(CFG, el.dataset.k); if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? ''; showVal(el); } });
$('#btnVideo').onclick = async () => { const f = await api.pickFile({ filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov'] }] }); if (f) { await save('scene.videoFile', f); fillInputs(); } };
$('#btnVideoClear').onclick = async () => { await save('scene.videoFile', ''); fillInputs(); };
$('#btnGeoReset').onclick = async () => { if (raw.scene) delete raw.scene.geometry; CFG = deepMerge(CHURCH_DEFAULTS, raw); await api.setConfig({ scene: raw.scene || {} }); fillInputs(); };
$('#btnOpenAssets').onclick = async () => { const ua = await api.userAssets(); api.openPath(ua.root); };
$('#btnReloadAssets').onclick = () => { api.toStage({ type: 'reload-assets' }); renderAssets(); };
$('#btnAddSitter').onclick = async () => {
  const fs = await api.pickFile({ multi: true, filters: [{ name: 'PNG', extensions: ['png', 'webp'] }] });
  if (!fs || !fs.length) return;
  for (const f of fs) await api.copyUserAsset({ src: f, rel: 'sitters/' + f.split(/[\\/]/).pop() });
  log('Đã thêm ' + fs.length + ' ảnh ngồi'); api.toStage({ type: 'reload-assets' }); renderAssets();
};
async function renderAssets() {
  const ua = await api.userAssets();
  const walkerNames = [...Object.keys(CFG.characters.walkers), ...Object.keys(ua.walkers || {}).filter((n) => !CFG.characters.walkers[n])];
  const box = $('#sitters'); box.innerHTML = '';
  const defs = CFG.characters.sitters.map((s, i) => ({ ...s, i, builtin: true }));
  for (const f of ua.sitters || []) defs.push({ file: 'church://user/sitters/' + encodeURIComponent(f), gender: (CFG.characters.userSitterGender || {})[f] || null, user: f });
  const G_OPTS = [['m', 'Nam'], ['f', 'Nữ'], ['', 'Chung']];
  const gSel = (val) => { const sel = document.createElement('select'); for (const [v, t] of G_OPTS) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); } sel.value = val || ''; return sel; };
  for (const d of defs) {
    const el = document.createElement('div'); el.className = 'th' + (d.disabled ? ' off' : '');
    const dg = d.gender !== undefined ? d.gender : (CHURCH_DEFAULTS.characters.sitters.find((x) => x.file === d.file) || {}).gender;
    el.innerHTML = `<img src="${d.file}"><label style="display:flex;gap:4px;justify-content:center;margin-top:4px"><input type="checkbox" ${d.disabled ? '' : 'checked'} ${d.user ? 'disabled' : ''}> dùng</label>${d.user ? '<button class="b d" style="padding:2px 8px;margin-top:4px">Xoá</button>' : ''}`;
    const sel = gSel(dg); el.insertBefore(sel, el.children[1]);
    sel.onchange = async () => {
      const v = sel.value || null;
      if (d.builtin) { const arr = CFG.characters.sitters.map((s) => ({ ...s })); arr[d.i].gender = v; await save('characters.sitters', arr); }
      else { const m = { ...(CFG.characters.userSitterGender || {}) }; m[d.user] = v; await save('characters.userSitterGender', m); }
    };
    const cb = $('input[type=checkbox]', el);
    cb.onchange = async () => { if (!d.builtin) return; const arr = CFG.characters.sitters.map((s) => ({ ...s })); arr[d.i].disabled = !cb.checked; await save('characters.sitters', arr); renderAssets(); };
    const del = $('button', el);
    if (del) del.onclick = async () => { await api.deleteUserAsset('sitters/' + d.user); api.toStage({ type: 'reload-assets' }); renderAssets(); };
    box.appendChild(el);
  }
  const wb = $('#walkers'); wb.innerHTML = '';
  for (const n of walkerNames) {
    const base = CFG.characters.walkers[n] ? CFG.characters.walkers[n].base : 'church://user/walkers/' + encodeURIComponent(n) + '/';
    const el = document.createElement('div'); el.className = 'th';
    el.innerHTML = `<div style="display:flex;gap:2px;height:110px;align-items:flex-end;justify-content:center">${['right1', 'back1', 'front1', 'kneel'].map((f) => `<img src="${base}${f}.png" style="height:100%;width:24%;object-fit:contain;margin:0">`).join('')}</div><b>${n}</b>${CFG.characters.walkers[n] ? '' : '<br><button class="b d" style="padding:2px 8px;margin-top:4px">Xoá</button>'}`;
    const wgv = (CFG.characters.walkerGender || {})[n] ?? (CFG.characters.walkers[n] || {}).gender ?? '';
    const ws = gSel(wgv); ws.style.marginTop = '4px'; el.insertBefore(ws, el.querySelector('b').nextSibling);
    ws.onchange = async () => { const m = { ...(CFG.characters.walkerGender || {}) }; m[n] = ws.value || null; await save('characters.walkerGender', m); };
    const del = $('button', el);
    if (del) del.onclick = async () => { await api.deleteUserAsset('walkers/' + n); api.toStage({ type: 'reload-assets' }); renderAssets(); };
    wb.appendChild(el);
  }
}
$('#btnSlice').onclick = async () => {
  const f = await api.pickFile({ filters: [{ name: 'PNG', extensions: ['png', 'webp'] }] }); if (!f) return;
  const b64 = await api.readFileB64(f);
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const out = $('#sliceOut'); out.innerHTML = '<p class="hint">Đang tách khung…</p>';
  let res;
  try { res = await SpriteSlicer.slice(img); } catch (e) { out.innerHTML = '<p class="hint" style="color:#ff8a7a">' + e.message + '</p>'; return; }
  out.innerHTML = `<p class="hint">Tìm thấy ${res.row1} khung hàng trên, ${res.row2} khung hàng dưới. Kiểm tra tên khung:</p>`;
  const grid = document.createElement('div'); grid.className = 'frames';
  res.frames.forEach((fr) => {
    const el = document.createElement('div'); el.className = 'th'; el.appendChild(fr.canvas);
    const sel = document.createElement('select');
    for (const n of [...SpriteSlicer.ORDER, '(bỏ)']) { const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); }
    sel.value = SpriteSlicer.ORDER.includes(fr.name) ? fr.name : '(bỏ)'; sel.onchange = () => fr.name = sel.value; el.appendChild(sel); grid.appendChild(el);
  });
  out.appendChild(grid);
  const btn = document.createElement('button'); btn.className = 'b p'; btn.textContent = 'Lưu bộ hoạt ảnh'; btn.style.marginTop = '8px';
  btn.onclick = async () => {
    const name = ($('#sliceName').value.trim() || f.split(/[\\/]/).pop().replace(/\.\w+$/, '')).replace(/[^\w\-]+/g, '_');
    for (const fr of res.frames) {
      if (fr.name === '(bỏ)') continue;
      const b = fr.canvas.toDataURL('image/png').split(',')[1];
      await api.saveUserAsset({ rel: `walkers/${name}/${fr.name}.png`, b64: b });
    }
    log('Đã lưu bộ hoạt ảnh "' + name + '"'); out.innerHTML = ''; api.toStage({ type: 'reload-assets' }); renderAssets();
  };
  out.appendChild(btn);
};

// ---------- system ----------
$$('[data-size]').forEach((b) => b.onclick = () => api.stageWindow({ size: +b.dataset.size }));
$('#btnFull').onclick = () => api.stageWindow({ fullscreen: true });
$('#btnReloadStage').onclick = () => api.stageWindow({ reload: true });
$('#btnRelaunch').onclick = () => { if (confirm('Khởi động lại toàn bộ app?')) api.invoke('relaunch').catch(() => log('Bản cài này chưa hỗ trợ khởi động lại tự động — hãy tắt app rồi mở lại.', 'warn')); };
$('#btnCheck').onclick = async () => { $('#updInfo').textContent = 'Đang kiểm tra…'; const r = await api.checkUpdate({}); if (!r.ok) $('#updInfo').textContent = 'Lỗi: ' + r.error; };
$('#btnApply').onclick = async () => { $('#updInfo').textContent = 'Đang cập nhật…'; const r = await api.checkUpdate({ apply: true }); if (!r.ok) $('#updInfo').textContent = 'Lỗi: ' + r.error; else if (!r.hasUpdate) $('#updInfo').textContent = 'Đang dùng bản mới nhất (' + r.current + ')'; };
$('#btnResetOv').onclick = () => { if (confirm('Xoá các bản cập nhật đã tải và quay về bản gốc trong bộ cài?')) api.resetOverlay(); };
api.onUpdateStatus((s) => {
  if (s.stage === 'checked') $('#updInfo').textContent = s.hasUpdate ? `Có bản mới ${s.latest} (đang dùng ${s.current}) — ${s.notes}` : `Đang dùng bản mới nhất (${s.current})`;
  if (s.stage === 'downloading') { $('#updBar').style.width = (100 * s.done / s.total) + '%'; $('#updInfo').textContent = `Đang tải ${s.done}/${s.total}: ${s.file}`; }
  if (s.stage === 'applied') $('#updInfo').textContent = 'Đã cập nhật xong, đang tải lại…';
  if (s.stage === 'error') $('#updInfo').textContent = 'Lỗi cập nhật: ' + s.error;
  if (s.stage === 'restart-needed') { $('#updInfo').textContent = 'Bản cập nhật cần khởi động lại app để có hiệu lực.'; log('⚠ Bản cập nhật cần KHỞI ĐỘNG LẠI app (nút ở tab Cửa sổ & cập nhật)', 'warn'); if (confirm('Bản cập nhật này cần khởi động lại app. Khởi động lại ngay?')) api.invoke('relaunch'); }
});
$('#btnExport').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' })); a.download = 'church-live-config.json'; a.click(); };
$('#btnImport').onclick = async () => { const f = await api.pickFile({ filters: [{ name: 'JSON', extensions: ['json'] }] }); if (!f) return; try { raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(await api.readFileB64(f)), (c) => c.charCodeAt(0)))); } catch (e) { log('File cấu hình lỗi: ' + e.message, 'error'); return; } await api.replaceConfig(raw); CFG = deepMerge(CHURCH_DEFAULTS, raw); fillInputs(); };
$('#btnResetAll').onclick = async () => { if (!confirm('Khôi phục toàn bộ cài đặt mặc định?')) return; raw = {}; await api.replaceConfig({}); CFG = deepMerge(CHURCH_DEFAULTS, {}); fillInputs(); };
$('#btnTtsClear').onclick = async () => { await api.ttsClear(); log('Đã xoá cache giọng đọc'); };

// ---- ngôn ngữ ----
const curLive = () => CFG.scene.liveLang || CFG.audio.sermonLang || 'vi';
async function offerLive(L) {
  if (curLive() === L && CFG.audio.sermonLang === L) return;
  const m = L === 'en' ? 'Đổi luôn buổi live (giọng cha sứ, bài giảng, câu chúc, chữ trên màn hình) sang English?' : 'Đổi luôn buổi live (giọng cha sứ, bài giảng, câu chúc, chữ trên màn hình) sang Tiếng Việt?';
  if (confirm(I18N.t(m))) { $('#liveLang').value = L; await applyLive(L, true); }
}
$('#uiLang').onchange = async () => { const L = $('#uiLang').value; await save('window.uiLang', L); I18N.setLang(L); await offerLive(L); };
$('#liveLang').onchange = () => applyLive($('#liveLang').value);
$('#btnLiveLang').onclick = () => applyLive($('#liveLang').value);
document.querySelector('[data-k="audio.sermonLang"]').addEventListener('change', (e) => setTimeout(() => offerLive(e.target.value), 300));
async function applyLive(L, skipConfirm) {
  const P = LIVE_PRESETS[L]; if (!P) return;
  const msg = 'Đổi toàn bộ chữ trên màn hình, giọng và bài giảng sang ngôn ngữ này? Các câu chữ bạn đã tự sửa (băng chúc phúc, bảng chào, lời cảm ơn…) sẽ được thay bằng bản mặc định của ngôn ngữ đó.';
  if (!skipConfirm && !confirm(I18N.t(msg))) { $('#liveLang').value = curLive(); return; }
  const merge = (top, obj) => { raw[top] = { ...(raw[top] || {}), ...obj }; };
  merge('audio', P.audio);
  const tiers = (CFG.donate.tiers || []).map((t) => ({ ...t, text: P.donate.tierText }));
  merge('donate', { blessSpeech: P.donate.blessSpeech, banner: P.donate.banner, bannerSub: P.donate.bannerSub, blessSpeeches: null, tiers });
  merge('greet', P.greet);
  raw.social = { ...(raw.social || {}), join: { ...((raw.social || {}).join || {}), ...P.social.join }, follow: { ...((raw.social || {}).follow || {}), ...P.social.follow }, share: { ...((raw.social || {}).share || {}), ...P.social.share } };
  merge('scene', { liveLang: L, ...(CFG.scene.title ? { title: P.sceneTitle } : {}) });
  const patch = {}; for (const top of ['audio', 'donate', 'greet', 'social', 'scene']) patch[top] = raw[top];
  await api.setConfig(patch);
  CFG = deepMerge(CHURCH_DEFAULTS, raw); fillInputs();
  $('#textLang').value = L; loadTexts();
  log(L === 'en' ? 'Live language: English' : 'Ngôn ngữ buổi live: Tiếng Việt');
}
(async () => {
  const c = await api.getConfig();
  raw = {}; for (const [k, v] of Object.entries(c || {})) if (!k.startsWith('_')) raw[k] = v;
  CFG = deepMerge(CHURCH_DEFAULTS, raw);
  // một lần: nạp các video chúc phúc có sẵn vào các mức xu đang trống video, thêm mức 15 xu nếu chưa có
  if (!(raw._m || {}).bless1 && !(raw.donate || {}).builtinBless1) {
    const D = CHURCH_DEFAULTS.donate.tiers, arr = (CFG.donate.tiers || []).map((x) => ({ ...x, videos: [...(x.videos || [])] }));
    for (const d of D) { const t = arr.find((x) => x.min === d.min); if (!t) arr.push({ ...d, text: (arr[0] && arr[0].text) || d.text, videos: [...d.videos] }); else if (!t.videos.length) t.videos = [...d.videos]; }
    arr.sort((a, b) => a.min - b.min);
    setK(raw, 'donate.tiers', arr); setK(raw, 'donate.builtinBless1', true); CFG = deepMerge(CHURCH_DEFAULTS, raw);
    await api.setConfig({ donate: raw.donate });
  }
  // một lần: nếu chưa tự chỉnh khung theo mức xu thì dùng bộ khung ảnh mới
  if (!(raw.donate || {}).frames2) {
    const fr = (raw.donate || {}).frames, OLD = { 5: 'silver', 10: 'gold', 15: 'ruby', 30: 'royal' };
    if (fr && fr.every((f) => f.style === 'bronze' || OLD[f.min] === f.style)) { setK(raw, 'donate.frames', fr.map((f) => (OLD[f.min] ? { ...f, style: { 5: 'b:fA', 10: 'b:fB', 15: 'b:fC', 30: 'b:fD' }[f.min] } : f))); }
    setK(raw, 'donate.frames2', true); CFG = deepMerge(CHURCH_DEFAULTS, raw); await api.setConfig({ donate: raw.donate });
  }
  fillInputs();
  $('#uiLang').value = (CFG.window && CFG.window.uiLang) || 'vi'; $('#liveLang').value = CFG.scene.liveLang || CFG.audio.sermonLang || 'vi';
  window.__uiLang = $('#uiLang').value; I18N.start();
  const info = await api.info();
  $('#ver').textContent = `app ${info.app} · shell ${info.shell}`;
  $('#paths').textContent = 'Dữ liệu: ' + info.userData + ' · Repo cập nhật: ' + info.repo;
  if (CFG.tiktok.autoConnect && CFG.tiktok.username) $('#btnConnect').click();
})();
})();

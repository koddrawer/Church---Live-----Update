(() => {
'use strict';
const api = window.api;
const $ = (s, r = document) => r.querySelector(s);
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
  const map = { idle: ['', 'Chưa kết nối'], connecting: ['warn', 'Đang kết nối…'], connected: ['ok', 'Đã kết nối @' + s.username], disconnected: ['err', 'Mất kết nối'], ended: ['warn', 'Live đã kết thúc'], error: ['err', 'Lỗi kết nối'] };
  const [c, t] = map[s.state] || ['', s.state];
  $('#tkdot').className = 'dot ' + c; $('#tktxt').textContent = t;
}
api.onTiktokStatus(setTk);
api.tiktokState().then(setTk);
$$('[data-sim]').forEach((b) => b.onclick = () => {
  const name = $('#simName').value.trim() || undefined;
  const s = b.dataset.sim;
  if (s === 'join') api.toStage({ type: 'sim-join', name });
  if (s === 'join10') api.toStage({ type: 'sim-join', n: 10 });
  if (s === 'gift') api.toStage({ type: 'sim-gift', name, gift: 'Hoa hồng', count: 1 });
  if (s === 'giftSeated') api.toStage({ type: 'sim-gift', seated: true, gift: 'Nhẫn', count: 1 });
  if (s === 'clear') api.toStage({ type: 'clear' });
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
  if (m.type === 'blessed') log('✝ Chúc phúc ' + m.name + ' (' + (m.gift || '') + ' ×' + m.count + ')');
  if (m.type === 'pretts') { $('#prettsBar').style.width = (100 * m.done / m.total) + '%'; if (m.done === m.total) log(`Đã tạo giọng ${m.ok}/${m.total} đoạn`); }
  if (m.type === 'status') {
    $('#sSeated').textContent = m.seated; $('#sWalk').textContent = m.walking; $('#sQueue').textContent = m.queue; $('#sSlots').textContent = m.slots;
    $('#names').innerHTML = '';
    for (const n of m.names) { const s = document.createElement('span'); s.textContent = n.name + (n.state === 'seated' ? ' · ' + n.left + 's' : ' · ⛪'); if (n.state !== 'seated') s.className = 'walk'; $('#names').appendChild(s); }
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
$('#btnPretts').onclick = () => { $('#prettsBar').style.width = '0'; api.toStage({ type: 'pretts' }); };
$('#btnRestartSermon').onclick = () => api.toStage({ type: 'sermon-restart' });
$('#btnSay').onclick = () => { const t = $('#sayText').value.trim(); if (t) api.toStage({ type: 'speak', text: t }); };
$('#btnMusic').onclick = async () => { const f = await api.pickFile({ filters: [{ name: 'Âm thanh', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }] }); if (f) { await save('audio.musicFile', f); fillInputs(); } };
$('#btnMusicClear').onclick = async () => { await save('audio.musicFile', ''); fillInputs(); };

// ---------- scene ----------
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
  for (const f of ua.sitters || []) defs.push({ file: 'church://user/sitters/' + encodeURIComponent(f), walker: (CFG.characters.userSitterWalker || {})[f] || walkerNames[0], user: f });
  for (const d of defs) {
    const el = document.createElement('div'); el.className = 'th' + (d.disabled ? ' off' : '');
    el.innerHTML = `<img src="${d.file}"><select></select><label style="display:flex;gap:4px;justify-content:center;margin-top:4px"><input type="checkbox" ${d.disabled ? '' : 'checked'} ${d.user ? 'disabled' : ''}> dùng</label>${d.user ? '<button class="b d" style="padding:2px 8px;margin-top:4px">Xoá</button>' : ''}`;
    const sel = $('select', el);
    for (const n of walkerNames) { const o = document.createElement('option'); o.value = n; o.textContent = '→ ' + n; sel.appendChild(o); }
    sel.value = d.walker;
    sel.onchange = async () => {
      if (d.builtin) { const arr = CFG.characters.sitters.map((s) => ({ ...s })); arr[d.i].walker = sel.value; await save('characters.sitters', arr); }
      else { const m = { ...(CFG.characters.userSitterWalker || {}) }; m[d.user] = sel.value; await save('characters.userSitterWalker', m); }
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
$('#btnCheck').onclick = async () => { $('#updInfo').textContent = 'Đang kiểm tra…'; const r = await api.checkUpdate({}); if (!r.ok) $('#updInfo').textContent = 'Lỗi: ' + r.error; };
$('#btnApply').onclick = async () => { $('#updInfo').textContent = 'Đang cập nhật…'; const r = await api.checkUpdate({ apply: true }); if (!r.ok) $('#updInfo').textContent = 'Lỗi: ' + r.error; else if (!r.hasUpdate) $('#updInfo').textContent = 'Đang dùng bản mới nhất (' + r.current + ')'; };
$('#btnResetOv').onclick = () => { if (confirm('Xoá các bản cập nhật đã tải và quay về bản gốc trong bộ cài?')) api.resetOverlay(); };
api.onUpdateStatus((s) => {
  if (s.stage === 'checked') $('#updInfo').textContent = s.hasUpdate ? `Có bản mới ${s.latest} (đang dùng ${s.current}) — ${s.notes}` : `Đang dùng bản mới nhất (${s.current})`;
  if (s.stage === 'downloading') { $('#updBar').style.width = (100 * s.done / s.total) + '%'; $('#updInfo').textContent = `Đang tải ${s.done}/${s.total}: ${s.file}`; }
  if (s.stage === 'applied') $('#updInfo').textContent = 'Đã cập nhật xong, đang tải lại…';
  if (s.stage === 'error') $('#updInfo').textContent = 'Lỗi cập nhật: ' + s.error;
});
$('#btnExport').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' })); a.download = 'church-live-config.json'; a.click(); };
$('#btnImport').onclick = async () => { const f = await api.pickFile({ filters: [{ name: 'JSON', extensions: ['json'] }] }); if (!f) return; try { raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(await api.readFileB64(f)), (c) => c.charCodeAt(0)))); } catch (e) { log('File cấu hình lỗi: ' + e.message, 'error'); return; } await api.replaceConfig(raw); CFG = deepMerge(CHURCH_DEFAULTS, raw); fillInputs(); };
$('#btnResetAll').onclick = async () => { if (!confirm('Khôi phục toàn bộ cài đặt mặc định?')) return; raw = {}; await api.replaceConfig({}); CFG = deepMerge(CHURCH_DEFAULTS, {}); fillInputs(); };
$('#btnTtsClear').onclick = async () => { await api.ttsClear(); log('Đã xoá cache giọng đọc'); };

(async () => {
  const c = await api.getConfig();
  raw = {}; for (const [k, v] of Object.entries(c || {})) if (!k.startsWith('_')) raw[k] = v;
  CFG = deepMerge(CHURCH_DEFAULTS, raw);
  fillInputs();
  const info = await api.info();
  $('#ver').textContent = `app ${info.app} · shell ${info.shell}`;
  $('#paths').textContent = 'Dữ liệu: ' + info.userData + ' · Repo cập nhật: ' + info.repo;
  if (CFG.tiktok.autoConnect && CFG.tiktok.username) $('#btnConnect').click();
})();
})();

// Phần mở rộng phía main (cập nhật từ xa qua GitHub). Nạp khi app khởi động.
// Thay thế phần kết nối TikTok LIVE của vỏ app để sửa lỗi kết nối mà không phải cài lại.
const path = require('path');
const { createRequire } = require('module');

module.exports = (ctx) => {
  const { app, ipcMain, both, log, getConfig } = ctx;
  const EXT_VER = '1.0.23';
  try { ipcMain.handle('relaunch', () => { app.relaunch(); app.exit(0); }); } catch {}
  setTimeout(() => log('Đã nạp bản sửa kết nối TikTok (main-ext ' + EXT_VER + ')'), 1500);
  const req = createRequire(path.join(app.getAppPath(), 'package.json'));
  const fs = require('fs'), fsp = fs.promises, crypto = require('crypto');
  const { BrowserWindow } = require('electron');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Giọng đọc Edge TTS: xếp hàng từng câu + thử lại (tránh bị Microsoft chặn khi gửi dồn dập) ----------
  const TTS_DIR = path.join(app.getPath('userData'), 'tts-cache');
  // tối đa 3 yêu cầu đọc cùng lúc (nhanh hơn xếp hàng từng câu, vẫn không dồn dập)
  let active = 0; const waiters = [];
  async function withSlot(fn) {
    if (active >= 3) await new Promise((r) => waiters.push(r));
    active++;
    try { return await fn(); } finally { active--; const n = waiters.shift(); if (n) n(); }
  }
  const ttsJobs = new Map();
  async function ttsOnce(text, voice, rate, pitch, file) {
    const { MsEdgeTTS, OUTPUT_FORMAT } = req('msedge-tts');
    const tmp = path.join(TTS_DIR, 'tmp-' + crypto.randomBytes(6).toString('hex'));
    await fsp.mkdir(tmp, { recursive: true });
    const t = new MsEdgeTTS();
    try {
      await t.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const opt = {}; if (rate) opt.rate = rate; if (pitch) opt.pitch = pitch;
      const r = await Promise.race([t.toFile(tmp, text, opt), sleep(12000).then(() => { throw new Error('TTS timeout'); })]);
      const st = fs.statSync(r.audioFilePath);
      if (st.size < 800) throw new Error('TTS trả về file rỗng');
      await fsp.rename(r.audioFilePath, file);
    } finally { try { t.close(); } catch {} fsp.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
  }
  function tts({ text, voice, rate, pitch }) {
    voice = voice || 'vi-VN-NamMinhNeural';
    const key = crypto.createHash('sha256').update([voice, rate || '', pitch || '', text].join('|')).digest('hex').slice(0, 24);
    const file = path.join(TTS_DIR, key + '.mp3');
    if (fs.existsSync(file) && fs.statSync(file).size > 800) return Promise.resolve({ ok: true, url: 'church://tts/' + key + '.mp3', cached: true });
    if (ttsJobs.has(key)) return ttsJobs.get(key);
    const job = withSlot(async () => {
      await fsp.mkdir(TTS_DIR, { recursive: true });
      let last;
      for (let i = 0; i < 2; i++) {
        try { await ttsOnce(text, voice, rate, pitch, file); return { ok: true, url: 'church://tts/' + key + '.mp3' }; }
        catch (e) { last = e; await sleep(400); }
      }
      return { ok: false, error: (last && last.message) || 'TTS lỗi' };
    }).finally(() => ttsJobs.delete(key));
    ttsJobs.set(key, job);
    return job;
  }
  try { ipcMain.removeHandler('tts'); } catch {}
  ipcMain.handle('tts', (e, a) => tts(a));

  // ---------- Lấy Room ID bằng trình duyệt ẩn (khi cách thường bị TikTok chặn) ----------
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
  async function browserRoomId(username) {
    const w = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { partition: 'persist:tiktok', backgroundThrottling: false } });
    try {
      w.webContents.setUserAgent(UA);
      w.webContents.setAudioMuted(true);
      await Promise.race([w.loadURL('https://www.tiktok.com/@' + encodeURIComponent(username) + '/live', { userAgent: UA }).catch(() => {}), sleep(25000)]);
      for (let i = 0; i < 30; i++) {
        const r = await w.webContents.executeJavaScript(`(() => {
          try { const s = document.getElementById('SIGI_STATE'); if (s) { const j = JSON.parse(s.textContent); const u = j && j.LiveRoom && j.LiveRoom.liveRoomUserInfo; if (u && u.user && u.user.roomId) return { roomId: String(u.user.roomId), status: (u.liveRoom && u.liveRoom.status) || (u.user && u.user.status) || null }; } } catch (e) {}
          const h = document.documentElement.innerHTML; const m = h.match(/"roomId":"(\\d{6,})"/) || h.match(/room_id=(\\d{6,})/);
          return m ? { roomId: m[1], status: null } : null; })()`).catch(() => null);
        if (r && r.roomId) return r;
        await sleep(700);
      }
      return null;
    } finally { try { w.destroy(); } catch {} }
  }
  const detail = (e) => {
    if (!e) return '';
    const parts = [e.message || e.info || String(e)];
    const subs = e.errors || e.requestErrs || (e.config && e.config.requestErrs) || [];
    if (Array.isArray(subs)) for (const x of subs) parts.push('  · ' + ((x && (x.message || x.info)) || String(x)).slice(0, 220));
    if (e.exception && e.exception !== e) parts.push('  · ' + (e.exception.message || e.exception));
    return parts.join('\n');
  };
  const tk = { conn: null, state: 'idle', username: '', want: false, retry: null, opts: {} };

  const status = (state, extra = {}) => { tk.state = state; both('tiktok-status', { state, username: tk.username, ...extra }); };
  const pickUser = (u) => {
    u = u || {};
    const id = u.uniqueId || u.displayId || u.userId || u.secUid || u.nickname || 'user';
    const name = u.nickname || u.uniqueId || u.displayId || 'Khách';
    const pp = u.profilePicture || u.avatarThumb || u.avatarMedium;
    let avatar = '';
    if (pp) avatar = (pp.url && pp.url[0]) || (pp.urls && pp.urls[0]) || (pp.urlList && pp.urlList[0]) || (pp.mUrls && pp.mUrls[0]) || '';
    return { id: String(id), name: String(name), avatar };
  };
  const hint = (msg) => {
    if (/Business plan|PremiumFeature|permission from the signature provider/i.test(msg)) return ' → tính năng này cần gói trả phí của Euler Stream; app đã tắt các yêu cầu đó, hãy thử kết nối lại.';
    if (/rate ?limit|429/i.test(msg)) return ' → máy chủ ký (Euler) đang giới hạn lượt, đợi 1–2 phút hoặc nhập Euler API key miễn phí từ eulerstream.com.';
    if (/offline|isn't online|room id/i.test(msg)) return ' → kênh chưa phát live hoặc sai username.';
    return '';
  };

  async function disconnect(user = true) {
    if (user) tk.want = false;
    clearTimeout(tk.retry);
    if (tk.conn) { const c = tk.conn; tk.conn = null; try { c.removeAllListeners && c.removeAllListeners(); await c.disconnect(); } catch {} }
    if (user) status('idle');
  }
  function scheduleRetry() {
    clearTimeout(tk.retry);
    const cfg = getConfig() || {};
    if (!tk.want || (cfg.tiktok && cfg.tiktok.autoReconnect === false)) return;
    tk.retry = setTimeout(() => { if (tk.want) { log('Thử kết nối lại TikTok...'); connect(tk.username, tk.opts); } }, 15000);
  }
  async function connect(username, opts = {}) {
    await disconnect(false);
    username = String(username || '').trim().replace(/^@/, '');
    if (!username) return { ok: false, error: 'Chưa nhập username' };
    tk.username = username; tk.want = true; tk.opts = opts;
    status('connecting');
    log('Đang kết nối @' + username + ' (kết nối bản ' + EXT_VER + ', không lấy danh sách quà)…');
    try {
      const { pathToFileURL } = require('url');
      const mod = await import(pathToFileURL(req.resolve('tiktok-live-connector')).href);
      const { TikTokLiveConnection, WebcastEvent, ControlEvent } = mod;
      // KHÔNG bật enableExtendedGiftInfo / fetchRoomInfoOnConnect: các yêu cầu này cần gói Business của Euler Stream
      const o = { processInitialData: false, enableExtendedGiftInfo: false, fetchRoomInfoOnConnect: false };
      if (opts.signApiKey) o.signApiKey = opts.signApiKey;
      const c = new TikTokLiveConnection(username, o);
      tk.conn = c;
      c.on(WebcastEvent.MEMBER, (d) => both('live-event', { type: 'join', ...pickUser(d.user) }));
      c.on(WebcastEvent.CHAT, (d) => both('live-event', { type: 'chat', ...pickUser(d.user), text: d.comment || d.content || '' }));
      if (WebcastEvent.FOLLOW) c.on(WebcastEvent.FOLLOW, (d) => both('live-event', { type: 'follow', ...pickUser(d.user) }));
      c.on(WebcastEvent.SHARE || 'share', (d) => both('live-event', { type: 'share', ...pickUser(d.user) }));
      c.on(WebcastEvent.GIFT, (d) => {
        const g = d.giftDetails || d.gift || {};
        const giftType = g.giftType ?? g.type ?? d.giftType ?? 0;
        const combo = g.combo ?? (giftType === 1);
        if (combo && !d.repeatEnd) return; // đợi kết thúc chuỗi combo
        const diamonds = Number(g.diamondCount ?? d.diamondCount ?? 0);
        const count = Number(d.repeatCount || d.comboCount || d.groupCount || 1);
        both('live-event', { type: 'gift', ...pickUser(d.user), gift: g.giftName || g.name || d.giftName || 'quà', count, diamonds, total: diamonds * count });
      });
      c.on(ControlEvent ? ControlEvent.DISCONNECTED : 'disconnected', () => { if (tk.conn !== c) return; log('TikTok: mất kết nối', 'warn'); status('disconnected'); scheduleRetry(); });
      if (WebcastEvent.STREAM_END) c.on(WebcastEvent.STREAM_END, () => { log('TikTok: live đã kết thúc', 'warn'); status('ended'); scheduleRetry(); });
      c.on(ControlEvent ? ControlEvent.ERROR : 'error', (e) => { const m = (e && (e.info || e.message)) || String(e); log('TikTok lỗi: ' + m + hint(m), 'error'); });
      try { const m = mod.RoomIdRouteConfig; if (m) m.skipFetchRoomIdFromEulerRoute = true; } catch {}
      let roomId = null;
      try { roomId = await c.fetchRoomId(); } catch (e) {
        log('Không lấy được Room ID bằng cách thường:\n' + detail(e) + '\n→ thử mở trang live bằng trình duyệt ẩn…', 'warn');
      }
      if (!roomId) {
        const r = await browserRoomId(username);
        if (!r) throw new Error('Không tìm thấy phòng live của @' + username + '. Kiểm tra kênh đang phát live và username đúng (không có @).');
        if (r.status === 4) throw new Error("The requested user isn't online");
        roomId = r.roomId; log('Room ID (qua trình duyệt): ' + roomId);
      }
      const st = await c.connect(roomId);
      status('connected', { roomId: st && st.roomId });
      log('Đã kết nối TikTok @' + username + (st && st.roomId ? ' (room ' + st.roomId + ')' : ''));
      return { ok: true };
    } catch (e) {
      const msg = (e && (e.message || e.info)) || String(e);
      const inner = e && e.exception ? ' / ' + (e.exception.message || e.exception) : '';
      log('Không kết nối được TikTok: ' + detail(e) + hint(msg + inner), 'error');
      status('error', { error: msg });
      scheduleRetry();
      return { ok: false, error: msg + hint(msg + inner) };
    }
  }

  for (const ch of ['tiktok-connect', 'tiktok-disconnect', 'tiktok-state']) { try { ipcMain.removeHandler(ch); } catch {} }
  ipcMain.handle('tiktok-connect', (e, a) => connect(a.username, a));
  ipcMain.handle('tiktok-disconnect', () => disconnect(true));
  ipcMain.handle('tiktok-state', () => ({ state: tk.state, username: tk.username }));
  app.on('before-quit', () => { disconnect(true); });
};

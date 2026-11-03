// Phần mở rộng phía main (cập nhật từ xa qua GitHub). Nạp khi app khởi động.
// Thay thế phần kết nối TikTok LIVE của vỏ app để sửa lỗi kết nối mà không phải cài lại.
const path = require('path');
const { createRequire } = require('module');

module.exports = (ctx) => {
  const { app, ipcMain, both, log, getConfig } = ctx;
  const EXT_VER = '1.0.33';
  try { ipcMain.handle('relaunch', () => { app.relaunch(); app.exit(0); }); } catch {}
  setTimeout(() => log('Đã nạp bản sửa kết nối TikTok (main-ext ' + EXT_VER + ')'), 1500);
  const req = createRequire(path.join(app.getAppPath(), 'package.json'));
  const fs = require('fs'), fsp = fs.promises, crypto = require('crypto');
  const { BrowserWindow } = require('electron');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Giọng đọc Edge TTS: xếp hàng từng câu + thử lại (tránh bị Microsoft chặn khi gửi dồn dập) ----------
  const TTS_DIR = path.join(app.getPath('userData'), 'tts-cache');
  // tối đa 3 yêu cầu đọc cùng lúc (nhanh hơn xếp hàng từng câu, vẫn không dồn dập)
  // Bộ điều phối: câu đang giảng (ưu tiên) tối đa 2 yêu cầu song song; tạo sẵn nền chỉ 1 yêu cầu và nhường ưu tiên.
  // Giãn cách giữa các yêu cầu + nghỉ khi máy chủ Microsoft từ chối liên tục (tránh bị chặn).
  let active = 0, lastStart = 0, cooldownUntil = 0, failStreak = 0;
  const fgQ = [], bgQ = [];
  function pump() {
    const t = Date.now();
    if (t < cooldownUntil) { setTimeout(pump, cooldownUntil - t + 20); return; }
    const gap = 350 - (t - lastStart); if (gap > 0) { setTimeout(pump, gap); return; }
    if (fgQ.length && active < 2) { active++; lastStart = t; fgQ.shift()(); }
    else if (!fgQ.length && bgQ.length && active < 1) { active++; lastStart = t; bgQ.shift()(); }
  }
  async function withSlot(fn, bg) {
    await new Promise((r) => { (bg ? bgQ : fgQ).push(r); pump(); });
    try { return await fn(); } finally { active--; setTimeout(pump, 0); }
  }
  function noteResult(ok, err) {
    if (ok) { failStreak = 0; return; }
    failStreak++;
    if (failStreak >= 3) { const wait = Math.min(120000, 10000 * Math.pow(2, Math.min(4, failStreak - 3))); cooldownUntil = Date.now() + wait; log('Máy chủ giọng đọc đang từ chối (' + err + '). Tạm nghỉ ' + Math.round(wait / 1000) + 's rồi thử lại.', 'warn'); }
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
  function tts({ text, voice, rate, pitch, bg, onlyCached }) {
    voice = voice || 'vi-VN-NamMinhNeural';
    const key = crypto.createHash('sha256').update([voice, rate || '', pitch || '', text].join('|')).digest('hex').slice(0, 24);
    const file = path.join(TTS_DIR, key + '.mp3');
    if (fs.existsSync(file) && fs.statSync(file).size > 800) return Promise.resolve({ ok: true, url: 'church://tts/' + key + '.mp3', cached: true });
    if (onlyCached) return Promise.resolve({ ok: false, notReady: true });
    if (ttsJobs.has(key)) return ttsJobs.get(key);
    const job = withSlot(async () => {
      await fsp.mkdir(TTS_DIR, { recursive: true });
      try { await ttsOnce(text, voice, rate, pitch, file); noteResult(true); return { ok: true, url: 'church://tts/' + key + '.mp3' }; }
      catch (e) { const m = (e && e.message) || 'TTS lỗi'; noteResult(false, m); return { ok: false, error: m }; }
    }, !!bg).finally(() => ttsJobs.delete(key));
    ttsJobs.set(key, job);
    return job;
  }
  try { ipcMain.removeHandler('tts'); } catch {}
  ipcMain.handle('tts', (e, a) => tts(a));

  // ---------- Giao thức church:// phát trực tiếp (stream) + hỗ trợ tua (Range) ----------
  // Bản cũ đọc cả file video vào bộ nhớ mỗi lần phát → video lớn làm app đơ. Bản này đọc từng phần.
  try {
    const { protocol } = require('electron');
    const { Readable } = require('stream');
    const BUNDLED = path.join(app.getAppPath(), 'app');
    const appRoot = ctx.appRoot || BUNDLED;
    const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.bin': 'application/octet-stream' };
    const resolve = (urlStr) => {
      const u = new URL(urlStr);
      const p = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
      if (u.host === 'app') { const a = path.join(appRoot, p); return fs.existsSync(a) ? a : path.join(BUNDLED, p); }
      if (u.host === 'user') return path.join(app.getPath('userData'), 'user-assets', p);
      if (u.host === 'tts') return path.join(app.getPath('userData'), 'tts-cache', path.basename(p));
      if (u.host === 'abs') return /^[A-Za-z]:/.test(p) ? p : '/' + p;
      return null;
    };
    protocol.unhandle('church');
    protocol.handle('church', async (req) => {
      try {
        const f = resolve(req.url);
        if (!f) return new Response('not found', { status: 404 });
        const st = await fsp.stat(f).catch(() => null);
        if (!st || !st.isFile()) return new Response('not found', { status: 404 });
        const type = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
        const size = st.size;
        const range = req.headers.get('range');
        const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
          let start = m[1] ? parseInt(m[1], 10) : 0, end = m[2] ? parseInt(m[2], 10) : size - 1;
          if (!m[1] && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
          end = Math.min(end, size - 1);
          if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
          const stream = Readable.toWeb(fs.createReadStream(f, { start, end, highWaterMark: 1 << 20 }));
          return new Response(stream, { status: 206, headers: { ...base, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` } });
        }
        if (size < 4 * 1024 * 1024) return new Response(await fsp.readFile(f), { status: 200, headers: { ...base, 'Content-Length': String(size) } });
        return new Response(Readable.toWeb(fs.createReadStream(f, { highWaterMark: 1 << 20 })), { status: 200, headers: { ...base, 'Content-Length': String(size) } });
      } catch (e) { return new Response('error: ' + e.message, { status: 500 }); }
    });
  } catch (e) { log('Không nạp được bộ phát stream: ' + e.message, 'warn'); }

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
    if (/rate ?limit|429/i.test(msg)) return ' → máy chủ ký (Euler) đang giới hạn lượt, lượt miễn phí tính theo giờ. Cách chắc chắn: đăng ký API key miễn phí ở eulerstream.com rồi dán vào ô "Euler Sign API key" (tab Live).';
    if (/offline|isn't online|room id/i.test(msg)) return ' → kênh chưa phát live hoặc sai username.';
    return '';
  };

  async function disconnect(user = true) {
    if (user) { tk.want = false; tk.rl = 0; tk.endN = 0; tk.endedRoom = null; }
    clearTimeout(tk.retry); tk.retry = null;
    clearInterval(tk.statT); if (tk.conn) { const c = tk.conn; tk.conn = null; try { c.removeAllListeners && c.removeAllListeners(); await c.disconnect(); } catch {} }
    if (user) status('idle');
  }
  function scheduleRetry(rateLimited, waitMs) {
    clearTimeout(tk.retry);
    const cfg = getConfig() || {};
    if (!tk.want || (cfg.tiktok && cfg.tiktok.autoReconnect === false)) return;
    let ms = waitMs || 15000;
    if (rateLimited) { // bị Euler giới hạn lượt: thử lại thưa dần để không đốt thêm lượt (2 → 5 → 10 → 15 phút)
      tk.rl = (tk.rl || 0) + 1; const mins = [2, 5, 10, 15][Math.min(tk.rl - 1, 3)]; ms = mins * 60000;
      log('Bị giới hạn lượt kết nối — app sẽ tự thử lại sau ' + mins + ' phút (đừng bấm Kết nối liên tục, mỗi lần bấm đều tốn lượt).', 'warn');
    }
    tk.retry = setTimeout(() => { if (tk.want) { log('Thử kết nối lại TikTok...'); connect(tk.username, tk.opts, true); } }, ms);
  }
  async function connect(username, opts = {}, auto = false) {
    username = String(username || '').trim().replace(/^@/, '');
    if (!username) return { ok: false, error: 'Chưa nhập username' };
    // đang kết nối / đã kết nối đúng kênh này thì không mở lại (mỗi lần mở tốn 1 lượt của máy chủ ký)
    if (tk.conn && tk.username === username && (tk.state === 'connected' || tk.state === 'connecting')) { log('TikTok @' + username + ' đang ' + (tk.state === 'connected' ? 'kết nối sẵn' : 'kết nối') + ' — bỏ qua lần bấm này.'); return { ok: true }; }
    if (!auto && tk.retry && tk.rl && !opts.signApiKey) { log('Đang chờ hết giới hạn lượt, app sẽ tự thử lại — bỏ qua lần bấm này để không tốn thêm lượt.', 'warn'); return { ok: false, error: 'rate limited, đang chờ' }; }
    await disconnect(false);
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
      const cnt = { join: 0, anon: 0, chat: 0, like: 0, gift: 0, follow: 0, share: 0 }; let firstEv = true;
      const tally = (k) => { cnt[k]++; if (firstEv) { firstEv = false; log('Đã nhận sự kiện đầu tiên từ TikTok (' + k + ') — kết nối hoạt động.'); } };
      clearInterval(tk.statT); tk.statT = setInterval(() => { if (tk.conn !== c) { clearInterval(tk.statT); return; } const t = Object.values(cnt).reduce((a, b) => a + b, 0); log('TikTok 60s qua: vào ' + cnt.join + ', vào ẩn danh ' + cnt.anon + ', bình luận ' + cnt.chat + ', thả tim ' + cnt.like + ', quà ' + cnt.gift + ', follow ' + cnt.follow + ', share ' + cnt.share + (t ? '' : ' — chưa nhận được sự kiện nào')); for (const k in cnt) cnt[k] = 0; }, 60000);
      c.on(WebcastEvent.MEMBER, (d) => { tally('join'); both('live-event', { type: 'join', ...pickUser(d.user) }); });
      // TikTok ẩn danh tính nhiều người xem khi vào: chỉ gửi tên che (vd "u***") qua sự kiện riêng
      if (WebcastEvent.UNAUTHORIZED_MEMBER) c.on(WebcastEvent.UNAUTHORIZED_MEMBER, (d) => { tally('anon'); const nm = String((d && d.nickName) || '').trim(); both('live-event', { type: 'join', anon: true, id: 'anon:' + (nm || '') + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: nm || '', avatar: '' }); });
      if (WebcastEvent.LIKE) c.on(WebcastEvent.LIKE, (d) => { tally('like'); both('live-event', { type: 'like', ...pickUser(d.user) }); });
      c.on(WebcastEvent.CHAT, (d) => tally('chat') || both('live-event', { type: 'chat', ...pickUser(d.user), text: d.comment || d.content || '' }));
      if (WebcastEvent.FOLLOW) c.on(WebcastEvent.FOLLOW, (d) => tally('follow') || both('live-event', { type: 'follow', ...pickUser(d.user) }));
      c.on(WebcastEvent.SHARE || 'share', (d) => tally('share') || both('live-event', { type: 'share', ...pickUser(d.user) }));
      c.on(WebcastEvent.GIFT, (d) => {
        const g = d.giftDetails || d.gift || {};
        const giftType = g.giftType ?? g.type ?? d.giftType ?? 0;
        const combo = g.combo ?? (giftType === 1);
        if (combo && !d.repeatEnd) return; // đợi kết thúc chuỗi combo
        tally('gift');
        const diamonds = Number(g.diamondCount ?? d.diamondCount ?? 0);
        const count = Number(d.repeatCount || d.comboCount || d.groupCount || 1);
        both('live-event', { type: 'gift', ...pickUser(d.user), gift: g.giftName || g.name || d.giftName || 'quà', count, diamonds, total: diamonds * count });
      });
      c.on(ControlEvent ? ControlEvent.DISCONNECTED : 'disconnected', () => { if (tk.conn !== c) return; log('TikTok: mất kết nối', 'warn'); status('disconnected'); scheduleRetry(); });
      if (WebcastEvent.STREAM_END) c.on(WebcastEvent.STREAM_END, () => {
        if (tk.conn !== c) return;
        const quick = Date.now() - (tk.connAt || 0) < 20000;
        tk.endedRoom = tk.roomId; tk.endN = (tk.endN || 0) + 1;
        log(quick ? 'TikTok báo phòng ' + tk.roomId + ' đã kết thúc ngay khi vừa vào → đây là phòng live CŨ. Kiểm tra kênh @' + username + ' có đang phát live không; app sẽ đợi phòng live mới.' : 'TikTok: live đã kết thúc', 'warn');
        status('ended'); tk.conn = null; try { c.removeAllListeners && c.removeAllListeners(); c.disconnect(); } catch {}
        scheduleRetry(false, Math.min(120000, 20000 * tk.endN));
      });
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
      if (roomId && String(roomId) === String(tk.endedRoom || '')) {
        log('Room ID ' + roomId + ' vẫn là phòng đã kết thúc → thử lấy lại bằng trình duyệt ẩn…', 'warn');
        const r = await browserRoomId(username);
        if (r && r.roomId && String(r.roomId) !== String(tk.endedRoom) && r.status !== 4) roomId = r.roomId;
        else { tk.conn = null; status('waiting'); log('Chưa có phòng live mới của @' + username + ' — app không kết nối vào phòng cũ (đỡ tốn lượt), sẽ kiểm tra lại sau.', 'warn'); scheduleRetry(false, Math.min(120000, 20000 * (tk.endN || 1))); return { ok: false, error: 'chưa có phòng live mới' }; }
      }
      tk.roomId = String(roomId);
      const st = await c.connect(roomId);
      tk.connAt = Date.now();
      status('connected', { roomId: st && st.roomId });
      tk.rl = 0; tk.endN = 0;
      log('Đã kết nối TikTok @' + username + (st && st.roomId ? ' (room ' + st.roomId + ')' : ''));
      return { ok: true };
    } catch (e) {
      const msg = (e && (e.message || e.info)) || String(e);
      const inner = e && e.exception ? ' / ' + (e.exception.message || e.exception) : '';
      log('Không kết nối được TikTok: ' + detail(e) + hint(msg + inner), 'error');
      status('error', { error: msg });
      scheduleRetry(/rate ?limit|429|too many connections/i.test(msg + inner + detail(e)));
      return { ok: false, error: msg + hint(msg + inner) };
    }
  }

  for (const ch of ['tiktok-connect', 'tiktok-disconnect', 'tiktok-state']) { try { ipcMain.removeHandler(ch); } catch {} }
  ipcMain.handle('tiktok-connect', (e, a) => connect(a.username, a));
  ipcMain.handle('tiktok-disconnect', () => disconnect(true));
  ipcMain.handle('tiktok-state', () => ({ state: tk.state, username: tk.username }));
  app.on('before-quit', () => { disconnect(true); });
};

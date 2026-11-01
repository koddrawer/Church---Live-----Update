// Phần mở rộng phía main (cập nhật từ xa qua GitHub). Nạp khi app khởi động.
// Thay thế phần kết nối TikTok LIVE của vỏ app để sửa lỗi kết nối mà không phải cài lại.
const path = require('path');
const { createRequire } = require('module');

module.exports = (ctx) => {
  const { app, ipcMain, both, log, getConfig } = ctx;
  const req = createRequire(path.join(app.getAppPath(), 'package.json'));
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
      const st = await c.connect();
      status('connected', { roomId: st && st.roomId });
      log('Đã kết nối TikTok @' + username + (st && st.roomId ? ' (room ' + st.roomId + ')' : ''));
      return { ok: true };
    } catch (e) {
      const msg = (e && (e.message || e.info)) || String(e);
      const inner = e && e.exception ? ' / ' + (e.exception.message || e.exception) : '';
      log('Không kết nối được TikTok: ' + msg + inner + hint(msg + inner), 'error');
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

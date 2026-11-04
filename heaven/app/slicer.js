// Tách sprite sheet hoạt ảnh (bố cục: hàng 1 = đi trái 1,2 / đi phải 1,2 / đi tới 1,2 ; hàng 2 = đi lùi 1,2 / đứng cúi đầu / ngồi-quỳ cầu nguyện)
window.SpriteSlicer = (() => {
  const ORDER = ['left1', 'left2', 'right1', 'right2', 'front1', 'front2', 'back1', 'back2', 'bow', 'kneel'];
  function label(mask, W, H) {
    const lab = new Int32Array(W * H); const comps = []; let n = 0; const stack = new Int32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      if (!mask[i] || lab[i]) continue;
      n++; let sp = 0; stack[sp++] = i; lab[i] = n;
      let x0 = W, x1 = 0, y0 = H, y1 = 0, area = 0;
      while (sp) {
        const j = stack[--sp]; const x = j % W, y = (j / W) | 0; area++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && mask[j - 1] && !lab[j - 1]) { lab[j - 1] = n; stack[sp++] = j - 1; }
        if (x < W - 1 && mask[j + 1] && !lab[j + 1]) { lab[j + 1] = n; stack[sp++] = j + 1; }
        if (y > 0 && mask[j - W] && !lab[j - W]) { lab[j - W] = n; stack[sp++] = j - W; }
        if (y < H - 1 && mask[j + W] && !lab[j + W]) { lab[j + W] = n; stack[sp++] = j + W; }
      }
      comps.push({ k: n, x0, x1: x1 + 1, y0, y1: y1 + 1, area });
    }
    return { lab, comps };
  }
  async function slice(img) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, W, H); const px = data.data;
    let mask = new Uint8Array(W * H); let opaqueBg = 0;
    for (let i = 0; i < W * H; i++) { mask[i] = px[i * 4 + 3] > 20 ? 1 : 0; opaqueBg += mask[i]; }
    if (opaqueBg > W * H * 0.97) throw new Error('Ảnh không có nền trong suốt (cần PNG đã tách nền).');
    // 1) tìm nhãn chữ (viên thuốc) và xoá dải nhãn
    let L = label(mask, W, H);
    const pills = L.comps.filter((o) => { const h = o.y1 - o.y0, w = o.x1 - o.x0; return h > 10 && h < H * 0.12 && w / h > 2.2 && w > W * 0.04; });
    for (const half of [0, 1]) {
      const ps = pills.filter((p) => (p.y0 < H * 0.5) === (half === 0)); if (!ps.length) continue;
      const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
      const top = med(ps.map((p) => p.y0)), bot = med(ps.map((p) => p.y1));
      for (let y = Math.max(0, top - 2); y < Math.min(H, bot + 3); y++) mask.fill(0, y * W, y * W + W);
    }
    L = label(mask, W, H);
    let big = L.comps.filter((o) => o.area > W * H * 0.004);
    let r1 = big.filter((o) => (o.y0 + o.y1) / 2 < H * 0.47).sort((a, b) => a.x0 - b.x0);
    let r2 = big.filter((o) => (o.y0 + o.y1) / 2 >= H * 0.47).sort((a, b) => a.x0 - b.x0);
    let nextK = L.comps.length + 1;
    function split(row, want) {
      while (row.length < want) {
        const med = row.map((o) => o.x1 - o.x0).sort((a, b) => a - b)[row.length >> 1];
        const wide = row.slice().sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0))[0];
        if (!wide || wide.x1 - wide.x0 < med * 1.55) break;
        const len = wide.x1 - wide.x0, prof = new Int32Array(len);
        for (let y = wide.y0; y < wide.y1; y++) for (let x = wide.x0; x < wide.x1; x++) if (L.lab[y * W + x] === wide.k) prof[x - wide.x0]++;
        let best = len / 3 | 0; for (let i = len / 3 | 0; i < (2 * len / 3) | 0; i++) if (prof[i] < prof[best]) best = i;
        const cut = wide.x0 + best, nk = nextK++;
        for (let y = wide.y0; y < wide.y1; y++) for (let x = cut; x < wide.x1; x++) if (L.lab[y * W + x] === wide.k) L.lab[y * W + x] = nk;
        const a = { ...wide, x1: cut }, b = { ...wide, k: nk, x0: cut };
        row.splice(row.indexOf(wide), 1, a, b); row.sort((p, q) => p.x0 - q.x0);
      }
      return row;
    }
    r1 = split(r1, 6); r2 = split(r2, 4);
    const all = [...r1, ...r2]; const bigSet = new Set(all.map((o) => o.k));
    const frames = all.map((o, i) => {
      const w = o.x1 - o.x0, h = o.y1 - o.y0;
      const fc = document.createElement('canvas'); fc.width = w; fc.height = h;
      const fg = fc.getContext('2d'); const out = fg.createImageData(w, h);
      let minX = w, maxX = 0, minY = h, maxY = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const j = (o.y0 + y) * W + o.x0 + x, kk = L.lab[j];
        if (!mask[j] || !(kk === o.k || !bigSet.has(kk))) continue;
        const s = j * 4, d = (y * w + x) * 4;
        out.data[d] = px[s]; out.data[d + 1] = px[s + 1]; out.data[d + 2] = px[s + 2]; out.data[d + 3] = px[s + 3];
        if (px[s + 3] > 12) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      fg.putImageData(out, 0, 0);
      const tc = document.createElement('canvas'); tc.width = Math.max(1, maxX - minX + 1); tc.height = Math.max(1, maxY - minY + 1);
      tc.getContext('2d').drawImage(fc, -minX, -minY);
      return { name: ORDER[i] || ('extra' + i), canvas: tc };
    });
    return { frames, row1: r1.length, row2: r2.length };
  }
  return { slice, ORDER };
})();

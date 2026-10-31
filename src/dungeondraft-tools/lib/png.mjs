// Minimal dependency-free PNG decode/encode plus a small compositing toolkit (used for contact sheets and map rendering).
import zlib from 'node:zlib';

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

/**
 * Decode a PNG (all color types, bit depths 1-16, Adam7) to straight-alpha RGBA8.
 * @param {Buffer} buf
 * @returns {{w: number, h: number, data: Uint8Array}}
 */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) {
    throw new Error('Not a PNG');
  }
  let pos = 8;
  let w = 0, h = 0, depth = 8, ctype = 6, interlace = 0;
  let plte = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      depth = body[8];
      ctype = body[9];
      interlace = body[12];
    } else if (type === 'PLTE') {
      plte = body;
    } else if (type === 'tRNS') {
      trns = body;
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const bpp = Math.max(1, (channels * depth) >> 3);
  const out = new Uint8Array(w * h * 4);
  let off = 0;

  const maxv = (1 << depth) - 1;
  const passes = interlace
    ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]
    : [[0, 0, 1, 1]];
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((w - x0) / dx);
    const ph = Math.ceil((h - y0) / dy);
    if (pw <= 0 || ph <= 0) {
      continue;
    }
    const rowBytes = Math.ceil((pw * channels * depth) / 8);
    let prev = new Uint8Array(rowBytes);
    for (let y = 0; y < ph; y++) {
      const ft = raw[off++];
      const row = new Uint8Array(raw.subarray(off, off + rowBytes));
      off += rowBytes;
      for (let i = 0; i < rowBytes; i++) {
        const a = i >= bpp ? row[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        let v = row[i];
        if (ft === 1) {
          v += a;
        } else if (ft === 2) {
          v += b;
        } else if (ft === 3) {
          v += (a + b) >> 1;
        } else if (ft === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        row[i] = v & 255;
      }
      prev = row;
      // sample reader
      const sample = (px, ch) => {
        if (depth === 8) {
          return row[px * channels + ch];
        }
        if (depth === 16) {
          return row[(px * channels + ch) * 2];
        }
        const bit = (px * channels + ch) * depth;
        return (row[bit >> 3] >> (8 - depth - (bit & 7))) & maxv;
      };
      const raw16 = (px, ch) => (depth === 16 ? (row[(px * channels + ch) * 2] << 8) | row[(px * channels + ch) * 2 + 1] : sample(px, ch));
      for (let px = 0; px < pw; px++) {
        const o = ((y0 + y * dy) * w + (x0 + px * dx)) * 4;
        if (ctype === 6) {
          out[o] = sample(px, 0); out[o + 1] = sample(px, 1); out[o + 2] = sample(px, 2); out[o + 3] = sample(px, 3);
        } else if (ctype === 2) {
          out[o] = sample(px, 0); out[o + 1] = sample(px, 1); out[o + 2] = sample(px, 2); out[o + 3] = 255;
          if (trns && trns.length >= 6 && raw16(px, 0) === trns.readUInt16BE(0) && raw16(px, 1) === trns.readUInt16BE(2) && raw16(px, 2) === trns.readUInt16BE(4)) {
            out[o + 3] = 0;
          }
        } else if (ctype === 0) {
          const g = depth < 8 ? Math.round((sample(px, 0) * 255) / maxv) : sample(px, 0);
          out[o] = out[o + 1] = out[o + 2] = g;
          out[o + 3] = trns && trns.length >= 2 && raw16(px, 0) === trns.readUInt16BE(0) ? 0 : 255;
        } else if (ctype === 4) {
          out[o] = out[o + 1] = out[o + 2] = sample(px, 0);
          out[o + 3] = sample(px, 1);
        } else if (ctype === 3) {
          const idx = sample(px, 0);
          out[o] = plte[idx * 3]; out[o + 1] = plte[idx * 3 + 1]; out[o + 2] = plte[idx * 3 + 2];
          out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
        }
      }
    }
  }
  return { w, h, data: out };
}

/** Encode RGBA8 (or RGB if alpha=false) to a PNG buffer, choosing the best filter per row. */
export function encodePng({ w, h, data }, { alpha = false, level = 6 } = {}) {
  const ch = alpha ? 4 : 3;
  const rowBytes = w * ch;
  const raw = Buffer.alloc((rowBytes + 1) * h);
  const rows = [new Uint8Array(rowBytes), new Uint8Array(rowBytes), new Uint8Array(rowBytes), new Uint8Array(rowBytes)];
  let prev = new Uint8Array(rowBytes);
  const cur = new Uint8Array(rowBytes);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      cur[x * ch] = data[s]; cur[x * ch + 1] = data[s + 1]; cur[x * ch + 2] = data[s + 2];
      if (alpha) {
        cur[x * ch + 3] = data[s + 3];
      }
    }
    const sums = [0, 0, 0, 0];
    const types = [0, 1, 2, 4];
    for (let t = 0; t < 4; t++) {
      const r = rows[t];
      const ft = types[t];
      let sum = 0;
      for (let i = 0; i < rowBytes; i++) {
        const a = i >= ch ? cur[i - ch] : 0;
        const b = prev[i];
        const c = i >= ch ? prev[i - ch] : 0;
        let p = 0;
        if (ft === 1) { p = a; } else if (ft === 2) { p = b; } else if (ft === 4) {
          const pp = a + b - c;
          const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const v = (cur[i] - p) & 255;
        r[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      sums[t] = sum;
    }
    const best = sums.indexOf(Math.min(...sums));
    raw[y * (rowBytes + 1)] = types[best];
    raw.set(rows[best], y * (rowBytes + 1) + 1);
    prev = Uint8Array.from(cur);
  }
  const idat = zlib.deflateSync(raw, { level });
  const chunk = (type, body) => {
    const b = Buffer.alloc(12 + body.length);
    b.writeUInt32BE(body.length, 0);
    b.write(type, 4, 'latin1');
    body.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, 8 + body.length)), 8 + body.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/** Sprite wrapper: straight RGBA8 plus lazily built premultiplied float mip levels. */
export class Sprite {
  constructor(img) {
    this.w = img.w;
    this.h = img.h;
    const n = img.w * img.h;
    const pm = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const a = img.data[i * 4 + 3] / 255;
      pm[i * 4] = (img.data[i * 4] / 255) * a;
      pm[i * 4 + 1] = (img.data[i * 4 + 1] / 255) * a;
      pm[i * 4 + 2] = (img.data[i * 4 + 2] / 255) * a;
      pm[i * 4 + 3] = a;
    }
    this.levels = [{ w: img.w, h: img.h, d: pm }];
  }

  /** Mip level whose width is >= targetW (box-filtered halvings). */
  level(targetW) {
    let l = 0;
    while (this.levels[l].w / 2 >= targetW && this.levels[l].w > 1 && this.levels[l].h > 1) {
      if (!this.levels[l + 1]) {
        const s = this.levels[l];
        const nw = s.w >> 1, nh = s.h >> 1;
        const d = new Float32Array(nw * nh * 4);
        for (let y = 0; y < nh; y++) {
          for (let x = 0; x < nw; x++) {
            for (let c = 0; c < 4; c++) {
              d[(y * nw + x) * 4 + c] = (s.d[((2 * y) * s.w + 2 * x) * 4 + c] + s.d[((2 * y) * s.w + 2 * x + 1) * 4 + c] + s.d[((2 * y + 1) * s.w + 2 * x) * 4 + c] + s.d[((2 * y + 1) * s.w + 2 * x + 1) * 4 + c]) / 4;
            }
          }
        }
        this.levels[l + 1] = { w: nw, h: nh, d };
      }
      l++;
    }
    return this.levels[l];
  }
}

function bilinear(lv, tx, ty, wrap, out) {
  const x0 = Math.floor(tx - 0.5), y0 = Math.floor(ty - 0.5);
  const fx = tx - 0.5 - x0, fy = ty - 0.5 - y0;
  out[0] = out[1] = out[2] = out[3] = 0;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      let x = x0 + i, y = y0 + j;
      const wgt = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
      if (wrap) {
        x = ((x % lv.w) + lv.w) % lv.w;
        y = ((y % lv.h) + lv.h) % lv.h;
      } else if (x < 0 || y < 0 || x >= lv.w || y >= lv.h) {
        continue;
      }
      const o = (y * lv.w + x) * 4;
      out[0] += lv.d[o] * wgt; out[1] += lv.d[o + 1] * wgt; out[2] += lv.d[o + 2] * wgt; out[3] += lv.d[o + 3] * wgt;
    }
  }
}

/** Opaque RGB working canvas (RGBA8 storage, alpha kept at 255). */
export class Canvas {
  constructor(w, h, bg = [0, 0, 0]) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      this.data[i * 4] = bg[0]; this.data[i * 4 + 1] = bg[1]; this.data[i * 4 + 2] = bg[2]; this.data[i * 4 + 3] = 255;
    }
  }

  /**
   * Rasterize a sprite to a premultiplied float buffer (does not touch the canvas).
   * opts: cx, cy (center px), w, h (dest size px; h defaults to aspect), rot (radians), flipX.
   */
  rasterize(sp, { cx, cy, w, h, rot = 0, flipX = false, clip = null }) {
    const dh = h ?? (w * sp.h) / sp.w;
    const lv = sp.level(w);
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const hw = w / 2, hh = dh / 2;
    const xs = [], ys = [];
    for (const [ux, uy] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
      xs.push(cx + ux * cos - uy * sin);
      ys.push(cy + ux * sin + uy * cos);
    }
    const cl = clip || { x0: 0, y0: 0, x1: this.w, y1: this.h };
    const x0 = Math.max(0, cl.x0, Math.floor(Math.min(...xs)) - 1), x1 = Math.min(this.w, cl.x1, Math.ceil(Math.max(...xs)) + 1);
    const y0 = Math.max(0, cl.y0, Math.floor(Math.min(...ys)) - 1), y1 = Math.min(this.h, cl.y1, Math.ceil(Math.max(...ys)) + 1);
    const bw = Math.max(0, x1 - x0), bh = Math.max(0, y1 - y0);
    const d = new Float32Array(bw * bh * 4);
    const px = [0, 0, 0, 0];
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const rx = x0 + x + 0.5 - cx, ry = y0 + y + 0.5 - cy;
        const u = rx * cos + ry * sin, v = -rx * sin + ry * cos;
        if (u < -hw || u > hw || v < -hh || v > hh) {
          continue;
        }
        let fu = u / w + 0.5;
        if (flipX) {
          fu = 1 - fu;
        }
        bilinear(lv, fu * lv.w, (v / dh + 0.5) * lv.h, false, px);
        const o = (y * bw + x) * 4;
        d[o] = px[0]; d[o + 1] = px[1]; d[o + 2] = px[2]; d[o + 3] = px[3];
      }
    }
    return { x0, y0, w: bw, h: bh, d };
  }

  /** Composite a rasterized buffer. tint multiplies rgb (0-1 each); opacity scales everything. */
  composite(buf, { tint = [1, 1, 1], opacity = 1 } = {}) {
    for (let y = 0; y < buf.h; y++) {
      for (let x = 0; x < buf.w; x++) {
        const o = (y * buf.w + x) * 4;
        const a = buf.d[o + 3] * opacity;
        if (a <= 0) {
          continue;
        }
        const t = ((buf.y0 + y) * this.w + buf.x0 + x) * 4;
        const k = 1 - a;
        this.data[t] = buf.d[o] * tint[0] * opacity * 255 + this.data[t] * k;
        this.data[t + 1] = buf.d[o + 1] * tint[1] * opacity * 255 + this.data[t + 1] * k;
        this.data[t + 2] = buf.d[o + 2] * tint[2] * opacity * 255 + this.data[t + 2] * k;
      }
    }
  }

  /** Soft drop shadow derived from the sprite alpha (like Dungeondraft's own object shadows). */
  shadow(buf, { dx = 6, dy = 8, blur = 8, opacity = 0.4, color = [0, 0, 0] } = {}) {
    dx = Math.round(dx);
    dy = Math.round(dy);
    blur = Math.max(1, Math.round(blur));
    const pad = blur * 2 + Math.max(Math.abs(dx), Math.abs(dy)) + 2;
    const bw = buf.w + pad * 2, bh = buf.h + pad * 2;
    let a = new Float32Array(bw * bh);
    for (let y = 0; y < buf.h; y++) {
      for (let x = 0; x < buf.w; x++) {
        a[(y + pad) * bw + x + pad] = buf.d[(y * buf.w + x) * 4 + 3];
      }
    }
    const tmp = new Float32Array(a.length);
    for (let pass = 0; pass < 2; pass++) {
      const r = Math.max(1, Math.round(blur / 2));
      for (let y = 0; y < bh; y++) {
        let sum = 0;
        for (let x = -r; x <= r; x++) {
          sum += x >= 0 && x < bw ? a[y * bw + x] : 0;
        }
        for (let x = 0; x < bw; x++) {
          tmp[y * bw + x] = sum / (2 * r + 1);
          sum += (x + r + 1 < bw ? a[y * bw + x + r + 1] : 0) - (x - r >= 0 ? a[y * bw + x - r] : 0);
        }
      }
      for (let x = 0; x < bw; x++) {
        let sum = 0;
        for (let y = -r; y <= r; y++) {
          sum += y >= 0 && y < bh ? tmp[y * bw + x] : 0;
        }
        for (let y = 0; y < bh; y++) {
          a[y * bw + x] = sum / (2 * r + 1);
          sum += (y + r + 1 < bh ? tmp[(y + r + 1) * bw + x] : 0) - (y - r >= 0 ? tmp[(y - r) * bw + x] : 0);
        }
      }
    }
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const v = a[y * bw + x] * opacity;
        if (v <= 0.002) {
          continue;
        }
        const cx = buf.x0 - pad + x + dx, cy = buf.y0 - pad + y + dy;
        if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) {
          continue;
        }
        const t = (cy * this.w + cx) * 4;
        for (let c = 0; c < 3; c++) {
          this.data[t + c] = color[c] * v + this.data[t + c] * (1 - v);
        }
      }
    }
  }

  /** Draw a sprite with optional tint/opacity/shadow. */
  draw(sp, o) {
    const buf = this.rasterize(sp, o);
    if (o.shadow) {
      this.shadow(buf, o.shadow);
    }
    this.composite(buf, o);
  }

  /**
   * Fill an axis-aligned rect with a tiled pattern. tile = tile width in px; rot rotates the tiling about (ox, oy).
   * mask(x, y) optional per-pixel alpha function (0-1) for soft edges.
   */
  fillPattern(sp, rect, { tile, rot = 0, ox = 0, oy = 0, tint = [1, 1, 1], opacity = 1, mask = null }) {
    const tileH = (tile * sp.h) / sp.w;
    const lv = sp.level(tile);
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const px = [0, 0, 0, 0];
    const x0 = Math.max(0, Math.floor(rect.x)), x1 = Math.min(this.w, Math.ceil(rect.x + rect.w));
    const y0 = Math.max(0, Math.floor(rect.y)), y1 = Math.min(this.h, Math.ceil(rect.y + rect.h));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const rx = x + 0.5 - ox, ry = y + 0.5 - oy;
        const u = rx * cos + ry * sin, v = -rx * sin + ry * cos;
        bilinear(lv, (u / tile) * lv.w, (v / tileH) * lv.h, true, px);
        let a = px[3] * opacity;
        if (mask) {
          a *= mask(x, y);
        }
        if (a <= 0) {
          continue;
        }
        const t = (y * this.w + x) * 4;
        const k = 1 - a;
        this.data[t] = px[0] * tint[0] * opacity * (mask ? mask(x, y) : 1) * 255 + this.data[t] * k;
        this.data[t + 1] = px[1] * tint[1] * opacity * (mask ? mask(x, y) : 1) * 255 + this.data[t + 1] * k;
        this.data[t + 2] = px[2] * tint[2] * opacity * (mask ? mask(x, y) : 1) * 255 + this.data[t + 2] * k;
      }
    }
  }

  /** Crop to a new Canvas-like {w,h,data}. */
  toImage() {
    return { w: this.w, h: this.h, data: this.data };
  }
}

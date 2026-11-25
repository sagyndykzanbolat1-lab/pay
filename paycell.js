// Минимальная сборка ячейки TON и BOC (одна ячейка без ссылок) — для комментария и перевода USDT.
(function (root) {
  function Bits() { this.b = []; }
  Bits.prototype.bit = function (v) { this.b.push(v ? 1 : 0); return this; };
  Bits.prototype.uint = function (v, n) {
    v = BigInt(v);
    for (let i = n - 1; i >= 0; i--) this.b.push(Number((v >> BigInt(i)) & 1n));
    return this;
  };
  Bits.prototype.bytes = function (arr) { for (const x of arr) this.uint(x, 8); return this; };
  Bits.prototype.coins = function (v) {
    v = BigInt(v);
    let len = 0;
    while ((v >> BigInt(len * 8)) > 0n) len++;
    this.uint(len, 4);
    if (len) this.uint(v, len * 8);
    return this;
  };
  Bits.prototype.addr = function (a) { // a = {wc, hash(Uint8Array 32)}
    this.uint(2, 2).uint(0, 1).uint(a.wc & 0xff, 8).bytes(a.hash);
    return this;
  };

  function utf8(s) { return Array.from(new TextEncoder().encode(s)); }

  function b64ToBytes(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64(arr) { let s = ""; for (const x of arr) s += String.fromCharCode(x); return btoa(s); }

  function parseAddr(s) {
    s = String(s).trim();
    if (/^-?\d+:[0-9a-fA-F]{64}$/.test(s)) {
      const [wc, hex] = s.split(":");
      const h = new Uint8Array(32);
      for (let i = 0; i < 32; i++) h[i] = parseInt(hex.substr(i * 2, 2), 16);
      return { wc: parseInt(wc, 10), hash: h };
    }
    const b = b64ToBytes(s);
    if (b.length !== 36) throw new Error("bad address");
    const wc = b[1] > 127 ? b[1] - 256 : b[1];
    return { wc, hash: b.slice(2, 34) };
  }

  const CRC = (() => { const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0x82F63B78 : c >>> 1; t[i] = c >>> 0; }
    return t; })();
  function crc32c(arr) { let c = 0xFFFFFFFF; for (const x of arr) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  function boc(bits) {
    const b = bits.b.slice();
    const n = b.length;
    if (n > 1023) throw new Error("cell overflow");
    if (n % 8) { b.push(1); while (b.length % 8) b.push(0); }
    const data = [];
    for (let i = 0; i < b.length; i += 8) { let v = 0; for (let k = 0; k < 8; k++) v = (v << 1) | b[i + k]; data.push(v); }
    const d2 = Math.floor(n / 8) + Math.ceil(n / 8);
    const cell = [0, d2, ...data];
    const out = [0xb5, 0xee, 0x9c, 0x72, 0x41, 0x01, 0x01, 0x01, 0x00, cell.length, 0x00, ...cell];
    const c = crc32c(out);
    out.push(c & 0xff, (c >>> 8) & 0xff, (c >>> 16) & 0xff, (c >>> 24) & 0xff);
    return bytesToB64(out);
  }

  function commentBoc(text) { return boc(new Bits().uint(0, 32).bytes(utf8(text))); }

  function jettonTransferBoc(amount, dest, responseTo, comment) {
    const c = new Bits()
      .uint(0x0f8a7ea5, 32).uint(Date.now(), 64)
      .coins(amount).addr(parseAddr(dest)).addr(parseAddr(responseTo))
      .bit(0)          // без custom_payload
      .coins(1)        // 1 nanoTON с уведомлением, чтобы получатель видел комментарий
      .bit(0)          // forward_payload прямо в ячейке
      .uint(0, 32).bytes(utf8(comment));
    return boc(c);
  }

  root.PayCell = { commentBoc, jettonTransferBoc, parseAddr };
})(typeof window !== "undefined" ? window : globalThis);

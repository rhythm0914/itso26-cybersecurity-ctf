/*!
 * sha256.js - dependency-free SHA-256 used as a fallback for crypto.subtle.
 *
 * crypto.subtle is only available in "secure contexts". A static site served
 * from http://192.168.x.x:8000 (plain HTTP on a LAN) is NOT a secure context,
 * so crypto.subtle is undefined there. This pure JavaScript implementation
 * keeps flag verification working everywhere: file://, http://LAN-IP and https.
 */
(function (global) {
  'use strict';

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) {
    return ((x >>> n) | (x << (32 - n))) >>> 0;
  }

  /* UTF-8 encode without relying on TextEncoder (older/edge browsers). */
  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str);
    }
    var bytes = [];
    var i, c, c2, cp;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c < 0x80) {
        bytes.push(c);
      } else if (c < 0x800) {
        bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length &&
                 str.charCodeAt(i + 1) >= 0xdc00 && str.charCodeAt(i + 1) <= 0xdfff) {
        c2 = str.charCodeAt(i + 1);
        cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f),
                   0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        i++;
      } else {
        bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }
    return new Uint8Array(bytes);
  }

  /* SHA-256 over raw bytes -> Uint8Array(32) */
  function sha256Bytes(input) {
    var msg = input instanceof Uint8Array ? input : new Uint8Array(input || []);
    var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
        h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    var bitLenHi = Math.floor(msg.length / 536870912);   /* (len*8) / 2^32 */
    var bitLenLo = (msg.length << 3) >>> 0;

    var withPad = new Uint8Array(((msg.length + 9 + 63) >> 6) << 6);
    withPad.set(msg, 0);
    withPad[msg.length] = 0x80;
    var dv = new DataView(withPad.buffer);
    dv.setUint32(withPad.length - 8, bitLenHi, false);
    dv.setUint32(withPad.length - 4, bitLenLo, false);

    var w = new Uint32Array(64);
    var i, t, a, b, c, d, e, f, g, hh, t1, t2, s0, s1, ch, maj;

    for (i = 0; i < withPad.length; i += 64) {
      for (t = 0; t < 16; t++) {
        w[t] = dv.getUint32(i + t * 4, false);
      }
      for (t = 16; t < 64; t++) {
        s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      a = h0; b = h1; c = h2; d = h3; e = h4; f = h5; g = h6; hh = h7;
      for (t = 0; t < 64; t++) {
        s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        ch = (e & f) ^ (~e & g);
        t1 = (hh + s1 + ch + K[t] + w[t]) >>> 0;
        s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        maj = (a & b) ^ (a & c) ^ (b & c);
        t2 = (s0 + maj) >>> 0;
        hh = g; g = f; f = e;
        e = (d + t1) >>> 0;
        d = c; c = b; b = a;
        a = (t1 + t2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + hh) >>> 0;
    }

    var out = new Uint8Array(32);
    var odv = new DataView(out.buffer);
    odv.setUint32(0, h0, false); odv.setUint32(4, h1, false);
    odv.setUint32(8, h2, false); odv.setUint32(12, h3, false);
    odv.setUint32(16, h4, false); odv.setUint32(20, h5, false);
    odv.setUint32(24, h6, false); odv.setUint32(28, h7, false);
    return out;
  }

  function toHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    }
    return hex;
  }

  /* SHA-256 of a UTF-8 string -> lowercase hex string */
  function sha256Hex(str) {
    return toHex(sha256Bytes(utf8Bytes(String(str))));
  }

  global.sha256Bytes = sha256Bytes;
  global.sha256Hex = sha256Hex;
  global.sha256Utf8Bytes = utf8Bytes;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { sha256Hex: sha256Hex, sha256Bytes: sha256Bytes };
  }
})(typeof window !== 'undefined' ? window : globalThis);

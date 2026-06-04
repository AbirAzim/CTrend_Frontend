// Generates distinct short UI sound effects as 16-bit PCM mono WAV files.
// Run: node scripts/generate-sounds.js  → writes assets/sounds/<id>.wav
const fs = require("fs");
const path = require("path");

const SR = 44100;
const OUT = path.join(__dirname, "..", "assets", "sounds");
fs.mkdirSync(OUT, { recursive: true });

const ms = (n) => Math.floor((SR * n) / 1000);

function writeWav(name, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  fs.writeFileSync(path.join(OUT, name + ".wav"), buf);
  console.log("wrote", name + ".wav", (n / SR * 1000).toFixed(0) + "ms");
}

// A single tone with attack + exponential decay. Optional pitch sweep and waveform.
function tone({ freq, durMs, type = "sine", vol = 0.6, attackMs = 4, decayMs = null, sweepTo = null }) {
  const n = ms(durMs);
  const aN = Math.max(1, ms(attackMs));
  const dN = ms(decayMs ?? durMs);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = sweepTo ? freq + (sweepTo - freq) * (i / n) : freq;
    let v;
    if (type === "square") v = Math.sin(2 * Math.PI * f * t) >= 0 ? 1 : -1;
    else if (type === "triangle") v = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * f * t));
    else if (type === "noise") v = Math.random() * 2 - 1;
    else v = Math.sin(2 * Math.PI * f * t);
    const amp = i < aN ? i / aN : Math.exp((-3 * (i - aN)) / dN);
    out[i] = v * vol * amp;
  }
  return out;
}

// Bell = fundamental + softer 2nd & 3rd partials, long decay.
function bell({ freq, durMs, vol = 0.5 }) {
  const a = tone({ freq, durMs, vol, decayMs: durMs * 0.9 });
  const b = tone({ freq: freq * 2.01, durMs, vol: vol * 0.4, decayMs: durMs * 0.6 });
  const c = tone({ freq: freq * 3.02, durMs, vol: vol * 0.18, decayMs: durMs * 0.4 });
  return mix(a, b, c);
}

function mix(...arrs) {
  const len = Math.max(...arrs.map((a) => a.length));
  const out = new Float32Array(len);
  for (const a of arrs) for (let i = 0; i < a.length; i++) out[i] += a[i];
  return out;
}
function seq(...arrs) {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

const sounds = {
  // Vote
  "buzz-in": tone({ freq: 196, durMs: 130, type: "square", vol: 0.5, decayMs: 110 }),
  "crowd-pop": mix(
    tone({ freq: 110, durMs: 240, vol: 0.5, decayMs: 120 }),
    tone({ freq: 0, durMs: 170, type: "noise", vol: 0.35, decayMs: 90 }),
  ),
  "soft-pop": tone({ freq: 680, durMs: 90, vol: 0.6, decayMs: 55 }),
  "coin-ping": seq(tone({ freq: 988, durMs: 60, vol: 0.55, decayMs: 60 }), tone({ freq: 1319, durMs: 130, vol: 0.55, decayMs: 120 })),
  "slot-tick": tone({ freq: 2300, durMs: 45, vol: 0.5, attackMs: 1, decayMs: 22 }),
  "thock": mix(tone({ freq: 0, durMs: 18, type: "noise", vol: 0.4, decayMs: 12 }), tone({ freq: 165, durMs: 110, vol: 0.6, decayMs: 70 })),
  "whistle-chirp": tone({ freq: 1500, durMs: 180, vol: 0.45, sweepTo: 2650, decayMs: 160 }),
  "success-duo": seq(tone({ freq: 784, durMs: 90, vol: 0.5, decayMs: 90 }), tone({ freq: 1047, durMs: 170, vol: 0.55, decayMs: 160 })),
  // Notification
  "ascending-chime": seq(
    bell({ freq: 523, durMs: 150 }),
    bell({ freq: 659, durMs: 150 }),
    bell({ freq: 784, durMs: 280 }),
  ),
  "soft-chime": seq(tone({ freq: 659, durMs: 130, vol: 0.45, decayMs: 120 }), tone({ freq: 880, durMs: 200, vol: 0.45, decayMs: 190 })),
  "gentle-bell": bell({ freq: 880, durMs: 360, vol: 0.55 }),
  // Message
  "gentle-ping": seq(tone({ freq: 880, durMs: 110, vol: 0.45, decayMs: 100 }), tone({ freq: 587, durMs: 290, vol: 0.45, decayMs: 270 })),
};

for (const [id, samples] of Object.entries(sounds)) writeWav(id, samples);
console.log("done:", Object.keys(sounds).length, "sounds");

"use client";

/**
 * Synthesized sound effects for the big screen (WebAudio, no asset files).
 * Every sound goes sfx bus -> limiter -> master, so one place sets the mix and nothing clips.
 */

const MASTER_DB = -6;
const SFX_DB = -3;
const MUTE_KEY = "tilt:muted";

/** sounds a game can ask the hub for through GameContext.playSound */
export type SoundName = "hit" | "dash" | "fall" | "win" | "count" | "shrink";

const dbToGain = (db: number) => Math.pow(10, db / 20);
/** small random pitch offset so repeated hits don't sound like a machine gun */
const vary = (amount = 0.08) => 1 + (Math.random() * 2 - 1) * amount;

export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private bus!: GainNode;
  private noise!: AudioBuffer;
  private lastHit = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {}
  }

  /** browsers keep audio locked until a user gesture: call from keydown/pointerdown */
  unlock() {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.15;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : dbToGain(MASTER_DB);
      this.bus = ctx.createGain();
      this.bus.gain.value = dbToGain(SFX_DB);
      this.bus.connect(limiter).connect(this.master).connect(ctx.destination);

      // one shared second of white noise, reused by every noisy sound
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    } catch {}
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : dbToGain(MASTER_DB), this.ctx.currentTime, 0.02);
    return this.muted;
  }

  /** one entry point for games: strength is hit force 0..1, or the count number */
  play(name: SoundName, v = 0) {
    switch (name) {
      case "hit": return this.hit(v);
      case "dash": return this.dash();
      case "fall": return this.fall();
      case "win": return this.win();
      case "count": return this.count(v);
      case "shrink": return this.shrink();
    }
  }

  /* ---------------- the sounds ---------------- */

  /** strength 0..1: a soft bump up to a heavy thud with a crack on top */
  hit(strength: number) {
    const ctx = this.ready();
    if (!ctx) return;
    // many contacts can land in one frame; one sound per 40 ms is plenty
    if (ctx.currentTime - this.lastHit < 0.04) return;
    this.lastHit = ctx.currentTime;
    const t = ctx.currentTime;
    const p = vary();
    this.tone("sine", 160 * p, 45 * p, t, 0.14, 0.35 + 0.65 * strength);
    if (strength > 0.3) this.burst(2500 * p, 1.2, t, 0.05, 0.15 + 0.35 * strength, "highpass");
  }

  dash() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 2;
    bp.frequency.setValueAtTime(600 * vary(), t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 0.18);
    src.connect(bp).connect(this.envelope(t, 0.22, 0.35));
    src.start(t);
    src.stop(t + 0.25);
  }

  fall() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone("triangle", 700 * vary(0.05), 90, t, 0.55, 0.45);
    this.tone("sine", 90, 35, t + 0.05, 0.4, 0.6);
  }

  win() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => this.tone("triangle", f, f, t + i * 0.1, i === 3 ? 0.5 : 0.14, 0.4));
  }

  /** 3, 2, 1 = short beep, 0 = go */
  count(n: number) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (n > 0) this.tone("sine", 660, 660, t, 0.12, 0.35);
    else this.tone("square", 990, 990, t, 0.3, 0.2);
  }

  /** arena starts closing in: low two-tone warning */
  shrink() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone("sawtooth", 220, 220, t, 0.18, 0.12);
    this.tone("sawtooth", 165, 165, t + 0.2, 0.3, 0.12);
  }

  /* ---------------- building blocks ---------------- */

  private ready() {
    return this.ctx && !this.muted && this.ctx.state === "running" ? this.ctx : null;
  }

  /** fast attack, exponential decay; returns the node to connect sources into */
  private envelope(t: number, dur: number, peak: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.bus);
    return g;
  }

  private tone(type: OscillatorType, from: number, to: number, t: number, dur: number, peak: number) {
    const osc = this.ctx!.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    osc.connect(this.envelope(t, dur, peak));
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private burst(freq: number, q: number, t: number, dur: number, peak: number, type: BiquadFilterType) {
    const src = this.noiseSource();
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(this.envelope(t, dur, peak));
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private noiseSource() {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    return src;
  }
}

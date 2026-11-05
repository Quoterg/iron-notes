// Pairing two of the user's devices for sync (M21b, ported from Iron Log): a direct WebRTC data channel on the local
// network, set up by exchanging two codes — shown as QR codes or copied as text. No server: no STUN
// or TURN and no signalling server (the codes are the signalling), so nothing reaches a third party
// and both devices must be on the same network. The channel is encrypted (DTLS); the codes carry
// each side's key fingerprint, so only the device that scanned this screen can connect.
// Loaded only on the sync screen.
import { applyChanges, changesFor, summarize, type Change, type Summary, type SyncStore } from './sync';

const PREFIX = 'IN1.';
/** Protocol version: bump when messages change, so mismatched app versions refuse cleanly. */
const VERSION = 2;
/** Changes per message: a few hundred KB each, so a big first sync never holds it all as text. */
export const BATCH = 500;

export class PairError extends Error {
  constructor(public kind: 'code' | 'version' | 'timeout' | 'closed' | 'protocol') {
    super(kind);
  }
}

// --- Codes (session descriptions, compressed: QR codes stay easy to scan) ---

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Lines a data-channel-only connection doesn't need: dropping them makes the QR code less dense. */
const DROPPABLE = /^a=(extmap-allow-mixed|msid-semantic:.*)$/;

export async function encodeSignal(desc: RTCSessionDescriptionInit): Promise<string> {
  const sdp = (desc.sdp ?? '').split('\r\n').filter((l) => !DROPPABLE.test(l)).join('\r\n');
  const json = JSON.stringify({ t: desc.type, s: sdp });
  return PREFIX + b64url(await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw')));
}

export async function decodeSignal(code: string, expect: 'offer' | 'answer'): Promise<RTCSessionDescriptionInit> {
  const c = code.trim();
  if (!c.startsWith(PREFIX) || c.length > 8000) throw new PairError('code');
  try {
    const json = new TextDecoder().decode(await pipe(unb64url(c.slice(PREFIX.length)), new DecompressionStream('deflate-raw')));
    const x = JSON.parse(json) as { t?: unknown; s?: unknown };
    if (x.t !== expect || typeof x.s !== 'string' || !x.s.startsWith('v=0')) throw new Error();
    return { type: expect, sdp: x.s };
  } catch {
    throw new PairError('code');
  }
}

// --- Messages over the channel (split into parts: data channels cap the message size) ---

export type SyncMsg =
  | { t: 'hello'; v: number }
  | { t: 'summary'; s: Summary }
  | { t: 'changes'; c: Change[]; total: number; last: boolean }
  | { t: 'done' };

/** Characters per part. Parts are `i/n|text` — no re-escaping, so a part is at most ~16 KB. */
export const PART = 16_000;
const MAX_PARTS = 2048; // 32 MB per message: room for a 500-record batch or a summary of MAX_SUMMARY keys, bounds what a peer can make us hold
/** Most records a summary may list (a lifetime of use is ~50 000). */
export const MAX_SUMMARY = 200_000;

/** A summary is an object of finite numbers within the key limit; anything else is a protocol error. */
export function checkSummary(s: unknown): Summary {
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new PairError('protocol');
  let n = 0;
  for (const k in s) {
    if (++n > MAX_SUMMARY || !Number.isFinite((s as Record<string, unknown>)[k])) throw new PairError('protocol');
  }
  return s as Summary;
}

export function frame(msg: SyncMsg): string[] {
  const json = JSON.stringify(msg);
  const n = Math.max(1, Math.ceil(json.length / PART));
  return Array.from({ length: n }, (_, i) => `${i}/${n}|${json.slice(i * PART, (i + 1) * PART)}`);
}

/** Collects parts in order; returns the message once complete. Anything malformed is a protocol error. */
export class Reassembler {
  private parts: string[] = [];
  private n = 0;
  push(raw: string): SyncMsg | undefined {
    const bar = raw.indexOf('|');
    const [i, n] = raw.slice(0, bar).split('/').map(Number);
    if (bar < 3 || !(n >= 1 && n <= MAX_PARTS) || i !== this.parts.length || (this.parts.length && n !== this.n) || raw.length - bar - 1 > PART) {
      throw new PairError('protocol');
    }
    this.n = n;
    this.parts.push(raw.slice(bar + 1));
    if (this.parts.length < n) return undefined;
    const text = this.parts.join('');
    this.parts = [];
    try {
      return JSON.parse(text) as SyncMsg;
    } catch {
      throw new PairError('protocol');
    }
  }
}

/** A message transport: what the sync protocol needs from a data channel (tests use a fake). */
export interface Channel {
  send(msg: SyncMsg): Promise<void>;
  next(): Promise<SyncMsg>;
  /** Resolves once everything sent has left this device. */
  flush(): Promise<void>;
}

export interface Progress {
  step: 'hello' | 'summary' | 'changes' | 'applying' | 'done';
  /** While applying: records received so far, of `total`. */
  done?: number;
  total?: number;
}

/**
 * The sync protocol. After the hello (the first device opens), both run the same steps. Changes go
 * in batches, each applied (atomically) as it arrives. Returns how many records this device
 * received and sent; `onApplied` fires after every batch that changed something.
 */
export async function runSync(
  ch: Channel,
  role: 'first' | 'second',
  onStep: (p: Progress) => void = () => {},
  onApplied: (n: number) => void = () => {},
): Promise<{ received: number; sent: number; stores: SyncStore[] }> {
  const want = async <T extends SyncMsg['t']>(t: T): Promise<Extract<SyncMsg, { t: T }>> => {
    const m = await ch.next();
    if (m.t !== t) {
      const e = new PairError('protocol');
      e.message = `expected ${t}, got ${String((m as { t?: unknown }).t)}`;
      throw e;
    }
    return m as Extract<SyncMsg, { t: T }>;
  };
  onStep({ step: 'hello' });
  // The device that showed the first code speaks first; the other answers only once it has heard
  // from it. A message sent the moment one side opens can be lost while the other side is still
  // opening — after the first device's hello, both are open.
  if (role === 'first') await ch.send({ t: 'hello', v: VERSION });
  if ((await want('hello')).v !== VERSION) throw new PairError('version');
  if (role === 'second') await ch.send({ t: 'hello', v: VERSION });

  onStep({ step: 'summary' });
  const summary = await summarize();
  await ch.send({ t: 'summary', s: summary });
  const theirs = checkSummary((await want('summary')).s);

  onStep({ step: 'changes' });
  const mine = await changesFor(theirs, summary);
  const batches = Math.max(1, Math.ceil(mine.length / BATCH));
  for (let b = 0; b < batches; b++) {
    await ch.send({ t: 'changes', c: mine.slice(b * BATCH, (b + 1) * BATCH), total: mine.length, last: b === batches - 1 });
  }

  let received = 0;
  let got = 0;
  let expected: number | undefined;
  let seen = 0;
  const stores = new Set<SyncStore>();
  for (;;) {
    const m = await want('changes');
    if (!Array.isArray(m.c) || m.c.length > BATCH || !Number.isSafeInteger(m.total) || m.total < 0) throw new PairError('protocol');
    // The total is fixed by the first batch; no more batches than it needs (+1 for an empty one).
    expected ??= m.total;
    if (m.total !== expected || ++seen > Math.ceil(expected / BATCH) + 1) throw new PairError('protocol');
    const applied = await applyChanges(m.c);
    received += applied.count;
    got += m.c.length;
    applied.stores.forEach((s) => stores.add(s));
    if (applied.count) onApplied(received);
    onStep({ step: 'applying', done: got, total: m.total });
    if (m.last) break;
  }

  await ch.send({ t: 'done' });
  try {
    await want('done');
  } catch (e) {
    // Everything was exchanged and applied; the other side may close as soon as it has our 'done'.
    if (!(e instanceof PairError && e.kind === 'closed')) throw e;
  }
  await ch.flush(); // don't close before our 'done' has left
  onStep({ step: 'done' });
  return { received, sent: mine.length, stores: [...stores] };
}

// --- WebRTC ---

/** Wrap an open data channel as a Channel, with back-pressure for big histories. */
export function channelOf(dc: RTCDataChannel): Channel {
  const queue: SyncMsg[] = [];
  const waiters: { ok: (m: SyncMsg) => void; fail: (e: unknown) => void }[] = [];
  const asm = new Reassembler();
  let error: unknown;
  const fail = (e: unknown) => {
    error ??= e;
    for (const w of waiters.splice(0)) w.fail(e);
  };
  dc.onmessage = (ev) => {
    try {
      const m = asm.push(String(ev.data));
      if (!m) return;
      const w = waiters.shift();
      if (w) w.ok(m);
      else queue.push(m);
    } catch (e) {
      fail(e);
    }
  };
  dc.onclose = () => fail(new PairError('closed'));
  const drained = (limit: number) =>
    dc.bufferedAmount <= limit
      ? Promise.resolve()
      : new Promise<void>((ok) => {
          dc.bufferedAmountLowThreshold = limit;
          dc.addEventListener('bufferedamountlow', () => ok(), { once: true });
        });
  return {
    async send(msg) {
      for (const part of frame(msg)) {
        if (dc.bufferedAmount > 1024 * 1024) await drained(256 * 1024);
        dc.send(part);
      }
    },
    next() {
      const m = queue.shift();
      if (m) return Promise.resolve(m);
      if (error) return Promise.reject(error);
      return new Promise((ok, failW) => waiters.push({ ok, fail: failW }));
    },
    async flush() {
      await drained(0);
      await new Promise((ok) => setTimeout(ok, 200)); // let the last packet reach the other side
    },
  };
}

/** Give up after `ms`; the timer is cleared as soon as the promise settles. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, no) => (timer = setTimeout(() => no(new PairError('timeout')), ms)));
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

async function gathered(pc: RTCPeerConnection): Promise<void> {
  // The whole description goes into one code, so wait for all (local-network) candidates.
  if (pc.iceGatheringState === 'complete') return;
  await withTimeout(
    new Promise<void>((ok) => pc.addEventListener('icegatheringstatechange', () => pc.iceGatheringState === 'complete' && ok())),
    5000,
  ).catch(() => {}); // use what was gathered so far
}

export interface Pairing {
  /** The code to show (QR) to the other device. */
  code: string;
  /** Resolves when the encrypted channel is open. */
  open: Promise<Channel>;
  /** Offerer only: give it the other device's answer code. */
  accept?: (answer: string) => Promise<void>;
  close(): void;
}

/** Time to get the other device's code scanned, and then to connect. */
export const WAIT_FOR_PEER_MS = 5 * 60_000;
export const CONNECT_MS = 30_000;

/**
 * Listen from the moment the channel exists, not from 'open': the other device may send its first
 * message before this side's 'open' event fires, and a message with no listener is lost.
 */
const openOf = (dc: RTCDataChannel): Promise<Channel> => {
  const ch = channelOf(dc);
  return new Promise((ok, no) => {
    if (dc.readyState === 'open') return ok(ch);
    dc.onopen = () => ok(ch);
    dc.onerror = () => no(new PairError('closed'));
  });
};

/**
 * Device A: create the first code. Call `allowLocalAddresses()` first where possible: without a
 * camera permission browsers hide the device's local address behind an mDNS name that many phones
 * and networks can't resolve.
 */
export async function startOffer(): Promise<Pairing> {
  const pc = new RTCPeerConnection({ iceServers: [] });
  const dc = pc.createDataChannel('iron-notes-sync', { ordered: true });
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  // Long enough to get the code scanned and the answer back; once accepted, connecting is quick.
  let accepted: (() => void) | undefined;
  const acceptedP = new Promise<void>((ok) => (accepted = ok));
  const opening = openOf(dc);
  const open = withTimeout(Promise.race([opening, acceptedP.then(() => withTimeout(opening, CONNECT_MS))]), WAIT_FOR_PEER_MS);
  return {
    code: await encodeSignal(pc.localDescription!),
    open,
    accept: async (answer) => {
      await pc.setRemoteDescription(await decodeSignal(answer, 'answer'));
      accepted?.();
    },
    close: () => pc.close(),
  };
}

/** Device B: answer the code scanned from device A. */
export async function answerOffer(offerCode: string): Promise<Pairing> {
  const offer = await decodeSignal(offerCode, 'offer');
  const pc = new RTCPeerConnection({ iceServers: [] });
  // Wrap the channel synchronously as it arrives (see openOf): no message can slip in between.
  const channel = new Promise<Channel>((ok, no) => (pc.ondatachannel = (ev) => openOf(ev.channel).then(ok, no)));
  await pc.setRemoteDescription(offer);
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  return {
    code: await encodeSignal(pc.localDescription!),
    // Device A still has to scan this answer: same allowance as A's.
    open: withTimeout(channel, WAIT_FOR_PEER_MS),
    close: () => pc.close(),
  };
}

/**
 * Ask for the camera once (and release it): with that permission, browsers put the device's real
 * local address in the code instead of an mDNS name. Harmless if refused or unavailable.
 */
export async function allowLocalAddresses(): Promise<void> {
  try {
    const s = await navigator.mediaDevices?.getUserMedia({ video: true });
    s?.getTracks().forEach((tr) => tr.stop());
  } catch {
    // no camera / refused: the code then carries mDNS names, which work on many networks
  }
}

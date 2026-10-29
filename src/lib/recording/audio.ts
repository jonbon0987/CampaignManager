// src/lib/recording/audio.ts
// -----------------------------------------------------------
// Browser audio plumbing for recording at the table: picking a format the
// browser can record, opening the mic, a level meter, and a screen wake lock.
// -----------------------------------------------------------

// Opus at 24 kbps is clear for speech and keeps a 3-hour session around 32 MB.
export const AUDIO_BITS_PER_SECOND = 24_000;

// In preference order. Safari records audio/mp4; Chrome and Firefox record webm.
const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export function pickRecordingMimeType(isSupported: (t: string) => boolean = t => MediaRecorder.isTypeSupported(t)): string {
  return RECORDING_TYPES.find(isSupported) ?? '';
}

/** The bare media type ("audio/webm;codecs=opus" → "audio/webm"), as the storage bucket expects. */
export function baseMimeType(mime: string): string {
  return mime.split(';')[0].trim().toLowerCase();
}

const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
};

export function extensionFor(mime: string): string {
  return EXT_BY_MIME[baseMimeType(mime)] ?? 'audio';
}

const MIME_BY_EXT: Record<string, string> = {
  webm: 'audio/webm', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
  m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg',
  wav: 'audio/wav', flac: 'audio/flac',
};

/**
 * The audio type for an uploaded file. Browsers often label audio files oddly
 * (a .webm as video/webm, an .m4a as nothing at all), so trust the extension
 * first. Returns null for anything the session-audio bucket won't accept.
 */
export function uploadMimeType(file: { name: string; type: string }): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];
  const base = baseMimeType(file.type);
  return EXT_BY_MIME[base] ? base : null;
}

/**
 * Opens the microphone for a room recording. Echo cancellation and noise
 * suppression are off: they're tuned for one person on a call and tend to cut
 * quiet voices across a table. Auto gain stays on to lift far speakers.
 */
export async function openMicrophone(deviceId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: true,
      channelCount: 1,
    },
  });
}

export async function listMicrophones(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === 'audioinput');
}

/** Live input level (0–1) for a meter. Call close() when recording ends. */
export function createLevelMeter(stream: MediaStream): { level: () => number; close: () => void } {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  return {
    level: () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      // RMS of speech sits around 0.02–0.2; scale so normal talking fills the meter.
      return Math.min(1, Math.sqrt(sum / buf.length) * 5);
    },
    close: () => { source.disconnect(); void ctx.close(); },
  };
}

/**
 * Keeps the screen (and so the recording) awake. Browsers drop the lock when
 * the tab is hidden, so it's re-requested whenever the tab becomes visible.
 */
export function holdWakeLock(): () => void {
  type Sentinel = { release: () => Promise<void> };
  const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock;
  if (!wl) return () => {};
  let sentinel: Sentinel | null = null;
  let released = false;
  const acquire = () => {
    if (released || document.visibilityState !== 'visible') return;
    wl.request('screen').then(s => { if (released) void s.release(); else sentinel = s; }).catch(() => {});
  };
  document.addEventListener('visibilitychange', acquire);
  acquire();
  return () => {
    released = true;
    document.removeEventListener('visibilitychange', acquire);
    void sentinel?.release();
  };
}

// bot/src/helper.ts
// -----------------------------------------------------------
// What the helper should do next, from what the app asked for (the control
// row) and where things stand. Pure, so it's tested without Discord.
//
//   * Signed in while the DM wants it, or while any recording wants Discord:
//     a recording can't be left without its audio.
//   * Signed out otherwise, but never mid-capture.
//   * Sitting in the voice channel the DM picked, except while recording,
//     which takes the voice connection for itself.
// -----------------------------------------------------------

export interface VoiceTarget { guildId: string; channelId: string; channelName: string }

export interface Control {
  online: boolean;
  voice: VoiceTarget | null;
  /** When the DM last asked: asking again after a failure means try again now. */
  updatedAt?: string | null;
}

export interface HelperState {
  signedIn: boolean;
  /** Recordings that want Discord and aren't done with it. */
  activeRecordings: number;
  /** Captures running in this process. */
  capturing: number;
  /** The voice channel it's sitting in, if any. */
  seat: VoiceTarget | null;
}

export interface Plan {
  signIn: boolean;
  signOut: boolean;
  /** Where to sit: a channel, null to leave, or undefined to leave things as they are. */
  seat: VoiceTarget | null | undefined;
  detail: string | null;
}

const same = (a: VoiceTarget | null, b: VoiceTarget | null) =>
  a === b || (!!a && !!b && a.guildId === b.guildId && a.channelId === b.channelId);

export function plan(control: Control, s: HelperState): Plan {
  const recording = s.activeRecordings > 0 || s.capturing > 0;
  const wantOnline = control.online || recording;

  if (!s.signedIn) {
    return { signIn: wantOnline, signOut: false, seat: undefined, detail: wantOnline && !control.online ? 'Signing in for a recording.' : null };
  }
  if (!wantOnline) {
    // Leave the voice channel first; signing out ends everything else.
    return { signIn: false, signOut: true, seat: s.seat ? null : undefined, detail: null };
  }
  // Recording owns the voice connection: give up the seat, and come back to it after.
  if (recording) {
    return {
      signIn: false, signOut: false, seat: s.seat ? null : undefined,
      detail: !control.online ? 'Staying signed in until the recording is done.' : null,
    };
  }
  return { signIn: false, signOut: false, seat: same(control.voice, s.seat) ? undefined : control.voice, detail: null };
}

/** The control row as stored, made safe: anything malformed reads as "nothing asked". */
export function readControl(row: { online?: unknown; voice?: unknown; updated_at?: unknown } | null): Control {
  const v = row?.voice as Record<string, unknown> | null | undefined;
  const voice = v && typeof v.guildId === 'string' && typeof v.channelId === 'string'
    ? { guildId: v.guildId, channelId: v.channelId, channelName: typeof v.channelName === 'string' ? v.channelName : 'voice' }
    : null;
  return { online: row?.online === true, voice, updatedAt: typeof row?.updated_at === 'string' ? row.updated_at : null };
}

// Quieter during calls: while a call app (or, if asked, any app) is using the microphone, the
// music goes down to a share of its volume, and back up when the call ends.
//
// - Is there a call? Windows records which apps have the mic open for its privacy settings
//   (the registry's CapabilityAccessManager), read every few seconds while music plays.
// - How the music goes down depends on where it plays: Glowtide's YouTube player and Spotify
//   (through its Web API) have their own volume; an app followed by "Any app" is turned down
//   in the Windows volume mixer (that app only, through Windows' audio session API). When
//   that isn't possible (the music and the call are in the same browser, or the app isn't
//   known) the music pauses and plays again after the call.
// - What was changed is written down first (call-duck.json), so a crash or a quit during a
//   call is put right the next time Glowtide starts.

import { execFile } from 'child_process'
import { readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { callers, exeOf, musicProcesses, parseMicUsers } from '../shared/calls.mjs'
import { appLabel } from '../shared/media.mjs'

const MIC_KEY =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone'
const POLL_MS = 4000
const END_AFTER = 2 // polls without a call before the music comes back (about 8 s)

/** The apps using the mic right now (ids as Windows records them). */
function micUsers() {
  return new Promise((resolve) =>
    execFile(
      'reg',
      ['query', MIC_KEY, '/s', '/v', 'LastUsedTimeStop'],
      { windowsHide: true, timeout: 5000, maxBuffer: 1 << 20 },
      (err, out) => resolve(err ? [] : parseMicUsers(out))
    )
  )
}

// The Windows volume mixer, for one app's audio sessions: Core Audio through a small C#
// class compiled by PowerShell. Duck: every session of these processes on the default output
// goes to `factor` of its own volume; prints [{ pid, volume }] as they were. Restore: puts
// each pid's volume back.
const MIXER = `
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
namespace GlowtideMixer {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
  }
  [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    int GetAudioSessionControl(IntPtr guid, int flags, out IntPtr control);
    int GetSimpleAudioVolume(IntPtr guid, int flags, out IntPtr volume);
    int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
  }
  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    int GetCount(out int count);
    int GetSession(int index, out IAudioSessionControl2 session);
  }
  [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    int GetState(out int state);
    int GetDisplayName(out IntPtr name);
    int SetDisplayName(IntPtr name, IntPtr context);
    int GetIconPath(out IntPtr path);
    int SetIconPath(IntPtr path, IntPtr context);
    int GetGroupingParam(out Guid param);
    int SetGroupingParam(IntPtr param, IntPtr context);
    int RegisterAudioSessionNotification(IntPtr client);
    int UnregisterAudioSessionNotification(IntPtr client);
    int GetSessionIdentifier(out IntPtr id);
    int GetSessionInstanceIdentifier(out IntPtr id);
    int GetProcessId(out uint pid);
  }
  [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume {
    int SetMasterVolume(float level, ref Guid context);
    int GetMasterVolume(out float level);
  }
  public static class Mixer {
    static List<KeyValuePair<uint, ISimpleAudioVolume>> Sessions() {
      var list = new List<KeyValuePair<uint, ISimpleAudioVolume>>();
      var en = (IMMDeviceEnumerator)new MMDeviceEnumerator();
      IMMDevice dev;
      if (en.GetDefaultAudioEndpoint(0, 1, out dev) != 0) return list;
      var iid = typeof(IAudioSessionManager2).GUID;
      object o;
      if (dev.Activate(ref iid, 23, IntPtr.Zero, out o) != 0) return list;
      IAudioSessionEnumerator sessions;
      if (((IAudioSessionManager2)o).GetSessionEnumerator(out sessions) != 0) return list;
      int n;
      sessions.GetCount(out n);
      for (int i = 0; i < n; i++) {
        IAudioSessionControl2 s;
        if (sessions.GetSession(i, out s) != 0) continue;
        uint pid;
        if (s.GetProcessId(out pid) != 0 || pid == 0) continue;
        list.Add(new KeyValuePair<uint, ISimpleAudioVolume>(pid, (ISimpleAudioVolume)s));
      }
      return list;
    }
    static string NameOf(uint pid) {
      try { return Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch { return ""; }
    }
    public static string Duck(string[] names, float factor) {
      var want = new HashSet<string>(names);
      var parts = new List<string>();
      var ctx = Guid.Empty;
      foreach (var kv in Sessions()) {
        if (!want.Contains(NameOf(kv.Key))) continue;
        float v;
        if (kv.Value.GetMasterVolume(out v) != 0) continue;
        kv.Value.SetMasterVolume(v * factor, ref ctx);
        parts.Add("{\\"pid\\":" + kv.Key + ",\\"volume\\":" + v.ToString("0.####", CultureInfo.InvariantCulture) + "}");
      }
      return "[" + string.Join(",", parts) + "]";
    }
    public static string List() {
      var parts = new List<string>();
      foreach (var kv in Sessions()) {
        float v;
        kv.Value.GetMasterVolume(out v);
        parts.Add(NameOf(kv.Key) + "=" + v.ToString("0.##", CultureInfo.InvariantCulture));
      }
      return string.Join(" ", parts);
    }
    public static string Restore(uint[] pids, float[] volumes) {
      var ctx = Guid.Empty;
      int done = 0;
      foreach (var kv in Sessions())
        for (int i = 0; i < pids.Length; i++)
          if (kv.Key == pids[i]) { kv.Value.SetMasterVolume(volumes[i], ref ctx); done++; }
      return done.ToString();
    }
  }
}
`

/** Runs one mixer call; resolves with what it printed, or null. */
function mixer(call) {
  const script = `Add-Type -TypeDefinition @'\n${MIXER}\n'@\n[GlowtideMixer.Mixer]::${call}`
  return new Promise((resolve) =>
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64')
      ],
      { windowsHide: true, timeout: 20000 },
      (err, out) => resolve(err ? null : String(out).trim())
    )
  )
}

const safeName = (n) => /^[\w .-]{1,60}$/.test(n)

/** Turns these processes down to factor of their volume; [{ pid, volume }] as they were. */
async function duckApps(names, factor) {
  const list = names.filter(safeName)
  if (!list.length) return []
  const arr = list.map((n) => `'${n}'`).join(',')
  const out = await mixer(`Duck(@(${arr}), ${Number(factor).toFixed(3)})`)
  try {
    const prev = JSON.parse(out)
    return Array.isArray(prev) ? prev : []
  } catch {
    return []
  }
}

async function restoreApps(prev) {
  const ok = prev.filter((p) => Number.isInteger(p?.pid) && Number.isFinite(p?.volume))
  if (!ok.length) return
  const pids = ok.map((p) => p.pid).join(',')
  const vols = ok.map((p) => Math.min(1, Math.max(0, p.volume)).toFixed(4)).join(',')
  await mixer(`Restore([uint32[]]@(${pids}), [single[]]@(${vols}))`)
}

/**
 * getState: Glowtide's state; settings(): the current settings; control(action, arg): play,
 * pause and volume through Glowtide's own controls.
 */
export function createCallDucker({
  dir,
  getState,
  settings,
  control,
  log = () => {},
  readMic = micUsers, // (tests: who is using the mic)
  timer: ticking = true
}) {
  const file = join(dir, 'call-duck.json')
  let ducked = null // { method, ... } while a call has the music turned down
  let quietPolls = 0
  let busy = false
  let timer = null

  const save = () => {
    try {
      if (ducked) writeFileSync(file, JSON.stringify(ducked))
      else rmSync(file, { force: true })
    } catch {
      /* best effort */
    }
  }

  async function duck(users) {
    const st = getState()
    // 'none': in a call, with nothing Glowtide could turn down. It holds until the call ends,
    // so a failed attempt isn't retried (a PowerShell start) every few seconds.
    ducked = { method: 'none', source: st.source }
    const level = Math.min(0.9, Math.max(0, (settings().calls?.level ?? 30) / 100))
    const playing = !!st.playback?.isPlaying
    if (st.source === 'youtube') {
      ducked = { method: 'youtube', source: 'youtube' }
      save()
      await control('volume', Math.round(100 * level))
    } else if (st.source === 'spotify') {
      const prev = st.playback?.volume
      if (Number.isFinite(prev)) {
        ducked = { method: 'spotify', source: 'spotify', prev }
        save()
        const r = await control('volume', Math.round(prev * level))
        if (r?.error) ducked = { method: 'none' }
      }
    } else if (st.source === 'system') {
      const names = musicProcesses(appLabel(st.systemApp?.id || ''), st.systemApp?.id || '')
      const calling = new Set(users.map(exeOf))
      if (names.length && !names.some((n) => calling.has(n))) {
        ducked = { method: 'mixer', names, prev: [] }
        save()
        ducked.prev = await duckApps(names, level)
        if (!ducked.prev.length) ducked = { method: 'none' } // nothing of it was playing sound
      } else if (playing) {
        // the call is in the app that plays the music (a browser): pause rather than mute it
        ducked = { method: 'pause', source: 'system' }
        save()
        await control('pause')
      }
    }
    save()
    log(`call: music down (${ducked.method})`)
  }

  async function restore(from = ducked) {
    if (!from) return
    ducked = null
    // Glowtide's controls act on the source in use now: only put back what that source took
    const same = from.source === getState().source
    if (from.method === 'youtube' && same) await control('volume', 100)
    else if (from.method === 'spotify' && same && Number.isFinite(from.prev))
      await control('volume', from.prev)
    else if (from.method === 'mixer') await restoreApps(from.prev || [])
    else if (from.method === 'pause' && same) await control('play')
    save()
    log(`call: music back (${from.method})`)
  }

  async function poll() {
    if (busy) return
    const on = !!settings().calls?.enabled
    const st = getState()
    if (!on) {
      if (ducked) {
        busy = true
        await restore().finally(() => (busy = false))
      }
      return
    }
    // only look while music plays, or while it's turned down for a call
    if (!ducked && !st.playback?.isPlaying) return
    if (st.source === 'demo') return
    busy = true
    try {
      const users = callers(await readMic(), settings().calls?.mode === 'any' ? 'any' : 'calls')
      if (users.length) {
        quietPolls = 0
        if (!ducked) await duck(users)
      } else if (ducked && ++quietPolls >= END_AFTER) {
        quietPolls = 0
        await restore()
      }
    } finally {
      busy = false
    }
  }

  // What a crash or a quit during a call left turned down is put back by the loop below once
  // no call is on (and the source has started). Music paused for a call isn't started again
  // on its own after a restart.
  try {
    const left = JSON.parse(readFileSync(file, 'utf8'))
    if (['youtube', 'spotify', 'mixer'].includes(left?.method)) ducked = left
    else rmSync(file, { force: true })
  } catch {
    /* nothing was left */
  }

  if (ticking) {
    timer = setInterval(poll, POLL_MS)
    timer.unref?.()
  }

  return {
    poll,
    /** On quit: turn the music back up (the file covers it if this doesn't finish). */
    stop() {
      clearInterval(timer)
      if (ducked && !['pause', 'none'].includes(ducked.method)) restore()
    },
    get ducked() {
      return ducked
    }
  }
}

// for tests
export { duckApps, restoreApps, micUsers }

# Glowtide full-screen helper: reports when another app fills a display (a game, a full-screen
# video, a presentation), so the edge glow and lyrics overlay can step aside.
#
# Usage: fullscreen.ps1 <glowtide pid>. Glowtide's own windows never count.
# Every second it looks at the window in front. It is full screen when it covers its whole
# display without being an ordinary maximised window, or when Windows itself reports a
# full-screen Direct3D app or presentation mode. Output, as JSON lines, only on a change:
#   {"full":false}
#   {"full":true,"x":0,"y":0,"w":2560,"h":1440}   (the display, in physical pixels)
# It exits when Glowtide closes its input.

param([int]$GlowtidePid = 0)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class GlowtideFull {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO {
    public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags;
  }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);

  // Physical pixels throughout, whatever the display scaling.
  public static void Init() { try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch {} }

  // The desktop and the taskbar cover a display too, and are never "full screen".
  static readonly string[] Shell = { "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd" };

  /** "" when nothing is full screen, else "x y w h" of the display it fills. */
  public static string Check(uint glowtidePid) {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero || !IsWindowVisible(h)) return "";
    uint pid; GetWindowThreadProcessId(h, out pid);
    if (pid == glowtidePid) return "";
    var cls = new StringBuilder(64); GetClassName(h, cls, 64);
    if (Array.IndexOf(Shell, cls.ToString()) >= 0) return "";
    var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(mi);
    if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return "";
    RECT m = mi.rcMonitor, w;
    string display = m.L + " " + m.T + " " + (m.R - m.L) + " " + (m.B - m.T);
    int state = 0;
    // 3: a Direct3D app in exclusive full screen; 4: presentation mode.
    if (SHQueryUserNotificationState(out state) == 0 && (state == 3 || state == 4)) return display;
    if (!GetWindowRect(h, out w) || IsZoomed(h)) return "";
    return (w.L <= m.L && w.T <= m.T && w.R >= m.R && w.B >= m.B) ? display : "";
  }
}
'@
[GlowtideFull]::Init()

# [Console]::In is a synchronised reader whose ReadLineAsync blocks; a plain StreamReader
# over the raw stdin stream reads on the thread pool, so the loop keeps running.
$stdin = New-Object System.IO.StreamReader ([Console]::OpenStandardInput())
$readLine = $stdin.ReadLineAsync()
$last = $null
while ($true) {
  if ($readLine.IsCompleted) {
    # Glowtide closed its end (or quit): stop. Anything it writes is ignored.
    if ($null -eq $readLine.Result) { break }
    $readLine = $stdin.ReadLineAsync()
  }
  try { $now = [GlowtideFull]::Check([uint32]$GlowtidePid) } catch { $now = '' }
  if ($now -ne $last) {
    if ($now -eq '') { [Console]::Out.WriteLine('{"full":false}') }
    else {
      $p = $now.Split(' ')
      [Console]::Out.WriteLine('{"full":true,"x":' + $p[0] + ',"y":' + $p[1] + ',"w":' + $p[2] + ',"h":' + $p[3] + '}')
    }
    [Console]::Out.Flush()
    $last = $now
  }
  Start-Sleep -Milliseconds 1000
}

# Glowtide wallpaper helper: puts a window on the desktop wallpaper, behind the icons and
# every application window, the way wallpaper apps do.
#
# Explorer draws the wallpaper into a "WorkerW" window under the desktop icons. Asking
# Progman for message 0x052C makes it create that WorkerW; we then re-parent our window
# into it. On older Windows the WorkerW is a top-level sibling of the icons' host; on
# Windows 11 24H2 and later it is a child of Progman.
#
# Commands on stdin, one per line:  attach <hwnd> <x> <y> <w> <h>   detach <hwnd>
# Replies on stdout as JSON lines.

$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class GlowtideWall {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string c, string w);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr p, IntPtr a, string c, string w);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint f, uint t, out IntPtr r);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr SetParent(IntPtr c, IntPtr p);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
  [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] public static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);

  public static IntPtr WorkerW() {
    IntPtr progman = FindWindow("Progman", null);
    IntPtr r;
    SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(0x1), 0, 1000, out r);
    SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, 0, 1000, out r);
    IntPtr child = FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);   // 24H2+
    if (child != IntPtr.Zero) return child;
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      if (FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
        found = FindWindowEx(IntPtr.Zero, h, "WorkerW", null);
      return true;
    }, IntPtr.Zero);
    return found != IntPtr.Zero ? found : progman;
  }

  // Coordinates inside the WorkerW are relative to the top-left of the virtual screen.
  public static string Attach(IntPtr win, int x, int y, int w, int h) {
    IntPtr worker = WorkerW();
    if (worker == IntPtr.Zero) return "no-workerw";
    const int GWL_STYLE = -16; const long WS_CHILD = 0x40000000L, WS_POPUP = 0x80000000L;
    long style = GetWindowLongPtr(win, GWL_STYLE).ToInt64();
    SetWindowLongPtr(win, GWL_STYLE, new IntPtr((style | WS_CHILD) & ~WS_POPUP));
    SetParent(win, worker);
    int vx = GetSystemMetrics(76), vy = GetSystemMetrics(77);   // SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN
    SetWindowPos(win, IntPtr.Zero, x - vx, y - vy, w, h, 0x0010 | 0x0040);  // NOACTIVATE | SHOWWINDOW
    return GetParent(win) == worker ? "attached" : "failed";
  }

  public static string Detach(IntPtr win) {
    const int GWL_STYLE = -16; const long WS_CHILD = 0x40000000L, WS_POPUP = 0x80000000L;
    SetParent(win, IntPtr.Zero);
    long style = GetWindowLongPtr(win, GWL_STYLE).ToInt64();
    SetWindowLongPtr(win, GWL_STYLE, new IntPtr((style & ~WS_CHILD) | WS_POPUP));
    return "detached";
  }
}
'@

function Emit($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
$stdin = New-Object System.IO.StreamReader ([Console]::OpenStandardInput())
Emit @{ type = 'ready' }
while ($true) {
  $line = $stdin.ReadLine()
  if ($null -eq $line) { exit 0 }
  $p = $line.Trim().Split(' ')
  try {
    if ($p[0] -eq 'attach') {
      $r = [GlowtideWall]::Attach([IntPtr][long]$p[1], [int]$p[2], [int]$p[3], [int]$p[4], [int]$p[5])
      Emit @{ type = 'attach'; hwnd = $p[1]; result = $r }
    }
    elseif ($p[0] -eq 'check') {
      # Still inside the wallpaper's window? (Explorer restarting replaces it.)
      $ok = [GlowtideWall]::GetParent([IntPtr][long]$p[1]) -eq [GlowtideWall]::WorkerW()
      Emit @{ type = 'check'; hwnd = $p[1]; result = $(if ($ok) { 'attached' } else { 'loose' }) }
    }
    elseif ($p[0] -eq 'detach') {
      Emit @{ type = 'detach'; hwnd = $p[1]; result = [GlowtideWall]::Detach([IntPtr][long]$p[1]) }
    }
  }
  catch { Emit @{ type = 'error'; message = "$($_.Exception.Message)" } }
}

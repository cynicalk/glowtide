# Glowtide media-session helper.
#
# Reads Windows' System Media Transport Controls (the "now playing" info behind the
# volume flyout and media keys) and relays it to Glowtide as JSON lines on stdout.
# Reads one command per line on stdin. Exits when stdin closes (Glowtide quit).
#
# Runs in Windows PowerShell 5.1, which can call the WinRT media API directly,
# so Glowtide needs no native module for this.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

function Await($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  if (-not $task.Wait(5000)) { throw 'Timed out waiting for the media session' }
  $task.Result
}

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Media.MediaPlaybackAutoRepeatMode, Windows.Media, ContentType = WindowsRuntime]

$MgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$PropsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$StreamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType]
$null = [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$AsStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethod(
  'AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))

function Emit($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
}

$mgr = Await ($MgrType::RequestAsync()) $MgrType
$selected = 'auto'

function Pick-Session {
  $all = @($mgr.GetSessions())
  if ($selected -ne 'auto') {
    foreach ($s in $all) { if ($s.SourceAppUserModelId -eq $selected) { return $s } }
  }
  $current = $mgr.GetCurrentSession()
  if ($current) { return $current }
  foreach ($s in $all) { if ("$($s.GetPlaybackInfo().PlaybackStatus)" -eq 'Playing') { return $s } }
  if ($all.Count) { return $all[0] }
  return $null
}

function Thumb-DataUrl($props) {
  if (-not $props.Thumbnail) { return $null }
  $ras = Await ($props.Thumbnail.OpenReadAsync()) $StreamType
  # The stream arrives as a bare COM object PowerShell can't match to an overload; call by reflection.
  $stream = $AsStreamForRead.Invoke($null, @($ras))
  $mem = New-Object System.IO.MemoryStream
  $stream.CopyTo($mem)
  $stream.Dispose()
  if ($mem.Length -eq 0) { return $null }
  $bytes = $mem.ToArray()
  # Apps rarely report a content type: sniff it.
  $ct = 'image/jpeg'
  if ($bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50) { $ct = 'image/png' }
  elseif ($bytes[0] -eq 0x52 -and $bytes[1] -eq 0x49) { $ct = 'image/webp' }
  elseif ($bytes[0] -eq 0x47 -and $bytes[1] -eq 0x49) { $ct = 'image/gif' }
  return "data:$ct;base64," + [Convert]::ToBase64String($bytes)
}

function Handle($line) {
  $parts = $line.Trim().Split(' ', 2)
  $cmd = $parts[0]
  $arg = ''
  if ($parts.Count -gt 1) { $arg = $parts[1] }
  if ($cmd -eq 'select') {
    $script:selected = $(if ($arg) { $arg } else { 'auto' })
    $script:lastKey = ''
    return
  }
  $s = Pick-Session
  if (-not $s) { Emit @{ type = 'ack'; cmd = $cmd; ok = $false }; return }
  $ok = $false
  switch ($cmd) {
    'play' { $ok = Await ($s.TryPlayAsync()) ([bool]) }
    'pause' { $ok = Await ($s.TryPauseAsync()) ([bool]) }
    'next' { $ok = Await ($s.TrySkipNextAsync()) ([bool]) }
    'previous' { $ok = Await ($s.TrySkipPreviousAsync()) ([bool]) }
    'seek' { $ok = Await ($s.TryChangePlaybackPositionAsync([int64]$arg * 10000)) ([bool]) }
    'shuffle' { $ok = Await ($s.TryChangeShuffleActiveAsync($arg -eq 'true')) ([bool]) }
    'repeat' {
      $mode = @{ off = 'None'; track = 'Track'; context = 'List' }[$arg]
      if ($mode) {
        $ok = Await ($s.TryChangeAutoRepeatModeAsync([Windows.Media.MediaPlaybackAutoRepeatMode]::$mode)) ([bool])
      }
    }
  }
  Emit @{ type = 'ack'; cmd = $cmd; ok = [bool]$ok }
}

$lastKey = ''
$lastApps = ''
$thumbTries = 0
# [Console]::In is a synchronised reader whose ReadLineAsync blocks; a plain StreamReader
# over the raw stdin stream reads on the thread pool, so the loop keeps running.
$stdin = New-Object System.IO.StreamReader ([Console]::OpenStandardInput()), (New-Object System.Text.UTF8Encoding $false)
$read = $stdin.ReadLineAsync()
Emit @{ type = 'ready' }

while ($true) {
  try {
    while ($read.IsCompleted) {
      $line = $read.Result
      if ($null -eq $line) { exit 0 }
      if ($line.Trim()) { Handle $line }
      $read = $stdin.ReadLineAsync()
    }

    $apps = @($mgr.GetSessions() | ForEach-Object { $_.SourceAppUserModelId })
    $appsKey = $apps -join '|'
    if ($appsKey -ne $lastApps) {
      $lastApps = $appsKey
      Emit @{ type = 'sessions'; apps = $apps }
    }

    $s = Pick-Session
    if (-not $s) {
      if ($lastKey -ne '<none>') { $lastKey = '<none>'; Emit @{ type = 'state'; app = $null } }
    }
    else {
      $props = Await ($s.TryGetMediaPropertiesAsync()) $PropsType
      $tl = $s.GetTimelineProperties()
      $pb = $s.GetPlaybackInfo()
      $status = "$($pb.PlaybackStatus)"
      $playing = $status -eq 'Playing'
      $pos = $tl.Position.TotalMilliseconds
      # Apps update the timeline on events, not continuously: carry it forward from when it was stamped.
      if ($playing -and $tl.LastUpdatedTime.Year -gt 2000) {
        $pos += ([DateTimeOffset]::Now - $tl.LastUpdatedTime).TotalMilliseconds
      }
      $dur = ($tl.EndTime - $tl.StartTime).TotalMilliseconds
      if ($dur -gt 0 -and $pos -gt $dur) { $pos = $dur }
      if ($pos -lt 0) { $pos = 0 }
      $c = $pb.Controls
      $app = $s.SourceAppUserModelId
      $key = "$app|$($props.Artist)|$($props.Title)|$($props.AlbumTitle)"
      if ($key -ne $lastKey) { $lastKey = $key; $thumbTries = 0 }

      Emit @{
        type        = 'state'
        app         = $app
        key         = $key
        title       = $props.Title
        artist      = $props.Artist
        albumArtist = $props.AlbumArtist
        album       = $props.AlbumTitle
        durationMs  = [int64]$dur
        positionMs  = [int64]$pos
        playing     = $playing
        status      = $status
        shuffle     = $pb.IsShuffleActive
        repeat      = "$($pb.AutoRepeatMode)"
        can         = @{
          play     = $c.IsPlayEnabled
          pause    = $c.IsPauseEnabled
          next     = $c.IsNextEnabled
          previous = $c.IsPreviousEnabled
          seek     = $c.IsPlaybackPositionEnabled
          shuffle  = $c.IsShuffleEnabled
          repeat   = $c.IsRepeatEnabled
        }
      }

      # Artwork often lands a moment after the title, so try a few times per track.
      if ($thumbTries -lt 6) {
        $thumbTries++
        $data = $null
        try { $data = Thumb-DataUrl $props } catch { $data = $null }
        if ($data) {
          $thumbTries = 99
          Emit @{ type = 'thumb'; key = $key; dataUrl = $data }
        }
      }
    }
  }
  catch {
    Emit @{ type = 'error'; message = "$($_.Exception.Message)" }
    Start-Sleep -Milliseconds 1500
  }
  Start-Sleep -Milliseconds 400
}

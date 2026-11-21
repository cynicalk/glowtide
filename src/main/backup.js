// Back up and move your setup: Settings → App → Backup. Export writes one .json file you
// choose where to keep; import reads one, says what's in it and asks before changing
// anything. The checking of a backup's contents is in shared/backup.mjs.

import { app, dialog } from 'electron'
import { readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { makeBackup, mergePlays, readBackup } from '../shared/backup.mjs'
import { migrateSettings } from '../shared/migrate.mjs'
import * as mine from './myLyrics'
import * as choices from './lyricChoice'
import * as offsets from './offsets'
import { allFavs, mergeFavs } from './favLines'

const MAX_FILE = 60e6 // years of history is a few MB; anything this big isn't a backup

// What stays as it is on this PC when a backup comes in: the music source (picked on each
// PC, as it may need signing in there), the app it follows, and the phone remote (a backup
// never opens a network port; you turn the remote on yourself).
const KEEP_HERE = ['source', 'systemApp', 'remote']

const today = () => new Date().toISOString().slice(0, 10)

/** Saves a backup where you choose. { path } or null when cancelled. */
export async function exportBackup({ win, settings, history }) {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Back up Glowtide',
    defaultPath: join(app.getPath('documents'), `Glowtide backup ${today()}.json`),
    filters: [{ name: 'Glowtide backup', extensions: ['json'] }]
  })
  if (canceled || !filePath) return null
  const b = makeBackup({
    version: app.getVersion(),
    settings,
    myLyrics: mine.allSaved(),
    choices: choices.allSaved(),
    offsets: offsets.allSaved(),
    plays: history ? history.saved() : [],
    favs: allFavs()
  })
  writeFileSync(filePath, JSON.stringify(b))
  return { path: filePath }
}

/**
 * Brings in a backup you pick, after asking. apply(settingsPatch) changes the settings the
 * usual way (only known keys, right types). { ok, counts } / { error } / null (cancelled).
 */
export async function importBackup({ win, history, apply, after }) {
  const r = await dialog.showOpenDialog(win, {
    title: 'Bring in a Glowtide backup',
    properties: ['openFile'],
    filters: [{ name: 'Glowtide backup', extensions: ['json'] }]
  })
  const path = !r.canceled && r.filePaths[0]
  if (!path) return null
  let raw
  try {
    if (statSync(path).size > MAX_FILE) return { error: 'That file is too big to be a backup.' }
    raw = readFileSync(path, 'utf8')
  } catch {
    return { error: 'Couldn’t read that file.' }
  }
  const b = readBackup(raw)
  if (b.error) return { error: b.error }

  const when = b.created ? new Date(b.created).toLocaleDateString() : 'an earlier date'
  const what = [
    'your settings',
    `${b.counts.lyrics} timed ${b.counts.lyrics === 1 ? 'song' : 'songs'}`,
    `${b.counts.plays} ${b.counts.plays === 1 ? 'play' : 'plays'} of history`
  ].join(', ')
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Bring it in', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Bring in this backup?',
    message: `Bring in the backup from ${when}?`,
    detail: `It has ${what}. Your settings here are replaced; timed lyrics and history are added to what's here. The music source you chose on this PC stays.`
  })
  if (response !== 0) return null

  const s = migrateSettings({ ...b.settings })
  for (const k of KEEP_HERE) delete s[k]
  apply(s)
  mine.mergeSaved(b.myLyrics)
  choices.mergeSaved(b.choices)
  offsets.mergeSaved(b.offsets)
  mergeFavs(b.favs)
  if (history && b.plays.length) history.replace(mergePlays(history.saved(), b.plays))
  after?.()
  return { ok: true, counts: b.counts }
}

// The Windows installer, signed when a code-signing certificate is set up, unsigned
// otherwise (as every release up to 1.0.7 was).
//
//   GLOWTIDE_SIGN_SHA1   the certificate's thumbprint, for a certificate in the Windows
//                    certificate store: a USB token, or Certum's SimplySign app, which shows
//                    its cloud key there as a smart card. This is the usual case since 2023,
//                    when certificate authorities stopped issuing keys as files.
//   CSC_LINK + CSC_KEY_PASSWORD   a .pfx file and its password (electron-builder's own).
//
// Signing on, the build fails unless the installer comes out with a signature. The
// publisher's name goes into app-update.yml, and from then on installed copies accept an
// update only if it is signed by that same publisher, so every later release must be
// signed with a certificate in the same name.
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const sha1 = (process.env.GLOWTIDE_SIGN_SHA1 || '').replace(/[^0-9a-f]/gi, '')
const signing = !!sha1 || !!process.env.CSC_LINK
const args = ['electron-builder', '--win']
if (sha1) args.push(`-c.win.signtoolOptions.certificateSha1=${sha1}`)
// GLOWTIDE_BUILD_OUT: build somewhere other than dist (a test build beside a released one)
const out = process.env.GLOWTIDE_BUILD_OUT || 'dist'
if (out !== 'dist') args.push(`-c.directories.output="${out}"`)

console.log(
  signing ? 'Signing the installer.' : 'No certificate set up: the installer is unsigned.'
)
const run = (cmd, a) => spawnSync(cmd, a, { stdio: 'inherit', shell: true }).status
if (run('npx', args) !== 0) process.exit(1)

if (signing) {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
  const exe = join(out, `Glowtide-${version}-setup.exe`)
  if (!readdirSync(out).includes(`Glowtide-${version}-setup.exe`)) {
    console.error(`No ${exe}`)
    process.exit(1)
  }
  const ps = `$s = Get-AuthenticodeSignature '${exe}'; if (-not $s.SignerCertificate) { exit 1 }; '{0} · {1}' -f $s.SignerCertificate.Subject, $s.Status`
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' })
  if (r.status !== 0) {
    console.error(`${exe} has no signature`)
    process.exit(1)
  }
  console.log(`Signed: ${r.stdout.trim()}`)
}

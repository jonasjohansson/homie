// sign.mjs <Homie.app> — Developer ID signature with Homie's entitlements, then notarize and
// staple when the "homie-notary" keychain profile exists. Forge's own osxSign hook silently
// skipped the app on 2026-10-24, so release.sh signs explicitly here.
import { signAsync } from '@electron/osx-sign';
import { notarize } from '@electron/notarize';
import { execFileSync } from 'node:child_process';

const app = process.argv[2];
if (!app) { console.error('usage: sign.mjs <app>'); process.exit(2); }
// Apple's timestamp server drops a request now and then ("A timestamp was expected but was
// not found"), which fails the whole pass; three attempts cover it.
for (let attempt = 1; ; attempt++) {
  try { await signAsync({ app, identity: 'Developer ID Application: JONAS JOHANSSON (4C8U4BC896)', optionsForFile: () => ({ entitlements: 'build/entitlements.plist' }) }); break; }
  catch (e) { if (attempt >= 3) throw e; console.log(`sign attempt ${attempt} failed: ${String(e.message).split('\n').pop()}; retrying`); }
}
execFileSync('codesign', ['--verify', '--deep', '--strict', app]);
console.log('signed  ', app);

let hasProfile = false;
try { execFileSync('xcrun', ['notarytool', 'history', '--keychain-profile', 'homie-notary'], { stdio: 'ignore' }); hasProfile = true; } catch {}
if (hasProfile) {
  await notarize({ appPath: app, keychainProfile: 'homie-notary' });   // uploads, waits, staples
  console.log('notarized', app);
} else {
  console.log('note     no homie-notary keychain profile: not notarized');
}

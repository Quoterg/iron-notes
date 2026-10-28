// Writes public/.well-known/assetlinks.json from android/twa-manifest.json: the statement that lets the
// Android app (a Trusted Web Activity) open iron-notes.pages.dev full screen, without the browser bar.
// Run after adding a signing key's SHA-256 fingerprint to the manifest (docs/ANDROID.md).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const twa = JSON.parse(readFileSync(new URL('../android/twa-manifest.json', import.meta.url), 'utf8'));
const fingerprints = (twa.fingerprints ?? []).map((f) => f.value);
if (!fingerprints.length) {
  console.error('No fingerprints in android/twa-manifest.json yet: add the upload (and Play app-signing) key first.');
  process.exit(1);
}
const statement = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: twa.packageId, sha256_cert_fingerprints: fingerprints },
  },
];
mkdirSync(new URL('../public/.well-known/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/.well-known/assetlinks.json', import.meta.url), JSON.stringify(statement, null, 2) + '\n');
console.log(`public/.well-known/assetlinks.json: ${twa.packageId}, ${fingerprints.length} fingerprint(s)`);

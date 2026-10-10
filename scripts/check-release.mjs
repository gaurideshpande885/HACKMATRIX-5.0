import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const release = JSON.parse(read('release.json'));
const packageJson = JSON.parse(read('package.json'));
const packageLock = JSON.parse(read('package-lock.json'));
const gradle = read('app/build.gradle');
const html = read('app/src/main/assets/index.html');
const activity = read('app/src/main/java/com/ctrlaltelite/fin/MainActivity.java');
const bridge = read('app/src/main/java/com/ctrlaltelite/fin/FinDatabaseBridge.java');

if (!/^\d+\.\d+\.\d+$/.test(release.version) || !Number.isInteger(release.versionCode) || release.versionCode < 1) {
  throw new Error('release.json must contain a semantic version and positive Android version code.');
}
if (packageJson.version !== release.version) throw new Error(`package.json must be ${release.version}`);
if (packageLock.version !== release.version || packageLock.packages?.['']?.version !== release.version) {
  throw new Error(`package-lock.json must be ${release.version}`);
}
if (!gradle.includes("new JsonSlurper().parse(rootProject.file('release.json'))") ||
    !gradle.includes('versionCode releaseMetadata.versionCode') ||
    !gradle.includes('versionName releaseMetadata.version.toString()')) {
  throw new Error('Android build must consume the shared release metadata.');
}
for (const marker of [
  `meta name="fin-release" content="${release.version}"`,
  'id="releaseVersion"',
  'id="footerRelease"',
  'showReleaseInfo()',
  'Plan the next six months',
  'src="financial-action-planner.js"',
  'src="forecast-reliability.js"',
]) {
  if (!html.includes(marker)) throw new Error(`Visible release marker is missing: ${marker}`);
}
if (!activity.includes('index.html?release=" + BuildConfig.VERSION_NAME') ||
    !activity.includes('FINCopilot/" + BuildConfig.VERSION_NAME') ||
    !activity.includes('WebSettings.LOAD_NO_CACHE')) {
  throw new Error('Android WebView must use the generated version and cache-safe assets.');
}
if (!bridge.includes('BuildConfig.VERSION_NAME') || !bridge.includes('BuildConfig.VERSION_CODE')) {
  throw new Error('Native runtime config must expose the installed version and build number.');
}

console.log(`Validated FIN ${release.version} build ${release.versionCode}: shared metadata, visible release UI, and cache-safe Android identity.`);

import fs from 'node:fs';

const nextVersion = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(nextVersion || '')) {
  throw new Error('Usage: npm run version:bump -- <major.minor.patch>');
}

const rootUrl = new URL('../', import.meta.url);
const pathUrl = path => new URL(path, rootUrl);
const read = path => fs.readFileSync(pathUrl(path), 'utf8');
const write = (path, value) => fs.writeFileSync(pathUrl(path), value);
const release = JSON.parse(read('release.json'));
if (release.version === nextVersion) throw new Error(`FIN is already version ${nextVersion}.`);

release.version = nextVersion;
release.versionCode += 1;
release.releasedAt = new Date().toISOString().slice(0, 10);
write('release.json', `${JSON.stringify(release, null, 2)}\n`);

for (const path of ['package.json', 'package-lock.json']) {
  const json = JSON.parse(read(path));
  json.version = nextVersion;
  if (path === 'package-lock.json' && json.packages?.['']) json.packages[''].version = nextVersion;
  write(path, `${JSON.stringify(json, null, 2)}\n`);
}

let html = read('app/src/main/assets/index.html');
html = html.replace(/(<meta name="fin-release" content=")[^"]+("\s*>)/, `$1${nextVersion}$2`);
html = html.replace(/(<span class="release-pill" id="releaseVersion">)[^<]+(<\/span>)/, `$1${nextVersion}$2`);
html = html.replace(/(<span id="footerRelease">)FIN [^<]+(<\/span>)/, `$1FIN ${nextVersion} · build ${release.versionCode}$2`);
write('app/src/main/assets/index.html', html);

let readme = read('README.md');
readme = readme.replace(/Version-\d+\.\d+\.\d+/g, `Version-${nextVersion}`)
  .replace(/version-\d+\.\d+\.\d+-6D5DFC/g, `version-${nextVersion}-6D5DFC`);
write('README.md', readme);

console.log(`Bumped FIN to ${nextVersion} (Android versionCode ${release.versionCode}). Run npm run check before building.`);

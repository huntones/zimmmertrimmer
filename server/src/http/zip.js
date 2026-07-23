// Streaming ZIP of a delivery's files. Archiver pulls each object as a
// stream and pipes straight to the HTTP response — no file is ever fully
// buffered in memory and no temp .zip is written to disk. Folder
// structure is preserved via each file's computed path.
import archiver from 'archiver';

// files: [{ storageKey, name, path }]  (path = 'Folder/Sub' or '')
export async function streamZip({ res, files, storage, zipName }) {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition',
    `attachment; filename="${(zipName || 'download').replace(/"/g, '')}.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  const done = new Promise((resolve, reject) => {
    archive.on('error', reject);
    archive.on('end', resolve);
    res.on('close', resolve);
  });
  archive.pipe(res);

  const used = new Set();
  for (const f of files) {
    let entry = (f.path ? f.path.replace(/\/+$/, '') + '/' : '') + f.name;
    // de-dupe colliding entry names
    let n = entry, i = 1;
    while (used.has(n)) {
      const dot = f.name.lastIndexOf('.');
      const base = dot > 0 ? f.name.slice(0, dot) : f.name;
      const ext = dot > 0 ? f.name.slice(dot) : '';
      n = (f.path ? f.path.replace(/\/+$/, '') + '/' : '') + `${base} (${i++})${ext}`;
    }
    used.add(n);
    const stream = await Promise.resolve(storage.getStream(f.storageKey));
    archive.append(stream, { name: n });
  }
  await archive.finalize();
  await done;
}

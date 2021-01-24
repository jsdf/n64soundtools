#!/usr/bin/env node
const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const AIFF = require('./aiff');
const arg = require('arg');

const args = arg({
  // Types
  '--verbose': Boolean,
  '--bin': String, // where to find vadpcm_dec
  '--help': Boolean,

  // Aliases
  '-v': '--verbose',
  '-h': '--help',
});

if (args['--help']) {
  console.log(`vadpcmdecode [--bin vadpcm_dec] files to decode`);
  process.exit(0);
}

const vadpcmDecCmd = args['--cmd'] || 'vadpcm_dec';

const files = args._;
if (!files.length) throw new Error(`missing argument`);

async function asyncPool(poolLimit, array, iteratorFn) {
  const ret = [];
  const executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item, array));
    ret.push(p);

    if (poolLimit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

function awaitAll(_, items, iteratorFn) {
  return Promise.all(items.map(iteratorFn));
}

async function run() {
  await awaitAll(10, files, async (file) => {
    const outName = file.replace(/\.aifc$/, '.aiff');
    try {
      const decoded = await exec(`${vadpcmDecCmd} "${file}"`, {
        encoding: 'buffer',
      });

      const aiff = AIFF.serialize({
        soundData: decoded.stdout,
        numChannels: 1,
        sampleSize: 16,
        sampleRate: 22050,
      });
      await fs.promises.writeFile(outName, aiff);
      if (args['--verbose']) {
        console.log(file, 'converted');
      }
    } catch (err) {
      if (args['--verbose']) {
        console.error(file, err, err.stderr && err.stderr.toString('utf8'));
      } else {
        console.error(file, err.message.trim());
      }
      try {
        const fileContents = await fs.promises.readFile(file);
        const parsed = AIFF.parse(fileContents); // this will throw if it's not an aiff
        if (parsed.form === 'AIFF') {
          console.log(file, 'is an uncompressed aiff, just copying');
        } else {
          console.log(
            file,
            `not a suitable aiff file`,
            parsed.form,
            parsed.compressionName
          );
          throw new Error(`not a suitable aiff file`);
        }
        await fs.promises.writeFile(outName, fileContents);
      } catch {
        console.error(file, `doesn't seem to be a suitable aiff, skipping`);
      }
    }
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

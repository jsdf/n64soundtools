const fs = require('fs');
const path = require('path');
const AIFF = require('./aiff');
const soundtools = require('./soundtools');

const dir = '../ultra/usr/lib/PR/sounds/';
const files = fs
  .readdirSync(dir)
  .map((file) => path.resolve(dir, file))
  .filter((f) => f.endsWith('.aifc'));

files.forEach((filepath) => {
  const aiffFile = fs.readFileSync(filepath);
  const valid = !soundtools.isInvalidAIFFFromN64SDK(aiffFile);
  if (!valid) {
    soundtools.fixInvalidAIFFFromN64SDK(aiffFile);
  }
  let parsed = false;
  let error;
  try {
    AIFF.parse(aiffFile);
    parsed = true;
  } catch (err) {
    error = err;
  }

  if (!parsed) {
    console.log(filepath, {valid, parsed, error});
  }
});

#!/usr/bin/env node

// eg. bankdec.js ultra/usr/lib/PR/soundbanks/GenMidiRaw.ctl -o genmidi

const fs = require('fs');
const arg = require('arg');
const parser = require('./instparser');
const {bankToSource} = require('./soundtools');

const args = arg({
  // Types
  '--help': Boolean,
  '--out': String, // --name <string> or --name=<string>
  '--gm': Boolean,

  // Aliases
  '-o': '--out',
});

const sourceFile = args._[0];

if (!sourceFile) {
  throw new Error('no input file specified');
}

bankToSource(sourceFile, args['--out'] || 'tst', args['--gm']);

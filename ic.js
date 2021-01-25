#!/usr/bin/env node

// test with:
// node_modules/.bin/pegjs instparser.pegjs && node instparser.js ./test/test.inst
// or ./ic.js test/test.inst -o test/test

const fs = require('fs');
const arg = require('arg');
const {sourceToBank} = require('./soundtools');
const {parseWithNiceErrors} = require('./instparserapi');

const args = arg({
  // Types
  '--help': Boolean,
  '--out': String, // --name <string> or --name=<string>

  // Aliases
  '-o': '--out',
  '-h': '--help',
});

if (args['--help']) {
  console.log(`ic -o <output file prefix> <source file>`);
  process.exit(0);
}

const sourceFile = args._[0];

if (!sourceFile) {
  throw new Error('no input file specified');
}

const contents = fs.readFileSync(sourceFile, 'utf8');

const parsed = parseWithNiceErrors(contents, sourceFile);

sourceToBank(parsed, sourceFile).writeBankFile(args['--out'] || 'tst');

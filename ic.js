#!/usr/bin/env node

// test with:
// node_modules/.bin/pegjs instparser.pegjs && node instparser.js ./test.inst

const fs = require('fs');
const arg = require('arg');
const parser = require('./instparser');
const {sourceToBank} = require('./soundtools');

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

let parsed;
try {
  parsed = parser.parse(contents);
  // console.log(parsed);
} catch (err) {
  const loc = err.location;
  console.error(
    `Error in ${args._[0]}` +
      (loc ? ` at line ${loc.start.line} column ${loc.start.line}` : '') +
      ':'
  );

  if (err.message.startsWith('Expected Error parsing')) {
    console.error(
      `${err.expected.map((e) => e.description).join('\n')}
in:
${err.found}`
    );
  } else {
    console.error(err.message);
  }
  process.exit(1);
}

sourceToBank(parsed, sourceFile).writeBankFile(args['--out'] || 'tst');

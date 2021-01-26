#!/usr/bin/env node
const fs = require('fs');

const {serializeSBK} = require('./sequencebank');

const arg = require('arg');

const args = arg({
  // Types
  '--help': Boolean,
  '--out': String, // --name <string> or --name=<string>

  // Aliases
  '-o': '--out',
  '-h': '--help',
});

if (args['--help']) {
  console.log(`sbc -o <output file> file0 [file1 file2 file3 ....]`);
  process.exit(0);
}

if (args._.length === 0) {
  console.error(`error: at least one input file must be specified`);
  process.exit(1);
}

const inFiles = args._.map((f) => fs.readFileSync(f));

const output = serializeSBK(inFiles);

// console.log(output.length, output);

fs.writeFileSync(args['--out'] || 'tst.sbk', output);

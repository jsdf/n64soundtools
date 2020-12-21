#!/usr/bin/env node
const fs = require('fs');

const {serializeSBK} = require('./sequencebank');

function writeSBK() {
  const arg = require('arg');

  const args = arg({
    // Types
    '--help': Boolean,
    '--out': String, // --name <string> or --name=<string>

    // Aliases
    '-o': '--out',
  });

  const inFiles = args._.map((f) => fs.readFileSync(f));

  const output = serializeSBK(inFiles);

  // console.log(output.length, output);

  fs.writeFileSync(args['--out'] || 'tst.sbk', output);
}

writeSBK();

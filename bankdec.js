#!/usr/bin/env node

// eg. bankdec.js ultra/usr/lib/PR/soundbanks/GenMidiRaw.ctl -o test/genmidi

const fs = require('fs');
const arg = require('arg');
const parser = require('./instparser');
const {bankToSource, parseCtl, ALBankFileStruct} = require('./soundtools');

const args = arg({
  // Types
  '--help': Boolean,
  '--out': String, // --name <string> or --name=<string>
  '--gm': Boolean,
  '--ctlstart': Number, // when reading from rom, offset of ctl
  '--tblstart': Number, // when reading from rom, offset of tbl
  '--verbose': Boolean,

  // Aliases
  '-v': '--verbose',
  '-o': '--out',
});

const sourceFile = args._[0];

if (!sourceFile) {
  throw new Error('no input file specified');
}

async function decompileFromRom(sourceFile) {
  const romBuffer = await fs.promises.readFile(sourceFile);
  if (sourceFile.match(/\.(v64)/)) {
    romBuffer.swap16();
  }

  let romName = romBuffer
    .slice(0x20, 0x20 + 20)
    .toString('utf8')
    .trim()
    .toLowerCase()
    .replace(/\W/g, '_');
  if (!romName.length) {
    romName = 'untitled';
  }
  console.log('rom:', romName);

  let found = 0;
  let startOffset = 0;

  // only extract one if either of these are specified
  const decompileOneOnly = args['--ctlstart'] || args['--tblstart'];

  while (true) {
    let ctlStart;
    if (args['--ctlstart'] != null) {
      ctlStart = args['--ctlstart'];
    } else {
      ctlStart = romBuffer.indexOf(
        Buffer.from([0x42, 0x31, 0x00, 0x01]),
        startOffset
      );
    }

    if (ctlStart < 0) {
      if (found == 0) {
        throw new Error(`couldn't find ctl magic number`);
      } else {
        return;
      }
    }

    // console.log(romBuffer.slice(ctlStart, ctlStart + 64));
    // const bankFileHeader = ALBankFileStruct.parse(romBuffer, ctlStart);
    // console.log(bankFileHeader);
    let bankFile;
    try {
      bankFile = parseCtl(romBuffer, ctlStart);
    } catch (err) {
      if (args['--verbose']) {
        console.error(err);
      }
      if (decompileOneOnly) {
        throw new Error(`failed to find ctl at 0x${ctlStart.toString(16)}`);
      } else {
        // failed to parse bank file, probably not really a bank file
        // and just coincidentally contained the 4 byte magic string.
        // move past it and try again
        startOffset = ctlStart + 4;
        continue;
      }
    }

    console.log('found ctl at 0x' + ctlStart.toString(16));
    found++;
    // console.log('bankFile', bankFile);
    // console.log(
    //   'next 64 bytes:',
    //   romBuffer.slice(bankFile.lastOffset, bankFile.lastOffset + 64)
    // );

    let tblStart;
    if (args['--tblstart'] != null) {
      tblStart = args['--tblstart'];
    } else {
      // next time we look for a ctl, start here
      startOffset = bankFile.lastOffset;

      // look for tbl immediate after ctl
      tblStart = bankFile.lastOffset;
      // look ahead through null bytes
      while (
        romBuffer
          .slice(tblStart, tblStart + 4)
          .equals(Buffer.from([0, 0, 0, 0]))
      ) {
        tblStart += 4;
      }
    }

    try {
      await bankToSource(
        romBuffer,
        ctlStart,
        romBuffer,
        tblStart,
        (args['--out'] || romName) +
          (decompileOneOnly ? '' : '_' + String(ctlStart)),
        args['--gm']
      );
    } catch (err) {
      throw new Error(
        `failed to parse, ctl=0x${ctlStart.toString(
          16
        )} tbl=0x${tblStart.toString(16)}`
      );
    }

    if (decompileOneOnly) {
      return;
    }
  }
}

if (sourceFile.match(/\.(n64|v64|z64)/)) {
  if (!sourceFile.match(/\.(v64|z64)/)) {
    console.error('only .z64 and .v64 roms supported');
    process.exit(1);
  }

  decompileFromRom(sourceFile).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  const inFilePrefix = sourceFile.replace(/\.\w+$/, '');
  const ctlBuffer = fs.readFileSync(inFilePrefix + '.ctl');
  const tblBuffer = fs.readFileSync(inFilePrefix + '.tbl');
  bankToSource(
    ctlBuffer,
    0,
    tblBuffer,
    0,
    args['--out'] || 'tst',
    args['--gm']
  );
}

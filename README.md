# n64soundtools

reimplements tools for working with the n64 sdk 'sgi' sound tools

## installation

install [node.js](https://nodejs.org/), then

```sh
npm install -g n64soundtools
```

this will install the included tools globally on your system, so you can run them directly at the command line

alternatively you can install them locally with `npm init` then `npm install n64soundtools` in which case the commands will be available in `node_modules/.bin/`

## tools

most of these tools aim to be a drop-in replacement for [the n64 sdk sgi soundtools](http://n64devkit.square7.ch/pro-man/pro18/)

### sbc
sequence bank compiler tool

see [the sdk manual](http://n64devkit.square7.ch/pro-man/pro18/18-07.htm) for instructions

### midicvt
converts midi type 1 files to midi type 0 .seq files for playback with [ALSeqPlayer](http://n64devkit.square7.ch/n64man/al/alSeqPlayer.htm)

see [the sdk manual](http://n64devkit.square7.ch/pro-man/pro18/18-03.htm) for instructions

### ic 
compiles .inst to .ctl and .tbl

see [the sdk manual](http://n64devkit.square7.ch/pro-man/pro18/18-01.htm) for instructions

### bankdec

decompiles .ctl and .tbl to .inst and .aiff/.aifc. if you pass a rom file instead, it will try to locate and decompile .ctl/.tbl data in the rom

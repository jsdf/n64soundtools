# n64daw
## cli

stream midi to an n64

- in the `sgisoundtest/` directory
- replace the instrument bank (.ctl/.tbl) files with the ones you want to use
- build the rom
- run it on an everdrive connected via usb
- then run the cli to stream midi to it:

```
# in this directory, run
npm install # just once after cloning this repo

# use the cli
node cli somemidifile.mid
```

## gui

```
npm install # just once after cloning this repo 
npm run electron
```
look for errors in console, electron.js.log and applet.js.log

## build & deploy the rom

```
# in sgisoundtool/ dir
./build.sh && ./deploy.sh
```

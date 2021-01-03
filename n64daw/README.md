# n64daw
## cli

stream midi to an n64

```
# in this directory, run
npm install # just once after cloning this repo

# use the cli
node cli somemidifile.mid

# or start the ui
cd soundtool-ui/
npm install # just once after cloning this repo
npm start
```


## gui

```
npm run electron
```
look for errors in console, electron.js.log and applet.js.log

## build & deploy the rom

```
# in sgisoundtool/ dir
./build.sh && ./deploy.sh
```

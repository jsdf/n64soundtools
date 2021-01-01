const {app, BrowserWindow, ipcMain} = require('electron');
const express = require('express');
const getPort = require('get-port');
const util = require('util');
const fork = require('child_process').fork;

// const expressApp = express();
let portPromise = getPort();
let serverPromise = portPromise.then(async (port) => {
  await delay(4000);
  return port;
});

async function run() {
  const port = await portPromise;
  const child = fork('./node_modules/.bin/react-scripts', {
    execArgv: ['./node_modules/.bin/react-scripts', 'start'],
    stdio: 'inherit',
    cwd: 'soundtool-ui',
    env: {...process.env, PORT: port, BROWSER: 'none'},
  });

  child.on('message', (msg) => console.log('message from child', msg));

  console.log('create react app exited');

  // const httpServer = expressApp.listen(port, () => {
  //   console.log(`Example app listening at http://localhost:${port}`);
  // });

  // expressApp.get('/', (req, res) => {
  //   res.send('Hello World!');
  // });

  // applet.attachToApp(expressApp, httpServer);
}

run().catch((err) => console.error(err));

function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

ipcMain.handle('perform-action', (event, ...args) => {
  // ... do actions on behalf of the Renderer
  console.log('got event', event, ...args);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      contextIsolation: true,
    },
  });

  win.loadFile('splash.html');
  serverPromise.then((port) => {
    win.loadURL(`http://localhost:${port}/`);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

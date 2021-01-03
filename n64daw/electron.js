const {app, BrowserWindow, ipcMain, dialog, session} = require('electron');
const getPort = require('get-port');
const util = require('util');
const fork = require('child_process').fork;
const fs = require('fs');
const ipc = require('node-ipc');
const {
  default: installExtension,
  REACT_DEVELOPER_TOOLS,
} = require('electron-devtools-installer');
require('./logger')(__filename).replaceConsole();

let currentWindow;
let portPromise = getPort();
let serverPromise = portPromise.then(async (port) => {
  // TODO: wait for bootup message from client process
  await delay(4000);
  return port;
});

function handleCommand(msg, socket) {
  switch (msg.cmd) {
    case 'showOpenDialog':
      dialog
        .showOpenDialog(currentWindow, msg.data)
        .then((result) => {
          ipc.server.emit(socket, 'message', {
            cmd: 'showOpenDialogResult',
            data: result,
            requestID: msg.requestID,
          });
        })
        .catch((error) => {
          ipc.server.emit(socket, 'message', {
            cmd: 'showOpenDialogResult',
            requestID: msg.requestID,
            error,
          });
        });
      break;
  }
}

async function run() {
  const port = await portPromise;

  ipc.config.id = `n64dawsocket${process.pid}`;
  ipc.config.retry = 1500;
  ipc.config.silent = true;

  ipc.serve(function () {
    ipc.server.on('message', function (msg, socket) {
      console.log('message from child', msg);
      if (msg.cmd) {
        handleCommand(msg, socket);
      }
    });
    ipc.server.on('socket.disconnected', function (socket, destroyedSocketID) {
      console.log('client ' + destroyedSocketID + ' has disconnected!');
    });

    ipc.server.on('hello', ({id}) => {
      console.log('client connected', id);
      if (currentWindow) {
        currentWindow.loadURL(`http://localhost:${port}/`);
      }
    });
  });

  ipc.server.start();

  const child = fork('./node_modules/.bin/react-scripts', {
    execArgv: ['./node_modules/.bin/react-scripts', 'start'],
    // stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    stdio: 'inherit',
    // silent: true,
    cwd: '.',
    env: {
      ...process.env,
      PORT: port,
      BROWSER: 'none',
      IPC_SOCKET_ID: ipc.config.id,
    },
  });
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
    width: 1440,
    height: 900,
    webPreferences: {
      contextIsolation: true,
    },
  });
  currentWindow = win;

  win.loadFile('splash.html');
}

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

// TODO: use this in prod (non-CRA) mode
function createExpress(port, applet) {
  const express = require('express');
  const expressApp = express();

  const httpServer = expressApp.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
  });

  expressApp.get('/', (req, res) => {
    res.send('Hello World!');
  });

  applet.attachToApp(expressApp, httpServer);
}

app.whenReady().then(() => {
  if (process.env.NODE_ENV === 'development') {
    installExtension(REACT_DEVELOPER_TOOLS)
      .then((name) => console.log(`Added Extension:  ${name}`))
      .catch((err) => console.log('An error occurred: ', err));
  }

  // for security but this breaks webpack devserver due to eval requirement
  // session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  //   callback({
  //     responseHeaders: {
  //       ...details.responseHeaders,
  //       'Content-Security-Policy': ["script-src 'self' localhost"],
  //     },
  //   });
  // });

  createWindow();
});

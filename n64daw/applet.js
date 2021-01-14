const socketio = require('socket.io');
const fs = require('fs');
const path = require('path');
const ipc = require('node-ipc');
require('./logger')(__filename).replaceConsole();

const {parseWithNiceErrors} = require('../instparserapi');

const audioConvert = require('../audioconvert');

const RequestMap = require('./src/RequestMap');

const DEV = process.env.NODE_ENV === 'development';

// enable everdrive integration?
const EVERDRIVE = false;

const parentSocketID = process.env.IPC_SOCKET_ID;

const USE_IPC = true;

process.on('uncaughtException', (err) => {
  console.error(err);
  process.exit(1);
});

// this can be embedded in the create-react-app server or any express server
// via the registerMiddleware && attachToServer methods
// this process communicates with the web client ('client') via socket.io and
// with the parent electron process ('electron') via node-ipc
class Applet {
  dbgif = null;

  state = {
    serverErrors: [],
  };
  client = null;

  requestMap = new RequestMap();

  setState(stateUpdate) {
    Object.assign(this.state, stateUpdate);
    fs.writeFile(
      'laststate.json',
      JSON.stringify(this.state),
      {encoding: 'utf8'},
      () => {}
    );
    this.io.emit('state', this.state);
  }

  handleError(message, error) {
    this.state.serverErrors.push({message, error});
    console.error(message, error);
  }

  attachDebuggerInferfaceHandlers(dbgif) {
    dbgif.on('log', (line) => {
      this.io.emit('log', line);
    });
    dbgif.on('error', (err) => {
      this.handleError('debugger interface error', err);
    });
  }

  handleElectronCommand({cmd, data, requestID, error}) {
    if (requestID != null) {
      this.requestMap.handleResponse(
        requestID,
        error != null ? error : data,
        error != null
      );
      return;
    }
    switch (cmd) {
      default:
        console.error('unknown parent command', cmd);
        return;
    }
  }

  sendElectronRequest(msg) {
    const promise = this.requestMap.handleRequest(msg.requestID);
    this.sendElectronCommand(msg);
    return promise;
  }

  handleClientRequest({cmd, requestID}, promise) {
    promise
      .then((data) => {
        this.sendClientCommand({
          cmd,
          data,
          requestID,
        });
      })
      .catch((error) => {
        this.handleError(error);
        this.sendClientCommand({
          cmd,
          error,
          requestID,
        });
      });
    return promise;
  }

  handleClientCommand({cmd, data, requestID}) {
    switch (cmd) {
      case 'b':
      case 'p':
      case 's':
      case 'r':
        // if (EVERDRIVE) {
        //   this.dbgif.sendCommand(cmd, data);
        // }
        break;
      case 'showOpenDialog':
        this.handleClientRequest(
          {cmd, requestID},
          this.sendElectronRequest({
            cmd: 'showOpenDialog',
            data,
            requestID,
          }).then(async (response) => {
            const files = await Promise.all(
              response.filePaths.map(async (filePath) => {
                const contents = await fs.promises.readFile(filePath);
                return {filePath, contents};
              })
            );

            return {files};
          })
        );
        break;
      case 'showInstrumentDialog':
        this.handleClientRequest(
          {cmd, requestID},
          this.sendElectronRequest({
            cmd: 'showOpenDialog',
            data: {
              properties: ['openFile'],
              filters: [
                {
                  name: 'Instrument Compiler Source Files',
                  extensions: ['inst'],
                },
              ],
            },
            requestID,
          }).then(async (response) => {
            if (response.filePaths[0] == null) return null;
            const sourceFile = response.filePaths[0];

            const contents = await fs.promises.readFile(sourceFile, 'utf8');

            const defs = parseWithNiceErrors(contents, sourceFile);

            defs.forEach((def) => {
              if (def.type === 'bank') {
                def.value.instruments = Object.fromEntries(
                  def.value.instruments
                );
              }
            });

            const sourceFileDir = path.dirname(path.resolve(sourceFile));

            return {defs, sourceFileDir};
          })
        );
        break;
      default:
        break;
    }
  }

  sendElectronCommand(msg) {
    if (USE_IPC) {
      ipc.of[parentSocketID].emit('message', msg);
    } else {
      process.send(msg);
    }
  }

  sendClientCommand({cmd, data, error, requestID}) {
    this.client.socket.emit('cmd', {
      cmd,
      data,
      requestID,
      error,
    });
  }

  attachElectronHandlers() {
    if (USE_IPC) {
      if (parentSocketID == null) {
        console.error(`no parentSocketID`);
        return;
      }
      ipc.config.id = `n64dawapplet${process.pid}`;
      ipc.config.retry = 1500;
      ipc.config.silent = true;

      ipc.connectTo(parentSocketID, () => {
        ipc.of[parentSocketID].on('connect', () => {
          console.log('connected to ' + parentSocketID, ipc.config.delay);
          ipc.of[parentSocketID].emit('hello', {id: ipc.config.id});
        });
        ipc.of[parentSocketID].on('disconnect', () => {
          console.log('disconnected from ' + parentSocketID);
        });
        ipc.of[parentSocketID].on('message', (msg) => {
          console.log('got a message from ' + parentSocketID, msg);
          if (msg.cmd) {
            this.handleElectronCommand(msg);
          }
        });
      });
    } else {
      // node fork ipc
      if (!process.send) {
        console.error('no node fork ipc parent');
        return;
      }
      process.on('message', (msg) => {
        console.log('message from parent', msg);
        if (msg.cmd) {
          this.handleElectronCommand(msg);
        }
      });
    }
  }

  attachClientHandlers(socket) {
    // send current state on connect
    socket.emit('state', this.state);

    // subscribe to handle commands send from client
    const cmdHandler = (msg) => {
      this.handleClientCommand(msg);
    };
    socket.on('cmd', cmdHandler);

    return () => {
      socket.off('cmd', cmdHandler);
    };
  }

  start() {
    this.attachElectronHandlers();
  }

  async startEverdriveConnection() {
    try {
      if (EVERDRIVE) {
        const DebuggerInterface = DEV
          ? require('../../ed64log/ed64logjs/dbgif')
          : require('ed64logjs/dbgif');

        const dbgif = new DebuggerInterface();
        this.dbgif = dbgif;
        await this.dbgif.start();
        this.attachDebuggerInferfaceHandlers(this.dbgif);
      }
    } catch (err) {
      console.error(err);
      if (DEV) {
        // proceed without serial connection, for ui development purposes
        console.error(
          'unable to open serial port to ftdi device, is it connected?'
        );
      } else {
        throw new Error(
          'unable to open serial port to ftdi device, is it connected?'
        );
      }
    }
  }

  registerMiddleware(app) {
    app.get('/sample/*', async (req, res) => {
      if (req.params[0]) {
        const file = req.params[0];
        const filedata = await fs.promises.readFile(path.resolve(file));

        res.setHeader('content-type', 'audio/wave');
        res.set('Cache-control', 'public, max-age=300');
        res.send(audioConvert.aiffToWave(filedata));
      }
    });
  }

  attachToServer(server) {
    this.io = socketio(server);

    // load last state
    try {
      Object.assign(
        this.state,
        JSON.parse(fs.readFileSync('laststate.json', {encoding: 'utf8'}))
      );
    } catch (err) {
      // console.log(err);
    }

    this.io.on('connection', (socket) => {
      // only one client at a time
      if (this.client) {
        this.client.unsubscribe();
        this.client.socket.disconnect();
        this.client = null;
      }
      const unsubscribe = this.attachClientHandlers(socket);
      this.client = {socket, unsubscribe};
    });

    this.startEverdriveConnection();
  }
}

module.exports = Applet;

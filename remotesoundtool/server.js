#!/usr/bin/env node

const http = require('http');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const spawn = require('child_process').spawn;
const getPort = require('get-port');
const express = require('express');
const socketio = require('socket.io');
const fs = require('fs');
const path = require('path');

const DEV = process.env.NODE_ENV === 'development';

const DebuggerInterface = DEV
  ? require('../ed64logjs/dbgif')
  : require('ed64logjs/dbgif');

const uiRoot = 'soundtool-ui/dist';

const app = express();
const server = http.Server(app);
const io = socketio(server);
app.use(express.static(uiRoot));

class Server {
  dbgif = null;

  state = {
    serverErrors: [],
  };

  setState(stateUpdate) {
    Object.assign(this.state, stateUpdate);
    fs.writeFile(
      'laststate.json',
      JSON.stringify(this.state),
      {encoding: 'utf8'},
      () => {}
    );
    io.emit('state', this.state);
  }

  handleError(message, error) {
    this.state.serverErrors.push({message, error});
    console.error(message, error);
  }

  attachDebuggerInferfaceHandlers(dbgif) {
    dbgif.on('log', (line) => {
      io.emit('log', line);
    });
    dbgif.on('error', (err) => {
      this.handleError('debugger interface error', err);
    });
  }

  handleCommand(cmd, data) {
    switch (cmd) {
      case 'b':
        break;
      case 'p':
        break;
      case 's':
      case 'r':
        this.setState({
          atBreakpoint: null,
        });
        break;
    }
    this.dbgif.sendCommand(cmd, data);
  }

  attachClientHandlers(socket) {
    // send current state on connect
    socket.emit('state', this.state);

    // subscribe to handle commands send from client
    socket.on('cmd', ({cmd, data}) => {
      this.handleCommand(cmd, data);
    });
  }

  async startServer(httpPort) {
    const dbgif = new DebuggerInterface();
    this.dbgif = dbgif;

    try {
      // await dbgif.start();
      // this.attachDebuggerInferfaceHandlers(dbgif);
    } catch (err) {
      console.error(err);
      if (DEV) {
        // proceed without serial connection, for ui development purposes
        console.error(
          'unable to open serial port to ftdi device, is it connected?'
        );

        // load last state
        try {
          Object.assign(
            this.state,
            JSON.parse(fs.readFileSync('laststate.json', {encoding: 'utf8'}))
          );
        } catch (err) {
          console.log(err);
        }
      } else {
        throw new Error(
          'unable to open serial port to ftdi device, is it connected?'
        );
      }
    }

    server.listen(httpPort);

    app.get('/', (req, res) => {
      if (DEV) {
        res.redirect(301, `http://127.0.0.1:3000/?port=${httpPort}`);
      } else {
        res.sendFile(path.join(__dirname, uiRoot, 'index.html'));
      }
    });

    io.on('connection', (socket) => {
      this.attachClientHandlers(socket);
    });

    console.log(`server running at http://127.0.0.1:${httpPort}`);
  }
}

getPort()
  .then(async (httpPort) => {
    await new Server().startServer(httpPort);
    return httpPort;
  })
  .then(async (httpPort) => {
    if (!DEV) {
      return;
    }

    console.log('opening ui');
    exec(`open http://127.0.0.1:${httpPort}/`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

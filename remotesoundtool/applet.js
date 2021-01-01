const socketio = require('socket.io');
const fs = require('fs');

const DEV = process.env.NODE_ENV === 'development';

const EVERDRIVE = false;

class Applet {
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

  handleParentCommand(cmd, data) {
    switch (cmd) {
      case 'fileSelected':
        break;
    }
  }

  handleClientCommand(cmd, data) {
    switch (cmd) {
      case 'b':
      case 'p':
      case 's':
      case 'r':
        // if (EVERDRIVE) {
        //   this.dbgif.sendCommand(cmd, data);
        // }
        break;
      case 'selectFile':
        process.send({cmd: 'selectFile', id: String(Math.random())});
        break;
    }
  }

  attachParentHandlers() {
    process.on('message', (msg) => {
      console.log('message from parent', msg);
      if (msg.cmd) {
        this.handleParentCommand(msg.cmd, msg.data);
      }
    });
  }

  attachClientHandlers(socket) {
    // send current state on connect
    socket.emit('state', this.state);

    // subscribe to handle commands send from client
    socket.on('cmd', ({cmd, data}) => {
      this.handleClientCommand(cmd, data);
    });
  }

  async attachToApp(app, server) {
    if (EVERDRIVE) {
      const DebuggerInterface = DEV
        ? require('../../ed64log/ed64logjs/dbgif')
        : require('ed64logjs/dbgif');

      const dbgif = new DebuggerInterface();
      this.dbgif = dbgif;
    }

    this.io = socketio(server);

    try {
      if (EVERDRIVE) {
        await dbgif.start();
        this.attachDebuggerInferfaceHandlers(dbgif);
      }
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

    this.io.on('connection', (socket) => {
      this.attachClientHandlers(socket);
    });
  }
}

module.exports = Applet;

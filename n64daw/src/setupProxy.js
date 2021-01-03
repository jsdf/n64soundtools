const Applet = require('../applet');
const applet = new Applet();
applet.start();

module.exports = function (app) {
  let httpServer;
  app.use((req, res, next) => {
    if (!httpServer) {
      httpServer = req.connection.server;
      const port = httpServer.address().port;
      applet.attachToApp(app, httpServer);
    }
    next();
  });
};

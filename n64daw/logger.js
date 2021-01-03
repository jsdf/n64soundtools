const fs = require('fs');
const util = require('util');

const ansi = new RegExp(
  [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))',
  ].join('|'),
  'g'
);

module.exports = (filename) => {
  const moduleID = filename.replace(/^.*[\/]/, '');
  const logfile = moduleID + '.log';

  function log(...args) {
    fs.appendFileSync(
      logfile,
      (
        args
          .map((arg) =>
            arg && typeof arg === 'object' ? util.inspect(arg) : arg
          )
          .join(' ') + '\n'
      ).replace(ansi, ''),
      'utf8'
    );
  }
  fs.writeFileSync(logfile, '', 'utf8'); // clear file
  log(`pid=${process.pid}`);
  log(`parent pid=${process.ppid}`);

  let replacedConsole = false;
  function replaceConsole() {
    if (replacedConsole) return;
    replacedConsole = true;
    ['log', 'warn', 'error'].forEach((method) => {
      const originalLog = console[method].bind(console);

      console[method] = (...args) => {
        originalLog(...args);
        log(...args);
      };
    });
  }

  return {log, replaceConsole};
};

const parser = require('./instparser');

function parseWithNiceErrors(contents, filename) {
  let parsed;
  try {
    parsed = parser.parse(contents);
    // console.log(parsed);
  } catch (err) {
    const loc = err.location;
    let errorText =
      `Error in ${filename}` +
      (loc ? ` at line ${loc.start.line} column ${loc.start.line}` : '') +
      ':';

    if (err.message.startsWith('Expected Error parsing')) {
      errorText += `\n${err.expected.map((e) => e.description).join('\n')}
in:
${err.found}`;
    } else {
      errorText += '\n' + err.message;
    }

    throw new Error(errorText);
  }
  return parsed;
}

module.exports = {parseWithNiceErrors};

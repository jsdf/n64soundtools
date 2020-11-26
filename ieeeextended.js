// https://en.cppreference.com/w/cpp/numeric/math/ldexp
const ldexp = (x, exp) => x * Math.pow(2, exp);

// from https://raw.githubusercontent.com/locutusjs/locutus/master/src/c/math/frexp.js
// license: https://github.com/locutusjs/locutus/blob/master/LICENSE
function frexp(arg) {
  arg = Number(arg);

  const result = [arg, 0];

  if (arg !== 0 && Number.isFinite(arg)) {
    const absArg = Math.abs(arg);
    // Math.log2 was introduced in ES2015, use it when available
    const log2 =
      Math.log2 ||
      function log2(n) {
        return Math.log(n) * Math.LOG2E;
      };
    let exp = Math.max(-1023, Math.floor(log2(absArg)) + 1);
    let x = absArg * Math.pow(2, -exp);

    // These while loops compensate for rounding errors that sometimes occur because of ECMAScript's Math.log2's undefined precision
    // and also works around the issue of Math.pow(2, -exp) === Infinity when exp <= -1024
    while (x < 0.5) {
      x *= 2;
      exp--;
    }
    while (x >= 1) {
      x *= 0.5;
      exp++;
    }

    if (arg < 0) {
      x = -x;
    }
    result[0] = x;
    result[1] = exp;
  }
  return result;
}

// this IEEE extended stuff comes from http://groovit.disjunkt.com/analog/specifs/ieee.c

/*
 * C O N V E R T   T O   I E E E   E X T E N D E D
 */

const FloatToUnsigned = (f) => f - 2147483648.0 + 2147483647 + 1;

function ConvertToIeeeExtended(/*double*/ num) {
  let /*char**/ bytes = new Array(10).fill(0);
  let /*int*/ sign;
  let /*int*/ expon;
  let /*double*/ fMant, fsMant;
  let /*unsigned long*/ hiMant, loMant;

  if (num < 0) {
    sign = 0x8000;
    num *= -1;
  } else {
    sign = 0;
  }

  if (num == 0) {
    expon = 0;
    hiMant = 0;
    loMant = 0;
  } else {
    const frexpRes = frexp(num);
    fMant = frexpRes[0];
    expon = frexpRes[1];

    if (expon > 16384 || !(fMant < 1)) {
      /* Infinity or NaN */
      expon = sign | 0x7fff;
      hiMant = 0;
      loMant = 0; /* infinity */
    } else {
      /* Finite */
      expon += 16382;
      if (expon < 0) {
        /* denormalized */
        fMant = ldexp(fMant, expon);
        expon = 0;
      }
      expon |= sign;
      fMant = ldexp(fMant, 32);
      fsMant = Math.floor(fMant);
      hiMant = FloatToUnsigned(fsMant);
      fMant = ldexp(fMant - fsMant, 32);
      fsMant = Math.floor(fMant);
      loMant = FloatToUnsigned(fsMant);
    }
  }

  bytes[0] = expon >> 8;
  bytes[1] = expon;
  bytes[2] = hiMant >> 24;
  bytes[3] = hiMant >> 16;
  bytes[4] = hiMant >> 8;
  bytes[5] = hiMant;
  bytes[6] = loMant >> 24;
  bytes[7] = loMant >> 16;
  bytes[8] = loMant >> 8;
  bytes[9] = loMant;

  return bytes;
}

/*
 * C O N V E R T   F R O M   I E E E   E X T E N D E D
 */

const UnsignedToFloat = (u) => ((u - 2147483647) | 0) - 1 + 2147483648.0;

/****************************************************************
 * Extended precision IEEE floating-point conversion routine.
 ****************************************************************/

function ConvertFromIeeeExtended(/*unsigned char**/ bytes /* LCN */) {
  let /*double*/ f;
  let /*int*/ expon;
  let /*unsigned long*/ hiMant, loMant;

  expon = ((bytes[0] & 0x7f) << 8) | (bytes[1] & 0xff);
  hiMant =
    ((bytes[2] & 0xff) << 24) |
    ((bytes[3] & 0xff) << 16) |
    ((bytes[4] & 0xff) << 8) |
    (bytes[5] & 0xff);
  loMant =
    ((bytes[6] & 0xff) << 24) |
    ((bytes[7] & 0xff) << 16) |
    ((bytes[8] & 0xff) << 8) |
    (bytes[9] & 0xff);

  if (expon == 0 && hiMant == 0 && loMant == 0) {
    f = 0;
  } else {
    if (expon == 0x7fff) {
      /* Infinity or NaN */
      f = Infinity;
    } else {
      expon -= 16383;
      f = ldexp(UnsignedToFloat(hiMant), (expon -= 31));
      f += ldexp(UnsignedToFloat(loMant), (expon -= 32));
    }
  }

  if (bytes[0] & 0x80) return -f;
  else return f;
}

module.exports = {
  ConvertFromIeeeExtended,
  ConvertToIeeeExtended,
};

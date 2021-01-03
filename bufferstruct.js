const DEBUG = false;

function nullthrows(value, message) {
  if (value == null) {
    throw new Error('unexpected null' + (message ? ': ' + message : ''));
  }
  return value;
}

function nanthrows(value, message) {
  if (isNaN(value)) {
    throw new Error('unexpected NaN' + (message ? ': ' + message : ''));
  }
  return value;
}

const FieldTypesToBufferMethods = {
  uint: 'UInt',
  int: 'Int',
  float: 'Float',
  double: 'Double',
  bigint: 'BigInt',
  biguint: 'BigUint',
  char: 'UInt',
};

const BytesTypes = new Set(['bytes', 'utf8']);

function getBufferMethodName(type, size, endian) {
  return `${FieldTypesToBufferMethods[type]}${size * 8}${
    size == 1 ? '' : endian == 'big' ? 'BE' : 'LE'
  }`;
}

function getAlignedSize(size, alignment) {
  return Math.ceil(size / alignment) * alignment;
}

function getAlignedSizeForField(field, size) {
  return field.align != null
    ? getAlignedSize(nanthrows(size), nanthrows(field.align))
    : nanthrows(size);
}

/*
  schema: an object mapping field names to a definition object.
  definitions can have the following properties: 
  type: how to interpret the binary data. options:
    uint -> number
    int -> number
    float -> number
    double -> number
    bigint -> BigInt
    biguint -> BigInt
    char -> number
    bytes -> Buffer
    utf8 -> string
    BufferStructBase | BufferStruct | BufferStructUnion -> nested object
  size: serialized field size in bytes
  endian: endianness used when interpreting binary data
  default: default value used when serializing if value not provided
  size: size of field in bytes. can be fixed size or function determining size
  arrayElements: treat this field as an array. function returning number of items
  align: pad the field to a multiple of this number
 */

class BufferStructBase {
  constructor(schema) {
    this.schema = schema;
    this.lastOffset = 0;
  }

  parse(buffer, startOffset, contextData = null) {
    // should return value for this field and update this.lastOffset
  }

  serialize(data, contextData = null) {
    // should return buffer of serialized data
  }

  getStaticSize() {
    throw new Error(
      'getStaticSize not implemented on: ' + this.constructor.name
    );
  }

  getName() {
    return this.schema.name || this.constructor.name;
  }
}

class BufferStruct extends BufferStructBase {
  parse(buffer, startOffset, contextData = null) {
    const partialResult = {};
    let offset = startOffset || 0;
    Object.keys(this.schema.fields).forEach((fieldName) => {
      const {field, endian, size, type} = this._getFieldConfig(
        fieldName,
        partialResult,
        contextData
      );

      const parse = BytesTypes.has(type)
        ? (buffer, startOffset) => {
            if (size == null) {
              throw new Error(
                `can't parse field of type 'bytes' without predetermined size`
              );
            }
            if (buffer.length < startOffset + size) {
              throw new Error(
                `tried to read ${size} bytes but only ${
                  buffer.length - startOffset
                } remaining for field ${fieldName} on ${this.getName()}`
              );
            }
            const valueAsBuffer = buffer.slice(startOffset, startOffset + size);
            let value = valueAsBuffer;
            if (type === 'utf8') {
              value = valueAsBuffer.toString('utf8');
            }
            return {value, parsedSize: size};
          }
        : type instanceof BufferStructBase
        ? (buffer, startOffset) => {
            // console.log('parsing', type.getName(), 'at', startOffset);
            const value = type.parse(buffer, startOffset, contextData);
            // use static size where determined (eg. in case of union)
            const parsedSize =
              size != null ? size : type.lastOffset - startOffset; // change in offset after parsing
            // console.log({value, parsedSize});

            return {value, parsedSize};
          }
        : (buffer, startOffset) => {
            const methodName = `read${getBufferMethodName(type, size, endian)}`;

            const value = buffer[methodName](startOffset);
            if (this.schema.traceReads) {
              console.log(methodName, {
                fieldName,
                type,
                size,
                endian,
                startOffset,
                value,
              });
            }

            return {value, parsedSize: size};
          };

      // the ability to provide predetermined size, as well as define alignment, means we need to account for either of these
      // sources of padding when advancing the point we are reading in the buffer
      const parseWithAlignment = (buffer, startOffset) => {
        const {value, parsedSize} = parse(buffer, nanthrows(startOffset));

        if (size != null && parsedSize > size) {
          throw new Error(
            `parsed size ${parsedSize} larger than predetermined size ${size} for field ${fieldName} on ${this.getName()}`
          );
        }

        // when field is aligned we must make sure to advance by aligned size
        // additionally, if a predetermined size is set, we should use that size instead (in case of padding)
        // we have already asserted above that the parsed size is not larger than the predetermined size
        let parsedSizeWithAlignment = getAlignedSizeForField(
          field,
          size != null ? size : parsedSize
        );

        if (size != null) {
          const alignedExpectedSize = getAlignedSizeForField(field, size);

          if (parsedSizeWithAlignment > alignedExpectedSize) {
            throw new Error(
              `aligned parsed size ${parsedSizeWithAlignment} larger than aligned predetermined size ${alignedExpectedSize} for field ${fieldName} on ${this.getName()}`
            );
          }
        }

        return {value, consumedSize: nanthrows(parsedSizeWithAlignment)};
      };

      // try {
      if (field.arrayElements) {
        // array field
        const count =
          typeof field.arrayElements === 'function'
            ? field.arrayElements(partialResult, contextData)
            : field.arrayElements;
        const array = new Array(count);

        for (var i = 0; i < count; ++i) {
          // console.log('getting array el', i, 'of', count, 'at', offset);
          const {value, consumedSize} = parseWithAlignment(buffer, offset);

          offset += nanthrows(consumedSize);
          array[i] = value;
        }

        partialResult[fieldName] = array;
      } else {
        // non-array field
        const {value, consumedSize} = parseWithAlignment(buffer, offset);
        offset += nanthrows(consumedSize);
        partialResult[fieldName] = value;
      }
      // } catch (error) {
      //   throw new Error(
      //     `failed parsing field ${fieldName} on ${this.getName()}: ${error}`
      //   );
      // }
    });
    if (isNaN(offset)) {
      throw new Error(`invalid offset while parsing ${this.getName()}`);
    }
    this.lastOffset = offset;
    return partialResult;
  }

  _getFieldConfig(fieldName, partialFieldData, contextData) {
    const field = nullthrows(
      this.schema.fields[fieldName],
      `${fieldName} schema is missing`
    );
    const endian = field.endian || this.schema.endian || 'little';
    const type = nullthrows(field.type, `${fieldName} type`);
    if (
      !(
        type instanceof BufferStructBase ||
        type instanceof BufferStructUnion ||
        type in FieldTypesToBufferMethods ||
        BytesTypes.has(type)
      )
    ) {
      throw new Error(`unsupported type ${type} in ${fieldName}`);
    }

    // use statically defined size if we've got it
    let size =
      typeof field.size === 'function'
        ? field.size(partialFieldData, contextData)
        : field.size;
    if (BytesTypes.has(type)) {
      // allow size to be dynamic
    } else if (type instanceof BufferStructBase) {
      // allow size to be dynamic
    } else if (type instanceof BufferStructUnion) {
      // size will be statically known (asserted in BufferStructUnion)
      size = type.size;
    } else {
      // size must be statically known
      size = nullthrows(size, `${fieldName} size`);
    }

    let actualType = type;
    // replace union type with actual type
    if (type instanceof BufferStructUnion) {
      actualType = type.selectMember(partialFieldData, contextData);
      if (actualType == null) {
        throw new Error(
          `failed to refine union type in field ${fieldName} on ${this.getName()}`
        );
      }
    }

    return {field, endian, size, type: actualType};
  }

  serialize(data, contextData = null) {
    if (!data) {
      throw new Error(
        `missing argument 'data' when serializing ${this.getName()}`
      );
    }
    const parts = [];
    Object.keys(this.schema.fields).forEach((fieldName) => {
      const {field, endian, size, type} = this._getFieldConfig(
        fieldName,
        data,
        contextData
      );

      let value;
      if (!(fieldName in data)) {
        if ('default' in field) {
          value = field.default;
        } else {
          throw new Error(
            `missing field ${fieldName} when serializing ${this.getName()}`
          );
        }
      }
      value = data[fieldName];

      const serialize = BytesTypes.has(type)
        ? (value) => {
            let valueAsBuffer = value;
            if (type === 'utf8') {
              valueAsBuffer = Buffer.from(value, 'utf8');
            }

            const dynSize = size == null ? valueAsBuffer.length : size;
            const partBuffer = Buffer.alloc(dynSize);
            valueAsBuffer.copy(partBuffer, 0, 0, dynSize);

            return partBuffer;
          }
        : type instanceof BufferStructBase
        ? (value) => type.serialize(value, contextData)
        : (value) => {
            const methodName = `write${getBufferMethodName(
              type,
              size,
              endian
            )}`;

            const partBuffer = Buffer.alloc(size);
            partBuffer[methodName](value);
            if (this.schema.traceWrites) {
              console.log(methodName, {
                fieldName,
                type,
                size,
                endian,
                value,
              });
            }

            return partBuffer;
          };

      const serializeWithAlignment = (value) => {
        const partBuffer = serialize(value);
        const serializedSize = partBuffer.length;
        if (size != null && serializedSize > size) {
          throw new Error(
            `serialized size ${serializedSize} larger than predetermined size ${size} for field ${fieldName} on ${this.getName()}`
          );
        }

        let maybeAlignedPartBuffer = partBuffer;
        if (field.align != null) {
          const alignedSerializedSize = getAlignedSize(
            serializedSize,
            field.align
          );
          const alignedExpectedSize = getAlignedSize(size, field.align);
          if (alignedSerializedSize > alignedExpectedSize)
            throw new Error(
              `serialized aligned size ${
                maybeAlignedPartBuffer.length
              } larger than predetermined size (aligned) ${alignedExpectedSize} for field ${fieldName} on ${this.getName()}`
            );

          const partBufferAligned = Buffer.alloc(alignedSerializedSize);
          partBuffer.copy(partBufferAligned);
          maybeAlignedPartBuffer = partBufferAligned;
        }

        return maybeAlignedPartBuffer;
      };

      // try {
      if (field.arrayElements) {
        for (var i = 0; i < value.length; ++i) {
          const part = serializeWithAlignment(value[i]);
          parts.push(part);
        }
      } else {
        const part = serializeWithAlignment(value);
        parts.push(part);
      }
      // } catch (error) {
      //   const extra = DEBUG ? `${error.stack} \nrethrown stack:` : '';
      //   throw new Error(
      //     `failed serializing field ${fieldName}: ${error} ${extra}`
      //   );
      // }
    });

    return Buffer.concat(parts);
  }

  _staticSize = null;
  getStaticSize() {
    const prevSize = this._staticSize;
    if (prevSize != null) {
      return prevSize;
    } else {
      let size = 0;
      for (const field of Object.values(this.schema.fields)) {
        if (typeof field.size != 'number') {
          throw new Error(
            'cannot get static size of struct: ' + this.getName()
          );
        }
        const alignedFieldSize = getAlignedSizeForField(field, field.size);
        size += alignedFieldSize;
      }
      this._staticSize = size;
      return size;
    }
  }
}

// simulates c struct union functionality, using the provided selectMember function
// to choose which union member (BufferStruct) to interpret data as based on previously parsed fields.
// requires that all union members have statically determinable size (eg. no arrays or dynamically sized bytes fields allowed)
// when serializing, the maximum member size will be used
class BufferStructUnion {
  constructor({members, selectMember}) {
    this.selectMember = selectMember;
    this.members = members;
    this.size = Math.max(...members.map((m) => m.getStaticSize()));
  }
}

module.exports = {
  BufferStruct,
  BufferStructBase,
  BufferStructUnion,
};

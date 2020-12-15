function getValueType(value) {
  if (typeof value === 'object') {
    if (!value) return 'null';
    else {
      return value.type;
    }
  }
  return typeof value;
}

function validateAndAssignMember(
  result,
  member,
  objectType,
  objSchema,
  previouslyAssigned,
  reportError
) {
  const valueType = getValueType(member.value);
  const schemaFieldType = member.type == 'use' ? 'use' : objSchema[member.name];
  if (!schemaFieldType)
    reportError(
      `assignment of property '${
        member.name
      }' not valid for ${objectType}, valid properties are ${Object.keys(
        objSchema
      )
        .map((v) => `'${v}'`)
        .join(', ')}`,
      member.location
    );
  const resultFieldName =
    schemaFieldType == 'symbolMap' || schemaFieldType == 'symbolArray'
      ? `${member.name}s`
      : member.name;
  // hack to make plural fields like instrument -> instruments
  switch (schemaFieldType) {
    case 'use':
      // for 'use' type mapping is backwards
      result[objSchema.use] = member.value;
      break;
    case 'symbolMap':
      if (member.type !== 'assignmentIndexed') {
        reportError(
          `expected indexed (array) assignment of '${member.name}'`,
          member.location
        );
      }
      if (valueType !== 'symbol') {
        reportError(
          `invalid value for '${member.name}', expected symbol, got ${valueType}`,
          member.location
        );
      }
      result[resultFieldName] = result[resultFieldName] || new Map();
      if (result[resultFieldName].has(member.index)) {
        reportError(
          `assigned the same index (${member.index}) twice for property '${member.name}'`,
          member.location
        );
      }
      result[resultFieldName].set(member.index, member.value);
      break;
    case 'symbolArray':
      if (member.type !== 'assignment') {
        reportError(
          `indexed (array) assignment not valid for '${member.name}'`,
          member.location
        );
      }
      if (valueType !== 'symbol') {
        reportError(
          `invalid value for '${member.name}', expected symbol, got ${valueType}`,
          member.location
        );
      }
      result[resultFieldName] = result[resultFieldName] || [];
      result[resultFieldName].push(member.value);
      break;
    default:
      if (previouslyAssigned.has(member.name)) {
        reportError(
          `duplicate assignment of property '${member.name}'`,
          member.location
        );
      }
      previouslyAssigned.add(member.name);
      if (valueType !== schemaFieldType) {
        reportError(
          `invalid value for property '${member.name}', expected ${schemaFieldType}, got ${valueType}`,
          member.location
        );
      }
      result[resultFieldName] = member.value;
      break;
  }
}

const schemas = {
  bank: {
    members: {
      sampleRate: 'number',
      percussionDefault: 'symbol',
      instrument: 'symbolMap',
    },
    defaults() {
      return {
        sampleRate: 44100,
        percussionDefault: null,
        instruments: new Map(),
      };
    },
  },
  instrument: {
    members: {
      pan: 'number',
      volume: 'number',
      sound: 'symbolArray',
      volume: 'number',
      pan: 'number',
      priority: 'number',
      tremType: 'number',
      tremRate: 'number',
      tremDepth: 'number',
      tremDelay: 'number',
      vibType: 'number',
      vibRate: 'number',
      vibDepth: 'number',
      vibDelay: 'number',
      bendRange: 'number',
    },
    defaults() {
      return {
        volume: 127,
        pan: 64,
        sounds: [],
        priority: 5,
        tremType: 0,
        tremRate: 0,
        tremDepth: 0,
        tremDelay: 0,
        vibType: 0,
        vibRate: 0,
        vibDepth: 0,
        vibDelay: 0,
        bendRange: 200,
      };
    },
  },
  sound: {
    members: {
      use: 'file',
      pan: 'number',
      volume: 'number',
      keymap: 'symbol',
      envelope: 'symbol',
    },
    defaults() {
      return {
        file: null,
        volume: 127,
        pan: 64,
        keymap: null,
        envelope: null,
      };
    },
  },
  keymap: {
    members: {
      velocityMin: 'number',
      velocityMax: 'number',
      keyMin: 'number',
      keyMax: 'number',
      keyBase: 'number',
      detune: 'number',
    },
    defaults() {
      return {
        velocityMin: 0,
        velocityMax: 127,
        keyMin: 60,
        keyMax: 60,
        keyBase: 76,
        detune: 0,
      };
    },
  },
  envelope: {
    members: {
      attackTime: 'number',
      attackVolume: 'number',
      decayTime: 'number',
      decayVolume: 'number',
      releaseTime: 'number',
    },
    defaults() {
      return {
        attackTime: 0,
        attackVolume: 127,
        decayTime: 500000,
        decayVolume: 100,
        releaseTime: 200000,
      };
    },
  },
};

function collectMembers(objectType, name, membersList, expected) {
  const schema = schemas[objectType];
  function reportError(msg, location) {
    expected(`Error parsing ${objectType} '${name}': ${msg}`, location);
  }

  if (!schema) {
    reportError(`unknown object type ${objectType}`);
  }
  const result = schema.defaults();
  const previouslyAssigned = new Set();
  membersList.forEach((member) => {
    if (member.type === 'comment') return;
    validateAndAssignMember(
      result,
      member,
      objectType,
      schema.members,
      previouslyAssigned,
      reportError
    );
  });
  return result;
}

function isSymbol(obj) {
  return obj && typeof obj == 'object' && obj.type === 'symbol';
}

function getSymbolName(obj) {
  return obj.value;
}

module.exports = {collectMembers, schemas, isSymbol, getSymbolName};

const {
  BufferStruct,
  BufferStructUnion,
  BufferStructBase,
} = require('./bufferstruct');

const DEBUG = false;

// http://soundfile.sapp.org/doc/WaveFormat/

const RIFFChunkStruct = new BufferStruct({
  name: 'RIFFChunk',
  endian: 'little',
  fields: {
    ckID: {type: 'utf8', size: 4},
    ckSize: {type: 'int', size: 4},
    chunkData: {type: 'bytes', align: 2, size: (fields) => fields.ckSize},
  },
});

function makeRIFFChunk(ckID, chunkData) {
  return RIFFChunkStruct.serialize({
    ckID,
    ckSize: chunkData.length,
    chunkData,
  });
}

const WaveFmtStruct = new BufferStruct({
  name: 'WaveFmt',
  endian: 'little',
  fields: {
    // PCM = 1 (i.e. Linear quantization)
    // Values other than 1 indicate some form of compression.
    audioFormat: {type: 'int', size: 2},
    // Mono = 1, Stereo = 2, etc.
    numChannels: {type: 'int', size: 2},
    // 8000, 44100, etc.
    sampleRate: {type: 'int', size: 4},
    // sampleRate * numChannels * sampleSize/8
    byteRate: {type: 'int', size: 4},
    // numChannels * BitsPerSample/8
    sampleAlignment: {type: 'int', size: 2},
    // Bits Per Sample. 8 bits = 8, 16 bits = 16, etc.
    sampleSize: {type: 'int', size: 2},
  },
});

function serializeWave({
  audioFormat,
  numChannels,
  sampleRate,
  sampleSize,
  soundData,
}) {
  return makeRIFFChunk(
    'RIFF',
    Buffer.concat([
      Buffer.from('WAVE', 'utf8'), // Format
      makeRIFFChunk(
        'fmt ',
        WaveFmtStruct.serialize({
          audioFormat,
          numChannels,
          sampleRate,
          byteRate: (sampleRate * numChannels * sampleSize) / 8,
          sampleAlignment: (numChannels * sampleSize) / 8,
          sampleSize,
        })
      ),
      makeRIFFChunk('data', soundData),
    ])
  );
}

function parseWave(buffer) {
  const waveChunk = RIFFChunkStruct.parse(buffer);
  DEBUG && console.log(waveChunk);

  let pos = 0;
  const format = waveChunk.chunkData.slice(0, 4).toString('utf8');
  pos += 4; // skip over format bytes

  const chunks = [];
  while (pos < waveChunk.chunkData.length) {
    DEBUG &&
      console.log(
        'reading chunk',
        waveChunk.chunkData.slice(pos, pos + 8),
        waveChunk.chunkData.slice(pos, pos + 4).toString('utf8'),
        waveChunk.chunkData.readInt32LE(pos + 4)
      );
    const chunk = RIFFChunkStruct.parse(waveChunk.chunkData, pos);
    DEBUG && console.log(chunk);

    chunks.push(chunk);
    pos = RIFFChunkStruct.lastOffset;
  }

  const fmtChunk = chunks.find((chunk) => chunk.ckID === 'fmt ');
  if (!fmtChunk) throw new Error(`fmt chunk not found`);
  const fmt = WaveFmtStruct.parse(fmtChunk.chunkData);
  const dataChunk = chunks.find((chunk) => chunk.ckID === 'data');
  if (!dataChunk) throw new Error(`data chunk not found`);
  const soundData = dataChunk.chunkData;

  DEBUG &&
    console.log({
      waveChunk,
      fmt,
      soundData,
    });

  return {
    ...fmt,
    soundData,
  };
}

module.exports = {
  serialize: serializeWave,
  parse: parseWave,
};

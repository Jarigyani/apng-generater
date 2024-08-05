const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

export const fetchImage = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url);
  return new Uint8Array(await response.arrayBuffer());
};
const createAPNG = async (
  images: Uint8Array[],
  delay: number
): Promise<{ blob: Blob; data: Uint8Array }> => {
  const firstImage = images[0];
  const chunks: Uint8Array[] = [PNG_SIGNATURE];

  // Extract all chunks from the first image
  const firstImageChunks = extractAllChunks(firstImage);
  const ihdrChunk = firstImageChunks.find((chunk) => chunk.type === "IHDR");
  if (!ihdrChunk) {
    throw new Error("IHDR chunk not found in the first image");
  }

  const width = new DataView(ihdrChunk.data.buffer).getUint32(0);
  const height = new DataView(ihdrChunk.data.buffer).getUint32(4);

  // Add all chunks before IDAT
  for (const chunk of firstImageChunks) {
    if (chunk.type === "IDAT") {
      break;
    }
    chunks.push(createChunk(chunk.type, chunk.data));
  }

  chunks.push(createActlChunk(images.length));

  let sequenceNumber = 0;

  for (let i = 0; i < images.length; i++) {
    chunks.push(createFctlChunk(sequenceNumber++, width, height, delay));

    const imageChunks = extractAllChunks(images[i]);
    const idatChunks = imageChunks
      .filter((chunk) => chunk.type === "IDAT")
      .map((chunk) => chunk.data);

    if (i === 0) {
      for (const idatData of idatChunks) {
        chunks.push(createChunk("IDAT", idatData));
      }
    } else {
      chunks.push(...createFdatChunks(idatChunks, sequenceNumber));
      sequenceNumber += idatChunks.length;
    }
  }

  chunks.push(createChunk("IEND", new Uint8Array(0)));

  const newPngData = concatenateUint8Arrays(chunks);

  return {
    blob: new Blob([newPngData], { type: "image/png" }),
    data: newPngData,
  };
};

const createFdatChunks = (
  idatChunks: Uint8Array[],
  startSequenceNumber: number
): Uint8Array[] => {
  return idatChunks.map((idatChunk, index) => {
    const fdatData = new Uint8Array(idatChunk.length + 4);
    new DataView(fdatData.buffer).setUint32(0, startSequenceNumber + index);
    fdatData.set(idatChunk, 4);
    return createChunk("fdAT", fdatData);
  });
};

interface PNGChunk {
  type: string;
  data: Uint8Array;
}

const extractAllChunks = (pngData: Uint8Array): PNGChunk[] => {
  const chunks: PNGChunk[] = [];
  let offset = 8; // Skip PNG signature

  while (offset < pngData.length) {
    const chunkLength = new DataView(pngData.buffer, offset).getUint32(0);
    const chunkType = new TextDecoder().decode(
      pngData.slice(offset + 4, offset + 8)
    );
    const chunkData = pngData.slice(offset + 8, offset + 8 + chunkLength);

    chunks.push({ type: chunkType, data: chunkData });

    offset += chunkLength + 12; // 12 = 4(length) + 4(type) + 4(crc)

    if (chunkType === "IEND") {
      break;
    }
  }

  return chunks;
};

const createActlChunk = (numFrames: number): Uint8Array => {
  const data = new Uint8Array(8);
  const view = new DataView(data.buffer);
  view.setUint32(0, numFrames);
  view.setUint32(4, 0);
  return createChunk("acTL", data);
};

const createFctlChunk = (
  sequenceNumber: number,
  width: number,
  height: number,
  delay: number
): Uint8Array => {
  const data = new Uint8Array(26);
  const view = new DataView(data.buffer);
  view.setUint32(0, sequenceNumber);
  view.setUint32(4, width);
  view.setUint32(8, height);
  view.setUint32(12, 0);
  view.setUint32(16, 0);
  view.setUint16(20, delay);
  view.setUint16(22, 1000);
  view.setUint8(24, 0);
  view.setUint8(25, 0);
  return createChunk("fcTL", data);
};

const createChunk = (type: string, data: Uint8Array): Uint8Array => {
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, data.length);

  const typeArray = new TextEncoder().encode(type);

  const crc = new Uint8Array(4);
  const crcData = new Uint8Array(typeArray.length + data.length);
  crcData.set(typeArray);
  crcData.set(data, typeArray.length);
  new DataView(crc.buffer).setUint32(0, crc32(crcData));

  const chunk = new Uint8Array(
    length.length + typeArray.length + data.length + crc.length
  );
  chunk.set(length);
  chunk.set(typeArray, length.length);
  chunk.set(data, length.length + typeArray.length);
  chunk.set(crc, length.length + typeArray.length + data.length);

  return chunk;
};

const crc32 = (() => {
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[i] = c;
  }

  return (data: Uint8Array): number => {
    let crc = -1;
    for (let i = 0; i < data.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  };
})();

const concatenateUint8Arrays = (arrays: Uint8Array[]): Uint8Array => {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
};

export const convertToAPNG = async (
  images: Uint8Array[],
  delay = 100
): Promise<{ url: string; data: Uint8Array } | undefined> => {
  try {
    const { blob, data } = await createAPNG(images, delay);
    const url = URL.createObjectURL(blob);
    return { url, data };
  } catch (error) {
    console.error("Error converting to APNG:", error);
    return undefined;
  }
};

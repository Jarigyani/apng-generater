// Define the PNG file signature
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

// Fetch an image from a URL and return it as a Uint8Array
export const fetchImage = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url);
  return new Uint8Array(await response.arrayBuffer());
};

// Main function to create an APNG from an array of PNG images
const createAPNG = async (
  images: Uint8Array[],
  delay: number
): Promise<{ blob: Blob; binary: Uint8Array }> => {
  const firstImage = images[0];
  const chunks: Uint8Array[] = [PNG_SIGNATURE];

  // Extract all chunks from the first image
  const firstImageChunks = extractAllChunks(firstImage);
  const ihdrChunk = firstImageChunks.find((chunk) => chunk.type === "IHDR");
  if (!ihdrChunk) {
    throw new Error("IHDR chunk not found in the first image");
  }

  // Get width and height from the IHDR chunk
  const width = new DataView(ihdrChunk.data.buffer).getUint32(0);
  const height = new DataView(ihdrChunk.data.buffer).getUint32(4);

  // Add all chunks before IDAT from the first image
  for (const chunk of firstImageChunks) {
    if (chunk.type === "IDAT") {
      break;
    }
    chunks.push(createChunk(chunk.type, chunk.data));
  }

  // Add the acTL (Animation Control) chunk
  chunks.push(createActlChunk(images.length));

  let sequenceNumber = 0;

  // Process each image
  for (let i = 0; i < images.length; i++) {
    // Add fcTL (Frame Control) chunk for each frame
    chunks.push(createFctlChunk(sequenceNumber++, width, height, delay));

    const imageChunks = extractAllChunks(images[i]);
    const idatChunks = imageChunks
      .filter((chunk) => chunk.type === "IDAT")
      .map((chunk) => chunk.data);

    if (i === 0) {
      // For the first image, add IDAT chunks as-is
      for (const idatData of idatChunks) {
        chunks.push(createChunk("IDAT", idatData));
      }
    } else {
      // For subsequent images, convert IDAT chunks to fdAT chunks
      chunks.push(...createFdatChunks(idatChunks, sequenceNumber));
      sequenceNumber += idatChunks.length;
    }
  }

  // Add the IEND chunk to signify the end of the PNG file
  chunks.push(createChunk("IEND", new Uint8Array(0)));

  // Combine all chunks into a single Uint8Array
  const newPngData = concatenateUint8Arrays(chunks);

  return {
    blob: new Blob([newPngData], { type: "image/png" }),
    binary: newPngData,
  };
};

// Convert IDAT chunks to fdAT chunks for APNG
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

// Interface for PNG chunks
interface PNGChunk {
  type: string;
  data: Uint8Array;
}

// Extract all chunks from a PNG file
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

// Create the acTL (Animation Control) chunk
const createActlChunk = (numFrames: number): Uint8Array => {
  const data = new Uint8Array(8);
  const view = new DataView(data.buffer);
  view.setUint32(0, numFrames);
  view.setUint32(4, 0); // Number of times to loop (0 = infinite)
  return createChunk("acTL", data);
};

// Create the fcTL (Frame Control) chunk
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
  view.setUint32(12, 0); // x offset
  view.setUint32(16, 0); // y offset
  view.setUint16(20, delay); // delay numerator
  view.setUint16(22, 1000); // delay denominator
  view.setUint8(24, 0); // dispose op
  view.setUint8(25, 0); // blend op
  return createChunk("fcTL", data);
};

// Create a generic PNG chunk
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

// Calculate CRC32 for chunk data
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

// Concatenate multiple Uint8Arrays into a single Uint8Array
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

// Main function to convert an array of PNGs to an APNG
export const convertToAPNG = async (
  images: Uint8Array[],
  delay = 100
): Promise<
  { url: string; binary: Uint8Array; processingTime: string } | undefined
> => {
  try {
    const start = performance.now();
    const { blob, binary } = await createAPNG(images, delay);
    const url = URL.createObjectURL(blob);
    const processingTime = (performance.now() - start).toFixed(1);
    return { url, binary, processingTime };
  } catch (error) {
    console.error("Error converting to APNG:", error);
    return undefined;
  }
};

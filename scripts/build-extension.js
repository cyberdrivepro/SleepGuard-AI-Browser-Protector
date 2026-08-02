const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const rootDir = path.resolve(__dirname, '..');
const extensionDir = path.join(rootDir, 'extension');
const distDir = path.join(rootDir, 'dist');
const zipFileName = 'SleepGuard-Pro-v11.0.0.zip';
const zipFilePath = path.join(distDir, zipFileName);

console.log('📦 Packaging SleepGuard Pro Extension ZIP using pure Node.js...');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

function getAllFiles(dirPath, arrayOfFiles = [], relativeBase = dirPath) {
  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles, relativeBase);
    } else {
      const relativePath = path.relative(relativeBase, fullPath).replace(/\\/g, '/');
      arrayOfFiles.push({ fullPath, relativePath });
    }
  });
  return arrayOfFiles;
}

// Minimal Pure Node ZIP Encoder (No external dependencies required)
function createZip(fileList, outputPath) {
  const localHeaders = [];
  const centralDirectories = [];
  let currentOffset = 0;

  fileList.forEach(({ fullPath, relativePath }) => {
    const fileData = fs.readFileSync(fullPath);
    const compressedData = zlib.deflateRawSync(fileData);

    const crc32 = calcCrc32(fileData);
    const fileNameBuffer = Buffer.from(relativePath, 'utf8');

    // Local Header
    const localHeader = Buffer.alloc(30 + fileNameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local header signature
    localHeader.writeUInt16LE(20, 4);         // Version needed
    localHeader.writeUInt16LE(0, 6);          // General purpose bit flag
    localHeader.writeUInt16LE(8, 8);          // Compression method (deflate)
    localHeader.writeUInt16LE(0, 10);         // Last mod time
    localHeader.writeUInt16LE(0, 12);         // Last mod date
    localHeader.writeUInt32LE(crc32, 14);     // CRC32
    localHeader.writeUInt32LE(compressedData.length, 18); // Compressed size
    localHeader.writeUInt32LE(fileData.length, 22);       // Uncompressed size
    localHeader.writeUInt16LE(fileNameBuffer.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28);         // Extra field length
    fileNameBuffer.copy(localHeader, 30);

    // Central Directory Header
    const cdHeader = Buffer.alloc(46 + fileNameBuffer.length);
    cdHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
    cdHeader.writeUInt16LE(20, 4);        // Version made by
    cdHeader.writeUInt16LE(20, 6);        // Version needed
    cdHeader.writeUInt16LE(0, 8);         // Bit flag
    cdHeader.writeUInt16LE(8, 10);        // Compression method (deflate)
    cdHeader.writeUInt16LE(0, 12);        // Time
    cdHeader.writeUInt16LE(0, 14);        // Date
    cdHeader.writeUInt32LE(crc32, 16);    // CRC32
    cdHeader.writeUInt32LE(compressedData.length, 20); // Compressed size
    cdHeader.writeUInt32LE(fileData.length, 24);       // Uncompressed size
    cdHeader.writeUInt16LE(fileNameBuffer.length, 28); // File name length
    cdHeader.writeUInt16LE(0, 30);        // Extra field length
    cdHeader.writeUInt16LE(0, 32);        // Comment length
    cdHeader.writeUInt16LE(0, 34);        // Disk start
    cdHeader.writeUInt16LE(0, 36);        // Internal attrs
    cdHeader.writeUInt32LE(0, 38);        // External attrs
    cdHeader.writeUInt32LE(currentOffset, 42); // Relative offset of local header
    fileNameBuffer.copy(cdHeader, 46);

    localHeaders.push(localHeader, compressedData);
    centralDirectories.push(cdHeader);

    currentOffset += localHeader.length + compressedData.length;
  });

  const cdStartOffset = currentOffset;
  let cdSize = 0;
  centralDirectories.forEach(cd => cdSize += cd.length);

  // End of Central Directory Record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4);          // Disk number
  eocd.writeUInt16LE(0, 6);          // Start disk
  eocd.writeUInt16LE(fileList.length, 8);  // Total entries this disk
  eocd.writeUInt16LE(fileList.length, 10); // Total entries
  eocd.writeUInt32LE(cdSize, 12);          // Size of central directory
  eocd.writeUInt32LE(cdStartOffset, 16);   // Offset of start of central directory
  eocd.writeUInt16LE(0, 20);          // Comment length

  const finalZipBuffer = Buffer.concat([...localHeaders, ...centralDirectories, eocd]);
  fs.writeFileSync(outputPath, finalZipBuffer);
}

// CRC32 calculation table
function calcCrc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    let c = (crc ^ buf[i]) & 0xff;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ -1) >>> 0;
}

try {
  const files = getAllFiles(extensionDir);
  createZip(files, zipFilePath);
  console.log(`✅ Extension successfully packaged (${files.length} files): ${zipFilePath}`);
} catch (err) {
  console.error('❌ Build failed:', err);
  process.exit(1);
}

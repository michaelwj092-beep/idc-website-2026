/**
 * IDC Image Compression Script
 * 
 * Compresses heavy JPEG, PNG, and SVG assets in-place.
 * Dependencies: sharp, svgo
 * 
 * Run with: node compress-images.js
 */

const fs = require('fs').promises;
const path = require('path');

// 1. Check if sharp and svgo are installed
let sharp;
let svgo;

try {
  sharp = require('sharp');
} catch (e) {
  // sharp not installed
}

try {
  svgo = require('svgo');
} catch (e) {
  // svgo not installed
}

if (!sharp || !svgo) {
  console.error('\n❌ Missing required dependencies!');
  console.error('This script requires "sharp" and "svgo" to run.');
  console.error('\nPlease install them by running:');
  console.error('  npm install sharp svgo\n');
  process.exit(1);
}

// 2. Define files and compression targets
const tasks = [
  // --- JPEG COMPRESSION (quality 75, progressive) ---
  {
    name: 'black-overlay-abstract-background.jpg',
    path: path.join(__dirname, 'assets/black-overlay-abstract-background.jpg'),
    type: 'jpeg',
    targetDesc: 'target under 300 KB',
    targetBytes: 300 * 1024,
    quality: 75,
    progressive: true,
    maxWidth: 2560 // Downscales 4032px camera raw width to 2560px (4K crisp web resolution)
  },
  {
    name: 'black-watercolor.jpg',
    path: path.join(__dirname, 'assets/black-watercolor.jpg'),
    type: 'jpeg',
    targetDesc: 'target under 300 KB',
    targetBytes: 300 * 1024,
    quality: 75,
    progressive: true,
    maxWidth: 2560 // Downscales 4840px raw width to 2560px
  },

  // --- PNG COMPRESSION (in-place PNG compression) ---
  {
    name: 'IDC_splatter_border_gradient.png',
    path: path.join(__dirname, 'assets/IDC_splatter_border_gradient.png'),
    type: 'png',
    targetDesc: 'target under 200 KB',
    targetBytes: 200 * 1024
  },
  {
    name: 'grace-community-desktop.png',
    path: path.join(__dirname, 'assets/approved assets/grace-community-desktop.png'),
    type: 'png',
    targetDesc: 'target under 200 KB',
    targetBytes: 200 * 1024
  },
  {
    name: 'cal-industries-desktop.png',
    path: path.join(__dirname, 'assets/cal-industries-desktop.png'),
    type: 'png',
    targetDesc: 'target under 200 KB',
    targetBytes: 200 * 1024
  },
  {
    name: 'unpacktogether-desktop.png',
    path: path.join(__dirname, 'assets/unpacktogether-desktop.png'),
    type: 'png',
    targetDesc: 'maximum quality (compression level 1, unquantized)',
    compressionLevel: 1,
    palette: false,
    quality: 100,
    skipSecondaryReduction: true
  },
  {
    name: 'pinpoint-preview.png',
    path: path.join(__dirname, 'assets/approved assets/pinpoint-preview.png'),
    type: 'png',
    targetDesc: 'target under 150 KB',
    targetBytes: 150 * 1024
  },

  // --- SVG OPTIMIZATION ---
  {
    name: 'GCC-Logo.svg',
    path: path.join(__dirname, 'assets/approved assets/concept-page-assets/GCC-Logo.svg'),
    type: 'svg',
    targetDesc: 'target under 100 KB',
    targetBytes: 100 * 1024
  }
];

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function compressJpeg(task, inputBuffer) {
  const meta = await sharp(inputBuffer).metadata();
  let pipeline = sharp(inputBuffer);

  if (task.maxWidth && meta.width && meta.width > task.maxWidth) {
    pipeline = pipeline.resize({ width: task.maxWidth, withoutEnlargement: true });
  }

  let outputBuffer = await pipeline
    .jpeg({ quality: task.quality, progressive: task.progressive, mozjpeg: true })
    .toBuffer();

  // If still exceeds target and width is greater than 1920px, scale to 1920px
  if (outputBuffer.length > task.targetBytes && meta.width > 1920) {
    outputBuffer = await sharp(inputBuffer)
      .resize({ width: 1920, withoutEnlargement: true })
      .jpeg({ quality: task.quality, progressive: task.progressive, mozjpeg: true })
      .toBuffer();
  }

  return outputBuffer;
}

async function compressPng(task, inputBuffer) {
  if (task.compressionLevel === 1 && task.skipSecondaryReduction) {
    return await sharp(inputBuffer)
      .toColorspace('srgb')
      .png({
        compressionLevel: 1,
        palette: false,
        quality: 100
      })
      .toBuffer();
  }

  // Use sharp with 8-bit palette quantization and max compression level
  let outputBuffer = await sharp(inputBuffer)
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: true,
      quality: 80,
      effort: 7
    })
    .toBuffer();

  // Fine-tune if still over target
  if (outputBuffer.length > task.targetBytes) {
    outputBuffer = await sharp(inputBuffer)
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: true,
        quality: 68,
        effort: 9
      })
      .toBuffer();
  }

  return outputBuffer;
}

async function compressSvg(task) {
  let svgContent = await fs.readFile(task.path, 'utf8');

  // GCC-Logo.svg contains two large embedded base64 JPEG textures
  // Optimize inner base64 JPEG images to hit the target under 100 KB
  const base64Regex = /data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)/g;
  let match;
  const replacements = [];

  while ((match = base64Regex.exec(svgContent)) !== null) {
    const fullMatch = match[0];
    const base64Data = match[2];
    const imgBuf = Buffer.from(base64Data, 'base64');
    try {
      const compressedImgBuf = await sharp(imgBuf)
        .resize({ width: 600, withoutEnlargement: true })
        .jpeg({ quality: 65, progressive: true, mozjpeg: true })
        .toBuffer();

      replacements.push({
        original: fullMatch,
        replacement: `data:image/jpeg;base64,${compressedImgBuf.toString('base64')}`
      });
    } catch (err) {
      // Continue without modifying inner image if sharp can't parse it
    }
  }

  for (const rep of replacements) {
    svgContent = svgContent.replace(rep.original, rep.replacement);
  }

  // Run SVGO optimization
  const svgoResult = svgo.optimize(svgContent, {
    path: task.path,
    multipass: true,
    plugins: [
      'preset-default',
      'removeDimensions'
    ]
  });

  const finalData = svgoResult.data || svgContent;
  return Buffer.from(finalData, 'utf8');
}

async function main() {
  console.log('==================================================');
  console.log('🖼️  IDC Website Image Compression Tool');
  console.log('==================================================');

  let totalBefore = 0;
  let totalAfter = 0;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const relPath = path.relative(__dirname, task.path);
    console.log(`\n[${i + 1}/${tasks.length}] Processing: ${relPath}`);

    try {
      // Check if file exists
      let statBefore;
      try {
        statBefore = await fs.stat(task.path);
      } catch (err) {
        console.warn(`  ⚠️  File not found: ${relPath} (Skipping)`);
        failCount++;
        continue;
      }

      const beforeBytes = statBefore.size;
      totalBefore += beforeBytes;

      let outputBuffer;
      if (task.type === 'jpeg') {
        const inputBuffer = await fs.readFile(task.path);
        outputBuffer = await compressJpeg(task, inputBuffer);
      } else if (task.type === 'png') {
        const inputBuffer = await fs.readFile(task.path);
        outputBuffer = await compressPng(task, inputBuffer);
      } else if (task.type === 'svg') {
        outputBuffer = await compressSvg(task);
      }

      // Write compressed buffer back to original path in-place
      await fs.writeFile(task.path, outputBuffer);

      const afterBytes = outputBuffer.length;
      totalAfter += afterBytes;
      successCount++;

      const percent = ((1 - afterBytes / beforeBytes) * 100).toFixed(1);
      const isTargetMet = afterBytes <= task.targetBytes;
      const statusIcon = isTargetMet ? '✅' : 'ℹ️';

      console.log(`  Before: ${formatBytes(beforeBytes)}`);
      console.log(`  After:  ${formatBytes(afterBytes)} (${percent}% reduction)`);
      console.log(`  Target: ${task.targetDesc} ${statusIcon} (${formatBytes(task.targetBytes)})`);

    } catch (err) {
      console.error(`  ❌ Error processing ${task.name}: ${err.message}`);
      failCount++;
    }
  }

  console.log('\n==================================================');
  console.log('🏁 Compression Summary');
  console.log('==================================================');
  console.log(`Files Processed:      ${successCount} succeeded, ${failCount} failed`);
  if (totalBefore > 0) {
    const totalSaved = totalBefore - totalAfter;
    const totalPercent = ((totalSaved / totalBefore) * 100).toFixed(1);
    console.log(`Total Original Size:   ${formatBytes(totalBefore)}`);
    console.log(`Total Compressed Size: ${formatBytes(totalAfter)}`);
    console.log(`Total Bandwidth Saved: ${formatBytes(totalSaved)} (${totalPercent}% reduction)`);
  }
  console.log('==================================================\n');
}

main().catch(err => {
  console.error('Fatal error running compression:', err);
  process.exit(1);
});

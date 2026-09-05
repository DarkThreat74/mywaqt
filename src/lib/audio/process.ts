import 'server-only';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Set ffmpeg binary path
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export interface ProcessingOptions {
  targetLufs?: number;       // Target loudness (default: -16 LUFS, web standard)
  silenceThreshold?: number; // dB threshold for silence detection (default: -40 dB)
  silenceDuration?: number;  // Min silence duration to remove (default: 0.5s)
  enableNoiseReduction?: boolean;  // Apply afftdn denoise filter
  enableLoudnessNormalization?: boolean; // Apply loudnorm filter
}

export const DEFAULT_PROCESSING_OPTIONS: ProcessingOptions = {
  targetLufs: -16,
  silenceThreshold: -40,
  silenceDuration: 0.5,
  enableNoiseReduction: true,
  enableLoudnessNormalization: true,
};

/**
 * Process an audio file with FFmpeg:
 * 1. Remove silence below threshold
 * 2. Apply noise reduction (afftdn)
 * 3. Normalize loudness to target LUFS (loudnorm)
 * 4. Apply dynamic audio normalization (dynaudnorm) for consistent volume
 *
 * Returns the processed audio as a Buffer.
 */
export async function processAudio(
  inputBuffer: Buffer,
  options: ProcessingOptions = DEFAULT_PROCESSING_OPTIONS,
): Promise<Buffer> {
  const opts = { ...DEFAULT_PROCESSING_OPTIONS, ...options };
  const tmpDir = join(tmpdir(), 'waqt-audio-processing');
  await mkdir(tmpDir, { recursive: true });

  const inputPath = join(tmpDir, `input-${Date.now()}.mp3`);
  const outputPath = join(tmpDir, `output-${Date.now()}.mp3`);

  try {
    // Write input buffer to temp file
    await writeFile(inputPath, inputBuffer);

    // Build FFmpeg filter chain
    const filters: string[] = [];

    // 1. Remove silence (silenceremove)
    filters.push(
      `silenceremove=start_periods=1:start_duration=${opts.silenceDuration}:start_threshold=${opts.silenceThreshold}dB:detection=peak`,
    );

    // 2. Noise reduction (afftdn) — conservative settings
    if (opts.enableNoiseReduction) {
      filters.push('afftdn=nr=10:nf=-25');
    }

    // 3. High-pass filter to remove rumble
    filters.push('highpass=f=80');

    // 4. Loudness normalization (loudnorm) — two-pass would be ideal but single-pass is more practical for serverless
    if (opts.enableLoudnessNormalization) {
      filters.push(
        `loudnorm=I=${opts.targetLufs}:TP=-1.5:LRA=11`,
      );
    }

    // 5. Dynamic audio normalization for consistent volume throughout
    filters.push('dynaudnorm=f=150:g=15:p=0.9');

    const filterComplex = filters.join(',');

    // Run FFmpeg
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .audioFrequency(44100)
        .audioChannels(2)
        .complexFilter(filterComplex)
        .outputOptions(['-map_metadata -1'])
        .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
        .on('end', () => resolve())
        .save(outputPath);
    });

    // Read processed output
    const processedBuffer = await readFile(outputPath);
    return processedBuffer;
  } finally {
    // Clean up temp files (best-effort)
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

/**
 * Get audio duration in seconds using FFprobe.
 */
export async function getAudioDuration(buffer: Buffer): Promise<number> {
  const tmpDir = join(tmpdir(), 'waqt-audio-probe');
  await mkdir(tmpDir, { recursive: true });
  const tmpPath = join(tmpDir, `probe-${Date.now()}.mp3`);

  try {
    await writeFile(tmpPath, buffer);
    return await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(tmpPath, (err, data) => {
        if (err) { reject(err); return; }
        const duration = data.format?.duration;
        resolve(duration ? Math.round(typeof duration === 'string' ? parseFloat(duration) : duration) : 0);
      });
    });
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

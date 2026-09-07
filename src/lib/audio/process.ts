import 'server-only';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { writeFile, readFile, unlink, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Set ffmpeg binary path
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

// Verify the ffmpeg binary exists at the resolved path. On Vercel serverless,
// the binary may not be bundled correctly — we catch this early with a clear
// error message instead of a cryptic ENOENT spawn error during processing.
let ffmpegBinaryChecked = false;
async function verifyFfmpegBinary(): Promise<void> {
  if (ffmpegBinaryChecked) return;
  if (!ffmpegPath) {
    throw new Error(
      'FFmpeg binary path is not resolved. The ffmpeg-static package may not be installed correctly. ' +
      'Run `pnpm install` to ensure all dependencies are present.'
    );
  }
  try {
    await access(ffmpegPath);
    ffmpegBinaryChecked = true;
  } catch {
    throw new Error(
      `FFmpeg binary not found at expected path: ${ffmpegPath}. ` +
      'This is a deployment/bundling issue — the ffmpeg-static binary was not included in the serverless function bundle. ' +
      'Ensure ffmpeg-static is in your dependencies and not excluded by build configuration.'
    );
  }
}

export interface ProcessingOptions {
  targetLufs?: number;          // Target loudness (default: -16 LUFS, web standard)
  truePeak?: number;            // Max true peak in dB (default: -1.0)
  lra?: number;                 // Loudness range target (default: 11)
  silenceThreshold?: number;    // dB threshold for silence detection (default: -45 dB)
  silenceDuration?: number;     // Min silence duration to remove in seconds (default: 0.7s)
  silencePadding?: number;      // Padding to keep around speech in seconds (default: 1.5s)
  enableNoiseReduction?: boolean;     // Apply afftdn denoise filter
  enableLoudnessNormalization?: boolean; // Apply two-pass loudnorm
  enableDeEssing?: boolean;     // Reduce harsh sibilance
  enableSpeechEQ?: boolean;     // Boost speech intelligibility
  enableLimiter?: boolean;      // Soft limiter to prevent clipping
  noiseReductionStrength?: number; // 0-30, higher = more aggressive (default: 12)
  mp3Bitrate?: string;          // Output MP3 bitrate (default: '160k')
}

export const DEFAULT_PROCESSING_OPTIONS: ProcessingOptions = {
  targetLufs: -16,
  truePeak: -1.0,
  lra: 11,
  silenceThreshold: -45,
  silenceDuration: 0.7,
  silencePadding: 1.5,
  enableNoiseReduction: true,
  enableLoudnessNormalization: true,
  enableDeEssing: true,
  enableSpeechEQ: true,
  enableLimiter: true,
  noiseReductionStrength: 12,
  // 64k mono 22050 Hz — ~75% smaller than 160k stereo 44100 Hz.
  // Speech has no stereo content and little above 16kHz, so this
  // cuts a 16MB file to ~4MB with no perceptible quality loss for voice.
  mp3Bitrate: '64k',
};

export interface ProcessingResult {
  buffer: Buffer;
  duration: number;
  originalLufs?: number;
  finalLufs?: number;
  originalSize: number;
  processedSize: number;
}

export interface AudioProbeInfo {
  duration: number;
  sampleRate: number;
  channels: number;
  bitrate: number;
  codec: string;
}

/**
 * Probe audio file metadata using FFmpeg (not FFprobe).
 *
 * Why not FFprobe? The `ffprobe-static` package ships platform-specific
 * binaries in subdirectories that don't get bundled correctly on Vercel
 * serverless — the binary exists in node_modules locally but is missing
 * from the deployed function, causing `spawn ... ENOENT` errors.
 *
 * FFmpeg can output the same metadata to stderr when given `-i <input>`.
 * We parse the stderr output for duration, sample rate, channels, and codec.
 * This uses only the `ffmpeg-static` binary, which is known to work on Vercel.
 */
async function probeAudioPath(filePath: string): Promise<AudioProbeInfo> {
  await verifyFfmpegBinary();

  return new Promise<AudioProbeInfo>((resolve, reject) => {
    let stderrData = '';

    const command = ffmpeg(filePath)
      .format('null')
      .outputOptions(['-f null']);

    command.on('stderr', (line: string) => {
      stderrData += line + '\n';
    });

    command.on('error', (err: Error) => {
      // Even on "error", FFmpeg may have output metadata to stderr.
      // The -f null output with no audio codec will produce an error,
      // but the input metadata is still in stderr. Try to parse it.
      const info = parseFfmpegStderr(stderrData);
      if (info) {
        resolve(info);
      } else {
        reject(new Error(`Audio probing failed: ${err.message}`));
      }
    });

    command.on('end', () => {
      const info = parseFfmpegStderr(stderrData);
      if (info) {
        resolve(info);
      } else {
        // Fallback: couldn't parse stderr, return defaults
        resolve({
          duration: 0,
          sampleRate: 44100,
          channels: 2,
          bitrate: 0,
          codec: 'unknown',
        });
      }
    });

    // Save to /dev/null (or NUL on Windows) — we only want the stderr metadata
    command.save(process.platform === 'win32' ? 'NUL' : '/dev/null');
  });
}

/**
 * Parse FFmpeg stderr output for audio metadata.
 *
 * FFmpeg outputs lines like:
 *   Duration: 00:03:45.23, start: 0.000000, bitrate: 160 kb/s
 *   Stream #0:1: Audio: mp3, 44100 Hz, stereo, fltp, 160 kb/s
 */
function parseFfmpegStderr(stderr: string): AudioProbeInfo | null {
  // Parse duration: "Duration: 00:03:45.23"
  const durationMatch = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  let duration = 0;
  if (durationMatch) {
    const hours = parseInt(durationMatch[1], 10);
    const minutes = parseInt(durationMatch[2], 10);
    const seconds = parseFloat(durationMatch[3]);
    duration = Math.round(hours * 3600 + minutes * 60 + seconds);
  }

  // Parse audio stream: "Audio: mp3, 44100 Hz, stereo, fltp, 160 kb/s"
  const streamMatch = stderr.match(/Audio:\s*(\w+),\s*(\d+)\s*Hz,\s*(mono|stereo|\d+\s*channels)/);
  let sampleRate = 44100;
  let channels = 2;
  let codec = 'unknown';
  if (streamMatch) {
    codec = streamMatch[1];
    sampleRate = parseInt(streamMatch[2], 10) || 44100;
    const chanStr = streamMatch[3].toLowerCase();
    if (chanStr === 'mono') channels = 1;
    else if (chanStr === 'stereo') channels = 2;
    else channels = parseInt(chanStr, 10) || 2;
  }

  // Parse bitrate: "bitrate: 160 kb/s"
  const bitrateMatch = stderr.match(/bitrate:\s*(\d+)\s*kb\/s/);
  const bitrate = bitrateMatch ? parseInt(bitrateMatch[1], 10) * 1000 : 0;

  // Return null only if we couldn't parse anything at all
  if (!durationMatch && !streamMatch) return null;

  return { duration, sampleRate, channels, bitrate, codec };
}

export async function probeAudio(buffer: Buffer): Promise<AudioProbeInfo> {
  await verifyFfmpegBinary();
  const tmpDir = join(tmpdir(), 'waqt-audio-probe');
  await mkdir(tmpDir, { recursive: true });
  const tmpPath = join(tmpDir, `probe-${Date.now()}.mp3`);

  try {
    await writeFile(tmpPath, buffer);
    return await probeAudioPath(tmpPath);
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

/**
 * Get audio duration in seconds using FFprobe (convenience wrapper).
 */
export async function getAudioDuration(buffer: Buffer): Promise<number> {
  return (await probeAudio(buffer)).duration;
}

/**
 * First pass of loudnorm: analyze the audio to measure true loudness.
 * Returns the measured values needed for the second pass.
 */
async function measureLoudness(
  inputPath: string,
  opts: ProcessingOptions,
): Promise<{
  measuredI: number;
  measuredTP: number;
  measuredLRA: number;
  measuredThreshold: number;
  targetOffset: number;
}> {
  return new Promise((resolve, reject) => {
    const filter = `loudnorm=I=${opts.targetLufs}:TP=${opts.truePeak}:LRA=${opts.lra}:print_format=json`;

    let stderrData = '';

    const command = ffmpeg(inputPath)
      .audioCodec('pcm_s16le')
      .format('null')
      .complexFilter(filter)
      .outputOptions(['-map_metadata -1', '-f null'])
      .on('error', (err) => reject(new Error(`Loudness measurement failed: ${err.message}`)))
      .on('end', () => {
        // Parse the JSON output from stderr
        try {
          const jsonMatch = stderrData.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            reject(new Error('Could not find loudness measurement JSON in FFmpeg output'));
            return;
          }
          const parsed = JSON.parse(jsonMatch[0]);
          resolve({
            measuredI: parseFloat(parsed.input_i),
            measuredTP: parseFloat(parsed.input_tp),
            measuredLRA: parseFloat(parsed.input_lra),
            measuredThreshold: parseFloat(parsed.input_thresh),
            targetOffset: parseFloat(parsed.target_offset),
          });
        } catch (parseErr) {
          reject(new Error(`Failed to parse loudness measurement: ${parseErr}`));
        }
      });

    // Capture stderr for JSON output
    command.on('stderr', (line) => {
      stderrData += line + '\n';
    });

    command.save('-');
  });
}

/**
 * Process an audio file with FFmpeg using a professional pipeline:
 *
 * Pass 1 (if loudness normalization enabled):
 *   - Measure true integrated loudness (LUFS), true peak, and loudness range
 *
 * Pass 2 (main processing):
 *   1. Remove silence (RMS-based detection, preserves short pauses for natural speech)
 *   2. High-pass filter (remove low rumble below 80Hz)
 *   3. Low-pass filter (remove high-frequency noise above 16kHz)
 *   4. Noise reduction (afftdn — adaptive FFT denoising)
 *   5. De-essing (reduce harsh sibilance around 6-8kHz)
 *   6. Speech EQ (gentle presence boost around 3kHz for intelligibility)
 *   7. Two-pass loudness normalization (true EBU R128 compliance)
 *   8. Dynamic audio normalization (consistent volume throughout)
 *   9. Soft limiter (prevent any clipping from normalization)
 *
 * Returns the processed audio as a Buffer with metadata.
 */
export async function processAudio(
  inputBuffer: Buffer,
  options: ProcessingOptions = DEFAULT_PROCESSING_OPTIONS,
): Promise<Buffer> {
  const result = await processAudioWithMetadata(inputBuffer, options);
  return result.buffer;
}

/**
 * Full processing pipeline with metadata about the result.
 */
export async function processAudioWithMetadata(
  inputBuffer: Buffer,
  options: ProcessingOptions = DEFAULT_PROCESSING_OPTIONS,
): Promise<ProcessingResult> {
  const opts = { ...DEFAULT_PROCESSING_OPTIONS, ...options };

  // Verify ffmpeg binary exists before starting any work
  await verifyFfmpegBinary();

  const tmpDir = join(tmpdir(), 'waqt-audio-processing');
  await mkdir(tmpDir, { recursive: true });

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inputPath = join(tmpDir, `input-${id}.mp3`);
  const outputPath = join(tmpDir, `output-${id}.mp3`);

  try {
    await writeFile(inputPath, inputBuffer);

    // Probe the original audio
    const probe = await probeAudioPath(inputPath);

    // ── Pass 1: Measure loudness (if normalization enabled) ──
    let loudnessMeasurements: Awaited<ReturnType<typeof measureLoudness>> | null = null;
    if (opts.enableLoudnessNormalization) {
      try {
        loudnessMeasurements = await measureLoudness(inputPath, opts);
      } catch (err) {
        // If measurement fails, fall back to single-pass loudnorm
        console.warn('[audio:process] Loudness measurement failed, falling back to single-pass:', err);
      }
    }

    // ── Pass 2: Main processing chain ──
    const filters: string[] = [];

    // 1. Remove silence — RMS detection is more natural than peak
    //    start_periods=1 removes leading silence only
    //    stop_periods=-1 removes ALL subsequent silences (with padding)
    //    detection=rms is more natural for speech
    //    leave_padding keeps a small gap so speech doesn't feel cut
    const padding = opts.silencePadding!;
    filters.push(
      `silenceremove=` +
      `start_periods=1:start_duration=${opts.silenceDuration}:start_threshold=${opts.silenceThreshold}dB:start_silence=${padding}:` +
      `stop_periods=-1:stop_duration=${opts.silenceDuration}:stop_threshold=${opts.silenceThreshold}dB:stop_silence=${padding}:` +
      `detection=rms:window=0.02`
    );

    // 2. High-pass filter — remove low-frequency rumble (HVAC, traffic, mic handling)
    filters.push('highpass=f=80');

    // 3. Low-pass filter — remove high-frequency hiss above 16kHz
    //    Speech rarely has useful content above 16kHz; removing it cleans up noise
    filters.push('lowpass=f=16000');

    // 4. Noise reduction — afftdn (adaptive FFT denoising)
    //    nr = noise reduction strength (0-97, we use conservative 12)
    //    nf = noise floor in dB
    if (opts.enableNoiseReduction) {
      const nr = Math.min(30, Math.max(0, opts.noiseReductionStrength || 12));
      filters.push(`afftdn=nr=${nr}:nf=-25`);
    }

    // 5. De-essing — reduce harsh sibilance (s, sh, ch sounds)
    //    Uses a highshelf cut around 6kHz with moderate gain reduction
    if (opts.enableDeEssing) {
      filters.push('highshelf=f=6000:g=-4:t=q:w=1');
    }

    // 6. Speech EQ — gentle presence boost around 3kHz for intelligibility
    //    This is the frequency range where human hearing is most sensitive
    //    to consonant sounds that make speech understandable
    if (opts.enableSpeechEQ) {
      filters.push('equalizer=f=3000:g=2:t=q:w=1');
      // Slight warmth boost around 200Hz for fuller voice
      filters.push('equalizer=f=200:g=1:t=q:w=1');
    }

    // 7. Loudness normalization — two-pass EBU R128 if we have measurements,
    //    otherwise single-pass (less accurate but still improves things)
    if (opts.enableLoudnessNormalization) {
      if (loudnessMeasurements) {
        // Two-pass: use measured values for true EBU R128 compliance
        const m = loudnessMeasurements;
        filters.push(
          `loudnorm=` +
          `I=${opts.targetLufs}:TP=${opts.truePeak}:LRA=${opts.lra}:` +
          `measured_I=${m.measuredI}:measured_TP=${m.measuredTP}:` +
          `measured_LRA=${m.measuredLRA}:measured_thresh=${m.measuredThreshold}:` +
          `offset=${m.targetOffset}:linear=true`
        );
      } else {
        // Single-pass fallback (less accurate)
        filters.push(
          `loudnorm=I=${opts.targetLufs}:TP=${opts.truePeak}:LRA=${opts.lra}`
        );
      }
    }

    // 8. Dynamic audio normalization — maintains consistent volume throughout
    //    f = frame length (ms), g = gaussian filter window, p = peak target
    filters.push('dynaudnorm=f=150:g=15:p=0.9:m=10:s=0');

    // 9. Soft limiter — catch any peaks that might clip after normalization
    //    Prevents digital clipping while keeping the audio natural
    if (opts.enableLimiter) {
      filters.push(`alimiter=limit=${Math.pow(10, opts.truePeak! / 20)}:attack=5:release=50:level=disabled`);
    }

    const filterComplex = filters.join(',');

    // Force mono output — talks are single-speaker, stereo wastes bytes.
    // 22050 Hz is sufficient for speech (the lowpass filter already removes
    // content above 16kHz). This cuts file size by ~75% vs 160k stereo 44100.
    const outputChannels = 1;
    const outputSampleRate = 22050;

    // Run FFmpeg
    await new Promise<void>((resolve, reject) => {
      let stderrData = '';
      ffmpeg(inputPath)
        .audioCodec('libmp3lame')
        .audioBitrate(opts.mp3Bitrate || '64k')
        .audioFrequency(outputSampleRate)
        .audioChannels(outputChannels)
        .complexFilter(filterComplex)
        .outputOptions([
          '-map_metadata -1',           // Strip original metadata
          '-compression_level 0',       // Fastest encoding (quality is set by bitrate)
        ])
        .on('stderr', (line: string) => { stderrData += line + '\n'; })
        .on('error', (err) => {
          // Check for common binary issues
          if (err.message.includes('ENOENT') || err.message.includes('spawn')) {
            reject(new Error(
              'FFmpeg binary not found or not executable. This is a deployment issue — ' +
              'the ffmpeg-static binary was not bundled correctly. ' +
              'Contact the administrator to fix the deployment configuration.'
            ));
          } else if (stderrData.includes('Unknown encoder')) {
            reject(new Error(
              `FFmpeg encoding error: the required audio codec is not available in this FFmpeg build. ${err.message}`
            ));
          } else if (stderrData.includes('No such filter')) {
            reject(new Error(
              `FFmpeg filter error: a required audio filter is not available in this FFmpeg build. ${err.message}`
            ));
          } else {
            reject(new Error(`FFmpeg processing error: ${err.message}`));
          }
        })
        .on('end', () => resolve())
        .save(outputPath);
    });

    // Read processed output
    const [processedBuffer, processedProbe] = await Promise.all([
      readFile(outputPath),
      probeAudioPath(outputPath),
    ]);

    return {
      buffer: processedBuffer,
      duration: processedProbe.duration,
      originalLufs: loudnessMeasurements?.measuredI,
      finalLufs: opts.targetLufs,
      originalSize: inputBuffer.length,
      processedSize: processedBuffer.length,
    };
  } finally {
    // Clean up temp files (best-effort)
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

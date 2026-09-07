import 'server-only';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { path as ffprobePath } from 'ffprobe-static';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Set ffmpeg binary path
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}
if (ffprobePath) {
  ffmpeg.setFfprobePath(ffprobePath);
}

export interface ProcessingOptions {
  targetLufs?: number;          // Target loudness (default: -16 LUFS, web standard)
  truePeak?: number;            // Max true peak in dB (default: -1.0)
  lra?: number;                 // Loudness range target (default: 11)
  silenceThreshold?: number;    // dB threshold for silence detection (default: -45 dB)
  silenceDuration?: number;     // Min silence duration to remove in seconds (default: 0.7s)
  silencePadding?: number;      // Padding to keep around speech in seconds (default: 0.15s)
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
  silencePadding: 0.15,
  enableNoiseReduction: true,
  enableLoudnessNormalization: true,
  enableDeEssing: true,
  enableSpeechEQ: true,
  enableLimiter: true,
  noiseReductionStrength: 12,
  mp3Bitrate: '160k',
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
 * Probe audio file metadata using FFprobe.
 */
async function probeAudioPath(filePath: string): Promise<AudioProbeInfo> {
  return new Promise<AudioProbeInfo>((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) { reject(err); return; }
      const audioStream = data.streams.find((s) => s.codec_type === 'audio');
      const duration = data.format?.duration;
      resolve({
        duration: duration ? Math.round(typeof duration === 'string' ? parseFloat(duration) : duration) : 0,
        sampleRate: audioStream?.sample_rate || 44100,
        channels: audioStream?.channels || 1,
        bitrate: data.format?.bit_rate ? parseInt(String(data.format.bit_rate)) : 0,
        codec: audioStream?.codec_name || 'unknown',
      });
    });
  });
}

export async function probeAudio(buffer: Buffer): Promise<AudioProbeInfo> {
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

    // Determine output channels — preserve mono if source is mono
    const outputChannels = probe.channels === 1 ? 1 : 2;

    // Run FFmpeg
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('libmp3lame')
        .audioBitrate(opts.mp3Bitrate || '160k')
        .audioFrequency(44100)
        .audioChannels(outputChannels)
        .complexFilter(filterComplex)
        .outputOptions([
          '-map_metadata -1',           // Strip original metadata
          '-compression_level 0',       // Fastest encoding (quality is set by bitrate)
        ])
        .on('error', (err) => reject(new Error(`FFmpeg processing error: ${err.message}`)))
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

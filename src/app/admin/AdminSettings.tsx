"use client";

import { useState } from "react";
import { Sun, Moon, Monitor, Volume2, LayoutGrid, Save, RefreshCw, CheckCircle2 } from "lucide-react";

type ThemeMode = "light" | "dark" | "system";

interface AdminFeatures {
  enableTalks: boolean;
  enableDhikr: boolean;
  enableSadaqah: boolean;
  enableQibla: boolean;
  enableNames: boolean;
  enableFriends: boolean;
  enablePushNotifications: boolean;
  enableOfflineMode: boolean;
}

interface AdminAudioSettings {
  targetLufs: number;
  truePeak: number;
  silenceThreshold: number;
  silenceDuration: number;
  silencePadding: number;
  enableNoiseReduction: boolean;
  enableLoudnessNormalization: boolean;
  enableDeEssing: boolean;
  enableSpeechEQ: boolean;
  enableLimiter: boolean;
  noiseReductionStrength: number;
  mp3Bitrate: string;
}

const DEFAULT_FEATURES: AdminFeatures = {
  enableTalks: true,
  enableDhikr: true,
  enableSadaqah: true,
  enableQibla: true,
  enableNames: true,
  enableFriends: true,
  enablePushNotifications: true,
  enableOfflineMode: true,
};

const DEFAULT_AUDIO_SETTINGS: AdminAudioSettings = {
  targetLufs: -16,
  truePeak: -1.0,
  silenceThreshold: -45,
  silenceDuration: 0.7,
  silencePadding: 1.5,
  enableNoiseReduction: true,
  enableLoudnessNormalization: true,
  enableDeEssing: true,
  enableSpeechEQ: true,
  enableLimiter: true,
  noiseReductionStrength: 12,
  mp3Bitrate: "160k",
};

export function AdminSettings() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";
    try {
      return (localStorage.getItem("waqt:admin:theme") as ThemeMode) || "system";
    } catch {
      return "system";
    }
  });
  const [savedTheme, setSavedTheme] = useState<ThemeMode | null>(null);
  const [features, setFeatures] = useState<AdminFeatures>(() => {
    if (typeof window === "undefined") return DEFAULT_FEATURES;
    try {
      const f = localStorage.getItem("waqt:admin:features");
      return f ? ({ ...DEFAULT_FEATURES, ...JSON.parse(f) } as AdminFeatures) : DEFAULT_FEATURES;
    } catch {
      return DEFAULT_FEATURES;
    }
  });
  const [audioSettings, setAudioSettings] = useState<AdminAudioSettings>(() => {
    if (typeof window === "undefined") return DEFAULT_AUDIO_SETTINGS;
    try {
      const a = localStorage.getItem("waqt:admin:audio");
      return a ? ({ ...DEFAULT_AUDIO_SETTINGS, ...JSON.parse(a) } as AdminAudioSettings) : DEFAULT_AUDIO_SETTINGS;
    } catch {
      return DEFAULT_AUDIO_SETTINGS;
    }
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      localStorage.setItem("waqt:admin:theme", theme);
      localStorage.setItem("waqt:admin:features", JSON.stringify(features));
      localStorage.setItem("waqt:admin:audio", JSON.stringify(audioSettings));
      setSavedTheme(theme);
      setTimeout(() => setSavedTheme(null), 2000);
    } catch {
      /* non-critical */
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Appearance */}
      <SettingsSection title="Appearance" icon={Sun}>
        <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
          Choose how the admin portal looks. This affects this portal only — users control their own theme in Settings.
        </p>
        <div className="flex flex-wrap gap-2">
          {([
            { value: "light", label: "Light", icon: Sun },
            { value: "dark", label: "Dark", icon: Moon },
            { value: "system", label: "System", icon: Monitor },
          ] as const).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors"
              style={{
                borderColor: theme === value ? "var(--color-accent)" : "var(--color-paper-3)",
                color: theme === value ? "var(--color-accent)" : "var(--color-ink-soft)",
                backgroundColor:
                  theme === value ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "transparent",
                minHeight: 44,
              }}
              aria-pressed={theme === value}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* Feature Toggles */}
      <SettingsSection title="Feature Toggles" icon={LayoutGrid}>
        <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
          Enable or disable features across the app. Disabled features are hidden from the tools menu and navigation.
        </p>
        <div className="flex flex-col gap-2">
          {([
            { key: "enableTalks", label: "Talks Library", desc: "Audio lectures and khutbahs" },
            { key: "enableDhikr", label: "Dhikr Counter", desc: "Tasbih counter with curated sequences" },
            { key: "enableSadaqah", label: "Akhirah Card", desc: "Sadaqah tracking and history" },
            { key: "enableQibla", label: "Qibla Compass", desc: "Direction to the Kaaba" },
            { key: "enableNames", label: "99 Names", desc: "Names of Allah reference" },
            { key: "enableFriends", label: "Prayer Friends", desc: "Accountability partners" },
            { key: "enablePushNotifications", label: "Push Notifications", desc: "Prayer reminders and check-ins" },
            { key: "enableOfflineMode", label: "Offline Mode", desc: "Allow offline access and editing" },
          ] as const).map(({ key, label, desc }) => (
            <ToggleRow
              key={key}
              label={label}
              description={desc}
              checked={features[key]}
              onChange={(v) => setFeatures((f) => ({ ...f, [key]: v }))}
            />
          ))}
        </div>
      </SettingsSection>

      {/* Audio Processing */}
      <SettingsSection title="Audio Processing" icon={Volume2}>
        <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
          Default settings for talk audio processing. Applied when talks are uploaded and processed. Uses two-pass EBU
          R128 loudness normalization for broadcast-quality results.
        </p>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
            Loudness
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberInput
              label="Target Loudness (LUFS)"
              description="-16 for web/podcasts, -23 for broadcast TV"
              value={audioSettings.targetLufs}
              onChange={(v) => setAudioSettings((a) => ({ ...a, targetLufs: v }))}
              min={-30}
              max={0}
              step={1}
            />
            <NumberInput
              label="True Peak (dBTP)"
              description="Max peak to prevent clipping. -1.0 is standard"
              value={audioSettings.truePeak}
              onChange={(v) => setAudioSettings((a) => ({ ...a, truePeak: v }))}
              min={-3}
              max={0}
              step={0.5}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
            Silence Removal
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberInput
              label="Silence Threshold (dB)"
              description="Below this = silence"
              value={audioSettings.silenceThreshold}
              onChange={(v) => setAudioSettings((a) => ({ ...a, silenceThreshold: v }))}
              min={-80}
              max={0}
              step={1}
            />
            <NumberInput
              label="Min Silence (s)"
              description="Duration to count as silence"
              value={audioSettings.silenceDuration}
              onChange={(v) => setAudioSettings((a) => ({ ...a, silenceDuration: v }))}
              min={0.1}
              max={5}
              step={0.1}
            />
            <NumberInput
              label="Padding (s)"
              description="Keep around speech"
              value={audioSettings.silencePadding}
              onChange={(v) => setAudioSettings((a) => ({ ...a, silencePadding: v }))}
              min={0}
              max={5}
              step={0.1}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
            Noise Reduction
          </p>
          <ToggleRow
            label="Noise Reduction"
            description="Adaptive FFT denoising (afftdn) — removes background hiss/hum"
            checked={audioSettings.enableNoiseReduction}
            onChange={(v) => setAudioSettings((a) => ({ ...a, enableNoiseReduction: v }))}
          />
          {audioSettings.enableNoiseReduction && (
            <div className="mt-2">
              <NumberInput
                label="Strength (0-30)"
                description="Higher = more aggressive. 12 is conservative, 20+ for noisy recordings"
                value={audioSettings.noiseReductionStrength}
                onChange={(v) => setAudioSettings((a) => ({ ...a, noiseReductionStrength: Math.min(30, Math.max(0, v)) }))}
                min={0}
                max={30}
                step={1}
              />
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
            Enhancement
          </p>
          <div className="flex flex-col gap-2">
            <ToggleRow
              label="Two-Pass Loudness Normalization"
              description="True EBU R128 compliance — measures then normalizes for consistent loudness"
              checked={audioSettings.enableLoudnessNormalization}
              onChange={(v) => setAudioSettings((a) => ({ ...a, enableLoudnessNormalization: v }))}
            />
            <ToggleRow
              label="De-Essing"
              description="Reduce harsh sibilance (s, sh, ch sounds) around 6kHz"
              checked={audioSettings.enableDeEssing}
              onChange={(v) => setAudioSettings((a) => ({ ...a, enableDeEssing: v }))}
            />
            <ToggleRow
              label="Speech EQ"
              description="Gentle presence boost at 3kHz + warmth at 200Hz for clearer speech"
              checked={audioSettings.enableSpeechEQ}
              onChange={(v) => setAudioSettings((a) => ({ ...a, enableSpeechEQ: v }))}
            />
            <ToggleRow
              label="Soft Limiter"
              description="Prevents digital clipping after normalization"
              checked={audioSettings.enableLimiter}
              onChange={(v) => setAudioSettings((a) => ({ ...a, enableLimiter: v }))}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
            Output
          </p>
          <label className="block">
            <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
              MP3 Bitrate
            </span>
            <select
              value={audioSettings.mp3Bitrate}
              onChange={(e) => setAudioSettings((a) => ({ ...a, mp3Bitrate: e.target.value }))}
              className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
              style={{
                borderColor: "var(--color-paper-3)",
                backgroundColor: "var(--color-paper-2)",
                color: "var(--color-ink)",
                minHeight: 44,
              }}
            >
              <option value="96k">96 kbps (small file, speech-only)</option>
              <option value="128k">128 kbps (standard)</option>
              <option value="160k">160 kbps (recommended)</option>
              <option value="192k">192 kbps (high quality)</option>
              <option value="256k">256 kbps (very high quality)</option>
            </select>
            <span className="mt-0.5 block text-xs" style={{ color: "var(--color-ink-muted)" }}>
              Higher = better quality but larger file size
            </span>
          </label>
        </div>
      </SettingsSection>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)", minHeight: 44 }}
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : "Save Settings"}
        </button>
        {savedTheme !== null && (
          <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--color-success)" }}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            Settings saved
          </span>
        )}
      </div>
    </div>
  );
}

function SettingsSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  children: React.ReactNode;
}) {
  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border p-5"
      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
        <h3 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl border p-3.5"
      style={{ borderColor: "var(--color-paper-3)" }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
          {label}
        </p>
        <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
          {description}
        </p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
        style={{ backgroundColor: checked ? "var(--color-accent)" : "var(--color-paper-3)" }}
        role="switch"
        aria-checked={checked}
        aria-label={label}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full transition-transform"
          style={{
            left: "2px",
            transform: checked ? "translateX(20px)" : "translateX(0)",
            backgroundColor: "var(--color-paper)",
          }}
        />
      </button>
    </div>
  );
}

function NumberInput({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
        className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
        style={{
          borderColor: "var(--color-paper-3)",
          backgroundColor: "var(--color-paper-2)",
          color: "var(--color-ink)",
          minHeight: 44,
        }}
      />
      <span className="mt-0.5 block text-xs" style={{ color: "var(--color-ink-muted)" }}>
        {description}
      </span>
    </label>
  );
}

import { useEffect, useRef, useState } from 'react';
import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconFileMusic,
  IconMail,
  IconMovie,
  IconSparkles,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Divider,
  FileInput,
  Group,
  Loader,
  Paper,
  PasswordInput,
  Progress,
  RingProgress,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  rem,
} from '@mantine/core';
import { useVideoFlow } from '../VideoFlowContext';
import { isAudioFile, LANGUAGE_OPTIONS, type VideoLanguage } from '../../lib/api';

interface CreateViewProps {
  onComplete: () => void;
}

// StoryTemplate options accepted by the API (Step 1).
const TEMPLATE_OPTIONS = ['documentary', 'story', 'tutorial', 'vlog'];

const RESOLUTION_OPTIONS = [
  { value: 'landscape', label: 'Landscape (16:9)' },
  { value: 'portrait', label: 'Portrait (9:16)' },
];

// ---------------------------------------------------------------------------
// Upload limits.
// ---------------------------------------------------------------------------
const SOFT_LIMIT_SECONDS = 300; // 5 min — what the UI advertises
const HARD_LIMIT_SECONDS = 425; // ~7 min — the true reject threshold (+5s grace)
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

// Simplified, user-friendly stage list. We intentionally do NOT surface the
// internal pipeline (extracting audio / transcribing / generating scene
// images) — that's an implementation detail. "Understanding your video" covers
// the audio-extraction + transcription phases; "Generating scenes" covers both
// scene generation and their images.
//
// `max` windows map to the backend progress ladder
// (text2video.tasks.process_uploaded_video):
//   0-2  received/upload  -> Uploading video
//   2-8  extracting audio + transcribing -> Understanding your video
//   8-100 scenes (+ images) -> Generating scenes
const STAGES: { label: string; max: number; keywords?: string[] }[] = [
  { label: 'Uploading video', max: 2, keywords: ['received', 'upload'] },
  { label: 'Understanding your video', max: 8, keywords: ['extracting audio', 'transcrib'] },
  { label: 'Generating scenes', max: 100, keywords: ['scene'] },
];

interface Stage {
  label: string;
  state: 'pending' | 'active' | 'done';
}

/**
 * Translate a backend status_message into a user-friendly phrase that does NOT
 * expose the internal pipeline (extracting audio, transcribing, generating
 * scene images, etc.). Falls back to the original message when unknown.
 */
function friendlyStatus(message: string | null | undefined): string {
  if (!message) return 'This may take a moment...';
  const m = message.toLowerCase();

  if (m.includes('transcrib') || m.includes('extracting audio') || m.includes('preparing audio')) {
    return 'Understanding your video…';
  }
  if (m.includes('extracting scenes') || m.includes('identifying characters')) {
    return 'Planning your scenes…';
  }
  if (m.includes('visual descriptions')) {
    return 'Creating scene visuals…';
  }
  if (m.includes('generating scene images')) {
    return 'Generating scene images…';
  }
  if (m.includes('ready') || m.includes('complete')) {
    return 'Almost there…';
  }
  return message;
}

function formatLimit(total: number): string {
  const m = Math.floor(total / 60);
  const s = Math.round(total % 60);
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Read the media file's duration in seconds.
 *
 * The duration must be a finite, non-NaN, non-Infinity value. Many files (e.g.
 * fragmented MP4s, some webm/m4a) don't report a final duration at the first
 * `loadedmetadata` event — it can arrive later via `durationchange` or stay
 * `Infinity`/`NaN` until more of the header is read. So we keep listening
 * until we get a reliable finite duration, with a timeout as a last resort.
 */
function loadDuration(file: File, kind: 'video' | 'audio'): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = kind === 'audio' ? document.createElement('audio') : document.createElement('video');
    el.preload = 'metadata';

    let settled = false;

    const finish = (d: number) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      reject(new Error(msg));
    };

    const currentDuration = () => {
      const d = el.duration;
      return Number.isFinite(d) && d > 0 ? d : null;
    };

    // Read once metadata is available; if duration isn't finite yet, keep
    // waiting for a `durationchange` event instead of resolving too early.
    const tryResolve = () => {
      const d = currentDuration();
      if (d != null) finish(d);
    };

    el.onloadedmetadata = tryResolve;
    el.ondurationchange = tryResolve;
    el.onloadeddata = tryResolve;
    // NOTE: `onerror` is the ONLY reliable error signal. We deliberately do
    // NOT fail on `suspend`/`emptied`/`stalled` — those fire as a normal part
    // of the browser's media-load lifecycle (especially with preload="metadata")
    // and do NOT mean the duration is unreadable.
    el.onerror = () => fail('Could not read the file duration.');

    // Last resort: if we never got a finite duration, reject after 8s.
    const t = window.setTimeout(() => {
      const d = currentDuration();
      if (d != null) {
        finish(d);
      } else {
        fail('Could not read the file duration.');
      }
    }, 8000);

    el.src = url;
    el.load();
  });
}

export function CreateView({ onComplete }: CreateViewProps) {
  const {
    isAuthenticated,
    login,
    uploadAndStart,
    jobError,
    jobStatus,
    jobPhase,
    uploadProgress,
    videoLabel,
  } = useVideoFlow();

  // --- form state ---
  const [file, setFile] = useState<File | null>(null);
  const [template, setTemplate] = useState<string | null>('documentary');
  const [resolution, setResolution] = useState<string | null>('landscape');
  const [language, setLanguage] = useState<VideoLanguage | null>(null);
  const [noHumans, setNoHumans] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- processing state ---
  // Ref (not state!) so a guard flip never triggers a re-render that would
  // cancel the pending navigation timer below (see completion effect notes).
  const completionFiredRef = useRef(false);

  // A job is running once an upload actually starts (idle on first load).
  const isRunning = jobPhase === 'uploading' || jobPhase === 'processing';
  // Show the live panel whenever a job has been kicked off (even on failure).
  const showProcessing =
    jobPhase === 'uploading' ||
    jobPhase === 'processing' ||
    jobPhase === 'completed' ||
    jobPhase === 'failed';

  // While the file is being uploaded (before the backend returns a job id and
  // starts streaming progress), surface REAL upload progress from XHR.
  const isUploading = jobPhase === 'uploading';
  const progress = isUploading
    ? uploadProgress
    : Math.min(100, Math.max(0, Math.round(jobStatus?.progress ?? 0)));
  const statusMessage = (jobStatus?.status_message ?? '').toLowerCase();
  const isFailed = jobPhase === 'failed';

  // Determine the active stage index (reuses the backend status_message keywords).
  // NOTE: while UPLOADING, progress is the byte-upload %, which must NOT map to
  // the job stage windows — only the first stage ("Upload complete") is active
  // until the file fully uploads and the backend starts reporting job progress.
  let activeIndex = -1;
  if (jobPhase === 'completed') {
    activeIndex = STAGES.length; // all done
  } else if (jobPhase === 'failed') {
    activeIndex = -1;
  } else if (isUploading) {
    activeIndex = 0; // only "Upload complete" is active during the byte upload
  } else {
    const byMessage = STAGES.findIndex((s) =>
      s.keywords?.some((k) => statusMessage.includes(k))
    );
    if (byMessage >= 0) {
      activeIndex = byMessage;
    } else {
      activeIndex = STAGES.findIndex((s) => progress < s.max);
      if (activeIndex === -1) activeIndex = STAGES.length - 1;
    }
  }

  const stages: Stage[] = STAGES.map((s, i) => {
    if (i < activeIndex || jobPhase === 'completed') {
      return { label: s.label, state: 'done' as const };
    }
    if (i === activeIndex) {
      return { label: s.label, state: 'active' as const };
    }
    return { label: s.label, state: 'pending' as const };
  });

  const activeStageLabel = isUploading
    ? 'Uploading'
    : stages.find((s) => s.state === 'active')?.label ?? (isFailed ? 'Failed' : 'Finalizing');
  const statusText = isUploading
    ? `Uploading your file… ${uploadProgress}%`
    : friendlyStatus(jobStatus?.status_message);
  const fileName = videoLabel || 'Your file';

  // Move to the editor once the job completes.
  //
  // Single effect driven primarily by `jobPhase`. The guard is a REF so flipping
  // it does NOT change render deps (avoiding the bug where two competing
  // effects shared a `completedNotified` state and cleaned up / cancelled each
  // other's pending navigation timer — leaving the UI stuck at "Almost there").
  //
  // IMPORTANT: the `progress >= 100` backstop ONLY applies while PROCESSING
  // (jobPhase === 'processing'), because during the UPLOAD phase `progress` is
  // the BYTE-upload %, which hits 100 the moment the file finishes uploading —
  // using it there would jump to the editor before scenes are generated.
  useEffect(() => {
    if (completionFiredRef.current) return;

    const doneViaCompleted = jobPhase === 'completed';
    const doneViaProgress = jobPhase === 'processing' && !isFailed && progress >= 100;
    if (!doneViaCompleted && !doneViaProgress) return;

    completionFiredRef.current = true;
    const t = window.setTimeout(onComplete, 700);
    return () => window.clearTimeout(t);
  }, [jobPhase, isFailed, progress, onComplete]);

  const pickFile = async (f: File | null) => {
    setFile(f);
    setError(null);
    if (!f) return;

    if (f.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setError('This file is larger than 100 MB. Please upload a smaller video or audio file.');
      return;
    }

    const kind: 'video' | 'audio' = isAudioFile(f) ? 'audio' : 'video';
    try {
      const duration = await loadDuration(f, kind);
      if (duration > HARD_LIMIT_SECONDS) {
        setFile(null);
        setError(
          `This ${kind} is ${formatLimit(duration)} long, which is over the ${formatLimit(
            HARD_LIMIT_SECONDS
          )} hard limit. Please upload a shorter file.`
        );
        return;
      }
      if (duration > SOFT_LIMIT_SECONDS) {
        setError(
          `Note: this ${kind} is ${formatLimit(
            duration
          )} — longer than the ${formatLimit(
            SOFT_LIMIT_SECONDS
          )} guide, but still accepted (hard limit ${formatLimit(HARD_LIMIT_SECONDS)}).`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify file duration.');
      setFile(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError('Please choose a video or audio file to upload.');
      return;
    }
    if (!language) {
      setError('Please select the language of the audio before uploading.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await uploadAndStart(file, {
        template: template ?? undefined,
        resolution: resolution ?? undefined,
        language,
        noHumans,
      });
      // The form stays visible (now "running"); the right panel streams progress.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setSubmitting(false);
    }
  };

  const formDisabled = isRunning;
  const headerError = error || jobError;

  return (
    <Box
      py={48}
      px={{ base: 'md', sm: 'lg' }}
      style={{
        position: 'relative',
        overflow: 'hidden',
        // Transparent here — the app-wide gradient now lives on <body> in
        // global.css so EVERY page shares it. The decorative glows below add
        // a little extra depth on the create screen.
      }}
    >
      {/* Decorative background glows — subtle brand ambient, the one brand moment. */}
      <Box
        aria-hidden
        style={{
          position: 'absolute',
          top: -180,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 900,
          height: 420,
          borderRadius: '50%',
          background:
            'radial-gradient(closest-side, rgba(124,108,246,0.14), rgba(124,108,246,0.04) 60%, transparent 100%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <Box
        aria-hidden
        style={{
          position: 'absolute',
          top: 120,
          left: -140,
          width: 420,
          height: 420,
          borderRadius: '50%',
          background:
            'radial-gradient(closest-side, rgba(124,108,246,0.08), transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <Box
        aria-hidden
        style={{
          position: 'absolute',
          top: 240,
          right: -160,
          width: 460,
          height: 460,
          borderRadius: '50%',
          background:
            'radial-gradient(closest-side, rgba(159,134,250,0.08), transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <Stack gap="lg" maw={1200} mx="auto" style={{ position: 'relative', zIndex: 1 }}>
        {/* Compact hero */}
        <Stack align="center" gap={4} ta="center">
          <Title order={1} ta="center" style={{ fontSize: rem(29), letterSpacing: '-0.03em' }}>
            Create a visual story
          </Title>
          <Text c="dimmed" size="md" maw={520} ta="center">
            Upload a clip, pick settings, and watch your media get split into scenes in real time.
          </Text>
        </Stack>

        {!isAuthenticated ? (
          <>
            {headerError && (
              <Alert color="red" icon={<IconAlertCircle size={16} />} radius="md">
                {headerError}
              </Alert>
            )}
            <Center>
              <LoginCard onLogin={login} />
            </Center>
          </>
        ) : (
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" style={{ alignItems: 'flex-start' }}>
            {/* LEFT: the form. Stays visible and "spins" while processing runs. */}
            <Paper withBorder radius="lg" p="xl" shadow="sm">
              <Stack gap="lg">
                <Group gap="sm">
                  <Box
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 'var(--mantine-radius-md)',
                      background: isRunning
                        ? 'var(--ez-accent-dim)'
                        : 'var(--mantine-color-gray-1)',
                      color: 'var(--ez-accent)',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {isRunning ? <IconMovie size={18} /> : <IconUpload size={18} />}
                  </Box>
                  <div>
                    <Text fw={600} size="md">
                      {isRunning ? 'Processing in progress' : 'Start a new creation'}
                    </Text>
                    <Text c="dimmed" size="xs">
                      {isRunning ? 'Live progress is shown on the right.' : 'Video or audio, up to 100 MB'}
                    </Text>
                  </div>
                </Group>

                {headerError && (
                  <Alert color="red" icon={<IconAlertCircle size={16} />} radius="md">
                    {headerError}
                  </Alert>
                )}

                <FileInput
                  label={file && isAudioFile(file) ? 'Audio file' : 'Video file'}
                  description={
                    file && isAudioFile(file)
                      ? 'MP3, WAV, M4A, OGG — used directly (no audio extraction)'
                      : 'MP4, MOV, WebM — or upload an audio file to skip extraction'
                  }
                  placeholder="Choose your video or audio…"
                  accept="video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav,audio/x-m4a,audio/ogg,.mp4,.mov,.webm,.mp3,.wav,.m4a,.aac,.ogg"
                  clearable
                  value={file}
                  onChange={pickFile}
                  disabled={formDisabled}
                />

                <Divider />

                <Select
                  label="Language"
                  description="Language spoken in the audio — required for accurate transcription"
                  placeholder="Select language…"
                  data={[...LANGUAGE_OPTIONS]}
                  value={language}
                  onChange={(value) => setLanguage(value as VideoLanguage | null)}
                  required
                  withAsterisk
                  disabled={formDisabled}
                />

                <Group grow wrap="wrap" align="flex-start">
                  <Select
                    label="Template"
                    description="Story template used to generate scenes"
                    placeholder="Pick template"
                    data={TEMPLATE_OPTIONS}
                    value={template}
                    onChange={setTemplate}
                    disabled={formDisabled}
                  />
                  <Select
                    label="Resolution"
                    description="Aspect ratio for scene images"
                    placeholder="Pick resolution"
                    data={RESOLUTION_OPTIONS}
                    value={resolution}
                    onChange={setResolution}
                    disabled={formDisabled}
                  />
                </Group>

                <Divider />

                <Switch
                  checked={noHumans}
                  onChange={(event) => setNoHumans(event.currentTarget.checked)}
                  label="No people in visuals"
                  description="Generate scenery/environment-only images (no human figures) — the voice carries the talk."
                  size="sm"
                  disabled={formDisabled}
                />

                <Text c="dimmed" size="xs" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <IconClock size={14} />
                  Up to ~5 min (1:1.5 min tolerated) and 100 MB.
                </Text>

                {isRunning ? (
                  <Button
                    size="md"
                    fullWidth
                    radius="md"
                    loading
                    variant="filled"
                    loaderProps={{ size: 'sm' }}
                  >
                    {activeStageLabel}…
                  </Button>
                ) : (
                  <Button
                    size="md"
                    fullWidth
                    radius="md"
                    loading={submitting}
                    disabled={!file || !language || submitting}
                    leftSection={submitting ? undefined : <IconMovie size={20} />}
                    onClick={handleAnalyze}                 >
                    Analyze Video
                  </Button>
                )}
              </Stack>
            </Paper>

            {/* RIGHT: live processing preview. Only active once a job starts. */}
            {showProcessing ? (
              <ProcessingPanel
                isFailed={isFailed}
                progress={progress}
                statusText={statusText}
                activeStageLabel={activeStageLabel}
                stages={stages}
                fileName={fileName}
                onRetry={() => onComplete()}
              />
            ) : (
              <Paper
                withBorder
                radius="lg"
                p="xl"
                shadow="sm"
                style={{
                  borderStyle: 'dashed',
                  background: 'var(--ez-surface-1)',
                  minHeight: 420,
                }}
              >
                <Center style={{ height: '100%', minHeight: 380 }}>
                  <Stack align="center" gap="sm" ta="center" maw={300}>
                    <Box
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        background: 'var(--ez-accent-dim)',
                        color: 'var(--ez-accent)',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <IconSparkles size={26} />
                    </Box>
                    <Text fw={600}>Live progress</Text>
                    <Text size="sm" c="dimmed">
                      Fill out the form and hit <b>Analyze Video</b> — how your media is being
                      split into scenes will appear here in real time.
                    </Text>
                  </Stack>
                </Center>
              </Paper>
            )}
          </SimpleGrid>
        )}
      </Stack>
    </Box>
  );
}

// ---------------------------------------------------------------------------

function ProcessingPanel({
  isFailed,
  progress,
  statusText,
  activeStageLabel,
  stages,
  fileName,
  onRetry,
}: {
  isFailed: boolean;
  progress: number;
  statusText: string;
  activeStageLabel: string;
  stages: Stage[];
  fileName: string;
  onRetry: () => void;
}) {
  return (
    <Stack gap="lg" style={{ position: 'sticky', top: 16 }}>
      {/* Header banner */}
      <Paper
        radius="lg"
        p="xl"
        withBorder
        style={{
          background: isFailed
            ? 'linear-gradient(135deg, rgba(240,133,133,0.12), transparent)'
            : 'linear-gradient(135deg, var(--ez-accent-dim), transparent)',
        }}
      >
        <Stack gap="md">
          <Group gap={8}>
            <Badge radius="xl" variant={isFailed ? 'light' : 'filled'} color={isFailed ? 'red' : 'brand'}>
              {isFailed ? 'Failed' : 'Processing'}
            </Badge>
            {!isFailed && (
              <Badge radius="xl" variant="light" color="brand" leftSection={<IconSparkles size={12} />}>
                AI analysis
              </Badge>
            )}
          </Group>

          <Group justify="space-between" align="center" wrap="wrap">
            <Stack gap={2} style={{ flex: 1, minWidth: 160 }}>
              <Title order={3}>{isFailed ? 'Analysis failed' : 'Live preview'}</Title>
              <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                <IconFileMusic size={16} color="var(--mantine-color-dimmed)" />
                <Text c="dimmed" size="sm" truncate>
                  {fileName}
                </Text>
              </Group>
            </Stack>

            <Center>
              <RingProgress
                size={112}
                thickness={12}
                roundCaps
                sections={[
                  { value: isFailed ? 100 : Math.max(progress, 4), color: isFailed ? 'red' : 'brand' },
                ]}
                label={
                  <Stack gap={0} align="center" justify="center">
                    <Text fw={700} size={rem(22)} ta="center" className="ez-timecode">
                      {progress}%
                    </Text>
                    <Text c="dimmed" size="xs" ta="center">
                      complete
                    </Text>
                  </Stack>
                }
              />
            </Center>
          </Group>

          <Box>
            <Progress
              value={isFailed ? 0 : progress}
              size="lg"
              radius="xl"
              striped={!isFailed}
              animated={!isFailed}
              color={isFailed ? 'red' : 'brand'}
              transitionDuration={300}
            />
          </Box>
          <Text c="dimmed" size="sm" ta="center" style={{ minHeight: 20 }}>
            {isFailed ? 'The job could not be completed.' : statusText}
          </Text>

          {isFailed && (
            <Button variant="light" color="red" onClick={onRetry} fullWidth>
              Start over
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Checklist */}
      <Paper withBorder radius="lg" p="lg" shadow="sm">
        <Text fw={600} size="sm" c="dimmed" tt="uppercase" mb="md">
          Progress
        </Text>
        <Stack gap={6} w="100%">
          {stages.map((stage) => (
            <StageRow key={stage.label} stage={stage} />
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}

function StageRow({ stage }: { stage: Stage }) {
  if (stage.state === 'done') {
    return (
      <RowShell>
        <Center style={{ width: 22 }}>
          <IconCheck size={18} color="var(--mantine-color-teal-6)" />
        </Center>
        <Text size="md">{stage.label}</Text>
      </RowShell>
    );
  }
  if (stage.state === 'active') {
    return (
      <RowShell active>
        <Center style={{ width: 22 }}>
          <Loader size={18} color="var(--ez-accent)" />
        </Center>
        <Text size="md" fw={600}>
          {stage.label}
        </Text>
      </RowShell>
    );
  }
  return (
    <RowShell>
      <Center style={{ width: 22 }}>
        <Text size="sm" c="dimmed">
          ○
        </Text>
      </Center>
      <Text size="md" c="dimmed">
        {stage.label}
      </Text>
    </RowShell>
  );
}

function RowShell({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <Stack
      gap={6}
      p="sm"
      px="md"
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        background: active ? 'var(--ez-accent-dim)' : 'var(--mantine-color-gray-0)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>{children}</div>
      {active && <Progress value={78} size="xs" radius="xl" color="brand" striped animated />}
    </Stack>
  );
}

// ---------------------------------------------------------------------------

function LoginCard({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  };

  return (
    <Paper withBorder radius="lg" p="xl" shadow="sm" component="form" onSubmit={submit} w="100%" maw={440}>
      <Stack gap="md">
        <Center style={{ flexDirection: 'column', gap: 4 }}>
          <Center
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--ez-accent-dim)',
              color: 'var(--ez-accent)',
            }}
          >
            <IconMail size={26} />
          </Center>
          <Title order={3}>Sign in</Title>
          <Text c="dimmed" size="sm">
            Use your account to start creating.
          </Text>
        </Center>

        {error && (
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {error}
          </Alert>
        )}

        <TextInput
          label="Email"
          placeholder="you@example.com"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
        />
        <PasswordInput
          label="Password"
          placeholder="Your password"
          required
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
        />
        <Button type="submit" loading={loading} >
          Sign in
        </Button>

        <Group gap={6} justify="center" c="dimmed">
          <IconUpload size={14} />
          <Text size="sm">After signing in you can upload a video.</Text>
        </Group>
      </Stack>
    </Paper>
  );
}

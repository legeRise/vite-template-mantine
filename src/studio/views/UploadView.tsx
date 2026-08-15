import { useState } from 'react';
import { IconAlertCircle, IconClock, IconMail, IconMovie, IconUpload } from '@tabler/icons-react';
import {
  Alert,
  Button,
  Center,
  Container,
  Divider,
  FileInput,
  Group,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  rem,
} from '@mantine/core';
import { useVideoFlow } from '../VideoFlowContext';
import { isAudioFile } from '../../lib/api';

interface UploadViewProps {
  onAnalyze: () => void;
}

// StoryTemplate options accepted by the API (Step 1).
const TEMPLATE_OPTIONS = ['documentary', 'story', 'tutorial', 'vlog'];

const RESOLUTION_OPTIONS = [
  { value: 'landscape', label: 'Landscape (16:9)' },
  { value: 'portrait', label: 'Portrait (9:16)' },
];

// ---------------------------------------------------------------------------
// Upload limits.
//
// The UI advertises a "5 minute" limit (SOFT_LIMIT_SECONDS) but we are lenient:
// a file slightly over 5 minutes is still accepted. The real, hard cutoff that
// can never be exceeded is HARD_LIMIT_SECONDS (~7 minutes, plus a small grace
// window). Files above MAX_UPLOAD_BYTES (100 MB) are rejected outright.
// ---------------------------------------------------------------------------
const SOFT_LIMIT_SECONDS = 300; // 5 min — what the UI advertises
const HARD_LIMIT_SECONDS = 425; // ~7 min — the true reject threshold (+5s grace)
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

function formatLimit(total: number): string {
  const m = Math.floor(total / 60);
  const s = Math.round(total % 60);
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Resolve a media file into a playable element and return its duration (s).
 * Audio files coalesce with the video path; WebM audio is treated as video here
 * for duration purposes since it can be checked in a <video> element too.
 */
function loadDuration(
  file: File,
  kind: 'video' | 'audio'
): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = kind === 'audio' ? document.createElement('audio') : document.createElement('video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const d = Number.isFinite(el.duration) ? el.duration : 0;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the file duration.'));
    };
    // Guard against elements that never fire metadata (e.g. unsupported codec).
    window.setTimeout(() => {
      if (!Number.isFinite(el.duration) || el.readyState < 1) {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read the file duration.'));
      }
    }, 8000) as unknown as number;
    el.src = url;
    el.load();
  });
}

export function UploadView({ onAnalyze }: UploadViewProps) {
  const { isAuthenticated, login, uploadAndStart, jobError } = useVideoFlow();
  const [file, setFile] = useState<File | null>(null);
  const [template, setTemplate] = useState<string | null>('documentary');
  const [resolution, setResolution] = useState<string | null>('landscape');
  const [noHumans, setNoHumans] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validate the selected file (size + duration) before it can be uploaded.
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
        // Lenient: warn, but still accept files that are only slightly above 5 min.
        setError(
          `Note: this ${kind} is ${formatLimit(
            duration
          )} — longer than the ${formatLimit(
            SOFT_LIMIT_SECONDS
          )} guide, but still accepted (hard limit ${formatLimit(HARD_LIMIT_SECONDS)}).`
        );
      }
    } catch (err) {
      // If we can't determine duration, still allow the upload; the server enforces its own rules.
      setError(err instanceof Error ? err.message : 'Could not verify file duration.');
      setFile(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError('Please choose a video or audio file to upload.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await uploadAndStart(file, {
        template: template ?? undefined,
        resolution: resolution ?? undefined,
        noHumans,
      });
      onAnalyze();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setSubmitting(false);
    }
  };

  return (
    <Container size={560} py={60}>
      <Stack align="center" gap="sm" mb="xl">
        <Title order={1} ta="center" style={{ fontSize: rem(40), letterSpacing: '-0.02em' }}>
          Video → Visual Story
        </Title>
        <Text c="dimmed" size="lg" ta="center" maw={460}>
          Turn a video into scenes, visual prompts and generated images.
        </Text>
      </Stack>

      {!isAuthenticated ? (
        <LoginCard onLogin={login} />
      ) : (
        <Stack gap="lg">
          {(error || jobError) && (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              {error || jobError}
            </Alert>
          )}

          <Paper withBorder radius="lg" p="xl">
            <Stack gap="lg">
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
              />

              <Divider label="Scenes settings" labelPosition="center" />

              <Group grow wrap="nowrap" align="flex-start">
                <Select
                  label="Template"
                  description="Story template used to generate scenes"
                  placeholder="Pick template"
                  data={TEMPLATE_OPTIONS}
                  value={template}
                  onChange={setTemplate}
                />
                <Select
                  label="Resolution"
                  description="Aspect ratio for scene images"
                  placeholder="Pick resolution"
                  data={RESOLUTION_OPTIONS}
                  value={resolution}
                  onChange={setResolution}
                />
              </Group>

              <Switch
                checked={noHumans}
                onChange={(event) => setNoHumans(event.currentTarget.checked)}
                label="No people in visuals"
                description="Generate scenery/environment-only images (no human figures) — the voice carries the talk."
                size="sm"
              />

              <Text c="dimmed" size="xs" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <IconClock size={14} />
                Up to ~5 min (1:1.5 min tolerated) and 100 MB. Audio is extracted, transcribed,
                then split into scenes automatically.
              </Text>

              <Button
                size="md"
                fullWidth
                radius="md"
                loading={submitting}
                disabled={!file || submitting}
                leftSection={<IconMovie size={20} />}
                onClick={handleAnalyze}
              >
                Analyze Video
              </Button>
            </Stack>
          </Paper>
        </Stack>
      )}
    </Container>
  );
}

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
    <Paper withBorder radius="lg" p="xl" shadow="sm" component="form" onSubmit={submit}>
      <Stack gap="md">
        <Center style={{ flexDirection: 'column', gap: 4 }}>
          <Center
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--mantine-color-violet-0)',
              color: 'var(--mantine-color-violet-6)',
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
        <Button type="submit" fullWidth loading={loading}>
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

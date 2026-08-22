import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IconCheck,
  IconCpu,
  IconDownload,
  IconServer,
  IconVideo,
} from '@tabler/icons-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Divider,
  Group,
  Loader,
  Progress,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { streamProjectExport, triggerProjectExport } from '../../lib/api';
import {
  BrowserExportCanceledError,
  BrowserExportError,
  checkBrowserExportSupport,
  exportProjectInBrowser,
} from '../export/browserExport';
import type { SceneModel } from '../VideoFlowContext';

interface ExportViewProps {
  onDone: () => void;
  onBackToEditor: () => void;
  trackerId: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  scenes: SceneModel[];
}

type Phase = 'config' | 'rendering' | 'done' | 'failed';

export function ExportView({
  onBackToEditor,
  trackerId,
  videoUrl,
  audioUrl,
  scenes,
}: ExportViewProps) {
  const [phase, setPhase] = useState<Phase>('config');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Final video location: a local blob URL (browser render) or a remote URL
  // (server render). `resultIsBlob` controls how the download link behaves.
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultIsBlob, setResultIsBlob] = useState(false);
  // Whether this browser can hardware-encode H.264 (checked once on mount).
  const [browserSupported, setBrowserSupported] = useState<boolean | null>(null);

  // Cancellation handles for the two export paths.
  const cancelRenderRef = useRef(false);
  const abortRef = useRef<(() => void) | null>(null);

  // One-time capability probe so the UI can demote the browser option early.
  useEffect(() => {
    let alive = true;
    void checkBrowserExportSupport().then((ok) => {
      if (alive) {
        setBrowserSupported(ok);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // Revoke any blob URL when leaving the view / replacing the result.
  useEffect(
    () => () => {
      abortRef.current?.();
      if (resultUrl && resultIsBlob) {
        URL.revokeObjectURL(resultUrl);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const resetResult = useCallback(() => {
    setResultUrl((prev) => {
      if (prev && resultIsBlob) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
    setResultIsBlob(false);
  }, [resultIsBlob]);

  /** Shared pre-flight validation; returns an error message or null. */
  const validate = useCallback((): string | null => {
    if (!trackerId) {
      return 'No active project to export.';
    }
    if (!videoUrl && !audioUrl) {
      return 'No source file available to export.';
    }
    if (!scenes.some((s) => s.imageUrl)) {
      return 'Some scenes are missing images — regenerate them first, then export.';
    }
    return null;
  }, [trackerId, videoUrl, audioUrl, scenes]);

  // ------------------------------------------------------------------
  // Path 1 (default): render in the browser with WebCodecs/mediabunny.
  // ------------------------------------------------------------------
  const startBrowserExport = useCallback(async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setPhase('failed');
      return;
    }

    cancelRenderRef.current = false;
    resetResult();
    setError(null);
    setProgress(0);
    setStatusMessage('Preparing…');
    setPhase('rendering');

    try {
      const blob = await exportProjectInBrowser({
        videoUrl,
        audioUrl,
        scenes,
        onProgress: (pct, message) => {
          setProgress(pct);
          setStatusMessage(message);
        },
        shouldCancel: () => cancelRenderRef.current,
      });
      setResultUrl(URL.createObjectURL(blob));
      setResultIsBlob(true);
      setProgress(100);
      setPhase('done');
    } catch (err) {
      if (err instanceof BrowserExportCanceledError) {
        setPhase('config');
        return;
      }
      setError(
        err instanceof BrowserExportError
          ? err.message
          : 'Browser rendering failed. Try the server export instead.'
      );
      setPhase('failed');
    }
  }, [validate, resetResult, videoUrl, audioUrl, scenes]);

  const cancelBrowserExport = useCallback(() => {
    cancelRenderRef.current = true;
  }, []);

  // ------------------------------------------------------------------
  // Path 2 (fallback): queue an ffmpeg render on the server.
  // ------------------------------------------------------------------
  const startServerExport = useCallback(async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setPhase('failed');
      return;
    }

    resetResult();
    setError(null);
    setProgress(0);
    setStatusMessage('Queuing server-side export...');
    setPhase('rendering');

    try {
      const status = await triggerProjectExport(trackerId as string);
      setStatusMessage(status.status_message ?? 'Export queued on the server...');

      if (status.status === 'completed' && status.video_url) {
        setResultUrl(status.video_url);
        setProgress(100);
        setPhase('done');
        return;
      }
      if (status.status === 'failed') {
        setError(status.status_message || 'Export failed.');
        setPhase('failed');
        return;
      }

      setProgress(status.progress ?? 0);
      abortRef.current = streamProjectExport(trackerId as string, {
        onProgress: (s) => {
          setProgress(s.progress ?? 0);
          if (s.status_message) {
            setStatusMessage(s.status_message);
          }
        },
        onDone: (s) => {
          if (s.status === 'completed' && s.video_url) {
            setResultUrl(s.video_url);
            setProgress(100);
            setPhase('done');
          } else {
            setError(s.status_message || 'Export failed.');
            setPhase('failed');
          }
        },
        onError: (err) => {
          setError(err.message || 'Export failed.');
          setPhase('failed');
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the export.');
      setPhase('failed');
    }
  }, [validate, resetResult, trackerId]);

  const handleCancel = useCallback(() => {
    // Works for whichever path is active: flags the browser loop, aborts SSE.
    cancelBrowserExport();
    abortRef.current?.();
    abortRef.current = null;
    setPhase('config');
  }, [cancelBrowserExport]);

  const handleBack = useCallback(() => {
    cancelBrowserExport();
    abortRef.current?.();
    abortRef.current = null;
    onBackToEditor();
  }, [onBackToEditor, cancelBrowserExport]);

  const isVideo = !!videoUrl;

  return (
    <Container size={520} py={60}>
      <Stack align="center" gap="lg">
        <Title order={2}>Export Video</Title>

        <Text c="dimmed" size="sm" ta="center">
          Renders right here in your browser using hardware acceleration — fast, private, and it
          won't touch the server.
        </Text>

        {error && (
          <Alert color="red" w="100%">
            {error}
          </Alert>
        )}

        {phase === 'config' && (
          <Card withBorder radius="lg" padding="xl" w="100%">
            <Stack gap="lg">
              <Stack gap={6}>
                <Text fw={600}>Output</Text>
                <Badge variant="light" size="lg">
                  1280×720 · MP4 · {isVideo ? '24fps video' : 'light 16fps (image+audio)'}
                </Badge>
                <Text c="dimmed" size="xs">
                  {isVideo
                    ? 'Renders the original video with each scene\u2019s generated image overlaid during its time range, transitions preserved by the encoder.'
                    : 'Builds a video from your scene images timed to your uploaded audio, including the audio.'}
                </Text>
              </Stack>
              <Divider />
              <Button
                size="md"
                leftSection={<IconCpu size={18} />}
                onClick={() => void startBrowserExport()}
                disabled={
                  browserSupported === false ||
                  !trackerId ||
                  (!videoUrl && !audioUrl) ||
                  scenes.length === 0
                }
              >
                Render in browser
              </Button>
              {browserSupported === false && (
                <Text c="dimmed" size="xs" ta="center">
                  This browser can't hardware-encode video — use the server option below.
                </Text>
              )}
              <Button
                variant="subtle"
                size="xs"
                leftSection={<IconServer size={14} />}
                onClick={() => void startServerExport()}
                disabled={!trackerId || (!videoUrl && !audioUrl) || scenes.length === 0}
              >
                Slow device? Render on the server instead
              </Button>
            </Stack>
          </Card>
        )}

        {phase === 'rendering' && (
          <Card withBorder radius="lg" padding="xl" w="100%">
            <Stack align="center" gap="md">
              <ThemeIcon size={56} radius="xl" variant="light" color="brand">
                <Loader size={28} color="var(--ez-accent)" />
              </ThemeIcon>
              <Title order={4}>Rendering your video…</Title>
              <Progress value={progress} size="lg" radius="xl" striped animated w="100%" />
              <Text c="dimmed" size="sm" className="ez-timecode">
                {Math.round(progress)}% — {statusMessage || 'Rendering.'}
              </Text>
              <Button variant="subtle" size="xs" onClick={handleCancel}>
                Cancel
              </Button>
            </Stack>
          </Card>
        )}

        {phase === 'done' && (
          <Card withBorder radius="lg" padding="xl" w="100%">
            <Stack align="center" gap="md">
              <ThemeIcon size={56} radius="xl" variant="light" color="teal">
                <IconCheck size={28} />
              </ThemeIcon>
              <Title order={4}>Your video is ready</Title>
              <Badge variant="light" size="lg">
                output.mp4 · 1280×720 · MP4
              </Badge>
              <Group>
                {resultUrl && (
                  <Button
                    component="a"
                    href={resultUrl}
                    download={resultIsBlob ? 'ezclip-export.mp4' : undefined}
                    target={resultIsBlob ? undefined : '_blank'}
                    rel={resultIsBlob ? undefined : 'noopener noreferrer'}
                    leftSection={<IconDownload size={18} />}
                  >
                    Download Video
                  </Button>
                )}
                <Button variant="subtle" onClick={handleBack}>
                  Back to editor
                </Button>
              </Group>
            </Stack>
          </Card>
        )}

        {phase === 'failed' && (
          <Card withBorder radius="lg" padding="xl" w="100%">
            <Stack align="center" gap="md">
              <Alert color="red" w="100%">
                {error || 'Export failed.'}
              </Alert>
              <Group>
                <Button
                  leftSection={<IconCpu size={18} />}
                  onClick={() => void startBrowserExport()}
                  disabled={browserSupported === false}
                >
                  Try again in browser
                </Button>
                <Button
                  variant="subtle"
                  leftSection={<IconVideo size={16} />}
                  onClick={() => void startServerExport()}
                >
                  Use server export
                </Button>
                <Button variant="subtle" onClick={handleBack}>
                  Back to editor
                </Button>
              </Group>
            </Stack>
          </Card>
        )}
      </Stack>
    </Container>
  );
}

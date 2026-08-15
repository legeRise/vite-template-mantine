import { useEffect, useState } from 'react';
import { IconAlertCircle, IconCheck, IconLoader2 } from '@tabler/icons-react';
import { Alert, Button, Center, Container, Progress, Stack, Text, Title } from '@mantine/core';
import { useVideoFlow } from '../VideoFlowContext';

interface ProcessingViewProps {
  onComplete: () => void;
  onRetry: () => void;
  videoLabel: string;
  failed: boolean;
  error: string | null;
}

interface Stage {
  label: string;
  state: 'pending' | 'active' | 'done';
}

// Stage windows map exactly to the backend's progress ladder in
// text2video.tasks.process_uploaded_video:
//   0-2  upload / received
//   2-5  extracting audio (ffmpeg)
//   5    transcribing
//   8-13 generating scenes (scene-gen agents)
//   20-80 generating scene images
//   100  done
const STAGES: { label: string; max: number; keywords?: string[] }[] = [
  { label: 'Upload complete', max: 2, keywords: ['received', 'upload'] },
  { label: 'Extracting audio', max: 5, keywords: ['extracting audio'] },
  { label: 'Creating transcript', max: 8, keywords: ['transcrib'] },
  { label: 'Generating scenes', max: 20, keywords: ['scene'] },
  { label: 'Generating scene images', max: 100, keywords: ['image'] },
];

export function ProcessingView({
  onComplete,
  onRetry,
  videoLabel,
  failed,
  error,
}: ProcessingViewProps) {
  const { jobStatus, jobPhase } = useVideoFlow();
  const [completedNotified, setCompletedNotified] = useState(false);

  const progress = Math.min(100, Math.max(0, Math.round(jobStatus?.progress ?? 0)));
  const statusMessage = (jobStatus?.status_message ?? '').toLowerCase();

  // Determine the active stage index. Prefer matching on the backend's
  // status_message keywords (most accurate); fall back to progress windows.
  let activeIndex = -1;
  if (jobPhase === 'completed') {
    activeIndex = STAGES.length; // all done
  } else if (jobPhase === 'failed') {
    activeIndex = -1;
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

  // Notify parent to move to the analysis step once the job completes.
  useEffect(() => {
    if (jobPhase === 'completed' && !completedNotified) {
      setCompletedNotified(true);
      const t = window.setTimeout(onComplete, 600);
      return () => window.clearTimeout(t);
    }
  }, [jobPhase, completedNotified, onComplete]);

  // Belt-and-suspenders: if progress reaches 100% but the phase hasn't been
  // marked complete (e.g. a missed terminal SSE event / stale module), force
  // the transition a couple of seconds later rather than hanging on a spinner.
  useEffect(() => {
    if (!failed && !completedNotified && progress >= 100) {
      const t = window.setTimeout(() => {
        setCompletedNotified(true);
        onComplete();
      }, 3000);
      return () => window.clearTimeout(t);
    }
  }, [progress, failed, completedNotified, onComplete]);

  const isFailed = failed;

  return (
    <Container size={520} py={70}>
      <Stack align="center" gap="lg">
        <Title order={2}>{isFailed ? 'Analysis failed' : 'Analyzing your video'}</Title>
        <Text c="dimmed" size="lg">
          {videoLabel}
        </Text>

        {isFailed && error && (
          <Alert color="red" icon={<IconAlertCircle size={16} />} w="100%">
            {error}
          </Alert>
        )}

        <Stack gap={6} w="100%" mt="lg">
          {stages.map((stage) => (
            <StageRow key={stage.label} stage={stage} />
          ))}
        </Stack>

        <Stack w="100%" mt="md">
          <Progress
            value={progress}
            size="lg"
            radius="xl"
            striped
            animated
            color={isFailed ? 'red' : 'violet'}
          />
          <Text c="dimmed" size="sm" ta="center">
            {isFailed
              ? 'The job could not be completed.'
              : `${progress}% — ${jobStatus?.status_message || 'This may take a moment...'}`}
          </Text>
        </Stack>

        {isFailed && (
          <Button variant="light" color="red" onClick={onRetry}>
            Start over
          </Button>
        )}
      </Stack>
    </Container>
  );
}

function StageRow({ stage }: { stage: Stage }) {
  if (stage.state === 'done') {
    return (
      <RowShell>
        <IconCheck size={18} color="var(--mantine-color-teal-6)" />
        <Text size="md">{stage.label}</Text>
      </RowShell>
    );
  }
  if (stage.state === 'active') {
    return (
      <RowShell active>
        <Center>
          <IconLoader2 size={18} className="spin" color="var(--mantine-color-violet-6)" />
        </Center>
        <Text size="md" fw={600}>
          {stage.label}
        </Text>
      </RowShell>
    );
  }
  return (
    <RowShell>
      <Center style={{ width: 18 }}>
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
        background: active ? 'var(--mantine-color-violet-0)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>{children}</div>
      {active && <Progress value={78} size="xs" radius="xl" color="violet" striped animated />}
    </Stack>
  );
}

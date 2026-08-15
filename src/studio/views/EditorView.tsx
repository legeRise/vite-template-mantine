import { useRef, useState } from 'react';
import {
  IconAlertCircle,
  IconArrowLeft,
  IconCheck,
  IconDownload,
  IconEye,
  IconMovie,
  IconPhoto,
  IconRefresh,
  IconVideo,
} from '@tabler/icons-react';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Container,
  Group,
  NumberInput,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { formatDelta } from '../../lib/api';
import { useVideoFlow, type SceneModel } from '../VideoFlowContext';

interface EditorViewProps {
  scenes: SceneModel[];
  onBack: () => void;
  onOpenPreview: () => void;
  onOpenExport: () => void;
}

export function EditorView({ scenes, onBack, onOpenPreview, onOpenExport }: EditorViewProps) {
  const [activeId, setActiveId] = useState<number>(scenes[0]?.id ?? 1);
  const active = scenes.find((s) => s.id === activeId) ?? scenes[0];

  return (
    <Stack gap={0} style={{ minHeight: '100vh' }} bg="var(--app-bg)">
      {/* Top bar */}
      <Group
        justify="space-between"
        px="lg"
        py="sm"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Group>
          <ActionIcon variant="subtle" onClick={onBack} aria-label="Back">
            <IconArrowLeft size={18} />
          </ActionIcon>
          <IconVideo size={20} color="var(--mantine-color-violet-6)" />
          <Text fw={700}>My Video</Text>
        </Group>
        <Group>
          <Button variant="light" leftSection={<IconEye size={16} />} onClick={onOpenPreview}>
            Full Preview
          </Button>
          <Button leftSection={<IconDownload size={16} />} onClick={onOpenExport}>
            Export
          </Button>
        </Group>
      </Group>

      {/* Timeline */}
      <Paper
        p="lg"
        radius={0}
        bg="var(--mantine-color-dark-6)"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
              Timeline
            </Text>
            <Group gap="xs">
              <Badge variant="light" size="sm">
                {scenes.length} scenes
              </Badge>
            </Group>
          </Group>
          <Group
            gap="md"
            align="stretch"
            wrap="nowrap"
            style={{ overflowX: 'auto', paddingBottom: 8 }}
          >
            {scenes.map((scene) => (
              <TimelineCard
                key={scene.id}
                scene={scene}
                active={scene.id === active.id}
                onClick={() => setActiveId(scene.id)}
              />
            ))}
          </Group>
        </Stack>
      </Paper>

      {/* Detail panel */}
      {active && (
        <Container size={760} py="xl">
          <SceneEditor key={active.id} scene={active} />
        </Container>
      )}
    </Stack>
  );
}

function TimelineCard({
  scene,
  active,
  onClick,
}: {
  scene: SceneModel;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      withBorder
      radius="md"
      padding={0}
      style={{
        width: 120,
        flexShrink: 0,
        cursor: 'pointer',
        borderColor: active ? 'var(--mantine-color-violet-5)' : undefined,
        borderWidth: active ? 2 : 1,
        overflow: 'hidden',
      }}
      onClick={onClick}
    >
      <Box
        style={{
          height: 68,
          background: scene.imageUrl
            ? `url(${scene.imageUrl}) center / cover`
            : 'var(--mantine-color-violet-1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {!scene.imageUrl && (
          <ThemeIcon variant="light" radius="xl" size={28}>
            <IconPhoto size={16} />
          </ThemeIcon>
        )}
      </Box>
      <Stack gap={2} p="xs" bg="var(--mantine-color-body)">
        <Text size="sm" fw={600}>
          Scene {String(scene.number).padStart(2, '0')}
        </Text>
        <Text size="xs" c="dimmed">
          {scene.start} · {formatDelta(scene.endSeconds - scene.startSeconds)}
        </Text>
      </Stack>
    </Card>
  );
}

function SceneEditor({ scene }: { scene: SceneModel }) {
  const { updateScene, regenerateImage } = useVideoFlow();
  const [title, setTitle] = useState(scene.title);
  const [prompt, setPrompt] = useState(scene.prompt);
  const [startSeconds, setStartSeconds] = useState<number | string>(scene.startSeconds);
  const [endSeconds, setEndSeconds] = useState<number | string>(scene.endSeconds);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  const save = async () => {
    const start = typeof startSeconds === 'number' ? startSeconds : Number(startSeconds);
    const end = typeof endSeconds === 'number' ? endSeconds : Number(endSeconds);

    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      setError('Set a valid scene time range. End time must be after start time.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateScene(scene.id, {
        scene_title: title,
        image_prompt: prompt,
        start,
        end,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save scene');
    } finally {
      setSaving(false);
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
      saveTimer.current = window.setTimeout(() => setSaved(false), 2500);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setError(null);
    try {
      await regenerateImage(scene.id, prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate image');
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <Stack gap={6} style={{ flex: 1 }}>
          <Title order={3}>Scene {String(scene.number).padStart(2, '0')}</Title>
          <Text c="dimmed" size="sm">
            {scene.start} — {scene.end} · {formatDelta(scene.endSeconds - scene.startSeconds)}
          </Text>
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            label="Scene title"
            mt="sm"
          />
          <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm" mt="sm">
            <NumberInput
              value={startSeconds}
              onChange={setStartSeconds}
              label="Start"
              suffix=" sec"
              min={0}
              decimalScale={2}
              clampBehavior="strict"
            />
            <NumberInput
              value={endSeconds}
              onChange={setEndSeconds}
              label="End"
              suffix=" sec"
              min={0}
              decimalScale={2}
              clampBehavior="strict"
            />
            <NumberInput
              value={
                typeof startSeconds === 'number' && typeof endSeconds === 'number'
                  ? Math.max(0, endSeconds - startSeconds)
                  : scene.endSeconds - scene.startSeconds
              }
              label="Duration"
              suffix=" sec"
              decimalScale={2}
              disabled
            />
          </SimpleGrid>
        </Stack>
        <Badge
          variant={scene.edited ? 'filled' : 'light'}
          size="lg"
          color={scene.edited ? 'teal' : 'gray'}
        >
          {scene.edited ? `Edited · ${scene.regenerateCount} regen` : 'Generated'}
        </Badge>
      </Group>

      {error && (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {error}
        </Alert>
      )}

      {/* Generated image */}
      <Card withBorder radius="lg" padding="md">
        <Stack gap="md">
          <Box
            style={{
              width: '100%',
              aspectRatio: '16 / 9',
              borderRadius: 'var(--mantine-radius-md)',
              background: scene.imageUrl
                ? `url(${scene.imageUrl}) center / cover`
                : 'var(--mantine-color-violet-1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {!scene.imageUrl && (
              <Center style={{ flexDirection: 'column', gap: 8 }}>
                <ThemeIcon variant="light" radius="xl" size={56}>
                  <IconPhoto size={26} />
                </ThemeIcon>
                <Text size="sm" c="dimmed" fw={600}>
                  No image generated
                </Text>
              </Center>
            )}
          </Box>

          <Group justify="space-between" align="center">
            <Text size="xs" tt="uppercase" c="dimmed" fw={600} style={{ letterSpacing: '0.06em' }}>
              Scene Image
            </Text>
            <Group>
              <Button
                size="xs"
                variant="light"
                loading={regenerating}
                leftSection={<IconRefresh size={14} />}
                onClick={handleRegenerate}
              >
                Regenerate Image
              </Button>
            </Group>
          </Group>
          <Text c="dimmed" size="xs">
            Regenerations: {scene.regenerateCount}
          </Text>
        </Stack>
      </Card>

      {/* Visual prompt */}
      <Card withBorder radius="lg" padding="lg">
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600}>Visual Prompt</Text>
            <Badge variant="light" size="sm">
              Image Model
            </Badge>
          </Group>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            minRows={4}
            autosize
            placeholder="Describe the image you want for this scene..."
          />
        </Stack>
      </Card>

      <Group justify="flex-end">
        {saved && (
          <Text c="teal" size="sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconCheck size={16} /> Saved
          </Text>
        )}
        <Button leftSection={<IconMovie size={16} />} loading={saving} onClick={save}>
          Save Scene
        </Button>
      </Group>
    </Stack>
  );
}

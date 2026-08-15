import { useState } from 'react';
import {
  IconBrandYoutube,
  IconClock,
  IconChevronDown,
  IconMovie,
  IconPhoto,
  IconSparkles,
} from '@tabler/icons-react';
import { Collapse } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { formatDelta } from '../../lib/api';
import type { SceneModel } from '../VideoFlowContext';

interface AnalysisViewProps {
  videoLabel: string;
  scenes: SceneModel[];
  onOpenEditor: () => void;
}

export function AnalysisView({ videoLabel, scenes, onOpenEditor }: AnalysisViewProps) {
  return (
    <Container size={860} py={40}>
      <Stack gap="xl">
        {/* Header */}
        <Stack gap={6}>
          <Text fw={700} size="sm" tt="uppercase" c="dimmed" style={{ letterSpacing: '0.08em' }}>
            Video Analysis
          </Text>
          <Group justify="space-between">
            <Group gap="sm">
              <ThemeIcon variant="light" radius="md" size={44}>
                <IconMovie size={22} />
              </ThemeIcon>
              <Stack gap={0}>
                <Title order={2}>{videoLabel || 'Your video'}</Title>
                <Group gap={6}>
                  <IconClock size={14} />
                  <Text c="dimmed" size="sm">
                    {scenes.length} scenes
                  </Text>
                </Group>
              </Stack>
            </Group>
          </Group>
        </Stack>

        {/* Scene Plan */}
        <Section title={`Scene Plan · ${scenes.length} scenes`} icon={<IconSparkles size={18} />}>
          <Text c="dimmed" size="sm" mb="sm">
            Your video was divided into {scenes.length} visual scenes. Tap a scene to see its
            visual prompt.
          </Text>
          <Stack gap="sm">
            {scenes.map((scene) => (
              <SceneRow key={scene.id} scene={scene} />
            ))}
          </Stack>
        </Section>

        {/* Decision */}
        <Stack align="center" gap="lg" my="xl">
          <Title order={3}>Ready to build?</Title>
          <Group align="stretch" grow gap="md" style={{ maxWidth: 560 }} wrap="nowrap">
            <Card withBorder radius="lg" padding="xl" style={{ cursor: 'pointer' }} onClick={onOpenEditor}>
              <Stack align="center" gap="md">
                <ThemeIcon size={56} radius="xl" variant="light" color="violet">
                  <IconBrandYoutube size={28} />
                </ThemeIcon>
                <Stack align="center" gap={4}>
                  <Title order={4}>Build the Video</Title>
                  <Text c="dimmed" size="sm" ta="center">
                    Review and edit each generated scene, then regenerate images.
                  </Text>
                </Stack>
                <Button size="sm" variant="light">
                  Open Editor
                </Button>
              </Stack>
            </Card>
          </Group>
        </Stack>
      </Stack>
    </Container>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Paper withBorder radius="lg" p="xl">
      <Group gap="xs" mb="md">
        <ThemeIcon variant="subtle" size={28} radius="md">
          {icon}
        </ThemeIcon>
        <Title order={3} size="h4">
          {title}
        </Title>
      </Group>
      {children}
    </Paper>
  );
}

// Compact, collapsed-by-default scene row. Full editing/preview lives in the
// Editor, so the Analysis view keeps scenes as tappable summaries.
function SceneRow({ scene }: { scene: SceneModel }) {
  const [expanded, { toggle }] = useDisclosure(false);

  return (
    <Card withBorder radius="md" padding="sm">
      <Stack gap={0}>
        {/* Header row — always visible */}
        <Group justify="space-between" align="center" wrap="nowrap" onClick={toggle} style={{ cursor: 'pointer' }}>
          <Group gap="sm" align="center" wrap="nowrap">
            <Box style={{ width: 64, height: 40, borderRadius: 'var(--mantine-radius-sm)', overflow: 'hidden', flexShrink: 0 }}>
              {scene.imageUrl ? (
                <img
                  src={scene.imageUrl}
                  alt={scene.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Box h="100%" w="100%" style={{ background: 'var(--mantine-color-violet-0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconPhoto size={16} color="var(--mantine-color-violet-6)" />
                </Box>
              )}
            </Box>
            <ThemeIcon variant="filled" radius="md" color="violet" size={28}>
              <Text size="xs" fw={700}>
                {String(scene.number).padStart(2, '0')}
              </Text>
            </ThemeIcon>
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Text fw={600} size="sm" lineClamp={1}>
                {scene.title}
              </Text>
              <Badge variant="light" color="gray" size="xs">
                {scene.start} — {scene.end} · {formatDelta(scene.endSeconds - scene.startSeconds)}
              </Badge>
            </Stack>
          </Group>
          <ThemeIcon variant="subtle" size={28} radius="md">
            <IconChevronDown
              size={18}
              style={{
                transition: 'transform 200ms ease',
                transform: expanded ? 'rotate(180deg)' : undefined,
              }}
            />
          </ThemeIcon>
        </Group>

        {/* Expandable body — collapsed by default */}
        <Collapse expanded={expanded}>
          <Stack gap="md" pt="md" px="xs" pb="xs">
            <Stack gap={4}>
              <Text fw={600} size="sm" tt="uppercase" c="dimmed" style={{ letterSpacing: '0.06em' }}>
                Visual Prompt
              </Text>
              <Text size="sm" lh={1.6}>
                {scene.prompt}
              </Text>
            </Stack>
          </Stack>
        </Collapse>
      </Stack>
    </Card>
  );
}


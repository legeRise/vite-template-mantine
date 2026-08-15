import { useCallback, useEffect, useState } from 'react';
import {
  IconClock,
  IconMovie,
  IconPhoto,
  IconRefresh,
  IconVideo,
} from '@tabler/icons-react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Container,
  Group,
  Image,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { getMyCreations, type CreationInfo } from '../../lib/api';

interface HistoryViewProps {
  /** Called when the user opens a past creation so the app can switch back to the create flow. */
  onOpen: (trackerId: string, label: string) => Promise<void> | void;
}

/**
 * Full-page "Creation history". Lists every past creation; clicking one reopens
 * its scenes in the editor/preview so it can be reviewed, re-edited, or
 * re-exported — even after a page refresh, because the scenes and media are
 * persisted server-side.
 */
export function HistoryView({ onOpen }: HistoryViewProps) {
  const [creations, setCreations] = useState<CreationInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyCreations();
      setCreations(res.results.text2video ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOpen = async (c: CreationInfo) => {
    if (openingId) return;
    setOpeningId(c.tracker_id);
    try {
      await onOpen(c.tracker_id, c.script ? c.script.slice(0, 40) : `Creation ${c.tracker_id.slice(0, 8)}`);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="md">
        <Stack gap={2}>
          <Title order={2}>Creation history</Title>
          <Text c="dimmed" size="sm">
            Reopen any of your past creations to preview, re-edit, or re-export it.
          </Text>
        </Stack>
        <Group gap="sm">
          <Button
            variant="subtle"
            leftSection={<IconRefresh size={16} />}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        </Group>
      </Group>

      {error && (
        <Alert color="red" icon={<IconClock size={16} />} mb="md">
          {error}
        </Alert>
      )}

      {loading ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : creations.length === 0 ? (
        <Center py="xl" style={{ flexDirection: 'column', gap: 8 }}>
          <ThemeIcon variant="light" radius="xl" size={48}>
            <IconMovie size={22} />
          </ThemeIcon>
          <Text c="dimmed">No creations yet. Upload a video and your history will appear here.</Text>
        </Center>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {creations.map((c) => (
            <CreationCard
              key={c.tracker_id}
              creation={c}
              loading={openingId === c.tracker_id}
              onOpen={() => void handleOpen(c)}
            />
          ))}
        </SimpleGrid>
      )}
    </Container>
  );
}

function CreationCard({
  creation: c,
  onOpen,
  loading,
}: {
  creation: CreationInfo;
  onOpen: () => void;
  loading?: boolean;
}) {
  const dateLabel = c.generated_at || c.updated_at || c.created_at;
  return (
    <Box
      onClick={onOpen}
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-lg)',
        overflow: 'hidden',
        cursor: loading ? 'default' : 'pointer',
        background: 'var(--mantine-color-body)',
        opacity: loading ? 0.7 : 1,
        position: 'relative',
      }}
    >
      {loading && (
        <Center
          style={{ position: 'absolute', inset: 0, zIndex: 2, background: 'rgba(0,0,0,0.3)' }}
        >
          <Loader color="white" size="sm" />
        </Center>
      )}
      <Box style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000' }}>
        {c.thumbnail ? (
          <Image
            src={c.thumbnail}
            alt={c.script ? c.script.slice(0, 40) : 'creation'}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.background =
                'var(--mantine-color-dark-6)';
            }}
          />
        ) : (
          <Center style={{ width: '100%', height: '100%' }}>
            <ThemeIcon variant="light" radius="xl" size={40}>
              <IconPhoto size={18} />
            </ThemeIcon>
          </Center>
        )}
        <Badge
          variant="filled"
          color={c.status === 'completed' ? 'teal' : c.status === 'failed' ? 'red' : 'gray'}
          size="xs"
          style={{ position: 'absolute', top: 8, left: 8 }}
        >
          {c.status}
        </Badge>
      </Box>
      <Stack gap={2} p="sm">
        <Text size="sm" fw={600} lineClamp={1}>
          {c.script ? c.script.slice(0, 60) : `Creation · ${c.tracker_id.slice(0, 8)}`}
        </Text>
        <Group gap={6}>
          <IconMovie size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
          <Text size="xs" c="dimmed">
            {c.scene_count} scenes · {dateLabel}
          </Text>
        </Group>
        <Group gap={6}>
          {c.video_url && c.is_video_available && (
            <>
              <IconVideo size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
              <Text size="xs" c="dimmed">
                video ready
              </Text>
            </>
          )}
          {c.source_type && (
            <Text size="xs" c="dimmed" tt="uppercase">
              {c.source_type}
            </Text>
          )}
          {typeof c.resolution === 'string' && c.resolution && (
            <Text size="xs" c="dimmed">
              · {c.resolution}
            </Text>
          )}
        </Group>
      </Stack>
    </Box>
  );
}

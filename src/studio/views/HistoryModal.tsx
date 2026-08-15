import { useCallback, useEffect, useState } from 'react';
import {
  IconClock,
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
  Center,
  Group,
  Image,
  Loader,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Title,
  ThemeIcon,
} from '@mantine/core';
import { getMyCreations, type CreationInfo } from '../../lib/api';

export interface HistoryModalProps {
  opened: boolean;
  onClose: () => void;
  onSelect: (trackerId: string, label: string) => void;
}

/**
 * Modal that lists all of the user's past creations (history). Selecting one
 * reopens it in the editor/preview so a previously generated video can be
 * reviewed, re-edited, or re-exported — even after a page refresh, because the
 * scenes and image URLs are persisted server-side.
 */
export function HistoryModal({ opened, onClose, onSelect }: HistoryModalProps) {
  const [creations, setCreations] = useState<CreationInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);

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
    if (opened) {
      void load();
    }
  }, [opened, load]);

  const handleSelect = async (c: CreationInfo) => {
    if (selecting) return;
    setSelecting(true);
    try {
      await onSelect(c.tracker_id, c.script ? c.script.slice(0, 40) : `Creation ${c.tracker_id.slice(0, 8)}`);
    } finally {
      setSelecting(false);
      onClose();
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} size="lg" title="Your creations" centered>
      <Stack gap="md">
        <Group justify="space-between">
          <Text c="dimmed" size="sm">
            Pick a previous creation to reopen its preview and scenes.
          </Text>
          <ActionIcon variant="subtle" onClick={() => void load()} aria-label="Refresh">
            <IconRefresh size={18} />
          </ActionIcon>
        </Group>

        {error && (
          <Alert color="red" icon={<IconClock size={16} />}>
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
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {creations.map((c) => (
              <CreationCard key={c.tracker_id} creation={c} onOpen={() => void handleSelect(c)} />
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Modal>
  );
}

function CreationCard({
  creation: c,
  onOpen,
}: {
  creation: CreationInfo;
  onOpen: () => void;
}) {
  const dateLabel = c.generated_at || c.updated_at || c.created_at;
  return (
    <Box
      onClick={onOpen}
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-lg)',
        overflow: 'hidden',
        cursor: 'pointer',
        background: 'var(--mantine-color-body)',
      }}
    >
      <Box style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000' }}>
        {c.thumbnail ? (
          <Image
            src={c.thumbnail}
            alt={c.script ? c.script.slice(0, 40) : 'creation'}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.background = 'var(--mantine-color-dark-6)';
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

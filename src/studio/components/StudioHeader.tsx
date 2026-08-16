import {
  IconHistory,
  IconLogout,
  IconMovie,
  IconVideo,
} from '@tabler/icons-react';
import { ActionIcon, Button, Group, Text, Tooltip } from '@mantine/core';
import { useVideoFlow } from '../VideoFlowContext';

export type StudioTab = 'create' | 'history';

interface StudioHeaderProps {
  activeTab: StudioTab;
  onTabChange: (tab: StudioTab) => void;
  title?: string;
  right?: React.ReactNode;
}

/**
 * Persistent application navbar. Always visible on every step; offers the two
 * top-level destinations — "Create video" (the upload/analyze/edit/export flow)
 * and "Creation history" (reopen any past creation).
 */
export function StudioHeader({ activeTab, onTabChange, title, right }: StudioHeaderProps) {
  const { logout } = useVideoFlow();

  return (
    <Group
      justify="space-between"
      px="lg"
      py="sm"
      wrap="wrap"
      gap="md"
      className="app-header"
    >
      {/* Brand */}
      <Group gap="sm" wrap="nowrap">
        <Group className="logo" gap="sm" wrap="nowrap">
          <span className="logo-mark" aria-hidden>
            <IconVideo size={18} />
          </span>
          <div>
            <div className="logo-title">Video to Story</div>
            {title ? (
              <Text size="xs" c="dimmed" style={{ lineHeight: 1.1 }}>
                {title}
              </Text>
            ) : (
              <Text size="xs" c="dimmed" style={{ lineHeight: 1.1 }}>
                Create · Edit · Export
              </Text>
            )}
          </div>
        </Group>
      </Group>

      {/* Top-level navigation tabs */}
      <Group gap={6}>
        <Button
          variant={activeTab === 'create' ? 'filled' : 'subtle'}
          color={activeTab === 'create' ? 'violet' : 'gray'}
          leftSection={<IconMovie size={16} />}
          radius="xl"
          onClick={() => onTabChange('create')}
        >
          Create video
        </Button>
        <Button
          variant={activeTab === 'history' ? 'filled' : 'subtle'}
          color={activeTab === 'history' ? 'violet' : 'gray'}
          leftSection={<IconHistory size={16} />}
          radius="xl"
          onClick={() => onTabChange('history')}
        >
          Creation history
        </Button>
      </Group>

      <Group>
        {right}
        <Tooltip label="Sign out">
          <ActionIcon variant="light" color="gray" radius="xl" onClick={logout} aria-label="Sign out">
            <IconLogout size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
}

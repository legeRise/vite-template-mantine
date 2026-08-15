import {
  IconBrandYoutube,
  IconHistory,
  IconLogout,
  IconMovie,
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
      style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
    >
      <Group>
        <Group gap={6}>
          <IconBrandYoutube size={22} color="var(--mantine-color-violet-6)" />
          <Text fw={700} size="md">
            Video to Story
          </Text>
        </Group>
        {title && (
          <Text c="dimmed" size="sm" ml="sm">
            {title}
          </Text>
        )}
      </Group>

      {/* Top-level navigation tabs */}
      <Group gap={6}>
        <Button
          variant={activeTab === 'create' ? 'light' : 'subtle'}
          leftSection={<IconMovie size={16} />}
          onClick={() => onTabChange('create')}
        >
          Create video
        </Button>
        <Button
          variant={activeTab === 'history' ? 'light' : 'subtle'}
          leftSection={<IconHistory size={16} />}
          onClick={() => onTabChange('history')}
        >
          Creation history
        </Button>
      </Group>

      <Group>
        {right}
        <Tooltip label="Sign out">
          <ActionIcon variant="subtle" onClick={logout} aria-label="Sign out">
            <IconLogout size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
}

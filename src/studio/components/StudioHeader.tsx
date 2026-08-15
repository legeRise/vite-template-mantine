import { IconArrowLeft, IconBrandYoutube, IconLogout, IconPlus } from '@tabler/icons-react';
import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import { useVideoFlow } from '../VideoFlowContext';

interface StudioHeaderProps {
  title?: string;
  onBack?: () => void;
  onNewProject?: () => void;
  right?: React.ReactNode;
}

export function StudioHeader({ title, onBack, onNewProject, right }: StudioHeaderProps) {
  const { logout } = useVideoFlow();

  return (
    <Group
      justify="space-between"
      px="lg"
      py="sm"
      style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
    >
      <Group>
        {onBack && (
          <ActionIcon variant="subtle" onClick={onBack} aria-label="Go back">
            <IconArrowLeft size={18} />
          </ActionIcon>
        )}
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
      <Group>
        {right}
        {onNewProject && (
          <Tooltip label="Start a new project">
            <ActionIcon variant="subtle" onClick={onNewProject} aria-label="New project">
              <IconPlus size={18} />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label="Sign out">
          <ActionIcon variant="subtle" onClick={logout} aria-label="Sign out">
            <IconLogout size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
}

import {
  IconHistory,
  IconLogout,
  IconMoon,
  IconSun,
  IconVideo,
} from '@tabler/icons-react';
import {
  ActionIcon,
  Group,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useMantineColorScheme } from '@mantine/core';
import { appThemeOptions } from '../../theme';
import { useAppTheme } from '../../App';
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
 *
 * Follows the design language: the logo is the only brand-gradient element, the
 * active tab gets a subtle --accent-dim pill (never a filled purple), secondary
 * chrome stays on the surface palette.
 */
export function StudioHeader({ activeTab, onTabChange, title, right }: StudioHeaderProps) {
  const { logout } = useVideoFlow();
  const { theme: activeTheme, setTheme } = useAppTheme();
  const { colorScheme } = useMantineColorScheme();

  const tab = (value: StudioTab, label: string, icon: React.ReactNode) => {
    const active = activeTab === value;
    return (
      <UnstyledButton
        key={value}
        role="tab"
        aria-selected={active}
        onClick={() => onTabChange(value)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          borderRadius: 'var(--mantine-radius-md)',
          fontSize: 13.5,
          fontWeight: 600,
          color: active ? 'var(--ez-accent-b)' : 'var(--ez-text-secondary)',
          background: active ? 'var(--ez-accent-dim)' : 'transparent',
          transition: 'background 150ms ease, color 150ms ease',
        }}
      >
        {icon}
        <Text span size="sm" fw={600}>
          {label}
        </Text>
      </UnstyledButton>
    );
  };

  return (
    <Group
      justify="space-between"
      px={{ base: 'md', sm: 'lg' }}
      py="sm"
      wrap="wrap"
      gap="sm"
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
      <Group gap={4}>
        {tab('create', 'Create', <IconVideo size={16} />)}
        {tab('history', 'History', <IconHistory size={16} />)}
      </Group>

      <Group gap="xs">
        <Group
          gap={3}
          style={{
            background: 'var(--ez-surface-2)',
            border: '1px solid var(--ez-line)',
            borderRadius: 999,
            padding: 3,
          }}
        >
          {appThemeOptions
            .filter((option) => !('hidden' in option && option.hidden))
            .map((themeOption) => {
              const isActive = activeTheme === themeOption.value;
              const shortLabel = themeOption.label.slice(0, 1);
              const isLight = themeOption.value === 'light';
              const isDark = themeOption.value === 'dark';

            return (
              <Tooltip key={themeOption.value} label={`${themeOption.label} mode`} withArrow>
                <ActionIcon
                  variant={isActive ? 'filled' : 'subtle'}
                  color={isActive ? 'brand' : 'gray'}
                  radius="xl"
                  size={28}
                  onClick={() => setTheme(themeOption.value)}
                  aria-label={`Use ${themeOption.label.toLowerCase()} theme`}
                  aria-pressed={isActive}
                  style={{
                    minWidth: 32,
                    justifyContent: 'center',
                    paddingInline: 7,
                    border: isActive ? '1px solid var(--ez-line-strong)' : '1px solid transparent',
                    background: isActive ? 'var(--ez-accent-dim)' : 'transparent',
                    color: isActive ? 'var(--ez-accent-b)' : 'var(--ez-text-secondary)',
                    fontWeight: 700,
                  }}
                >
                  {isLight ? <IconSun size={12} /> : isDark ? <IconMoon size={12} /> : <span style={{ fontSize: 10, lineHeight: 1 }}>{shortLabel}</span>}
                </ActionIcon>
              </Tooltip>
            );
          })}
        </Group>
        {right}
        <Tooltip label="Sign out" withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            radius="xl"
            onClick={logout}
            aria-label="Sign out"
          >
            <IconLogout size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
}

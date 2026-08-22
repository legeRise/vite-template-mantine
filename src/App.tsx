import '@mantine/core/styles.css';

import { ColorSchemeScript, MantineProvider, localStorageColorSchemeManager } from '@mantine/core';
import { Router } from './Router';
import { VideoFlowProvider } from './studio/VideoFlowContext';
import { theme } from './theme';
import './global.css';

/**
 * Persist a manual dark/light override in localStorage (defaults to the system
 * preference on first load — see ColorSchemeScript + defaultColorScheme="auto").
 */
const colorSchemeManager = localStorageColorSchemeManager({
  key: 'ezclip-color-scheme',
});

export default function App() {
  return (
    <>
      <ColorSchemeScript defaultColorScheme="auto" />
      <MantineProvider
        colorSchemeManager={colorSchemeManager}
        defaultColorScheme="auto"
        theme={theme}
      >
        <VideoFlowProvider>
          <Router />
        </VideoFlowProvider>
      </MantineProvider>
    </>
  );
}

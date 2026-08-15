import '@mantine/core/styles.css';

import { MantineProvider } from '@mantine/core';
import { Router } from './Router';
import { VideoFlowProvider } from './studio/VideoFlowContext';
import { theme } from './theme';
import './global.css';

export default function App() {
  return (
    <MantineProvider theme={theme}>
      <VideoFlowProvider>
        <Router />
      </VideoFlowProvider>
    </MantineProvider>
  );
}

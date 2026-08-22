import { useCallback, useEffect, useState } from 'react';
import { LoadingOverlay } from '@mantine/core';
import { StudioHeader, type StudioTab } from './components/StudioHeader';
import type { Step } from './types';
import { useVideoFlow } from './VideoFlowContext';
import { EditorView } from './views/EditorView';
import { ExportView } from './views/ExportView';
import { HistoryView } from './views/HistoryView';
import { PreviewModal } from './views/PreviewModal';
import { CreateView } from './views/CreateView';

export function Studio() {
  const {
    isAuthenticated,
    scenes,
    scenesLoading,
    trackerId,
    videoLabel,
    videoUrl,
    audioUrl,
    jobPhase,
    jobError,
    reset,
    openCreation,
  } = useVideoFlow();
  const [step, setStep] = useState<Step>('upload');
  const [activeTab, setActiveTab] = useState<StudioTab>('create');
  const [previewRequest, setPreviewRequest] = useState<{
    sceneId: number | null;
    mode: 'scene' | 'full';
  } | null>(null);

  const previewIsOpen = previewRequest !== null;
  const activePreviewScene = scenes.find((s) => s.id === previewRequest?.sceneId) ?? scenes[0];

  const go = useCallback((next: Step) => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    setStep(next);
  }, []);

  const handleStartOver = useCallback(() => {
    reset();
    setStep('upload');
    setActiveTab('create');
  }, [reset]);

  // Switch to a top-level tab. Clicking "Create video" while already on the
  // create tab mid-project starts a fresh creation (this replaces the old
  // redundant "+" new-project button in the navbar).
  const handleTabChange = useCallback(
    (tab: StudioTab) => {
      if (tab === 'create' && activeTab === 'create' && step !== 'upload') {
        reset();
        setStep('upload');
      }
      setActiveTab(tab);
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    },
    [activeTab, step, reset]
  );

  // Reopen a past creation: load its scenes, then jump straight into the editor.
  const handleOpenFromHistory = useCallback(
    async (trackerId: string, label: string) => {
      await openCreation(trackerId, label);
      setStep('editor');
      setActiveTab('create');
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    },
    [openCreation]
  );

  // Stable callbacks so child effects (e.g. ProcessingView's completion timer)
  // don't churn — an inline arrow would be a new reference every render and
  // cancel the pending onComplete timer.
  const goAnalysis = useCallback(() => go('editor'), [go]);
  const goEditor = useCallback(() => go('editor'), [go]);
  const goExport = useCallback(() => go('export'), [go]);
  const openFullPreview = useCallback(() => {
    setPreviewRequest({ sceneId: null, mode: 'full' });
  }, []);

  // Authoritative completion transition: when the job completes, jump into the
  // editor. CreateView handles both 'upload' and 'processing' steps (and calls
  // onComplete on completion), so this parent-level effect is a robust backstop
  // that guarantees we can never be left stuck on 100% / "Almost there".
  useEffect(() => {
    if ((step === 'upload' || step === 'processing') && jobPhase === 'completed') {
      const t = window.setTimeout(() => {
        setStep('editor');
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      }, 300);
      return () => window.clearTimeout(t);
    }
  }, [step, jobPhase]);

  return (
    <>
      {/* Not signed in — show only the login/upload screen, no app chrome. */}
      {!isAuthenticated ? (
        <CreateView onComplete={goAnalysis} />
      ) : (
        <>
          <StudioHeader
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />

          {activeTab === 'history' ? (
            <HistoryView onOpen={handleOpenFromHistory} />
          ) : (
            <>
              {(step === 'upload' || step === 'processing') && (
                <CreateView onComplete={goAnalysis} />
              )}

              {step === 'editor' && scenes.length > 0 && (
                <EditorView
                  scenes={scenes}
                  onOpenPreview={openFullPreview}
                  onOpenExport={goExport}
                />
              )}

              {step === 'export' && (
                <ExportView
                  onBackToEditor={goEditor}
                  onDone={goAnalysis}
                  trackerId={trackerId}
                  videoUrl={videoUrl}
                  audioUrl={audioUrl}
                  scenes={scenes}
                />
              )}
            </>
          )}
        </>
      )}

      <LoadingOverlay
        visible={scenesLoading}
        zIndex={1000}
        overlayProps={{ radius: 'sm', blur: 1 }}
      />

      {activePreviewScene && (
        <PreviewModal
          opened={previewIsOpen}
          onClose={() => setPreviewRequest(null)}
          activeScene={activePreviewScene}
          scenes={scenes}
          videoUrl={videoUrl}
          audioUrl={audioUrl}
          mode={previewRequest?.mode ?? 'scene'}
        />
      )}
    </>
  );
}

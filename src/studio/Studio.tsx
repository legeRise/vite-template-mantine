import { useCallback, useEffect, useState } from 'react';
import { LoadingOverlay } from '@mantine/core';
import { StudioHeader } from './components/StudioHeader';
import type { Step } from './types';
import { useVideoFlow } from './VideoFlowContext';
import { AnalysisView } from './views/AnalysisView';
import { EditorView } from './views/EditorView';
import { ExportView } from './views/ExportView';
import { PreviewModal } from './views/PreviewModal';
import { ProcessingView } from './views/ProcessingView';
import { UploadView } from './views/UploadView';

export function Studio() {
  const { scenes, scenesLoading, videoLabel, videoUrl, audioUrl, jobPhase, jobError, reset } =
    useVideoFlow();
  const [step, setStep] = useState<Step>('upload');
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

  const handleBack = useCallback(() => {
    setStep((current) => {
      if (current === 'editor') return 'analysis';
      if (current === 'export') return 'editor';
      return 'upload';
    });
  }, []);

  const handleStartOver = useCallback(() => {
    reset();
    setStep('upload');
  }, [reset]);

  // Stable callbacks so child effects (e.g. ProcessingView's completion timer)
  // don't churn — an inline arrow would be a new reference every render and
  // cancel the pending onComplete timer.
  const goAnalysis = useCallback(() => go('analysis'), [go]);
  const goEditor = useCallback(() => go('editor'), [go]);
  const goExport = useCallback(() => go('export'), [go]);
  const openFullPreview = useCallback(() => {
    setPreviewRequest({ sceneId: null, mode: 'full' });
  }, []);

  // Authoritative completion transition: when the job completes while we're on
  // the processing step, advance to the analysis step. This lives at the parent
  // level so child-timer/callback races cannot leave the UI stuck on 100%.
  useEffect(() => {
    if (step === 'processing' && jobPhase === 'completed') {
      const t = window.setTimeout(() => {
        setStep('analysis');
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      }, 300);
      return () => window.clearTimeout(t);
    }
  }, [step, jobPhase]);

  return (
    <>
      {step !== 'upload' && <StudioHeader onBack={handleBack} onNewProject={handleStartOver} />}

      {step === 'upload' && <UploadView onAnalyze={() => go('processing')} />}

      {step === 'processing' && (
        <ProcessingView
          videoLabel={videoLabel}
          onComplete={goAnalysis}
          failed={jobPhase === 'failed'}
          error={jobError}
          onRetry={handleStartOver}
        />
      )}

      {step === 'analysis' && (
        <AnalysisView videoLabel={videoLabel} scenes={scenes} onOpenEditor={goEditor} />
      )}

      {step === 'editor' && scenes.length > 0 && (
        <EditorView
          scenes={scenes}
          onBack={handleBack}
          onOpenPreview={openFullPreview}
          onOpenExport={goExport}
        />
      )}

      {step === 'export' && (
        <ExportView
          onBackToEditor={goEditor}
          onDone={goAnalysis}
          videoUrl={videoUrl}
          audioUrl={audioUrl}
          scenes={scenes}
        />
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

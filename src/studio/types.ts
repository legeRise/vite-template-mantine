// The high-level step of the user journey.
export type Step =
  | 'upload'
  | 'processing'
  | 'analysis'
  | 'decision'
  | 'shorts'
  | 'editor'
  | 'export';

// Sub-steps within the editor.
export type EditorTab = 'edit' | 'preview';

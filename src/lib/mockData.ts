// Demo / story data for the Video → Scenes UI prototype.
// All content here is placeholder and will be replaced by the backend later.

export interface TranscriptEntry {
  time: string;
  seconds: number;
  text: string;
}

export interface Topic {
  id: number;
  title: string;
  start: string;
  end: string;
  startSeconds: number;
  transcriptIndex: number;
}

export interface Scene {
  id: number;
  number: number;
  start: string;
  end: string;
  startSeconds: number;
  endSeconds: number;
  title: string;
  narration: string;
  prompt: string;
  imageId: string;
  versions: string[];
  currentVersion: number;
}

export interface ShortSuggestion {
  id: number;
  title: string;
  hook: string;
  start: string;
  end: string;
  seconds: number;
  whyItWorks: string;
  prompts: string[];
}

export interface VideoAnalysis {
  videoName: string;
  videoDuration: string;
  totalSeconds: number;
  size: string;
  summary: string;
  topics: Topic[];
  transcript: TranscriptEntry[];
  scenes: Scene[];
  shorts: ShortSuggestion[];
}

// Deterministic gradient "images" for the demo (no real assets needed yet).
export const demoGradients = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
  'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
  'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
  'linear-gradient(135deg, #5ee7df 0%, #b490ca 100%)',
];

export const demoImage = (index: number) => demoGradients[index % demoGradients.length];

export const mockAnalysis: VideoAnalysis = {
  videoName: 'my-video.mp4',
  videoDuration: '02:43',
  totalSeconds: 163,
  size: '84 MB',
  summary:
    'This video walks through the three biggest mistakes people make when launching a personal brand online. It opens with a relatable hook, breaks down each mistake with a concrete example, introduces a simple three-step framework to fix them, and closes with an encouraging call to action.',
  topics: [
    {
      id: 1,
      title: 'Introduction',
      start: '00:00',
      end: '00:24',
      startSeconds: 0,
      transcriptIndex: 0,
    },
    {
      id: 2,
      title: 'The main problem',
      start: '00:24',
      end: '01:12',
      startSeconds: 24,
      transcriptIndex: 2,
    },
    {
      id: 3,
      title: 'Proposed solution',
      start: '01:12',
      end: '02:04',
      startSeconds: 72,
      transcriptIndex: 5,
    },
    {
      id: 4,
      title: 'Conclusion',
      start: '02:04',
      end: '02:43',
      startSeconds: 124,
      transcriptIndex: 8,
    },
  ],
  transcript: [
    {
      time: '00:00',
      seconds: 0,
      text: 'Today we are going to talk about why most personal brands never take off, and the small handful of things that actually move the needle.',
    },
    {
      time: '00:18',
      seconds: 18,
      text: 'The biggest problem is that people treat content creation like a hobby instead of a product decision.',
    },
    {
      time: '00:42',
      seconds: 42,
      text: 'What we discovered is that the best creators stop guessing and start testing one clear idea at a time.',
    },
    {
      time: '01:12',
      seconds: 72,
      text: 'So here is the three step framework: pick one audience, one problem, and one consistent format.',
    },
    {
      time: '01:34',
      seconds: 94,
      text: 'Step one is choosing a narrow audience. Broad audiences feel safe but they never build loyalty.',
    },
    {
      time: '01:58',
      seconds: 118,
      text: 'Step two is naming a specific problem that audience wakes up with every single morning.',
    },
    {
      time: '02:18',
      seconds: 138,
      text: 'Step three is committing to a format so people know exactly what to expect from you.',
    },
    {
      time: '02:26',
      seconds: 146,
      text: 'Narrow beats broad. Specific beats vague. Consistent beats perfect.',
    },
    {
      time: '02:34',
      seconds: 154,
      text: 'Start today with one small post. That is all it takes to begin.',
    },
  ],
  scenes: [
    {
      id: 1,
      number: 1,
      start: '00:00',
      end: '00:18',
      startSeconds: 0,
      endSeconds: 18,
      title: 'Introduction',
      narration: 'Today we are going to talk about why most personal brands never take off.',
      prompt:
        'Cinematic establishing shot of a bright modern studio, warm lights, a confident speaker at a desk with a microphone, shallow depth of field, 35mm film look.',
      imageId: 'g0',
      versions: ['g0'],
      currentVersion: 0,
    },
    {
      id: 2,
      number: 2,
      start: '00:18',
      end: '00:42',
      startSeconds: 18,
      endSeconds: 42,
      title: 'The main problem',
      narration:
        'The biggest problem is that people treat content creation like a hobby instead of a product decision.',
      prompt:
        'Close-up of a person staring at a blank screen, scattered sticky notes, moody desaturated tones, dramatic side lighting, documentary style.',
      imageId: 'g1',
      versions: ['g1'],
      currentVersion: 0,
    },
    {
      id: 3,
      number: 3,
      start: '00:42',
      end: '01:12',
      startSeconds: 42,
      endSeconds: 72,
      title: 'The discovery',
      narration:
        'What we discovered is that the best creators stop guessing and start testing one clear idea at a time.',
      prompt:
        'Overhead shot of a bright planning desk with a single highlighted idea card, clean minimal composition, soft natural light, editorial photography.',
      imageId: 'g2',
      versions: ['g2'],
      currentVersion: 0,
    },
    {
      id: 4,
      number: 4,
      start: '01:12',
      end: '01:34',
      startSeconds: 72,
      endSeconds: 94,
      title: 'The framework',
      narration:
        'So here is the three step framework: pick one audience, one problem, and one consistent format.',
      prompt:
        'Modern 3D isometric illustration of three connected blocks labeled step one two and three, vibrant gradient background, clean product render.',
      imageId: 'g3',
      versions: ['g3'],
      currentVersion: 0,
    },
    {
      id: 5,
      number: 5,
      start: '01:34',
      end: '01:58',
      startSeconds: 94,
      endSeconds: 118,
      title: 'Step one: audience',
      narration:
        'Step one is choosing a narrow audience. Broad audiences feel safe but never build loyalty.',
      prompt:
        'Illustration of a camera lens focusing a spotlight on a single person in a large crowd, warm accent colors, clear focal contrast.',
      imageId: 'g4',
      versions: ['g4'],
      currentVersion: 0,
    },
    {
      id: 6,
      number: 6,
      start: '01:58',
      end: '02:18',
      startSeconds: 118,
      endSeconds: 138,
      title: 'Step two: problem',
      narration:
        'Step two is naming a specific problem that audience wakes up with every single morning.',
      prompt:
        'Split screen concept of a morning routine on the left and a glowing question mark on the right, clean vector art, cohesive pastel palette.',
      imageId: 'g5',
      versions: ['g5'],
      currentVersion: 0,
    },
    {
      id: 7,
      number: 7,
      start: '02:18',
      end: '02:34',
      startSeconds: 138,
      endSeconds: 154,
      title: 'Step three: format',
      narration:
        'Step three is committing to a format so people know exactly what to expect from you.',
      prompt:
        'Series of identical framed posters in a row showing the same template style, rhythmic composition, confident brand colors.',
      imageId: 'g6',
      versions: ['g6'],
      currentVersion: 0,
    },
    {
      id: 8,
      number: 8,
      start: '02:34',
      end: '02:43',
      startSeconds: 154,
      endSeconds: 163,
      title: 'Conclusion',
      narration: 'Start today with one small post. That is all it takes to begin.',
      prompt:
        'Sunrise over a calm city skyline, warm hopeful golden light, wide establishing shot, uplifting and inspiring mood.',
      imageId: 'g7',
      versions: ['g7'],
      currentVersion: 0,
    },
  ],
  shorts: [
    {
      id: 1,
      title: 'The biggest mistake people make',
      hook: 'The biggest mistake people make...',
      start: '00:42',
      end: '01:18',
      seconds: 36,
      whyItWorks: 'Strong hook + complete idea',
      prompts: [
        'Close-up of a creator deleting drafts, with a single winning post glowing on screen.',
        'Fast motion of a messy desk transforming into a tidy focused workspace.',
      ],
    },
    {
      id: 2,
      title: 'Narrow beats broad',
      hook: 'Narrow beats broad. Specific beats vague.',
      start: '02:26',
      end: '02:34',
      seconds: 8,
      whyItWorks: 'Short, punchy, quotable line',
      prompts: [
        'Split screen showing a crowded stage versus a single spotlighted speaker.',
        'Bold kinetic typography animating the words narrow, specific, consistent.',
      ],
    },
    {
      id: 3,
      title: 'The proof',
      hook: 'What we discovered was...',
      start: '01:12',
      end: '01:34',
      seconds: 22,
      whyItWorks: 'Sets up an actionable framework',
      prompts: [
        'A clean whiteboard filling in a three step diagram in real time.',
        'Macro shot of a hand writing step numbers one two three on paper.',
      ],
    },
    {
      id: 4,
      title: 'Start today',
      hook: 'Start today with one small post.',
      start: '02:34',
      end: '02:43',
      seconds: 9,
      whyItWorks: 'Uplifting call to action',
      prompts: [
        'Someone pressing publish on their very first post, warm encouraging mood.',
        'Sunrise over a keyboard with a single glowing publish button.',
      ],
    },
  ],
};

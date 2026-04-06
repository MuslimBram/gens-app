export const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    period: '/month',
    generations: 5,
    exports: 3,
    followUps: 10,
    features: ['5 app generations', '10 follow-up edits', '3 exports (ZIP)', 'Community support'],
    highlighted: false,
  },
  {
    key: 'starter',
    name: 'Starter',
    price: '$19',
    period: '/month',
    generations: 25,
    exports: 15,
    followUps: 50,
    features: ['25 app generations', '50 follow-up edits', '15 exports (all formats)', 'Email support', 'GitHub integration'],
    highlighted: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$49',
    period: '/month',
    generations: 100,
    exports: 50,
    followUps: 200,
    features: ['100 app generations', '200 follow-up edits', '50 exports (all formats)', 'Priority support', 'All integrations', 'Custom templates'],
    highlighted: true,
  },
  {
    key: 'business',
    name: 'Business',
    price: '$149',
    period: '/month',
    generations: 500,
    exports: 200,
    followUps: 1000,
    features: ['500 app generations', '1000 follow-up edits', '200 exports', 'Dedicated support', 'Team collaboration', 'White-label exports', 'API access'],
    highlighted: false,
  },
] as const;

export const BLOCKED_PATTERNS = [
  /\b(hack|exploit|malware|trojan|virus|keylog|phish|ransomware)\b/i,
  /\b(steal|scrape\s+personal|harvest\s+email|ddos|brute\s*force)\b/i,
  /\b(credit\s*card\s*skim|password\s*steal|identity\s*theft)\b/i,
  /\b(deepfake|revenge\s*porn|child\s*exploit)\b/i,
];

export function moderatePrompt(prompt: string): { safe: boolean; reason?: string } {
  const trimmed = prompt.trim();
  if (trimmed.length < 3) return { safe: false, reason: 'Prompt is too short' };
  if (trimmed.length > 5000) return { safe: false, reason: 'Prompt is too long (max 5000 characters)' };

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { safe: false, reason: 'Your prompt contains content that violates our usage policy. Please rephrase.' };
    }
  }

  return { safe: true };
}

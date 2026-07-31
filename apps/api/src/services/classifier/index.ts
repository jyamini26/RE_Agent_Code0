import { env } from '../../config.js';
import { AnthropicClassifier } from './anthropic.js';
import { RulesClassifier } from './rules.js';
import type { Classifier } from './types.js';

export type { Classifier } from './types.js';
export { RulesClassifier } from './rules.js';
export { AnthropicClassifier } from './anthropic.js';

/** Builds the classifier named by CLASSIFIER, with rules as the safety net. */
export function createClassifier(): Classifier {
  const rules = new RulesClassifier();

  if (env.CLASSIFIER === 'anthropic') {
    // config.ts already rejected this combination, so the assertion documents
    // an invariant rather than hiding a possible undefined.
    return new AnthropicClassifier({
      apiKey: env.ANTHROPIC_API_KEY!,
      model: env.ANTHROPIC_MODEL,
      fallback: rules,
    });
  }

  return rules;
}

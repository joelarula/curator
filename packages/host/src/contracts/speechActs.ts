import type { ActiveChoice } from '../types.js';

export interface SpeechActSuggestion {
  label: string;
  prompt: string;
  color?: string;
}

export interface SpeechActChoiceOption {
  id?: string;
  label: string;
  value: string;
  description?: string;
  aliases?: string[];
  recommended?: boolean;
  color?: string;
}

export interface SpeechActChoiceGroup {
  id?: string;
  prompt?: string;
  blocking?: boolean;
  options: SpeechActChoiceOption[];
}

export interface SpeechActCallout {
  type: 'info' | 'tip' | 'warning' | 'error';
  title?: string;
  body: string;
}

export interface ParsedSpeechActs {
  /** Natural prose with speech act tags stripped out or formatted for reading. */
  cleanText: string;
  /** Suggestion chips for quick next actions/prompts. */
  suggestions: SpeechActSuggestion[];
  /** Distinct choice groups detected in the text. */
  choiceGroups: SpeechActChoiceGroup[];
  /** Flattened active choices ready for ClientShell.setChoices() and HarnessChoices. */
  activeChoices: ActiveChoice[];
  /** Contextual callouts / banners. */
  callouts: SpeechActCallout[];
  /** Whether any speech act tags were found. */
  hasSpeechActs: boolean;
}

/**
 * Standard system prompt instructions for agents to emit speech act tags naturally.
 */
export const SPEECH_ACT_PROMPT_GUIDELINES = `
### Conversational Speech Acts (Interactive Tags)
You may naturally enhance your responses with semantic speech act tags:
1. **Next-Step Suggestions (<suggest>)**:
   When concluding an answer or suggesting immediate follow-up tasks, add clickable chips:
   <suggest>
     <chip prompt="Prompt text to send on click">Short Button Label</chip>
   </suggest>

2. **Everyday User Choices (<choose> or <ask>)**:
   When you need the user to make a choice or clarify intent before continuing:
   <choose prompt="What strategy would you like to use?">
     <option value="strategy_a" label="Strategy A (Recommended)" recommended="true">Description of A</option>
     <option value="strategy_b" label="Strategy B">Description of B</option>
   </choose>

3. **Contextual Callouts (<callout>)**:
   To highlight tips, caveats, or important notes:
   <callout type="tip|info|warning|error" title="Optional Title">
     Key takeaway or advice.
   </callout>

Do NOT invent non-standard tags. Use standard markdown for regular explanations.
`.trim();

/**
 * Composable to append speech act rules to an existing agent prompt.
 */
export function withSpeechActPromptRules(basePrompt?: string): string {
  if (!basePrompt || !basePrompt.trim()) return SPEECH_ACT_PROMPT_GUIDELINES;
  return `${basePrompt.trim()}\n\n${SPEECH_ACT_PROMPT_GUIDELINES}`;
}

/** Helper to extract attributes from an XML-like tag. */
function parseAttributes(tagStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9_-]+)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(tagStr)) !== null) {
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = value;
  }
  return attrs;
}

/**
 * Parses conversational speech act tags (<suggest>, <choose>, <ask>, <callout>)
 * from a raw LLM text stream or response.
 */
export function parseSpeechActs(rawText: string): ParsedSpeechActs {
  if (!rawText || typeof rawText !== 'string') {
    return {
      cleanText: '',
      suggestions: [],
      choiceGroups: [],
      activeChoices: [],
      callouts: [],
      hasSpeechActs: false,
    };
  }

  const suggestions: SpeechActSuggestion[] = [];
  const choiceGroups: SpeechActChoiceGroup[] = [];
  const activeChoices: ActiveChoice[] = [];
  const callouts: SpeechActCallout[] = [];

  let clean = rawText;

  // 1. Parse <suggest> blocks
  const suggestBlockRegex = /<suggest(?:\s+[^>]*)?>([\s\S]*?)<\/suggest>/gi;
  let suggestMatch: RegExpExecArray | null;
  while ((suggestMatch = suggestBlockRegex.exec(rawText)) !== null) {
    const inner = suggestMatch[1];
    // Check for <chip ...> or <action ...>
    const itemRegex = /<(?:chip|action)(?:\s+([^>]*))?>([\s\S]*?)<\/(?:chip|action)>|<(?:chip|action)\s+([^>]*)\/>/gi;
    let itemMatch: RegExpExecArray | null;
    let foundInner = false;
    while ((itemMatch = itemRegex.exec(inner)) !== null) {
      foundInner = true;
      const rawAttrs = itemMatch[1] || itemMatch[3] || '';
      const body = (itemMatch[2] || '').trim();
      const attrs = parseAttributes(rawAttrs);
      const prompt = attrs.prompt || body;
      const label = attrs.label || body || prompt;
      if (prompt) {
        suggestions.push({
          label: label || prompt,
          prompt,
          color: attrs.color,
        });
      }
    }
    // Handle standalone shorthand: <suggest prompt="...">Label</suggest>
    if (!foundInner) {
      const outerAttrs = parseAttributes(suggestMatch[0].slice(0, suggestMatch[0].indexOf('>')));
      const trimmedBody = inner.trim();
      if (outerAttrs.prompt || trimmedBody) {
        suggestions.push({
          label: trimmedBody || outerAttrs.prompt || 'Suggestion',
          prompt: outerAttrs.prompt || trimmedBody,
          color: outerAttrs.color,
        });
      }
    }
  }
  clean = clean.replace(suggestBlockRegex, '');

  // 2. Parse <choose> and <ask> blocks
  const chooseBlockRegex = /<(?:choose|ask)(?:\s+([^>]*))?>([\s\S]*?)<\/(?:choose|ask)>/gi;
  let chooseMatch: RegExpExecArray | null;
  while ((chooseMatch = chooseBlockRegex.exec(rawText)) !== null) {
    const rawAttrs = chooseMatch[1] || '';
    const inner = chooseMatch[2];
    const groupAttrs = parseAttributes(rawAttrs);
    const options: SpeechActChoiceOption[] = [];

    const optionRegex = /<option(?:\s+([^>]*))?>([\s\S]*?)<\/option>|<option\s+([^>]*)\/>/gi;
    let optMatch: RegExpExecArray | null;
    while ((optMatch = optionRegex.exec(inner)) !== null) {
      const optAttrsStr = optMatch[1] || optMatch[3] || '';
      const optBody = (optMatch[2] || '').trim();
      const attrs = parseAttributes(optAttrsStr);

      const value = attrs.value || optBody;
      const label = attrs.label || optBody || value;
      const isRecommended = attrs.recommended === 'true' || attrs.isRecommended === 'true';
      const aliases = attrs.alias ? attrs.alias.split(',').map((s) => s.trim()) : undefined;

      if (value) {
        options.push({
          id: attrs.id,
          label,
          value,
          description: attrs.description || (optBody !== label ? optBody : undefined),
          recommended: isRecommended,
          aliases,
          color: attrs.color || (isRecommended ? 'primary' : undefined),
        });
      }
    }

    const group: SpeechActChoiceGroup = {
      id: groupAttrs.id,
      prompt: groupAttrs.prompt || groupAttrs.title,
      blocking: groupAttrs.blocking === 'true',
      options,
    };
    choiceGroups.push(group);

    // Map into standard ActiveChoice objects
    for (const opt of options) {
      activeChoices.push({
        id: opt.id || opt.value,
        label: opt.label,
        value: opt.value,
        description: opt.description,
        aliases: opt.aliases,
        blocking: group.blocking,
        payload: { choiceValue: opt.value, prompt: group.prompt },
      });
    }
  }
  clean = clean.replace(chooseBlockRegex, '');

  // 3. Parse <callout> blocks
  const calloutBlockRegex = /<callout(?:\s+([^>]*))?>([\s\S]*?)<\/callout>/gi;
  let calloutMatch: RegExpExecArray | null;
  while ((calloutMatch = calloutBlockRegex.exec(rawText)) !== null) {
    const rawAttrs = calloutMatch[1] || '';
    const body = (calloutMatch[2] || '').trim();
    const attrs = parseAttributes(rawAttrs);
    const typeStr = (attrs.type || 'info').toLowerCase();
    const type: 'info' | 'tip' | 'warning' | 'error' =
      typeStr === 'warning' || typeStr === 'error' || typeStr === 'tip' ? typeStr : 'info';

    callouts.push({
      type,
      title: attrs.title,
      body,
    });
  }
  clean = clean.replace(calloutBlockRegex, '');

  // Trim extraneous double blank lines
  clean = clean.replace(/\n{3,}/g, '\n\n').trim();

  const hasSpeechActs =
    suggestions.length > 0 || choiceGroups.length > 0 || callouts.length > 0;

  return {
    cleanText: clean,
    suggestions,
    choiceGroups,
    activeChoices,
    callouts,
    hasSpeechActs,
  };
}

/**
 * Formats parsed speech acts into terminal-friendly ANSI output.
 */
export function formatSpeechActsForTerminal(parsedOrRaw: ParsedSpeechActs | string): string {
  const parsed = typeof parsedOrRaw === 'string' ? parseSpeechActs(parsedOrRaw) : parsedOrRaw;
  const parts: string[] = [];

  if (parsed.cleanText) {
    parts.push(parsed.cleanText);
  }

  // Render callouts
  for (const c of parsed.callouts) {
    let colorCode = '\x1b[36m'; // cyan (info)
    let icon = 'ℹ️';
    if (c.type === 'tip') {
      colorCode = '\x1b[32m'; // green
      icon = '💡';
    } else if (c.type === 'warning') {
      colorCode = '\x1b[33m'; // yellow
      icon = '⚠️';
    } else if (c.type === 'error') {
      colorCode = '\x1b[31m'; // red
      icon = '🚨';
    }
    const title = c.title ? ` ${c.title}` : '';
    parts.push(`\n${colorCode}${icon}${title ? ` [${title.trim()}]` : ''}\x1b[0m\n  ${c.body.replace(/\n/g, '\n  ')}`);
  }

  // Render suggestions
  if (parsed.suggestions.length > 0) {
    const chips = parsed.suggestions
      .map((s, idx) => `\x1b[90m[s${idx + 1}]\x1b[0m \x1b[34m${s.label}\x1b[0m`)
      .join('   ');
    parts.push(`\n\x1b[90m💡 Suggestions:\x1b[0m ${chips}`);
  }

  return parts.join('\n').trim();
}


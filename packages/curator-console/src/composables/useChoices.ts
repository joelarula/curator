import { computed, ref } from 'vue';
import type { ChoiceItem } from '../components/harness/HarnessChoices.vue';

/**
 * Where the shown choices came from. An open engine interrupt blocks its run, so it wins: speech-act choices
 * (`<choose>` / `<ask>` in agent text) and legacy workflow choice payloads don't replace it.
 */
export type ChoiceSource = 'interrupt' | 'speech' | 'workflow';

export interface SetChoicesOptions {
  prompt?: string;
  /** Legacy workflow waits (event-based resume). */
  requestId?: string | null;
  event?: string;
  as?: string | null;
  inputType?: string;
  /** Interrupt answered through `conversation_resume`. */
  interruptId?: string;
  /** Resume value per choice `value` (interrupt choices; ChoiceItem values are strings). */
  resumeValues?: Map<string, unknown>;
}

/** The harness's choice bar state (rendered by HarnessChoices), with one rule for which source is shown. */
export function useChoices() {
  const choicesDisplayMode = ref<'radio' | 'checkbox' | 'chips'>('radio');
  const selectedRadioChoice = ref<string | null>(null);
  const selectedCheckboxes = ref<string[]>([]);
  const selectedChipChoice = ref<string | null>(null);

  const availableChoices = ref<ChoiceItem[]>([]);
  const workflowChoicePrompt = ref<string>('');
  const workflowWaitingRequestId = ref<string | null>(null);
  const workflowChoiceEvent = ref<string>('curator:choice');
  const workflowChoiceAs = ref<string | null>(null);

  const source = ref<ChoiceSource | null>(null);
  const interruptId = ref<string | null>(null);
  let resumeValues = new Map<string, unknown>();

  const activeChoiceValue = computed(() => {
    if (choicesDisplayMode.value === 'radio') return selectedRadioChoice.value;
    if (choicesDisplayMode.value === 'checkbox') return selectedCheckboxes.value;
    return selectedChipChoice.value;
  });

  function clearSelection(): void {
    selectedRadioChoice.value = null;
    selectedCheckboxes.value = [];
    selectedChipChoice.value = null;
  }

  /** Shows `items` from `from`; returns false (and changes nothing) while an interrupt's choices are shown. */
  function setChoices(from: ChoiceSource, items: ChoiceItem[], options: SetChoicesOptions = {}): boolean {
    if (source.value === 'interrupt' && from !== 'interrupt') return false;
    source.value = items.length > 0 ? from : null;
    availableChoices.value = items;
    workflowChoicePrompt.value = options.prompt ?? '';
    workflowWaitingRequestId.value = options.requestId ?? null;
    workflowChoiceEvent.value = options.event || 'curator:choice';
    workflowChoiceAs.value = options.as ?? null;
    interruptId.value = options.interruptId ?? null;
    resumeValues = options.resumeValues ?? new Map();

    const inputType = String(options.inputType || '').toLowerCase();
    if (inputType.includes('check') || inputType.includes('multi')) choicesDisplayMode.value = 'checkbox';
    else if (inputType.includes('chip') || items.length > 4) choicesDisplayMode.value = 'chips';
    else choicesDisplayMode.value = 'radio';

    clearSelection();
    if (choicesDisplayMode.value === 'radio' && items.length > 0) selectedRadioChoice.value = items[0].value;
    return true;
  }

  /** Clears the choices (only when they came from `from`, if given). */
  function clearChoices(from?: ChoiceSource): void {
    if (from && source.value !== from) return;
    source.value = null;
    availableChoices.value = [];
    workflowChoicePrompt.value = '';
    workflowWaitingRequestId.value = null;
    interruptId.value = null;
    resumeValues = new Map();
    clearSelection();
  }

  /** The `conversation_resume` value for a picked choice value (arrays map element-wise). */
  function resumeValueFor(chosen: unknown): unknown {
    if (Array.isArray(chosen)) return chosen.map((c) => (resumeValues.has(String(c)) ? resumeValues.get(String(c)) : c));
    return resumeValues.has(String(chosen)) ? resumeValues.get(String(chosen)) : chosen;
  }

  return {
    choicesDisplayMode,
    selectedRadioChoice,
    selectedCheckboxes,
    selectedChipChoice,
    availableChoices,
    workflowChoicePrompt,
    workflowWaitingRequestId,
    workflowChoiceEvent,
    workflowChoiceAs,
    activeChoiceValue,
    source,
    interruptId,
    clearSelection,
    setChoices,
    clearChoices,
    resumeValueFor,
  };
}

export type ChoicesHandle = ReturnType<typeof useChoices>;

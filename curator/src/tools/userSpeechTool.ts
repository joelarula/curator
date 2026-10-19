import { defineTool, type CuratorTool } from './CuratorTool.js';

export interface UserSpeechInput {
  text: string;
  speaker?: string;
}

export interface UserSpeechPayload {
  text: string;
  speaker?: string;
}

export interface UserSpeechResult {
  text: string;
  speaker?: string;
  event: {
    name: 'user:speech';
    payload: UserSpeechPayload;
  };
}

/**
 * userSpeech — Pure-text speech tool wrapping raw user speech.
 * Emits a 'user:speech' event in parallel asynchronous execution flows without calling an LLM.
 */
export const userSpeech: CuratorTool = defineTool({
  name: 'userSpeech',
  description: 'Pure-text speech action wrapping raw user speech and emitting a user:speech event in parallel flows.',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The raw text spoken by the user.',
      },
      speaker: {
        type: 'string',
        description: 'Optional name or ID of the speaker.',
      },
    },
    required: ['text'],
  },
  accessLevel: 'safe_write',
  execute: async (args: Record<string, unknown>, ctx): Promise<UserSpeechResult> => {
    const text = String(args.text || '');
    const speakerPayload = args.speaker ? { speaker: String(args.speaker) } : {};

    return {
      text,
      ...speakerPayload,
      event: {
        name: 'user:speech',
        payload: {
          text,
          ...speakerPayload,
        },
      },
    };
  },
});

import { PrismaClient } from '@prisma/client';
import type { ToolResult } from './types.js';

export interface UserSpeechInput {
  text: string;
  speaker?: string;
}

export interface UserSpeechOutput extends ToolResult {
  data: {
    text: string;
    speaker?: string;
  };
  event: {
    name: 'user:speech';
    payload: {
      text: string;
      speaker?: string;
    };
  };
}

/**
 * userSpeech — wraps raw user speech into a safe speech event in parallel flows.
 * Emits user:speech without invoking an LLM.
 */
export async function userSpeech(
  args: UserSpeechInput,
  _prisma: PrismaClient,
  _userId: string
): Promise<UserSpeechOutput> {
  const text = args.text || '';
  const speakerPayload = args.speaker ? { speaker: args.speaker } : {};

  return {
    success: true,
    data: {
      text,
      ...speakerPayload,
    },
    event: {
      name: 'user:speech',
      payload: {
        text,
        ...speakerPayload,
      },
    },
  };
}


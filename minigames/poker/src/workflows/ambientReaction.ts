/**
 * ---
 * id: ambient_reaction
 * name: ambient_reaction
 * description: Ambient Reaction & Table Talk Event Module with Pub/Sub Subscriptions
 * ---
 */

import { CuratorBuilder, type CuratorModuleNode } from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';

const { ctx, params, human_speech } = pokerComposables;

export function buildAmbientReactionModule(): CuratorModuleNode {
  return CuratorBuilder.defineModule('ambient_reaction', {
    description: 'Pub/Sub ambient discourse reactor for player actions, showdowns, and table talk',
    subscriptions: [
      CuratorBuilder.subscribe('poker:speech', '#on_speech_event', { as: 'speechEvt' }),
      CuratorBuilder.subscribe('poker:action_taken', '#on_action_taken', { as: 'actionEvt' }),
    ],
    main: CuratorBuilder.seq('poker:ambient_reaction', [
      human_speech({
        speechAct: `${ctx.eventSpeechAct} || 'TABLE_TALK'`,
        targetId: ctx.eventTargetId,
        text: `${ctx.eventText} || ''`,
      }),
      CuratorBuilder.emitEvent('poker:ambient_spoken', {
        speaker: ctx.speakerName,
        speechAct: ctx.speechAct,
        text: ctx.text,
      }),
    ]),
    subroutines: {
      on_speech_event: CuratorBuilder.sub(
        { speechEvt: { type: 'object' } },
        CuratorBuilder.seq('poker:handle_speech_event', [
          human_speech({
            speechAct: `${params.speechEvt.speechAct} || 'TABLE_TALK'`,
            targetId: params.speechEvt.targetId,
            text: `${params.speechEvt.text} || ''`,
            speakerName: `${params.speechEvt.speakerName} || 'Observer'`,
          }),
          CuratorBuilder.emitEvent('poker:ambient_spoken', {
            speaker: params.speechEvt.speakerName,
            speechAct: params.speechEvt.speechAct,
            text: params.speechEvt.text,
          }),
        ]),
      ),
      on_action_taken: CuratorBuilder.sub(
        { actionEvt: { type: 'object' } },
        CuratorBuilder.seq('poker:handle_action_event', [
          CuratorBuilder.emitEvent('poker:ambient_evaluated', {
            player: params.actionEvt.player,
            action: params.actionEvt.action,
          }),
        ]),
      ),
    },
  });
}

export const ambientReactionAst = buildAmbientReactionModule();

/**
 * ---
 * id: ambient_reaction
 * name: ambient_reaction
 * description: Ambient Reaction & Table Talk Event Module with Pub/Sub Subscriptions
 * ---
 */
import {
  defineModule,
  defineSubroutine,
  onEvent,
  emitEvent,
  type CuratorModuleNode,
} from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';
import { AmbientSpeechAct } from '../models/index.ts';

const {
  ctx,
  params,
  human_speech,
  events,
  modules,
  subroutines,
} = pokerComposables;

/**
 * First-class typed handler for table speech events.
 */
export const onSpeechEvent = defineSubroutine(subroutines.ON_SPEECH_EVENT, () => [
  human_speech({
    speechAct: `${params.speechEvt.speechAct} || '${AmbientSpeechAct.TABLE_TALK}'`,
    targetId: params.speechEvt.targetId,
    text: `${params.speechEvt.text} || ''`,
    speakerName: `${params.speechEvt.speakerName} || 'Observer'`,
  }),
  emitEvent(events.AMBIENT_SPOKEN, {
    speaker: params.speechEvt.speakerName,
    speechAct: params.speechEvt.speechAct,
    text: params.speechEvt.text,
  }),
], { params: { speechEvt: { type: 'object' } } });

/**
 * First-class typed handler for player action events.
 */
export const onActionTaken = defineSubroutine(subroutines.ON_ACTION_TAKEN, () => [
  emitEvent(events.AMBIENT_EVALUATED, {
    player: params.actionEvt.player,
    action: params.actionEvt.action,
  }),
], { params: { actionEvt: { type: 'object' } } });

export function buildAmbientReactionModule(): CuratorModuleNode {
  return defineModule(modules.AMBIENT_REACTION, () => {
    // 1. Auto-register event listeners to module subscriptions
    onEvent(events.SPEECH, onSpeechEvent, { as: params.speechEvt });
    onEvent(events.ACTION_TAKEN, onActionTaken, { as: params.actionEvt });

    // 2. Return main sequence directly
    return [
      human_speech({
        speechAct: `${ctx.eventSpeechAct} || '${AmbientSpeechAct.TABLE_TALK}'`,
        targetId: ctx.eventTargetId,
        text: `${ctx.eventText} || ''`,
      }),
      emitEvent(events.AMBIENT_SPOKEN, {
        speaker: ctx.speakerName,
        speechAct: ctx.speechAct,
        text: ctx.text,
      }),
    ];
  });
}

export const ambientReactionAst = buildAmbientReactionModule();


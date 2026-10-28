/**
 * ---
 * id: ambient_reaction
 * name: ambient_reaction
 * description: Table talk and ambient reactions as systems
 * ---
 */
import { defineModule, defineSubroutine, system, type CuratorModuleNode } from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';
import { PokerSpeechAct } from '../models/pokerContracts.ts';
import { Speech, ActionTaken, AmbientSpoken, AmbientEvaluated } from '../models/pokerEvents.ts';

const { human_speech, modules } = pokerComposables;

const speech = Speech.payload('speechEvt');
const action = ActionTaken.payload('actionEvt');

/** Records table speech and echoes it as ambient chatter. */
export const onSpeechEvent = defineSubroutine('on_speech_event', [
  human_speech({
    speechAct: `${speech.speechAct} || '${PokerSpeechAct.TABLE_TALK}'`,
    targetId: String(speech.targetId),
    text: `${speech.text} || ''`,
    speakerName: `${speech.speakerName} || 'Observer'`,
  }),
  AmbientSpoken.emit({ speaker: speech.speakerName, speechAct: speech.speechAct, text: speech.text }),
], { params: { speechEvt: { type: 'object' } } });

/** Lets the room weigh in on every action taken at the table. */
export const onActionTaken = defineSubroutine('on_action_taken', [
  AmbientEvaluated.emit({ player: action.player, action: action.action }),
], { params: { actionEvt: { type: 'object' } } });

export const ambientReactionAst: CuratorModuleNode = defineModule(modules.AMBIENT_REACTION, {
  description: 'Table talk and ambient reactions, running beside every table',
}, () => {
  system({ on: Speech, run: onSpeechEvent, as: 'speechEvt' });
  system({ on: ActionTaken, run: onActionTaken, as: 'actionEvt' });
  return undefined;
});

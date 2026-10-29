/**
 * ---
 * id: ambient_reaction
 * name: ambient_reaction
 * description: Table talk and ambient reactions as systems
 * ---
 */
import { defineModule, defineSubroutine, system, type CuratorModuleNode } from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';
import { Speech, ActionTaken, AmbientSpoken, AmbientEvaluated } from '../models/pokerEvents.ts';

const { modules } = pokerComposables;

const speech = Speech.payload('speechEvt');
const action = ActionTaken.payload('actionEvt');

/** Echoes table speech as ambient chatter (the speech event itself is the record). */
export const onSpeechEvent = defineSubroutine('on_speech_event', [
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

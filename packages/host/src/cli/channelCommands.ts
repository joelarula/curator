import type { ReplCommand } from '../types.js';

/**
 * Channel commands for the CLI shell. They hold no channel logic: joining, leaving and inviting send requests that the
 * channel's workflow decides (`channel_request`), posting uses `channel_post`, and what the workflow addresses to the
 * user (deliveries, invitations, refusals) is printed as it arrives.
 */

export interface ChannelShellHost {
  /** Runs a host tool the way the shell does (`ClientShell.dispatchTool`). */
  dispatchTool(toolName: string, args: Record<string, any>): Promise<any>;
  /** Prints a line without breaking the prompt (`ClientShell.printAsync`). */
  printAsync(text: string): void;
}

interface ChannelInfo {
  conversationId: number;
  title: string;
  memberCount?: number;
  joined?: boolean;
  invited?: boolean;
}

const unwrap = (res: any) => (res && typeof res === 'object' && 'result' in res ? res.result : res);
const dim = (s: string) => `\x1b[90m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

export class ChannelShell {
  /** The channel `/post` writes to (set by `/join`, or `/channel <name>`). */
  active: ChannelInfo | null = null;
  private titles = new Map<number, string>();

  constructor(private host: ChannelShellHost) {}

  private async list(): Promise<ChannelInfo[]> {
    const res = unwrap(await this.host.dispatchTool('channel_list', {}));
    const channels: ChannelInfo[] = Array.isArray(res?.channels) ? res.channels : [];
    for (const c of channels) this.titles.set(c.conversationId, c.title);
    return channels;
  }

  /** A channel by id, or by title (exact, then prefix; case-insensitive). */
  private async resolve(ref: string | undefined): Promise<ChannelInfo | null> {
    if (!ref) return this.active;
    const id = Number(ref.replace(/^#/, ''));
    if (Number.isInteger(id) && id > 0) return { conversationId: id, title: this.titles.get(id) ?? `#${id}` };
    const name = ref.replace(/^#/, '').toLowerCase();
    const channels = await this.list();
    return (
      channels.find((c) => c.title.toLowerCase() === name) ??
      channels.find((c) => c.title.toLowerCase().startsWith(name)) ??
      null
    );
  }

  commands(): ReplCommand[] {
    return [
      {
        name: 'channels',
        description: 'List the open channels of the project (and those you are invited to)',
        execute: async () => {
          const channels = await this.list();
          if (channels.length === 0) return console.log(dim('No open channels.'));
          for (const c of channels) {
            const flags = [c.joined ? 'member' : c.invited ? 'invited' : '', this.active?.conversationId === c.conversationId ? 'active' : '']
              .filter(Boolean)
              .join(', ');
            console.log(`  #${c.conversationId} ${c.title} ${dim(`(${c.memberCount ?? 0} members${flags ? `, ${flags}` : ''})`)}`);
          }
        },
      },
      {
        name: 'join',
        usage: '<channel...>',
        description: "Ask to join a channel (its workflow decides); it becomes the active channel",
        execute: async (args) => {
          const channel = await this.resolve(args.trim() || undefined);
          if (!channel) return console.log(red(`No channel "${args.trim()}". Try /channels.`));
          await this.host.dispatchTool('channel_request', { conversationId: channel.conversationId, action: 'join' });
          this.active = channel;
          console.log(dim(`Asked to join ${channel.title}; the channel's workflow decides.`));
        },
      },
      {
        name: 'leave',
        usage: '[channel...]',
        description: 'Ask to leave a channel (default: the active one)',
        execute: async (args) => {
          const channel = await this.resolve(args.trim() || undefined);
          if (!channel) return console.log(red('No channel to leave. Give one, or /join one first.'));
          await this.host.dispatchTool('channel_request', { conversationId: channel.conversationId, action: 'leave' });
          if (this.active?.conversationId === channel.conversationId) this.active = null;
          console.log(dim(`Asked to leave ${channel.title}.`));
        },
      },
      {
        name: 'invite',
        // Commander syntax: the invitee is a user id or agent:<id>
        usage: '<invitee> [channel...]',
        description: 'Ask to invite a user or agent to a channel (needs the channels:invite role; default: the active channel)',
        execute: async (_args, tokens) => {
          const [who, ...rest] = tokens;
          if (!who) return console.log(red('Usage: /invite <userId | agent:<id>> [channel]'));
          const channel = await this.resolve(rest.join(' ') || undefined);
          if (!channel) return console.log(red('No channel to invite to. Give one, or /join one first.'));
          const invitee = who.startsWith('agent:') ? { agentId: who.slice('agent:'.length) } : { userId: who };
          await this.host.dispatchTool('channel_request', { conversationId: channel.conversationId, action: 'invite', ...invitee });
          console.log(dim(`Asked to invite ${who} to ${channel.title}; the channel's workflow decides.`));
        },
      },
      {
        name: 'post',
        usage: '<text...>',
        description: 'Post a message in the active channel',
        execute: async (args) => {
          const text = args.trim();
          if (!text) return console.log(red('Usage: /post <text>'));
          if (!this.active) return console.log(red('No active channel: /join one first.'));
          await this.host.dispatchTool('channel_post', { conversationId: this.active.conversationId, text });
        },
      },
    ];
  }

  /** Prints what a channel's workflow addressed to this user. Returns true when the event was a channel event. */
  ingest(type: string, payload: any): boolean {
    switch (type) {
      case 'conversation:message_delivered': {
        const id = Number(payload?.conversationId);
        const where = this.titles.get(id) ?? `#${id}`;
        const who = payload?.sender?.name || payload?.sender?.id || 'someone';
        this.host.printAsync(`\x1b[36m[${where}]\x1b[0m \x1b[1m${who}\x1b[0m: ${payload?.text ?? ''}`);
        return true;
      }
      case 'conversation:invited': {
        const id = payload?.conversationId;
        this.host.printAsync(`\x1b[33mYou are invited to channel #${id}.\x1b[0m /join ${id}`);
        return true;
      }
      case 'conversation:join_denied':
        this.host.printAsync(red(`Join refused: ${payload?.reason ?? 'not allowed'}`));
        return true;
      case 'conversation:invite_denied':
        this.host.printAsync(red(`Invite refused: ${payload?.reason ?? 'not allowed'}`));
        return true;
      default:
        return false;
    }
  }
}

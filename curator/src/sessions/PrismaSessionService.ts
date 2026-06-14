import { BaseSessionService, type CreateSessionRequest, type GetSessionRequest, type ListSessionsRequest, type ListSessionsResponse, type DeleteSessionRequest, type AppendEventRequest } from '@google/adk';
import type { Session, Event } from '@google/adk';

export class PrismaSessionService extends BaseSessionService {
  private prisma: any;

  constructor(prisma: any) {
    super();
    this.prisma = prisma;
  }

  async createSession({ appName, userId, state = {}, sessionId }: CreateSessionRequest): Promise<Session> {
    const id = sessionId || `session_${Math.random().toString(36).substring(2, 11)}`;

    // Ensure the AdkSession row exists in SQLite
    let sessionRecord = await this.prisma.adkSession.findUnique({
      where: {
        id_appName_userId: {
          id,
          appName,
          userId
        }
      }
    });

    if (!sessionRecord) {
      sessionRecord = await this.prisma.adkSession.create({
        data: {
          id,
          appName,
          userId,
          state: state as any
        }
      });
    } else {
      // Update state if provided
      sessionRecord = await this.prisma.adkSession.update({
        where: {
          id_appName_userId: {
            id,
            appName,
            userId
          }
        },
        data: {
          state: state as any
        }
      });
    }

    return {
      id: sessionRecord.id,
      appName: sessionRecord.appName,
      userId: sessionRecord.userId,
      state: (sessionRecord.state || {}) as Record<string, unknown>,
      events: [],
      lastUpdateTime: sessionRecord.updateTime.getTime()
    };
  }

  async getSession({ appName, userId, sessionId, config }: GetSessionRequest): Promise<Session | undefined> {
    const sessionRecord = await this.prisma.adkSession.findUnique({
      where: {
        id_appName_userId: {
          id: sessionId,
          appName,
          userId
        }
      },
      include: {
        events: {
          orderBy: { timestamp: 'asc' }
        }
      }
    });

    if (!sessionRecord) return undefined;

    // Filter events if afterTimestamp is specified
    let dbEvents = sessionRecord.events || [];
    if (config?.afterTimestamp) {
      dbEvents = dbEvents.filter((e: any) => e.timestamp.getTime() > config.afterTimestamp!);
    }
    // Limit if specified
    if (config?.numRecentEvents) {
      dbEvents = dbEvents.slice(-config.numRecentEvents);
    }

    const events: Event[] = dbEvents.map((e: any) => ({
      ...(e.eventData as any)
    }));

    return {
      id: sessionRecord.id,
      appName: sessionRecord.appName,
      userId: sessionRecord.userId,
      state: (sessionRecord.state || {}) as Record<string, unknown>,
      events,
      lastUpdateTime: sessionRecord.updateTime.getTime()
    };
  }

  async listSessions({ appName, userId, limit = 50, offset = 0, page, order = 'desc' }: ListSessionsRequest): Promise<ListSessionsResponse> {
    const skip = page ? (page - 1) * limit : offset;

    const where = { appName, userId };

    const totalItems = await this.prisma.adkSession.count({ where });
    const totalPages = Math.ceil(totalItems / limit);

    const sessionRecords = await this.prisma.adkSession.findMany({
      where,
      orderBy: { updateTime: order },
      take: limit,
      skip
    });

    const sessions: Session[] = sessionRecords.map((s: any) => ({
      id: s.id,
      appName: s.appName,
      userId: s.userId,
      state: (s.state || {}) as Record<string, unknown>,
      events: [],
      lastUpdateTime: s.updateTime.getTime()
    }));

    return {
      sessions,
      page: page || 1,
      limit,
      totalItems,
      totalPages
    };
  }

  async deleteSession({ appName, userId, sessionId }: DeleteSessionRequest): Promise<void> {
    try {
      await this.prisma.adkSession.delete({
        where: {
          id_appName_userId: {
            id: sessionId,
            appName,
            userId
          }
        }
      });
    } catch {
      // Ignore if already deleted
    }
  }

  override async appendEvent({ session, event }: AppendEventRequest): Promise<Event> {
    // 1. Save event to AdkEvent table
    await this.prisma.adkEvent.create({
      data: {
        id: event.id,
        appName: session.appName,
        userId: session.userId,
        sessionId: session.id,
        invocationId: event.invocationId,
        timestamp: new Date(event.timestamp),
        eventData: event as any
      }
    });

    // 2. Update session state using BaseSessionService state logic
    const appendedEvent = await super.appendEvent({ session, event });

    await this.prisma.adkSession.update({
      where: {
        id_appName_userId: {
          id: session.id,
          appName: session.appName,
          userId: session.userId
        }
      },
      data: {
        state: session.state as any
      }
    });

    return appendedEvent;
  }
}

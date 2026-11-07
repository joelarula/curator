import type {
  CuratorConsoleAdapter,
  HarnessUiSurface,
  HarnessUploadedFile,
} from '@curator/console';
import { requestGraphql } from './graphql-client';
import { activeProjectId } from './composables/useAuth';

let isEnginePaused = false;

export const galleryCuratorAdapter: CuratorConsoleAdapter = {
  async requestGraphql(query: string, variables?: any) {
    return requestGraphql(query, variables);
  },

  onProgress(callback: (type: string, payload: any) => void) {
    const evtSource = new EventSource('/api/curator/events');
    evtSource.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data);
        callback(parsed.type || 'log', parsed.payload ?? parsed);
      } catch {}
    };
    return () => {
      evtSource.close();
    };
  },

  onDatabaseChange(callback: (info: { tables: string[]; timestamp: number }) => void) {
    const evtSource = new EventSource('/api/curator/events');
    evtSource.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data);
        if (
          parsed.type === 'database_change' ||
          parsed.type === 'gallery:item_updated' ||
          parsed.type === 'gallery:migrated'
        ) {
          callback({
            tables: parsed.payload?.tables || ['Resource', 'Attachment'],
            timestamp: Date.now(),
          });
        }
      } catch {}
    };
    return () => {
      evtSource.close();
    };
  },

  async togglePause() {
    const data = await requestGraphql(`mutation { toggleEnginePause }`);
    isEnginePaused = Boolean(data?.toggleEnginePause);
    return isEnginePaused;
  },

  async getProcessorState() {
    return { isPaused: isEnginePaused };
  },

  async triggerAgent(agentId: string, options?: any) {
    return requestGraphql(
      `mutation TriggerAgent($name: String!, $context: JSON) {
        triggerAgent(name: $name, context: $context) {
          id requestId agent content status success error
        }
      }`,
      { name: agentId, context: options || {} }
    );
  },

  async toggleAgent(agentId: string, isActive: boolean) {
    return requestGraphql(
      `mutation ToggleAgent($id: ID!, $isActive: Boolean!) {
        toggleCuratorAgent(id: $id, isActive: $isActive) {
          id name isActive enabled schedule
        }
      }`,
      { id: agentId, isActive }
    );
  },

  async uploadFiles(files: Array<{ filename: string; data: string; mimeType?: string; bucket?: string }>) {
    const token =
      typeof localStorage !== 'undefined' ? localStorage.getItem('gallery_token') : null;
    const projectId = activeProjectId.value || 'artmoments';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-project-id': projectId,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/curator/upload', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId,
        bucket: 'photos',
        files,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'File upload failed');
    }
    return { files: (json.files || []) as HarnessUploadedFile[] };
  },

  async listResources(filters?: Record<string, any>): Promise<HarnessUiSurface> {
    const data = await requestGraphql(
      `mutation ShowGalleryResources($args: JSON) {
        executeTool(name: "gallery_show_resources", args: $args) {
          success
          result
          error
        }
      }`,
      {
        args: {
          projectId: activeProjectId.value || 'artmoments',
          limit: 250,
          ...(filters || {}),
        },
      }
    );
    const surface = data?.executeTool?.result?.uiSurface;
    if (surface) return surface;
    return {
      component: 'resource-collection',
      title: 'Gallery Resources',
      viewMode: 'grid',
      items: [],
      total: 0,
    };
  },
};

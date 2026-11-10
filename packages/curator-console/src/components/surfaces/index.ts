import { defineAsyncComponent, type Component } from 'vue';

/**
 * Built-in surface renderers by component name, loaded on first use. `adapter.customComponents` entries with the
 * same name take precedence (a miniapp can replace any of them).
 */
export const builtinSurfaceComponents: Record<string, Component> = {
  table: defineAsyncComponent(() => import('./SurfaceTable.vue')),
  markdown: defineAsyncComponent(() => import('./SurfaceMarkdown.vue')),
  code: defineAsyncComponent(() => import('./SurfaceCode.vue')),
  json: defineAsyncComponent(() => import('./SurfaceCode.vue')),
  mermaid: defineAsyncComponent(() => import('./SurfaceMermaid.vue')),
  html: defineAsyncComponent(() => import('./SurfaceSandbox.vue')),
  svg: defineAsyncComponent(() => import('./SurfaceSandbox.vue')),
  image: defineAsyncComponent(() => import('./SurfaceImage.vue')),
};

<template>
  <div class="settings-tab">
    <div class="d-flex align-center ga-2 mb-3">
      <span class="text-subtitle-2 font-weight-bold">Plugin settings</span>
      <span class="text-caption text-medium-emphasis">defaults &lt; system &lt; project &lt; user</span>
      <v-btn size="small" variant="text" icon="mdi-refresh" class="ms-auto" :loading="config.loading.value" @click="config.load()" />
    </div>

    <v-alert v-if="config.error.value" type="error" variant="tonal" density="compact" class="mb-3" closable>
      {{ config.error.value }}
    </v-alert>

    <div v-if="!config.loading.value && config.namespaces.value.length === 0" class="text-caption text-medium-emphasis py-4 text-center">
      No plugin declares a configSchema.
    </div>

    <v-expansion-panels variant="accordion" multiple>
      <v-expansion-panel v-for="ns in config.namespaces.value" :key="ns.namespace">
        <v-expansion-panel-title>
          <span class="font-weight-medium">{{ ns.title || ns.namespace }}</span>
          <span class="text-caption text-medium-emphasis ms-2 font-monospace">{{ ns.namespace }}</span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div v-if="ns.description" class="text-caption text-medium-emphasis mb-3">{{ ns.description }}</div>
          <div v-for="k in ns.keys" :key="k.key" class="settings-row py-2 border-b">
            <div class="d-flex align-center ga-2 mb-1">
              <span class="font-monospace text-caption">{{ k.key }}</span>
              <v-chip size="x-small" :color="k.source === 'default' ? 'grey' : 'primary'" variant="tonal">{{ k.source }}</v-chip>
              <span class="text-caption text-disabled text-truncate">default: {{ show(k.default) }}</span>
            </div>
            <div class="d-flex align-start ga-2 flex-wrap">
              <HarnessSchemaField
                class="flex-grow-1"
                style="min-width: 220px;"
                :field="fieldOf(k)"
                :model-value="draftOf(ns.namespace, k)"
                :disabled="busy(ns.namespace, k.key)"
                @update:model-value="(v) => setDraft(ns.namespace, k.key, v)"
                @error="(m) => setError(ns.namespace, k.key, m)"
              />
              <v-select
                :model-value="scopeOf(ns.namespace, k)"
                :items="k.scopes"
                density="compact"
                variant="outlined"
                hide-details
                style="max-width: 130px;"
                @update:model-value="(s) => (scopes[id(ns.namespace, k.key)] = s)"
              />
              <v-btn
                size="small"
                color="primary"
                :loading="busy(ns.namespace, k.key)"
                :disabled="!!errors[id(ns.namespace, k.key)] || draftOf(ns.namespace, k) === undefined"
                @click="save(ns.namespace, k)"
              >
                Save
              </v-btn>
              <v-btn
                size="small"
                variant="text"
                :disabled="busy(ns.namespace, k.key) || !(scopeOf(ns.namespace, k) in k.saved)"
                :title="`Remove the ${scopeOf(ns.namespace, k)} value`"
                @click="config.reset(ns.namespace, k.key, scopeOf(ns.namespace, k))"
              >
                Reset
              </v-btn>
            </div>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive } from 'vue';
import { schemaField } from '../../composables/useSchemaForm';
import type { ConfigKeyView, ConfigScope, PluginConfigHandle } from '../../composables/usePluginConfig';
import HarnessSchemaField from '../harness/HarnessSchemaField.vue';

const props = defineProps<{ config: PluginConfigHandle }>();

// Per key: edited value, chosen scope, parse error (keys: "namespace.key")
const drafts = reactive<Record<string, unknown>>({});
const scopes = reactive<Record<string, ConfigScope>>({});
const errors = reactive<Record<string, string>>({});

const id = (ns: string, key: string) => `${ns}.${key}`;
const fieldOf = (k: ConfigKeyView) => schemaField(k.key, k.schema);
const busy = (ns: string, key: string) => props.config.busyKey.value === id(ns, key);
const show = (v: unknown) => (v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v));

/** Narrowest scope the key allows (user, then project, then system), unless one was picked. */
function scopeOf(ns: string, k: ConfigKeyView): ConfigScope {
  return scopes[id(ns, k.key)] ?? (['user', 'project', 'system'] as ConfigScope[]).find((s) => k.scopes.includes(s)) ?? 'system';
}

function draftOf(ns: string, k: ConfigKeyView): unknown {
  const key = id(ns, k.key);
  return key in drafts ? drafts[key] : k.value;
}

function setDraft(ns: string, key: string, value: unknown) {
  drafts[id(ns, key)] = value;
}

function setError(ns: string, key: string, message: string | null) {
  if (message) errors[id(ns, key)] = message;
  else delete errors[id(ns, key)];
}

async function save(ns: string, k: ConfigKeyView) {
  const ok = await props.config.save(ns, k.key, scopeOf(ns, k), draftOf(ns, k));
  if (ok) delete drafts[id(ns, k.key)];
}

onMounted(() => {
  if (props.config.namespaces.value.length === 0) props.config.load();
});
</script>

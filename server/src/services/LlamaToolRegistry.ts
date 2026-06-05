import {
    llamaHealth,
    llamaRequest,
    llamaModels,
    llamaChatCompletion,
    llamaCompletion,
    llamaTokenize,
    llamaDetokenize,
    llamaApplyTemplate,
    llamaEmbedding,
    llamaV1Embeddings,
    llamaRerank,
    llamaPropsGet,
    llamaPropsSet,
    llamaSlots,
    llamaSlotAction,
    llamaMetrics,
    llamaLoraList,
    llamaLoraSet,
    llamaResponses,
    llamaMessages,
    llamaMessagesCountTokens,
} from './tools/llamaCppApi.js';

type RegistryToolDefinition = {
    name: string;
    description: string;
    version: string;
    handler: (...args: any[]) => Promise<any>;
};

export const LLAMA_TOOL_DEFINITIONS: RegistryToolDefinition[] = [
    {
        name: 'llama_health',
        description: 'Calls llama.cpp GET /health to confirm model server readiness.',
        version: '1.0.0',
        handler: llamaHealth,
    },
    {
        name: 'llama_request',
        description: 'Generic llama.cpp REST caller for GET/POST with custom path, query, and body for full endpoint coverage.',
        version: '1.0.0',
        handler: llamaRequest,
    },
    {
        name: 'llama_models',
        description: 'Lists llama.cpp models via GET /v1/models (or router GET /models when api="router").',
        version: '1.0.0',
        handler: llamaModels,
    },
    {
        name: 'llama_chat_completion',
        description: 'Calls llama.cpp OpenAI-compatible POST /v1/chat/completions with full request payload passthrough.',
        version: '1.0.0',
        handler: llamaChatCompletion,
    },
    {
        name: 'llama_completion',
        description: 'Calls llama.cpp native POST /completion endpoint for prompt-based generation.',
        version: '1.0.0',
        handler: llamaCompletion,
    },
    {
        name: 'llama_tokenize',
        description: 'Calls llama.cpp POST /tokenize to convert text into token IDs (optionally with token pieces).',
        version: '1.0.0',
        handler: llamaTokenize,
    },
    {
        name: 'llama_detokenize',
        description: 'Calls llama.cpp POST /detokenize to convert token IDs back into text.',
        version: '1.0.0',
        handler: llamaDetokenize,
    },
    {
        name: 'llama_apply_template',
        description: 'Calls llama.cpp POST /apply-template to render chat messages into a templated prompt without inference.',
        version: '1.0.0',
        handler: llamaApplyTemplate,
    },
    {
        name: 'llama_embedding',
        description: 'Calls llama.cpp POST /embedding (native endpoint) for single-content embedding requests.',
        version: '1.0.0',
        handler: llamaEmbedding,
    },
    {
        name: 'llama_v1_embeddings',
        description: 'Calls llama.cpp OpenAI-compatible POST /v1/embeddings endpoint.',
        version: '1.0.0',
        handler: llamaV1Embeddings,
    },
    {
        name: 'llama_rerank',
        description: 'Calls llama.cpp POST /v1/rerank for reranking documents against a query.',
        version: '1.0.0',
        handler: llamaRerank,
    },
    {
        name: 'llama_props_get',
        description: 'Calls llama.cpp GET /props to retrieve global generation/server properties.',
        version: '1.0.0',
        handler: llamaPropsGet,
    },
    {
        name: 'llama_props_set',
        description: 'Calls llama.cpp POST /props to update global properties (server must start with --props).',
        version: '1.0.0',
        handler: llamaPropsSet,
    },
    {
        name: 'llama_slots',
        description: 'Calls llama.cpp GET /slots to inspect current slot state and utilization.',
        version: '1.0.0',
        handler: llamaSlots,
    },
    {
        name: 'llama_slot_action',
        description: 'Calls llama.cpp POST /slots/{id_slot}?action=save|restore|erase for slot cache management.',
        version: '1.0.0',
        handler: llamaSlotAction,
    },
    {
        name: 'llama_metrics',
        description: 'Calls llama.cpp GET /metrics (requires server started with --metrics).',
        version: '1.0.0',
        handler: llamaMetrics,
    },
    {
        name: 'llama_lora_list',
        description: 'Calls llama.cpp GET /lora-adapters to list loaded LoRA adapters and effective scales.',
        version: '1.0.0',
        handler: llamaLoraList,
    },
    {
        name: 'llama_lora_set',
        description: 'Calls llama.cpp POST /lora-adapters to set global LoRA adapter scales.',
        version: '1.0.0',
        handler: llamaLoraSet,
    },
    {
        name: 'llama_responses',
        description: 'Calls llama.cpp OpenAI-compatible POST /v1/responses endpoint.',
        version: '1.0.0',
        handler: llamaResponses,
    },
    {
        name: 'llama_messages',
        description: 'Calls llama.cpp Anthropic-compatible POST /v1/messages endpoint.',
        version: '1.0.0',
        handler: llamaMessages,
    },
    {
        name: 'llama_messages_count_tokens',
        description: 'Calls llama.cpp POST /v1/messages/count_tokens for Anthropic-style token counting.',
        version: '1.0.0',
        handler: llamaMessagesCountTokens,
    },
];
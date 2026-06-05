import type { PrismaClient } from '@prisma/client';

type HttpMethod = 'GET' | 'POST';

interface LlamaApiCommonArgs {
    baseUrl?: string;
    apiKey?: string;
    timeoutMs?: number;
    queryParams?: Record<string, unknown>;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveLlamaBaseUrl(baseUrl?: string): string {
    return (baseUrl || process.env.CURATOR_LLM_URL || process.env.LLAMA_CPP_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
}

function buildLlamaUrl(baseUrl: string, path: string, query?: Record<string, unknown>): string {
    const url = new URL(path.startsWith('/') ? path : `/${path}`, `${baseUrl}/`);

    if (query) {
        for (const [key, rawValue] of Object.entries(query)) {
            if (rawValue === undefined || rawValue === null) continue;
            if (Array.isArray(rawValue)) {
                for (const item of rawValue) {
                    url.searchParams.append(key, String(item));
                }
                continue;
            }

            if (typeof rawValue === 'object') {
                url.searchParams.set(key, JSON.stringify(rawValue));
                continue;
            }

            url.searchParams.set(key, String(rawValue));
        }
    }

    return url.toString();
}

function buildHeaders(apiKey?: string): Record<string, string> {
    const key = apiKey || process.env.LLAMA_API_KEY || process.env.CURATOR_LLM_API_KEY;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (key) {
        headers.Authorization = `Bearer ${key}`;
        headers['x-api-key'] = key;
    }

    return headers;
}

async function callLlamaApi(
    method: HttpMethod,
    path: string,
    args: LlamaApiCommonArgs,
    body?: unknown
) {
    const baseUrl = resolveLlamaBaseUrl(args.baseUrl);
    const timeoutMs = args.timeoutMs ?? 30_000;
    const url = buildLlamaUrl(baseUrl, path, args.queryParams);

    const requestInit: RequestInit = {
        method,
        headers: buildHeaders(args.apiKey),
        signal: AbortSignal.timeout(timeoutMs),
    };

    if (body !== undefined) {
        requestInit.body = JSON.stringify(body);
    }

    const response = await fetch(url, requestInit);

    const raw = await response.text();
    let parsed: unknown = null;
    if (raw.length > 0) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            try {
                parsed = JSON.parse(raw);
            } catch {
                parsed = raw;
            }
        } else {
            parsed = raw;
        }
    }

    if (!response.ok) {
        throw new Error(`llama.cpp request failed (${response.status} ${response.statusText}) at ${url}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
    }

    return {
        success: true,
        data: parsed,
        meta: {
            status: response.status,
            endpoint: path,
            url,
        },
    };
}

export interface LlamaHealthInput extends LlamaApiCommonArgs {}
export interface LlamaModelsInput extends LlamaApiCommonArgs {
    api?: 'oai' | 'router';
    reload?: boolean;
    model?: string;
}

export interface LlamaRequestInput extends LlamaApiCommonArgs {
    method: HttpMethod | string;
    path: string;
    body?: unknown;
}

export async function llamaRequest(
    args: LlamaRequestInput,
    _prisma: PrismaClient,
    _userId: string
) {
    if (!args?.path) throw new Error('llama_request requires path');
    const method = String(args?.method || '').toUpperCase();
    if (method !== 'GET' && method !== 'POST') {
        throw new Error('llama_request supports method GET or POST');
    }

    return callLlamaApi(method, args.path, args, args.body);
}

export async function llamaHealth(
    args: LlamaHealthInput,
    _prisma: PrismaClient,
    _userId: string
) {
    return callLlamaApi('GET', '/health', args || {});
}

export async function llamaModels(
    args: LlamaModelsInput,
    _prisma: PrismaClient,
    _userId: string
) {
    const api = args?.api || 'oai';
    const path = api === 'router' ? '/models' : '/v1/models';

    return callLlamaApi('GET', path, {
        ...args,
        queryParams: {
            ...(args?.queryParams || {}),
            ...(args?.reload !== undefined ? { reload: args.reload ? 1 : 0 } : {}),
            ...(args?.model ? { model: args.model } : {}),
        },
    });
}

export interface LlamaChatCompletionInput extends LlamaApiCommonArgs {
    model: string;
    messages: unknown[];
    [key: string]: unknown;
}

export async function llamaChatCompletion(
    args: LlamaChatCompletionInput,
    _prisma: PrismaClient,
    _userId: string
) {
    if (!args?.model) throw new Error('llama_chat_completion requires model');
    if (!Array.isArray(args?.messages)) throw new Error('llama_chat_completion requires messages[]');

    return callLlamaApi('POST', '/v1/chat/completions', args, args);
}

export interface LlamaCompletionInput extends LlamaApiCommonArgs {
    prompt: unknown;
    [key: string]: unknown;
}

export async function llamaCompletion(
    args: LlamaCompletionInput,
    _prisma: PrismaClient,
    _userId: string
) {
    if (args?.prompt === undefined || args?.prompt === null) {
        throw new Error('llama_completion requires prompt');
    }

    return callLlamaApi('POST', '/completion', args, args);
}

export interface LlamaTokenizeInput extends LlamaApiCommonArgs {
    content: string;
    add_special?: boolean;
    parse_special?: boolean;
    with_pieces?: boolean;
}

export async function llamaTokenize(
    args: LlamaTokenizeInput,
    _prisma: PrismaClient,
    _userId: string
) {
    if (!args?.content) throw new Error('llama_tokenize requires content');
    return callLlamaApi('POST', '/tokenize', args, args);
}

export interface LlamaDetokenizeInput extends LlamaApiCommonArgs {
    tokens: number[];
}

export async function llamaDetokenize(
    args: LlamaDetokenizeInput,
    _prisma: PrismaClient,
    _userId: string
) {
    if (!Array.isArray(args?.tokens)) throw new Error('llama_detokenize requires tokens[]');
    return callLlamaApi('POST', '/detokenize', args, args);
}

export interface LlamaApplyTemplateInput extends LlamaApiCommonArgs {
    messages: unknown[];
    [key: string]: unknown;
}

export async function llamaApplyTemplate(
    args: LlamaApplyTemplateInput,
    _prisma: PrismaClient,
    _userId: string
) {
    if (!Array.isArray(args?.messages)) throw new Error('llama_apply_template requires messages[]');
    return callLlamaApi('POST', '/apply-template', args, args);
}

export interface LlamaEmbeddingInput extends LlamaApiCommonArgs {
    content: string;
    embd_normalize?: number;
    [key: string]: unknown;
}

export async function llamaEmbedding(
    args: LlamaEmbeddingInput,
    _prisma: PrismaClient,
    _userId: string
) {
    if (!args?.content) throw new Error('llama_embedding requires content');
    return callLlamaApi('POST', '/embedding', args, args);
}

export interface LlamaV1EmbeddingsInput extends LlamaApiCommonArgs {
    input: string | string[];
    model?: string;
    encoding_format?: 'float' | 'base64';
    [key: string]: unknown;
}

export async function llamaV1Embeddings(
    args: LlamaV1EmbeddingsInput,
    _prisma: PrismaClient,
    _userId: string
) {
    if (args?.input === undefined || args?.input === null) {
        throw new Error('llama_v1_embeddings requires input');
    }

    return callLlamaApi('POST', '/v1/embeddings', args, args);
}

export interface LlamaRerankInput extends LlamaApiCommonArgs {
    query: string;
    documents: string[];
    model?: string;
    top_n?: number;
    [key: string]: unknown;
}

export async function llamaRerank(
    args: LlamaRerankInput,
    _prisma: PrismaClient,
    _userId: string
) {
    if (!args?.query) throw new Error('llama_rerank requires query');
    if (!Array.isArray(args?.documents)) throw new Error('llama_rerank requires documents[]');
    return callLlamaApi('POST', '/v1/rerank', args, args);
}

export interface LlamaPropsGetInput extends LlamaApiCommonArgs {
    model?: string;
    autoload?: boolean;
}

export async function llamaPropsGet(
    args: LlamaPropsGetInput,
    _prisma: PrismaClient,
    _userId: string
) {
    return callLlamaApi('GET', '/props', {
        ...args,
        queryParams: {
            ...(args?.queryParams || {}),
            ...(args?.model ? { model: args.model } : {}),
            ...(args?.autoload !== undefined ? { autoload: args.autoload } : {}),
        },
    });
}

export interface LlamaPropsSetInput extends LlamaApiCommonArgs {
    body?: Record<string, unknown>;
}

export async function llamaPropsSet(
    args: LlamaPropsSetInput,
    _prisma: PrismaClient,
    _userId: string
) {
    const body = isRecord(args?.body) ? args.body : {};
    return callLlamaApi('POST', '/props', args || {}, body);
}

export interface LlamaSlotsInput extends LlamaApiCommonArgs {
    failOnNoSlot?: boolean;
    model?: string;
}

export async function llamaSlots(
    args: LlamaSlotsInput,
    _prisma: PrismaClient,
    _userId: string
) {
    return callLlamaApi('GET', '/slots', {
        ...args,
        queryParams: {
            ...(args?.queryParams || {}),
            ...(args?.failOnNoSlot ? { fail_on_no_slot: 1 } : {}),
            ...(args?.model ? { model: args.model } : {}),
        },
    });
}

export interface LlamaSlotActionInput extends LlamaApiCommonArgs {
    id_slot: number;
    action: 'save' | 'restore' | 'erase';
    filename?: string;
}

export async function llamaSlotAction(
    args: LlamaSlotActionInput,
    _prisma: PrismaClient,
    _userId: string
) {
    if (typeof args?.id_slot !== 'number') throw new Error('llama_slot_action requires numeric id_slot');
    if (!args?.action) throw new Error('llama_slot_action requires action');

    const path = `/slots/${args.id_slot}`;
    const body = args.filename ? { filename: args.filename } : {};
    return callLlamaApi('POST', path, {
        ...args,
        queryParams: {
            ...(args?.queryParams || {}),
            action: args.action,
        },
    }, body);
}

export interface LlamaMetricsInput extends LlamaApiCommonArgs {
    model?: string;
}

export async function llamaMetrics(
    args: LlamaMetricsInput,
    _prisma: PrismaClient,
    _userId: string
) {
    return callLlamaApi('GET', '/metrics', {
        ...args,
        queryParams: {
            ...(args?.queryParams || {}),
            ...(args?.model ? { model: args.model } : {}),
        },
    });
}

export interface LlamaLoraListInput extends LlamaApiCommonArgs {}

export async function llamaLoraList(
    args: LlamaLoraListInput,
    _prisma: PrismaClient,
    _userId: string
) {
    return callLlamaApi('GET', '/lora-adapters', args || {});
}

export interface LlamaLoraSetInput extends LlamaApiCommonArgs {
    adapters: Array<{ id: number; scale: number }>;
}

export async function llamaLoraSet(
    args: LlamaLoraSetInput,
    _prisma: PrismaClient,
    _userId: string
) {
    if (!Array.isArray(args?.adapters)) throw new Error('llama_lora_set requires adapters[]');
    return callLlamaApi('POST', '/lora-adapters', args, args.adapters);
}

export interface LlamaResponsesInput extends LlamaApiCommonArgs {
    model: string;
    input: unknown;
    [key: string]: unknown;
}

export async function llamaResponses(
    args: LlamaResponsesInput,
    _prisma: PrismaClient,
    _userId: string
) {
    if (!args?.model) throw new Error('llama_responses requires model');
    if (args?.input === undefined || args?.input === null) throw new Error('llama_responses requires input');
    return callLlamaApi('POST', '/v1/responses', args, args);
}

export interface LlamaMessagesInput extends LlamaApiCommonArgs {
    model: string;
    messages: unknown[];
    [key: string]: unknown;
}

export async function llamaMessages(
    args: LlamaMessagesInput,
    _prisma: PrismaClient,
    _userId: string
) {
    if (!args?.model) throw new Error('llama_messages requires model');
    if (!Array.isArray(args?.messages)) throw new Error('llama_messages requires messages[]');
    return callLlamaApi('POST', '/v1/messages', args, args);
}

export interface LlamaMessagesCountTokensInput extends LlamaApiCommonArgs {
    model: string;
    messages: unknown[];
    [key: string]: unknown;
}

export async function llamaMessagesCountTokens(
    args: LlamaMessagesCountTokensInput,
    _prisma: PrismaClient,
    _userId: string
) {
    if (!args?.model) throw new Error('llama_messages_count_tokens requires model');
    if (!Array.isArray(args?.messages)) throw new Error('llama_messages_count_tokens requires messages[]');
    return callLlamaApi('POST', '/v1/messages/count_tokens', args, args);
}
/**
 * JSON Schema → form fields, shared by plugin settings (config schemas), structured interrupt answers and (later)
 * tool argument forms. Covers what settings need; anything else is edited as JSON.
 */

export type SchemaFieldKind = 'string' | 'text' | 'number' | 'integer' | 'boolean' | 'enum' | 'secret' | 'json';

export interface SchemaField {
  key: string;
  kind: SchemaFieldKind;
  label: string;
  description?: string;
  required: boolean;
  /** enum values (kind 'enum'). */
  options?: unknown[];
  schema: Record<string, any>;
}

const isPlain = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Field descriptor for one property schema. */
export function schemaField(key: string, schema: Record<string, any> = {}, required = false): SchemaField {
  const base = { key, label: schema.title || key, description: schema.description, required, schema };
  if (Array.isArray(schema.enum)) return { ...base, kind: 'enum', options: schema.enum };
  const type = Array.isArray(schema.type) ? schema.type.find((t: string) => t !== 'null') : schema.type;
  if (type === 'string' && schema.format === 'secret') return { ...base, kind: 'secret' };
  if (type === 'string') return { ...base, kind: (schema.maxLength ?? 0) > 200 || schema.format === 'textarea' ? 'text' : 'string' };
  if (type === 'integer') return { ...base, kind: 'integer' };
  if (type === 'number') return { ...base, kind: 'number' };
  if (type === 'boolean') return { ...base, kind: 'boolean' };
  return { ...base, kind: 'json' };
}

/** Fields of an object schema, in property order. */
export function schemaFields(schema: Record<string, any> | null | undefined): SchemaField[] {
  if (!isPlain(schema?.properties)) return [];
  const required = new Set<string>(Array.isArray(schema!.required) ? schema!.required : []);
  return Object.entries(schema!.properties).map(([key, prop]) => schemaField(key, isPlain(prop) ? prop : {}, required.has(key)));
}

/** True when the schema can be shown as a form (an object with properties); otherwise edit it as JSON. */
export function isFormSchema(schema: Record<string, any> | null | undefined): boolean {
  return !!schema && (schema.type === 'object' || isPlain(schema.properties)) && schemaFields(schema).length > 0;
}

/** Text shown in an input for a value of this field. */
export function formatFieldValue(field: SchemaField, value: unknown): string {
  if (value === undefined || value === null) return '';
  if (field.kind === 'json') return JSON.stringify(value, null, 2);
  return String(value);
}

/**
 * Parses an input into the field's value. Returns `{ value }`, or `{ error }` for text that doesn't fit the type
 * (the server validates against the full schema anyway). Empty input → undefined.
 */
export function parseFieldInput(field: SchemaField, input: unknown): { value?: unknown; error?: string } {
  if (field.kind === 'boolean') return { value: !!input };
  if (field.kind === 'enum') return { value: input };
  const text = typeof input === 'string' ? input : input == null ? '' : String(input);
  if (text.trim() === '') return { value: undefined };
  if (field.kind === 'integer' || field.kind === 'number') {
    const n = Number(text);
    if (!Number.isFinite(n)) return { error: `${field.label}: not a number` };
    if (field.kind === 'integer' && !Number.isInteger(n)) return { error: `${field.label}: must be a whole number` };
    return { value: n };
  }
  if (field.kind === 'secret' && !/^secret:\/\/[A-Za-z0-9_-]+$/.test(text.trim())) {
    return { error: `${field.label}: use a secret reference like secret://NAME, never the secret itself` };
  }
  if (field.kind === 'json') {
    try {
      return { value: JSON.parse(text) };
    } catch (err: any) {
      return { error: `${field.label}: not valid JSON (${err?.message ?? err})` };
    }
  }
  return { value: field.kind === 'secret' ? text.trim() : text };
}

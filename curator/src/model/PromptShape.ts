import type { SemanticNodeShape } from '../services/SemanticSchemaEngine.js';

export const PromptShape: SemanticNodeShape = {
  uri: 'curator:PromptShape',
  targetClass: 'curator:Prompt',
  name: 'Prompt',
  description: 'A parameterized prompt template used for agent instructions, few-shot demonstrations, or structured task execution.',
  properties: {
    name: {
      path: 'schema:name',
      name: 'Name',
      description: 'The unique human- or machine-readable identifier of the prompt.',
      datatype: 'xsd:string',
      minCount: 1,
      maxCount: 1,
    },
    description: {
      path: 'schema:description',
      name: 'Description',
      description: 'Summary of what this prompt accomplishes and the context in which it should be invoked.',
      datatype: 'xsd:string',
    },
    template: {
      path: 'curator:textBlob',
      name: 'Template',
      description: 'The actual prompt template text, supporting parameter placeholders such as {{variable}}.',
      datatype: 'curator:textBlob',
      minCount: 1,
      maxCount: 1,
    },
    systemInstruction: {
      path: 'curator:systemInstruction',
      name: 'System Instruction',
      description: 'Optional system-level steering or behavioral constraints paired with this prompt.',
      datatype: 'xsd:string',
      maxCount: 1,
    },
    inputVariables: {
      path: 'curator:inputVariable',
      name: 'Input Variables',
      description: 'Declared variable names expected by the prompt template placeholders.',
      datatype: 'xsd:string',
    },
    modelTarget: {
      path: 'curator:modelTarget',
      name: 'Model Target',
      description: 'Preferred LLM model family or architecture for this prompt.',
      datatype: 'xsd:string',
      in: ['gemini', 'claude', 'openai', 'llamacpp', 'default'],
      maxCount: 1,
    },
    version: {
      path: 'schema:version',
      name: 'Version',
      description: 'Semantic or numeric version tag of this prompt definition.',
      datatype: 'xsd:string',
      maxCount: 1,
    },
  },
};


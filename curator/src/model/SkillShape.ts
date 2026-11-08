import type { SemanticNodeShape } from '../services/SemanticSchemaEngine.js';

export const SkillShape: SemanticNodeShape = {
  uri: 'curator:SkillShape',
  targetClass: 'curator:Skill',
  name: 'Skill',
  description: 'An autonomous agent skill specification containing procedural guidelines, tool dependencies, and execution instructions.',
  properties: {
    name: {
      path: 'schema:name',
      name: 'Name',
      description: 'The unique skill name or slug (e.g. "data_analysis", "web_scraper", "cpanel_deploy").',
      datatype: 'xsd:string',
      minCount: 1,
      maxCount: 1,
    },
    description: {
      path: 'schema:description',
      name: 'Description',
      description: 'Triggering conditions and summary of when an agent should load and activate this skill.',
      datatype: 'xsd:string',
      minCount: 1,
      maxCount: 1,
    },
    instructions: {
      path: 'curator:textBlob',
      name: 'Instructions',
      description: 'Full markdown documentation of instructions, procedures, and best practices for the skill (equivalent to SKILL.md).',
      datatype: 'curator:textBlob',
      minCount: 1,
      maxCount: 1,
    },
    requiredTools: {
      path: 'curator:requiresTool',
      name: 'Required Tools',
      description: 'Names of tools or MCP tools required for this skill to execute successfully.',
      datatype: 'xsd:string',
    },
    examples: {
      path: 'curator:example',
      name: 'Examples',
      description: 'Few-shot execution examples, input/output demonstrations, or reference invocations.',
      datatype: 'xsd:string',
    },
    category: {
      path: 'schema:category',
      name: 'Category',
      description: 'Functional domain or taxonomy category (e.g. "engineering", "research", "governance", "content").',
      datatype: 'xsd:string',
      maxCount: 1,
    },
    version: {
      path: 'schema:version',
      name: 'Version',
      description: 'Version tag of this skill definition.',
      datatype: 'xsd:string',
      maxCount: 1,
    },
  },
};


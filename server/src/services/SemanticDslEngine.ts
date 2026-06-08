import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DECLARATIONS_PATH = path.resolve(__dirname, '../schema/declarations.sasl');

export interface FieldDefinition {
    type: string;
    isId?: boolean;
    isArray?: boolean;
    isRelation?: boolean;
    isEnum?: boolean;
    isInverse?: boolean;
    predicate?: string;
}

export interface ModelDefinition {
    name: string;
    fields: Record<string, FieldDefinition>;
}

export interface DirectPredicateDefinition {
    uri: string;
    type: string;
    isEnum?: boolean;
    options?: string[];
}

export interface EngineContext {
    models: Record<string, ModelDefinition>;
    enums: Record<string, Record<string, string>>;
    directPredicates: Record<string, DirectPredicateDefinition>;
    classUriToModelName: Record<string, string>;
}

export class SemanticDslEngine {
    private static instance: SemanticDslEngine | null = null;
    private prisma: PrismaClient;
    
    // System base schemas parsed from declarations.sasl
    private baseModels: Record<string, ModelDefinition> = {};
    private baseEnums: Record<string, Record<string, string>> = {};
    private baseDirectPredicates: Record<string, DirectPredicateDefinition> = {};

    private constructor(prisma: PrismaClient) {
        this.prisma = prisma;
        this.loadAndParseSchema();
    }

    public static getInstance(prisma: PrismaClient): SemanticDslEngine {
        if (!SemanticDslEngine.instance) {
            SemanticDslEngine.instance = new SemanticDslEngine(prisma);
        }
        return SemanticDslEngine.instance;
    }

    private loadAndParseSchema(): void {
        try {
            if (fs.existsSync(DECLARATIONS_PATH)) {
                const dslText = fs.readFileSync(DECLARATIONS_PATH, 'utf-8');
                this.parseSchemaText(dslText, this.baseModels, this.baseEnums, this.baseDirectPredicates);
                console.log(`[SemanticDslEngine] Loaded base DSL models: ${Object.keys(this.baseModels).join(', ')}`);
                console.log(`[SemanticDslEngine] Loaded base enums: ${Object.keys(this.baseEnums).join(', ')}`);
                console.log(`[SemanticDslEngine] Loaded base direct predicates: ${Object.keys(this.baseDirectPredicates).join(', ')}`);
            } else {
                console.warn(`[SemanticDslEngine] Declarations file not found at: ${DECLARATIONS_PATH}`);
            }
        } catch (error: any) {
            console.error('[SemanticDslEngine] Failed to load base schema declarations:', error.message);
        }
    }

    /**
     * Helper to determine class URI from first field prefix or default
     */
    private getClassUri(modelName: string, model: ModelDefinition): string {
        for (const field of Object.values(model.fields)) {
            if (field.predicate && field.predicate.includes(':')) {
                const prefix = field.predicate.split(':')[0];
                if (prefix) {
                    return `${prefix}:${modelName}`;
                }
            }
        }
        return `schema:${modelName}`;
    }

    /**
     * Parses a Prisma-like DSL schema string into definitions maps
     */
    private parseSchemaText(
        dslText: string,
        models: Record<string, ModelDefinition>,
        enums: Record<string, Record<string, string>>,
        directPredicates: Record<string, DirectPredicateDefinition>
    ): void {
        const lines = dslText.split('\n');
        let currentBlock: { type: 'model' | 'enum'; name: string; content: string[] } | null = null;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('//')) continue;

            if (currentBlock) {
                if (trimmed === '}') {
                    if (currentBlock.type === 'enum') {
                        const values: Record<string, string> = {};
                        for (const bLine of currentBlock.content) {
                            const bTrimmed = bLine.trim();
                            if (!bTrimmed || bTrimmed.startsWith('//')) continue;

                            const tokens = bTrimmed.split(/\s+/);
                            const valueName = tokens[0];
                            if (!valueName) continue;
                            const rest = tokens.slice(1).join(' ');

                            const uriMatch = rest.match(/@uri\("([^"]+)"\)/);
                            const uri = uriMatch && uriMatch[1] ? uriMatch[1] : `enum:${currentBlock.name.toLowerCase()}/${valueName.toLowerCase()}`;
                            values[valueName] = uri;
                        }
                        enums[currentBlock.name] = values;
                    } else if (currentBlock.type === 'model') {
                        const fields: Record<string, FieldDefinition> = {};
                        for (const bLine of currentBlock.content) {
                            const bTrimmed = bLine.trim();
                            if (!bTrimmed || bTrimmed.startsWith('//')) continue;

                            const tokens = bTrimmed.split(/\s+/);
                            const fieldName = tokens[0];
                            let fieldType = tokens[1];
                            if (!fieldName || !fieldType) continue;
                            const rest = tokens.slice(2).join(' ');

                            const isId = rest.includes('@id');
                            const isArray = fieldType.endsWith('[]');
                            if (isArray) {
                                fieldType = fieldType.slice(0, -2);
                            }

                            const predMatch = rest.match(/@(predicate|relation)\("([^"]+)"\)/);
                            const predicate = predMatch && predMatch[2] ? predMatch[2] : undefined;
                            const isInverse = rest.includes('@inverse');

                            const fieldDef: FieldDefinition = { type: fieldType };
                            if (isId) fieldDef.isId = true;
                            if (isArray) fieldDef.isArray = true;
                            if (isInverse) fieldDef.isInverse = true;
                            if (predicate) fieldDef.predicate = predicate;

                            fields[fieldName] = fieldDef;
                        }
                        models[currentBlock.name] = { name: currentBlock.name, fields };
                    }
                    currentBlock = null;
                } else {
                    currentBlock.content.push(trimmed);
                }
                continue;
            }

            // Detect block starts
            const enumStart = trimmed.match(/^enum\s+(\w+)\s*\{/);
            if (enumStart && enumStart[1]) {
                currentBlock = { type: 'enum', name: enumStart[1], content: [] };
                continue;
            }

            const modelStart = trimmed.match(/^model\s+(\w+)\s*\{/);
            if (modelStart && modelStart[1]) {
                currentBlock = { type: 'model', name: modelStart[1], content: [] };
                continue;
            }

            // Standalone predicate declarations
            const predMatch = trimmed.match(/^predicate\s+([\w:-]+|"[\w:-]+")\s+(\w+)/);
            if (predMatch && predMatch[1] && predMatch[2]) {
                let predUri = predMatch[1];
                if (predUri.startsWith('"') && predUri.endsWith('"')) {
                    predUri = predUri.slice(1, -1);
                }
                const typeName = predMatch[2];
                directPredicates[predUri] = { uri: predUri, type: typeName };
            }
        }
    }

    /**
     * Resolves the combined schema context (system base + project-scoped db custom schemas)
     */
    public async getEngineContext(projectId: string): Promise<EngineContext> {
        // Deep copy the static system schemas
        const models: Record<string, ModelDefinition> = JSON.parse(JSON.stringify(this.baseModels));
        const enums: Record<string, Record<string, string>> = JSON.parse(JSON.stringify(this.baseEnums));
        const directPredicates: Record<string, DirectPredicateDefinition> = JSON.parse(JSON.stringify(this.baseDirectPredicates));

        // Query database definitions for this project
        const dbSchemas = await this.prisma.dslSchema.findMany({
            where: {
                OR: [
                    { projectId },
                    { projectId: 'system' },
                    { projectId: null }
                ],
                existent: true
            }
        });

        for (const schema of dbSchemas) {
            this.parseSchemaText(schema.definition, models, enums, directPredicates);
        }

        // Post-parsing checks: resolve flags, enums, options, and class URI mapping
        const classUriToModelName: Record<string, string> = {};
        for (const [modelName, model] of Object.entries(models)) {
            const classUri = this.getClassUri(modelName, model);
            classUriToModelName[classUri] = modelName;

            for (const field of Object.values(model.fields)) {
                if (field.isId) continue;

                const isEnum = !!enums[field.type];
                const isRelation = isEnum || (!field.isId && !['String', 'Int', 'Float', 'Boolean', 'DateTime'].includes(field.type));

                if (isEnum) field.isEnum = true;
                if (isRelation) field.isRelation = true;
            }
        }

        for (const [uri, pred] of Object.entries(directPredicates)) {
            const enumDef = enums[pred.type];
            if (enumDef) {
                pred.isEnum = true;
                pred.options = Object.values(enumDef);
            }
        }

        return { models, enums, directPredicates, classUriToModelName };
    }

    /**
     * Parses a Prisma-like DSL schema string into base system definitions (backward compatibility)
     */
    public parseSchema(dslText: string): void {
        this.parseSchemaText(dslText, this.baseModels, this.baseEnums, this.baseDirectPredicates);
    }

    /**
     * Resolves the type of a resource in the database by querying its rdf:type relation
     */
    public async resolveEntityType(subjectUri: string, projectId: string, context?: EngineContext): Promise<string | null> {
        const ctx = context || await this.getEngineContext(projectId);
        const resource = await this.prisma.resource.findUnique({
            where: { uri: subjectUri },
            include: {
                subjectRelations: {
                    where: { projectId, existent: true },
                    include: { predicate: true, object: true }
                }
            }
        });
        if (!resource) return null;

        const typeRelation = resource.subjectRelations.find(rel => rel.predicate.uri === 'rdf:type');
        if (!typeRelation) return null;

        const classUri = typeRelation.object.uri;
        return ctx.classUriToModelName[classUri] || null;
    }

    /**
     * Serializes a high-level entity instance matching the DSL schema into RDF rows
     */
    public async saveEntity(
        modelName: string,
        data: Record<string, any>,
        userId: string,
        projectId: string,
        context?: EngineContext
    ): Promise<string> {
        const ctx = context || await this.getEngineContext(projectId);
        const model = ctx.models[modelName];
        if (!model) throw new Error(`Model "${modelName}" not found in schema.`);

        // Find the ID field
        const idField = Object.entries(model.fields).find(([_, f]) => f.isId);
        if (!idField) throw new Error(`Model "${modelName}" has no @id field.`);
        const subjectUri = data[idField[0]];
        if (!subjectUri) throw new Error(`Missing ID field "${idField[0]}" in data.`);

        // 1. Upsert subject Resource
        const classUri = this.getClassUri(modelName, model);
        const subject = await this.prisma.resource.upsert({
            where: { uri: subjectUri },
            update: { deletedAt: null, existent: true },
            create: { uri: subjectUri, title: data.title || subjectUri, userId, projectId }
        });

        // Add class type assertion (subject rdf:type classUri)
        const rdfType = await this.prisma.resource.upsert({
            where: { uri: 'rdf:type' },
            update: {},
            create: { uri: 'rdf:type', title: 'type', userId, projectId: 'system' }
        });
        const classResource = await this.prisma.resource.upsert({
            where: { uri: classUri },
            update: {},
            create: { uri: classUri, title: modelName, userId, projectId }
        });
        await this.prisma.relation.upsert({
            where: {
                subjectId_predicateId_objectId: {
                    subjectId: subject.id,
                    predicateId: rdfType.id,
                    objectId: classResource.id
                }
            },
            update: { existent: true },
            create: {
                subjectId: subject.id,
                predicateId: rdfType.id,
                objectId: classResource.id,
                projectId
            }
        });

        // 2. Map schema fields to triple relations
        for (const [fieldName, field] of Object.entries(model.fields)) {
            if (field.isId) continue;

            const val = data[fieldName];
            if (val === undefined || val === null) continue;

            const predicateUri = field.predicate || `schema:${fieldName}`;
            const predicate = await this.prisma.resource.upsert({
                where: { uri: predicateUri },
                update: {},
                create: { uri: predicateUri, title: fieldName, userId, projectId: 'system' }
            });

            const rawValues = field.isArray && Array.isArray(val) ? val : [val];

            for (const value of rawValues) {
                if (field.isRelation) {
                    let objectUri: string;
                    if (field.isEnum) {
                        const enumMap = ctx.enums[field.type];
                        objectUri = (enumMap && enumMap[value]) || String(value);
                    } else if (typeof value === 'object') {
                        objectUri = await this.saveEntity(field.type, value, userId, projectId, ctx);
                    } else {
                        objectUri = String(value);
                    }

                    const objectResource = await this.prisma.resource.upsert({
                        where: { uri: objectUri },
                        update: {},
                        create: { uri: objectUri, title: objectUri, userId, projectId }
                    });

                    // Internally sync the target schema type resource link for the object resource!
                    if (!field.isEnum) {
                        const targetModel = ctx.models[field.type];
                        if (targetModel) {
                            const targetClassUri = this.getClassUri(field.type, targetModel);
                            const targetClassResource = await this.prisma.resource.upsert({
                                where: { uri: targetClassUri },
                                update: {},
                                create: { uri: targetClassUri, title: field.type, userId, projectId }
                            });
                            await this.prisma.relation.upsert({
                                where: {
                                    subjectId_predicateId_objectId: {
                                        subjectId: objectResource.id,
                                        predicateId: rdfType.id,
                                        objectId: targetClassResource.id
                                    }
                                },
                                update: { existent: true },
                                create: {
                                    subjectId: objectResource.id,
                                    predicateId: rdfType.id,
                                    objectId: targetClassResource.id,
                                    projectId
                                }
                            });
                        }
                    }

                    const relSubjectId = field.isInverse ? objectResource.id : subject.id;
                    const relObjectId = field.isInverse ? subject.id : objectResource.id;

                    await this.prisma.relation.upsert({
                        where: {
                            subjectId_predicateId_objectId: {
                                subjectId: relSubjectId,
                                predicateId: predicate.id,
                                objectId: relObjectId
                            }
                        },
                        update: { existent: true },
                        create: {
                            subjectId: relSubjectId,
                            predicateId: predicate.id,
                            objectId: relObjectId,
                            projectId
                        }
                    });
                } else {
                    // Literal value relation
                    const dataField: any = {};
                    if (field.type === 'String') dataField.literalString = String(value);
                    else if (field.type === 'Int' || field.type === 'Float') dataField.literalValue = Number(value);
                    else if (field.type === 'Boolean') dataField.literalBoolean = Boolean(value);
                    else if (field.type === 'DateTime') dataField.literalDate = new Date(value);

                    await this.prisma.relation.upsert({
                        where: {
                            subjectId_predicateId_objectId: {
                                subjectId: subject.id,
                                predicateId: predicate.id,
                                objectId: predicate.id // self-reference placeholder
                            }
                        },
                        update: {
                            existent: true,
                            ...dataField
                        },
                        create: {
                            subjectId: subject.id,
                            predicateId: predicate.id,
                            objectId: predicate.id,
                            projectId,
                            ...dataField
                        }
                    });
                }
            }
        }

        return subjectUri;
    }

    /**
     * Reads a resource from database triples and hydrates it back to the DSL model shape (cycle-safe)
     */
    public async loadEntity(
        modelName: string,
        subjectUri: string,
        projectId: string,
        visited: Set<string> = new Set(),
        context?: EngineContext
    ): Promise<Record<string, any> | null> {
        if (visited.has(subjectUri)) {
            return { uri: subjectUri };
        }

        const ctx = context || await this.getEngineContext(projectId);
        const model = ctx.models[modelName];
        if (!model) throw new Error(`Model "${modelName}" not found in schema.`);

        const resource = await this.prisma.resource.findUnique({
            where: { uri: subjectUri },
            include: {
                subjectRelations: {
                    where: { projectId, existent: true },
                    include: { predicate: true, object: true }
                },
                objectRelations: {
                    where: { projectId, existent: true },
                    include: { predicate: true, subject: true }
                }
            }
        });

        if (!resource) return null;

        visited.add(subjectUri);

        const result: Record<string, any> = {};

        for (const [fieldName, field] of Object.entries(model.fields)) {
            if (field.isId) {
                result[fieldName] = subjectUri;
                continue;
            }

            const predicateUri = field.predicate || `schema:${fieldName}`;
            const isInverse = field.isInverse;
            const matches = isInverse
                ? resource.objectRelations.filter(rel => rel.predicate.uri === predicateUri)
                : resource.subjectRelations.filter(rel => rel.predicate.uri === predicateUri);

            if (matches.length === 0) continue;

            const extract = async (rel: any) => {
                if (field.isRelation) {
                    const targetUri = isInverse ? rel.subject.uri : rel.object.uri;
                    if (field.isEnum) {
                        const enumDefinition = ctx.enums[field.type];
                        if (enumDefinition) {
                            const entry = Object.entries(enumDefinition).find(([_, u]) => u === targetUri);
                            if (entry) return entry[0];
                        }
                        return targetUri;
                    }
                    
                    // Dynamically resolve type using context type mappings
                    const resolvedModel = await this.resolveEntityType(targetUri, projectId, ctx);
                    const targetModelName = resolvedModel || field.type;
                    return await this.loadEntity(targetModelName, targetUri, projectId, new Set(visited), ctx);
                }
                if (field.type === 'String') return rel.literalString;
                if (field.type === 'Int' || field.type === 'Float') return rel.literalValue;
                if (field.type === 'Boolean') return rel.literalBoolean;
                if (field.type === 'DateTime') return rel.literalDate;
                return null;
            };

            if (field.isArray) {
                const values = [];
                for (const match of matches) {
                    values.push(await extract(match));
                }
                result[fieldName] = values;
            } else {
                result[fieldName] = await extract(matches[0]);
            }
        }

        return result;
    }

    /**
     * Soft deletes an entity instance (the Resource node and its outgoing triples)
     */
    public async deleteEntity(
        modelName: string,
        subjectUri: string,
        projectId: string
    ): Promise<boolean> {
        const resource = await this.prisma.resource.findFirst({
            where: { uri: subjectUri, projectId, existent: true }
        });
        if (!resource) return false;

        await this.prisma.resource.update({
            where: { id: resource.id },
            data: {
                existent: false,
                deletedAt: new Date()
            }
        });

        await this.prisma.relation.updateMany({
            where: { subjectId: resource.id, projectId, existent: true },
            data: { existent: false }
        });

        return true;
    }

    /**
     * Lists all entities conforming to a dynamic model name in a project
     */
    public async listEntities(
        modelName: string,
        projectId: string
    ): Promise<Record<string, any>[]> {
        const ctx = await this.getEngineContext(projectId);
        const model = ctx.models[modelName];
        if (!model) throw new Error(`Model "${modelName}" not found in project schema.`);

        const classUri = this.getClassUri(modelName, model);

        const resources = await this.prisma.resource.findMany({
            where: {
                projectId,
                existent: true,
                subjectRelations: {
                    some: {
                        predicate: { uri: 'rdf:type' },
                        object: { uri: classUri },
                        existent: true
                    }
                }
            },
            select: { uri: true }
        });

        const results: Record<string, any>[] = [];
        for (const res of resources) {
            const entity = await this.loadEntity(modelName, res.uri, projectId, new Set(), ctx);
            if (entity) {
                results.push(entity);
            }
        }
        return results;
    }

    /**
     * Seeds base static declarations (backward compatibility)
     */
    public async syncDslOntology(userId: string, projectId: string): Promise<void> {
        const ctx = await this.getEngineContext(projectId);
        await this.syncOntologyForContext(ctx, userId, projectId);
    }

    /**
     * Syncs a specific EngineContext configuration down to ontology triples in the DB
     */
    public async syncOntologyForContext(
        ctx: EngineContext,
        userId: string,
        projectId: string
    ): Promise<void> {
        console.log('[SemanticDslEngine] Syncing context ontology/metamodels to database...');

        const rdfType = await this.prisma.resource.upsert({
            where: { uri: 'rdf:type' },
            update: {},
            create: { uri: 'rdf:type', title: 'type', userId, projectId: 'system' }
        });

        const rdfsClass = await this.prisma.resource.upsert({
            where: { uri: 'rdfs:Class' },
            update: {},
            create: { uri: 'rdfs:Class', title: 'Class', userId, projectId: 'system' }
        });

        const rdfProperty = await this.prisma.resource.upsert({
            where: { uri: 'rdf:Property' },
            update: {},
            create: { uri: 'rdf:Property', title: 'Property', userId, projectId: 'system' }
        });

        const rdfsDomain = await this.prisma.resource.upsert({
            where: { uri: 'rdfs:domain' },
            update: {},
            create: { uri: 'rdfs:domain', title: 'domain', userId, projectId: 'system' }
        });

        const rdfsRange = await this.prisma.resource.upsert({
            where: { uri: 'rdfs:range' },
            update: {},
            create: { uri: 'rdfs:range', title: 'range', userId, projectId: 'system' }
        });

        // 1. Sync Models (Classes)
        for (const [modelName, model] of Object.entries(ctx.models)) {
            const classUri = this.getClassUri(modelName, model);

            const classResource = await this.prisma.resource.upsert({
                where: { uri: classUri },
                update: {},
                create: { uri: classUri, title: modelName, userId, projectId }
            });

            await this.prisma.relation.upsert({
                where: {
                    subjectId_predicateId_objectId: {
                        subjectId: classResource.id,
                        predicateId: rdfType.id,
                        objectId: rdfsClass.id
                    }
                },
                update: { existent: true },
                create: {
                    subjectId: classResource.id,
                    predicateId: rdfType.id,
                    objectId: rdfsClass.id,
                    projectId
                }
            });

            for (const [fieldName, field] of Object.entries(model.fields)) {
                if (field.isId) continue;

                const predicateUri = field.predicate || `schema:${fieldName}`;

                const propResource = await this.prisma.resource.upsert({
                    where: { uri: predicateUri },
                    update: {},
                    create: { uri: predicateUri, title: fieldName, userId, projectId }
                });

                await this.prisma.relation.upsert({
                    where: {
                        subjectId_predicateId_objectId: {
                            subjectId: propResource.id,
                            predicateId: rdfType.id,
                            objectId: rdfProperty.id
                        }
                    },
                    update: { existent: true },
                    create: {
                        subjectId: propResource.id,
                        predicateId: rdfType.id,
                        objectId: rdfProperty.id,
                        projectId
                    }
                });

                await this.prisma.relation.upsert({
                    where: {
                        subjectId_predicateId_objectId: {
                            subjectId: propResource.id,
                            predicateId: rdfsDomain.id,
                            objectId: classResource.id
                        }
                    },
                    update: { existent: true },
                    create: {
                        subjectId: propResource.id,
                        predicateId: rdfsDomain.id,
                        objectId: classResource.id,
                        projectId
                    }
                });

                let rangeUri = `xsd:${field.type.toLowerCase()}`;
                if (field.isRelation) {
                    if (field.isEnum) {
                        rangeUri = `enum:${field.type}`;
                    } else {
                        const targetModel = ctx.models[field.type];
                        rangeUri = targetModel ? this.getClassUri(field.type, targetModel) : `schema:${field.type}`;
                    }
                }

                const rangeResource = await this.prisma.resource.upsert({
                    where: { uri: rangeUri },
                    update: {},
                    create: { uri: rangeUri, title: field.type, userId, projectId: 'system' }
                });

                await this.prisma.relation.upsert({
                    where: {
                        subjectId_predicateId_objectId: {
                            subjectId: propResource.id,
                            predicateId: rdfsRange.id,
                            objectId: rangeResource.id
                        }
                    },
                    update: { existent: true },
                    create: {
                        subjectId: propResource.id,
                        predicateId: rdfsRange.id,
                        objectId: rangeResource.id,
                        projectId
                    }
                });
            }
        }

        // 2. Sync Standalone/Direct Predicates
        for (const [predUri, pred] of Object.entries(ctx.directPredicates)) {
            const title = predUri.includes(':') ? predUri.split(':').slice(1).join(':') : predUri;
            const propResource = await this.prisma.resource.upsert({
                where: { uri: predUri },
                update: {},
                create: { uri: predUri, title, userId, projectId }
            });

            await this.prisma.relation.upsert({
                where: {
                    subjectId_predicateId_objectId: {
                        subjectId: propResource.id,
                        predicateId: rdfType.id,
                        objectId: rdfProperty.id
                    }
                },
                update: { existent: true },
                create: {
                    subjectId: propResource.id,
                    predicateId: rdfType.id,
                    objectId: rdfProperty.id,
                    projectId
                }
            });

            let rangeUri = `xsd:${pred.type.toLowerCase()}`;
            if (pred.isEnum) {
                rangeUri = `enum:${pred.type}`;
            } else {
                const targetModel = ctx.models[pred.type];
                if (targetModel) {
                    rangeUri = this.getClassUri(pred.type, targetModel);
                }
            }

            const rangeResource = await this.prisma.resource.upsert({
                where: { uri: rangeUri },
                update: {},
                create: { uri: rangeUri, title: pred.type, userId, projectId: 'system' }
            });

            await this.prisma.relation.upsert({
                where: {
                    subjectId_predicateId_objectId: {
                        subjectId: propResource.id,
                        predicateId: rdfsRange.id,
                        objectId: rangeResource.id
                    }
                },
                update: { existent: true },
                create: {
                    subjectId: propResource.id,
                    predicateId: rdfsRange.id,
                    objectId: rangeResource.id,
                    projectId
                }
            });

            if (pred.isEnum && pred.options) {
                const allowsValueResource = await this.prisma.resource.upsert({
                    where: { uri: 'prop:allows_value' },
                    update: {},
                    create: { uri: 'prop:allows_value', title: 'allows_value', userId, projectId: 'system' }
                });

                for (const optionUri of pred.options) {
                    const allowedResource = await this.prisma.resource.upsert({
                        where: { uri: optionUri },
                        update: { existent: true, deletedAt: null },
                        create: { uri: optionUri, title: optionUri.split('/').pop() || optionUri, userId, projectId }
                    });

                    await this.prisma.relation.upsert({
                        where: {
                            subjectId_predicateId_objectId: {
                                subjectId: propResource.id,
                                predicateId: allowsValueResource.id,
                                objectId: allowedResource.id
                            }
                        },
                        update: { existent: true },
                        create: {
                            subjectId: propResource.id,
                            predicateId: allowsValueResource.id,
                            objectId: allowedResource.id,
                            projectId
                        }
                    });

                    await this.prisma.relation.upsert({
                        where: {
                            subjectId_predicateId_objectId: {
                                subjectId: allowedResource.id,
                                predicateId: rdfType.id,
                                objectId: propResource.id
                            }
                        },
                        update: { existent: true },
                        create: {
                            subjectId: allowedResource.id,
                            predicateId: rdfType.id,
                            objectId: propResource.id,
                            projectId
                        }
                    });
                }
            }
        }

        console.log('[SemanticDslEngine] Dynamic ontology syncing complete.');
    }
}

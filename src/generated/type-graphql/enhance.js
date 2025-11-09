"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyResolversEnhanceMap = applyResolversEnhanceMap;
exports.applyArgsTypesEnhanceMap = applyArgsTypesEnhanceMap;
exports.applyRelationResolversEnhanceMap = applyRelationResolversEnhanceMap;
exports.applyModelsEnhanceMap = applyModelsEnhanceMap;
exports.applyOutputTypesEnhanceMap = applyOutputTypesEnhanceMap;
exports.applyInputTypesEnhanceMap = applyInputTypesEnhanceMap;
const tslib_1 = require("tslib");
const tslib = tslib_1.__importStar(require("tslib"));
const crudResolvers = tslib_1.__importStar(require("./resolvers/crud/resolvers-crud.index"));
const argsTypes = tslib_1.__importStar(require("./resolvers/crud/args.index"));
const actionResolvers = tslib_1.__importStar(require("./resolvers/crud/resolvers-actions.index"));
const relationResolvers = tslib_1.__importStar(require("./resolvers/relations/resolvers.index"));
const models = tslib_1.__importStar(require("./models"));
const outputTypes = tslib_1.__importStar(require("./resolvers/outputs"));
const inputTypes = tslib_1.__importStar(require("./resolvers/inputs"));
const crudResolversMap = {
    Document: crudResolvers.DocumentCrudResolver,
    VectorStore: crudResolvers.VectorStoreCrudResolver,
    Chunk: crudResolvers.ChunkCrudResolver,
    FileData: crudResolvers.FileDataCrudResolver,
    Project: crudResolvers.ProjectCrudResolver,
    Tenant: crudResolvers.TenantCrudResolver,
    Model: crudResolvers.ModelCrudResolver
};
const actionResolversMap = {
    Document: {
        aggregateDocument: actionResolvers.AggregateDocumentResolver,
        createManyDocument: actionResolvers.CreateManyDocumentResolver,
        createManyAndReturnDocument: actionResolvers.CreateManyAndReturnDocumentResolver,
        createOneDocument: actionResolvers.CreateOneDocumentResolver,
        deleteManyDocument: actionResolvers.DeleteManyDocumentResolver,
        deleteOneDocument: actionResolvers.DeleteOneDocumentResolver,
        findFirstDocument: actionResolvers.FindFirstDocumentResolver,
        findFirstDocumentOrThrow: actionResolvers.FindFirstDocumentOrThrowResolver,
        documents: actionResolvers.FindManyDocumentResolver,
        document: actionResolvers.FindUniqueDocumentResolver,
        getDocument: actionResolvers.FindUniqueDocumentOrThrowResolver,
        groupByDocument: actionResolvers.GroupByDocumentResolver,
        updateManyDocument: actionResolvers.UpdateManyDocumentResolver,
        updateOneDocument: actionResolvers.UpdateOneDocumentResolver,
        upsertOneDocument: actionResolvers.UpsertOneDocumentResolver
    },
    VectorStore: {
        aggregateVectorStore: actionResolvers.AggregateVectorStoreResolver,
        deleteManyVectorStore: actionResolvers.DeleteManyVectorStoreResolver,
        deleteOneVectorStore: actionResolvers.DeleteOneVectorStoreResolver,
        findFirstVectorStore: actionResolvers.FindFirstVectorStoreResolver,
        findFirstVectorStoreOrThrow: actionResolvers.FindFirstVectorStoreOrThrowResolver,
        vectorStores: actionResolvers.FindManyVectorStoreResolver,
        vectorStore: actionResolvers.FindUniqueVectorStoreResolver,
        getVectorStore: actionResolvers.FindUniqueVectorStoreOrThrowResolver,
        groupByVectorStore: actionResolvers.GroupByVectorStoreResolver,
        updateManyVectorStore: actionResolvers.UpdateManyVectorStoreResolver,
        updateOneVectorStore: actionResolvers.UpdateOneVectorStoreResolver
    },
    Chunk: {
        aggregateChunk: actionResolvers.AggregateChunkResolver,
        deleteManyChunk: actionResolvers.DeleteManyChunkResolver,
        deleteOneChunk: actionResolvers.DeleteOneChunkResolver,
        findFirstChunk: actionResolvers.FindFirstChunkResolver,
        findFirstChunkOrThrow: actionResolvers.FindFirstChunkOrThrowResolver,
        chunks: actionResolvers.FindManyChunkResolver,
        chunk: actionResolvers.FindUniqueChunkResolver,
        getChunk: actionResolvers.FindUniqueChunkOrThrowResolver,
        groupByChunk: actionResolvers.GroupByChunkResolver,
        updateManyChunk: actionResolvers.UpdateManyChunkResolver,
        updateOneChunk: actionResolvers.UpdateOneChunkResolver
    },
    FileData: {
        aggregateFileData: actionResolvers.AggregateFileDataResolver,
        createManyFileData: actionResolvers.CreateManyFileDataResolver,
        createManyAndReturnFileData: actionResolvers.CreateManyAndReturnFileDataResolver,
        createOneFileData: actionResolvers.CreateOneFileDataResolver,
        deleteManyFileData: actionResolvers.DeleteManyFileDataResolver,
        deleteOneFileData: actionResolvers.DeleteOneFileDataResolver,
        findFirstFileData: actionResolvers.FindFirstFileDataResolver,
        findFirstFileDataOrThrow: actionResolvers.FindFirstFileDataOrThrowResolver,
        findManyFileData: actionResolvers.FindManyFileDataResolver,
        findUniqueFileData: actionResolvers.FindUniqueFileDataResolver,
        findUniqueFileDataOrThrow: actionResolvers.FindUniqueFileDataOrThrowResolver,
        groupByFileData: actionResolvers.GroupByFileDataResolver,
        updateManyFileData: actionResolvers.UpdateManyFileDataResolver,
        updateOneFileData: actionResolvers.UpdateOneFileDataResolver,
        upsertOneFileData: actionResolvers.UpsertOneFileDataResolver
    },
    Project: {
        aggregateProject: actionResolvers.AggregateProjectResolver,
        createManyProject: actionResolvers.CreateManyProjectResolver,
        createManyAndReturnProject: actionResolvers.CreateManyAndReturnProjectResolver,
        createOneProject: actionResolvers.CreateOneProjectResolver,
        deleteManyProject: actionResolvers.DeleteManyProjectResolver,
        deleteOneProject: actionResolvers.DeleteOneProjectResolver,
        findFirstProject: actionResolvers.FindFirstProjectResolver,
        findFirstProjectOrThrow: actionResolvers.FindFirstProjectOrThrowResolver,
        projects: actionResolvers.FindManyProjectResolver,
        project: actionResolvers.FindUniqueProjectResolver,
        getProject: actionResolvers.FindUniqueProjectOrThrowResolver,
        groupByProject: actionResolvers.GroupByProjectResolver,
        updateManyProject: actionResolvers.UpdateManyProjectResolver,
        updateOneProject: actionResolvers.UpdateOneProjectResolver,
        upsertOneProject: actionResolvers.UpsertOneProjectResolver
    },
    Tenant: {
        aggregateTenant: actionResolvers.AggregateTenantResolver,
        createManyTenant: actionResolvers.CreateManyTenantResolver,
        createManyAndReturnTenant: actionResolvers.CreateManyAndReturnTenantResolver,
        createOneTenant: actionResolvers.CreateOneTenantResolver,
        deleteManyTenant: actionResolvers.DeleteManyTenantResolver,
        deleteOneTenant: actionResolvers.DeleteOneTenantResolver,
        findFirstTenant: actionResolvers.FindFirstTenantResolver,
        findFirstTenantOrThrow: actionResolvers.FindFirstTenantOrThrowResolver,
        tenants: actionResolvers.FindManyTenantResolver,
        tenant: actionResolvers.FindUniqueTenantResolver,
        getTenant: actionResolvers.FindUniqueTenantOrThrowResolver,
        groupByTenant: actionResolvers.GroupByTenantResolver,
        updateManyTenant: actionResolvers.UpdateManyTenantResolver,
        updateOneTenant: actionResolvers.UpdateOneTenantResolver,
        upsertOneTenant: actionResolvers.UpsertOneTenantResolver
    },
    Model: {
        aggregateModel: actionResolvers.AggregateModelResolver,
        createManyModel: actionResolvers.CreateManyModelResolver,
        createManyAndReturnModel: actionResolvers.CreateManyAndReturnModelResolver,
        createOneModel: actionResolvers.CreateOneModelResolver,
        deleteManyModel: actionResolvers.DeleteManyModelResolver,
        deleteOneModel: actionResolvers.DeleteOneModelResolver,
        findFirstModel: actionResolvers.FindFirstModelResolver,
        findFirstModelOrThrow: actionResolvers.FindFirstModelOrThrowResolver,
        models: actionResolvers.FindManyModelResolver,
        model: actionResolvers.FindUniqueModelResolver,
        getModel: actionResolvers.FindUniqueModelOrThrowResolver,
        groupByModel: actionResolvers.GroupByModelResolver,
        updateManyModel: actionResolvers.UpdateManyModelResolver,
        updateOneModel: actionResolvers.UpdateOneModelResolver,
        upsertOneModel: actionResolvers.UpsertOneModelResolver
    }
};
const crudResolversInfo = {
    Document: ["aggregateDocument", "createManyDocument", "createManyAndReturnDocument", "createOneDocument", "deleteManyDocument", "deleteOneDocument", "findFirstDocument", "findFirstDocumentOrThrow", "documents", "document", "getDocument", "groupByDocument", "updateManyDocument", "updateOneDocument", "upsertOneDocument"],
    VectorStore: ["aggregateVectorStore", "deleteManyVectorStore", "deleteOneVectorStore", "findFirstVectorStore", "findFirstVectorStoreOrThrow", "vectorStores", "vectorStore", "getVectorStore", "groupByVectorStore", "updateManyVectorStore", "updateOneVectorStore"],
    Chunk: ["aggregateChunk", "deleteManyChunk", "deleteOneChunk", "findFirstChunk", "findFirstChunkOrThrow", "chunks", "chunk", "getChunk", "groupByChunk", "updateManyChunk", "updateOneChunk"],
    FileData: ["aggregateFileData", "createManyFileData", "createManyAndReturnFileData", "createOneFileData", "deleteManyFileData", "deleteOneFileData", "findFirstFileData", "findFirstFileDataOrThrow", "findManyFileData", "findUniqueFileData", "findUniqueFileDataOrThrow", "groupByFileData", "updateManyFileData", "updateOneFileData", "upsertOneFileData"],
    Project: ["aggregateProject", "createManyProject", "createManyAndReturnProject", "createOneProject", "deleteManyProject", "deleteOneProject", "findFirstProject", "findFirstProjectOrThrow", "projects", "project", "getProject", "groupByProject", "updateManyProject", "updateOneProject", "upsertOneProject"],
    Tenant: ["aggregateTenant", "createManyTenant", "createManyAndReturnTenant", "createOneTenant", "deleteManyTenant", "deleteOneTenant", "findFirstTenant", "findFirstTenantOrThrow", "tenants", "tenant", "getTenant", "groupByTenant", "updateManyTenant", "updateOneTenant", "upsertOneTenant"],
    Model: ["aggregateModel", "createManyModel", "createManyAndReturnModel", "createOneModel", "deleteManyModel", "deleteOneModel", "findFirstModel", "findFirstModelOrThrow", "models", "model", "getModel", "groupByModel", "updateManyModel", "updateOneModel", "upsertOneModel"]
};
const argsInfo = {
    AggregateDocumentArgs: ["where", "orderBy", "cursor", "take", "skip"],
    CreateManyDocumentArgs: ["data", "skipDuplicates"],
    CreateManyAndReturnDocumentArgs: ["data", "skipDuplicates"],
    CreateOneDocumentArgs: ["data"],
    DeleteManyDocumentArgs: ["where"],
    DeleteOneDocumentArgs: ["where"],
    FindFirstDocumentArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindFirstDocumentOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindManyDocumentArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindUniqueDocumentArgs: ["where"],
    FindUniqueDocumentOrThrowArgs: ["where"],
    GroupByDocumentArgs: ["where", "orderBy", "by", "having", "take", "skip"],
    UpdateManyDocumentArgs: ["data", "where"],
    UpdateOneDocumentArgs: ["data", "where"],
    UpsertOneDocumentArgs: ["where", "create", "update"],
    AggregateVectorStoreArgs: ["where", "orderBy", "cursor", "take", "skip"],
    DeleteManyVectorStoreArgs: ["where"],
    DeleteOneVectorStoreArgs: ["where"],
    FindFirstVectorStoreArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindFirstVectorStoreOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindManyVectorStoreArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindUniqueVectorStoreArgs: ["where"],
    FindUniqueVectorStoreOrThrowArgs: ["where"],
    GroupByVectorStoreArgs: ["where", "orderBy", "by", "having", "take", "skip"],
    UpdateManyVectorStoreArgs: ["data", "where"],
    UpdateOneVectorStoreArgs: ["data", "where"],
    AggregateChunkArgs: ["where", "orderBy", "cursor", "take", "skip"],
    DeleteManyChunkArgs: ["where"],
    DeleteOneChunkArgs: ["where"],
    FindFirstChunkArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindFirstChunkOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindManyChunkArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindUniqueChunkArgs: ["where"],
    FindUniqueChunkOrThrowArgs: ["where"],
    GroupByChunkArgs: ["where", "orderBy", "by", "having", "take", "skip"],
    UpdateManyChunkArgs: ["data", "where"],
    UpdateOneChunkArgs: ["data", "where"],
    AggregateFileDataArgs: ["where", "orderBy", "cursor", "take", "skip"],
    CreateManyFileDataArgs: ["data", "skipDuplicates"],
    CreateManyAndReturnFileDataArgs: ["data", "skipDuplicates"],
    CreateOneFileDataArgs: ["data"],
    DeleteManyFileDataArgs: ["where"],
    DeleteOneFileDataArgs: ["where"],
    FindFirstFileDataArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindFirstFileDataOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindManyFileDataArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindUniqueFileDataArgs: ["where"],
    FindUniqueFileDataOrThrowArgs: ["where"],
    GroupByFileDataArgs: ["where", "orderBy", "by", "having", "take", "skip"],
    UpdateManyFileDataArgs: ["data", "where"],
    UpdateOneFileDataArgs: ["data", "where"],
    UpsertOneFileDataArgs: ["where", "create", "update"],
    AggregateProjectArgs: ["where", "orderBy", "cursor", "take", "skip"],
    CreateManyProjectArgs: ["data", "skipDuplicates"],
    CreateManyAndReturnProjectArgs: ["data", "skipDuplicates"],
    CreateOneProjectArgs: ["data"],
    DeleteManyProjectArgs: ["where"],
    DeleteOneProjectArgs: ["where"],
    FindFirstProjectArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindFirstProjectOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindManyProjectArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindUniqueProjectArgs: ["where"],
    FindUniqueProjectOrThrowArgs: ["where"],
    GroupByProjectArgs: ["where", "orderBy", "by", "having", "take", "skip"],
    UpdateManyProjectArgs: ["data", "where"],
    UpdateOneProjectArgs: ["data", "where"],
    UpsertOneProjectArgs: ["where", "create", "update"],
    AggregateTenantArgs: ["where", "orderBy", "cursor", "take", "skip"],
    CreateManyTenantArgs: ["data", "skipDuplicates"],
    CreateManyAndReturnTenantArgs: ["data", "skipDuplicates"],
    CreateOneTenantArgs: ["data"],
    DeleteManyTenantArgs: ["where"],
    DeleteOneTenantArgs: ["where"],
    FindFirstTenantArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindFirstTenantOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindManyTenantArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindUniqueTenantArgs: ["where"],
    FindUniqueTenantOrThrowArgs: ["where"],
    GroupByTenantArgs: ["where", "orderBy", "by", "having", "take", "skip"],
    UpdateManyTenantArgs: ["data", "where"],
    UpdateOneTenantArgs: ["data", "where"],
    UpsertOneTenantArgs: ["where", "create", "update"],
    AggregateModelArgs: ["where", "orderBy", "cursor", "take", "skip"],
    CreateManyModelArgs: ["data", "skipDuplicates"],
    CreateManyAndReturnModelArgs: ["data", "skipDuplicates"],
    CreateOneModelArgs: ["data"],
    DeleteManyModelArgs: ["where"],
    DeleteOneModelArgs: ["where"],
    FindFirstModelArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindFirstModelOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindManyModelArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
    FindUniqueModelArgs: ["where"],
    FindUniqueModelOrThrowArgs: ["where"],
    GroupByModelArgs: ["where", "orderBy", "by", "having", "take", "skip"],
    UpdateManyModelArgs: ["data", "where"],
    UpdateOneModelArgs: ["data", "where"],
    UpsertOneModelArgs: ["where", "create", "update"]
};
function applyResolversEnhanceMap(resolversEnhanceMap) {
    const mutationOperationPrefixes = [
        "createOne", "createMany", "createManyAndReturn", "deleteOne", "updateOne", "deleteMany", "updateMany", "upsertOne"
    ];
    for (const resolversEnhanceMapKey of Object.keys(resolversEnhanceMap)) {
        const modelName = resolversEnhanceMapKey;
        const crudTarget = crudResolversMap[modelName].prototype;
        const resolverActionsConfig = resolversEnhanceMap[modelName];
        const actionResolversConfig = actionResolversMap[modelName];
        const allActionsDecorators = resolverActionsConfig._all;
        const resolverActionNames = crudResolversInfo[modelName];
        for (const resolverActionName of resolverActionNames) {
            const maybeDecoratorsOrFn = resolverActionsConfig[resolverActionName];
            const isWriteOperation = mutationOperationPrefixes.some(prefix => resolverActionName.startsWith(prefix));
            const operationKindDecorators = isWriteOperation ? resolverActionsConfig._mutation : resolverActionsConfig._query;
            const mainDecorators = [
                ...allActionsDecorators ?? [],
                ...operationKindDecorators ?? [],
            ];
            let decorators;
            if (typeof maybeDecoratorsOrFn === "function") {
                decorators = maybeDecoratorsOrFn(mainDecorators);
            }
            else {
                decorators = [...mainDecorators, ...maybeDecoratorsOrFn ?? []];
            }
            const actionTarget = actionResolversConfig[resolverActionName].prototype;
            tslib.__decorate(decorators, crudTarget, resolverActionName, null);
            tslib.__decorate(decorators, actionTarget, resolverActionName, null);
        }
    }
}
function applyArgsTypesEnhanceMap(argsTypesEnhanceMap) {
    for (const argsTypesEnhanceMapKey of Object.keys(argsTypesEnhanceMap)) {
        const argsTypeName = argsTypesEnhanceMapKey;
        const typeConfig = argsTypesEnhanceMap[argsTypeName];
        const typeClass = argsTypes[argsTypeName];
        const typeTarget = typeClass.prototype;
        applyTypeClassEnhanceConfig(typeConfig, typeClass, typeTarget, argsInfo[argsTypeName]);
    }
}
const relationResolversMap = {
    Chunk: relationResolvers.ChunkRelationsResolver,
    FileData: relationResolvers.FileDataRelationsResolver,
    Project: relationResolvers.ProjectRelationsResolver,
    Tenant: relationResolvers.TenantRelationsResolver,
    Model: relationResolvers.ModelRelationsResolver
};
const relationResolversInfo = {
    Chunk: ["file", "model"],
    FileData: ["project", "Chunk"],
    Project: ["tenant", "files"],
    Tenant: ["projects"],
    Model: ["chunks"]
};
function applyRelationResolversEnhanceMap(relationResolversEnhanceMap) {
    for (const relationResolversEnhanceMapKey of Object.keys(relationResolversEnhanceMap)) {
        const modelName = relationResolversEnhanceMapKey;
        const relationResolverTarget = relationResolversMap[modelName].prototype;
        const relationResolverActionsConfig = relationResolversEnhanceMap[modelName];
        const allActionsDecorators = relationResolverActionsConfig._all ?? [];
        const relationResolverActionNames = relationResolversInfo[modelName];
        for (const relationResolverActionName of relationResolverActionNames) {
            const maybeDecoratorsOrFn = relationResolverActionsConfig[relationResolverActionName];
            let decorators;
            if (typeof maybeDecoratorsOrFn === "function") {
                decorators = maybeDecoratorsOrFn(allActionsDecorators);
            }
            else {
                decorators = [...allActionsDecorators, ...maybeDecoratorsOrFn ?? []];
            }
            tslib.__decorate(decorators, relationResolverTarget, relationResolverActionName, null);
        }
    }
}
function applyTypeClassEnhanceConfig(enhanceConfig, typeClass, typePrototype, typeFieldNames) {
    if (enhanceConfig.class) {
        tslib.__decorate(enhanceConfig.class, typeClass);
    }
    if (enhanceConfig.fields) {
        const allFieldsDecorators = enhanceConfig.fields._all ?? [];
        for (const typeFieldName of typeFieldNames) {
            const maybeDecoratorsOrFn = enhanceConfig.fields[typeFieldName];
            let decorators;
            if (typeof maybeDecoratorsOrFn === "function") {
                decorators = maybeDecoratorsOrFn(allFieldsDecorators);
            }
            else {
                decorators = [...allFieldsDecorators, ...maybeDecoratorsOrFn ?? []];
            }
            tslib.__decorate(decorators, typePrototype, typeFieldName, void 0);
        }
    }
}
const modelsInfo = {
    Document: ["id", "content", "metadata", "createdAt", "updatedAt"],
    VectorStore: ["id", "namespace", "content", "metadata", "createdAt"],
    Chunk: ["id", "text", "hash", "selection", "fileId", "modelId"],
    FileData: ["id", "name", "mimeType", "source", "hash", "size", "content", "projectId", "createdAt", "updatedAt"],
    Project: ["id", "name", "tenantId", "createdAt", "updatedAt"],
    Tenant: ["id", "name", "createdAt", "updatedAt"],
    Model: ["id", "name", "columnName", "source"]
};
function applyModelsEnhanceMap(modelsEnhanceMap) {
    for (const modelsEnhanceMapKey of Object.keys(modelsEnhanceMap)) {
        const modelName = modelsEnhanceMapKey;
        const modelConfig = modelsEnhanceMap[modelName];
        const modelClass = models[modelName];
        const modelTarget = modelClass.prototype;
        applyTypeClassEnhanceConfig(modelConfig, modelClass, modelTarget, modelsInfo[modelName]);
    }
}
const outputsInfo = {
    AggregateDocument: ["_count", "_min", "_max"],
    DocumentGroupBy: ["id", "content", "metadata", "createdAt", "updatedAt", "_count", "_min", "_max"],
    AggregateVectorStore: ["_count", "_min", "_max"],
    VectorStoreGroupBy: ["id", "namespace", "content", "metadata", "createdAt", "_count", "_min", "_max"],
    AggregateChunk: ["_count", "_avg", "_sum", "_min", "_max"],
    ChunkGroupBy: ["id", "text", "hash", "selection", "fileId", "modelId", "_count", "_avg", "_sum", "_min", "_max"],
    AggregateFileData: ["_count", "_avg", "_sum", "_min", "_max"],
    FileDataGroupBy: ["id", "name", "mimeType", "source", "hash", "size", "content", "projectId", "createdAt", "updatedAt", "_count", "_avg", "_sum", "_min", "_max"],
    AggregateProject: ["_count", "_avg", "_sum", "_min", "_max"],
    ProjectGroupBy: ["id", "name", "tenantId", "createdAt", "updatedAt", "_count", "_avg", "_sum", "_min", "_max"],
    AggregateTenant: ["_count", "_avg", "_sum", "_min", "_max"],
    TenantGroupBy: ["id", "name", "createdAt", "updatedAt", "_count", "_avg", "_sum", "_min", "_max"],
    AggregateModel: ["_count", "_avg", "_sum", "_min", "_max"],
    ModelGroupBy: ["id", "name", "columnName", "source", "_count", "_avg", "_sum", "_min", "_max"],
    AffectedRowsOutput: ["count"],
    DocumentCountAggregate: ["id", "content", "metadata", "createdAt", "updatedAt", "_all"],
    DocumentMinAggregate: ["id", "content", "createdAt", "updatedAt"],
    DocumentMaxAggregate: ["id", "content", "createdAt", "updatedAt"],
    VectorStoreCountAggregate: ["id", "namespace", "content", "metadata", "createdAt", "_all"],
    VectorStoreMinAggregate: ["id", "namespace", "content", "createdAt"],
    VectorStoreMaxAggregate: ["id", "namespace", "content", "createdAt"],
    ChunkCountAggregate: ["id", "text", "hash", "selection", "fileId", "modelId", "_all"],
    ChunkAvgAggregate: ["id", "selection", "fileId", "modelId"],
    ChunkSumAggregate: ["id", "selection", "fileId", "modelId"],
    ChunkMinAggregate: ["id", "text", "hash", "selection", "fileId", "modelId"],
    ChunkMaxAggregate: ["id", "text", "hash", "selection", "fileId", "modelId"],
    FileDataCount: ["Chunk"],
    FileDataCountAggregate: ["id", "name", "mimeType", "source", "hash", "size", "content", "projectId", "createdAt", "updatedAt", "_all"],
    FileDataAvgAggregate: ["id", "size", "projectId"],
    FileDataSumAggregate: ["id", "size", "projectId"],
    FileDataMinAggregate: ["id", "name", "mimeType", "source", "hash", "size", "content", "projectId", "createdAt", "updatedAt"],
    FileDataMaxAggregate: ["id", "name", "mimeType", "source", "hash", "size", "content", "projectId", "createdAt", "updatedAt"],
    ProjectCount: ["files"],
    ProjectCountAggregate: ["id", "name", "tenantId", "createdAt", "updatedAt", "_all"],
    ProjectAvgAggregate: ["id", "tenantId"],
    ProjectSumAggregate: ["id", "tenantId"],
    ProjectMinAggregate: ["id", "name", "tenantId", "createdAt", "updatedAt"],
    ProjectMaxAggregate: ["id", "name", "tenantId", "createdAt", "updatedAt"],
    TenantCount: ["projects"],
    TenantCountAggregate: ["id", "name", "createdAt", "updatedAt", "_all"],
    TenantAvgAggregate: ["id"],
    TenantSumAggregate: ["id"],
    TenantMinAggregate: ["id", "name", "createdAt", "updatedAt"],
    TenantMaxAggregate: ["id", "name", "createdAt", "updatedAt"],
    ModelCount: ["chunks"],
    ModelCountAggregate: ["id", "name", "columnName", "source", "_all"],
    ModelAvgAggregate: ["id"],
    ModelSumAggregate: ["id"],
    ModelMinAggregate: ["id", "name", "columnName", "source"],
    ModelMaxAggregate: ["id", "name", "columnName", "source"],
    CreateManyAndReturnDocument: ["id", "content", "metadata", "createdAt", "updatedAt"],
    CreateManyAndReturnFileData: ["id", "name", "mimeType", "source", "hash", "size", "content", "projectId", "createdAt", "updatedAt", "project"],
    CreateManyAndReturnProject: ["id", "name", "tenantId", "createdAt", "updatedAt", "tenant"],
    CreateManyAndReturnTenant: ["id", "name", "createdAt", "updatedAt"],
    CreateManyAndReturnModel: ["id", "name", "columnName", "source"]
};
function applyOutputTypesEnhanceMap(outputTypesEnhanceMap) {
    for (const outputTypeEnhanceMapKey of Object.keys(outputTypesEnhanceMap)) {
        const outputTypeName = outputTypeEnhanceMapKey;
        const typeConfig = outputTypesEnhanceMap[outputTypeName];
        const typeClass = outputTypes[outputTypeName];
        const typeTarget = typeClass.prototype;
        applyTypeClassEnhanceConfig(typeConfig, typeClass, typeTarget, outputsInfo[outputTypeName]);
    }
}
const inputsInfo = {
    DocumentWhereInput: ["AND", "OR", "NOT", "id", "content", "metadata", "createdAt", "updatedAt"],
    DocumentOrderByWithRelationInput: ["id", "content", "metadata", "createdAt", "updatedAt"],
    DocumentWhereUniqueInput: ["id", "AND", "OR", "NOT", "content", "metadata", "createdAt", "updatedAt"],
    DocumentOrderByWithAggregationInput: ["id", "content", "metadata", "createdAt", "updatedAt", "_count", "_max", "_min"],
    DocumentScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "content", "metadata", "createdAt", "updatedAt"],
    VectorStoreWhereInput: ["AND", "OR", "NOT", "id", "namespace", "content", "metadata", "createdAt"],
    VectorStoreOrderByWithRelationInput: ["id", "namespace", "content", "metadata", "createdAt"],
    VectorStoreWhereUniqueInput: ["id", "AND", "OR", "NOT", "namespace", "content", "metadata", "createdAt"],
    VectorStoreOrderByWithAggregationInput: ["id", "namespace", "content", "metadata", "createdAt", "_count", "_max", "_min"],
    VectorStoreScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "namespace", "content", "metadata", "createdAt"],
    ChunkWhereInput: ["AND", "OR", "NOT", "id", "text", "hash", "selection", "fileId", "modelId", "file", "model"],
    ChunkOrderByWithRelationInput: ["id", "text", "hash", "selection", "fileId", "modelId", "file", "model"],
    ChunkWhereUniqueInput: ["id", "AND", "OR", "NOT", "text", "hash", "selection", "fileId", "modelId", "file", "model"],
    ChunkOrderByWithAggregationInput: ["id", "text", "hash", "selection", "fileId", "modelId", "_count", "_avg", "_max", "_min", "_sum"],
    ChunkScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "text", "hash", "selection", "fileId", "modelId"],
    FileDataWhereInput: ["AND", "OR", "NOT", "id", "name", "mimeType", "source", "hash", "size", "content", "projectId", "createdAt", "updatedAt", "project", "Chunk"],
    FileDataOrderByWithRelationInput: ["id", "name", "mimeType", "source", "hash", "size", "content", "projectId", "createdAt", "updatedAt", "project", "Chunk"],
    FileDataWhereUniqueInput: ["id", "name_projectId", "AND", "OR", "NOT", "name", "mimeType", "source", "hash", "size", "content", "projectId", "createdAt", "updatedAt", "project", "Chunk"],
    FileDataOrderByWithAggregationInput: ["id", "name", "mimeType", "source", "hash", "size", "content", "projectId", "createdAt", "updatedAt", "_count", "_avg", "_max", "_min", "_sum"],
    FileDataScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "name", "mimeType", "source", "hash", "size", "content", "projectId", "createdAt", "updatedAt"],
    ProjectWhereInput: ["AND", "OR", "NOT", "id", "name", "tenantId", "createdAt", "updatedAt", "tenant", "files"],
    ProjectOrderByWithRelationInput: ["id", "name", "tenantId", "createdAt", "updatedAt", "tenant", "files"],
    ProjectWhereUniqueInput: ["id", "name", "AND", "OR", "NOT", "tenantId", "createdAt", "updatedAt", "tenant", "files"],
    ProjectOrderByWithAggregationInput: ["id", "name", "tenantId", "createdAt", "updatedAt", "_count", "_avg", "_max", "_min", "_sum"],
    ProjectScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "name", "tenantId", "createdAt", "updatedAt"],
    TenantWhereInput: ["AND", "OR", "NOT", "id", "name", "createdAt", "updatedAt", "projects"],
    TenantOrderByWithRelationInput: ["id", "name", "createdAt", "updatedAt", "projects"],
    TenantWhereUniqueInput: ["id", "name", "AND", "OR", "NOT", "createdAt", "updatedAt", "projects"],
    TenantOrderByWithAggregationInput: ["id", "name", "createdAt", "updatedAt", "_count", "_avg", "_max", "_min", "_sum"],
    TenantScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "name", "createdAt", "updatedAt"],
    ModelWhereInput: ["AND", "OR", "NOT", "id", "name", "columnName", "source", "chunks"],
    ModelOrderByWithRelationInput: ["id", "name", "columnName", "source", "chunks"],
    ModelWhereUniqueInput: ["id", "name", "AND", "OR", "NOT", "columnName", "source", "chunks"],
    ModelOrderByWithAggregationInput: ["id", "name", "columnName", "source", "_count", "_avg", "_max", "_min", "_sum"],
    ModelScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "name", "columnName", "source"],
    DocumentCreateInput: ["id", "content", "metadata", "createdAt", "updatedAt"],
    DocumentUpdateInput: ["id", "content", "metadata", "createdAt", "updatedAt"],
    DocumentCreateManyInput: ["id", "content", "metadata", "createdAt", "updatedAt"],
    DocumentUpdateManyMutationInput: ["id", "content", "metadata", "createdAt", "updatedAt"],
    VectorStoreUpdateInput: ["id", "namespace", "content", "metadata", "createdAt"],
    VectorStoreUpdateManyMutationInput: ["id", "namespace", "content", "metadata", "createdAt"],
    ChunkUpdateInput: ["text", "hash", "selection", "file", "model"],
    ChunkUpdateManyMutationInput: ["text", "hash", "selection"],
    FileDataCreateInput: ["name", "mimeType", "source", "hash", "size", "content", "createdAt", "updatedAt", "project", "Chunk"],
    FileDataUpdateInput: ["name", "mimeType", "source", "hash", "size", "content", "createdAt", "updatedAt", "project", "Chunk"],
    FileDataCreateManyInput: ["id", "name", "mimeType", "source", "hash", "size", "content", "projectId", "createdAt", "updatedAt"],
    FileDataUpdateManyMutationInput: ["name", "mimeType", "source", "hash", "size", "content", "createdAt", "updatedAt"],
    ProjectCreateInput: ["name", "createdAt", "updatedAt", "tenant", "files"],
    ProjectUpdateInput: ["name", "createdAt", "updatedAt", "tenant", "files"],
    ProjectCreateManyInput: ["id", "name", "tenantId", "createdAt", "updatedAt"],
    ProjectUpdateManyMutationInput: ["name", "createdAt", "updatedAt"],
    TenantCreateInput: ["name", "createdAt", "updatedAt", "projects"],
    TenantUpdateInput: ["name", "createdAt", "updatedAt", "projects"],
    TenantCreateManyInput: ["id", "name", "createdAt", "updatedAt"],
    TenantUpdateManyMutationInput: ["name", "createdAt", "updatedAt"],
    ModelCreateInput: ["name", "columnName", "source", "chunks"],
    ModelUpdateInput: ["name", "columnName", "source", "chunks"],
    ModelCreateManyInput: ["id", "name", "columnName", "source"],
    ModelUpdateManyMutationInput: ["name", "columnName", "source"],
    StringFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "mode", "not"],
    JsonNullableFilter: ["equals", "path", "string_contains", "string_starts_with", "string_ends_with", "array_contains", "array_starts_with", "array_ends_with", "lt", "lte", "gt", "gte", "not"],
    DateTimeFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
    SortOrderInput: ["sort", "nulls"],
    DocumentCountOrderByAggregateInput: ["id", "content", "metadata", "createdAt", "updatedAt"],
    DocumentMaxOrderByAggregateInput: ["id", "content", "createdAt", "updatedAt"],
    DocumentMinOrderByAggregateInput: ["id", "content", "createdAt", "updatedAt"],
    StringWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "mode", "not", "_count", "_min", "_max"],
    JsonNullableWithAggregatesFilter: ["equals", "path", "string_contains", "string_starts_with", "string_ends_with", "array_contains", "array_starts_with", "array_ends_with", "lt", "lte", "gt", "gte", "not", "_count", "_min", "_max"],
    DateTimeWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_min", "_max"],
    VectorStoreCountOrderByAggregateInput: ["id", "namespace", "content", "metadata", "createdAt"],
    VectorStoreMaxOrderByAggregateInput: ["id", "namespace", "content", "createdAt"],
    VectorStoreMinOrderByAggregateInput: ["id", "namespace", "content", "createdAt"],
    IntFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
    IntNullableFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
    FileDataRelationFilter: ["is", "isNot"],
    ModelRelationFilter: ["is", "isNot"],
    ChunkCountOrderByAggregateInput: ["id", "text", "hash", "selection", "fileId", "modelId"],
    ChunkAvgOrderByAggregateInput: ["id", "selection", "fileId", "modelId"],
    ChunkMaxOrderByAggregateInput: ["id", "text", "hash", "selection", "fileId", "modelId"],
    ChunkMinOrderByAggregateInput: ["id", "text", "hash", "selection", "fileId", "modelId"],
    ChunkSumOrderByAggregateInput: ["id", "selection", "fileId", "modelId"],
    IntWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_avg", "_sum", "_min", "_max"],
    IntNullableWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_avg", "_sum", "_min", "_max"],
    StringNullableFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "mode", "not"],
    BytesNullableFilter: ["equals", "in", "notIn", "not"],
    ProjectRelationFilter: ["is", "isNot"],
    ChunkListRelationFilter: ["every", "some", "none"],
    ChunkOrderByRelationAggregateInput: ["_count"],
    FileDataNameProjectIdCompoundUniqueInput: ["name", "projectId"],
    FileDataCountOrderByAggregateInput: ["id", "name", "mimeType", "source", "hash", "size", "content", "projectId", "createdAt", "updatedAt"],
    FileDataAvgOrderByAggregateInput: ["id", "size", "projectId"],
    FileDataMaxOrderByAggregateInput: ["id", "name", "mimeType", "source", "hash", "size", "content", "projectId", "createdAt", "updatedAt"],
    FileDataMinOrderByAggregateInput: ["id", "name", "mimeType", "source", "hash", "size", "content", "projectId", "createdAt", "updatedAt"],
    FileDataSumOrderByAggregateInput: ["id", "size", "projectId"],
    StringNullableWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "mode", "not", "_count", "_min", "_max"],
    BytesNullableWithAggregatesFilter: ["equals", "in", "notIn", "not", "_count", "_min", "_max"],
    TenantRelationFilter: ["is", "isNot"],
    FileDataListRelationFilter: ["every", "some", "none"],
    FileDataOrderByRelationAggregateInput: ["_count"],
    ProjectCountOrderByAggregateInput: ["id", "name", "tenantId", "createdAt", "updatedAt"],
    ProjectAvgOrderByAggregateInput: ["id", "tenantId"],
    ProjectMaxOrderByAggregateInput: ["id", "name", "tenantId", "createdAt", "updatedAt"],
    ProjectMinOrderByAggregateInput: ["id", "name", "tenantId", "createdAt", "updatedAt"],
    ProjectSumOrderByAggregateInput: ["id", "tenantId"],
    ProjectListRelationFilter: ["every", "some", "none"],
    ProjectOrderByRelationAggregateInput: ["_count"],
    TenantCountOrderByAggregateInput: ["id", "name", "createdAt", "updatedAt"],
    TenantAvgOrderByAggregateInput: ["id"],
    TenantMaxOrderByAggregateInput: ["id", "name", "createdAt", "updatedAt"],
    TenantMinOrderByAggregateInput: ["id", "name", "createdAt", "updatedAt"],
    TenantSumOrderByAggregateInput: ["id"],
    ModelCountOrderByAggregateInput: ["id", "name", "columnName", "source"],
    ModelAvgOrderByAggregateInput: ["id"],
    ModelMaxOrderByAggregateInput: ["id", "name", "columnName", "source"],
    ModelMinOrderByAggregateInput: ["id", "name", "columnName", "source"],
    ModelSumOrderByAggregateInput: ["id"],
    StringFieldUpdateOperationsInput: ["set"],
    DateTimeFieldUpdateOperationsInput: ["set"],
    NullableIntFieldUpdateOperationsInput: ["set", "increment", "decrement", "multiply", "divide"],
    FileDataUpdateOneRequiredWithoutChunkNestedInput: ["create", "connectOrCreate", "upsert", "connect", "update"],
    ModelUpdateOneRequiredWithoutChunksNestedInput: ["create", "connectOrCreate", "upsert", "connect", "update"],
    IntFieldUpdateOperationsInput: ["set", "increment", "decrement", "multiply", "divide"],
    ProjectCreateNestedOneWithoutFilesInput: ["create", "connectOrCreate", "connect"],
    ChunkCreateNestedManyWithoutFileInput: ["connect"],
    NullableStringFieldUpdateOperationsInput: ["set"],
    NullableBytesFieldUpdateOperationsInput: ["set"],
    ProjectUpdateOneRequiredWithoutFilesNestedInput: ["create", "connectOrCreate", "upsert", "connect", "update"],
    ChunkUpdateManyWithoutFileNestedInput: ["set", "disconnect", "delete", "connect", "update", "updateMany", "deleteMany"],
    TenantCreateNestedOneWithoutProjectsInput: ["create", "connectOrCreate", "connect"],
    FileDataCreateNestedManyWithoutProjectInput: ["create", "connectOrCreate", "createMany", "connect"],
    TenantUpdateOneRequiredWithoutProjectsNestedInput: ["create", "connectOrCreate", "upsert", "connect", "update"],
    FileDataUpdateManyWithoutProjectNestedInput: ["create", "connectOrCreate", "upsert", "createMany", "set", "disconnect", "delete", "connect", "update", "updateMany", "deleteMany"],
    ProjectCreateNestedManyWithoutTenantInput: ["create", "connectOrCreate", "createMany", "connect"],
    ProjectUpdateManyWithoutTenantNestedInput: ["create", "connectOrCreate", "upsert", "createMany", "set", "disconnect", "delete", "connect", "update", "updateMany", "deleteMany"],
    ChunkCreateNestedManyWithoutModelInput: ["connect"],
    ChunkUpdateManyWithoutModelNestedInput: ["set", "disconnect", "delete", "connect", "update", "updateMany", "deleteMany"],
    NestedStringFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "not"],
    NestedDateTimeFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
    NestedStringWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "not", "_count", "_min", "_max"],
    NestedIntFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
    NestedIntNullableFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
    NestedJsonNullableFilter: ["equals", "path", "string_contains", "string_starts_with", "string_ends_with", "array_contains", "array_starts_with", "array_ends_with", "lt", "lte", "gt", "gte", "not"],
    NestedDateTimeWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_min", "_max"],
    NestedIntWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_avg", "_sum", "_min", "_max"],
    NestedFloatFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
    NestedIntNullableWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_avg", "_sum", "_min", "_max"],
    NestedFloatNullableFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
    NestedStringNullableFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "not"],
    NestedBytesNullableFilter: ["equals", "in", "notIn", "not"],
    NestedStringNullableWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "not", "_count", "_min", "_max"],
    NestedBytesNullableWithAggregatesFilter: ["equals", "in", "notIn", "not", "_count", "_min", "_max"],
    FileDataCreateWithoutChunkInput: ["name", "mimeType", "source", "hash", "size", "content", "createdAt", "updatedAt", "project"],
    FileDataCreateOrConnectWithoutChunkInput: ["where", "create"],
    FileDataUpsertWithoutChunkInput: ["update", "create", "where"],
    FileDataUpdateToOneWithWhereWithoutChunkInput: ["where", "data"],
    FileDataUpdateWithoutChunkInput: ["name", "mimeType", "source", "hash", "size", "content", "createdAt", "updatedAt", "project"],
    ModelCreateWithoutChunksInput: ["name", "columnName", "source"],
    ModelCreateOrConnectWithoutChunksInput: ["where", "create"],
    ModelUpsertWithoutChunksInput: ["update", "create", "where"],
    ModelUpdateToOneWithWhereWithoutChunksInput: ["where", "data"],
    ModelUpdateWithoutChunksInput: ["name", "columnName", "source"],
    ProjectCreateWithoutFilesInput: ["name", "createdAt", "updatedAt", "tenant"],
    ProjectCreateOrConnectWithoutFilesInput: ["where", "create"],
    ProjectUpsertWithoutFilesInput: ["update", "create", "where"],
    ProjectUpdateToOneWithWhereWithoutFilesInput: ["where", "data"],
    ProjectUpdateWithoutFilesInput: ["name", "createdAt", "updatedAt", "tenant"],
    ChunkUpdateWithWhereUniqueWithoutFileInput: ["where", "data"],
    ChunkUpdateManyWithWhereWithoutFileInput: ["where", "data"],
    ChunkScalarWhereInput: ["AND", "OR", "NOT", "id", "text", "hash", "selection", "fileId", "modelId"],
    TenantCreateWithoutProjectsInput: ["name", "createdAt", "updatedAt"],
    TenantCreateOrConnectWithoutProjectsInput: ["where", "create"],
    FileDataCreateWithoutProjectInput: ["name", "mimeType", "source", "hash", "size", "content", "createdAt", "updatedAt", "Chunk"],
    FileDataCreateOrConnectWithoutProjectInput: ["where", "create"],
    FileDataCreateManyProjectInputEnvelope: ["data", "skipDuplicates"],
    TenantUpsertWithoutProjectsInput: ["update", "create", "where"],
    TenantUpdateToOneWithWhereWithoutProjectsInput: ["where", "data"],
    TenantUpdateWithoutProjectsInput: ["name", "createdAt", "updatedAt"],
    FileDataUpsertWithWhereUniqueWithoutProjectInput: ["where", "update", "create"],
    FileDataUpdateWithWhereUniqueWithoutProjectInput: ["where", "data"],
    FileDataUpdateManyWithWhereWithoutProjectInput: ["where", "data"],
    FileDataScalarWhereInput: ["AND", "OR", "NOT", "id", "name", "mimeType", "source", "hash", "size", "content", "projectId", "createdAt", "updatedAt"],
    ProjectCreateWithoutTenantInput: ["name", "createdAt", "updatedAt", "files"],
    ProjectCreateOrConnectWithoutTenantInput: ["where", "create"],
    ProjectCreateManyTenantInputEnvelope: ["data", "skipDuplicates"],
    ProjectUpsertWithWhereUniqueWithoutTenantInput: ["where", "update", "create"],
    ProjectUpdateWithWhereUniqueWithoutTenantInput: ["where", "data"],
    ProjectUpdateManyWithWhereWithoutTenantInput: ["where", "data"],
    ProjectScalarWhereInput: ["AND", "OR", "NOT", "id", "name", "tenantId", "createdAt", "updatedAt"],
    ChunkUpdateWithWhereUniqueWithoutModelInput: ["where", "data"],
    ChunkUpdateManyWithWhereWithoutModelInput: ["where", "data"],
    ChunkUpdateWithoutFileInput: ["text", "hash", "selection", "model"],
    FileDataCreateManyProjectInput: ["id", "name", "mimeType", "source", "hash", "size", "content", "createdAt", "updatedAt"],
    FileDataUpdateWithoutProjectInput: ["name", "mimeType", "source", "hash", "size", "content", "createdAt", "updatedAt", "Chunk"],
    ProjectCreateManyTenantInput: ["id", "name", "createdAt", "updatedAt"],
    ProjectUpdateWithoutTenantInput: ["name", "createdAt", "updatedAt", "files"],
    ChunkUpdateWithoutModelInput: ["text", "hash", "selection", "file"]
};
function applyInputTypesEnhanceMap(inputTypesEnhanceMap) {
    for (const inputTypeEnhanceMapKey of Object.keys(inputTypesEnhanceMap)) {
        const inputTypeName = inputTypeEnhanceMapKey;
        const typeConfig = inputTypesEnhanceMap[inputTypeName];
        const typeClass = inputTypes[inputTypeName];
        const typeTarget = typeClass.prototype;
        applyTypeClassEnhanceConfig(typeConfig, typeClass, typeTarget, inputsInfo[inputTypeName]);
    }
}

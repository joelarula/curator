"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStoreCrudResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const AggregateVectorStoreArgs_1 = require("./args/AggregateVectorStoreArgs");
const DeleteManyVectorStoreArgs_1 = require("./args/DeleteManyVectorStoreArgs");
const DeleteOneVectorStoreArgs_1 = require("./args/DeleteOneVectorStoreArgs");
const FindFirstVectorStoreArgs_1 = require("./args/FindFirstVectorStoreArgs");
const FindFirstVectorStoreOrThrowArgs_1 = require("./args/FindFirstVectorStoreOrThrowArgs");
const FindManyVectorStoreArgs_1 = require("./args/FindManyVectorStoreArgs");
const FindUniqueVectorStoreArgs_1 = require("./args/FindUniqueVectorStoreArgs");
const FindUniqueVectorStoreOrThrowArgs_1 = require("./args/FindUniqueVectorStoreOrThrowArgs");
const GroupByVectorStoreArgs_1 = require("./args/GroupByVectorStoreArgs");
const UpdateManyVectorStoreArgs_1 = require("./args/UpdateManyVectorStoreArgs");
const UpdateOneVectorStoreArgs_1 = require("./args/UpdateOneVectorStoreArgs");
const helpers_1 = require("../../../helpers");
const VectorStore_1 = require("../../../models/VectorStore");
const AffectedRowsOutput_1 = require("../../outputs/AffectedRowsOutput");
const AggregateVectorStore_1 = require("../../outputs/AggregateVectorStore");
const VectorStoreGroupBy_1 = require("../../outputs/VectorStoreGroupBy");
let VectorStoreCrudResolver = class VectorStoreCrudResolver {
    async aggregateVectorStore(ctx, info, args) {
        return (0, helpers_1.getPrismaFromContext)(ctx).vectorStore.aggregate({
            ...args,
            ...(0, helpers_1.transformInfoIntoPrismaArgs)(info),
        });
    }
    async deleteManyVectorStore(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).vectorStore.deleteMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async deleteOneVectorStore(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).vectorStore.delete({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async findFirstVectorStore(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).vectorStore.findFirst({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async findFirstVectorStoreOrThrow(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).vectorStore.findFirstOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async vectorStores(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).vectorStore.findMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async vectorStore(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).vectorStore.findUnique({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async getVectorStore(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).vectorStore.findUniqueOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async groupByVectorStore(ctx, info, args) {
        const { _count, _avg, _sum, _min, _max } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).vectorStore.groupBy({
            ...args,
            ...Object.fromEntries(Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)),
        });
    }
    async updateManyVectorStore(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).vectorStore.updateMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async updateOneVectorStore(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).vectorStore.update({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.VectorStoreCrudResolver = VectorStoreCrudResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => AggregateVectorStore_1.AggregateVectorStore, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, AggregateVectorStoreArgs_1.AggregateVectorStoreArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], VectorStoreCrudResolver.prototype, "aggregateVectorStore", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteManyVectorStoreArgs_1.DeleteManyVectorStoreArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], VectorStoreCrudResolver.prototype, "deleteManyVectorStore", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => VectorStore_1.VectorStore, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteOneVectorStoreArgs_1.DeleteOneVectorStoreArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], VectorStoreCrudResolver.prototype, "deleteOneVectorStore", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => VectorStore_1.VectorStore, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindFirstVectorStoreArgs_1.FindFirstVectorStoreArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], VectorStoreCrudResolver.prototype, "findFirstVectorStore", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => VectorStore_1.VectorStore, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindFirstVectorStoreOrThrowArgs_1.FindFirstVectorStoreOrThrowArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], VectorStoreCrudResolver.prototype, "findFirstVectorStoreOrThrow", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [VectorStore_1.VectorStore], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindManyVectorStoreArgs_1.FindManyVectorStoreArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], VectorStoreCrudResolver.prototype, "vectorStores", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => VectorStore_1.VectorStore, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindUniqueVectorStoreArgs_1.FindUniqueVectorStoreArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], VectorStoreCrudResolver.prototype, "vectorStore", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => VectorStore_1.VectorStore, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindUniqueVectorStoreOrThrowArgs_1.FindUniqueVectorStoreOrThrowArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], VectorStoreCrudResolver.prototype, "getVectorStore", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [VectorStoreGroupBy_1.VectorStoreGroupBy], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, GroupByVectorStoreArgs_1.GroupByVectorStoreArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], VectorStoreCrudResolver.prototype, "groupByVectorStore", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpdateManyVectorStoreArgs_1.UpdateManyVectorStoreArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], VectorStoreCrudResolver.prototype, "updateManyVectorStore", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => VectorStore_1.VectorStore, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpdateOneVectorStoreArgs_1.UpdateOneVectorStoreArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], VectorStoreCrudResolver.prototype, "updateOneVectorStore", null);
exports.VectorStoreCrudResolver = VectorStoreCrudResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => VectorStore_1.VectorStore)
], VectorStoreCrudResolver);

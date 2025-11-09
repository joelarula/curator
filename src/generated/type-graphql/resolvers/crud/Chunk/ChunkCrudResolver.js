"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkCrudResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const AggregateChunkArgs_1 = require("./args/AggregateChunkArgs");
const DeleteManyChunkArgs_1 = require("./args/DeleteManyChunkArgs");
const DeleteOneChunkArgs_1 = require("./args/DeleteOneChunkArgs");
const FindFirstChunkArgs_1 = require("./args/FindFirstChunkArgs");
const FindFirstChunkOrThrowArgs_1 = require("./args/FindFirstChunkOrThrowArgs");
const FindManyChunkArgs_1 = require("./args/FindManyChunkArgs");
const FindUniqueChunkArgs_1 = require("./args/FindUniqueChunkArgs");
const FindUniqueChunkOrThrowArgs_1 = require("./args/FindUniqueChunkOrThrowArgs");
const GroupByChunkArgs_1 = require("./args/GroupByChunkArgs");
const UpdateManyChunkArgs_1 = require("./args/UpdateManyChunkArgs");
const UpdateOneChunkArgs_1 = require("./args/UpdateOneChunkArgs");
const helpers_1 = require("../../../helpers");
const Chunk_1 = require("../../../models/Chunk");
const AffectedRowsOutput_1 = require("../../outputs/AffectedRowsOutput");
const AggregateChunk_1 = require("../../outputs/AggregateChunk");
const ChunkGroupBy_1 = require("../../outputs/ChunkGroupBy");
let ChunkCrudResolver = class ChunkCrudResolver {
    async aggregateChunk(ctx, info, args) {
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.aggregate({
            ...args,
            ...(0, helpers_1.transformInfoIntoPrismaArgs)(info),
        });
    }
    async deleteManyChunk(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.deleteMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async deleteOneChunk(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.delete({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async findFirstChunk(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.findFirst({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async findFirstChunkOrThrow(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.findFirstOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async chunks(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.findMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async chunk(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.findUnique({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async getChunk(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.findUniqueOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async groupByChunk(ctx, info, args) {
        const { _count, _avg, _sum, _min, _max } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.groupBy({
            ...args,
            ...Object.fromEntries(Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)),
        });
    }
    async updateManyChunk(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.updateMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async updateOneChunk(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.update({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.ChunkCrudResolver = ChunkCrudResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => AggregateChunk_1.AggregateChunk, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, AggregateChunkArgs_1.AggregateChunkArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ChunkCrudResolver.prototype, "aggregateChunk", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteManyChunkArgs_1.DeleteManyChunkArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ChunkCrudResolver.prototype, "deleteManyChunk", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Chunk_1.Chunk, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteOneChunkArgs_1.DeleteOneChunkArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ChunkCrudResolver.prototype, "deleteOneChunk", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Chunk_1.Chunk, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindFirstChunkArgs_1.FindFirstChunkArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ChunkCrudResolver.prototype, "findFirstChunk", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Chunk_1.Chunk, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindFirstChunkOrThrowArgs_1.FindFirstChunkOrThrowArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ChunkCrudResolver.prototype, "findFirstChunkOrThrow", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [Chunk_1.Chunk], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindManyChunkArgs_1.FindManyChunkArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ChunkCrudResolver.prototype, "chunks", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Chunk_1.Chunk, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindUniqueChunkArgs_1.FindUniqueChunkArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ChunkCrudResolver.prototype, "chunk", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Chunk_1.Chunk, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindUniqueChunkOrThrowArgs_1.FindUniqueChunkOrThrowArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ChunkCrudResolver.prototype, "getChunk", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [ChunkGroupBy_1.ChunkGroupBy], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, GroupByChunkArgs_1.GroupByChunkArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ChunkCrudResolver.prototype, "groupByChunk", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpdateManyChunkArgs_1.UpdateManyChunkArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ChunkCrudResolver.prototype, "updateManyChunk", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Chunk_1.Chunk, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpdateOneChunkArgs_1.UpdateOneChunkArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ChunkCrudResolver.prototype, "updateOneChunk", null);
exports.ChunkCrudResolver = ChunkCrudResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Chunk_1.Chunk)
], ChunkCrudResolver);

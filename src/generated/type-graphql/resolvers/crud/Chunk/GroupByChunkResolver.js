"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupByChunkResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const GroupByChunkArgs_1 = require("./args/GroupByChunkArgs");
const Chunk_1 = require("../../../models/Chunk");
const ChunkGroupBy_1 = require("../../outputs/ChunkGroupBy");
const helpers_1 = require("../../../helpers");
let GroupByChunkResolver = class GroupByChunkResolver {
    async groupByChunk(ctx, info, args) {
        const { _count, _avg, _sum, _min, _max } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.groupBy({
            ...args,
            ...Object.fromEntries(Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)),
        });
    }
};
exports.GroupByChunkResolver = GroupByChunkResolver;
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
], GroupByChunkResolver.prototype, "groupByChunk", null);
exports.GroupByChunkResolver = GroupByChunkResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Chunk_1.Chunk)
], GroupByChunkResolver);

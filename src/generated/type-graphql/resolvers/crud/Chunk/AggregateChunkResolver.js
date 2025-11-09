"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AggregateChunkResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const AggregateChunkArgs_1 = require("./args/AggregateChunkArgs");
const Chunk_1 = require("../../../models/Chunk");
const AggregateChunk_1 = require("../../outputs/AggregateChunk");
const helpers_1 = require("../../../helpers");
let AggregateChunkResolver = class AggregateChunkResolver {
    async aggregateChunk(ctx, info, args) {
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.aggregate({
            ...args,
            ...(0, helpers_1.transformInfoIntoPrismaArgs)(info),
        });
    }
};
exports.AggregateChunkResolver = AggregateChunkResolver;
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
], AggregateChunkResolver.prototype, "aggregateChunk", null);
exports.AggregateChunkResolver = AggregateChunkResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Chunk_1.Chunk)
], AggregateChunkResolver);

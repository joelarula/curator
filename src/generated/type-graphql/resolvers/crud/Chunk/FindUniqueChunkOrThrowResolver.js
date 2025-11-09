"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindUniqueChunkOrThrowResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FindUniqueChunkOrThrowArgs_1 = require("./args/FindUniqueChunkOrThrowArgs");
const Chunk_1 = require("../../../models/Chunk");
const helpers_1 = require("../../../helpers");
let FindUniqueChunkOrThrowResolver = class FindUniqueChunkOrThrowResolver {
    async getChunk(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.findUniqueOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FindUniqueChunkOrThrowResolver = FindUniqueChunkOrThrowResolver;
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
], FindUniqueChunkOrThrowResolver.prototype, "getChunk", null);
exports.FindUniqueChunkOrThrowResolver = FindUniqueChunkOrThrowResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Chunk_1.Chunk)
], FindUniqueChunkOrThrowResolver);

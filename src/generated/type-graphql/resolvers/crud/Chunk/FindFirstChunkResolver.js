"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindFirstChunkResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FindFirstChunkArgs_1 = require("./args/FindFirstChunkArgs");
const Chunk_1 = require("../../../models/Chunk");
const helpers_1 = require("../../../helpers");
let FindFirstChunkResolver = class FindFirstChunkResolver {
    async findFirstChunk(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.findFirst({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FindFirstChunkResolver = FindFirstChunkResolver;
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
], FindFirstChunkResolver.prototype, "findFirstChunk", null);
exports.FindFirstChunkResolver = FindFirstChunkResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Chunk_1.Chunk)
], FindFirstChunkResolver);

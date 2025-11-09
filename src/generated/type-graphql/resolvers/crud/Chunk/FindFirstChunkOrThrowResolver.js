"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindFirstChunkOrThrowResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FindFirstChunkOrThrowArgs_1 = require("./args/FindFirstChunkOrThrowArgs");
const Chunk_1 = require("../../../models/Chunk");
const helpers_1 = require("../../../helpers");
let FindFirstChunkOrThrowResolver = class FindFirstChunkOrThrowResolver {
    async findFirstChunkOrThrow(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.findFirstOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FindFirstChunkOrThrowResolver = FindFirstChunkOrThrowResolver;
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
], FindFirstChunkOrThrowResolver.prototype, "findFirstChunkOrThrow", null);
exports.FindFirstChunkOrThrowResolver = FindFirstChunkOrThrowResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Chunk_1.Chunk)
], FindFirstChunkOrThrowResolver);

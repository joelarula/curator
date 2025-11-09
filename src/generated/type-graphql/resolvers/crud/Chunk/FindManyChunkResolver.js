"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindManyChunkResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FindManyChunkArgs_1 = require("./args/FindManyChunkArgs");
const Chunk_1 = require("../../../models/Chunk");
const helpers_1 = require("../../../helpers");
let FindManyChunkResolver = class FindManyChunkResolver {
    async chunks(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.findMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FindManyChunkResolver = FindManyChunkResolver;
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
], FindManyChunkResolver.prototype, "chunks", null);
exports.FindManyChunkResolver = FindManyChunkResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Chunk_1.Chunk)
], FindManyChunkResolver);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteOneChunkResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DeleteOneChunkArgs_1 = require("./args/DeleteOneChunkArgs");
const Chunk_1 = require("../../../models/Chunk");
const helpers_1 = require("../../../helpers");
let DeleteOneChunkResolver = class DeleteOneChunkResolver {
    async deleteOneChunk(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.delete({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.DeleteOneChunkResolver = DeleteOneChunkResolver;
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
], DeleteOneChunkResolver.prototype, "deleteOneChunk", null);
exports.DeleteOneChunkResolver = DeleteOneChunkResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Chunk_1.Chunk)
], DeleteOneChunkResolver);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateOneChunkResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const UpdateOneChunkArgs_1 = require("./args/UpdateOneChunkArgs");
const Chunk_1 = require("../../../models/Chunk");
const helpers_1 = require("../../../helpers");
let UpdateOneChunkResolver = class UpdateOneChunkResolver {
    async updateOneChunk(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.update({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.UpdateOneChunkResolver = UpdateOneChunkResolver;
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
], UpdateOneChunkResolver.prototype, "updateOneChunk", null);
exports.UpdateOneChunkResolver = UpdateOneChunkResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Chunk_1.Chunk)
], UpdateOneChunkResolver);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateManyChunkResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const UpdateManyChunkArgs_1 = require("./args/UpdateManyChunkArgs");
const Chunk_1 = require("../../../models/Chunk");
const AffectedRowsOutput_1 = require("../../outputs/AffectedRowsOutput");
const helpers_1 = require("../../../helpers");
let UpdateManyChunkResolver = class UpdateManyChunkResolver {
    async updateManyChunk(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.updateMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.UpdateManyChunkResolver = UpdateManyChunkResolver;
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
], UpdateManyChunkResolver.prototype, "updateManyChunk", null);
exports.UpdateManyChunkResolver = UpdateManyChunkResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Chunk_1.Chunk)
], UpdateManyChunkResolver);

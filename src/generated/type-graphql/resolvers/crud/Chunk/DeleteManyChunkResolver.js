"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteManyChunkResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DeleteManyChunkArgs_1 = require("./args/DeleteManyChunkArgs");
const Chunk_1 = require("../../../models/Chunk");
const AffectedRowsOutput_1 = require("../../outputs/AffectedRowsOutput");
const helpers_1 = require("../../../helpers");
let DeleteManyChunkResolver = class DeleteManyChunkResolver {
    async deleteManyChunk(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.deleteMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.DeleteManyChunkResolver = DeleteManyChunkResolver;
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
], DeleteManyChunkResolver.prototype, "deleteManyChunk", null);
exports.DeleteManyChunkResolver = DeleteManyChunkResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Chunk_1.Chunk)
], DeleteManyChunkResolver);

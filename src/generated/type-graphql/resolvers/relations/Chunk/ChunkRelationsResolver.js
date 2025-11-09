"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkRelationsResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const Chunk_1 = require("../../../models/Chunk");
const FileData_1 = require("../../../models/FileData");
const Model_1 = require("../../../models/Model");
const helpers_1 = require("../../../helpers");
let ChunkRelationsResolver = class ChunkRelationsResolver {
    async file(chunk, ctx, info) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.findUniqueOrThrow({
            where: {
                id: chunk.id,
            },
        }).file({
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async model(chunk, ctx, info) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).chunk.findUniqueOrThrow({
            where: {
                id: chunk.id,
            },
        }).model({
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.ChunkRelationsResolver = ChunkRelationsResolver;
tslib_1.__decorate([
    TypeGraphQL.FieldResolver(_type => FileData_1.FileData, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Root()),
    tslib_1.__param(1, TypeGraphQL.Ctx()),
    tslib_1.__param(2, TypeGraphQL.Info()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Chunk_1.Chunk, Object, Object]),
    tslib_1.__metadata("design:returntype", Promise)
], ChunkRelationsResolver.prototype, "file", null);
tslib_1.__decorate([
    TypeGraphQL.FieldResolver(_type => Model_1.Model, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Root()),
    tslib_1.__param(1, TypeGraphQL.Ctx()),
    tslib_1.__param(2, TypeGraphQL.Info()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Chunk_1.Chunk, Object, Object]),
    tslib_1.__metadata("design:returntype", Promise)
], ChunkRelationsResolver.prototype, "model", null);
exports.ChunkRelationsResolver = ChunkRelationsResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Chunk_1.Chunk)
], ChunkRelationsResolver);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataRelationsResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const Chunk_1 = require("../../../models/Chunk");
const FileData_1 = require("../../../models/FileData");
const Project_1 = require("../../../models/Project");
const FileDataChunkArgs_1 = require("./args/FileDataChunkArgs");
const helpers_1 = require("../../../helpers");
let FileDataRelationsResolver = class FileDataRelationsResolver {
    async project(fileData, ctx, info) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.findUniqueOrThrow({
            where: {
                id: fileData.id,
            },
        }).project({
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async Chunk(fileData, ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.findUniqueOrThrow({
            where: {
                id: fileData.id,
            },
        }).Chunk({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FileDataRelationsResolver = FileDataRelationsResolver;
tslib_1.__decorate([
    TypeGraphQL.FieldResolver(_type => Project_1.Project, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Root()),
    tslib_1.__param(1, TypeGraphQL.Ctx()),
    tslib_1.__param(2, TypeGraphQL.Info()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [FileData_1.FileData, Object, Object]),
    tslib_1.__metadata("design:returntype", Promise)
], FileDataRelationsResolver.prototype, "project", null);
tslib_1.__decorate([
    TypeGraphQL.FieldResolver(_type => [Chunk_1.Chunk], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Root()),
    tslib_1.__param(1, TypeGraphQL.Ctx()),
    tslib_1.__param(2, TypeGraphQL.Info()),
    tslib_1.__param(3, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [FileData_1.FileData, Object, Object, FileDataChunkArgs_1.FileDataChunkArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FileDataRelationsResolver.prototype, "Chunk", null);
exports.FileDataRelationsResolver = FileDataRelationsResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => FileData_1.FileData)
], FileDataRelationsResolver);

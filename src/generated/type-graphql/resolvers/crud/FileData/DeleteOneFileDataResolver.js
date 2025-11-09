"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteOneFileDataResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DeleteOneFileDataArgs_1 = require("./args/DeleteOneFileDataArgs");
const FileData_1 = require("../../../models/FileData");
const helpers_1 = require("../../../helpers");
let DeleteOneFileDataResolver = class DeleteOneFileDataResolver {
    async deleteOneFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.delete({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.DeleteOneFileDataResolver = DeleteOneFileDataResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => FileData_1.FileData, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteOneFileDataArgs_1.DeleteOneFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DeleteOneFileDataResolver.prototype, "deleteOneFileData", null);
exports.DeleteOneFileDataResolver = DeleteOneFileDataResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => FileData_1.FileData)
], DeleteOneFileDataResolver);

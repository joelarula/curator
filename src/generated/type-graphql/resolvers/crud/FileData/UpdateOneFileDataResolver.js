"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateOneFileDataResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const UpdateOneFileDataArgs_1 = require("./args/UpdateOneFileDataArgs");
const FileData_1 = require("../../../models/FileData");
const helpers_1 = require("../../../helpers");
let UpdateOneFileDataResolver = class UpdateOneFileDataResolver {
    async updateOneFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.update({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.UpdateOneFileDataResolver = UpdateOneFileDataResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => FileData_1.FileData, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpdateOneFileDataArgs_1.UpdateOneFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], UpdateOneFileDataResolver.prototype, "updateOneFileData", null);
exports.UpdateOneFileDataResolver = UpdateOneFileDataResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => FileData_1.FileData)
], UpdateOneFileDataResolver);

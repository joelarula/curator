"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteManyFileDataResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DeleteManyFileDataArgs_1 = require("./args/DeleteManyFileDataArgs");
const FileData_1 = require("../../../models/FileData");
const AffectedRowsOutput_1 = require("../../outputs/AffectedRowsOutput");
const helpers_1 = require("../../../helpers");
let DeleteManyFileDataResolver = class DeleteManyFileDataResolver {
    async deleteManyFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.deleteMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.DeleteManyFileDataResolver = DeleteManyFileDataResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteManyFileDataArgs_1.DeleteManyFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DeleteManyFileDataResolver.prototype, "deleteManyFileData", null);
exports.DeleteManyFileDataResolver = DeleteManyFileDataResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => FileData_1.FileData)
], DeleteManyFileDataResolver);

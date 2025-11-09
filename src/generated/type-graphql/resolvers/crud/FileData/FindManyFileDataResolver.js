"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindManyFileDataResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FindManyFileDataArgs_1 = require("./args/FindManyFileDataArgs");
const FileData_1 = require("../../../models/FileData");
const helpers_1 = require("../../../helpers");
let FindManyFileDataResolver = class FindManyFileDataResolver {
    async findManyFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.findMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FindManyFileDataResolver = FindManyFileDataResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [FileData_1.FileData], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindManyFileDataArgs_1.FindManyFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FindManyFileDataResolver.prototype, "findManyFileData", null);
exports.FindManyFileDataResolver = FindManyFileDataResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => FileData_1.FileData)
], FindManyFileDataResolver);

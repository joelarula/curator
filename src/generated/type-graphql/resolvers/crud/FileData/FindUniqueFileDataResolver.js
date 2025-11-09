"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindUniqueFileDataResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FindUniqueFileDataArgs_1 = require("./args/FindUniqueFileDataArgs");
const FileData_1 = require("../../../models/FileData");
const helpers_1 = require("../../../helpers");
let FindUniqueFileDataResolver = class FindUniqueFileDataResolver {
    async findUniqueFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.findUnique({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FindUniqueFileDataResolver = FindUniqueFileDataResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => FileData_1.FileData, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindUniqueFileDataArgs_1.FindUniqueFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FindUniqueFileDataResolver.prototype, "findUniqueFileData", null);
exports.FindUniqueFileDataResolver = FindUniqueFileDataResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => FileData_1.FileData)
], FindUniqueFileDataResolver);

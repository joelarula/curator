"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindFirstFileDataOrThrowResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FindFirstFileDataOrThrowArgs_1 = require("./args/FindFirstFileDataOrThrowArgs");
const FileData_1 = require("../../../models/FileData");
const helpers_1 = require("../../../helpers");
let FindFirstFileDataOrThrowResolver = class FindFirstFileDataOrThrowResolver {
    async findFirstFileDataOrThrow(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.findFirstOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FindFirstFileDataOrThrowResolver = FindFirstFileDataOrThrowResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => FileData_1.FileData, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindFirstFileDataOrThrowArgs_1.FindFirstFileDataOrThrowArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FindFirstFileDataOrThrowResolver.prototype, "findFirstFileDataOrThrow", null);
exports.FindFirstFileDataOrThrowResolver = FindFirstFileDataOrThrowResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => FileData_1.FileData)
], FindFirstFileDataOrThrowResolver);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpsertOneFileDataResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const UpsertOneFileDataArgs_1 = require("./args/UpsertOneFileDataArgs");
const FileData_1 = require("../../../models/FileData");
const helpers_1 = require("../../../helpers");
let UpsertOneFileDataResolver = class UpsertOneFileDataResolver {
    async upsertOneFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.upsert({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.UpsertOneFileDataResolver = UpsertOneFileDataResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => FileData_1.FileData, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpsertOneFileDataArgs_1.UpsertOneFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], UpsertOneFileDataResolver.prototype, "upsertOneFileData", null);
exports.UpsertOneFileDataResolver = UpsertOneFileDataResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => FileData_1.FileData)
], UpsertOneFileDataResolver);

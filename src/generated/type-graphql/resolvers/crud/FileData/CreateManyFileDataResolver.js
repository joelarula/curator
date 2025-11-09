"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateManyFileDataResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const CreateManyFileDataArgs_1 = require("./args/CreateManyFileDataArgs");
const FileData_1 = require("../../../models/FileData");
const AffectedRowsOutput_1 = require("../../outputs/AffectedRowsOutput");
const helpers_1 = require("../../../helpers");
let CreateManyFileDataResolver = class CreateManyFileDataResolver {
    async createManyFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.createMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.CreateManyFileDataResolver = CreateManyFileDataResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateManyFileDataArgs_1.CreateManyFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], CreateManyFileDataResolver.prototype, "createManyFileData", null);
exports.CreateManyFileDataResolver = CreateManyFileDataResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => FileData_1.FileData)
], CreateManyFileDataResolver);

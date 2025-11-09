"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateManyAndReturnFileDataResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const CreateManyAndReturnFileDataArgs_1 = require("./args/CreateManyAndReturnFileDataArgs");
const FileData_1 = require("../../../models/FileData");
const CreateManyAndReturnFileData_1 = require("../../outputs/CreateManyAndReturnFileData");
const helpers_1 = require("../../../helpers");
let CreateManyAndReturnFileDataResolver = class CreateManyAndReturnFileDataResolver {
    async createManyAndReturnFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.createManyAndReturn({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.CreateManyAndReturnFileDataResolver = CreateManyAndReturnFileDataResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => [CreateManyAndReturnFileData_1.CreateManyAndReturnFileData], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateManyAndReturnFileDataArgs_1.CreateManyAndReturnFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], CreateManyAndReturnFileDataResolver.prototype, "createManyAndReturnFileData", null);
exports.CreateManyAndReturnFileDataResolver = CreateManyAndReturnFileDataResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => FileData_1.FileData)
], CreateManyAndReturnFileDataResolver);

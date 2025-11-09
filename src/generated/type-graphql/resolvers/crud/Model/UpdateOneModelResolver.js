"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateOneModelResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const UpdateOneModelArgs_1 = require("./args/UpdateOneModelArgs");
const Model_1 = require("../../../models/Model");
const helpers_1 = require("../../../helpers");
let UpdateOneModelResolver = class UpdateOneModelResolver {
    async updateOneModel(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.update({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.UpdateOneModelResolver = UpdateOneModelResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Model_1.Model, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpdateOneModelArgs_1.UpdateOneModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], UpdateOneModelResolver.prototype, "updateOneModel", null);
exports.UpdateOneModelResolver = UpdateOneModelResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Model_1.Model)
], UpdateOneModelResolver);

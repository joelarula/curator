"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteOneModelResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DeleteOneModelArgs_1 = require("./args/DeleteOneModelArgs");
const Model_1 = require("../../../models/Model");
const helpers_1 = require("../../../helpers");
let DeleteOneModelResolver = class DeleteOneModelResolver {
    async deleteOneModel(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.delete({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.DeleteOneModelResolver = DeleteOneModelResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Model_1.Model, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteOneModelArgs_1.DeleteOneModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DeleteOneModelResolver.prototype, "deleteOneModel", null);
exports.DeleteOneModelResolver = DeleteOneModelResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Model_1.Model)
], DeleteOneModelResolver);

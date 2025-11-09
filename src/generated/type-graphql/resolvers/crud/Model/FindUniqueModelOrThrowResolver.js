"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindUniqueModelOrThrowResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FindUniqueModelOrThrowArgs_1 = require("./args/FindUniqueModelOrThrowArgs");
const Model_1 = require("../../../models/Model");
const helpers_1 = require("../../../helpers");
let FindUniqueModelOrThrowResolver = class FindUniqueModelOrThrowResolver {
    async getModel(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.findUniqueOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FindUniqueModelOrThrowResolver = FindUniqueModelOrThrowResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Model_1.Model, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindUniqueModelOrThrowArgs_1.FindUniqueModelOrThrowArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FindUniqueModelOrThrowResolver.prototype, "getModel", null);
exports.FindUniqueModelOrThrowResolver = FindUniqueModelOrThrowResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Model_1.Model)
], FindUniqueModelOrThrowResolver);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindUniqueModelResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FindUniqueModelArgs_1 = require("./args/FindUniqueModelArgs");
const Model_1 = require("../../../models/Model");
const helpers_1 = require("../../../helpers");
let FindUniqueModelResolver = class FindUniqueModelResolver {
    async model(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.findUnique({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FindUniqueModelResolver = FindUniqueModelResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Model_1.Model, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindUniqueModelArgs_1.FindUniqueModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FindUniqueModelResolver.prototype, "model", null);
exports.FindUniqueModelResolver = FindUniqueModelResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Model_1.Model)
], FindUniqueModelResolver);

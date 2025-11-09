"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindManyModelResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FindManyModelArgs_1 = require("./args/FindManyModelArgs");
const Model_1 = require("../../../models/Model");
const helpers_1 = require("../../../helpers");
let FindManyModelResolver = class FindManyModelResolver {
    async models(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.findMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FindManyModelResolver = FindManyModelResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [Model_1.Model], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindManyModelArgs_1.FindManyModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FindManyModelResolver.prototype, "models", null);
exports.FindManyModelResolver = FindManyModelResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Model_1.Model)
], FindManyModelResolver);

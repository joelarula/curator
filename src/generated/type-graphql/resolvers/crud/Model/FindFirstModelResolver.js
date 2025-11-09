"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindFirstModelResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FindFirstModelArgs_1 = require("./args/FindFirstModelArgs");
const Model_1 = require("../../../models/Model");
const helpers_1 = require("../../../helpers");
let FindFirstModelResolver = class FindFirstModelResolver {
    async findFirstModel(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.findFirst({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FindFirstModelResolver = FindFirstModelResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Model_1.Model, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindFirstModelArgs_1.FindFirstModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FindFirstModelResolver.prototype, "findFirstModel", null);
exports.FindFirstModelResolver = FindFirstModelResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Model_1.Model)
], FindFirstModelResolver);

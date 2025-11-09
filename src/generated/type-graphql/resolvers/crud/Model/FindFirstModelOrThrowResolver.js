"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindFirstModelOrThrowResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FindFirstModelOrThrowArgs_1 = require("./args/FindFirstModelOrThrowArgs");
const Model_1 = require("../../../models/Model");
const helpers_1 = require("../../../helpers");
let FindFirstModelOrThrowResolver = class FindFirstModelOrThrowResolver {
    async findFirstModelOrThrow(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.findFirstOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FindFirstModelOrThrowResolver = FindFirstModelOrThrowResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Model_1.Model, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindFirstModelOrThrowArgs_1.FindFirstModelOrThrowArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FindFirstModelOrThrowResolver.prototype, "findFirstModelOrThrow", null);
exports.FindFirstModelOrThrowResolver = FindFirstModelOrThrowResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Model_1.Model)
], FindFirstModelOrThrowResolver);

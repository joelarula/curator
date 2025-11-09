"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AggregateModelResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const AggregateModelArgs_1 = require("./args/AggregateModelArgs");
const Model_1 = require("../../../models/Model");
const AggregateModel_1 = require("../../outputs/AggregateModel");
const helpers_1 = require("../../../helpers");
let AggregateModelResolver = class AggregateModelResolver {
    async aggregateModel(ctx, info, args) {
        return (0, helpers_1.getPrismaFromContext)(ctx).model.aggregate({
            ...args,
            ...(0, helpers_1.transformInfoIntoPrismaArgs)(info),
        });
    }
};
exports.AggregateModelResolver = AggregateModelResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => AggregateModel_1.AggregateModel, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, AggregateModelArgs_1.AggregateModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], AggregateModelResolver.prototype, "aggregateModel", null);
exports.AggregateModelResolver = AggregateModelResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Model_1.Model)
], AggregateModelResolver);

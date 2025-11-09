"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupByModelResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const GroupByModelArgs_1 = require("./args/GroupByModelArgs");
const Model_1 = require("../../../models/Model");
const ModelGroupBy_1 = require("../../outputs/ModelGroupBy");
const helpers_1 = require("../../../helpers");
let GroupByModelResolver = class GroupByModelResolver {
    async groupByModel(ctx, info, args) {
        const { _count, _avg, _sum, _min, _max } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.groupBy({
            ...args,
            ...Object.fromEntries(Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)),
        });
    }
};
exports.GroupByModelResolver = GroupByModelResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [ModelGroupBy_1.ModelGroupBy], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, GroupByModelArgs_1.GroupByModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], GroupByModelResolver.prototype, "groupByModel", null);
exports.GroupByModelResolver = GroupByModelResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Model_1.Model)
], GroupByModelResolver);

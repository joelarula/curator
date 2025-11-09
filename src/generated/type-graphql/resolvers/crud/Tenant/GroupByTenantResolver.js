"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupByTenantResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const GroupByTenantArgs_1 = require("./args/GroupByTenantArgs");
const Tenant_1 = require("../../../models/Tenant");
const TenantGroupBy_1 = require("../../outputs/TenantGroupBy");
const helpers_1 = require("../../../helpers");
let GroupByTenantResolver = class GroupByTenantResolver {
    async groupByTenant(ctx, info, args) {
        const { _count, _avg, _sum, _min, _max } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.groupBy({
            ...args,
            ...Object.fromEntries(Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)),
        });
    }
};
exports.GroupByTenantResolver = GroupByTenantResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [TenantGroupBy_1.TenantGroupBy], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, GroupByTenantArgs_1.GroupByTenantArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], GroupByTenantResolver.prototype, "groupByTenant", null);
exports.GroupByTenantResolver = GroupByTenantResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Tenant_1.Tenant)
], GroupByTenantResolver);

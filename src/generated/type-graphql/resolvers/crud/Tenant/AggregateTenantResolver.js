"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AggregateTenantResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const AggregateTenantArgs_1 = require("./args/AggregateTenantArgs");
const Tenant_1 = require("../../../models/Tenant");
const AggregateTenant_1 = require("../../outputs/AggregateTenant");
const helpers_1 = require("../../../helpers");
let AggregateTenantResolver = class AggregateTenantResolver {
    async aggregateTenant(ctx, info, args) {
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.aggregate({
            ...args,
            ...(0, helpers_1.transformInfoIntoPrismaArgs)(info),
        });
    }
};
exports.AggregateTenantResolver = AggregateTenantResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => AggregateTenant_1.AggregateTenant, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, AggregateTenantArgs_1.AggregateTenantArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], AggregateTenantResolver.prototype, "aggregateTenant", null);
exports.AggregateTenantResolver = AggregateTenantResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Tenant_1.Tenant)
], AggregateTenantResolver);

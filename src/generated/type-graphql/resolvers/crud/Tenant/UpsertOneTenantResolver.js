"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpsertOneTenantResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const UpsertOneTenantArgs_1 = require("./args/UpsertOneTenantArgs");
const Tenant_1 = require("../../../models/Tenant");
const helpers_1 = require("../../../helpers");
let UpsertOneTenantResolver = class UpsertOneTenantResolver {
    async upsertOneTenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.upsert({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.UpsertOneTenantResolver = UpsertOneTenantResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Tenant_1.Tenant, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpsertOneTenantArgs_1.UpsertOneTenantArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], UpsertOneTenantResolver.prototype, "upsertOneTenant", null);
exports.UpsertOneTenantResolver = UpsertOneTenantResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Tenant_1.Tenant)
], UpsertOneTenantResolver);

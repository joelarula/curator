"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateOneTenantResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const UpdateOneTenantArgs_1 = require("./args/UpdateOneTenantArgs");
const Tenant_1 = require("../../../models/Tenant");
const helpers_1 = require("../../../helpers");
let UpdateOneTenantResolver = class UpdateOneTenantResolver {
    async updateOneTenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.update({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.UpdateOneTenantResolver = UpdateOneTenantResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Tenant_1.Tenant, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpdateOneTenantArgs_1.UpdateOneTenantArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], UpdateOneTenantResolver.prototype, "updateOneTenant", null);
exports.UpdateOneTenantResolver = UpdateOneTenantResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Tenant_1.Tenant)
], UpdateOneTenantResolver);

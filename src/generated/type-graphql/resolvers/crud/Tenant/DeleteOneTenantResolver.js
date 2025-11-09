"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteOneTenantResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DeleteOneTenantArgs_1 = require("./args/DeleteOneTenantArgs");
const Tenant_1 = require("../../../models/Tenant");
const helpers_1 = require("../../../helpers");
let DeleteOneTenantResolver = class DeleteOneTenantResolver {
    async deleteOneTenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.delete({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.DeleteOneTenantResolver = DeleteOneTenantResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Tenant_1.Tenant, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteOneTenantArgs_1.DeleteOneTenantArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DeleteOneTenantResolver.prototype, "deleteOneTenant", null);
exports.DeleteOneTenantResolver = DeleteOneTenantResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Tenant_1.Tenant)
], DeleteOneTenantResolver);

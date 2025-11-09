"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateManyTenantResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const UpdateManyTenantArgs_1 = require("./args/UpdateManyTenantArgs");
const Tenant_1 = require("../../../models/Tenant");
const AffectedRowsOutput_1 = require("../../outputs/AffectedRowsOutput");
const helpers_1 = require("../../../helpers");
let UpdateManyTenantResolver = class UpdateManyTenantResolver {
    async updateManyTenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.updateMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.UpdateManyTenantResolver = UpdateManyTenantResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpdateManyTenantArgs_1.UpdateManyTenantArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], UpdateManyTenantResolver.prototype, "updateManyTenant", null);
exports.UpdateManyTenantResolver = UpdateManyTenantResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Tenant_1.Tenant)
], UpdateManyTenantResolver);

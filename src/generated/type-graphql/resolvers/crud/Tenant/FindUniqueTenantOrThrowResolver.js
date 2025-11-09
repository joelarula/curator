"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindUniqueTenantOrThrowResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FindUniqueTenantOrThrowArgs_1 = require("./args/FindUniqueTenantOrThrowArgs");
const Tenant_1 = require("../../../models/Tenant");
const helpers_1 = require("../../../helpers");
let FindUniqueTenantOrThrowResolver = class FindUniqueTenantOrThrowResolver {
    async getTenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.findUniqueOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FindUniqueTenantOrThrowResolver = FindUniqueTenantOrThrowResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Tenant_1.Tenant, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindUniqueTenantOrThrowArgs_1.FindUniqueTenantOrThrowArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FindUniqueTenantOrThrowResolver.prototype, "getTenant", null);
exports.FindUniqueTenantOrThrowResolver = FindUniqueTenantOrThrowResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Tenant_1.Tenant)
], FindUniqueTenantOrThrowResolver);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantRelationsResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const Project_1 = require("../../../models/Project");
const Tenant_1 = require("../../../models/Tenant");
const TenantProjectsArgs_1 = require("./args/TenantProjectsArgs");
const helpers_1 = require("../../../helpers");
let TenantRelationsResolver = class TenantRelationsResolver {
    async projects(tenant, ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.findUniqueOrThrow({
            where: {
                id: tenant.id,
            },
        }).projects({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.TenantRelationsResolver = TenantRelationsResolver;
tslib_1.__decorate([
    TypeGraphQL.FieldResolver(_type => [Project_1.Project], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Root()),
    tslib_1.__param(1, TypeGraphQL.Ctx()),
    tslib_1.__param(2, TypeGraphQL.Info()),
    tslib_1.__param(3, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Tenant_1.Tenant, Object, Object, TenantProjectsArgs_1.TenantProjectsArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], TenantRelationsResolver.prototype, "projects", null);
exports.TenantRelationsResolver = TenantRelationsResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Tenant_1.Tenant)
], TenantRelationsResolver);

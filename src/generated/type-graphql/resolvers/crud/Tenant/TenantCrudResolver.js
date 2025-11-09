"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantCrudResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const AggregateTenantArgs_1 = require("./args/AggregateTenantArgs");
const CreateManyAndReturnTenantArgs_1 = require("./args/CreateManyAndReturnTenantArgs");
const CreateManyTenantArgs_1 = require("./args/CreateManyTenantArgs");
const CreateOneTenantArgs_1 = require("./args/CreateOneTenantArgs");
const DeleteManyTenantArgs_1 = require("./args/DeleteManyTenantArgs");
const DeleteOneTenantArgs_1 = require("./args/DeleteOneTenantArgs");
const FindFirstTenantArgs_1 = require("./args/FindFirstTenantArgs");
const FindFirstTenantOrThrowArgs_1 = require("./args/FindFirstTenantOrThrowArgs");
const FindManyTenantArgs_1 = require("./args/FindManyTenantArgs");
const FindUniqueTenantArgs_1 = require("./args/FindUniqueTenantArgs");
const FindUniqueTenantOrThrowArgs_1 = require("./args/FindUniqueTenantOrThrowArgs");
const GroupByTenantArgs_1 = require("./args/GroupByTenantArgs");
const UpdateManyTenantArgs_1 = require("./args/UpdateManyTenantArgs");
const UpdateOneTenantArgs_1 = require("./args/UpdateOneTenantArgs");
const UpsertOneTenantArgs_1 = require("./args/UpsertOneTenantArgs");
const helpers_1 = require("../../../helpers");
const Tenant_1 = require("../../../models/Tenant");
const AffectedRowsOutput_1 = require("../../outputs/AffectedRowsOutput");
const AggregateTenant_1 = require("../../outputs/AggregateTenant");
const CreateManyAndReturnTenant_1 = require("../../outputs/CreateManyAndReturnTenant");
const TenantGroupBy_1 = require("../../outputs/TenantGroupBy");
let TenantCrudResolver = class TenantCrudResolver {
    async aggregateTenant(ctx, info, args) {
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.aggregate({
            ...args,
            ...(0, helpers_1.transformInfoIntoPrismaArgs)(info),
        });
    }
    async createManyTenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.createMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async createManyAndReturnTenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.createManyAndReturn({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async createOneTenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.create({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async deleteManyTenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.deleteMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async deleteOneTenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.delete({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async findFirstTenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.findFirst({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async findFirstTenantOrThrow(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.findFirstOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async tenants(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.findMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async tenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.findUnique({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async getTenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.findUniqueOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async groupByTenant(ctx, info, args) {
        const { _count, _avg, _sum, _min, _max } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.groupBy({
            ...args,
            ...Object.fromEntries(Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)),
        });
    }
    async updateManyTenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.updateMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async updateOneTenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.update({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async upsertOneTenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.upsert({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.TenantCrudResolver = TenantCrudResolver;
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
], TenantCrudResolver.prototype, "aggregateTenant", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateManyTenantArgs_1.CreateManyTenantArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], TenantCrudResolver.prototype, "createManyTenant", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => [CreateManyAndReturnTenant_1.CreateManyAndReturnTenant], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateManyAndReturnTenantArgs_1.CreateManyAndReturnTenantArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], TenantCrudResolver.prototype, "createManyAndReturnTenant", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Tenant_1.Tenant, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateOneTenantArgs_1.CreateOneTenantArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], TenantCrudResolver.prototype, "createOneTenant", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteManyTenantArgs_1.DeleteManyTenantArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], TenantCrudResolver.prototype, "deleteManyTenant", null);
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
], TenantCrudResolver.prototype, "deleteOneTenant", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Tenant_1.Tenant, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindFirstTenantArgs_1.FindFirstTenantArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], TenantCrudResolver.prototype, "findFirstTenant", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Tenant_1.Tenant, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindFirstTenantOrThrowArgs_1.FindFirstTenantOrThrowArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], TenantCrudResolver.prototype, "findFirstTenantOrThrow", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [Tenant_1.Tenant], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindManyTenantArgs_1.FindManyTenantArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], TenantCrudResolver.prototype, "tenants", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Tenant_1.Tenant, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindUniqueTenantArgs_1.FindUniqueTenantArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], TenantCrudResolver.prototype, "tenant", null);
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
], TenantCrudResolver.prototype, "getTenant", null);
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
], TenantCrudResolver.prototype, "groupByTenant", null);
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
], TenantCrudResolver.prototype, "updateManyTenant", null);
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
], TenantCrudResolver.prototype, "updateOneTenant", null);
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
], TenantCrudResolver.prototype, "upsertOneTenant", null);
exports.TenantCrudResolver = TenantCrudResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Tenant_1.Tenant)
], TenantCrudResolver);

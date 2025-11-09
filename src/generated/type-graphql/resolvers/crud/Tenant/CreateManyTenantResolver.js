"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateManyTenantResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const CreateManyTenantArgs_1 = require("./args/CreateManyTenantArgs");
const Tenant_1 = require("../../../models/Tenant");
const AffectedRowsOutput_1 = require("../../outputs/AffectedRowsOutput");
const helpers_1 = require("../../../helpers");
let CreateManyTenantResolver = class CreateManyTenantResolver {
    async createManyTenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.createMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.CreateManyTenantResolver = CreateManyTenantResolver;
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
], CreateManyTenantResolver.prototype, "createManyTenant", null);
exports.CreateManyTenantResolver = CreateManyTenantResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Tenant_1.Tenant)
], CreateManyTenantResolver);

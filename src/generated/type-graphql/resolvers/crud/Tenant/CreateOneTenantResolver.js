"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateOneTenantResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const CreateOneTenantArgs_1 = require("./args/CreateOneTenantArgs");
const Tenant_1 = require("../../../models/Tenant");
const helpers_1 = require("../../../helpers");
let CreateOneTenantResolver = class CreateOneTenantResolver {
    async createOneTenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.create({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.CreateOneTenantResolver = CreateOneTenantResolver;
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
], CreateOneTenantResolver.prototype, "createOneTenant", null);
exports.CreateOneTenantResolver = CreateOneTenantResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Tenant_1.Tenant)
], CreateOneTenantResolver);

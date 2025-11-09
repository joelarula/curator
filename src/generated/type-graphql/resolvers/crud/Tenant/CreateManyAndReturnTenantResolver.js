"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateManyAndReturnTenantResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const CreateManyAndReturnTenantArgs_1 = require("./args/CreateManyAndReturnTenantArgs");
const Tenant_1 = require("../../../models/Tenant");
const CreateManyAndReturnTenant_1 = require("../../outputs/CreateManyAndReturnTenant");
const helpers_1 = require("../../../helpers");
let CreateManyAndReturnTenantResolver = class CreateManyAndReturnTenantResolver {
    async createManyAndReturnTenant(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).tenant.createManyAndReturn({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.CreateManyAndReturnTenantResolver = CreateManyAndReturnTenantResolver;
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
], CreateManyAndReturnTenantResolver.prototype, "createManyAndReturnTenant", null);
exports.CreateManyAndReturnTenantResolver = CreateManyAndReturnTenantResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Tenant_1.Tenant)
], CreateManyAndReturnTenantResolver);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateManyTenantArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const TenantUpdateManyMutationInput_1 = require("../../../inputs/TenantUpdateManyMutationInput");
const TenantWhereInput_1 = require("../../../inputs/TenantWhereInput");
let UpdateManyTenantArgs = class UpdateManyTenantArgs {
};
exports.UpdateManyTenantArgs = UpdateManyTenantArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantUpdateManyMutationInput_1.TenantUpdateManyMutationInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", TenantUpdateManyMutationInput_1.TenantUpdateManyMutationInput)
], UpdateManyTenantArgs.prototype, "data", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantWhereInput_1.TenantWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantWhereInput_1.TenantWhereInput)
], UpdateManyTenantArgs.prototype, "where", void 0);
exports.UpdateManyTenantArgs = UpdateManyTenantArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], UpdateManyTenantArgs);

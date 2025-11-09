"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpsertOneTenantArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const TenantCreateInput_1 = require("../../../inputs/TenantCreateInput");
const TenantUpdateInput_1 = require("../../../inputs/TenantUpdateInput");
const TenantWhereUniqueInput_1 = require("../../../inputs/TenantWhereUniqueInput");
let UpsertOneTenantArgs = class UpsertOneTenantArgs {
};
exports.UpsertOneTenantArgs = UpsertOneTenantArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantWhereUniqueInput_1.TenantWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", TenantWhereUniqueInput_1.TenantWhereUniqueInput)
], UpsertOneTenantArgs.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantCreateInput_1.TenantCreateInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", TenantCreateInput_1.TenantCreateInput)
], UpsertOneTenantArgs.prototype, "create", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantUpdateInput_1.TenantUpdateInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", TenantUpdateInput_1.TenantUpdateInput)
], UpsertOneTenantArgs.prototype, "update", void 0);
exports.UpsertOneTenantArgs = UpsertOneTenantArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], UpsertOneTenantArgs);

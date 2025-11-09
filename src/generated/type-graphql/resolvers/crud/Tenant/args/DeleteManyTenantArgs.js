"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteManyTenantArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const TenantWhereInput_1 = require("../../../inputs/TenantWhereInput");
let DeleteManyTenantArgs = class DeleteManyTenantArgs {
};
exports.DeleteManyTenantArgs = DeleteManyTenantArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantWhereInput_1.TenantWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantWhereInput_1.TenantWhereInput)
], DeleteManyTenantArgs.prototype, "where", void 0);
exports.DeleteManyTenantArgs = DeleteManyTenantArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], DeleteManyTenantArgs);

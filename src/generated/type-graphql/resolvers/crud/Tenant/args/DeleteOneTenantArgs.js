"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteOneTenantArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const TenantWhereUniqueInput_1 = require("../../../inputs/TenantWhereUniqueInput");
let DeleteOneTenantArgs = class DeleteOneTenantArgs {
};
exports.DeleteOneTenantArgs = DeleteOneTenantArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantWhereUniqueInput_1.TenantWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", TenantWhereUniqueInput_1.TenantWhereUniqueInput)
], DeleteOneTenantArgs.prototype, "where", void 0);
exports.DeleteOneTenantArgs = DeleteOneTenantArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], DeleteOneTenantArgs);

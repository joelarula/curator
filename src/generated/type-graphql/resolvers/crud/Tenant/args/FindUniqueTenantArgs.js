"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindUniqueTenantArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const TenantWhereUniqueInput_1 = require("../../../inputs/TenantWhereUniqueInput");
let FindUniqueTenantArgs = class FindUniqueTenantArgs {
};
exports.FindUniqueTenantArgs = FindUniqueTenantArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantWhereUniqueInput_1.TenantWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", TenantWhereUniqueInput_1.TenantWhereUniqueInput)
], FindUniqueTenantArgs.prototype, "where", void 0);
exports.FindUniqueTenantArgs = FindUniqueTenantArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], FindUniqueTenantArgs);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateOneTenantArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const TenantCreateInput_1 = require("../../../inputs/TenantCreateInput");
let CreateOneTenantArgs = class CreateOneTenantArgs {
};
exports.CreateOneTenantArgs = CreateOneTenantArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantCreateInput_1.TenantCreateInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", TenantCreateInput_1.TenantCreateInput)
], CreateOneTenantArgs.prototype, "data", void 0);
exports.CreateOneTenantArgs = CreateOneTenantArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], CreateOneTenantArgs);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantCreateOrConnectWithoutProjectsInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const TenantCreateWithoutProjectsInput_1 = require("../inputs/TenantCreateWithoutProjectsInput");
const TenantWhereUniqueInput_1 = require("../inputs/TenantWhereUniqueInput");
let TenantCreateOrConnectWithoutProjectsInput = class TenantCreateOrConnectWithoutProjectsInput {
};
exports.TenantCreateOrConnectWithoutProjectsInput = TenantCreateOrConnectWithoutProjectsInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantWhereUniqueInput_1.TenantWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", TenantWhereUniqueInput_1.TenantWhereUniqueInput)
], TenantCreateOrConnectWithoutProjectsInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantCreateWithoutProjectsInput_1.TenantCreateWithoutProjectsInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", TenantCreateWithoutProjectsInput_1.TenantCreateWithoutProjectsInput)
], TenantCreateOrConnectWithoutProjectsInput.prototype, "create", void 0);
exports.TenantCreateOrConnectWithoutProjectsInput = TenantCreateOrConnectWithoutProjectsInput = tslib_1.__decorate([
    TypeGraphQL.InputType("TenantCreateOrConnectWithoutProjectsInput", {})
], TenantCreateOrConnectWithoutProjectsInput);

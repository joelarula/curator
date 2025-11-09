"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantCreateNestedOneWithoutProjectsInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const TenantCreateOrConnectWithoutProjectsInput_1 = require("../inputs/TenantCreateOrConnectWithoutProjectsInput");
const TenantCreateWithoutProjectsInput_1 = require("../inputs/TenantCreateWithoutProjectsInput");
const TenantWhereUniqueInput_1 = require("../inputs/TenantWhereUniqueInput");
let TenantCreateNestedOneWithoutProjectsInput = class TenantCreateNestedOneWithoutProjectsInput {
};
exports.TenantCreateNestedOneWithoutProjectsInput = TenantCreateNestedOneWithoutProjectsInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantCreateWithoutProjectsInput_1.TenantCreateWithoutProjectsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantCreateWithoutProjectsInput_1.TenantCreateWithoutProjectsInput)
], TenantCreateNestedOneWithoutProjectsInput.prototype, "create", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantCreateOrConnectWithoutProjectsInput_1.TenantCreateOrConnectWithoutProjectsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantCreateOrConnectWithoutProjectsInput_1.TenantCreateOrConnectWithoutProjectsInput)
], TenantCreateNestedOneWithoutProjectsInput.prototype, "connectOrCreate", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantWhereUniqueInput_1.TenantWhereUniqueInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantWhereUniqueInput_1.TenantWhereUniqueInput)
], TenantCreateNestedOneWithoutProjectsInput.prototype, "connect", void 0);
exports.TenantCreateNestedOneWithoutProjectsInput = TenantCreateNestedOneWithoutProjectsInput = tslib_1.__decorate([
    TypeGraphQL.InputType("TenantCreateNestedOneWithoutProjectsInput", {})
], TenantCreateNestedOneWithoutProjectsInput);

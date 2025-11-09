"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantUpdateToOneWithWhereWithoutProjectsInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const TenantUpdateWithoutProjectsInput_1 = require("../inputs/TenantUpdateWithoutProjectsInput");
const TenantWhereInput_1 = require("../inputs/TenantWhereInput");
let TenantUpdateToOneWithWhereWithoutProjectsInput = class TenantUpdateToOneWithWhereWithoutProjectsInput {
};
exports.TenantUpdateToOneWithWhereWithoutProjectsInput = TenantUpdateToOneWithWhereWithoutProjectsInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantWhereInput_1.TenantWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantWhereInput_1.TenantWhereInput)
], TenantUpdateToOneWithWhereWithoutProjectsInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantUpdateWithoutProjectsInput_1.TenantUpdateWithoutProjectsInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", TenantUpdateWithoutProjectsInput_1.TenantUpdateWithoutProjectsInput)
], TenantUpdateToOneWithWhereWithoutProjectsInput.prototype, "data", void 0);
exports.TenantUpdateToOneWithWhereWithoutProjectsInput = TenantUpdateToOneWithWhereWithoutProjectsInput = tslib_1.__decorate([
    TypeGraphQL.InputType("TenantUpdateToOneWithWhereWithoutProjectsInput", {})
], TenantUpdateToOneWithWhereWithoutProjectsInput);

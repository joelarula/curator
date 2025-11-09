"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantUpdateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DateTimeFieldUpdateOperationsInput_1 = require("../inputs/DateTimeFieldUpdateOperationsInput");
const ProjectUpdateManyWithoutTenantNestedInput_1 = require("../inputs/ProjectUpdateManyWithoutTenantNestedInput");
const StringFieldUpdateOperationsInput_1 = require("../inputs/StringFieldUpdateOperationsInput");
let TenantUpdateInput = class TenantUpdateInput {
};
exports.TenantUpdateInput = TenantUpdateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], TenantUpdateInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput)
], TenantUpdateInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput)
], TenantUpdateInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectUpdateManyWithoutTenantNestedInput_1.ProjectUpdateManyWithoutTenantNestedInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectUpdateManyWithoutTenantNestedInput_1.ProjectUpdateManyWithoutTenantNestedInput)
], TenantUpdateInput.prototype, "projects", void 0);
exports.TenantUpdateInput = TenantUpdateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("TenantUpdateInput", {})
], TenantUpdateInput);

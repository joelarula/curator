"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectUpdateWithoutFilesInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DateTimeFieldUpdateOperationsInput_1 = require("../inputs/DateTimeFieldUpdateOperationsInput");
const StringFieldUpdateOperationsInput_1 = require("../inputs/StringFieldUpdateOperationsInput");
const TenantUpdateOneRequiredWithoutProjectsNestedInput_1 = require("../inputs/TenantUpdateOneRequiredWithoutProjectsNestedInput");
let ProjectUpdateWithoutFilesInput = class ProjectUpdateWithoutFilesInput {
};
exports.ProjectUpdateWithoutFilesInput = ProjectUpdateWithoutFilesInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], ProjectUpdateWithoutFilesInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput)
], ProjectUpdateWithoutFilesInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput)
], ProjectUpdateWithoutFilesInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantUpdateOneRequiredWithoutProjectsNestedInput_1.TenantUpdateOneRequiredWithoutProjectsNestedInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantUpdateOneRequiredWithoutProjectsNestedInput_1.TenantUpdateOneRequiredWithoutProjectsNestedInput)
], ProjectUpdateWithoutFilesInput.prototype, "tenant", void 0);
exports.ProjectUpdateWithoutFilesInput = ProjectUpdateWithoutFilesInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectUpdateWithoutFilesInput", {})
], ProjectUpdateWithoutFilesInput);

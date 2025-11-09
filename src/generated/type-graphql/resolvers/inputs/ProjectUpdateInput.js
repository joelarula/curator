"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectUpdateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DateTimeFieldUpdateOperationsInput_1 = require("../inputs/DateTimeFieldUpdateOperationsInput");
const FileDataUpdateManyWithoutProjectNestedInput_1 = require("../inputs/FileDataUpdateManyWithoutProjectNestedInput");
const StringFieldUpdateOperationsInput_1 = require("../inputs/StringFieldUpdateOperationsInput");
const TenantUpdateOneRequiredWithoutProjectsNestedInput_1 = require("../inputs/TenantUpdateOneRequiredWithoutProjectsNestedInput");
let ProjectUpdateInput = class ProjectUpdateInput {
};
exports.ProjectUpdateInput = ProjectUpdateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], ProjectUpdateInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput)
], ProjectUpdateInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput)
], ProjectUpdateInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantUpdateOneRequiredWithoutProjectsNestedInput_1.TenantUpdateOneRequiredWithoutProjectsNestedInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantUpdateOneRequiredWithoutProjectsNestedInput_1.TenantUpdateOneRequiredWithoutProjectsNestedInput)
], ProjectUpdateInput.prototype, "tenant", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataUpdateManyWithoutProjectNestedInput_1.FileDataUpdateManyWithoutProjectNestedInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataUpdateManyWithoutProjectNestedInput_1.FileDataUpdateManyWithoutProjectNestedInput)
], ProjectUpdateInput.prototype, "files", void 0);
exports.ProjectUpdateInput = ProjectUpdateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectUpdateInput", {})
], ProjectUpdateInput);

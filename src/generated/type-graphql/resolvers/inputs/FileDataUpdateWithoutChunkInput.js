"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataUpdateWithoutChunkInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DateTimeFieldUpdateOperationsInput_1 = require("../inputs/DateTimeFieldUpdateOperationsInput");
const IntFieldUpdateOperationsInput_1 = require("../inputs/IntFieldUpdateOperationsInput");
const NullableBytesFieldUpdateOperationsInput_1 = require("../inputs/NullableBytesFieldUpdateOperationsInput");
const NullableStringFieldUpdateOperationsInput_1 = require("../inputs/NullableStringFieldUpdateOperationsInput");
const ProjectUpdateOneRequiredWithoutFilesNestedInput_1 = require("../inputs/ProjectUpdateOneRequiredWithoutFilesNestedInput");
const StringFieldUpdateOperationsInput_1 = require("../inputs/StringFieldUpdateOperationsInput");
let FileDataUpdateWithoutChunkInput = class FileDataUpdateWithoutChunkInput {
};
exports.FileDataUpdateWithoutChunkInput = FileDataUpdateWithoutChunkInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], FileDataUpdateWithoutChunkInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], FileDataUpdateWithoutChunkInput.prototype, "mimeType", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NullableStringFieldUpdateOperationsInput_1.NullableStringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NullableStringFieldUpdateOperationsInput_1.NullableStringFieldUpdateOperationsInput)
], FileDataUpdateWithoutChunkInput.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], FileDataUpdateWithoutChunkInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFieldUpdateOperationsInput_1.IntFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFieldUpdateOperationsInput_1.IntFieldUpdateOperationsInput)
], FileDataUpdateWithoutChunkInput.prototype, "size", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NullableBytesFieldUpdateOperationsInput_1.NullableBytesFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NullableBytesFieldUpdateOperationsInput_1.NullableBytesFieldUpdateOperationsInput)
], FileDataUpdateWithoutChunkInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput)
], FileDataUpdateWithoutChunkInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput)
], FileDataUpdateWithoutChunkInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectUpdateOneRequiredWithoutFilesNestedInput_1.ProjectUpdateOneRequiredWithoutFilesNestedInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectUpdateOneRequiredWithoutFilesNestedInput_1.ProjectUpdateOneRequiredWithoutFilesNestedInput)
], FileDataUpdateWithoutChunkInput.prototype, "project", void 0);
exports.FileDataUpdateWithoutChunkInput = FileDataUpdateWithoutChunkInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataUpdateWithoutChunkInput", {})
], FileDataUpdateWithoutChunkInput);

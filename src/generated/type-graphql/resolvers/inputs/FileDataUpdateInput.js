"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataUpdateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkUpdateManyWithoutFileNestedInput_1 = require("../inputs/ChunkUpdateManyWithoutFileNestedInput");
const DateTimeFieldUpdateOperationsInput_1 = require("../inputs/DateTimeFieldUpdateOperationsInput");
const IntFieldUpdateOperationsInput_1 = require("../inputs/IntFieldUpdateOperationsInput");
const NullableBytesFieldUpdateOperationsInput_1 = require("../inputs/NullableBytesFieldUpdateOperationsInput");
const NullableStringFieldUpdateOperationsInput_1 = require("../inputs/NullableStringFieldUpdateOperationsInput");
const ProjectUpdateOneRequiredWithoutFilesNestedInput_1 = require("../inputs/ProjectUpdateOneRequiredWithoutFilesNestedInput");
const StringFieldUpdateOperationsInput_1 = require("../inputs/StringFieldUpdateOperationsInput");
let FileDataUpdateInput = class FileDataUpdateInput {
};
exports.FileDataUpdateInput = FileDataUpdateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], FileDataUpdateInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], FileDataUpdateInput.prototype, "mimeType", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NullableStringFieldUpdateOperationsInput_1.NullableStringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NullableStringFieldUpdateOperationsInput_1.NullableStringFieldUpdateOperationsInput)
], FileDataUpdateInput.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], FileDataUpdateInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFieldUpdateOperationsInput_1.IntFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFieldUpdateOperationsInput_1.IntFieldUpdateOperationsInput)
], FileDataUpdateInput.prototype, "size", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NullableBytesFieldUpdateOperationsInput_1.NullableBytesFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NullableBytesFieldUpdateOperationsInput_1.NullableBytesFieldUpdateOperationsInput)
], FileDataUpdateInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput)
], FileDataUpdateInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput)
], FileDataUpdateInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectUpdateOneRequiredWithoutFilesNestedInput_1.ProjectUpdateOneRequiredWithoutFilesNestedInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectUpdateOneRequiredWithoutFilesNestedInput_1.ProjectUpdateOneRequiredWithoutFilesNestedInput)
], FileDataUpdateInput.prototype, "project", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkUpdateManyWithoutFileNestedInput_1.ChunkUpdateManyWithoutFileNestedInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkUpdateManyWithoutFileNestedInput_1.ChunkUpdateManyWithoutFileNestedInput)
], FileDataUpdateInput.prototype, "Chunk", void 0);
exports.FileDataUpdateInput = FileDataUpdateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataUpdateInput", {})
], FileDataUpdateInput);

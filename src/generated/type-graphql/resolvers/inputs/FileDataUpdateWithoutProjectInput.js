"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataUpdateWithoutProjectInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkUpdateManyWithoutFileNestedInput_1 = require("../inputs/ChunkUpdateManyWithoutFileNestedInput");
const DateTimeFieldUpdateOperationsInput_1 = require("../inputs/DateTimeFieldUpdateOperationsInput");
const IntFieldUpdateOperationsInput_1 = require("../inputs/IntFieldUpdateOperationsInput");
const NullableBytesFieldUpdateOperationsInput_1 = require("../inputs/NullableBytesFieldUpdateOperationsInput");
const NullableStringFieldUpdateOperationsInput_1 = require("../inputs/NullableStringFieldUpdateOperationsInput");
const StringFieldUpdateOperationsInput_1 = require("../inputs/StringFieldUpdateOperationsInput");
let FileDataUpdateWithoutProjectInput = class FileDataUpdateWithoutProjectInput {
};
exports.FileDataUpdateWithoutProjectInput = FileDataUpdateWithoutProjectInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], FileDataUpdateWithoutProjectInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], FileDataUpdateWithoutProjectInput.prototype, "mimeType", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NullableStringFieldUpdateOperationsInput_1.NullableStringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NullableStringFieldUpdateOperationsInput_1.NullableStringFieldUpdateOperationsInput)
], FileDataUpdateWithoutProjectInput.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], FileDataUpdateWithoutProjectInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFieldUpdateOperationsInput_1.IntFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFieldUpdateOperationsInput_1.IntFieldUpdateOperationsInput)
], FileDataUpdateWithoutProjectInput.prototype, "size", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NullableBytesFieldUpdateOperationsInput_1.NullableBytesFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NullableBytesFieldUpdateOperationsInput_1.NullableBytesFieldUpdateOperationsInput)
], FileDataUpdateWithoutProjectInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput)
], FileDataUpdateWithoutProjectInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFieldUpdateOperationsInput_1.DateTimeFieldUpdateOperationsInput)
], FileDataUpdateWithoutProjectInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkUpdateManyWithoutFileNestedInput_1.ChunkUpdateManyWithoutFileNestedInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkUpdateManyWithoutFileNestedInput_1.ChunkUpdateManyWithoutFileNestedInput)
], FileDataUpdateWithoutProjectInput.prototype, "Chunk", void 0);
exports.FileDataUpdateWithoutProjectInput = FileDataUpdateWithoutProjectInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataUpdateWithoutProjectInput", {})
], FileDataUpdateWithoutProjectInput);

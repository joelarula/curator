"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkUpdateWithoutModelInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataUpdateOneRequiredWithoutChunkNestedInput_1 = require("../inputs/FileDataUpdateOneRequiredWithoutChunkNestedInput");
const NullableIntFieldUpdateOperationsInput_1 = require("../inputs/NullableIntFieldUpdateOperationsInput");
const StringFieldUpdateOperationsInput_1 = require("../inputs/StringFieldUpdateOperationsInput");
let ChunkUpdateWithoutModelInput = class ChunkUpdateWithoutModelInput {
};
exports.ChunkUpdateWithoutModelInput = ChunkUpdateWithoutModelInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], ChunkUpdateWithoutModelInput.prototype, "text", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], ChunkUpdateWithoutModelInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NullableIntFieldUpdateOperationsInput_1.NullableIntFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NullableIntFieldUpdateOperationsInput_1.NullableIntFieldUpdateOperationsInput)
], ChunkUpdateWithoutModelInput.prototype, "selection", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataUpdateOneRequiredWithoutChunkNestedInput_1.FileDataUpdateOneRequiredWithoutChunkNestedInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataUpdateOneRequiredWithoutChunkNestedInput_1.FileDataUpdateOneRequiredWithoutChunkNestedInput)
], ChunkUpdateWithoutModelInput.prototype, "file", void 0);
exports.ChunkUpdateWithoutModelInput = ChunkUpdateWithoutModelInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkUpdateWithoutModelInput", {})
], ChunkUpdateWithoutModelInput);

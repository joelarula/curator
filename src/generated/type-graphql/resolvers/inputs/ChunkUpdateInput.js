"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkUpdateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataUpdateOneRequiredWithoutChunkNestedInput_1 = require("../inputs/FileDataUpdateOneRequiredWithoutChunkNestedInput");
const ModelUpdateOneRequiredWithoutChunksNestedInput_1 = require("../inputs/ModelUpdateOneRequiredWithoutChunksNestedInput");
const NullableIntFieldUpdateOperationsInput_1 = require("../inputs/NullableIntFieldUpdateOperationsInput");
const StringFieldUpdateOperationsInput_1 = require("../inputs/StringFieldUpdateOperationsInput");
let ChunkUpdateInput = class ChunkUpdateInput {
};
exports.ChunkUpdateInput = ChunkUpdateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], ChunkUpdateInput.prototype, "text", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], ChunkUpdateInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NullableIntFieldUpdateOperationsInput_1.NullableIntFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NullableIntFieldUpdateOperationsInput_1.NullableIntFieldUpdateOperationsInput)
], ChunkUpdateInput.prototype, "selection", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataUpdateOneRequiredWithoutChunkNestedInput_1.FileDataUpdateOneRequiredWithoutChunkNestedInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataUpdateOneRequiredWithoutChunkNestedInput_1.FileDataUpdateOneRequiredWithoutChunkNestedInput)
], ChunkUpdateInput.prototype, "file", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelUpdateOneRequiredWithoutChunksNestedInput_1.ModelUpdateOneRequiredWithoutChunksNestedInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelUpdateOneRequiredWithoutChunksNestedInput_1.ModelUpdateOneRequiredWithoutChunksNestedInput)
], ChunkUpdateInput.prototype, "model", void 0);
exports.ChunkUpdateInput = ChunkUpdateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkUpdateInput", {})
], ChunkUpdateInput);

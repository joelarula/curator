"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkUpdateWithoutFileInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelUpdateOneRequiredWithoutChunksNestedInput_1 = require("../inputs/ModelUpdateOneRequiredWithoutChunksNestedInput");
const NullableIntFieldUpdateOperationsInput_1 = require("../inputs/NullableIntFieldUpdateOperationsInput");
const StringFieldUpdateOperationsInput_1 = require("../inputs/StringFieldUpdateOperationsInput");
let ChunkUpdateWithoutFileInput = class ChunkUpdateWithoutFileInput {
};
exports.ChunkUpdateWithoutFileInput = ChunkUpdateWithoutFileInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], ChunkUpdateWithoutFileInput.prototype, "text", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], ChunkUpdateWithoutFileInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NullableIntFieldUpdateOperationsInput_1.NullableIntFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NullableIntFieldUpdateOperationsInput_1.NullableIntFieldUpdateOperationsInput)
], ChunkUpdateWithoutFileInput.prototype, "selection", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelUpdateOneRequiredWithoutChunksNestedInput_1.ModelUpdateOneRequiredWithoutChunksNestedInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelUpdateOneRequiredWithoutChunksNestedInput_1.ModelUpdateOneRequiredWithoutChunksNestedInput)
], ChunkUpdateWithoutFileInput.prototype, "model", void 0);
exports.ChunkUpdateWithoutFileInput = ChunkUpdateWithoutFileInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkUpdateWithoutFileInput", {})
], ChunkUpdateWithoutFileInput);

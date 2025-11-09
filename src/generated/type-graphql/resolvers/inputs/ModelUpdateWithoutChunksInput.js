"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelUpdateWithoutChunksInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const NullableStringFieldUpdateOperationsInput_1 = require("../inputs/NullableStringFieldUpdateOperationsInput");
const StringFieldUpdateOperationsInput_1 = require("../inputs/StringFieldUpdateOperationsInput");
let ModelUpdateWithoutChunksInput = class ModelUpdateWithoutChunksInput {
};
exports.ModelUpdateWithoutChunksInput = ModelUpdateWithoutChunksInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], ModelUpdateWithoutChunksInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], ModelUpdateWithoutChunksInput.prototype, "columnName", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NullableStringFieldUpdateOperationsInput_1.NullableStringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NullableStringFieldUpdateOperationsInput_1.NullableStringFieldUpdateOperationsInput)
], ModelUpdateWithoutChunksInput.prototype, "source", void 0);
exports.ModelUpdateWithoutChunksInput = ModelUpdateWithoutChunksInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ModelUpdateWithoutChunksInput", {})
], ModelUpdateWithoutChunksInput);

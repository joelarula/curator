"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelUpdateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkUpdateManyWithoutModelNestedInput_1 = require("../inputs/ChunkUpdateManyWithoutModelNestedInput");
const NullableStringFieldUpdateOperationsInput_1 = require("../inputs/NullableStringFieldUpdateOperationsInput");
const StringFieldUpdateOperationsInput_1 = require("../inputs/StringFieldUpdateOperationsInput");
let ModelUpdateInput = class ModelUpdateInput {
};
exports.ModelUpdateInput = ModelUpdateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], ModelUpdateInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFieldUpdateOperationsInput_1.StringFieldUpdateOperationsInput)
], ModelUpdateInput.prototype, "columnName", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NullableStringFieldUpdateOperationsInput_1.NullableStringFieldUpdateOperationsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NullableStringFieldUpdateOperationsInput_1.NullableStringFieldUpdateOperationsInput)
], ModelUpdateInput.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkUpdateManyWithoutModelNestedInput_1.ChunkUpdateManyWithoutModelNestedInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkUpdateManyWithoutModelNestedInput_1.ChunkUpdateManyWithoutModelNestedInput)
], ModelUpdateInput.prototype, "chunks", void 0);
exports.ModelUpdateInput = ModelUpdateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ModelUpdateInput", {})
], ModelUpdateInput);

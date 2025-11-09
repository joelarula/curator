"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelUpdateToOneWithWhereWithoutChunksInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelUpdateWithoutChunksInput_1 = require("../inputs/ModelUpdateWithoutChunksInput");
const ModelWhereInput_1 = require("../inputs/ModelWhereInput");
let ModelUpdateToOneWithWhereWithoutChunksInput = class ModelUpdateToOneWithWhereWithoutChunksInput {
};
exports.ModelUpdateToOneWithWhereWithoutChunksInput = ModelUpdateToOneWithWhereWithoutChunksInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelWhereInput_1.ModelWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelWhereInput_1.ModelWhereInput)
], ModelUpdateToOneWithWhereWithoutChunksInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelUpdateWithoutChunksInput_1.ModelUpdateWithoutChunksInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ModelUpdateWithoutChunksInput_1.ModelUpdateWithoutChunksInput)
], ModelUpdateToOneWithWhereWithoutChunksInput.prototype, "data", void 0);
exports.ModelUpdateToOneWithWhereWithoutChunksInput = ModelUpdateToOneWithWhereWithoutChunksInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ModelUpdateToOneWithWhereWithoutChunksInput", {})
], ModelUpdateToOneWithWhereWithoutChunksInput);

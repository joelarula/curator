"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelUpsertWithoutChunksInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelCreateWithoutChunksInput_1 = require("../inputs/ModelCreateWithoutChunksInput");
const ModelUpdateWithoutChunksInput_1 = require("../inputs/ModelUpdateWithoutChunksInput");
const ModelWhereInput_1 = require("../inputs/ModelWhereInput");
let ModelUpsertWithoutChunksInput = class ModelUpsertWithoutChunksInput {
};
exports.ModelUpsertWithoutChunksInput = ModelUpsertWithoutChunksInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelUpdateWithoutChunksInput_1.ModelUpdateWithoutChunksInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ModelUpdateWithoutChunksInput_1.ModelUpdateWithoutChunksInput)
], ModelUpsertWithoutChunksInput.prototype, "update", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelCreateWithoutChunksInput_1.ModelCreateWithoutChunksInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ModelCreateWithoutChunksInput_1.ModelCreateWithoutChunksInput)
], ModelUpsertWithoutChunksInput.prototype, "create", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelWhereInput_1.ModelWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelWhereInput_1.ModelWhereInput)
], ModelUpsertWithoutChunksInput.prototype, "where", void 0);
exports.ModelUpsertWithoutChunksInput = ModelUpsertWithoutChunksInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ModelUpsertWithoutChunksInput", {})
], ModelUpsertWithoutChunksInput);

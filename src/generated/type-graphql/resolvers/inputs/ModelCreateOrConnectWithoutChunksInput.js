"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelCreateOrConnectWithoutChunksInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelCreateWithoutChunksInput_1 = require("../inputs/ModelCreateWithoutChunksInput");
const ModelWhereUniqueInput_1 = require("../inputs/ModelWhereUniqueInput");
let ModelCreateOrConnectWithoutChunksInput = class ModelCreateOrConnectWithoutChunksInput {
};
exports.ModelCreateOrConnectWithoutChunksInput = ModelCreateOrConnectWithoutChunksInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelWhereUniqueInput_1.ModelWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ModelWhereUniqueInput_1.ModelWhereUniqueInput)
], ModelCreateOrConnectWithoutChunksInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelCreateWithoutChunksInput_1.ModelCreateWithoutChunksInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ModelCreateWithoutChunksInput_1.ModelCreateWithoutChunksInput)
], ModelCreateOrConnectWithoutChunksInput.prototype, "create", void 0);
exports.ModelCreateOrConnectWithoutChunksInput = ModelCreateOrConnectWithoutChunksInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ModelCreateOrConnectWithoutChunksInput", {})
], ModelCreateOrConnectWithoutChunksInput);

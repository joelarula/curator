"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelUpdateOneRequiredWithoutChunksNestedInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelCreateOrConnectWithoutChunksInput_1 = require("../inputs/ModelCreateOrConnectWithoutChunksInput");
const ModelCreateWithoutChunksInput_1 = require("../inputs/ModelCreateWithoutChunksInput");
const ModelUpdateToOneWithWhereWithoutChunksInput_1 = require("../inputs/ModelUpdateToOneWithWhereWithoutChunksInput");
const ModelUpsertWithoutChunksInput_1 = require("../inputs/ModelUpsertWithoutChunksInput");
const ModelWhereUniqueInput_1 = require("../inputs/ModelWhereUniqueInput");
let ModelUpdateOneRequiredWithoutChunksNestedInput = class ModelUpdateOneRequiredWithoutChunksNestedInput {
};
exports.ModelUpdateOneRequiredWithoutChunksNestedInput = ModelUpdateOneRequiredWithoutChunksNestedInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelCreateWithoutChunksInput_1.ModelCreateWithoutChunksInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelCreateWithoutChunksInput_1.ModelCreateWithoutChunksInput)
], ModelUpdateOneRequiredWithoutChunksNestedInput.prototype, "create", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelCreateOrConnectWithoutChunksInput_1.ModelCreateOrConnectWithoutChunksInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelCreateOrConnectWithoutChunksInput_1.ModelCreateOrConnectWithoutChunksInput)
], ModelUpdateOneRequiredWithoutChunksNestedInput.prototype, "connectOrCreate", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelUpsertWithoutChunksInput_1.ModelUpsertWithoutChunksInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelUpsertWithoutChunksInput_1.ModelUpsertWithoutChunksInput)
], ModelUpdateOneRequiredWithoutChunksNestedInput.prototype, "upsert", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelWhereUniqueInput_1.ModelWhereUniqueInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelWhereUniqueInput_1.ModelWhereUniqueInput)
], ModelUpdateOneRequiredWithoutChunksNestedInput.prototype, "connect", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelUpdateToOneWithWhereWithoutChunksInput_1.ModelUpdateToOneWithWhereWithoutChunksInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelUpdateToOneWithWhereWithoutChunksInput_1.ModelUpdateToOneWithWhereWithoutChunksInput)
], ModelUpdateOneRequiredWithoutChunksNestedInput.prototype, "update", void 0);
exports.ModelUpdateOneRequiredWithoutChunksNestedInput = ModelUpdateOneRequiredWithoutChunksNestedInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ModelUpdateOneRequiredWithoutChunksNestedInput", {})
], ModelUpdateOneRequiredWithoutChunksNestedInput);

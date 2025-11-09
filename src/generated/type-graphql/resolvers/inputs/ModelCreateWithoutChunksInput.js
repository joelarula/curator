"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelCreateWithoutChunksInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let ModelCreateWithoutChunksInput = class ModelCreateWithoutChunksInput {
};
exports.ModelCreateWithoutChunksInput = ModelCreateWithoutChunksInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], ModelCreateWithoutChunksInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], ModelCreateWithoutChunksInput.prototype, "columnName", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelCreateWithoutChunksInput.prototype, "source", void 0);
exports.ModelCreateWithoutChunksInput = ModelCreateWithoutChunksInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ModelCreateWithoutChunksInput", {})
], ModelCreateWithoutChunksInput);

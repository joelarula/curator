"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelCreateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkCreateNestedManyWithoutModelInput_1 = require("../inputs/ChunkCreateNestedManyWithoutModelInput");
let ModelCreateInput = class ModelCreateInput {
};
exports.ModelCreateInput = ModelCreateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], ModelCreateInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], ModelCreateInput.prototype, "columnName", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelCreateInput.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkCreateNestedManyWithoutModelInput_1.ChunkCreateNestedManyWithoutModelInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkCreateNestedManyWithoutModelInput_1.ChunkCreateNestedManyWithoutModelInput)
], ModelCreateInput.prototype, "chunks", void 0);
exports.ModelCreateInput = ModelCreateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ModelCreateInput", {})
], ModelCreateInput);

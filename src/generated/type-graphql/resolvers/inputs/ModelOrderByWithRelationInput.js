"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelOrderByWithRelationInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkOrderByRelationAggregateInput_1 = require("../inputs/ChunkOrderByRelationAggregateInput");
const SortOrderInput_1 = require("../inputs/SortOrderInput");
const SortOrder_1 = require("../../enums/SortOrder");
let ModelOrderByWithRelationInput = class ModelOrderByWithRelationInput {
};
exports.ModelOrderByWithRelationInput = ModelOrderByWithRelationInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelOrderByWithRelationInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelOrderByWithRelationInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelOrderByWithRelationInput.prototype, "columnName", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrderInput_1.SortOrderInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", SortOrderInput_1.SortOrderInput)
], ModelOrderByWithRelationInput.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkOrderByRelationAggregateInput_1.ChunkOrderByRelationAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkOrderByRelationAggregateInput_1.ChunkOrderByRelationAggregateInput)
], ModelOrderByWithRelationInput.prototype, "chunks", void 0);
exports.ModelOrderByWithRelationInput = ModelOrderByWithRelationInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ModelOrderByWithRelationInput", {})
], ModelOrderByWithRelationInput);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkOrderByWithAggregationInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkAvgOrderByAggregateInput_1 = require("../inputs/ChunkAvgOrderByAggregateInput");
const ChunkCountOrderByAggregateInput_1 = require("../inputs/ChunkCountOrderByAggregateInput");
const ChunkMaxOrderByAggregateInput_1 = require("../inputs/ChunkMaxOrderByAggregateInput");
const ChunkMinOrderByAggregateInput_1 = require("../inputs/ChunkMinOrderByAggregateInput");
const ChunkSumOrderByAggregateInput_1 = require("../inputs/ChunkSumOrderByAggregateInput");
const SortOrderInput_1 = require("../inputs/SortOrderInput");
const SortOrder_1 = require("../../enums/SortOrder");
let ChunkOrderByWithAggregationInput = class ChunkOrderByWithAggregationInput {
};
exports.ChunkOrderByWithAggregationInput = ChunkOrderByWithAggregationInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkOrderByWithAggregationInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkOrderByWithAggregationInput.prototype, "text", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkOrderByWithAggregationInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrderInput_1.SortOrderInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", SortOrderInput_1.SortOrderInput)
], ChunkOrderByWithAggregationInput.prototype, "selection", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkOrderByWithAggregationInput.prototype, "fileId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkOrderByWithAggregationInput.prototype, "modelId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkCountOrderByAggregateInput_1.ChunkCountOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkCountOrderByAggregateInput_1.ChunkCountOrderByAggregateInput)
], ChunkOrderByWithAggregationInput.prototype, "_count", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkAvgOrderByAggregateInput_1.ChunkAvgOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkAvgOrderByAggregateInput_1.ChunkAvgOrderByAggregateInput)
], ChunkOrderByWithAggregationInput.prototype, "_avg", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkMaxOrderByAggregateInput_1.ChunkMaxOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkMaxOrderByAggregateInput_1.ChunkMaxOrderByAggregateInput)
], ChunkOrderByWithAggregationInput.prototype, "_max", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkMinOrderByAggregateInput_1.ChunkMinOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkMinOrderByAggregateInput_1.ChunkMinOrderByAggregateInput)
], ChunkOrderByWithAggregationInput.prototype, "_min", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkSumOrderByAggregateInput_1.ChunkSumOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkSumOrderByAggregateInput_1.ChunkSumOrderByAggregateInput)
], ChunkOrderByWithAggregationInput.prototype, "_sum", void 0);
exports.ChunkOrderByWithAggregationInput = ChunkOrderByWithAggregationInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkOrderByWithAggregationInput", {})
], ChunkOrderByWithAggregationInput);

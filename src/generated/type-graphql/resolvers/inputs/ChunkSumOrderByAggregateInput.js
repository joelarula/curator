"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkSumOrderByAggregateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const SortOrder_1 = require("../../enums/SortOrder");
let ChunkSumOrderByAggregateInput = class ChunkSumOrderByAggregateInput {
};
exports.ChunkSumOrderByAggregateInput = ChunkSumOrderByAggregateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkSumOrderByAggregateInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkSumOrderByAggregateInput.prototype, "selection", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkSumOrderByAggregateInput.prototype, "fileId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkSumOrderByAggregateInput.prototype, "modelId", void 0);
exports.ChunkSumOrderByAggregateInput = ChunkSumOrderByAggregateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkSumOrderByAggregateInput", {})
], ChunkSumOrderByAggregateInput);

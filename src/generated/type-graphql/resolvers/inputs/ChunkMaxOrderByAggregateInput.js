"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkMaxOrderByAggregateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const SortOrder_1 = require("../../enums/SortOrder");
let ChunkMaxOrderByAggregateInput = class ChunkMaxOrderByAggregateInput {
};
exports.ChunkMaxOrderByAggregateInput = ChunkMaxOrderByAggregateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkMaxOrderByAggregateInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkMaxOrderByAggregateInput.prototype, "text", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkMaxOrderByAggregateInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkMaxOrderByAggregateInput.prototype, "selection", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkMaxOrderByAggregateInput.prototype, "fileId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkMaxOrderByAggregateInput.prototype, "modelId", void 0);
exports.ChunkMaxOrderByAggregateInput = ChunkMaxOrderByAggregateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkMaxOrderByAggregateInput", {})
], ChunkMaxOrderByAggregateInput);

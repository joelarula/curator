"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkMinOrderByAggregateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const SortOrder_1 = require("../../enums/SortOrder");
let ChunkMinOrderByAggregateInput = class ChunkMinOrderByAggregateInput {
};
exports.ChunkMinOrderByAggregateInput = ChunkMinOrderByAggregateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkMinOrderByAggregateInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkMinOrderByAggregateInput.prototype, "text", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkMinOrderByAggregateInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkMinOrderByAggregateInput.prototype, "selection", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkMinOrderByAggregateInput.prototype, "fileId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkMinOrderByAggregateInput.prototype, "modelId", void 0);
exports.ChunkMinOrderByAggregateInput = ChunkMinOrderByAggregateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkMinOrderByAggregateInput", {})
], ChunkMinOrderByAggregateInput);

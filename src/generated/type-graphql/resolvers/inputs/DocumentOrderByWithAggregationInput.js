"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentOrderByWithAggregationInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DocumentCountOrderByAggregateInput_1 = require("../inputs/DocumentCountOrderByAggregateInput");
const DocumentMaxOrderByAggregateInput_1 = require("../inputs/DocumentMaxOrderByAggregateInput");
const DocumentMinOrderByAggregateInput_1 = require("../inputs/DocumentMinOrderByAggregateInput");
const SortOrderInput_1 = require("../inputs/SortOrderInput");
const SortOrder_1 = require("../../enums/SortOrder");
let DocumentOrderByWithAggregationInput = class DocumentOrderByWithAggregationInput {
};
exports.DocumentOrderByWithAggregationInput = DocumentOrderByWithAggregationInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], DocumentOrderByWithAggregationInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], DocumentOrderByWithAggregationInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrderInput_1.SortOrderInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", SortOrderInput_1.SortOrderInput)
], DocumentOrderByWithAggregationInput.prototype, "metadata", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], DocumentOrderByWithAggregationInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], DocumentOrderByWithAggregationInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DocumentCountOrderByAggregateInput_1.DocumentCountOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DocumentCountOrderByAggregateInput_1.DocumentCountOrderByAggregateInput)
], DocumentOrderByWithAggregationInput.prototype, "_count", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DocumentMaxOrderByAggregateInput_1.DocumentMaxOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DocumentMaxOrderByAggregateInput_1.DocumentMaxOrderByAggregateInput)
], DocumentOrderByWithAggregationInput.prototype, "_max", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DocumentMinOrderByAggregateInput_1.DocumentMinOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DocumentMinOrderByAggregateInput_1.DocumentMinOrderByAggregateInput)
], DocumentOrderByWithAggregationInput.prototype, "_min", void 0);
exports.DocumentOrderByWithAggregationInput = DocumentOrderByWithAggregationInput = tslib_1.__decorate([
    TypeGraphQL.InputType("DocumentOrderByWithAggregationInput", {})
], DocumentOrderByWithAggregationInput);

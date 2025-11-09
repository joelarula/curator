"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStoreOrderByWithAggregationInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const SortOrderInput_1 = require("../inputs/SortOrderInput");
const VectorStoreCountOrderByAggregateInput_1 = require("../inputs/VectorStoreCountOrderByAggregateInput");
const VectorStoreMaxOrderByAggregateInput_1 = require("../inputs/VectorStoreMaxOrderByAggregateInput");
const VectorStoreMinOrderByAggregateInput_1 = require("../inputs/VectorStoreMinOrderByAggregateInput");
const SortOrder_1 = require("../../enums/SortOrder");
let VectorStoreOrderByWithAggregationInput = class VectorStoreOrderByWithAggregationInput {
};
exports.VectorStoreOrderByWithAggregationInput = VectorStoreOrderByWithAggregationInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreOrderByWithAggregationInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreOrderByWithAggregationInput.prototype, "namespace", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreOrderByWithAggregationInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrderInput_1.SortOrderInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", SortOrderInput_1.SortOrderInput)
], VectorStoreOrderByWithAggregationInput.prototype, "metadata", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreOrderByWithAggregationInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreCountOrderByAggregateInput_1.VectorStoreCountOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", VectorStoreCountOrderByAggregateInput_1.VectorStoreCountOrderByAggregateInput)
], VectorStoreOrderByWithAggregationInput.prototype, "_count", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreMaxOrderByAggregateInput_1.VectorStoreMaxOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", VectorStoreMaxOrderByAggregateInput_1.VectorStoreMaxOrderByAggregateInput)
], VectorStoreOrderByWithAggregationInput.prototype, "_max", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreMinOrderByAggregateInput_1.VectorStoreMinOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", VectorStoreMinOrderByAggregateInput_1.VectorStoreMinOrderByAggregateInput)
], VectorStoreOrderByWithAggregationInput.prototype, "_min", void 0);
exports.VectorStoreOrderByWithAggregationInput = VectorStoreOrderByWithAggregationInput = tslib_1.__decorate([
    TypeGraphQL.InputType("VectorStoreOrderByWithAggregationInput", {})
], VectorStoreOrderByWithAggregationInput);

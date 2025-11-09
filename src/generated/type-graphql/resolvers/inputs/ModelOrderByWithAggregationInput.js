"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelOrderByWithAggregationInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelAvgOrderByAggregateInput_1 = require("../inputs/ModelAvgOrderByAggregateInput");
const ModelCountOrderByAggregateInput_1 = require("../inputs/ModelCountOrderByAggregateInput");
const ModelMaxOrderByAggregateInput_1 = require("../inputs/ModelMaxOrderByAggregateInput");
const ModelMinOrderByAggregateInput_1 = require("../inputs/ModelMinOrderByAggregateInput");
const ModelSumOrderByAggregateInput_1 = require("../inputs/ModelSumOrderByAggregateInput");
const SortOrderInput_1 = require("../inputs/SortOrderInput");
const SortOrder_1 = require("../../enums/SortOrder");
let ModelOrderByWithAggregationInput = class ModelOrderByWithAggregationInput {
};
exports.ModelOrderByWithAggregationInput = ModelOrderByWithAggregationInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelOrderByWithAggregationInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelOrderByWithAggregationInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelOrderByWithAggregationInput.prototype, "columnName", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrderInput_1.SortOrderInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", SortOrderInput_1.SortOrderInput)
], ModelOrderByWithAggregationInput.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelCountOrderByAggregateInput_1.ModelCountOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelCountOrderByAggregateInput_1.ModelCountOrderByAggregateInput)
], ModelOrderByWithAggregationInput.prototype, "_count", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelAvgOrderByAggregateInput_1.ModelAvgOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelAvgOrderByAggregateInput_1.ModelAvgOrderByAggregateInput)
], ModelOrderByWithAggregationInput.prototype, "_avg", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelMaxOrderByAggregateInput_1.ModelMaxOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelMaxOrderByAggregateInput_1.ModelMaxOrderByAggregateInput)
], ModelOrderByWithAggregationInput.prototype, "_max", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelMinOrderByAggregateInput_1.ModelMinOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelMinOrderByAggregateInput_1.ModelMinOrderByAggregateInput)
], ModelOrderByWithAggregationInput.prototype, "_min", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelSumOrderByAggregateInput_1.ModelSumOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelSumOrderByAggregateInput_1.ModelSumOrderByAggregateInput)
], ModelOrderByWithAggregationInput.prototype, "_sum", void 0);
exports.ModelOrderByWithAggregationInput = ModelOrderByWithAggregationInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ModelOrderByWithAggregationInput", {})
], ModelOrderByWithAggregationInput);

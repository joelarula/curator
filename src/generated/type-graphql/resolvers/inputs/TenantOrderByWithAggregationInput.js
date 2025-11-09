"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantOrderByWithAggregationInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const TenantAvgOrderByAggregateInput_1 = require("../inputs/TenantAvgOrderByAggregateInput");
const TenantCountOrderByAggregateInput_1 = require("../inputs/TenantCountOrderByAggregateInput");
const TenantMaxOrderByAggregateInput_1 = require("../inputs/TenantMaxOrderByAggregateInput");
const TenantMinOrderByAggregateInput_1 = require("../inputs/TenantMinOrderByAggregateInput");
const TenantSumOrderByAggregateInput_1 = require("../inputs/TenantSumOrderByAggregateInput");
const SortOrder_1 = require("../../enums/SortOrder");
let TenantOrderByWithAggregationInput = class TenantOrderByWithAggregationInput {
};
exports.TenantOrderByWithAggregationInput = TenantOrderByWithAggregationInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantOrderByWithAggregationInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantOrderByWithAggregationInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantOrderByWithAggregationInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantOrderByWithAggregationInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantCountOrderByAggregateInput_1.TenantCountOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantCountOrderByAggregateInput_1.TenantCountOrderByAggregateInput)
], TenantOrderByWithAggregationInput.prototype, "_count", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantAvgOrderByAggregateInput_1.TenantAvgOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantAvgOrderByAggregateInput_1.TenantAvgOrderByAggregateInput)
], TenantOrderByWithAggregationInput.prototype, "_avg", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantMaxOrderByAggregateInput_1.TenantMaxOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantMaxOrderByAggregateInput_1.TenantMaxOrderByAggregateInput)
], TenantOrderByWithAggregationInput.prototype, "_max", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantMinOrderByAggregateInput_1.TenantMinOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantMinOrderByAggregateInput_1.TenantMinOrderByAggregateInput)
], TenantOrderByWithAggregationInput.prototype, "_min", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantSumOrderByAggregateInput_1.TenantSumOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantSumOrderByAggregateInput_1.TenantSumOrderByAggregateInput)
], TenantOrderByWithAggregationInput.prototype, "_sum", void 0);
exports.TenantOrderByWithAggregationInput = TenantOrderByWithAggregationInput = tslib_1.__decorate([
    TypeGraphQL.InputType("TenantOrderByWithAggregationInput", {})
], TenantOrderByWithAggregationInput);

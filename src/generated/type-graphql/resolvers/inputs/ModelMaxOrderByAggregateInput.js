"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelMaxOrderByAggregateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const SortOrder_1 = require("../../enums/SortOrder");
let ModelMaxOrderByAggregateInput = class ModelMaxOrderByAggregateInput {
};
exports.ModelMaxOrderByAggregateInput = ModelMaxOrderByAggregateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelMaxOrderByAggregateInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelMaxOrderByAggregateInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelMaxOrderByAggregateInput.prototype, "columnName", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelMaxOrderByAggregateInput.prototype, "source", void 0);
exports.ModelMaxOrderByAggregateInput = ModelMaxOrderByAggregateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ModelMaxOrderByAggregateInput", {})
], ModelMaxOrderByAggregateInput);

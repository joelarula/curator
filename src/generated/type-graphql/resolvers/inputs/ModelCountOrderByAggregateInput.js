"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelCountOrderByAggregateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const SortOrder_1 = require("../../enums/SortOrder");
let ModelCountOrderByAggregateInput = class ModelCountOrderByAggregateInput {
};
exports.ModelCountOrderByAggregateInput = ModelCountOrderByAggregateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelCountOrderByAggregateInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelCountOrderByAggregateInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelCountOrderByAggregateInput.prototype, "columnName", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelCountOrderByAggregateInput.prototype, "source", void 0);
exports.ModelCountOrderByAggregateInput = ModelCountOrderByAggregateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ModelCountOrderByAggregateInput", {})
], ModelCountOrderByAggregateInput);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelMinOrderByAggregateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const SortOrder_1 = require("../../enums/SortOrder");
let ModelMinOrderByAggregateInput = class ModelMinOrderByAggregateInput {
};
exports.ModelMinOrderByAggregateInput = ModelMinOrderByAggregateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelMinOrderByAggregateInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelMinOrderByAggregateInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelMinOrderByAggregateInput.prototype, "columnName", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelMinOrderByAggregateInput.prototype, "source", void 0);
exports.ModelMinOrderByAggregateInput = ModelMinOrderByAggregateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ModelMinOrderByAggregateInput", {})
], ModelMinOrderByAggregateInput);

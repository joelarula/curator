"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStoreMaxOrderByAggregateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const SortOrder_1 = require("../../enums/SortOrder");
let VectorStoreMaxOrderByAggregateInput = class VectorStoreMaxOrderByAggregateInput {
};
exports.VectorStoreMaxOrderByAggregateInput = VectorStoreMaxOrderByAggregateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreMaxOrderByAggregateInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreMaxOrderByAggregateInput.prototype, "namespace", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreMaxOrderByAggregateInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreMaxOrderByAggregateInput.prototype, "createdAt", void 0);
exports.VectorStoreMaxOrderByAggregateInput = VectorStoreMaxOrderByAggregateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("VectorStoreMaxOrderByAggregateInput", {})
], VectorStoreMaxOrderByAggregateInput);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStoreCountOrderByAggregateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const SortOrder_1 = require("../../enums/SortOrder");
let VectorStoreCountOrderByAggregateInput = class VectorStoreCountOrderByAggregateInput {
};
exports.VectorStoreCountOrderByAggregateInput = VectorStoreCountOrderByAggregateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreCountOrderByAggregateInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreCountOrderByAggregateInput.prototype, "namespace", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreCountOrderByAggregateInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreCountOrderByAggregateInput.prototype, "metadata", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreCountOrderByAggregateInput.prototype, "createdAt", void 0);
exports.VectorStoreCountOrderByAggregateInput = VectorStoreCountOrderByAggregateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("VectorStoreCountOrderByAggregateInput", {})
], VectorStoreCountOrderByAggregateInput);

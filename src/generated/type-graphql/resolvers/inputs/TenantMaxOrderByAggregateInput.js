"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantMaxOrderByAggregateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const SortOrder_1 = require("../../enums/SortOrder");
let TenantMaxOrderByAggregateInput = class TenantMaxOrderByAggregateInput {
};
exports.TenantMaxOrderByAggregateInput = TenantMaxOrderByAggregateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantMaxOrderByAggregateInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantMaxOrderByAggregateInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantMaxOrderByAggregateInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantMaxOrderByAggregateInput.prototype, "updatedAt", void 0);
exports.TenantMaxOrderByAggregateInput = TenantMaxOrderByAggregateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("TenantMaxOrderByAggregateInput", {})
], TenantMaxOrderByAggregateInput);

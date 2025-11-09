"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantMinOrderByAggregateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const SortOrder_1 = require("../../enums/SortOrder");
let TenantMinOrderByAggregateInput = class TenantMinOrderByAggregateInput {
};
exports.TenantMinOrderByAggregateInput = TenantMinOrderByAggregateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantMinOrderByAggregateInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantMinOrderByAggregateInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantMinOrderByAggregateInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantMinOrderByAggregateInput.prototype, "updatedAt", void 0);
exports.TenantMinOrderByAggregateInput = TenantMinOrderByAggregateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("TenantMinOrderByAggregateInput", {})
], TenantMinOrderByAggregateInput);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataSumOrderByAggregateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const SortOrder_1 = require("../../enums/SortOrder");
let FileDataSumOrderByAggregateInput = class FileDataSumOrderByAggregateInput {
};
exports.FileDataSumOrderByAggregateInput = FileDataSumOrderByAggregateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataSumOrderByAggregateInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataSumOrderByAggregateInput.prototype, "size", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataSumOrderByAggregateInput.prototype, "projectId", void 0);
exports.FileDataSumOrderByAggregateInput = FileDataSumOrderByAggregateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataSumOrderByAggregateInput", {})
], FileDataSumOrderByAggregateInput);

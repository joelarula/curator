"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataAvgOrderByAggregateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const SortOrder_1 = require("../../enums/SortOrder");
let FileDataAvgOrderByAggregateInput = class FileDataAvgOrderByAggregateInput {
};
exports.FileDataAvgOrderByAggregateInput = FileDataAvgOrderByAggregateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataAvgOrderByAggregateInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataAvgOrderByAggregateInput.prototype, "size", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataAvgOrderByAggregateInput.prototype, "projectId", void 0);
exports.FileDataAvgOrderByAggregateInput = FileDataAvgOrderByAggregateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataAvgOrderByAggregateInput", {})
], FileDataAvgOrderByAggregateInput);

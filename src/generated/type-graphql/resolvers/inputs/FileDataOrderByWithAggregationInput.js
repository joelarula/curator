"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataOrderByWithAggregationInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataAvgOrderByAggregateInput_1 = require("../inputs/FileDataAvgOrderByAggregateInput");
const FileDataCountOrderByAggregateInput_1 = require("../inputs/FileDataCountOrderByAggregateInput");
const FileDataMaxOrderByAggregateInput_1 = require("../inputs/FileDataMaxOrderByAggregateInput");
const FileDataMinOrderByAggregateInput_1 = require("../inputs/FileDataMinOrderByAggregateInput");
const FileDataSumOrderByAggregateInput_1 = require("../inputs/FileDataSumOrderByAggregateInput");
const SortOrderInput_1 = require("../inputs/SortOrderInput");
const SortOrder_1 = require("../../enums/SortOrder");
let FileDataOrderByWithAggregationInput = class FileDataOrderByWithAggregationInput {
};
exports.FileDataOrderByWithAggregationInput = FileDataOrderByWithAggregationInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataOrderByWithAggregationInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataOrderByWithAggregationInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataOrderByWithAggregationInput.prototype, "mimeType", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrderInput_1.SortOrderInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", SortOrderInput_1.SortOrderInput)
], FileDataOrderByWithAggregationInput.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataOrderByWithAggregationInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataOrderByWithAggregationInput.prototype, "size", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrderInput_1.SortOrderInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", SortOrderInput_1.SortOrderInput)
], FileDataOrderByWithAggregationInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataOrderByWithAggregationInput.prototype, "projectId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataOrderByWithAggregationInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataOrderByWithAggregationInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataCountOrderByAggregateInput_1.FileDataCountOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataCountOrderByAggregateInput_1.FileDataCountOrderByAggregateInput)
], FileDataOrderByWithAggregationInput.prototype, "_count", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataAvgOrderByAggregateInput_1.FileDataAvgOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataAvgOrderByAggregateInput_1.FileDataAvgOrderByAggregateInput)
], FileDataOrderByWithAggregationInput.prototype, "_avg", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataMaxOrderByAggregateInput_1.FileDataMaxOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataMaxOrderByAggregateInput_1.FileDataMaxOrderByAggregateInput)
], FileDataOrderByWithAggregationInput.prototype, "_max", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataMinOrderByAggregateInput_1.FileDataMinOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataMinOrderByAggregateInput_1.FileDataMinOrderByAggregateInput)
], FileDataOrderByWithAggregationInput.prototype, "_min", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataSumOrderByAggregateInput_1.FileDataSumOrderByAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataSumOrderByAggregateInput_1.FileDataSumOrderByAggregateInput)
], FileDataOrderByWithAggregationInput.prototype, "_sum", void 0);
exports.FileDataOrderByWithAggregationInput = FileDataOrderByWithAggregationInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataOrderByWithAggregationInput", {})
], FileDataOrderByWithAggregationInput);

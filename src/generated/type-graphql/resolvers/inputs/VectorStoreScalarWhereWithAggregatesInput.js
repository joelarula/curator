"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStoreScalarWhereWithAggregatesInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DateTimeWithAggregatesFilter_1 = require("../inputs/DateTimeWithAggregatesFilter");
const JsonNullableWithAggregatesFilter_1 = require("../inputs/JsonNullableWithAggregatesFilter");
const StringWithAggregatesFilter_1 = require("../inputs/StringWithAggregatesFilter");
let VectorStoreScalarWhereWithAggregatesInput = class VectorStoreScalarWhereWithAggregatesInput {
};
exports.VectorStoreScalarWhereWithAggregatesInput = VectorStoreScalarWhereWithAggregatesInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [VectorStoreScalarWhereWithAggregatesInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], VectorStoreScalarWhereWithAggregatesInput.prototype, "AND", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [VectorStoreScalarWhereWithAggregatesInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], VectorStoreScalarWhereWithAggregatesInput.prototype, "OR", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [VectorStoreScalarWhereWithAggregatesInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], VectorStoreScalarWhereWithAggregatesInput.prototype, "NOT", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringWithAggregatesFilter_1.StringWithAggregatesFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringWithAggregatesFilter_1.StringWithAggregatesFilter)
], VectorStoreScalarWhereWithAggregatesInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringWithAggregatesFilter_1.StringWithAggregatesFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringWithAggregatesFilter_1.StringWithAggregatesFilter)
], VectorStoreScalarWhereWithAggregatesInput.prototype, "namespace", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringWithAggregatesFilter_1.StringWithAggregatesFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringWithAggregatesFilter_1.StringWithAggregatesFilter)
], VectorStoreScalarWhereWithAggregatesInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => JsonNullableWithAggregatesFilter_1.JsonNullableWithAggregatesFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", JsonNullableWithAggregatesFilter_1.JsonNullableWithAggregatesFilter)
], VectorStoreScalarWhereWithAggregatesInput.prototype, "metadata", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeWithAggregatesFilter_1.DateTimeWithAggregatesFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeWithAggregatesFilter_1.DateTimeWithAggregatesFilter)
], VectorStoreScalarWhereWithAggregatesInput.prototype, "createdAt", void 0);
exports.VectorStoreScalarWhereWithAggregatesInput = VectorStoreScalarWhereWithAggregatesInput = tslib_1.__decorate([
    TypeGraphQL.InputType("VectorStoreScalarWhereWithAggregatesInput", {})
], VectorStoreScalarWhereWithAggregatesInput);

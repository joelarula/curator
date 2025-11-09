"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentWhereInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DateTimeFilter_1 = require("../inputs/DateTimeFilter");
const JsonNullableFilter_1 = require("../inputs/JsonNullableFilter");
const StringFilter_1 = require("../inputs/StringFilter");
let DocumentWhereInput = class DocumentWhereInput {
};
exports.DocumentWhereInput = DocumentWhereInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [DocumentWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], DocumentWhereInput.prototype, "AND", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [DocumentWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], DocumentWhereInput.prototype, "OR", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [DocumentWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], DocumentWhereInput.prototype, "NOT", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], DocumentWhereInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], DocumentWhereInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => JsonNullableFilter_1.JsonNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", JsonNullableFilter_1.JsonNullableFilter)
], DocumentWhereInput.prototype, "metadata", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], DocumentWhereInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], DocumentWhereInput.prototype, "updatedAt", void 0);
exports.DocumentWhereInput = DocumentWhereInput = tslib_1.__decorate([
    TypeGraphQL.InputType("DocumentWhereInput", {})
], DocumentWhereInput);

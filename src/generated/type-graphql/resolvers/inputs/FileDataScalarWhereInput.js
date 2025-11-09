"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataScalarWhereInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const BytesNullableFilter_1 = require("../inputs/BytesNullableFilter");
const DateTimeFilter_1 = require("../inputs/DateTimeFilter");
const IntFilter_1 = require("../inputs/IntFilter");
const StringFilter_1 = require("../inputs/StringFilter");
const StringNullableFilter_1 = require("../inputs/StringNullableFilter");
let FileDataScalarWhereInput = class FileDataScalarWhereInput {
};
exports.FileDataScalarWhereInput = FileDataScalarWhereInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataScalarWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataScalarWhereInput.prototype, "AND", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataScalarWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataScalarWhereInput.prototype, "OR", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataScalarWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataScalarWhereInput.prototype, "NOT", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], FileDataScalarWhereInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], FileDataScalarWhereInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], FileDataScalarWhereInput.prototype, "mimeType", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringNullableFilter_1.StringNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringNullableFilter_1.StringNullableFilter)
], FileDataScalarWhereInput.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], FileDataScalarWhereInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], FileDataScalarWhereInput.prototype, "size", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => BytesNullableFilter_1.BytesNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", BytesNullableFilter_1.BytesNullableFilter)
], FileDataScalarWhereInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], FileDataScalarWhereInput.prototype, "projectId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], FileDataScalarWhereInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], FileDataScalarWhereInput.prototype, "updatedAt", void 0);
exports.FileDataScalarWhereInput = FileDataScalarWhereInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataScalarWhereInput", {})
], FileDataScalarWhereInput);

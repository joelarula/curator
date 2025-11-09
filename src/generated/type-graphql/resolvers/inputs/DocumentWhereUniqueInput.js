"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentWhereUniqueInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DateTimeFilter_1 = require("../inputs/DateTimeFilter");
const DocumentWhereInput_1 = require("../inputs/DocumentWhereInput");
const JsonNullableFilter_1 = require("../inputs/JsonNullableFilter");
const StringFilter_1 = require("../inputs/StringFilter");
let DocumentWhereUniqueInput = class DocumentWhereUniqueInput {
};
exports.DocumentWhereUniqueInput = DocumentWhereUniqueInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], DocumentWhereUniqueInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [DocumentWhereInput_1.DocumentWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], DocumentWhereUniqueInput.prototype, "AND", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [DocumentWhereInput_1.DocumentWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], DocumentWhereUniqueInput.prototype, "OR", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [DocumentWhereInput_1.DocumentWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], DocumentWhereUniqueInput.prototype, "NOT", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], DocumentWhereUniqueInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => JsonNullableFilter_1.JsonNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", JsonNullableFilter_1.JsonNullableFilter)
], DocumentWhereUniqueInput.prototype, "metadata", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], DocumentWhereUniqueInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], DocumentWhereUniqueInput.prototype, "updatedAt", void 0);
exports.DocumentWhereUniqueInput = DocumentWhereUniqueInput = tslib_1.__decorate([
    TypeGraphQL.InputType("DocumentWhereUniqueInput", {})
], DocumentWhereUniqueInput);
